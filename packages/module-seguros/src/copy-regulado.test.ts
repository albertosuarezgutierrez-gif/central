import test from 'node:test'
import assert from 'node:assert/strict'
import { PROHIBIDO, ACOTA_AMBITO, revisarCopy, explicarInfracciones } from './copy-regulado.ts'

test('caza las promesas de precio y los superlativos', () => {
  const casos = [
    'Te ahorramos hasta un 40 % en tu seguro',
    'la mejor póliza del mercado',
    'el seguro más barato para tu coche',
    'garantizamos el precio más bajo',
    'un seguro sin letra pequeña',
  ]
  for (const c of casos) {
    assert.ok(revisarCopy(c).length > 0, `no cazó: ${c}`)
  }
})

test('deja pasar el copy que informa sin prometer', () => {
  const limpios = [
    'Somos correduría: trabajamos con varias compañías y el análisis lo hacemos nosotros.',
    'El preaviso del artículo 22 de la Ley de Contrato de Seguro es de un mes.',
    'Conviene revisar si las sumas aseguradas se corresponden con lo que hay hoy dentro.',
    'La prima la fija cada compañía según el riesgo.',
  ]
  for (const c of limpios) {
    assert.deepEqual(revisarCopy(c), [], `falso positivo en: ${c}`)
  }
})

test('caza las frases que acotan el ámbito, y se puede apagar cuando la ciudad ES el dato', () => {
  const acota = 'Correduría de seguros en Sevilla y su provincia'
  assert.ok(revisarCopy(acota).length > 0, 'no cazó el ámbito acotado')
  // El fuero de un aviso legal nombra los juzgados de la ciudad del titular:
  // es una cláusula jurídica, no una promesa comercial.
  assert.deepEqual(
    revisarCopy(acota, { ambito: false }).filter((i) => ACOTA_AMBITO.some((r) => String(r.patron) === i.patron)),
    [],
    'con ambito:false no debería quedar ninguna infracción de geografía',
  )
})

// 🚨 El motivo por el que los patrones NO llevan `g`: uno global guarda
// `lastIndex` entre llamadas, así que el SEGUNDO texto se examinaría desde la
// posición donde acabó el primero y podría salir limpio sin haberse mirado
// entero. Es un fallo mudo, del que no queda rastro.
test('la misma regla aplicada dos veces da el mismo resultado', () => {
  const sucio = 'el seguro más barato'
  const a = revisarCopy(sucio)
  const b = revisarCopy(sucio)
  assert.deepEqual(a, b, 'el resultado cambia entre llamadas: alguna regla lleva la bandera g')
  for (const r of [...PROHIBIDO, ...ACOTA_AMBITO]) {
    assert.equal(r.patron.global, false, `${r.patron} lleva la bandera g`)
  }
})

test('devuelve TODAS las infracciones, no solo la primera', () => {
  const doble = 'Te ahorramos hasta un 30 % y garantizamos la mejor póliza en Sevilla'
  const found = revisarCopy(doble)
  assert.ok(found.length >= 3, `esperaba varias infracciones, encontré ${found.length}`)
})

// El fragmento es lo que hace accionable el fallo: sin él, el mensaje dice
// «hay una promesa de precio» y hay que releerse el texto entero para dar con
// ella.
test('cada infracción trae el trozo real que la disparó', () => {
  const [i] = revisarCopy('esto es lo más barato que verás')
  assert.ok(i, 'no cazó nada')
  assert.match(i.fragmento, /m[áa]s barato/i)
  assert.match(explicarInfracciones([i]), /más barato/i)
})

test('un texto limpio no genera explicación', () => {
  assert.equal(explicarInfracciones(revisarCopy('Correduría de seguros que media en toda España.')), '')
})
