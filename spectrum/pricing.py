"""Cost formulas. Mirrors apps/web/src/lib/pricing.ts exactly; both are checked against
tests/fixtures/pricing_cases.json so the Python and TypeScript numbers can never drift.

All Claude prices are USD per 1M tokens. Modal rates are USD per hour and converted to
per-second here. Nothing in this module talks to the network.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

_CANDIDATES = [
    os.environ.get("SPECTRUM_PRICING", ""),
    str(Path(__file__).resolve().parent.parent / "results" / "pricing.json"),
    "/root/results/pricing.json",
]


@lru_cache(maxsize=1)
def load_pricing() -> dict[str, Any]:
    for p in _CANDIDATES:
        if p and Path(p).exists():
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("results/pricing.json not found; set SPECTRUM_PRICING")


@dataclass(frozen=True)
class Usage:
    """Token usage of one Claude call, in the Messages API's own vocabulary."""

    input_tokens: int = 0  # uncached input tokens
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    output_tokens: int = 0

    @classmethod
    def from_api(cls, usage: Any) -> "Usage":
        g = (lambda k: int(getattr(usage, k, None) or (usage.get(k, 0) if isinstance(usage, dict) else 0) or 0))
        return cls(
            input_tokens=g("input_tokens"),
            cache_creation_input_tokens=g("cache_creation_input_tokens"),
            cache_read_input_tokens=g("cache_read_input_tokens"),
            output_tokens=g("output_tokens"),
        )

    def as_dict(self) -> dict[str, int]:
        return {
            "in": self.input_tokens,
            "cache_write": self.cache_creation_input_tokens,
            "cache_read": self.cache_read_input_tokens,
            "out": self.output_tokens,
        }


def claude_cost(model: str, usage: Usage | dict[str, int], *, batch: bool = False) -> float:
    """USD for one call. Accepts a Usage or a dict with keys in/cache_write/cache_read/out."""
    p = load_pricing()
    m = p["claude"][model]
    if isinstance(usage, dict):
        u = Usage(
            input_tokens=usage.get("in", 0),
            cache_creation_input_tokens=usage.get("cache_write", 0),
            cache_read_input_tokens=usage.get("cache_read", 0),
            output_tokens=usage.get("out", 0),
        )
    else:
        u = usage
    cost = (
        u.input_tokens * m["input"]
        + u.cache_creation_input_tokens * m["input"] * m["cache_write_mult"]
        + u.cache_read_input_tokens * m["input"] * m["cache_read_mult"]
        + u.output_tokens * m["output"]
    ) / 1_000_000
    if batch:
        cost *= p["batch_discount"]
    return round(cost, 10)


def modal_cpu_cost(*, cores: float, gib: float, seconds: float) -> float:
    """USD for a CPU container slice (physical cores + memory) for `seconds`."""
    p = load_pricing()["modal"]
    return round((cores * p["cpu_per_core_hour"] + gib * p["mem_per_gib_hour"]) * seconds / 3600, 10)


def modal_gpu_cost(*, gpu: str, seconds: float) -> float:
    p = load_pricing()["modal"]
    return round(p["gpu_per_hour"][gpu] * seconds / 3600, 10)


def per_task_from_batch(total_cost: float, n_items: int) -> float:
    return total_cost / max(n_items, 1)


def per_million(cost_per_item: float) -> float:
    return cost_per_item * 1_000_000


def reunderwrite(
    *,
    monthly_volume: float,
    tokens_per_task: float,
    flagship_per_mtok: float,
    small_per_mtok: float,
    self_fixed_month: float,
    self_variable_per_task: float,
    years_ahead: float = 0.0,
    deflation_per_year: float | None = None,
) -> dict[str, float]:
    """Monthly cost curves for the re-underwriting tab. Frontier prices deflate by
    `deflation_per_year`x per year (default from pricing.json)."""
    d = deflation_per_year or load_pricing()["frontier_deflation_per_year"]
    f = flagship_per_mtok / (d**years_ahead)
    s = small_per_mtok / (d**years_ahead)
    t = tokens_per_task / 1_000_000
    flagship = monthly_volume * t * f
    small = monthly_volume * t * s
    self_hosted = self_fixed_month + monthly_volume * self_variable_per_task
    denom = t * s - self_variable_per_task
    crossover = self_fixed_month / denom if denom > 0 else float("inf")
    return {
        "flagship": round(flagship, 6),
        "small_tier": round(small, 6),
        "self_hosted": round(self_hosted, 6),
        "crossover_volume_vs_small_tier": round(crossover, 2),
    }
