import { UI } from "../ui"
import { cmd } from "./cmd"
import { Process } from "@/util/process"

export const PrCommand = cmd({
  command: "pr <number>",
  describe: "fetch and checkout a GitHub PR branch, then run Repa",
  builder: (yargs) =>
    yargs.positional("number", {
      type: "number",
      describe: "PR number to checkout",
      demandOption: true,
    }),
  handler: async (args) => {
    const root = await Process.text(["git", "rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      nothrow: true,
    })
    if (root.code !== 0 || !root.text.trim()) {
      UI.error("Could not find git repository. Please run this command from a git repository.")
      process.exitCode = 1
      return
    }
    const worktree = root.text.trim()
    const prNumber = args.number
    const localBranchName = `pr/${prNumber}`
    UI.println(`Fetching and checking out PR #${prNumber}...`)

    const checkout = await Process.run(
      ["gh", "pr", "checkout", `${prNumber}`, "--branch", localBranchName, "--force"],
      {
        cwd: worktree,
        nothrow: true,
      },
    )
    if (checkout.code !== 0) {
      UI.error(`Failed to checkout PR #${prNumber}. Make sure you have gh CLI installed and authenticated.`)
      process.exitCode = 1
      return
    }

    const prInfoResult = await Process.text(
      ["gh", "pr", "view", `${prNumber}`, "--json", "headRepository,headRepositoryOwner,isCrossRepository,headRefName"],
      { cwd: worktree, nothrow: true },
    )

    if (prInfoResult.code === 0 && prInfoResult.text.trim()) {
      const prInfo = JSON.parse(prInfoResult.text)
      if (prInfo?.isCrossRepository && prInfo.headRepository && prInfo.headRepositoryOwner) {
        const forkOwner = prInfo.headRepositoryOwner.login
        const forkName = prInfo.headRepository.name
        const remoteName = forkOwner
        const remotes = (await Process.text(["git", "remote"], { cwd: worktree })).text.trim()
        if (!remotes.split("\n").includes(remoteName)) {
          await Process.run(["git", "remote", "add", remoteName, `https://github.com/${forkOwner}/${forkName}.git`], {
            cwd: worktree,
          })
          UI.println(`Added fork remote: ${remoteName}`)
        }
        await Process.run(["git", "branch", `--set-upstream-to=${remoteName}/${prInfo.headRefName}`, localBranchName], {
          cwd: worktree,
        })
      }
    }

    UI.println(`Successfully checked out PR #${prNumber} as branch '${localBranchName}'`)
    UI.println()
    UI.println("Starting Repa...")
    UI.println()

    const code = await Process.spawn(["repa"], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      cwd: worktree,
    }).exited
    if (code !== 0) throw new Error(`repa exited with code ${code}`)
  },
})
