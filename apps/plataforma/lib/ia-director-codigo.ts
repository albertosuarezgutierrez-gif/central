// Agente DIRECTOR — extensión de CÓDIGO. Dada una orden de desarrollo ("arregla el bug del login"),
// ACOTA a coste 0 tokens qué archivo(s) tocar consultando la tabla `mapa_arquitectura` (índice de
// firmas generado por scripts/auditar-estructura.mjs) y ELIGE el modelo dentro del presupuesto
// reutilizando el Director de modelos (lib/ia-director.ts) + la telemetría de coste (ai_usos).
//
// NO edita código ni invoca al agente: devuelve los archivos candidatos + el modelo elegido. El
// orquestador entrega esos archivos COMPLETOS al agente programador y aplica el diff que devuelva.
// Filosofía idéntica al Director de modelos: NUNCA lanza; cualquier fallo → degrada (sinMapa=true).

import { prisma } from '@/lib/db'
import { elegirModelo, type Eleccion } from '@/lib/ia-director'
import { estimarTokens } from '@/lib/ai-gateway'
import type { NimChatMessage } from '@central/core-ai'

export type ArchivoAcotado = {
  ruta: string
  ambito: string | null
  resumen: string | null
  funciones: unknown
  tablas: string[]
  score: number
}

export type ResultadoAcotado = {
  /** Archivos candidatos ordenados por relevancia (los que el agente debería leer ENTEROS). */
  archivos: ArchivoAcotado[]
  /** Modelo elegido por el Director (con sus suplentes), dentro del presupuesto. */
  eleccion: Eleccion
  /** El mapa no está disponible/vacío (BD caída o tabla sin poblar) → caer al Grep/Read clásico. */
  sinMapa: boolean
  /** El mapa está viejo (última actualización > umbral) → el orquestador debería ampliar la búsqueda. */
  stale: boolean
  /** SHA de git del que se generó el mapa (informativo: un orquestador con el repo puede comparar con HEAD). */
  sha: string | null
  /** Tokens estimados del índice devuelto (para medir el ahorro frente a leer el repo entero). */
  tokensIndice: number
}

// Palabras que NO discriminan un archivo (ruido al acotar). Se quitan de la orden.
// Ya SIN acentos: la orden se normaliza (NFD + strip) antes de comparar, y la ñ se
// descompone (añade → anade), así que las entradas van en su forma despojada.
const STOP = new Set([
  'the', 'and', 'for', 'que', 'los', 'las', 'del', 'con', 'una', 'por', 'bug', 'fix',
  'arregla', 'arreglar', 'corrige', 'corregir', 'error', 'fallo', 'problema', 'cambia', 'cambiar',
  'anade', 'anadir', 'crea', 'crear', 'hacer', 'haz', 'quiero', 'necesito', 'when', 'donde', 'como',
])

/** Extrae palabras clave discriminantes de la orden (sin acentos, minúsculas, sin stopwords). */
export function keywordsDe(tarea: string): string[] {
  const limpio = tarea.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const palabras = limpio.split(/[^a-z0-9_]+/).filter(w => w.length >= 3 && !STOP.has(w))
  return [...new Set(palabras)].slice(0, 8)
}

/**
 * Acota los archivos que probablemente maneja `tarea` y elige el modelo para ejecutarla.
 * `topN` = nº máximo de archivos candidatos (default 6; se amplía si el mapa está viejo).
 */
export async function acotarArchivos(
  tarea: string,
  opts: { topN?: number; app?: string; clienteRef?: string | null } = {},
): Promise<ResultadoAcotado> {
  const messages: NimChatMessage[] = [{ role: 'user', content: tarea }]
  const eleccion = await elegirModelo(messages, { app: opts.app ?? 'codigo', clienteRef: opts.clienteRef ?? null })

  const kws = keywordsDe(tarea)
  const staleDias = Number(process.env.MAPA_STALE_DIAS ?? 7)
  let archivos: ArchivoAcotado[] = []
  let sinMapa = false
  let stale = false
  let sha: string | null = null

  if (!kws.length) {
    return { archivos: [], eleccion, sinMapa: false, stale: false, sha: null, tokensIndice: 0 }
  }

  try {
    // Frescura: última actualización del mapa + su SHA. Si es viejo, ampliamos el LIMIT.
    const meta = await prisma.$queryRaw<Array<{ ult: Date | null; sha: string | null }>>`
      SELECT max(updated_at) AS ult, max(sha) AS sha FROM mapa_arquitectura`
    const ult = meta[0]?.ult ? new Date(meta[0].ult) : null
    sha = meta[0]?.sha ?? null
    if (!ult) return { archivos: [], eleccion, sinMapa: true, stale: false, sha, tokensIndice: 0 }
    stale = (Date.now() - ult.getTime()) > staleDias * 86_400_000

    const patrones = kws.map(k => `%${k}%`)
    const consulta = kws.join(' ')
    const limite = (opts.topN ?? 6) * (stale ? 3 : 1)
    const filas = await prisma.$queryRaw<Array<{
      ruta: string; ambito: string | null; resumen: string | null; funciones: unknown; tablas: string[]; score: number
    }>>`
      SELECT ruta, ambito, resumen, funciones, tablas,
             GREATEST(word_similarity(${consulta}, busqueda), 0)::float AS score
      FROM mapa_arquitectura
      WHERE busqueda ILIKE ANY(${patrones}::text[])
      ORDER BY score DESC, length(ruta) ASC
      LIMIT ${limite}`
    archivos = filas.map(f => ({
      ruta: f.ruta, ambito: f.ambito, resumen: f.resumen,
      funciones: f.funciones, tablas: f.tablas ?? [], score: Number(f.score),
    }))
  } catch {
    sinMapa = true
  }

  const tokensIndice = estimarTokens(...archivos.map(a => `${a.ruta} ${a.resumen ?? ''} ${JSON.stringify(a.funciones)}`))
  return { archivos, eleccion, sinMapa, stale, sha, tokensIndice }
}
