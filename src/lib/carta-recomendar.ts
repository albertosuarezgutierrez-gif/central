// src/lib/carta-recomendar.ts
// Motor del "Maître IA": filtro de seguridad de alérgenos (en código) + prompt + callAI.
// Reutilizable por el QR (comensal) y, en el futuro, por /edge (camarero).

import { callAI, cleanJSON } from '@/lib/ai-client'

export interface MaitreConfig {
  nombre_asistente: string
  personalidad: 'clasico' | 'cercano' | 'gastro'
  num_sugerencias: number          // 2 o 3
  incluir_no_declarados: boolean   // incluir platos SIN alérgenos declarados cuando el comensal declara alergias
  permitir_antojo_texto: boolean
  mostrar_precios: boolean
}

export const MAITRE_DEFAULTS: MaitreConfig = {
  nombre_asistente: 'Maître IA',
  personalidad: 'cercano',
  num_sugerencias: 3,
  incluir_no_declarados: false,
  permitir_antojo_texto: true,
  mostrar_precios: true,
}

// Mezcla la config guardada (parcial) con los defaults seguros.
export function mergeMaitreConfig(raw: unknown): MaitreConfig {
  const c = (raw ?? {}) as Partial<MaitreConfig>
  const n = Number(c.num_sugerencias)
  return {
    nombre_asistente: typeof c.nombre_asistente === 'string' && c.nombre_asistente.trim() ? c.nombre_asistente.trim().slice(0, 40) : MAITRE_DEFAULTS.nombre_asistente,
    personalidad: c.personalidad === 'clasico' || c.personalidad === 'gastro' ? c.personalidad : 'cercano',
    num_sugerencias: n === 2 ? 2 : 3,
    incluir_no_declarados: c.incluir_no_declarados === true,
    permitir_antojo_texto: c.permitir_antojo_texto !== false,
    mostrar_precios: c.mostrar_precios !== false,
  }
}

export interface PlatoCarta {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  seccion: string | null
  categoria: string
  alergenos: string[] | null
}

export interface PlatoRecomendado {
  id: string
  nombre: string
  precio: number
  alergenos: string[]
  motivo: string
}

// Categorías que NO se recomiendan como "plato" (son bebidas).
const CATEGORIAS_EXCLUIDAS = new Set(['vino', 'bebida', 'bebidas', 'refresco', 'refrescos', 'cerveza', 'cervezas', 'cafe', 'café'])

const norm = (s: string) => s.toLowerCase().trim()

// FILTRO DE SEGURIDAD — se ejecuta SIEMPRE antes del LLM.
// Devuelve solo platos seguros para los alérgenos declarados.
export function filtrarSeguros(
  productos: PlatoCarta[],
  alergenosCliente: string[],
  incluirNoDeclarados: boolean
): PlatoCarta[] {
  const al = alergenosCliente.map(norm).filter(Boolean)
  return productos.filter(p => {
    if (CATEGORIAS_EXCLUIDAS.has(norm(p.categoria || ''))) return false
    if (al.length === 0) return true               // sin alergias declaradas → entra todo (no bebida)
    const declar = (p.alergenos ?? []).map(norm).filter(Boolean)
    if (declar.length === 0) return incluirNoDeclarados   // array vacío = "sin datos", no "sin alérgenos"
    return !declar.some(d => al.includes(d))
  })
}

const PERSONALIDAD_TONO: Record<MaitreConfig['personalidad'], string> = {
  clasico: 'Eres un maître clásico y formal de restaurante.',
  cercano: 'Eres un maître cercano y amable que aconseja como a un amigo.',
  gastro: 'Eres un maître gastronómico, descriptivo y evocador con la comida.',
}

const LANG_NAMES: Record<string, string> = {
  es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano',
  pt: 'portugués', ca: 'catalán', eu: 'euskera', gl: 'gallego', nl: 'neerlandés',
}

export interface RecomendarInput {
  productos: PlatoCarta[]
  alergenos: string[]
  antojo: string
  idioma: string
  comensales: number
  config: MaitreConfig
}

// Motor principal. Devuelve [] si no hay platos seguros o si el LLM falla.
export async function recomendarPlatos(input: RecomendarInput): Promise<PlatoRecomendado[]> {
  const { alergenos, antojo, idioma, comensales, config } = input
  const seguros = filtrarSeguros(input.productos, alergenos, config.incluir_no_declarados)
  if (seguros.length === 0) return []

  const idiomaNombre = LANG_NAMES[idioma] ?? 'español'
  const lista = seguros.slice(0, 80).map(p => {
    const precio = config.mostrar_precios ? ` | ${p.precio}€` : ''
    const desc = p.descripcion ? ` — ${p.descripcion}` : ''
    return `- id:${p.id} | ${p.nombre}${desc} | sección: ${p.seccion ?? '-'}${precio}`
  }).join('\n')

  const n = config.num_sugerencias
  const system = `${PERSONALIDAD_TONO[config.personalidad]}
El restaurante tiene estos platos DISPONIBLES Y SEGUROS para este comensal:
${lista}

Recomienda como MÁXIMO ${n} platos de esa lista que mejor encajen con lo que pide.
Usa SOLO los id que aparecen arriba. No inventes platos ni id.
Responde EXCLUSIVAMENTE con un array JSON válido, sin texto alrededor, con esta forma:
[{"id":"<id exacto>","motivo":"<una frase corta, máx 18 palabras, en ${idiomaNombre}>"}]`

  const userMsg = `Comensales: ${comensales}. Antojo/preferencia: ${antojo?.trim() || 'sin preferencia concreta, sorpréndeme'}.`

  let raw: string
  try {
    raw = await callAI(system, userMsg, 350)
  } catch {
    return []
  }

  let parsed: Array<{ id?: string; motivo?: string }>
  try {
    parsed = JSON.parse(cleanJSON(raw))
    if (!Array.isArray(parsed)) return []
  } catch {
    return []
  }

  // Defensa en profundidad: solo ids que estén en la lista segura.
  const byId = new Map(seguros.map(p => [p.id, p]))
  const out: PlatoRecomendado[] = []
  for (const r of parsed) {
    const p = r?.id ? byId.get(r.id) : undefined
    if (!p) continue
    if (out.some(o => o.id === p.id)) continue
    out.push({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      alergenos: p.alergenos ?? [],
      motivo: typeof r.motivo === 'string' ? r.motivo.trim().slice(0, 160) : '',
    })
    if (out.length >= n) break
  }
  return out
}
