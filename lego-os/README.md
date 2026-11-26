# Lego OS
Local glasses OS simulator and service workbench. This directory is a sanitized source snapshot; the existing MyCraft project is preserved.

Run Python 3.11+ in glasses-workbench: `python3 server.py` and in another terminal `python3 model_gateway.py`. Install frontend dependencies using the provided package manifests when rebuilding. Configure your own model and service credentials locally. macOS credentials use Keychain; other devices need the appropriate vault adapter.

This repository excludes API keys, workspace configuration values, live databases, user data, logs, private conversation history, handoff context, local runtimes and generated user media. Missing media and dependencies must be supplied/built locally. Do not copy a private restore archive into this repository.

The public simulator Worker lives in `lego-os-online`. Use Node 22, run `npm install`, then `npm test` or `npm run build`. These commands generate the starter data and client assets from tracked source. The deployment manifest and provider credentials belong in the hosting environment.
