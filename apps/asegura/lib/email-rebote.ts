// Rebote ≠ baja (07/11/2026): lo que hace la ficha cuando Resend avisa de un rebote, una supresión o una queja de
// CUALQUIER correo nuestro (felicitación, campaña, recaptación, avisos…). La regla es pura (`email-estado.ts`);
// aquí solo la BD. Lo llama el webhook de Resend UNA vez por evento.
//
//  - Rebote duro / supresión → `email_rebotado_at` (email MALO) en la ficha del envío y en las demás fichas con la
//    MISMA dirección (índice ciego): la dirección no vale para nadie. NO toca `email_opt_out_at`.
//  - Queja de spam → baja (`email_opt_out_at`, origen `queja_spam`) de la persona: su ficha y las de su mismo correo.
//  - Rebote de una dirección que la ficha YA NO TIENE (se cambió): no se marca; queda nota.
// Idempotente (el webhook reintenta): solo escribe donde aún no había marca/baja. Nunca lanza.
//
// 🔒 Sin `seguros.` en el SQL: `prismaAsegura()` ya conecta con `?schema=seguros`.
import { computeEmailLookupHash } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { descifrarCampo } from './cartera-edicion'
import { accionPorEvento, reboteEsDeLaFicha } from './email-estado.ts'
import type { EventoCorreo } from './correo-eventos'

export type ResultadoRebote =
  | { estado: 'marcado' | 'baja'; fichas: number }
  | { estado: 'sin_accion' | 'no_encontrado' | 'ya_no_esta' }
  | { estado: 'error'; motivo: string }

type Origen = { clienteId: string; correduriaId: string; destino: string | null; tipo: string }

/** De quién es el correo: `correo_envio` (con destino), y si no, campaña o recaptación (sin destino guardado). */
async function origenDelCorreo(resendId: string): Promise<Origen | null> {
  const db = prismaAsegura()
  const ce = await db.$queryRaw<Origen[]>(Prisma.sql`
    select cliente_id as "clienteId", correduria_id as "correduriaId", destino_cifrado as destino, tipo
    from correo_envio where resend_id = ${resendId} and cliente_id is not null limit 1`)
  if (ce[0]) return ce[0]
  const otros = await db.$queryRaw<Origen[]>(Prisma.sql`
    select cliente_id as "clienteId", correduria_id as "correduriaId", null::text as destino, campana as tipo
    from campana_envio where resend_message_id = ${resendId}
    union all
    select cliente_id, correduria_id, null::text, 'recaptacion'
    from recaptacion_envios where resend_message_id = ${resendId} and canal = 'email'
    limit 1`).catch(() => [] as Origen[])
  return otros[0] ?? null
}

function hashSeguro(destinoCifrado: string | null): string | null {
  if (!destinoCifrado) return null
  try {
    return computeEmailLookupHash(descifrarCampo(destinoCifrado))
  } catch {
    return null
  }
}

export async function aplicarReboteOQueja(e: EventoCorreo): Promise<ResultadoRebote> {
  const accion = accionPorEvento(e.tipo, e.detalle)
  if (accion === null) return { estado: 'sin_accion' }
  if (!aseguraConfigurada()) return { estado: 'error', motivo: 'sin_configurar' }
  try {
    const o = await origenDelCorreo(e.resendId)
    if (!o) return { estado: 'no_encontrado' }
    const db = prismaAsegura()

    if (accion.accion === 'baja') {
      // La baja es de la PERSONA: su ficha y las que comparten su correo (como `bajaDeFicha` de la campaña).
      const n = await db.$executeRaw(Prisma.sql`
        update clientes set email_opt_out_at = now(), email_opt_out_source = coalesce(email_opt_out_source, 'queja_spam')
        where correduria_id = ${o.correduriaId}::uuid
          and email_opt_out_at is null
          and (id = ${o.clienteId}::uuid
            or (email_lookup_hash is not null
                and email_lookup_hash = (select email_lookup_hash from clientes where id = ${o.clienteId}::uuid and correduria_id = ${o.correduriaId}::uuid)))`)
      if (n > 0) await anotar(o.correduriaId, o.clienteId, `Correo «${o.tipo}»: el destinatario lo marcó como SPAM — baja automática de correo`)
      return { estado: 'baja', fichas: n }
    }

    const hashDestino = hashSeguro(o.destino)
    const fichas = await db.$queryRaw<{ h: string | null }[]>(Prisma.sql`
      select email_lookup_hash as h from clientes where id = ${o.clienteId}::uuid and correduria_id = ${o.correduriaId}::uuid
      union all
      select email_lookup_hash from cliente_emails where cliente_id = ${o.clienteId}::uuid and correduria_id = ${o.correduriaId}::uuid`)
    if (!reboteEsDeLaFicha(hashDestino, fichas.map((f) => f.h))) {
      await anotar(o.correduriaId, o.clienteId, `Correo «${o.tipo}»: rebotó una dirección que la ficha ya no tiene — no se marca el email actual`)
      return { estado: 'ya_no_esta' }
    }
    // La dirección no vale para nadie: esta ficha y cualquier otra con la MISMA (índice ciego).
    const n = await db.$executeRaw(Prisma.sql`
      update clientes set email_rebotado_at = ${e.ocurridoEn}, email_rebotado_motivo = ${accion.motivo},
        email_rebotado_hash = coalesce(${hashDestino}, email_lookup_hash)
      where correduria_id = ${o.correduriaId}::uuid
        and email_rebotado_at is null
        and (id = ${o.clienteId}::uuid
          or (${hashDestino}::text is not null and email_lookup_hash = ${hashDestino}))`)
    if (n > 0) {
      await anotar(o.correduriaId, o.clienteId,
        `Correo «${o.tipo}»: email RECHAZADO (${accion.motivo}) — marcado como email malo. No es una baja: se limpia sola si cambia el email`)
    }
    return { estado: 'marcado', fichas: n }
  } catch (err) {
    console.error('[email-rebote] no se pudo aplicar:', err instanceof Error ? err.message : err)
    return { estado: 'error', motivo: 'fallo_bd' }
  }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (err) {
    console.error('[email-rebote] historial_interno no se pudo anotar:', err instanceof Error ? err.message : err)
  }
}
