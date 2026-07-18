export interface PDFPageFixture {
  readonly text?: string
  readonly image?: boolean
}

export function pdfFixture(
  pages: ReadonlyArray<PDFPageFixture> = [{ text: "Page one" }, {}, { text: "Mixed page", image: true }],
  metadataPageCount?: number,
) {
  if (pages.length === 0) throw new Error("PDF fixture requires at least one page")
  const encoder = new TextEncoder()
  const pageIDs = pages.map((_, index) => 4 + index * 2)
  const imageID = 4 + pages.length * 2
  const hasImage = pages.some((page) => page.image)
  const metadataID = imageID + (hasImage ? 1 : 0)
  const objects: Uint8Array[] = []
  objects[1] = encoder.encode(
    `<< /Type /Catalog /Pages 2 0 R${metadataPageCount === undefined ? "" : ` /Metadata ${metadataID} 0 R`} >>`,
  )
  objects[2] = encoder.encode(
    `<< /Type /Pages /Kids [${pageIDs.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  )
  objects[3] = encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

  for (const [index, page] of pages.entries()) {
    const pageID = pageIDs[index]!
    const contentID = pageID + 1
    const image = page.image ? ` /XObject << /Im1 ${imageID} 0 R >>` : ""
    objects[pageID] = encoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >>${image} >> /Contents ${contentID} 0 R >>`,
    )
    const text = page.text
      ? `BT /F1 12 Tf 72 720 Td (${page.text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj ET\n`
      : ""
    const paint = page.image ? "q 12 0 0 12 72 600 cm /Im1 Do Q\n" : ""
    objects[contentID] = stream(encoder.encode(text + paint))
  }
  if (hasImage) {
    objects[imageID] = stream(
      encoder.encode("00>"),
      "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode",
    )
  }
  if (metadataPageCount !== undefined) {
    objects[metadataID] = stream(
      encoder.encode(
        [
          '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
          '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
          '<rdf:Description xmlns:xmpTPg="http://ns.adobe.com/xap/1.0/t/pg/">',
          `<xmpTPg:NPages>${metadataPageCount}</xmpTPg:NPages>`,
          "</rdf:Description></rdf:RDF></x:xmpmeta>",
        ].join(""),
      ),
      "/Type /Metadata /Subtype /XML",
    )
  }
  return document(objects)
}

function stream(bytes: Uint8Array, dictionary = "") {
  return concat([
    new TextEncoder().encode(`<< ${dictionary} /Length ${bytes.byteLength} >>\nstream\n`),
    bytes,
    new TextEncoder().encode("\nendstream"),
  ])
}

function document(objects: ReadonlyArray<Uint8Array>) {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.7\n%Repa deterministic test fixture\n")]
  const offsets = [0]
  let byteLength = chunks[0]!.byteLength
  for (let id = 1; id < objects.length; id++) {
    const object = objects[id]
    if (!object) continue
    offsets[id] = byteLength
    const framed = concat([encoder.encode(`${id} 0 obj\n`), object, encoder.encode("\nendobj\n")])
    chunks.push(framed)
    byteLength += framed.byteLength
  }
  const xref = byteLength
  const rows = Array.from({ length: objects.length }, (_, id) =>
    id === 0 ? "0000000000 65535 f \n" : `${String(offsets[id]).padStart(10, "0")} 00000 n \n`,
  ).join("")
  chunks.push(
    encoder.encode(
      `xref\n0 ${objects.length}\n${rows}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  )
  return concat(chunks)
}

function concat(chunks: ReadonlyArray<Uint8Array>) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
