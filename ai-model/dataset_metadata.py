from __future__ import annotations

from typing import Any, Dict, List, Tuple

DatasetMetadata = Dict[str, Any]

# Central catalog describing supported datasets.
DATASET_CATALOG: Dict[str, DatasetMetadata] = {
    "floodnet": {
        "num_classes": 10,
        "default_root": "FloodNet-Supervised_v1.0",
        "id2label": {
            0: "Background",
            1: "Building-flooded",
            2: "Building-non-flooded",
            3: "Road-flooded",
            4: "Road-non-flooded",
            5: "Water",
            6: "Tree",
            7: "Vehicle",
            8: "Pool",
            9: "Grass",
        },
        "palette": [
            (0, 0, 0),          # Background
            (255, 0, 0),        # Building-flooded
            (255, 165, 0),      # Building-non-flooded
            (0, 0, 255),        # Road-flooded
            (135, 206, 235),    # Road-non-flooded
            (0, 255, 255),      # Water
            (34, 139, 34),      # Tree
            (255, 255, 0),      # Vehicle
            (255, 0, 255),      # Pool
            (124, 252, 0),      # Grass
        ],
    },
    "rescuenet": {
        "num_classes": 11,
        "default_root": "RescueNet",
        "id2label": {
            0: "Background",
            1: "Water",
            2: "Building-No-Damage",
            3: "Building-Minor-Damage",
            4: "Building-Major-Damage",
            5: "Building-Total-Destruction",
            6: "Vehicle",
            7: "Road-Clear",
            8: "Road-Blocked",
            9: "Tree",
            10: "Pool",
        },
        "palette": [
            (0, 0, 0),          # Background
            (0, 0, 255),        # Water
            (0, 200, 0),        # Building-No-Damage
            (255, 255, 0),      # Building-Minor-Damage
            (255, 165, 0),      # Building-Major-Damage
            (255, 0, 0),        # Building-Total-Destruction
            (0, 255, 255),      # Vehicle
            (169, 169, 169),    # Road-Clear
            (238, 130, 238),    # Road-Blocked
            (34, 139, 34),      # Tree
            (0, 128, 255),      # Pool
        ],
    },
}


def list_datasets() -> List[str]:
    """Return the list of supported dataset keys."""
    return sorted(DATASET_CATALOG.keys())


def get_dataset_metadata(name: str) -> DatasetMetadata:
    key = name.lower()
    if key not in DATASET_CATALOG:
        raise ValueError(f"Unknown dataset '{name}'. Available: {', '.join(list_datasets())}")
    return DATASET_CATALOG[key]


def get_id2label(name: str = "floodnet") -> Dict[int, str]:
    meta = get_dataset_metadata(name)
    return dict(meta["id2label"])


def get_palette(name: str = "floodnet") -> List[Tuple[int, int, int]]:
    meta = get_dataset_metadata(name)
    palette = meta.get("palette")
    if palette is None:
        raise ValueError(f"Palette not defined for dataset '{name}'")
    return list(palette)


def get_num_classes(name: str = "floodnet") -> int:
    meta = get_dataset_metadata(name)
    num = meta.get("num_classes")
    if num is None:
        raise ValueError(f"num_classes not defined for dataset '{name}'")
    return int(num)
