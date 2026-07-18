// Clonado de grandes inversores (formulario 13F, público en la SEC / agregado en Dataroma).
// Los fondos >100M$ publican sus posiciones cada trimestre (~45 días de retraso, irrelevante para
// tesis de años). La señal de convicción está en el CAMBIO entre trimestres: una compra NUEVA de un
// gestor value probado, y sobre todo VARIOS gestores comprando lo mismo, es un lead fuerte para
// estudiar (siempre en paper). Todo puro; el consumidor aporta los holdings ya parseados.

export type Holding13F = {
  simbolo: string
  acciones: number   // nº de acciones al cierre del trimestre
  valorUsd?: number  // valor de mercado reportado (opcional; para ponderar por tamaño de posición)
}

export type MovimientoGuru = 'nueva' | 'amplia' | 'mantiene' | 'recorta' | 'vende'

// Clasifica el cambio de una posición entre el trimestre previo y el actual.
export function clasificarMovimiento(accionesAntes: number, accionesDespues: number): MovimientoGuru {
  if (accionesAntes <= 0 && accionesDespues > 0) return 'nueva'
  if (accionesDespues <= 0 && accionesAntes > 0) return 'vende'
  if (accionesDespues > accionesAntes) return 'amplia'
  if (accionesDespues < accionesAntes) return 'recorta'
  return 'mantiene'
}

// Peso de convicción de cada tipo de movimiento (comprar pesa; vender resta).
const PESO: Record<MovimientoGuru, number> = { nueva: 2, amplia: 1, mantiene: 0, recorta: -1, vende: -2 }

export type Cartera13F = { gestor: string; posiciones: Holding13F[] }

// Compara la cartera de UN gestor entre dos trimestres y devuelve el movimiento por símbolo.
export function movimientosGuru(previa: Cartera13F, actual: Cartera13F): Array<{ simbolo: string; tipo: MovimientoGuru }> {
  const antes = new Map(previa.posiciones.map(p => [p.simbolo, p.acciones]))
  const simbolos = new Set([...previa.posiciones, ...actual.posiciones].map(p => p.simbolo))
  const out: Array<{ simbolo: string; tipo: MovimientoGuru }> = []
  for (const simbolo of simbolos) {
    const a = actual.posiciones.find(p => p.simbolo === simbolo)?.acciones ?? 0
    const tipo = clasificarMovimiento(antes.get(simbolo) ?? 0, a)
    out.push({ simbolo, tipo })
  }
  return out
}

export type ConviccionGuru = {
  simbolo: string
  score: number       // suma de pesos de movimiento entre todos los gestores
  comprando: number   // nº de gestores que ABREN o AMPLÍAN (la señal fuerte de "varios lo compran")
  vendiendo: number   // nº que recortan o venden
}

// Agrega una lista PLANA de movimientos (de cualquier fuente) por símbolo y ordena por convicción.
// Usable tanto por el diff de trimestres como por la "actividad" que ya trae Dataroma directamente.
export function agregarConviccion(movimientos: Array<{ simbolo: string; tipo: MovimientoGuru }>): ConviccionGuru[] {
  const acc = new Map<string, ConviccionGuru>()
  for (const { simbolo, tipo } of movimientos) {
    const c = acc.get(simbolo) ?? { simbolo, score: 0, comprando: 0, vendiendo: 0 }
    c.score += PESO[tipo]
    if (tipo === 'nueva' || tipo === 'amplia') c.comprando += 1
    if (tipo === 'recorta' || tipo === 'vende') c.vendiendo += 1
    acc.set(simbolo, c)
  }
  return [...acc.values()].sort((a, b) => b.score - a.score || b.comprando - a.comprando)
}

// Agrega los movimientos de VARIOS gestores por símbolo (diffando trimestre previo vs actual). Un valor
// que varios gestores probados están abriendo/ampliando a la vez sube arriba; el que sueltan, baja.
export function conviccionGurus(carteras: Array<{ previa: Cartera13F; actual: Cartera13F }>): ConviccionGuru[] {
  return agregarConviccion(carteras.flatMap(({ previa, actual }) => movimientosGuru(previa, actual)))
}
