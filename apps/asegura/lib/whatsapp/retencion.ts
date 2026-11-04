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
//   · En los tres casos, el EXTRACTO (redactado) del registro de aprendizaje (`whatsapp_aprendizaje`, SQL 2026-11-04b)
//     se anula con la conversación; la fila queda (es la racha de autonomía), sin texto del cliente.

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
    await anularExtractos(tx, correduriaId, conversacionId)
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
  const [ap] = await db.$queryRaw<{ existe: boolean }[]>(Prisma.sql`select to_regclass('whatsapp_aprendizaje') is not null as existe`)
  if (ap?.existe) {
    await db.$executeRaw(Prisma.sql`
      update whatsapp_aprendizaje set extracto = null, observacion = null
       where correduria_id = ${correduriaId}::uuid and (extracto is not null or observacion is not null)
         and creada_at < now() - make_interval(days => ${dias}::int)`)
  }
  return { mensajes, crudos }
}

type Tx = Parameters<Parameters<ReturnType<typeof prismaAsegura>['$transaction']>[0]>[0]

/** El extracto redactado del registro de aprendizaje, fuera con la conversación. Sin la tabla (SQL sin aplicar), nada. */
async function anularExtractos(tx: Tx, correduriaId: string, conversacionId: string): Promise<void> {
  // Se comprueba ANTES para no abortar la transacción con un «relation does not exist».
  const [ap] = await tx.$queryRaw<{ existe: boolean }[]>(Prisma.sql`select to_regclass('whatsapp_aprendizaje') is not null as existe`)
  if (!ap?.existe) return
  await tx.$executeRaw(Prisma.sql`
    update whatsapp_aprendizaje set extracto = null, observacion = null
     where correduria_id = ${correduriaId}::uuid and conversacion_id = ${conversacionId}::uuid`)
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
    // 04/11/2026 (SQL 2026-11-04, si está aplicado; se comprueba ANTES para no abortar la transacción): los salientes
    // previstos casados con sus echos y los ficheros que el cliente mandó por WhatsApp (spec §8: la supresión los incluye).
    // Una PÓLIZA ya leída (tipo 'poliza') alimentó una oportunidad: es dato de la cartera y va por el procedimiento de
    // la ficha (y otras tablas la referencian sin ON DELETE); aquí solo se borran los ficheros que no pasaron de 'otro'.
    const [ext] = await tx.$queryRaw<{ salientes: boolean; media: boolean }[]>(Prisma.sql`
      select to_regclass('whatsapp_salientes_previstos') is not null as salientes,
             exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'mensajes'
                      and column_name = 'media_documento_id') as media`)
    if (ext?.salientes) {
      await tx.$executeRaw(Prisma.sql`
        delete from whatsapp_salientes_previstos s
         where s.correduria_id = ${correduriaId}::uuid
           and (s.mensaje_id in (select id from mensajes where conversacion_id = ${conversacionId}::uuid)
                or s.telefono_hash = (select wa_telefono_hash from conversaciones where id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid))`)
    }
    if (ext?.media) {
      await tx.$executeRaw(Prisma.sql`
        delete from documentos d
         where d.correduria_id = ${correduriaId}::uuid and d.subido_por = 'cliente' and d.notas = 'Recibido por WhatsApp' and d.tipo = 'otro'
           and d.id in (select media_documento_id from mensajes where conversacion_id = ${conversacionId}::uuid and media_documento_id is not null)
           and not exists (select 1 from tarificador_fichas x where x.origen_documento_id = d.id)
           and not exists (select 1 from solicitud_regularizacion x where x.documento_id = d.id)`)
    }
    await anularExtractos(tx, correduriaId, conversacionId)
    // Las trazas del bot heredado apuntan a conversaciones (FK): las de esta, fuera también.
    await tx.$executeRaw(Prisma.sql`delete from bot_turn_traces where conversacion_id = ${conversacionId}::uuid`)
    const mensajes = await tx.$executeRaw(Prisma.sql`delete from mensajes where conversacion_id = ${conversacionId}::uuid`)
    await tx.$executeRaw(Prisma.sql`delete from conversaciones where id = ${conversacionId}::uuid and correduria_id = ${correduriaId}::uuid`)
    return { ok: true as const, mensajes, crudos }
  })
}
