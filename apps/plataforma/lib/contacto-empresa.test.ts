import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { destinatariosPresupuesto } from '@central/module-seguros'
import { avisoContactoEmpresa, tipoPersonaDeColumna } from './contacto-empresa.ts'
import { leerRelacion, type RelacionCartera } from './relaciones-asegura.ts'

function rel(o: Partial<RelacionCartera> & { relacionadoId: string; tipo: string }): RelacionCartera {
  return {
    idIda: 'f' + o.relacionadoId, idVuelta: null, autorizaVer: false, puedeVer: false, observaciones: null,
    nombre: 'Persona ' + o.relacionadoId, tipoCliente: 'x', tipoOtorgante: 'juridica', tipoPersona: 'fisica',
    correo: 'con_email', polizasVivas: 0, autorizacion: null, autorizacionInversa: null,
    tiposIda: [o.tipo], tiposVuelta: [], ...o,
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

// ─── Mismo criterio que asegura (21/10/2026) ────────────────────────────────

test('🪤 tomador con tipo_persona NULL + Dueño con correo: ni aviso de «elegible» ni envío', () => {
  const tipo = tipoPersonaDeColumna(null)
  assert.equal(tipo, null)
  // La ficha: sin aviso (no es empresa explícita).
  assert.deepEqual(avisoContactoEmpresa({ ...EMP, tipoPersona: tipo }, [rel({ relacionadoId: 'P', tipo: 'Dueño' })]), { aviso: false })
  // El envío (la MISMA regla que aplica asegura): el Dueño no es elegible porque el tomador no consta como empresa.
  const d = destinatariosPresupuesto(
    { clienteId: 'E', tipoPersona: tipo, correo: 'sin_email' },
    [{ id: 'r', clienteAId: 'E', clienteBId: 'P', tipo: 'Dueño', puedeVerPolizas: false, observaciones: null }],
    [{ clienteId: 'P', nombre: 'P', tipoPersona: 'fisica', correo: 'con_email' }],
  )
  assert.equal(d.estado, 'nadie')
  assert.equal(d.estado === 'nadie' && d.noElegibles[0]?.motivo, 'tomador_no_es_empresa')
})

test('🪤 «empresa» sale de la COLUMNA tipo_persona, no del DNI ni del segmento', () => {
  assert.equal(tipoPersonaDeColumna('juridica'), 'juridica')
  assert.equal(tipoPersonaDeColumna('fisica'), 'fisica')
  assert.equal(tipoPersonaDeColumna('JURIDICA'), null)
  assert.equal(tipoPersonaDeColumna(undefined), null)
  const page = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/page.tsx', import.meta.url), 'utf8')
  const llamada = page.slice(page.indexOf('const avisoEmpresa = avisoContactoEmpresa('), page.indexOf('ficha.relaciones,', page.indexOf('const avisoEmpresa = avisoContactoEmpresa(')))
  assert.match(llamada, /tipoPersona: tipoPersonaDeColumna\(ficha\.identidad\?\.tipoPersona\)/)
  assert.doesNotMatch(llamada, /personaDeFicha/)
})

test('🪤 sentido: un «Dueño» al revés (la empresa como B) de OTRA empresa no habilita; de una persona, sí', () => {
  const alReves = (tipoPersona: 'fisica' | 'juridica') => rel({ relacionadoId: 'P', tipo: 'Empresa', tiposIda: [], tiposVuelta: ['Dueño'], tipoPersona })
  assert.equal(avisoContactoEmpresa(EMP, [alReves('juridica')]).aviso, true) // no elegible: la ficha avisa
  assert.deepEqual(avisoContactoEmpresa(EMP, [alReves('fisica')]), { aviso: false })
})

test('🪤 sentido: la autorización del CONTACTO hacia la empresa (vuelta) no habilita', () => {
  const r = rel({ relacionadoId: 'P', tipo: 'Accionista', tiposIda: [], tiposVuelta: ['Accionista'], puedeVer: true, autorizaVer: false })
  assert.equal(avisoContactoEmpresa(EMP, [r]).aviso, true)
})

test('🪤 puerto viejo sin los sentidos crudos: no se afirma nada', () => {
  const viejo = leerRelacion({ relacionadoId: 'P', tipo: 'Accionista', autorizaVer: false, puedeVer: false, nombre: 'P', correo: 'con_email' })
  assert.ok(viejo)
  assert.equal(viejo!.tiposIda, undefined)
  assert.deepEqual(avisoContactoEmpresa(EMP, [viejo!]), { aviso: false })
  const nuevo = leerRelacion({ relacionadoId: 'P', tipo: 'Accionista', autorizaVer: false, puedeVer: false, nombre: 'P', correo: 'con_email', tiposIda: ['Accionista'], tiposVuelta: [] })
  assert.deepEqual([nuevo!.tiposIda, nuevo!.tiposVuelta], [['Accionista'], []])
})
