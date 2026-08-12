import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { atribuirCanal, comisionPct, esCentinela, resumirCanales } from './atribucion-canal.ts'

describe('atribucion-canal — el "no lo sé" no se disfraza de dato', () => {
  test('OTRO con comisión 0,00 % es DIRECTO: el caso real de 1.383,24 € (nov-2026)', () => {
    // Fila real de `incomes`: portal='OTRO', bruto y neto idénticos. 2 noches, ~691 €/noche —
    // el grupo grande que persigue la landing. Con la lógica vieja contaba como «0 € de directo».
    const a = atribuirCanal({ portal: 'OTRO', amount: 1383.24, amount_gross: 1383.24 })
    assert.equal(a.canal, 'DIRECTO')
    assert.equal(a.requiereRevision, false)
    assert.ok(a.comisionPct !== null && Math.abs(a.comisionPct) < 0.01)
  })

  test('sin bruto NO se deduce nada — el hueco jamás se lee como "no hubo comisión"', () => {
    const a = atribuirCanal({ portal: 'OTRO', amount: 900, amount_gross: null })
    assert.equal(a.canal, null, 'un amount_gross ausente no puede producir un DIRECTO')
    assert.equal(a.comisionPct, null, 'la comisión desconocida es null, nunca 0')
    assert.equal(a.requiereRevision, true)
  })

  test('portal NULL se trata igual que el centinela OTRO', () => {
    assert.equal(atribuirCanal({ portal: null, amount: 500, amount_gross: 500 }).canal, 'DIRECTO')
    assert.equal(atribuirCanal({ portal: null, amount: 500, amount_gross: null }).canal, null)
  })

  test('Booking con su ~19,72 % es OTA y no pide revisión', () => {
    const a = atribuirCanal({ portal: 'BOOKING', amount: 80.28, amount_gross: 100 })
    assert.equal(a.canal, 'OTA')
    assert.equal(a.requiereRevision, false)
    assert.ok(a.comisionPct !== null && Math.abs(a.comisionPct - 19.72) < 0.01)
  })

  test('una OTA sin bruto sigue siendo OTA: el portal declarado manda sobre la comisión', () => {
    const a = atribuirCanal({ portal: 'AIRBNB', amount: 300, amount_gross: null })
    assert.equal(a.canal, 'OTA')
    assert.equal(a.comisionPct, null)
  })

  test('bloqueos y pruebas (0 €, 1 €) no engordan el canal directo', () => {
    for (const importe of [0, 1]) {
      const a = atribuirCanal({ portal: 'OTRO', amount: importe, amount_gross: importe })
      assert.equal(a.canal, null, `${importe} € no es una venta`)
      assert.equal(a.requiereRevision, false, 'es ruido conocido, no algo que revisar a mano')
    }
  })

  test('comisión > 0 sin portal: hubo intermediario, pero se admite que no se sabe cuál', () => {
    const a = atribuirCanal({ portal: 'OTRO', amount: 85, amount_gross: 100 })
    assert.equal(a.canal, 'OTA')
    assert.equal(a.requiereRevision, true, 'hay que identificar el intermediario')
  })

  test('un portal desconocido no es un hueco: se conserva y se marca para revisar', () => {
    const a = atribuirCanal({ portal: 'HOTELBEDS', amount: 90, amount_gross: 100 })
    assert.equal(a.canal, null)
    assert.equal(a.requiereRevision, true)
    assert.match(a.motivo, /HOTELBEDS/)
  })

  test('bruto <= 0 no divide entre cero ni inventa un 0 %', () => {
    assert.equal(comisionPct({ portal: 'OTRO', amount: 0, amount_gross: 0 }), null)
    assert.equal(comisionPct({ portal: 'OTRO', amount: 10, amount_gross: -5 }), null)
  })

  test('esCentinela reconoce los cajones de sastre, con espacios y en minúsculas', () => {
    for (const v of ['OTRO', ' otro ', 'Desconocido', 'N/A', '', null, undefined, 'sin clasificar'])
      assert.equal(esCentinela(v), true, `«${v}» debería ser centinela`)
    for (const v of ['BOOKING', 'Airbnb', 'HOTELBEDS'])
      assert.equal(esCentinela(v), false, `«${v}» NO es centinela`)
  })

  test('el resumen expone lo no clasificado aparte, sin repartirlo entre directo y OTA', () => {
    const r = resumirCanales([
      { portal: 'BOOKING', amount: 80.28, amount_gross: 100 },
      { portal: 'OTRO', amount: 1383.24, amount_gross: 1383.24 },
      { portal: 'OTRO', amount: 900, amount_gross: null }, // no se sabe
      { portal: 'OTRO', amount: 1, amount_gross: 1 }, // ruido
    ])
    assert.equal(r.directo, 1383.24)
    assert.equal(r.ota, 80.28)
    assert.equal(r.sinClasificar, 2)
    assert.equal(r.importeSinClasificar, 901, 'los 900 € sin bruto NO se suman a ningún canal')
    assert.equal(r.filasARevisar, 1)
  })

  test('sin filas todo es cero — y eso sí es un cero honesto', () => {
    assert.deepEqual(resumirCanales([]), {
      directo: 0, ota: 0, sinClasificar: 0, importeSinClasificar: 0, filasARevisar: 0,
    })
  })
})
