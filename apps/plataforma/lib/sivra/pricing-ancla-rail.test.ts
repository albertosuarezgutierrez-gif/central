import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anclaRail } from './pricing-ancla-rail.ts'

test('con precio de ayer, ése es el ancla', () => {
  assert.equal(anclaRail({ ref24: 312, primeroHoy: 250, actual: 250 }), 312)
})

test('sin precio de ayer, ancla el precio con el que la fecha empezó el día', () => {
  // Fecha nunca escrita (las 16 de House Sevillana de jun-ago 2027, 19/08/2026): no hay ref24,
  // pero sí sabemos a cuánto llegó la fecha a la primera pasada.
  assert.equal(anclaRail({ ref24: null, primeroHoy: 635, actual: 508 }), 635)
})

test('en la primera pasada del día el ancla es el precio vivo', () => {
  assert.equal(anclaRail({ ref24: null, primeroHoy: null, actual: 180 }), 180)
})

test('el retoque manual en Smoobu no ensancha el raíl del motor', () => {
  // Si alguien sube un precio a mano, `primeroHoy` lo recoge y `ref24` no. El contrato es
  // "±X% respecto a lo que aplicó el MOTOR ayer", así que manda ref24.
  assert.equal(anclaRail({ ref24: 100, primeroHoy: 400, actual: 400 }), 100)
})

test('un ancla a 0 o negativa se descarta en vez de dejar el precio en 0€', () => {
  assert.equal(anclaRail({ ref24: 0, primeroHoy: 250, actual: 200 }), 250)
  assert.equal(anclaRail({ ref24: -5, primeroHoy: 0, actual: 200 }), 200)
  assert.equal(anclaRail({ ref24: null, primeroHoy: NaN, actual: 200 }), 200)
})

test('el tope del día deja de multiplicarse entre pasadas', () => {
  // El fallo real del 19/08/2026: Busto Reform 18/09, tres pasadas con max_change_pct=0,20.
  // Antes cada pasada anclaba en la anterior (312 -> 250 -> 200 -> 160: -49% en un día).
  const PCT = 0.2
  const suelo = (ancla: number) => Math.round(ancla * (1 - PCT))

  const ayer = 312
  let primeroHoy: number | null = null
  let vivo = 312
  const escritos: number[] = []

  for (let pasada = 0; pasada < 3; pasada++) {
    if (primeroHoy === null) primeroHoy = vivo // old_price de la primera pasada
    const objetivoAgresivo = 50 // el mercado pide mucho menos: el raíl es lo único que frena
    const precio = Math.max(objetivoAgresivo, suelo(anclaRail({ ref24: ayer, primeroHoy, actual: vivo })))
    escritos.push(precio)
    vivo = precio
  }

  assert.deepEqual(escritos, [250, 250, 250])
  assert.ok(escritos.at(-1)! >= suelo(ayer), 'el día entero no puede pasar de -20% sobre ayer')
})

test('sin histórico el tope del día también aguanta', () => {
  const PCT = 0.2
  const suelo = (ancla: number) => Math.round(ancla * (1 - PCT))

  let primeroHoy: number | null = null
  let vivo = 635
  const escritos: number[] = []

  for (let pasada = 0; pasada < 3; pasada++) {
    if (primeroHoy === null) primeroHoy = vivo
    const precio = Math.max(50, suelo(anclaRail({ ref24: null, primeroHoy, actual: vivo })))
    escritos.push(precio)
    vivo = precio
  }

  assert.deepEqual(escritos, [508, 508, 508])
})
