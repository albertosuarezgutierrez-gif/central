/** Opt-in: solo con `reutilizarSiIdentico: true` `guardarDocumento` devuelve el documento previo en vez de guardar otro. */
export function reutilizaDocumentoPrevio(entrada: { reutilizarSiIdentico?: boolean }): boolean {
  return entrada.reutilizarSiIdentico === true
}
