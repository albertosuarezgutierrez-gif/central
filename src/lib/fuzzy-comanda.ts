/**
 * fuzzy-comanda.ts
 * Capa 1: corrección léxica de transcripciones Whisper contra el catálogo del restaurante.
 * Sin IA — fuzzy match local basado en Fuse.js. Latencia <5ms.
 * Resuelve ~80% de errores de transcripción antes de llamar al LLM.
 */

import Fuse from 'fuse.js'
import type { ProductoCacheItem } from '@/lib/brain-cache'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface CorreccionFuzzy {
  original: string       // texto crudo de Whisper
  corregido: string      // texto tras corrección léxica
  cambios: CambioFuzzy[]
  confianza: number      // 0-1, promedio de los scores de los cambios aplicados
  hubo_cambios: boolean
}

interface CambioFuzzy {
  original: string
  reemplazado_por: string
  producto_id: string
  score: number
  posicion: number
  longitud_tokens: number
}

// Entrada del índice Fuse
interface EntradaFuse {
  id: string
  texto: string           // alias normalizado
  nombre_original: string // nombre canónico del producto (sin normalizar)
}

// ── Constantes ───────────────────────────────────────────────────────────────

// Palabras que NUNCA se corrigen aunque suenen a un producto
const PALABRAS_RESERVADAS = new Set([
  // cantidades
  'un', 'una', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis',
  'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  // formatos hosteleros
  'tapa', 'tapas', 'tapita', 'media', 'medias', 'racion', 'raciones',
  // preposiciones y artículos frecuentes
  'con', 'sin', 'para', 'de', 'del', 'la', 'el', 'lo', 'las', 'los',
  'y', 'e', 'mas', 'tambien', 'otro', 'otra', 'misma', 'mismo',
  // instrucciones cocina
  'muy', 'poco', 'hecho', 'crudo', 'frio', 'caliente', 'aparte',
  'mesa', 'barra', 'terraza', 'interior', 'todo', 'todos',
  // verbos de comando voz
  'ponme', 'dame', 'quiero', 'trae', 'manda', 'marcha', 'marchando',
  'por', 'favor', 'vale', 'oye', 'nota', 'mensaje', 'avisa',
  // números ordinales
  'primero', 'segundo', 'tercero',
])

// Threshold Fuse: 0 = match perfecto, 1 = cualquier cosa. 0.32 ≈ 70% similitud mínima
const FUSE_THRESHOLD = 0.32

// Score mínimo para aplicar reemplazo (1 - fuse_score, ya que fuse invierte la escala)
const SCORE_MINIMO = 0.68

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Construcción del índice Fuse ─────────────────────────────────────────────

function construirIndice(productos: ProductoCacheItem[]): Fuse<EntradaFuse> {
  const documentos: EntradaFuse[] = []

  for (const p of productos) {
    // Cada alias genera una entrada independiente en el índice
    for (const alias of p.aliases) {
      if (!alias || alias.trim().length < 3) continue
      documentos.push({
        id: p.id,
        texto: normalizar(alias),
        nombre_original: p.nombre,
      })
    }
  }

  return new Fuse(documentos, {
    keys: ['texto'],
    threshold: FUSE_THRESHOLD,
    distance: 120,
    minMatchCharLength: 3,
    includeScore: true,
    shouldSort: true,
    useExtendedSearch: false,
  })
}

// ── Generación de n-gramas ────────────────────────────────────────────────────

function generarNGramas(
  tokens: string[]
): Array<{ texto: string; inicio: number; fin: number }> {
  const ngramas: Array<{ texto: string; inicio: number; fin: number }> = []
  // Probar trigramas → bigramas → unigramas (mayor → menor para priorizar matches largos)
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const fragmento = tokens.slice(i, i + n).join(' ')
      if (fragmento.length >= 3) {
        ngramas.push({ texto: fragmento, inicio: i, fin: i + n - 1 })
      }
    }
  }
  return ngramas
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Corrige léxicamente la transcripción de Whisper contra el catálogo del restaurante.
 * Usar ANTES de enviar el texto al LLM.
 *
 * @param textoWhisper  - Texto crudo de Whisper
 * @param productos     - Catálogo del restaurante (de getMenuCache())
 * @returns CorreccionFuzzy con el texto corregido y los cambios aplicados
 */
export function corregirTranscripcion(
  textoWhisper: string,
  productos: ProductoCacheItem[]
): CorreccionFuzzy {
  const vacio: CorreccionFuzzy = {
    original: textoWhisper,
    corregido: textoWhisper,
    cambios: [],
    confianza: 1,
    hubo_cambios: false,
  }

  if (!textoWhisper?.trim() || !productos?.length) return vacio

  const fuse = construirIndice(productos)
  const textoNorm = normalizar(textoWhisper)
  const tokens = textoNorm.split(' ')
  const cambios: CambioFuzzy[] = []

  // Posiciones ya asignadas a un reemplazo (para no solapar)
  const posicionesUsadas = new Set<number>()

  // Generar todos los n-gramas ordenados por longitud desc
  const ngramas = generarNGramas(tokens)

  for (const ngrama of ngramas) {
    const longitud = ngrama.fin - ngrama.inicio + 1
    const posiciones = Array.from({ length: longitud }, (_, i) => ngrama.inicio + i)

    // Saltar si alguna posición ya fue usada
    if (posiciones.some(p => posicionesUsadas.has(p))) continue

    // Saltar unigramas que son palabras reservadas
    if (longitud === 1 && PALABRAS_RESERVADAS.has(ngrama.texto)) continue

    // Saltar si el n-grama es solo números
    if (/^\d+$/.test(ngrama.texto)) continue

    // Buscar en el índice
    const resultados = fuse.search(ngrama.texto)
    if (!resultados.length) continue

    const mejor = resultados[0]
    const score = 1 - (mejor.score ?? 1) // invertir: 0=no match → 1=perfecto

    if (score < SCORE_MINIMO) continue

    // Match exacto: no es un error de transcripción, solo marcar posiciones
    const nombreNorm = normalizar(mejor.item.nombre_original)
    if (nombreNorm === ngrama.texto || mejor.item.texto === ngrama.texto) {
      posiciones.forEach(p => posicionesUsadas.add(p))
      continue
    }

    // Reemplazo válido
    cambios.push({
      original: ngrama.texto,
      reemplazado_por: mejor.item.nombre_original,
      producto_id: mejor.item.id,
      score,
      posicion: ngrama.inicio,
      longitud_tokens: longitud,
    })
    posiciones.forEach(p => posicionesUsadas.add(p))
  }

  if (!cambios.length) return vacio

  // Aplicar cambios al array de tokens (de mayor posición a menor para no desplazar índices)
  const cambiosOrdenados = [...cambios].sort((a, b) => b.posicion - a.posicion)
  const tokensResultado = [...tokens]

  for (const cambio of cambiosOrdenados) {
    const palabrasNuevas = cambio.reemplazado_por.toLowerCase().split(' ')
    tokensResultado.splice(cambio.posicion, cambio.longitud_tokens, ...palabrasNuevas)
  }

  // Texto corregido con capitalización de la primera letra si el original la tenía
  const textoCorrNorm = tokensResultado.join(' ')
  const primeraLetraMayus =
    textoWhisper.length > 0 && textoWhisper[0] === textoWhisper[0].toUpperCase()
  const textoCorregido = primeraLetraMayus
    ? textoCorrNorm.charAt(0).toUpperCase() + textoCorrNorm.slice(1)
    : textoCorrNorm

  const confianzaMedia = cambios.reduce((acc, c) => acc + c.score, 0) / cambios.length

  return {
    original: textoWhisper,
    corregido: textoCorregido,
    cambios,
    confianza: confianzaMedia,
    hubo_cambios: true,
  }
}

// ── Logger para dataset futuro ────────────────────────────────────────────────

/**
 * Registra la corrección fuzzy en ia_training_log para alimentar el modelo propio futuro.
 * Non-blocking — nunca lanza excepciones al caller.
 */
export async function registrarCorreccionFuzzy(
  supabase: ReturnType<typeof import('@/lib/supabase').createServerClient>,
  restauranteId: string,
  turnoId: string | undefined,
  correccion: CorreccionFuzzy
): Promise<void> {
  if (!correccion.hubo_cambios) return

  try {
    await supabase.from('ia_training_log').insert({
      restaurante_id: restauranteId,
      turno_id: turnoId ?? null,
      capa: 'fuzzy_capa1',
      input_raw: correccion.original,
      transcripcion_corregida: correccion.corregido,
      correcciones_fuzzy: correccion.cambios.map(c => ({
        original: c.original,
        reemplazado_por: c.reemplazado_por,
        producto_id: c.producto_id,
        score: Math.round(c.score * 100) / 100,
      })),
      confirmado_por_camarero: false,
      calidad: null,
    })
  } catch {
    // Non-blocking: si el log falla, el flujo continúa sin interrumpirse
  }
}

// ── Generación automática de alias fonéticos con IA ──────────────────────────

/**
 * Genera alias fonéticos para un producto usando IA (NIM → Haiku fallback).
 *
 * SELECCIÓN DE MODELO: callAI() con noFallback=false
 *   - Tarea auxiliar: si falla, el producto queda sin alias (no es crítico)
 *   - No necesita internet → callAI, NO callAISearch
 *   - Output corto (<50 tokens) → NIM 70B suficiente; Haiku como seguro
 *   - Evaluación: loguear modelo_usado en ia_training_log para comparar
 *     calidad NIM vs Haiku tras suficientes ejecuciones reales
 *
 * @param nombreProducto  - Nombre canónico del producto ("Salmonete a la plancha")
 * @param contexto        - Info extra opcional ("bar de tapas sevillano")
 * @returns Array de alias fonéticos o [] si la IA falla
 */
export async function generarAliasFoneticos(
  nombreProducto: string,
  contexto?: string
): Promise<string[]> {
  // Importación dinámica para evitar problemas de bundle en entornos sin IA
  const { callAI, cleanJSON } = await import('@/lib/ai-client')

  const system = `Eres experto en errores de transcripción ASR (Whisper) en hostelería española.
Tu trabajo: dado el nombre de un plato, generar variantes fonéticas de cómo Whisper podría transcribirlo MAL en un bar ruidoso.
Responde SOLO con un JSON array de strings. Sin texto adicional, sin markdown, sin explicaciones.`

  const user = `Producto: "${nombreProducto}"${contexto ? `\nContexto: ${contexto}` : ''}

Genera 4-6 variantes fonéticas de cómo un camarero podría pronunciarlo y Whisper podría transcribirlo mal.
Incluye: apócopes, metátesis, elisiones de sílabas, errores de vocal, abreviaciones coloquiales.
Excluye: el nombre correcto exacto (ya está en la BD).

Ejemplos de estilo esperado:
- "Salmonete" → ["salmo","salmone","sal morena","salmonte","salmonet"]
- "Croquetas de jamón" → ["croqueta jamon","croketas","croqueta de jamo","croquet jamon"]
- "Patatas bravas" → ["patata brava","bravas","patata abrava","padatas bravas"]
- "Tortilla española" → ["tortilla españo","tortilla espanol","tortiña","tortilla de patata"]

Devuelve SOLO el array JSON:`

  try {
    // noFallback=false: tarea auxiliar, si NIM falla usamos Haiku
    const raw = await callAI(system, user, 120, 8_000, false)
    const clean = cleanJSON(raw)
    const parsed = JSON.parse(clean)
    if (!Array.isArray(parsed)) return []
    // Filtrar strings válidos y normalizar a minúsculas sin duplicados
    return [...new Set(
      parsed
        .filter((s: unknown) => typeof s === 'string' && s.trim().length >= 2)
        .map((s: string) => s.trim().toLowerCase())
    )] as string[]
  } catch (e) {
    console.warn('[FUZZY] generarAliasFoneticos falló (non-critical):', (e as Error).message)
    return []
  }
}
