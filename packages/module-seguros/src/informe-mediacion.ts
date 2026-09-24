/**
 * Informe anual de mediación: la base para la documentación estadístico-contable que la correduría
 * presenta cada año a la DGSFP (primas intermediadas por compañía y ramo, cartera, quejas del SAC).
 *
 * 🚨 NO es el modelo oficial: es la hoja de trabajo para rellenarlo. Las primas salen de los recibos
 * que manda CIMA, y CIMA no cubre todas las compañías ni todos los años; por eso el informe dice de
 * qué compañías hay datos y cuántos importes no se han podido leer, en vez de dar un total que parece
 * completo sin serlo. PENDIENTE_REVISION_LEGAL: qué casillas pide el modelo y con qué criterio de
 * imputación (efecto del recibo vs. cobro) lo confirma la asesoría.
 */
import { importeEiac } from './importe-eiac.ts'

export type ReciboInforme = {
  /** Código DGS de la compañía; `null` = no consta. */
  compania: string | null
  /** `polizas.tipo`; `null` = no consta. */
  ramo: string | null
  /** `null` = no consta: no es «pendiente», se cuenta aparte. */
  situacion: string | null
  /** `NP` nueva producción · `CA` cartera (renovación) · `SU` suplemento · otros. */
  clase: string | null
  /** Texto EIAC tal cual (`prima_total`). */
  prima: string | null
  /** `YYYY-MM-DD` del efecto del recibo; decide el año. */
  efecto: string | null
}

export type FilaInforme = {
  compania: string | null
  ramo: string | null
  /** Recibos cobrados con importe legible. */
  recibos: number
  /** Prima total cobrada (extornos cobrados restan). */
  primas: number
  primasNuevaProduccion: number
  primasCartera: number
  primasOtras: number
  /** Recibos del año que NO se han cobrado (no suman primas; se cuentan). */
  anulados: number
  devueltos: number
  pendientes: number
  /** Recibos del año sin situación informada: no se sabe si se cobraron. */
  sinSituacion: number
}

export type InformeMediacion = {
  año: number
  filas: FilaInforme[]
  total: { recibos: number; primas: number; primasNuevaProduccion: number; primasCartera: number; primasOtras: number }
  /** Recibos cobrados del año cuyo importe no se pudo leer: NO están en el total. */
  ilegibles: number
  /** Recibos sin fecha de efecto: no se sabe de qué año son y no se imputan a ninguno. */
  sinFecha: number
  /** Compañías de las que hay algún recibo del año. Las que falten no son «0 €», son «sin datos». */
  companiasConDatos: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function informeMediacion(recibos: readonly ReciboInforme[], año: number): InformeMediacion {
  const filas = new Map<string, FilaInforme>()
  const companias = new Set<string>()
  let ilegibles = 0
  let sinFecha = 0
  for (const r of recibos) {
    if (!r.efecto || !/^\d{4}-\d{2}-\d{2}/.test(r.efecto)) {
      sinFecha++
      continue
    }
    if (!r.efecto.startsWith(`${año}-`)) continue
    if (r.compania) companias.add(r.compania)
    const clave = `${r.compania ?? ''}|${r.ramo ?? ''}`
    let f = filas.get(clave)
    if (!f) {
      f = { compania: r.compania, ramo: r.ramo, recibos: 0, primas: 0, primasNuevaProduccion: 0, primasCartera: 0, primasOtras: 0, anulados: 0, devueltos: 0, pendientes: 0, sinSituacion: 0 }
      filas.set(clave, f)
    }
    if (r.situacion === null) { f.sinSituacion++; continue }
    if (r.situacion === 'anulado') { f.anulados++; continue }
    if (r.situacion === 'devuelto') { f.devueltos++; continue }
    if (r.situacion !== 'cobrado') { f.pendientes++; continue }
    const importe = importeEiac(r.prima)
    if (importe === null) { ilegibles++; continue }
    f.recibos++
    f.primas += importe
    if (r.clase === 'NP') f.primasNuevaProduccion += importe
    else if (r.clase === 'CA') f.primasCartera += importe
    else f.primasOtras += importe
  }
  const lista = [...filas.values()]
    .map((f) => ({ ...f, primas: r2(f.primas), primasNuevaProduccion: r2(f.primasNuevaProduccion), primasCartera: r2(f.primasCartera), primasOtras: r2(f.primasOtras) }))
    .sort((a, b) => (a.compania ?? '~').localeCompare(b.compania ?? '~') || (a.ramo ?? '~').localeCompare(b.ramo ?? '~'))
  const total = lista.reduce(
    (t, f) => ({
      recibos: t.recibos + f.recibos,
      primas: r2(t.primas + f.primas),
      primasNuevaProduccion: r2(t.primasNuevaProduccion + f.primasNuevaProduccion),
      primasCartera: r2(t.primasCartera + f.primasCartera),
      primasOtras: r2(t.primasOtras + f.primasOtras),
    }),
    { recibos: 0, primas: 0, primasNuevaProduccion: 0, primasCartera: 0, primasOtras: 0 },
  )
  return { año, filas: lista, total, ilegibles, sinFecha, companiasConDatos: [...companias].sort() }
}
