import { Global } from "@opencode-ai/core/global"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Flag } from "@opencode-ai/core/flag/flag"
import os from "os"
import { Duration, Effect, Exit, Fiber } from "effect"
import { effectCmd, fail } from "../../effect-cmd"
import { cmd } from "../cmd"
import { ConfigCommand } from "./config"
import { FileCommand } from "./file"
import { LSPCommand } from "./lsp"
import { RipgrepCommand } from "./ripgrep"
import { ScrapCommand } from "./scrap"
import { SkillCommand } from "./skill"
import { SnapshotCommand } from "./snapshot"
import { AgentCommand } from "./agent"
import { StartupCommand } from "./startup"
import { V2Command } from "./v2"

export const DebugCommand = cmd({
  command: "debug",
  describe: "debugging and troubleshooting tools",
  builder: (yargs) =>
    yargs
      .command(ConfigCommand)
      .command(LSPCommand)
      .command(RipgrepCommand)
      .command(FileCommand)
      .command(ScrapCommand)
      .command(SkillCommand)
      .command(SnapshotCommand)
      .command(StartupCommand)
      .command(AgentCommand)
      .command(V2Command)
      .command(InfoCommand)
      .command(PathsCommand)
      .command(WaitCommand)
      .command(PackagedPDFCancellationCommand)
      .demandCommand(),
  async handler() {},
})

const WaitCommand = effectCmd({
  command: "wait",
  describe: "wait indefinitely (for debugging)",
  handler: Effect.fn("Cli.debug.wait")(function* () {
    yield* Effect.sleep(Duration.days(1))
  }),
})

const PackagedPDFCancellationCommand = effectCmd({
  command: "pdf-worker-cancellation",
  describe: false,
  instance: false,
  handler: Effect.fn("Cli.debug.pdf-worker-cancellation")(function* () {
    const { LocalPDFProducer } = yield* Effect.promise(() => import("@/representation/pdf-producer"))
    const controller = new AbortController()
    const probe = yield* LocalPDFProducer.probePackagedCancellation(controller.signal).pipe(
      Effect.exit,
      Effect.forkChild,
    )
    const control = yield* Effect.promise(() => Bun.stdin.text())
    controller.abort()
    const exit = yield* Fiber.await(probe).pipe(
      Effect.timeoutOrElse({
        duration: "10 seconds",
        orElse: () => Fiber.interrupt(probe).pipe(Effect.andThen(fail("Packaged PDF worker did not cancel"))),
      }),
    )
    if (control.trim() !== "cancel") return yield* fail("Invalid packaged PDF cancellation control")
    if (!Exit.isSuccess(exit) || !Exit.isFailure(exit.value)) {
      return yield* fail("Packaged PDF worker did not terminate through the parent")
    }
    const reason = exit.value.cause.reasons[0]
    if (reason?._tag !== "Fail" || !(reason.error instanceof LocalPDFProducer.PDFProducerError)) {
      return yield* fail("Packaged PDF worker returned an unrecognized cancellation result")
    }
    if (reason.error.code !== "cancelled") return yield* fail("Packaged PDF worker returned the wrong terminal cause")
    process.stdout.write(`${JSON.stringify({ status: "cancelled" })}\n`)
  }),
})

const InfoCommand = effectCmd({
  command: "info",
  describe: "show debug information",
  handler: Effect.fn("Cli.debug.info")(function* () {
    const { Config } = yield* Effect.promise(() => import("@/config/config"))
    const { ConfigPlugin } = yield* Effect.promise(() => import("@/config/plugin"))
    const config = yield* Config.Service.use((cfg) => cfg.get())
    const termProgram = process.env.TERM_PROGRAM
      ? `${process.env.TERM_PROGRAM}${process.env.TERM_PROGRAM_VERSION ? ` ${process.env.TERM_PROGRAM_VERSION}` : ""}`
      : undefined
    const terminal = [termProgram, process.env.TERM].filter((item): item is string => Boolean(item)).join(" / ")

    console.log(`repa version: ${InstallationVersion}`)
    console.log(`os: ${os.type()} ${os.release()} ${os.arch()}`)
    console.log(`terminal: ${terminal || "unknown"}`)
    console.log("plugins:")
    if (Flag.REPA_PURE) {
      console.log("external plugins disabled (--pure)")
      return
    }
    if (!config.plugin_origins?.length) {
      console.log("none")
      return
    }
    for (const plugin of config.plugin_origins) {
      console.log(`- ${ConfigPlugin.pluginSpecifier(plugin.spec)}`)
    }
  }),
})

const PathsCommand = cmd({
  command: "paths",
  describe: "show global paths (data, config, cache, state)",
  handler() {
    for (const [key, value] of Object.entries(Global.Path)) {
      console.log(key.padEnd(10), value)
    }
  },
})
