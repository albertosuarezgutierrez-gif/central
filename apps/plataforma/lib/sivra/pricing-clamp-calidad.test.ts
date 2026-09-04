import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Guardián del invariante del clamp (04/09/2026).
//
// `target = clamp(baseD, floorD, ceilD)`. `baseD` lleva `dqDate` (demanda × calidad). Si los
// límites NO lo llevan, el clamp acota un valor ajustado entre dos límites sin ajustar —dos
// espacios distintos— y en cuanto el descuento empuja la base por debajo del `floor_pctl`, el
// clamp la devuelve al p25 crudo: **el descuento de calidad se anula a sí mismo**.
//
// Medido contra producción ese día: `quality_factor` 0,848 en Busto Reform con el suelo al 0,874
// del objetivo → mordía en 9 de sus 12 meses, +5,8% de precio, en el piso que vende en el P10.
//
// Ni `tsc` ni el build pueden ver esto: las dos formas compilan igual y dan un número plausible.
// Por eso el test lee el FUENTE. Si algún día el clamp se extrae a un módulo puro, este guardián
// se sustituye por tests de esa función y se borra.
const FUENTE = readFileSync(
  new URL('../../app/api/sivra/pricing/apply/route.ts', import.meta.url), 'utf8')

test('floorD y ceilD del bucket de mes llevan dqDate, igual que baseD', () => {
  const floor = /const floorD = useMonth \? aBase\(mb!\.flo \* dqDate\)/.test(FUENTE)
  const ceil = /const ceilD = useMonth \? aBase\(mb!\.cei \* dqDate\)/.test(FUENTE)
  assert.ok(floor, 'floorD debe multiplicar por dqDate (si no, el suelo anula el descuento de calidad)')
  assert.ok(ceil, 'ceilD debe multiplicar por dqDate (el clamp es un intervalo: bajar una sola punta lo sesga)')
})

test('la rama GLOBAL del clamp tambien ajusta sus dos limites', () => {
  assert.match(FUENTE, /aBase\(floorGuestGlobal \* dqDate\)/)
  assert.match(FUENTE, /aBase\(ceilGuestGlobal \* dqDate\)/)
})

test('ya no quedan limites SIN ajustar: las constantes crudas no existen', () => {
  // `floorBaseGlobal`/`ceilBaseGlobal` eran los límites precalculados sin factores. Si alguien los
  // reintroduce, el bug vuelve en silencio.
  assert.ok(!FUENTE.includes('floorBaseGlobal'), 'floorBaseGlobal era el límite sin ajustar; no debe volver')
  assert.ok(!FUENTE.includes('ceilBaseGlobal'), 'ceilBaseGlobal era el límite sin ajustar; no debe volver')
})

test('baseD sigue llevando dqDate (el otro lado del invariante)', () => {
  assert.match(FUENTE, /const baseD = useMonth \? aBase\(mb!\.med \* dqDate\)/)
})
