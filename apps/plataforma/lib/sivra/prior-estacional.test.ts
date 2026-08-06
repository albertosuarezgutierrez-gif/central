import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarPrior,
  indicesPrior,
  BAJADA_MAX,
  MIN_NOCHES_MES,
  type MesHistorico,
} from './prior-estacional.ts'

// Histórico real de los pisos (mediana de ADR por mes, 1.435 reservas desde 2022): abril 184€ es
// el pico —Semana Santa y Feria— y agosto 99€ el mínimo, con Sevilla a 40 grados y vacía.
const HIST: MesHistorico[] = [
  { mes: 1, adr: 108, nights: 200 }, { mes: 2, adr: 109, nights: 200 },
  { mes: 3, adr: 133, nights: 240 }, { mes: 4, adr: 184, nights: 300 },
  { mes: 5, adr: 153, nights: 260 }, { mes: 6, adr: 125, nights: 200 },
  { mes: 7, adr: 129, nights: 140 }, { mes: 8, adr: 99, nights: 120 },
  { mes: 9, adr: 124, nights: 250 }, { mes: 10, adr: 129, nights: 260 },
  { mes: 11, adr: 122, nights: 180 }, { mes: 12, adr: 157, nights: 160 },
]

const idxDe = (mes: number) => indicesPrior(HIST)[mes - 1]

test('abril sube y agosto baja: la curva propia tiene forma', () => {
  assert.ok(idxDe(4).alza > 1.2, `abril debería tirar hacia arriba: ${idxDe(4).alza}`)
  assert.equal(idxDe(4).baja, 1, 'un mes fuerte no baja nada por esta vía')
  assert.ok(idxDe(8).baja < 1, `agosto debería tirar hacia abajo: ${idxDe(8).baja}`)
})

// 🚨 El punto del módulo. Regla de Alberto: en agosto Sevilla está vacía y es NORMAL que no haya
// reservas — las pocas noches vendidas no son señal de que el precio esté alto.
test('la bajada NO usa la ocupación: agosto no se hunde por vender pocas noches', () => {
  // Mismo ADR, un tercio de las noches: la bajada tiene que quedarse igual. Si mirara la
  // ocupación, un agosto vacío —que es lo NORMAL en Sevilla— pediría hundir el precio.
  const pocasNoches = HIST.map(x => (x.mes === 8 ? { ...x, nights: 40 } : x))
  assert.equal(indicesPrior(pocasNoches)[7].baja, idxDe(8).baja)
})

test('la ocupación sí manda en la SUBIDA: un octubre flojo deja de tirar hacia arriba', () => {
  // Octubre vende mucho (260 noches) con ADR del montón: su fuerza viene de llenar, no del precio.
  const octubreFlojo = HIST.map(x => (x.mes === 10 ? { ...x, nights: 60 } : x))
  assert.ok(
    indicesPrior(octubreFlojo)[9].alza < idxDe(10).alza,
    'menos noches vendidas ⇒ menos empuje al alza',
  )
})

test('la bajada está topada: el ADR de agosto pide −23% y se queda en −15%', () => {
  const crudo = 99 / 133.7 // ADR de agosto sobre el medio ponderado ≈ 0,74
  assert.ok(crudo < BAJADA_MAX, 'el índice crudo pide más bajada que el tope')
  assert.equal(idxDe(8).baja, BAJADA_MAX)
})

test('un mes sin muestra suficiente no mueve el precio', () => {
  const [uno] = indicesPrior([{ mes: 8, adr: 40, nights: MIN_NOCHES_MES - 1 }])
  assert.deepEqual(uno, { alza: 1, baja: 1 })
})

test('sin histórico, todos los meses quedan neutros', () => {
  const idx = indicesPrior([])
  assert.equal(idx.length, 12)
  assert.ok(idx.every(i => i.alza === 1 && i.baja === 1))
})

// ── aplicarPrior ────────────────────────────────────────────────────────────

test('al alza sin bucket del mes: el prior sustituye al global plano', () => {
  const t = aplicarPrior({ target: 100, indice: { alza: 1.4, baja: 1 }, anclaGlobal: 100, floor: 80, hayBucketMes: false })
  assert.equal(t, 140)
})

test('al alza con bucket del mes: el mercado fresco manda, el prior solo es red', () => {
  // Índice alto (≥1,15) → red al 90%. Índice moderado → no toca nada.
  assert.equal(aplicarPrior({ target: 100, indice: { alza: 1.4, baja: 1 }, anclaGlobal: 100, floor: 80, hayBucketMes: true }), 126)
  assert.equal(aplicarPrior({ target: 100, indice: { alza: 1.1, baja: 1 }, anclaGlobal: 100, floor: 80, hayBucketMes: true }), 100)
})

test('a la baja: corrige el objetivo en un mes flojo sin mercado medido', () => {
  const t = aplicarPrior({ target: 120, indice: { alza: 1, baja: 0.85 }, anclaGlobal: 120, floor: 80, hayBucketMes: false })
  assert.equal(t, 102) // 120 × 0,85
})

test('a la baja NUNCA por debajo del suelo del piso: no se regala el precio', () => {
  const t = aplicarPrior({ target: 120, indice: { alza: 1, baja: 0.85 }, anclaGlobal: 120, floor: 115, hayBucketMes: false })
  assert.equal(t, 115, 'el floor manda sobre el prior')
})

test('a la baja NO actúa si hay bucket del mes: ese mercado ya dice el precio', () => {
  const t = aplicarPrior({ target: 120, indice: { alza: 1, baja: 0.85 }, anclaGlobal: 120, floor: 80, hayBucketMes: true })
  assert.equal(t, 120)
})

test('el prior no sube un objetivo que ya está por encima', () => {
  const t = aplicarPrior({ target: 200, indice: { alza: 1.4, baja: 1 }, anclaGlobal: 100, floor: 80, hayBucketMes: false })
  assert.equal(t, 200)
})

test('un índice neutro deja el objetivo intacto', () => {
  const t = aplicarPrior({ target: 130, indice: { alza: 1, baja: 1 }, anclaGlobal: 120, floor: 80, hayBucketMes: false })
  assert.equal(t, 130)
})
