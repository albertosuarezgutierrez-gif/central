// Detectores PUROS de los "vigilantes" de la tarjeta (Fase 2): solo avisan, nunca bloquean.
// Sin Prisma ni '@/': la parte de BD (histórico, justificantes) vive en lib/contable/extracto-tarjeta.ts.
// Testeable con `node --test`.
//
// 🚨 REGLA DE DISEÑO (14/08/2026, tras la queja «el agente no reconoce Mercadona»): un vigilante
// solo debe hablar cuando la señal DISTINGUE el aviso del comportamiento normal. Comparar dos
// tickets de súper y llamarlo «subida de precio», o dos cafés del mismo importe y llamarlo «cobro
// doble», no es un aviso conservador: es ruido que entrena a ignorar el mensaje entero — y el día
// que haya un cargo raro de verdad pasará desapercibido entre la paja. Cuando no hay base para
// juzgar (comercio de importe variable, un solo cargo previo, sin fecha) la respuesta correcta es
// CALLARSE, no avisar por si acaso.
import { claveComercio } from './comercio-canonico.ts'

// Línea de coste financiero de la tarjeta (intereses por aplazar, comisiones, cuota de financiación).
// NO es una compra: liquidando la tarjeta en el mes se evita. Puro/testeable.
export function esCargoFinanciero(concepto: string | null | undefined): boolean {
  return /INTER[EÉ]S|INTERESES|COMISI[OÓ]N|APLAZAMIENTO|CUOTA\s+FINANC|RECARGO\s+FINANC/i.test(concepto || '')
}

export interface MovVig { id: string; comercio: string; importe: number; fecha?: string | null }

// € mínimo para llamar «cobro doble» a dos cargos iguales. Por debajo (cafés, panes, tickets de
// 0,99€) la repetición es lo NORMAL y el aviso es ruido: dos cargos de 0,99€ en el súper no son un
// duplicado del banco, son dos compras.
export const DOBLE_MIN_EUR = 10

// Cargos idénticos (mismo comercio + mismo importe + **el MISMO DÍA**) que aparecen ≥2 veces.
// La fecha es la clave del asunto: repetir un importe en días distintos es una rutina (repostar
// 40,00€ cada semana, la compra de siempre); repetirlo el mismo día en el mismo sitio es lo que
// puede ser un cobro duplicado. Un cargo SIN fecha no se juzga (no se puede saber si es rutina) y
// por debajo de `DOBLE_MIN_EUR` tampoco.
export function dobleCobro(movs: MovVig[], minImporte = DOBLE_MIN_EUR): { comercio: string; importe: number; fecha: string; ids: string[] }[] {
  const g = new Map<string, { comercio: string; importe: number; fecha: string; ids: string[] }>()
  for (const m of movs) {
    const comercio = (m.comercio || '').trim()
    const clave = claveComercio(comercio)
    const fecha = (m.fecha || '').slice(0, 10)
    if (!clave || !fecha) continue
    const importe = Math.round(Math.abs(m.importe) * 100) / 100
    if (importe < minImporte) continue
    const k = `${clave}|${importe}|${fecha}`
    const e = g.get(k) ?? { comercio, importe, fecha, ids: [] }
    e.ids.push(m.id)
    g.set(k, e)
  }
  return [...g.values()].filter(e => e.ids.length >= 2)
}

// ¿El importe actual supera al previo en más de umbralPct %? (subida de precio de un cargo
// recurrente, p.ej. una suscripción que sube de 6,99€ a 9,99€). Requiere ambos importes positivos
// (valor absoluto). OJO: esto solo compara dos números — quién tiene derecho a ser comparado lo
// decide `baseRecurrente`.
export function subioPrecio(actual: number, previo: number, umbralPct = 15): boolean {
  const a = Math.abs(actual), p = Math.abs(previo)
  if (!(p > 0) || !(a > 0)) return false
  return ((a - p) / p) * 100 > umbralPct
}

export interface CargoPrevio { importe: number; fecha: string }

// Mínimos para que un comercio tenga "precio conocido" y su subida signifique algo.
export const RECURRENTE_MIN_CARGOS = 3    // nº de cargos previos
export const RECURRENTE_MIN_MESES = 3     // en meses distintos (si no, no es recurrente: es una racha)
export const RECURRENTE_DISPERSION = 0.10 // ±10% alrededor de la mediana = precio "fijo"

// Precio de referencia de un comercio RECURRENTE DE IMPORTE ESTABLE (suscripción, cuota, recibo),
// o **null** si ese comercio no tiene un precio del que se pueda decir que "ha subido".
//
// Esta función es la que apaga el ruido: un súper o un restaurante cobran un importe distinto cada
// vez, así que comparar la última compra contra la de hoy y llamarlo «subida de precio» (DIA 3,25€
// → 7,52€, un restaurante 33€ → 87€) es comparar dos cosas que no son comparables. Solo se
// devuelve base cuando hay historial suficiente Y los importes previos son estables entre sí.
export function baseRecurrente(previos: CargoPrevio[]): number | null {
  const validos = previos.filter(p => Math.abs(p.importe) > 0 && !!p.fecha)
  if (validos.length < RECURRENTE_MIN_CARGOS) return null
  const meses = new Set(validos.map(p => p.fecha.slice(0, 7)))
  if (meses.size < RECURRENTE_MIN_MESES) return null
  const importes = validos.map(p => Math.abs(p.importe)).sort((a, b) => a - b)
  const m = Math.floor(importes.length / 2)
  const base = importes.length % 2 ? importes[m] : (importes[m - 1] + importes[m]) / 2
  if (!(base > 0)) return null
  // Estabilidad: TODOS los previos dentro de ±RECURRENTE_DISPERSION de la mediana. Con un solo
  // importe fuera, el comercio es de precio variable y no se juzga.
  const estable = importes.every(x => Math.abs(x - base) / base <= RECURRENTE_DISPERSION)
  return estable ? base : null
}
