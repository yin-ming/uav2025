import argparse
import math
import os
import platform, socket, datetime
from dataclasses import dataclass
from typing import Dict, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.backends.cudnn as cudnn
from torch.utils.data import DataLoader
from torch.optim.swa_utils import AveragedModel

# Swin backbone support
try:
    import timm
    HAS_TIMM = True
except Exception:
    timm = None
    HAS_TIMM = False

# Dataloader
from FloodNetDataset import create_dataloader
from dataset_metadata import get_dataset_metadata, get_id2label as metadata_get_id2label, list_datasets

# -----------------------------
# Utilities
# -----------------------------
def get_id2label(dataset: str = "floodnet") -> Dict[int, str]:
    return metadata_get_id2label(dataset)

def ping() -> None:
    """
    Send a UDP message to 100.64.0.3:5005.
    This is raspberry pi 4 on the network that triggers a relay for audio feedback when training. Optional.
    """
    message = b"ping"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(message, ("100.64.0.3", 5005))

def getTime() -> str:
    return datetime.datetime.now().strftime("%H:%M:%S")

def is_jetson() -> bool:
    """
    Heuristics to detect NVIDIA Jetson / L4T.
    - /etc/nv_tegra_release exists on Jetson Linux.
    - /proc/device-tree/model often contains 'NVIDIA Jetson ...'
    - uname may contain 'tegra'
    
    Used to determine if we are running on Jetson, in order to trigger special optimizations
    """
    try:
        if os.path.exists("/etc/nv_tegra_release"):
            return True
        model_path = "/proc/device-tree/model"
        if os.path.exists(model_path):
            with open(model_path, "r") as f:
                m = f.read().lower()
            if "nvidia jetson" in m or "jetson" in m:
                return True
    except Exception:
        pass
    try:
        uname = " ".join(platform.uname())
        if "tegra" in uname.lower():
            return True
    except Exception:
        pass
    return False


# -----------------------------
# Config
# -----------------------------
@dataclass
class TrainConfig:
    # dataset
    root: str = "FloodNet-Supervised_v1.0"
    dataset: str = "floodnet"
    image_size: int = 512
    num_classes: int = 10  # Updated automatically when selecting a dataset
    batch_size: int = 4 # Can run 32 on Jetson comfortably, or 35-40 if you want to risk it (OOM possible)
    epochs: int = 20 # You need about 60-80 epochs to get good results
    lr: float = 5e-4
    weight_decay: float = 1e-4
    grad_accum_steps: int = 1
    num_workers: int = 2 # Number of workers for dataloader, set to the same number of CPU threads
    amp: bool = True
    save_dir: str = "checkpoints_cnnxformer"
    imagenet_norm: bool = True
    jetson: bool = False
    # model hyperparams
    embed_dim: int = 128
    num_heads: int = 4
    num_layers: int = 2
    # downsample factor before Transformer (must divide image size): 8, 16, or 32 are sensible
    downsample: int = 16
    device: str = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    export_onnx: bool = False
    onnx_path: str = "cnn_transformer_seg.onnx"
    # resume training
    resume: str = ""  # path to checkpoint to resume from (optional)
    # losses
    dice_weight: float = 0.5  # CE + dice blend; set to 0.0 to disable dice

    # encoder options
    encoder: str = "vanilla"  # 'vanilla' or 'swin'
    swin_model: str = "swin_tiny_patch4_window7_224"
    swin_out_index: int = 3
    freeze_backbone: bool = False

    # training policy
    auto_freeze_epochs: int = 8  # freeze backbone for N epochs, then unfreeze last stage
    layerwise_backbone_lr: bool = True  # use smaller LR for backbone stages


# -----------------------------
# Model helpers
# -----------------------------
class ASPP(nn.Module):
    """
    Atrous Spatial Pyramid Pooling

    This is a concept from DeepLab (Google's SOTA model for semantic segmentation).
    This is one part of the decoder.

    https://www.mdpi.com/2313-433X/10/12/299
    """
    def __init__(self, in_ch: int, out_ch: int, rates=(1, 6, 12, 18)):
        super().__init__()
        self.branches = nn.ModuleList(
            [
                nn.Sequential(
                    nn.Conv2d(in_ch, out_ch, 1, bias=False),
                    nn.GroupNorm(8, out_ch),
                    nn.SiLU(inplace=True),
                )
            ]
            + [
                nn.Sequential(
                    nn.Conv2d(in_ch, out_ch, 3, padding=r, dilation=r, bias=False),
                    nn.GroupNorm(8, out_ch),
                    nn.SiLU(inplace=True),
                )
                for r in rates[1:]
            ]
            + [
                nn.Sequential(
                    nn.AdaptiveAvgPool2d(1),
                    nn.Conv2d(in_ch, out_ch, 1, bias=False),
                    nn.SiLU(inplace=True),
                )
            ]
        )
        self.proj = nn.Conv2d(out_ch * len(self.branches), out_ch, 1, bias=False)

    def forward(self, x):
        feats = []
        for i, b in enumerate(self.branches):
            if i == len(self.branches) - 1:
                g = b(x)
                g = F.interpolate(g, size=x.shape[-2:], mode="bilinear", align_corners=False)
                feats.append(g)
            else:
                feats.append(b(x))
        return self.proj(torch.cat(feats, dim=1))



# -----------------------------
# Simple FPN (top-down + lateral) for multi-scale fusion
# -----------------------------
class SimpleFPN(nn.Module):
    """
    Minimal Feature Pyramid Network.
    Accepts a list of feature maps [C2, C3, C4, ...] from shallow->deep (high->low res).
    Produces a single fused feature map at the highest spatial resolution provided.
    Each lateral uses 1x1 conv to match channels, then top-down upsample+add, then a 3x3 refinement per level.
    """
    def __init__(self, in_channels_list: list[int], out_channels: int):
        super().__init__()
        assert len(in_channels_list) >= 1, "in_channels_list must be non-empty"
        self.out_channels = out_channels
        # Laterals to unify channel dims
        self.laterals = nn.ModuleList([
            nn.Conv2d(c, out_channels, kernel_size=1, bias=False) for c in in_channels_list
        ])
        # Post-merge refinements (3x3 conv)
        self.refines = nn.ModuleList([
            nn.Sequential(
                nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
                nn.GroupNorm(8, out_channels),
                nn.SiLU(inplace=True),
            ) for _ in in_channels_list
        ])

    def forward(self, feats: list[torch.Tensor]) -> torch.Tensor:
        # feats: list of tensors from shallow->deep. We process deep->shallow for top-down pathway.
        assert isinstance(feats, (list, tuple)) and len(feats) == len(self.laterals)
        # Build lateral projections; accept either NCHW or NHWC and normalize to NCHW
        lat = []
        for (l_conv, f, expected_c) in zip(self.laterals, feats, [m.in_channels for m in self.laterals]):
            # If tensor appears to be NHWC (channels last in shape), permute to NCHW
            if f.dim() == 4 and (f.shape[1] != expected_c) and (f.shape[-1] == expected_c):
                f = f.permute(0, 3, 1, 2).contiguous()
            lat.append(l_conv(f))
        # Top-down: start from deepest
        out = lat[-1]
        for i in range(len(lat) - 2, -1, -1):
            up = F.interpolate(out, size=lat[i].shape[-2:], mode="bilinear", align_corners=False)
            out = lat[i] + up
            out = self.refines[i](out)
        return out

# -----------------------------
# Swin backbone wrapper
# -----------------------------
class SwinBackbone(nn.Module):
    """
    Thin wrapper around a timm Swin backbone set up for feature extraction.
    Returns a list of pyramid stage feature maps [(B, C, h, w), ...].
    """
    def __init__(
        self,
        model_name: str = "swin_tiny_patch4_window7_224",
        out_index: int = 3,
        pretrained: bool = True,
        img_size: int | tuple = 224,
    ):
        super().__init__()
        assert HAS_TIMM, "timm is required for --encoder swin; install with `pip install timm`"
        # If an int index is given, expand to a small pyramid (up to three levels ending at out_index)
        if isinstance(out_index, int):
            oi = max(0, out_index)
            out_indices = tuple(sorted(set([max(0, oi - 2), max(0, oi - 1), oi])))
        else:
            out_indices = tuple(out_index)
        self.out_indices = out_indices

        self.backbone = timm.create_model(
            model_name,
            features_only=True,
            pretrained=pretrained,
            out_indices=self.out_indices,
            img_size=img_size,
        )
        # channels() returns list matching out_indices order
        chs = self.backbone.feature_info.channels()
        self.out_channels_list = chs
        self.out_channels = chs[-1]

    def forward(self, x: torch.Tensor):
        feats = self.backbone(x)  # list of (B, C, h, w) for each requested index
        return feats


# -----------------------------
# Model
# -----------------------------
class CNNTransformerSeg(nn.Module):
    """
    Segmentation head with pluggable encoder:
      - "vanilla": CNN stem -> Transformer encoder over grid tokens -> decoder
      - "swin": timm Swin backbone -> decoder
    Predicts per-pixel logits (B, C, H, W).
    """
    def __init__(
        self,
        num_classes: int = 10,
        embed_dim: int = 128,
        num_heads: int = 4,
        num_layers: int = 2,
        downsample: int = 16,
        encoder: str = "vanilla",
        swin_model: str = "swin_tiny_patch4_window7_224",
        swin_out_index: int = 3,
        freeze_backbone: bool = False,
        img_size: int = 512,
    ):
        super().__init__()
        self.encoder_type = encoder.lower()
        self.using_swin = self.encoder_type == "swin"

        if self.using_swin:
            # Swin backbone path
            assert HAS_TIMM, "timm not available; install timm or use --encoder vanilla"
            self.backbone = SwinBackbone(swin_model, out_index=swin_out_index, pretrained=True, img_size=img_size)
            if freeze_backbone:
                for p in self.backbone.parameters():
                    p.requires_grad = False
            # If multiple scales are returned, fuse them with a lightweight FPN before the decoder
            if hasattr(self.backbone, "out_channels_list") and len(self.backbone.out_channels_list) > 1:
                fpn_out = self.backbone.out_channels_list[-1]  # keep deepest channel dim for simplicity
                self.neck = SimpleFPN(self.backbone.out_channels_list, out_channels=fpn_out)
                in_ch_decoder = fpn_out
            else:
                self.neck = None
                in_ch_decoder = self.backbone.out_channels
        else:
            # Original vanilla encoder: CNN stem + Transformer over tokens
            assert downsample in (8, 16, 32), "downsample should be one of {8,16,32}"
            layers = []
            in_ch = 3
            chans = [64, 128, embed_dim]
            steps = {8: 3, 16: 4, 32: 5}[downsample]
            for i in range(steps):
                out_ch = chans[min(i, len(chans) - 1)]
                layers += [
                    nn.Conv2d(in_ch, out_ch, kernel_size=3, stride=2, padding=1, bias=False),
                    nn.GroupNorm(8, out_ch),
                    nn.SiLU(inplace=True),
                ]
                in_ch = out_ch
            self.cnn = nn.Sequential(*layers)  # (B, E, H/s, W/s)

            # 2D learnable positional embedding (easier to interpolate than 1D)
            self.pe_base_hw = (32, 32)
            self.pos_embed_2d = nn.Parameter(torch.randn(1, embed_dim, self.pe_base_hw[0], self.pe_base_hw[1]))

            enc_layer = nn.TransformerEncoderLayer(d_model=embed_dim, nhead=num_heads, dropout=0.1, batch_first=False)
            self.transformer = nn.TransformerEncoder(enc_layer, num_layers=num_layers)
            in_ch_decoder = embed_dim

        # Decoder shared by both paths: ASPP + 1x1 classifier, followed by upsample in forward
        self.decoder = nn.Sequential(
            ASPP(in_ch_decoder, in_ch_decoder // 2),
            nn.SiLU(inplace=True),
            nn.Conv2d(in_ch_decoder // 2, num_classes, kernel_size=1),
        )

        # Store a hint for external logic
        self._decoder_in_ch = in_ch_decoder

    def forward(self, x: torch.Tensor, labels: torch.Tensor = None):
        """
        x: (B,3,H,W), labels: (B,H,W) with class ids; unlabeled = 255
        returns dict with logits and optional loss (CE only if labels given)
        """
        B, _, H, W = x.shape

        if self.using_swin:
            feats_list = self.backbone(x)             # list of (B, C, h, w)
            if isinstance(feats_list, (list, tuple)) and getattr(self, 'neck', None) is not None:
                feats_out = self.neck(list(feats_list))  # fused (B, C, h, w) at highest provided resolution
            else:
                feats_out = feats_list[0] if isinstance(feats_list, (list, tuple)) else feats_list
        else:
            feats = self.cnn(x)                       # (B, E, h, w)
            B_, E, h, w = feats.shape
            pe = F.interpolate(self.pos_embed_2d, size=(h, w), mode="bilinear", align_corners=False)
            feats = feats + pe
            seq = feats.flatten(2).permute(2, 0, 1)   # (h*w, B, E)
            seq = self.transformer(seq)               # (h*w, B, E)
            feats_out = seq.permute(1, 2, 0).reshape(B_, E, h, w)

        # Ensure channels-first layout (N, C, H, W); some backends may yield NHWC
        if feats_out.dim() == 4 and feats_out.shape[1] != self._decoder_in_ch and feats_out.shape[-1] == self._decoder_in_ch:
            feats_out = feats_out.permute(0, 3, 1, 2).contiguous()

        logits_low = self.decoder(feats_out)          # (B,C,h,w)
        logits = F.interpolate(logits_low, size=(H, W), mode="bilinear", align_corners=False)

        if labels is not None:
            loss = F.cross_entropy(logits, labels.long(), ignore_index=255)
            return {"logits": logits, "loss": loss}
        return {"logits": logits}


# -----------------------------
# Metrics
# -----------------------------
def confusion_matrix(pred: torch.Tensor, target: torch.Tensor, num_classes: int) -> torch.Tensor:
    k = (target >= 0) & (target < num_classes)
    inds = num_classes * target[k].to(torch.int64) + pred[k]
    cm = torch.bincount(inds, minlength=num_classes ** 2)
    return cm.reshape(num_classes, num_classes)


@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, device: str, num_classes: int, imagenet_norm: bool = True) -> Tuple[float, float]:
    model.eval()
    total_cm = torch.zeros((num_classes, num_classes), dtype=torch.float64, device=device)
    total_correct = 0
    total_pixels = 0

    mean = std = None
    if imagenet_norm:
        mean = torch.tensor([0.485, 0.456, 0.406], device=device).view(1, 3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225], device=device).view(1, 3, 1, 1)

    for batch_idx, (images, labels) in enumerate(loader, start=1):
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)
        if imagenet_norm:
            images = (images - mean) / std

        outputs = model(images)
        logits = outputs["logits"]  # (B, C, H, W)
        preds = logits.argmax(dim=1)

        for p, t in zip(preds, labels):
            total_cm += confusion_matrix(p, t, num_classes)
        total_correct += (preds == labels).sum().item()
        total_pixels += labels.numel()
        print("[Eval] {} Eval batch {}/{}".format(getTime(), batch_idx, len(loader)), end="\r")
        ping()

    tp = np.diag(total_cm.cpu().numpy())
    fp = total_cm.sum(dim=0).cpu().numpy() - tp
    fn = total_cm.sum(dim=1).cpu().numpy() - tp
    denom = tp + fp + fn + 1e-6
    ious = tp / denom
    miou = float(np.mean(ious))
    acc = float(total_correct / (total_pixels + 1e-6))
    return miou, acc


# -----------------------------
# Losses
# -----------------------------
def dice_loss(logits: torch.Tensor, targets: torch.Tensor, num_classes: int, ignore_index: int = 255, eps: float = 1e-6) -> torch.Tensor:
    """
    Multiclass soft Dice loss that ignores `ignore_index` pixels.
    logits: (B,C,H,W), targets: (B,H,W)
    """
    with torch.no_grad():
        valid = (targets != ignore_index)  # (B,H,W)
    probs = torch.softmax(logits, dim=1)                    # (B,C,H,W)
    t = torch.clamp(targets, 0, num_classes - 1)
    onehot = F.one_hot(t, num_classes).permute(0, 3, 1, 2).float()  # (B,C,H,W)
    # mask out ignored pixels
    valid = valid.unsqueeze(1).float()
    probs = probs * valid
    onehot = onehot * valid
    num = 2.0 * (probs * onehot).sum(dim=(0, 2, 3))
    den = (probs + onehot).sum(dim=(0, 2, 3)) + eps
    return 1.0 - (num / den).mean()


# -----------------------------
# Training
# -----------------------------
def train(cfg: TrainConfig):
    os.makedirs(cfg.save_dir, exist_ok=True)

    if cfg.jetson:
        print("[jetson] Detected NVIDIA Jetson - enabling Jetson-friendly settings.")
        cudnn.benchmark = True
        cudnn.allow_tf32 = True
        try:
            torch.set_float32_matmul_precision("high")
        except Exception:
            pass

    print(f"[data] Using dataset '{cfg.dataset}' ({cfg.num_classes} classes) at root '{cfg.root}'.")

    # Data
    train_loader = create_dataloader(
        root=cfg.root,
        split="train",
        batch_size=cfg.batch_size,
        shuffle=True,
        num_workers=cfg.num_workers,
        image_size=(cfg.image_size, cfg.image_size),
    )
    val_loader = create_dataloader(
        root=cfg.root,
        split="val",
        batch_size=max(1, cfg.batch_size // 2),
        shuffle=False,
        num_workers=cfg.num_workers,
        image_size=(cfg.image_size, cfg.image_size),
    )

    # Model
    model = CNNTransformerSeg(
        num_classes=cfg.num_classes,
        embed_dim=cfg.embed_dim,
        num_heads=cfg.num_heads,
        num_layers=cfg.num_layers,
        downsample=cfg.downsample,
        encoder=cfg.encoder,
        swin_model=cfg.swin_model,
        swin_out_index=cfg.swin_out_index,
        freeze_backbone=cfg.freeze_backbone,
        img_size=cfg.image_size,
    ).to(cfg.device)

    # Prefer channels_last on CUDA for better throughput
    if cfg.device.startswith("cuda"):
        model = model.to(memory_format=torch.channels_last)

    # Optionally resume
    resumed = False
    resume_ckpt = None
    if cfg.resume:
        ckpt_path = cfg.resume
        if os.path.isfile(ckpt_path):
            try:
                ckpt = torch.load(ckpt_path, map_location=cfg.device)
                state = ckpt.get("model", ckpt)
                try:
                    model.load_state_dict(state, strict=True)
                except Exception:
                    missing, unexpected = model.load_state_dict(state, strict=False)
                    print(f"[resume] Non-strict load. Missing: {missing}, Unexpected: {unexpected}")
                resumed = True
                resume_ckpt = ckpt if isinstance(ckpt, dict) else None
                print(f"[resume] Loaded checkpoint: {ckpt_path}")
            except Exception as e:
                print(f"[resume] Failed to load checkpoint '{ckpt_path}': {e}")
        else:
            print(f"[resume] Checkpoint path not found: {ckpt_path}")
    
    ping()

    # Optim + Sched (with optional auto-freeze and layer-wise LRs)
    steps_per_epoch = max(1, math.ceil(len(train_loader) / max(1, cfg.grad_accum_steps)))

    # Auto-freeze policy: for Swin encoder and when not permanently freezing
    auto_freeze_active = (cfg.encoder == 'swin') and (cfg.auto_freeze_epochs > 0) and (not cfg.freeze_backbone)
    if auto_freeze_active:
        print(f"[policy] Auto-freeze enabled: freezing Swin for first {cfg.auto_freeze_epochs} epoch(s).")
        set_swin_requires_grad(model, requires=False, stages=None)
    elif cfg.freeze_backbone and cfg.encoder == 'swin':
        print("[policy] Backbone freeze enabled (all epochs).")
        set_swin_requires_grad(model, requires=False, stages=None)

    # Build optimizer param groups
    param_groups = make_param_groups(model, base_lr=cfg.lr, layerwise=cfg.layerwise_backbone_lr)
    optimizer = torch.optim.AdamW(param_groups, weight_decay=cfg.weight_decay)

    # Define scheduler builder so we can rebuild after unfreezing
    def build_scheduler(total_epochs_remaining):
        total_steps = steps_per_epoch * total_epochs_remaining
        warmup_steps = max(10, int(0.03 * max(1, total_steps)))
        def lr_lambda(step):
            if step < warmup_steps:
                return float(step + 1) / float(max(1, warmup_steps))
            progress = (step - warmup_steps) / float(max(1, total_steps - warmup_steps))
            return 0.5 * (1.0 + math.cos(math.pi * progress))
        return torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

    scheduler = build_scheduler(cfg.epochs)

    # If available, also restore optimizer/scheduler state (optional)
    if resumed and isinstance(resume_ckpt, dict):
        try:
            if "optimizer" in resume_ckpt:
                optimizer.load_state_dict(resume_ckpt["optimizer"])
                print("[resume] Restored optimizer state.")
            if "scheduler" in resume_ckpt:
                scheduler.load_state_dict(resume_ckpt["scheduler"])
                print("[resume] Restored scheduler state.")
        except Exception as e:
            print(f"[resume] Failed to restore optimizer/scheduler: {e}")

    # AMP / Scaler
    device_type = "cuda" if cfg.device.startswith("cuda") else ("mps" if cfg.device.startswith("mps") else "cpu")
    use_amp = cfg.amp and device_type in ("cuda", "mps")
    scaler = torch.amp.GradScaler('cuda',enabled=use_amp and device_type == "cuda")

    # EMA / SWA-style weight averaging for smoother/better eval
    ema = AveragedModel(model)

    # Prebuild normalization on device
    if cfg.imagenet_norm:
        mean = torch.tensor([0.485, 0.456, 0.406], device=cfg.device).view(1, 3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225], device=cfg.device).view(1, 3, 1, 1)
    else:
        mean = std = None

    best_miou = -1.0
    global_step = 0

    print(f"[main] {getTime()} Starting training.")
    ping()
    ping()
    ping()

    for epoch in range(1, cfg.epochs + 1):
        epoch_str = f"+{epoch}" if resumed else f"{epoch:03d}"
        model.train()
        running_loss = 0.0
        optimizer.zero_grad(set_to_none=True)

        for step, (images, labels) in enumerate(train_loader, start=1):
            images = images.to(cfg.device, non_blocking=True)
            labels = labels.to(cfg.device, non_blocking=True)

            if cfg.imagenet_norm:
                images = (images - mean) / std

            if cfg.device.startswith("cuda"):
                images = images.to(memory_format=torch.channels_last)

            # --- forward & loss (CE + dice) ---
            def compute_loss():
                out = model(images, labels=None)
                logits = out["logits"]
                ce = F.cross_entropy(logits, labels.long(), ignore_index=255)
                if cfg.dice_weight and cfg.dice_weight > 0.0:
                    d = dice_loss(logits, labels, cfg.num_classes)
                    return ce + cfg.dice_weight * d, logits, ce
                else:
                    return ce, logits, ce

            if use_amp and device_type == "cuda":
                with torch.amp.autocast('cuda'):
                    total_loss, logits, ce_only = compute_loss()
                    loss = total_loss / cfg.grad_accum_steps
            elif use_amp and device_type == "mps":
                with torch.autocast(device_type="mps", dtype=torch.float16):
                    total_loss, logits, ce_only = compute_loss()
                    loss = total_loss / cfg.grad_accum_steps
            else:
                total_loss, logits, ce_only = compute_loss()
                loss = total_loss / cfg.grad_accum_steps

            # backward/step
            if scaler.is_enabled():
                scaler.scale(loss).backward()
            else:
                loss.backward()

            if step % cfg.grad_accum_steps == 0:
                if scaler.is_enabled():
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                scheduler.step()
                global_step += 1

                # Update EMA after each optimizer step
                ema.update_parameters(model)

            running_loss += float(total_loss.item())

            if (not cfg.jetson) or (step % 10 == 0):
                lr_now = scheduler.get_last_lr()[0]
                print(
                    f"Epoch {epoch_str} | step {step:04d}/{len(train_loader):04d} | "
                    f"lr {lr_now:.2e} | loss {total_loss.item():.4f}"
                )
                ping()

        avg_loss = running_loss / max(1, len(train_loader))
        miou, acc = evaluate(
            ema.module,  # evaluate the EMA weights
            val_loader,
            cfg.device,
            num_classes=cfg.num_classes,
            imagenet_norm=cfg.imagenet_norm,
        )
        print(f"[val] {getTime()} |Epoch {epoch_str} | loss {avg_loss:.4f} | mIoU {miou:.4f} | acc {acc:.4f}")
        ping()
        ping()
        ping()

        # Auto-unfreeze after the warm epochs
        if auto_freeze_active and epoch == cfg.auto_freeze_epochs:
            print(f"[policy] Unfreezing Swin last stage after epoch {epoch}.")
            # Unfreeze only the last Swin stage (stage index 3 if present)
            set_swin_requires_grad(model, requires=True, stages=(3,))
            # Rebuild optimizer with param groups (will pick up newly trainable params)
            optimizer = torch.optim.AdamW(
                make_param_groups(model, base_lr=cfg.lr, layerwise=cfg.layerwise_backbone_lr),
                weight_decay=cfg.weight_decay,
            )
            # Rebuild scheduler for remaining epochs
            remaining_epochs = max(1, cfg.epochs - epoch)
            scheduler = build_scheduler(remaining_epochs)
            # Optional short warmup is already handled by scheduler's warmup fraction
            print("[policy] Optimizer and scheduler rebuilt with layer-wise backbone LRs.")

        # Save best
        if miou > best_miou:
            best_miou = miou
            best_path = os.path.join(cfg.save_dir, "cnn_transformer_seg_best.pt")
            torch.save(
                {
                    "model": ema.module.state_dict(),
                    # Save the displayed epoch label for traceability when resuming
                    "epoch": epoch if not resumed else None,
                    "miou": miou,
                    "acc": acc,
                    "cfg": vars(cfg),
                },
                best_path,
            )
            print(f"Saved best checkpoint to {best_path}")

    # Final save
    final_path = os.path.join(cfg.save_dir, "cnn_transformer_seg_final.pt")
    torch.save(
        {
            "model": ema.module.state_dict(),
            "miou": best_miou,
            "cfg": vars(cfg),
        },
        final_path,
    )
    print(f"Saved final checkpoint to {final_path}")

    if cfg.export_onnx:
        export_onnx(model, cfg)


# -----------------------------
# ONNX export
# -----------------------------
@torch.no_grad()
def export_onnx(model: nn.Module, cfg: TrainConfig):
    model.eval()
    dummy = torch.randn(1, 3, cfg.image_size, cfg.image_size, device=cfg.device)
    torch.onnx.export(
        model,
        dummy,
        cfg.onnx_path,
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={
            "input": {0: "batch", 2: "height", 3: "width"},
            "logits": {0: "batch", 2: "height", 3: "width"},
        },
        opset_version=17,
    )
    print(f"Exported ONNX to {cfg.onnx_path}")


# -----------------------------
# Argparse
# -----------------------------
def parse_args() -> TrainConfig:
    p = argparse.ArgumentParser(description="Train CNN+Transformer Segmentation on FloodNet")
    dataset_choices = list_datasets()
    p.add_argument("--root", type=str, default="FloodNet-Supervised_v1.0")
    p.add_argument("--dataset", type=str, default="floodnet", choices=dataset_choices, help="Dataset preset to use for metadata such as num_classes.")
    p.add_argument("--image-size", type=int, default=512)
    p.add_argument("--num-classes", type=int, default=None, help="Number of classes. Defaults to the selected dataset preset.")
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--lr", type=float, default=5e-4)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--grad-accum-steps", type=int, default=1)
    p.add_argument("--num-workers", type=int, default=8)
    p.add_argument("--no-amp", action="store_true", help="Disable mixed precision (AMP)")
    p.add_argument("--save-dir", type=str, default="checkpoints_cnnxformer")
    p.add_argument("--no-imagenet-norm", action="store_true", help="Disable ImageNet normalization")
    p.add_argument("--embed-dim", type=int, default=128)
    p.add_argument("--num-heads", type=int, default=4)
    p.add_argument("--num-layers", type=int, default=2)
    p.add_argument("--downsample", type=int, default=16, choices=[8, 16, 32], help="Overall downsample before Transformer")
    p.add_argument("--export-onnx", action="store_true", help="Export ONNX at the end")
    p.add_argument("--resume", type=str, default="", help="Path to checkpoint to resume from")
    p.add_argument("--dice-weight", type=float, default=0.5, help="Weight for Dice loss (0 disables)")
    # Encoder/Backbone options
    p.add_argument("--encoder", type=str, default="vanilla", choices=["vanilla", "swin"], help="Encoder: 'vanilla' (CNN+Transformer) or 'swin' (timm Swin backbone)")
    p.add_argument("--swin-model", type=str, default="swin_tiny_patch4_window7_224", help="timm model name for Swin when --encoder swin")
    p.add_argument("--swin-out-index", type=int, default=3, help="Feature level to use from Swin (higher index = lower resolution, more channels)")
    p.add_argument("--freeze-backbone", action="store_true", help="Freeze backbone (useful when fine-tuning with limited data)")
    p.add_argument("--auto-freeze-epochs", type=int, default=8, help="Freeze all Swin layers for N epochs, then unfreeze last stage (ignored for vanilla encoder)")
    p.add_argument("--no-layerwise-backbone-lr", action="store_true", help="Disable layer-wise smaller LRs for Swin stages")
    args = p.parse_args()

    dataset_key = args.dataset.lower()
    dataset_meta = get_dataset_metadata(dataset_key)
    num_classes = args.num_classes if args.num_classes is not None else dataset_meta["num_classes"]
    root = args.root
    if root == p.get_default("root") and dataset_key != "floodnet":
        root = dataset_meta.get("default_root", root)

    cfg = TrainConfig(
        root=root,
        dataset=dataset_key,
        image_size=args.image_size,
        num_classes=num_classes,
        batch_size=args.batch_size,
        epochs=args.epochs,
        lr=args.lr,
        weight_decay=args.weight_decay,
        grad_accum_steps=args.grad_accum_steps,
        num_workers=args.num_workers,
        amp=not args.no_amp,
        save_dir=args.save_dir,
        imagenet_norm=not args.no_imagenet_norm,
        embed_dim=args.embed_dim,
        num_heads=args.num_heads,
        num_layers=args.num_layers,
        downsample=args.downsample,
        export_onnx=args.export_onnx,
        resume=args.resume,
        dice_weight=args.dice_weight,
        encoder=args.encoder,
        swin_model=args.swin_model,
        swin_out_index=args.swin_out_index,
        freeze_backbone=args.freeze_backbone,
        auto_freeze_epochs=args.auto_freeze_epochs,
        layerwise_backbone_lr=not args.no_layerwise_backbone_lr,
    )
    cfg.jetson = is_jetson()
    if cfg.jetson:
        print("[jetson] Auto-detect: running on Jetson device.")
    return cfg

# -----------------------------
# Backbone utils (freeze/unfreeze + LR groups)
# -----------------------------

def _get_swin_layers(model: nn.Module):
    """Return timm Swin layers list if present, else None."""
    bb = getattr(model, 'backbone', None)
    swin = getattr(bb, 'backbone', None)
    if swin is not None and hasattr(swin, 'layers'):
        return swin.layers
    return None


def set_swin_requires_grad(model: nn.Module, requires: bool = False, stages: tuple | None = None):
    """Set requires_grad for all or selected Swin stages.
    If stages is None, apply to entire Swin backbone.
    """
    layers = _get_swin_layers(model)
    if layers is None:
        # Fallback: toggle entire backbone if present
        bb = getattr(model, 'backbone', None)
        if bb is not None:
            for p in bb.parameters():
                p.requires_grad = requires
        return
    if stages is None:
        for p in getattr(getattr(model, 'backbone', None), 'parameters', lambda: [])():
            p.requires_grad = requires
        return
    for i, layer in enumerate(layers):
        if i in stages:
            for p in layer.parameters():
                p.requires_grad = requires


def make_param_groups(model: nn.Module, base_lr: float, layerwise: bool = True):
    """Build optimizer param groups with discriminative LRs.
    Group 0: decoder (and neck if present) at base_lr.
    Groups 1..: Swin stages 0..3 with progressively smaller LRs.
    """
    groups = []
    # Decoder / neck (fast lr)
    dec_params = []
    for m in [getattr(model, 'decoder', None), getattr(model, 'neck', None)]:
        if m is not None:
            dec_params += [p for p in m.parameters() if p.requires_grad]
    if dec_params:
        groups.append({"params": dec_params, "lr": base_lr})

    layers = _get_swin_layers(model)
    if layers is not None:
        if layerwise:
            # Stage multipliers: deeper stage gets larger LR
            stage_mult = {0: 0.02, 1: 0.05, 2: 0.10, 3: 0.20}
        else:
            stage_mult = {0: 0.10, 1: 0.10, 2: 0.10, 3: 0.10}
        for i, layer in enumerate(layers):
            ps = [p for p in layer.parameters() if p.requires_grad]
            if ps:
                groups.append({"params": ps, "lr": base_lr * stage_mult.get(i, 0.05)})
    else:
        # If no swin layers found, fall back to all backbone params at reduced LR
        bb = getattr(model, 'backbone', None)
        if bb is not None:
            ps = [p for p in bb.parameters() if p.requires_grad]
            if ps:
                groups.append({"params": ps, "lr": base_lr * 0.1})
    # If nothing matched (e.g., vanilla encoder), default to all params
    if not groups:
        groups.append({"params": model.parameters(), "lr": base_lr})
    return groups


# -----------------------------
# Main
# -----------------------------
def main():
    cfg = parse_args()
    train(cfg)


if __name__ == "__main__":
    main()
