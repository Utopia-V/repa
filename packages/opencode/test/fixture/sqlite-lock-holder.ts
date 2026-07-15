import { Database } from "bun:sqlite"

const filename = process.argv[2]
if (!filename) throw new Error("usage: sqlite-lock-holder <database>")

const database = new Database(filename)
database.run("PRAGMA main.locking_mode = EXCLUSIVE")
database.run("PRAGMA busy_timeout = 0")
database.run("BEGIN EXCLUSIVE")
database.run("ROLLBACK")
process.stdout.write("ready\n")
process.stdin.resume()
await new Promise<void>((resolve) => process.stdin.once("end", resolve))
database.close()
