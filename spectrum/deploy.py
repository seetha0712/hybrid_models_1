"""Deploy everything that serves traffic in one command:

    modal deploy spectrum/deploy.py
    MIN_CONTAINERS=1 modal deploy spectrum/deploy.py     # demo window: keep gateway + T4 warm
    MIN_CONTAINERS=0 modal deploy spectrum/deploy.py     # after the demo

Training jobs are separate `modal run` entrypoints (see README).
"""
from spectrum import common  # noqa: F401
from spectrum.api import web  # noqa: F401
from spectrum.openweights.serve import OpenWeights  # noqa: F401

app = common.app
