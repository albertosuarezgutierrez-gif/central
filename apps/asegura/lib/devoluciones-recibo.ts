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
  clasificarMotivoDevolucion,
  hitoDevolucion,
  normalizarIdRecibo,
  suspensionDesde,
  textoTareaDevolucion,
  type HitoDevolucion,
  type TipoMotivoDevolucion,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'

type Tx = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

const ESTADOS_VIGENTES = [...POLIZA_ESTADOS_VIGENTES] as string[]
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
    if (!fechaDevolucion || !FECHA.test(fechaDevolucion)) return { ok: false, motivo: 'fechaDevolucion no válida' }
    if (fechaEfecto !== null && !FECHA.test(fechaEfecto)) return { ok: false, motivo: 'fechaEfecto no válida' }
    const importe = typeof d.importe === 'number' && Number.isFinite(d.importe) && d.importe >= 0 ? d.importe : null
    out.push({ codigoDgs, idRecibo, numeroPoliza: texto(d.numeroPoliza, 40), importe, fechaEfecto, fechaDevolucion, motivo: texto(d.motivo, 120) })
  }
  return { ok: true, devoluciones: out, mensajeId: texto(o.mensajeId, 300) }
}

// ── Registro ───────────────────────────────────────────────────────────────────

export type ResultadoDevolucion = {
  idRecibo: string
  codigoDgs: string
  /** `sin_recibo` = la compañía avisa de un recibo que aún no está en la cartera: se guarda y se enlaza al llegar. */
  estado: 'registrada' | 'ya_registrada' | 'sin_recibo'
  clienteId: string | null
  cliente: string | null
  polizaId: string | null
  ramo: string | null
  compania: string | null
  importe: number | null
  fechaEfecto: string | null
  suspensionDesde: string | null
  tipoMotivo: TipoMotivoDevolucion | null
  motivo: string | null
  /** Se abrió (o ya había) la llamada de seguimiento. */
  tarea: 'abierta' | 'ya_habia' | 'no_aplica'
}

type FilaRecibo = {
  reciboId: string; polizaId: string; clienteId: string; ramo: string | null; compania: string | null
  numeroPoliza: string | null; efecto: string | null; importe: string | null; vigente: boolean
  nombre: string | null; apellidos: string | null
}

export async function registrarDevoluciones(correduriaId: string, devoluciones: DevolucionEntrada[], mensajeId: string | null, hoy: Date = new Date()): Promise<ResultadoDevolucion[]> {
  const db = prismaAsegura()
  const out: ResultadoDevolucion[] = []
  for (const d of devoluciones) {
    const norm = normalizarIdRecibo(d.idRecibo)
    const tipoMotivo = clasificarMotivoDevolucion(d.motivo)
    const r = await db.$transaction(async (tx) => {
      const ins = await tx.$queryRaw<{ id: string }[]>`
        insert into recibo_devolucion (correduria_id, codigo_entidad_dgs, id_recibo, numero_poliza, fecha_devolucion, fecha_efecto, importe, motivo, tipo_motivo, fuente, mensaje_id)
        values (${correduriaId}::uuid, ${d.codigoDgs}, ${d.idRecibo}, ${d.numeroPoliza}, ${d.fechaDevolucion}::date, ${d.fechaEfecto}::date,
                ${d.importe}::numeric, ${d.motivo}, ${tipoMotivo}, 'correo', ${mensajeId})
        on conflict (correduria_id, codigo_entidad_dgs, id_recibo_norm) where resuelta_at is null do nothing
        returning id::text as id`
      const nueva = ins.length > 0
      const [rec] = await tx.$queryRaw<FilaRecibo[]>`
        select r.id::text as "reciboId", p.id::text as "polizaId", p.cliente_id::text as "clienteId", p.tipo::text as ramo,
               p.aseguradora as compania, p.numero_poliza as "numeroPoliza",
               to_char(r.fecha_efecto_actual at time zone 'Europe/Madrid', 'YYYY-MM-DD') as efecto, r.prima_total::text as importe,
               (p.estado::text = any(${ESTADOS_VIGENTES}::text[]) and p.sustituida_at is null) as vigente,
               c.nombre, c.apellidos
        from poliza_recibos r
        join polizas p on p.id = r.poliza_id and p.merged_into_poliza_id is null
        left join clientes c on c.id = p.cliente_id
        where r.correduria_id = ${correduriaId}::uuid and r.codigo_entidad_dgs = ${d.codigoDgs}
          and ltrim(r.id_recibo, '0') = ${norm}
        order by r.updated_at desc nulls last
        limit 1`
      if (!rec) return { nueva, rec: null, tarea: 'no_aplica' as const }
      await tx.$executeRaw`
        update recibo_devolucion set recibo_id = ${rec.reciboId}::uuid, poliza_id = ${rec.polizaId}::uuid
        where correduria_id = ${correduriaId}::uuid and codigo_entidad_dgs = ${d.codigoDgs}
          and id_recibo_norm = ${norm} and resuelta_at is null`
      // El recibo pasa a `devuelto` con la fecha de la devolución: así la foto del detector ve el
      // cambio (evento RECIBO_DEVUELTO → borrador al cliente) y el trigger lo protege de la ingesta.
      await tx.$executeRaw`
        update poliza_recibos set situacion = 'devuelto',
               fecha_situacion = (${d.fechaDevolucion}::date::timestamp at time zone 'Europe/Madrid'), updated_at = now()
        where id = ${rec.reciboId}::uuid and situacion::text <> 'devuelto'`
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
      return { nueva, rec, tarea }
    })
    const efecto = r.rec?.efecto ?? d.fechaEfecto
    out.push({
      idRecibo: d.idRecibo,
      codigoDgs: d.codigoDgs,
      estado: !r.rec ? 'sin_recibo' : r.nueva ? 'registrada' : 'ya_registrada',
      clienteId: r.rec?.clienteId ?? null,
      cliente: r.rec ? [r.rec.nombre, r.rec.apellidos].filter(Boolean).join(' ') || null : null,
      polizaId: r.rec?.polizaId ?? null,
      ramo: r.rec?.ramo ?? null,
      compania: r.rec?.compania ?? null,
      importe: d.importe ?? importeEiacNum(r.rec?.importe ?? null),
      fechaEfecto: efecto,
      suspensionDesde: suspensionDesde(efecto),
      tipoMotivo,
      motivo: d.motivo,
      tarea: r.tarea === 'creada' ? 'abierta' : r.tarea === 'ya_habia' ? 'ya_habia' : 'no_aplica',
    })
  }
  return out
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
  const [abierta] = await tx.$queryRaw<{ id: string; estado: string }[]>`
    select o.id::text as id, o.estado::text as estado from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.info_riesgo->>'polizaId' = ${r.polizaId}
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
    order by o.created_at desc limit 1
    for update`
  let oportunidadId = abierta?.id ?? null
  if (oportunidadId) {
    const [hecho] = await tx.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from oportunidad_historial
      where oportunidad_id = ${oportunidadId}::uuid and accion = 'tarea_devolucion'
        and detalle->>'reciboId' = ${r.reciboId} and detalle->>'hito' = ${hito}`
    if ((hecho?.n ?? 0) > 0) return 'ya_habia'
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
      and poliza_id = ${r.polizaId}::uuid and observaciones ilike '%devuelto%'`
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
      and p.estado::text = any(${ESTADOS_VIGENTES}::text[])`
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
  if (!/^[0-9a-f-]{36}$/i.test(reciboId)) return { ok: false, estado: 'invalido', motivo: 'reciboId no válido', status: 422 }
  return prismaAsegura().$transaction(async (tx) => {
    const [r] = await tx.$queryRaw<{ clienteId: string; polizaId: string; situacion: string }[]>`
      select p.cliente_id::text as "clienteId", p.id::text as "polizaId", r.situacion::text as situacion
      from poliza_recibos r join polizas p on p.id = r.poliza_id
      where r.id = ${reciboId}::uuid and r.correduria_id = ${correduriaId}::uuid`
    if (!r) return { ok: false as const, estado: 'no_encontrado' as const, motivo: 'Ese recibo no es de esta correduría.', status: 404 }
    const resueltas = await tx.$executeRaw`
      update recibo_devolucion set resuelta_at = now(), resuelta_motivo = 'manual:cobrado', resuelta_por = ${actor}
      where correduria_id = ${correduriaId}::uuid and resuelta_at is null
        and (recibo_id = ${reciboId}::uuid or id_recibo_norm = (select ltrim(id_recibo, '0') from poliza_recibos where id = ${reciboId}::uuid))`
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
