import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aBorrarAlDesconectar, camposDeCrm, camposDeGoogle, hashCampos, planificarSync,
  type EntradaPlan, type PersonaGoogle, type PersonaParaEscribir, type Vinculo,
} from './google-contactos.ts'
import type { ContactoMovil } from './vcard.ts'

// ADOPCIÓN (05/10/2026, decisión de Alberto): la agenda ya tiene los clientes volcados a mano con
// el .vcf (sin nuestro id, FUERA de la etiqueta). La primera sincronización NO debe duplicarlos:
// un contacto de fuera de la etiqueta con el MISMO teléfono (cualquiera de los suyos) y el mismo
// nombre —o con el sufijo «· AS …» del .vcf— se ADOPTA. Mismo teléfono y otro nombre = probable
// contacto personal de Alberto: ni se adopta ni se crea, va a la cola.

const GRUPO = 'contactGroups/abc'
const ana: ContactoMovil = { clienteId: 'c1', nombre: 'Ana', apellidos: 'Pérez Gil', telefono: '600 11 22 33', email: null, grupo: 'cliente' }
const entrada = (e: Partial<EntradaPlan>): EntradaPlan =>
  ({ crm: [], seleccionCompleta: true, vinculos: [], fusiones: new Map(), google: [], modo: 'completo', grupoResourceName: GRUPO, ...e })
/** Un contacto tal como lo dejó el .vcf: N = apellidos;nombre, FN con el sufijo, ORG sin cargo. */
const deVcf = (rn: string, given: string, family: string, tels: string[], extra: Partial<PersonaGoogle> = {}): PersonaGoogle => ({
  resourceName: rn, etag: `e-${rn}`,
  names: [{ givenName: given, familyName: family, displayName: `${given} ${family} · AS Cliente`, unstructuredName: `${given} ${family} · AS Cliente` }],
  phoneNumbers: tels.map((t) => ({ value: t })),
  organizations: [{ name: 'Grupo ASegura' }],
  biographies: [{ value: 'Cliente de Grupo ASegura (lista del 23/09/2026). Ficha: https://x/y', contentType: 'TEXT_PLAIN' }],
  ...extra,
})
const personal = (rn: string, given: string, family: string, tels: string[]): PersonaGoogle => ({
  resourceName: rn, etag: `e-${rn}`, names: [{ givenName: given, familyName: family, displayName: `${given} ${family}` }],
  phoneNumbers: tels.map((t) => ({ value: t })),
})

test('🪤 A: contacto del .vcf FUERA de la etiqueta → se ADOPTA (se vincula y entra en la etiqueta), NO se crea otro', () => {
  const plan = planificarSync(entrada({ crm: [ana], google: [deVcf('people/vcf', 'Ana', 'Pérez Gil', ['+34 600 11 22 33'])] }))
  assert.equal(plan.crear.length, 0, 'se crearía un duplicado')
  assert.equal(plan.actualizar.length, 1)
  const a = plan.actualizar[0]
  assert.equal(a.resourceName, 'people/vcf')
  assert.equal(a.origen, 'adoptado')
  assert.equal(a.anadirAlGrupo, true)
  assert.deepEqual(a.persona.names, [{ givenName: '🟢 Ana', familyName: 'Pérez Gil' }])
  assert.equal(plan.revisiones.length, 0)
})

test('🪤 A: contacto PERSONAL con el mismo teléfono y otro nombre → NO se adopta, NO se crea, va a la cola', () => {
  const plan = planificarSync(entrada({ crm: [ana], google: [personal('people/fontanero', 'Fontanero', 'Juan', ['600112233'])] }))
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.actualizar.length, 0, 'se pisaría un contacto personal')
  assert.equal(plan.revisiones.length, 1)
  assert.equal(plan.revisiones[0].tipo, 'duplicado_ambiguo')
  assert.equal(plan.revisiones[0].motivo, 'nombre_distinto')
  assert.equal(plan.revisiones[0].resourceName, 'people/fontanero')
})

test('A: el sufijo «· AS …» del .vcf basta aunque el nombre no coincida (se renombró en el CRM)', () => {
  const g = deVcf('people/vcf', 'Anita', 'P.', ['600112233'])
  const plan = planificarSync(entrada({ crm: [ana], google: [g] }))
  assert.equal(plan.actualizar[0]?.origen, 'adoptado')
})

test('A: el nombre se compara sin el sufijo del .vcf ni emojis, tildes o mayúsculas', () => {
  const g = personal('people/p', '😀 ANA', 'perez gil · AS Lead', ['600112233'])
  const plan = planificarSync(entrada({ crm: [ana], google: [g] }))
  assert.equal(plan.actualizar[0]?.origen, 'adoptado')
})

test('A: se empareja por CUALQUIER teléfono del contacto, no solo el primero; los demás se conservan', () => {
  const g = deVcf('people/vcf', 'Ana', 'Pérez Gil', ['954 00 00 00', '600112233'])
  const plan = planificarSync(entrada({ crm: [ana], google: [g] }))
  assert.equal(plan.actualizar[0]?.origen, 'adoptado')
  const tels = plan.actualizar[0].persona.phoneNumbers.map((t) => t.value)
  assert.equal(tels[0], '600112233', 'la entrada del CRM (la que ya estaba) va primera')
  assert.ok(tels.includes('954 00 00 00'), 'el fijo de Alberto se conserva')
})

test('A: varios contactos de la agenda con el mismo teléfono → ambiguo, a la cola, sin crear ni adoptar', () => {
  const plan = planificarSync(entrada({ crm: [ana], google: [deVcf('people/a', 'Ana', 'Pérez Gil', ['600112233']), deVcf('people/b', 'Ana', 'Pérez Gil', ['+34600112233'])] }))
  assert.equal(plan.crear.length + plan.actualizar.length, 0)
  assert.equal(plan.revisiones.length, 1)
  assert.equal(plan.revisiones[0].motivo, 'telefono_compartido')
})

test('A: un contacto cuyos teléfonos casan con DOS fichas distintas no se adopta para ninguna', () => {
  const pepe: ContactoMovil = { clienteId: 'c2', nombre: 'Pepe', apellidos: 'Ruiz', telefono: '611 00 00 01', email: null, grupo: 'cliente' }
  const plan = planificarSync(entrada({ crm: [ana, pepe], google: [deVcf('people/casa', 'Ana', 'Pérez Gil', ['600112233', '611000001'])] }))
  assert.equal(plan.actualizar.length, 0)
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.revisiones.filter((r) => r.motivo === 'telefono_compartido').length, 2)
})

test('A: un contacto de fuera con el id de OTRA ficha no se adopta', () => {
  const g = deVcf('people/otro', 'Ana', 'Pérez Gil', ['600112233'], { externalIds: [{ type: 'asegura', value: 'c-otra' }] })
  const plan = planificarSync(entrada({ crm: [ana], google: [g] }))
  assert.equal(plan.actualizar.length, 0)
})

test('A: en la etiqueta sigue mandando la etiqueta (se vincula por teléfono, sin añadir al grupo)', () => {
  const g = { ...deVcf('people/g', 'Ana', 'Pérez Gil', ['600112233']), memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const plan = planificarSync(entrada({ crm: [ana], google: [g] }))
  assert.equal(plan.actualizar[0]?.origen, 'vinculado_telefono')
  assert.notEqual(plan.actualizar[0]?.anadirAlGrupo, true)
})

test('A: en modo delta no se adopta a ciegas: hace falta el listado completo', () => {
  const plan = planificarSync(entrada({ crm: [ana], modo: 'delta', google: [deVcf('people/vcf', 'Ana', 'Pérez Gil', ['600112233'])] }))
  assert.equal(plan.necesitaListadoCompleto, true)
  assert.equal(plan.actualizar.length + plan.crear.length, 0)
})

test('A: tras adoptar, la pasada siguiente no reescribe (hash estable)', () => {
  const plan = planificarSync(entrada({ crm: [ana], google: [deVcf('people/vcf', 'Ana', 'Pérez Gil', ['600112233'])] }))
  const p: PersonaParaEscribir = plan.actualizar[0].persona
  const escrito: PersonaGoogle = { resourceName: 'people/vcf', ...p, etag: 'e2', memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const v: Vinculo = { clienteId: 'c1', resourceName: 'people/vcf', etag: 'e2', hashEnviado: plan.actualizar[0].hash, origen: 'adoptado', estado: 'activo' }
  assert.equal(hashCampos(camposDeCrm(ana)!), v.hashEnviado)
  assert.equal(camposDeGoogle(escrito).nombre, 'Ana')
  const otra = planificarSync(entrada({ crm: [ana], vinculos: [v], google: [escrito] }))
  assert.equal(otra.actualizar.length + otra.revisiones.length, 0)
  assert.equal(otra.omitidos, 1)
})

test('A: un adoptado NUNCA se borra de Google (ni al desconectar ni al salir de la selección)', () => {
  assert.deepEqual(aBorrarAlDesconectar(['people/vcf'], [{ resourceName: 'people/vcf', origen: 'adoptado', estado: 'activo' }]), [])
  const v: Vinculo = { clienteId: 'c1', resourceName: 'people/vcf', etag: null, hashEnviado: 'x', origen: 'adoptado', estado: 'activo' }
  const plan = planificarSync(entrada({ crm: [], vinculos: [v] }))
  assert.equal(plan.retirar.length, 0)
  assert.deepEqual(plan.olvidar, ['c1'])
})
