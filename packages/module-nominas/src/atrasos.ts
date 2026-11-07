/**
 * Atrasos (N1): concepto SEPARADO del devengo ordinario, con su año de devengo. No entran en `devengos.total` ni en las
 * bases de cotización del mes (las cotizaciones de los atrasos se liquidan en el mes de devengo —no calculado aquí→ regla
 * `cotizacion_atrasos`—). Retención: tipo del pagador sobre el importe; si el atraso es de un ejercicio anterior el tipo
 * correcto no está contrastado → regla `irpf_atrasos`. Bloquean en modo «calculo».
 */
import { CifraPendienteError } from './cifras'
import { aplicarTipo, esCentimos, type Centimos, type Ppm } from './dinero'

export interface Atraso {
  concepto: string
  importe: Centimos
  añoDevengo: number
}

export interface LineaAtraso extends Atraso {
  ejercicioAnterior: boolean
  retencion: Centimos
}

export interface ResultadoAtrasos {
  lineas: LineaAtraso[]
  total: Centimos
  retencion: Centimos
  /** total − retención (a sumar al líquido ordinario). */
  neto: Centimos
  cifrasPendientes: string[]
  avisos: string[]
}

export function procesarAtrasos(atrasos: Atraso[], periodo: string, tipoIrpf: Ppm, modo: 'calculo' | 'simulacion'): ResultadoAtrasos {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo)
  if (!m) throw new Error(`Período inválido: ${periodo}`)
  const año = Number(m[1])
  const pend = new Set<string>()
  const avisos: string[] = []
  const lineas: LineaAtraso[] = atrasos.map(a => {
    if (!esCentimos(a.importe) || a.importe <= 0) throw new Error(`Atraso «${a.concepto}»: importe debe ser céntimos enteros > 0`)
    if (!Number.isInteger(a.añoDevengo) || a.añoDevengo > año) throw new Error(`Atraso «${a.concepto}»: año de devengo inválido (${a.añoDevengo})`)
    const ejercicioAnterior = a.añoDevengo < año
    if (ejercicioAnterior) pend.add('regla:irpf_atrasos')
    if (a.añoDevengo < año - 4) avisos.push(`atraso_posible_prescripcion:${a.concepto}`)
    return { ...a, ejercicioAnterior, retencion: aplicarTipo(a.importe, tipoIrpf) }
  })
  if (lineas.length) pend.add('regla:cotizacion_atrasos')
  const total = lineas.reduce((s, l) => s + l.importe, 0)
  const retencion = lineas.reduce((s, l) => s + l.retencion, 0)
  const cifrasPendientes = [...pend].sort()
  if (modo === 'calculo' && cifrasPendientes.length) throw new CifraPendienteError(cifrasPendientes)
  return { lineas, total, retencion, neto: total - retencion, cifrasPendientes, avisos }
}
