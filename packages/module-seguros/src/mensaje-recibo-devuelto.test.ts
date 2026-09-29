import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeReciboDevueltoWhatsapp, resumenRiesgo, saludoSegunHora, type EntradaWhatsappDevuelto } from './mensaje-recibo-devuelto.ts'
import { revisarCopy, explicarInfracciones } from './copy-regulado.ts'

// 29/09/2026 10:00 en Madrid (UTC+2).
const MANANA = new Date('2026-09-29T08:00:00Z')
const base: EntradaWhatsappDevuelto = {
  nombre: 'María Prueba Ejemplo', aseguradora: 'REALE SEGUROS', tipo: 'auto',
  riesgo: { titulo: 'FORD FOCUS', detalle: '1234 BCD, 1.5 TDCI, 2019' },
  importe: 184.58, fechaEfecto: '2026-09-19', tipoMotivo: 'cuenta', paraTercero: false, ahora: MANANA,
}
const M = (o: Partial<EntradaWhatsappDevuelto> = {}) => mensajeReciboDevueltoWhatsapp({ ...base, ...o })

test('saluda según la hora de Madrid', () => {
  assert.equal(saludoSegunHora(new Date('2026-09-29T08:00:00Z')), 'Buenos días')
  assert.equal(saludoSegunHora(new Date('2026-09-29T13:30:00Z')), 'Buenas tardes') // 15:30 en Madrid
  assert.equal(saludoSegunHora(new Date('2026-09-29T20:00:00Z')), 'Buenas noches') // 22:00
  assert.equal(saludoSegunHora(new Date('2026-12-15T12:30:00Z')), 'Buenos días') // invierno UTC+1: 13:30
})

test('lleva importe en formato español, compañía y el riesgo con su matrícula', () => {
  const m = M()
  assert.match(m, /^Buenos días María, soy Alberto, de Grupo ASegura\./)
  assert.match(m, /recibo de 184,58€ de tu seguro de coche con Reale Seguros \(FORD FOCUS \(1234 BCD\)\)/)
})

test('el texto cambia con el motivo del banco', () => {
  assert.match(M({ tipoMotivo: 'cuenta' }), /IBAN correcto/)
  assert.match(M({ tipoMotivo: 'cliente_rechaza' }), /Si es por el precio/)
  assert.match(M({ tipoMotivo: 'cliente_rechaza' }), /vendido/)
  assert.match(M({ tipoMotivo: 'fondos' }), /volvemos a pasar/)
  assert.match(M({ tipoMotivo: null }), /Cómo prefieres/)
})

test('plazo: antes de la suspensión dice hasta cuándo; después, que está en suspenso', () => {
  assert.match(M(), /antes del 19\/10\/2026/)
  assert.match(M({ fechaEfecto: '2026-08-01' }), /en suspenso desde el 31\/08\/2026/)
  assert.match(M({ fechaEfecto: null }), /cuanto antes/)
})

test('🪤 no lleva nº de póliza, IBAN ni DNI', () => {
  const m = M()
  assert.doesNotMatch(m, /ES\d{2}\s?\d{4}/)
  assert.doesNotMatch(m, /\b\d{8}[A-Z]\b/)
  assert.doesNotMatch(m, /p[óo]liza n/i)
})

test('🪤 no promete precio ni ahorro (copy regulado)', () => {
  for (const tipoMotivo of ['cuenta', 'cliente_rechaza', 'fondos', null] as const) {
    const inf = revisarCopy(M({ tipoMotivo }))
    assert.equal(inf.length, 0, explicarInfracciones(inf))
  }
})

test('a un tercero no le saluda con el nombre del tomador y le dice de quién es el seguro', () => {
  const m = M({ paraTercero: true })
  assert.match(m, /^Buenos días, soy Alberto/)
  assert.match(m, /del seguro de coche de María Prueba Ejemplo|seguro de coche de María Prueba Ejemplo/)
  assert.doesNotMatch(m, /tu seguro/)
})

test('sin importe ni riesgo, no inventa nada', () => {
  const m = M({ importe: null, riesgo: null, aseguradora: null })
  assert.match(m, /devuelto el recibo de tu seguro de coche\./)
  assert.doesNotMatch(m, /0,00€/)
})

test('resumenRiesgo: la matrícula solo en motor; el hogar, su dirección', () => {
  assert.equal(resumenRiesgo('hogar', { titulo: 'Calle Falsa 1', detalle: '90 m²' }), 'Calle Falsa 1')
  assert.equal(resumenRiesgo('auto', { titulo: 'SEAT IBIZA', detalle: '1.0 TSI' }), 'SEAT IBIZA')
  assert.equal(resumenRiesgo('auto', null), null)
})
