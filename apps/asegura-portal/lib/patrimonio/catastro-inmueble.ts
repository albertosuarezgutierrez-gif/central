// PATRIMONIO (25/10/2026) — caché del Catastro en el inmueble, reglas PURAS (sin red ni BD ni reloj: `ahora` entra).
// La superficie construida alimenta la ESTIMACIÓN del capital de continente mínimo (`estimarContinenteMinimo` de
// `@central/module-patrimonio`). Para no llamar al Catastro en cada pintado, lo que contesta se guarda en el inmueble
// (`catastro_*`, `prisma/sql/2026-10-25_portal_patrimonio_catastro_comunidad.sql`) y se reconsulta solo cuando caduca.
//
// 🚨 Tres estados, nunca colapsados: `ok` (contestó con superficie) · `sin_datos` (contestó y no hay) · `no_responde`
// (red/corte: NO es «no existe», se reintenta pronto). Sin superficie no hay estimación: `null`, jamás 0.
import { caracterizarVivienda, type DatosCatastro } from '@central/core-catastro'

export type EstadoCatastro = 'ok' | 'sin_datos' | 'no_responde'

export interface CacheCatastro {
  estado: EstadoCatastro
  superficieM2: number | null
  tipoVivienda: 'piso' | 'unifamiliar' | null
}

const DIA_MS = 24 * 60 * 60 * 1000
/** Cuánto vale lo que contestó el Catastro antes de volver a preguntar. */
export const VIGENCIA_DIAS: Readonly<Record<EstadoCatastro, number>> = { ok: 365, sin_datos: 30, no_responde: 1 }

/** Usos con continente propio que se estiman (el resto no llama al Catastro). */
const USOS_CON_ESTIMACION = ['vivienda', 'local', 'oficina', 'nave']

export function debeConsultarCatastro(x: {
  referenciaCatastral: string | null
  uso: string
  estado: string | null
  consultadoEn: Date | null
  ahora: Date
}): boolean {
  // Solo la referencia COMPLETA (20) da datos del bien; la de parcela (14) devuelve el listado del edificio.
  if (x.referenciaCatastral === null || !/^[0-9A-Z]{20}$/.test(x.referenciaCatastral)) return false
  if (!USOS_CON_ESTIMACION.includes(x.uso)) return false
  if (x.consultadoEn === null || !(x.estado === 'ok' || x.estado === 'sin_datos' || x.estado === 'no_responde')) return true
  return x.ahora.getTime() - x.consultadoEn.getTime() >= VIGENCIA_DIAS[x.estado] * DIA_MS
}

/** Lo que se guarda a partir de la respuesta del Catastro. `null` (no contestó) → `no_responde`. */
export function cacheDeCatastro(d: DatosCatastro | null): CacheCatastro {
  if (d === null) return { estado: 'no_responde', superficieM2: null, tipoVivienda: null }
  const sup = typeof d.superficie === 'number' && Number.isFinite(d.superficie) && d.superficie > 0 ? Math.round(d.superficie * 100) / 100 : null
  if (sup === null) return { estado: 'sin_datos', superficieM2: null, tipoVivienda: null }
  return { estado: 'ok', superficieM2: sup, tipoVivienda: caracterizarVivienda(d)?.tipo ?? null }
}
