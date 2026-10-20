// La comparativa GUARDADA (20/10/2026, comparativa única): huella de la entrada y reutilización del resumen.
//
// El estudio se guarda en `presupuesto.estudio` (sin migración): tabla (`comparacion`) + texto (`narrativa`) +
// `huella` (sha256 de `textoHuellaComparativa`: versión del motor, ramo, superficie, ofertas y recomendada).
// Al volver a preparar un presupuesto de las MISMAS ofertas, el resumen se REUTILIZA del último estudio con esa
// huella (no se vuelve a pagar la IA ni cambia el texto que el corredor ya leyó); solo se regenera si cambia la
// huella o el corredor lo pide (`regenerarResumen`).
//
// 🛡️ Todo por `correduria_id` (BYPASSRLS: sin el filtro se leería el estudio de otra correduría).

import { prismaAsegura } from './asegura-db'
import type { Narrativa } from './estudio-ia'
import { narrativaDeEstudio, narrativaReutilizable } from './comparativa-huella'

export { huellaComparativa, narrativaDeEstudio, narrativaReutilizable } from './comparativa-huella'

export type EstudioGuardado = {
  presupuestoId: string
  generadoAt: string | null
  huella: string | null
  narrativa: Narrativa | null
}

/**
 * El último estudio guardado de la oportunidad (cualquier presupuesto de ofertas, también uno retirado: el texto
 * ya se escribió). Con `huella`, solo uno con esa huella. `null` = no hay. Un fallo de consulta LANZA.
 */
export async function ultimoEstudioGuardado(correduriaId: string, oportunidadId: string, huella?: string | null, opts: { soloIa?: boolean } = {}): Promise<EstudioGuardado | null> {
  const filas = await prismaAsegura().presupuesto.findMany({
    where: {
      correduriaId,
      oportunidadId,
      origen: 'ofertas',
      ...(huella ? { estudio: { path: ['huella'], equals: huella } } : {}),
    },
    orderBy: { creadoAt: 'desc' },
    take: opts.soloIa ? 10 : 1,
    select: { id: true, estudio: true },
  })
  // `soloIa`: el último cuyo resumen redactó la IA (una plantilla de respaldo no se hereda como si lo fuera).
  const p = opts.soloIa ? filas.find((f) => narrativaReutilizable(narrativaDeEstudio(f.estudio))) : filas[0]
  if (!p) return null
  const e = p.estudio && typeof p.estudio === 'object' && !Array.isArray(p.estudio) ? (p.estudio as Record<string, unknown>) : {}
  return {
    presupuestoId: p.id,
    generadoAt: typeof e.generadoAt === 'string' ? e.generadoAt : null,
    huella: typeof e.huella === 'string' ? e.huella : null,
    narrativa: narrativaDeEstudio(p.estudio),
  }
}

/**
 * La narrativa para un estudio nuevo: la guardada con la MISMA huella si la hay (y no se pide regenerar), o la que
 * dé `generar()`. Solo se REUTILIZA una redactada por la IA (que ya pasó sus cepos): una de PLANTILLA (la IA falló
 * o no había cupo) no se hereda, y la próxima consolidación vuelve a intentar la IA (`generar` decide si hay cupo;
 * si no, vuelve a salir plantilla, con su origen `fuente: 'determinista'` en el estudio).
 * Nunca lanza: si leer lo guardado falla, se genera (lo peor es pagar una IA de más).
 */
export async function narrativaConReutilizacion(
  correduriaId: string,
  oportunidadId: string,
  huella: string,
  regenerar: boolean,
  generar: () => Promise<Narrativa>,
): Promise<{ narrativa: Narrativa; reutilizadaDe: string | null }> {
  if (!regenerar) {
    const g = await ultimoEstudioGuardado(correduriaId, oportunidadId, huella, { soloIa: true }).catch(() => null)
    if (narrativaReutilizable(g?.narrativa)) return { narrativa: g.narrativa, reutilizadaDe: g.presupuestoId }
  }
  return { narrativa: await generar(), reutilizadaDe: null }
}
