// Emparejado PURO de una devolución (abono en la tarjeta) con su compra original, para que
// ambas se anulen en el cómputo por destino (−35 +35 = 0) y una compra devuelta no siga contando
// como gasto deducible. Sin Prisma ni '@/': la parte de BD vive en lib/contable/extracto-tarjeta.ts.
// Testeable con `node --test`.

export interface CompraCandidata {
  id: string
  importe: number          // negativo (cargo)
  comercio: string         // ya normalizado por lib/comercio.ts::comercioDe
  fecha: string            // 'YYYY-MM-DD'
  destino: string | null
  propiedadId: string | null
}

export interface AbonoDevolucion {
  importe: number          // positivo (abono)
  comercio: string
  fecha: string            // 'YYYY-MM-DD'
}

// Normaliza un nombre de comercio para comparar (comercioDe ya limpia el prefijo "COMPRA EN…").
function norm(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Días entre dos fechas 'YYYY-MM-DD' (b − a). Positivo si b es posterior.
function diasEntre(a: string, b: string): number {
  const ma = Date.parse(`${a}T00:00:00Z`)
  const mb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ma) || !Number.isFinite(mb)) return NaN
  return Math.round((mb - ma) / 86_400_000)
}

// Busca la compra que corresponde a una devolución: mismo comercio, mismo importe (en valor
// absoluto), anterior a la devolución y dentro de la ventana, YA clasificada (tiene destino).
// Devuelve la clasificación a copiar, o null si no hay match fiable (→ dejar para revisión).
export function casarDevolucion(
  abono: AbonoDevolucion,
  compras: CompraCandidata[],
  ventanaDias = 120,
): { id: string; destino: string; propiedadId: string | null } | null {
  const comercioAbono = norm(abono.comercio)
  if (!comercioAbono) return null
  const candidatas = compras
    .filter(c => c.destino)                                             // sin destino no hay nada útil que copiar
    .filter(c => norm(c.comercio) === comercioAbono)                    // mismo comercio
    .filter(c => Math.abs(Math.abs(c.importe) - Math.abs(abono.importe)) < 0.005) // mismo importe
    .filter(c => {
      const d = diasEntre(c.fecha, abono.fecha)
      return Number.isFinite(d) && d >= 0 && d <= ventanaDias           // compra anterior, dentro de ventana
    })
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)) // la más reciente primero
  const m = candidatas[0]
  return m ? { id: m.id, destino: m.destino as string, propiedadId: m.propiedadId } : null
}
