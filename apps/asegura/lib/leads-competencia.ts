/**
 * El carril de LEADS de Vencimientos: pólizas que los leads tenían en OTRA
 * compañía (tabla heredada `oportunidades`, estado `competencia`), con el
 * próximo aniversario de su fecha de fin. Solo lectura: no envía ni escribe.
 *
 * Por qué y qué significa la fecha: cabecera de `lead-competencia.ts` en
 * `@central/module-seguros`. 🚨 La fecha es ESTIMADA siempre y viaja rotulada.
 *
 * Quién entra: ficha viva y activa, con teléfono o correo DISPONIBLE tras las
 * bajas por canal, y que NO sea hoy cliente con alguna póliza en vigor (a ese
 * se le trabaja desde su ficha y su renovación, no como lead).
 */
import {
  diasHasta,
  proximoAniversario,
  puntuarLead,
  siguientePasoLead,
  sqlCarteraEnVigor,
  ventanaDe,
  type PasoLead,
  type VentanaLead,
} from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

export type LeadCompetencia = {
  oportunidadId: string
  clienteId: string
  cliente: string
  ramo: string
  /** `null` = no consta en qué compañía estaba. */
  aseguradora: string | null
  /** `null` = no consta la prima. NUNCA 0. */
  prima: number | null
  /** Siempre estimada: aniversario de `fechaFinOriginal`. */
  vencimientoEstimado: string
  fechaFinOriginal: string
  dias: number
  ventana: VentanaLead
  telefono: string | null
  email: string | null
  intentos: number
  ultimoContactoEn: string | null
  respondioAntes: boolean
  puntuacion: number
  siguientePaso: PasoLead
}

export type ListaLeadsCompetencia = {
  leads: LeadCompetencia[]
  /** Candidatos con fecha legible, antes de cortar por horizonte. */
  totalConFecha: number
  porVentana: Record<VentanaLead, number>
  /** `true` = la consulta tocó el techo: puede haber más. */
  truncado: boolean
}

const TECHO = 5000

type Fila = {
  oportunidadId: string
  clienteId: string
  nombre: string | null
  apellidos: string | null
  ramo: string
  aseguradora: string | null
  prima: number | null
  fechaFin: Date
  telefono: string | null
  email: string | null
  intentos: number
  ultimoEnvioAt: Date | null
  respondio: boolean
}

/** Descifra sin convertir un fallo en «no tiene contacto». */
function descifrar(v: string | null): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

function hoyUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export async function leadsCompetencia(
  correduriaId: string,
  horizonteDias = 90,
  hoy: Date = hoyUtc(),
): Promise<ListaLeadsCompetencia> {
  const porVentana: Record<VentanaLead, number> = { menos_30: 0, '30_60': 0, '60_90': 0, mas_90: 0 }
  if (!aseguraConfigurada()) return { leads: [], totalConFecha: 0, porVentana, truncado: false }
  const filas = await prismaAsegura().$queryRaw<Fila[]>(Prisma.sql`
    select
      o.id::text as "oportunidadId", c.id::text as "clienteId", c.nombre, c.apellidos,
      o.tipo::text as ramo,
      nullif(trim(o.poliza_competencia->>'aseguradora'), '') as aseguradora,
      -- Un 0 guardado tampoco es una prima (regla NULL≠0). El texto del JSON
      -- solo se convierte si tiene forma de número.
      nullif(coalesce(
        o.prima_bruta,
        case when (o.poliza_competencia->>'prima') ~ '^[0-9]+([.][0-9]+)?$'
             then (o.poliza_competencia->>'prima')::numeric end
      ), 0)::float8 as prima,
      o.fecha_fin_vigencia as "fechaFin",
      case when c.wa_opt_out_at is null then c.telefono else null end as telefono,
      case when c.email_opt_out_at is null then c.email else null end as email,
      (select count(*)::int from recaptacion_envios r where r.cliente_id = c.id) as intentos,
      (select max(r.created_at) from recaptacion_envios r where r.cliente_id = c.id) as "ultimoEnvioAt",
      exists (
        select 1 from recaptacion_envios r
        where r.cliente_id = c.id and r.estado::text in ('enlace_abierto', 'abierto', 'pinchado')
      ) as respondio
    from oportunidades o
    join clientes c on c.id = o.cliente_id
    where o.correduria_id = ${correduriaId}::uuid
      and o.estado::text = 'competencia'
      and o.fecha_fin_vigencia is not null
      and c.correduria_id = o.correduria_id
      and c.merged_into_cliente_id is null
      and c.activo
      and (
        (c.telefono is not null and c.wa_opt_out_at is null)
        or (c.email is not null and c.email_opt_out_at is null)
      )
      and not exists (
        select 1 from polizas p
        where p.cliente_id = c.id and p.correduria_id = c.correduria_id
          and p.merged_into_poliza_id is null
          and ${Prisma.raw(sqlCarteraEnVigor('p'))}
      )
    limit ${TECHO}
  `)

  const leads: LeadCompetencia[] = []
  let totalConFecha = 0
  for (const f of filas) {
    const fechaFin = f.fechaFin.toISOString().slice(0, 10)
    const venc = proximoAniversario(fechaFin, hoy)
    if (venc === null) continue
    totalConFecha++
    const dias = diasHasta(venc, hoy)
    const ventana = ventanaDe(dias)
    porVentana[ventana]++
    if (dias > horizonteDias) continue
    const telefono = descifrar(f.telefono)
    const email = descifrar(f.email)
    const ultimo = f.ultimoEnvioAt ? f.ultimoEnvioAt.toISOString().slice(0, 10) : null
    leads.push({
      oportunidadId: f.oportunidadId,
      clienteId: f.clienteId,
      cliente: [f.nombre, f.apellidos].filter((s) => s && s.trim() !== '').join(' ').trim() || '(sin nombre)',
      ramo: f.ramo,
      aseguradora: f.aseguradora,
      prima: f.prima,
      vencimientoEstimado: venc,
      fechaFinOriginal: fechaFin,
      dias,
      ventana,
      telefono,
      email,
      intentos: f.intentos,
      ultimoContactoEn: ultimo,
      respondioAntes: f.respondio,
      puntuacion: puntuarLead({
        tieneTelefono: telefono !== null,
        tieneEmail: email !== null,
        prima: f.prima,
        respondioAntes: f.respondio,
        ramo: f.ramo,
      }),
      siguientePaso: siguientePasoLead(dias, f.intentos, ultimo === null ? null : -diasHasta(ultimo, hoy)),
    })
  }
  // Probabilidad × prima: por puntuación y, a igualdad, lo que vence antes.
  leads.sort((a, b) => b.puntuacion - a.puntuacion || a.dias - b.dias)
  return { leads, totalConFecha, porVentana, truncado: filas.length >= TECHO }
}
