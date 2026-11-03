// MODO PILOTADO del tarificador RPA (03/11/2026) — la parte con BD y Storage. Reglas puras en `tarificador-pilotaje-reglas.ts`;
// SQL en prisma/sql/2026-11-03c_tarificador_pilotaje.sql.
//
// 🛡️ Las rutas del worker solo conocen el id del trabajo: correduría, compañía, entrada… salen SIEMPRE de las filas (trabajo
//    `en_curso`, lease vivo, modo 'pilotaje' + su sesión abierta), nunca del cuerpo. 🔑 El inventario se REDACTA aquí
//    (`redactarValoresInventario`) antes de guardarlo; la captura va a un bucket PRIVADO y solo sale con URL firmada.

import { ENTRADAS_EXPLORACION, claveCompania, entradaConTomadorMediador, esEntradaExploracion, puedeAutomatizar, redactarValoresInventario, valoresSensiblesExploracion, type InventarioDom } from '@central/module-tarificacion'
import { prisma } from './tenant'
import { LEASE_MS } from './tarificador-reglas'
import { riesgoTomadorMediador } from './tarificador-explorador-mediador'
import { BUCKET_PILOTAJE, leasePilotaje, redactarResultadoPilotaje, redactarTextoPilotaje, rutaCapturaPilotaje, type ComandoPilotaje, type PeticionCierre, type PeticionEstado } from './tarificador-pilotaje-reglas'

export type SesionViva = { trabajoId: string; correduriaId: string; compania: string; ramo: string; entrada: string; iniciadoAt: Date | null }

/** Solo una sesión cuyo trabajo está `en_curso` con lease vivo y su cabecera abierta. */
export async function sesionViva(trabajoId: string): Promise<SesionViva | null> {
  const f = (await prisma.$queryRaw<{ trabajo_id: string; correduria_id: string; compania: string; ramo: string; entrada: string; iniciado_at: Date | null }[]>`
    select t.id::text as trabajo_id, t.correduria_id::text as correduria_id, t.compania, t.ramo, s.entrada, t.iniciado_at
    from seguros.tarificacion_trabajos t
    join seguros.tarificador_pilotaje_sesiones s on s.sesion_id = t.id and s.correduria_id = t.correduria_id
    where t.id = ${trabajoId}::uuid and t.modo = 'pilotaje' and t.estado = 'en_curso' and t.lease_hasta > now() and s.cerrada_at is null`)[0]
  return f ? { trabajoId: f.trabajo_id, correduriaId: f.correduria_id, compania: f.compania, ramo: f.ramo, entrada: f.entrada, iniciadoAt: f.iniciado_at } : null
}

/** La entrada de una sesión abierta (para servir el trabajo al worker). */
export async function entradaDePilotaje(trabajoId: string, correduriaId: string): Promise<string | null> {
  const x = await prisma.$queryRaw<{ entrada: string }[]>`
    select entrada from seguros.tarificador_pilotaje_sesiones
    where sesion_id = ${trabajoId}::uuid and correduria_id = ${correduriaId}::uuid and cerrada_at is null`
  return x[0]?.entrada ?? null
}

/** Valores sensibles de una sesión (los de una exploración SINTÉTICA: contacto de entorno y, con tomador mediador, los suyos). */
export function valoresPilotaje(entrada: string, env: Record<string, string | undefined>): string[] | null {
  const tomadorMediador = entradaConTomadorMediador(entrada)
  return valoresSensiblesExploracion({ conDatosReales: false, riesgo: tomadorMediador ? riesgoTomadorMediador() : null, env, tomadorMediador })
}

/**
 * Redacción de TODO lo que el worker publica antes de guardarlo: inventario (`redactarValoresInventario`), URL y resultado del
 * comando anterior (`redactarTextoPilotaje`). `null` = no se sabe qué quitar → no se guarda nada.
 */
export function redactarEstadoPilotaje(p: PeticionEstado, entrada: string, env: Record<string, string | undefined>): { inventario: InventarioDom; p: PeticionEstado } | null {
  const valores = valoresPilotaje(entrada, env)
  if (valores === null) return null
  return {
    inventario: redactarValoresInventario(p.inventario, valores),
    p: { ...p, url: p.url === null ? null : redactarTextoPilotaje(p.url, valores) === p.url ? p.url : null, resultadoAnterior: redactarResultadoPilotaje(p.resultadoAnterior, valores) },
  }
}

// ─── Storage (REST, sin supabase-js) ─────────────────────────────────────────

type CfgStorage = { url: string; clave: string }
/** Sin URL o sin clave de servicio = sin Storage (el paso se publica sin captura). Nunca un literal por defecto. */
export function configStorage(env: Record<string, string | undefined>): CfgStorage | null {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const clave = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!/^https:\/\//.test(url) || clave.length < 20) return null
  return { url, clave }
}

/** Sube el PNG (upsert). Devuelve la ruta o `null` (no lanza: la captura es un extra). */
export async function subirCaptura(cfg: CfgStorage | null, sesionId: string, n: number, png: Buffer, f: typeof fetch = fetch): Promise<string | null> {
  if (!cfg) return null
  const ruta = rutaCapturaPilotaje(sesionId, n)
  try {
    const r = await f(`${cfg.url}/storage/v1/object/${BUCKET_PILOTAJE}/${ruta}`, {
      method: 'POST',
      headers: { apikey: cfg.clave, Authorization: `Bearer ${cfg.clave}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: new Uint8Array(png),
      signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) {
      console.error('[tarificador/pilotaje] captura', r.status)
      return null
    }
    return ruta
  } catch (e) {
    console.error('[tarificador/pilotaje] captura', e instanceof Error ? e.message.slice(0, 120) : 'error')
    return null
  }
}

/** URL firmada (10 min) de una captura. `null` = sin Storage o falló. */
export async function firmarCaptura(cfg: CfgStorage | null, ruta: string, f: typeof fetch = fetch): Promise<string | null> {
  if (!cfg || !/^pilotaje\/[0-9a-f-]{36}\/[0-9]{1,3}\.png$/.test(ruta)) return null
  try {
    const r = await f(`${cfg.url}/storage/v1/object/sign/${BUCKET_PILOTAJE}/${ruta}`, {
      method: 'POST',
      headers: { apikey: cfg.clave, Authorization: `Bearer ${cfg.clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 600 }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) return null
    const d = (await r.json()) as { signedURL?: string; signedUrl?: string }
    const s = d.signedURL || d.signedUrl
    return s ? `${cfg.url}/storage/v1${s.startsWith('/') ? '' : '/'}${s}` : null
  } catch {
    return null
  }
}

// ─── Pasos ───────────────────────────────────────────────────────────────────

/** Renueva el lease (nunca más allá de 30 min + margen desde el inicio; nunca lo acorta). */
async function renovarLease(s: SesionViva): Promise<string | null> {
  const lease = leasePilotaje({ ahora: new Date(), inicio: s.iniciadoAt, leaseMs: LEASE_MS })
  const t = await prisma.$queryRaw<{ lease_hasta: Date | null }[]>`
    update seguros.tarificacion_trabajos set lease_hasta = greatest(lease_hasta, ${lease}::timestamptz), updated_at = now()
    where id = ${s.trabajoId}::uuid and correduria_id = ${s.correduriaId}::uuid and estado = 'en_curso' and modo = 'pilotaje'
    returning lease_hasta`
  return t[0]?.lease_hasta ? t[0].lease_hasta.toISOString() : null
}

export type ResultadoPublicar = { estado: 'ok'; leaseHasta: string | null; captura: boolean } | { estado: 'conflicto'; motivo: string }

/**
 * Publica la pantalla `n`: anota el resultado del comando de `n-1` (solo si esa fila estaba `ejecutando`) e inserta `n`.
 * `n` tiene que ser exactamente el siguiente (sin huecos ni repeticiones: un reintento con el mismo `n` = 409).
 */
export async function publicarEstado(s: SesionViva, p: PeticionEstado, inventario: InventarioDom, capturaRuta: string | null): Promise<ResultadoPublicar> {
  const r = await prisma.$transaction(async (tx) => {
    const ult = await tx.$queryRaw<{ n: number | null }[]>`select max(n) as n from seguros.tarificador_pilotaje_pasos where sesion_id = ${s.trabajoId}::uuid`
    const siguiente = (ult[0]?.n ?? 0) + 1
    if (p.n !== siguiente) return { estado: 'conflicto' as const, motivo: `n_fuera_de_orden (esperado ${siguiente})` }
    if (p.n > 1) {
      await tx.$executeRaw`
        update seguros.tarificador_pilotaje_pasos
        set estado = case when ${p.resultadoAnterior?.estado ?? null}::text is null then 'sin_comando' else ${p.resultadoAnterior?.estado ?? 'hecho'} end,
            resultado = ${p.resultadoAnterior ? JSON.stringify(p.resultadoAnterior) : null}::jsonb
        where sesion_id = ${s.trabajoId}::uuid and n = ${p.n - 1} and estado in ('ejecutando', 'esperando')`
    }
    await tx.$executeRaw`
      insert into seguros.tarificador_pilotaje_pasos (sesion_id, n, estado, inventario, captura_ruta, url)
      values (${s.trabajoId}::uuid, ${p.n}, ${p.final ? 'final' : 'esperando'}, ${JSON.stringify(inventario)}::jsonb, ${capturaRuta}, ${p.url})`
    return { estado: 'ok' as const }
  }, { timeout: 15_000, maxWait: 10_000 })
  if (r.estado !== 'ok') return r
  return { estado: 'ok', leaseHasta: await renovarLease(s), captura: capturaRuta !== null }
}

/**
 * El worker RECOGE el comando de la fila `n` (si hay): `esperando` → `ejecutando`, atómico. Desde ese momento el comando
 * queda congelado (el operador ya no puede cambiarlo). Sin comando, `null` (y se renueva el lease: la espera cuenta).
 */
export async function recogerComando(s: SesionViva, n: number): Promise<{ comando: unknown | null; leaseHasta: string | null }> {
  const f = await prisma.$queryRaw<{ comando: unknown }[]>`
    update seguros.tarificador_pilotaje_pasos set estado = 'ejecutando'
    where sesion_id = ${s.trabajoId}::uuid and n = ${n} and estado = 'esperando' and comando is not null
    returning comando`
  return { comando: f[0]?.comando ?? null, leaseHasta: await renovarLease(s) }
}

/** Cierre: anota el último resultado, cierra la cabecera y termina el trabajo (`ok`, o `error_definitivo` con error). */
export async function cerrarSesion(s: SesionViva, p: PeticionCierre, botVersion: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (p.nUltimo !== null) {
      await tx.$executeRaw`
        update seguros.tarificador_pilotaje_pasos
        set estado = case when ${p.resultadoUltimo?.estado ?? null}::text is null then 'sin_comando' else ${p.resultadoUltimo?.estado ?? 'hecho'} end,
            resultado = coalesce(${p.resultadoUltimo ? JSON.stringify(p.resultadoUltimo) : null}::jsonb, resultado)
        where sesion_id = ${s.trabajoId}::uuid and n = ${p.nUltimo} and estado in ('ejecutando', 'esperando')`
    }
    await tx.$executeRaw`
      update seguros.tarificador_pilotaje_sesiones set cerrada_at = now(), motivo_fin = ${p.motivoFin}
      where sesion_id = ${s.trabajoId}::uuid and correduria_id = ${s.correduriaId}::uuid and cerrada_at is null`
    const error = p.error ? JSON.stringify({ tipo: p.error.tipo, mensaje: `pilotaje: ${p.error.mensaje}` }) : null
    await tx.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = case when ${error}::text is null then 'ok' else 'error_definitivo' end, error = ${error}::jsonb,
          lease_hasta = null, terminado_at = now(), updated_at = now()
      where id = ${s.trabajoId}::uuid and correduria_id = ${s.correduriaId}::uuid and estado = 'en_curso' and modo = 'pilotaje'`
  }, { timeout: 15_000, maxWait: 10_000 })
  if (botVersion) {
    await prisma.$executeRaw`update seguros.tarificacion_trabajos set bot_version = ${botVersion.slice(0, 40)}
      where id = ${s.trabajoId}::uuid and correduria_id = ${s.correduriaId}::uuid`.catch(() => undefined)
  }
}

// ─── Operador ────────────────────────────────────────────────────────────────

export type ResultadoEncolarPilotaje = { estado: 'encolado'; trabajoId: string; compania: string } | { estado: 'rechazado'; status: number; motivo: string }

/** Encola una sesión SINTÉTICA (sin cliente, riesgo `{}`): mismos cerrojos de integración que el explorador; una viva por compañía. */
export async function encolarPilotaje(e: { correduriaId: string; entrada: string; solicitadoPor: string }): Promise<ResultadoEncolarPilotaje> {
  if (!esEntradaExploracion(e.entrada)) return { estado: 'rechazado', status: 400, motivo: 'entrada_desconocida' }
  const def = ENTRADAS_EXPLORACION[e.entrada]
  const compania = claveCompania(def.compania)
  const integ = await prisma.$queryRaw<{ modo: string; activo: boolean }[]>`
    select modo, activo from seguros.companias_integracion
    where correduria_id = ${e.correduriaId}::uuid and compania = ${compania} and ramo = ${def.ramo}`
  if (!integ[0] || !integ[0].activo || !puedeAutomatizar(integ[0].modo)) {
    return { estado: 'rechazado', status: 409, motivo: `modo_no_automatizable: ${integ[0] ? (integ[0].activo ? integ[0].modo : 'inactiva') : 'sin_integracion'}` }
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const t = await tx.$queryRaw<{ id: string }[]>`
        insert into seguros.tarificacion_trabajos (correduria_id, compania, ramo, riesgo, solicitado_por, modo)
        values (${e.correduriaId}::uuid, ${compania}, ${def.ramo}, '{}'::jsonb, ${e.solicitadoPor}, 'pilotaje')
        returning id::text as id`
      await tx.$executeRaw`
        insert into seguros.tarificador_pilotaje_sesiones (sesion_id, correduria_id, entrada, solicitado_por)
        values (${t[0].id}::uuid, ${e.correduriaId}::uuid, ${e.entrada}, ${e.solicitadoPor})`
      return { estado: 'encolado' as const, trabajoId: t[0].id, compania }
    }, { timeout: 15_000, maxWait: 10_000 })
  } catch (err) {
    const x = err as { meta?: { code?: unknown }; message?: unknown }
    const msg = typeof x?.message === 'string' ? x.message : ''
    if (x?.meta?.code === '23505' || /\b23505\b|duplicate key value/.test(msg)) return { estado: 'rechazado', status: 409, motivo: 'pilotaje_vivo_para_la_compania' }
    throw err
  }
}

export type PasoOperador = { n: number; estado: string; inventario: unknown; url: string | null; capturaUrl: string | null; comando: unknown; resultado: unknown; creado: string }

/** Pasos de una sesión (los últimos `limite`, del más reciente al más antiguo) con la URL FIRMADA de cada captura. */
export async function pasosParaOperador(correduriaId: string, sesionId: string, limite: number, cfg: CfgStorage | null): Promise<{ sesion: { entrada: string; motivoFin: string | null; cerrada: boolean; estadoTrabajo: string } | null; pasos: PasoOperador[] }> {
  const cab = await prisma.$queryRaw<{ entrada: string; motivo_fin: string | null; cerrada: boolean; estado: string }[]>`
    select s.entrada, s.motivo_fin, (s.cerrada_at is not null) as cerrada, t.estado
    from seguros.tarificador_pilotaje_sesiones s
    join seguros.tarificacion_trabajos t on t.id = s.sesion_id and t.correduria_id = s.correduria_id
    where s.sesion_id = ${sesionId}::uuid and s.correduria_id = ${correduriaId}::uuid`
  if (!cab[0]) return { sesion: null, pasos: [] }
  const filas = await prisma.$queryRaw<{ n: number; estado: string; inventario: unknown; captura_ruta: string | null; url: string | null; comando: unknown; resultado: unknown; created_at: Date }[]>`
    select p.n, p.estado, p.inventario, p.captura_ruta, p.url, p.comando, p.resultado, p.created_at
    from seguros.tarificador_pilotaje_pasos p
    where p.sesion_id = ${sesionId}::uuid
    order by p.n desc limit ${limite}`
  const pasos: PasoOperador[] = []
  for (const f of filas) {
    pasos.push({
      n: f.n, estado: f.estado, inventario: f.inventario, url: f.url, comando: f.comando, resultado: f.resultado, creado: f.created_at.toISOString(),
      capturaUrl: f.captura_ruta ? await firmarCaptura(cfg, f.captura_ruta) : null,
    })
  }
  return { sesion: { entrada: cab[0].entrada, motivoFin: cab[0].motivo_fin, cerrada: cab[0].cerrada, estadoTrabajo: cab[0].estado }, pasos }
}

/** Pone (o cambia) el comando de la fila `n` mientras ESPERA. `false` = la fila no espera (ya recogida, final o no existe). */
export async function ponerComando(correduriaId: string, sesionId: string, n: number, c: ComandoPilotaje): Promise<boolean> {
  const f = await prisma.$queryRaw<{ n: number }[]>`
    update seguros.tarificador_pilotaje_pasos p set comando = ${JSON.stringify(c)}::jsonb, comando_at = now()
    where p.sesion_id = ${sesionId}::uuid and p.n = ${n} and p.estado = 'esperando'
      and exists (select 1 from seguros.tarificador_pilotaje_sesiones s
                  where s.sesion_id = p.sesion_id and s.correduria_id = ${correduriaId}::uuid and s.cerrada_at is null)
    returning p.n`
  return f.length === 1
}
