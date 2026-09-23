import test from 'node:test'
import assert from 'node:assert/strict'
import { libroVcard, nombreVisible, vcardContacto } from './vcard.ts'

const base = { clienteId: 'c1', nombre: 'Ana', apellidos: 'Pérez, López', telefono: '600 11 22 33', email: null, grupo: 'cliente' as const }

test('el nombre que se ve dice si es cliente o lead', () => {
  assert.equal(nombreVisible(base), 'Ana Pérez, López · AS Cliente')
  assert.equal(nombreVisible({ nombre: null, apellidos: ' ', grupo: 'lead' }), '(sin nombre) · AS Lead')
})

test('tarjeta vCard 3.0: escapa comas y deja el teléfono marcable', () => {
  const v = vcardContacto(base, { urlFicha: 'https://x/correduria/cliente/c1', fecha: '23/09/2026' })!
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/)
  assert.match(v, /FN:Ana Pérez\\, López · AS Cliente/)
  assert.match(v, /TEL;TYPE=CELL:600112233/)
  assert.match(v, /NOTE:Cliente de Grupo ASegura \(lista del 23\/09\/2026\)\. Ficha: https:\/\/x\/correduria\/cliente\/c1/)
})

test('🪤 no lleva DNI, dirección ni pólizas: solo lo que hace falta para reconocerle', () => {
  const v = vcardContacto({ ...base, email: 'ana@x.es' }, { urlFicha: null, fecha: '23/09/2026' })!
  for (const campo of ['ADR', 'BDAY', 'X-DNI', 'NIF']) assert.ok(!v.includes(`${campo}:`) && !v.includes(`${campo};`), campo)
})

test('sin teléfono ni correo no hay tarjeta; si sale dos veces gana CLIENTE', () => {
  assert.equal(vcardContacto({ ...base, telefono: null }, { urlFicha: null, fecha: 'x' }), null)
  const r = libroVcard(
    [{ ...base, grupo: 'lead' }, base, { ...base, clienteId: 'c2', telefono: null }],
    { urlFicha: () => null, fecha: 'x' },
  )
  assert.equal(r.incluidos, 1)
  assert.equal(r.sinCanal, 1)
  assert.match(r.vcf, /AS Cliente/)
  assert.doesNotMatch(r.vcf, /AS Lead/)
})
