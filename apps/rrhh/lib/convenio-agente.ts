import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { geminiSearch, aiComplete } from '@central/core-ai'
import { construirPromptConvenio, parsearConvenio, type ConvenioDatos } from '@/lib/convenio-prompt'

const AVISO = 'Datos extraídos por IA — ORIENTATIVOS. Verifícalos con el texto oficial del convenio antes de aplicarlos.'

export type ResultadoAnalisis = { ok: boolean; mensaje?: string; datos?: ConvenioDatos }

/**
 * Agente especialista en convenios: analiza el convenio de UNA empresa (por su código REGCON),
 * extrae sus datos clave con IA (Gemini con búsqueda web; NIM como fallback sin búsqueda) y los
 * guarda en `rrhh.empresas.convenio_datos`. Reutilizable por cualquier empresa.
 */
export async function analizarConvenio(empresaId: string): Promise<ResultadoAnalisis> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT convenio_codigo, convenio_nombre FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  const codigo: string | null = rows[0]?.convenio_codigo ?? null
  if (!codigo) return { ok: false, mensaje: 'Primero indica el código del convenio en «Mi cuenta».' }

  const { system, user } = construirPromptConvenio(codigo, rows[0]?.convenio_nombre ?? null)

  let texto: string
  let conBusqueda: boolean
  try {
    if (process.env.GEMINI_API_KEY) {
      texto = await geminiSearch({ apiKey: process.env.GEMINI_API_KEY }, system, user, { maxTokens: 1200, timeoutMs: 40_000 })
      conBusqueda = true
    } else if (process.env.NVIDIA_API_KEY) {
      texto = await aiComplete(user, { system, maxTokens: 900, timeoutMs: 20_000 })
      conBusqueda = false
    } else {
      console.error('[convenio] sin GEMINI_API_KEY ni NVIDIA_API_KEY en runtime')
      return { ok: false, mensaje: 'El agente de convenios no está disponible (falta configurar la IA).' }
    }
  } catch (e) {
    console.error('[convenio] fallo IA:', e instanceof Error ? `${e.name}: ${e.message}` : e)
    return { ok: false, mensaje: 'No se pudo analizar el convenio ahora mismo. Inténtalo más tarde.' }
  }

  const datos = parsearConvenio(texto)
  const guardado = { ...datos, _meta: { con_busqueda: conBusqueda, generado_at: new Date().toISOString(), aviso: AVISO } }
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.empresas SET convenio_datos = ${JSON.stringify(guardado)}::jsonb, convenio_actualizado_at = now()
    WHERE id = ${empresaId}::uuid`)
  return { ok: true, datos }
}
