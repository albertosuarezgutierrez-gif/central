// Formador con IA del tarificador RPA — la parte con BD (06/10/2026). Reglas puras en
// `tarificador-formador-reglas.ts`; SQL en prisma/sql/2026-10-06b_tarificador_formador.sql.
//
// 🛡️ Las rutas del worker solo conocen el id del trabajo: la correduría, la compañía y el ramo salen
//    SIEMPRE de la fila del trabajo (`en_curso` con lease vivo), nunca del cuerpo. La lectura para la
//    intranet (puerto de operador) filtra por `correduria_id`.

import { acompanamientoInicial, siguienteAcompanamiento, type EstadoAcompanamiento } from '@central/module-tarificacion'
import { prisma } from './tenant'
import { eventoCierre, type Paso, type TipoClave } from './tarificador-formador-reglas'

export type TrabajoVivo = { id: string; correduriaId: string; compania: string; ramo: string }

/** Solo un trabajo `en_curso` con lease vivo: un worker tardío o ajeno no aprende ni gasta IA. */
export async function trabajoVivo(id: string): Promise<TrabajoVivo | null> {
  const filas = await prisma.$queryRaw<{ id: string; correduria_id: string; compania: string; ramo: string }[]>`
    select id::text as id, correduria_id::text as correduria_id, compania, ramo
    from seguros.tarificacion_trabajos
    where id = ${id}::uuid and estado = 'en_curso' and lease_hasta > now()`
  const f = filas[0]
  return f ? { id: f.id, correduriaId: f.correduria_id, compania: f.compania, ramo: f.ramo } : null
}

export async function llamadasIAUsadas(trabajoId: string): Promise<number> {
  const filas = await prisma.$queryRaw<{ n: bigint }[]>`
    select count(*) as n from seguros.tarificador_intervenciones where trabajo_id = ${trabajoId}::uuid and llamada_ia`
  return Number(filas[0]?.n ?? 0)
}

export type TipoIntervencion = 'sugerencia' | 'sin_sugerencia' | 'revision' | 'aviso_bloqueante' | 'incidencia_precio' | 'confirmacion' | 'error_ia' | 'tope' | 'cierre'

export async function registrarIntervencion(i: {
  trabajo: TrabajoVivo
  paso: Paso | 'formador'
  tipo: TipoIntervencion
  llamadaIA: boolean
  resumen: string
  coste: number
}): Promise<void> {
  await prisma.$executeRaw`
    insert into seguros.tarificador_intervenciones (correduria_id, trabajo_id, paso, tipo, llamada_ia, resumen, coste_estimado)
    values (${i.trabajo.correduriaId}::uuid, ${i.trabajo.id}::uuid, ${i.paso}, ${i.tipo}, ${i.llamadaIA}, ${i.resumen.slice(0, 2000)}, ${i.coste})`
}

// ─── Conocimiento ────────────────────────────────────────────────────────────

export type EntradaConocimiento = { clave: string; tipo: TipoClave; selector: string; marco: string | null; origen: string; confirmaciones: number }

export async function leerConocimiento(t: TrabajoVivo): Promise<EntradaConocimiento[]> {
  return prisma.$queryRaw<EntradaConocimiento[]>`
    select clave, tipo, selector, marco, origen, confirmaciones
    from seguros.tarificador_conocimiento
    where correduria_id = ${t.correduriaId}::uuid and compania = ${t.compania} and ramo = ${t.ramo}
    order by clave, confirmaciones desc, ultimo_uso_at desc nulls last
    limit 500`
}

/** Alta o +1. Lo llama el worker SOLO tras validar el elemento y usarlo sin error. */
export async function confirmarConocimiento(t: TrabajoVivo, e: { clave: string; tipo: TipoClave; selector: string; marco: string | null; origen: 'ia' | 'codigo' | 'humano' }): Promise<number> {
  const filas = await prisma.$queryRaw<{ confirmaciones: number }[]>`
    insert into seguros.tarificador_conocimiento (correduria_id, compania, ramo, clave, tipo, selector, marco, origen, confirmaciones, ultimo_uso_at)
    values (${t.correduriaId}::uuid, ${t.compania}, ${t.ramo}, ${e.clave}, ${e.tipo}, ${e.selector}, ${e.marco}, ${e.origen}, 1, now())
    on conflict (correduria_id, compania, ramo, clave, selector)
    do update set confirmaciones = seguros.tarificador_conocimiento.confirmaciones + 1, ultimo_uso_at = now(), marco = excluded.marco
    returning confirmaciones`
  return filas[0]?.confirmaciones ?? 0
}

// ─── Modo acompañado ─────────────────────────────────────────────────────────

export async function leerAcompanamiento(t: TrabajoVivo): Promise<EstadoAcompanamiento> {
  const filas = await prisma.$queryRaw<{ activo: boolean; exitos_seguidos: number; umbral: number }[]>`
    select activo, exitos_seguidos, umbral from seguros.tarificador_acompanamiento
    where correduria_id = ${t.correduriaId}::uuid and compania = ${t.compania} and ramo = ${t.ramo}`
  const f = filas[0]
  // Sin fila = acompañado (compañía/ramo nueva).
  return f ? { activo: f.activo, exitosSeguidos: f.exitos_seguidos, umbral: f.umbral } : acompanamientoInicial()
}

/**
 * Cierre del trabajo para el contador: UNA vez por trabajo (índice único parcial `un_cierre`).
 * Intervención = la IA señaló algo o hubo aviso bloqueante / incidencia de precio en el trabajo.
 */
export async function cerrarAcompanamiento(t: TrabajoVivo, resultado: 'ok' | 'error'): Promise<{ estado: EstadoAcompanamiento | null; repetido: boolean }> {
  return prisma.$transaction(async (tx) => {
    const ins = await tx.$executeRaw`
      insert into seguros.tarificador_intervenciones (correduria_id, trabajo_id, paso, tipo, llamada_ia, resumen)
      values (${t.correduriaId}::uuid, ${t.id}::uuid, 'formador', 'cierre', false, ${`cierre del trabajo: ${resultado}`})
      on conflict do nothing`
    if (ins === 0) return { estado: null, repetido: true }
    const n = await tx.$queryRaw<{ n: bigint }[]>`
      select count(*) as n from seguros.tarificador_intervenciones
      where trabajo_id = ${t.id}::uuid and tipo in ('sugerencia', 'aviso_bloqueante', 'incidencia_precio')`
    const actual = await tx.$queryRaw<{ activo: boolean; exitos_seguidos: number; umbral: number }[]>`
      select activo, exitos_seguidos, umbral from seguros.tarificador_acompanamiento
      where correduria_id = ${t.correduriaId}::uuid and compania = ${t.compania} and ramo = ${t.ramo}
      for update`
    const previo = actual[0] ? { activo: actual[0].activo, exitosSeguidos: actual[0].exitos_seguidos, umbral: actual[0].umbral } : acompanamientoInicial()
    const sig = siguienteAcompanamiento(previo, eventoCierre(resultado, Number(n[0]?.n ?? 0) > 0))
    await tx.$executeRaw`
      insert into seguros.tarificador_acompanamiento (correduria_id, compania, ramo, activo, exitos_seguidos, umbral, updated_at)
      values (${t.correduriaId}::uuid, ${t.compania}, ${t.ramo}, ${sig.activo}, ${sig.exitosSeguidos}, ${sig.umbral}, now())
      on conflict (correduria_id, compania, ramo)
      do update set activo = excluded.activo, exitos_seguidos = excluded.exitos_seguidos, updated_at = now()`
    return { estado: sig, repetido: false }
  })
}

// ─── Lectura para la intranet (puerto de operador) ───────────────────────────

export type IntervencionLeida = { trabajoId: string; paso: string; tipo: string; llamadaIA: boolean; resumen: string; costeEstimado: number; creadoEn: string }

export async function listarIntervenciones(correduriaId: string, f: { trabajoId: string | null; limite: number }): Promise<{
  intervenciones: IntervencionLeida[]
  costeTotalEstimado: number
  aprendido: { compania: string; ramo: string; clave: string; tipo: string; origen: string; confirmaciones: number; ultimoUso: string | null }[]
  acompanamiento: { compania: string; ramo: string; activo: boolean; exitosSeguidos: number; umbral: number }[]
}> {
  const filtroTrabajo = f.trabajoId
  const filas = await prisma.$queryRaw<{ trabajo_id: string; paso: string; tipo: string; llamada_ia: boolean; resumen: string; coste_estimado: unknown; created_at: Date }[]>`
    select trabajo_id::text as trabajo_id, paso, tipo, llamada_ia, resumen, coste_estimado, created_at
    from seguros.tarificador_intervenciones
    where correduria_id = ${correduriaId}::uuid and (${filtroTrabajo}::uuid is null or trabajo_id = ${filtroTrabajo}::uuid)
    order by created_at desc
    limit ${f.limite}`
  const total = await prisma.$queryRaw<{ s: unknown }[]>`
    select coalesce(sum(coste_estimado), 0) as s from seguros.tarificador_intervenciones
    where correduria_id = ${correduriaId}::uuid and (${filtroTrabajo}::uuid is null or trabajo_id = ${filtroTrabajo}::uuid)`
  const aprendido = await prisma.$queryRaw<{ compania: string; ramo: string; clave: string; tipo: string; origen: string; confirmaciones: number; ultimo_uso_at: Date | null }[]>`
    select compania, ramo, clave, tipo, origen, confirmaciones, ultimo_uso_at
    from seguros.tarificador_conocimiento where correduria_id = ${correduriaId}::uuid
    order by ultimo_uso_at desc nulls last limit 200`
  const acomp = await prisma.$queryRaw<{ compania: string; ramo: string; activo: boolean; exitos_seguidos: number; umbral: number }[]>`
    select compania, ramo, activo, exitos_seguidos, umbral from seguros.tarificador_acompanamiento
    where correduria_id = ${correduriaId}::uuid order by compania, ramo`
  return {
    intervenciones: filas.map((r) => ({
      trabajoId: r.trabajo_id, paso: r.paso, tipo: r.tipo, llamadaIA: r.llamada_ia, resumen: r.resumen,
      costeEstimado: Number(r.coste_estimado), creadoEn: r.created_at.toISOString(),
    })),
    costeTotalEstimado: Number(total[0]?.s ?? 0),
    aprendido: aprendido.map((a) => ({ compania: a.compania, ramo: a.ramo, clave: a.clave, tipo: a.tipo, origen: a.origen, confirmaciones: a.confirmaciones, ultimoUso: a.ultimo_uso_at?.toISOString() ?? null })),
    acompanamiento: acomp.map((a) => ({ compania: a.compania, ramo: a.ramo, activo: a.activo, exitosSeguidos: a.exitos_seguidos, umbral: a.umbral })),
  }
}
