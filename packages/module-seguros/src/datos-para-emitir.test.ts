import { test } from 'node:test'
import assert from 'node:assert/strict'

import { datosDelTomador, huecosParaEmitirDesdeFicha, type FichaParaEmitir } from './datos-para-emitir.ts'

const L = (valor: string | null) => ({ valor, legible: true })
const completa: FichaParaEmitir = {
  tipoPersona: 'fisica',
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
  assert.equal(f.dni.valor, '12345678Z')
  assert.equal(f.fechaNacimiento.legible, false)
  assert.deepEqual(f.email, L('ana@correo.es'), 'lo que ya tiene la ficha manda')
})

test('🪤 una empresa no debe fecha de nacimiento para siempre, y su CIF no se pide como «tu DNI»', () => {
  const r = huecosParaEmitirDesdeFicha({ ...completa, tipoPersona: 'juridica', dni: L(null), fechaNacimiento: L(null) })
  assert.equal(r.datos.some((d) => d.campo === 'fechaNacimiento'), false)
  assert.equal(de(r, 'dni').etiqueta, 'CIF')
  assert.equal(r.faltanCliente, 0)
})

test('🪤 dos NIF distintos en sus pólizas no se funden: no se rellena ninguno', () => {
  const f = datosDelTomador({ ...completa, dni: L(null) },
    [{ nif: '12345678Z', fechaNacimiento: null, email: null, iban: null }, { nif: '87654321X', fechaNacimiento: null, email: null, iban: null }])
  assert.deepEqual(f.dni, L(null))
  const g = datosDelTomador({ ...completa, dni: L(null) },
    [{ nif: '12345678Z', fechaNacimiento: null, email: null, iban: null }, { nif: '12345678 z', fechaNacimiento: null, email: null, iban: null }])
  assert.equal(g.dni.valor, '12345678Z')
})

test('🪤 la cuenta que sale de una póliza cuenta como dato pero NO se enseña; un CP de 4 cifras no vale', () => {
  const f = datosDelTomador({ ...completa, iban: L(null) }, [{ nif: null, fechaNacimiento: null, email: null, iban: 'ES9121000418450200051332' }])
  const r = huecosParaEmitirDesdeFicha(f)
  assert.equal(de(r, 'iban').estado, 'ok')
  assert.equal(de(r, 'iban').muestra, null)
  assert.equal(de(huecosParaEmitirDesdeFicha({ ...completa, codigoPostal: '4100' }), 'direccion').estado, 'falta')
})
