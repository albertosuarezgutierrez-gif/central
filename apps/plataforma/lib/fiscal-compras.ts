// «Compras previstas» del panel fiscal: validación PURA del cuerpo de la API (sin BD; con test).
// Tipo null = sin clasificar → el motor no la cuenta (nunca se clasifica en silencio).
import type { TipoCompra } from './simulador-irpf.ts'

/** Tipos que Alberto puede elegir en la pantalla (el motor admite además `consumible`). */
export const TIPOS_COMPRA_UI: { id: TipoCompra; etiqueta: string }[] = [
  { id: 'reparacion', etiqueta: 'Reparación' },
  { id: 'escaso_valor', etiqueta: 'Menos de 300€' },
  { id: 'mobiliario', etiqueta: 'Mobiliario' },
  { id: 'mejora', etiqueta: 'Mejora' },
]
const TIPOS_VALIDOS: string[] = ['reparacion', 'consumible', 'escaso_valor', 'mobiliario', 'mejora']

export type CompraEntrada = { descripcion: string; importe: number; propertyId: string; tipo: TipoCompra | null; fechaPrevista: string | null }

export function normalizarCompra(body: unknown): { ok: true; valor: CompraEntrada } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  // «1.200,50» (es-ES) → 1200.5 ; «1200.5» se respeta.
  const crudo = String(b.importe ?? '').trim()
  const importe = typeof b.importe === 'number' ? b.importe : Number(crudo.includes(',') ? crudo.replace(/\./g, '').replace(',', '.') : crudo)
  if (!Number.isFinite(importe) || importe <= 0 || importe > 10_000_000) return { ok: false, error: 'Importe inválido' }
  const propertyId = String(b.propertyId ?? '')
  if (!/^prop_[a-z0-9_]+$/.test(propertyId)) return { ok: false, error: 'Piso inválido' }
  const t = b.tipo == null || b.tipo === '' ? null : String(b.tipo)
  if (t != null && !TIPOS_VALIDOS.includes(t)) return { ok: false, error: 'Tipo inválido' }
  const f = b.fechaPrevista == null || b.fechaPrevista === '' ? null : String(b.fechaPrevista)
  if (f != null && (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(f)))) return { ok: false, error: 'Fecha inválida' }
  return { ok: true, valor: { descripcion: String(b.descripcion ?? '').trim().slice(0, 200), importe: Math.round(importe * 100) / 100, propertyId, tipo: t as TipoCompra | null, fechaPrevista: f } }
}
