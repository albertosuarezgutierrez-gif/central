// Boca Telegram del agente PATRIMONIAL: responde a las preguntas de Alberto sobre su patrimonio
// (comando /patrimonio o mención de «patrimonio») y registra sus decisiones sobre las
// recomendaciones del `patrimonio-cfo` (botones ptr_ok / ptr_no / ptr_det del webhook).
//
// Reparto de papeles: las CIFRAS salen siempre de la BD (getPatrimonio + patrimonio_recomendaciones);
// la IA (aiComplete, pasarela gratis) solo redacta y compara sobre ese contexto. Si la BD no se
// puede leer se dice — nunca se responde con ceros tranquilizadores (regla raíz del CLAUDE.md).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend, escapeHtml } from '@central/core-telegram'
import { getPatrimonio } from '@/lib/patrimonio'
import { aiComplete } from '@/lib/ai-client'
import {
  fotoPatrimonioTg, contextoPatrimonioIA, preguntaDe,
  type RecomendacionViva, type RecoContexto,
} from '@/lib/patrimonio-chat'

type RecoFila = { id: number; fecha: Date; titulo: string; recomendacion: string }

// Recomendaciones sin decidir. `null` = no se pudo leer la tabla — que aguas abajo NO se
// presente como «no hay recomendaciones».
async function recomendacionesVivas(cuentaId: string, max = 5): Promise<RecoContexto[] | null> {
  try {
    const filas = await prisma.$queryRaw<RecoFila[]>(Prisma.sql`
      SELECT id, fecha, titulo, recomendacion
      FROM patrimonio_recomendaciones
      WHERE cuenta_id = ${cuentaId}::uuid AND decision_alberto IS NULL
      ORDER BY fecha DESC, id DESC
      LIMIT ${max}
    `)
    return filas.map((f) => ({
      id: Number(f.id), fecha: f.fecha.toISOString().slice(0, 10),
      titulo: f.titulo, recomendacion: f.recomendacion,
    }))
  } catch (e) {
    console.error('[patrimonio-tg] recomendacionesVivas:', e)
    return null
  }
}

// Mensaje de texto de Alberto para el canal patrimonial. Sin pregunta (o «foto»/«resumen») →
// foto determinista; con pregunta → IA sobre el contexto de la BD, con la foto de red de
// seguridad si la pasarela no responde.
export async function manejarPatrimonioTg(cuentaId: string, texto: string): Promise<void> {
  let pat
  try {
    pat = await getPatrimonio(cuentaId)
  } catch (e) {
    console.error('[patrimonio-tg] getPatrimonio:', e)
    await tgSend('⚠️ No he podido leer la base patrimonial ahora mismo (error de BD). Vuelve a preguntarme en un rato.').catch(() => {})
    return
  }
  const recos = await recomendacionesVivas(cuentaId)
  const pregunta = preguntaDe(texto)

  if (!pregunta || /^(foto|resumen)$/i.test(pregunta)) {
    await tgSend(fotoPatrimonioTg(pat.resumen, pat.activos, recos, pat.intake), { html: true }).catch(() => {})
    return
  }

  const { system, user } = contextoPatrimonioIA(pat.resumen, pat.activos, recos, pregunta)
  let respuesta = ''
  try {
    respuesta = (await aiComplete(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { timeoutMs: 45_000 },
    )).trim()
  } catch (e) {
    console.error('[patrimonio-tg] aiComplete:', e)
  }
  if (!respuesta) {
    await tgSend(
      '🤖 La IA no está disponible ahora mismo — te dejo la foto con los datos en crudo:\n\n' +
        fotoPatrimonioTg(pat.resumen, pat.activos, recos, pat.intake),
      { html: true },
    ).catch(() => {})
    return
  }
  await tgSend(escapeHtml(respuesta)).catch(() => {})
}

// Registra la decisión de Alberto sobre una recomendación (botón ptr_ok / ptr_no).
// Devuelve el título, o null si el id no existe para su cuenta. Se permite re-decidir
// (cambiar de opinión pisa la decisión anterior y refresca decidido_at).
export async function resolverRecomendacionTg(
  cuentaId: string, recoId: string, decision: 'aceptada' | 'rechazada',
): Promise<string | null> {
  const filas = await prisma.$queryRaw<{ titulo: string }[]>(Prisma.sql`
    UPDATE patrimonio_recomendaciones
    SET decision_alberto = ${decision}, decidido_at = now()
    WHERE id = ${Number(recoId)} AND cuenta_id = ${cuentaId}::uuid
    RETURNING titulo
  `).catch(() => [] as { titulo: string }[])
  return filas[0]?.titulo ?? null
}

// Detalle completo de una recomendación (botón ptr_det): texto íntegro + estado de decisión.
export async function detalleRecomendacionTg(cuentaId: string, recoId: string): Promise<string | null> {
  const filas = await prisma.$queryRaw<Array<{
    fecha: Date; titulo: string; recomendacion: string
    decision_alberto: string | null; decidido_at: Date | null
  }>>(Prisma.sql`
    SELECT fecha, titulo, recomendacion, decision_alberto, decidido_at
    FROM patrimonio_recomendaciones
    WHERE id = ${Number(recoId)} AND cuenta_id = ${cuentaId}::uuid
    LIMIT 1
  `).catch(() => [])
  const f = filas[0]
  if (!f) return null
  const decision = f.decision_alberto
    ? `Decisión: ${escapeHtml(f.decision_alberto)} (${f.decidido_at?.toISOString().slice(0, 10) ?? 'fecha sin dato'})`
    : 'Decisión: pendiente'
  return (
    `🧭 <b>${escapeHtml(f.titulo)}</b> <i>(${f.fecha.toISOString().slice(0, 10)})</i>\n\n` +
    `${escapeHtml(f.recomendacion)}\n\n${decision}`
  )
}
