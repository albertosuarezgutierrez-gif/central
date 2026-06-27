import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { atEpPorCnae } from '@central/module-nominas'
import { iaChat, iaDisponible } from './ai'

const AT_EP_DEFAULT = 0.015

/**
 * Resuelve el tipo AT/EP de la empresa por este orden:
 *   1. Valor ya guardado en rrhh.empresas.at_ep_tipo
 *   2. Tabla estática por CNAE (atEpPorCnae de @central/module-nominas)
 *   3. Pregunta a la IA (con búsqueda) si la tabla no tiene el CNAE
 *   4. Fallback: AT_EP_DEFAULT (1,5%)
 * Cuando se resuelve por 2 ó 3, persiste el valor en la BD para evitar consultas repetidas.
 */
export async function resolverAtEp(empresaId: string): Promise<number> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT cnae_codigo, at_ep_tipo FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  const empresa = rows[0]
  if (!empresa) return AT_EP_DEFAULT

  if (empresa.at_ep_tipo != null) return Number(empresa.at_ep_tipo)

  const cnae = empresa.cnae_codigo as string | null
  if (cnae) {
    const tasaEstatica = atEpPorCnae(cnae)
    if (tasaEstatica !== undefined) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE rrhh.empresas SET at_ep_tipo = ${tasaEstatica} WHERE id = ${empresaId}::uuid`)
      return tasaEstatica
    }

    if (iaDisponible()) {
      try {
        const resp = await iaChat(
          [{ role: 'user', content: `CNAE: ${cnae}. Tasa AT/EP (accidentes de trabajo) media de este sector en España 2026. Solo el decimal, p. ej. 0.0240` }],
          { system: 'Experto en cotizaciones SS España. Responde SOLO con el decimal de la tasa AT/EP.', maxTokens: 20 },
        )
        const tasa = parseFloat(resp.trim())
        if (isFinite(tasa) && tasa >= 0.001 && tasa < 0.2) {
          await prisma.$executeRaw(Prisma.sql`
            UPDATE rrhh.empresas SET at_ep_tipo = ${tasa} WHERE id = ${empresaId}::uuid`)
          return tasa
        }
      } catch (e) {
        console.error('[at-ep] fallo IA:', e instanceof Error ? e.message : e)
      }
    }
  }

  return AT_EP_DEFAULT
}
