/**
 * El carril de LEADS de Vencimientos: pólizas que los leads tenían en OTRA
 * compañía (tabla heredada `oportunidades`, abiertas y no aparcadas), con el
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
  canalLead,
  diasHasta,
  proximoAniversario,
  puntuarLead,
  siguientePasoLead,
  sqlCarteraEnVigor,
  ventanaDe,
  type CanalLead,
  type PasoLead,
  type VentanaLead,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { descifrarCampo } from './cartera-edicion'
import { MARCA_CIERRE_AUTOMATICO } from './oportunidad-seguimiento'

export type LeadCompetencia = {
  oportunidadId: string
  /** `competencia` = sin trabajar; `en_negociacion`/`pendiente_cliente` = en seguimiento. */
  estado: 'competencia' | 'en_negociacion' | 'pendiente_cliente'
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
  /** Contactos del último año: envíos (sin rebotes ni quejas) + tareas de contacto cerradas de esta oportunidad. */
  intentos: number
  ultimoContactoEn: string | null
  /** Otras pólizas de la competencia del mismo cliente: se le trabaja una vez, no N. */
  otrasOportunidades: number
  respondioAntes: boolean
  /** Tuvo alguna póliza con nosotros (cualquier época): abre el correo por LSSI 21.2. */
  fueCliente: boolean
  canal: CanalLead
  puntuacion: number
  siguientePaso: PasoLead
}

export type ListaLeadsCompetencia = {
  leads: LeadCompetencia[]
  /** Candidatos con fecha legible (uno por cliente), antes de cortar por horizonte. */
  totalConFecha: number
  /** Con contacto guardado pero que no se ha podido descifrar: no se listan y se cuentan. */
  ilegibles: number
  porVentana: Record<VentanaLead, number>
  /** `true` = la consulta tocó el techo: puede haber más. */
  truncado: boolean
  /** Tienen correo pero nunca fueron clientes y no tienen teléfono: no se les puede escribir (LSSI 21.2). */
  sinCanalPermitido: number
}

const TECHO = 5000

/** Valor de cajón del volcado de Manuel: no es una compañía. */
function aseguradoraLegible(v: string | null): string | null {
  const limpio = v?.trim() || null
  if (limpio === null) return null
  return /^\(?legacy\)?$/i.test(limpio) ? null : limpio
}

type Fila = {
  oportunidadId: string
  estado: LeadCompetencia['estado']
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
  fueCliente: boolean
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
  if (!aseguraConfigurada()) return { leads: [], totalConFecha: 0, ilegibles: 0, porVentana, truncado: false, sinCanalPermitido: 0 }
  const filas = await prismaAsegura().$queryRaw<Fila[]>(Prisma.sql`
    select
      o.id::text as "oportunidadId", o.estado::text as estado, c.id::text as "clienteId", c.nombre, c.apellidos,
      o.tipo::text as ramo,
      nullif(trim(o.poliza_competencia->>'aseguradora'), '') as aseguradora,
      -- Un 0 guardado tampoco es una prima (regla NULL≠0), y no puede tapar la
      -- del JSON. Del texto solo se aceptan formas sin ambigüedad: «450»,
      -- «450.5», «450,50». «1.200» (¿mil doscientos o uno coma dos?) queda NULL.
      nullif(coalesce(
        nullif(o.prima_bruta, 0),
        case when (o.poliza_competencia->>'prima') ~ '^[0-9]+([.,][0-9]{1,2})?$'
             then replace(o.poliza_competencia->>'prima', ',', '.')::numeric end
      ), 0)::float8 as prima,
      o.fecha_fin_vigencia as "fechaFin",
      case when c.wa_opt_out_at is null then c.telefono else null end as telefono,
      case when c.email_opt_out_at is null then c.email else null end as email,
      -- Solo el último año: el «aparcar» es hasta el aniversario siguiente, no
      -- para siempre. Un rebote o una queja no es un intento que le llegara.
      -- Una llamada, un email o un WhatsApp registrados como tarea cerrada de
      -- esta oportunidad también son un intento.
      (select count(*)::int from recaptacion_envios r
        where r.cliente_id = c.id and r.created_at > now() - interval '12 months'
          and r.estado::text not in ('rebotado', 'queja'))
      -- Solo las tareas creadas desde aquí: las 301 heredadas del volcado
      -- llevan fecha de junio de 2026 (la de la carga, no la de la llamada) y
      -- contarían como contactos recientes que no lo son.
      + (select count(*)::int from gestiones g
        where g.oportunidad_id = o.id and g.correduria_id = o.correduria_id
          and g.origen_trigger = 'central:seguimiento' and g.estado::text = 'cerrada'
          and g.tipo::text in ('llamada', 'email', 'whatsapp')
          -- Las que cerró el sistema al ganar/perder no son un contacto: reabrir no suma intentos.
          and position(${MARCA_CIERRE_AUTOMATICO} in g.observaciones) = 0
          and g.updated_at > now() - interval '12 months') as intentos,
      greatest(
        (select max(r.created_at) from recaptacion_envios r
          where r.cliente_id = c.id and r.created_at > now() - interval '12 months'),
        (select max(g.updated_at) from gestiones g
          where g.oportunidad_id = o.id and g.correduria_id = o.correduria_id
            and g.origen_trigger = 'central:seguimiento' and g.estado::text = 'cerrada'
            and g.tipo::text in ('llamada', 'email', 'whatsapp')
            and position(${MARCA_CIERRE_AUTOMATICO} in g.observaciones) = 0
            and g.updated_at > now() - interval '12 months')
      ) as "ultimoEnvioAt",
      exists (
        select 1 from recaptacion_envios r
        where r.cliente_id = c.id and r.estado::text in ('enlace_abierto', 'abierto', 'pinchado')
      ) as respondio,
      -- Cualquier póliza nuestra, de cualquier época: hoy no está en vigor (lo
      -- excluye el filtro de abajo), así que es relación contractual PREVIA.
      exists (
        select 1 from polizas p
        where p.cliente_id = c.id and p.correduria_id = c.correduria_id and p.merged_into_poliza_id is null
          -- «competencia» es una póliza suya con OTRA compañía: no es contrato con nosotros.
          and p.estado::text <> 'competencia'
      ) as "fueCliente"
    from oportunidades o
    join clientes c on c.id = o.cliente_id
    where o.correduria_id = ${correduriaId}::uuid
      -- Abiertas y no aparcadas: la ganada y la perdida salen del carril; la
      -- aparcada vuelve sola el día que vence su aparcada_hasta.
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and (o.aparcada_hasta is null or o.aparcada_hasta <= current_date)
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
    -- Si se topa, que se caiga lo que vence más lejos, no filas al azar.
    order by mod((extract(doy from o.fecha_fin_vigencia) - extract(doy from current_date))::int + 366, 366)
    limit ${TECHO}
  `)

  // Un cliente, una fila: se queda su oportunidad que vence antes y el resto
  // se cuenta. Varias filas del mismo cliente serían varios planes de contacto.
  const porCliente = new Map<string, { f: Fila; venc: string; dias: number; otras: number }>()
  for (const f of filas) {
    const venc = proximoAniversario(f.fechaFin.toISOString().slice(0, 10), hoy)
    if (venc === null) continue
    const dias = diasHasta(venc, hoy)
    const previa = porCliente.get(f.clienteId)
    if (!previa) porCliente.set(f.clienteId, { f, venc, dias, otras: 0 })
    else if (dias < previa.dias) porCliente.set(f.clienteId, { f, venc, dias, otras: previa.otras + 1 })
    else previa.otras++
  }

  const leads: LeadCompetencia[] = []
  let totalConFecha = 0
  let ilegibles = 0
  let sinCanalPermitido = 0
  for (const { f, venc, dias, otras } of porCliente.values()) {
    const telefono = descifrarCampo(f.telefono)
    const email = descifrarCampo(f.email)
    // Guardado pero ilegible (clave PII, o una cadena vacía): no se lista como
    // contactable, y tampoco desaparece sin dejar rastro.
    if (telefono === null && email === null) {
      ilegibles++
      continue
    }
    const canal = canalLead({ fueCliente: f.fueCliente, tieneTelefono: telefono !== null, tieneEmail: email !== null })
    // Con canal pero sin canal PERMITIDO: se cuenta, no se lista como trabajo.
    if (canal === 'sin_canal_permitido') {
      sinCanalPermitido++
      continue
    }
    totalConFecha++
    const ventana = ventanaDe(dias)
    porVentana[ventana]++
    if (dias > horizonteDias) continue
    const ultimo = f.ultimoEnvioAt ? f.ultimoEnvioAt.toISOString().slice(0, 10) : null
    leads.push({
      oportunidadId: f.oportunidadId,
      estado: f.estado,
      clienteId: f.clienteId,
      cliente: [f.nombre, f.apellidos].filter((s) => s && s.trim() !== '').join(' ').trim() || '(sin nombre)',
      ramo: f.ramo,
      aseguradora: aseguradoraLegible(f.aseguradora),
      prima: f.prima,
      vencimientoEstimado: venc,
      fechaFinOriginal: f.fechaFin.toISOString().slice(0, 10),
      dias,
      ventana,
      telefono,
      email,
      intentos: f.intentos,
      ultimoContactoEn: ultimo,
      otrasOportunidades: otras,
      respondioAntes: f.respondio,
      fueCliente: f.fueCliente,
      canal,
      puntuacion: puntuarLead({
        tieneTelefono: telefono !== null,
        // El correo solo puntúa si se le puede escribir (LSSI 21.2).
        tieneEmail: canal === 'telefono_y_correo' || canal === 'solo_correo',
        prima: f.prima,
        respondioAntes: f.respondio,
        ramo: f.ramo,
      }),
      siguientePaso: siguientePasoLead(
        dias,
        f.intentos,
        ultimo === null ? null : -diasHasta(ultimo, hoy),
        f.respondio,
        f.estado === 'pendiente_cliente',
      ),
    })
  }
  // Probabilidad × prima: por puntuación y, a igualdad, lo que vence antes.
  leads.sort((a, b) => b.puntuacion - a.puntuacion || a.dias - b.dias)
  return { leads, totalConFecha, ilegibles, porVentana, truncado: filas.length >= TECHO, sinCanalPermitido }
}
