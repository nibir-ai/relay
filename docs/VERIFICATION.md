# v0.0.1 verification

Local Windows/Python 3.12: 79 Python tests and 30 UI tests passed; strict TypeScript/Vite builds and Twine checks passed.

The wheel is built from the source archive. Both contain the compiled UI, fonts, Apache-2.0 license and dependency notices. Independent installation checks native UI/assets, discovery, execution, status and CLI outside the editable checkout.

Fresh environments verified the consumer integration against current dependency resolution and the declared minimum FastAPI 0.115.0, Uvicorn 0.30.0 and HTTPX 0.28.0 versions.

The CI workflow verifies Linux with Python 3.11, 3.12 and 3.13 before release. Consult its actual run results for this commit.

Published 9 October 2026: release workflow build and Trusted Publisher upload succeeded. Public PyPI install of relay-backend==0.0.1 passed in a fresh virtual environment, including bundled UI/assets, native discovery, actual endpoint execution and disabled mode. Linux CI passed on Python 3.11/3.12/3.13.
