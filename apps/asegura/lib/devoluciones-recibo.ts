// Recibos DEVUELTOS: registrar lo que avisa la compañía por correo, escalar con el reloj del art. 15
// LCS y cerrar solo cuando consta el cobro (28/09/2026).
//
// · `registrarDevoluciones()` — lo llama plataforma cuando el triaje lee un correo de devolución
//   (`leerCorreoDevolucion`). Guarda la devolución en `recibo_devolucion`, marca el recibo `devuelto`
//   (el trigger `recibo_respeta_devolucion` impide que la ingesta lo vuelva a poner `cobrado` con un
//   dato viejo), anota la ficha y abre la llamada de hoy. El borrador al cliente sale en la siguiente
//   pasada del detector (evento RECIBO_DEVUELTO → cola de aprobaciones), como cualquier devuelto.
// · `seguirDevoluciones()` — dentro de la pasada del detector: para cada recibo devuelto de una
//   póliza en vigor, la tarea del hito que toca (0 / 7 / 25 / 30 días desde el efecto), una sola vez
//   por hito; y cierra como ganada la oportunidad cuyo recibo ya consta cobrado.
// · `resolverDevolucion()` — «cobrado de nuevo» a mano desde plataforma.
//
// Las tareas van con `origen_trigger = 'central:seguimiento'` a propósito: es lo que pinta «Tareas de
// hoy». La idempotencia por hito la da `oportunidad_historial` (accion `tarea_devolucion`).

import {
  ORIGEN_DEVOLUCION,
  POLIZA_ESTADOS_VIGENTES,
  PREFIJO_TAREA_DEVOLUCION,
  clasificarMotivoDevolucion,
  fechaEs,
  hitoDevolucion,
  importeEiac,
  normalizarIdRecibo,
  suspensionDesde,
  textoTareaDevolucion,
  type HitoDevolucion,
  type TipoMotivoDevolucion,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { MARCA_CIERRE_AUTOMATICO } from './oportunidad-seguimiento'
import { ROTULO_MOTIVO_BAJA, fechaLlamada, vencimientoCompetencia, type MotivoBaja } from './baja-devolucion-reglas'

type Tx = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

const ESTADOS_VIGENTES = [...POLIZA_ESTADOS_VIGENTES] as string[]

/**
 * ¿La fecha de devolución del correo es la del BANCO? Reale y Occident la dan; Mapfre no (se usa la
 * del correo). Solo con fecha del banco puede el trigger dar la devolución por resuelta cuando CIMA
 * trae una fecha posterior: con la del correo, un cobro viejo reescrito con fecha tardía cerraría como
 * «cobrado» lo que nadie ha pagado. Sin ella se resuelve a mano («Cobrado de nuevo»).
 */
function fechaEsDelBanco(codigoDgs: string): boolean {
  return codigoDgs === 'C0613' || codigoDgs === 'C0468'
}
const ACTOR = 'sistema:devolucion'

// ── Entrada del puerto ─────────────────────────────────────────────────────────

export type DevolucionEntrada = {
  codigoDgs: string
  idRecibo: string
  numeroPoliza: string | null
  importe: number | null
  fechaEfecto: string | null
  fechaDevolucion: string
  motivo: string | null
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Fecha de calendario REAL: `2026-02-31` tiene forma pero no existe, y el `::date` tumbaría el lote entero. */
function fechaValida(s: string | null): s is string {
  if (s === null || !FECHA.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
const texto = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)

/** Valida el cuerpo que manda plataforma. Lo que no cuadra se rechaza entero: no se registra «a medias». */
export function validarDevoluciones(b: unknown): { ok: true; devoluciones: DevolucionEntrada[]; mensajeId: string | null } | { ok: false; motivo: string } {
  if (typeof b !== 'object' || b === null) return { ok: false, motivo: 'cuerpo no válido' }
  const o = b as Record<string, unknown>
  if (!Array.isArray(o.devoluciones) || o.devoluciones.length === 0 || o.devoluciones.length > 50) return { ok: false, motivo: 'devoluciones: lista de 1 a 50' }
  const out: DevolucionEntrada[] = []
  for (const x of o.devoluciones as unknown[]) {
    const d = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
    const codigoDgs = texto(d.codigoDgs, 16)
    const idRecibo = texto(d.idRecibo, 40)
    const fechaDevolucion = texto(d.fechaDevolucion, 10)
    const fechaEfecto = texto(d.fechaEfecto, 10)
    if (!codigoDgs || !/^[A-Z]\d{4}$/.test(codigoDgs)) return { ok: false, motivo: 'codigoDgs no válido' }
    if (!idRecibo || !/^[A-Za-z0-9-]+$/.test(idRecibo)) return { ok: false, motivo: 'idRecibo no válido' }
    if (!fechaValida(fechaDevolucion)) return { ok: false, motivo: 'fechaDevolucion no válida' }
    if (fechaEfecto !== null && !fechaValida(fechaEfecto)) return { ok: false, motivo: 'fechaEfecto no válida' }
    const importe = typeof d.importe === 'number' && Number.isFinite(d.importe) && d.importe >= 0 ? d.importe : null
    out.push({ codigoDgs, idRecibo, numeroPoliza: texto(d.numeroPoliza, 40), importe, fechaEfecto, fechaDevolucion, motivo: texto(d.motivo, 120) })
  }
  return { ok: true, devoluciones: out, mensajeId: texto(o.mensajeId, 300) }
}

// ── Registro ───────────────────────────────────────────────────────────────────

export type ResultadoDevolucion = {
  idRecibo: string
  codigoDgs: string
  /**
   * `sin_recibo` = aún no está en la cartera: se guarda y se enlaza al llegar · `ya_en_cima` = CIMA ya lo
   * trae devuelto (la resuelve CIMA) · `ya_resuelta` = CIMA ya sabe algo posterior (cobro o anulación).
   */
  estado: 'registrada' | 'ya_registrada' | 'sin_recibo' | 'ya_en_cima' | 'ya_resuelta'
  clienteId: string | null
  cliente: string | null
  polizaId: string | null
  ramo: string | null
  compania: string | null
  importe: number | null
  /**
   * Comisión bruta de ESE recibo (la que trae CIMA): lo que la compañía te descuenta si no se cobra.
   * `null` = el recibo no está en la cartera o CIMA no la da; nunca 0 por no saberla.
   */
  comision: number | null
  fechaEfecto: string | null
  suspensionDesde: string | null
  tipoMotivo: TipoMotivoDevolucion | null
  motivo: string | null
  /** Se abrió (o ya había) la llamada de seguimiento. */
  tarea: 'abierta' | 'ya_habia' | 'no_aplica'
}

type FilaRecibo = {
  reciboId: string; polizaId: string; clienteId: string; ramo: string | null; compania: string | null
  numeroPoliza: string | null; efecto: string | null; importe: string | null; comision: string | null; vigente: boolean
  nombre: string | null; apellidos: string | null
}

export async function registrarDevoluciones(correduriaId: string, devoluciones: DevolucionEntrada[], mensajeId: string | null, hoy: Date = new Date()): Promise<ResultadoDevolucion[]> {
  const db = prismaAsegura()
  const out: ResultadoDevolucion[] = []
  for (const d of devoluciones) {
    const norm = normalizarIdRecibo(d.idRecibo)
    const tipoMotivo = clasificarMotivoDevolucion(d.motivo)
    const r = await db.$transaction(async (tx) => {
      // Primero el recibo: lo que CIMA ya sabe decide qué se hace con el aviso.
      const [rec] = await tx.$queryRaw<(FilaRecibo & { situacion: string; diaCima: string | null; abierta: boolean })[]>`
        select r.id::text as "reciboId", p.id::text as "polizaId", p.cliente_id::text as "clienteId", p.tipo::text as ramo,
               p.aseguradora as compania, p.numero_poliza as "numeroPoliza",
               to_char(r.fecha_efecto_actual at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto, r.prima_total::text as importe,
               r.comision_bruta::text as comision,
               (p.estado::text = any(${ESTADOS_VIGENTES}::text[]) and p.sustituida_at is null) as vigente,
               c.nombre, c.apellidos, r.situacion::text as situacion,
               to_char(r.fecha_situacion at time zone 'Europe/Madrid', 'YYYY-MM-DD') as "diaCima",
               exists (select 1 from recibo_devolucion x where x.correduria_id = r.correduria_id
                         and x.codigo_entidad_dgs = r.codigo_entidad_dgs and x.id_recibo_norm = ltrim(r.id_recibo, '0')
                         and x.resuelta_at is null) as abierta
        from poliza_recibos r
        join polizas p on p.id = r.poliza_id and p.merged_into_poliza_id is null
        left join clientes c on c.id = p.cliente_id
        where r.correduria_id = ${correduriaId}::uuid and r.codigo_entidad_dgs = ${d.codigoDgs}
          and ltrim(r.id_recibo, '0') = ${norm}
        order by r.updated_at desc nulls last
        limit 1`
      // CIMA ya lo trae devuelto y no hay aviso nuestro: la devolución es de CIMA y la resuelve CIMA.
      // Registrarla también por correo permitiría un «cobrado» a mano que el siguiente pull deshace.
      const yaEnCima = !!rec && rec.situacion === 'devuelto' && !rec.abierta
      // CIMA ya sabe algo POSTERIOR a la devolución (un cobro, una anulación): el aviso llega tarde.
      const posterior = !!rec && rec.situacion !== 'devuelto' && rec.diaCima !== null && rec.diaCima > d.fechaDevolucion
      let nueva = false
      if (!yaEnCima) {
        const ins = await tx.$queryRaw<{ id: string }[]>`
          insert into recibo_devolucion (correduria_id, codigo_entidad_dgs, id_recibo, numero_poliza, fecha_devolucion, fecha_efecto,
                                         importe, motivo, tipo_motivo, fuente, mensaje_id, resolucion_auto, recibo_id, poliza_id,
                                         resuelta_at, resuelta_motivo, resuelta_por)
          values (${correduriaId}::uuid, ${d.codigoDgs}, ${d.idRecibo}, ${d.numeroPoliza}, ${d.fechaDevolucion}::date, ${d.fechaEfecto}::date,
                  ${d.importe}::numeric, ${d.motivo}, ${tipoMotivo}, 'correo', ${mensajeId}, ${fechaEsDelBanco(d.codigoDgs)},
                  ${rec?.reciboId ?? null}::uuid, ${rec?.polizaId ?? null}::uuid,
                  ${posterior ? new Date() : null}::timestamptz, ${posterior ? `cima:${rec?.situacion}` : null}, ${posterior ? ACTOR : null})
          on conflict (correduria_id, codigo_entidad_dgs, id_recibo_norm) where resuelta_at is null do nothing
          returning id::text as id`
        nueva = ins.length > 0
      }
      if (!rec) return { nueva, rec: null, tarea: 'no_aplica' as const, estado: 'sin_recibo' as const }
      if (posterior) return { nueva, rec, tarea: 'no_aplica' as const, estado: 'ya_resuelta' as const }
      if (!yaEnCima) {
        // El recibo pasa a `devuelto` con la fecha de la devolución: así la foto del detector ve el
        // cambio (evento RECIBO_DEVUELTO → borrador al cliente) y el trigger lo protege de la ingesta.
        // Solo si CIMA no sabe nada posterior (la guarda de arriba, repetida por si cambió entre medias).
        await tx.$executeRaw`
          update poliza_recibos set situacion = 'devuelto',
                 fecha_situacion = (${d.fechaDevolucion}::date::timestamp at time zone 'Europe/Madrid'), updated_at = now()
          where id = ${rec.reciboId}::uuid and situacion::text <> 'devuelto'
            and (fecha_situacion is null or (fecha_situacion at time zone 'Europe/Madrid')::date <= ${d.fechaDevolucion}::date)`
      }
      if (nueva) {
        await tx.$executeRaw`
          insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
          values (${correduriaId}::uuid, ${rec.clienteId}::uuid, ${rec.polizaId}::uuid, cast('gestion' as tipo_historial_interno),
                  ${`Recibo DEVUELTO por el banco (aviso de la compañía por correo del ${d.fechaDevolucion}${d.motivo ? `, motivo «${d.motivo}»` : ''}).`})`
      }
      const tarea = rec.vigente
        ? await asegurarTareaDevolucion(tx, correduriaId, {
            reciboId: rec.reciboId, idRecibo: d.idRecibo, polizaId: rec.polizaId, clienteId: rec.clienteId, ramo: rec.ramo,
            compania: rec.compania, numeroPoliza: rec.numeroPoliza, efecto: rec.efecto ?? d.fechaEfecto,
            importe: d.importe ?? importeEiacNum(rec.importe), tipoMotivo, motivo: d.motivo,
          }, hoy)
        : ('no_aplica' as const)
      return { nueva, rec, tarea, estado: yaEnCima ? ('ya_en_cima' as const) : nueva ? ('registrada' as const) : ('ya_registrada' as const) }
    })
    const efecto = r.rec?.efecto ?? d.fechaEfecto
    out.push({
      idRecibo: d.idRecibo,
      codigoDgs: d.codigoDgs,
      estado: r.estado,
      clienteId: r.rec?.clienteId ?? null,
      cliente: r.rec ? [r.rec.nombre, r.rec.apellidos].filter(Boolean).join(' ') || null : null,
      polizaId: r.rec?.polizaId ?? null,
      ramo: r.rec?.ramo ?? null,
      compania: r.rec?.compania ?? null,
      importe: d.importe ?? importeEiacNum(r.rec?.importe ?? null),
      comision: comisionEnRiesgo(r.rec?.comision ?? null),
      fechaEfecto: efecto,
      suspensionDesde: suspensionDesde(efecto),
      tipoMotivo,
      motivo: d.motivo,
      tarea: r.tarea === 'creada' ? 'abierta' : r.tarea === 'ya_habia' ? 'ya_habia' : 'no_aplica',
    })
  }
  return out
}

/** Solo una comisión POSITIVA está en riesgo: una negativa es ya un extorno, y un texto raro no se sabe. */
export function comisionEnRiesgo(v: string | null): number | null {
  const n = importeEiac(v)
  return n !== null && n > 0 ? n : null
}

function importeEiacNum(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ── Tarea por hito ─────────────────────────────────────────────────────────────

type ReciboSeguido = {
  reciboId: string; idRecibo: string; polizaId: string; clienteId: string; ramo: string | null; compania: string | null
  numeroPoliza: string | null; efecto: string | null; importe: number | null; tipoMotivo: TipoMotivoDevolucion | null; motivo: string | null
}

/**
 * La tarea del hito que toca hoy, una vez. Cuelga de la oportunidad abierta de esa póliza si la hay
 * (retención, «mejórame el precio»…: dos listas de tareas sobre el mismo cliente se pisan); si no, abre
 * una de renovación con origen `recibo_devuelto`. Las tareas de hitos anteriores que sigan abiertas
 * se cierran: la nueva las sustituye.
 */
async function asegurarTareaDevolucion(tx: Tx, correduriaId: string, r: ReciboSeguido, hoy: Date): Promise<'creada' | 'ya_habia' | 'extinguida'> {
  const hito = hitoDevolucion(r.efecto, hoy)
  if (hito === null) return 'extinguida'
  // En fila por póliza: el triaje y la pasada diaria pueden llegar a la vez sin oportunidad abierta.
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`devolucion:${r.polizaId}`}))`
  // Tras el candado, la póliza puede haberse dado de baja («el cliente se va») mientras esta pasada
  // esperaba: ya no se persigue el impago ni se cuelga la llamada de la oportunidad del año que viene.
  const [viva] = await tx.$queryRaw<{ ok: boolean }[]>`
    select (estado::text = any(${ESTADOS_VIGENTES}::text[]) and baja_verificada_at is null) as ok
    from polizas where id = ${r.polizaId}::uuid`
  if (!viva?.ok) return 'extinguida'
  // Una vez por recibo y hito en TODA la correduría, y nunca otra vez si Alberto ya CERRÓ la
  // oportunidad de este recibo: cerrarla es su decisión, y reabrirla cada día sería ruido.
  const [visto] = await tx.$queryRaw<{ hito: number; cerrada: number }[]>`
    select
      (select count(*)::int from oportunidad_historial
        where correduria_id = ${correduriaId}::uuid and accion = 'tarea_devolucion'
          and detalle->>'reciboId' = ${r.reciboId} and detalle->>'hito' = ${hito}) as hito,
      (select count(*)::int from oportunidades
        where correduria_id = ${correduriaId}::uuid and estado::text in ('ganada', 'perdida')
          and (info_riesgo->>'reciboId' = ${r.reciboId}
               or (info_riesgo->>'polizaId' = ${r.polizaId} and ltrim(coalesce(info_riesgo->>'idRecibo', info_riesgo->>'reciboId', ''), '0') = ${normalizarIdRecibo(r.idRecibo)}))) as cerrada`
  if ((visto?.hito ?? 0) > 0 || (visto?.cerrada ?? 0) > 0) return 'ya_habia'
  const [abierta] = await tx.$queryRaw<{ id: string; estado: string }[]>`
    select o.id::text as id, o.estado::text as estado from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.info_riesgo->>'polizaId' = ${r.polizaId}
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
    order by o.created_at desc limit 1`
  let oportunidadId = abierta?.id ?? null
  if (oportunidadId) {
    // Abierta A MANO por esta devolución (antes de este código) y sin ningún hito anotado: su tarea
    // ya es la de hoy. Se anota el hito para no duplicarla y se deja la que escribió Alberto.
    const [manual] = await tx.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from oportunidades o
      where o.id = ${oportunidadId}::uuid and o.info_riesgo->>'motivo' = ${ORIGEN_DEVOLUCION}
        and not exists (select 1 from oportunidad_historial h where h.oportunidad_id = o.id and h.accion = 'tarea_devolucion')`
    if ((manual?.n ?? 0) > 0) {
      await anotarHito(tx, correduriaId, oportunidadId, r.reciboId, hito)
      return 'ya_habia'
    }
  } else {
    const [o] = await tx.$queryRaw<{ id: string }[]>`
      insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, numero_poliza, info_riesgo)
      values (${correduriaId}::uuid, ${r.clienteId}::uuid, cast(${r.ramo ?? 'otros'} as tipo_seguro), 'renovacion', 'en_negociacion',
              ${r.numeroPoliza}, ${JSON.stringify({ origen: ORIGEN_DEVOLUCION, polizaId: r.polizaId, reciboId: r.reciboId, idRecibo: r.idRecibo })}::jsonb)
      returning id::text as id`
    oportunidadId = o.id
    await tx.$executeRaw`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'creada_devolucion', null, 'en_negociacion',
              ${JSON.stringify({ polizaId: r.polizaId, reciboId: r.reciboId })}::jsonb, ${ACTOR})`
    anotarCambio({ entidad: 'oportunidad', id: oportunidadId, campo: 'estado', antes: null, despues: 'en_negociacion' })
  }
  // La PRIMERA vez que se actúa sobre este recibo no se llama «segunda llamada» aunque ya hayan
  // pasado 7 días (el aviso llegó tarde): se pide la primera. Los avisos de 25 y 30 días sí mandan.
  const [previos] = await tx.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from oportunidad_historial
    where accion = 'tarea_devolucion' and detalle->>'reciboId' = ${r.reciboId} and correduria_id = ${correduriaId}::uuid`
  const hitoTexto: HitoDevolucion = (previos?.n ?? 0) === 0 && hito === 'segunda_llamada' ? 'inicial' : hito
  const observaciones = textoTareaDevolucion({ hito: hitoTexto, ramo: r.ramo, compania: r.compania, importe: r.importe, fechaEfecto: r.efecto, tipoMotivo: r.tipoMotivo, motivo: r.motivo })
  await tx.$executeRaw`
    update gestiones set estado = 'cerrada', updated_at = now(),
           observaciones = observaciones || ${'\n— Sustituida por el siguiente paso del recibo devuelto.'}
    where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and estado <> 'cerrada'
      and poliza_id = ${r.polizaId}::uuid and starts_with(observaciones, ${PREFIJO_TAREA_DEVOLUCION})`
  await tx.$executeRaw`
    insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, oportunidad_id, origen_trigger)
    values (${correduriaId}::uuid, cast('llamada' as gestion_tipo), 'alta', 'pendiente', ${observaciones},
            (${diaMadrid(hoy)}::date + time '23:59:59') at time zone 'Europe/Madrid',
            ${r.clienteId}::uuid, ${r.polizaId}::uuid, ${oportunidadId}::uuid, 'central:seguimiento')`
  await anotarHito(tx, correduriaId, oportunidadId, r.reciboId, hito)
  return 'creada'
}

async function anotarHito(tx: Tx, correduriaId: string, oportunidadId: string, reciboId: string, hito: HitoDevolucion): Promise<void> {
  await tx.$executeRaw`
    insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
    values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'tarea_devolucion', null, null,
            ${JSON.stringify({ reciboId, hito })}::jsonb, ${ACTOR})`
}

function diaMadrid(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

// ── Pasada diaria (dentro del detector) ────────────────────────────────────────

export type SeguimientoDevoluciones = { tareas: number; cerradas: number }

export async function seguirDevoluciones(tx: Tx, correduriaId: string, hoy: Date = new Date()): Promise<SeguimientoDevoluciones> {
  const recibos = await tx.$queryRaw<(Omit<ReciboSeguido, 'importe' | 'tipoMotivo'> & { importe: string | null; tipoMotivo: string | null })[]>`
    select r.id::text as "reciboId", r.id_recibo as "idRecibo", p.id::text as "polizaId", p.cliente_id::text as "clienteId",
           p.tipo::text as ramo, p.aseguradora as compania, p.numero_poliza as "numeroPoliza",
           to_char(r.fecha_efecto_actual at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto,
           coalesce(d.importe, r.prima_total)::text as importe, d.tipo_motivo as "tipoMotivo", d.motivo
    from poliza_recibos r
    join polizas p on p.id = r.poliza_id and p.merged_into_poliza_id is null and p.sustituida_at is null
    left join lateral (
      select x.importe, x.tipo_motivo, x.motivo from recibo_devolucion x
      where x.correduria_id = r.correduria_id and x.codigo_entidad_dgs = r.codigo_entidad_dgs
        and x.id_recibo_norm = ltrim(r.id_recibo, '0') and x.resuelta_at is null
      limit 1) d on true
    where r.correduria_id = ${correduriaId}::uuid and r.situacion::text = 'devuelto'
      and p.estado::text = any(${ESTADOS_VIGENTES}::text[])
    -- Orden fijo: los candados por póliza se toman siempre en el mismo orden.
    order by p.id, r.id`
  let tareas = 0
  for (const r of recibos) {
    const res = await asegurarTareaDevolucion(tx, correduriaId, {
      ...r,
      importe: importeEiacNum(r.importe),
      tipoMotivo: (r.tipoMotivo as TipoMotivoDevolucion | null) ?? null,
    }, hoy)
    if (res === 'creada') tareas++
  }
  return { tareas, cerradas: await cerrarDevolucionesCobradas(tx, correduriaId) }
}

/**
 * Cierra como GANADA la oportunidad de un recibo devuelto que ya consta cobrado, con sus tareas.
 * Solo con prueba: el recibo está en la cartera, ya no está devuelto, está `cobrado` y no queda una
 * devolución abierta. Un aviso cuyo recibo aún no ha llegado (Mapfre) NO se cierra.
 */
async function cerrarDevolucionesCobradas(tx: Tx, correduriaId: string): Promise<number> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    select o.id::text as id from oportunidades o
    join poliza_recibos r on r.correduria_id = o.correduria_id and r.poliza_id = (o.info_riesgo->>'polizaId')::uuid
      and ltrim(r.id_recibo, '0') = ltrim(coalesce(o.info_riesgo->>'idRecibo', o.info_riesgo->>'reciboId', ''), '0')
    where o.correduria_id = ${correduriaId}::uuid
      and (o.info_riesgo->>'origen' = ${ORIGEN_DEVOLUCION} or o.info_riesgo->>'motivo' = ${ORIGEN_DEVOLUCION})
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and r.situacion::text = 'cobrado'
      and not exists (select 1 from recibo_devolucion x where x.correduria_id = r.correduria_id
                        and x.codigo_entidad_dgs = r.codigo_entidad_dgs and x.id_recibo_norm = ltrim(r.id_recibo, '0') and x.resuelta_at is null)
    for update of o`
  for (const f of filas) {
    await tx.$executeRaw`
      update oportunidades set estado = 'ganada', cerrada_at = now(), updated_at = now() where id = ${f.id}::uuid`
    await tx.$executeRaw`
      update gestiones set estado = 'cerrada', updated_at = now(),
             observaciones = observaciones || ${'\n— Cerrada sola: el recibo ya consta cobrado.'}
      where oportunidad_id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado <> 'cerrada'`
    await tx.$executeRaw`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${f.id}::uuid, 'devolucion_cobrada', null, 'ganada', '{}'::jsonb, ${ACTOR})`
    anotarCambio({ entidad: 'oportunidad', id: f.id, campo: 'estado', antes: 'en_negociacion', despues: 'ganada' })
  }
  return filas.length
}

// ── «Cobrado de nuevo» a mano ─────────────────────────────────────────────────

export type ResolucionDevolucion = { ok: true } | { ok: false; estado: 'no_encontrado' | 'conflicto' | 'invalido'; motivo: string; status: number }

/**
 * Solo para devoluciones que avisó la compañía por correo (hay fila abierta en `recibo_devolucion`).
 * Una que trae CIMA se resuelve cuando CIMA mande el cobro: marcarla a mano la volvería a pisar el
 * siguiente pull con su `devuelto`.
 */
export async function resolverDevolucion(correduriaId: string, reciboId: string, actor: string): Promise<ResolucionDevolucion> {
  if (!UUID.test(reciboId)) return { ok: false, estado: 'invalido', motivo: 'reciboId no válido', status: 422 }
  return prismaAsegura().$transaction(async (tx) => {
    const [r] = await tx.$queryRaw<{ clienteId: string; polizaId: string; situacion: string }[]>`
      select p.cliente_id::text as "clienteId", p.id::text as "polizaId", r.situacion::text as situacion
      from poliza_recibos r join polizas p on p.id = r.poliza_id
      where r.id = ${reciboId}::uuid and r.correduria_id = ${correduriaId}::uuid`
    if (!r) return { ok: false as const, estado: 'no_encontrado' as const, motivo: 'Ese recibo no es de esta correduría.', status: 404 }
    const resueltas = await tx.$executeRaw`
      update recibo_devolucion set resuelta_at = now(), resuelta_motivo = 'manual:cobrado', resuelta_por = ${actor}
      where correduria_id = ${correduriaId}::uuid and resuelta_at is null
        and (recibo_id = ${reciboId}::uuid
             or (id_recibo_norm, codigo_entidad_dgs) = (select ltrim(id_recibo, '0'), codigo_entidad_dgs from poliza_recibos where id = ${reciboId}::uuid))`
    if (resueltas === 0) {
      return { ok: false as const, estado: 'conflicto' as const, motivo: 'Esta devolución la trae CIMA: se da por cobrada cuando CIMA mande el cobro.', status: 409 }
    }
    await tx.$executeRaw`
      update poliza_recibos set situacion = 'cobrado', fecha_situacion = now(), updated_at = now() where id = ${reciboId}::uuid`
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${r.clienteId}::uuid, ${r.polizaId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Recibo devuelto marcado como COBRADO DE NUEVO — por ${actor}`})`
    await cerrarDevolucionesCobradas(tx, correduriaId)
    return { ok: true as const }
  })
}

export type { HitoDevolucion }

// ── «El cliente se va» ────────────────────────────────────────────────────────

export type BajaPorDevolucion =
  | { ok: true; oportunidadId: string; vence: string | null; llamada: string }
  | { ok: false; estado: 'no_encontrado' | 'conflicto' | 'invalido'; motivo: string; status: number }

/**
 * El corredor da la póliza por PERDIDA desde su recibo devuelto (Alberto, 29/09/2026: «la clienta ya me
 * avisó de que esa moto no la iba a tener»). En UNA transacción:
 *  1. cierra la devolución abierta (si la avisó el correo) como `manual:baja`;
 *  2. marca la póliza `cancelada` con baja VERIFICADA (columnas propias; un trigger impide que un
 *     «vigente» de CIMA la reabra) y guarda el estado previo para poder deshacerlo;
 *  3. pierde la oportunidad del recibo y sus tareas, y rechaza el correo al cliente pendiente de OK;
 *  4. abre una oportunidad de COMPETENCIA para el aniversario, con la llamada 60 días antes;
 *  5. lo deja escrito en el historial de la ficha, con de dónde vino cada dato.
 * Cuando CIMA mande después la baja, el detector la da por explicada (no abre retención ni fuga).
 */
function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export async function darDeBajaPorDevolucion(
  correduriaId: string, reciboId: string, motivo: MotivoBaja, nota: string | null, actor: string, hoy = hoyMadrid(),
): Promise<BajaPorDevolucion> {
  if (!UUID.test(reciboId)) return { ok: false, estado: 'invalido', motivo: 'reciboId no válido', status: 422 }
  return prismaAsegura().$transaction(async (tx) => {
    const [r] = await tx.$queryRaw<{
      clienteId: string; polizaId: string; ramo: string; compania: string | null; numeroPoliza: string | null
      estado: string; situacion: string; baja: boolean; efecto: string | null; vencePoliza: string | null
      importe: string | null; prima: string | null
    }[]>`
      select p.cliente_id::text as "clienteId", p.id::text as "polizaId", p.tipo::text as ramo, p.aseguradora as compania,
             p.numero_poliza as "numeroPoliza", p.estado::text as estado, r.situacion::text as situacion,
             p.baja_verificada_at is not null as baja,
             to_char(r.fecha_efecto_actual at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto,
             to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as "vencePoliza",
             r.prima_total as importe, nullif(coalesce(p.prima_bruta, p.prima_anual), 0)::text as prima
      from poliza_recibos r join polizas p on p.id = r.poliza_id
      where r.id = ${reciboId}::uuid and r.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null
      for update of p`
    if (!r) return { ok: false as const, estado: 'no_encontrado' as const, motivo: 'Ese recibo no es de esta correduría.', status: 404 }
    // El mismo candado que la tarea de devolución (triaje y pasada diaria): o va ella antes y esta
    // la cierra, o va esta antes y aquella ve la baja y no cuelga nada.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`devolucion:${r.polizaId}`}))`
    if (r.situacion !== 'devuelto') {
      return { ok: false as const, estado: 'conflicto' as const, motivo: 'Solo se da de baja desde un recibo DEVUELTO.', status: 409 }
    }
    if (r.baja || !(POLIZA_ESTADOS_VIGENTES as readonly string[]).includes(r.estado)) {
      return { ok: false as const, estado: 'conflicto' as const, motivo: 'La póliza ya no está en vigor: no hay nada que dar de baja.', status: 409 }
    }

    // 1. La devolución por correo, si la hay (una que trae CIMA no tiene fila abierta: 0 es normal).
    const deCorreo = await tx.$queryRaw<{ fecha: string }[]>`
      update recibo_devolucion set resuelta_at = now(), resuelta_motivo = 'manual:baja', resuelta_por = ${actor}
      where correduria_id = ${correduriaId}::uuid and resuelta_at is null
        and (recibo_id = ${reciboId}::uuid
             or (id_recibo_norm, codigo_entidad_dgs) = (select ltrim(id_recibo, '0'), codigo_entidad_dgs from poliza_recibos where id = ${reciboId}::uuid))
      returning to_char(fecha_devolucion, 'YYYY-MM-DD') as fecha`

    // 2. La póliza, anulada ya por nosotros.
    await tx.$executeRaw`
      update polizas set baja_verificada_at = now(), baja_verificada_por = ${actor}, baja_motivo = ${motivo},
             baja_estado_previo = estado::text, estado = 'cancelada', updated_at = now()
      where id = ${r.polizaId}::uuid and correduria_id = ${correduriaId}::uuid`
    anotarCambio({ entidad: 'poliza', id: r.polizaId, campo: 'estado', antes: r.estado, despues: 'cancelada' })

    // 3. Lo que perseguía el impago: oportunidades de ESA póliza, sus tareas y el correo propuesto.
    const perdidas = await tx.$queryRaw<{ id: string; estado: string }[]>`
      select o.id::text as id, o.estado::text as estado from oportunidades o
      where o.correduria_id = ${correduriaId}::uuid
        and (o.poliza_id = ${r.polizaId}::uuid or o.info_riesgo->>'polizaId' = ${r.polizaId})
        and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      for update`
    for (const o of perdidas) {
      await tx.$executeRaw`
        update oportunidades set estado = 'perdida', motivo_perdida = ${motivo}, motivo_perdida_detalle = ${nota},
               cerrada_at = now(), updated_at = now()
        where id = ${o.id}::uuid`
      await tx.$executeRaw`
        insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
        values (${correduriaId}::uuid, ${o.id}::uuid, 'perder', cast(${o.estado} as estado_comercial), 'perdida',
                ${JSON.stringify({ motivo, origen: 'baja_verificada', reciboId })}::jsonb, ${actor})`
    }
    await tx.$executeRaw`
      update gestiones set estado = 'cerrada', updated_at = now(),
             observaciones = observaciones || ${`\n${MARCA_CIERRE_AUTOMATICO} perdida (el cliente se va: baja verificada).`}
      where correduria_id = ${correduriaId}::uuid and estado <> 'cerrada'
        and (oportunidad_id in (select o.id from oportunidades o where o.estado::text = 'perdida'
                                  and (o.poliza_id = ${r.polizaId}::uuid or o.info_riesgo->>'polizaId' = ${r.polizaId}))
             or (poliza_id = ${r.polizaId}::uuid and origen_trigger = 'central:seguimiento'))`
    await tx.$executeRaw`
      update aprobacion set estado = 'rechazada', decidida_at = now(), decidida_por = ${actor},
             resultado = 'No se envía: el cliente se va (baja verificada).'
      where correduria_id = ${correduriaId}::uuid and poliza_id = ${r.polizaId}::uuid
        and origen = ${'recibo_devuelto'} and estado = 'pendiente'`

    // 4. La oportunidad del año que viene.
    const vence = vencimientoCompetencia(r.efecto, r.vencePoliza, hoy)
    const llamada = fechaLlamada(vence, hoy)
    const motivoTxt = ROTULO_MOTIVO_BAJA[motivo]
    const cia = r.compania ?? 'la compañía'
    let oportunidadId = ''
    // Una por PÓLIZA, no por cliente+ramo: con dos motos (o una flota) la oportunidad abierta de la otra
    // matrícula no cubre esta. Las abiertas de ESTA póliza ya se han perdido arriba.
    {
      const [o] = await tx.$queryRaw<{ id: string }[]>`
        insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, fecha_fin_vigencia, prima_bruta, poliza_id, info_riesgo)
        values (${correduriaId}::uuid, ${r.clienteId}::uuid, cast(${r.ramo} as tipo_seguro), 'renovacion', 'competencia',
                ${vence}::date, ${r.prima}::numeric, ${r.polizaId}::uuid,
                ${JSON.stringify({ origen: 'baja_verificada', polizaId: r.polizaId, companiaAnterior: r.compania, numeroPolizaAnterior: r.numeroPoliza, motivo })}::jsonb)
        returning id::text as id`
      oportunidadId = o.id
      await tx.$executeRaw`
        insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, oportunidad_id, origen_trigger)
        values (${correduriaId}::uuid, cast('llamada' as gestion_tipo), 'media', 'pendiente',
                ${`Pasarle precio: dejó ${cia} (${motivoTxt}).${vence ? ` Su seguro actual renueva hacia el ${fechaEs(vence)}.` : ''}`},
                (${llamada}::date + time '23:59:59') at time zone 'Europe/Madrid',
                ${r.clienteId}::uuid, ${r.polizaId}::uuid, ${o.id}::uuid, 'central:seguimiento')`
      await tx.$executeRaw`
        insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
        values (${correduriaId}::uuid, ${o.id}::uuid, 'creada_baja_verificada', null, 'competencia',
                ${JSON.stringify({ polizaId: r.polizaId, vence, llamada })}::jsonb, ${actor})`
    }

    // 5. El rastro en la ficha: de dónde salió cada cosa (correo, CIMA, el corredor).
    const importe = importeEiac(r.importe)
    const fuente = deCorreo[0] ? `aviso de la compañía por correo del ${fechaEs(deCorreo[0].fecha)}` : 'CIMA'
    const texto = [
      `Póliza ${r.numeroPoliza ?? ''} (${cia}) ANULADA — baja verificada por ${actor}: ${motivoTxt}.`,
      `Recibo devuelto${importe !== null ? ` de ${importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€` : ''}${r.efecto ? ` (efecto ${fechaEs(r.efecto)})` : ''} sin pagar; devolución conocida por ${fuente}.`,
      nota ? `Nota: ${nota}` : null,
      'Pendiente de que CIMA confirme la anulación.',
      vence ? `Oportunidad de competencia para el ${fechaEs(vence)} (llamada el ${fechaEs(llamada)}).` : `Oportunidad de competencia sin fecha de renovación (llamada el ${fechaEs(llamada)}).`,
    ].filter(Boolean).join(' ')
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${r.clienteId}::uuid, ${r.polizaId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
    return { ok: true as const, oportunidadId, vence, llamada }
  })
}
