import test from 'node:test'
import assert from 'node:assert/strict'
import { enmascararTelefono, informeSimulacion } from './google-contactos-simulacion.ts'
import type { PersonaGoogle } from './google-contactos.ts'
import type { ContactoMovil } from './vcard.ts'

const GRUPO = 'contactGroups/abc'
const enGrupo = [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }]
const ficha = (id: string, nombre: string, apellidos: string, telefono: string | null, grupo: 'cliente' | 'lead' = 'cliente'): ContactoMovil =>
  ({ clienteId: id, nombre, apellidos, telefono, email: null, grupo })
/** Un contacto como lo dejó el .vcf antiguo: sin externalId, sin etiqueta (salvo `etiqueta`). */
const agenda = (rn: string, given: string, family: string, tel: string, etiqueta = false, canonical?: string): PersonaGoogle => ({
  resourceName: rn, etag: `e-${rn}`, names: [{ givenName: given, familyName: family }],
  phoneNumbers: [{ value: tel, ...(canonical ? { canonicalForm: canonical } : {}) }],
  ...(etiqueta ? { memberships: enGrupo } : {}),
})
type Entrada = Parameters<typeof informeSimulacion>[0]
const entrada = (e: Partial<Entrada>): Entrada =>
  ({ crm: [], seleccionCompleta: true, vinculos: [], fusiones: new Map(), google: [], grupoResourceName: GRUPO, ...e })

const nueva = ficha('n1', 'Nadia', 'Nueva', '600000001')
const vinc = ficha('v1', 'Vicente', 'Vínculo', '600000002')
const fuera = ficha('f1', 'Fernando', 'Fuera', '600000003', 'lead')
const conflicto = ficha('k1', 'Carmen', 'Conflicto', '600000004')
const ambiguo = ficha('a1', 'Antonio', 'Ambiguo', '600000005')

test('máscara: solo los 3 últimos dígitos; sin teléfono, null', () => {
  assert.equal(enmascararTelefono('+34 600 112 233'), '••••••••233')
  assert.equal(enmascararTelefono('12'), '••')
  assert.equal(enmascararTelefono(null), null)
})

test('los tipos: crear, vincular (en la etiqueta), ADOPTAR (fuera), conflicto de nombre, ambiguo y no normalizable', () => {
  const google = [
    agenda('people/v', 'vicente', 'vinculo', '600 000 002', true), // en la etiqueta, mismo nombre (sin tildes)
    agenda('people/f', 'Fernando', 'Fuera', '+34600000003'), // agenda antigua (.vcf), fuera de la etiqueta
    agenda('people/k', 'Fontanero', 'Juan', '600000004', true), // mismo teléfono, otro nombre
    agenda('people/a1', 'Antonio', 'Ambiguo', '600000005'), // dos contactos con el mismo número
    agenda('people/a2', 'Toni', '', '600000005'),
    agenda('people/x', 'Raro', '', '12345'), // no es un teléfono E.164
  ]
  const inf = informeSimulacion(entrada({ crm: [nueva, vinc, fuera, conflicto, ambiguo], google }), { totalCuenta: 6 })

  assert.deepEqual(inf.crear.ejemplos.map((x) => x.clienteId), ['n1'])
  assert.equal(inf.crear.ejemplos[0].nombre, '🟢 Nadia Nueva', 'el informe refleja el nombre con prefijo')
  assert.equal(inf.crear.ejemplos[0].telefono, '••••••••001')

  assert.deepEqual(inf.vincular.ejemplos.map((x) => [x.clienteId, x.fueraDeEtiqueta]), [['v1', false]])
  assert.deepEqual(inf.adoptar.ejemplos.map((x) => [x.clienteId, x.nombre, x.fueraDeEtiqueta]), [['f1', '🟡 Fernando Fuera', true]])

  assert.deepEqual(inf.conflictosNombre.ejemplos.map((x) => [x.clienteId, x.nombreEnAgenda]), [['k1', 'Fontanero Juan']])

  assert.deepEqual(inf.ambiguos.ejemplos.map((x) => [x.clienteId, x.contactosConEseTelefono, x.fueraDeEtiqueta]), [['a1', 2, true]])
  assert.equal(inf.telefonosRepetidosEnAgenda, 1)

  assert.deepEqual(inf.telefonosNoNormalizables.ejemplos, [{ nombre: 'Raro', telefono: '••345' }])
  assert.equal(inf.telefonosNoNormalizables.total, 1)

  // La primera pasada REAL solo crea la nueva: el de fuera se ADOPTA y el ambiguo va a la cola.
  assert.equal(inf.real.crear, 1)
  assert.equal(inf.real.adoptar, 1)
  assert.equal(inf.real.vincular, 1)
  assert.equal(inf.contactosLeidos, 6)
  assert.equal(inf.contactosEnEtiqueta, 2)
  assert.equal(inf.superaTope, false)
  assert.ok(inf.avisos.some((a) => /Se adoptarán 1/.test(a)))
  assert.ok(!inf.avisos.some((a) => /DUPLICAR/.test(a)), 'lo adoptable ya no se anuncia como duplicado')
})

test('un contacto personal (otro nombre) fuera de la etiqueta con el mismo teléfono: conflicto, ni se adopta ni se crea', () => {
  const inf = informeSimulacion(entrada({ crm: [conflicto], google: [agenda('people/p', 'Fontanero', 'Juan', '600000004')] }), { totalCuenta: 1 })
  assert.deepEqual(inf.conflictosNombre.ejemplos.map((x) => [x.clienteId, x.fueraDeEtiqueta]), [['k1', true]])
  assert.equal(inf.real.crear + inf.real.adoptar, 0)
})

test('etiqueta aún inexistente: lo de la agenda se ADOPTA (fuera de la etiqueta), sin crearla', () => {
  const inf = informeSimulacion(entrada({ crm: [vinc], google: [agenda('people/v', 'Vicente', 'Vínculo', '600000002')], grupoResourceName: null }), { totalCuenta: 1 })
  assert.equal(inf.grupoExiste, false)
  assert.deepEqual(inf.adoptar.ejemplos.map((x) => x.fueraDeEtiqueta), [true])
  assert.equal(inf.real.crear, 0)
  assert.equal(inf.real.adoptar, 1)
})

test('tope de 25.000: con la agenda casi llena, se avisa (sin lanzar)', () => {
  const inf = informeSimulacion(entrada({ crm: [nueva, vinc] }), { totalCuenta: 24_999 })
  assert.equal(inf.superaTope, true)
  assert.equal(inf.contactosTras, 25_001)
})

test('listas acotadas: el total cuenta todo, los ejemplos no pasan del máximo', () => {
  const crm = Array.from({ length: 7 }, (_, i) => ficha(`c${i}`, 'X', `Y${i}`, `61000000${i}`))
  const inf = informeSimulacion(entrada({ crm }), { totalCuenta: 0, maxEjemplos: 3 })
  assert.equal(inf.crear.total, 7)
  assert.equal(inf.crear.ejemplos.length, 3)
})

test('el informe no escribe: la entrada sale intacta', () => {
  const google = [agenda('people/f', 'Fernando', 'Fuera', '+34600000003')]
  const copia = structuredClone(google)
  informeSimulacion(entrada({ crm: [fuera], google }), { totalCuenta: 1 })
  assert.deepEqual(google, copia)
})

