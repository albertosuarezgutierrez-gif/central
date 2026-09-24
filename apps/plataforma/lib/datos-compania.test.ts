import test from 'node:test'
import assert from 'node:assert/strict'
import { claveTelefono, datosDeLaCompania } from './datos-compania.ts'
import { leerNotas } from './ficha-asegura.ts'

const FICHA = 'f1'
const contacto = (tipo: 'telefono' | 'email', valor: string | null, ilegible = false) =>
  ({ id: `${tipo}-${valor}`, tipo, valor, ilegible, etiqueta: null, principal: false, creado: '2026-01-01' })
const inter = (o: Record<string, unknown>) => ({
  id: 'i1', polizaId: 'p1', rol: 'conductor', nombre: 'X', nombreIlegible: false,
  telefono: null, email: null, telefonoIlegible: false, emailIlegible: false,
  fichaId: FICHA, personaClave: null, esTomador: false, origen: 'cima', ...o,
}) as never

test('sin una de las dos listas no se compara nada (no se afirma que coincidan)', () => {
  assert.equal(datosDeLaCompania(FICHA, null, { telefonos: [], emails: [] }).estado, 'sin_comprobar')
  assert.equal(datosDeLaCompania(FICHA, [], null).estado, 'sin_comprobar')
})

test('el mismo teléfono con o sin +34 no es «otro dato»', () => {
  assert.equal(claveTelefono('+34 600 11 22 33'), claveTelefono('600112233'))
  const r = datosDeLaCompania(FICHA, [inter({ telefono: '0034600112233' })], { telefonos: [contacto('telefono', '600 112 233')], emails: [] })
  assert.ok(r.estado === 'ok')
  assert.equal(r.nuevos.length, 0)
})

test('lo que trae la compañía y no tenemos se ofrece; lo de otra persona o lo manual, no', () => {
  const r = datosDeLaCompania(FICHA, [
    inter({ telefono: '611000000', email: 'Otro@Mail.com' }),
    inter({ telefono: '622000000', fichaId: 'otra-persona' }),
    inter({ telefono: '633000000', origen: 'manual' }),
  ], { telefonos: [contacto('telefono', '600112233')], emails: [contacto('email', 'otro@mail.com')] })
  assert.ok(r.estado === 'ok')
  assert.deepEqual(r.nuevos.map(n => n.valor), ['611000000'])
})

test('con contactos cifrados la comparación se declara incompleta', () => {
  const r = datosDeLaCompania(FICHA, [inter({ telefono: '611000000' })], { telefonos: [contacto('telefono', null, true)], emails: [] })
  assert.ok(r.estado === 'ok')
  assert.equal(r.incompleta, true)
})

test('notas: sin forma de lista es «no se pudo leer», no «sin notas»', () => {
  assert.equal(leerNotas(undefined), null)
  assert.equal(leerNotas({ lista: 'x' }), null)
  const n = leerNotas({ lista: [{ id: 'a', texto: 'llamar', fecha: '2026-09-24T10:00:00Z' }, { id: 'b' }], antigua: '  ' })
  assert.ok(n)
  assert.equal(n.lista.length, 1)
  assert.equal(n.antigua, null)
})
