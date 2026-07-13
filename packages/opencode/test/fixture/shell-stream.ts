const release = Bun.argv[2]
if (!release) throw new Error("missing release path")

await new Promise<void>((resolve, reject) => {
  process.stdout.write("first\n", (error) => {
    if (error) reject(error)
    else resolve()
  })
})

const deadline = Date.now() + 2_000
while (!(await Bun.file(release).exists())) {
  if (Date.now() >= deadline) {
    process.stderr.write("release timeout\n")
    process.exit(124)
  }
  await Bun.sleep(10)
}

await new Promise<void>((resolve, reject) => {
  process.stdout.write("second\n", (error) => {
    if (error) reject(error)
    else resolve()
  })
})
