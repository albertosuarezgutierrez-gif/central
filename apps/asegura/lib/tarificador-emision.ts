// EMISIÓN asistida por el robot del tarificador, con autorización de Alberto por Telegram (10/10/2026). Con BD.
// Diseño: docs/TARIFICADOR-EMISION-DISENO.md · reglas puras: @central/module-tarificacion (emision.ts) y
// ./tarificador-emision-reglas.ts · SQL: prisma/sql/2026-10-10_tarificador_emision.sql.
//
//   solicitar ─► trabajo modo=emision `pendiente` ─► máquina 1 (preparar): pantalla previa, NO pulsa, lee la prima
//   ─► `registrarResultadoEmision(pre_emision)`: prima ≠ aceptada (0 €) → requiere_humano; si casa → hash de datos y
//      `pendiente_autorizacion_emision` (24 h) ─► plataforma manda el Telegram con captura y botones `emi_ok`/`emi_no`
//   ─► `autorizarEmision` (solo el id de Telegram configurado) ─► fila de autorización (15 min) y `autorizado_emision`
//   ─► máquina 2 (ejecutar): `trabajoParaWorker` le entrega el token UNA vez (en BD solo su SHA-256) ─► relee la prima
//   ─► `canjearEmision`: UPDATE atómico (token, trabajo, sin consumir, sin caducar, MISMO hash) ─► el worker pulsa UN
//      botón UNA vez ─► `registrarResultadoEmision(emitida|incierto|no_emitida)`.
//
// 🚨 Por defecto cerrado: sin `TARIFICADOR_EMISION_ACTIVA=1`, sin el SQL o sin autorizador configurado, nada de esto
//    avanza. La anulación de la póliza sustituida es MANUAL: aquí no se toca `presupuesto.emitido_at` (dispararía la cola
//    de anulaciones); el trabajo queda `emitido` con su nº de póliza y el aviso a Alberto lo recuerda.
// 🛡️ Todo lo que entra por el puerto de operador filtra por `correduria_id`. El worker solo conoce el id de SU trabajo.

import { createHash } from 'node:crypto'
import {
  botonEmisionDe,
  claveCompania,
  decidirAutorizacion,
  decidirCanje,
  emisionActiva,
  generarTokenEmision,
  hashDatosEmision,
  hashTokenEmision,
  precondicionesEmision,
  primaCoincide,
  VALIDEZ_SOLICITUD_MS,
  VALIDEZ_TOKEN_MS,
  type BotonEmision,
  type PresupuestoParaEmitir,
} from '@central/module-tarificacion'
import { prisma } from './tenant'
import { hayEmision } from './esquema-bd'
import { autorizadorEmision, estadoTrasResultado, iniciales, mensajePrimaDistinta, type ResultadoEmisionWorker } from './tarificador-emision-reglas'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type Db = Pick<Tx, '$queryRaw' | '$executeRaw'>

export type Fallo = { estado: 'rechazado'; status: number; motivo: string }
const rechazo = (status: number, motivo: string): Fallo => ({ estado: 'rechazado', status, motivo })

/** Interruptor + esquema. `null` = se puede seguir. */
async function cerrojos(env: Record<string, string | undefined> = process.env): Promise<Fallo | null> {
  if (!emisionActiva(env)) return rechazo(503, 'emision_apagada (TARIFICADOR_EMISION_ACTIVA)')
  if (!(await hayEmision())) return rechazo(503, 'emision_sin_esquema (aplicar 2026-10-10_tarificador_emision.sql)')
  return null
}

// ─── Lectura del presupuesto aceptado ────────────────────────────────────────

type FilaPresupuesto = PresupuestoParaEmitir & { id: string; clienteId: string; oportunidadId: string | null; referencia: string | null }
type FilaOpcion = { id: string; compania: string; primaEur: unknown }

async function leerPresupuesto(db: Db, correduriaId: string, presupuestoId: string): Promise<FilaPresupuesto | null> {
  const f = await db.$queryRaw<FilaPresupuesto[]>`
    select p.id::text as id, p.cliente_id::text as "clienteId", p.oportunidad_id::text as "oportunidadId", p.origen,
           p.aceptado_at as "aceptadoAt", p.firma_id::text as "firmaId", p.opcion_elegida_id::text as "opcionElegidaId",
           p.ipid_huella as "ipidHuella", p.vence_el as "venceEl", p.retirado_at as "retiradoAt", p.emitido_at as "emitidoAt",
           p.referencia
    from seguros.presupuesto p
    where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid`
  return f[0] ?? null
}

async function leerOpcion(db: Db, presupuestoId: string, opcionId: string): Promise<FilaOpcion | null> {
  const f = await db.$queryRaw<FilaOpcion[]>`
    select o.id::text as id, o.compania, o.prima_eur::text as "primaEur"
    from seguros.presupuesto_opcion o
    where o.id = ${opcionId}::uuid and o.presupuesto_id = ${presupuestoId}::uuid and o.oculta_at is null`
  return f[0] ?? null
}

const tomadorDe = (riesgo: unknown): string | null => {
  const d = (riesgo as { documentoIdentidad?: unknown } | null)?.documentoIdentidad
  return typeof d === 'string' && d.trim() ? d : null
}

function hashDe(t: { compania: string; ramo: string; presupuesto_id: string; opcion_id: string; riesgo: unknown }, primaCents: number, boton: BotonEmision): string {
  return hashDatosEmision({
    compania: t.compania, ramo: t.ramo, presupuestoId: t.presupuesto_id, opcionId: t.opcion_id, primaCents,
    tomadorDocumento: tomadorDe(t.riesgo), riesgo: t.riesgo, boton,
  })
}

// ─── 1. Solicitar ────────────────────────────────────────────────────────────

export type EntradaSolicitar = { correduriaId: string; presupuestoId: string; trabajoOrigenId: string; solicitadoPor: string }

/**
 * Encola UN trabajo de emisión. El riesgo es el de la tarificación RPA de la que sale la oferta (`trabajoOrigenId`,
 * explícito: nunca «la última que haya»), de la MISMA oportunidad, cliente y compañía que la opción aceptada.
 */
export async function solicitarEmision(e: EntradaSolicitar): Promise<{ estado: 'encolado'; trabajoId: string; compania: string } | Fallo> {
  const c = await cerrojos()
  if (c) return c
  const p = await leerPresupuesto(prisma, e.correduriaId, e.presupuestoId)
  if (!p) return rechazo(404, 'presupuesto_no_encontrado')
  if (!p.opcionElegidaId) return rechazo(409, 'el cliente no ha aceptado y firmado el presupuesto')
  const o = await leerOpcion(prisma, p.id, p.opcionElegidaId)
  if (!o) return rechazo(409, 'la opción aceptada no está')
  const origen = await prisma.$queryRaw<{ id: string; compania: string; ramo: string; riesgo: unknown; estado: string; modo: string | null; cliente_id: string; oportunidad_id: string | null }[]>`
    select t.id::text as id, t.compania, t.ramo, t.riesgo, t.estado, to_jsonb(t)->>'modo' as modo,
           t.cliente_id::text as cliente_id, t.oportunidad_id::text as oportunidad_id
    from seguros.tarificacion_trabajos t
    where t.id = ${e.trabajoOrigenId}::uuid and t.correduria_id = ${e.correduriaId}::uuid`
  const t = origen[0]
  if (!t) return rechazo(404, 'trabajo_origen_no_encontrado')
  if (t.estado !== 'ok' || (t.modo ?? 'tarificar') !== 'tarificar') return rechazo(409, 'el trabajo de origen no es una tarificación terminada')
  if (t.cliente_id !== p.clienteId) return rechazo(409, 'el trabajo de origen es de otro cliente')
  if (!p.oportunidadId || t.oportunidad_id !== p.oportunidadId) return rechazo(409, 'el trabajo de origen es de otra oportunidad')
  if (claveCompania(o.compania) !== t.compania) return rechazo(409, 'la opción aceptada es de otra compañía que el trabajo de origen')
  const pre = precondicionesEmision(p, o, t.ramo, new Date())
  if (!pre.ok) return rechazo(409, pre.motivo)
  try {
    const filas = await prisma.$queryRaw<{ id: string }[]>`
      insert into seguros.tarificacion_trabajos
        (correduria_id, oportunidad_id, cliente_id, compania, ramo, riesgo, solicitado_por, modo, presupuesto_id, opcion_id, trabajo_origen_id)
      values (${e.correduriaId}::uuid, ${p.oportunidadId}::uuid, ${p.clienteId}::uuid, ${t.compania}, ${t.ramo},
              ${JSON.stringify(t.riesgo)}::jsonb, ${e.solicitadoPor}, 'emision', ${p.id}::uuid, ${o.id}::uuid, ${t.id}::uuid)
      returning id::text as id`
    return { estado: 'encolado', trabajoId: filas[0].id, compania: t.compania }
  } catch (err) {
    // Índice único parcial: ya hay una emisión viva (o incierta) para este presupuesto.
    if (/idx_trabajo_emision_vivo|23505|unique/i.test(err instanceof Error ? err.message : String(err))) return rechazo(409, 'ya_hay_emision_viva para este presupuesto')
    throw err
  }
}

// ─── 2. Lo que ve el worker ──────────────────────────────────────────────────

export type EmisionParaWorker = { fase: 'preparar' } | { fase: 'ejecutar'; token: string; primaCents: number }

/**
 * Para un trabajo de emisión `en_curso` con lease vivo: `preparar` si aún no hay autorización; `ejecutar` + el token EN
 * CLARO si la hay y nunca se entregó (UPDATE `token_hash IS NULL`: una sola entrega). Cualquier otra cosa → `null`
 * (el worker sale; el lease vence y el trabajo acaba `requiere_humano`). Con el interruptor apagado, `null`.
 */
export async function emisionParaWorker(trabajoId: string, env: Record<string, string | undefined> = process.env): Promise<EmisionParaWorker | null> {
  if (!emisionActiva(env) || !(await hayEmision())) return null
  const aut = await prisma.$queryRaw<{ id: string; token_hash: string | null; consumido_at: Date | null; expira_at: Date; prima_cents: number }[]>`
    select a.id::text as id, a.token_hash, a.consumido_at, a.expira_at, a.prima_cents
    from seguros.tarificacion_emision_autorizacion a
    join seguros.tarificacion_trabajos t on t.id = a.trabajo_id
    where a.trabajo_id = ${trabajoId}::uuid and t.estado = 'en_curso' and t.lease_hasta > now()`
  const a = aut[0]
  if (!a) return { fase: 'preparar' }
  if (a.token_hash || a.consumido_at || a.expira_at.getTime() <= Date.now()) return null
  const token = generarTokenEmision()
  const n = await prisma.$executeRaw`
    update seguros.tarificacion_emision_autorizacion set token_hash = ${hashTokenEmision(token)}, entregado_at = now()
    where id = ${a.id}::uuid and token_hash is null and consumido_at is null and expira_at > now()`
  return n === 1 ? { fase: 'ejecutar', token, primaCents: a.prima_cents } : null
}

// ─── 3. Canje (worker, justo antes del clic) ─────────────────────────────────

export type ResultadoCanje = { ok: true; hashDatos: string; boton: BotonEmision } | { ok: false; status: number; motivo: string }

/**
 * Recalcula el hash con la prima que el worker ACABA de leer y canjea el token con un UPDATE atómico. Si no casa (otro
 * precio, otro trabajo, caducado, ya usado), el token se CONSUME igualmente y no se emite.
 */
export async function canjearEmision(e: { trabajoId: string; token: string; primaCents: number }): Promise<ResultadoCanje> {
  const c = await cerrojos()
  if (c) return { ok: false, status: c.status, motivo: c.motivo }
  return prisma.$transaction(async (tx) => {
    const ts = await tx.$queryRaw<{ id: string; estado: string; modo: string | null; compania: string; ramo: string; presupuesto_id: string; opcion_id: string; riesgo: unknown; lease_vivo: boolean }[]>`
      select t.id::text as id, t.estado, to_jsonb(t)->>'modo' as modo, t.compania, t.ramo, t.presupuesto_id::text as presupuesto_id,
             t.opcion_id::text as opcion_id, t.riesgo, (t.lease_hasta > now()) as lease_vivo
      from seguros.tarificacion_trabajos t where t.id = ${e.trabajoId}::uuid for update`
    const t = ts[0]
    if (!t || t.modo !== 'emision' || t.estado !== 'en_curso' || !t.lease_vivo) return { ok: false as const, status: 409, motivo: 'trabajo_no_en_curso' }
    const boton = botonEmisionDe(t.compania, t.ramo)
    if (!boton) return { ok: false as const, status: 409, motivo: 'emision_no_habilitada' }
    const hashDatos = hashDe(t, e.primaCents, boton)
    const tokenHash = hashTokenEmision(e.token)
    const fs = await tx.$queryRaw<{ trabajo_id: string; token_hash: string | null; hash_datos: string; expira_at: Date; consumido_at: Date | null }[]>`
      select trabajo_id::text as trabajo_id, token_hash, hash_datos, expira_at, consumido_at
      from seguros.tarificacion_emision_autorizacion where token_hash = ${tokenHash} for update`
    const f = fs[0] ?? null
    const d = decidirCanje(f ? { trabajoId: f.trabajo_id, tokenHash: f.token_hash, hashDatos: f.hash_datos, expiraAt: f.expira_at, consumidoAt: f.consumido_at } : null, {
      trabajoId: t.id, token: e.token, hashDatos, ahora: new Date(),
    })
    if (d.ok) {
      const ok = await tx.$executeRaw`
        update seguros.tarificacion_emision_autorizacion set consumido_at = now()
        where token_hash = ${tokenHash} and trabajo_id = ${t.id}::uuid and consumido_at is null and expira_at > now() and hash_datos = ${hashDatos}`
      if (ok === 1) return { ok: true as const, hashDatos, boton }
    }
    // Fallido: el token (si es de ESTE trabajo) se consume igualmente; el motivo queda en la auditoría.
    const resultado = !d.ok && d.motivo === 'hash_distinto' ? 'hash_distinto' : !d.ok && d.motivo === 'caducado' ? 'caducada' : 'rechazado_canje'
    await tx.$executeRaw`
      update seguros.tarificacion_emision_autorizacion
      set consumido_at = coalesce(consumido_at, now()), resultado = coalesce(resultado, ${resultado})
      where token_hash = ${tokenHash} and trabajo_id = ${t.id}::uuid`
    return { ok: false as const, status: 409, motivo: d.ok ? 'canje_concurrente' : d.motivo }
  })
}

// ─── 4. Resultados del worker ────────────────────────────────────────────────

export type RegistroEmision = { estado: 'registrado'; estadoTrabajo: string } | { estado: 'conflicto'; motivo: string } | { estado: 'no_encontrado' }

async function guardarCaptura(db: Db, t: { correduria_id: string; cliente_id: string }, nombre: string, bytes: Buffer, notas: string): Promise<string> {
  const sha = createHash('sha256').update(bytes).digest('hex')
  const f = await db.$queryRaw<{ id: string }[]>`
    insert into seguros.documentos
      (correduria_id, cliente_id, poliza_id, tipo, estado, nombre_fichero, mime_type, size_bytes, sha256, contenido, notas, subido_por, visible_por_cliente)
    values (${t.correduria_id}::uuid, ${t.cliente_id}::uuid, null, 'otro', 'recibido', ${nombre}, 'image/png', ${bytes.length}::int, ${sha},
            ${bytes}, ${notas}, 'agente', false)
    returning id::text as id`
  return f[0].id
}

export async function registrarResultadoEmision(r: ResultadoEmisionWorker): Promise<RegistroEmision> {
  if (!(await hayEmision())) return { estado: 'conflicto', motivo: 'emision_sin_esquema' }
  return prisma.$transaction(async (tx) => {
    const ts = await tx.$queryRaw<{ id: string; correduria_id: string; cliente_id: string; estado: string; modo: string | null; compania: string; ramo: string; presupuesto_id: string; opcion_id: string; riesgo: unknown }[]>`
      select t.id::text as id, t.correduria_id::text as correduria_id, t.cliente_id::text as cliente_id, t.estado, t.modo,
             t.compania, t.ramo, t.presupuesto_id::text as presupuesto_id, t.opcion_id::text as opcion_id, t.riesgo
      from seguros.tarificacion_trabajos t where t.id = ${r.trabajoId}::uuid for update`
    const t = ts[0]
    if (!t) return { estado: 'no_encontrado' as const }
    if (t.modo !== 'emision' || t.estado !== 'en_curso') return { estado: 'conflicto' as const, motivo: `trabajo en estado ${t.estado}` }
    const aut = await tx.$queryRaw<{ id: string; consumido_at: Date | null }[]>`
      select id::text as id, consumido_at from seguros.tarificacion_emision_autorizacion where trabajo_id = ${t.id}::uuid for update`
    const a = aut[0] ?? null

    if (r.resultado === 'pre_emision') {
      if (a) return { estado: 'conflicto' as const, motivo: 'ya autorizado: la pantalla previa no se vuelve a pedir' }
      const evidencia = r.captura ? await guardarCaptura(tx, t, `emision-previa-${t.id.slice(0, 8)}.png`, r.captura, 'Pantalla PREVIA a emitir (robot del tarificador): no se pulsó nada') : null
      // Las precondiciones se re-comprueban AHORA (el presupuesto pudo retirarse o caducar mientras corría la máquina).
      const p = await leerPresupuesto(tx, t.correduria_id, t.presupuesto_id)
      const o = p ? await leerOpcion(tx, p.id, t.opcion_id) : null
      const pre = p && o ? precondicionesEmision(p, o, t.ramo, new Date()) : { ok: false as const, motivo: 'presupuesto u opción ya no están' }
      const boton = botonEmisionDe(t.compania, t.ramo)
      let mensaje: string | null = null
      if (!pre.ok) mensaje = `No se pide autorización: ${pre.motivo}`
      else if (!boton) mensaje = 'No se pide autorización: emisión no habilitada para esta compañía/ramo'
      else if (!primaCoincide(r.primaCents, pre.primaCents)) mensaje = mensajePrimaDistinta(r.primaCents, pre.primaCents)
      if (mensaje || !boton) {
        await tx.$executeRaw`
          update seguros.tarificacion_trabajos
          set estado = 'requiere_humano', error = ${JSON.stringify({ tipo: 'emision', mensaje, en: new Date().toISOString() })}::jsonb,
              lease_hasta = null, emision_prima_cents = ${r.primaCents}::int, emision_avisada_at = null,
              evidencia_documento_id = coalesce(${evidencia}::uuid, evidencia_documento_id), terminado_at = now(), updated_at = now()
          where id = ${t.id}::uuid`
        return { estado: 'registrado' as const, estadoTrabajo: 'requiere_humano' }
      }
      const hash = hashDe(t, r.primaCents, boton)
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'pendiente_autorizacion_emision', lease_hasta = null, error = null,
            emision_prima_cents = ${r.primaCents}::int, emision_hash_datos = ${hash}, emision_pedida_at = now(), emision_avisada_at = null,
            evidencia_documento_id = coalesce(${evidencia}::uuid, evidencia_documento_id), updated_at = now()
        where id = ${t.id}::uuid`
      return { estado: 'registrado' as const, estadoTrabajo: 'pendiente_autorizacion_emision' }
    }

    // Tras la fase de ejecutar. Sin autorización CONSUMIDA no hay clic posible: un `emitida` sin ella es imposible
    // (o una mentira) y se trata como incierto.
    const sinCanje = !a || !a.consumido_at
    const base = sinCanje && r.resultado === 'emitida' ? { ...r, resultado: 'incierto' as const, motivo: 'resultado emitida sin canje registrado' } : r
    const d = estadoTrasResultado(base)
    const evidencia = r.captura ? await guardarCaptura(tx, t, `emision-despues-${t.id.slice(0, 8)}.png`, r.captura, 'Pantalla tras pulsar emitir (robot del tarificador)') : null
    const numero = base.resultado === 'emitida' ? base.numeroPoliza : null
    if (a) {
      await tx.$executeRaw`
        update seguros.tarificacion_emision_autorizacion
        set resultado = coalesce(resultado, ${d.resultadoAutorizacion}), numero_poliza = ${numero},
            evidencia_posterior_id = ${evidencia}::uuid, consumido_at = coalesce(consumido_at, now())
        where id = ${a.id}::uuid`
    }
    const err = d.error ? JSON.stringify({ ...d.error, en: new Date().toISOString() }) : null
    await tx.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = ${d.estado}, error = ${err}::jsonb, lease_hasta = null, emision_numero_poliza = ${numero}, emision_avisada_at = null,
          evidencia_documento_id = coalesce(${evidencia}::uuid, evidencia_documento_id), terminado_at = now(), updated_at = now()
      where id = ${t.id}::uuid`
    return { estado: 'registrado' as const, estadoTrabajo: d.estado }
  })
}

// ─── 5. Autorizar (botón de Telegram, por plataforma) ────────────────────────

export type ResultadoAutorizar = { estado: 'autorizado' | 'cancelado' | 'sin_cambios'; trabajoId: string; compania: string } | Fallo

export async function autorizarEmision(e: { correduriaId: string; trabajoId: string; decision: 'ok' | 'no'; autorizadoPor: string }, env: Record<string, string | undefined> = process.env): Promise<ResultadoAutorizar> {
  // Rechazar no necesita el interruptor (cerrar siempre se puede); autorizar, sí.
  if (e.decision === 'ok') {
    const c = await cerrojos(env)
    if (c) return c
  } else if (!(await hayEmision())) return rechazo(503, 'emision_sin_esquema')
  const autorizador = autorizadorEmision(env)
  if (!autorizador || String(e.autorizadoPor).trim() !== autorizador) return rechazo(403, 'no autorizado')
  return prisma.$transaction(async (tx) => {
    const ts = await tx.$queryRaw<{ id: string; estado: string; modo: string; compania: string; ramo: string; presupuesto_id: string; opcion_id: string; emision_prima_cents: number | null; emision_hash_datos: string | null; emision_pedida_at: Date | null }[]>`
      select t.id::text as id, t.estado, t.modo, t.compania, t.ramo, t.presupuesto_id::text as presupuesto_id, t.opcion_id::text as opcion_id,
             t.emision_prima_cents, t.emision_hash_datos, t.emision_pedida_at
      from seguros.tarificacion_trabajos t
      where t.id = ${e.trabajoId}::uuid and t.correduria_id = ${e.correduriaId}::uuid for update`
    const t = ts[0]
    if (!t || t.modo !== 'emision') return rechazo(404, 'trabajo_de_emision_no_encontrado')
    if (e.decision === 'no') {
      if (t.estado === 'cancelado') return { estado: 'sin_cambios' as const, trabajoId: t.id, compania: t.compania }
      if (t.estado !== 'pendiente_autorizacion_emision') return rechazo(409, `el trabajo no espera autorización (${t.estado})`)
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos set estado = 'cancelado', terminado_at = now(), updated_at = now(),
          error = ${JSON.stringify({ tipo: 'emision', mensaje: 'Emisión rechazada por Telegram', en: new Date().toISOString() })}::jsonb
        where id = ${t.id}::uuid`
      return { estado: 'cancelado' as const, trabajoId: t.id, compania: t.compania }
    }
    if (t.estado === 'autorizado_emision') return { estado: 'sin_cambios' as const, trabajoId: t.id, compania: t.compania }
    const d = decidirAutorizacion({ autorizadoPor: e.autorizadoPor, autorizador, estado: t.estado, pedidaAt: t.emision_pedida_at, ahora: new Date() })
    if (!d.ok) return rechazo(409, d.motivo)
    const boton = botonEmisionDe(t.compania, t.ramo)
    if (!boton || !t.emision_hash_datos || !t.emision_prima_cents) return rechazo(409, 'trabajo sin datos de la pantalla previa')
    // El presupuesto pudo cambiar en estas horas: se re-comprueba antes de dar el permiso.
    const p = await leerPresupuesto(tx, e.correduriaId, t.presupuesto_id)
    const o = p ? await leerOpcion(tx, p.id, t.opcion_id) : null
    const pre = p && o ? precondicionesEmision(p, o, t.ramo, new Date()) : { ok: false as const, motivo: 'presupuesto u opción ya no están' }
    if (!pre.ok) return rechazo(409, pre.motivo)
    if (!primaCoincide(t.emision_prima_cents, pre.primaCents)) return rechazo(409, 'la prima aceptada cambió desde la pantalla previa')
    const n = await tx.$executeRaw`
      insert into seguros.tarificacion_emision_autorizacion
        (trabajo_id, correduria_id, hash_datos, prima_cents, boton, autorizado_por, autorizado_at, expira_at)
      values (${t.id}::uuid, ${e.correduriaId}::uuid, ${t.emision_hash_datos}, ${t.emision_prima_cents}::int, ${boton.id},
              ${autorizador}, now(), now() + ${VALIDEZ_TOKEN_MS / 1000}::int * interval '1 second')
      on conflict (trabajo_id) do nothing`
    if (n !== 1) return { estado: 'sin_cambios' as const, trabajoId: t.id, compania: t.compania }
    // La reanudación no es un reintento: intentos a 0 (el reclamo lo sube a 1).
    await tx.$executeRaw`
      update seguros.tarificacion_trabajos set estado = 'autorizado_emision', intentos = 0, updated_at = now()
      where id = ${t.id}::uuid and estado = 'pendiente_autorizacion_emision'`
    return { estado: 'autorizado' as const, trabajoId: t.id, compania: t.compania }
  })
}

// ─── 6. Avisos por Telegram (los manda plataforma) ───────────────────────────

export type AvisoEmision = {
  trabajoId: string
  tipo: 'pedir_autorizacion' | 'emitida' | 'requiere_humano'
  compania: string
  ramo: string
  iniciales: string
  referencia: string | null
  primaCents: number | null
  numeroPoliza: string | null
  mensaje: string | null
  caducaAt: string | null
  capturaBase64: string | null
}

/** Lo que falta por avisar: peticiones de botón (en plazo), emitidas y paradas. Sin NIF, sin dirección: iniciales. */
export async function avisosEmisionPendientes(correduriaId: string): Promise<AvisoEmision[] | null> {
  if (!(await hayEmision())) return null
  const filas = await prisma.$queryRaw<{ id: string; estado: string; compania: string; ramo: string; nombre: string | null; apellidos: string | null; referencia: string | null; prima: number | null; numero: string | null; error: { mensaje?: unknown } | null; pedida: Date | null; captura: Buffer | null }[]>`
    select t.id::text as id, t.estado, t.compania, t.ramo, c.nombre, c.apellidos, p.referencia, t.emision_prima_cents as prima,
           t.emision_numero_poliza as numero, t.error, t.emision_pedida_at as pedida,
           case when d.size_bytes <= 4194304 then d.contenido else null end as captura
    from seguros.tarificacion_trabajos t
    join seguros.clientes c on c.id = t.cliente_id and c.correduria_id = t.correduria_id
    left join seguros.presupuesto p on p.id = t.presupuesto_id and p.correduria_id = t.correduria_id
    left join seguros.documentos d on d.id = t.evidencia_documento_id and d.correduria_id = t.correduria_id
    where t.correduria_id = ${correduriaId}::uuid and t.modo = 'emision' and t.emision_avisada_at is null
      and (t.estado in ('emitido', 'requiere_humano')
           or (t.estado = 'pendiente_autorizacion_emision' and t.emision_pedida_at > now() - ${VALIDEZ_SOLICITUD_MS / 1000}::int * interval '1 second'))
    order by t.updated_at
    limit 20`
  return filas.map((f) => ({
    trabajoId: f.id,
    tipo: f.estado === 'emitido' ? 'emitida' : f.estado === 'requiere_humano' ? 'requiere_humano' : 'pedir_autorizacion',
    compania: f.compania,
    ramo: f.ramo,
    iniciales: iniciales(f.nombre, f.apellidos),
    referencia: f.referencia,
    primaCents: f.prima,
    numeroPoliza: f.numero,
    mensaje: typeof f.error?.mensaje === 'string' ? f.error.mensaje.slice(0, 400) : null,
    caducaAt: f.pedida ? new Date(f.pedida.getTime() + VALIDEZ_SOLICITUD_MS).toISOString() : null,
    // Solo la captura de la pantalla PREVIA viaja con la petición (la de después se mira en la ficha).
    capturaBase64: f.estado === 'pendiente_autorizacion_emision' && f.captura ? Buffer.from(f.captura).toString('base64') : null,
  }))
}

export async function marcarAvisosEmision(correduriaId: string, ids: string[]): Promise<number> {
  if (!ids.length || !(await hayEmision())) return 0
  return prisma.$executeRaw`
    update seguros.tarificacion_trabajos set emision_avisada_at = now()
    where correduria_id = ${correduriaId}::uuid and modo = 'emision' and id = any(${ids}::uuid[]) and emision_avisada_at is null`
}

// ─── 7. Barrido: caducidades ─────────────────────────────────────────────────

/** 24 h sin botón → cancelado. Una autorización que caducó sin máquina → cancelado (se pide otra). */
export async function caducarEmisiones(correduriaId: string): Promise<{ solicitudes: number; autorizaciones: number }> {
  if (!(await hayEmision())) return { solicitudes: 0, autorizaciones: 0 }
  const solicitudes = await prisma.$executeRaw`
    update seguros.tarificacion_trabajos
    set estado = 'cancelado', terminado_at = now(), updated_at = now(),
        error = jsonb_build_object('tipo', 'emision', 'mensaje', 'Solicitud de emisión caducada: 24 h sin autorizar')
    where correduria_id = ${correduriaId}::uuid and modo = 'emision' and estado = 'pendiente_autorizacion_emision'
      and emision_pedida_at <= now() - ${VALIDEZ_SOLICITUD_MS / 1000}::int * interval '1 second'`
  const autorizaciones = await prisma.$executeRaw`
    update seguros.tarificacion_trabajos t
    set estado = 'cancelado', terminado_at = now(), updated_at = now(),
        error = jsonb_build_object('tipo', 'emision', 'mensaje', 'Autorización caducada sin que arrancara la máquina: pide la emisión de nuevo')
    where t.correduria_id = ${correduriaId}::uuid and t.modo = 'emision' and t.estado = 'autorizado_emision'
      and exists (select 1 from seguros.tarificacion_emision_autorizacion a where a.trabajo_id = t.id and a.expira_at <= now())`
  return { solicitudes, autorizaciones }
}
