import json
from pathlib import Path

import pytest

from spectrum.pricing import claude_cost, load_pricing, modal_cpu_cost, modal_gpu_cost, reunderwrite

CASES = json.loads((Path(__file__).parent / "fixtures" / "pricing_cases.json").read_text())


@pytest.mark.parametrize("case", CASES["claude"], ids=[c["name"] for c in CASES["claude"]])
def test_claude_cost(case):
    got = claude_cost(case["model"], case["usage"], batch=case["batch"])
    assert got == pytest.approx(case["expected"], rel=1e-6)


@pytest.mark.parametrize("case", CASES["modal_cpu"], ids=[c["name"] for c in CASES["modal_cpu"]])
def test_modal_cpu_cost(case):
    got = modal_cpu_cost(cores=case["cores"], gib=case["gib"], seconds=case["seconds"])
    assert got == pytest.approx(case["expected"], rel=1e-6)


@pytest.mark.parametrize("case", CASES["modal_gpu"], ids=[c["name"] for c in CASES["modal_gpu"]])
def test_modal_gpu_cost(case):
    got = modal_gpu_cost(gpu=case["gpu"], seconds=case["seconds"])
    assert got == pytest.approx(case["expected"], rel=1e-6)


def test_pricing_has_every_tier_model():
    p = load_pricing()
    for m in ("claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"):
        assert m in p["claude"]
        assert p["claude"][m]["cache_min_tokens"] > 0


def test_reunderwrite_crossover_moves_right_with_deflation():
    base = dict(monthly_volume=1e6, tokens_per_task=1000, flagship_per_mtok=10.0, small_per_mtok=2.0,
                self_fixed_month=430.0, self_variable_per_task=5e-6)
    now = reunderwrite(**base, years_ahead=0)
    later = reunderwrite(**base, years_ahead=1)
    assert later["flagship"] < now["flagship"]
    assert later["crossover_volume_vs_small_tier"] > now["crossover_volume_vs_small_tier"]
