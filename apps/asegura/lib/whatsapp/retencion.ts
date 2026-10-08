// Retención y supresión del canal WhatsApp (RGPD).
//
//   · `purgarPorRetencion`: el TEXTO de los mensajes de más de WHATSAPP_RETENCION_DIAS (730 por
//     defecto) se borra (`contenido = ''`, `texto_purgado_at`); queda que hubo un mensaje, cuándo y
//     en qué dirección. El crudo de Meta sin procesar o sin minimizar de más de 30 días se minimiza.
//   · `purgarTextoConversacion`: lo mismo para UNA conversación entera (la IA la clasifica como
//     personal → `descartada_personal`, sin nombre de perfil ni número cifrado; queda el hash para
//     reconocer los siguientes mensajes y no volver a guardar su texto).
//   · `borrarConversacion`: derecho de supresión. Borra la conversación, sus mensajes y su crudo.
//     Lo que la IA ya escribió en la FICHA (tareas, notas, oportunidades) es dato de la cartera y se
//     suprime por el procedimiento de la ficha, no aquí.

import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { RETENCION_CRUDO_DIAS } from './config'

const MINIMO = JSON.stringify({ minimizado: true })

export async function purgarTextoConversacion(correduriaId: string, conversacionId: string, opciones: { descartar?: boolean } = {}): Promise<number> {
  const db = prismaAsegura()
  return db.$transaction(async (tx) => {
    const [conv] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id::text as id from conversaciones
       where id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid for update`)
    if (!conv) return 0
    const n = await tx.$executeRaw(Prisma.sql`
      update mensajes set contenido = '', texto_purgado_at = now()
       where conversacion_id = ${conversacionId}::uuid and direccion is not null and texto_purgado_at is null`)
    await tx.$executeRaw(Prisma.sql`
      update channel_inbound_messages
         set payload = case when payload_minimizado_at is null then ${MINIMO}::jsonb else payload end,
             payload_minimizado_at = coalesce(payload_minimizado_at, now()),
             message_text = null, lead_name = null, lead_phone = null
       where conversacion_id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid`)
    if (opciones.descartar) {
      // Solo si sigue SIN ficha: una conversación con ficha no se descarta por la IA.
      await tx.$executeRaw(Prisma.sql`
        update conversaciones
           set estado = 'descartada_personal', clasificada_at = now(), wa_perfil_nombre_cifrado = null,
               wa_telefono_cifrado = null, analisis = null, updated_at = now()
         where id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid and cliente_id is null`)
    }
    return n
  })
}

export async function purgarPorRetencion(correduriaId: string, dias: number, lote = 5000): Promise<{ mensajes: number; crudos: number }> {
  const db = prismaAsegura()
  const mensajes = await db.$executeRaw(Prisma.sql`
    update mensajes m set contenido = '', texto_purgado_at = now()
     where m.id in (
       select m2.id from mensajes m2 join conversaciones c on c.id = m2.conversacion_id
        where c.correduria_id = ${correduriaId}::uuid and m2.direccion is not null and m2.texto_purgado_at is null
          and m2.enviado_at < now() - make_interval(days => ${dias}::int)
        limit ${lote})`)
  const crudos = await db.$executeRaw(Prisma.sql`
    update channel_inbound_messages
       set payload = ${MINIMO}::jsonb, payload_minimizado_at = now(), message_text = null, lead_name = null, lead_phone = null
     where id in (
       select id from channel_inbound_messages
        where channel = 'whatsapp' and correduria_id = ${correduriaId}::uuid and payload_minimizado_at is null
          and received_at < (now() at time zone 'UTC') - make_interval(days => ${RETENCION_CRUDO_DIAS}::int)
        limit ${lote})`)
  return { mensajes, crudos }
}

export type ResultadoBorrado = { ok: true; mensajes: number; crudos: number } | { ok: false; motivo: 'no_encontrada' }

/** Supresión completa de UNA conversación de esta correduría. Atómica. */
export async function borrarConversacion(correduriaId: string, conversacionId: string): Promise<ResultadoBorrado> {
  return prismaAsegura().$transaction(async (tx) => {
    const [conv] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id::text as id from conversaciones
       where id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid and wa_telefono_hash is not null for update`)
    if (!conv) return { ok: false as const, motivo: 'no_encontrada' as const }
    const crudos = await tx.$executeRaw(Prisma.sql`
      delete from channel_inbound_messages where conversacion_id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid`)
    // Las trazas del bot heredado apuntan a conversaciones (FK): las de esta, fuera también.
    await tx.$executeRaw(Prisma.sql`delete from bot_turn_traces where conversacion_id = ${conversacionId}::uuid`)
    const mensajes = await tx.$executeRaw(Prisma.sql`delete from mensajes where conversacion_id = ${conversacionId}::uuid`)
    await tx.$executeRaw(Prisma.sql`delete from conversaciones where id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid`)
    return { ok: true as const, mensajes, crudos }
  })
}
