import sys
import os
import logging

logging.basicConfig(level=logging.INFO)

_here = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

from backend.main import app

__all__ = ["app"]
