// Certificado anual de retenciones e ingresos a cuenta del IRPF (art. 108.3 RIRPF) para UN perceptor, y la lectura de un hecho de nómina
// como `RetencionPracticada`. PURO.
//
// Invariante: las cifras del certificado son las del 190 de ese perceptor. Por eso NO se recalculan: se pasa la lista de retenciones por
// `calcularModelo190` (mismo filtro de ejercicio, mismas exclusiones, misma agrupación NIF + clave + subclave) y se toman sus filas. Lo único
// que añade el certificado es «gastos deducibles» (cotizaciones del trabajador a la Seguridad Social, art. 19.2.a LIRPF), que viaja en
// `RetencionTrabajo.gastosDeducibles` y se suma sobre las MISMAS refs que el 190 metió en cada fila.
//
// `retencionDeNomina` es la ÚNICA lectura del payload de un hecho de nómina: la usan contabilidad (datos de los modelos 111/190) y rrhh
// (certificado del portal del empleado). Una nómina con IRPF 0 SÍ produce retención (retención 0): el 190 declara a todos los perceptores
// de rendimientos del trabajo, se les haya retenido o no [Probable: diseño de registro del 190 no contrastado desde el entorno — sede AEAT no
// accesible el 07/11/2026; contrastar con el asesor]. En el 111 cuenta como perceptor y su percepción íntegra; la retención suma 0.
import type { Centimos } from '../partida/dinero.ts'
import { nifNormalizado } from './comun.ts'
import { calcularModelo190, CLAVE_190_POR_DEFECTO, type RetencionPracticada } from './retenciones.ts'

export type RetencionTrabajo = RetencionPracticada & {
  /** Cotizaciones del trabajador a la Seguridad Social (gasto deducible), céntimos. Ausente = no se sabe (no se asume 0). */
  gastosDeducibles?: Centimos
}

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const ent = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null)

export type LecturaNomina = { ok: true; retencion: RetencionTrabajo } | { ok: false; motivo: string }

/** Hecho de nómina (payload del puerto) → retención de trabajo. `fecha` = la del hecho (periodo de la nómina). */
export function retencionDeNomina(f: { ref: string; fecha: string; payload: unknown }): LecturaNomina {
  const p = obj(f.payload)
  if (!p) return { ok: false, motivo: 'payload ilegible' }
  const bruto = ent(p.bruto)
  const irpf = ent(p.irpf)
  if (bruto === null || irpf === null) return { ok: false, motivo: 'nómina sin bruto/IRPF legibles' }
  const per = obj(p.perceptor)
  const provincia = str(per?.provincia, 2)
  const clave = str(p.clave, 3)
  const ssT = ent(p.ssTrabajador)
  const retencion: RetencionTrabajo = {
    ref: f.ref, fecha: f.fecha, concepto: 'trabajo', percepcion: bruto, retencion: irpf, origen: 'nominas',
    perceptor: { nif: str(per?.nif, 20), nombre: str(per?.nombre) ?? '', ...(provincia ? { provincia } : {}) },
    ...(clave ? { clave } : {}),
    ...(ssT !== null && ssT >= 0 ? { gastosDeducibles: ssT } : {}),
  }
  return { ok: true, retencion }
}

export type LineaCertificado = {
  clave: string
  subclave: string | null
  percepcionDineraria: Centimos
  retencionDineraria: Centimos
  percepcionEspecie: Centimos
  ingresoACuentaEspecie: Centimos
  /** null = alguna de sus nóminas no traía la cotización del trabajador: no se sabe (nunca se presenta como 0). */
  gastosDeducibles: Centimos | null
  refs: string[]
}

export type CertificadoRetenciones = {
  anio: number
  perceptor: { nif: string; nombre: string }
  lineas: LineaCertificado[]
  totales: { percepciones: Centimos; retenciones: Centimos; gastosDeducibles: Centimos | null }
  /** Retenciones de ese perceptor que el 190 tampoco incluye (sin clave, inválidas…): el certificado no las da por buenas. */
  incompletas: { ref: string; motivo: string }[]
  avisos: string[]
}

/** Certificado del ejercicio `anio` para el perceptor `nif`. Las demás retenciones de la lista se ignoran. */
export function calcularCertificadoRetenciones(rs: readonly RetencionTrabajo[], anio: number, nif: string): CertificadoRetenciones {
  const n = nifNormalizado(nif)
  if (!n) throw new RangeError('el certificado exige el NIF del perceptor')
  const suyas = rs.filter((r) => nifNormalizado(r.perceptor.nif) === n)
  const m190 = calcularModelo190(suyas, anio)
  const avisos: string[] = []
  const lineas: LineaCertificado[] = m190.perceptores.map((x) => {
    const refs = new Set(x.refs)
    let gastos: number | null = 0
    for (const r of suyas) {
      // Misma clave de fila que el 190 (NIF ya filtrado + clave + subclave) y una de SUS refs.
      if (!refs.has(r.ref) || (r.clave ?? CLAVE_190_POR_DEFECTO[r.concepto]) !== x.clave || (r.subclave ?? null) !== x.subclave) continue
      gastos = gastos === null || r.gastosDeducibles === undefined ? null : gastos + r.gastosDeducibles
    }
    return {
      clave: x.clave as string, subclave: x.subclave, percepcionDineraria: x.percepcionDineraria, retencionDineraria: x.retencionDineraria,
      percepcionEspecie: x.percepcionEspecie, ingresoACuentaEspecie: x.ingresoACuentaEspecie, gastosDeducibles: gastos, refs: x.refs,
    }
  })
  const percepciones = lineas.reduce((t, l) => t + l.percepcionDineraria + l.percepcionEspecie, 0)
  const retenciones = lineas.reduce((t, l) => t + l.retencionDineraria + l.ingresoACuentaEspecie, 0)
  const gastosDeducibles = lineas.some((l) => l.gastosDeducibles === null) ? null : lineas.reduce((t, l) => t + (l.gastosDeducibles as number), 0)
  if (gastosDeducibles === null) avisos.push('Alguna nómina no trae la cotización del trabajador: los gastos deducibles quedan sin calcular')
  if (m190.incompletas.length) avisos.push(`${m190.incompletas.length} retención(es) sin clave de percepción: fuera del certificado hasta completarlas`)
  if (lineas.length === 0) avisos.push('Sin datos: no hay retenciones de este perceptor en el ejercicio')
  const nombre = lineas.length ? (m190.perceptores[0].nombre ?? '') : (suyas[0]?.perceptor.nombre ?? '')
  return {
    anio, perceptor: { nif: n, nombre }, lineas, totales: { percepciones, retenciones, gastosDeducibles },
    incompletas: m190.incompletas, avisos,
  }
}
