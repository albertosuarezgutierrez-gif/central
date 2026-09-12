// apps/asegura/lib/cartera-recaptacion.ts
//
// La cola de recaptación: leads del volcado sin fecha de vencimiento, con
// contacto, que NO son ya cliente vivo por CIMA. Ver
// docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
//
// No hay tabla de cola: se calcula en cada GET, como `polizasSinRecibo()` de
// `cartera-impagados.ts`. `recaptacion_envios` es solo el HISTORIAL que decide
// el cooldown y alimenta el contador semanal.
//
// 🔒 Igual que el resto de `lib/cartera-*.ts` de esta app: `prismaAsegura()`
// conecta con `?schema=seguros` ya en la URL, así que las tablas NO se
// prefijan con `seguros.` en el SQL crudo (ver `cartera-impagados.ts`,
// `cartera-filtro.ts`) — eso mismo evita disparar el guardián de aislamiento
// de `test/regression-asegura-aislamiento.test.ts`, que solo mira SQL que
// nombre el schema explícitamente.

import { enCooldown, COOLDOWN_DIAS, textoBaseRecaptacionWhatsapp, textoBaseRecaptacionEmail, sqlCarteraViva, sqlVolcadoHistorico } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

const RAMOS_LEGIBLES: Record<string, string> = {
  hogar: 'hogar',
  auto: 'auto',
  moto: 'moto',
  responsabilidad_civil: 'responsabilidad civil',
  vida: 'vida',
  salud: 'salud',
  decesos: 'decesos',
  comercio: 'comercio',
  otros: 'comunidades', // el caso real que abrió este trabajo (BIDP023227) es 'otros'
}

function ramoLegible(tipo: string): string {
  return RAMOS_LEGIBLES[tipo] ?? tipo.replace(/_/g, ' ')
}

/** Descifra sin convertir un fallo en "no tiene contacto". Mismo patrón que `cartera-impagados.ts`. */
function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

export type LeadRecaptacion = {
  clienteId: string
  polizaId: string
  cliente: string
  ramo: string
  ramoLegible: string
  aseguradoraAnterior: string | null
  numeroPoliza: string | null
  telefono: string | null
  email: string | null
  /** `null` = la compañía no informa la prima. NUNCA 0. */
  prima: number | null
  /** `true` = ya se contactó hace menos de 14 días; la pantalla ofrece "ver igualmente" para forzar. */
  enCooldown: boolean
  ultimoContactoEn: string | null
}

export type ContadoresRecaptacion = {
  totalCandidatos: number
  contactadosSemana: number
  conAperturaORespuestaSemana: number
}

export type ColaRecaptacion = { leads: LeadRecaptacion[]; contadores: ContadoresRecaptacion }

type FilaCruda = {
  clienteId: string
  nombre: string
  apellidos: string
  polizaId: string
  tipo: string
  aseguradora: string | null
  numeroPoliza: string | null
  prima: unknown
  /** `null` si no hay teléfono O si el cliente dio de baja WhatsApp (`wa_opt_out_at`). */
  telefono: string | null
  /** `null` si no hay email O si el cliente dio de baja el correo (`email_opt_out_at`). */
  email: string | null
  ultimoEnvioAt: Date | null
}

export async function colaRecaptacion(correduriaId: string): Promise<ColaRecaptacion> {
  const vacia: ColaRecaptacion = { leads: [], contadores: { totalCandidatos: 0, contactadosSemana: 0, conAperturaORespuestaSemana: 0 } }
  if (!aseguraConfigurada()) return vacia
  const db = prismaAsegura()

  // Un lead entra si: es volcado sin vencimiento y activo, tiene teléfono o
  // email DISPONIBLE (tras aplicar el opt-out por canal), y su cliente NO
  // tiene NINGUNA otra póliza de cartera viva (si la tuviera, es cliente
  // actual y se trabaja desde su ficha, no aquí).
  const filas = await db.$queryRaw<FilaCruda[]>(Prisma.sql`
    select
      c.id as "clienteId", c.nombre, c.apellidos,
      p.id as "polizaId", p.tipo::text as tipo, p.aseguradora, p.numero_poliza as "numeroPoliza",
      -- Las dos primas son la MISMA magnitud en dos columnas distintas; un 0
      -- guardado tampoco es una prima real (regla NULL≠0 del CLAUDE.md).
      nullif(coalesce(p.prima_bruta, p.prima_anual), 0)::float8 as prima,
      -- Opt-out POR CANAL, no de la ficha entera: si dio de baja WhatsApp pero
      -- no el email (o al revés), sigue siendo contactable por el otro.
      case when c.wa_opt_out_at is null then c.telefono else null end as telefono,
      case when c.email_opt_out_at is null then c.email else null end as email,
      (
        select max(r.created_at) from recaptacion_envios r
        where r.cliente_id = c.id
      ) as "ultimoEnvioAt"
    from polizas p
    join clientes c on c.id = p.cliente_id
    where p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null
      and c.merged_into_cliente_id is null
      and c.activo
      and ${Prisma.raw(sqlVolcadoHistorico('p'))}
      and p.estado = 'activa'
      and p.fecha_vencimiento is null
      -- Al menos un canal DISPONIBLE tras aplicar el opt-out (no basta con
      -- tener el dato guardado: si el único canal que tiene está dado de baja,
      -- este lead no entra en la cola).
      and (
        (c.telefono is not null and c.wa_opt_out_at is null)
        or (c.email is not null and c.email_opt_out_at is null)
      )
      and not exists (
        -- cartera_viva: si el cliente tiene OTRA póliza que sea cartera viva
        -- (import_ref is null or eiac_xml_hash is not null, regla única de
        -- @central/module-seguros), es cliente ACTUAL y se trabaja desde su
        -- ficha, no aquí.
        select 1 from polizas v
        where v.cliente_id = c.id
          and v.id <> p.id
          and v.merged_into_poliza_id is null
          and ${Prisma.raw(sqlCarteraViva('v'))}
      )
    order by c.apellidos, c.nombre
    limit 2000
  `)

  const hoy = new Date()
  const leads: LeadRecaptacion[] = filas.map((f) => {
    const tipo = String(f.tipo)
    const ultimoEnvio = f.ultimoEnvioAt ? { creadoAt: f.ultimoEnvioAt } : null
    return {
      clienteId: f.clienteId,
      polizaId: f.polizaId,
      cliente: `${f.nombre} ${f.apellidos}`.trim(),
      ramo: tipo,
      ramoLegible: ramoLegible(tipo),
      aseguradoraAnterior: f.aseguradora?.trim() || null,
      numeroPoliza: f.numeroPoliza,
      telefono: descifrar(f.telefono),
      email: descifrar(f.email),
      prima: f.prima === null || f.prima === undefined ? null : Number(f.prima),
      enCooldown: enCooldown(ultimoEnvio, hoy, COOLDOWN_DIAS),
      ultimoContactoEn: f.ultimoEnvioAt ? f.ultimoEnvioAt.toISOString().slice(0, 10) : null,
    }
  })

  const contadores = await contadoresSemana(correduriaId)
  return { leads, contadores: { ...contadores, totalCandidatos: leads.length } }
}

async function contadoresSemana(correduriaId: string): Promise<Omit<ContadoresRecaptacion, 'totalCandidatos'>> {
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ contactados: bigint; conRespuesta: bigint }[]>(Prisma.sql`
    select
      count(distinct cliente_id)::bigint as contactados,
      count(distinct cliente_id) filter (where estado in ('abierto', 'pinchado'))::bigint as "conRespuesta"
    from recaptacion_envios
    where correduria_id = ${correduriaId}::uuid
      and created_at >= now() - interval '7 days'
  `)
  const f = filas[0]
  return { contactadosSemana: Number(f?.contactados ?? 0), conAperturaORespuestaSemana: Number(f?.conRespuesta ?? 0) }
}

/** El texto sugerido para un lead concreto (WhatsApp), antes de que la IA lo pula. */
export function textoWhatsappPara(lead: Pick<LeadRecaptacion, 'cliente' | 'ramoLegible' | 'aseguradoraAnterior'>): string {
  return textoBaseRecaptacionWhatsapp({ nombre: lead.cliente, ramoLegible: lead.ramoLegible, aseguradoraAnterior: lead.aseguradoraAnterior })
}

/** Ídem para email. */
export function textoEmailPara(lead: Pick<LeadRecaptacion, 'cliente' | 'ramoLegible' | 'aseguradoraAnterior'>): { asunto: string; texto: string } {
  return textoBaseRecaptacionEmail({ nombre: lead.cliente, ramoLegible: lead.ramoLegible, aseguradoraAnterior: lead.aseguradoraAnterior })
}

/** Registra que Alberto abrió el enlace de WhatsApp de un lead. Deja fila en `historial_interno`. */
export async function registrarEnvioWhatsapp(
  correduriaId: string,
  entrada: { clienteId: string; polizaId: string; mensaje: string; actor: string },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const db = prismaAsegura()
  const cliente = await db.cliente.findFirst({ where: { id: entrada.clienteId, correduriaId, mergedIntoClienteId: null }, select: { id: true } })
  if (!cliente) return { ok: false, motivo: 'Esa ficha no es de esta correduría.' }
  await db.$executeRaw(Prisma.sql`
    insert into recaptacion_envios (correduria_id, cliente_id, poliza_id, canal, estado, mensaje, creado_por)
    values (${correduriaId}::uuid, ${entrada.clienteId}::uuid, ${entrada.polizaId}::uuid, 'whatsapp', 'enlace_abierto', ${entrada.mensaje}, ${entrada.actor})
  `)
  await anotar(correduriaId, entrada.clienteId, `Recaptación: se abrió el enlace de WhatsApp (mensaje ya escrito) por ${entrada.actor}`)
  return { ok: true }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (e) {
    console.error('[cartera-recaptacion] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
