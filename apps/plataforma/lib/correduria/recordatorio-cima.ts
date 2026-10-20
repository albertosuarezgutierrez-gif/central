// Recordatorio MENSUAL del export «Ficheros recibidos» del Portal CIMA (día 2, ver `cron-dispatch.ts`).
//
// La ingesta puede perder ficheros sin que nada lo note; la única comprobación independiente es bajar
// del Portal CIMA el export del último mes y compararlo con lo recibido. Este mensaje lo recuerda y,
// si la ingesta es legible, añade por compañía los días sin mandar.
//
// 🚨 Tres estados: `silencio === null` = no se pudo leer (se dice, NO se pinta «todas al día»);
// `diasSinFichero === null` = esa compañía nunca mandó fichero (no es 0 ni «al día»).
// Puro y sin red: el route lee la ingesta con `leerIngestaCima()`.

export type FilaCompania = {
  entidad: string
  nombre?: string | null
  diasSinFichero: number | null
}

const MAX_FILAS = 25

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function lineaCompania(c: FilaCompania): string {
  const nombre = (c.nombre ?? '').trim() || c.entidad
  const cod = nombre === c.entidad ? '' : ` (${c.entidad})`
  if (c.diasSinFichero === null) return `• ${esc(nombre)}${esc(cod)}: nunca ha mandado fichero`
  const d = c.diasSinFichero
  return `• ${esc(nombre)}${esc(cod)}: ${d === 0 ? 'fichero hoy' : d === 1 ? '1 día sin mandar' : `${d} días sin mandar`}`
}

/** Más días sin mandar primero; «nunca» el primero de todos. */
export function ordenarCompanias(lista: readonly FilaCompania[]): FilaCompania[] {
  const peso = (c: FilaCompania) => (c.diasSinFichero === null ? Number.POSITIVE_INFINITY : c.diasSinFichero)
  return [...lista].sort((a, b) => peso(b) - peso(a) || a.entidad.localeCompare(b.entidad))
}

export function mensajeRecordatorioCima(silencio: readonly FilaCompania[] | null): string {
  const cabecera = [
    '📥 <b>Recordatorio mensual: ficheros de CIMA</b>',
    'Baja del Portal CIMA el export «Ficheros recibidos» del último mes y súbelo/compáralo con lo recibido.',
  ]
  if (silencio === null) {
    return [...cabecera, '', 'No he podido leer el estado de la ingesta: no hay resumen por compañía (no significa que esté todo al día).'].join('\n')
  }
  if (silencio.length === 0) {
    return [...cabecera, '', 'La ingesta no informa de ninguna compañía.'].join('\n')
  }
  const ord = ordenarCompanias(silencio)
  const filas = ord.slice(0, MAX_FILAS).map(lineaCompania)
  const mas = ord.length > MAX_FILAS ? [`… y ${ord.length - MAX_FILAS} compañía(s) más.`] : []
  return [...cabecera, '', 'Lo recibido hasta ahora, por compañía:', ...filas, ...mas].join('\n')
}
