import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { botonesPropuesta, botonReintento, decidirBotonFactura, textoPropuesta, PREFIJO_FACTURA_HUESPED } from './telegram.ts'

const ID = '0b6f6d1e-2c4a-4f7e-9a51-3d2e1c0b9a88'
const CHAT = '111222333'

test('solo la PERSONA autorizada (from.id = TELEGRAM_CHAT_ID) puede emitir', () => {
  assert.deepEqual(decidirBotonFactura({ from: { id: 111222333 } }, 'emi', [ID], CHAT), { ok: true, accion: 'emi', facturaId: ID, quien: CHAT })
  for (const from of [{ id: 999 }, {}, undefined]) assert.equal(decidirBotonFactura({ from } as never, 'emi', [ID], CHAT).ok, false)
  // Sin chat configurado: nadie (fail-closed).
  assert.equal(decidirBotonFactura({ from: { id: CHAT } }, 'emi', [ID], undefined).ok, false)
  assert.equal(decidirBotonFactura({ from: { id: CHAT } }, 'emi', [ID], '').ok, false)
})

test('forma cerrada: acción conocida y un único uuid', () => {
  for (const [a, args] of [['borrar', [ID]], ['emi', []], ['emi', [ID, 'x']], ['emi', ['1; DROP']], ['emi', [ID.toUpperCase()]]] as const) {
    assert.equal(decidirBotonFactura({ from: { id: CHAT } }, a, args, CHAT).ok, false, `${a} ${args}`)
  }
})

test('callback_data ≤ 64 bytes y con prefijo propio', () => {
  for (const b of [...botonesPropuesta(ID).flat(), ...botonReintento(ID).flat()]) {
    assert.ok(Buffer.byteLength(b.callback, 'utf8') <= 64, b.callback)
    assert.ok(b.callback.startsWith(`${PREFIJO_FACTURA_HUESPED}_`))
  }
})

test('el prefijo está enrutado en el webhook y no lo usa nadie más', () => {
  const ruta = readFileSync(new URL('../../../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /prefix === PREFIJO_FACTURA_HUESPED/)
  assert.match(ruta, /decidirBotonFactura\(cb, action, args, process\.env\.TELEGRAM_CHAT_ID\)/)
  assert.doesNotMatch(ruta, /prefix === 'fhu'/)
})

test('el texto escapa lo que escribe el huésped y avisa del bloqueo', () => {
  const t = textoPropuesta({
    piso: 'House sevillana', reservationId: '157416681', estanciaDesde: '2027-07-31', estanciaHasta: '2027-08-03',
    receptor: { tipo: 'empresa', nombre: '<b>Evil</b>', nif: 'B12345678', pais: 'ES', email: 'a@b.es', direccion: { pais: 'ES', cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla', via: 'CL SOCORRO', numero: '24', resto: null, viaCatastro: true } },
    total: 363, base: null, cuota: null, tipoIva: null, bloqueo: 'falta configurar IVA/serie: falta el tipo de IVA',
  })
  assert.doesNotMatch(t, /<b>Evil<\/b>/)
  assert.match(t, /&lt;b&gt;Evil/)
  assert.match(t, /363,00€/)
  assert.match(t, /falta configurar IVA\/serie/)
  assert.match(t, /no emitirá/)
})
