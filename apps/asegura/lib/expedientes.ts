// apps/asegura/lib/expedientes.ts
//
// «Mis expedientes» (13/10/2026): TODAS las oportunidades que Alberto tiene abiertas, en todos los
// clientes —abiertas, esperando al cliente y aparcadas con su fecha de vuelta—, con su próxima acción.
// Solo LECTURA. Lo que decide clase, estado visible y qué entra vive en `@central/module-seguros`
// (`expedientes.ts`, puro y con test); aquí solo se lee la BD.
//
// 🚨 Tres cosas que NO pueden fallar:
//   · Aislamiento: el rol tiene BYPASSRLS; toda tabla se filtra por `correduria_id` (también las
//     subconsultas), o se verían las oportunidades de otra correduría.
//   · El volcado del CRM anterior sin tocar (~3.670 leads en `competencia` con `import_ref`) se excluye
//     en el SQL Y otra vez con `esExpedienteDeTrabajo()`: si uno de los dos se rompe, el otro aguanta.
//   · NULL ≠ 0: prima desconocida (o el 0 heredado) = `null`; recibo no localizado = `null` («no se
//     sabe»), nunca 0 ni «sin recibo».
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import {
  claseOportunidad,
  esExpedienteDeTrabajo,
  esRescateDeRecibo,
  estadoVisible,
  hitoDevolucion,
  importeReciboRescate,
  suspensionDesde,
  type ClaseExpediente,
  type EstadoVisible,
  type HitoDevolucion,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

export type ReciboRescate = {
  reciboId: string
  /** Nº de recibo de la compañía (`null` = no consta). */
  idRecibo: string | null
  /** Importe del recibo devuelto. `null` = no consta (nunca 0). */
  importe: number | null
  /** Efecto del recibo (aaaa-mm-dd), desde el que corre el art. 15 LCS. `null` = no consta. */
  efecto: string | null
  /** Día desde el que la cobertura queda en suspenso (efecto + 30). `null` = sin efecto: no se calcula. */
  suspensionDesde: string | null
  /** Hito del seguimiento que toca hoy; `null` = extinguida (más de 180 días). */
  hito: HitoDevolucion | null
  situacion: string | null
}

export type Expediente = {
  id: string
  clienteId: string
  /** `null` = la ficha no tiene nombre legible: se dice, no se inventa. */
  cliente: string | null
  ramo: string | null
  clase: ClaseExpediente
  estadoVisible: EstadoVisible
  /** El del enum (`competencia`/`en_negociacion`/`pendiente_cliente`), por si la pantalla lo necesita. */
  estado: string
  /** Del CRM anterior (con `import_ref`) ya en negociación: se marca, no se esconde. */
  delVolcado: boolean
  aparcadaHasta: string | null
  aparcadaMotivo: string | null
  /** La próxima acción de seguimiento (`gestiones` `central:seguimiento` pendiente); `null` = no tiene (huérfana). */
  proximaAccion: { tareaId: string; texto: string; tipo: string; fecha: string | null } | null
  /** Prima/importe de la oportunidad. `null` = no se sabe (el 0 heredado también es «no se sabe»). */
  prima: number | null
  fechaFinVigencia: string | null
  notas: string | null
  creada: string
  /**
   * Solo si es RESCATE: `tipo` `recibo` (devuelto) o `anulacion` (retención de CIMA). `recibo: null` =
   * el recibo no se ha podido localizar (no «no hay recibo»).
   */
  rescate: { tipo: 'recibo' | 'anulacion'; recibo: ReciboRescate | null } | null
}

export type Expedientes = {
  hoy: string
  expedientes: Expediente[]
  recuento: Record<'abierta' | 'esperando_cliente' | 'aparcada', number>
  /** Hay más de las que se devuelven: la lista NO está completa. */
  truncado: boolean
  /** Filas que no tenían la forma esperada (estado desconocido): se cuentan, no se pintan a ciegas. */
  descartadas: number
}

/** Techo de filas: hoy son ~25; si algún día pasa de aquí, `truncado` lo dice. */
const TECHO = 500

const RE_UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

type Fila = {
  id: string
  clienteId: string
  cliente: string | null
  ramo: string | null
  estado: string
  fuente: string | null
  origen: string | null
  motivo: string | null
  delVolcado: boolean
  aparcadaHasta: string | null
  aparcadaMotivo: string | null
  prima: number | null
  fechaFin: string | null
  notas: string | null
  creada: Date
  proxima: { tareaId: string; texto: string | null; tipo: string; fecha: string | null } | null
  recibo: { reciboId: string; idRecibo: string | null; importe: string | null; efecto: string | null; situacion: string | null } | null
}

export async function expedientesDeTrabajo(
  correduriaId: string,
  // «Hoy» es el de Madrid (como `tareasDeHoy`).
  hoyIso: string = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }),
): Promise<Expedientes> {
  const filas = await prismaAsegura().$queryRaw<Fila[]>(Prisma.sql`
    select o.id::text as id, o.cliente_id::text as "clienteId",
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
           o.tipo::text as ramo, o.estado::text as estado, o.fuente::text as fuente,
           o.info_riesgo->>'origen' as origen, o.info_riesgo->>'motivo' as motivo,
           (o.import_ref is not null) as "delVolcado",
           to_char(o.aparcada_hasta, 'YYYY-MM-DD') as "aparcadaHasta", o.aparcada_motivo as "aparcadaMotivo",
           nullif(o.prima_bruta, 0)::float8 as prima,
           to_char(o.fecha_fin_vigencia, 'YYYY-MM-DD') as "fechaFin",
           (to_jsonb(o)->>'notas') as notas,
           o.created_at as creada,
           prox.j as proxima,
           rec.j as recibo
    from oportunidades o
    join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    left join lateral (
      select json_build_object('tareaId', g.id::text, 'texto', g.observaciones, 'tipo', g.tipo::text,
                               'fecha', to_char(g.fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD')) as j,
             g.fecha_limite
      from gestiones g
      where g.oportunidad_id = o.id and g.correduria_id = o.correduria_id
        and g.origen_trigger = 'central:seguimiento' and g.estado::text <> 'cerrada'
      order by g.fecha_limite nulls last, g.created_at
      limit 1
    ) prox on true
    left join lateral (
      -- Solo para un rescate de RECIBO: el de info_riesgo.reciboId; sin él (abierto a mano), el último
      -- devuelto de su póliza. Los casts van tras el CASE que comprueba que es un uuid.
      select json_build_object('reciboId', r.id::text, 'idRecibo', r.id_recibo, 'importe', r.prima_total::text,
                               'efecto', to_char(r.fecha_efecto_actual at time zone 'Europe/Madrid', 'YYYY-MM-DD'),
                               'situacion', r.situacion::text) as j
      from poliza_recibos r
      where (o.info_riesgo->>'origen' = 'recibo_devuelto' or o.info_riesgo->>'motivo' = 'recibo_devuelto')
        and r.correduria_id = o.correduria_id
        and (r.id = case when o.info_riesgo->>'reciboId' ~ ${RE_UUID} then (o.info_riesgo->>'reciboId')::uuid end
             or (not coalesce(o.info_riesgo->>'reciboId' ~ ${RE_UUID}, false)
                 and r.situacion::text = 'devuelto'
                 and r.poliza_id = coalesce(o.poliza_id,
                       case when o.info_riesgo->>'polizaId' ~ ${RE_UUID} then (o.info_riesgo->>'polizaId')::uuid end)))
      order by r.fecha_efecto_actual desc nulls last
      limit 1
    ) rec on true
    where o.correduria_id = ${correduriaId}::uuid
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and (o.import_ref is null or o.estado::text <> 'competencia') -- import_ref de OPORTUNIDAD (volcado del CRM anterior)
    order by prox.fecha_limite nulls first, o.created_at
    limit ${TECHO + 1}`)

  const hoyDate = new Date(`${hoyIso}T00:00:00Z`)
  const expedientes: Expediente[] = []
  const recuento = { abierta: 0, esperando_cliente: 0, aparcada: 0 }
  let descartadas = 0
  for (const f of filas.slice(0, TECHO)) {
    // Segunda barrera del volcado y de los cerrados (la primera es el WHERE).
    if (!esExpedienteDeTrabajo({ estado: f.estado, delVolcado: f.delVolcado })) { descartadas++; continue }
    const ev = estadoVisible({ estado: f.estado, aparcadaHasta: f.aparcadaHasta }, hoyIso)
    if (ev === null || ev === 'ganada' || ev === 'perdida') { descartadas++; continue }
    recuento[ev]++
    const entrada = { fuente: f.fuente, origen: f.origen, motivo: f.motivo }
    const clase = claseOportunidad(entrada)
    let rescate: Expediente['rescate'] = null
    if (clase === 'rescate') {
      if (esRescateDeRecibo(entrada)) {
        const r = f.recibo
        rescate = {
          tipo: 'recibo',
          recibo: r
            ? {
                reciboId: r.reciboId,
                idRecibo: r.idRecibo,
                importe: importeReciboRescate(r.importe),
                efecto: r.efecto,
                suspensionDesde: suspensionDesde(r.efecto),
                hito: hitoDevolucion(r.efecto, hoyDate),
                situacion: r.situacion,
              }
            : null,
        }
      } else rescate = { tipo: 'anulacion', recibo: null }
    }
    expedientes.push({
      id: f.id,
      clienteId: f.clienteId,
      cliente: f.cliente,
      ramo: f.ramo,
      clase,
      estadoVisible: ev,
      estado: f.estado,
      delVolcado: f.delVolcado,
      aparcadaHasta: f.aparcadaHasta,
      aparcadaMotivo: f.aparcadaMotivo,
      proximaAccion: f.proxima
        ? { tareaId: f.proxima.tareaId, texto: f.proxima.texto ?? '', tipo: f.proxima.tipo, fecha: f.proxima.fecha }
        : null,
      prima: typeof f.prima === 'number' && f.prima > 0 ? f.prima : null,
      fechaFinVigencia: f.fechaFin,
      notas: f.notas,
      creada: f.creada.toISOString(),
      rescate,
    })
  }
  return { hoy: hoyIso, expedientes, recuento, truncado: filas.length > TECHO, descartadas }
}
