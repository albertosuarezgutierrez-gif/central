import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esGastoDePisos, sqlGastoDePisos, PROPIEDADES_NO_PISOS } from './gasto-de-pisos.ts'

test('lo que está en la bandeja NO cuenta como gasto contabilizado', () => {
  // El caso que disparó todo: la reserva del edificio de C/ San Luis 9, sin revisar.
  assert.equal(esGastoDePisos({ propiedad: 'prop_house_sevillana', revisado: false }), false)
  // `revisado` sin constar es un «no lo sé», no un sí.
  assert.equal(esGastoDePisos({ propiedad: 'prop_house_sevillana', revisado: null }), false)
  assert.equal(esGastoDePisos({ propiedad: 'prop_house_sevillana' }), false)
  assert.equal(esGastoDePisos({ propiedad: 'prop_house_sevillana', revisado: true }), true)
})

test('lo que no es de los pisos queda fuera aunque esté revisado', () => {
  // Correduría (IONOS, Vercel, Anthropic…): se imputan con propiedad NULL.
  assert.equal(esGastoDePisos({ propiedad: null, revisado: true }), false)
  assert.equal(esGastoDePisos({ revisado: true }), false)
  assert.equal(esGastoDePisos({ propiedad: 'prop_personal', revisado: true }), false)
  assert.equal(esGastoDePisos({ propiedad: '', revisado: true }), false)
})

test('los gastos COMPARTIDOS de los pisos sí cuentan en el total de SIVRA', () => {
  // Distinto del P&L por piso (pl-mensual.ts), que los excluye porque necesita saber de cuál son.
  assert.equal(esGastoDePisos({ propiedad: 'prop_multi_apartamentos', revisado: true }), true)
  for (const p of ['prop_duplex_center', 'prop_luxury_busto', 'prop_busto_reform', 'prop_house_sevillana'])
    assert.equal(esGastoDePisos({ propiedad: p, revisado: true }), true)
})

test('el SQL dice lo mismo que el predicado, y se puede cualificar con alias', () => {
  const sql = sqlGastoDePisos()
  assert.match(sql, /revisado = true/)
  assert.match(sql, /propiedad IS NOT NULL/)
  for (const p of PROPIEDADES_NO_PISOS) assert.ok(sql.includes(`'${p}'`), `falta ${p} en el NOT IN`)
  assert.match(sqlGastoDePisos('g'), /g\.revisado = true AND g\.propiedad IS NOT NULL/)
})

test('GUARDIÁN: getResumenSivra usa el filtro en sus DOS ramas', () => {
  // Ni `tsc` ni el build miran dentro de un `Prisma.sql`: si alguien vuelve a sumar `gastos` a
  // pelo, la card de SIVRA vuelve a contar la bandeja y la correduría. Se vigila sobre el FUENTE.
  const src = readFileSync(new URL('../financiero.ts', import.meta.url), 'utf8')
  const sumasDeGastos = src.match(/FROM gastos/g) ?? []
  assert.equal(sumasDeGastos.length, 2, 'getResumenSivra tiene 2 consultas a `gastos` (con y sin propertyId)')
  // Cuenta los usos REALES (dentro de `Prisma.raw`), no las menciones en comentarios.
  assert.equal(
    (src.match(/Prisma\.raw\(sqlGastoDePisos\(\)\)/g) ?? []).length, 2,
    'las DOS ramas deben filtrar con sqlGastoDePisos() — la de propertyId también, por `revisado`',
  )
})
