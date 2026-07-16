// Parte PURA de la segunda opinión IA de duplicados (prompt + parseo + tipos). Sin `@central/core-ai`
// ni red, para poder testearla en aislamiento con `node --test`. El orquestador que llama a la IA vive
// en `duplicados-opinion.ts`. Principio canónico: la IA SOLO OPINA/EXPLICA; nunca decide importes ni
// resuelve el par (eso lo hace Alberto con los botones).
import { eur } from './dinero.ts'

export type DupOpinionMov = { fecha?: string | null; concepto: string; cuentaLabel?: string; conciliado?: boolean }
export type DupOpinionInput = {
  importe: number
  confianza: 'alta' | 'baja'
  movimientos: DupOpinionMov[]
}
export type DupVeredicto = 'probable_duplicado' | 'probable_legitimo' | 'incierto'
export type DupOpinion = { veredicto: DupVeredicto; explicacion: string; confianza: number }

export const SYSTEM_OPINION = [
  'Eres un analista contable. Te doy DOS cargos bancarios del mismo importe y comercio, muy próximos en fecha,',
  'que un detector automático marcó como posible COBRO DOBLE. Da una SEGUNDA OPINIÓN: di si parece un cobro',
  'doble REAL o si es NORMAL (dos cargos legítimos). Pistas de que es NORMAL: números de recibo o expediente',
  'DISTINTOS en el concepto (p.ej. dos recibos de IBI del mismo inmueble), una suscripción mensual recurrente,',
  'un pago repartido entre dos personas, o dos compras reales el mismo día. Pistas de cobro doble: mismo número',
  'de documento, comercio puntual sin motivo para repetirse el mismo día.',
  'NUNCA inventes importes ni des cifras nuevas: los números ya te los doy hechos.',
  'Responde SOLO con JSON, sin texto alrededor:',
  '{"veredicto":"probable_duplicado"|"probable_legitimo"|"incierto","explicacion":"<1 frase en español>","confianza":<0..1>}',
].join(' ')

// Prompt determinista a partir de los datos ya calculados (sin pedir a la IA que sume nada).
export function construirPromptOpinion(input: DupOpinionInput): string {
  const imp = eur(Math.abs(input.importe))
  const lineas = input.movimientos.map((m, i) =>
    `Cargo ${i + 1}: fecha ${m.fecha || '?'}, ${imp}, banco ${m.cuentaLabel || '?'}, concepto "${m.concepto}"${m.conciliado ? ' (conciliado con factura)' : ''}`)
  return [
    `Importe de cada cargo: ${imp}. Sospecha del detector determinista: ${input.confianza}.`,
    ...lineas,
    '¿Es un cobro doble real o es normal? Responde en JSON.',
  ].join('\n')
}

// Parsea con tolerancia la respuesta de la IA (puede venir con texto o ```json alrededor). Ante
// cualquier duda → "incierto" con confianza 0 (nunca afirma algo que no entendió).
export function parseOpinion(raw: string): DupOpinion {
  const fallback: DupOpinion = { veredicto: 'incierto', explicacion: 'No he podido analizarlo; revísalo tú.', confianza: 0 }
  if (!raw) return fallback
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return fallback
  try {
    const o = JSON.parse(m[0]) as { veredicto?: unknown; explicacion?: unknown; confianza?: unknown }
    const veredicto: DupVeredicto = o.veredicto === 'probable_duplicado' || o.veredicto === 'probable_legitimo'
      ? o.veredicto : 'incierto'
    const explicacion = typeof o.explicacion === 'string' && o.explicacion.trim() ? o.explicacion.trim() : fallback.explicacion
    const c = typeof o.confianza === 'number' ? o.confianza : 0
    const confianza = c >= 0 && c <= 1 ? c : 0
    return { veredicto, explicacion, confianza }
  } catch {
    return fallback
  }
}
