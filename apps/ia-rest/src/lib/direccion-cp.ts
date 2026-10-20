// Lógica PURA del buscador de dirección con CP primero (20/10/2026). Sin red, sin React: la usan los endpoints públicos
// `/api/direccion/*` (límite por IP + caché acotada) y el componente `DireccionCp` (composición y validez).

/** IP del cliente (primera de x-forwarded-for). `desconocida` agrupa a todos los que no la traen: límite más estricto de facto. */
export function ipDe(xff: string | null | undefined): string {
  return (xff ?? '').split(',')[0].trim() || 'desconocida'
}

/** Ventana fija por clave. `true` = deja pasar. El mapa se poda para no crecer sin límite. */
export function dejaPasar(
  mapa: Map<string, { n: number; hasta: number }>, clave: string, ahora: number, max: number, ventanaMs: number, maxClaves = 2000,
): boolean {
  const r = mapa.get(clave)
  if (!r || r.hasta <= ahora) {
    if (mapa.size >= maxClaves) {
      for (const [k, v] of mapa) if (v.hasta <= ahora) mapa.delete(k)
      if (mapa.size >= maxClaves) mapa.delete(mapa.keys().next().value as string)
    }
    mapa.set(clave, { n: 1, hasta: ahora + ventanaMs })
    return true
  }
  if (r.n >= max) return false
  r.n++
  return true
}

/** Caché con TTL y tamaño máximo (la entrada más antigua sale primero). */
export function crearCacheAcotada<T>(max: number, ttlMs: number) {
  const m = new Map<string, { hasta: number; v: T }>()
  return {
    get(k: string, ahora = Date.now()): T | undefined {
      const e = m.get(k)
      return e && e.hasta > ahora ? e.v : undefined
    },
    set(k: string, v: T, ahora = Date.now()) {
      if (m.size >= max && !m.has(k)) m.delete(m.keys().next().value as string)
      m.set(k, { hasta: ahora + ttlMs, v })
    },
    get size() { return m.size },
  }
}

export type PartesDireccion = { calle: string; cp: string; municipio: string }

/** «Calle Mayor 1, 41003 Sevilla». Sin CP y municipio válidos devuelve solo la calle (nunca inventa). */
export function componerDireccion({ calle, cp, municipio }: PartesDireccion): string {
  const c = calle.trim().replace(/\s+/g, ' ')
  const cola = [/^\d{5}$/.test(cp.trim()) ? cp.trim() : '', municipio.trim()].filter(Boolean).join(' ')
  if (!c) return ''
  return cola ? `${c}, ${cola}` : c
}

/** ¿Está la dirección completa para guardarla? Vacía solo vale si no es obligatoria. */
export function direccionValida({ calle, cp, municipio }: PartesDireccion, obligatoria: boolean): boolean {
  const vacia = !calle.trim() && !cp.trim() && !municipio.trim()
  if (vacia) return !obligatoria
  return calle.trim().length >= 3 && /^\d{5}$/.test(cp.trim()) && municipio.trim() !== ''
}

/** Criterio de pedido: la dirección completa solo es obligatoria en ENTREGA a domicilio; en recogida/sala ni se pide ni bloquea. */
export function direccionOkParaPedido(tipo: string, partes: PartesDireccion): boolean {
  return tipo !== 'delivery' || direccionValida(partes, true)
}

/** Dirección fuera de España: calle libre + país (sin CP español ni Catastro). Vacía si falta alguna parte. */
export function componerDireccionExtranjera(calle: string, pais: string): string {
  const c = calle.trim().replace(/\s+/g, ' ')
  const p = pais.trim()
  return c.length >= 3 && p.length >= 2 ? `${c}, ${p}` : ''
}

/** «dirección, ciudad» sin repetir la ciudad si la dirección ya la lleva (la dirección fiscal guardada incluye «CP Municipio»). */
export function direccionConCiudad(direccion: string | null | undefined, ciudad: string | null | undefined): string {
  const d = (direccion ?? '').trim()
  const c = (ciudad ?? '').trim()
  const plano = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (!c || plano(d).includes(plano(c))) return d
  return d ? `${d}, ${c}` : c
}

/** Provincias a probar contra el Catastro: la co-oficial y, si existe, la clásica. */
export function provinciasParaCatastro(provincia: string, alternativa: (p: string) => string | null): string[] {
  const alt = alternativa(provincia)
  return alt && alt.toUpperCase() !== provincia.toUpperCase() ? [provincia, alt] : [provincia]
}
