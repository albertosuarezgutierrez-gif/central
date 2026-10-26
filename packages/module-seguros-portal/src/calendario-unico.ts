// EL CALENDARIO ÚNICO del portal (26/10/2026, Alberto): hasta hoy había TRES «calendarios» —la pestaña «Recordatorios»
// de la bóveda, la tarjeta «Calendario» de Inicio y `/patrimonio/calendario`— más la campana «Avisos». Ahora es UNA
// vista (Herramientas → Calendario) que junta vencimientos de seguros, recibos, avisos con fecha, las fechas del
// patrimonio y los recordatorios propios.
//
// Este fichero es la COMPOSICIÓN pura (sin BD, sin reloj: `hoy` entra). La lectura de cada fuente vive en la app.
//
// 🚨 Regla de los tres estados (CLAUDE.md raíz: «dato que NO hay ≠ dato que NO se ha mirado»): cada fuente llega como
// lista (`[]` = se miró y no hay) o como `null` (NO se ha podido comprobar). Una fuente `null` NO se convierte en «nada»:
// se declara en `sinComprobar` y el calendario NO se da por vacío aunque el resto esté vacío (`vacio`).
// Una fecha que no es una fecha NO se pinta como «al día»: la entrada pasa a «sin fecha».

/** La ruta del calendario único. Las viejas (`/boveda?vista=recordatorios`, `/patrimonio/calendario`) redirigen aquí. */
export const RUTA_CALENDARIO = '/herramientas/calendario' as const

export const ORIGENES_CALENDARIO = ['seguro', 'recibo', 'patrimonio', 'recordatorio', 'aviso'] as const
export type OrigenCalendario = (typeof ORIGENES_CALENDARIO)[number]

/** Cuántas filas se pintan de golpe antes del «Ver más» (regla de rendimiento de la casa). */
export const TOPE_VER_MAS_CALENDARIO = 50

export type EntradaCalendarioCruda = {
  /** Estable entre cargas (es la `key` de la fila). */
  clave: string
  titulo: string
  detalle?: string | null
  /** `YYYY-MM-DD`, o `null` = no sabemos cuándo. */
  fecha: string | null
  /** A dónde lleva: la pantalla donde se resuelve. */
  href: string
  /** Pide hacer algo ya (p. ej. un recibo devuelto): se marca, además del color, con texto. */
  urgente?: boolean
}

/** `null` = NO se ha podido comprobar (≠ `[]`, que es «se miró y no hay»). */
export type FuenteCalendario = readonly EntradaCalendarioCruda[] | null

export type EntradaCalendario = EntradaCalendarioCruda & {
  origen: OrigenCalendario
  /** Días hasta la fecha (negativo = pasada); `null` si no hay fecha válida. */
  dias: number | null
  tramo: 'vencida' | 'hoy' | 'proxima' | 'despues' | 'sin_fecha'
}

export type CalendarioCompuesto = {
  /** Lo que tiene (o no) fecha, ordenado: por fecha ascendente y lo que no se sabe al final. Sin los avisos. */
  entradas: EntradaCalendario[]
  /** Los avisos con fecha o sin ella, en el orden en que llegan (ya vienen priorizados). */
  avisos: EntradaCalendario[]
  /** Las fuentes que NO se han podido comprobar. */
  sinComprobar: OrigenCalendario[]
  /** `true` SOLO si todas las fuentes se leyeron y no hay nada. */
  vacio: boolean
}

const MS_DIA = 86_400_000
const DIA = /^\d{4}-\d{2}-\d{2}$/

function epochDia(iso: string): number | null {
  if (!DIA.test(iso)) return null
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  // `2026-02-31` se normaliza a marzo en Date.parse: no es una fecha, y no se acepta.
  return new Date(t).toISOString().slice(0, 10) === iso ? t : null
}

/** Días que faltan desde `hoy` hasta `fecha`; negativo si ya pasó; `null` si alguna no es una fecha. */
export function diasHastaDia(fecha: string | null, hoy: string): number | null {
  if (fecha === null) return null
  const a = epochDia(fecha)
  const b = epochDia(hoy)
  if (a === null || b === null) return null
  return Math.round((a - b) / MS_DIA)
}

function tramoDe(dias: number | null): EntradaCalendario['tramo'] {
  if (dias === null) return 'sin_fecha'
  if (dias < 0) return 'vencida'
  if (dias === 0) return 'hoy'
  return dias <= 30 ? 'proxima' : 'despues'
}

function completar(origen: OrigenCalendario, e: EntradaCalendarioCruda, hoy: string): EntradaCalendario {
  const dias = diasHastaDia(e.fecha, hoy)
  // Una fecha ilegible se vuelve «sin fecha»: nunca se queda con una fecha falsa ni como «al día».
  return { ...e, fecha: dias === null ? null : e.fecha, origen, dias, tramo: tramoDe(dias) }
}

/**
 * Los avisos de la campana que son una FECHA (los demás —autorizaciones, firmas, felicitaciones…— no son calendario).
 * Los lee la misma `GET /api/avisos` que la campana: el calendario no tiene una segunda lista de avisos.
 */
export const TIPOS_AVISO_CON_FECHA = [
  'obligacion_en_ventana',
  'carnet_en_ventana',
  'carnet_caducado',
  'itv_en_ventana',
  'patrimonio_en_ventana',
] as const

/** Las fuentes de la campana de las que salen esos avisos: si una falla, los avisos de fecha están INCOMPLETOS. */
export const FUENTES_AVISO_CON_FECHA = ['obligaciones', 'carnets', 'vehiculos', 'patrimonio'] as const

/** ¿Los avisos de fecha de la campana están incompletos porque alguna de sus fuentes no se leyó? */
export function avisosDeFechaIncompletos(fuentesIlegibles: readonly string[]): boolean {
  return fuentesIlegibles.some((f) => (FUENTES_AVISO_CON_FECHA as readonly string[]).includes(f))
}

export function componerCalendario(entrada: {
  hoy: string
  fuentes: Record<OrigenCalendario, FuenteCalendario>
  /** Fuentes que SÍ trajeron datos pero a medias (p. ej. a la campana le falló una fuente): se declaran igual. */
  incompletas?: readonly OrigenCalendario[]
}): CalendarioCompuesto {
  const { hoy, fuentes } = entrada
  const sinComprobar: OrigenCalendario[] = []
  const entradas: EntradaCalendario[] = []
  let avisos: EntradaCalendario[] = []
  for (const origen of ORIGENES_CALENDARIO) {
    const f = fuentes[origen]
    if (f === null) {
      sinComprobar.push(origen)
      continue
    }
    if (entrada.incompletas?.includes(origen)) sinComprobar.push(origen)
    const hechas = f.map((e) => completar(origen, e, hoy))
    if (origen === 'aviso') avisos = hechas
    else entradas.push(...hechas)
  }
  entradas.sort((a, b) => {
    if (a.dias === null && b.dias === null) return a.titulo.localeCompare(b.titulo, 'es')
    if (a.dias === null) return 1
    if (b.dias === null) return -1
    return a.dias - b.dias || a.titulo.localeCompare(b.titulo, 'es')
  })
  return { entradas, avisos, sinComprobar, vacio: sinComprobar.length === 0 && entradas.length === 0 && avisos.length === 0 }
}
