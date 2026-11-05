// Casos de uso de la FASE 4 (impuestos): calcular un modelo como BORRADOR, revisarlo y marcarlo como presentado (manualmente, por el titular o
// su gestor con certificado digital). Aquí NO se envía nada a la AEAT: «presentado» es un registro de fecha + referencia del justificante
// (texto) y, si procede, los asientos de liquidación/pago. Sin BD: todo entra por los repositorios inyectados (probado con fakes).
import {
  asientosDePresentacion, calcularModelo111, calcularModelo115, calcularModelo130, calcularModelo180, calcularModelo190, calcularModelo303,
  calcularModelo347, calcularModelo349, calcularModelo390, acumuladoDeAsientos, esModeloAnual, importeDe, libroRegistroIva, cuadrarLibrosConMayor,
  problemasParaRevisar, problemasPresentacion, rangoDeModelo, ErrorContable,
  type AcumuladoRendimiento, type CalculoModelo, type CuadreIva, type DatosPresentacion, type ModeloAeat, type PeriodoModelo, type SumaCuenta, type Asiento,
} from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'
import type { FilaDeclaracion, NuevaDeclaracion, RepoF4 } from './repo-f4.ts'
import type { DatosFiscales } from './impuestos-datos.ts'
import { registrarAsientoManual } from './servicio.ts'
import { huella } from './huella.ts'

export type EntradaCalculo = {
  modelo: ModeloAeat
  anio: number
  periodo: PeriodoModelo
  datos: DatosFiscales
  /** `empresas.regimen_iva` (null = no se sabe). */
  regimenIva: string | null
  /** Cuotas de IVA pendientes de compensar de periodos anteriores (303). */
  compensarAnteriores: number
  /** Solo 130. */
  rendimiento130: AcumuladoRendimiento | null
  /** Hechos truncados por el tope de lectura: el cálculo sería parcial. */
  truncado: boolean
}

export type CalculoConContexto = { calculo: CalculoModelo; cuadre: CuadreIva | null }

const trimestreDePeriodo = (p: PeriodoModelo): 1 | 2 | 3 | 4 => (Number(p[0]) as 1 | 2 | 3 | 4)

/** Cálculo PURO de un modelo con los datos ya cargados. Un modelo no soportado o con datos truncados nunca devuelve resultado. */
export function calcularConDatos(e: EntradaCalculo): CalculoModelo {
  const { modelo, anio, periodo, datos } = e
  if (esModeloAnual(modelo) !== (periodo === '0A')) throw new ErrorContable('periodo_invalido', `el modelo ${modelo} no admite el periodo ${periodo}`)
  const t = periodo === '0A' ? 1 : trimestreDePeriodo(periodo)
  let c: CalculoModelo
  switch (modelo) {
    case '303': c = calcularModelo303(datos.ops, { anio, trimestre: t, regimenIva: e.regimenIva, compensarAnteriores: e.compensarAnteriores }); break
    case '390': c = calcularModelo390(datos.ops, { anio, regimenIva: e.regimenIva }); break
    case '111': c = calcularModelo111(datos.retenciones, { anio, trimestre: t }); break
    case '115': c = calcularModelo115(datos.retenciones, { anio, trimestre: t }); break
    case '190': c = calcularModelo190(datos.retenciones, anio); break
    case '180': c = calcularModelo180(datos.retenciones, anio); break
    case '347': c = calcularModelo347(datos.ops, anio); break
    case '349': c = calcularModelo349(datos.ops, { anio, trimestre: t }); break
    case '130': {
      if (!e.rendimiento130) throw new ErrorContable('faltan_datos', 'el 130 necesita el acumulado de rendimientos')
      c = calcularModelo130(e.rendimiento130, { anio, trimestre: t })
      break
    }
  }
  const out: CalculoModelo = { ...c, avisos: modelo === '130' ? c.avisos : [...c.avisos, ...datos.avisos] }
  if (e.truncado) {
    return { ...out, resultado: null, noSoportado: [...out.noSoportado, 'Hay más hechos de los que se pueden leer de una vez: el cálculo sería parcial'] }
  }
  return out
}

/** Cuadre libros ≡ mayor 477/472 del periodo del 303 (guardián de la fase 4). null si no es un 303. */
export function cuadreDelPeriodo(modelo: ModeloAeat, anio: number, periodo: PeriodoModelo, datos: DatosFiscales, sumas: readonly SumaCuenta[]): CuadreIva | null {
  if (modelo !== '303') return null
  const rango = rangoDeModelo(anio, periodo)
  const em = libroRegistroIva(datos.ops, 'emitida', rango)
  const re = libroRegistroIva(datos.ops, 'recibida', rango)
  const g = (pref: string) => sumas.filter((s) => s.cuenta.startsWith(pref)).reduce((t, s) => ({ debe: t.debe + s.debe, haber: t.haber + s.haber }), { debe: 0, haber: 0 })
  const s477 = g('477')
  const s472 = g('472')
  return cuadrarLibrosConMayor(em, re, s477.haber - s477.debe, s472.debe - s472.haber)
}

/**
 * Cuotas de IVA pendientes de compensar: negativos de los 303 PRESENTADOS anteriores (mismo ejercicio y 4T del anterior) menos lo ya
 * aplicado (casilla 68). Solo mira periodos anteriores al pedido.
 */
export function compensacionPendiente(presentados: readonly FilaDeclaracion[], anio: number, periodo: PeriodoModelo): number {
  const orden = (a: number, p: PeriodoModelo) => a * 10 + Number(p[0])
  const limite = orden(anio, periodo)
  let pendiente = 0
  for (const d of presentados) {
    if (d.modelo !== '303' || d.estado !== 'presentado' || orden(d.anio, d.periodo) >= limite) continue
    if (d.resultado !== null && d.resultado < 0) pendiente += -d.resultado
    const calc = d.calculo as { casillas?: { casilla: string; importe: number }[] } | undefined
    pendiente -= calc?.casillas?.find((c) => c.casilla === '68')?.importe ?? 0
  }
  return Math.max(0, pendiente)
}

/** Pagos fraccionados YA ingresados del 130 en trimestres anteriores del ejercicio. */
export function pagos130Anteriores(presentados: readonly FilaDeclaracion[], anio: number, periodo: PeriodoModelo): number {
  return presentados.filter((d) => d.modelo === '130' && d.anio === anio && d.estado === 'presentado' && d.periodo < periodo).reduce((t, d) => t + Math.max(0, d.resultado ?? 0), 0)
}

export function rendimiento130(asientos: readonly Asiento[], anio: number, periodo: PeriodoModelo, presentados130: readonly FilaDeclaracion[]): AcumuladoRendimiento {
  return acumuladoDeAsientos(asientos, { anio, trimestre: trimestreDePeriodo(periodo), pagosAnteriores: pagos130Anteriores(presentados130, anio, periodo) })
}

// ── Persistencia del ciclo ──────────────────────────────────────────────────────────────────────────────────────

export type ResultadoGuardar = { ok: true; id: string; version: number; creada: boolean } | { ok: false; errores: string[] }

/**
 * Guarda el cálculo como BORRADOR: nuevo (versión 1), recálculo del borrador existente, o complementaria (versión +1) si la anterior ya está
 * presentada y se pide expresamente. Una declaración revisada no se recalcula: hay que devolverla a borrador antes.
 */
export async function guardarCalculo(
  f4: RepoF4, calc: CalculoModelo, extra: Record<string, unknown>, meta: { usuarioId: string | null; complementaria?: boolean },
): Promise<ResultadoGuardar> {
  const previa = await f4.ultimaVersion(calc.modelo, calc.anio, calc.periodo)
  const snapshot = { ...extra, ...calc }
  const base = { resultado: calc.resultado, completo: calc.noSoportado.length === 0, calculo: snapshot, huella: huella(snapshot), usuarioId: meta.usuarioId }
  if (previa && previa.estado === 'borrador') {
    const ok = await f4.actualizarBorrador(previa.id, base)
    return ok ? { ok: true, id: previa.id, version: previa.version, creada: false } : { ok: false, errores: ['la declaración dejó de ser borrador; recarga la pantalla'] }
  }
  if (previa && previa.estado === 'revisado') return { ok: false, errores: ['La declaración está revisada: devuélvela a borrador antes de recalcular'] }
  if (previa && !meta.complementaria) return { ok: false, errores: ['Ya está presentada. Una corrección se presenta como complementaria: pide expresamente una versión nueva'] }
  const nueva: NuevaDeclaracion = { modelo: calc.modelo, anio: calc.anio, periodo: calc.periodo, version: (previa?.version ?? 0) + 1, ...base }
  const id = await f4.insertarDeclaracion(nueva)
  return id ? { ok: true, id, version: nueva.version, creada: true } : { ok: false, errores: ['otra petición creó esa declaración a la vez; recarga la pantalla'] }
}

export type ResultadoCiclo = { ok: true } | { ok: false; errores: string[] }
type Meta = { usuarioId: string | null; /** Rol de quien actúa (dueño o gestor): queda en la auditoría. */ rol?: 'dueno' | 'gestor'; hoy?: Date }

/** borrador → revisado. Lo no soportado no se revisa (lo exige también la BD: `completo`). */
export async function revisarDeclaracion(repo: RepoContable, f4: RepoF4, id: string, meta: Meta): Promise<ResultadoCiclo> {
  const d = await f4.declaracion(id, true)
  if (!d) return { ok: false, errores: ['declaración no encontrada'] }
  if (d.estado !== 'borrador') return { ok: false, errores: [`la declaración está ${d.estado}, no en borrador`] }
  const calc = d.calculo as Pick<CalculoModelo, 'noSoportado' | 'resultado' | 'modelo'>
  const problemas = problemasParaRevisar({ noSoportado: calc.noSoportado ?? [], resultado: d.resultado, modelo: d.modelo })
  if (problemas.length) return { ok: false, errores: problemas }
  if (!(await f4.marcarRevisada(id, meta.usuarioId))) return { ok: false, errores: ['no se pudo marcar como revisada (¿cambió a la vez?)'] }
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'revisar_declaracion', entidad: 'declaraciones', entidadId: id, detalle: { modelo: d.modelo, anio: d.anio, periodo: d.periodo, rol: meta.rol ?? null } })
  return { ok: true }
}

export async function devolverDeclaracion(repo: RepoContable, f4: RepoF4, id: string, meta: Meta): Promise<ResultadoCiclo> {
  const d = await f4.declaracion(id, true)
  if (!d) return { ok: false, errores: ['declaración no encontrada'] }
  if (d.estado !== 'revisado') return { ok: false, errores: [`solo se devuelve a borrador una declaración revisada (está ${d.estado})`] }
  if (!(await f4.devolverABorrador(id))) return { ok: false, errores: ['no se pudo devolver a borrador'] }
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'devolver_declaracion', entidad: 'declaraciones', entidadId: id, detalle: { modelo: d.modelo, anio: d.anio, periodo: d.periodo } })
  return { ok: true }
}

export type ResultadoPresentar = { ok: true; asientos: { rol: 'liquidacion' | 'pago'; id: string; numero: number }[] } | { ok: false; errores: string[] }

/**
 * revisado → presentado (manual): fecha + justificante como texto, y los asientos de liquidación (IVA 477/472 → 4750/4700) y de pago
 * (4750 → 572; retenciones 4751 → 572) calculados del SNAPSHOT revisado. `pagar` = el ingreso ya se ordenó/domicilió. Quien llama debe ejecutar
 * esto en UNA transacción y revertirla si `ok` es false (asientos y estado son todo o nada).
 * Fecha de la liquidación = fin del periodo; fecha del pago = la de presentación.
 */
export async function presentarDeclaracion(
  repo: RepoContable, f4: RepoF4, id: string, datos: DatosPresentacion, opciones: { pagar: boolean }, meta: Meta & { hoy: Date },
): Promise<ResultadoPresentar> {
  const d = await f4.declaracion(id, true)
  if (!d) return { ok: false, errores: ['declaración no encontrada'] }
  if (d.estado !== 'revisado') return { ok: false, errores: [d.estado === 'presentado' ? 'ya está presentada' : 'primero hay que marcarla como revisada'] }
  const prob = problemasPresentacion(datos, meta.hoy)
  if (prob.length) return { ok: false, errores: prob }
  const calc = d.calculo as CalculoModelo
  let props
  try {
    props = asientosDePresentacion({ ...calc, resultado: d.resultado }, { pagar: opciones.pagar })
  } catch (e) {
    if (e instanceof ErrorContable) return { ok: false, errores: [e.message] }
    throw e
  }
  const fin = rangoDeModelo(d.anio, d.periodo).hasta
  const hechos: { rol: 'liquidacion' | 'pago'; id: string; numero: number }[] = []
  for (const p of props) {
    const fecha = p.rol === 'liquidacion' ? fin : datos.fechaPresentacion
    const r = await registrarAsientoManual(repo, { fecha, concepto: p.concepto, apuntes: p.apuntes }, { actor: 'usuario', usuarioId: meta.usuarioId })
    if (!r.ok) return { ok: false, errores: r.errores }
    hechos.push({ rol: p.rol, id: r.id, numero: r.numero })
  }
  const ok = await f4.marcarPresentada(id, {
    usuarioId: meta.usuarioId, fecha: datos.fechaPresentacion, justificante: datos.justificante.trim(),
    asientoLiquidacionId: hechos.find((h) => h.rol === 'liquidacion')?.id ?? null, asientoPagoId: hechos.find((h) => h.rol === 'pago')?.id ?? null,
  })
  if (!ok) return { ok: false, errores: ['no se pudo marcar como presentada (¿cambió a la vez?)'] }
  await repo.auditar({
    actor: 'usuario', usuarioId: meta.usuarioId, accion: 'presentar_declaracion', entidad: 'declaraciones', entidadId: id,
    detalle: { modelo: d.modelo, anio: d.anio, periodo: d.periodo, rol: meta.rol ?? null, fecha: datos.fechaPresentacion, justificante: datos.justificante.trim(), resultado: d.resultado, asientos: hechos.map((h) => h.numero) },
  })
  return { ok: true, asientos: hechos }
}

export { importeDe }
