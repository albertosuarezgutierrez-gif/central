import test from 'node:test'
import assert from 'node:assert/strict'

import {
  claveCerrado,
  claveReservaHuecos,
  clavePedido,
  declaradaVigente,
  DIAS_CERRADO,
  estadoHuecos,
  huecosDeProteccion,
  mensajePeticionHuecos,
  MAX_HUECOS,
  ramosValidos,
} from './huecos-proteccion.ts'

const AHORA = new Date('2026-10-13T10:00:00Z')
const hace = (d: number) => new Date(AHORA.getTime() - d * 86_400_000)

test('hogar y auto: faltan el resto, máximo 2 y en orden de prioridad', () => {
  assert.deepEqual(huecosDeProteccion({ carteraLeida: true, ramos: ['hogar', 'auto'] }), ['vida', 'decesos'])
  assert.equal(huecosDeProteccion({ carteraLeida: true, ramos: ['salud'] }).length, MAX_HUECOS)
})

test('con todo cubierto no hay huecos', () => {
  assert.deepEqual(
    huecosDeProteccion({ carteraLeida: true, ramos: ['hogar', 'auto', 'vida', 'decesos', 'salud', 'responsabilidad_civil'] }),
    [],
  )
})

test('una moto cubre «auto»; comercio y comunidades no cubren nada básico pero no bloquean', () => {
  const conMoto = huecosDeProteccion({ carteraLeida: true, ramos: ['moto'] })
  assert.ok(conMoto.length > 0 && !conMoto.includes('auto'))
  assert.ok(huecosDeProteccion({ carteraLeida: true, ramos: ['comunidades', 'auto'] }).includes('hogar'))
})

test('cartera ilegible o bóveda vacía: no se afirma ausencia', () => {
  assert.deepEqual(huecosDeProteccion({ carteraLeida: false, ramos: ['hogar'] }), [])
  assert.deepEqual(huecosDeProteccion({ carteraLeida: true, ramos: [] }), [])
})

test('un ramo sin clasificar (null, vacío, otros, raro) calla: podría ser un básico', () => {
  for (const raro of [null, '', 'otros', 'agrario']) {
    assert.deepEqual(huecosDeProteccion({ carteraLeida: true, ramos: ['hogar', raro] }), [], String(raro))
  }
})

test('declaradaVigente: vencida fuera, sin fecha dentro', () => {
  assert.equal(declaradaVigente('2026-01-01', '2026-10-13'), false)
  assert.equal(declaradaVigente('2026-10-13', '2026-10-13'), true)
  assert.equal(declaradaVigente(null, '2026-10-13'), true)
})

test('estado: sin huecos oculta; cerrar oculta 90 días y luego vuelve', () => {
  const h = ['vida'] as const
  assert.equal(estadoHuecos({ huecos: [], marcas: [], ahora: AHORA }), 'oculta')
  assert.equal(estadoHuecos({ huecos: h, marcas: [], ahora: AHORA }), 'mostrar')
  const dentro = [{ clave: claveCerrado(hace(DIAS_CERRADO - 1)), creadoEn: hace(DIAS_CERRADO - 1) }]
  const fuera = [{ clave: claveCerrado(hace(DIAS_CERRADO + 1)), creadoEn: hace(DIAS_CERRADO + 1) }]
  assert.equal(estadoHuecos({ huecos: h, marcas: dentro, ahora: AHORA }), 'oculta')
  assert.equal(estadoHuecos({ huecos: h, marcas: fuera, ahora: AHORA }), 'mostrar')
})

test('estado: pedido gana a cerrado y dice que ya está recibido', () => {
  const marcas = [
    { clave: claveCerrado(AHORA), creadoEn: AHORA },
    { clave: clavePedido(AHORA), creadoEn: AHORA },
  ]
  assert.equal(estadoHuecos({ huecos: ['vida'], marcas, ahora: AHORA }), 'ya_pedido')
})

test('estado: marcas de otro prefijo no cuentan', () => {
  assert.equal(estadoHuecos({ huecos: ['vida'], marcas: [{ clave: 'captacion-pedida:x', creadoEn: AHORA }], ahora: AHORA }), 'mostrar')
})

test('la reserva cambia de clave al pasar la ventana', () => {
  assert.notEqual(claveReservaHuecos(AHORA), claveReservaHuecos(new Date(AHORA.getTime() + 11 * 60_000)))
})

test('ramosValidos: solo ramos de la lista, sin repetir, máx. 2', () => {
  assert.deepEqual(ramosValidos(['vida', 'vida', 'x', 'hogar', 'salud']), ['hogar', 'vida'])
  assert.deepEqual(ramosValidos('hogar'), [])
})

test('el mensaje escapa y no lleva importes', () => {
  const m = mensajePeticionHuecos({ identidadId: 'i', nombre: '<b>Ana</b>', ramos: ['vida'] })
  assert.match(m, /&lt;b&gt;Ana/)
  assert.doesNotMatch(m, /€|euros/)
})

test('carteraLeidaParaHuecos: solo con fichas o con «sin_ficha» confirmado', async () => {
  const { carteraLeidaParaHuecos } = await import('./huecos-proteccion.ts')
  assert.equal(carteraLeidaParaHuecos({ fichasVinculadas: 1, vinculo: null }), true)
  assert.equal(carteraLeidaParaHuecos({ fichasVinculadas: 0, vinculo: 'sin_ficha' }), true)
  for (const v of [null, 'ambiguo', 'sin_clave', 'error']) {
    assert.equal(carteraLeidaParaHuecos({ fichasVinculadas: 0, vinculo: v }), false, String(v))
  }
})
