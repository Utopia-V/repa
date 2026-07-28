# Hibernated OpenCode CI containers

Status: inactive fork evidence kept beside the hibernated workflow that used
it. These definitions are not Repa build, CI, release, or registry-publishing
instructions. Do not execute or publish them without a separately accepted
Repa automation and registry contract.

Current Repa authority is indexed by the
[documentation map](../../../../docs/README.md).

The upstream workflow used prebuilt images to speed up Linux GitHub Actions
jobs by baking in large, slow-to-install dependencies.

Images

- `base`: Ubuntu 24.04 with common build tools and utilities
- `bun-node`: `base` plus Bun and Node.js 24
- `rust`: `bun-node` plus Rust (stable, minimal profile)
- `tauri-linux`: `rust` plus Tauri Linux build dependencies
- `publish`: `bun-node` plus Docker CLI and AUR tooling

Historical workflow usage

```
jobs:
  build-cli:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/anomalyco/build/bun-node:24.04
```

Notes

- These images only help Linux jobs. macOS and Windows jobs cannot run
  inside Linux containers.
- The retained script's `--push` branch historically published multi-arch
  images. Its upstream default registry is not authorized for Repa.
- If a job uses Docker Buildx, the container needs access to the host
  Docker daemon (or `docker-in-docker` with privileged mode).
