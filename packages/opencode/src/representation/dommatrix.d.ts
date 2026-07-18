declare module "@thednp/dommatrix" {
  class DOMMatrixShim {
    constructor(value?: string | ReadonlyArray<number>)
    scaleSelf(x: number, y?: number, z?: number): this
    translateSelf(x: number, y?: number, z?: number): this
    multiplySelf(value: DOMMatrixShim): this
  }

  export default DOMMatrixShim
}
