import test from 'node:test'
import assert from 'node:assert/strict'
import { telefonoContacto } from './compania-contacto-telefono.ts'

test('un móvil o un fijo español se guardan en E.164', () => {
  assert.deepEqual(telefonoContacto('600 11 22 33'), { ok: true, telefono: '+34600112233' })
  assert.deepEqual(telefonoContacto('0034 954 22 33 44'), { ok: true, telefono: '+34954223344' })
  assert.deepEqual(telefonoContacto('+351 912 345 678'), { ok: true, telefono: '+351912345678' })
})

test('vacío o null → se borra el teléfono (decisión explícita, no «no se sabe»)', () => {
  assert.deepEqual(telefonoContacto(''), { ok: true, telefono: null })
  assert.deepEqual(telefonoContacto('   '), { ok: true, telefono: null })
  assert.deepEqual(telefonoContacto(null), { ok: true, telefono: null })
})

test('🪤 lo que no es un teléfono válido se RECHAZA, no se guarda «arreglado»', () => {
  assert.deepEqual(telefonoContacto('12345'), { ok: false, motivo: 'no_valido' })
  assert.deepEqual(telefonoContacto('llamar a Juan'), { ok: false, motivo: 'no_valido' })
  assert.deepEqual(telefonoContacto(600112233), { ok: false, motivo: 'tipo' })
  assert.deepEqual(telefonoContacto(undefined), { ok: false, motivo: 'tipo' })
  assert.deepEqual(telefonoContacto('6'.repeat(41)), { ok: false, motivo: 'tipo' })
})
