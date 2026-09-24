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

// ── Guardián de la instrumentación (04/09/2026) ──────────────────────────────────────────────────
// El clamp de arriba se pudo diagnosticar porque se leyó el FUENTE. La ida y vuelta de House del
// mismo día no se pudo: sus dos filas de `pricing_applied` tenían inputs idénticos y resultado
// opuesto, y los cuatro números que lo explican —el objetivo antes de acotar, las dos puntas del
// clamp y el ancla del raíl— no se persistían.
//
// Estos tests no comprueban aritmética: comprueban que los datos LLEGAN a la tabla. Es un fallo
// que compila, no rompe ningún test y solo se nota meses después, cuando hace falta auditar.
const COLUMNAS_AUDITORIA = ['target_crudo', 'clamp_floor', 'clamp_ceil', 'rail_ancla', 'rail_ancla_origen']

test('las columnas de auditoría del clamp y del raíl se persisten en pricing_applied', () => {
  const insert = FUENTE.match(/INSERT INTO pricing_applied \(([^)]*)\)/)
  assert.ok(insert, 'no se encuentra el INSERT de pricing_applied')
  const cols = insert[1].split(',').map(c => c.trim())
  for (const c of COLUMNAS_AUDITORIA) {
    assert.ok(cols.includes(c), `pricing_applied ya no persiste «${c}»: una decisión vuelve a ser no auditable`)
  }
  // La lista de columnas y la de valores tienen que cuadrar, o Postgres escribe en la columna
  // equivocada — un dato plausible en el sitio que no es, que es peor que un hueco.
  const values = FUENTE.match(/Prisma\.sql`\(\$\{r\.property_id\}[^`]*`\)/)
  assert.ok(values, 'no se encuentra la fila de VALUES del INSERT')
  const nValores = (values[0].match(/\$\{/g) || []).length
  assert.equal(nValores, cols.length,
    `el INSERT declara ${cols.length} columnas y la fila trae ${nValores} valores`)
})

test('el ancla del raíl se registra CON su origen, resuelto en un solo sitio', () => {
  // `anclaRailCon` devuelve valor+origen juntos a propósito. Si el motor vuelve a `anclaRail` y
  // deriva el origen aparte, las dos precedencias se separan y la fila dirá que el ±20% se midió
  // desde ayer cuando se midió desde el precio vivo.
  assert.match(FUENTE, /anclaRailCon\(/, 'el motor ya no usa anclaRailCon: el origen del ancla se re-deriva')
  assert.doesNotMatch(FUENTE, /const ancla = anclaRail\(/,
    'el motor volvió a anclaRail() directo: el origen persistido puede divergir del valor usado')
})
