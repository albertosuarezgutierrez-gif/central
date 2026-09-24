// Línea base semanal de la correduría (§N.2 de ASegura OS: «medir antes de automatizar»). PURO.
//
// Antes de soltar agentes hay que saber cuánto trabajo entra y cuánto se hace a mano cada semana;
// si no, «ahorra trabajo» no se puede comprobar. Cada serie se cuenta en la BD desde su fecha de
// creación (`created_at`), así que las semanas pasadas se reconstruyen solas sin guardar fotos.
//
// 🚨 La trampa es la de siempre: una semana de ANTES de que existiera la tabla que la mide no tiene
// «0», tiene «no se medía». Por eso cada serie lleva su `desde` y lo anterior sale `null`.

export type SerieLineaBase =
  | 'correos'
  | 'a_mano'
  | 'automaticas'
  | 'aprobaciones_pedidas'
  | 'aprobaciones_decididas'
  | 'documentos_recibidos'
  | 'documentos_revisados'
  | 'oportunidades_nuevas'

export type DefinicionSerie = {
  id: SerieLineaBase
  etiqueta: string
  /** `YYYY-MM-DD` (Madrid) desde el que existe lo que la mide. Antes: `null`, nunca 0. */
  desde: string
  /** Quién la cuenta: plataforma lee su propio correo; asegura, el schema de la cartera. */
  fuente: 'plataforma' | 'asegura'
}

export const SERIES_LINEA_BASE: readonly DefinicionSerie[] = [
  { id: 'correos', etiqueta: 'Correos de correduría recibidos', desde: '2026-07-03', fuente: 'plataforma' },
  { id: 'a_mano', etiqueta: 'Cambios hechos a mano', desde: '2026-09-23', fuente: 'asegura' },
  { id: 'automaticas', etiqueta: 'Cambios hechos por el sistema', desde: '2026-09-23', fuente: 'asegura' },
  { id: 'aprobaciones_pedidas', etiqueta: 'Aprobaciones pedidas', desde: '2026-09-23', fuente: 'asegura' },
  { id: 'aprobaciones_decididas', etiqueta: 'Aprobaciones decididas por ti', desde: '2026-09-23', fuente: 'asegura' },
  { id: 'documentos_recibidos', etiqueta: 'Documentos recibidos', desde: '2026-09-02', fuente: 'asegura' },
  { id: 'documentos_revisados', etiqueta: 'Documentos revisados', desde: '2026-09-02', fuente: 'asegura' },
  { id: 'oportunidades_nuevas', etiqueta: 'Oportunidades nuevas', desde: '2026-09-23', fuente: 'asegura' },
]

export const SEMANAS_LINEA_BASE = 8

export type CeldaSemana = {
  /** `null` = esa semana no se medía (o no se ha podido leer). */
  n: number | null
  /** La semana en curso o la del arranque de la medición: cuenta, pero no es una semana entera. */
  parcial: boolean
}

const DIA = 86_400_000

function fechaMadrid(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function sumarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10)
}

/** Lunes (Madrid) de la semana de `d`, como `YYYY-MM-DD`. Es la misma clave que `date_trunc('week', …)`. */
export function lunesMadrid(d: Date): string {
  const hoy = fechaMadrid(d)
  const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay() // 0 = domingo
  return sumarDias(hoy, -((dow + 6) % 7))
}

/** Los `n` lunes que acaban en la semana en curso, del más antiguo al más reciente. */
export function semanasLineaBase(ahora: Date, n = SEMANAS_LINEA_BASE): string[] {
  const ultimo = lunesMadrid(ahora)
  return Array.from({ length: n }, (_, i) => sumarDias(ultimo, -7 * (n - 1 - i)))
}

/**
 * Las celdas de una serie. `conteos` trae solo las semanas con filas (lo que devuelve un GROUP BY):
 * una semana medida y sin filas es 0; una anterior a `desde` es `null`. `conteos === null` (no se ha
 * podido leer) deja TODA la serie a `null`: un fallo no se pinta como una semana tranquila.
 */
export function celdasSerie(
  conteos: Readonly<Record<string, number>> | null,
  semanas: readonly string[],
  desde: string,
  ahora: Date,
): CeldaSemana[] {
  const enCurso = lunesMadrid(ahora)
  return semanas.map((s) => {
    const fin = sumarDias(s, 7)
    const arranque = s <= desde && desde < fin
    const parcial = arranque || s === enCurso
    if (conteos === null) return { n: null, parcial }
    const n = conteos[s]
    // Si hay filas es que se medía, diga lo que diga `desde`.
    if (typeof n === 'number' && n > 0) return { n, parcial }
    if (fin <= desde) return { n: null, parcial: false }
    return { n: 0, parcial }
  })
}

/**
 * Qué parte de los cambios de la semana hizo el sistema sin una persona (0-1). `null` si falta
 * cualquiera de las dos cifras o no hubo cambios: «0 %» diría que todo se hizo a mano.
 */
export function proporcionAutomatica(auto: CeldaSemana, mano: CeldaSemana): number | null {
  if (auto.n === null || mano.n === null) return null
  const total = auto.n + mano.n
  return total === 0 ? null : auto.n / total
}
