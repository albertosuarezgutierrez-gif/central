// lib/sivra/facturas/numeracion.ts — configuración de la serie (FAIL-CLOSED) y plan de emisión. PURO.
//
// Lo que decide aquí lo ejecuta `emitir.ts` dentro de una transacción con `SELECT … FOR UPDATE` sobre la serie, así
// que dos ✅ a la vez se serializan: el segundo ve la factura ya emitida y devuelve `ya_emitida` (idempotencia).
// La BD tiene además el índice único (serie_id, numero) y el trigger de correlatividad.

import { desglosarDesdeTotal, tipoIvaValido, type Importes } from './importes.ts'

export type SerieConfig = {
  id: string
  prefijo: string
  anio: number
  siguienteNumero: number | null
  tipoIva: number | null
  mencionIva: string | null
  activa: boolean
}

export type Falta = 'serie' | 'numero' | 'iva' | 'mencion'

export type EstadoSerie =
  | { ok: true; serie: SerieConfig & { siguienteNumero: number; tipoIva: number } }
  | { ok: false; faltan: Falta[]; motivo: string }

const TEXTO_FALTA: Record<Falta, string> = {
  serie: 'no hay serie activa',
  numero: 'falta el número inicial de la serie',
  iva: 'falta el tipo de IVA',
  mencion: 'con IVA 0 falta la mención legal de exención',
}

/**
 * ¿Se puede emitir con esta serie en `anio`? NULL en número o IVA = «Alberto aún no lo ha dicho» → NO se emite.
 * Nunca se supone un valor por defecto.
 */
export function evaluarSerie(serie: SerieConfig | null, anio: number): EstadoSerie {
  const faltan: Falta[] = []
  if (!serie || !serie.activa || serie.anio !== anio) {
    return { ok: false, faltan: ['serie'], motivo: `falta configurar IVA/serie: ${TEXTO_FALTA.serie} para ${anio}` }
  }
  if (serie.siguienteNumero === null || !Number.isSafeInteger(serie.siguienteNumero) || serie.siguienteNumero < 1) faltan.push('numero')
  if (serie.tipoIva === null || !tipoIvaValido(serie.tipoIva)) faltan.push('iva')
  else if (serie.tipoIva === 0 && (serie.mencionIva ?? '').trim().length < 10) faltan.push('mencion')
  if (faltan.length) return { ok: false, faltan, motivo: `falta configurar IVA/serie: ${faltan.map((f) => TEXTO_FALTA[f]).join(', ')} (serie ${[serie.prefijo, anio].filter(Boolean).join(' ')})` }
  return { ok: true, serie: serie as SerieConfig & { siguienteNumero: number; tipoIva: number } }
}

/** «2026-046» (formato de Smoobu, sin prefijo) o «HS-2026-046» con prefijo. Ancho mínimo 3; si se pasa de 999 crece sin cortar. */
export function formatearNumero(prefijo: string, anio: number, numero: number): string {
  const cuerpo = `${anio}-${String(numero).padStart(3, '0')}`
  return prefijo ? `${prefijo}-${cuerpo}` : cuerpo
}

export type FacturaParaEmitir = { estado: string; numeroCompleto: string | null; total: number }

export type PlanEmision =
  | { accion: 'ya_emitida'; numeroCompleto: string | null; estado: string }
  | { accion: 'bloqueada'; motivo: string }
  | { accion: 'emitir'; numero: number; numeroCompleto: string; siguiente: number; importes: Importes; serieId: string; prefijo: string; anio: number; mencionIva: string | null }

/** Qué hacer al pulsar ✅. Idempotente: una factura que ya no es borrador NO se vuelve a numerar. */
export function planEmision(f: FacturaParaEmitir, estadoSerie: EstadoSerie): PlanEmision {
  if (f.estado !== 'borrador') return { accion: 'ya_emitida', numeroCompleto: f.numeroCompleto, estado: f.estado }
  if (!estadoSerie.ok) return { accion: 'bloqueada', motivo: estadoSerie.motivo }
  let importes: Importes
  try {
    importes = desglosarDesdeTotal(f.total, estadoSerie.serie.tipoIva)
  } catch (e) {
    return { accion: 'bloqueada', motivo: `importe no válido: ${e instanceof Error ? e.message : 'desconocido'}` }
  }
  const s = estadoSerie.serie
  return {
    accion: 'emitir',
    numero: s.siguienteNumero,
    numeroCompleto: formatearNumero(s.prefijo, s.anio, s.siguienteNumero),
    siguiente: s.siguienteNumero + 1,
    importes,
    serieId: s.id,
    prefijo: s.prefijo,
    anio: s.anio,
    mencionIva: s.tipoIva === 0 ? (s.mencionIva ?? '').trim() : null,
  }
}

/** Año natural en Madrid (la fecha de expedición es la de España, no la UTC del servidor). */
export function fechaMadrid(d: Date): { anio: number; iso: string } {
  const iso = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) // YYYY-MM-DD
  return { anio: Number(iso.slice(0, 4)), iso }
}
