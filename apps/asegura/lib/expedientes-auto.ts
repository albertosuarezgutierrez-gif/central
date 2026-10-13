// Expedientes que se abren SOLOS (Alberto, 13/10/2026): renovaciones de cartera propia y pólizas
// declaradas en el portal, en la ventana de 60 a 30 días antes del vencimiento. La DECISIÓN vive en
// `expedientes-auto-reglas.ts` (pura, con test); aquí solo se lee y se escribe.
//
// Dónde corre: dentro de la pasada del detector de cartera (`detectarYGuardar`, cron
// `correduria-eventos` de plataforma, 06:15 y 12:15 UTC), con su propio punto de guardado. Esa pasada
// ya tiene el candado por correduría (`pg_advisory_xact_lock`), así que dos pasadas a la vez no pueden
// abrir dos veces lo mismo; y su latido (`correduria_eventos`) ya vigila que corra.
//
// `planExpedientesAuto()` es la MISMA lectura sin escribir: la usa `GET /api/operador/expedientes/auto`
// para contar qué abriría hoy antes de que lo haga.
//
// 🚨 Aislamiento: el rol tiene BYPASSRLS. Toda tabla con `correduria_id` se filtra por él, también en
// las subconsultas. Las del portal (`portal_poliza_declarada`) no lo tienen: el ámbito lo da
// `portal_vinculo.correduria_id` (como `declaradasPorVencer`).
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import { DIAS_PREAVISO_ASEGURADOR, sqlCarteraEnVigor, sqlCarteraViva } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { sqlPrimaDeRecibo, sqlVencimientoConRecibos } from './recibos-vigencia'
import {
  ORIGEN_DECLARADA_PORTAL,
  ORIGEN_RENOVACION_CARTERA,
  decidirDeclarada,
  decidirRenovacion,
  renovacionResuelta,
  tipoDeRamoDeclarado,
  type MotivoNoAbrir,
} from './expedientes-auto-reglas'

type Db = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

const ACTOR = 'sistema:expedientes-auto'
const ABIERTA = Prisma.sql`o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')`
/** Nº de póliza comparable: sin separadores, en mayúsculas y sin ceros a la izquierda. */
const numNorm = (col: Prisma.Sql) => Prisma.sql`ltrim(upper(regexp_replace(coalesce(${col}, ''), '[^A-Za-z0-9]', '', 'g')), '0')`

export type Apertura = {
  tipo: 'renovacion' | 'declarada'
  clienteId: string
  /** Póliza de cartera (renovación) o declarada del portal. */
  origenId: string
  ramo: string
  vence: string
  dias: number
  fechaAccion: string
  texto: string
  numeroPoliza: string | null
  prima: string | null
}

export type PlanExpedientesAuto = {
  hoy: string
  aperturas: Apertura[]
  /** Lo que NO se abre, contado por motivo (en la ventana ampliada 0-60 días). */
  noAbiertas: Record<'renovacion' | 'declarada', Partial<Record<MotivoNoAbrir, number>>>
  /** Renovaciones abiertas solas que ya se pueden cerrar (renovó o la sustituyó otra). */
  cierres: { id: string; motivo: 'renovada' | 'sustituida' }[]
}

type FilaRenovacion = {
  polizaId: string; clienteId: string; ramo: string; compania: string | null; numeroPoliza: string | null
  vence: string | null; prima: string | null; importRef: string | null; eiacXmlHash: string | null; estado: string
  sustituidaAt: Date | null; yaAbierta: boolean; yaEsteCiclo: boolean
}

type FilaDeclarada = {
  declaradaId: string; clienteId: string | null; ramo: string | null; compania: string | null
  numeroPoliza: string | null; vence: string | null; yaAbierta: boolean; yaEsteCiclo: boolean; yaEnCartera: boolean
}

function contar(m: Partial<Record<MotivoNoAbrir, number>>, k: MotivoNoAbrir) {
  m[k] = (m[k] ?? 0) + 1
}

/** Lo que abriría y cerraría hoy, SIN escribir nada. */
export async function planExpedientesAuto(db: Db, correduriaId: string, hoy: string): Promise<PlanExpedientesAuto> {
  const vencSql = sqlVencimientoConRecibos('p', hoy)
  const renov = await db.$queryRaw<FilaRenovacion[]>(Prisma.sql`
    with base as (
      select p.id, p.cliente_id, p.correduria_id, p.tipo::text as ramo, p.aseguradora, p.numero_poliza,
             p.import_ref, p.eiac_xml_hash, p.estado::text as estado, p.sustituida_at,
             ${vencSql} as vence,
             coalesce(nullif(coalesce(p.prima_bruta, p.prima_anual), 0), ${sqlPrimaDeRecibo('p', hoy)})::text as prima
      from polizas p
      join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id and c.activo
      where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null
        and ${Prisma.raw(sqlCarteraEnVigor('p'))}
    )
    select b.id::text as "polizaId", b.cliente_id::text as "clienteId", b.ramo, b.aseguradora as compania,
           b.numero_poliza as "numeroPoliza", to_char(b.vence, 'YYYY-MM-DD') as vence, b.prima,
           b.import_ref as "importRef", b.eiac_xml_hash as "eiacXmlHash", b.estado, b.sustituida_at as "sustituidaAt",
           exists (
             select 1 from oportunidades o
             where o.correduria_id = b.correduria_id and ${ABIERTA}
               and (o.poliza_id = b.id or o.info_riesgo->>'polizaId' = b.id::text or o.info_riesgo->>'polizaAnteriorId' = b.id::text
                    or (o.cliente_id = b.cliente_id and o.tipo::text = b.ramo and ${numNorm(Prisma.sql`b.numero_poliza`)} <> ''
                        and ${numNorm(Prisma.sql`o.numero_poliza`)} = ${numNorm(Prisma.sql`b.numero_poliza`)}
                        -- La bolsa del volcado sin tocar no cuenta: no sale en «Mi mesa» y taparía la renovación.
                        and not (o.import_ref is not null and o.estado::text = 'competencia')))
           ) as "yaAbierta",
           exists (
             select 1 from oportunidades o
             where o.correduria_id = b.correduria_id and o.info_riesgo->>'origen' = ${ORIGEN_RENOVACION_CARTERA}
               and o.info_riesgo->>'polizaId' = b.id::text and o.info_riesgo->>'vence' = to_char(b.vence, 'YYYY-MM-DD')
           ) as "yaEsteCiclo"
    from base b
    where b.vence between ${hoy}::date and ${hoy}::date + ${DIAS_PREAVISO_ASEGURADOR}::int
    order by b.vence`)

  const decl = await db.$queryRaw<FilaDeclarada[]>(Prisma.sql`
    with d as (
      select d.id, d.ramo, d.compania, d.numero_poliza, d.fecha_vencimiento,
             (select v.cliente_id from portal_vinculo v
               where v.identidad_id = d.identidad_id and v.correduria_id = ${correduriaId}::uuid
               order by v.creado_en limit 1) as cliente_id
      from portal_poliza_declarada d
      where d.fecha_vencimiento between ${hoy}::date and ${hoy}::date + ${DIAS_PREAVISO_ASEGURADOR}::int
    )
    select d.id::text as "declaradaId", d.cliente_id::text as "clienteId", d.ramo, d.compania,
           d.numero_poliza as "numeroPoliza", to_char(d.fecha_vencimiento, 'YYYY-MM-DD') as vence,
           (d.cliente_id is not null and exists (
             select 1 from oportunidades o
             where o.correduria_id = ${correduriaId}::uuid and ${ABIERTA}
               and (o.info_riesgo->>'declaradaId' = d.id::text
                    or (o.cliente_id = d.cliente_id and ${numNorm(Prisma.sql`d.numero_poliza`)} <> ''
                        and ${numNorm(Prisma.sql`coalesce(o.numero_poliza, o.poliza_competencia->>'nPoliza')`)} = ${numNorm(Prisma.sql`d.numero_poliza`)}
                        and not (o.import_ref is not null and o.estado::text = 'competencia')))
           )) as "yaAbierta",
           -- Su número ya está en NUESTRA cartera (cualquier ficha: la sociedad del que la sube también): no es un lead.
           (${numNorm(Prisma.sql`d.numero_poliza`)} <> '' and exists (
             select 1 from polizas p
             where p.correduria_id = ${correduriaId}::uuid
               and ${numNorm(Prisma.sql`p.numero_poliza`)} = ${numNorm(Prisma.sql`d.numero_poliza`)}
           )) as "yaEnCartera",
           exists (
             select 1 from oportunidades o
             where o.correduria_id = ${correduriaId}::uuid and o.info_riesgo->>'origen' = ${ORIGEN_DECLARADA_PORTAL}
               and o.info_riesgo->>'declaradaId' = d.id::text and o.info_riesgo->>'vence' = to_char(d.fecha_vencimiento, 'YYYY-MM-DD')
           ) as "yaEsteCiclo"
    from d
    order by d.fecha_vencimiento`)

  const aperturas: Apertura[] = []
  const noAbiertas: PlanExpedientesAuto['noAbiertas'] = { renovacion: {}, declarada: {} }
  for (const f of renov) {
    const d = decidirRenovacion({ ...f }, hoy)
    if (!d.abrir) { contar(noAbiertas.renovacion, d.motivo); continue }
    aperturas.push({
      tipo: 'renovacion', clienteId: f.clienteId, origenId: f.polizaId, ramo: f.ramo, vence: d.vence, dias: d.dias,
      fechaAccion: d.fechaAccion, texto: d.texto, numeroPoliza: f.numeroPoliza, prima: f.prima,
    })
  }
  for (const f of decl) {
    const d = decidirDeclarada(f, hoy)
    if (!d.abrir || !f.clienteId) { contar(noAbiertas.declarada, d.abrir ? 'sin_vincular' : d.motivo); continue }
    aperturas.push({
      tipo: 'declarada', clienteId: f.clienteId, origenId: f.declaradaId, ramo: tipoDeRamoDeclarado(f.ramo), vence: d.vence,
      dias: d.dias, fechaAccion: d.fechaAccion, texto: d.texto, numeroPoliza: f.numeroPoliza, prima: null,
    })
  }

  // Cierre de las renovaciones abiertas solas que ya se resolvieron (renovó, o la sustituyó otra).
  const abiertas = await db.$queryRaw<{ id: string; venceExp: string | null; venceActual: string | null; enVigor: boolean; sustituida: boolean }[]>(Prisma.sql`
    select o.id::text as id, o.info_riesgo->>'vence' as "venceExp",
           to_char(${vencSql}, 'YYYY-MM-DD') as "venceActual",
           coalesce(${Prisma.raw(sqlCarteraEnVigor('p'))}, false) as "enVigor",
           (p.sustituida_at is not null or exists (
              select 1 from polizas h where h.correduria_id = p.correduria_id and h.merged_into_poliza_id is null
                and ${Prisma.raw(sqlCarteraViva('h'))} and (h.poliza_padre_id = p.id or h.poliza_origen_id = p.id))) as sustituida
    from oportunidades o
    join polizas p on p.id = o.poliza_id and p.correduria_id = o.correduria_id
    where o.correduria_id = ${correduriaId}::uuid and ${ABIERTA}
      and o.info_riesgo->>'origen' = ${ORIGEN_RENOVACION_CARTERA}`)
  const cierres: PlanExpedientesAuto['cierres'] = []
  for (const a of abiertas) {
    const m = renovacionResuelta({ venceExpediente: a.venceExp, venceActual: a.venceActual, enVigor: a.enVigor, sustituida: a.sustituida })
    if (m) cierres.push({ id: a.id, motivo: m })
  }
  return { hoy, aperturas, noAbiertas, cierres }
}

export type ResultadoExpedientesAuto = {
  abiertas: { id: string; clienteId: string; tipo: Apertura['tipo'] }[]
  cerradas: { id: string; motivo: 'renovada' | 'sustituida' }[]
  noAbiertas: PlanExpedientesAuto['noAbiertas']
}

/**
 * Abre y cierra. Se llama DENTRO de la transacción del detector (con su candado). Cada apertura vuelve a
 * comprobar, con la fila ya escrita por otra vía en la misma transacción, que no hay otra de ese ciclo.
 */
export async function generarExpedientesAuto(tx: Db, correduriaId: string, hoy: string): Promise<ResultadoExpedientesAuto> {
  const plan = await planExpedientesAuto(tx, correduriaId, hoy)
  const abiertas: ResultadoExpedientesAuto['abiertas'] = []
  for (const a of plan.aperturas) {
    const info = a.tipo === 'renovacion'
      ? { origen: ORIGEN_RENOVACION_CARTERA, polizaId: a.origenId, vence: a.vence }
      : { origen: ORIGEN_DECLARADA_PORTAL, declaradaId: a.origenId, vence: a.vence }
    const fuente = a.tipo === 'renovacion' ? 'renovacion' : 'otros'
    const polizaId = a.tipo === 'renovacion' ? a.origenId : null
    // Insertar SOLO si no existe ya la de este ciclo (idempotente aunque el plan se quedara viejo).
    const [o] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, fecha_fin_vigencia, numero_poliza, prima_bruta, poliza_id, info_riesgo)
      select ${correduriaId}::uuid, ${a.clienteId}::uuid, cast(${a.ramo} as tipo_seguro), cast(${fuente} as fuente_origen),
             -- Cast explícito: en un INSERT … SELECT el literal suelto llega como text y no se asigna a un enum.
             cast('en_negociacion' as estado_comercial),
             ${a.vence}::date, ${a.numeroPoliza}::text, ${a.prima}::numeric, ${polizaId}::uuid, ${JSON.stringify(info)}::jsonb
      where not exists (
        select 1 from oportunidades x
        where x.correduria_id = ${correduriaId}::uuid and x.info_riesgo->>'origen' = ${info.origen}
          and x.info_riesgo->>(${a.tipo === 'renovacion' ? 'polizaId' : 'declaradaId'}::text) = ${a.origenId}::text
          and x.info_riesgo->>'vence' = ${a.vence})
      returning id::text as id`)
    if (!o) continue
    await tx.$executeRaw(Prisma.sql`
      insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, oportunidad_id, origen_trigger)
      values (${correduriaId}::uuid, cast('llamada' as gestion_tipo), cast('media' as gestion_prioridad), 'pendiente', ${a.texto},
              (${a.fechaAccion}::date + time '23:59:59') at time zone 'Europe/Madrid',
              ${a.clienteId}::uuid, ${polizaId}::uuid, ${o.id}::uuid, 'central:seguimiento')`)
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${o.id}::uuid, ${a.tipo === 'renovacion' ? 'creada_renovacion' : 'creada_declarada'}, null, 'en_negociacion',
              ${JSON.stringify({ ...info, dias: a.dias })}::jsonb, ${ACTOR})`)
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${a.clienteId}::uuid, ${polizaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Expediente abierto solo: ${a.texto}`})`)
    abiertas.push({ id: o.id, clienteId: a.clienteId, tipo: a.tipo })
  }

  const cerradas: ResultadoExpedientesAuto['cerradas'] = []
  for (const c of plan.cierres) {
    const n = await tx.$executeRaw(Prisma.sql`
      update oportunidades o set estado = 'ganada', cerrada_at = now(), updated_at = now()
      where o.id = ${c.id}::uuid and o.correduria_id = ${correduriaId}::uuid and ${ABIERTA}`)
    if (n === 0) continue
    await tx.$executeRaw(Prisma.sql`
      update gestiones set estado = 'cerrada', updated_at = now(),
             observaciones = observaciones || ${`\n— Cerrada sola: la póliza ya ${c.motivo === 'renovada' ? 'ha renovado' : 'está sustituida por otra'}.`}
      where oportunidad_id = ${c.id}::uuid and correduria_id = ${correduriaId}::uuid and estado <> 'cerrada'`)
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${c.id}::uuid, 'renovacion_resuelta', null, 'ganada', ${JSON.stringify({ motivo: c.motivo })}::jsonb, ${ACTOR})`)
    cerradas.push(c)
  }
  return { abiertas, cerradas, noAbiertas: plan.noAbiertas }
}
