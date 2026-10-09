"""All tunable numbers in one place. Nothing else in the engine hardcodes a threshold."""
from dataclasses import dataclass, field

# Severity: score = area_m2 * magnitude, first matching lower bound wins.
TIERS = [(1000.0, "critical"), (300.0, "high"), (120.0, "medium"), (0.0, "low")]

# Sentinel-2 Scene Classification Layer values treated as invalid.
# 0 no data, 1 saturated/defective, 3 cloud shadow, 8 cloud medium, 9 cloud high, 10 cirrus.
SCL_INVALID = (0, 1, 3, 8, 9, 10)


@dataclass
class Params:
    mode: str = "auto"               # auto | spectral | deep
    min_area_m2: float = 20.0
    morph_kernel_px: int = 5         # deep mode; spectral uses 3 (10 m pixels)
    prob_threshold: float = 0.5      # deep mode
    # spectral rules (reflectance-index differences)
    d_ndbi_built: float = 0.10       # NDBI rise for built-up gain
    after_ndvi_max_built: float = 0.25
    d_ndvi_veg_loss: float = -0.20
    before_ndvi_dense: float = 0.45  # vegetation loss only counts on dense vegetation
    ndwi_water: float = 0.0          # NDWI above this is water
    d_ndwi_water: float = 0.20
    keep_types: tuple = ("built_up_gain", "water_gain", "water_loss", "vegetation_loss")
    review_band: tuple = (0.5, 0.7)  # confidence in this band -> needs_review
    tiers: list = field(default_factory=lambda: list(TIERS))


PRESETS = {
    "encroachment": dict(keep_types=("built_up_gain", "water_loss"), min_area_m2=300.0),
    "flood": dict(keep_types=("water_gain",), min_area_m2=500.0),
    "deforestation": dict(keep_types=("vegetation_loss",), min_area_m2=500.0),
    "general": dict(),
}


def params_for(preset: str = "general", **overrides) -> Params:
    p = Params(**PRESETS.get(preset, {}))
    for k, v in overrides.items():
        setattr(p, k, v)
    return p
