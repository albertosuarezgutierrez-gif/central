// CONSULTA DE VEHÍCULO POR MATRÍCULA con el bot RPA (04/11/2026) — la parte con BD. Reglas puras en `tarificador-vehiculo-reglas.ts`;
// SQL en prisma/sql/2026-11-04e_tarificador_vehiculo_matricula.sql (sin ella: `hayVehiculoMatricula()` = false → las rutas 503).
//
// 🛡️ El worker solo conoce el id del trabajo: correduría y matrícula salen SIEMPRE de la fila (`en_curso`, modo 'vehiculo').
// 🔒 La matrícula no se loguea ni va en mensajes; la caché guarda su HMAC. El trabajo se purga a `{}` al cerrar.

import { requireSecret } from '@central/core-identity'
import { puedeAutomatizar } from '@central/module-tarificacion'
import { prisma } from './tenant'
import {
  COMPANIA_VEHICULO,
  ESTADOS_VEHICULO_VIVOS,
  MODO_VEHICULO,
  RAMO_VEHICULO,
  cacheVigente,
  claveCacheMatricula,
  normalizarMatriculaConsulta,
  resultadoDeFila,
  riesgoVehiculo,
  vehiculoContieneMatricula,
  type ResultadoVehiculo,
} from './tarificador-vehiculo-reglas'

/** Secreto de la clave de caché: el del worker (ya existe en central-asegura). Sin él → lanza (la ruta responde 503). */
function secretoCache(): string {
  return requireSecret('TARIFICADOR_WORKER_SECRET')
}

type FilaCache = { estado: string; marca: string | null; modelo: string | null; version: string | null; fecha_matriculacion: Date | null; combustible: string | null; consultado_at: Date }

export type ResultadoConsultaVehiculo =
  | { estado: 'cache'; resultado: ResultadoVehiculo; consultadoAt: string }
  | { estado: 'encolado'; trabajoId: string; duplicado: boolean }
  | { estado: 'rechazado'; status: number; motivo: string }

/** Caché (24 h) o, si no hay, encola UN trabajo `vehiculo` (otro vivo de la misma matrícula se reutiliza). */
export async function consultarOEncolarVehiculo(e: { correduriaId: string; matricula: string; solicitadoPor: string }): Promise<ResultadoConsultaVehiculo> {
  const matricula = normalizarMatriculaConsulta(e.matricula)
  if (!matricula) return { estado: 'rechazado', status: 400, motivo: 'matricula_no_valida' }
  const clave = claveCacheMatricula(matricula, secretoCache())
  const cache = await prisma.$queryRaw<(FilaCache & { ahora: Date })[]>`
    select estado, marca, modelo, version, fecha_matriculacion, combustible, consultado_at, now() as ahora
    from seguros.tarificador_vehiculo_matricula where correduria_id = ${e.correduriaId}::uuid and matricula_hash = ${clave}`
  const c = cache[0]
  if (c && cacheVigente(c.consultado_at, c.ahora)) {
    const resultado = resultadoDeFila(c)
    if (resultado) return { estado: 'cache', resultado, consultadoAt: c.consultado_at.toISOString() }
  }
  const integ = await prisma.$queryRaw<{ modo: string; activo: boolean }[]>`
    select modo, activo from seguros.companias_integracion
    where correduria_id = ${e.correduriaId}::uuid and compania = ${COMPANIA_VEHICULO} and ramo = ${RAMO_VEHICULO}`
  if (!integ[0] || !integ[0].activo || !puedeAutomatizar(integ[0].modo)) {
    return { estado: 'rechazado', status: 409, motivo: `modo_no_automatizable: ${integ[0] ? (integ[0].activo ? integ[0].modo : 'inactiva') : 'sin_integracion'}` }
  }
  const vivo = () => prisma.$queryRaw<{ id: string }[]>`
    select id::text as id from seguros.tarificacion_trabajos
    where correduria_id = ${e.correduriaId}::uuid and modo = ${MODO_VEHICULO} and riesgo->>'matricula' = ${matricula}
      and estado = any(${[...ESTADOS_VEHICULO_VIVOS]}::text[])
    order by created_at limit 1`
  const previo = await vivo()
  if (previo[0]) return { estado: 'encolado', trabajoId: previo[0].id, duplicado: true }
  try {
    const t = await prisma.$queryRaw<{ id: string }[]>`
      insert into seguros.tarificacion_trabajos (correduria_id, compania, ramo, riesgo, solicitado_por, modo)
      values (${e.correduriaId}::uuid, ${COMPANIA_VEHICULO}, ${RAMO_VEHICULO}, ${JSON.stringify(riesgoVehiculo(matricula))}::jsonb, ${e.solicitadoPor}, ${MODO_VEHICULO})
      returning id::text as id`
    return { estado: 'encolado', trabajoId: t[0].id, duplicado: false }
  } catch (err) {
    const x = err as { meta?: { code?: unknown }; message?: unknown }
    const msg = typeof x?.message === 'string' ? x.message : ''
    // Carrera con otra petición de la MISMA matrícula: el índice único la frena; se devuelve la viva.
    if (x?.meta?.code === '23505' || /\b23505\b|duplicate key value/.test(msg)) {
      const otro = await vivo()
      if (otro[0]) return { estado: 'encolado', trabajoId: otro[0].id, duplicado: true }
    }
    throw err
  }
}

export type LecturaConsultaVehiculo = { estadoTrabajo: string; resultado: ResultadoVehiculo | null; tipoError: string | null }

/** Estado de una consulta y, si terminó, su resultado (de la caché, por `trabajo_id`). Sin matrícula ni mensajes del portal. */
export async function leerConsultaVehiculo(correduriaId: string, trabajoId: string): Promise<LecturaConsultaVehiculo | null> {
  const t = await prisma.$queryRaw<{ estado: string; tipo_error: string | null }[]>`
    select estado, error->>'tipo' as tipo_error from seguros.tarificacion_trabajos
    where id = ${trabajoId}::uuid and correduria_id = ${correduriaId}::uuid and modo = ${MODO_VEHICULO}`
  if (!t[0]) return null
  const c = await prisma.$queryRaw<FilaCache[]>`
    select estado, marca, modelo, version, fecha_matriculacion, combustible, consultado_at
    from seguros.tarificador_vehiculo_matricula where correduria_id = ${correduriaId}::uuid and trabajo_id = ${trabajoId}::uuid`
  return { estadoTrabajo: t[0].estado, resultado: c[0] ? resultadoDeFila(c[0]) : null, tipoError: t[0].tipo_error && /^[a-z_]{1,30}$/.test(t[0].tipo_error) ? t[0].tipo_error : null }
}

export type RegistroVehiculo = { estado: 'registrado' } | { estado: 'no_encontrado' } | { estado: 'conflicto'; motivo: string } | { estado: 'rechazado'; motivo: string }

/** El worker cierra la consulta: caché (upsert) + trabajo `ok` con el riesgo PURGADO a `{}`, en una transacción. */
export async function registrarResultadoVehiculo(trabajoId: string, r: ResultadoVehiculo, botVersion: string | null): Promise<RegistroVehiculo> {
  const secreto = secretoCache()
  return prisma.$transaction(async (tx) => {
    const f = (await tx.$queryRaw<{ id: string; correduria_id: string; estado: string; matricula: string | null }[]>`
      select id::text as id, correduria_id::text as correduria_id, estado, riesgo->>'matricula' as matricula
      from seguros.tarificacion_trabajos where id = ${trabajoId}::uuid and modo = ${MODO_VEHICULO} for update`)[0]
    if (!f) return { estado: 'no_encontrado' as const }
    if (f.estado !== 'en_curso') return { estado: 'conflicto' as const, motivo: `trabajo en estado ${f.estado}` }
    const matricula = normalizarMatriculaConsulta(f.matricula)
    if (!matricula) return { estado: 'conflicto' as const, motivo: 'trabajo sin matrícula legible' }
    if (r.estado === 'ok' && vehiculoContieneMatricula(r.vehiculo, matricula)) return { estado: 'rechazado' as const, motivo: 'vehiculo_con_matricula' }
    const v = r.estado === 'ok' ? r.vehiculo : null
    const clave = claveCacheMatricula(matricula, secreto)
    await tx.$executeRaw`
      insert into seguros.tarificador_vehiculo_matricula
        (correduria_id, matricula_hash, estado, marca, modelo, version, fecha_matriculacion, combustible, fuente, trabajo_id, consultado_at)
      values (${f.correduria_id}::uuid, ${clave}, ${r.estado}, ${v?.marca ?? null}, ${v?.modelo ?? null}, ${v?.version ?? null},
              ${v?.fechaMatriculacion ?? null}::date, ${v?.combustible ?? null}, ${COMPANIA_VEHICULO}, ${f.id}::uuid, now())
      on conflict (correduria_id, matricula_hash) do update set
        estado = excluded.estado, marca = excluded.marca, modelo = excluded.modelo, version = excluded.version,
        fecha_matriculacion = excluded.fecha_matriculacion, combustible = excluded.combustible, fuente = excluded.fuente,
        trabajo_id = excluded.trabajo_id, consultado_at = excluded.consultado_at`
    await tx.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = 'ok', riesgo = '{}'::jsonb, error = null, lease_hasta = null, terminado_at = now(), updated_at = now(),
          bot_version = coalesce(${botVersion}, bot_version)
      where id = ${f.id}::uuid and estado = 'en_curso' and modo = ${MODO_VEHICULO}`
    return { estado: 'registrado' as const }
  }, { timeout: 15_000, maxWait: 10_000 })
}
