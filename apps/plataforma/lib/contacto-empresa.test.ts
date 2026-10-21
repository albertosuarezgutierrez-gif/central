import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoContactoEmpresa } from './contacto-empresa.ts'
import type { RelacionCartera } from './relaciones-asegura.ts'

function rel(o: Partial<RelacionCartera> & { relacionadoId: string; tipo: string }): RelacionCartera {
  return {
    idIda: 'f' + o.relacionadoId, idVuelta: null, autorizaVer: false, puedeVer: false, observaciones: null,
    nombre: 'Persona ' + o.relacionadoId, tipoCliente: 'x', tipoOtorgante: 'juridica', tipoPersona: 'fisica',
    correo: 'con_email', polizasVivas: 0, autorizacion: null, autorizacionInversa: null, ...o,
  } as RelacionCartera
}
const EMP = { id: 'E', tipoPersona: 'juridica' as const, correo: 'sin_email' as const }

test('empresa con correo: sin aviso', () => {
  assert.deepEqual(avisoContactoEmpresa({ ...EMP, correo: 'con_email' }, []), { aviso: false })
})
test('sin correo + Dueño con correo: elegible, sin aviso', () => {
  assert.deepEqual(avisoContactoEmpresa(EMP, [rel({ relacionadoId: 'P', tipo: 'Dueño' })]), { aviso: false })
})
test('sin correo + Administración con correo: sin aviso', () => {
  assert.deepEqual(avisoContactoEmpresa(EMP, [rel({ relacionadoId: 'P', tipo: 'Administración' })]), { aviso: false })
})
test('sin correo + Accionista con correo sin permiso: aviso con botón', () => {
  const r = avisoContactoEmpresa(EMP, [rel({ relacionadoId: 'P', tipo: 'Accionista' })])
  assert.equal(r.aviso, true)
  if (r.aviso) assert.deepEqual(r.autorizables.map((a) => a.relacionadoId), ['P'])
})
test('Accionista con permiso (autorizaVer) y correo: elegible, sin aviso', () => {
  assert.deepEqual(avisoContactoEmpresa(EMP, [rel({ relacionadoId: 'P', tipo: 'Accionista', autorizaVer: true })]), { aviso: false })
})
test('Dueño sin correo + nadie más: aviso sin botón', () => {
  const r = avisoContactoEmpresa(EMP, [rel({ relacionadoId: 'P', tipo: 'Dueño', correo: 'sin_email' }), rel({ relacionadoId: 'Q', tipo: 'Accionista', correo: 'sin_email' })])
  assert.deepEqual(r, { aviso: true, autorizables: [], pendientes: [] })
})
test('sin relaciones: aviso sin botón', () => {
  assert.deepEqual(avisoContactoEmpresa(EMP, []), { aviso: true, autorizables: [], pendientes: [] })
})
test('autorización anotada y pendiente: aviso, sin botón, se dice', () => {
  const r = avisoContactoEmpresa(EMP, [rel({ relacionadoId: 'P', tipo: 'Accionista', autorizacion: { estado: 'pendiente', alcances: ['ver_economico'], tituloRepresentacion: null, caducaEn: null, origen: 'corredor' } })])
  assert.equal(r.aviso && r.autorizables.length, 0)
  assert.equal(r.aviso && r.pendientes.length, 1)
})
test('persona física o tipo desconocido: nunca', () => {
  assert.deepEqual(avisoContactoEmpresa({ ...EMP, tipoPersona: 'fisica' }, []), { aviso: false })
  assert.deepEqual(avisoContactoEmpresa({ ...EMP, tipoPersona: null }, []), { aviso: false })
})
test('correo de la ficha ilegible o relaciones sin leer: no se afirma', () => {
  assert.deepEqual(avisoContactoEmpresa({ ...EMP, correo: 'no_se_sabe' }, []), { aviso: false })
  assert.deepEqual(avisoContactoEmpresa(EMP, null), { aviso: false })
})
test('relación Sin vínculo: no se ofrece', () => {
  const r = avisoContactoEmpresa(EMP, [rel({ relacionadoId: 'P', tipo: 'Sin vínculo' })])
  assert.equal(r.aviso && r.autorizables.length, 0)
})
