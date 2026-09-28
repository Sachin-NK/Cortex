import sys
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vercel_app")

_here = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

try:
    from backend.main import app
    logger.info("Cortex app loaded successfully")
except Exception as exc:
    logger.error(f"STARTUP ERROR: {exc}", exc_info=True)
    from fastapi import FastAPI
    app = FastAPI()

    @app.get("/{path:path}")
    async def startup_error(path: str = ""):
        return {"error": "Server failed to start", "detail": str(exc)}

__all__ = ["app"]
