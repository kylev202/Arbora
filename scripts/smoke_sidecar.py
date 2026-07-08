#!/usr/bin/env python3
"""Smoke-test the *frozen* sidecar before it ships.

Runs the PyInstaller bundle exactly as the Rust core will — spawn it, read the
``ARBORA_SIDECAR_PORT=`` line from stdout, then hit ``GET /health`` — and exits
non-zero if any of that fails. This catches the most common release-killer: a
frozen bundle that's missing a hidden import or a native lib, which imports fine
from the dev venv but dies on a clean machine. CI runs it right after
``build_sidecar.py`` so a broken freeze never reaches an end user.

    python scripts/smoke_sidecar.py

Stdlib only (no requests): the frozen bundle is the thing under test, not this
harness.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "src-tauri" / "binaries" / "arbora-sidecar"
EXE = BUNDLE / ("arbora-sidecar.exe" if sys.platform == "win32" else "arbora-sidecar")
PORT_MARKER = "ARBORA_SIDECAR_PORT="
TOKEN = "smoke-test-token"
# A frozen onedir cold start (loading faiss/ctranslate2/av) can be slow on a
# loaded CI runner; be generous before declaring it hung.
PORT_TIMEOUT_S = 120
HEALTH_TIMEOUT_S = 30


def _fail(msg: str, proc: subprocess.Popen | None = None) -> int:
    print(f"error: {msg}", file=sys.stderr)
    if proc is not None and proc.stderr is not None:
        # Surface the frozen bundle's own traceback — the whole point of the test.
        tail = proc.stderr.read()
        if tail:
            print("--- sidecar stderr ---", file=sys.stderr)
            print(tail, file=sys.stderr)
    return 1


def main() -> int:
    if not EXE.exists():
        return _fail(f"frozen sidecar not found at {EXE} (run build_sidecar.py first)")

    env = {**os.environ, "ARBORA_SIDECAR_TOKEN": TOKEN}
    proc = subprocess.Popen(
        [str(EXE)],
        cwd=str(EXE.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )
    try:
        # 1. Read stdout until the port marker appears, the process exits, or we
        #    time out — mirroring how sidecar.rs discovers the port.
        base_url: str | None = None
        deadline = time.monotonic() + PORT_TIMEOUT_S
        assert proc.stdout is not None
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                return _fail("sidecar exited before announcing its port", proc)
            line = proc.stdout.readline()
            if not line:
                time.sleep(0.05)
                continue
            line = line.strip()
            if line.startswith(PORT_MARKER):
                port = int(line[len(PORT_MARKER):])
                base_url = f"http://127.0.0.1:{port}"
                break
        if base_url is None:
            return _fail(f"no port marker within {PORT_TIMEOUT_S}s", proc)

        # 2. Health check — proves the frozen app imported and is serving.
        req = urllib.request.Request(f"{base_url}/health")
        with urllib.request.urlopen(req, timeout=HEALTH_TIMEOUT_S) as resp:
            if resp.status != 200:
                return _fail(f"/health returned {resp.status}", proc)
            body = resp.read().decode()
        if '"status":"ok"' not in body.replace(" ", ""):
            return _fail(f"/health body unexpected: {body}", proc)

        print(f"OK frozen sidecar healthy @ {base_url} — {body}")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
