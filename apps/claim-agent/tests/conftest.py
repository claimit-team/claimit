"""Pytest session setup for claim-agent tests.

claimit-mongodb-models has a broken hatch wheel.sources mapping that installs
its files flat to site-packages root instead of under claimit_mongodb_models/.
Register the source directory under the correct module name so tests can use
`from claimit_mongodb_models import ...` as intended.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_repo_root = Path(__file__).resolve().parents[3]
_mongodb_src = _repo_root / "packages" / "shared" / "mongodb"

if "claimit_mongodb_models" not in sys.modules:
    _spec = importlib.util.spec_from_file_location(
        "claimit_mongodb_models",
        _mongodb_src / "__init__.py",
        submodule_search_locations=[str(_mongodb_src)],
    )
    _mod = importlib.util.module_from_spec(_spec)
    sys.modules["claimit_mongodb_models"] = _mod
    _spec.loader.exec_module(_mod)  # type: ignore[union-attr]
