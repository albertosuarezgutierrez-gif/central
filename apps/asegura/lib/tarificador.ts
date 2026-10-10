// Tarificador RPA — orquestador con BD (05/10/2026). La cola es `seguros.tarificacion_trabajos`
// (sin Redis ni colas externas); el worker corre en una máquina EFÍMERA de Fly por trabajo.
//
// 🛡️ Todo filtrado por `correduria_id` en lo que entra por el puerto de operador. Las rutas del
//    worker solo conocen el id del trabajo (uuid) y solo mientras está `en_curso` con lease vivo.
// 🚨 TARIFICAR ≠ EMITIR. Nada de aquí habla con Codeoscopic ni emite. Los precios de portal se
//    guardan con `canal = 'rpa'`, sin `project_id_codeoscopic` ni libro de gasto: ningún camino de
//    Avant2 puede casarlos (CHECK `tarificacion_fuera_de_avant2`).

import { createHash } from 'node:crypto'
import {
  MAX_INTENTOS,
  claveCompania,
  estadoTrasError,
  estadoTrasErrorEmision,
  franquiciaGeneral,
  puedeAutomatizar,
  type OfertaNormalizada,
  type PasoTraza,
  type RiesgoComunidad,
  type TipoError,
} from '@central/module-tarificacion'
import { prisma } from './tenant'
import { hayBotVersion, hayPasos } from './esquema-bd'
import { caducarEmisiones } from './tarificador-emision'
import { MENSAJE_EMISION_INCIERTA, autorizacionSinResolver } from './tarificador-emision-reglas'
import { LEASE_MS, configFly, peticionMaquina, rpaActivo, type ConfigFly, type ResultadoWorker } from './tarificador-reglas'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type Db = Pick<Tx, '$queryRaw' | '$executeRaw'>

export type Integracion = { modo: string; maxConcurrencia: number; activo: boolean }

export async function leerIntegracion(correduriaId: string, compania: string, ramo: string): Promise<Integracion | null> {
  const filas = await prisma.$queryRaw<{ modo: string; max_concurrencia: number; activo: boolean }[]>`
    select modo, max_concurrencia, activo
    from seguros.companias_integracion
    where correduria_id = ${correduriaId}::uuid and compania = ${claveCompania(compania)} and ramo = ${ramo}`
  const f = filas[0]
  return f ? { modo: f.modo, maxConcurrencia: f.max_concurrencia, activo: f.activo } : null
}

// ─── Encolar ─────────────────────────────────────────────────────────────────

export type EntradaEncolar = {
  correduriaId: string
  oportunidadId: string | null
  clienteId: string | null
  polizaId: string | null
  compania: string
  ramo: 'comunidades'
  riesgo: RiesgoComunidad
  solicitadoPor: string
}

export type ResultadoEncolar =
  | { estado: 'encolado'; trabajoId: string }
  | { estado: 'rechazado'; status: number; motivo: string }

export async function encolarTrabajo(e: EntradaEncolar): Promise<ResultadoEncolar> {
  const integ = await leerIntegracion(e.correduriaId, e.compania, e.ramo)
  // Fail-closed: sin fila, inactiva o con un modo que no es rpa_autorizada, no se encola.
  if (!integ || !integ.activo || !puedeAutomatizar(integ.modo)) {
    return { estado: 'rechazado', status: 409, motivo: `modo_no_automatizable: ${integ ? (integ.activo ? integ.modo : 'inactiva') : 'sin_integracion'}` }
  }

  // Anclas: el cliente sale de la oportunidad (si viene) y TIENE que ser de esta correduría.
  let clienteId = e.clienteId
  let polizaId = e.polizaId
  if (e.oportunidadId) {
    const op = await prisma.$queryRaw<{ cliente_id: string | null; poliza_id: string | null }[]>`
      select cliente_id::text as cliente_id, poliza_id::text as poliza_id
      from seguros.oportunidades
      where id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid`
    if (!op[0]) return { estado: 'rechazado', status: 404, motivo: 'oportunidad_no_encontrada' }
    if (clienteId && op[0].cliente_id && clienteId !== op[0].cliente_id) {
      return { estado: 'rechazado', status: 400, motivo: 'cliente_no_es_el_de_la_oportunidad' }
    }
    clienteId = clienteId ?? op[0].cliente_id
    polizaId = polizaId ?? op[0].poliza_id
  }
  if (!clienteId) return { estado: 'rechazado', status: 400, motivo: 'falta_cliente (o una oportunidad con cliente)' }
  const cli = await prisma.$queryRaw<{ ok: number }[]>`
    select 1 as ok from seguros.clientes where id = ${clienteId}::uuid and correduria_id = ${e.correduriaId}::uuid`
  if (!cli[0]) return { estado: 'rechazado', status: 404, motivo: 'cliente_no_encontrado' }
  if (polizaId) {
    const pol = await prisma.$queryRaw<{ ok: number }[]>`
      select 1 as ok from seguros.polizas where id = ${polizaId}::uuid and correduria_id = ${e.correduriaId}::uuid`
    if (!pol[0]) return { estado: 'rechazado', status: 404, motivo: 'poliza_no_encontrada' }
  }

  const filas = await prisma.$queryRaw<{ id: string }[]>`
    insert into seguros.tarificacion_trabajos
      (correduria_id, oportunidad_id, cliente_id, poliza_id, compania, ramo, riesgo, solicitado_por)
    values (${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid,
            ${claveCompania(e.compania)}, ${e.ramo}, ${JSON.stringify(e.riesgo)}::jsonb, ${e.solicitadoPor})
    returning id::text as id`
  return { estado: 'encolado', trabajoId: filas[0].id }
}

// ─── Reclamar y lanzar ───────────────────────────────────────────────────────

type Reclamado = { id: string; intentos: number }

/**
 * Reclama el pendiente más antiguo de (correduría, compañía) si hay hueco bajo `max_concurrencia`
 * y la integración SIGUE autorizada. El cerrojo consultivo por compañía serializa a dos lanzadores
 * simultáneos (sin él, los dos verían 0 en curso y lanzarían 2 con la misma credencial).
 */
export async function reclamarSiguiente(correduriaId: string, compania: string): Promise<Reclamado | null> {
  const clave = claveCompania(compania)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'tarificador:' + correduriaId + ':' + clave}))`
    const cupo = await tx.$queryRaw<{ max: number | null }[]>`
      select min(max_concurrencia)::int as max
      from seguros.companias_integracion
      where correduria_id = ${correduriaId}::uuid and compania = ${clave} and activo and modo = 'rpa_autorizada'`
    const max = cupo[0]?.max ?? null
    if (max === null) return null
    const vivos = await tx.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from seguros.tarificacion_trabajos
      where correduria_id = ${correduriaId}::uuid and compania = ${clave} and estado = 'en_curso'`
    if ((vivos[0]?.n ?? 0) >= max) return null
    const leaseHasta = new Date(Date.now() + LEASE_MS)
    const filas = await tx.$queryRaw<Reclamado[]>`
      update seguros.tarificacion_trabajos t
      set estado = 'en_curso', intentos = t.intentos + 1, lease_hasta = ${leaseHasta},
          iniciado_at = now(), updated_at = now(), fly_machine_id = null
      where t.id = (
        select w.id from seguros.tarificacion_trabajos w
        join seguros.companias_integracion ci
          on ci.correduria_id = w.correduria_id and ci.compania = w.compania and ci.ramo = w.ramo
         and ci.activo and ci.modo = 'rpa_autorizada'
        where w.correduria_id = ${correduriaId}::uuid and w.compania = ${clave}
          -- autorizado_emision: Alberto pulsó «Emitir»; la máquina 2 reanuda (no es un reintento: intentos a 0).
          and w.estado in ('pendiente', 'autorizado_emision') and w.intentos < ${MAX_INTENTOS}
        order by w.created_at
        for update of w skip locked
        limit 1)
      returning t.id::text as id, t.intentos`
    return filas[0] ?? null
  })
}

export type DepsLanzador = {
  fetch: typeof fetch
  env: Record<string, string | undefined>
}

const depsReales = (): DepsLanzador => ({ fetch: globalThis.fetch, env: process.env })

export type ResumenLanzar = { lanzados: string[]; fallidos: { id: string; motivo: string }[]; omitido?: string }

/** Lanza tantos trabajos como quepan para (correduría, compañía). Uno por máquina. */
export async function lanzarPendientes(correduriaId: string, compania: string, deps: DepsLanzador = depsReales()): Promise<ResumenLanzar> {
  const r: ResumenLanzar = { lanzados: [], fallidos: [] }
  if (!rpaActivo(deps.env)) return { ...r, omitido: 'rpa_apagado' }
  const c = configFly(deps.env)
  if (!c.ok) return { ...r, omitido: `fly_sin_configurar: ${c.faltan.join(', ')}` }
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const t = await reclamarSiguiente(correduriaId, compania)
    if (!t) break
    const res = await crearMaquina(c.cfg, t.id, deps.fetch)
    if (res.ok) {
      await prisma.$executeRaw`
        update seguros.tarificacion_trabajos set fly_machine_id = ${res.machineId}, updated_at = now()
        where id = ${t.id}::uuid and estado = 'en_curso'`
      r.lanzados.push(t.id)
    } else {
      await marcarFallo(prisma, t.id, t.intentos, { tipo: 'infra', mensaje: `fly: ${res.motivo}`, url: null }, null)
      r.fallidos.push({ id: t.id, motivo: res.motivo })
    }
  }
  return r
}

async function crearMaquina(cfg: ConfigFly, jobId: string, f: typeof fetch): Promise<{ ok: true; machineId: string } | { ok: false; motivo: string }> {
  try {
    const p = peticionMaquina(cfg, jobId)
    const res = await f(p.url, { ...p.init, signal: AbortSignal.timeout(20_000) })
    const texto = await res.text()
    if (!res.ok) return { ok: false, motivo: `HTTP ${res.status}: ${texto.slice(0, 300)}` }
    const id = (JSON.parse(texto) as { id?: unknown }).id
    return typeof id === 'string' && id ? { ok: true, machineId: id } : { ok: false, motivo: 'respuesta sin id de máquina' }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Mejor esfuerzo: una máquina colgada se destruye (auto_destroy la quita sola si el proceso sale). */
async function destruirMaquina(cfg: ConfigFly, machineId: string, f: typeof fetch): Promise<void> {
  try {
    await f(`https://api.machines.dev/v1/apps/${encodeURIComponent(cfg.app)}/machines/${encodeURIComponent(machineId)}?force=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    console.error('[tarificador] no se pudo destruir la máquina', machineId, e instanceof Error ? e.message : e)
  }
}

// ─── Lo que ve el worker ─────────────────────────────────────────────────────

export type TrabajoParaWorker = { id: string; compania: string; ramo: string; riesgo: unknown; leaseHasta: string; modo: 'tarificar' | 'emision' }

/**
 * Solo un trabajo `en_curso` con lease vivo. Ni cliente, ni póliza, ni correduría: solo el riesgo. `modo` por to_jsonb
 * (sin el SQL de emisión la columna no existe: null = tarificar). Lo de la emisión lo añade la ruta (`emisionParaWorker`).
 */
export async function trabajoParaWorker(id: string): Promise<TrabajoParaWorker | null> {
  const filas = await prisma.$queryRaw<{ id: string; compania: string; ramo: string; riesgo: unknown; lease_hasta: Date; modo: string | null }[]>`
    select t.id::text as id, t.compania, t.ramo, t.riesgo, t.lease_hasta, to_jsonb(t)->>'modo' as modo
    from seguros.tarificacion_trabajos t
    where t.id = ${id}::uuid and t.estado = 'en_curso' and t.lease_hasta > now()`
  const f = filas[0]
  return f ? { id: f.id, compania: f.compania, ramo: f.ramo, riesgo: f.riesgo, leaseHasta: f.lease_hasta.toISOString(), modo: f.modo === 'emision' ? 'emision' : 'tarificar' } : null
}

// ─── Resultado ───────────────────────────────────────────────────────────────

type FilaTrabajo = {
  id: string
  correduria_id: string
  cliente_id: string
  poliza_id: string | null
  oportunidad_id: string | null
  compania: string
  ramo: string
  riesgo: RiesgoComunidad
  estado: string
  intentos: number
  solicitado_por: string
}

export type ResultadoRegistro =
  | { estado: 'registrado'; estadoTrabajo: string; tarificacionId?: string }
  | { estado: 'conflicto'; motivo: string }
  | { estado: 'no_encontrado' }

export async function registrarResultado(r: ResultadoWorker): Promise<ResultadoRegistro> {
  // La TRAZA va FUERA de la transacción del resultado: el resultado del trabajo jamás depende de ella.
  // Esquema opcional (SQL de 08/10/2026 puede no estar aplicado): se omite `bot_version` / la traza si no existen.
  const conBot = await hayBotVersion()
  type Interno = { res: ResultadoRegistro; traza: { t: FilaTrabajo; captura: 'con_captura' | null } | null }
  const interno: Interno = await prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<(FilaTrabajo & { modo: string | null })[]>`
      select w.id::text as id, w.correduria_id::text as correduria_id, w.cliente_id::text as cliente_id,
             w.poliza_id::text as poliza_id, w.oportunidad_id::text as oportunidad_id, w.compania, w.ramo, w.riesgo,
             w.estado, w.intentos, w.solicitado_por, to_jsonb(w)->>'modo' as modo
      from seguros.tarificacion_trabajos w where w.id = ${r.trabajoId}::uuid for update`
    const t = filas[0]
    if (!t) return { res: { estado: 'no_encontrado' as const }, traza: null }
    // Un trabajo de EMISIÓN no devuelve ofertas por aquí: su resultado va por /api/tarificador/emision/resultado.
    if (t.modo === 'emision' && r.tipo !== 'error') return { res: { estado: 'conflicto' as const, motivo: 'trabajo de emisión: usa /api/tarificador/emision/resultado' }, traza: null }
    // Un resultado tardío (el barrido ya dio el lease por vencido) NO pisa lo decidido.
    if (t.estado !== 'en_curso') return { res: { estado: 'conflicto' as const, motivo: `trabajo en estado ${t.estado}` }, traza: null }

    if (r.tipo === 'error') {
      const estado = await marcarFallo(tx, t.id, t.intentos, r.error, { trabajo: t, captura: r.captura, html: r.html }, conBot ? r.botVersion : null, conBot)
      return { res: { estado: 'registrado' as const, estadoTrabajo: estado }, traza: { t, captura: r.captura ? 'con_captura' as const : null } }
    }

    const docs: string[] = []
    for (const p of r.pdfs) {
      docs.push(await guardarAdjunto(tx, t, { nombre: p.nombre, mime: 'application/pdf', contenido: p.contenido, notas: `Oferta de ${t.compania} (${t.ramo}) obtenida por el tarificador RPA` }))
    }
    const tarificacionId = await guardarTarificacionRpa(tx, t, r.ofertas, docs)
    if (conBot) {
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'ok', tarificacion_id = ${tarificacionId}::uuid, evidencia_documento_id = ${docs[0] ?? null}::uuid,
            lease_hasta = null, error = null, terminado_at = now(), updated_at = now(),
            bot_version = coalesce(${r.botVersion}, bot_version)
        where id = ${t.id}::uuid`
    } else {
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'ok', tarificacion_id = ${tarificacionId}::uuid, evidencia_documento_id = ${docs[0] ?? null}::uuid,
            lease_hasta = null, error = null, terminado_at = now(), updated_at = now()
        where id = ${t.id}::uuid`
    }
    return { res: { estado: 'registrado' as const, estadoTrabajo: 'ok', tarificacionId }, traza: { t, captura: null } }
  })
  if (interno.traza && (await hayPasos())) {
    try {
      await guardarPasos(prisma, interno.traza.t, r.pasos, interno.traza.captura)
    } catch (e) {
      // Sin datos personales: solo el id del trabajo y el mensaje del error.
      console.warn('[tarificador] no se pudo guardar la traza del trabajo', interno.traza.t.id, e instanceof Error ? e.message : String(e))
    }
  }
  return interno.res
}

async function guardarTarificacionRpa(tx: Db, t: FilaTrabajo, ofertas: OfertaNormalizada[], docs: string[]): Promise<string> {
  const rg = t.riesgo
  const conDocs = ofertas.map((o) => ({ ...o, documentoId: o.pdf ? (docs[o.pdf.indice] ?? null) : null }))
  // ADITIVO (07/10/2026): el PDF del proyecto de la compañía (`seguros.documentos`), sin columna nueva: va en el
  // jsonb `respuesta`. `null` = el worker no lo obtuvo (el motivo va en los `avisos` de la oferta).
  const proyectoDocumentoId = conDocs.find((o) => o.documentoId)?.documentoId ?? null
  const respuesta = { canal: 'rpa', compania: t.compania, ofertas: conDocs, proyectoDocumentoId }
  const filas = await tx.$queryRaw<{ id: string }[]>`
    insert into seguros.tarificaciones (
      correduria_id, intento_id, simulado, project_id_codeoscopic, canal,
      ramo, puerta, poliza_id, cliente_id, oportunidad_id, fecha_efecto, peticion,
      codigo_postal, metros_cuadrados, anio_construccion, capital_continente, capital_contenido,
      solicitado_por, respuesta, fallos
    ) values (
      ${t.correduria_id}::uuid, null, false, null, 'rpa',
      ${t.ramo}, 'corredor', ${t.poliza_id}::uuid, ${t.cliente_id}::uuid, ${t.oportunidad_id}::uuid,
      ${rg.fechaEfecto ?? null}::date, ${JSON.stringify(rg)}::jsonb,
      ${rg.direccion?.codigoPostal ?? null}, ${rg.m2Construidos ?? null}::int, ${rg.anioConstruccion ?? null}::int,
      ${rg.capitalContinente ?? null}::numeric, ${rg.capitalContenido ?? null}::numeric,
      ${t.solicitado_por}, ${JSON.stringify(respuesta)}::jsonb, '[]'::jsonb
    ) returning id::text as id`
  const id = filas[0]?.id
  if (!id) throw new Error('tarificacion_rpa_sin_id')
  for (const o of ofertas) {
    // `frecuencia_pago` NO se escribe: es vocabulario de Avant2 (`paymentFrequency`); el fraccionamiento
    // del portal viaja en `respuesta.ofertas[]`. Mezclar vocabularios en una columna es inventar dato.
    // Un precio de portal es una OFERTA de la compañía, no un precio cerrado: `estimado` hasta que el
    // corredor lo revise (y nunca ReRate: no hay proyecto de Avant2 que re-tarificar).
    await tx.$executeRaw`
      insert into seguros.tarificacion_precios (
        tarificacion_id, compania, producto, modalidad, categoria, prima_eur, franquicia_eur,
        firmeza, requiere_rerate, referencia_vendor, avisos
      ) values (
        ${id}::uuid, ${o.compania}, ${o.producto}, null, null, ${o.primaAnualEur}::numeric, ${franquiciaGeneral(o)}::numeric,
        'estimado', false, ${o.referenciaPortal}, ${JSON.stringify(o.avisos)}::jsonb
      )`
  }
  return id
}

async function guardarAdjunto(
  tx: Db,
  t: Pick<FilaTrabajo, 'correduria_id' | 'cliente_id' | 'poliza_id'>,
  a: { nombre: string; mime: string; contenido: Buffer; notas: string },
): Promise<string> {
  const sha = createHash('sha256').update(a.contenido).digest('hex')
  const filas = await tx.$queryRaw<{ id: string }[]>`
    insert into seguros.documentos
      (correduria_id, cliente_id, poliza_id, tipo, estado, nombre_fichero, mime_type, size_bytes, sha256,
       contenido, notas, subido_por, visible_por_cliente)
    values (${t.correduria_id}::uuid, ${t.cliente_id}::uuid, ${t.poliza_id}::uuid, 'otro', 'recibido',
            ${a.nombre}, ${a.mime}, ${a.contenido.length}::int, ${sha}, ${a.contenido}, ${a.notas}, 'agente', false)
    returning id::text as id`
  return filas[0].id
}

/**
 * Traza (08/10/2026): una fila por paso en `tarificacion_trabajo_pasos`. Los pasos ya vienen validados (solo cinco
 * claves, nombres de una lista cerrada). Si el trabajo falló con captura, el ÚLTIMO paso fallido apunta a ella
 * (`documento:<uuid>` = `evidencia_documento_id`); sin mecanismo de captura → `captura_ref` NULL. Las filas son
 * inmutables y el POST del resultado es idempotente (el segundo llega con el trabajo ya fuera de `en_curso` → 409).
 */
async function guardarPasos(tx: Db, t: Pick<FilaTrabajo, 'id' | 'correduria_id' | 'intentos'>, pasos: PasoTraza[], captura: 'con_captura' | null): Promise<void> {
  if (!pasos.length) return
  let ultimoFallido = -1
  pasos.forEach((p, i) => { if (!p.ok) ultimoFallido = i })
  let capturaRef: string | null = null
  if (captura && ultimoFallido >= 0) {
    const f = await tx.$queryRaw<{ id: string | null }[]>`select evidencia_documento_id::text as id from seguros.tarificacion_trabajos where id = ${t.id}::uuid`
    capturaRef = f[0]?.id ? `documento:${f[0].id}` : null
  }
  for (let i = 0; i < pasos.length; i++) {
    const p = pasos[i]
    await tx.$executeRaw`
      insert into seguros.tarificacion_trabajo_pasos (trabajo_id, correduria_id, intento, paso, inicio, duracion_ms, ok, error_codigo, captura_ref)
      values (${t.id}::uuid, ${t.correduria_id}::uuid, ${t.intentos}::int, ${p.paso}, ${p.inicio}::timestamptz, ${p.duracionMs}::int, ${p.ok}, ${p.errorCodigo},
              ${i === ultimoFallido ? capturaRef : null})`
  }
}

/** Marca el fallo de un trabajo `en_curso` según la política (1 reintento, solo infra). */
async function marcarFallo(
  db: Db,
  id: string,
  intentos: number,
  error: { tipo: TipoError; mensaje: string; url: string | null },
  evidencia: { trabajo: FilaTrabajo; captura: Buffer | null; html: string | null } | null,
  botVersion: string | null = null,
  conBotVersion = false,
): Promise<string> {
  // EMISIÓN (10/10/2026): nunca se reintenta sola (tras el clic, el estado en la compañía es incierto) → requiere_humano,
  // con tipo `emision` (la bandeja no la deja reintentar) y el aviso a Alberto rearmado.
  const modoFila = await db.$queryRaw<{ modo: string | null }[]>`select to_jsonb(t)->>'modo' as modo from seguros.tarificacion_trabajos t where t.id = ${id}::uuid`
  const deEmision = modoFila[0]?.modo === 'emision'
  // Si el token YA se canjeó (autorización consumida sin desenlace), el clic pudo salir: INCIERTO, y la autorización queda
  // marcada `incierto` (bloquea pedir otra emisión del presupuesto hasta que una persona lo resuelva mirando ePAC).
  let incierta = false
  if (deEmision) {
    const aut = await db.$queryRaw<{ id: string; consumido_at: Date | null; resultado: string | null }[]>`
      select a.id::text as id, a.consumido_at, a.resultado from seguros.tarificacion_emision_autorizacion a where a.trabajo_id = ${id}::uuid`
    const a = aut[0]
    incierta = autorizacionSinResolver(a ? { consumidoAt: a.consumido_at, resultado: a.resultado } : null)
    if (incierta) await db.$executeRaw`update seguros.tarificacion_emision_autorizacion set resultado = 'incierto' where id = ${a!.id}::uuid and resultado is null`
    const prefijo = incierta ? `${MENSAJE_EMISION_INCIERTA} Detalle: ` : ''
    error = { ...error, tipo: 'emision', mensaje: `${prefijo}[emisión, ${error.tipo}] ${error.mensaje}`.slice(0, 2000) }
  }
  const estado = deEmision ? estadoTrasErrorEmision() : estadoTrasError(error.tipo, intentos)
  let capturaId: string | null = null
  let htmlId: string | null = null
  if (evidencia?.captura) {
    capturaId = await guardarAdjunto(db, evidencia.trabajo, { nombre: `fallo-${id.slice(0, 8)}.png`, mime: 'image/png', contenido: evidencia.captura, notas: `Captura del fallo del tarificador RPA (${error.tipo})` })
  }
  if (evidencia?.html) {
    htmlId = await guardarAdjunto(db, evidencia.trabajo, { nombre: `fallo-${id.slice(0, 8)}.html`, mime: 'text/html', contenido: Buffer.from(evidencia.html, 'utf8'), notas: `HTML (redactado) del fallo del tarificador RPA (${error.tipo})` })
  }
  const err = JSON.stringify({ ...error, html_documento_id: htmlId, en: new Date().toISOString() })
  if (conBotVersion) {
    await db.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = ${estado}, error = ${err}::jsonb, lease_hasta = null,
          evidencia_documento_id = coalesce(${capturaId}::uuid, evidencia_documento_id),
          bot_version = coalesce(${botVersion}, bot_version),
          terminado_at = case when ${estado} = 'error_reintentable' then null else now() end, updated_at = now()
      where id = ${id}::uuid and estado = 'en_curso'`
  } else {
    await db.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = ${estado}, error = ${err}::jsonb, lease_hasta = null,
          evidencia_documento_id = coalesce(${capturaId}::uuid, evidencia_documento_id),
          terminado_at = case when ${estado} = 'error_reintentable' then null else now() end, updated_at = now()
      where id = ${id}::uuid and estado = 'en_curso'`
  }
  if (deEmision) await db.$executeRaw`update seguros.tarificacion_trabajos set emision_avisada_at = null where id = ${id}::uuid and estado = 'requiere_humano'`
  return estado
}

// ─── Barrido (enganchable a un cron existente) ───────────────────────────────

export type ResumenBarrido = {
  omitido?: string
  emisionesCaducadas?: { solicitudes: number; autorizaciones: number }
  leasesVencidos: number
  reencolados: number
  cancelados: number
  lanzar: Record<string, ResumenLanzar>
}

/**
 * Barrido de la cola. NO tiene cron propio (no se añade a vercel.json): se llama desde uno de los
 * crons existentes de asegura cuando se encienda el canal. Hace, en orden:
 *   1. lease vencido (`en_curso` y `lease_hasta` pasado) → fallo de infra (reintentable una vez) y
 *      destruye la máquina si sigue viva;
 *   2. `error_reintentable` bajo el tope → `pendiente`;
 *   3. `pendiente` de una integración que YA no es rpa_autorizada/activa → `cancelado`;
 *   4. lanza lo que quepa por compañía.
 */
export async function barrerTarificadorRpa(correduriaId: string, deps: DepsLanzador = depsReales()): Promise<ResumenBarrido> {
  const r: ResumenBarrido = { leasesVencidos: 0, reencolados: 0, cancelados: 0, lanzar: {} }
  if (!rpaActivo(deps.env)) return { ...r, omitido: 'rpa_apagado' }

  const vencidos = await prisma.$queryRaw<{ id: string; intentos: number; fly_machine_id: string | null }[]>`
    select id::text as id, intentos, fly_machine_id from seguros.tarificacion_trabajos
    where correduria_id = ${correduriaId}::uuid and estado = 'en_curso' and lease_hasta < now()`
  const fly = configFly(deps.env)
  for (const v of vencidos) {
    await marcarFallo(prisma, v.id, v.intentos, { tipo: 'infra', mensaje: 'lease_vencido: el worker no devolvió resultado a tiempo', url: null }, null)
    if (fly.ok && v.fly_machine_id) await destruirMaquina(fly.cfg, v.fly_machine_id, deps.fetch)
    r.leasesVencidos++
  }

  // Emisión: 24 h sin botón, o autorización caducada sin máquina → cancelado (nunca se emite tarde).
  r.emisionesCaducadas = await caducarEmisiones(correduriaId).catch((e: unknown) => {
    console.error('[tarificador] caducar emisiones', e instanceof Error ? e.message.slice(0, 200) : e)
    return { solicitudes: 0, autorizaciones: 0 }
  })

  r.reencolados = await prisma.$executeRaw`
    update seguros.tarificacion_trabajos set estado = 'pendiente', updated_at = now()
    where correduria_id = ${correduriaId}::uuid and estado = 'error_reintentable' and intentos < ${MAX_INTENTOS}`

  r.cancelados = await prisma.$executeRaw`
    update seguros.tarificacion_trabajos w
    set estado = 'cancelado', terminado_at = now(), updated_at = now(),
        error = jsonb_build_object('tipo', 'datos', 'mensaje', 'modo_no_automatizable: la integración ya no está autorizada o activa')
    where w.correduria_id = ${correduriaId}::uuid and w.estado = 'pendiente'
      and not exists (
        select 1 from seguros.companias_integracion ci
        where ci.correduria_id = w.correduria_id and ci.compania = w.compania and ci.ramo = w.ramo
          and ci.activo and ci.modo = 'rpa_autorizada')`

  const companias = await prisma.$queryRaw<{ compania: string }[]>`
    select distinct compania from seguros.tarificacion_trabajos
    where correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`
  for (const c of companias) r.lanzar[c.compania] = await lanzarPendientes(correduriaId, c.compania, deps)
  return r
}
