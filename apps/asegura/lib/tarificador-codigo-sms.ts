// RELEVO DEL CÓDIGO SMS por Telegram (19/10/2026) — la parte con BD. Reglas puras en `tarificador-codigo-sms-reglas.ts`;
// SQL en `apps/asegura/prisma/sql/2026-10-19_tarificador_codigos_sms.sql` (sin aplicar → 503 `codigo_sms_sin_activar`).
//
// 🛡️ Worker: la correduría sale de la FILA del trabajo (`en_curso` con lease vivo), nunca del cuerpo. Operador: `correduria_id`
//    de `correduriaUnica()` en todas las consultas.
// 🔒 `codigo_sellado` es OPACO (sellado con la pública del worker; aquí no se puede abrir) y se anula al recogerlo (un uso) o
//    al caducar. El código en claro solo existe en `entregarCodigo`, el tiempo de sellarlo: ni se loguea ni se devuelve.

import { sellarCodigoSms } from '@central/module-tarificacion/servidor'
import { prisma } from './tenant'
import { LEASE_MS } from './tarificador-reglas'
import { COMPANIAS_CODIGO_SMS, ESPERA_WORKER_MS, TTL_CODIGO_MS, elegirDestino, refDePeticion, type FilaPeticion } from './tarificador-codigo-sms-reglas'

export type ResultadoPedir =
  | { estado: 'pedido'; ref: string; caducaEn: string; leaseHasta: string | null }
  | { estado: 'sin_trabajo' }
  | { estado: 'compania_sin_relevo' }

/** El worker abre (o reabre) la petición de SU trabajo y se le alarga el lease para que quepa la espera. */
export async function pedirCodigo(trabajoId: string, clavePublica: string): Promise<ResultadoPedir> {
  const t = await prisma.$queryRaw<{ correduria_id: string; compania: string; ramo: string; modo: string }[]>`
    select t.correduria_id::text as correduria_id, t.compania, t.ramo, coalesce(to_jsonb(t)->>'modo', 'tarificar') as modo
    from seguros.tarificacion_trabajos t
    where t.id = ${trabajoId}::uuid and t.estado = 'en_curso' and t.lease_hasta > now()`
  const f = t[0]
  if (!f) return { estado: 'sin_trabajo' }
  if (!COMPANIAS_CODIGO_SMS.has(f.compania) || f.modo !== 'tarificar') return { estado: 'compania_sin_relevo' }
  const caduca = new Date(Date.now() + TTL_CODIGO_MS)
  const lease = new Date(Date.now() + ESPERA_WORKER_MS + LEASE_MS)
  return prisma.$transaction(async (tx) => {
    // Limpieza: nada sellado pasada su caducidad, y fuera las filas de hace más de un día (ya no llevan código).
    await tx.$executeRaw`update seguros.tarificador_codigos_sms set codigo_sellado = null where codigo_sellado is not null and caduca_en <= now()`
    await tx.$executeRaw`delete from seguros.tarificador_codigos_sms where caduca_en < now() - interval '1 day'`
    const p = await tx.$queryRaw<{ id: string; caduca_en: Date }[]>`
      insert into seguros.tarificador_codigos_sms (correduria_id, trabajo_id, compania, ramo, clave_publica, caduca_en)
      values (${f.correduria_id}::uuid, ${trabajoId}::uuid, ${f.compania}, ${f.ramo}, ${clavePublica}, ${caduca})
      on conflict (trabajo_id) do update set
        clave_publica = excluded.clave_publica, pedido_en = now(), caduca_en = excluded.caduca_en,
        avisado_en = null, respondido_en = null, recogido_en = null, codigo_sellado = null
      returning id::text as id, caduca_en`
    const l = await tx.$queryRaw<{ lease_hasta: Date | null }[]>`
      update seguros.tarificacion_trabajos set lease_hasta = greatest(lease_hasta, ${lease}::timestamptz), updated_at = now()
      where id = ${trabajoId}::uuid and estado = 'en_curso'
      returning lease_hasta`
    const fila = p[0]!
    return { estado: 'pedido' as const, ref: refDePeticion(fila.id), caducaEn: fila.caduca_en.toISOString(), leaseHasta: l[0]?.lease_hasta?.toISOString() ?? null }
  })
}

export type ResultadoRecoger =
  | { estado: 'listo'; sello: string; leaseHasta: string | null }
  | { estado: 'esperando' }
  | { estado: 'sin_peticion' | 'caducada' | 'ya_recogido' }

/** El worker recoge el código sellado (UN uso: se anula en la misma sentencia). */
export async function recogerCodigo(trabajoId: string): Promise<ResultadoRecoger> {
  const r = await prisma.$queryRaw<{ sello: string }[]>`
    with viejo as (
      select s.id, s.codigo_sellado from seguros.tarificador_codigos_sms s
      join seguros.tarificacion_trabajos t on t.id = s.trabajo_id
      where s.trabajo_id = ${trabajoId}::uuid and t.estado = 'en_curso' and t.lease_hasta > now()
        and s.codigo_sellado is not null and s.caduca_en > now()
      for update of s
    )
    update seguros.tarificador_codigos_sms s set codigo_sellado = null, recogido_en = now()
    from viejo where s.id = viejo.id
    returning viejo.codigo_sellado as sello`
  if (r[0]) {
    const l = await prisma.$queryRaw<{ lease_hasta: Date | null }[]>`
      update seguros.tarificacion_trabajos set lease_hasta = greatest(lease_hasta, ${new Date(Date.now() + LEASE_MS + 60_000)}::timestamptz), updated_at = now()
      where id = ${trabajoId}::uuid and estado = 'en_curso'
      returning lease_hasta`
    return { estado: 'listo', sello: r[0].sello, leaseHasta: l[0]?.lease_hasta?.toISOString() ?? null }
  }
  const s = await prisma.$queryRaw<{ caducada: boolean; recogido: boolean; vivo: boolean }[]>`
    select s.caduca_en <= now() as caducada, s.recogido_en is not null as recogido,
           (t.estado = 'en_curso' and t.lease_hasta > now()) as vivo
    from seguros.tarificador_codigos_sms s join seguros.tarificacion_trabajos t on t.id = s.trabajo_id
    where s.trabajo_id = ${trabajoId}::uuid`
  const f = s[0]
  if (!f || !f.vivo) return { estado: 'sin_peticion' }
  if (f.recogido) return { estado: 'ya_recogido' }
  if (f.caducada) return { estado: 'caducada' }
  return { estado: 'esperando' }
}

export type PeticionAviso = { id: string; ref: string; compania: string; ramo: string; caducaEn: string }

/** Las peticiones vivas de las que aún no se ha avisado por Telegram (solo compañía y ramo: nada del riesgo ni del cliente). */
export async function pendientesAvisoCodigo(correduriaId: string): Promise<PeticionAviso[]> {
  const filas = await prisma.$queryRaw<{ id: string; compania: string; ramo: string; caduca_en: Date }[]>`
    select s.id::text as id, s.compania, s.ramo, s.caduca_en
    from seguros.tarificador_codigos_sms s join seguros.tarificacion_trabajos t on t.id = s.trabajo_id
    where s.correduria_id = ${correduriaId}::uuid and s.avisado_en is null and s.respondido_en is null and s.caduca_en > now()
      and t.estado = 'en_curso' and t.lease_hasta > now()
    order by s.pedido_en
    limit 10`
  return filas.map((f) => ({ id: f.id, ref: refDePeticion(f.id), compania: f.compania, ramo: f.ramo, caducaEn: f.caduca_en.toISOString() }))
}

/** Marca como avisadas (idempotente). Plataforma lo llama SOLO si el Telegram salió. */
export async function marcarAvisadosCodigo(correduriaId: string, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0
  const r = await prisma.$queryRaw<{ id: string }[]>`
    update seguros.tarificador_codigos_sms set avisado_en = now()
    where correduria_id = ${correduriaId}::uuid and id = any(${[...ids]}::uuid[]) and avisado_en is null
    returning id::text as id`
  return r.length
}

export type ResultadoEntregar =
  | { estado: 'entregado'; ref: string; compania: string }
  | { estado: 'sin_peticion' }
  | { estado: 'varias'; n: number }
  | { estado: 'caducada' | 'ya_respondida' | 'trabajo_cerrado' }

/**
 * La respuesta de Alberto (ya validada: 4-8 dígitos; el webhook de plataforma comprobó `from.id`). Se SELLA para el worker y
 * se guarda solo el sello. Una petición contestada no admite otro código (un uso). El código no sale de esta función.
 */
export async function entregarCodigo(correduriaId: string, ref: string | null, codigo: string): Promise<ResultadoEntregar> {
  const filas = await prisma.$queryRaw<{ id: string; trabajo_id: string; compania: string; ramo: string; caduca_en: Date; respondida: boolean; vivo: boolean; clave_publica: string }[]>`
    select s.id::text as id, s.trabajo_id::text as trabajo_id, s.compania, s.ramo, s.caduca_en, s.respondido_en is not null as respondida,
           (t.estado = 'en_curso' and t.lease_hasta > now()) as vivo, s.clave_publica
    from seguros.tarificador_codigos_sms s join seguros.tarificacion_trabajos t on t.id = s.trabajo_id
    where s.correduria_id = ${correduriaId}::uuid and s.caduca_en > now() - interval '1 day'
    order by s.pedido_en desc
    limit 50`
  const porId = new Map(filas.map((f) => [f.id, f]))
  const candidatas: FilaPeticion[] = filas.map((f) => ({ id: f.id, trabajoId: f.trabajo_id, compania: f.compania, ramo: f.ramo, caducaEn: f.caduca_en, respondida: f.respondida, vivo: f.vivo }))
  const d = elegirDestino(candidatas, ref, Date.now())
  if (d.tipo === 'ninguna') return { estado: 'sin_peticion' }
  if (d.tipo === 'varias') return { estado: 'varias', n: d.n }
  if (d.tipo === 'cerrada') return { estado: d.motivo }
  const f = porId.get(d.fila.id)!
  const sello = sellarCodigoSms(codigo, f.clave_publica, f.trabajo_id)
  const r = await prisma.$queryRaw<{ id: string }[]>`
    update seguros.tarificador_codigos_sms set codigo_sellado = ${sello}, respondido_en = now()
    where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and respondido_en is null and caduca_en > now()
    returning id::text as id`
  if (!r[0]) return { estado: 'ya_respondida' }
  return { estado: 'entregado', ref: refDePeticion(f.id), compania: f.compania }
}
