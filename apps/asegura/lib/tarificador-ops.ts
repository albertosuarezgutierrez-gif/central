// Operación del tarificador RPA (07/10/2026): renovaciones de COMUNIDADES por el bot de Allianz, panel de
// salud y detector de cambio de tarifa. Las reglas PURAS viven en `tarificador-ops-reglas.ts`.
//
// 🛡️ Todo por `correduria_id`. La lista de pólizas sale de la cartera (`prismaAsegura`, cartera EN
//    VIGOR con `sqlCarteraEnVigor`, prima y vencimiento CON RECIBOS); los trabajos, de la cola del
//    tarificador (`lib/tenant`). Nunca sale del puerto el riesgo, la URL del portal ni el HTML.
// 🚨 TARIFICAR ≠ EMITIR. Aquí solo se ENCOLA un precio (con los cerrojos de `encolarTrabajo`).

import { sqlCarteraEnVigor } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { correduriaUnica } from './cartera'
import { Prisma } from './generated/asegura-client'
import { sqlPrimaDeRecibo, sqlVencimientoConRecibos } from './recibos-vigencia'
import { prisma } from './tenant'
import { barrerTarificadorRpa, encolarTrabajo, lanzarPendientes } from './tarificador'
import { ofertasPublicas } from './tarificador-lectura-reglas'
import { rpaActivo } from './tarificador-reglas'
import { calcularCoste, type CostePanel, type IaDia } from './tarificador-coste-reglas'
import {
  DIAS_SIN_REPETIR,
  ORIGEN_RENOVACION,
  calcularMetricas,
  clasificarRenovacion,
  cupoPasada,
  detectarCambiosTarifa,
  diasEntre,
  elegirParaEncolar,
  elegirRiesgoPrevio,
  enVentanaRenovacion,
  maxRenovacionesDia,
  primaAnualMinima,
  renovacionesActivas,
  riesgoParaRenovacion,
  trabajosDeLaPoliza,
  type AlertaTarifa,
  type EstadoRenovacion,
  type FalloAgrupado,
  type MetricasPeriodo,
} from './tarificador-ops-reglas'
import type { RiesgoComunidad } from '@central/module-tarificacion'

const COMPANIA = 'allianz'
const RAMO = 'comunidades'
const msDia = 86_400_000

export function hoyMadrid(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

// ─── Renovaciones ────────────────────────────────────────────────────────────

export type Renovacion = {
  polizaId: string
  clienteId: string
  cliente: string
  numeroPoliza: string | null
  compania: string
  vencimiento: string
  dias: number
  /** Prima anual de la póliza actual (con recibos). `null` = no consta (≠ 0). */
  primaActual: number | null
  estado: EstadoRenovacion
  trabajoId: string | null
  /** Prima anual Allianz (sucesivos; la más barata). `null` = no consta. */
  primaAllianz: number | null
  faltan: string[]
}

type RenovacionInterna = Renovacion & { riesgo: RiesgoComunidad | null }

type FilaPoliza = {
  polizaId: string
  clienteId: string
  cliente: string
  numeroPoliza: string | null
  compania: string
  vencimiento: string | null
  prima: string | null
  nCliente: number
}

type FilaTrabajo = {
  id: string
  poliza_id: string | null
  cliente_id: string
  estado: string
  created_at: Date
  riesgo: unknown
  respuesta: unknown
}

const numeroONull = (s: string | null): number | null => {
  if (s === null) return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function leerRenovaciones(correduriaId: string, ahora: Date): Promise<RenovacionInterna[]> {
  const hoy = hoyMadrid(ahora)
  // Todas las comunidades EN VIGOR (para saber cuántas tiene cada cliente); la ventana se filtra después.
  const polizas = await prismaAsegura().$queryRaw<FilaPoliza[]>(Prisma.sql`
    select p.id::text as "polizaId", p.cliente_id::text as "clienteId", c.nombre as cliente,
           p.numero_poliza as "numeroPoliza", p.aseguradora as compania,
           to_char(${sqlVencimientoConRecibos('p', hoy)}, 'YYYY-MM-DD') as vencimiento,
           coalesce(nullif(coalesce(p.prima_bruta, p.prima_anual), 0), ${sqlPrimaDeRecibo('p', hoy)})::text as prima,
           (count(*) over (partition by p.cliente_id))::int as "nCliente"
    from polizas p
    join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
    where p.correduria_id = ${correduriaId}::uuid
      and p.tipo::text = ${RAMO}
      and p.merged_into_poliza_id is null
      and ${Prisma.raw(sqlCarteraEnVigor('p'))}`)
  const enVentana = polizas.filter((p) => enVentanaRenovacion(hoy, p.vencimiento))
  if (enVentana.length === 0) return []

  const clientes = [...new Set(enVentana.map((p) => p.clienteId))]
  const trabajos = await prisma.$queryRaw<FilaTrabajo[]>`
    select t.id::text as id, t.poliza_id::text as poliza_id, t.cliente_id::text as cliente_id, t.estado,
           t.created_at, t.riesgo,
           case when t.estado = 'ok' then x.respuesta end as respuesta
    from seguros.tarificacion_trabajos t
    left join seguros.tarificaciones x on x.id = t.tarificacion_id and x.correduria_id = t.correduria_id
    where t.correduria_id = ${correduriaId}::uuid and t.compania = ${COMPANIA} and t.ramo = ${RAMO}
      and t.cliente_id::text = any(${clientes}::text[])
    order by t.created_at desc
    limit 2000`

  const desdeRecientes = ahora.getTime() - DIAS_SIN_REPETIR * msDia
  return enVentana.map((p): RenovacionInterna => {
    const vencimiento = p.vencimiento as string
    const delCliente = trabajos
      .filter((t) => t.cliente_id === p.clienteId)
      .map((t) => ({ ...t, polizaId: t.poliza_id, creadoEn: t.created_at.toISOString() }))
    const propios = trabajosDeLaPoliza(delCliente, p.polizaId, p.nCliente)
    const recientes = propios
      .filter((t) => t.created_at.getTime() >= desdeRecientes)
      .map((t) => ({ trabajoId: t.id, estado: t.estado, creadoEn: t.creadoEn, primaAllianz: t.estado === 'ok' ? primaAnualMinima(ofertasPublicas(t.respuesta).ofertas) : null }))
    const previo = elegirRiesgoPrevio(delCliente, p.polizaId, p.nCliente)
    const c = clasificarRenovacion(recientes, riesgoParaRenovacion(previo, vencimiento, ahora))
    return {
      polizaId: p.polizaId,
      clienteId: p.clienteId,
      cliente: p.cliente,
      numeroPoliza: p.numeroPoliza,
      compania: p.compania,
      vencimiento,
      dias: diasEntre(hoy, vencimiento) ?? 0,
      primaActual: numeroONull(p.prima),
      estado: c.estado,
      trabajoId: c.trabajoId,
      primaAllianz: c.primaAllianz,
      faltan: c.faltan.slice(0, 8),
      riesgo: c.riesgo,
    }
  }).sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))
}

const sinRiesgo = ({ riesgo: _r, ...r }: RenovacionInterna): Renovacion => r

function contarPorEstado(lista: { estado: EstadoRenovacion }[]): Record<EstadoRenovacion, number> {
  const c: Record<EstadoRenovacion, number> = { cotizada: 0, en_cola: 0, fallida: 0, pendiente: 0, faltan_datos: 0 }
  for (const r of lista) c[r.estado]++
  return c
}

async function contarRenovacionesBot(correduriaId: string): Promise<{ hechasHoy: number; enCola: number }> {
  const f = await prisma.$queryRaw<{ hoy: number; en_cola: number }[]>`
    select count(*) filter (
             where created_at >= (date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'))::int as hoy,
           count(*) filter (where estado in ('pendiente', 'en_curso', 'error_reintentable'))::int as en_cola
    from seguros.tarificacion_trabajos
    where correduria_id = ${correduriaId}::uuid and solicitado_por = ${ORIGEN_RENOVACION}`
  return { hechasHoy: f[0]?.hoy ?? 0, enCola: f[0]?.en_cola ?? 0 }
}

export type ResumenRenovaciones = {
  estado: 'apagado' | 'rpa_apagado' | 'ok'
  candidatas?: number
  porEstado?: Record<EstadoRenovacion, number>
  topeDia?: number
  hechasHoy?: number
  encoladas?: { polizaId: string; trabajoId: string }[]
  rechazadas?: { polizaId: string; motivo: string }[]
  faltanDatos?: { numeroPoliza: string | null; faltan: string[] }[]
  barrido?: unknown
}

/**
 * Pasada del cron de renovaciones. APAGADO salvo `TARIFICADOR_RENOVACIONES_ACTIVO=1`; con el RPA apagado
 * solo cuenta. Encendido: barre la cola (relanza lo pendiente) y encola COMO MUCHO una renovación por
 * pasada, solo si no hay otra de renovación en cola y sin pasar el tope diario.
 */
export async function ejecutarRenovacionesTarificador(env: Record<string, string | undefined> = process.env, ahora = new Date()): Promise<ResumenRenovaciones> {
  if (!renovacionesActivas(env)) return { estado: 'apagado' }
  const correduria = await correduriaUnica()
  if (!correduria) throw new Error('sin_correduria')
  const lista = await leerRenovaciones(correduria.id, ahora)
  const base = {
    candidatas: lista.length,
    porEstado: contarPorEstado(lista),
    topeDia: maxRenovacionesDia(env),
    faltanDatos: lista.filter((r) => r.estado === 'faltan_datos').map((r) => ({ numeroPoliza: r.numeroPoliza, faltan: r.faltan })),
  }
  if (!rpaActivo(env)) return { estado: 'rpa_apagado', ...base }

  const barrido = await barrerTarificadorRpa(correduria.id).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
  const { hechasHoy, enCola } = await contarRenovacionesBot(correduria.id)
  const cupo = cupoPasada({ topeDia: base.topeDia, hechasHoy, renovacionesEnCola: enCola })
  const encoladas: { polizaId: string; trabajoId: string }[] = []
  const rechazadas: { polizaId: string; motivo: string }[] = []
  for (const r of elegirParaEncolar(lista, cupo)) {
    if (!r.riesgo) continue
    const e = await encolarTrabajo({
      correduriaId: correduria.id, oportunidadId: null, clienteId: r.clienteId, polizaId: r.polizaId,
      compania: COMPANIA, ramo: 'comunidades', riesgo: r.riesgo, solicitadoPor: ORIGEN_RENOVACION,
    })
    if (e.estado === 'encolado') encoladas.push({ polizaId: r.polizaId, trabajoId: e.trabajoId })
    else rechazadas.push({ polizaId: r.polizaId, motivo: e.motivo })
  }
  if (encoladas.length) await lanzarPendientes(correduria.id, COMPANIA).catch(() => null)
  return { estado: 'ok', ...base, hechasHoy, encoladas, rechazadas, barrido }
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export type IntervencionesResumen =
  | { disponible: true; intervenciones: number; llamadasIA: number; trabajosConIA: number; costeEstimado: number | null }
  | { disponible: false; motivo: string }

export type PanelTarificador = {
  generadoEn: string
  interruptores: { rpa: boolean; renovaciones: boolean; topeDia: number }
  metricas: { d7: MetricasPeriodo; d30: MetricasPeriodo; fallos: FalloAgrupado[] }
  intervenciones: IntervencionesResumen
  renovaciones: { porEstado: Record<EstadoRenovacion, number>; lista: Renovacion[] }
  alertasTarifa: AlertaTarifa[]
  /** Coste por tarificación (Fly + IA). `no_consta` = no se pudo leer nada que lo permita. */
  coste: CostePanel | { disponible: false; motivo: string }
}

/** La tabla de intervenciones puede no existir aún (SQL del formador sin aplicar): se dice, no se pinta 0. */
async function leerIntervenciones(correduriaId: string): Promise<IntervencionesResumen> {
  try {
    const f = await prisma.$queryRaw<{ n: number; ia: number; trabajos: number; coste: unknown }[]>`
      select count(*)::int as n, count(*) filter (where llamada_ia)::int as ia,
             count(distinct trabajo_id) filter (where llamada_ia)::int as trabajos,
             sum(coste_estimado) filter (where llamada_ia) as coste
      from seguros.tarificador_intervenciones
      where correduria_id = ${correduriaId}::uuid and created_at > now() - interval '30 days'`
    const r = f[0]
    const coste = r?.coste === null || r?.coste === undefined ? null : Number(r.coste)
    return {
      disponible: true,
      intervenciones: r?.n ?? 0,
      llamadasIA: r?.ia ?? 0,
      trabajosConIA: r?.trabajos ?? 0,
      // Sin llamadas no hay coste que contar; con llamadas y suma 0 tampoco consta (columna con DEFAULT 0).
      costeEstimado: coste !== null && Number.isFinite(coste) && coste > 0 ? Math.round(coste * 10_000) / 10_000 : null,
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return { disponible: false, motivo: /does not exist|no existe|42P01/i.test(m) ? 'tabla_sin_crear' : 'no_se_pudo_leer' }
  }
}

/** Gasto de IA de asegura por día (Madrid) desde la pasarela. `null` = no se pudo leer (tabla ausente o sin permiso): no es 0. */
async function leerIaPorDia(): Promise<IaDia[] | null> {
  try {
    const f = await prisma.$queryRaw<{ dia: string; eur: number | null }[]>`
      select to_char(creada_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as dia, sum(coste_eur)::float8 as eur
      from public.ai_usos
      where app = 'asegura' and creada_at > now() - interval '40 days'
      group by 1`
    return f.map((x) => ({ dia: x.dia, eur: x.eur === null ? null : Number(x.eur) }))
  } catch {
    return null
  }
}

export async function leerPanelTarificador(correduriaId: string, env: Record<string, string | undefined> = process.env, ahora = new Date()): Promise<PanelTarificador> {
  const [metr, completados, intervenciones, renov, iaDias] = await Promise.all([
    prisma.$queryRaw<{ compania: string; estado: string; created_at: Date; iniciado_at: Date | null; terminado_at: Date | null; error: unknown }[]>`
      select compania, estado, created_at, iniciado_at, terminado_at, error
      from seguros.tarificacion_trabajos
      where correduria_id = ${correduriaId}::uuid and created_at > now() - interval '40 days'
      order by created_at desc
      limit 5000`,
    prisma.$queryRaw<{ id: string; terminado_at: Date | null; created_at: Date; riesgo: unknown; respuesta: unknown }[]>`
      select t.id::text as id, t.terminado_at, t.created_at, t.riesgo, x.respuesta
      from seguros.tarificacion_trabajos t
      join seguros.tarificaciones x on x.id = t.tarificacion_id and x.correduria_id = t.correduria_id
      where t.correduria_id = ${correduriaId}::uuid and t.estado = 'ok' and t.ramo = ${RAMO}
        and t.created_at > now() - interval '400 days'
      order by t.created_at desc
      limit 500`,
    leerIntervenciones(correduriaId),
    leerRenovaciones(correduriaId, ahora),
    leerIaPorDia(),
  ])
  const metricas = calcularMetricas(
    metr.map((t) => ({
      estado: t.estado,
      creadoEn: t.created_at.toISOString(),
      iniciadoEn: t.iniciado_at?.toISOString() ?? null,
      terminadoEn: t.terminado_at?.toISOString() ?? null,
      error: t.error,
    })),
    ahora,
  )
  const alertasTarifa = detectarCambiosTarifa(
    completados.map((t) => ({
      trabajoId: t.id,
      terminadoEn: (t.terminado_at ?? t.created_at).toISOString(),
      riesgo: t.riesgo,
      ofertas: ofertasPublicas(t.respuesta).ofertas,
    })),
  ).slice(0, 50)
  return {
    generadoEn: ahora.toISOString(),
    interruptores: { rpa: rpaActivo(env), renovaciones: renovacionesActivas(env), topeDia: maxRenovacionesDia(env) },
    metricas,
    intervenciones,
    renovaciones: { porEstado: contarPorEstado(renov), lista: renov.slice(0, 100).map(sinRiesgo) },
    alertasTarifa,
    coste: calcularCoste(
      metr.map((t) => ({
        compania: t.compania,
        estado: t.estado,
        creadoEn: t.created_at.toISOString(),
        iniciadoEn: t.iniciado_at?.toISOString() ?? null,
        terminadoEn: t.terminado_at?.toISOString() ?? null,
      })),
      iaDias,
      ahora,
    ),
  }
}
