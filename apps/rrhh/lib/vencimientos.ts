// Regla PURA de los contratos que VENCEN (Inicio del responsable en `/admin`). Sin BD ni reloj: `hoy` se inyecta (fecha ISO
// en hora de Madrid). Lista de los que terminan en ≤ 30 días.
// 🚨 Va al RESPONSABLE, NUNCA al trabajador (07/11/2026): un aviso automático de fin de contrato al empleado podía
// leerse como el preaviso del art. 49.1.c ET. Comunicar la finalización o la renovación es una decisión de la empresa.
// 🚨 `fecha_fin` NULL = «no se sabe» (contrato anterior a 0033 o sin rellenar), NO «indefinido»: solo es indefinido con
// `duracion = 'indefinido'` explícita. Ninguno de los dos entra en la lista, pero se distinguen en pantalla.

export const DIAS_VENCIMIENTO = 30

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

/** dd/mm/aaaa */
export function fechaEs(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export interface ContratoVencible {
  contratoId: string
  empleadoId: string
  empleado: string
  fechaFin: string | null
}

/**
 * Contratos que terminan entre hoy y `dias` (incluidos), del más próximo al más lejano. `fecha_fin` NULL = «no se sabe»:
 * no entra (no se afirma que venza ni que no). Ya pasados: fuera (no es «vence pronto»).
 */
export function contratosQueVencen(contratos: ContratoVencible[], hoy: string, dias: number = DIAS_VENCIMIENTO) {
  const out: (ContratoVencible & { fechaFin: string; dias: number })[] = []
  for (const c of contratos) {
    if (!c.fechaFin) continue
    const d = diasEntreFechas(hoy, c.fechaFin)
    if (d < 0 || d > dias) continue
    out.push({ ...c, fechaFin: c.fechaFin, dias: d })
  }
  return out.sort((a, b) => a.dias - b.dias || a.empleado.localeCompare(b.empleado, 'es'))
}

/** Línea para el responsable: «Ana Núñez — 01/12/2026 (dentro de 24 días)». */
export function lineaVencimiento(c: { empleado: string; fechaFin: string; dias: number }): string {
  const cuando = c.dias === 0 ? 'hoy' : c.dias === 1 ? 'mañana' : `dentro de ${c.dias} días`
  return `${c.empleado || 'Empleado sin nombre'} — ${fechaEs(c.fechaFin)} (${cuando})`
}
