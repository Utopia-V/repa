# Retained OpenCode Web App Notes

> **Status — retained OpenCode web-app source outside Repa's intended TUI
> baseline.** The package is not a supported Repa product, startup, deployment,
> or release surface. The registered default binary build does not build or
> embed it. An isolated research build may opt in with
> `--research-embed-web-ui`; that opt-in does not grant product or release
> authority. Root `AGENTS.md` and `docs/README.md` govern any deliberate future
> re-admission.
> Current Repa authority is indexed by the [documentation map](../../docs/README.md).

## Historical Template Usage

The original Solid template described dependency management with [pnpm](https://pnpm.io) and `pnpm up -Lri`. This is scaffold provenance, not the repository's canonical install workflow.

The following generic package-manager example is retained from that template:

```bash
$ npm install # or pnpm install or yarn install
```

### Historical Solid template resources

The template linked to the [Solid website](https://solidjs.com) and its [Discord](https://discord.com/invite/solidjs).

## Historical Template Scripts

The commands below describe the original template conventions. For intentional maintenance of this retained package, use its current `package.json` and package-local `AGENTS.md`.

### `npm run dev` or `npm start`

Runs the app in the development mode.<br>
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.<br>

### `npm run build`

Builds the app for production to the `dist` folder.<br>
It correctly bundles Solid in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br>
Your app is ready to be deployed!

## E2E Testing

Playwright starts the Vite dev server automatically via `webServer`, and UI tests expect an opencode backend at `localhost:4096` by default.

```bash
bunx playwright install chromium
bun run test:e2e:local
bun run test:e2e:local -- --grep "settings"
```

Environment options:

- `PLAYWRIGHT_SERVER_HOST` / `PLAYWRIGHT_SERVER_PORT` (backend address, default: `localhost:4096`)
- `PLAYWRIGHT_PORT` (Vite dev server port, default: `3000`)
- `PLAYWRIGHT_BASE_URL` (override base URL, default: `http://localhost:<PLAYWRIGHT_PORT>`)

## Historical Template Deployment

The original template described deploying `dist` to a static host. That statement is not a Repa deployment or release instruction.
