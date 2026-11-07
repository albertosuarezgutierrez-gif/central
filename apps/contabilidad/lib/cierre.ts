// Casos de uso de la FASE 5 sobre los repositorios de UNA empresa (inyectados; tests con fakes): inmovilizado y amortizaciones, periodificaciones,
// cierre/apertura del ejercicio y cuentas anuales. Sin BD directa.
//
//   · Todo asiento pasa por el núcleo (`crearAsiento`: cuadre, cuentas hoja del plan, ejercicio ABIERTO) ANTES de tocar la BD; la BD lo exige otra vez.
//   · Idempotencia por (origen_tipo, origen_ref) — `amortizacion:2026-03`, `periodificacion:2026`, `cierre:2026`… — y bajo el bloqueo de la fila del ejercicio.
//   · Un ejercicio cerrado es DEFINITIVO: no admite asientos; se corrige con un contraasiento en un ejercicio abierto.
//   · Los casos de uso devuelven `{ ok: false, errores }`; quien los ejecuta en una transacción REVIERTE (ver `cierre-carga.ts`): todo o nada.
import {
  amortizacionAcumuladaHasta, asientoAltaInmovilizado, asientoAmortizacion, asientoPeriodificacion, asientoReversaPeriodificacion, balanceAbreviado,
  bajaActivo, crearAsiento, cuadroAmortizacion, ejercicioNatural, ErrorContable, fichaDesdeEntrada, filaDeTabla, memoriaBorrador, prepararCierre,
  pygAbreviada, refAmortizacion, refPeriodificacion, repartirPeriodificacion, validarPeriodificacion,
  TABLA_AMORTIZACION_DEFECTO,
  type Asiento, type BalanceAbreviado, type EntradaInmovilizado, type FichaActivo, type FilaTablaAmortizacion, type MemoriaBorrador, type Periodificacion,
  type PyGAbreviada, type SaldoCuenta,
} from '@central/module-contabilidad'
import type { OrigenAsientoBd, RepoContable } from './repo.ts'
import type { FilaActivo, RepoF5 } from './repo-f5.ts'
import { hashAsiento, planDesdeFilas, ejercicioContable } from './servicio.ts'

export type MetaCierre = { usuarioId: string | null; hoy: Date; /** Para tests: referencia fija del activo. */ ref?: string }
type Res<T> = ({ ok: true } & T) | { ok: false; errores: string[] }

const fallo = (...errores: string[]): { ok: false; errores: string[] } => ({ ok: false, errores })
const iso = (d: Date) => d.toISOString().slice(0, 10)
const mesStr = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}`
const ultimoDia = (anio: number, mes: number) => `${mesStr(anio, mes)}-${String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, '0')}`

type CuotasPorAnio = Map<number, { cuota: number; ultimoMes: number; meses: string[] }>

/**
 * Cuotas del bien (cuadro SIN baja) de meses cuyo periodo YA tiene su asiento de amortización (mensual o anual), a partir de `desdeMes` (exclusive si
 * `exclusivo`). Es la amortización que ya se contabilizó sin este bien (alta con fecha antigua) o con él tras su baja (baja anticipada).
 */
async function cuotasYaAsentadas(f5: RepoF5, ficha: FichaActivo, desdeMes: string, exclusivo: boolean, hoy: Date): Promise<CuotasPorAnio> {
  const r: CuotasPorAnio = new Map()
  const anuales = new Map<number, boolean>()
  const anioHoy = Number(iso(hoy).slice(0, 4))
  for (const fila of cuadroAmortizacion({ ...ficha, fechaBaja: null })) {
    if (exclusivo ? fila.mes <= desdeMes : fila.mes < desdeMes) continue
    const [a, m] = fila.mes.split('-').map(Number)
    if (a > anioHoy) break
    if (fila.cuota <= 0) continue
    if (!anuales.has(a)) anuales.set(a, !!(await f5.asientoPorOrigen('amortizacion', refAmortizacion({ anio: a }))))
    const asentada = anuales.get(a) || !!(await f5.asientoPorOrigen('amortizacion', refAmortizacion({ anio: a, mes: m })))
    if (!asentada) continue
    const x = r.get(a) ?? { cuota: 0, ultimoMes: 0, meses: [] }
    x.cuota += fila.cuota; x.ultimoMes = anuales.get(a) ? 12 : Math.max(x.ultimoMes, m); x.meses.push(fila.mes)
    r.set(a, x)
  }
  return r
}

/** Todos los ejercicios afectados deben estar ABIERTOS; devuelve el mensaje de error o null. */
async function ejerciciosAbiertos(f5: RepoF5, anios: Iterable<number>, que: string): Promise<string | null> {
  for (const a of anios) {
    const ej = await f5.ejercicioBloqueado(a)
    if (!ej) return `no existe el ejercicio ${a}, ${que}`
    if (ej.estado !== 'abierto') return `el ejercicio ${a} está ${ej.estado === 'cerrado' ? 'cerrado' : 'en cierre'}, ${que}`
  }
  return null
}

/** Tabla de amortización vigente de la empresa (la última versión guardada) o la de defecto. */
export async function tablaVigente(f5: RepoF5): Promise<{ version: number | null; filas: readonly FilaTablaAmortizacion[] }> {
  const t = await f5.tablaAmortizacion().catch(() => null)
  return t ? { version: t.version, filas: t.filas } : { version: null, filas: TABLA_AMORTIZACION_DEFECTO }
}

const aFicha = (a: FilaActivo): FichaActivo => ({
  ref: a.ref, origen: a.origen, refExterna: a.refExterna, descripcion: a.descripcion, categoria: a.categoria, cuentaActivo: a.cuentaActivo,
  cuentaAmortizacionAcumulada: a.cuentaAmortizacionAcumulada, cuentaGasto: a.cuentaGasto, fechaAlta: a.fechaAlta, valorAdquisicion: a.valorAdquisicion,
  valorResidual: a.valorResidual, porcentajePb: a.porcentajePb, metodo: 'lineal', yaContabilizado: a.yaContabilizado, fechaBaja: a.fechaBaja ?? null,
})
export const fichasDe = (xs: readonly FilaActivo[]): FichaActivo[] => xs.map(aFicha)

async function contexto(repo: RepoContable, anio: number) {
  const ej = await repo.ejercicio(anio)
  if (!ej) return null
  return { plan: planDesdeFilas(await repo.planCuentas()), ejercicio: ejercicioContable(ej), fila: ej }
}

type OrigenPersistido = { origen: OrigenAsientoBd }

/** Valida con el núcleo y guarda (número correlativo bajo el bloqueo del ejercicio). Lanza `ErrorContable` si no es válido. */
async function persistir(repo: RepoContable, a: Asiento, p: OrigenPersistido, meta: MetaCierre): Promise<{ id: string; numero: number }> {
  const ctx = await contexto(repo, a.ejercicio)
  if (!ctx) throw new ErrorContable('ejercicio_inexistente', `no existe el ejercicio ${a.ejercicio}`)
  const valido = crearAsiento(a, ctx.plan, ctx.ejercicio)
  const numero = await repo.reservarNumero(a.ejercicio)
  const id = await repo.insertarAsiento({
    ejercicio: a.ejercicio, numero, fecha: a.fecha, concepto: a.concepto, origen: p.origen,
    ...(valido.origen ? { origenTipo: valido.origen.tipo, origenRef: valido.origen.ref } : {}),
    hash: hashAsiento(valido), creadoPor: meta.usuarioId, apuntes: valido.apuntes,
  })
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'asentar', entidad: 'asientos', entidadId: id, detalle: { numero, origen: valido.origen?.tipo ?? p.origen, ref: valido.origen?.ref ?? null } })
  return { id, numero }
}

const mensajes = (e: unknown): string[] | null => (e instanceof ErrorContable ? e.message.split('; ') : null)

// ── Inmovilizado ──────────────────────────────────────────────────────────────────────────────────────────────
export type ResultadoAlta = Res<{ ref: string; duplicado: boolean; asientoAltaId: string | null; avisos: string[] }>

/**
 * Alta de un bien (a mano o desde otra vertical, p. ej. RRHH). IDEMPOTENTE por (origen, refExterna): repetirla devuelve la ficha existente.
 * Si NO pasó por una factura asentada (`yaContabilizado: false`) se asienta el alta contra `cuentaContrapartida` (por defecto 572).
 */
export async function altaActivo(repo: RepoContable, f5: RepoF5, entrada: EntradaInmovilizado, o: { cuentaContrapartida?: string }, meta: MetaCierre): Promise<ResultadoAlta> {
  const previo = await f5.activoPorOrigen(String(entrada?.origen ?? ''), String(entrada?.refExterna ?? ''))
  if (previo) {
    const distinto = previo.valorAdquisicion !== entrada.valorAdquisicion || previo.fechaAlta !== entrada.fechaAlta || previo.categoria !== entrada.categoria
    return distinto ? fallo(`ya existe el bien ${previo.ref} (${entrada.origen}/${entrada.refExterna}) con otros datos: las fichas no se editan, da de baja y vuelve a dar de alta`)
      : { ok: true, ref: previo.ref, duplicado: true, asientoAltaId: previo.asientoAltaId, avisos: [] }
  }
  const tabla = await tablaVigente(f5)
  const ref = meta.ref ?? `A-${String(entrada?.fechaAlta ?? '').slice(0, 4)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  let ficha: FichaActivo
  try { ficha = fichaDesdeEntrada(entrada, ref, tabla.filas) } catch (e) { const m = mensajes(e); if (m) return fallo(...m); throw e }
  // Un ejercicio cerrado es definitivo: ni el bien ni su amortización atrasada pueden entrar en él.
  const anioAlta = Number(ficha.fechaAlta.slice(0, 4))
  const ejAlta = await f5.ejercicioBloqueado(anioAlta)
  if (ejAlta && ejAlta.estado !== 'abierto') return fallo(`la fecha de alta ${ficha.fechaAlta} cae en el ejercicio ${anioAlta}, que está ${ejAlta.estado === 'cerrado' ? 'cerrado' : 'en cierre'}: no admite altas`)
  // Alta con fecha antigua: la amortización de los periodos YA asentados (sin este bien) se asienta ahora, año a año, en su ejercicio (debe estar abierto).
  const atrasadas = await cuotasYaAsentadas(f5, ficha, ficha.fechaAlta.slice(0, 7), false, meta.hoy)
  const errAtrasada = await ejerciciosAbiertos(f5, atrasadas.keys(), 'y la amortización atrasada del bien debe asentarse en él: revisa la fecha de alta')
  if (errAtrasada) return fallo(errAtrasada)
  let asientoAltaId: string | null = null
  try {
    if (!ficha.yaContabilizado) {
      const r = await persistir(repo, asientoAltaInmovilizado(ficha, o.cuentaContrapartida ?? '572'), { origen: 'manual' }, meta)
      asientoAltaId = r.id
    }
  } catch (e) { const m = mensajes(e); if (m) return fallo(...m); throw e }
  const id = await f5.insertarActivo({ ficha, usuarioId: meta.usuarioId, asientoAltaId })
  if (!id) return fallo('otra petición dio de alta el mismo bien a la vez: repite la operación')
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'alta_activo', entidad: 'activos_fijos', entidadId: id, detalle: { ref, origen: ficha.origen, refExterna: ficha.refExterna } })
  const avisos: string[] = []
  try {
    for (const [a, x] of [...atrasadas.entries()].sort(([p], [q]) => p - q)) {
      const asiento: Asiento = {
        fecha: ultimoDia(a, x.ultimoMes), ejercicio: a, concepto: `Amortización atrasada de ${ficha.descripcion} (${x.meses[0]} a ${x.meses[x.meses.length - 1]})`,
        apuntes: [{ cuenta: ficha.cuentaGasto, debe: x.cuota, haber: 0, documento: ficha.ref }, { cuenta: ficha.cuentaAmortizacionAcumulada, debe: 0, haber: x.cuota, documento: ficha.ref }],
        origen: { tipo: 'manual', ref: `amortizacion-atrasada:${ficha.ref}:${a}` },
      }
      await persistir(repo, asiento, { origen: 'manual' }, meta)
      avisos.push(`Se asentó la amortización atrasada de ${a} (${x.meses.length} mes(es), ya asentados sin este bien).`)
    }
  } catch (e) { const m = mensajes(e); if (m) return fallo(...m); throw e }
  return { ok: true, ref, duplicado: false, asientoAltaId, avisos }
}

export type ResultadoAmortizacion = Res<{ duplicado: boolean; sinCuota: boolean; asientoId: string | null; importe: number }>

/** Asienta la amortización del mes (o del año completo). Idempotente por periodo; el anual y los mensuales de un mismo año no conviven. */
export async function amortizarPeriodo(repo: RepoContable, f5: RepoF5, p: { anio: number; mes?: number }, meta: MetaCierre): Promise<ResultadoAmortizacion> {
  if (!Number.isInteger(p.anio) || p.anio < 2000 || p.anio > 2200 || (p.mes !== undefined && (!Number.isInteger(p.mes) || p.mes < 1 || p.mes > 12))) return fallo('periodo inválido')
  const hoy = iso(meta.hoy)
  const finPeriodo = p.mes !== undefined ? `${mesStr(p.anio, p.mes)}-01` : `${p.anio}-01-01`
  if (finPeriodo > hoy) return fallo('el periodo todavía no ha empezado')
  const ej = await f5.ejercicioBloqueado(p.anio)
  if (!ej) return fallo(`no existe el ejercicio ${p.anio}`)
  if (ej.estado !== 'abierto') return fallo(`el ejercicio ${p.anio} está ${ej.estado === 'cerrado' ? 'cerrado' : 'en cierre'}: no admite asientos`)
  const ref = refAmortizacion(p)
  const previo = await f5.asientoPorOrigen('amortizacion', ref)
  if (previo) return { ok: true, duplicado: true, sinCuota: false, asientoId: previo.id, importe: 0 }
  if (p.mes === undefined) {
    for (let m = 1; m <= 12; m++) if (await f5.asientoPorOrigen('amortizacion', refAmortizacion({ anio: p.anio, mes: m }))) return fallo(`ya hay amortización MENSUAL asentada en ${p.anio}: no se puede asentar también la anual`)
  } else if (await f5.asientoPorOrigen('amortizacion', refAmortizacion({ anio: p.anio }))) return fallo(`ya hay amortización ANUAL asentada en ${p.anio}`)
  const a = asientoAmortizacion(fichasDe(await f5.activos()), p)
  if (!a) return { ok: true, duplicado: false, sinCuota: true, asientoId: null, importe: 0 }
  try {
    const r = await persistir(repo, a, { origen: 'manual' }, meta)
    return { ok: true, duplicado: false, sinCuota: false, asientoId: r.id, importe: a.apuntes.reduce((t, x) => t + x.debe, 0) }
  } catch (e) { const m = mensajes(e); if (m) return fallo(...m); throw e }
}

export type ResultadoBaja = Res<{ resultado: number; valorNetoContable: number; asientoId: string; /** Céntimos de amortización posterior a la baja ya asentada y revertida. */ ajusteAmortizacion: number }>

/**
 * Baja o venta de un bien: exige la amortización asentada hasta el mes de la baja y deja el resultado en 671/771.
 * Si ya hay amortización asentada DESPUÉS de la baja (el bien seguía en las fichas), el exceso se revierte con un asiento D 281 / H 681 por ejercicio,
 * fechado en el último mes asentado de ese ejercicio: cada ejercicio corrige su propio gasto sobrante (PGC: no se amortiza un bien dado de baja, y un
 * ejercicio aún abierto se corrige dentro de sí mismo, sin pasar por 120/121). Si ese ejercicio ya está cerrado NO se toca (es definitivo): se rechaza.
 */
export async function bajaDeActivo(
  repo: RepoContable, f5: RepoF5, entrada: { ref: string; fecha: string; precioVenta?: number; cuentaContrapartida?: string }, meta: MetaCierre,
): Promise<ResultadoBaja> {
  const activo = await f5.activoPorRef(String(entrada?.ref ?? ''))
  if (!activo) return fallo('activo no encontrado')
  if (activo.estado === 'baja') return fallo('ese activo ya está dado de baja')
  const ficha = aFicha(activo)
  if (typeof entrada.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha)) return fallo('fecha de baja inválida')
  const anio = Number(entrada.fecha.slice(0, 4))
  const ej = await f5.ejercicioBloqueado(anio)
  if (!ej) return fallo(`no existe el ejercicio ${anio}`)
  if (ej.estado !== 'abierto') return fallo(`el ejercicio ${anio} está cerrado: no admite la baja`)
  const mesBaja = entrada.fecha.slice(0, 7)
  const filas = cuadroAmortizacion({ ...ficha, fechaBaja: null }, mesBaja)
  const ultimo = filas.length ? filas[filas.length - 1] : null
  if (ultimo) {
    const [a, m] = ultimo.mes.split('-').map(Number)
    const asentada = (await f5.asientoPorOrigen('amortizacion', refAmortizacion({ anio: a, mes: m }))) ?? (await f5.asientoPorOrigen('amortizacion', refAmortizacion({ anio: a })))
    if (!asentada) return fallo(`asienta primero la amortización hasta ${ultimo.mes} (el neto contable de la baja depende de ella)`)
  }
  const acumulada = amortizacionAcumuladaHasta({ ...ficha, fechaBaja: null }, mesBaja)
  const exceso = await cuotasYaAsentadas(f5, ficha, mesBaja, true, meta.hoy)
  const errExceso = await ejerciciosAbiertos(f5, exceso.keys(), 'pero ya tiene amortización posterior a la baja asentada y no puede revertirse: corrígelo con un asiento manual en un ejercicio abierto')
  if (errExceso) return fallo(`no se puede dar de baja: ${errExceso}`)
  let r: ReturnType<typeof bajaActivo>
  try {
    r = bajaActivo(ficha, { fecha: entrada.fecha, amortizacionAcumulada: acumulada, ...(entrada.precioVenta !== undefined ? { precioVenta: entrada.precioVenta } : {}), ...(entrada.cuentaContrapartida ? { cuentaContrapartida: entrada.cuentaContrapartida } : {}) })
    const ap = await persistir(repo, r.asiento, { origen: 'manual' }, meta)
    let ajuste = 0
    for (const [a, x] of [...exceso.entries()].sort(([p], [q]) => p - q)) {
      await persistir(repo, {
        fecha: ultimoDia(a, x.ultimoMes), ejercicio: a, concepto: `Ajuste de amortización posterior a la baja de ${ficha.descripcion}`,
        apuntes: [{ cuenta: ficha.cuentaAmortizacionAcumulada, debe: x.cuota, haber: 0, documento: ficha.ref }, { cuenta: ficha.cuentaGasto, debe: 0, haber: x.cuota, documento: ficha.ref }],
        origen: { tipo: 'manual', ref: `baja-activo-ajuste:${ficha.ref}:${a}` },
      }, { origen: 'manual' }, meta)
      ajuste += x.cuota
    }
    const ok = await f5.darDeBajaActivo(ficha.ref, { fecha: entrada.fecha, precioVenta: entrada.precioVenta ?? null, resultado: r.resultado, asientoId: ap.id })
    if (!ok) return fallo('el activo ya estaba dado de baja')
    await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'baja_activo', entidad: 'activos_fijos', entidadId: activo.id, detalle: { ref: ficha.ref, resultado: r.resultado } })
    return { ok: true, resultado: r.resultado, valorNetoContable: r.valorNetoContable, asientoId: ap.id, ajusteAmortizacion: ajuste }
  } catch (e) { const m = mensajes(e); if (m) return fallo(...m); throw e }
}

export type ResultadoTabla = Res<{ version: number }>

/** Guarda una NUEVA versión de la tabla de amortización (las fichas ya dadas de alta conservan su %). */
export async function guardarTabla(f5: RepoF5, filas: readonly FilaTablaAmortizacion[], meta: MetaCierre): Promise<ResultadoTabla> {
  const errs: string[] = []
  if (!filas.length) errs.push('la tabla no puede estar vacía')
  const vistas = new Set<string>()
  for (const f of filas) {
    if (!f.categoria || !/^[a-z0-9_]{1,40}$/.test(f.categoria)) errs.push(`categoría no válida: ${String(f.categoria)}`)
    if (vistas.has(f.categoria)) errs.push(`categoría repetida: ${f.categoria}`)
    vistas.add(f.categoria)
    for (const c of [f.cuentaActivo, f.cuentaAmortizacionAcumulada, f.cuentaGasto]) if (!/^[1-9][0-9]{2,11}$/.test(c)) errs.push(`cuenta no válida en ${f.categoria}: ${c}`)
    if (!Number.isInteger(f.porcentajeMaximoPb) || f.porcentajeMaximoPb < 1 || f.porcentajeMaximoPb > 10000) errs.push(`porcentaje no válido en ${f.categoria}`)
    if (!Number.isInteger(f.periodoMaximoAnios) || f.periodoMaximoAnios < 1 || f.periodoMaximoAnios > 200) errs.push(`periodo no válido en ${f.categoria}`)
    if (!f.descripcion?.trim()) errs.push(`descripción vacía en ${f.categoria}`)
  }
  if (errs.length) return fallo(...errs)
  return { ok: true, version: await f5.guardarTablaAmortizacion(filas, meta.usuarioId) }
}

// ── Periodificaciones ─────────────────────────────────────────────────────────────────────────────────────────
export async function altaPeriodificacion(f5: RepoF5, p: Periodificacion, meta: MetaCierre): Promise<Res<{ duplicado: boolean }>> {
  const errs = validarPeriodificacion(p)
  if (errs.length) return fallo(...errs)
  const nueva = await f5.insertarPeriodificacion(p, meta.usuarioId)
  return nueva ? { ok: true, duplicado: false } : fallo(`ya existe una periodificación con la referencia ${p.ref}`)
}

export type ResultadoPeriodificar = Res<{ duplicado: boolean; sinNada: boolean; asientoId: string | null; reversaId: string | null }>

/** Asiento de periodificación al 31/12 (480/485) y su reversa el 1/1 del ejercicio siguiente. Idempotente. */
export async function periodificarCierre(repo: RepoContable, f5: RepoF5, anio: number, meta: MetaCierre): Promise<ResultadoPeriodificar> {
  const ej = await f5.ejercicioBloqueado(anio)
  if (!ej) return fallo(`no existe el ejercicio ${anio}`)
  if (ej.estado !== 'abierto') return fallo(`el ejercicio ${anio} está cerrado: no admite asientos`)
  const previo = await f5.asientoPorOrigen('periodificacion', refPeriodificacion(anio))
  if (previo) return { ok: true, duplicado: true, sinNada: false, asientoId: previo.id, reversaId: (await f5.asientoPorOrigen('periodificacion', `periodificacion-reversa:${anio + 1}`))?.id ?? null }
  const a = asientoPeriodificacion(await f5.periodificaciones(), anio)
  if (!a) return { ok: true, duplicado: false, sinNada: true, asientoId: null, reversaId: null }
  try {
    const sig = await asegurarEjercicio(repo, anio + 1)
    if (!sig.abierto) return fallo(`el ejercicio ${anio + 1} no está abierto: no se puede asentar la reversa`)
    const c = await persistir(repo, a, { origen: 'manual' }, meta)
    const r = await persistir(repo, asientoReversaPeriodificacion(a), { origen: 'manual' }, meta)
    return { ok: true, duplicado: false, sinNada: false, asientoId: c.id, reversaId: r.id }
  } catch (e) { const m = mensajes(e); if (m) return fallo(...m); throw e }
}

/** El ejercicio natural `anio`: existente o recién creado (abierto). */
async function asegurarEjercicio(repo: RepoContable, anio: number) {
  const e = await repo.ejercicio(anio)
  if (e) return { abierto: e.estado === 'abierto' }
  const n = ejercicioNatural(anio)
  await repo.crearEjercicio({ anio, inicio: n.inicio, fin: n.fin, estado: 'abierto' })
  return { abierto: true }
}

// ── Cierre del ejercicio ──────────────────────────────────────────────────────────────────────────────────────
export type Comprobacion = { clave: string; titulo: string; ok: boolean; bloquea: boolean; detalle: string }

/** Lista de comprobaciones previas al cierre. `puedeCerrar` = ninguna que bloquee está en rojo. */
export async function diagnosticoCierre(repo: RepoContable, f5: RepoF5, anio: number, hoy: Date): Promise<{ comprobaciones: Comprobacion[]; puedeCerrar: boolean; resultadoProvisional: number | null }> {
  const cs: Comprobacion[] = []
  const ej = await repo.ejercicio(anio)
  cs.push({ clave: 'abierto', titulo: 'Ejercicio abierto', ok: !!ej && ej.estado === 'abierto', bloquea: true, detalle: !ej ? `No existe el ejercicio ${anio}.` : ej.estado === 'abierto' ? `El ejercicio ${anio} está abierto.` : `El ejercicio ${anio} ya está ${ej.estado === 'cerrado' ? 'cerrado (definitivo)' : 'en cierre'}.` })
  const terminado = iso(hoy) >= `${anio + 1}-01-01`
  cs.push({ clave: 'terminado', titulo: 'Ejercicio terminado', ok: terminado, bloquea: true, detalle: terminado ? `Terminó el 31/12/${anio}.` : `Aún no ha terminado (31/12/${anio}).` })
  // Amortización: cada mes con cuota debe tener su asiento (mensual o anual).
  const fichas = fichasDe(await f5.activos())
  const mesesConCuota = new Set<number>()
  for (const f of fichas) for (const x of cuadroAmortizacion(f)) if (x.mes.startsWith(`${anio}-`) && x.cuota > 0) mesesConCuota.add(Number(x.mes.slice(5, 7)))
  const anual = await f5.asientoPorOrigen('amortizacion', refAmortizacion({ anio }))
  const faltan: number[] = []
  if (!anual) for (const m of [...mesesConCuota].sort((a, b) => a - b)) if (!(await f5.asientoPorOrigen('amortizacion', refAmortizacion({ anio, mes: m })))) faltan.push(m)
  cs.push({ clave: 'amortizacion', titulo: 'Amortización asentada', ok: faltan.length === 0, bloquea: true, detalle: mesesConCuota.size === 0 ? 'No hay bienes que amortizar en el ejercicio.' : faltan.length ? `Falta la amortización de ${faltan.map((m) => mesStr(anio, m)).join(', ')} (o asienta la anual).` : 'La amortización del ejercicio está asentada.' })
  // Periodificaciones con importe que diferir sin asiento de cierre.
  const per = await f5.periodificaciones()
  const conDiferido = per.filter((p) => repartirPeriodificacion(p, `${anio}-12-31`).diferido > 0)
  const hayAsientoPer = !!(await f5.asientoPorOrigen('periodificacion', refPeriodificacion(anio)))
  cs.push({ clave: 'periodificaciones', titulo: 'Periodificaciones asentadas', ok: conDiferido.length === 0 || hayAsientoPer, bloquea: true, detalle: conDiferido.length === 0 ? 'Nada que periodificar.' : hayAsientoPer ? 'Periodificaciones asentadas.' : `${conDiferido.length} periodificación(es) con importe que diferir sin asentar.` })
  const hechos = await repo.contarHechos()
  cs.push({ clave: 'bandeja', titulo: 'Bandeja de hechos vacía', ok: hechos.pendientes === 0, bloquea: true, detalle: hechos.pendientes === 0 ? 'No hay hechos pendientes de clasificar.' : `${hechos.pendientes} hecho(s) pendiente(s) de regla: tras el cierre ya no podrán asentarse en ${anio}.` })
  const sig = await repo.ejercicio(anio + 1)
  cs.push({ clave: 'siguiente', titulo: 'Ejercicio siguiente', ok: !sig || sig.estado === 'abierto', bloquea: true, detalle: !sig ? `Se creará el ejercicio ${anio + 1} al cerrar.` : sig.estado === 'abierto' ? `El ejercicio ${anio + 1} está abierto.` : `El ejercicio ${anio + 1} no está abierto.` })
  let resultado: number | null = null
  if (ej) {
    const s = await f5.saldosEjercicio(anio, { sinCierre: true })
    resultado = s.filter((x) => x.cuenta[0] === '6' || x.cuenta[0] === '7').reduce((t, x) => t + x.haber - x.debe, 0)
    const empresa = await repo.empresa()
    const conIs = s.some((x) => x.cuenta === '630' && x.debe !== x.haber)
    cs.push({ clave: 'is', titulo: 'Impuesto sobre beneficios', ok: !(empresa?.forma === 'sociedad' && resultado > 0 && !conIs), bloquea: false,
      detalle: empresa?.forma === 'sociedad' && resultado > 0 && !conIs ? 'Hay beneficio y no consta el gasto por Impuesto sobre Sociedades (630): revisa el borrador del modelo 200 antes de cerrar.' : 'Sin aviso sobre el Impuesto sobre Sociedades.' })
  }
  return { comprobaciones: cs, puedeCerrar: cs.every((c) => c.ok || !c.bloquea), resultadoProvisional: resultado }
}

export type ResultadoCierre = Res<{ resultado: number; regularizacionId: string | null; cierreId: string | null; aperturaId: string | null; sinSaldos: boolean }>

/** Cierra el ejercicio: regularización (6/7 → 129), cierre y apertura del siguiente; después marca el ejercicio como cerrado (definitivo). Todo o nada. */
export async function cerrarEjercicio(repo: RepoContable, f5: RepoF5, anio: number, meta: MetaCierre): Promise<ResultadoCierre> {
  const ej = await f5.ejercicioBloqueado(anio)
  if (!ej) return fallo(`no existe el ejercicio ${anio}`)
  if (ej.estado !== 'abierto') return fallo(`el ejercicio ${anio} ya está ${ej.estado === 'cerrado' ? 'cerrado' : 'en cierre'}`)
  if (await f5.cierre(anio)) return fallo(`el ejercicio ${anio} ya tiene su registro de cierre`)
  const dx = await diagnosticoCierre(repo, f5, anio, meta.hoy)
  const bloqueos = dx.comprobaciones.filter((c) => c.bloquea && !c.ok)
  if (bloqueos.length) return fallo(...bloqueos.map((c) => `${c.titulo}: ${c.detalle}`))
  try {
    await asegurarEjercicio(repo, anio + 1)
    const sig = await repo.ejercicio(anio + 1)
    const ctx = await contexto(repo, anio)
    if (!ctx || !sig) return fallo('ejercicio inexistente')
    const saldos = await f5.saldosEjercicio(anio, { sinCierre: false })
    // Los saldos exactos (sin tope de asientos) se pasan como un único asiento sintético: el cierre solo necesita sumas por cuenta.
    const sintetico: Asiento = { fecha: `${anio}-12-31`, ejercicio: anio, concepto: 'saldos del ejercicio', apuntes: saldos.map((s) => ({ cuenta: s.cuenta, debe: s.debe, haber: s.haber })) }
    const plan = prepararCierre({ asientos: [sintetico], anio, plan: ctx.plan, ejercicio: ctx.ejercicio, ejercicioSiguiente: ejercicioContable(sig) })
    if (!plan.ok) return fallo(...plan.errores)
    // 0005: el registro de cierre exige asiento de cierre Y de apertura (la regularización puede faltar si no hay cuentas 6/7).
    if (!plan.plan.cierre || !plan.plan.apertura) return fallo(`el ejercicio ${anio} no tiene saldos que cerrar: no se puede cerrar un ejercicio sin asiento de cierre y de apertura`)
    const reg = plan.plan.regularizacion ? await persistir(repo, plan.plan.regularizacion, { origen: 'cierre' }, meta) : null
    const cie = await persistir(repo, plan.plan.cierre, { origen: 'cierre' }, meta)
    const ape = await persistir(repo, plan.plan.apertura, { origen: 'apertura' }, meta)
    await f5.insertarCierre({ anio, resultado: plan.plan.resultado, asientoRegularizacionId: reg?.id ?? null, asientoCierreId: cie.id, asientoAperturaId: ape.id, usuarioId: meta.usuarioId })
    if (!(await f5.cerrarEjercicio(anio))) return fallo('no se pudo marcar el ejercicio como cerrado')
    await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'cerrar_ejercicio', entidad: 'ejercicios', entidadId: String(anio), detalle: { resultado: plan.plan.resultado } })
    return { ok: true, resultado: plan.plan.resultado, regularizacionId: reg?.id ?? null, cierreId: cie.id, aperturaId: ape.id, sinSaldos: false }
  } catch (e) { const m = mensajes(e); if (m) return fallo(...m); throw e }
}

// ── Cuentas anuales ───────────────────────────────────────────────────────────────────────────────────────────
export type CuentasAnuales = {
  anio: number
  estado: 'abierto' | 'en_cierre' | 'cerrado' | null
  balance: BalanceAbreviado
  pyg: PyGAbreviada
  memoria: MemoriaBorrador
  saldos: SaldoCuenta[]
  /** Tiene ejercicio anterior con datos (columna comparativa). */
  conAnterior: boolean
}

/** Movimientos del inmovilizado por categoría en el ejercicio (valor de adquisición; amortización acumulada al 31/12). */
export function movimientosInmovilizado(activos: readonly FilaActivo[], anio: number) {
  const ini = `${anio}-01-01`
  const fin = `${anio}-12-31`
  const por = new Map<string, { categoria: string; saldoInicial: number; altas: number; bajas: number; amortizacionAcumulada: number; porcentajePb: number }>()
  for (const a of activos) {
    if (a.fechaAlta > fin) continue
    const x = por.get(a.categoria) ?? { categoria: a.categoria, saldoInicial: 0, altas: 0, bajas: 0, amortizacionAcumulada: 0, porcentajePb: a.porcentajePb }
    const bajaAntes = a.fechaBaja != null && a.fechaBaja < ini
    if (a.fechaAlta < ini && !bajaAntes) x.saldoInicial += a.valorAdquisicion
    if (a.fechaAlta >= ini) x.altas += a.valorAdquisicion
    if (a.fechaBaja != null && a.fechaBaja >= ini && a.fechaBaja <= fin) x.bajas += a.valorAdquisicion
    if (!(a.fechaBaja != null && a.fechaBaja <= fin)) x.amortizacionAcumulada += amortizacionAcumuladaHasta(aFicha(a), `${anio}-12`)
    por.set(a.categoria, x)
  }
  return [...por.values()].map((x) => ({ ...x, saldoFinal: x.saldoInicial + x.altas - x.bajas }))
}

export async function cuentasAnuales(repo: RepoContable, f5: RepoF5, anio: number): Promise<CuentasAnuales | null> {
  const ej = await repo.ejercicio(anio)
  if (!ej) return null
  const saldos = await f5.saldosEjercicio(anio, { sinCierre: true })
  const ejAnt = await repo.ejercicio(anio - 1)
  const saldosAnt = ejAnt ? await f5.saldosEjercicio(anio - 1, { sinCierre: true }) : null
  const conAnterior = !!saldosAnt && saldosAnt.length > 0
  const fecha = `${anio}-12-31`
  const balance = balanceAbreviado(saldos, fecha, conAnterior ? saldosAnt! : undefined)
  const pyg = pygAbreviada(saldos, { desde: `${anio}-01-01`, hasta: fecha }, conAnterior ? saldosAnt! : undefined)
  const empresa = await repo.empresa()
  const activos = await f5.activos().catch(() => null)
  const memoria = memoriaBorrador({
    empresa: { razonSocial: empresa?.razonSocial ?? '—', nif: empresa?.nif ?? '—' }, anio, actividad: null, balance, pyg,
    inmovilizado: activos === null ? null : movimientosInmovilizado(activos, anio).map((m) => ({ ...m, categoria: filaDeTabla(TABLA_AMORTIZACION_DEFECTO, m.categoria)?.descripcion ?? m.categoria })),
    empleadosMedios: null, ejercicioCerrado: ej.estado === 'cerrado',
  })
  return { anio, estado: ej.estado, balance, pyg, memoria, saldos, conAnterior }
}

