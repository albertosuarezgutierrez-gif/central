import { test } from 'node:test'
import assert from 'node:assert/strict'

import { datosDelTomador, huecosParaEmitirDesdeFicha, type FichaParaEmitir } from './datos-para-emitir.ts'

const L = (valor: string | null) => ({ valor, legible: true })
const completa: FichaParaEmitir = {
  email: L('ana@correo.es'), dni: L('12345678Z'), fechaNacimiento: L('1980-02-03'),
  direccion: L('CL SOCORRO 24'), codigoPostal: '41003', direccionCompleta: true, iban: L('ES9121000418450200051332'),
  dniPendienteDeRevisar: false,
}
const de = (r: ReturnType<typeof huecosParaEmitirDesdeFicha>, campo: string) => r.datos.find((d) => d.campo === campo)!

test('ficha completa: nada falta, y lo que se enseña va enmascarado', () => {
  const r = huecosParaEmitirDesdeFicha(completa)
  assert.equal(r.faltanCliente + r.faltanCorredor + r.enRevision + r.noLegibles, 0)
  assert.equal(de(r, 'dni').muestra, '***78Z')
  assert.equal(de(r, 'iban').muestra, '**** 1332')
  assert.equal(de(r, 'email').muestra, 'a***@correo.es')
  assert.equal(de(r, 'fechaNacimiento').muestra, null)
})

test('🪤 un cifrado que no abre NO es «falta»: no se le pide al cliente ni cuenta en «te faltan N»', () => {
  const r = huecosParaEmitirDesdeFicha({ ...completa, iban: { valor: null, legible: false }, dni: { valor: null, legible: false } })
  assert.equal(de(r, 'dni').estado, 'no_legible')
  assert.equal(r.faltanCliente, 0)
  assert.equal(r.faltanCorredor, 0)
  assert.equal(r.noLegibles, 2)
})

test('🪤 dirección sin número o sin CP, o sin poder trocearla, es «falta» (lo conservador)', () => {
  assert.equal(de(huecosParaEmitirDesdeFicha({ ...completa, direccionCompleta: false }), 'direccion').estado, 'falta')
  assert.equal(de(huecosParaEmitirDesdeFicha({ ...completa, direccionCompleta: null }), 'direccion').estado, 'falta')
  assert.equal(de(huecosParaEmitirDesdeFicha({ ...completa, codigoPostal: ' ' }), 'direccion').estado, 'falta')
})

test('🪤 un valor de cajón no es un dato', () => {
  const r = huecosParaEmitirDesdeFicha({ ...completa, dni: L('N/A'), email: L('  ') })
  assert.equal(de(r, 'dni').estado, 'falta')
  assert.equal(de(r, 'email').estado, 'falta')
})

test('el DNI subido y sin revisar pone DNI y fecha «en revisión», no «falta»; la cuenta la pone el corredor', () => {
  const r = huecosParaEmitirDesdeFicha({ ...completa, dni: L(null), fechaNacimiento: L(null), iban: L(null), dniPendienteDeRevisar: true })
  assert.equal(de(r, 'dni').estado, 'en_revision')
  assert.equal(de(r, 'fechaNacimiento').estado, 'en_revision')
  assert.equal(r.faltanCliente, 0)
  assert.equal(r.faltanCorredor, 1)
})

test('🪤 datosDelTomador rellena huecos con lo PROPIO de sus pólizas, pero no tapa un cifrado roto', () => {
  const f = datosDelTomador({ ...completa, dni: L(null), fechaNacimiento: { valor: null, legible: false } },
    [{ nif: null, fechaNacimiento: '1980-02-03', email: null, iban: null }, { nif: '12345678Z', fechaNacimiento: null, email: 'x@y.es', iban: null }])
  assert.deepEqual(f.dni, L('12345678Z'))
  assert.equal(f.fechaNacimiento.legible, false)
  assert.deepEqual(f.email, L('ana@correo.es'), 'lo que ya tiene la ficha manda')
})
