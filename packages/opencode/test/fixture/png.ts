import { deflateSync } from "node:zlib"

export function pngFixture() {
  const width = 64
  const height = 48
  const scanlines = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4)
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 4
      const border = x < 3 || x >= width - 3 || y < 3 || y >= height - 3
      const center = x >= 24 && x < 40 && y >= 16 && y < 32
      const color = border
        ? [0, 0, 0]
        : center
          ? [255, 255, 255]
          : x < width / 3
            ? [220, 40, 40]
            : x < (width * 2) / 3
              ? [40, 180, 70]
              : [40, 90, 220]
      scanlines[offset] = color[0]!
      scanlines[offset + 1] = color[1]!
      scanlines[offset + 2] = color[2]!
      scanlines[offset + 3] = 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function chunk(type: string, data: Uint8Array) {
  const name = Buffer.from(type, "ascii")
  const result = Buffer.alloc(12 + data.byteLength)
  result.writeUInt32BE(data.byteLength, 0)
  name.copy(result, 4)
  result.set(data, 8)
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.byteLength)
  return result
}

function crc32(input: Uint8Array) {
  let value = 0xffffffff
  for (const byte of input) {
    value ^= byte
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1))
  }
  return (value ^ 0xffffffff) >>> 0
}
