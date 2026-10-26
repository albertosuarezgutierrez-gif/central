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
  esTrabajada,
  estaEnCompania,
  urlSolicitudValida,
  ACCIONES_HISTORIAL_AUTOMATICAS,
  TIPOS_GESTION_CONTACTO,
  estadoVisible,
  hitoDevolucion,
  importeReciboRescate,
  suspensionDesde,
  type ClaseExpediente,
  type EstadoVisible,
  type HitoDevolucion,
  vencimientoConRecibos,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { fugasPendientes, type FugaNueva } from './eventos-cartera'
import { contactosDe } from './cartera-busqueda'
import { contactoDeFila, type ContactoFila } from './expedientes-contacto'
import { recibosVigenciaDe } from './recibos-vigencia'

/**
 * Teléfono/email del cliente de la fila, para llamar · WhatsApp · correo desde Mi mesa (contrato en
 * `expedientes-contacto.ts`). `null` = no se pudo leer o la fila no cuelga de ninguna ficha; un campo
 * `null` = no consta o no se descifra. Nunca «no tiene» sin más.
 */
export type { ContactoFila }

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
  contacto: ContactoFila | null
  /**
   * ¿La ha trabajado Alberto? `false` = renovación automática (fuente renovacion / import_ref / aviso de
   * vencimiento…) SIN ningún contacto registrado: Mi mesa la manda a «Renovaciones sin tocar». Ver `esTrabajada()`.
   */
  trabajada: boolean
  /** `info_riesgo.origen` (cómo entró). `null` = no consta: Mi mesa NO lo esconde. */
  origen: string | null
  /** Último contacto humano (historial no automático o llamada/WhatsApp cerrada), ISO. `null` = ninguno registrado. */
  ultimoContacto: string | null
  /** Ofertas (presupuestos) no descartadas de la operación. 0 = ninguna. */
  presupuestos: number
  /** Vencimiento de la póliza «con recibos» (aaaa-mm-dd). `null` = no se sabe (del volcado no se usa: está mal). */
  vencimiento: string | null
  /**
   * «En la compañía» (20/10/2026): la oportunidad lleva nº de solicitud en el portal de la compañía. `null` = no lo
   * lleva (o la migración 2026-10-20 aún no está). `estado`/`url`/`at` `null` = la compañía aún no ha escrito (no
   * «sin estado»). La `url` sale ya validada (solo https del portal de esa compañía, mismo nº).
   */
  solicitudCompania: { numero: string; compania: string; estado: string | null; url: string | null; at: string | null } | null
}

/**
 * Tarea abierta SIN oportunidad (13/10/2026: ~14, casi todas de la agenda del CRM anterior): no es un
 * expediente, pero tampoco puede perderse. Se cierra por la misma vía que cualquier tarea (`tareaId`).
 */
export type TareaSuelta = {
  tareaId: string
  /** `null` = la tarea no cuelga de ninguna ficha (o la ficha no es de esta correduría): se dice. */
  clienteId: string | null
  cliente: string | null
  polizaId: string | null
  siniestroId: string | null
  tipo: string
  estado: string
  /** `observaciones` de la tarea; `''` si no tiene texto (no se inventa uno). */
  texto: string
  /** Fecha límite (Madrid, aaaa-mm-dd). `null` = sin fecha. */
  fecha: string | null
  origen: string | null
  contacto: ContactoFila | null
}

/**
 * Pérdida de cartera POR REVISAR (bajas, anulaciones al vencimiento y desapariciones sin sustitución,
 * ya sin las históricas): una FILA, no un expediente. El evento ya tiene su ciclo (pendiente → revisado,
 * con resolución cerrada, `POST /api/operador/eventos`); una oportunidad encima sería un segundo estado
 * que puede divergir, y «¿es un rescate?» es precisamente lo que decide la revisión. La que ya tiene un
 * expediente abierto en su póliza (la retención que abre CIMA, p. ej.) no se repite: se CUENTA.
 */
export type PerdidaPorRevisar = FugaNueva & { contacto: ContactoFila | null }

export type Expedientes = {
  hoy: string
  expedientes: Expediente[]
  /** `null` = no se pudo leer (no «no hay ninguna»). */
  tareasSueltas: TareaSuelta[] | null
  /** `null` = no se pudo leer (no «no hay ninguna»). */
  perdidasPorRevisar: PerdidaPorRevisar[] | null
  /** Hay más tareas sueltas de las que se devuelven. */
  tareasSueltasTruncado: boolean
  /** Pérdidas pendientes que no se listan porque su póliza ya tiene expediente abierto. `null` = no se leyó. */
  perdidasConExpediente: number | null
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
  contactada: boolean
  /** Último contacto humano (mismo filtro que `contactada`). NULL = ninguno registrado. */
  ultimoContacto: Date | null
  presupuestos: number
  polizaId: string | null
  polizaVence: string | null
  solicitud: { numero: string | null; compania: string | null; estado: string | null; url: string | null; at: string | null }
  proxima: { tareaId: string; texto: string | null; tipo: string; fecha: string | null } | null
  recibo: { reciboId: string; idRecibo: string | null; importe: string | null; efecto: string | null; situacion: string | null } | null
}

function solicitudDeFila(f: Pick<Fila, 'estado' | 'solicitud'>): Expediente['solicitudCompania'] {
  const s = f.solicitud
  if (!s?.numero || !s.compania || !estaEnCompania({ estado: f.estado, companiaSolicitudNum: s.numero })) return null
  return { numero: s.numero, compania: s.compania, estado: s.estado, url: urlSolicitudValida(s.url, s.compania, s.numero), at: s.at }
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
           -- «En la compañía» (SQL 2026-10-20): por JSON, sin las columnas da NULL en vez de romper Mi mesa.
           json_build_object('numero', to_jsonb(o)->>'compania_solicitud_num', 'compania', to_jsonb(o)->>'compania_solicitud_compania',
                             'estado', to_jsonb(o)->>'compania_solicitud_estado', 'url', to_jsonb(o)->>'compania_solicitud_url',
                             'at', to_jsonb(o)->>'compania_solicitud_at') as solicitud,
           -- Trabajo registrado: historial con una acción de PERSONA (no alta/automática), o una llamada/WhatsApp ya CERRADA.
           (exists (select 1 from oportunidad_historial h
                    where h.oportunidad_id = o.id and h.correduria_id = o.correduria_id
                      and h.accion not in (${Prisma.join([...ACCIONES_HISTORIAL_AUTOMATICAS])}))
            or exists (select 1 from gestiones gc
                       where gc.oportunidad_id = o.id and gc.correduria_id = o.correduria_id
                         and gc.tipo::text in (${Prisma.join([...TIPOS_GESTION_CONTACTO])}) and gc.estado::text = 'cerrada')) as contactada,
           (select max(x.t) from (
              select h.created_at as t from oportunidad_historial h
               where h.oportunidad_id = o.id and h.correduria_id = o.correduria_id
                 and h.accion not in (${Prisma.join([...ACCIONES_HISTORIAL_AUTOMATICAS])})
              union all
              select gc.updated_at as t from gestiones gc
               where gc.oportunidad_id = o.id and gc.correduria_id = o.correduria_id
                 and gc.tipo::text in (${Prisma.join([...TIPOS_GESTION_CONTACTO])}) and gc.estado::text = 'cerrada') x) as "ultimoContacto",
           (select count(*)::int from oportunidad_oferta f
             where f.oportunidad_id = o.id and f.correduria_id = o.correduria_id and f.estado <> 'descartada') as presupuestos,
           o.poliza_id::text as "polizaId",
           (select to_char(pz.fecha_vencimiento, 'YYYY-MM-DD') from polizas pz
             where pz.id = o.poliza_id and pz.correduria_id = o.correduria_id) as "polizaVence",
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
  // Vencimiento de la póliza «con recibos» (Allianz no avanza `fecha_vencimiento`): UNA consulta por lote. Si falla,
  // se queda la fecha de la póliza tal cual (no se inventa; ante la duda la operación sube a «Entre manos»).
  const recibos = await recibosVigenciaDe(correduriaId, filas.flatMap((f) => (f.polizaId ? [f.polizaId] : []))).catch(() => new Map())
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
      contacto: null,
      origen: f.origen,
      presupuestos: f.presupuestos,
      ultimoContacto: f.ultimoContacto ? f.ultimoContacto.toISOString() : null,
      // Del volcado, `fecha_fin_vigencia` está mal (2023): no es vencimiento. Con póliza manda la póliza (con recibos).
      vencimiento: f.polizaVence
        ? vencimientoConRecibos(f.polizaVence, recibos.get(f.polizaId ?? '') ?? [], hoyIso)?.slice(0, 10) ?? null
        : f.delVolcado ? null : f.fechaFin,
      trabajada: esTrabajada({ fuente: f.fuente, origen: f.origen, conImportRef: f.delVolcado, estado: f.estado, conSolicitud: !!f.solicitud?.numero, contactada: f.contactada }),
      solicitudCompania: solicitudDeFila(f),
    })
  }
  const [tareasSueltas, perdidas] = await Promise.all([
    tareasSueltasDe(correduriaId),
    perdidasPorRevisarDe(correduriaId),
  ])
  // El contacto de las TRES partes en una sola lectura, con el lector único de N fichas (descifra campo a
  // campo: una ficha ilegible no arrastra a las demás). Si falla entero, todas las filas llevan
  // `contacto: null` («no se pudo leer») y la lista sale igual.
  const ids = [...new Set([
    ...expedientes.map((e) => e.clienteId),
    ...(tareasSueltas.filas ?? []).map((t) => t.clienteId),
    ...(perdidas?.filas ?? []).map((p) => p.clienteId),
  ].filter((id): id is string => typeof id === 'string' && id !== ''))]
  const contactos = ids.length === 0 ? new Map() : await contactosDe(correduriaId, ids).catch(() => null)
  const conContacto = <T extends { clienteId: string | null }>(f: T): T & { contacto: ContactoFila | null } =>
    ({ ...f, contacto: contactoDeFila(contactos, f.clienteId) })
  return {
    hoy: hoyIso, recuento, truncado: filas.length > TECHO, descartadas,
    expedientes: expedientes.map(conContacto),
    tareasSueltas: tareasSueltas.filas?.map(conContacto) ?? null,
    tareasSueltasTruncado: tareasSueltas.truncado,
    perdidasPorRevisar: perdidas?.filas.map(conContacto) ?? null,
    perdidasConExpediente: perdidas?.conExpediente ?? null,
  }
}

const TECHO_SUELTAS = 200

/** Tareas abiertas sin oportunidad. Un fallo de lectura devuelve `null` (se dice), nunca `[]`. */
async function tareasSueltasDe(correduriaId: string): Promise<{ filas: Omit<TareaSuelta, 'contacto'>[] | null; truncado: boolean }> {
  try {
    const filas = await prismaAsegura().$queryRaw<(Omit<TareaSuelta, 'contacto' | 'texto'> & { texto: string | null })[]>(Prisma.sql`
      select g.id::text as "tareaId", c.id::text as "clienteId",
             nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
             g.poliza_id::text as "polizaId", g.siniestro_id::text as "siniestroId",
             g.tipo::text as tipo, g.estado::text as estado, g.observaciones as texto,
             to_char(g.fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD') as fecha, g.origen_trigger as origen
      from gestiones g
      left join clientes c on c.id = g.cliente_id and c.correduria_id = g.correduria_id
      where g.correduria_id = ${correduriaId}::uuid and g.oportunidad_id is null and g.estado::text <> 'cerrada'
      order by g.fecha_limite nulls last, g.created_at
      limit ${TECHO_SUELTAS + 1}`)
    return { filas: filas.slice(0, TECHO_SUELTAS).map((f) => ({ ...f, texto: f.texto ?? '' })), truncado: filas.length > TECHO_SUELTAS }
  } catch (e) {
    console.error('[expedientes] tareas sueltas no leídas:', e instanceof Error ? e.message : e)
    return { filas: null, truncado: false }
  }
}

/** Pérdidas pendientes de revisar, sin las que ya tienen expediente abierto en su póliza. `null` = no se leyó. */
async function perdidasPorRevisarDe(correduriaId: string): Promise<{ filas: FugaNueva[]; conExpediente: number } | null> {
  const fugas = await fugasPendientes(correduriaId)
  if (fugas === null) return null
  if (fugas.length === 0) return { filas: [], conExpediente: 0 }
  try {
    const ids = [...new Set(fugas.map((f) => f.polizaId))]
    const con = await prismaAsegura().$queryRaw<{ polizaId: string }[]>(Prisma.sql`
      select distinct coalesce(o.poliza_id::text, o.info_riesgo->>'polizaId') as "polizaId"
      from oportunidades o
      where o.correduria_id = ${correduriaId}::uuid
        and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
        and (o.poliza_id::text = any(${ids}::text[]) or o.info_riesgo->>'polizaId' = any(${ids}::text[]))`)
    const conExp = new Set(con.map((c) => c.polizaId))
    const filas = fugas.filter((f) => !conExp.has(f.polizaId))
    return { filas, conExpediente: fugas.length - filas.length }
  } catch (e) {
    console.error('[expedientes] pérdidas por revisar no cruzadas con expedientes:', e instanceof Error ? e.message : e)
    return null
  }
}
