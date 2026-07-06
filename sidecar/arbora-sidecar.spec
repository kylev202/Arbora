# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Arbora Python AI sidecar.

Produces a self-contained *onedir* bundle (``arbora-sidecar/`` with an
``arbora-sidecar[.exe]`` inside) that runs the FastAPI sidecar with no system
Python. onedir (not onefile) is deliberate: onefile re-extracts ~hundreds of MB
to a temp dir on every launch — slow and antivirus-prone for a bundle this heavy.

Build with ``python scripts/build_sidecar.py`` (drives PyInstaller with the
right dist path for Tauri to bundle). See the cross-platform-packaging skill.
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = []
binaries = []
hiddenimports = []

# Native / data-carrying packages PyInstaller can't fully trace on its own.
# collect_all grabs their .pyd/.dll/.so, bundled model assets, and submodules.
#   faster_whisper  → bundles the Silero VAD onnx under assets/
#   ctranslate2     → Whisper inference native libs
#   onnxruntime     → VAD runtime native libs
#   av              → PyAV + bundled ffmpeg libs (audio/video decode)
#   faiss           → vector-index native lib (pip name faiss-cpu, imports as faiss)
#   tokenizers      → Rust extension for Whisper tokenization
for _pkg in ("faster_whisper", "ctranslate2", "onnxruntime", "av", "faiss", "tokenizers"):
    _d, _b, _h = collect_all(_pkg)
    datas += _d
    binaries += _b
    hiddenimports += _h

# uvicorn resolves its event-loop / http / websocket implementations by import
# string at runtime, so static analysis misses them.
hiddenimports += collect_submodules("uvicorn")

# Our own package: every submodule the FastAPI app imports, plus data files such
# as help/app_help_kb.md (the pet's grounded help KB — /pet/help needs it).
_d, _b, _h = collect_all("arbora_ai")
datas += _d
binaries += _b
hiddenimports += _h

a = Analysis(
    ["pyinstaller_entry.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    # Trim heavyweight libraries we never import (keeps the bundle lean and the
    # build fast). None are Arbora dependencies; excluding is safe.
    excludes=["torch", "tensorflow", "tkinter", "matplotlib", "pytest", "IPython"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="arbora-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # console=True is REQUIRED: Rust reads the `ARBORA_SIDECAR_PORT=` marker from
    # stdout. A windowed build has no stdout on Windows and would break the
    # handshake. The visible console window is suppressed on the Rust side via
    # CREATE_NO_WINDOW when spawning.
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="arbora-sidecar",
)
