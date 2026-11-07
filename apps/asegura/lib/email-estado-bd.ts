// Estado del email y contactabilidad de UNA o varias fichas, leídos de la BD (07/11/2026). La regla es pura
// (`email-estado.ts`); aquí solo se junta lo que necesita, de TODOS los envíos con seguimiento:
//  - la ficha: baja, marca de rebote, sus direcciones y teléfonos (descifrados en memoria);
//  - `correo_envio` + `correo_evento`: solo los correos cuyo destino es una dirección que la ficha tiene HOY;
//  - el portal: ¿entró alguna vez con un vínculo propio (no el temporal del corredor)?
// Un fallo de lectura no se convierte en «sin comprobar»: la ficha queda en `null` (no se sabe).
//
// 🔒 Sin `seguros.` en el SQL: `prismaAsegura()` ya conecta con `?schema=seguros`.
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { descifrarCampo } from './cartera-edicion'
import {
  contactabilidad, estadoEmail, estadoTelefonos,
  type Contactabilidad, type EstadoEmail, type EventoEstado,
} from './email-estado.ts'

export type SondaEmail = { estadoEmail: EstadoEmail | null; contactabilidad: Contactabilidad }

const norm = (v: string | null) => (v ? v.trim().toLowerCase() : null)
/** `undefined` = guardado pero no se abre (≠ vacío). */
const abrir = (v: string | null | undefined): string | null | undefined => {
  if (typeof v !== 'string' || v.trim() === '') return null
  return descifrarCampo(v) ?? undefined
}

/** Por ficha (máx. ~1000 por llamada). Lanza si no puede leer la propia ficha; lo demás degrada a `null`. */
export async function sondaEmailDe(correduriaId: string, clienteIds: readonly string[]): Promise<Map<string, SondaEmail>> {
  const ids = [...new Set(clienteIds)]
  const out = new Map<string, SondaEmail>()
  if (ids.length === 0) return out
  const db = prismaAsegura()
  const fichas = await db.cliente.findMany({
    where: { correduriaId, id: { in: ids } },
    select: {
      id: true, email: true, telefono: true, emailOptOutAt: true, emailRebotadoAt: true,
      emails: { select: { email: true } }, telefonos: { select: { telefono: true } },
    },
  })

  type Envio = { clienteId: string; destino: string; resendId: string | null }
  let envios: Envio[] | null = null
  let eventos: { resendId: string; tipo: string; en: Date }[] | null = null
  try {
    envios = await db.$queryRaw<Envio[]>(Prisma.sql`
      select cliente_id as "clienteId", destino_cifrado as destino, resend_id as "resendId"
      from correo_envio
      where correduria_id = ${correduriaId}::uuid and cliente_id in (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
        and estado = 'enviado'`)
    const rids = envios.map((e) => e.resendId).filter((x): x is string => x !== null)
    eventos = rids.length === 0 ? [] : await db.$queryRaw<{ resendId: string; tipo: string; en: Date }[]>(Prisma.sql`
      select resend_id as "resendId", tipo, ocurrido_en as en from correo_evento where resend_id in (${Prisma.join(rids)})`)
  } catch (e) {
    console.error('[email-estado-bd] correos ilegibles:', e instanceof Error ? e.message : e)
    envios = null
  }
  let conPortal: Set<string> | null = null
  try {
    const filas = await db.$queryRaw<{ clienteId: string }[]>(Prisma.sql`
      select distinct pv.cliente_id as "clienteId"
      from portal_vinculo pv join portal_acceso a on a.identidad_id = pv.identidad_id
      where pv.correduria_id = ${correduriaId}::uuid and pv.origen <> 'corredor'
        and pv.cliente_id in (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})`)
    conPortal = new Set(filas.map((f) => f.clienteId))
  } catch (e) {
    console.error('[email-estado-bd] accesos al portal ilegibles:', e instanceof Error ? e.message : e)
  }

  for (const f of fichas) {
    const direcciones = [abrir(f.email), ...f.emails.map((e) => abrir(e.email))]
    const actuales = new Set(direcciones.filter((d): d is string => typeof d === 'string').map((d) => norm(d)!))
    const sinNinguna = direcciones.every((d) => d === null)
    let ev: EventoEstado[] | null = null
    if (envios !== null && eventos !== null) {
      const rids = new Set(
        envios.filter((e) => e.clienteId === f.id && e.resendId && actuales.has(norm(descifrarCampo(e.destino)) ?? '\u0000'))
          .map((e) => e.resendId as string),
      )
      ev = eventos.filter((x) => rids.has(x.resendId)).map((x) => ({ tipo: x.tipo, en: x.en }))
    }
    const marca = f.emailOptOutAt !== null || f.emailRebotadoAt !== null
    const estado = sinNinguna && !marca
      ? null
      : estadoEmail({ optOutAt: f.emailOptOutAt, rebotadoAt: f.emailRebotadoAt, eventos: ev, entroPortal: conPortal === null ? null : conPortal.has(f.id) })
    const tel = estadoTelefonos([abrir(f.telefono), ...f.telefonos.map((t) => abrir(t.telefono))])
    out.set(f.id, { estadoEmail: estado, contactabilidad: contactabilidad(sinNinguna && !marca ? 'sin_email' : estado, tel) })
  }
  return out
}
