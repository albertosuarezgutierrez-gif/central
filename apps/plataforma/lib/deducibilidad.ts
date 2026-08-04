// Deducibilidad fiscal por bucket, derivada del `destino` del movimiento. Módulo PURO
// (sin Prisma ni server-only): lo consume tanto el servidor (lib/finanzas.ts, lib/banca.ts)
// como el cliente (badge ✅/❌ en el libro de movimientos de /banca). Fuente ÚNICA: no
// duplicar este mapeo en otros sitios — si cambia la deducibilidad de un destino, cámbialo aquí.
export type GastoBucket = 'negocio' | 'renta' | 'no_deducible' | 'traspaso'

export const BUCKET_LABEL: Record<GastoBucket, string> = {
  negocio: '🏢 Actividad económica',
  renta: '🏖️ Renta / pisos',
  no_deducible: '👨‍👩‍👧 No deducible',
  traspaso: '🔁 Traspaso interno',
}

export const BUCKET_DEDUCIBLE: Record<GastoBucket, boolean> = {
  negocio: true, renta: true, no_deducible: false, traspaso: false,
}

export function bucketDeDestino(destino: string | null): GastoBucket {
  switch (destino) {
    case 'seguros': return 'negocio'
    case 'turistico_pisos':
    case 'turistico_duplex': return 'renta'
    case 'traspaso_interno': return 'traspaso'
    default: return 'no_deducible'   // personal / null / actividad_pilar (Pilar tiene su página)
  }
}

// Etiqueta de deducibilidad para un movimiento, pensada para el badge por fila del libro.
// Sólo tiene sentido en GASTOS (importe < 0): un ingreso (importe >= 0) devuelve `kind:'ingreso'`
// para que la UI NO pinte badge (deducible/no-deducible es un concepto de gasto). El traspaso
// interno no es gasto real → badge neutro 🔁.
export type DeducibleView =
  | { kind: 'ingreso' }
  | { kind: 'traspaso'; icon: string; label: string; color: string }
  | { kind: 'gasto'; deducible: boolean; icon: string; label: string; color: string }

export function deducibleDeMovimiento(destino: string | null, importe: number): DeducibleView {
  if (importe >= 0) return { kind: 'ingreso' }
  const bucket = bucketDeDestino(destino)
  if (bucket === 'traspaso') {
    return { kind: 'traspaso', icon: '🔁', label: 'Traspaso interno (no es gasto)', color: 'var(--muted)' }
  }
  const deducible = BUCKET_DEDUCIBLE[bucket]
  return deducible
    ? { kind: 'gasto', deducible: true, icon: '✅', label: `Deducible · ${BUCKET_LABEL[bucket]}`, color: 'var(--positive)' }
    : { kind: 'gasto', deducible: false, icon: '❌', label: 'No deducible', color: 'var(--negative)' }
}
