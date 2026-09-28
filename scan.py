import os
root = r"c:\Users\sachi\Downloads\New Folder\cortex\backend"
skip = {"__pycache__", ".git"}
found = []
for dirpath, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in skip]
    for f in files:
        if not f.endswith(".py"):
            continue
        fp = os.path.join(dirpath, f)
        try:
            txt = open(fp, encoding="utf-8", errors="replace").read()
            # em dash, en dash, box-drawing dash
            if chr(8212) in txt or chr(8211) in txt or chr(9472) in txt:
                found.append(fp.replace(root + os.sep, ""))
        except Exception:
            pass
print("Files with special dashes:")
for f in found:
    print(" ", f)
print(f"Total: {len(found)}")
