// Banda de avisos de «Mi mesa» (Alberto, 13/10/2026, decisión 3): lo administrativo vive en «Gestión»;
// en la mesa solo sale una línea cuando algo tiene PLAZO encima o es urgente. PURO (sin BD ni red,
// `node --test`): aquí se reduce cada cola a {n, plazo, urgentes}. La lectura vive en `avisos-mesa.ts`;
// el texto, el orden y el enlace de cada línea los pone plataforma (`lib/correduria/avisos.ts`).
//
// 🚨 Tres estados por cola: `ok` con n = 0 es «comprobado, no hay»; `error` es «no se ha podido
// comprobar» y la mesa lo DICE. Una cola que no se pudo leer nunca sale como vacía (fue así como un plazo
// de supresión RGPD estuvo corriendo sin que nadie lo viera).

import { DIAS_COMUNICACION_LCS, DIAS_EXTINCION, DIAS_SUSPENSION } from '@central/module-seguros'

export const COLAS_AVISO = [
  'partes',
  'supresiones',
  'quejas',
  'cambios_cuenta',
  'recibos_lcs',
  'aprobaciones',
  'bajas_pue',
  'anulaciones',
  'recibos_sin_confirmar',
  'correos_compania_sin_resolver',
  'proyectos_caducan',
] as const
export type ColaAviso = (typeof COLAS_AVISO)[number]

/** Días o menos hasta el plazo para que una línea sea URGENTE. */
export const DIAS_URGENTE = 7

export type LecturaCola =
  | {
      estado: 'ok'
      /** Cuántos hay que hacer. 0 = comprobado y no hay. */
      n: number
      /** El plazo MÁS CERCANO (aaaa-mm-dd). `null` = la cola no tiene plazo legal o ninguno consta. */
      plazo: string | null
      /** Cuántos vencen en ≤ {@link DIAS_URGENTE} días, ya vencidos, o urgentes por naturaleza. */
      urgentes: number
    }
  | { estado: 'error' }

export type Item = { plazo: string | null; urgente?: boolean }

const ISO = /^\d{4}-\d{2}-\d{2}$/

function valida(s: string | null | undefined): string | null {
  if (typeof s !== 'string' || !ISO.test(s.slice(0, 10))) return null
  const iso = s.slice(0, 10)
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasHasta(hoy: string, iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000)
}

/** Reduce una cola a {n, plazo más cercano, urgentes}. Un plazo ilegible no se inventa: cuenta en `n`. */
export function resumirCola(items: readonly Item[], hoy: string): LecturaCola {
  let plazo: string | null = null
  let urgentes = 0
  for (const i of items) {
    const p = valida(i.plazo)
    if (p && (plazo === null || p < plazo)) plazo = p
    if (i.urgente || (p !== null && diasHasta(hoy, p) <= DIAS_URGENTE)) urgentes++
  }
  return { estado: 'ok', n: items.length, plazo, urgentes }
}

/** Plazo de un parte del portal: los 7 días del art. 16 LCS desde el hecho. Siempre urgente: hay un siniestro esperando. */
export function itemParte(fechaHecho: string | null): Item {
  const f = valida(fechaHecho)
  return { plazo: f ? sumarDias(f, DIAS_COMUNICACION_LCS) : null, urgente: true }
}

// ── Recibos (art. 15 LCS) ───────────────────────────────────────────────────

export type ReciboEnRiesgo = {
  polizaId: string
  /** `EstadoRetencion` de `retencion()`: en_plazo · suspendida · extinguida · sin_fecha · sin_confirmar… */
  estado: string
  /** Efecto del recibo (de aquí corre el art. 15). `null` = no consta. */
  fechaRecibo: string | null
  /** Días desde el efecto. `null` = no consta. */
  dias: number | null
}

/**
 * Recibos DEVUELTOS con el reloj del art. 15 corriendo (en plazo → la suspensión a los 30 días;
 * suspendida → la extinción a los 6 meses; sin fecha → no se sabe, y por eso urgente) cuya póliza NO tiene
 * un rescate VISIBLE en la mesa: sin rescate, o con el rescate aparcado o perdido. Extinguidos fuera:
 * ya no hay reloj. Los `sin_confirmar` no entran aquí (nadie ha dicho que se devolviera).
 */
export function recibosConRelojSinRescate(filas: readonly ReciboEnRiesgo[], conRescateVisible: ReadonlySet<string>): Item[] {
  const out: Item[] = []
  const vistos = new Set<string>()
  for (const f of filas) {
    if (conRescateVisible.has(f.polizaId) || vistos.has(f.polizaId)) continue
    const efecto = valida(f.fechaRecibo)
    if (f.estado === 'en_plazo') out.push({ plazo: efecto ? sumarDias(efecto, DIAS_SUSPENSION) : null, urgente: !efecto })
    else if (f.estado === 'suspendida') out.push({ plazo: efecto ? sumarDias(efecto, DIAS_EXTINCION) : null, urgente: true })
    else if (f.estado === 'sin_fecha') out.push({ plazo: null, urgente: true })
    else continue
    vistos.add(f.polizaId)
  }
  return out
}

/**
 * Recibos VENCIDOS hace un mes o más que no constan cobrados y nadie ha dicho que se devolvieran
 * (`sin_confirmar`): se miran en el portal de la compañía ANTES de llamar. Sin plazo propio y no urgentes.
 */
export function recibosSinConfirmar(filas: readonly ReciboEnRiesgo[]): Item[] {
  return filas.filter((f) => f.estado === 'sin_confirmar' && f.dias !== null && f.dias >= DIAS_SUSPENSION).map(() => ({ plazo: null }))
}
