import sys
import os
import types

# Vercel puts backend/ contents at /var/task/
# vercel_app.py is at /var/task/vercel_app.py
# main.py is at /var/task/main.py
# but main.py uses relative imports (from .core.xxx import ...)
# which require 'backend' to be a package.
#
# Solution: create a synthetic 'backend' package that points to /var/task/
# so 'from backend.main import app' resolves correctly.

_task_dir = os.path.dirname(os.path.abspath(__file__))

if _task_dir not in sys.path:
    sys.path.insert(0, _task_dir)

# Create a synthetic package 'backend' mapped to /var/task/
# Only needed when running on Vercel (where backend/ is the root)
if "backend" not in sys.modules:
    backend_pkg = types.ModuleType("backend")
    backend_pkg.__path__ = [_task_dir]
    backend_pkg.__package__ = "backend"
    backend_pkg.__spec__ = None
    sys.modules["backend"] = backend_pkg

from backend.main import app

__all__ = ["app"]
