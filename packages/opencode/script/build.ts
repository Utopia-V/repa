#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { tmpdir } from "os"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

import { Script } from "@opencode-ai/script"
import { PDFTextProfile } from "@opencode-ai/core/representation/pdf-text-profile"
import { PDFWorkerFrame } from "@opencode-ai/core/representation/pdf-worker-frame"
import pkg from "../package.json"
import corePkg from "../../core/package.json"
import { limitArguments } from "../src/representation/pdf-worker"
import { pdfFixture } from "../test/fixture/pdf"

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()
const skipEmbedWebUi = process.argv.includes("--skip-embed-web-ui")

const createEmbeddedWebUIBundle = async () => {
  console.log(`Building Web UI to embed in the binary`)
  const appDir = path.join(import.meta.dirname, "../../app")
  const dist = path.join(appDir, "dist")
  await $`REPA_CHANNEL=${Script.channel} bun run --cwd ${appDir} build`
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: dist })))
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.endsWith(".map"))
    .sort()
  const imports = files.map((file, i) => {
    const spec = path.relative(dir, path.join(dist, file)).replaceAll("\\", "/")
    return `import file_${i} from ${JSON.stringify(spec.startsWith(".") ? spec : `./${spec}`)} with { type: "file" };`
  })
  const entries = files.map((file, i) => `  ${JSON.stringify(file)}: file_${i},`)
  return [
    `// Import all files as file_$i with type: "file"`,
    ...imports,
    `// Export with original mappings`,
    `export default {`,
    ...entries,
    `}`,
  ].join("\n")
}

const embeddedFileMap = skipEmbedWebUi ? null : await createEmbeddedWebUIBundle()

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  {
    os: "linux",
    arch: "arm64",
  },
  {
    os: "linux",
    arch: "x64",
  },
  {
    os: "linux",
    arch: "x64",
    avx2: false,
  },
  {
    os: "linux",
    arch: "arm64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
    avx2: false,
  },
  {
    os: "darwin",
    arch: "arm64",
  },
  {
    os: "darwin",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "x64",
    avx2: false,
  },
  {
    os: "win32",
    arch: "arm64",
  },
  {
    os: "win32",
    arch: "x64",
  },
  {
    os: "win32",
    arch: "x64",
    avx2: false,
  },
]

const targets = singleFlag
  ? allTargets.filter((item) => {
      if (item.os !== process.platform || item.arch !== process.arch) {
        return false
      }

      // When building for the current platform, prefer a single native binary by default.
      // Baseline binaries require additional Bun artifacts and can be flaky to download.
      if (item.avx2 === false) {
        return baselineFlag
      }

      // also skip abi-specific builds for the same reason
      if (item.abi !== undefined) {
        return false
      }

      return true
    })
  : allTargets

await $`rm -rf dist`

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
  await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${pkg.dependencies["@ff-labs/fff-bun"]}`
  for (const arch of [...new Set(targets.filter((item) => item.os === "win32").map((item) => item.arch))]) {
    await $`bun install --no-save --os=win32 --cpu=${arch} @koromix/koffi-win32-${arch}@${corePkg.dependencies.koffi}`.cwd(
      path.resolve(dir, "../core"),
    )
  }
}
for (const item of targets) {
  const name = [
    pkg.name,
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")
  console.log(`building ${name}`)
  await $`mkdir -p dist/${name}/bin`

  const localPath = path.resolve(dir, "node_modules/@opentui/core/parser.worker.js")
  const rootPath = path.resolve(dir, "../../node_modules/@opentui/core/parser.worker.js")
  const parserWorker = fs.realpathSync(fs.existsSync(localPath) ? localPath : rootPath)
  const workerPath = "./src/cli/tui/worker.ts"

  // Use platform-specific bunfs root path based on target OS
  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerRelativePath = path.relative(dir, parserWorker).replaceAll("\\", "/")

  await Bun.build({
    conditions: ["bun", "node"],
    tsconfig: "./tsconfig.json",
    plugins: [plugin],
    external: ["node-gyp"],
    format: "esm",
    minify: true,
    sourcemap: sourcemapsFlag ? "linked" : "none",
    splitting: true,
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: name.replace(pkg.name, "bun") as any,
      outfile: `dist/${name}/bin/repa`,
      execArgv: [`--user-agent=repa/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    files: embeddedFileMap ? { "opencode-web-ui.gen.ts": embeddedFileMap } : {},
    entrypoints: ["./src/index.ts", parserWorker, workerPath, ...(embeddedFileMap ? ["opencode-web-ui.gen.ts"] : [])],
    define: {
      FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
      REPA_VERSION: `'${Script.version}'`,
      REPA_MODELS_DEV: generated.modelsData,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + workerRelativePath,
      REPA_WORKER_PATH: workerPath,
      REPA_CHANNEL: `'${Script.channel}'`,
      REPA_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
      ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
    },
  })

  const pdfWorkerBuild = await Bun.build({
    conditions: ["bun", "node"],
    tsconfig: "./tsconfig.json",
    external: ["@napi-rs/canvas", "node-gyp"],
    format: "esm",
    minify: true,
    sourcemap: sourcemapsFlag ? "linked" : "none",
    splitting: true,
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: name.replace(pkg.name, "bun") as any,
      outfile: `dist/${name}/bin/repa-pdf-worker`,
      execArgv: [`--user-agent=repa/${Script.version}`, "--"],
      windows: {},
    },
    entrypoints: ["./src/representation/pdf-worker-entry.ts"],
  })
  if (!pdfWorkerBuild.success) {
    throw new Error(`PDF worker build failed for ${name}: ${pdfWorkerBuild.logs.map((log) => log.message).join("; ")}`)
  }

  packagePDFJS(path.resolve(`dist/${name}/bin`))
  packageDOMMatrix(path.resolve(`dist/${name}/bin`))

  if (item.os === "win32") packageKoffi(item.arch, path.resolve(`dist/${name}/bin`))

  // Smoke test: only run if binary is for current platform
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    const smokeRoot = fs.mkdtempSync(path.join(tmpdir(), "repa-packaged-smoke-"))
    const smokeBin = path.join(smokeRoot, "bin")
    fs.cpSync(path.resolve(`dist/${name}/bin`), smokeBin, { recursive: true })
    const binaryPath = path.join(smokeBin, item.os === "win32" ? "repa.exe" : "repa")
    const workerPath = path.join(
      smokeBin,
      item.os === "win32" ? "repa-pdf-worker.exe" : "repa-pdf-worker",
    )
    console.log(`Running packaged smoke test: ${binaryPath} --version`)
    try {
      const versionOutput = await invokePackagedText(binaryPath, ["--version"], smokeRoot, smokeRoot)
      console.log(`Smoke test passed: ${versionOutput.trim()}`)
      if (item.os === "win32") {
        await smokeContentRoot(path.resolve(binaryPath))
        console.log(`ContentRoot native smoke test passed`)
      }
      await smokePDFWorker(workerPath, smokeBin)
      console.log(`Local PDF packaged worker smoke test passed`)
      if (item.os === "win32") {
        await smokePackagedPDFCancellation(binaryPath, workerPath)
        console.log(`Packaged parent-to-worker cancellation smoke test passed`)
      }
    } catch (e) {
      console.error(`Smoke test failed for ${name}:`, e)
      process.exit(1)
    } finally {
      fs.rmSync(smokeRoot, { recursive: true, force: true })
    }
  }

  await $`rm -rf ./dist/${name}/bin/tui`
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name,
        version: Script.version,
        preferUnplugged: true,
        os: [item.os],
        cpu: [item.arch],
        ...(item.abi ? { libc: [item.abi] } : {}),
      },
      null,
      2,
    ),
  )
  binaries[name] = Script.version
}

if (Script.release) {
  for (const key of Object.keys(binaries)) {
    if (key.includes("linux")) {
      await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
    } else {
      await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
    }
  }
  await $`gh release upload v${Script.version} ./dist/*.zip ./dist/*.tar.gz --clobber --repo ${process.env.GH_REPO}`
}

function packageKoffi(arch: "arm64" | "x64", output: string) {
  const entry = fs.realpathSync(Bun.resolveSync("koffi", path.resolve(dir, "../core")))
  const nodeModules = path.dirname(path.dirname(entry))
  const roots = [
    path.resolve(dir, `../core/node_modules/@koromix/koffi-win32-${arch}`),
    path.join(nodeModules, "@koromix", `koffi-win32-${arch}`),
  ]
  const packageRoot = roots.find((root) => fs.existsSync(root))
  if (!packageRoot) {
    throw new Error(`Missing Koffi package for win32-${arch}; run the build without --skip-install`)
  }
  const source = path.join(packageRoot, `win32_${arch}`, "koffi.node")
  if (!fs.existsSync(source)) {
    throw new Error(`Missing Koffi native module for win32-${arch}; run the build without --skip-install`)
  }
  const target = path.join(output, "koffi", `win32_${arch}`, "koffi.node")
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  fs.copyFileSync(path.join(path.dirname(entry), "LICENSE.txt"), path.join(output, "koffi", "LICENSE.txt"))
}

function packagePDFJS(output: string) {
  const packageRoot = path.dirname(Bun.resolveSync("pdfjs-dist/package.json", dir))
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version?: unknown }
  if (metadata.version !== pkg.dependencies["pdfjs-dist"]) {
    throw new Error(`Resolved pdfjs-dist version does not match the exact package dependency`)
  }
  const target = path.join(output, "pdfjs-dist")
  fs.mkdirSync(path.join(target, "legacy", "build"), { recursive: true })
  for (const directory of ["cmaps", "iccs", "standard_fonts", "wasm"]) {
    fs.cpSync(path.join(packageRoot, directory), path.join(target, directory), { recursive: true })
  }
  for (const file of ["LICENSE", "package.json"]) {
    fs.copyFileSync(path.join(packageRoot, file), path.join(target, file))
  }
  fs.copyFileSync(
    path.join(packageRoot, "legacy", "build", "pdf.worker.mjs"),
    path.join(target, "legacy", "build", "pdf.worker.mjs"),
  )
}

function packageDOMMatrix(output: string) {
  const packageRoot = path.dirname(Bun.resolveSync("@thednp/dommatrix/package.json", dir))
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version?: unknown }
  if (metadata.version !== pkg.dependencies["@thednp/dommatrix"]) {
    throw new Error(`Resolved DOMMatrix shim version does not match the exact package dependency`)
  }
  const target = path.join(output, "third-party", "thednp-dommatrix")
  fs.mkdirSync(target, { recursive: true })
  fs.copyFileSync(path.join(packageRoot, "LICENSE"), path.join(target, "LICENSE"))
  fs.copyFileSync(path.join(packageRoot, "package.json"), path.join(target, "package.json"))
}

async function smokePDFWorker(workerPath: string, output: string) {
  const required = [
    "pdfjs-dist/LICENSE",
    "pdfjs-dist/package.json",
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    "pdfjs-dist/cmaps/LICENSE",
    "pdfjs-dist/iccs/LICENSE",
    "pdfjs-dist/standard_fonts/LICENSE_FOXIT",
    "pdfjs-dist/standard_fonts/LICENSE_LIBERATION",
    "pdfjs-dist/wasm/LICENSE_JBIG2",
    "pdfjs-dist/wasm/LICENSE_OPENJPEG",
    "pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2",
    "pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG",
    "pdfjs-dist/wasm/LICENSE_PDFJS_QCMS",
    "pdfjs-dist/wasm/LICENSE_QCMS",
    "third-party/thednp-dommatrix/LICENSE",
    "third-party/thednp-dommatrix/package.json",
  ]
  if (required.some((file) => !fs.existsSync(path.join(output, file)))) {
    throw new Error(`Packaged PDF worker is missing required PDF.js runtime or license material`)
  }

  const base = fs.mkdtempSync(path.join(tmpdir(), "repa-pdf-worker-smoke-"))
  try {
    const input = pdfFixture()
    const first = await invokePDFWorker(workerPath, base, input)
    const second = await invokePDFWorker(workerPath, base, input)
    if (first.byteLength !== second.byteLength || first.some((byte, index) => byte !== second[index])) {
      throw new Error(`Packaged PDF worker did not return deterministic canonical bytes`)
    }
    const profile = PDFTextProfile.decode(first)
    if (!profile.ok) throw new Error(`Packaged PDF worker returned an invalid profile`)
    if (profile.value.profile.pages.length !== 3 || profile.value.profile.pages[1]?.items.length !== 0) {
      throw new Error(`Packaged PDF worker did not preserve ordered empty page records`)
    }
    if ((profile.value.profile.pages[2]?.signals?.imagePaintOperations ?? 0) < 1) {
      throw new Error(`Packaged PDF worker did not preserve mechanical image signals`)
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
}

async function invokePDFWorker(workerPath: string, cwd: string, input: Uint8Array) {
  const child = Bun.spawn([workerPath, ...limitArguments()], {
    cwd,
    env: {},
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  child.stdin.write(input)
  child.stdin.end()
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
  ])
  if (exitCode !== 0 || stderr.byteLength !== 0) throw new Error(`Packaged PDF worker did not exit cleanly`)
  const frame = PDFWorkerFrame.decode(new Uint8Array(stdout))
  if (!frame.ok || frame.value.status !== "success") throw new Error(`Packaged PDF worker returned an invalid frame`)
  if (frame.value.input.digest !== PDFWorkerFrame.attest(input).digest) {
    throw new Error(`Packaged PDF worker did not attest the exact presented input`)
  }
  return frame.value.payload
}

function packagedEnvironment(base: string, binaryPath: string) {
  const home = path.join(base, "home")
  const xdg = path.join(base, "xdg")
  const common = {
    PATH: path.dirname(binaryPath),
    TEMP: path.join(base, "temp"),
    TMP: path.join(base, "temp"),
    TMPDIR: path.join(base, "temp"),
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    REPA_DB: path.join(base, "repa.db"),
    REPA_TEST_HOME: home,
    XDG_CONFIG_HOME: path.join(xdg, "config"),
    XDG_DATA_HOME: path.join(xdg, "data"),
    XDG_CACHE_HOME: path.join(xdg, "cache"),
    XDG_STATE_HOME: path.join(xdg, "state"),
    NO_COLOR: "1",
  }
  if (process.platform !== "win32") return common
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
  if (!systemRoot) throw new Error(`Packaged Windows smoke requires SystemRoot`)
  return {
    ...common,
    SYSTEMROOT: systemRoot,
    SystemRoot: systemRoot,
    WINDIR: process.env.WINDIR ?? systemRoot,
    COMSPEC: process.env.ComSpec ?? path.join(systemRoot, "System32", "cmd.exe"),
    PATHEXT: process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD",
  }
}

async function invokePackagedText(binaryPath: string, args: string[], cwd: string, base: string) {
  fs.mkdirSync(path.join(base, "temp"), { recursive: true })
  const child = Bun.spawn([binaryPath, ...args], {
    cwd,
    env: packagedEnvironment(base, binaryPath),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
  ])
  const error = new TextDecoder().decode(stderr)
  if (exitCode !== 0 || error.length > 0) {
    throw new Error(`Packaged Repa command failed (${exitCode}): ${args.join(" ")}${error ? `: ${error}` : ""}`)
  }
  return new TextDecoder().decode(stdout)
}

async function smokePackagedPDFCancellation(binaryPath: string, workerPath: string) {
  const base = fs.mkdtempSync(path.join(tmpdir(), "repa-packaged-cancellation-smoke-"))
  fs.mkdirSync(path.join(base, "temp"), { recursive: true })
  try {
    const child = Bun.spawn([binaryPath, "debug", "pdf-worker-cancellation", "--pure"], {
      cwd: base,
      env: packagedEnvironment(base, binaryPath),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    const observation = await waitForPackagedWorker(child.pid, workerPath).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    )
    child.stdin.write("cancel\n")
    child.stdin.end()
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).arrayBuffer(),
      new Response(child.stderr).arrayBuffer(),
    ])
    await waitForPackagedWorkerExit(workerPath)
    if (!observation.ok) throw observation.error
    if (exitCode !== 0 || stderr.byteLength !== 0) {
      throw new Error(`Packaged parent did not await one clean worker cancellation`)
    }
    const result = JSON.parse(new TextDecoder().decode(stdout)) as { status?: unknown }
    if (result.status !== "cancelled") throw new Error(`Packaged parent returned the wrong cancellation result`)
    if (observation.value.ParentProcessId !== child.pid) {
      throw new Error(`Packaged worker was not owned by the packaged parent`)
    }
    console.log(
      JSON.stringify({
        smoke: "packaged_pdf_cancellation",
        parentProcessID: child.pid,
        workerProcessID: observation.value.ProcessId,
        workerPath: path.resolve(workerPath),
        result: "cancelled_and_reaped",
      }),
    )
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
}

type WindowsProcess = {
  readonly ProcessId: number
  readonly ParentProcessId: number
  readonly ExecutablePath?: string | null
}

async function waitForPackagedWorker(
  parentProcessID: number,
  workerPath: string,
  deadline = Date.now() + 15_000,
): Promise<WindowsProcess> {
  const matches = (await windowsProcesses("repa-pdf-worker.exe")).filter(
    (item) => item.ParentProcessId === parentProcessID && sameExecutable(item.ExecutablePath, workerPath),
  )
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new Error(`Packaged parent spawned more than one PDF worker`)
  if (Date.now() >= deadline) throw new Error(`Packaged parent did not spawn its sibling PDF worker`)
  await Bun.sleep(50)
  return waitForPackagedWorker(parentProcessID, workerPath, deadline)
}

async function waitForPackagedWorkerExit(workerPath: string, deadline = Date.now() + 15_000): Promise<void> {
  const present = (await windowsProcesses("repa-pdf-worker.exe")).some((item) =>
    sameExecutable(item.ExecutablePath, workerPath),
  )
  if (!present) return
  if (Date.now() >= deadline) throw new Error(`Packaged PDF worker remained alive after parent exit`)
  await Bun.sleep(50)
  return waitForPackagedWorkerExit(workerPath, deadline)
}

async function windowsProcesses(name: string) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
  if (!systemRoot) throw new Error(`Windows process inspection requires SystemRoot`)
  const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  const script = `$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name = '${name}'\" | Select-Object ProcessId,ParentProcessId,ExecutablePath) | ConvertTo-Json -Compress`
  const child = Bun.spawn([powershell, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Could not inspect packaged worker process: ${stderr}`)
  if (!stdout.trim()) return [] as WindowsProcess[]
  const parsed = JSON.parse(stdout) as WindowsProcess | WindowsProcess[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

function sameExecutable(observed: string | null | undefined, expected: string) {
  return typeof observed === "string" && path.resolve(observed).toLowerCase() === path.resolve(expected).toLowerCase()
}

async function smokeContentRoot(binaryPath: string) {
  const base = fs.mkdtempSync(path.join(tmpdir(), "repa-content-root-smoke-"))
  const content = path.join(base, "content")
  fs.mkdirSync(content, { recursive: true })
  fs.writeFileSync(path.join(content, "lesson.txt"), "Gate 10 compiled NTFS stable read smoke.\n")
  fs.writeFileSync(path.join(content, "lesson.pdf"), pdfFixture())
  try {
    const root = JSON.parse(
      await invokePackagedText(binaryPath, ["content", "root", "add", content, "--yes", "--pure"], content, base),
    ) as { id?: unknown }
    if (typeof root.id !== "string") throw new Error(`ContentRoot smoke did not return a root identity`)
    const inventory = JSON.parse(
      await invokePackagedText(binaryPath, ["content", "root", "inventory", root.id, "--pure"], content, base),
    ) as { entries?: { relativePath?: unknown }[] }
    if (!inventory.entries?.some((entry) => entry.relativePath === "lesson.txt")) {
      throw new Error(`ContentRoot smoke could not inventory the stable test file`)
    }
    const imported = JSON.parse(
      await invokePackagedText(
        binaryPath,
        ["content", "root", "import", root.id, "--file", "lesson.pdf", "--pure"],
        content,
        base,
      ),
    ) as {
      outcomes?: { status?: unknown; artifactID?: unknown; sourceRevisionID?: unknown; relativePath?: unknown }[]
    }
    const admitted = imported.outcomes?.find(
      (outcome) => outcome.status === "admitted" && outcome.relativePath === "lesson.pdf",
    )
    if (typeof admitted?.artifactID !== "string" || typeof admitted.sourceRevisionID !== "string") {
      throw new Error(`Packaged Repa could not admit the exact PDF Artifact and Revision`)
    }
    const converted = JSON.parse(
      await invokePackagedText(
        binaryPath,
        [
          "content",
          "representation",
          "convert",
          admitted.artifactID,
          admitted.sourceRevisionID,
          root.id,
          "lesson.pdf",
          "--producer",
          "local_pdf",
          "--operation",
          "packaged-pdf-smoke",
          "--pure",
        ],
        content,
        base,
      ),
    ) as {
      type?: unknown
      representation?: {
        id?: unknown
        sourceProof?: { authorization?: { contentRootID?: unknown }; ordinary?: { currentRevisionID?: unknown } }
      }
    }
    if (
      converted.type !== "accepted" ||
      typeof converted.representation?.id !== "string" ||
      converted.representation.sourceProof?.authorization?.contentRootID !== root.id ||
      converted.representation.sourceProof?.ordinary?.currentRevisionID !== admitted.sourceRevisionID
    ) {
      throw new Error(`Packaged Repa did not accept a Representation through the exact hidden-child receipt`)
    }
    const read = JSON.parse(
      await invokePackagedText(
        binaryPath,
        [
          "content",
          "representation",
          "read-current",
          converted.representation.id,
          admitted.artifactID,
          "--profile",
          "whole",
          "--pure",
        ],
        content,
        base,
      ),
    ) as { use?: unknown; admission?: { basis?: unknown }; content?: { bytes?: unknown } }
    if (
      read.use !== "current" ||
      read.admission?.basis !== "current_revision" ||
      typeof read.content?.bytes !== "string"
    ) {
      throw new Error(`Packaged Repa did not admit a verified current-use Representation read`)
    }
    const profile = PDFTextProfile.decode(new TextEncoder().encode(read.content.bytes))
    if (!profile.ok || profile.value.profile.pages.length !== 3) {
      throw new Error(`Packaged Repa current-use read did not return the canonical PDF profile`)
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
}

export { binaries }
