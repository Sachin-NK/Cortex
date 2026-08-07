"""
Vercel entrypoint — adds the parent directory to sys.path so that
'backend' becomes importable as a package, then re-exports the FastAPI app.

Vercel looks for an 'app' variable in this file.
"""
import sys
import os

# Make the cortex/ directory (parent of backend/) importable
# so that `from backend.core.xxx import ...` works as absolute imports
_here = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

# Now import the real FastAPI app via the package
from backend.main import app  # noqa: F401, E402

__all__ = ["app"]
