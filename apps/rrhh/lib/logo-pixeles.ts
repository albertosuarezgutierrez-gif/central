// Análisis PURO de píxeles de un logo (RGBA 8 bits, sin sharp): recorte de márgenes uniformes y color dominante.
// Alta de marca de un cliente: subir logo → recorte + color automáticos (`lib/logo-empresa.ts` lo orquesta con sharp).

export type Bbox = { left: number; top: number; width: number; height: number }

/** Un píxel es «fondo» si es transparente o casi blanco (los márgenes de un logo pegado sobre blanco). */
function esFondo(d: Uint8Array | Uint8ClampedArray | Buffer, i: number): boolean {
  const a = d[i + 3]
  if (a < 16) return true
  return d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245
}

/**
 * Rectángulo mínimo con contenido (no transparente ni casi blanco), más `margen` px de respiro (acotado a la imagen).
 * `null` si TODA la imagen es fondo (logo vacío/blanco): no hay nada que recortar ni de lo que fiarse.
 */
export function bboxContenido(data: Uint8Array | Uint8ClampedArray | Buffer, w: number, h: number, margen = 0): Bbox | null {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (esFondo(data, (y * w + x) * 4)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  const left = Math.max(0, minX - margen), top = Math.max(0, minY - margen)
  const right = Math.min(w - 1, maxX + margen), bottom = Math.min(h - 1, maxY + margen)
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')

/**
 * Color corporativo probable: el cubo (16 niveles por canal) más poblado entre los píxeles NO neutros
 * (se ignoran transparentes, casi blancos, casi negros y grises: saturación < 0,25). Devuelve la media real de los
 * píxeles de ese cubo (`#rrggbb`). `null` si el logo es monocromo/gris/vacío o el color apenas aparece (< 1 % del contenido)
 * → quien llama mantiene el aspecto Grupo ASegura. Nunca inventa un color.
 */
export function colorDominante(data: Uint8Array | Uint8ClampedArray | Buffer, w: number, h: number): string | null {
  const cubos = new Map<number, { n: number; r: number; g: number; b: number }>()
  let contenido = 0
  for (let i = 0; i < w * h * 4; i += 4) {
    if (esFondo(data, i)) continue
    contenido++
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (mx < 40) continue // casi negro
    if (mx - mn < 0.25 * mx) continue // gris / poco saturado
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const c = cubos.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    c.n++; c.r += r; c.g += g; c.b += b
    cubos.set(k, c)
  }
  let mejor: { n: number; r: number; g: number; b: number } | null = null
  for (const c of cubos.values()) if (!mejor || c.n > mejor.n) mejor = c
  if (!mejor || contenido === 0 || mejor.n / contenido < 0.01) return null
  return `#${toHex(mejor.r / mejor.n)}${toHex(mejor.g / mejor.n)}${toHex(mejor.b / mejor.n)}`
}
