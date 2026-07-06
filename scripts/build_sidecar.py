#!/usr/bin/env python3
"""Freeze the Python AI sidecar into a standalone bundle Tauri can ship.

Runs PyInstaller against ``sidecar/arbora-sidecar.spec`` and writes the onedir
bundle to ``src-tauri/binaries/arbora-sidecar/`` — the path ``tauri.conf.json``
lists under ``bundle.resources`` and ``sidecar.rs`` resolves at runtime.

Run with the sidecar's environment (its deps + pyinstaller must be importable):

    sidecar/.venv/Scripts/python.exe scripts/build_sidecar.py   # Windows
    sidecar/.venv/bin/python scripts/build_sidecar.py            # macOS/Linux

Cross-platform: on each OS it produces that OS's native binary. CI runs it once
per matrix leg before ``tauri build``.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIDECAR_DIR = ROOT / "sidecar"
SPEC = SIDECAR_DIR / "arbora-sidecar.spec"
DIST = ROOT / "src-tauri" / "binaries"
WORK = ROOT / "build" / "pyinstaller"


def main() -> int:
    if not SPEC.exists():
        print(f"error: spec not found at {SPEC}", file=sys.stderr)
        return 1

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--distpath",
        str(DIST),
        "--workpath",
        str(WORK),
        SPEC.name,
    ]
    print("->", " ".join(cmd))
    # Run from the sidecar dir so the spec's relative entry script resolves.
    result = subprocess.run(cmd, cwd=SIDECAR_DIR)
    if result.returncode != 0:
        return result.returncode

    exe = DIST / "arbora-sidecar" / ("arbora-sidecar.exe" if sys.platform == "win32" else "arbora-sidecar")
    if not exe.exists():
        print(f"error: expected bundle binary missing at {exe}", file=sys.stderr)
        return 1
    print(f"OK sidecar frozen at {exe.parent}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
