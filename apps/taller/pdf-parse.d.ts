// Import perezoso del implementador interno de pdf-parse (lib/extractor-factura.ts): sin tipos propios.
declare module 'pdf-parse/lib/pdf-parse.js' {
  const pdfParse: (data: Buffer) => Promise<{ text: string; numpages: number }>
  export default pdfParse
}
