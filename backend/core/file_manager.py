from __future__ import annotations
"""
File Manager — safe workspace file operations for the IDE.
All paths are sandboxed to the configured workspace root.
"""
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List, Dict

# On Vercel the home directory is read-only; use /tmp instead.
# CORTEX_WORKSPACE env var overrides both.
def _default_workspace() -> str:
    env = os.getenv("CORTEX_WORKSPACE", "")
    if env:
        return env
    # Vercel sets VERCEL=1; fall back to /tmp which is writable
    if os.getenv("VERCEL") or not os.access(str(Path.home()), os.W_OK):
        return "/tmp/cortex_workspace"
    return str(Path.home() / "cortex_workspace")

DEFAULT_WORKSPACE = _default_workspace()


def _ensure_workspace(workspace: str) -> Path:
    p = Path(workspace)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_path(workspace: str, rel_path: str) -> Path:
    """Resolve rel_path inside workspace, raising if it escapes (path traversal protection)."""
    root = Path(workspace).resolve()
    target = (root / rel_path).resolve()
    if not str(target).startswith(str(root)):
        raise PermissionError(f"Path traversal blocked: {rel_path}")
    return target


@dataclass
class FileInfo:
    name: str
    path: str
    is_dir: bool
    size_bytes: int = 0
    extension: str = ""

    @classmethod
    def from_path(cls, root: str, full_path: Path) -> "FileInfo":
        rel = str(full_path.relative_to(root))
        return cls(
            name=full_path.name,
            path=rel,
            is_dir=full_path.is_dir(),
            size_bytes=full_path.stat().st_size if full_path.is_file() else 0,
            extension=full_path.suffix.lstrip(".") if full_path.is_file() else "",
        )
class FileEntry:
    name: str
    path: str          # relative to workspace root
    is_dir: bool
    size: int = 0
    children: Optional[List["FileEntry"]] = None


class FileManager:
    def __init__(self, workspace: str = DEFAULT_WORKSPACE):
        self.workspace = workspace
        _ensure_workspace(workspace)

    def list_dir(self, rel_path: str = "", depth: int = 3) -> List[FileEntry]:
        """Recursively list directory contents up to depth."""
        root = _safe_path(self.workspace, rel_path)
        if not root.exists():
            return []
        return self._walk(root, depth, rel_base=rel_path)

    def _walk(self, path: Path, depth: int, rel_base: str) -> List[FileEntry]:
        entries: List[FileEntry] = []
        try:
            items = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except PermissionError:
            return entries

        for item in items:
            if item.name.startswith(".") and item.name not in (".env", ".gitignore"):
                continue
            rel = str(Path(rel_base) / item.name).replace("\\", "/").lstrip("/")
            if item.is_dir():
                children = self._walk(item, depth - 1, rel) if depth > 1 else None
                entries.append(FileEntry(name=item.name, path=rel, is_dir=True, children=children))
            else:
                entries.append(FileEntry(name=item.name, path=rel, is_dir=False, size=item.stat().st_size))
        return entries

    def read_file(self, rel_path: str) -> str:
        p = _safe_path(self.workspace, rel_path)
        if not p.exists():
            raise FileNotFoundError(f"File not found: {rel_path}")
        if p.is_dir():
            raise IsADirectoryError(f"{rel_path} is a directory")
        # Cap at 2MB for safety
        if p.stat().st_size > 2 * 1024 * 1024:
            raise ValueError(f"File too large to read in browser (>{2}MB): {rel_path}")
        return p.read_text(encoding="utf-8", errors="replace")

    def write_file(self, rel_path: str, content: str) -> dict:
        p = _safe_path(self.workspace, rel_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return {"path": rel_path, "size": p.stat().st_size}

    def create_file(self, rel_path: str) -> dict:
        return self.write_file(rel_path, "")

    def create_dir(self, rel_path: str) -> dict:
        p = _safe_path(self.workspace, rel_path)
        p.mkdir(parents=True, exist_ok=True)
        return {"path": rel_path, "is_dir": True}

    def delete(self, rel_path: str) -> dict:
        p = _safe_path(self.workspace, rel_path)
        if not p.exists():
            raise FileNotFoundError(f"Not found: {rel_path}")
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()
        return {"deleted": rel_path}

    def rename(self, rel_path: str, new_name: str) -> dict:
        p = _safe_path(self.workspace, rel_path)
        new_p = p.parent / new_name
        # Ensure new_name doesn't escape workspace
        _safe_path(self.workspace, str(Path(rel_path).parent / new_name))
        p.rename(new_p)
        new_rel = str(Path(rel_path).parent / new_name).replace("\\", "/").lstrip("/")
        return {"old_path": rel_path, "new_path": new_rel}

    def search(self, query: str, rel_path: str = "", extensions: Optional[List[str]] = None) -> List[Dict]:
        """Simple text search across workspace files."""
        root = _safe_path(self.workspace, rel_path)
        results: List[Dict] = []
        query_lower = query.lower()

        for file_path in root.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.stat().st_size > 500_000:
                continue
            if extensions and file_path.suffix not in extensions:
                continue
            try:
                text = file_path.read_text(encoding="utf-8", errors="ignore")
                lines = text.splitlines()
                for i, line in enumerate(lines):
                    if query_lower in line.lower():
                        rel = str(file_path.relative_to(Path(self.workspace).resolve())).replace("\\", "/")
                        results.append({
                            "file": rel,
                            "line": i + 1,
                            "text": line.strip()[:200],
                        })
                        if len(results) >= 200:
                            return results
            except Exception:
                continue
        return results

    @property
    def workspace_path(self) -> str:
        return self.workspace
