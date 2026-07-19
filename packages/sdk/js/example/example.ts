import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk"
import { pathToFileURL } from "bun"

const server = await createOpencodeServer()
const client = createOpencodeClient({ baseUrl: server.url })
const files = await Array.fromAsync(new Bun.Glob("packages/core/*.ts").scan())

await Promise.all(
  files.map(async (file) => {
    const nonce = crypto.randomUUID()
    const sessionID = `ses_${nonce}`
    const turnID = `trn_${nonce}`
    console.log("processing", file)
    const admitted = await client.session.start({
      sessionID,
      turnID,
      inputID: `tri_${nonce}`,
      messageID: `msg_${nonce}`,
      parts: [
        {
          type: "file",
          mime: "text/plain",
          url: pathToFileURL(file).href,
        },
        {
          type: "text",
          text: "Write tests for every public function in this file.",
        },
      ],
    })
    if (admitted.error) throw admitted.error
    const terminal = await client.session.awaitTurn({ sessionID, turnID })
    if (terminal.error) throw terminal.error
    console.log("done", file, terminal.data.state)
  }),
)
