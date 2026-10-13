/**
 * Criba paginada del cron `avisos-push`: el lote de 500 NO se puede llenar con obligaciones que se
 * saltan a propósito (canal «solo correo», «no molestar»). Se pagina por cursor (id) la ventana ya
 * ordenada, se aplica el filtro de preferencias a cada página y se sigue hasta reunir `objetivo`
 * filas avisables, agotar la ventana o llegar a `maxPaginas` (tope de seguridad por ejecución).
 * Puro: la lectura y el filtro se inyectan.
 */
export const TAM_PAGINA_PUSH = 500
export const MAX_PAGINAS_PUSH = 10

export async function reunirAvisables<T extends { id: string }>(o: {
  leerPagina: (cursorId: string | null) => Promise<T[]>
  filtrar: (pagina: T[]) => Promise<T[]>
  tamPagina?: number
  objetivo?: number
  maxPaginas?: number
}): Promise<{ filas: T[]; paginas: number }> {
  const tam = o.tamPagina ?? TAM_PAGINA_PUSH
  const objetivo = o.objetivo ?? TAM_PAGINA_PUSH
  const maxPaginas = o.maxPaginas ?? MAX_PAGINAS_PUSH
  const filas: T[] = []
  let cursor: string | null = null
  let paginas = 0
  while (paginas < maxPaginas) {
    const pagina: T[] = await o.leerPagina(cursor)
    paginas += 1
    if (pagina.length === 0) break
    filas.push(...(await o.filtrar(pagina)))
    if (filas.length >= objetivo || pagina.length < tam) break
    cursor = pagina[pagina.length - 1]!.id
  }
  return { filas: filas.slice(0, objetivo), paginas }
}
