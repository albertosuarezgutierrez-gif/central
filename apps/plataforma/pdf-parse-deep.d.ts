// `@types/pdf-parse` solo declara el módulo 'pdf-parse', no su subpath interno.
// `lib/concursos.ts` importa de forma perezosa 'pdf-parse/lib/pdf-parse.js'
// (para evitar los artefactos de test del índice), lo que provocaba TS7016.
declare module 'pdf-parse/lib/pdf-parse.js' {
  function pdf(dataBuffer: Buffer | Uint8Array): Promise<{ text: string; [key: string]: unknown }>
  export default pdf
}
