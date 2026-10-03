// Cableado (BD + vendor) del descubrimiento automático de emisiones de Avant2 (03/10/2026).
// La lógica —qué se mira, qué se escribe, qué va a revisión— vive PURA y probada en
// `codeoscopic/descubrir-emisiones.ts`. Aquí solo hay consultas y el transporte de LECTURA.
//
// Escritura en la cartera: SOLO por `sincronizarEmisionExterna` (la misma que el botón de
// plataforma y `/retenidas`), que re-comprueba el documento del tomador y acuña con su candado.

import { computeDniLookupHash } from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'
import { correduriaUnica } from './cartera'
import { sincronizarEmisionExterna } from './emision-externa'
import { resolverConfig } from './codeoscopic/config'
import { peticion } from './codeoscopic/cliente'
import {
  descubrirEmisiones,
  leerConReintento,
  nuevoPresupuesto,
  procesarProyecto,
  sincronizarTrasWebhook,
  type DepsProyecto,
  type EstadoLocal,
  type ItemRevision,
  type MotivoRevision,
  type ResumenPasada,
} from './codeoscopic/descubrir-emisiones'

const ACTOR = 'descubrimiento-emisiones'
/** Llamadas al vendor por envío del webhook (trae 1-2 proyectos). */
const TOPE_WEBHOOK = 10

type Origen = 'cron' | 'webhook'

function depsProyectoBase(correduriaId: string, origen: Origen): Omit<DepsProyecto, 'leerProyecto'> {
  const db = prismaAsegura()
  return {
    filaLocal: async (projectId) => {
      const [f] = await db.$queryRaw<{ estado: string; cliente_id: string | null }[]>`
        select estado::text as estado, cliente_id::text as cliente_id from codeoscopic_projects
        where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId} limit 1`
      return f ? { estado: f.estado, clienteId: f.cliente_id } : null
    },
    clientesPorHash: async (hash) => {
      const filas = await db.$queryRaw<{ id: string }[]>`
        select id::text as id from clientes
        where correduria_id = ${correduriaId}::uuid and dni_lookup_hash = ${hash} and merged_into_cliente_id is null
        limit 5`
      return filas.map((f) => f.id)
    },
    hashDni: (doc) => computeDniLookupHash(doc),
    sincronizar: ({ projectId, clienteId, crudo }) =>
      sincronizarEmisionExterna(correduriaId, { projectId, clienteId, actor: ACTOR, escribir: true, crudo }),
    encolar: async (item: ItemRevision) => {
      const [r] = await db.$queryRaw<{ nueva: boolean }[]>`
        insert into codeoscopic_emisiones_revision
          (correduria_id, project_id_codeoscopic, motivo, coincidencias, ramo_vendor, estado_emision, estado_vendor,
           compania, numero_poliza, cliente_id, detalle, origen)
        values (${correduriaId}::uuid, ${item.projectId}, ${item.motivo}, ${item.coincidencias}::int, ${item.ramoVendor},
                ${item.estadoEmision}, ${item.estadoVendor}, ${item.compania}, ${item.numeroPoliza},
                ${item.clienteId}::uuid, ${item.detalle}, ${origen})
        on conflict (correduria_id, project_id_codeoscopic) where resuelta_at is null do update set
          -- «No se buscó» (NULL) no borra lo que se sabía del MISMO motivo; con otro motivo, manda el nuevo.
          coincidencias = case when codeoscopic_emisiones_revision.motivo = excluded.motivo
                               then coalesce(excluded.coincidencias, codeoscopic_emisiones_revision.coincidencias)
                               else excluded.coincidencias end,
          motivo = excluded.motivo,
          ramo_vendor = coalesce(excluded.ramo_vendor, codeoscopic_emisiones_revision.ramo_vendor),
          estado_emision = excluded.estado_emision,
          estado_vendor = coalesce(excluded.estado_vendor, codeoscopic_emisiones_revision.estado_vendor),
          compania = coalesce(excluded.compania, codeoscopic_emisiones_revision.compania),
          numero_poliza = coalesce(excluded.numero_poliza, codeoscopic_emisiones_revision.numero_poliza),
          cliente_id = excluded.cliente_id,
          detalle = excluded.detalle,
          veces = codeoscopic_emisiones_revision.veces + 1,
          ultima_vez_at = now()
        returning (xmax = 0) as nueva`
      return { nueva: r?.nueva === true }
    },
    descartadoPorPersona: async (projectId) => {
      const [r] = await db.$queryRaw<{ si: boolean }[]>`
        select exists (
          select 1 from codeoscopic_emisiones_revision
          where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId}
            and resuelta_at is not null and resuelta_por is distinct from 'descubrimiento'
        ) and not exists (
          select 1 from codeoscopic_emisiones_revision
          where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId} and resuelta_at is null
        ) as si`
      return r?.si === true
    },
    resolverRevision: async (projectId) => {
      await db.$executeRaw`
        update codeoscopic_emisiones_revision set resuelta_at = now(), resuelta_por = 'descubrimiento'
        where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId} and resuelta_at is null`
    },
  }
}

function lectorVendor() {
  const cfg = resolverConfig(process.env, { ignorarInterruptor: true })
  if (cfg.estado !== 'lista') return null
  return (path: string) => peticion(cfg.config, { metodo: 'GET', path, timeoutMs: cfg.config.timeoutGenericoMs })
}

export type ResultadoDescubrimiento =
  | { estado: 'vendor_sin_configurar' }
  | (ResumenPasada & { colaAbierta: number; colaPorMotivo: Partial<Record<MotivoRevision, number>> })

/** Una pasada completa (la del cron). Lanza solo si la BD falla fuera de un proyecto concreto. */
export async function pasadaDescubrimiento(
  correduriaId: string,
  opciones: { dias?: number; presupuestoMs?: number },
): Promise<ResultadoDescubrimiento> {
  const leer = lectorVendor()
  if (!leer) return { estado: 'vendor_sin_configurar' }
  const db = prismaAsegura()
  const base = depsProyectoBase(correduriaId, 'cron')

  const resumen = await descubrirEmisiones(opciones, {
    ...base,
    leer,
    // La pasada pone el reintento y el presupuesto; esto no se usa en ella.
    leerProyecto: (id) => leer(`/insurances/${id}`),
    locales: async (ids) => {
      const mapa = new Map<string, EstadoLocal>()
      if (ids.length === 0) return mapa
      const proyectos = await db.$queryRaw<{ project_id: string; estado: string; cliente_id: string | null; revisado_at: Date | null }[]>`
        select project_id_codeoscopic as project_id, estado::text as estado, cliente_id::text as cliente_id, polling_next_at as revisado_at
        from codeoscopic_projects
        where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = any(${ids}::varchar[])`
      const revisiones = await db.$queryRaw<{ project_id: string; abierta: boolean; ultima_vez_at: Date | null; por_persona: boolean }[]>`
        select project_id_codeoscopic as project_id,
               bool_or(resuelta_at is null) as abierta,
               max(ultima_vez_at) filter (where resuelta_at is null) as ultima_vez_at,
               bool_or(resuelta_at is not null and resuelta_por is distinct from 'descubrimiento') as por_persona
        from codeoscopic_emisiones_revision
        where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = any(${ids}::varchar[])
        group by project_id_codeoscopic`
      for (const p of proyectos) mapa.set(p.project_id, { proyecto: { estado: p.estado, clienteId: p.cliente_id, revisadoAt: p.revisado_at }, revision: null })
      for (const r of revisiones) {
        const previo = mapa.get(r.project_id) ?? { proyecto: null, revision: null }
        mapa.set(r.project_id, { ...previo, revision: { abierta: r.abierta, ultimaVezAt: r.ultima_vez_at, resueltaPorPersona: r.por_persona } })
      }
      return mapa
    },
    // Proyectos de la intranet con el Submit hecho y sin póliza, aunque se cotizaran hace más de la
    // ventana: la lista filtra por fecha y una emisión puede llegar semanas después de cotizar.
    candidatosIntranet: async () => {
      const filas = await db.$queryRaw<{ project_id: string }[]>`
        select project_id_codeoscopic as project_id from codeoscopic_projects
        where correduria_id = ${correduriaId}::uuid and estado = 'preemision' and created_at > now() - interval '120 days'
        order by polling_next_at asc nulls first
        limit 20`
      return filas.map((f) => f.project_id)
    },
    // Rotación (como `/retenidas`): `polling_next_at` = «última revisión». No toca `updated_at`.
    marcarRevisado: async (projectId) => {
      await db.$executeRaw`
        update codeoscopic_projects set polling_next_at = now()
        where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId}`
    },
  })

  const cola = await db.$queryRaw<{ motivo: MotivoRevision; n: number }[]>`
    select motivo, count(*)::int as n from codeoscopic_emisiones_revision
    where correduria_id = ${correduriaId}::uuid and resuelta_at is null
    group by motivo`
  const colaPorMotivo: Partial<Record<MotivoRevision, number>> = {}
  let colaAbierta = 0
  for (const c of cola) {
    colaPorMotivo[c.motivo] = c.n
    colaAbierta += c.n
  }
  return { ...resumen, colaAbierta, colaPorMotivo }
}

/**
 * Tras guardar el crudo del webhook: sincroniza los proyectos recibidos. NUNCA lanza (si algo
 * falla, el cron lo recoge en su próxima pasada). Pensado para `after()`: no retrasa el 200.
 */
export async function sincronizarDesdeWebhook(ids: (string | null)[]): Promise<void> {
  try {
    const leer = lectorVendor()
    if (!leer) return
    const correduria = await correduriaUnica()
    if (!correduria) return
    const presupuesto = nuevoPresupuesto(TOPE_WEBHOOK)
    const deps: DepsProyecto = {
      ...depsProyectoBase(correduria.id, 'webhook'),
      leerProyecto: (id) => leerConReintento(() => leer(`/insurances/${id}`), presupuesto),
    }
    await sincronizarTrasWebhook(ids, (id) => procesarProyecto(id, deps, { presentadaSegunLista: false }))
  } catch (e) {
    console.error('[webhooks/codeoscopic] sync tras webhook no arrancó (lo recoge el cron):', e instanceof Error ? e.message.slice(0, 200) : e)
  }
}
