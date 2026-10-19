// F3b (19/10/2026) — un bot LANZADO DESDE UN LEAD (botón 🤖 `clp_tar`) ha fallado: aviso en Telegram EN EL HILO del aviso
// «Listo para tarificar» y, si el fallo es un dato del CLIENTE, botón «📝 Preparar repregunta» (`clp_fal:<p>`, lo resuelve
// plataforma con su borrador F2 y su ✅). NUNCA se reintenta solo. Las reglas viven en `tarificacion-lead-puro.ts` (con test).
//
// Lo llama `POST /api/tarificador/resultado` en `after()` (el worker no espera), solo con un fallo terminal. Un trabajo que no
// salió de un lead (sin fila `tarificacion_bots_lead` que lo nombre) no hace nada. Un aviso por trabajo (fila
// `tarificacion_bot_fallo_lead` en el historial). 🛡️ Todo SQL por `correduria_id`. Ni el mensaje del portal ni un valor del
// cliente salen de aquí: compañía, ramo, etiquetas y el id corto del pendiente.
import { tgSendButtons, tgSend } from '@central/core-telegram'
import { prisma } from './tenant'
import { clasificarFalloBot, esFalloTerminal, textoFalloBotLead } from './tarificacion-lead-puro'

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const ID_CORTO = /^\d{1,15}$/

export type AvisoFallo = { estado: 'no_es_de_lead' | 'no_terminal' | 'ya_avisado' | 'avisado' | 'sin_telegram' | 'error' }

export async function avisarFalloBotLead(trabajoId: string): Promise<AvisoFallo> {
  try {
    const [t] = await prisma.$queryRaw<{ correduria_id: string; oportunidad_id: string | null; compania: string; ramo: string; estado: string; error: unknown }[]>`
      select w.correduria_id::text as correduria_id, w.oportunidad_id::text as oportunidad_id, w.compania, w.ramo, w.estado, w.error
      from seguros.tarificacion_trabajos w where w.id = ${trabajoId}::uuid`
    if (!t || !t.oportunidad_id) return { estado: 'no_es_de_lead' }
    if (!esFalloTerminal(t.estado)) return { estado: 'no_terminal' }
    const [lanz] = await prisma.$queryRaw<{ detalle: unknown }[]>`
      select h.detalle from seguros.oportunidad_historial h
      where h.correduria_id = ${t.correduria_id}::uuid and h.oportunidad_id = ${t.oportunidad_id}::uuid
        and h.accion = 'tarificacion_bots_lead' and h.detalle->'trabajos' ? ${trabajoId}
      order by h.created_at desc limit 1`
    if (!lanz) return { estado: 'no_es_de_lead' }
    const d = esObj(lanz.detalle) ? lanz.detalle : {}
    const pendienteId = typeof d.pendienteId === 'string' && ID_CORTO.test(d.pendienteId) ? d.pendienteId : null
    const tgMessageId = typeof d.tgMessageId === 'string' && ID_CORTO.test(d.tgMessageId) ? Number(d.tgMessageId) : null
    const error = esObj(t.error) ? t.error : null
    const clase = clasificarFalloBot(t.compania, t.ramo, error)
    // Un aviso por trabajo: la fila del historial es la marca (y la fuente de `fallosDatoLead` para la repregunta).
    const marca = await prisma.$queryRaw<{ ok: number }[]>`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      select ${t.correduria_id}::uuid, ${t.oportunidad_id}::uuid, 'tarificacion_bot_fallo_lead',
             ${JSON.stringify({ trabajoId, compania: t.compania, claves: clase.tipo === 'dato_cliente' ? clase.claves : [] })}::jsonb, 'agente:tarificador'
      where not exists (
        select 1 from seguros.oportunidad_historial x
        where x.correduria_id = ${t.correduria_id}::uuid and x.oportunidad_id = ${t.oportunidad_id}::uuid
          and x.accion = 'tarificacion_bot_fallo_lead' and x.detalle->>'trabajoId' = ${trabajoId})
      returning 1 as ok`
    if (!marca.length) return { estado: 'ya_avisado' }
    const texto = textoFalloBotLead({ compania: t.compania, ramo: t.ramo, pendienteId, clase, tipoError: typeof error?.tipo === 'string' ? error.tipo : null })
    const enHilo = tgMessageId !== null ? { responderA: tgMessageId } : {}
    const msg = clase.tipo === 'dato_cliente' && pendienteId
      ? await tgSendButtons(texto, [[{ texto: '📝 Preparar repregunta', callback: `clp_fal:${pendienteId}` }]], enHilo)
      : await tgSend(texto, { html: true, ...enHilo })
    return { estado: msg === null ? 'sin_telegram' : 'avisado' }
  } catch (e) {
    console.error('[tarificador] aviso de fallo del lead:', e instanceof Error ? e.name : 'error')
    return { estado: 'error' }
  }
}
