// apps/asegura/lib/seguro-anterior-candidatas.ts
//
// Imputar el bonus del CONDUCTOR al tarificar un vehículo NUEVO (03/10/2026, Alberto): se leen las
// pólizas de auto/moto que ya conocemos de ESA ficha y la regla pura de `@central/module-seguros`
// (`elegirSeguroAnteriorParaImputar`, `historialParaImputar`) decide cuál se declara y con qué años.
//
// De dónde salen las candidatas (todas de la MISMA ficha, por `cliente_id`; nunca por nombre):
//   - cartera: sus pólizas de auto/moto EN VIGOR (`sqlCarteraEnVigor`), con compañía y nº de EIAC y
//     los siniestros anotados en nuestro CRM;
//   - competencia: sus oportunidades de auto/moto con la póliza que tiene en otra compañía leída
//     de su PDF (`poliza_competencia.seguroAnterior`, que es donde acaba la extracción de
//     `leer-documento`). Las vencidas hace más de un año no cuentan: ya no acreditan historial.
//
// Una lectura que falla NO es «no tiene pólizas»: se devuelve el error y quien llama decide (la
// ruta que paga no cotiza de calle a ciegas).
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import {
  codigoDgsPorNombre,
  seguroAnteriorDe,
  sqlCarteraEnVigor,
  type CandidataSeguroAnterior,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { catalogoCompanias } from './emision'
import { listarRelaciones } from './cartera-relaciones'
import { conyugesDe } from './seguro-anterior-conyuge'
import { imputarConLectura, imputarParaPrecalificar, type Imputacion, type LecturaCandidatas, type SeguroAnteriorPublico } from './seguro-anterior-reglas'

export {
  CONDICION_BONUS_SUPUESTO,
  bonusSupuestoFinal,
  carnetMasAntiguo,
  seguroAnteriorNoDisponible,
  type Imputacion,
  type LecturaCandidatas,
  type SeguroAnteriorPublico,
} from './seguro-anterior-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Techo de candidatas por cliente: un particular no tiene cientos de vehículos. */
const TECHO = 40

function fecha(d: Date | string | null): string | null {
  if (d === null) return null
  if (typeof d === 'string') return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

type OportunidadFila = {
  id: string; cliente_id: string | null; tipo: string; aseguradora: string | null; numero_poliza: string | null
  matricula: string | null; vehiculo: string | null; seguro_anterior: unknown
}

/** Las pólizas de motor conocidas de UNA ficha. Gratis (solo BD). */
export async function candidatasSeguroAnterior(
  correduriaId: string,
  clienteId: string,
  opciones: { soloCartera?: boolean } = {},
): Promise<LecturaCandidatas> {
  if (!UUID.test(clienteId) || !UUID.test(correduriaId)) return { ok: false, motivo: 'identificador no válido' }
  try {
    const db = prismaAsegura()
    const [polizas, oportunidades] = await Promise.all([
      db.$queryRaw<{
        id: string; cliente_id: string; tipo: string; aseguradora: string | null; codigo_dgs: string | null
        numero_poliza: string | null; efecto: Date | null; matricula: string | null; vehiculo: string | null; siniestros: number
      }[]>(Prisma.sql`
        select p.id::text as id, p.cliente_id::text as cliente_id, p.tipo::text as tipo, p.aseguradora,
               nullif(trim(p.codigo_entidad_dgs), '') as codigo_dgs, nullif(trim(p.numero_poliza), '') as numero_poliza,
               coalesce(p.fecha_efecto_inicial, p.fecha_inicio) as efecto,
               nullif(trim(p.datos_especificos->>'matricula'), '') as matricula,
               nullif(trim(concat_ws(' ', p.datos_especificos->>'marca', p.datos_especificos->>'modelo')), '') as vehiculo,
               (select count(*)::int from siniestros s where s.poliza_id = p.id and s.correduria_id = p.correduria_id and s.fusionado_en_siniestro_id is null) as siniestros
        from polizas p
        where p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid
          and p.merged_into_poliza_id is null and p.tipo::text in ('auto', 'moto')
          and ${Prisma.raw(sqlCarteraEnVigor('p'))}
        order by p.id
        limit ${TECHO}`),
      opciones.soloCartera ? Promise.resolve<OportunidadFila[]>([]) : db.$queryRaw<OportunidadFila[]>(Prisma.sql`
        select o.id::text as id, o.cliente_id::text as cliente_id, o.tipo::text as tipo,
               nullif(trim(o.poliza_competencia->>'aseguradora'), '') as aseguradora,
               coalesce(nullif(trim(o.numero_poliza), ''), nullif(trim(o.poliza_competencia->>'nPoliza'), ''),
                        nullif(trim(o.poliza_competencia->>'numeroPoliza'), '')) as numero_poliza,
               nullif(trim(o.info_riesgo->>'matricula'), '') as matricula,
               coalesce(nullif(trim(o.info_riesgo->>'vehiculo'), ''), nullif(trim(concat_ws(' ', o.info_riesgo->>'marca', o.info_riesgo->>'modelo')), '')) as vehiculo,
               o.poliza_competencia->'seguroAnterior' as seguro_anterior
        from oportunidades o
        where o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${clienteId}::uuid
          and o.tipo::text in ('auto', 'moto') and o.poliza_competencia is not null
          and (o.fecha_fin_vigencia is null or o.fecha_fin_vigencia >= (current_date - interval '1 year'))
        order by o.created_at desc
        limit ${TECHO}`),
    ])

    // El código DGS de la competencia suele no venir en el PDF: se deduce del NOMBRE solo si encaja
    // con UNA compañía del catálogo (si no se puede leer el catálogo, se queda en null y se dice).
    const faltaDgs = oportunidades.some((o) => !seguroAnteriorDe(o.seguro_anterior)?.codigoDgs && o.aseguradora)
    const catalogo = faltaDgs ? await catalogoCompanias() : null

    const candidatas: CandidataSeguroAnterior[] = []
    for (const p of polizas) {
      const seguro = seguroAnteriorDe({ codigoDgs: p.codigo_dgs, fechaEfecto: fecha(p.efecto), numeroPoliza: p.numero_poliza, matricula: p.matricula }) ?? {
        codigoDgs: null, fechaEfecto: null, aniosSinSiniestros: null, siniestrosUltimos5: null,
      }
      candidatas.push({
        id: `poliza:${p.id}`,
        origen: 'cartera',
        clienteId: p.cliente_id,
        tipoVehiculo: p.tipo === 'moto' ? 'moto' : 'turismo',
        compania: p.aseguradora,
        seguro,
        siniestrosAnotados: p.siniestros,
        etiqueta: [p.matricula, p.vehiculo].filter(Boolean).join(' · ') || null,
      })
    }
    for (const o of oportunidades) {
      const leido = seguroAnteriorDe(o.seguro_anterior)
      const notas: string[] = []
      let codigoDgs = leido?.codigoDgs ?? null
      if (!codigoDgs && o.aseguradora) {
        if (catalogo === null) notas.push('no se ha podido leer el catálogo de compañías para deducir el código DGS')
        else {
          codigoDgs = codigoDgsPorNombre(catalogo, o.aseguradora)
          if (codigoDgs) notas.push(`código DGS deducido del nombre «${o.aseguradora}»`)
        }
      }
      const seguro = seguroAnteriorDe({
        ...(leido ?? {}),
        codigoDgs,
        numeroPoliza: leido?.numeroPoliza ?? o.numero_poliza,
        matricula: leido?.matricula ?? o.matricula,
      })
      if (!seguro) continue
      candidatas.push({
        id: `oportunidad:${o.id}`,
        origen: 'competencia',
        clienteId: o.cliente_id,
        tipoVehiculo: o.tipo === 'moto' ? 'moto' : 'turismo',
        compania: o.aseguradora,
        seguro,
        siniestrosAnotados: null,
        etiqueta: [o.matricula, o.vehiculo].filter(Boolean).join(' · ') || null,
        notas,
      })
    }
    return { ok: true, candidatas }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/gi, '[url]') : String(e) }
  }
}

/**
 * Las del tomador + las pólizas de motor EN VIGOR de su cónyuge/pareja (07/10/2026, ver `conyugesDe`): la
 * bonificación va con el tomador, pero muchas compañías aceptan la del cónyuge. Del cónyuge solo se leen
 * pólizas de cartera en vigor (mismo criterio `sqlCarteraEnVigor`), marcadas `delConyuge` para que solo
 * se puedan elegir a mano. Si NO se pueden leer las relaciones (o las pólizas del cónyuge) se sirve lo del
 * tomador con `conyugeNoMirado: true`: el fallo no tumba la cotización ni se presenta como «no tiene».
 */
export async function candidatasSeguroAnteriorConConyuge(correduriaId: string, clienteId: string): Promise<LecturaCandidatas> {
  const propias = await candidatasSeguroAnterior(correduriaId, clienteId)
  if (!propias.ok) return propias
  const relaciones = await listarRelaciones(correduriaId, clienteId)
  if (relaciones === null) return { ...propias, conyugeNoMirado: true }
  const candidatas = [...propias.candidatas]
  let conyugeNoMirado = false
  for (const c of conyugesDe(relaciones, clienteId)) {
    const suyas = await candidatasSeguroAnterior(correduriaId, c.id, { soloCartera: true })
    if (!suyas.ok) { conyugeNoMirado = true; continue }
    candidatas.push(...suyas.candidatas.map((x) => ({ ...x, delConyuge: c.nombre })))
  }
  return conyugeNoMirado ? { ok: true, candidatas, conyugeNoMirado } : { ok: true, candidatas }
}

/** Imputa el seguro anterior leyendo las candidatas de la BD (la decisión es `imputarConLectura`, pura). */
export function imputarSeguroAnterior(entrada: Omit<Parameters<typeof imputarConLectura>[0], 'leer'>): Promise<Imputacion> {
  return imputarConLectura({ ...entrada, leer: candidatasSeguroAnteriorConConyuge })
}

/** Igual, para la precalificación gratis: nunca lanza (ver `imputarParaPrecalificar`). */
export function imputarSeguroAnteriorGratis(entrada: Omit<Parameters<typeof imputarConLectura>[0], 'leer'>): Promise<Imputacion> {
  return imputarParaPrecalificar({ ...entrada, leer: candidatasSeguroAnteriorConConyuge })
}

/**
 * Anota en la tarificación ya guardada qué seguro anterior se declaró y si el bonus fue supuesto.
 * 🔒 `porque` describe esa póliza (compañía, últimas cifras del nº, matrícula y modelo del vehículo):
 * es dato del riesgo vinculable al cliente, no un texto anónimo.
 * NUNCA lanza: la cotización ya está pagada. Si no se puede escribir (columna sin migrar), la
 * emisión lo leerá como NULL = «no se sabe» y pedirá verificación: el fallo es conservador.
 */
export async function anotarBonusTarificacion(
  correduriaId: string,
  tarificacionId: string,
  info: { bonusSupuesto: boolean; publico: SeguroAnteriorPublico },
): Promise<boolean> {
  try {
    const imputado = {
      estado: info.publico.estado,
      elegidaId: info.publico.elegida?.id ?? null,
      porque: info.publico.porque,
      elegidaPorCorredor: info.publico.elegidaPorCorredor,
    }
    await prismaAsegura().$executeRaw`
      update tarificaciones
         set bonus_supuesto = ${info.bonusSupuesto}, bonus_imputado = ${JSON.stringify(imputado)}::jsonb
       where id = ${tarificacionId}::uuid and correduria_id = ${correduriaId}::uuid`
    return true
  } catch (e) {
    console.log(`[seguro-anterior] no se pudo anotar el bonus de la tarificación ${tarificacionId} —`, e instanceof Error ? e.message : String(e))
    return false
  }
}

/** Lo anotado de una tarificación. `null` en cada campo = no consta o no se ha podido leer. */
export async function leerBonusTarificacion(
  correduriaId: string,
  tarificacionId: string,
): Promise<{ bonusSupuesto: boolean | null; verificacion: unknown; leido: boolean }> {
  try {
    const filas = await prismaAsegura().$queryRaw<{ bonus_supuesto: boolean | null; bonus_verificacion: unknown }[]>`
      select bonus_supuesto, bonus_verificacion from tarificaciones
       where id = ${tarificacionId}::uuid and correduria_id = ${correduriaId}::uuid`
    const f = filas[0]
    return { bonusSupuesto: f?.bonus_supuesto ?? null, verificacion: f?.bonus_verificacion ?? null, leido: !!f }
  } catch {
    return { bonusSupuesto: null, verificacion: null, leido: false }
  }
}

/** Guarda la verificación que el corredor declara al emitir. Best-effort: el log de `auditado` ya la lleva. */
export async function guardarVerificacionBonus(
  correduriaId: string,
  tarificacionId: string,
  verificacion: { fuente: string; nota: string | null },
  actor: string,
): Promise<void> {
  try {
    const v = { ...verificacion, por: actor, en: new Date().toISOString() }
    await prismaAsegura().$executeRaw`
      update tarificaciones set bonus_verificacion = ${JSON.stringify(v)}::jsonb
       where id = ${tarificacionId}::uuid and correduria_id = ${correduriaId}::uuid`
  } catch (e) {
    console.log(`[seguro-anterior] no se pudo guardar la verificación del bonus de ${tarificacionId} —`, e instanceof Error ? e.message : String(e))
  }
}
