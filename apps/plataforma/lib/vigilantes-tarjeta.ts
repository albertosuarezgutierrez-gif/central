// Detectores PUROS de los "vigilantes" de la tarjeta (Fase 2): solo avisan, nunca bloquean.
// Sin Prisma ni '@/': la parte de BD (histórico, justificantes) vive en lib/contable/extracto-tarjeta.ts.
// Testeable con `node --test`.

// Línea de coste financiero de la tarjeta (intereses por aplazar, comisiones, cuota de financiación).
// NO es una compra: liquidando la tarjeta en el mes se evita. Puro/testeable.
export function esCargoFinanciero(concepto: string | null | undefined): boolean {
  return /INTER[EÉ]S|INTERESES|COMISI[OÓ]N|APLAZAMIENTO|CUOTA\s+FINANC|RECARGO\s+FINANC/i.test(concepto || '')
}

export interface MovVig { id: string; comercio: string; importe: number }

// Agrupa cargos idénticos (mismo comercio + mismo importe absoluto) que aparecen ≥2 veces en el
// periodo → posible cobro doble del comercio. Devuelve solo los grupos con repetición.
export function dobleCobro(movs: MovVig[]): { comercio: string; importe: number; ids: string[] }[] {
  const g = new Map<string, { comercio: string; importe: number; ids: string[] }>()
  for (const m of movs) {
    const comercio = (m.comercio || '').trim()
    if (!comercio) continue
    const importe = Math.round(Math.abs(m.importe) * 100) / 100
    const clave = `${comercio.toLowerCase()}|${importe}`
    const e = g.get(clave) ?? { comercio, importe, ids: [] }
    e.ids.push(m.id)
    g.set(clave, e)
  }
  return [...g.values()].filter(e => e.ids.length >= 2)
}

// ¿El importe actual supera al previo en más de umbralPct %? (subida de precio de un cargo recurrente,
// p.ej. una suscripción que sube de 6,99€ a 9,99€). Requiere ambos importes positivos (valor absoluto).
export function subioPrecio(actual: number, previo: number, umbralPct = 15): boolean {
  const a = Math.abs(actual), p = Math.abs(previo)
  if (!(p > 0) || !(a > 0)) return false
  return ((a - p) / p) * 100 > umbralPct
}
