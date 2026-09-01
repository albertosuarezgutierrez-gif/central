// lib/sivra/factura-limpieza.ts — la factura REAL de Si que Brilla, validada (puro, testeable).
//
// Contexto (25/08/2026). El P&L desglosa cada pago a Si que Brilla INFIRIENDO el mes facturado
// por mejor ajuste al importe (`reparto-siquebrilla.ts`). Funciona porque las tarifas cuadran al
// céntimo con `incomes`, pero es una deducción: un movimiento que pagara dos facturas juntas, o
// una subida de tarifas, la rompen en silencio. La factura EXISTE (llega por correo y se archiva
// en Drive) y trae el desglose de verdad, línea a línea. Este módulo la vuelve utilizable.
//
// 🚨 Quién lee QUÉ, y por qué importa: el LAYOUT del PDF lo lee la IA (`factura-limpieza-lectura.ts`),
// nunca una expresión regular escrita de memoria. El repo ya tiene dos cicatrices de lo contrario
// (el parser de la tarjeta de Kutxabank y el detector de sesión del Portal del BOE): en ambos el
// fixture del test se redactó con la MISMA suposición que el código, así que la suite daba verde
// sobre un lector que no reconocía nada real. Aquí el código no supone un formato: recibe líneas
// ya extraídas y las somete a una prueba ARITMÉTICA que no depende del layout —
//
//     (Σ limpieza + Σ lavandería) × (1 + IVA) == total de la factura
//
// — y si no cuadra, NO hay desglose: se devuelve el motivo y el P&L se queda con su inferencia.
// Una lectura que no cuadra con el total es una lectura equivocada, venga de donde venga.

import { IVA_LIMPIEZA } from './reparto-siquebrilla.ts'

/** Tolerancia del cuadre en euros. Dos céntimos = el redondeo de las líneas, nada más. */
export const TOLERANCIA_CUADRE = 0.02

/** Cómo se llama cada piso en la factura → propertyId. Solo nombres VISTOS en facturas reales. */
const ALIAS_PISOS: Array<[RegExp, string]> = [
  [/\bluxury\b/i,                          'prop_luxury_busto'],
  [/\bbustos?\s+reforma?\b|\bbusto\s+reform\b/i, 'prop_busto_reform'],
  [/\bd[uú]plex\b/i,                       'prop_duplex_center'],
  [/\b(casa\s+)?socorro\b|\bhouse\s+sevillana\b/i, 'prop_house_sevillana'],
]

/** Una línea tal como la devuelve el lector, antes de validarse. */
export interface LineaCruda {
  concepto: string
  sesiones?: number | null
  tarifa?: number | null
  importe?: number | null
}

/** Lo que el lector saca del documento. Importes SIN IVA, como los imprime la factura. */
export interface FacturaCruda {
  numero?: string | null
  /** 'YYYY-MM' del mes de servicio, si la factura lo dice. */
  periodo?: string | null
  fecha?: string | null
  /** Total CON IVA — el que casa con el apunte del banco. */
  total?: number | null
  base?: number | null
  iva?: number | null
  limpieza: LineaCruda[]
  lavanderia: LineaCruda[]
}

export interface LineaLimpieza {
  propertyId: string
  sesiones: number
  tarifa: number
  /** Importe SIN IVA de la línea. */
  importe: number
}

export interface FacturaLimpieza {
  numero: string | null
  periodo: string | null
  fecha: string | null
  total: number
  base: number
  iva: number
  limpieza: LineaLimpieza[]
  /** Total de lavandería de la factura, SIN IVA. */
  lavanderia: number
}

export interface FacturaValidada {
  /** `null` = la lectura no cuadra y no se puede afirmar el desglose. */
  factura: FacturaLimpieza | null
  /** Por qué no cuadra, o qué llamó la atención aunque cuadre (tarifa distinta a la contratada…). */
  avisos: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : null
}

/** El piso que nombra un concepto de la factura; `null` si no es ninguno de los conocidos. */
export function pisoDeConcepto(concepto: string): string | null {
  for (const [re, pid] of ALIAS_PISOS) if (re.test(concepto)) return pid
  return null
}

/**
 * Valida una lectura contra su propio total. Devuelve la factura SOLO si cuadra.
 *
 * `tarifas` son las contratadas: no se usan para calcular (manda lo que dice la factura), sino
 * para AVISAR de una divergencia — una tarifa distinta es justo la señal de que Si que Brilla ha
 * subido precios, y el P&L inferido dejaría de cuadrar sin que nadie se entere.
 */
export function validarFactura(cruda: FacturaCruda, tarifas: Record<string, number>): FacturaValidada {
  const avisos: string[] = []
  const total = num(cruda.total)
  if (!total || total <= 0) {
    return { factura: null, avisos: ['La lectura no trae el total de la factura'] }
  }

  const limpieza: LineaLimpieza[] = []
  for (const l of cruda.limpieza ?? []) {
    const pid = pisoDeConcepto(l.concepto ?? '')
    if (!pid) {
      avisos.push(`Línea de limpieza sin piso reconocible: «${(l.concepto ?? '').slice(0, 60)}»`)
      continue
    }
    const sesiones = num(l.sesiones)
    const tarifa = num(l.tarifa)
    const importeLeido = num(l.importe)
    // Con sesiones y tarifa el importe se DERIVA (y se contrasta si además viene leído);
    // sin ellas no se puede repartir por salidas, que es lo que da valor a la línea.
    if (!sesiones || sesiones <= 0 || !tarifa || tarifa <= 0) {
      avisos.push(`Línea de limpieza sin sesiones × tarifa legibles: «${(l.concepto ?? '').slice(0, 60)}»`)
      continue
    }
    const importe = r2(sesiones * tarifa)
    if (importeLeido != null && Math.abs(importeLeido - importe) > TOLERANCIA_CUADRE) {
      avisos.push(`La línea «${(l.concepto ?? '').slice(0, 40)}» dice ${importeLeido}€ pero ${sesiones}×${tarifa}€ son ${importe}€`)
      continue
    }
    const contratada = tarifas[pid]
    if (contratada != null && Math.abs(contratada - tarifa) > 0.001) {
      avisos.push(`Tarifa distinta de la contratada en ${pid}: factura ${tarifa}€, contratada ${contratada}€`)
    }
    limpieza.push({ propertyId: pid, sesiones, tarifa, importe })
  }

  let lavanderia = 0
  for (const l of cruda.lavanderia ?? []) {
    const imp = num(l.importe)
    if (imp == null || imp < 0) {
      avisos.push(`Línea de lavandería sin importe legible: «${(l.concepto ?? '').slice(0, 60)}»`)
      continue
    }
    lavanderia = r2(lavanderia + imp)
  }

  // La prueba que no depende del formato: lo leído tiene que sumar la factura.
  const base = r2(limpieza.reduce((s, l) => s + l.importe, 0) + lavanderia)
  const totalCalculado = r2(base * (1 + IVA_LIMPIEZA))
  if (Math.abs(totalCalculado - total) > TOLERANCIA_CUADRE) {
    avisos.unshift(
      `La lectura no cuadra con el total: líneas ${base}€ + IVA = ${totalCalculado}€, factura ${total}€ ` +
      `(diferencia ${r2(totalCalculado - total)}€) — no se aplica el desglose`,
    )
    return { factura: null, avisos }
  }
  if (!limpieza.length) {
    return { factura: null, avisos: [...avisos, 'La factura no trae ninguna línea de limpieza utilizable'] }
  }

  const baseLeida = num(cruda.base)
  if (baseLeida != null && Math.abs(baseLeida - base) > TOLERANCIA_CUADRE) {
    avisos.push(`La base impresa (${baseLeida}€) no coincide con la suma de líneas (${base}€)`)
  }

  return {
    factura: {
      numero: cruda.numero?.trim() || null,
      periodo: /^\d{4}-\d{2}$/.test(cruda.periodo ?? '') ? cruda.periodo! : null,
      fecha: cruda.fecha?.trim() || null,
      total: r2(total),
      base,
      iva: r2(total - base),
      limpieza,
      lavanderia,
    },
    avisos,
  }
}

export interface DesgloseFactura {
  /** Limpieza por piso CON IVA (el P&L es de caja, como el resto de columnas). */
  limpieza: Map<string, number>
  /** Lavandería CON IVA. Absorbe el residuo de redondeo para que la suma sea el pago exacto. */
  lavanderia: number
}

/**
 * Pasa la factura a los importes que pinta el P&L. El residuo de redondeo se carga a la
 * lavandería a propósito: es el concepto que se reparte después por capacidad × reservas, así
 * que un céntimo ahí no distorsiona ninguna limpieza y la suma cuadra con el apunte del banco.
 */
export function desgloseDeFactura(factura: FacturaLimpieza): DesgloseFactura {
  const limpieza = new Map<string, number>()
  let repartido = 0
  for (const l of factura.limpieza) {
    const conIva = r2(l.importe * (1 + IVA_LIMPIEZA))
    limpieza.set(l.propertyId, r2((limpieza.get(l.propertyId) ?? 0) + conIva))
    repartido = r2(repartido + conIva)
  }
  return { limpieza, lavanderia: r2(factura.total - repartido) }
}

/**
 * Elige la factura que paga un movimiento. Casa por TOTAL (las facturas de Si que Brilla se pagan
 * enteras), y una factura ya casada con otro apunte no vuelve a usarse: dos pagos idénticos el
 * mismo mes son dos facturas distintas, no la misma contada dos veces.
 */
export function casarFacturaConPago<F extends { total: number }>(
  importe: number,
  facturas: F[],
  yaUsadas: ReadonlySet<F>,
): F | null {
  for (const f of facturas) {
    if (yaUsadas.has(f)) continue
    if (Math.abs(Number(f.total) - importe) <= TOLERANCIA_CUADRE) return f
  }
  return null
}
