/**
 * brain-patron.ts  v2
 * Fast lane de reconocimiento de patrones para comandas hosteleras.
 *
 * Fixes v2:
 * - Lookup plural→singular (manchados→manchado)
 * - Alias con artículo incluido ("un tinto" como unidad)
 * - Detección de notas (muy hecho/sin sal/…) → fallback a Claude
 * - Multi-intent (marchar + items) → fallback a Claude
 * - Regex de mesa mejorada para "a la mesa seis"
 */

import { BrainResult } from '@/types'
import { MenuCache, ProductoCacheItem } from './brain-cache'

// ── Utilidades ────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const NUMS_ES: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
}

function toNum(s: string): number | null {
  const n = parseInt(s)
  if (!isNaN(n)) return n
  return NUMS_ES[norm(s)] ?? null
}

/** Singular simple: quita -s o -es final para lookup */
function singular(s: string): string {
  if (s.endsWith('es') && s.length > 4) return s.slice(0, -2)
  if (s.endsWith('s') && s.length > 3) return s.slice(0, -1)
  return s
}

const STOPWORDS = new Set([
  'a', 'la', 'el', 'las', 'los', 'unos', 'unas',
  'de', 'del', 'para', 'por', 'en', 'al', 'y',
  'mesa', 'barra', 'terraza', 'salon', 'interior', 'exterior',
  'racion', 'entera', 'por', 'favor', 'gracias', 'venga', 'vamos', 'ojo',
])

// Palabras que indican nota (→ Claude)
const KW_NOTA = [
  'muy hecho', 'poco hecho', 'al punto', 'muy hecha', 'poco hecha',
  'sin sal', 'sin cebolla', 'sin gluten', 'sin lactosa', 'sin', 'extra',
  'bien fria', 'bien fría', 'caliente', 'templado',
  'alérgic', 'alergic', 'intolerante',
]

const KW_CUENTA  = ['cuenta', 'cobro', 'cobrar', 'pagar', 'ticket', 'factura']
const KW_MARCHAR = ['marchar', 'marcha', 'pasa', 'pasar', 'listo', 'lista', 'sale ', 'salen']
const KW_86      = ['86', 'agotado', 'agotada', 'sin stock', 'se acabo', 'se acabó', 'no hay']

// ── Detección de mesa ─────────────────────────────────────────────────────────

function detectarMesa(tNorm: string, cache: MenuCache): string | null {
  // 1. Por zona explícita: "terraza dos", "barra uno"
  for (const zona of cache.zonas) {
    const aliases = [norm(zona.nombre), norm(zona.tipo)].filter(Boolean)
    for (const alias of aliases) {
      const re = new RegExp(`(?:^|\\s)${alias}\\s+(\\w+)`)
      const m = tNorm.match(re)
      if (m) { const n = toNum(m[1]); if (n) return `${zona.prefijo}${String(n).padStart(2, '0')}` }
    }
  }

  // 2. "mesa N", "a la N", "a la mesa N", "para la N", "numero N"
  const mesaRe = /(?:a la mesa|para la mesa|a la|mesa|numero)\s+(\w+)/
  const m1 = tNorm.match(mesaRe)
  if (m1) { const n = toNum(m1[1]); if (n) return `T${String(n).padStart(2, '0')}` }

  // 3. "la cuatro" suelto (al final o cerca del final)
  const laRe = /\bla\s+(\w+)(?:\s*$|\s+(?:vamos|venga|ojo|por favor))/
  const m2 = tNorm.match(laRe)
  if (m2) { const n = toNum(m2[1]); if (n) return `T${String(n).padStart(2, '0')}` }

  // 4. Número dígito solo al final
  const m3 = tNorm.match(/\b(\d{1,2})\s*$/)
  if (m3) { const n = parseInt(m3[1]); if (n >= 1 && n <= 99) return `T${String(n).padStart(2, '0')}` }

  return null
}

// ── Lookup de producto en cache ───────────────────────────────────────────────

function buscarProducto(palabras: string[], cache: MenuCache): { prod: ProductoCacheItem; len: number } | null {
  // Intentar combinaciones de largo→corto, con y sin artículo ("un X", "una X")
  const articulos = ['', 'un ', 'una ']
  for (const art of articulos) {
    for (let len = Math.min(palabras.length, 4); len >= 1; len--) {
      for (let start = 0; start + len <= palabras.length; start++) {
        const candidato = art + palabras.slice(start, start + len).join(' ')
        const prod = cache.byAlias.get(candidato)
        if (prod) return { prod, len }

        // Plural → singular
        const candidatoSing = art + palabras.slice(start, start + len).map((w, i) =>
          i === len - 1 ? singular(w) : w
        ).join(' ')
        const prodSing = cache.byAlias.get(candidatoSing)
        if (prodSing) return { prod: prodSing, len }
      }
    }
  }
  return null
}

// ── Detección de items ────────────────────────────────────────────────────────

interface ItemDetectado {
  producto: ProductoCacheItem
  cantidad: number
  formato: string | null
}

const FORMATOS = ['tapa', 'media racion', 'media', 'racion', 'ración', 'entera', 'grande']

function detectarItems(tNorm: string, cache: MenuCache): { items: ItemDetectado[]; confianza: number } | null {
  const segmentos = tNorm.split(/\s+y\s+|\s*,\s*/).map(s => s.trim()).filter(Boolean)
  const items: ItemDetectado[] = []
  let confianzaTotal = 0

  for (const seg of segmentos) {
    const palabras = seg.split(/\s+/).filter(w => w.length > 1)

    // Extraer cantidad
    let cantidad = 1
    let palabrasResto = palabras
    if (palabras.length > 0) {
      const n = toNum(palabras[0])
      if (n !== null && !['un', 'una'].includes(norm(palabras[0]))) {
        cantidad = n
        palabrasResto = palabras.slice(1)
      }
    }

    // Filtrar stopwords, pero NO artículo "un/una" (puede ser parte del alias)
    const palabrasBusqueda = palabrasResto.filter(w => !STOPWORDS.has(norm(w)))

    if (palabrasBusqueda.length === 0) continue

    // Extraer formato si existe
    let formato: string | null = null
    const segFull = palabrasBusqueda.join(' ')
    for (const fmt of FORMATOS) {
      if (segFull.includes(fmt)) { formato = fmt; break }
    }

    const resultado = buscarProducto(palabrasBusqueda, cache)
    if (!resultado) return null // No reconocido → Claude

    items.push({ producto: resultado.prod, cantidad, formato })
    confianzaTotal += resultado.len >= 2 ? 0.92 : 0.84
  }

  if (items.length === 0) return null
  return { items, confianza: confianzaTotal / items.length }
}

// ── Función principal ─────────────────────────────────────────────────────────

export function reconocerPatron(texto: string, cache: MenuCache): BrainResult | null {
  const tNorm = norm(texto)

  // ── Guardia: si hay palabras de nota → Claude (seguridad operacional)
  if (KW_NOTA.some(k => tNorm.includes(k))) return null

  // ── 1. CUENTA ────────────────────────────────────────────────────────────
  if (KW_CUENTA.some(k => tNorm.includes(k))) {
    const mesa = detectarMesa(tNorm, cache)
    if (mesa) return { mesa, tipo: 'cuenta', items: [], confianza: 0.95, raw: texto }
  }

  // ── 2. MARCHAR ───────────────────────────────────────────────────────────
  if (KW_MARCHAR.some(k => tNorm.includes(k))) {
    // Multi-intent: "marchar mesa X y un producto" → Claude
    const tieneItems = /\b(y|,)\s+\w+/.test(tNorm) &&
      !KW_MARCHAR.some(k => tNorm.replace(k, '').trim().startsWith('mesa'))
    if (tieneItems) return null

    const mesa = detectarMesa(tNorm, cache)
    if (mesa) return { mesa, tipo: 'marchar', items: [], confianza: 0.95, raw: texto }
  }

  // ── 3. 86 ────────────────────────────────────────────────────────────────
  if (KW_86.some(k => tNorm.includes(k))) {
    let textoSin = tNorm
    for (const k of KW_86) textoSin = textoSin.replace(k, ' ')
    textoSin = textoSin.trim()
    for (const p of cache.productos) {
      for (const alias of p.aliases) {
        if (textoSin.includes(norm(alias))) {
          return { mesa: 'T00', tipo: '86', items: [{ nombre: p.nombre, cantidad: 1 }], confianza: 0.90, raw: texto }
        }
      }
    }
    return null
  }

  // ── 4. COMANDA ───────────────────────────────────────────────────────────
  const mesa = detectarMesa(tNorm, cache)

  // Limpiar referencia a mesa del texto de items
  let textoItems = tNorm
  if (mesa) {
    textoItems = textoItems
      .replace(/(?:a la mesa|para la mesa|a la|para la|en la|mesa|barra|terraza|salon|salo n)\s+\w+/g, ' ')
      .replace(/\bla\s+\w+\s*$/, '')
      .replace(/\b\d{1,2}\s*$/, '')
      .trim()
  }

  if (!textoItems) return null

  const resultado = detectarItems(textoItems, cache)
  if (!resultado || resultado.items.length === 0) return null

  const { items, confianza } = resultado
  const confianzaFinal = mesa ? confianza : confianza * 0.65
  if (confianzaFinal < 0.75) return null

  return {
    mesa: mesa ?? 'T00',
    tipo: 'comanda',
    items: items.map(i => ({
      nombre: i.producto.nombre,
      cantidad: i.cantidad,
      notas: undefined,
      producto_id: i.producto.id,
      precio_unitario: i.producto.precio ?? undefined,
      formato: i.formato ?? undefined,
    })),
    num_comensales: null,
    confianza: confianzaFinal,
    raw: texto,
  }
}
