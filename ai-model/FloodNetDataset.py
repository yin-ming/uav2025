from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Callable, List, Optional, Tuple

from PIL import Image
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

__doc__ = """
A dataset loader for FloodNet-Supervised_v1.0.

See .create_dataloader for usage."""

SPLITS = {"train", "val", "test"}


@dataclass
class FloodNetPaths:
    root: str
    split: str

    def image_dir(self) -> str:
        if self.split == "train":
            return os.path.join(self.root, "train", "train-org-img")
        if self.split == "val":
            return os.path.join(self.root, "val", "val-org-img")
        if self.split == "test":
            return os.path.join(self.root, "test", "test-org-img")
        raise ValueError(f"Unknown split: {self.split}")

    def label_dir(self) -> str:
        if self.split == "train":
            return os.path.join(self.root, "train", "train-label-img")
        if self.split == "val":
            return os.path.join(self.root, "val", "val-label-img")
        if self.split == "test":
            return os.path.join(self.root, "test", "test-label-img")
        raise ValueError(f"Unknown split: {self.split}")


class FloodNetDataset(Dataset):
    """
    Semantic segmentation dataset for FloodNet-Supervised_v1.0.

    - Images: RGB JPGs in `<root>/<split>/<split>-org-img`
    - Labels: grayscale PNGs in `<root>/<split>/<split>-label-img`
      with class indices encoded in [0, 9].

    Returns a tuple: (image, mask) where
      - image: FloatTensor (C, H, W) in [0,1] unless transformed otherwise
      - mask:  LongTensor (H, W) with class indices
    """

    def __init__(
        self,
        root: str,
        split: str = "train",
        transform: Optional[Callable] = None,
        target_transform: Optional[Callable] = None,
        joint_transform: Optional[Callable[[Image.Image, Image.Image], Tuple[Image.Image, Image.Image]]] = None,
        strict_pairs: bool = True,
    ) -> None:
        """
        Args:
            root: Path to `FloodNet-Supervised_v1.0` directory.
            split: One of {"train", "val", "test"}.
            transform: Transform applied to the RGB image only.
            target_transform: Transform applied to the mask only.
            joint_transform: Optional callable receiving (img, mask) and returning (img, mask)
                             for spatially-consistent augmentation.
            strict_pairs: If True, raises if a label is missing for an image.
        """
        super().__init__()
        if split not in SPLITS:
            raise ValueError(f"split must be one of {SPLITS}, got {split}")

        self.paths = FloodNetPaths(root=root, split=split)
        self.transform = transform
        self.target_transform = target_transform
        self.joint_transform = joint_transform
        self.strict_pairs = strict_pairs

        img_dir = self.paths.image_dir()
        lbl_dir = self.paths.label_dir()

        if not os.path.isdir(img_dir):
            raise FileNotFoundError(f"Image directory not found: {img_dir}")
        if not os.path.isdir(lbl_dir):
            raise FileNotFoundError(f"Label directory not found: {lbl_dir}")

        images = sorted([f for f in os.listdir(img_dir) if f.lower().endswith(".jpg")])

        self.samples: List[Tuple[str, str]] = []
        for img_name in images:
            stem = os.path.splitext(img_name)[0]
            # Labels follow pattern: <id>_lab.png
            lbl_name = f"{stem}_lab.png"
            lbl_path = os.path.join(lbl_dir, lbl_name)
            img_path = os.path.join(img_dir, img_name)
            if os.path.isfile(lbl_path):
                self.samples.append((img_path, lbl_path))
            elif self.strict_pairs:
                raise FileNotFoundError(f"Missing label for {img_path}: expected {lbl_path}")
            else:
                # Allow images without labels (e.g., if using pseudo-labeling or inference-only)
                self.samples.append((img_path, None))  # type: ignore

        if len(self.samples) == 0:
            raise RuntimeError(f"No samples found in {img_dir}")

    def __len__(self) -> int:
        return len(self.samples)

    def _load_image(self, path: str) -> Image.Image:
        img = Image.open(path).convert("RGB")
        return img

    def _load_mask(self, path: Optional[str]) -> Optional[Image.Image]:
        if path is None:
            return None
        # Keep as single-channel grayscale where values are class indices
        m = Image.open(path).convert("L")
        return m

    def __getitem__(self, index: int) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        img_path, lbl_path = self.samples[index]
        img = self._load_image(img_path)
        mask = self._load_mask(lbl_path)

        # Apply joint transforms first to keep spatial alignment (e.g., random crop/flip)
        if self.joint_transform is not None and mask is not None:
            img, mask = self.joint_transform(img, mask)

        # Apply individual transforms
        if self.transform is not None:
            img = self.transform(img)
        else:
            # Default: convert to float tensor [0,1]
            arr = np.array(img, copy=False)  # (H,W,3), uint8
            img = torch.from_numpy(arr).permute(2, 0, 1).float() / 255.0

        target_tensor: Optional[torch.Tensor]
        if mask is not None:
            if self.target_transform is not None:
                target_tensor = self.target_transform(mask)
            else:
                # Convert grayscale mask to LongTensor of class indices
                target_tensor = torch.from_numpy(np.array(mask, copy=False)).long()
        else:
            target_tensor = None

        return img, target_tensor


def default_transforms(image_size: Optional[Tuple[int, int]] = None):
    """Return simple torchvision-like transforms without hard dependency on torchvision
    (I didn't figure how to get TV on Jetson when I wrote this, but I got it working now, but I'm still leaving this as is)
    """
    # Helper callables defined at module scope to be picklable by DataLoader workers
    class _SqueezeDim:
        def __init__(self, dim: int = 0):
            self.dim = dim
        def __call__(self, t: torch.Tensor) -> torch.Tensor:
            return t.squeeze(self.dim)

    class _ToLong:
        def __call__(self, t: torch.Tensor) -> torch.Tensor:
            return t.long()

    try:
        from torchvision import transforms

        img_tfms: List[Callable] = []
        if image_size is not None:
            img_tfms.append(transforms.Resize(image_size, interpolation=Image.BILINEAR))
        img_tfms.append(transforms.ToTensor())

        mask_tfms: List[Callable] = []
        if image_size is not None:
            mask_tfms.append(transforms.Resize(image_size, interpolation=Image.NEAREST))
        mask_tfms.append(transforms.PILToTensor())  # Produces (1,H,W) uint8
        mask_tfms.append(_SqueezeDim(0))            # (H,W)
        mask_tfms.append(_ToLong())

        return transforms.Compose(img_tfms), transforms.Compose(mask_tfms)
    except Exception:
        # Fallback: use internal defaults from __getitem__ for images; masks stay PIL
        return None, None


def create_dataloader(
    root: str,
    split: str = "train",
    batch_size: int = 4,
    shuffle: Optional[bool] = None,
    num_workers: int = 2,
    image_size: Optional[Tuple[int, int]] = None,
) -> DataLoader:
    """Convenience factory for a DataLoader.

    Args:
        root: Path to `FloodNet-Supervised_v1.0`.
        split: "train" | "val" | "test".
        batch_size: Batch size.
        shuffle: If None, defaults to True for train and False otherwise.
        num_workers: DataLoader workers.
        image_size: Optional (H, W) to resize images and masks consistently.
    """
    if shuffle is None:
        shuffle = split == "train"

    img_tf, mask_tf = default_transforms(image_size=image_size)

    ds = FloodNetDataset(
        root=root,
        split=split,
        transform=img_tf,
        target_transform=mask_tf,
        joint_transform=None,
        strict_pairs=True,
    )

    return DataLoader(ds, batch_size=batch_size, shuffle=shuffle, num_workers=num_workers, pin_memory=True)
