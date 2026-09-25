// Coberturas y opciones legibles de una cotización/oferta de Codeoscopic.
// Fuente: spec de producción (25/09/2026, ver docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md).
//
// - Las OPCIONES del producto vienen ya en cada cotización (`formattedOptions`:
//   `{ label, formattedValue }`): se enseñan sin ninguna llamada extra.
// - Las COBERTURAS salen de `GET /insurances/{id}/offers/{offerId}/coverages`
//   (esquema `InsuranceCoverage_V1`: `id`, `name`, `included?`, `text?`). Es una
//   lista común por ramo para poder comparar ofertas. **No trae capital en
//   número**: si lo hay, va dentro de `text`.
//
// 🚨 Tres estados, no dos: `included` ausente NO es «no incluida». El spec dice
// que entonces hay que leer `text`. Aquí queda como `null` y la pantalla lo pinta
// como «ver detalle», nunca como ✗.

export type OpcionLegible = { etiqueta: string; valor: string }
export type Cobertura = { nombre: string; incluida: boolean | null; texto: string | null }

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const txt = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : null

/** `formattedOptions` de la cotización. `null` = el vendor no las manda (no «sin opciones»). */
export function leerOpcionesLegibles(quote: unknown): OpcionLegible[] | null {
  const q = obj(quote)
  const fuente = Array.isArray(q.formattedOptions) ? q.formattedOptions : null
  if (fuente === null) return null
  const out: OpcionLegible[] = []
  for (const o of fuente) {
    const etiqueta = txt(obj(o).label)
    const valor = txt(obj(o).formattedValue)
    if (etiqueta && valor !== null) out.push({ etiqueta, valor })
  }
  return out
}

/** Respuesta de `/coverages` (array suelto o `{ items|coverages: [...] }`). */
export function leerCoberturas(raw: unknown): Cobertura[] {
  const lista = Array.isArray(raw)
    ? raw
    : Array.isArray(obj(raw).items)
      ? (obj(raw).items as unknown[])
      : Array.isArray(obj(raw).coverages)
        ? (obj(raw).coverages as unknown[])
        : []
  const out: Cobertura[] = []
  for (const c of lista) {
    const o = obj(c)
    const nombre = txt(o.name)
    if (!nombre) continue
    out.push({
      nombre,
      incluida: typeof o.included === 'boolean' ? o.included : null,
      texto: txt(o.text),
    })
  }
  return out
}
