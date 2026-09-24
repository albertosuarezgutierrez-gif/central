// Enlaza sola la póliza nueva con la que sustituye (cambio de compañía, o renovación con número
// nuevo) cuando la prueba es determinista: la regla vive en `detectarSustituciones`
// (module-seguros/src/sustitucion-auto.ts). Corre DENTRO de `detectarYGuardar`, antes de la foto:
// así la baja posterior de la vieja ya nace explicada y no se anuncia como fuga ni abre retención.
//
// Solo toca NUESTROS campos (`sustituida_at`, `poliza_origen_id`): CIMA no los escribe nunca, así
// que la próxima ingesta no los pisa. No se comunica nada a nadie.

import { detectarSustituciones, ORIGEN_RETENCION, POLIZA_ESTADOS_VIGENTES, solicitudPorSustitucion, sqlCarteraViva, validarSolicitudAnulacion, type RiesgoComun } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import type { prismaAsegura } from './asegura-db'

type Tx = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

export type ResultadoEnlaceSustituciones = { enlazadas: number; ambiguas: number; duplicidades: number }

/** Frase para el historial: la matrícula es dato del contrato; una dirección o un DNI no se escriben. */
function comoSeSabe(r: RiesgoComun): string {
  switch (r.tipo) {
    case 'matricula': return `mismo vehículo ${r.valor}`
    case 'catastro': return 'misma referencia catastral'
    case 'direccion': return 'misma dirección del riesgo'
    case 'asegurado': return 'mismo asegurado'
  }
}

/** Descifra la dirección del riesgo; `null` si no hay o si sigue cifrada (sin clave no hay prueba). */
function direccionEnClaro(v: string | null): string | null {
  if (!v) return null
  try {
    const d = decryptField(v)
    return typeof d === 'string' && !d.startsWith('v1:') ? d : null
  } catch {
    return null
  }
}

const VIGENTES = [...POLIZA_ESTADOS_VIGENTES] as string[]

export async function enlazarSustituciones(tx: Tx, correduriaId: string): Promise<ResultadoEnlaceSustituciones> {
  const viva = Prisma.raw(sqlCarteraViva('p'))
  const filas = await tx.$queryRaw<{
    id: string; cliente_id: string; ramo: string; numero_poliza: string | null; inicio: string | null
    vencimiento: string | null; matricula: string | null; vigente: boolean; sustituida: boolean; con_origen: boolean
    aseguradora: string | null; padre_id: string | null; refcat: string | null; direccion: string | null; cp: string | null
    nif_asegurado: string | null
  }[]>`
    select p.id::text as id, p.cliente_id::text as cliente_id, p.tipo::text as ramo, p.numero_poliza,
           to_char(p.fecha_inicio, 'YYYY-MM-DD') as inicio, to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento,
           nullif(trim(p.datos_especificos->>'matricula'), '') as matricula,
           p.estado::text = any(${VIGENTES}::text[]) as vigente,
           p.sustituida_at is not null as sustituida, p.poliza_origen_id is not null as con_origen, p.aseguradora,
           p.poliza_padre_id::text as padre_id,
           coalesce(p.datos_especificos->>'referencia_catastral', p.datos_especificos->>'referenciaCatastral', p.datos_especificos->>'refcat') as refcat,
           p.datos_especificos->>'direccion' as direccion, p.datos_especificos->>'cp' as cp,
           (select i.nif_lookup_hash from poliza_intervinientes i
             where i.poliza_id = p.id and i.rol::text = 'asegurado' and i.nif_lookup_hash is not null
             order by i.created_at limit 1) as nif_asegurado
    from polizas p
    where p.correduria_id = ${correduriaId}::uuid and ${viva} and p.merged_into_poliza_id is null`
  const { enlaces, ambiguas, duplicidades } = detectarSustituciones(filas.map((f) => ({
    id: f.id, clienteId: f.cliente_id, ramo: f.ramo, numeroPoliza: f.numero_poliza, fechaInicio: f.inicio,
    fechaVencimiento: f.vencimiento, matricula: f.matricula, vigente: f.vigente, sustituida: f.sustituida, conOrigen: f.con_origen,
    padreId: f.padre_id, refCatastral: f.refcat, direccion: direccionEnClaro(f.direccion), cp: f.cp, nifAsegurado: f.nif_asegurado,
  })))
  const porId = new Map(filas.map((f) => [f.id, f]))
  let enlazadas = 0
  for (const e of enlaces) {
    // Las dos guardas `is null` hacen idempotente la pasada: otra que corra a la vez, o una emisión
    // de Codeoscopic que enlazó entre medias, no se pisa.
    const n = await tx.$executeRaw`
      update polizas set poliza_origen_id = ${e.viejaId}::uuid, updated_at = now()
      where id = ${e.nuevaId}::uuid and correduria_id = ${correduriaId}::uuid and poliza_origen_id is null`
    if (n === 0) continue
    await tx.$executeRaw`
      update polizas set sustituida_at = now(), updated_at = now()
      where id = ${e.viejaId}::uuid and correduria_id = ${correduriaId}::uuid and sustituida_at is null`
    const v = porId.get(e.viejaId)!
    const nu = porId.get(e.nuevaId)!
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${nu.cliente_id}::uuid, ${e.nuevaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Sustitución enlazada sola: la póliza ${nu.aseguradora ?? ''} ${nu.numero_poliza ?? ''} (efecto ${nu.inicio}) sustituye a la ${v.aseguradora ?? ''} ${v.numero_poliza ?? ''} (vence ${v.vencimiento}), ${comoSeSabe(e.riesgo)}.`})`
    enlazadas++
  }
  return { enlazadas, ambiguas, duplicidades: duplicidades.length }
}

/**
 * «Se avisa a la compañía cuando se emite la otra» (Alberto, 23/09/2026). Un presupuesto ACEPTADO
 * (el cliente firmó la opción y, con ella, la anulación de su póliza vieja) espera a que alguien
 * pulse «Ya está emitida» para soltar esa anulación a la cola. Aquí se marca solo en cuanto la
 * nueva CONSTA: una póliza del mismo cliente que sustituye a la del presupuesto y es de la compañía
 * elegida (por código DGS; un nombre que no casa con el catálogo no se da por bueno).
 */
export async function liberarPresupuestosEmitidos(tx: Tx, correduriaId: string): Promise<number> {
  const filas = await tx.$queryRaw<{ id: string; nueva: string }[]>`
    with cand as (
      select distinct on (pr.id) pr.id, n.id as nueva
      from presupuesto pr
        join presupuesto_opcion o on o.id = pr.opcion_elegida_id
        join polizas n on n.poliza_origen_id = pr.poliza_id and n.correduria_id = pr.correduria_id and n.cliente_id = pr.cliente_id and n.merged_into_poliza_id is null
        join companias_dgs cd on cd.codigo_dgs = n.codigo_entidad_dgs
      where pr.correduria_id = ${correduriaId}::uuid and pr.poliza_id is not null
        and pr.aceptado_at is not null and pr.emitido_at is null and pr.retirado_at is null
        and lower(trim(o.compania)) in (lower(cd.nombre_comun), lower(coalesce(cd.nombre_cima, '')))
      order by pr.id, n.created_at desc)
    update presupuesto set emitido_at = now(), poliza_emitida_id = coalesce(presupuesto.poliza_emitida_id, cand.nueva::uuid)
    from cand where presupuesto.id = cand.id and presupuesto.emitido_at is null
    returning presupuesto.id::text as id, cand.nueva::text as nueva`
  for (const f of filas) {
    await tx.$executeRaw`
      insert into presupuesto_evento (presupuesto_id, tipo, origen, detalle)
      values (${f.id}::uuid, 'emitido', 'sistema', ${JSON.stringify({ polizaEmitidaId: f.nueva, via: 'sustitucion_en_cartera' })}::jsonb)`
  }
  return filas.length
}

/**
 * La nueva se emitió FUERA de nuestro presupuesto (web de la compañía o de Codeoscopic) y nadie ha
 * pedido la baja de la vieja: se abre el expediente `sustitucion` en `solicitada`, que el cliente
 * FIRMA en su portal; el correo a la compañía sale después por la cola de aprobaciones. Nunca sobre
 * una póliza que ya tuvo expediente (tampoco uno desistido: esa decisión ya se tomó).
 */
export async function abrirAnulacionesPorSustitucion(tx: Tx, correduriaId: string, hoy: string): Promise<{ abiertas: number; sinDatos: number }> {
  const filas = await tx.$queryRaw<{ id: string; cliente_id: string; vencimiento: string | null; inicio: string | null; misma: boolean; compania: string | null; numero: string | null }[]>`
    select distinct on (v.id) v.id::text as id, v.cliente_id::text as cliente_id,
           to_char(v.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento, to_char(n.fecha_inicio, 'YYYY-MM-DD') as inicio,
           coalesce(v.codigo_entidad_dgs = n.codigo_entidad_dgs, false) as misma, n.aseguradora as compania, n.numero_poliza as numero
    from polizas v
      join polizas n on n.poliza_origen_id = v.id and n.correduria_id = v.correduria_id and n.merged_into_poliza_id is null and n.estado::text = any(${VIGENTES}::text[])
    where v.correduria_id = ${correduriaId}::uuid and v.sustituida_at is not null and v.merged_into_poliza_id is null
      and v.estado::text = any(${VIGENTES}::text[])
      and not exists (select 1 from anulacion a where a.poliza_id = v.id)
      and not exists (select 1 from presupuesto pr where pr.poliza_id = v.id and pr.aceptado_at is not null and pr.retirado_at is null)
    order by v.id, n.created_at desc`
  let abiertas = 0
  let sinDatos = 0
  for (const f of filas) {
    const s = solicitudPorSustitucion({ vencimiento: f.vencimiento, inicioNueva: f.inicio, mismaCompania: f.misma }, hoy)
    const v = s && validarSolicitudAnulacion(s, { vencimiento: f.vencimiento, hoy })
    if (!v || !v.ok) { sinDatos++; continue }
    const r = v.solicitud
    const ins = await tx.$queryRaw<{ id: string }[]>`
      insert into anulacion (correduria_id, poliza_id, cliente_id, tipo, solicitada_por, motivo, motivo_texto, fecha_efecto, creada_por)
      values (${correduriaId}::uuid, ${f.id}::uuid, ${f.cliente_id}::uuid, ${r.tipo}, ${r.solicitadaPor}, ${r.motivo},
              ${r.motivoTexto}, ${r.fechaEfecto}::date, 'sistema:sustitucion')
      on conflict do nothing
      returning id::text as id`
    if (!ins[0]) continue
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${f.cliente_id}::uuid, ${f.id}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Anulación por sustitución abierta sola (efecto ${r.fechaEfecto}): la sustituye la póliza ${f.compania ?? ''} ${f.numero ?? ''}. Falta la firma del cliente en su portal; después, el correo a la compañía pasa por tu OK.`})`
    abiertas++
  }
  return { abiertas, sinDatos }
}

/**
 * Cierra como `ganada` la oportunidad de venta (lead o presupuesto de otra compañía que Alberto dio de
 * alta) cuando su póliza YA ha entrado en cartera: la del mismo cliente y la misma matrícula, viva,
 * llegada después de abrirse la oportunidad y que no es la póliza de la competencia que se quería
 * sustituir. Solo si la pareja es única en los dos sentidos: una oportunidad con dos candidatas, o una
 * póliza que casa con dos oportunidades, no se elige (lo decide Alberto).
 *
 * No es venta la renovación de lo que ya teníamos: si antes de abrirse la oportunidad ya había en
 * cartera una póliza de ese coche y cliente con la MISMA compañía, la nueva es su renovación (o CIMA
 * rehaciendo la fila) y no gana nada.
 *
 * Sin matrícula no se cierra sola: casar por ramo o por compañía confundiría dos pólizas de hogar del
 * mismo cliente. Las de retención tienen su propio cierre (`cerrarRetencionesResueltas`), y los leads
 * del volcado (`import_ref`) no se tocan: su fecha de alta es la de la importación, no la de la venta.
 * Tampoco gana la póliza de la competencia que entra con el MISMO número (cambio de mediador): esa se
 * marca a mano.
 *
 * Devuelve las que ha cerrado; la auditoría (`anotarCambio`) la escribe quien llama, tras el commit.
 */
export async function ganarOportunidadesEmitidas(tx: Tx, correduriaId: string): Promise<{ id: string; estado: string }[]> {
  const filas = await tx.$queryRaw<{ id: string; estado: string; poliza: string; aseguradora: string | null; numero: string | null }[]>`
    with op as (
      select o.id, o.cliente_id, o.created_at, o.estado::text as estado,
             upper(regexp_replace(coalesce(o.info_riesgo->>'matricula', ''), '[^A-Za-z0-9]', '', 'g')) as mat,
             ltrim(upper(regexp_replace(coalesce(o.poliza_competencia->>'nPoliza', ''), '[^A-Za-z0-9]', '', 'g')), '0') as num_comp
      from oportunidades o
      where o.correduria_id = ${correduriaId}::uuid and o.cliente_id is not null
        and o.import_ref is null -- import_ref de OPORTUNIDAD (lead del volcado), no de póliza
        and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
        and coalesce(o.info_riesgo->>'origen', '') <> ${ORIGEN_RETENCION}),
    cand as (
      select op.id, op.estado, p.id as poliza, p.aseguradora, p.numero_poliza,
             count(*) over (partition by op.id) as n,
             count(*) over (partition by p.id) as m
      from op
        join polizas p on p.correduria_id = ${correduriaId}::uuid and p.cliente_id = op.cliente_id
          and p.merged_into_poliza_id is null and ${Prisma.raw(sqlCarteraViva('p'))}
          and p.estado::text = any(${[...POLIZA_ESTADOS_VIGENTES]}::text[])
          and p.created_at >= (op.created_at at time zone 'UTC') - interval '10 minutes'
          and upper(regexp_replace(coalesce(p.datos_especificos->>'matricula', ''), '[^A-Za-z0-9]', '', 'g')) = op.mat
          and ltrim(upper(regexp_replace(coalesce(p.numero_poliza, ''), '[^A-Za-z0-9]', '', 'g')), '0') <> op.num_comp
      where op.mat <> ''
        and not exists (select 1 from oportunidades g where g.poliza_ganada_id = p.id)
        and not exists (
          select 1 from polizas v
          where v.correduria_id = p.correduria_id and v.cliente_id = p.cliente_id and v.id <> p.id
            and v.codigo_entidad_dgs is not distinct from p.codigo_entidad_dgs
            and v.created_at < (op.created_at at time zone 'UTC')
            and upper(regexp_replace(coalesce(v.datos_especificos->>'matricula', ''), '[^A-Za-z0-9]', '', 'g')) = op.mat))
    select id::text as id, estado, poliza::text as poliza, aseguradora, numero_poliza as numero from cand where n = 1 and m = 1`
  const ganadas: { id: string; estado: string }[] = []
  for (const f of filas) {
    const n = await tx.$executeRaw`
      update oportunidades set estado = 'ganada', cerrada_at = now(), updated_at = now(),
             poliza_ganada_id = ${f.poliza}::uuid,
             aseguradora_ganadora = coalesce(aseguradora_ganadora, ${f.aseguradora}),
             numero_poliza = coalesce(numero_poliza, ${f.numero})
      where id = ${f.id}::uuid and estado::text = ${f.estado}`
    if (n === 0) continue
    await tx.$executeRaw`
      update gestiones set estado = 'cerrada', updated_at = now(),
             observaciones = observaciones || ${'\n— Cerrada sola: la póliza ya ha entrado en cartera.'}
      where oportunidad_id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado <> 'cerrada'`
    await tx.$executeRaw`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${f.id}::uuid, 'emitida_en_cartera', cast(${f.estado} as estado_comercial), 'ganada',
              ${JSON.stringify({ polizaGanadaId: f.poliza, via: 'matricula' })}::jsonb, 'sistema:cartera')`
    ganadas.push({ id: f.id, estado: f.estado })
  }
  return ganadas
}
