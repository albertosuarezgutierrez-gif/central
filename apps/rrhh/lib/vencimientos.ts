// Regla PURA de los avisos de vencimiento de contrato (cron diario `/api/cron/vencimiento-contratos`). Sin BD ni reloj:
// `hoy` se inyecta (fecha ISO en hora de Madrid). Avisos a 30 y 15 días de `fecha_fin`.
// 🚨 `fecha_fin` NULL = «no se sabe» (contrato anterior a 0033 o sin rellenar), NO «indefinido»: solo es indefinido con
// `duracion = 'indefinido'` explícita. Ninguno de los dos genera aviso, pero se distinguen en pantalla.

export const UMBRALES_DIAS = [30, 15] as const
export type Umbral = (typeof UMBRALES_DIAS)[number]

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function aUtc(iso: string): number {
  if (!FECHA.test(iso)) throw new Error(`Fecha inválida: ${iso}`)
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(t)) throw new Error(`Fecha inválida: ${iso}`)
  return t
}

/** Días naturales de `desde` a `hasta` (negativo si ya pasó). */
export function diasEntreFechas(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000)
}

/** Fecha de hoy (YYYY-MM-DD) en Madrid, para el adaptador; la regla recibe `hoy` ya resuelto. */
export function hoyMadrid(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

export type EstadoFin =
  | { tipo: 'indefinido' }
  | { tipo: 'no_se_sabe' }
  | { tipo: 'fecha'; fechaFin: string; dias: number }

export function estadoFinContrato(c: { duracion: string | null; fechaFin: string | null }, hoy: string): EstadoFin {
  if (c.fechaFin) return { tipo: 'fecha', fechaFin: c.fechaFin, dias: diasEntreFechas(hoy, c.fechaFin) }
  if (c.duracion === 'indefinido') return { tipo: 'indefinido' }
  return { tipo: 'no_se_sabe' }
}

/**
 * Umbral que toca avisar hoy: el MÁS PEQUEÑO que ya se ha alcanzado (≤ 15 → 15; ≤ 30 → 30). Fin ya pasado → null.
 * Si el cron no corrió el día exacto (o el contrato se dio de alta con 20 días), avisa al primer pase: la idempotencia
 * por (contrato, fecha_fin, umbral) evita repetir.
 */
export function umbralQueToca(hoy: string, fechaFin: string | null): Umbral | null {
  if (!fechaFin) return null
  const d = diasEntreFechas(hoy, fechaFin)
  if (d < 0) return null
  const alcanzados = UMBRALES_DIAS.filter(u => d <= u)
  return alcanzados.length ? (Math.min(...alcanzados) as Umbral) : null
}

/** Clave de idempotencia en `rrhh.avisos.clave_idempotencia`: si se prorroga (cambia la fecha), vuelve a avisar. */
export function claveAvisoVencimiento(contratoId: string, fechaFin: string, umbral: Umbral): string {
  return `vencimiento:${contratoId}:${fechaFin}:${umbral}`
}

/** dd/mm/aaaa */
export function fechaEs(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Texto neutro (la empresa decide si renueva): solo informa de la fecha que consta en el contrato. */
export function textoAvisoVencimiento(p: { fechaFin: string; dias: number }): { titulo: string; cuerpo: string } {
  const cuando = p.dias === 0 ? 'hoy' : p.dias === 1 ? 'mañana' : `dentro de ${p.dias} días`
  return {
    titulo: `Tu contrato tiene fecha de fin el ${fechaEs(p.fechaFin)}`,
    cuerpo: `Según tu contrato, la fecha de fin es el ${fechaEs(p.fechaFin)} (${cuando}). La empresa te informará de su renovación o finalización.`,
  }
}

export interface ContratoVencible {
  contratoId: string
  empresaId: string
  empleadoId: string
  fechaFin: string | null
}

/** Qué avisos generar hoy (puro). */
export function avisosDeHoy(contratos: ContratoVencible[], hoy: string) {
  const out: { contratoId: string; empresaId: string; empleadoId: string; fechaFin: string; umbral: Umbral; dias: number; clave: string }[] = []
  for (const c of contratos) {
    const u = umbralQueToca(hoy, c.fechaFin)
    if (u === null || !c.fechaFin) continue
    out.push({ ...c, fechaFin: c.fechaFin, umbral: u, dias: diasEntreFechas(hoy, c.fechaFin), clave: claveAvisoVencimiento(c.contratoId, c.fechaFin, u) })
  }
  return out
}
