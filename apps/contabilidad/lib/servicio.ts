// Casos de uso de la contabilidad sobre el repositorio de UNA empresa. Sin BD directa: `RepoContable` inyectado (tests con fake).
//
//   · Asiento manual y contraasiento: validación del núcleo (`crearAsiento` → cuadre, cuentas hoja del plan, ejercicio abierto)
//     ANTES de tocar la BD; la BD lo vuelve a exigir (triggers de 0001). Número correlativo bajo bloqueo del ejercicio.
//   · Puerto de hechos: idempotente por (empresa, app, tipo, ref). Un hecho NUNCA se pierde:
//       - el núcleo no sabe traducirlo (importes incoherentes, nómina que no cuadra…) → `rechazado` con motivo (queda registrado);
//       - se traduce pero el asiento no entra (cuenta que no existe/no es hoja, ejercicio cerrado o inexistente) → `pendiente_de_regla`
//         (bandeja «por clasificar» del gestor);
//       - todo bien → `asentado`.
//     Misma clave con OTRO contenido → `conflicto` (409): nunca se pisa en silencio.
import {
  asientoDesdeHecho, combinarReglas, crearAsiento, rectificar, ErrorContable, REGLAS_PGC,
  type Asiento, type Cuenta, type EjercicioContable, type HechoContable, type PlanDeCuentas, type ReglasAsiento,
} from '@central/module-contabilidad'
import type { FilaCuenta, FilaEjercicio, RepoContable, Actor } from './repo.ts'
import type { TipoHecho } from './hecho-entrada.ts'
import { huella } from './huella.ts'

export function planDesdeFilas(filas: readonly FilaCuenta[]): PlanDeCuentas {
  const cuentas: Record<string, Cuenta> = {}
  for (const f of filas) {
    // Una cuenta desactivada sigue existiendo (tiene historia) pero NO admite apuntes nuevos.
    cuentas[f.codigo] = { codigo: f.codigo, nombre: f.nombre, grupo: f.grupo, naturaleza: f.naturaleza, admiteApuntes: f.admiteApuntes && f.activa }
  }
  return { cuentas }
}

export function ejercicioContable(e: FilaEjercicio): EjercicioContable {
  return { anio: e.anio, inicio: e.inicio, fin: e.fin, abierto: e.estado === 'abierto' }
}

/** Reglas efectivas: genérica (REGLAS_PGC) ← regla vigente de la empresa. Solo se aceptan códigos con forma de cuenta. */
export function reglasEfectivas(overrides: Partial<Record<TipoHecho, Record<string, string>>>): ReglasAsiento {
  const limpio = (tipo: keyof ReglasAsiento) => {
    const o = overrides[tipo] ?? {}
    const validas = Object.keys(REGLAS_PGC[tipo])
    return Object.fromEntries(Object.entries(o).filter(([k, v]) => validas.includes(k) && /^[1-9][0-9]{2,11}$/.test(v)))
  }
  return combinarReglas(REGLAS_PGC, {
    venta: limpio('venta'), compra: limpio('compra'), cobro: limpio('cobro'), pago: limpio('pago'), nomina: limpio('nomina'),
  })
}

export const hashAsiento = (a: Pick<Asiento, 'fecha' | 'ejercicio' | 'concepto' | 'apuntes' | 'origen' | 'rectificaA'>) =>
  huella({ fecha: a.fecha, ejercicio: a.ejercicio, concepto: a.concepto, origen: a.origen ?? null, rectificaA: a.rectificaA ?? null,
    apuntes: a.apuntes.map((p) => ({ cuenta: p.cuenta, debe: p.debe, haber: p.haber, documento: p.documento ?? null })) })

type Meta = { actor: Actor; usuarioId?: string | null }

export type ResultadoAsiento = { ok: true; id: string; numero: number } | { ok: false; errores: string[] }

/** Contexto contable de la empresa para validar un asiento del ejercicio `anio`. */
async function contexto(repo: RepoContable, anio: number): Promise<{ plan: PlanDeCuentas; ejercicio: EjercicioContable } | { error: string }> {
  const ej = await repo.ejercicio(anio)
  if (!ej) return { error: `no existe el ejercicio ${anio}` }
  return { plan: planDesdeFilas(await repo.planCuentas()), ejercicio: ejercicioContable(ej) }
}

async function persistir(
  repo: RepoContable, a: Asiento, extra: { origen: 'manual' | 'hecho' | 'rectificacion'; hechoId?: string; reversaDe?: string }, meta: Meta,
): Promise<{ id: string; numero: number }> {
  const numero = await repo.reservarNumero(a.ejercicio)
  const id = await repo.insertarAsiento({
    ejercicio: a.ejercicio, numero, fecha: a.fecha, concepto: a.concepto, origen: extra.origen,
    ...(a.origen ? { origenTipo: a.origen.tipo, origenRef: a.origen.ref } : {}),
    ...(extra.hechoId ? { hechoId: extra.hechoId } : {}),
    ...(extra.reversaDe ? { reversaDe: extra.reversaDe } : {}),
    hash: hashAsiento(a), creadoPor: meta.usuarioId ?? null, apuntes: a.apuntes,
  })
  await repo.auditar({ actor: meta.actor, usuarioId: meta.usuarioId ?? null, accion: 'asentar', entidad: 'asientos', entidadId: id, detalle: { numero, origen: extra.origen } })
  return { id, numero }
}

/** Asiento manual: valida cuadre/cuentas/ejercicio con el núcleo y lo guarda con su número correlativo. */
export async function registrarAsientoManual(
  repo: RepoContable,
  entrada: { fecha: string; concepto: string; apuntes: { cuenta: string; debe: number; haber: number; documento?: string }[] },
  meta: Meta,
): Promise<ResultadoAsiento> {
  if (typeof entrada?.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha)) return { ok: false, errores: ['fecha inválida'] }
  const anio = Number(entrada.fecha.slice(0, 4))
  const ctx = await contexto(repo, anio)
  if ('error' in ctx) return { ok: false, errores: [ctx.error] }
  let a: Asiento
  try {
    a = crearAsiento({ fecha: entrada.fecha, ejercicio: anio, concepto: entrada.concepto, apuntes: entrada.apuntes, origen: { tipo: 'manual', ref: 'manual' } }, ctx.plan, ctx.ejercicio)
  } catch (e) {
    if (e instanceof ErrorContable) return { ok: false, errores: e.message.split('; ') }
    throw e
  }
  return { ok: true, ...(await persistir(repo, a, { origen: 'manual' }, meta)) }
}

/** Contraasiento de un asiento existente (el original no se toca). Una sola rectificación por asiento. */
export async function rectificarAsiento(repo: RepoContable, asientoId: string, fecha: string, meta: Meta): Promise<ResultadoAsiento> {
  const original = await repo.asiento(asientoId)
  if (!original) return { ok: false, errores: ['asiento no encontrado'] }
  if (original.rectificadoPor) return { ok: false, errores: ['ese asiento ya está rectificado'] }
  if (original.origen === 'rectificacion') return { ok: false, errores: ['un contraasiento no se rectifica: asienta de nuevo el movimiento correcto'] }
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, errores: ['fecha inválida'] }
  const anio = Number(fecha.slice(0, 4))
  const ctx = await contexto(repo, anio)
  if ('error' in ctx) return { ok: false, errores: [ctx.error] }
  const contra = rectificar(
    { numero: original.numero, fecha: original.fecha, ejercicio: original.ejercicio, concepto: original.concepto,
      apuntes: original.apuntes.map((p) => ({ cuenta: p.cuenta, debe: p.debe, haber: p.haber, ...(p.documento ? { documento: p.documento } : {}) })) },
    { fecha, ejercicio: anio, concepto: `Rectificación del asiento ${original.numero}/${original.ejercicio}: ${original.concepto}` },
  )
  let valido: Asiento
  try {
    valido = crearAsiento({ ...contra, origen: { tipo: 'manual', ref: `rectifica:${original.id}` } }, ctx.plan, ctx.ejercicio)
  } catch (e) {
    if (e instanceof ErrorContable) return { ok: false, errores: e.message.split('; ') }
    throw e
  }
  return { ok: true, ...(await persistir(repo, valido, { origen: 'rectificacion', reversaDe: original.id }, meta)) }
}

export type ResultadoHecho =
  | { resultado: 'asentado'; hechoId: string; asientoId: string; duplicado: boolean }
  | { resultado: 'pendiente_de_regla' | 'rechazado'; hechoId: string; motivo: string; duplicado: boolean }
  | { resultado: 'conflicto'; hechoId: string; motivo: string }

/** Puerto de hechos (idempotente). `app` = vertical de origen ya autenticada y autorizada para esta empresa. */
export async function recibirHecho(repo: RepoContable, app: string, hecho: HechoContable): Promise<ResultadoHecho> {
  const tipo = hecho.tipo as TipoHecho
  const huellaHecho = huella(hecho)
  const previo = async (): Promise<ResultadoHecho> => {
    const h = await repo.hechoPorClave(app, tipo, hecho.ref)
    if (!h) throw new Error('hecho desaparecido tras el conflicto de clave')
    if (h.huella !== huellaHecho) return { resultado: 'conflicto', hechoId: h.id, motivo: 'ya existe un hecho con esa referencia y contenido distinto' }
    return h.estado === 'asentado'
      ? { resultado: 'asentado', hechoId: h.id, asientoId: h.asientoId as string, duplicado: true }
      : { resultado: h.estado, hechoId: h.id, motivo: h.motivo ?? '', duplicado: true }
  }
  if (await repo.hechoPorClave(app, tipo, hecho.ref)) return previo()
  const hechoId = await repo.insertarHecho({ app, tipo, ref: hecho.ref, fecha: hecho.fecha, payload: hecho, huella: huellaHecho })
  // Otra petición simultánea lo registró entre la lectura y el INSERT: se responde lo que ELLA dejó.
  if (!hechoId) return previo()
  const meta: Meta = { actor: `puerto:${app}` }

  const cerrar = async (estado: 'pendiente_de_regla' | 'rechazado', motivo: string): Promise<ResultadoHecho> => {
    await repo.cerrarHecho(hechoId, estado, motivo, null)
    await repo.auditar({ actor: meta.actor, accion: estado, entidad: 'hechos_contables', entidadId: hechoId, detalle: { motivo } })
    return { resultado: estado, hechoId, motivo, duplicado: false }
  }

  let propuesto: Asiento
  try {
    propuesto = asientoDesdeHecho(hecho, reglasEfectivas(await repo.reglasVigentes()))
  } catch (e) {
    if (e instanceof ErrorContable) return cerrar('rechazado', `${e.codigo}: ${e.message}`)
    throw e
  }
  const ctx = await contexto(repo, propuesto.ejercicio)
  if ('error' in ctx) return cerrar('pendiente_de_regla', ctx.error)
  let valido: Asiento
  try {
    valido = crearAsiento(propuesto, ctx.plan, ctx.ejercicio)
  } catch (e) {
    if (e instanceof ErrorContable) return cerrar('pendiente_de_regla', e.message)
    throw e
  }
  const { id } = await persistir(repo, valido, { origen: 'hecho', hechoId }, meta)
  await repo.cerrarHecho(hechoId, 'asentado', null, id)
  return { resultado: 'asentado', hechoId, asientoId: id, duplicado: false }
}
