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

/**
 * `formattedOptions` de la cotización. `null` = el vendor no las manda (no «sin opciones»).
 * 🚨 El spec las pone en `product.formattedOptions` (referencia 2026-09, fila 7): leer solo
 * `quote.formattedOptions` dio `no_manda` en los 249 precios reales (28/09/2026). Se miran los dos.
 */
export function leerOpcionesLegibles(quote: unknown): OpcionLegible[] | null {
  const q = obj(quote)
  const producto = obj(q.product)
  const fuente = Array.isArray(q.formattedOptions)
    ? q.formattedOptions
    : Array.isArray(producto.formattedOptions)
      ? producto.formattedOptions
      : null
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

/**
 * Sobre de `tarificacion_precios.opciones` (28/09/2026). `null` de la cotización = el vendor no
 * mandó `formattedOptions` → `no_manda`, nunca `leidas` con `[]` (eso diría «sin opciones»).
 */
export type SobreOpciones = {
  estado: 'leidas' | 'no_manda' | 'sin_precio' | 'fallo'
  lista: OpcionLegible[] | null
  leidasAt: string
}

export function sobreOpciones(opciones: OpcionLegible[] | null, leidasAt: string): SobreOpciones {
  return opciones === null
    ? { estado: 'no_manda', lista: null, leidasAt }
    : { estado: 'leidas', lista: opciones, leidasAt }
}
