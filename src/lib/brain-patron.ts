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

// Mapa de keywords de tipo de vino → familia (para fast-lane)
// Si el camarero dice "un tinto" y solo hay un vino_tinto, el patron lo resuelve sin Claude
const VINO_TIPO_KEYWORDS: Array<{ kw: string[]; familia: string }> = [
  { kw: ['tinto', 'tinta'],                                   familia: 'vino_tinto'  },
  { kw: ['blanco', 'blanca'],                                  familia: 'vino_blanco' },
  { kw: ['rosado', 'rosada'],                                  familia: 'vino_rosado' },
  { kw: ['cava'],                                              familia: 'cava'        },
  { kw: ['champan', 'champagne', 'champaña'],                  familia: 'champagne'   },
  { kw: ['jerez', 'fino', 'manzanilla', 'amontillado'],        familia: 'jerez'       },
  { kw: ['vermut', 'vermu', 'vermú'],                          familia: 'vermut'      },
]

/** Detecta si el texto contiene keyword de tipo de vino y devuelve la familia */
function detectarFamiliaVino(tNorm: string): string | null {
  for (const entry of VINO_TIPO_KEYWORDS) {
    if (entry.kw.some(k => tNorm.includes(k))) return entry.familia
  }
  return null
}
const KW_86      = ['86', 'agotado', 'agotada', 'sin stock', 'se acabo', 'se acabó', 'no hay']

// Recomendaciones de vino: nunca son comandas
const KW_VINO = [
  'recomendacion de vino', 'recomienda un vino', 'recomienda vino',
  'qué vino', 'que vino', 'vino para', 'vino con',
  'maridaje', 'maridar', 'qué vino va', 'que vino va',
  'vino recomendado', 'sommelier', 'sumiller',
  'vino tinto para', 'vino blanco para', 'vino rosado para',
]

const KW_MENSAJE = [
  'mensaje a cocina', 'mensaje para cocina',
  'mensaje a barra',  'mensaje para barra',
  'mensaje a sala',   'mensaje para sala',
  'mensaje a todos',  'mensaje para todos',
  'avisa a cocina',   'avisa cocina',
  'avisa a barra',    'avisa barra',
  'avisa a sala',     'avisa sala',
  'di a cocina',      'dile a cocina',
  'comunica a cocina','manda mensaje',
  'aviso a cocina',   'aviso para cocina',
  'aviso a barra',    'aviso para barra',
  'aviso a sala',     'aviso para sala',
]

const KW_MESA_RAPIDA = [
  'asigname mesa', 'asígname mesa', 'asigna mesa', 'abre mesa',
  'mesa para', 'mesa rapida', 'mesa rápida', 'nueva mesa para',
  'pon mesa para', 'mesa a nombre de', 'mesa a nombre',
]

const ZONAS_ES: Record<string, string> = {
  terraza: 'terraza', barra: 'barra', salon: 'salon', salón: 'salon',
  interior: 'interior', exterior: 'exterior', jardin: 'jardin', jardín: 'jardin',
  vip: 'vip', privado: 'privado', privada: 'privado',
}

function extraerMesaRapida(tNorm: string): { zona: string | null; alias: string | null } | null {
  let zona: string | null = null
  for (const [kw, val] of Object.entries(ZONAS_ES)) {
    if (tNorm.includes(kw)) { zona = val; break }
  }
  let alias: string | null = null
  const matchNombre = tNorm.match(/(?:a nombre de|a nombre|para)\s+([a-záéíóúüñ\s]{3,40}?)(?:\s+en\s+\w+)?$/)
  if (matchNombre) {
    alias = matchNombre[1].trim().replace(/\s+/g, ' ')
    if (Object.keys(ZONAS_ES).includes(alias)) alias = null
  }
  if (!zona && !alias) return null
  return {
    zona,
    alias: alias ? alias.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : null,
  }
}

// ── Detección de mesa ─────────────────────────────────────────────────────────

function detectarMesa(tNorm: string, cache: MenuCache): string | null {
  // 1. Por zona explícita: "terraza dos", "barra uno"
  for (const zona of cache.zonas) {
    const aliases = [norm(zona.nombre), norm(zona.tipo)].filter(Boolean)
    for (const alias of aliases) {
      const re = new RegExp(`(?:^|\\s)${alias}\\s+(\\w+)`)
      const m = tNorm.match(re)
      if (m) { const n = toNum(m[1]); if (n) return `${zona.prefijo}${n}` }
    }
  }

  // 2. "mesa N", "a la N", "a la mesa N", "para la N", "numero N"
  const mesaRe = /(?:a la mesa|para la mesa|a la|mesa|numero)\s+(\w+)/
  const m1 = tNorm.match(mesaRe)
  if (m1) { const n = toNum(m1[1]); if (n) return `T${n}` }

  // 3. "la cuatro" suelto (al final o cerca del final)
  const laRe = /\bla\s+(\w+)(?:\s*$|\s+(?:vamos|venga|ojo|por favor))/
  const m2 = tNorm.match(laRe)
  if (m2) { const n = toNum(m2[1]); if (n) return `T${n}` }

  // 4. Número dígito solo al final
  const m3 = tNorm.match(/\b(\d{1,2})\s*$/)
  if (m3) { const n = parseInt(m3[1]); if (n >= 1 && n <= 99) return `T${n}` }

  // 5. Código directo tipo "B1", "T3", "S06" al inicio o en cualquier posición
  // Cubre "B1 la cuenta", "T3 marchar", etc. — el camarero dice el código completo
  const codigoRe = /(?:^|\s)([a-zA-Z])0*(\d{1,2})(?:\s|$)/
  const m4 = tNorm.match(codigoRe)
  if (m4) {
    const prefijo = m4[1].toUpperCase()
    const num = parseInt(m4[2])
    const prefijosValidos = cache.zonas.map((z: { prefijo?: string }) => z.prefijo?.toUpperCase()).filter(Boolean)
    if (prefijosValidos.includes(prefijo) && num >= 1 && num <= 99) {
      return `${prefijo}${num}`  // sin padding: B1, T3, S6 (sin ceros)
    }
  }

  return null
}

// ── Lookup de producto en cache ───────────────────────────────────────────────

function buscarProducto(palabras: string[], cache: MenuCache): { prod: ProductoCacheItem; len: number } | null {
  // ── Nivel 1: match exacto / singular ─────────────────────────────────────
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

  // ── Nivel 2: prefix match como fallback ──────────────────────────────────
  // Útil cuando el camarero dice "cerveza" y el alias canónico es "cerveza caña".
  // Solo aplica si el resultado es UNAMBIGUO (exactamente 1 producto).
  // Si hay 2+ matches (ej: "cerveza caña" y "cerveza mediana") → Claude decide.
  const candidatoFull = palabras.join(' ')
  if (candidatoFull.length >= 3) {
    const prefixMatches = new Set<ProductoCacheItem>()
    for (const [aliasKey, prod] of cache.byAlias.entries()) {
      if (aliasKey.startsWith(candidatoFull + ' ') || aliasKey === candidatoFull) {
        prefixMatches.add(prod)
      }
    }
    if (prefixMatches.size === 1) {
      return { prod: [...prefixMatches][0], len: palabras.length }
    }
    // Intentar también con singular
    const candidatoSingFull = palabras.slice(0, -1)
      .concat(singular(palabras[palabras.length - 1]))
      .join(' ')
    if (candidatoSingFull !== candidatoFull && candidatoSingFull.length >= 3) {
      const singMatches = new Set<ProductoCacheItem>()
      for (const [aliasKey, prod] of cache.byAlias.entries()) {
        if (aliasKey.startsWith(candidatoSingFull + ' ') || aliasKey === candidatoSingFull) {
          singMatches.add(prod)
        }
      }
      if (singMatches.size === 1) {
        return { prod: [...singMatches][0], len: palabras.length }
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

// Formatos hosteleros canónicos (de más específico a menos para evitar falso-positivo)
// norm() ya elimina tildes antes de que lleguen aquí
const FORMATOS = [
  'media racion', 'media ración', 'medias raciones',
  'racion entera', 'ración entera',
  'racion', 'ración', 'raciones',
  'tapa', 'tapita', 'tapas',
  'entera', 'enteras',
  'grande', 'grandes',
  'chico', 'chica', 'pequeño', 'pequeña',
  'media',
]
// Tokens individuales de cada formato (para limpiar de palabrasBusqueda)
const FORMATO_TOKENS = new Set([
  'tapa', 'tapita', 'tapas',
  'media', 'medias',
  'racion', 'raciones', 'ración',
  'entera', 'enteras',
  'grande', 'grandes',
  'chico', 'chica', 'pequeño', 'pequeña',
  'de', // "tapa de X" → el "de" se queda después de filtrar el formato
])

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

    // Extraer formato si existe y eliminar sus tokens de palabrasBusqueda
    // FIX: antes buscábamos producto con "tapa jamon" → no matchea.
    // Ahora: detectar formato → quitar sus tokens → buscar solo el producto.
    let formato: string | null = null
    const segFull = palabrasBusqueda.join(' ')
    let palabrasBusquedaLimpia = palabrasBusqueda
    for (const fmt of FORMATOS) {
      if (segFull.includes(fmt)) {
        formato = fmt
        // Eliminar tokens del formato (y el "de" conector) de palabrasBusqueda
        const fmtTokens = new Set(fmt.split(' ').map(t => norm(t)))
        palabrasBusquedaLimpia = palabrasBusqueda.filter(w => {
          const wn = norm(w)
          return !fmtTokens.has(wn) && !FORMATO_TOKENS.has(wn)
        })
        if (palabrasBusquedaLimpia.length === 0) palabrasBusquedaLimpia = palabrasBusqueda
        break
      }
    }

    // Si el camarero dijo un tipo de vino (tinto/blanco/rosado/cava...),
    // filtra el cache por familia antes de buscar → evita ambigüedad entre tipos
    const familiaVino = detectarFamiliaVino(tNorm)
    let cacheEfectivo = cache
    if (familiaVino) {
      const productosFiltrados = cache.productos.filter(p => p.familia === familiaVino)
      if (productosFiltrados.length > 0) {
        cacheEfectivo = { ...cache, productos: productosFiltrados }
        // Si hay un único producto de ese tipo → lo seleccionamos directamente sin clarificar
      }
    }
    const resultado = buscarProducto(palabrasBusquedaLimpia, cacheEfectivo)
    if (!resultado) return null // No reconocido → Claude

    items.push({ producto: resultado.prod, cantidad, formato })
    confianzaTotal += resultado.len >= 2 ? 0.92 : 0.84
  }

  if (items.length === 0) return null
  return { items, confianza: confianzaTotal / items.length }
}

// ── Extracción de nota explícita ─────────────────────────────────────────────
// Detecta "nota [texto]" como separador explícito en el comando de voz.
// Ejemplos:
//   "ve uno, dos cervezas, nota en copa"     → nota="en copa"
//   "s1 una paella nota sin sal para niño"   → nota="sin sal para niño"
//   "nota lo siguiente: sin cebolla"         → nota="lo siguiente: sin cebolla"
//   "b1 tres cañas y nota alérgica al gluten"→ nota="alérgica al gluten"
//
// Retorna null si no hay "nota" explícita (→ se mantiene el fallback a Claude
// para notas IMPLÍCITAS como "muy hecho", "sin sal" sin la palabra "nota").

function extraerNotaExplicita(tNorm: string): { nota: string; textoSinNota: string } | null {
  // Patrón: "nota" como palabra completa, con al menos 2 chars de contenido tras ella
  // Acepta posición: al inicio, tras coma, o tras espacio
  // [!,;.¡]* tolera puntuación tras "nota" cuando el camarero lo enfatiza
  // Ej: "nota! en copa", "nota, en copa", "nota. sin sal"
  const match = tNorm.match(/(?:(?:,\s*)|\s+|^)\b(nota)\b[!¡,;.]*\s+(.{2,120})$/)
  if (!match) return null
  const nota = match[2].trim()
    .replace(/^(?:lo siguiente[,:]?\s*|que\s+)/i, '') // quitar "lo siguiente:", "que"
    .trim()
  if (!nota) return null
  const idxNota = tNorm.lastIndexOf(match[0])
  const textoSinNota = tNorm.slice(0, idxNota).trim().replace(/[,\s]+$/, '').trim()
  return { nota, textoSinNota }
}

// ── Función principal ─────────────────────────────────────────────────────────

export function reconocerPatron(texto: string, cache: MenuCache): BrainResult | null {
  const tNorm = norm(texto)

  // ── Nota explícita: "nota [texto]" como separador ─────────────────────────
  // Si el camarero dice "ve uno, dos cervezas, nota en copa":
  //   - Extraemos nota_general = "en copa"
  //   - Seguimos parseando "ve uno, dos cervezas" por patrones
  // Si hay notas IMPLÍCITAS (muy hecho, sin sal…) SIN la palabra "nota" → Claude
  let notaGeneral: string | null = null
  let tParseado = tNorm

  const notaExtraida = extraerNotaExplicita(tNorm)
  if (notaExtraida) {
    notaGeneral = notaExtraida.nota
    tParseado   = notaExtraida.textoSinNota
  } else if (KW_NOTA.some(k => tNorm.includes(k))) {
    // Nota implícita sin keyword "nota" → Claude para máxima precisión
    return null
  }

  // ── 0.5. NOMBRE PROPIO O SECCIÓN AL INICIO → mensaje directo ────────────
  // "Pablo, T4 esperando" → nombre del personal → LLM resuelve
  // "cocina caliente, S1 tiene prisa" → nombre de sección → LLM resuelve
  const primerToken = tParseado.split(/[\s,]/)[0]
  if (primerToken.length >= 3 && cache.byNombre.has(primerToken)) {
    return null
  }
  // Sección: comprobar primer token O primeros dos tokens
  if (primerToken.length >= 4 && cache.bySeccion.has(primerToken)) {
    return null
  }
  const primerosDos = tParseado.split(/,/)[0].trim() // "cocina caliente" antes de la coma
  if (primerosDos.length >= 4 && cache.bySeccion.has(norm(primerosDos))) {
    return null
  }

  // ── 0. MESA RÁPIDA ───────────────────────────────────────────────────────
  if (KW_MESA_RAPIDA.some(k => tParseado.includes(k))) {
    const extraido = extraerMesaRapida(tParseado)
    if (extraido && (extraido.zona || extraido.alias)) {
      return {
        mesa: '', tipo: 'aviso', items: [], confianza: 0.91, raw: texto,
        intent: 'mesa_rapida', zona: extraido.zona, alias_cliente: extraido.alias,
      }
    }
    return null
  }
  if (KW_CUENTA.some(k => tParseado.includes(k))) {
    const mesa = detectarMesa(tParseado, cache)
    if (mesa) return { mesa, tipo: 'cuenta', items: [], confianza: 0.95, raw: texto }
  }

  // ── 2. MARCHAR ───────────────────────────────────────────────────────────
  if (KW_MARCHAR.some(k => tParseado.includes(k))) {
    const mesa = detectarMesa(tParseado, cache)

    // Limpiar keyword de marchar y referencia a mesa del texto
    let textoSinMarchar = tParseado
    for (const k of KW_MARCHAR) textoSinMarchar = textoSinMarchar.replace(k, ' ')
    if (mesa) {
      textoSinMarchar = textoSinMarchar
        .replace(/(?:a la mesa|para la mesa|a la|mesa|barra|terraza|salon)?\s*\w*\s*\d{1,2}/g, ' ')
        .replace(new RegExp(`\\b${mesa.toLowerCase()}\\b`), ' ')
    }
    textoSinMarchar = textoSinMarchar.trim()

    // ¿Queda texto con un producto? → marchar ese producto específico
    if (textoSinMarchar.length > 1) {
      const palabrasProd = textoSinMarchar
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOPWORDS.has(norm(w)))
      const resultProd = palabrasProd.length > 0 ? buscarProducto(palabrasProd, cache) : null
      if (resultProd && mesa) {
        return {
          mesa,
          tipo: 'marchar',
          items: [{ nombre: resultProd.prod.nombre, cantidad: 1 }],
          confianza: 0.88,
          raw: texto,
        }
      }
      // Texto con producto pero sin mesa clara → Claude
      if (textoSinMarchar.length > 2) return null
    }

    if (mesa) return { mesa, tipo: 'marchar', items: [], confianza: 0.95, raw: texto }
  }

  // ── 3.4. RECOMENDACIÓN DE VINO ───────────────────────────────────────────
  // "recomendación de vino para solomillo" → siempre al LLM (carta vinos necesaria)
  if (KW_VINO.some(k => tParseado.includes(k))) {
    return null
  }

  // ── 3.5. MENSAJE / AVISO ─────────────────────────────────────────────────
  // "mensaje a cocina, S1 esperando croquetas" → NO es comanda. Siempre a Claude.
  if (KW_MENSAJE.some(k => tParseado.includes(k))) {
    return null
  }

  // ── 3. 86 ────────────────────────────────────────────────────────────────
  if (KW_86.some(k => tParseado.includes(k))) {
    let textoSin = tParseado
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
  const mesa = detectarMesa(tParseado, cache)

  // Limpiar referencia a mesa del texto de items
  let textoItems = tParseado
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
  // Umbral más permisivo cuando hay nota explícita: el camarero dijo "nota" conscientemente
  const umbralMin = notaGeneral ? 0.50 : 0.75
  if (confianzaFinal < umbralMin) return null

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
    nota_general: notaGeneral,   // ← incluida si el camarero dijo "nota [texto]"
    confianza: confianzaFinal,
    raw: texto,
  }
}
