import sys
import os
import traceback

_here = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

_startup_error = None
try:
    from backend.main import app
except Exception as _e:
    _startup_error = traceback.format_exc()
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    app = FastAPI()

    @app.get("/{path:path}")
    async def _err(path: str = ""):
        return JSONResponse({"startup_error": _startup_error}, status_code=500)

__all__ = ["app"]
