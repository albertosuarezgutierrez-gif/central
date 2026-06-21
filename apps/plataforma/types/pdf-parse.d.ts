// Shim de tipos para el subpath profundo de pdf-parse.
//
// `lib/concursos.ts` importa `pdf-parse/lib/pdf-parse.js` directamente (en vez de
// la raíz `pdf-parse`) para evitar el bug conocido del index del paquete, que al
// cargarse ejecuta código de prueba que lee un PDF de ejemplo del disco. El
// `@types/pdf-parse` solo cubre la raíz, no este subpath → TS7016. Este módulo
// declara el subpath (el consumidor ya castea el resultado a `any`).
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages: number
    info: unknown
    metadata: unknown
    version: string
  }
  function pdfParse(dataBuffer: Buffer, options?: unknown): Promise<PdfParseResult>
  export default pdfParse
}
