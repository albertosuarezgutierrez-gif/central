// pdf-parse no publica tipos para su implementador interno, que se importa de
// forma perezosa (ver lib/concursos.ts) para evitar que su bloque de auto-test
// se ejecute al cargar el índice del paquete.
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages: number
    info: unknown
    metadata: unknown
    version: string
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>
  export default pdfParse
}
