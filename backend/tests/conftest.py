import sys
import os

# Add backend/ to sys.path so absolute imports (from providers, from core, etc.) resolve
_backend = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend not in sys.path:
    sys.path.insert(0, _backend)
