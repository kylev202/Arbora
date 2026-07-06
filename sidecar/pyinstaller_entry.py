"""PyInstaller entry point for the frozen Arbora sidecar.

PyInstaller runs the target script as ``__main__``, which would break
``arbora_ai.server``'s relative imports (``from . import __version__``). Importing
the server as a package module here keeps them working. Equivalent to
``python -m arbora_ai.server``.
"""

from __future__ import annotations

import multiprocessing

from arbora_ai.server import main

if __name__ == "__main__":
    # Harmless with our thread-based JobRegistry, but required if any dependency
    # spawns a child process from a frozen build.
    multiprocessing.freeze_support()
    main()
