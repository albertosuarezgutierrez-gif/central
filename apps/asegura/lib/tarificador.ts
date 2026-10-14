// Tarificador RPA — orquestador con BD (05/10/2026). La cola es `seguros.tarificacion_trabajos`
// (sin Redis ni colas externas); el worker corre en una máquina EFÍMERA de Fly por trabajo.
//
// 🛡️ Todo filtrado por `correduria_id` en lo que entra por el puerto de operador. Las rutas del
//    worker solo conocen el id del trabajo (uuid) y solo mientras está `en_curso` con lease vivo.
// 🚨 TARIFICAR ≠ EMITIR. Nada de aquí habla con Codeoscopic ni emite. Los precios de portal se
//    guardan con `canal = 'rpa'`, sin `project_id_codeoscopic` ni libro de gasto: ningún camino de
//    Avant2 puede casarlos (CHECK `tarificacion_fuera_de_avant2`).

import { cierraCabeceraTrasFallo, estadoFalloExploracion, exploradoValido, modoParaWorker, modosReclamables } from './tarificador-explorador-reglas'
import { createHash } from 'node:crypto'
import {
  MAX_INTENTOS,
  claveCompania,
  estadoTrasError,
  estadoTrasErrorEmision,
  franquiciaGeneral,
  puedeAutomatizar,
  riesgoSinDatosPersonales,
  type OfertaNormalizada,
  type PasoTraza,
  type FormularioAuto,
  type RiesgoComunidad,
  type TipoError,
} from '@central/module-tarificacion'
import { decryptField } from '@central/module-seguros-pii'
import { prisma } from './tenant'
import { hayBotVersion, hayPasos } from './esquema-bd'
import { caducarEmisiones } from './tarificador-emision'
import { MENSAJE_EMISION_INCIERTA, autorizacionSinResolver } from './tarificador-emision-reglas'
import { memoriaTrasExito } from './tarificador-eleccion-reglas'
import { guardarMemoriaVersion } from './tarificador-memoria'
import { purgarRiesgoTrabajos, purgarRiesgosCerrados } from './tarificador-purga'
import {
  ESTADOS_DUPLICADO,
  LEASE_MS,
  bloqueaDuplicado,
  claveEncolar,
  configFly,
  huecosLibres,
  peticionMaquina,
  repartirEnCurso,
  aplicarNifTomador,
  lecturaNifFicha,
  necesitaNifTomador,
  riesgoParaEncolar,
  riesgoSinNifTomador,
  tipoFalloNifTomador,
  rpaActivo,
  type ConfigFly,
  type ResultadoWorker,
} from './tarificador-reglas'

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
  /** Comunidades (RiesgoComunidad) o, desde el 13/10/2026, Moto y (14/10/2026) Auto (FormularioAuto ya validado). El ramo discrimina el riesgo. */
  ramo: 'comunidades' | 'moto' | 'auto'
  riesgo: RiesgoComunidad | FormularioAuto
  solicitadoPor: string
}

export type ResultadoEncolar =
  /** `duplicado: true` = ya había un trabajo vivo con el mismo riesgo y se devuelve ESE (no se crea otro). */
  | { estado: 'encolado'; trabajoId: string; duplicado: boolean }
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

  // NIF del tomador para Mapfre (14/10/2026): lo pone ASEGURA desde la ficha, pero NO aquí. Al encolar solo se COMPRUEBA
  // que la ficha (de ESTA correduría) lo tiene legible y válido; sin NIF / ilegible / no válido → rechazo SIN encolar. Lo
  // que se guarda es el riesgo SIN documento (el NIF en claro no se persiste): se descifra e inyecta al ENTREGAR el trabajo
  // al worker (`trabajoParaWorker`). El documento no sale en ningún motivo ni en la respuesta.
  const dniFicha = necesitaNifTomador(e.compania, e.ramo, riesgoSinNifTomador(e.riesgo)) ? await leerDniFicha(e.correduriaId, clienteId) : null
  const guardar = riesgoParaEncolar(e.compania, e.ramo, e.riesgo, () => lecturaNifFicha(dniFicha, decryptField))
  if (!guardar.ok) return { estado: 'rechazado', status: guardar.status, motivo: guardar.motivo }

  // Sin duplicados (13/10/2026): mismo cliente + compañía + ramo + riesgo (igualdad `jsonb`) con un trabajo aún vivo →
  // se devuelve ESE. Cerrojo consultivo por clave y no índice único parcial: «en_curso con lease vivo» depende de now()
  // (no cabe en el predicado de un índice) y el riesgo es un jsonb grande; el cerrojo serializa a dos que encolan lo mismo.
  const compania = claveCompania(e.compania)
  const riesgoJson = JSON.stringify(guardar.riesgo)
  const cid = clienteId
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${claveEncolar({ correduriaId: e.correduriaId, clienteId: cid, compania, ramo: e.ramo })}))`
    const previos = await tx.$queryRaw<{ id: string; estado: string; lease_hasta: Date | null; intentos: number; modo: string | null; ahora: Date }[]>`
      select t.id::text as id, t.estado, t.lease_hasta, t.intentos, to_jsonb(t)->>'modo' as modo, now() as ahora
      from seguros.tarificacion_trabajos t
      where t.correduria_id = ${e.correduriaId}::uuid and t.cliente_id = ${cid}::uuid
        and t.compania = ${compania} and t.ramo = ${e.ramo}
        and t.estado = any(${[...ESTADOS_DUPLICADO]}::text[])
        and t.riesgo = ${riesgoJson}::jsonb
        and t.oportunidad_id is not distinct from ${e.oportunidadId ?? null}::uuid
        and t.poliza_id is not distinct from ${polizaId ?? null}::uuid
        and coalesce(to_jsonb(t)->>'modo', 'tarificar') <> 'exploracion'
      order by t.created_at`
    const vivo = previos.find((p) => bloqueaDuplicado({ estado: p.estado, leaseHasta: p.lease_hasta, intentos: p.intentos, modo: p.modo }, p.ahora, MAX_INTENTOS))
    if (vivo) return { estado: 'encolado' as const, trabajoId: vivo.id, duplicado: true }
    const filas = await tx.$queryRaw<{ id: string }[]>`
      insert into seguros.tarificacion_trabajos
        (correduria_id, oportunidad_id, cliente_id, poliza_id, compania, ramo, riesgo, solicitado_por)
      values (${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, ${cid}::uuid, ${polizaId}::uuid,
              ${compania}, ${e.ramo}, ${riesgoJson}::jsonb, ${e.solicitadoPor})
      returning id::text as id`
    return { estado: 'encolado' as const, trabajoId: filas[0].id, duplicado: false }
  }, { timeout: 15000, maxWait: 10000 })
}

/** DNI de la ficha TAL CUAL está en BD (cifrado `v1:` o legado), de ESTA correduría. Lo descifra `lecturaNifFicha`. */
async function leerDniFicha(correduriaId: string, clienteId: string): Promise<string | null> {
  const filas = await prisma.$queryRaw<{ dni: string | null }[]>`
    select dni from seguros.clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
  return filas[0]?.dni ?? null
}

// ─── Reclamar y lanzar ───────────────────────────────────────────────────────

type Reclamado = { id: string; intentos: number }

/**
 * Reclama el pendiente más antiguo de (correduría, compañía) si hay hueco bajo `max_concurrencia`
 * y la integración SIGUE autorizada. El cerrojo consultivo por compañía serializa a dos lanzadores
 * simultáneos (sin él, los dos verían 0 en curso y lanzarían 2 con la misma credencial).
 */
export type ReclamoCola = {
  trabajo: Reclamado | null
  /** Máquinas de Fly de los trabajos cuyo lease venció (se dieron por fallo): el llamante las destruye, fuera de la transacción. */
  maquinasVencidas: string[]
}

/**
 * 13/10/2026 (defecto 1): un `en_curso` con lease VENCIDO ya no ocupa hueco. Dentro del mismo cerrojo pasa a fallo de
 * infra con `marcarFallo` (la política de siempre: `error_reintentable` si quedan intentos, si no `error_definitivo`;
 * uno de emisión → `requiere_humano`), así un trabajo colgado no bloquea la cola hasta el siguiente barrido.
 */
export async function reclamarSiguiente(correduriaId: string, compania: string, modos: readonly string[] = ['tarificar', 'emision']): Promise<ReclamoCola> {
  const clave = claveCompania(compania)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'tarificador:' + correduriaId + ':' + clave}))`
    const cupo = await tx.$queryRaw<{ max: number | null }[]>`
      select min(max_concurrencia)::int as max
      from seguros.companias_integracion
      where correduria_id = ${correduriaId}::uuid and compania = ${clave} and activo and modo = 'rpa_autorizada'`
    const max = cupo[0]?.max ?? null
    if (max === null) return { trabajo: null, maquinasVencidas: [] }
    // La hora es la de la BD (la misma que compara `trabajoParaWorker`), no la del servidor de Vercel.
    const enCurso = await tx.$queryRaw<{ id: string; intentos: number; lease_hasta: Date | null; fly_machine_id: string | null; ahora: Date }[]>`
      select id::text as id, intentos, lease_hasta, fly_machine_id, now() as ahora from seguros.tarificacion_trabajos
      where correduria_id = ${correduriaId}::uuid and compania = ${clave} and estado = 'en_curso'`
    const ahora = enCurso[0]?.ahora ?? new Date()
    const { vivos, vencidos } = repartirEnCurso(enCurso.map((f) => ({ ...f, leaseHasta: f.lease_hasta })), ahora)
    const maquinasVencidas: string[] = []
    for (const v of vencidos) {
      // `marcarFallo` solo toca la fila si SIGUE `en_curso` (un resultado que llegó a la vez gana y esto no hace nada).
      const f = await marcarFallo(tx, v.id, v.intentos, { tipo: 'infra', mensaje: 'lease_vencido: el worker no devolvió resultado a tiempo', url: null }, null)
      if (f.tocada && v.fly_machine_id) maquinasVencidas.push(v.fly_machine_id)
    }
    if (huecosLibres(max, vivos.length) <= 0) return { trabajo: null, maquinasVencidas }
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
          -- Solo los modos que se pueden lanzar ahora (13/10/2026): 'exploracion' únicamente con su interruptor
          -- (modosReclamables); una exploración no ocupa máquina ni hueco mientras esté apagado.
          and coalesce(to_jsonb(w)->>'modo', 'tarificar') = any(${[...modos]}::text[])
        order by w.created_at
        for update of w skip locked
        limit 1)
      returning t.id::text as id, t.intentos`
    return { trabajo: filas[0] ?? null, maquinasVencidas }
  }, { timeout: 15000, maxWait: 10000 })
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
    const { trabajo: t, maquinasVencidas } = await reclamarSiguiente(correduriaId, compania, modosReclamables(deps.env))
    // Una máquina de lease vencido puede seguir viva con la credencial: se destruye ANTES de lanzar otra.
    for (const m of maquinasVencidas) await destruirMaquina(c.cfg, m, deps.fetch)
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

export type TrabajoParaWorker = {
  id: string; compania: string; ramo: string; riesgo: unknown; leaseHasta: string; modo: 'tarificar' | 'emision' | 'exploracion'
  /** Solo en `modo = 'exploracion'`: la entrada cerrada y si va ligada a una petición real (la verdad: `cliente_id`). */
  exploracion?: { entrada: string; conDatosReales: boolean }
}

/**
 * Solo un trabajo `en_curso` con lease vivo. Ni cliente, ni póliza, ni correduría: solo el riesgo. `modo` por to_jsonb
 * (sin el SQL de emisión la columna no existe: null = tarificar). Lo de la emisión lo añade la ruta (`emisionParaWorker`).
 * `modosWorker`: lo que la imagen declara saber hacer (cabecera `X-Tarificador-Modos`); una exploración solo se sirve a
 * quien la declara, y con su entrada (sin cabecera de exploración legible → no se sirve).
 */
export async function trabajoParaWorker(id: string, modosWorker: readonly string[] = ['tarificar', 'emision']): Promise<TrabajoParaWorker | null> {
  const filas = await prisma.$queryRaw<{ id: string; correduria_id: string; cliente_id: string | null; intentos: number; compania: string; ramo: string; riesgo: unknown; lease_hasta: Date; modo: string | null; con_cliente: boolean }[]>`
    select t.id::text as id, t.correduria_id::text as correduria_id, t.cliente_id::text as cliente_id, t.intentos,
           t.compania, t.ramo, t.riesgo, t.lease_hasta, to_jsonb(t)->>'modo' as modo, (t.cliente_id is not null) as con_cliente
    from seguros.tarificacion_trabajos t
    where t.id = ${id}::uuid and t.estado = 'en_curso' and t.lease_hasta > now()`
  const f = filas[0]
  // Un modo que el worker no sabe ejecutar NO se sirve: una imagen anterior a la fase B trataría todo lo que no es
  // `emision` como `tarificar` (`modoParaWorker`, fail-closed).
  const modo = f ? modoParaWorker(f.modo, modosWorker) : null
  if (!f || !modo) return null
  let riesgo = f.riesgo
  // NIF del tomador (Mapfre auto/moto, 14/10/2026): se descifra AQUÍ, solo para la respuesta (canal del worker, con su
  // Bearer); nunca se escribe en BD. Si la ficha ya no lo permite (borrado, ilegible, no válido) el trabajo FALLA con el
  // motivo (sin documento) y no se sirve: el worker sale sin entrar en el portal.
  if (modo !== 'exploracion' && necesitaNifTomador(f.compania, f.ramo, riesgo)) {
    const dni = f.cliente_id ? await leerDniFicha(f.correduria_id, f.cliente_id) : null
    const conNif = aplicarNifTomador(f.compania, f.ramo, riesgo, () => lecturaNifFicha(dni, decryptField))
    if (!conNif.ok) {
      await prisma.$transaction((tx) => marcarFallo(tx, f.id, f.intentos, { tipo: tipoFalloNifTomador(conNif.status), mensaje: conNif.motivo, url: null }, null))
      return null
    }
    riesgo = conNif.riesgo
  }
  const base = { id: f.id, compania: f.compania, ramo: f.ramo, riesgo, leaseHasta: f.lease_hasta.toISOString(), modo }
  if (modo !== 'exploracion') return base
  const x = await prisma.$queryRaw<{ entrada: string }[]>`
    select e.entrada from seguros.tarificador_exploraciones e
    join seguros.tarificacion_trabajos t on t.id = e.trabajo_id and t.correduria_id = e.correduria_id
    where e.trabajo_id = ${id}::uuid and e.cerrada_at is null`
  return x[0] ? { ...base, exploracion: { entrada: x[0].entrada, conDatosReales: f.con_cliente } } : null
}

// ─── Resultado ───────────────────────────────────────────────────────────────

type FilaTrabajo = {
  id: string
  correduria_id: string
  /** NULL solo en una exploración SINTÉTICA (2026-10-13_tarificador_explorador.sql). */
  cliente_id: string | null
  poliza_id: string | null
  oportunidad_id: string | null
  compania: string
  ramo: string
  riesgo: RiesgoComunidad | FormularioAuto
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
    // EXPLORACIÓN (13/10/2026): termina `explorado` (el mapa ya está en su cabecera) o con error; nunca con ofertas. Y al
    // revés: solo una exploración puede terminar `explorado`.
    const deExploracion = t.modo === 'exploracion'
    if (deExploracion && r.tipo === 'ok') return { res: { estado: 'conflicto' as const, motivo: 'trabajo de exploración: no devuelve ofertas' }, traza: null }
    if (!deExploracion && r.tipo === 'explorado') return { res: { estado: 'conflicto' as const, motivo: 'solo una exploración termina «explorado»' }, traza: null }
    // Un resultado tardío (el barrido ya dio el lease por vencido) NO pisa lo decidido.
    if (t.estado !== 'en_curso') return { res: { estado: 'conflicto' as const, motivo: `trabajo en estado ${t.estado}` }, traza: null }

    if (r.tipo === 'explorado') {
      // La cabecera DEBE estar cerrada (el cierre guarda el mapa): si no, no es un `ok` sino un error con motivo claro.
      const cab = await tx.$queryRaw<{ cerrada: boolean }[]>`select (cerrada_at is not null) as cerrada from seguros.tarificador_exploraciones where trabajo_id = ${t.id}::uuid`
      if (!exploradoValido(cab[0]?.cerrada)) {
        const { estado } = await marcarFallo(tx, t.id, t.intentos, { tipo: 'portal', mensaje: 'exploracion_sin_cierre: el worker informó «explorado» pero la cabecera no está cerrada (el mapa no se guardó)', url: null }, null)
        return { res: { estado: 'registrado' as const, estadoTrabajo: estado }, traza: { t, captura: null } }
      }
      // PRESUPUESTO GUARDADO (14/10/2026): su PDF va a `seguros.documentos` como el de una tarificación (mismo `guardarAdjunto`)
      // y queda en `evidencia_documento_id` del trabajo; la referencia del portal, en las notas del documento (y en
      // `mapa.presupuesto`, que escribió el cierre). Un documento tiene que colgar de un cliente o póliza
      // (`documentos_colgado_de_algo`): en una exploración SINTÉTICA (sin cliente) el PDF no se guarda (el mapa dice `pdf`).
      const pdfDoc = r.presupuesto?.pdf && (t.cliente_id || t.poliza_id)
        ? await guardarAdjunto(tx, t, {
            nombre: r.presupuesto.pdf.nombre,
            mime: 'application/pdf',
            contenido: r.presupuesto.pdf.contenido,
            notas: notasPresupuestoExplorado(t.compania, t.ramo, r.presupuesto.referencia),
          })
        : null
      // Sin tarificación (el CHECK `trabajo_ok_con_tarificacion` lo admite solo en exploración). El motivo de fin, en `error`
      // NO: va en la cabecera de la exploración (`motivo_fin`, lo escribió el cierre).
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'ok', lease_hasta = null, error = null, terminado_at = now(), updated_at = now(),
            evidencia_documento_id = coalesce(${pdfDoc}::uuid, evidencia_documento_id)
        where id = ${t.id}::uuid and estado = 'en_curso'`
      // PURGA (13/10/2026): cerrado → fuera los datos personales del riesgo, en el MISMO commit.
      await purgarRiesgoTrabajos(tx, [t.id])
      return { res: { estado: 'registrado' as const, estadoTrabajo: 'ok' }, traza: { t, captura: null } }
    }

    if (r.tipo === 'error') {
      // Una exploración no guarda captura ni HTML como documento (puede no tener cliente y no hacen falta para el mapa).
      const evidencia = deExploracion ? null : { trabajo: t, captura: r.captura, html: r.html }
      const { estado } = await marcarFallo(tx, t.id, t.intentos, r.error, evidencia, conBot ? r.botVersion : null, conBot)
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
    // PURGA (13/10/2026): DESPUÉS de guardar la tarificación y los PDF (lo último que lee el riesgo dentro de la
    // transacción) y en el MISMO commit. El aprendizaje de versión de abajo usa la copia en memoria (`t`), no la fila.
    // Un `ok` de Allianz Comunidades es origen posible de una emisión y NO se purga (`esOrigenDeEmision`).
    await purgarRiesgoTrabajos(tx, [t.id])
    return { res: { estado: 'registrado' as const, estadoTrabajo: 'ok', tarificacionId }, traza: { t, captura: null } }
  })
  // APRENDER (13/10/2026): un `ok` con tarificación que llevaba una versión AUTOMÁTICA (IA o memoria) la confirma en
  // `seguros.tarificador_elecciones`. Fuera de la transacción y sin lanzar: el resultado jamás depende de la memoria.
  if (interno.res.estado === 'registrado' && interno.res.estadoTrabajo === 'ok' && interno.res.tarificacionId && interno.traza) {
    const aprender = memoriaTrasExito(interno.traza.t)
    if (aprender) await guardarMemoriaVersion(aprender.k, { codigo: aprender.codigo, etiqueta: aprender.etiqueta, origen: 'ia' })
  }
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

/** Notas del documento del presupuesto guardado por el explorador. La referencia es del portal (no es un dato personal). */
export function notasPresupuestoExplorado(compania: string, ramo: string, referencia: string | null): string {
  return `Presupuesto de ${compania} (${ramo}) guardado por el explorador del tarificador RPA${referencia ? ` · referencia del portal: ${referencia}` : ' · referencia: no se vio'}`
}

async function guardarTarificacionRpa(tx: Db, t: FilaTrabajo, ofertas: OfertaNormalizada[], docs: string[]): Promise<string> {
  const rg = t.riesgo
  // La columna `ramo` del trabajo manda: si el JSON del riesgo dice otra cosa, no se guarda nada con columnas equivocadas.
  if (rg.ramo !== t.ramo) throw new Error(`tarificador: el riesgo (${String(rg.ramo)}) no casa con el ramo del trabajo (${t.ramo})`)
  // Columnas planas de la tarificación: las de un edificio solo existen en Comunidades; un vehículo (Moto) solo aporta el CP.
  // `null` = no consta (≠ 0): nunca se inventa un metro cuadrado ni un capital para una moto.
  const col =
    rg.ramo === 'comunidades'
      ? { fechaEfecto: rg.fechaEfecto ?? null, codigoPostal: rg.direccion?.codigoPostal ?? null, m2: rg.m2Construidos ?? null, anioConstruccion: rg.anioConstruccion ?? null, capitalContinente: rg.capitalContinente ?? null, capitalContenido: rg.capitalContenido ?? null }
      : { fechaEfecto: null, codigoPostal: rg.codigoPostal, m2: null, anioConstruccion: null, capitalContinente: null, capitalContenido: null }
  const conDocs = ofertas.map((o) => ({ ...o, documentoId: o.pdf ? (docs[o.pdf.indice] ?? null) : null }))
  // ADITIVO (07/10/2026): el PDF del proyecto de la compañía (`seguros.documentos`), sin columna nueva: va en el
  // jsonb `respuesta`. `null` = el worker no lo obtuvo (el motivo va en los `avisos` de la oferta).
  const proyectoDocumentoId = conDocs.find((o) => o.documentoId)?.documentoId ?? null
  const respuesta = { canal: 'rpa', compania: t.compania, ofertas: conDocs, proyectoDocumentoId }
  // `peticion` NUNCA con el riesgo entero (13/10/2026): misma lista blanca que la purga del trabajo. Nadie lee de una
  // petición de portal datos personales (los lectores de `peticion` buscan la forma de Avant2: `risk.*`, `holder`).
  const filas = await tx.$queryRaw<{ id: string }[]>`
    insert into seguros.tarificaciones (
      correduria_id, intento_id, simulado, project_id_codeoscopic, canal,
      ramo, puerta, poliza_id, cliente_id, oportunidad_id, fecha_efecto, peticion,
      codigo_postal, metros_cuadrados, anio_construccion, capital_continente, capital_contenido,
      solicitado_por, respuesta, fallos
    ) values (
      ${t.correduria_id}::uuid, null, false, null, 'rpa',
      ${t.ramo}, 'corredor', ${t.poliza_id}::uuid, ${t.cliente_id}::uuid, ${t.oportunidad_id}::uuid,
      ${col.fechaEfecto}::date, ${JSON.stringify(riesgoSinDatosPersonales(rg, t.ramo))}::jsonb,
      ${col.codigoPostal}, ${col.m2}::int, ${col.anioConstruccion}::int,
      ${col.capitalContinente}::numeric, ${col.capitalContenido}::numeric,
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
): Promise<{ estado: string; tocada: boolean }> {
  // EMISIÓN (10/10/2026): nunca se reintenta sola (tras el clic, el estado en la compañía es incierto) → requiere_humano,
  // con tipo `emision` (la bandeja no la deja reintentar) y el aviso a Alberto rearmado.
  const modoFila = await db.$queryRaw<{ modo: string | null }[]>`select to_jsonb(t)->>'modo' as modo from seguros.tarificacion_trabajos t where t.id = ${id}::uuid`
  const deEmision = modoFila[0]?.modo === 'emision'
  // Si el token YA se canjeó (autorización consumida sin desenlace), el clic pudo salir: INCIERTO, y la autorización queda
  // marcada `incierto` (bloquea pedir otra emisión del presupuesto hasta que una persona lo resuelva mirando ePAC).
  let incierta = false
  let autorizacionIncierta: string | null = null
  if (deEmision) {
    const aut = await db.$queryRaw<{ id: string; consumido_at: Date | null; resultado: string | null }[]>`
      select a.id::text as id, a.consumido_at, a.resultado from seguros.tarificacion_emision_autorizacion a where a.trabajo_id = ${id}::uuid`
    const a = aut[0]
    incierta = autorizacionSinResolver(a ? { consumidoAt: a.consumido_at, resultado: a.resultado } : null)
    autorizacionIncierta = incierta ? a!.id : null
    const prefijo = incierta ? `${MENSAJE_EMISION_INCIERTA} Detalle: ` : ''
    error = { ...error, tipo: 'emision', mensaje: `${prefijo}[emisión, ${error.tipo}] ${error.mensaje}`.slice(0, 2000) }
  }
  const deExploracion = modoFila[0]?.modo === 'exploracion'
  let estado = deEmision ? estadoTrasErrorEmision() : estadoTrasError(error.tipo, intentos)
  if (deExploracion) {
    const cab = await db.$queryRaw<{ cerrada: boolean }[]>`select (cerrada_at is not null) as cerrada from seguros.tarificador_exploraciones where trabajo_id = ${id}::uuid`
    estado = estadoFalloExploracion(estado, cab[0]?.cerrada === true)
  }
  let capturaId: string | null = null
  let htmlId: string | null = null
  if (evidencia?.captura) {
    capturaId = await guardarAdjunto(db, evidencia.trabajo, { nombre: `fallo-${id.slice(0, 8)}.png`, mime: 'image/png', contenido: evidencia.captura, notas: `Captura del fallo del tarificador RPA (${error.tipo})` })
  }
  if (evidencia?.html) {
    htmlId = await guardarAdjunto(db, evidencia.trabajo, { nombre: `fallo-${id.slice(0, 8)}.html`, mime: 'text/html', contenido: Buffer.from(evidencia.html, 'utf8'), notas: `HTML (redactado) del fallo del tarificador RPA (${error.tipo})` })
  }
  // `...error` lleva también los accesorios ya validados del cable (`opcionesVersion`, `inventarioDom`): van al jsonb.
  const err = JSON.stringify({ ...error, html_documento_id: htmlId, en: new Date().toISOString() })
  let filasTocadas: number
  if (conBotVersion) {
    filasTocadas = await db.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = ${estado}, error = ${err}::jsonb, lease_hasta = null,
          evidencia_documento_id = coalesce(${capturaId}::uuid, evidencia_documento_id),
          bot_version = coalesce(${botVersion}, bot_version),
          terminado_at = case when ${estado} = 'error_reintentable' then null else now() end, updated_at = now()
      where id = ${id}::uuid and estado = 'en_curso'`
  } else {
    filasTocadas = await db.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = ${estado}, error = ${err}::jsonb, lease_hasta = null,
          evidencia_documento_id = coalesce(${capturaId}::uuid, evidencia_documento_id),
          terminado_at = case when ${estado} = 'error_reintentable' then null else now() end, updated_at = now()
      where id = ${id}::uuid and estado = 'en_curso'`
  }
  const tocada = filasTocadas > 0
  // Una exploración que ya no se reintenta cierra su cabecera con estado de error (`descartado` si no hay mapa).
  if (tocada && deExploracion && cierraCabeceraTrasFallo(estado)) {
    await db.$executeRaw`
      update seguros.tarificador_exploraciones
      set cerrada_at = now(), estado_mapa = case when mapa is null then 'descartado' else estado_mapa end,
          motivo_fin = coalesce(motivo_fin, 'error_trabajo'), updated_at = now()
      where trabajo_id = ${id}::uuid and cerrada_at is null`
  }
  // Los efectos secundarios SOLO si el UPDATE tocó la fila (si un resultado llegó a la vez y ganó, esto no hace nada).
  if (tocada && autorizacionIncierta) await db.$executeRaw`update seguros.tarificacion_emision_autorizacion set resultado = 'incierto' where id = ${autorizacionIncierta}::uuid and resultado is null`
  if (tocada && deEmision) await db.$executeRaw`update seguros.tarificacion_trabajos set emision_avisada_at = null where id = ${id}::uuid and estado = 'requiere_humano'`
  // PURGA (13/10/2026): solo si quedó en un estado cerrado (`error_definitivo`); `error_reintentable` y `requiere_humano`
  // conservan el riesgo para el reintento (lo decide `planPurgaRiesgo`). Lo último que se hace con la fila.
  if (tocada) await purgarRiesgoTrabajos(db, [id])
  return { estado, tocada }
}

// ─── Barrido (enganchable a un cron existente) ───────────────────────────────

export type ResumenBarrido = {
  omitido?: string
  emisionesCaducadas?: { solicitudes: number; autorizaciones: number }
  leasesVencidos: number
  reencolados: number
  cancelados: number
  /** Respaldo de la purga del riesgo (13/10/2026): trabajos cerrados a los que aún les quedaba algún dato personal. */
  riesgosPurgados?: number
  lanzar: Record<string, ResumenLanzar>
}

/**
 * Barrido de la cola. Cron PROPIO cada 5 min (`/api/cron/tarificador-cola`, 13/10/2026) además del de
 * renovaciones; y al encolar se lanza en el acto (`lanzarPendientes`). Hace, en orden:
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
    const f = await marcarFallo(prisma, v.id, v.intentos, { tipo: 'infra', mensaje: 'lease_vencido: el worker no devolvió resultado a tiempo', url: null }, null)
    if (!f.tocada) continue // un resultado llegó a la vez y ganó: ni se cuenta ni se destruye la máquina
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

  const cancelados = await prisma.$queryRaw<{ id: string }[]>`
    update seguros.tarificacion_trabajos w
    set estado = 'cancelado', terminado_at = now(), updated_at = now(),
        error = jsonb_build_object('tipo', 'datos', 'mensaje', 'modo_no_automatizable: la integración ya no está autorizada o activa')
    where w.correduria_id = ${correduriaId}::uuid and w.estado = 'pendiente'
      and not exists (
        select 1 from seguros.companias_integracion ci
        where ci.correduria_id = w.correduria_id and ci.compania = w.compania and ci.ramo = w.ramo
          and ci.activo and ci.modo = 'rpa_autorizada')
    returning w.id::text as id`
  r.cancelados = cancelados.length
  await purgarRiesgoTrabajos(prisma, cancelados.map((c) => c.id))

  // Respaldo de la purga: lo cerrado por un camino que no la llamó (o antes de existir). Sin lanzar: el barrido sigue.
  r.riesgosPurgados = await purgarRiesgosCerrados(prisma, correduriaId).catch((e: unknown) => {
    console.error('[tarificador] respaldo de purga del riesgo', e instanceof Error ? e.message.slice(0, 200) : e)
    return 0
  })

  const companias = await prisma.$queryRaw<{ compania: string }[]>`
    select distinct compania from seguros.tarificacion_trabajos
    where correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`
  for (const c of companias) r.lanzar[c.compania] = await lanzarPendientes(correduriaId, c.compania, deps)
  return r
}
