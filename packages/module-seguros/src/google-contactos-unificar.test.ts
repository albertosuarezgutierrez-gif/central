import test from 'node:test'
import assert from 'node:assert/strict'
import { accionesPermitidas, efectoResolucion } from './google-contactos-revision.ts'
import {
  HASH_PENDIENTE_UNIFICAR, PREFIJO_FICHA, PREFIJO_NOMBRE_ANTERIOR, camposDeCrm, conNombreAnterior, hashCampos, limpiarMote, moteDesdeAgenda, planificarSync,
  type EntradaPlan, type PersonaGoogle, type Vinculo,
} from './google-contactos.ts'
import type { ContactoMovil } from './vcard.ts'
import type { ContactoGoogle } from './google-contactos.ts'

// UNIFICAR (05/10/2026, decisión de Alberto): muchos clientes ya están en su agenda guardados con SU
// nombre («Ana del gimnasio»). La cola los deja en `duplicado_ambiguo`; «Unificar» crea el vínculo
// PENDIENTE y la pasada siguiente lo ADOPTA (sin crear otro). Y antes de crear una ficha cuyo
// teléfono no casa, mismo correo / mismo nombre fuera de la etiqueta → cola, no duplicado.

const GRUPO = 'contactGroups/abc'
const ana: ContactoGoogle = { clienteId: 'c1', nombre: 'Ana', apellidos: 'Pérez Gil', telefono: '600 11 22 33', email: 'ana@x.es', grupo: 'cliente' }
const entrada = (e: Partial<EntradaPlan>): EntradaPlan =>
  ({ crm: [], seleccionCompleta: true, vinculos: [], fusiones: new Map(), google: [], modo: 'completo', grupoResourceName: GRUPO, ...e })
const suya = (rn: string, nombre: string, extra: Partial<PersonaGoogle> = {}): PersonaGoogle => ({
  resourceName: rn, etag: `e-${rn}`, names: [{ givenName: nombre, familyName: '', displayName: nombre }],
  phoneNumbers: [{ value: '+34600112233' }, { value: '+34955000000', type: 'work' }],
  emailAddresses: [{ value: 'ana.personal@y.es' }],
  biographies: [{ value: 'La conocí en el gimnasio', contentType: 'TEXT_PLAIN' }],
  ...extra,
})
const pendiente = (rn: string, clienteId = 'c1'): Vinculo =>
  ({ clienteId, resourceName: rn, etag: null, hashEnviado: HASH_PENDIENTE_UNIFICAR, origen: 'adoptado', estado: 'activo' })

test('🪤 nombre distinto → cola con «Unificar»; al unificar, la pasada siguiente lo ADOPTA y no crea nada', () => {
  const g = suya('people/gym', 'Ana Gimnasio')
  const p1 = planificarSync(entrada({ crm: [ana], google: [g] }))
  assert.equal(p1.crear.length, 0)
  const r = p1.revisiones[0]
  assert.equal(r.motivo, 'nombre_distinto')
  assert.ok(accionesPermitidas(r.tipo, r.motivo ?? null).includes('unificar'))
  const ef = efectoResolucion(r.tipo, 'unificar', r.motivo ?? null)
  assert.ok(ef.ok && ef.vinculo === 'unificar' && ef.estado === 'aceptada')

  // Lo que hace la BD al unificar: vínculo pendiente. El contacto sigue FUERA de la etiqueta.
  const p2 = planificarSync(entrada({ crm: [ana], google: [g], vinculos: [pendiente('people/gym')] }))
  assert.equal(p2.crear.length, 0, 'crearía un duplicado')
  assert.deepEqual(p2.apartar, [], 'lo leería como «sacado del grupo»')
  assert.equal(p2.revisiones.length, 0)
  assert.equal(p2.actualizar.length, 1)
  const a = p2.actualizar[0]
  assert.equal(a.resourceName, 'people/gym')
  assert.equal(a.origen, 'adoptado')
  assert.equal(a.anadirAlGrupo, true)
  assert.deepEqual(a.persona.names, [{ givenName: '🟢 Ana', familyName: 'Pérez Gil' }])
  // Lo de Alberto se conserva: su segundo teléfono, y su primer teléfono no se pisa.
  assert.deepEqual(a.persona.phoneNumbers.map((t) => t.value), ['+34600112233', '+34955000000'])
  // Su correo tampoco se pisa: el del CRM va delante y el suyo se queda.
  assert.deepEqual(a.persona.emailAddresses.map((m) => m.value), ['ana@x.es', 'ana.personal@y.es'])
  // Su nombre anterior queda en la nota, junto a lo que ya tenía.
  const nota = a.persona.biographies?.[0]?.value ?? ''
  assert.ok(nota.includes(`${PREFIJO_NOMBRE_ANTERIOR}Ana Gimnasio`), nota)
  assert.ok(nota.includes('La conocí en el gimnasio'))
})

test('unificado y ya escrito en Google (vínculo con hash real) → nada que hacer, sin reescritura', () => {
  const g = suya('people/gym', 'Ana Gimnasio')
  const p2 = planificarSync(entrada({ crm: [ana], google: [g], vinculos: [pendiente('people/gym')] }))
  const a = p2.actualizar[0]
  const escrito: PersonaGoogle = { resourceName: 'people/gym', etag: 'e2', ...a.persona, memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const v: Vinculo = { ...pendiente('people/gym'), etag: 'e2', hashEnviado: a.hash }
  const p3 = planificarSync(entrada({ crm: [ana], google: [escrito], vinculos: [v] }))
  assert.equal(p3.actualizar.length + p3.crear.length + p3.revisiones.length, 0)
  assert.equal(a.hash, hashCampos(camposDeCrm(ana)!))
})

test('unificar pendiente y el contacto ya no existe → se olvida el vínculo, no se crea en esta pasada', () => {
  const p = planificarSync(entrada({ crm: [ana], google: [], vinculos: [pendiente('people/gym')] }))
  assert.deepEqual(p.olvidar, ['c1'])
  assert.equal(p.crear.length, 0)
})

test('nombre anterior en la nota: idempotente', () => {
  const una = conNombreAnterior('texto', 'Ana Gimnasio')
  assert.equal(conNombreAnterior(una, 'Ana Gimnasio'), una)
})

test('🪤 teléfono compartido (varios contactos) → SIN «Unificar»', () => {
  const p = planificarSync(entrada({ crm: [ana], google: [suya('people/a', 'Ana A'), suya('people/b', 'Ana B')] }))
  const r = p.revisiones[0]
  assert.equal(r.motivo, 'telefono_compartido')
  assert.ok(!accionesPermitidas(r.tipo, r.motivo ?? null).includes('unificar'))
  assert.equal(efectoResolucion(r.tipo, 'unificar', r.motivo ?? null).ok, false)
  // Fila antigua sin motivo (`null` = no se sabe): tampoco.
  assert.equal(efectoResolucion('duplicado_ambiguo', 'unificar', null).ok, false)
  assert.equal(efectoResolucion('cambio_en_google', 'unificar', 'nombre_distinto').ok, false)
})

test('🪤 nunca dos fichas al mismo contacto: el resourceName con vínculo pendiente no es candidato de otra ficha', () => {
  const ana2: ContactoMovil = { ...ana, clienteId: 'c2', nombre: 'Ana', apellidos: 'Gimnasio', email: null }
  const g = suya('people/gym', 'Ana Gimnasio')
  // c2 PRIMERO: si el contacto pendiente de c1 fuera candidato, c2 lo adoptaría por teléfono y nombre.
  const p = planificarSync(entrada({ crm: [ana2, ana], google: [g], vinculos: [pendiente('people/gym')] }))
  const deGym = p.actualizar.filter((a) => a.resourceName === 'people/gym')
  assert.deepEqual(deGym.map((a) => a.clienteId), ['c1'])
  assert.ok(!p.revisiones.some((r) => r.resourceName === 'people/gym' && r.clienteId === 'c2'))
})

// ─── Prevenir duplicados al CREAR (mismo correo / mismo nombre) ───────────────

const sinTel = (rn: string, nombre: string, email: string | null): PersonaGoogle => ({
  resourceName: rn, etag: `e-${rn}`, names: [{ givenName: nombre, familyName: '', displayName: nombre }],
  phoneNumbers: [{ value: '+34911111111' }], ...(email ? { emailAddresses: [{ value: email }] } : {}),
})

test('🪤 teléfono no casa + UN contacto con el mismo correo fuera de la etiqueta → cola `mismo_email`, NO se crea', () => {
  const p = planificarSync(entrada({ crm: [ana], google: [sinTel('people/m', 'Anita', 'ANA@x.es')] }))
  assert.equal(p.crear.length, 0, 'crearía un duplicado')
  assert.equal(p.revisiones[0]?.motivo, 'mismo_email')
  assert.ok(accionesPermitidas('duplicado_ambiguo', 'mismo_email').includes('unificar'))
})

test('🪤 teléfono no casa + UN contacto con el mismo nombre (sin tildes ni «· AS») → `mismo_nombre`, NO se crea', () => {
  const p = planificarSync(entrada({ crm: [ana], google: [sinTel('people/n', 'ANA PEREZ GIL · AS Cliente', null)] }))
  assert.equal(p.crear.length, 0)
  assert.equal(p.revisiones[0]?.motivo, 'mismo_nombre')
})

test('sin teléfono en el CRM también: mismo nombre → cola', () => {
  const p = planificarSync(entrada({ crm: [{ ...ana, telefono: null }], google: [sinTel('people/n', 'Ana Pérez Gil', null)] }))
  assert.equal(p.crear.length, 0)
  assert.equal(p.revisiones[0]?.motivo, 'mismo_nombre')
})

test('🪤 varios candidatos (o dos fichas con el mismo nombre) → cola SIN «Unificar», sin crear', () => {
  const p = planificarSync(entrada({ crm: [ana], google: [sinTel('people/1', 'Ana Pérez Gil', null), sinTel('people/2', 'Ana Perez Gil', null)] }))
  assert.equal(p.crear.length, 0)
  assert.equal(p.revisiones[0]?.motivo, 'varios_candidatos')
  assert.ok(!accionesPermitidas('duplicado_ambiguo', 'varios_candidatos').includes('unificar'))
  const otra: ContactoMovil = { ...ana, clienteId: 'c2', telefono: '611 00 00 00', email: null }
  const p2 = planificarSync(entrada({ crm: [ana, otra], google: [sinTel('people/1', 'Ana Pérez Gil', null)] }))
  assert.equal(p2.crear.length, 0)
  assert.ok(p2.revisiones.every((r) => r.motivo === 'varios_candidatos'), JSON.stringify(p2.revisiones.map((r) => r.motivo)))
})

test('contacto con nuestro id, o dentro de la etiqueta, o en delta → no cuenta: se crea como siempre', () => {
  const conId = { ...sinTel('people/i', 'Ana Pérez Gil', null), externalIds: [{ type: 'asegura', value: 'otra' }] }
  assert.equal(planificarSync(entrada({ crm: [ana], google: [conId] })).crear.length, 1)
  const dentro = { ...sinTel('people/d', 'Ana Pérez Gil', null), memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  assert.equal(planificarSync(entrada({ crm: [ana], google: [dentro] })).crear.length, 1)
  const d = planificarSync(entrada({ crm: [{ ...ana, telefono: null }], google: [sinTel('people/n', 'Ana Pérez Gil', null)], modo: 'delta' }))
  assert.equal(d.revisiones.length, 0)
  assert.equal(d.necesitaListadoCompleto, true)
})

// ─── MOTE (05/10/2026): «Unificar» guarda como mote el nombre de su agenda ─────────

test('🪤 unificar rellena el mote LIMPIO; «con nombre del CRM», sin mote; renombrado en Google → «Usar como mote»', () => {
  assert.equal(limpiarMote('AA Mama'), 'Mama')
  assert.equal(limpiarMote('AAA  Pilar   Suegra'), 'Pilar Suegra')
  assert.equal(limpiarMote('Ana Pérez · AS Cliente'), 'Ana Pérez')
  assert.equal(limpiarMote('Benito Pintor · AS'), 'Benito Pintor')
  assert.equal(limpiarMote('🟢 Rorro'), 'Rorro')
  assert.equal(limpiarMote('Aaron'), 'Aaron', 'solo el prefijo «AA » separado')
  assert.equal(limpiarMote('   '), null)
  assert.equal([...(limpiarMote('x'.repeat(80)) ?? '')].length, 60)
  const u = efectoResolucion('duplicado_ambiguo', 'unificar', 'nombre_distinto')
  assert.ok(u.ok && u.vinculo === 'unificar' && u.mote === true)
  const c = efectoResolucion('duplicado_ambiguo', 'unificar_nombre_crm', 'nombre_distinto')
  assert.ok(c.ok && c.vinculo === 'unificar' && c.mote === false)
  assert.ok(accionesPermitidas('cambio_en_google', null, ['nombre']).includes('usar_como_mote'))
  assert.ok(!accionesPermitidas('cambio_en_google', null, ['telefono']).includes('usar_como_mote'))
  const m = efectoResolucion('cambio_en_google', 'usar_como_mote', null, ['apellidos'])
  assert.ok(m.ok && m.vinculo === 'ninguno' && m.mote === true)
})

test('🪤 con mote: el contacto se llama «emoji + mote», la ficha va a la nota y la 2.ª pasada no reescribe', () => {
  const conMote = { ...ana, mote: 'Mama' }
  // Unificado (vínculo pendiente) con el mote ya guardado: se escribe «🟢 Mama», sin línea de nombre anterior.
  const g = suya('people/gym', 'AA Mama')
  const p1 = planificarSync(entrada({ crm: [conMote], google: [g], vinculos: [pendiente('people/gym')] }))
  const a = p1.actualizar[0]
  assert.deepEqual(a.persona.names, [{ givenName: '🟢 Mama', familyName: '' }])
  const nota = a.persona.biographies?.[0]?.value ?? ''
  assert.ok(nota.includes(`${PREFIJO_FICHA}Ana Pérez Gil`), nota)
  assert.ok(!nota.includes(PREFIJO_NOMBRE_ANTERIOR), 'con mote no hace falta el nombre anterior')
  // Segunda pasada: Google ya está como se escribió → nada.
  const escrito: PersonaGoogle = { resourceName: 'people/gym', ...a.persona, etag: 'e2', memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const p2 = planificarSync(entrada({ crm: [conMote], google: [escrito], vinculos: [{ ...pendiente('people/gym'), etag: 'e2', hashEnviado: a.hash }] }))
  assert.equal(p2.actualizar.length + p2.refrescar.length + p2.revisiones.length + p2.crear.length, 0)
  // Y se adopta por el mote: un contacto «Mama» con su teléfono no va a la cola.
  const p3 = planificarSync(entrada({ crm: [conMote], google: [suya('people/x', 'Mama')] }))
  assert.equal(p3.actualizar[0]?.origen, 'adoptado')
})

test('🪤 mote: el nombre COMPLETO de Google (segundo nombre, tratamiento) y, si no se lee, lo encolado', () => {
  const g: PersonaGoogle = { resourceName: 'people/1', names: [{ givenName: 'Juan', middleName: 'Manuel', familyName: 'Padrino', displayName: 'AA Don Juan Manuel Padrino' }] }
  assert.equal(moteDesdeAgenda(g, { nombre: 'Juan', apellidos: 'Padrino' }), 'Don Juan Manuel Padrino')
  const sinDisplay: PersonaGoogle = { resourceName: 'people/2', names: [{ honorificPrefix: 'Dña.', givenName: 'Pilar', middleName: 'Carmen', familyName: 'Tía' }] }
  assert.equal(moteDesdeAgenda(sinDisplay, null), 'Dña. Pilar Carmen Tía')
  assert.equal(moteDesdeAgenda(null, { nombre: 'AA Mama', apellidos: '' }), 'Mama')
  assert.equal(moteDesdeAgenda(null, null), null)
})

test('🪤 mote de 60 con un emoji en el límite: se corta por puntos de código, sin medio emoji', () => {
  const mote = 'a'.repeat(59) + '👵' + 'zz'
  const c = camposDeCrm({ ...ana, mote })!
  assert.equal(c.nombre, 'a'.repeat(59) + '👵')
  assert.ok(!/[\uD800-\uDBFF]$/.test(c.nombre), 'medio par sustituto')
  assert.equal(limpiarMote('b'.repeat(59) + '€ñ'), 'b'.repeat(59) + '€')
})
