import test from 'node:test'
import assert from 'node:assert/strict'
import {
  camposDeCrm, camposDeGoogle, comprobarLimite, esReintentable, esperaReintento, hashCampos, personaDesdeCampos,
  planificarSync, syncTokenCaducado, trocear, LIMITE_CONTACTOS_GOOGLE,
  type EntradaPlan, type PersonaGoogle, type Vinculo,
} from './google-contactos.ts'
import type { ContactoMovil } from './vcard.ts'

const GRUPO = 'contactGroups/abc'
const ana: ContactoMovil = { clienteId: 'c1', nombre: 'Ana', apellidos: 'Pérez', telefono: '600 11 22 33', email: 'Ana@X.es', grupo: 'cliente' }
const luis: ContactoMovil = { clienteId: 'c2', nombre: 'Luis', apellidos: 'Gil', telefono: '611 22 33 44', email: null, grupo: 'lead' }

/** Lo que Google devolvería tras escribir `c` (con su normalización: canonicalForm, etc.). */
function enGoogle(c: ContactoMovil, rn: string, extra: Partial<PersonaGoogle> = {}): PersonaGoogle {
  const p = personaDesdeCampos(camposDeCrm(c)!, c.clienteId)
  return {
    resourceName: rn, etag: `e-${rn}`,
    names: p.names, emailAddresses: p.emailAddresses, organizations: p.organizations, externalIds: p.externalIds,
    phoneNumbers: p.phoneNumbers.map((t) => ({ value: t.value.replace('+34', '+34 '), canonicalForm: t.value })),
    memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }],
    ...extra,
  }
}
function vinculo(c: ContactoMovil, rn: string, extra: Partial<Vinculo> = {}): Vinculo {
  return { clienteId: c.clienteId, resourceName: rn, etag: `e-${rn}`, hashEnviado: hashCampos(camposDeCrm(c)!), origen: 'creado', estado: 'activo', ...extra }
}
function entrada(e: Partial<EntradaPlan>): EntradaPlan {
  return { crm: [], seleccionCompleta: true, vinculos: [], fusiones: new Map(), google: [], modo: 'completo', grupoResourceName: GRUPO, ...e }
}

test('mapeo: E.164, correo en minúsculas y «· AS Cliente» en el apellido; ni DNI ni dirección', () => {
  const p = personaDesdeCampos(camposDeCrm(ana)!, 'c1')
  assert.deepEqual(p.names, [{ givenName: 'Ana', familyName: 'Pérez · AS Cliente' }])
  assert.deepEqual(p.phoneNumbers, [{ value: '+34600112233', type: 'mobile' }])
  assert.deepEqual(p.emailAddresses, [{ value: 'ana@x.es', type: 'other' }])
  assert.deepEqual(p.externalIds, [{ value: 'c1', type: 'asegura' }])
  assert.deepEqual(Object.keys(p).sort(), ['emailAddresses', 'externalIds', 'names', 'organizations', 'phoneNumbers'])
})

test('lo leído de Google con su normalización da el MISMO hash que lo enviado', () => {
  assert.equal(hashCampos(camposDeGoogle(enGoogle(ana, 'people/1'))), hashCampos(camposDeCrm(ana)!))
})

test('🪤 un teléfono que llega cifrado (clave que no abre) NO se toca: ni crear, ni pisar, ni retirar', () => {
  const roto = { ...ana, telefono: 'v1:aa:bb:cc' }
  const plan = planificarSync(entrada({ crm: [roto], vinculos: [vinculo(ana, 'people/1')], google: [enGoogle(ana, 'people/1')] }))
  assert.equal(plan.ilegibles, 1)
  assert.equal(plan.crear.length + plan.actualizar.length + plan.retirar.length + plan.olvidar.length, 0)
})

test('ficha nueva sin nada en el grupo → se crea', () => {
  const plan = planificarSync(entrada({ crm: [ana] }))
  assert.equal(plan.crear.length, 1)
  assert.equal(plan.crear[0].clienteId, 'c1')
})

test('sin cambios a ningún lado → se omite', () => {
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], google: [enGoogle(ana, 'people/1')] }))
  assert.equal(plan.omitidos, 1)
  assert.equal(plan.actualizar.length + plan.crear.length + plan.revisiones.length, 0)
})

test('cambio en el CRM → se actualiza con el etag que tiene Google', () => {
  const plan = planificarSync(entrada({ crm: [{ ...ana, email: 'nuevo@x.es' }], vinculos: [vinculo(ana, 'people/1')], google: [enGoogle(ana, 'people/1')] }))
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].persona.etag, 'e-people/1')
  assert.equal(plan.revisiones.length, 0)
})

test('cambio en Google de un campo gestionado → CRM gana y lo de Google va a revisión', () => {
  const g = enGoogle(ana, 'people/1', { emailAddresses: [{ value: 'otra@x.es' }] })
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], google: [g] }))
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].persona.emailAddresses[0].value, 'ana@x.es')
  assert.equal(plan.revisiones.length, 1)
  assert.equal(plan.revisiones[0].tipo, 'cambio_en_google')
  assert.deepEqual(plan.revisiones[0].campos, ['email'])
  assert.equal(plan.revisiones[0].propuesta?.email, 'otra@x.es')
})

test('la misma revisión detectada dos veces tiene la misma huella (no se encola dos veces)', () => {
  const g = enGoogle(ana, 'people/1', { emailAddresses: [{ value: 'otra@x.es' }] })
  const a = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], google: [g] }))
  const b = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], google: [g] }))
  assert.equal(a.revisiones[0].huella, b.revisiones[0].huella)
})

test('contacto NUEVO en Google dentro del grupo → propuesta de lead, nunca alta', () => {
  const nuevo: PersonaGoogle = { resourceName: 'people/9', names: [{ givenName: 'Pepe' }], phoneNumbers: [{ value: '699000111' }], memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const personal: PersonaGoogle = { resourceName: 'people/8', names: [{ givenName: 'Mamá' }], memberships: [] }
  const plan = planificarSync(entrada({ google: [nuevo, personal] }))
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.revisiones.length, 1)
  assert.equal(plan.revisiones[0].tipo, 'propuesta_lead')
  assert.equal(plan.revisiones[0].resourceName, 'people/9')
})

test('🪤 un contacto PERSONAL (fuera del grupo) con el mismo teléfono no se vincula ni se toca', () => {
  const personal: PersonaGoogle = { resourceName: 'people/8', phoneNumbers: [{ value: '600112233' }], memberships: [] }
  const plan = planificarSync(entrada({ crm: [ana], google: [personal] }))
  assert.equal(plan.crear.length, 1)
  assert.equal(plan.actualizar.length, 0)
})

test('dedup por E.164 antes de crear: uno y solo uno en el grupo → se vincula', () => {
  const ya: PersonaGoogle = { resourceName: 'people/5', etag: 'x', phoneNumbers: [{ value: '+34 600 11 22 33' }], memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const plan = planificarSync(entrada({ crm: [ana], google: [ya] }))
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].origen, 'vinculado_telefono')
  assert.equal(plan.revisiones.length, 0, 'el vinculado no es además propuesta de lead')
})

test('teléfono compartido por dos fichas del CRM → no se funde: a revisión', () => {
  const ya: PersonaGoogle = { resourceName: 'people/5', phoneNumbers: [{ value: '600112233' }], memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const hermano = { ...luis, telefono: '600112233' }
  const plan = planificarSync(entrada({ crm: [ana, hermano], google: [ya] }))
  assert.equal(plan.actualizar.length, 0)
  assert.equal(plan.revisiones.filter((r) => r.tipo === 'duplicado_ambiguo').length, 2)
})

test('vínculo perdido pero el contacto lleva nuestro id externo → se recupera, no se duplica', () => {
  const plan = planificarSync(entrada({ crm: [ana], google: [enGoogle(ana, 'people/1')] }))
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.actualizar[0].origen, 'vinculado_id')
})

test('ficha fusionada: no se sincroniza y su contacto lo HEREDA la superviviente', () => {
  const absorbida = { ...ana, clienteId: 'c0' }
  const plan = planificarSync(entrada({
    crm: [absorbida, ana], fusiones: new Map([['c0', 'c1']]),
    vinculos: [vinculo(absorbida, 'people/0')], google: [enGoogle(absorbida, 'people/0')],
  }))
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].clienteId, 'c1')
  assert.equal(plan.actualizar[0].revinculaDe, 'c0')
  assert.equal(plan.retirar.length, 0)
})

test('ya no está en la selección → se retira lo que creamos; lo vinculado solo se olvida', () => {
  const plan = planificarSync(entrada({ vinculos: [vinculo(ana, 'people/1'), vinculo(luis, 'people/2', { origen: 'vinculado_telefono' })] }))
  assert.deepEqual(plan.retirar, [{ clienteId: 'c1', resourceName: 'people/1' }])
  assert.deepEqual(plan.olvidar, ['c2'])
})

test('🪤 selección incompleta → NO se retira nada (no estar en la lista ≠ haber dejado de ser cliente)', () => {
  const plan = planificarSync(entrada({ seleccionCompleta: false, vinculos: [vinculo(ana, 'people/1')] }))
  assert.equal(plan.retirar.length, 0)
  assert.equal(plan.olvidar.length, 0)
  assert.match(plan.avisos[0], /selección incompleta/)
})

test('🪤 retirada masiva se bloquea', () => {
  const vs = Array.from({ length: 60 }, (_, i) => vinculo({ ...ana, clienteId: `x${i}` }, `people/${i}`))
  const plan = planificarSync(entrada({ vinculos: vs }))
  assert.equal(plan.retirar.length, 0)
  assert.match(plan.avisos[0], /BLOQUEADA/)
})

test('borrado en Google → se vuelve a crear (CRM gana) y queda constancia', () => {
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], google: [{ resourceName: 'people/1', metadata: { deleted: true } }], modo: 'delta' }))
  assert.equal(plan.crear.length, 1)
  assert.equal(plan.revisiones[0].tipo, 'borrado_en_google')
  assert.equal(plan.necesitaListadoCompleto, true)
})

test('sacado del grupo a mano → deja de ser nuestro: no se toca y se aparta', () => {
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], google: [enGoogle(ana, 'people/1', { memberships: [] })] }))
  assert.deepEqual(plan.apartar, ['c1'])
  assert.equal(plan.actualizar.length + plan.crear.length, 0)
})

test('en modo delta, una persona que no aparece se da por no cambiada (no por borrada)', () => {
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], modo: 'delta' }))
  assert.equal(plan.omitidos, 1)
  assert.equal(plan.crear.length, 0)
})

test('cliente gana a lead si la misma ficha sale dos veces', () => {
  const plan = planificarSync(entrada({ crm: [{ ...ana, grupo: 'lead' }, ana] }))
  assert.equal(plan.crear.length, 1)
  assert.equal(plan.crear[0].persona.organizations[0].title, 'Cliente')
})

test('límite de 25.000: error claro, y cuenta también los contactos personales', () => {
  assert.throws(() => comprobarLimite({ aSincronizar: LIMITE_CONTACTOS_GOOGLE + 1, vinculados: 0, totalCuenta: null }), /25000/)
  assert.throws(() => comprobarLimite({ aSincronizar: 20_000, vinculados: 0, totalCuenta: 6_000 }), /No se ha escrito nada/)
  assert.doesNotThrow(() => comprobarLimite({ aSincronizar: 20_000, vinculados: 20_000, totalCuenta: 24_000 }))
})

test('red: reintentos, espera y syncToken caducado', () => {
  assert.equal(esReintentable(429), true)
  assert.equal(esReintentable(400), false)
  assert.equal(esperaReintento(0, '3'), 3000)
  assert.equal(esperaReintento(2, null, 0), 4000)
  assert.ok(esperaReintento(20, null, 1) <= 40_000)
  assert.equal(syncTokenCaducado(410, ''), true)
  assert.equal(syncTokenCaducado(400, '{"reason":"EXPIRED_SYNC_TOKEN"}'), true)
  assert.equal(syncTokenCaducado(400, 'otra cosa'), false)
  assert.deepEqual(trocear([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})
