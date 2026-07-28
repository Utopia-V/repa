# Retained OpenCode Console App Notes

> **Status — retained OpenCode console source outside Repa's TUI baseline.** This package and its cloud/account-oriented UI are not a Repa product, startup, build, deployment, or release surface. The SolidStart text below is inherited scaffold guidance for source-local reference, not Repa architecture or operating instructions.
> Current Repa authority is indexed by the [documentation map](../../../docs/README.md).

This retained package was scaffolded with [`solid-start`](https://start.solidjs.com).

## Historical Scaffold Creation

```bash
# create a new project in the current directory
npm init solid@latest

# create a new project in my-app
npm init solid@latest my-app
```

## Historical Scaffold Development

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Historical Scaffold Build

Solid apps are built with _presets_, which optimise your project for deployment to different environments.

By default, `npm run build` will generate a Node app that you can run with `npm start`. To use a different preset, add it to the `devDependencies` in `package.json` and specify in your `app.config.js`.

## Scaffold Provenance

The inherited package was originally created with the [Solid CLI](https://github.com/solidjs-community/solid-cli).
