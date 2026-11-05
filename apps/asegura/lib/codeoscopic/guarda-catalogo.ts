// Guarda ANTES de pagar (05/11/2026): ¿el ramo que se va a cotizar tiene algún producto VIVO en la última
// instantánea (gratis) del catálogo? PURO, sin BD ni alias `@/`.
//
// Avant2 cotiza todos los productos activos del ramo. Si todos llevan marca «PILOTO», el POST
// (0,50 €) sale sin precios útiles. OJO: «DESCATALOGADO» NO cuenta como muerto (el «DESCATALOGADO - Mapfre Autos»
// da precios: de él salen todos los de Mapfre). Regla de oro: «no hay instantánea» o «no se pudo mirar» NO es «no hay productos»;
// solo se corta con PRUEBA (productos del ramo listados y ninguno vivo, o la llamada de productos ok con 0 elementos).

export type FilaCatalogoMin = {
  tipo: string
  ramo: string | null
  producto_nombre: string | null
  extra?: unknown
  fecha?: Date | string | null
}

export type VeredictoCatalogo =
  | { accion: 'seguir'; aviso?: string }
  | { accion: 'cortar'; mensaje: string }

const MUERTO = /^\s*PILOTO\b/i
/** Edad a partir de la cual se avisa (sin bloquear) de que la instantánea puede estar vieja. */
export const DIAS_INSTANTANEA_VIEJA = 7

export const esProductoVivo = (nombre: string | null | undefined): boolean => !MUERTO.test(nombre ?? '')

/** `insuranceLine.id` del cuerpo (`Car`, `Home`…). `null` si no consta: entonces no se afirma nada. */
export function ramoDeCuerpo(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null
  const l = (cuerpo as Record<string, unknown>).insuranceLine
  if (typeof l !== 'object' || l === null) return null
  const id = (l as Record<string, unknown>).id
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null
}

const extraDe = (f: FilaCatalogoMin | undefined): Record<string, unknown> =>
  f && typeof f.extra === 'object' && f.extra !== null ? (f.extra as Record<string, unknown>) : {}

export function evaluarRamoVivo(
  filas: readonly FilaCatalogoMin[] | null | undefined,
  ramo: string | null,
  ahora: Date = new Date(),
): VeredictoCatalogo {
  if (!ramo) return { accion: 'seguir', aviso: 'catálogo: el cuerpo no declara el ramo (insuranceLine.id); no se comprueba' }
  if (!filas || filas.length === 0) {
    return { accion: 'seguir', aviso: 'catálogo: no hay instantánea guardada; no se comprueba el ramo antes de pagar' }
  }
  const productos = filas.filter((f) => f.tipo === 'producto' && f.ramo === ramo)
  const llamada = filas.find((f) => f.tipo === 'llamada' && f.ramo === ramo && extraDe(f).clave === 'productos')
  const x = extraDe(llamada)
  const vacioProbado = productos.length === 0 && x.estado === 'ok' && x.elementos === 0
  const todosMuertos = productos.length > 0 && productos.every((p) => !esProductoVivo(p.producto_nombre))
  if (vacioProbado || todosMuertos) {
    return {
      accion: 'cortar',
      mensaje:
        `El ramo ${ramo} no tiene ningún producto vivo en el catálogo de Avant2 (${
          vacioProbado ? 'sin productos' : 'todos PILOTO'
        }), así que cotizar no daría precios. No se ha llamado ni cobrado nada. Revisa el panel de Avant2 o refresca ` +
        'el catálogo si crees que ha cambiado.',
    }
  }
  const f = filas.map((r) => (r.fecha ? new Date(r.fecha) : null)).find((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
  if (f && ahora.getTime() - f.getTime() > DIAS_INSTANTANEA_VIEJA * 86_400_000) {
    return { accion: 'seguir', aviso: `catálogo: la instantánea tiene más de ${DIAS_INSTANTANEA_VIEJA} días` }
  }
  return { accion: 'seguir' }
}
