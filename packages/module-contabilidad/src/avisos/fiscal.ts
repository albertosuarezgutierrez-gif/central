// Calendario fiscal para avisos (10/5/1 días antes). PURO, reloj inyectado: NUNCA fechas fijas contra el reloj real.
//
// ⚠️ Fechas [Probable]: las del calendario general de AEAT para año natural; el asesor debe validarlas (spec §3.4) y los plazos que
// caen en sábado, domingo o festivo se trasladan al siguiente día hábil (aquí NO se modela: el aviso lo dice). Esto es un recordatorio,
// no asesoramiento ni la fuente del plazo.
import { aFechaISO, diasEntre } from '../analisis/periodos.ts'

export type FormaEmpresa = 'sociedad' | 'autonomo'
export const UMBRALES_AVISO_FISCAL = [10, 5, 1] as const

export type VencimientoFiscal = {
  id: string
  fecha: string
  titulo: string
  modelos: string
  /** Quién lo tiene: todas, solo sociedades o solo autónomos. */
  aplica: 'todas' | FormaEmpresa
}

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const ultimoFeb = (a: number) => new Date(Date.UTC(a, 2, 0)).getUTCDate()

/** Vencimientos del año natural `anio` (el 30 de enero y el resto de «Q4/anuales» caen en ese mismo año). */
export function vencimientosFiscalesDelAnio(anio: number): VencimientoFiscal[] {
  return [
    { id: `${anio}-enero-q4`, fecha: iso(anio, 1, 30), titulo: 'IVA y retenciones del 4.º trimestre', modelos: '303, 111, 115 (y 130/131 si eres autónomo)', aplica: 'todas' },
    { id: `${anio}-enero-anuales`, fecha: iso(anio, 1, 30), titulo: 'Resumen anual de IVA', modelos: '390', aplica: 'todas' },
    { id: `${anio}-enero-190`, fecha: iso(anio, 1, 31), titulo: 'Resúmenes anuales de retenciones', modelos: '180, 190', aplica: 'todas' },
    { id: `${anio}-feb-347`, fecha: iso(anio, 2, ultimoFeb(anio)), titulo: 'Operaciones con terceros', modelos: '347', aplica: 'todas' },
    { id: `${anio}-abr-q1`, fecha: iso(anio, 4, 20), titulo: 'IVA y retenciones del 1.er trimestre', modelos: '303, 111, 115 (y 130/131 si eres autónomo)', aplica: 'todas' },
    { id: `${anio}-abr-libros`, fecha: iso(anio, 4, 30), titulo: 'Legalización de libros contables en el Registro Mercantil', modelos: 'Libros diario e inventarios', aplica: 'sociedad' },
    { id: `${anio}-jul-q2`, fecha: iso(anio, 7, 20), titulo: 'IVA y retenciones del 2.º trimestre', modelos: '303, 111, 115 (y 130/131 si eres autónomo)', aplica: 'todas' },
    { id: `${anio}-jul-is`, fecha: iso(anio, 7, 25), titulo: 'Impuesto sobre Sociedades', modelos: '200', aplica: 'sociedad' },
    { id: `${anio}-oct-q3`, fecha: iso(anio, 10, 20), titulo: 'IVA y retenciones del 3.er trimestre', modelos: '303, 111, 115 (y 130/131 si eres autónomo)', aplica: 'todas' },
  ]
}

export type AvisoFiscal = { vencimiento: VencimientoFiscal; diasRestantes: number; umbral: 10 | 5 | 1 }

/**
 * Avisos fiscales de hoy: por cada vencimiento aplicable a la forma de la empresa que quede a ≤ 10 días (0 = vence hoy), un aviso en el
 * UMBRAL (10, 5 o 1) más estrecho que cubre los días que quedan. La clave de deduplicación (id + umbral) hace que un cron que se pierda un
 * día no se salte el aviso y que repetirlo el mismo día no duplique.
 */
export function avisosFiscalesDeHoy(hoy: Date, forma: FormaEmpresa): AvisoFiscal[] {
  const h = aFechaISO(hoy)
  const a = hoy.getUTCFullYear()
  const salida: AvisoFiscal[] = []
  // El año siguiente cubre el 30/01 visto desde diciembre.
  for (const v of [...vencimientosFiscalesDelAnio(a), ...vencimientosFiscalesDelAnio(a + 1)]) {
    if (v.aplica !== 'todas' && v.aplica !== forma) continue
    const dias = diasEntre(h, v.fecha)
    if (dias < 0 || dias > UMBRALES_AVISO_FISCAL[0]) continue
    const umbral = [...UMBRALES_AVISO_FISCAL].reverse().find((u) => dias <= u)!
    salida.push({ vencimiento: v, diasRestantes: dias, umbral })
  }
  return salida.sort((x, y) => x.diasRestantes - y.diasRestantes)
}
