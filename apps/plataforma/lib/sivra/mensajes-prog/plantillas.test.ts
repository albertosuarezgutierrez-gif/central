import test from 'node:test'
import assert from 'node:assert/strict'
import { renderPlantilla, renderAsunto, TIPOS_MENSAJE, type DatosPlantilla } from './plantillas.ts'

const BASE: DatosPlantilla = {
  guestName: 'Grégory Acobez',
  property: 'Duplex Center',
  propertyId: 'prop_duplex_center',
  checkIn: '2026-09-13',
  checkOut: '2026-09-20',
  horaCheckIn: '15:00',
  horaCheckOut: '11:00',
  noches: 7,
  codigos: { caja: '7272', wifiSsid: 'sercommBB1119', wifiPass: 'PWDEMO' },
  chekinUrl: 'https://guest.chekin.com/demo123',
  guestAppUrl: 'https://guest.smoobu.com/?t=demo&b=1',
  lateOfertaOk: null,
}

test('todas las plantillas renderizan con el nombre y el piso', () => {
  for (const tipo of TIPOS_MENSAJE) {
    const t = renderPlantilla(tipo, BASE)
    assert.ok(t.length > 40, tipo)
    assert.ok(t.includes('Grégory') || t.includes(BASE.guestName), tipo)
  }
})

test('la confirmación NO promete el parking propio (San Juan de la Palma) y pregunta la hora', () => {
  const t = renderPlantilla('confirmacion', BASE)
  assert.ok(!/san juan de la palma/i.test(t))
  assert.ok(/¿A qué hora/.test(t))
  assert.ok(t.includes('José Laguillo'))    // parkings públicos reales de parking.ts
})

test('el mensaje de 7 días lleva dirección y pasos pero NO códigos; la víspera SÍ', () => {
  const siete = renderPlantilla('acceso', BASE)
  assert.ok(siete.includes('Javier Lasso de la Vega'))
  assert.ok(!siete.includes('7272'))
  assert.ok(!siete.includes('PWDEMO'))
  const vispera = renderPlantilla('vispera_llegada', BASE)
  assert.ok(vispera.includes('7272'))
  assert.ok(vispera.includes('sercommBB1119'))
  assert.ok(vispera.includes('21:00'))      // horario de asistencia + llegada autónoma
})

test('víspera colapsada de última hora dice HOY, no mañana', () => {
  const t = renderPlantilla('vispera_llegada', { ...BASE, llegadaHoy: true })
  assert.ok(/Hoy te esperamos/.test(t))
  assert.ok(!/Mañana te esperamos/.test(t))
})

test('la oferta de las 12:00 SOLO sale con lateOfertaOk === true (null = sin verificar = callar)', () => {
  assert.ok(!renderPlantilla('vispera_salida', { ...BASE, lateOfertaOk: null }).includes('12:00'))
  assert.ok(!renderPlantilla('vispera_salida', { ...BASE, lateOfertaOk: false }).includes('12:00'))
  assert.ok(renderPlantilla('vispera_salida', { ...BASE, lateOfertaOk: true }).includes('12:00'))
})

test('vispera_salida del Dúplex manda las llaves a la mesa de la cocina; en Luxury, a la caja', () => {
  assert.ok(renderPlantilla('vispera_salida', BASE).includes('mesa alta de la cocina'))
  const lux = renderPlantilla('vispera_salida', { ...BASE, propertyId: 'prop_luxury_busto', property: 'Luxury Busto' })
  assert.ok(lux.includes('MISMO sitio donde se recogieron'))
})

test('estancia y post_salida no contienen códigos ni piden datos de pago', () => {
  for (const tipo of ['estancia', 'post_salida'] as const) {
    const t = renderPlantilla(tipo, BASE)
    assert.ok(!t.includes('7272'), tipo)
    assert.ok(!/bizum|transferencia|iban/i.test(t), tipo)
  }
})

test('el asunto solo existe en los hitos con contenido de email', () => {
  assert.ok(renderAsunto('confirmacion', BASE).includes('Duplex Center'))
  assert.equal(renderAsunto('estancia', BASE), '')
  assert.equal(renderAsunto('post_salida', BASE), '')
})
