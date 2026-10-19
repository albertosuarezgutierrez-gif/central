// Responder a un LEAD por correo, en su hilo (19/10/2026, spec lead → propuesta F1). Puerto
// `POST /api/operador/correo/lead`; lo llama plataforma SOLO cuando Alberto ha pulsado «✅ Enviar» en Telegram.
//
// asegura es quien manda correos a clientes y deja rastro (`correo_envio` + historial de la ficha), así que el envío
// va por aquí y no por un transporte nuevo en plataforma. Reglas:
//   - Solo a la dirección que YA es de la ficha: el `to` que manda plataforma (el From del lead) tiene que casar por
//     índice ciego con el email principal de la ficha o con uno de sus emails. Si no, 409 y no sale nada: el puerto no
//     puede convertirse en un «manda lo que sea a quien sea».
//   - Ficha con baja de correos (`email_opt_out_at`) → 409; Alberto le contesta a mano si procede.
//   - En el hilo (`enRespuestaA`), con copia oculta a hola@ (lo enviado por Resend no aparece en «Enviados» de
//     Gmail) y clave de idempotencia (`clp-<id del pendiente>`): el mismo botón no manda dos correos por Resend.
//   - Tras salir: historial `contacto` en la ficha y fila en `seguros.correduria_hilo` (ata el Message-ID raíz a la
//     oportunidad para leer su respuesta en F2). Sin la tabla (SQL 2026-10-19b sin aplicar), el correo YA salió: se
//     dice `hilo: 'sin_tabla'` y no se falla.
// Nunca se loguea el email ni el texto.
import { Prisma } from './generated/asegura-client'
import { MEDIADOR } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
// `seguros.correduria_hilo` va por el cliente de la puerta única (`lib/tenant`), como `oportunidad-riesgo.ts`: toda
// fila lleva y se filtra por el `correduria_id` que resolvió la ruta (`correduriaUnica`).
import { prisma as prismaTenant } from './tenant'
import { Prisma as PrismaTenant } from '@prisma/client'

import { TIPO_CORREO_PETICION_LEAD, textoHistorialEnvioLead, type EnvioLead } from './correo-lead-puro'
export { TIPO_CORREO_PETICION_LEAD, validarEnvioLead, type EnvioLead } from './correo-lead-puro'

export type ResultadoEnvioLead =
  | { estado: 'enviado'; historial: boolean; hilo: 'ok' | 'sin_tabla' | 'error' }
  | { estado: 'no_encontrado' | 'email_no_es_de_la_ficha' | 'baja_de_correos' | 'sin_proveedor' }
  | { estado: 'rechazado'; motivo: string }

export async function enviarPeticionLead(correduriaId: string, e: EnvioLead): Promise<ResultadoEnvioLead> {
  const db = prismaAsegura()
  const cli = await db.cliente.findFirst({
    where: { id: e.clienteId, correduriaId, mergedIntoClienteId: null },
    select: { emailLookupHash: true, emailOptOutAt: true, emails: { select: { emailLookupHash: true } } },
  })
  if (!cli) return { estado: 'no_encontrado' }
  const { computeEmailLookupHash } = await import('@central/module-seguros-pii')
  let h: string | null = null
  try { h = computeEmailLookupHash(e.to) } catch { h = null }
  const hashes = new Set([cli.emailLookupHash, ...cli.emails.map((x) => x.emailLookupHash)].filter((x): x is string => !!x))
  if (!h || !hashes.has(h)) return { estado: 'email_no_es_de_la_ficha' }
  if (cli.emailOptOutAt) return { estado: 'baja_de_correos' }

  const { enviarCorreoSeguido } = await import('./correo-envio')
  const r = await enviarCorreoSeguido({
    correduriaId, clienteId: e.clienteId, tipo: TIPO_CORREO_PETICION_LEAD, to: e.to, asunto: e.asunto, texto: e.texto,
    enRespuestaA: e.enRespuestaA, copiaOculta: MEDIADOR.identidad.email, idempotencia: e.idempotencia,
  })
  if (r.resultado === 'sin_proveedor') return { estado: 'sin_proveedor' }
  if (r.resultado !== 'enviado') return { estado: 'rechazado', motivo: (r.motivo ?? 'el proveedor lo rechazó').slice(0, 200) }

  // El correo YA salió: nada de aquí abajo puede convertirlo en un fallo (se reintentaría y saldría dos veces).
  let historial = false
  try {
    await db.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${e.clienteId}::uuid, cast('contacto' as tipo_historial_interno), ${textoHistorialEnvioLead(e.asunto, e.actor)})`)
    historial = true
  } catch (err) {
    console.error('[correo-lead] historial no anotado:', err instanceof Error ? err.name : 'error')
  }
  const hilo = await registrarHilo(correduriaId, e, h)
  return { estado: 'enviado', historial, hilo }
}

async function registrarHilo(correduriaId: string, e: EnvioLead, emailCiego: string): Promise<'ok' | 'sin_tabla' | 'error'> {
  const raiz = e.enRespuestaA.references[0] ?? e.enRespuestaA.messageId
  const ids = [...new Set([...e.enRespuestaA.references, e.enRespuestaA.messageId])]
  const ops: (string | null)[] = e.oportunidadIds.length ? e.oportunidadIds : [null]
  try {
    for (const op of ops) {
      await prismaTenant.$executeRaw(PrismaTenant.sql`
        insert into seguros.correduria_hilo as h
          (correduria_id, oportunidad_id, cliente_id, message_id_raiz, message_ids, email_cliente_ciego, estado_datos, ultima_peticion_at)
        select ${correduriaId}::uuid, ${op}::uuid, ${e.clienteId}::uuid, ${raiz}, ${ids}::text[], ${emailCiego}, 'pedida', now()
        where ${op}::uuid is null or exists (
          select 1 from seguros.oportunidades o where o.id = ${op}::uuid and o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${e.clienteId}::uuid)
        on conflict (correduria_id, cliente_id, message_id_raiz, (coalesce(oportunidad_id, '00000000-0000-0000-0000-000000000000'::uuid)))
        do update set message_ids = array(select distinct unnest(h.message_ids || excluded.message_ids)),
                      estado_datos = 'pedida', ultima_peticion_at = now()`)
    }
    return 'ok'
  } catch (err) {
    const code = (err as { code?: string; meta?: { code?: string } })?.meta?.code ?? (err as { code?: string })?.code
    if (code === '42P01' || /correduria_hilo.*does not exist|relation .* does not exist/i.test(String((err as Error)?.message))) return 'sin_tabla'
    console.error('[correo-lead] hilo no registrado:', err instanceof Error ? err.name : 'error')
    return 'error'
  }
}
