/**
 * brain-patron.ts
 * Fast lane de reconocimiento de patrones para comandas hosteleras.
 *
 * Cubre ~60-70 % del tráfico real en <10ms, sin llamar a Claude.
 * Si la confianza es < THRESHOLD, devuelve null → el router llama a Claude.
 *
 * Patrones reconocidos:
 *   - Pedido:    "[N] [producto] [a la|mesa|para la] [mesa]"
 *   - Marchar:   "marchar [mesa]" / "[mesa] lista" / "pasa la [mesa]"
 *   - Cuenta:    "cuenta [mesa]" / "cobro [mesa]"
 *   - 86:        "86 [producto]" / "sin [producto]" / "agotado [producto]"
 */

import { BrainResult } from '@/types'
import { MenuCache, ProductoCacheItem } from './brain-cache'

// ── Utilidades ────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// Números en español hasta 20
const NUMS_ES: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
}

const NOMBRES_NUMERO: Record<string, number> = {
  // mesa "la cuatro" etc
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
}

function toNum(s: string): number | null {
  const n = parseInt(s)
  if (!isNaN(n)) return n
  return NUMS_ES[norm(s)] ?? null
}

// Palabras a ignorar en búsqueda de productos
const STOPWORDS = new Set([
  'a', 'la', 'el', 'las', 'los', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'para', 'por', 'en', 'con', 'sin', 'al', 'y',
  'mesa', 'barra', 'terraza', 'salon', 'interior', 'exterior',
  'ración', 'racion', 'media', 'tapa', 'entera', 'grande', 'pequeño', 'pequeña',
  'por', 'favor', 'gracias', 'venga', 'vamos', 'ojo',
])

// Palabras clave por tipo
const KW_CUENTA  = ['cuenta', 'cobro', 'cobrar', 'pagar', 'ticket', 'factura']
const KW_MARCHAR = ['marchar', 'marcha', 'pasa', 'pasar', 'listo', 'lista', 'sale', 'salen', 'sacar']
const KW_86      = ['86', 'agotado', 'agotada', 'sin stock', 'se acabo', 'se acabó', 'no hay', 'acabamos']
const KW_AVISO   = ['aviso', 'nota', 'llama', 'atencion', 'atención', 'espera']

// ── Detección de mesa ─────────────────────────────────────────────────────────

function detectarMesa(tNorm: string, cache: MenuCache): string | null {
  // 1. Buscar por zona explícita: "terraza cuatro", "barra dos"
  for (const zona of cache.zonas) {
    const aliases = [norm(zona.nombre), norm(zona.tipo)]
    for (const alias of aliases) {
      if (!alias) continue
      const re = new RegExp(`(?:^|\\s)${alias}\\s+(\\w+)`)
      const m = tNorm.match(re)
      if (m) {
        const num = toNum(m[1])
        if (num) return `${zona.prefijo}${String(num).padStart(2, '0')}`
      }
    }
  }

  // 2. Genérico: "mesa [N]" / "la [N]" / número suelto al final
  const mesaRe = /(?:mesa|la|numero)\s+(\w+)/
  const m1 = tNorm.match(mesaRe)
  if (m1) {
    const num = toNum(m1[1])
    if (num) return `T${String(num).padStart(2, '0')}`
  }

  // 3. Número solo al final de la frase (ej: "dos cañas cuatro")
  const finalNumRe = /(?:\s|^)(\d{1,2})(?:\s*$)/
  const m2 = tNorm.match(finalNumRe)
  if (m2) {
    const num = parseInt(m2[1])
    if (num >= 1 && num <= 99) return `T${String(num).padStart(2, '0')}`
  }

  return null
}

// ── Búsqueda de producto en menú ──────────────────────────────────────────────

interface ItemDetectado {
  producto: ProductoCacheItem
  cantidad: number
  formato: string | null
  notas: string | null
}

const FORMATOS = ['tapa', 'media', 'media racion', 'racion', 'entera', 'grande', 'pequeño']

function detectarItems(tNorm: string, cache: MenuCache): { items: ItemDetectado[]; confianza: number } | null {
  // Tokenizar la frase en segmentos entre separadores
  // Ej: "dos cañas y unas bravas" → ["dos cañas", "unas bravas"]
  const segmentos = tNorm
    .split(/\s+y\s+|\s*,\s*|\s+con\s+/)
    .map(s => s.trim())
    .filter(Boolean)

  const items: ItemDetectado[] = []
  let confianzaTotal = 0

  for (const seg of segmentos) {
    const palabras = seg.split(/\s+/).filter(w => w.length > 1)
    
    // Extraer cantidad al principio
    let cantidad = 1
    let offset = 0
    if (palabras.length > 0) {
      const num = toNum(palabras[0])
      if (num !== null) {
        cantidad = num
        offset = 1
      }
    }

    // Extraer formato si existe
    let formato: string | null = null
    const restoSeg = palabras.slice(offset).join(' ')
    for (const fmt of FORMATOS) {
      if (restoSeg.includes(fmt)) {
        formato = fmt
        break
      }
    }

    // Buscar el producto: probar combinaciones de 1-4 palabras
    const palabrasSinStop = palabras.slice(offset).filter(w => !STOPWORDS.has(w))
    let productoEncontrado: ProductoCacheItem | null = null
    let mejorLong = 0

    for (let len = Math.min(palabrasSinStop.length, 4); len >= 1; len--) {
      for (let start = 0; start + len <= palabrasSinStop.length; start++) {
        const candidato = palabrasSinStop.slice(start, start + len).join(' ')
        const p = cache.byAlias.get(candidato)
        if (p && len > mejorLong) {
          productoEncontrado = p
          mejorLong = len
        }
      }
      if (productoEncontrado) break
    }

    if (!productoEncontrado) {
      // No se reconoció este segmento → confianza baja → fallback a Claude
      return null
    }

    items.push({
      producto: productoEncontrado,
      cantidad,
      formato,
      notas: null,
    })

    // Confianza por item: alta si la cantidad es explícita o el producto es unívoco
    const confianzaItem = mejorLong >= 2 ? 0.92 : 0.82
    confianzaTotal += confianzaItem
  }

  if (items.length === 0) return null

  const confianzaMedia = confianzaTotal / items.length
  return { items, confianza: confianzaMedia }
}

// ── Función principal ─────────────────────────────────────────────────────────

export function reconocerPatron(texto: string, cache: MenuCache): BrainResult | null {
  const tNorm = norm(texto)

  // ── 1. CUENTA ─────────────────────────────────────────────────────────────
  if (KW_CUENTA.some(k => tNorm.includes(k))) {
    const mesa = detectarMesa(tNorm, cache)
    if (mesa) {
      return {
        mesa,
        tipo: 'cuenta',
        items: [],
        confianza: 0.95,
        raw: texto,
      }
    }
  }

  // ── 2. MARCHAR ───────────────────────────────────────────────────────────
  if (KW_MARCHAR.some(k => tNorm.includes(k))) {
    const mesa = detectarMesa(tNorm, cache)
    if (mesa) {
      return {
        mesa,
        tipo: 'marchar',
        items: [],
        confianza: 0.95,
        raw: texto,
      }
    }
  }

  // ── 3. 86 ─────────────────────────────────────────────────────────────────
  if (KW_86.some(k => tNorm.includes(k))) {
    // Quitar el keyword del texto para buscar el producto
    let textoSin = tNorm
    for (const k of KW_86) textoSin = textoSin.replace(k, ' ')
    textoSin = textoSin.trim()

    // Buscar el producto directamente en el texto limpio
    for (const p of cache.productos) {
      for (const alias of p.aliases) {
        if (textoSin.includes(norm(alias))) {
          return {
            mesa: 'T00',
            tipo: '86',
            items: [{ nombre: p.nombre, cantidad: 1, notas: undefined }],
            confianza: 0.90,
            raw: texto,
          }
        }
      }
    }
    // 86 sin producto reconocido → fallback
    return null
  }

  // ── 4. AVISO ──────────────────────────────────────────────────────────────
  if (KW_AVISO.some(k => tNorm.includes(k))) {
    return null // Avisos son demasiado libres → siempre Claude
  }

  // ── 5. COMANDA ───────────────────────────────────────────────────────────
  // Quitar palabras de mesa para buscar items
  const mesa = detectarMesa(tNorm, cache)
  
  // Limpiar el texto de la referencia a la mesa para el parsing de items
  let textoItems = tNorm
  if (mesa) {
    // Quitar "mesa N", "la terraza N", etc.
    textoItems = textoItems
      .replace(/(?:a la|para la|en la|mesa|barra|terraza|salon|salón|interior|exterior)\s+\w+/g, '')
      .replace(/\b\d{1,2}\b$/, '') // número solo al final
      .trim()
  }

  const resultado = detectarItems(textoItems || tNorm, cache)
  if (!resultado || resultado.items.length === 0) {
    return null // No reconocido → Claude
  }

  const { items, confianza } = resultado

  // Si no detectamos mesa, la confianza baja pero podemos devolver el resultado
  // El sistema conversacional se encargará de pedir la mesa
  const confianzaFinal = mesa ? confianza : confianza * 0.7

  if (confianzaFinal < 0.75) return null // Demasiado inseguro → Claude

  return {
    mesa: mesa ?? 'T00',
    tipo: 'comanda',
    items: items.map(i => ({
      nombre: i.producto.nombre,
      cantidad: i.cantidad,
      notas: i.notas ?? undefined,
      producto_id: i.producto.id,
      precio_unitario: i.producto.precio ?? undefined,
      formato: i.formato ?? undefined,
    })),
    num_comensales: null,
    confianza: confianzaFinal,
    raw: texto,
  }
}
