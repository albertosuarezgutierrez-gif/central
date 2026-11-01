// Tarificador RPA — VEHÍCULO DE REFERENCIA de la oportunidad (01/11/2026): el cableado con BD. Reglas PURAS y su porqué en
// `tarificador-vehiculo-referencia.ts`. Todo por `correduria_id`. Nada de esto lanza hacia quien llama: la referencia es ACCESORIA
// (sin ella cada bot hace lo de siempre) y nunca tumba un resultado, una entrega ni una acción de la bandeja.
// Sin migración: vive en `oportunidades.info_riesgo.vehiculoReferencia` (jsonb existente).

import type { VehiculoReferencia } from '@central/module-tarificacion'
import { prisma } from './tenant'
import {
  MARCA_ELECCION_REFERENCIA,
  eleccionPorReferenciaParaTrabajo,
  infoConReferencia,
  planPropagacion,
  referenciaDeEleccionHumana,
  referenciaEfectiva,
  type FilaParadaVersion,
  type FilaPropagacion,
  type TrabajoPropagado,
} from './tarificador-vehiculo-referencia'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type Db = Pick<Tx, '$queryRaw' | '$executeRaw'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200)

/**
 * La referencia que MANDA en la oportunidad: lo guardado en `info_riesgo.vehiculoReferencia` + la póliza VIVA vinculada (`info_riesgo.polizaId`
 * o `poliza_id`; solo `marca`/`modelo`/`version` de su `datos_especificos`, la matrícula ni se lee). Fallo de lectura → `null` (sin referencia).
 */
export async function leerReferenciaOportunidad(db: Db, correduriaId: string, oportunidadId: string): Promise<VehiculoReferencia | null> {
  try {
    const [op] = await db.$queryRaw<{ info_riesgo: unknown; poliza_id: string | null }[]>`
      select o.info_riesgo, o.poliza_id::text as poliza_id from seguros.oportunidades o
      where o.id = ${oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`
    if (!op) return null
    const info = op.info_riesgo
    const deInfo = esObj(info) && typeof info.polizaId === 'string' && UUID.test(info.polizaId) ? info.polizaId : null
    const polizaId = deInfo ?? (op.poliza_id && UUID.test(op.poliza_id) ? op.poliza_id : null)
    const datos = polizaId
      ? (
          await db.$queryRaw<{ v: unknown }[]>`
            select jsonb_build_object('marca', p.datos_especificos->'marca', 'modelo', p.datos_especificos->'modelo', 'version', p.datos_especificos->'version') as v
            from seguros.polizas p
            where p.id = ${polizaId}::uuid and p.correduria_id = ${correduriaId}::uuid
              and p.tipo::text in ('auto', 'moto') and p.estado::text = 'activa' and p.merged_into_poliza_id is null
              and jsonb_typeof(p.datos_especificos) = 'object'`
        )[0]?.v ?? null
      : null
    return referenciaEfectiva(info, datos)
  } catch (e) {
    console.error('[tarificador] vehículo de referencia: no se pudo leer', oportunidadId, msg(e))
    return null
  }
}

/** Guarda la referencia de SU origen en la oportunidad (pisa solo esa casilla). Devuelve si escribió. Nunca lanza. */
export async function guardarReferenciaOportunidad(correduriaId: string, oportunidadId: string, v: VehiculoReferencia | null): Promise<boolean> {
  if (!v) return false
  try {
    return await prisma.$transaction(async (tx) => {
      const [op] = await tx.$queryRaw<{ info_riesgo: unknown }[]>`
        select o.info_riesgo from seguros.oportunidades o
        where o.id = ${oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid for update`
      if (!op) return false
      const n = await tx.$executeRaw`
        update seguros.oportunidades set info_riesgo = ${JSON.stringify(infoConReferencia(op.info_riesgo, v))}::jsonb
        where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
      return n === 1
    })
  } catch (e) {
    console.error('[tarificador] vehículo de referencia: no se pudo guardar', oportunidadId, v.origen, msg(e))
    return false
  }
}

/** Escribe la elección por referencia y devuelve el trabajo a `pendiente` (como «Reintentar» de la bandeja). Solo si SIGUE `requiere_humano`. */
async function aplicarEleccionReferencia(tx: Db, correduriaId: string, id: string, eleccion: { codigo: string | null; etiqueta: string }, supuesto: string): Promise<boolean> {
  const n = await tx.$executeRaw`
    update seguros.tarificacion_trabajos
    set riesgo = (riesgo - 'eleccionVersionIa') || jsonb_build_object('eleccionVersion', ${JSON.stringify(eleccion)}::jsonb, ${MARCA_ELECCION_REFERENCIA}::text, ${supuesto}::text),
        estado = 'pendiente', intentos = 0, lease_hasta = null, fly_machine_id = null, error = null,
        iniciado_at = null, terminado_at = null, updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'requiere_humano' and jsonb_typeof(riesgo) = 'object'`
  return n === 1
}

/**
 * Tras la elección de una PERSONA en la bandeja (trabajo `trabajoId`, opción `etiqueta`): se guarda como referencia `humano` de la
 * oportunidad y se propaga a los demás trabajos de esa oportunidad parados por versión (cada uno elige de SU lista con el helper
 * compartido, con el supuesto declarado). Devuelve los relanzados (para lanzar su máquina). Nunca lanza.
 */
export async function propagarEleccionHumana(correduriaId: string, trabajoId: string, oportunidadId: string, etiqueta: string): Promise<TrabajoPropagado[]> {
  try {
    const previa = await leerReferenciaOportunidad(prisma, correduriaId, oportunidadId)
    const ref = referenciaDeEleccionHumana(etiqueta, previa)
    if (!ref) return []
    await guardarReferenciaOportunidad(correduriaId, oportunidadId, ref)
    return await prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<FilaPropagacion[]>`
        select t.id::text as id, t.compania, t.ramo, t.estado, to_jsonb(t)->>'modo' as modo, t.error, t.riesgo
        from seguros.tarificacion_trabajos t
        where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${oportunidadId}::uuid
          and t.id <> ${trabajoId}::uuid and t.estado = 'requiere_humano'
        for update`
      const hechos: TrabajoPropagado[] = []
      for (const p of planPropagacion(filas, ref, trabajoId)) {
        if (await aplicarEleccionReferencia(tx, correduriaId, p.id, p.eleccion, p.supuesto)) hechos.push(p)
      }
      return hechos
    })
  } catch (e) {
    console.error('[tarificador] vehículo de referencia: no se pudo propagar la elección', trabajoId, msg(e))
    return []
  }
}

export type ResultadoEleccionReferencia = { estado: 'aplicado' | 'omitido'; motivo?: string }

/**
 * Un trabajo acaba de parar por versión (`requiere_humano` con lista): si la oportunidad tiene vehículo de referencia, asegura elige
 * de la lista guardada con el helper compartido (UN intento automático) y lo relanza. Sirve para CUALQUIER bot (Generali incluido) sin
 * tocar su adaptador. Nunca lanza.
 */
export async function intentarEleccionPorReferencia(trabajoId: string): Promise<ResultadoEleccionReferencia> {
  try {
    if (!UUID.test(trabajoId)) return { estado: 'omitido', motivo: 'id' }
    const [t] = await prisma.$queryRaw<(FilaParadaVersion & { correduria_id: string; oportunidad_id: string | null; compania: string })[]>`
      select t.id::text as id, t.correduria_id::text as correduria_id, t.oportunidad_id::text as oportunidad_id, t.compania, t.ramo,
             t.estado, to_jsonb(t)->>'modo' as modo, t.error, t.riesgo
      from seguros.tarificacion_trabajos t where t.id = ${trabajoId}::uuid`
    if (!t) return { estado: 'omitido', motivo: 'no_encontrado' }
    if (!t.oportunidad_id) return { estado: 'omitido', motivo: 'sin_oportunidad' }
    const ref = await leerReferenciaOportunidad(prisma, t.correduria_id, t.oportunidad_id)
    const d = eleccionPorReferenciaParaTrabajo(t, ref, { humano: false })
    if (!d.aplicar) return { estado: 'omitido', motivo: d.motivo }
    const errorEn = esObj(t.error) && typeof t.error.en === 'string' ? t.error.en : null
    const ok = await prisma.$transaction(async (tx) => {
      // Mismo fallo y aún sin elección (otra pestaña / la IA pudo adelantarse): si no, no se pisa.
      const [a] = await tx.$queryRaw<{ estado: string; error_en: string | null; riesgo: unknown }[]>`
        select t.estado, t.error->>'en' as error_en, t.riesgo from seguros.tarificacion_trabajos t
        where t.id = ${trabajoId}::uuid and t.correduria_id = ${t.correduria_id}::uuid for update`
      if (!a || a.estado !== 'requiere_humano' || (a.error_en ?? null) !== errorEn) return false
      if (!eleccionPorReferenciaParaTrabajo({ ...t, riesgo: a.riesgo }, ref, { humano: false }).aplicar) return false
      return aplicarEleccionReferencia(tx, t.correduria_id, trabajoId, d.eleccion, d.supuesto)
    })
    if (!ok) return { estado: 'omitido', motivo: 'cambió mientras tanto' }
    const { lanzarPendientes } = await import('./tarificador')
    await lanzarPendientes(t.correduria_id, t.compania).catch((e: unknown) => console.error('[tarificador] vehículo de referencia: no se pudo lanzar', trabajoId, msg(e)))
    console.info('[tarificador] versión elegida por el vehículo de referencia', trabajoId, ref?.origen ?? '')
    return { estado: 'aplicado' }
  } catch (e) {
    console.error('[tarificador] vehículo de referencia: elección automática', trabajoId, msg(e))
    return { estado: 'omitido', motivo: 'error' }
  }
}

