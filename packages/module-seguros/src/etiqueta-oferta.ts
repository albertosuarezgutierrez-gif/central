// Cómo se NOMBRA cada oferta de una comparativa (21/10/2026). PURO.
//
// Tres precios de Avant2 de la misma compañía salían como «Allianz», «Allianz», «Allianz» en las cabeceras del cuadro
// y como «Allianz (Allianz Hogar 2053)» tres veces en la plantilla del resumen. La etiqueta es la compañía y, solo si
// hace falta para distinguirla, su NIVEL; si aun así coinciden, el producto; y en último caso «opción n». El producto
// que solo repite el nombre de la compañía («Allianz Hogar 2053» de Allianz) no se añade cuando ya es única.

import type { OfertaNormalizada } from './comparar-ofertas.ts'

const norm = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** El producto SIN la compañía delante («Allianz Hogar 2053» de Allianz → «Hogar 2053»). `null` si no queda nada. */
function productoPropio(compania: string, producto: string | null | undefined): string | null {
  const p = (producto ?? '').trim()
  if (!p) return null
  const c = compania.trim()
  if (c && norm(p).startsWith(norm(c))) {
    const resto = p.slice(c.length).replace(/^[\s·:,-]+/, '').trim()
    return resto || null
  }
  return p
}

type Nombrable = Pick<OfertaNormalizada, 'id' | 'compania' | 'producto'> & { nivel?: string | null }

/**
 * La etiqueta de cada oferta (por `id`), única dentro de la comparativa siempre que se pueda:
 *   1. compañía (+ «· producto» si es única y el producto dice algo más que la compañía, como hasta ahora);
 *   2. compañía repetida → «Compañía · Nivel»;
 *   3. aún repetida → «Compañía · Nivel · Producto»;
 *   4. aún repetida → se numera «(opción n)», en el orden de entrada.
 */
export function etiquetasOfertas(ofertas: readonly Nombrable[]): Map<string, string> {
  const compania = (o: Nombrable) => o.compania.trim() || 'Compañía sin identificar'
  const nivel = (o: Nombrable) => (o.nivel ?? '').trim() || null
  const cuenta = (claves: string[]) => { const m = new Map<string, number>(); for (const k of claves) m.set(k, (m.get(k) ?? 0) + 1); return m }
  const porCompania = cuenta(ofertas.map((o) => norm(compania(o))))
  const etiqueta = new Map<string, string>()
  for (const o of ofertas) {
    const c = compania(o)
    const prod = productoPropio(c, o.producto)
    if ((porCompania.get(norm(c)) ?? 0) <= 1) etiqueta.set(o.id, prod ? `${c} · ${prod}` : c)
    else etiqueta.set(o.id, [c, nivel(o) ?? prod].filter(Boolean).join(' · '))
  }
  // Aún repetidas: se añade el producto (si no estaba ya) y, si no basta, se numeran.
  let rep = cuenta(ofertas.map((o) => norm(etiqueta.get(o.id))))
  for (const o of ofertas) {
    if ((rep.get(norm(etiqueta.get(o.id))) ?? 0) <= 1) continue
    const prod = productoPropio(compania(o), o.producto)
    const actual = etiqueta.get(o.id)!
    if (prod && !norm(actual).includes(norm(prod))) etiqueta.set(o.id, `${actual} · ${prod}`)
  }
  rep = cuenta(ofertas.map((o) => norm(etiqueta.get(o.id))))
  const vistas = new Map<string, number>()
  for (const o of ofertas) {
    const k = norm(etiqueta.get(o.id))
    if ((rep.get(k) ?? 0) <= 1) continue
    const n = (vistas.get(k) ?? 0) + 1
    vistas.set(k, n)
    etiqueta.set(o.id, `${etiqueta.get(o.id)} (opción ${n})`)
  }
  return etiqueta
}

/**
 * «6 opciones de 2 compañías» (y «y tu póliza actual» si la hay). Una opción por compañía: «3 compañías». Cuenta
 * compañías DISTINTAS, no ofertas. PURO.
 */
export function textoOpcionesComparadas(ofertas: readonly Pick<OfertaNormalizada, 'rol' | 'compania'>[]): string {
  const candidatas = ofertas.filter((o) => o.rol !== 'actual')
  const hayActual = ofertas.some((o) => o.rol === 'actual')
  const n = candidatas.length
  const m = new Set(candidatas.map((o) => norm(o.compania) || '?')).size
  const companias = `${m} ${m === 1 ? 'compañía' : 'compañías'}`
  const base = n === m ? companias : `${n} ${n === 1 ? 'opción' : 'opciones'} de ${companias}`
  return `${base}${hayActual ? ' y tu póliza actual' : ''}`
}
