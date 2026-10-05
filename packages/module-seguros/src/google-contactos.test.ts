import test from 'node:test'
import assert from 'node:assert/strict'
import {
  camposDeCrm, camposDeGoogle, comprobarLimite, esReintentable, esperaReintento, hashCampos, personaDesdeCampos,
  planificarSync, syncTokenCaducado, trocear, aBorrarAlDesconectar, LIMITE_CONTACTOS_GOOGLE,
  nombreEnGoogle, puertaSync, quitarPrefijo,
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

test('mapeo: E.164, correo en minúsculas y «🟢 » delante del nombre; ni DNI ni dirección', () => {
  const p = personaDesdeCampos(camposDeCrm(ana)!, 'c1')
  assert.deepEqual(p.names, [{ givenName: '🟢 Ana', familyName: 'Pérez' }])
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

// ─── Revisión adversarial (05/10/2026) ──────────────────────────────────────────

const lead: ContactoMovil = { clienteId: 'l1', nombre: 'María López Ruiz', apellidos: null, telefono: '622 33 44 55', email: 'maria@x.es', grupo: 'lead' }

test('🪤 3a: lead SIN apellidos — lo que Google devuelve tal cual se envió da el mismo hash (no reescribe cada hora)', () => {
  const plan = planificarSync(entrada({ crm: [lead], vinculos: [vinculo(lead, 'people/9')], google: [enGoogle(lead, 'people/9')] }))
  assert.equal(plan.actualizar.length, 0)
  assert.equal(plan.revisiones.length, 0)
  assert.equal(plan.omitidos, 1)
})

test('🪤 3a: ficha sin nombre ni apellidos («(sin nombre)») tampoco cicla', () => {
  const nadie: ContactoMovil = { clienteId: 'l2', nombre: null, apellidos: null, telefono: '633 44 55 66', email: null, grupo: 'lead' }
  const plan = planificarSync(entrada({ crm: [nadie], vinculos: [vinculo(nadie, 'people/8')], google: [enGoogle(nadie, 'people/8')] }))
  assert.equal(plan.actualizar.length + plan.revisiones.length, 0)
})

test('🪤 2: lead con baja de WhatsApp llega sin teléfono → NO se borra el de Google', () => {
  const sinTel = { ...lead, telefono: null }
  const plan = planificarSync(entrada({ crm: [sinTel], vinculos: [vinculo(lead, 'people/9')], google: [enGoogle(lead, 'people/9')] }))
  assert.equal(plan.actualizar.length, 0)
  assert.equal(plan.revisiones.length, 0)
  // Y el hash que se guarda ya no vuelve a pedir escritura la hora siguiente.
  const refresco = plan.refrescar[0]
  const plan2 = planificarSync(entrada({ crm: [sinTel], vinculos: [vinculo(lead, 'people/9', { hashEnviado: refresco.hash })], google: [enGoogle(lead, 'people/9')] }))
  assert.equal(plan2.actualizar.length + plan2.refrescar.length + plan2.revisiones.length, 0)
})

test('🪤 2: si hay que escribir por OTRO campo, el teléfono de Google se conserva tal cual', () => {
  const sinTel = { ...lead, telefono: null, email: 'nuevo@x.es' }
  const g = enGoogle(lead, 'people/9')
  const plan = planificarSync(entrada({ crm: [sinTel], vinculos: [vinculo(lead, 'people/9')], google: [g] }))
  assert.equal(plan.actualizar.length, 1)
  assert.deepEqual(plan.actualizar[0].persona.phoneNumbers.map((t) => t.value), [g.phoneNumbers![0].value])
  assert.deepEqual(plan.actualizar[0].persona.emailAddresses, [{ value: 'nuevo@x.es', type: 'other' }])
})

test('🪤 2: correo ausente en el CRM tampoco vacía el de Google', () => {
  const sinMail = { ...lead, email: null, nombre: 'María López Ruiz (Seguros)' }
  const plan = planificarSync(entrada({ crm: [sinMail], vinculos: [vinculo(lead, 'people/9')], google: [enGoogle(lead, 'people/9')] }))
  assert.equal(plan.actualizar.length, 1)
  assert.deepEqual(plan.actualizar[0].persona.emailAddresses.map((m) => m.value), ['maria@x.es'])
})

test('🪤 2: en delta sin ver el contacto, un teléfono ausente NO se escribe a ciegas: pide listado completo', () => {
  const sinTel = { ...lead, telefono: null, email: 'nuevo@x.es' }
  const plan = planificarSync(entrada({ crm: [sinTel], vinculos: [vinculo(lead, 'people/9')], modo: 'delta' }))
  assert.equal(plan.actualizar.length, 0)
  assert.equal(plan.necesitaListadoCompleto, true)
})

test('🪤 3c: fusión encadenada (A→B→C): C hereda el contacto de A, no crea otro', () => {
  const a = { ...ana, clienteId: 'cA' }
  const c = { ...ana, clienteId: 'cC' }
  const plan = planificarSync(entrada({
    crm: [c], fusiones: new Map([['cA', 'cB'], ['cB', 'cC']]),
    vinculos: [vinculo(a, 'people/A')], google: [enGoogle(a, 'people/A')],
  }))
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].clienteId, 'cC')
  assert.equal(plan.actualizar[0].revinculaDe, 'cA')
  assert.equal(plan.retirar.length + plan.olvidar.length, 0)
})

test('🪤 3c: vínculo perdido tras fusionar (el contacto lleva el id de la ABSORBIDA) → se recupera, no se duplica', () => {
  const absorbida = { ...ana, clienteId: 'c0' }
  const plan = planificarSync(entrada({ crm: [ana], fusiones: new Map([['c0', 'c1']]), google: [enGoogle(absorbida, 'people/0')] }))
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].resourceName, 'people/0')
  assert.equal(plan.actualizar[0].clienteId, 'c1')
})

test('🪤 3c: la absorbida estaba SACADA del grupo → la superviviente lo hereda apartado, no se recrea', () => {
  const absorbida = { ...ana, clienteId: 'c0' }
  const plan = planificarSync(entrada({
    crm: [ana], fusiones: new Map([['c0', 'c1']]),
    vinculos: [vinculo(absorbida, 'people/0', { estado: 'fuera_del_grupo' })], google: [enGoogle(absorbida, 'people/0', { memberships: [] })],
  }))
  assert.equal(plan.crear.length, 0)
  assert.deepEqual(plan.reasignar, [{ de: 'c0', a: 'c1' }])
  assert.equal(plan.olvidar.length, 0)
})

test('🪤 3c: lo heredado conserva QUIÉN creó el contacto (si no, al desconectar se perdería o se borraría mal)', () => {
  const absorbida = { ...ana, clienteId: 'c0' }
  const plan = planificarSync(entrada({
    crm: [ana], fusiones: new Map([['c0', 'c1']]),
    vinculos: [vinculo(absorbida, 'people/0', { origen: 'vinculado_telefono' })], google: [enGoogle(absorbida, 'people/0')],
  }))
  assert.equal(plan.actualizar[0].origen, 'vinculado_telefono')
})

test('🪤 3b: al desconectar con borrado solo se borra lo que CREÓ el CRM (ni lo vinculado por teléfono/id ni lo apartado)', () => {
  const miembros = ['people/1', 'people/2', 'people/3', 'people/4', 'people/5']
  const borrar = aBorrarAlDesconectar(miembros, [
    { resourceName: 'people/1', origen: 'creado', estado: 'activo' },
    { resourceName: 'people/2', origen: 'vinculado_telefono', estado: 'activo' },
    { resourceName: 'people/3', origen: 'vinculado_id', estado: 'activo' },
    { resourceName: 'people/4', origen: 'creado', estado: 'fuera_del_grupo' },
    { resourceName: 'people/9', origen: 'creado', estado: 'activo' }, // ya no está en el grupo
  ])
  assert.deepEqual(borrar, ['people/1'])
})

// ─── Revisión PR #4286: el CRM gestiona SU entrada; lo demás de Google se conserva ──────

test('🪤 Alberto añadió en Google un 2.º teléfono, un 2.º correo y su empresa → una escritura por otro campo los conserva', () => {
  const g = enGoogle(ana, 'people/1')
  g.phoneNumbers = [...g.phoneNumbers!, { value: '955 00 11 22', canonicalForm: '+34955001122', type: 'work' }]
  g.emailAddresses = [...g.emailAddresses!, { value: 'ana@empresa.es', type: 'work' }]
  g.organizations = [{ name: 'Talleres Pérez', title: 'Gerente' }, ...g.organizations!]
  const plan = planificarSync(entrada({ crm: [{ ...ana, nombre: 'Ana María' }], vinculos: [vinculo(ana, 'people/1')], google: [g] }))
  assert.equal(plan.actualizar.length, 1)
  const p = plan.actualizar[0].persona
  // La nuestra ya estaba: se reenvía la entrada de Google tal cual (con su formato).
  assert.deepEqual(p.phoneNumbers.map((t) => t.value.replace(/\s/g, '')), ['+34600112233', '955001122'])
  assert.deepEqual(p.emailAddresses.map((m) => m.value), ['ana@x.es', 'ana@empresa.es'])
  assert.deepEqual(p.organizations.map((o) => o.name).sort(), ['Grupo ASegura', 'Talleres Pérez'])
  assert.equal(p.organizations.find((o) => o.name === 'Talleres Pérez')?.title, 'Gerente')
})

test('🪤 cambia el teléfono en el CRM → se sustituye SOLO nuestra entrada; el 2.º teléfono de Google sigue', () => {
  const g = enGoogle(ana, 'people/1')
  g.phoneNumbers = [...g.phoneNumbers!, { value: '955001122', type: 'work' }]
  const plan = planificarSync(entrada({ crm: [{ ...ana, telefono: '644 55 66 77' }], vinculos: [vinculo(ana, 'people/1')], google: [g] }))
  assert.equal(plan.actualizar.length, 1)
  assert.deepEqual(plan.actualizar[0].persona.phoneNumbers.map((t) => t.value), ['+34644556677', '955001122'])
})

test('🪤 lo escrito con entradas conservadas se relee con el MISMO hash (no reescribe cada hora)', () => {
  const g = enGoogle(ana, 'people/1')
  g.phoneNumbers = [...g.phoneNumbers!, { value: '955001122', type: 'work' }]
  const plan = planificarSync(entrada({ crm: [{ ...ana, nombre: 'Ana María' }], vinculos: [vinculo(ana, 'people/1')], google: [g] }))
  const escrito = plan.actualizar[0].persona
  const releido: PersonaGoogle = { ...g, names: escrito.names, phoneNumbers: escrito.phoneNumbers, emailAddresses: escrito.emailAddresses, organizations: escrito.organizations }
  assert.equal(hashCampos(camposDeGoogle(releido)), plan.actualizar[0].hash)
})

test('🪤 vincular por teléfono un contacto que ya tenía OTRO nombre → no se pisa: a revisión, ni se vincula ni se duplica', () => {
  const ya: PersonaGoogle = { resourceName: 'people/5', etag: 'x', names: [{ givenName: 'Fontanero', familyName: 'Juan' }], phoneNumbers: [{ value: '+34 600 11 22 33' }], memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const plan = planificarSync(entrada({ crm: [ana], google: [ya] }))
  assert.equal(plan.actualizar.length, 0)
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.revisiones.length, 1)
  assert.equal(plan.revisiones[0].tipo, 'duplicado_ambiguo')
  assert.equal(plan.revisiones[0].resourceName, 'people/5')
  assert.ok(plan.revisiones[0].campos.includes('nombre'))
  assert.equal(plan.revisiones[0].propuesta?.nombre, 'Fontanero')
})

test('vincular por teléfono con el MISMO nombre (escrito distinto) sí vincula, y su correo de Google se conserva', () => {
  const ya: PersonaGoogle = { resourceName: 'people/5', etag: 'x', names: [{ givenName: 'ana perez' }], phoneNumbers: [{ value: '+34 600 11 22 33' }], emailAddresses: [{ value: 'ana.casa@x.es', type: 'home' }], memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const plan = planificarSync(entrada({ crm: [ana], google: [ya] }))
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].origen, 'vinculado_telefono')
  assert.deepEqual(plan.actualizar[0].persona.emailAddresses.map((m) => m.value), ['ana@x.es', 'ana.casa@x.es'])
})

test('🪤 en delta sin ver el contacto NO se escribe a ciegas aunque el CRM traiga teléfono y correo (perdería lo demás de Google)', () => {
  const plan = planificarSync(entrada({ crm: [{ ...ana, nombre: 'Ana María' }], vinculos: [vinculo(ana, 'people/1')], modo: 'delta' }))
  assert.equal(plan.actualizar.length, 0)
  assert.equal(plan.necesitaListadoCompleto, true)
})

// ─── Emoji de tipo delante del nombre (05/10/2026) ─────────────────────────────

test('emoji: 🟢 cliente / 🟡 lead al PRINCIPIO del nombre visible; sin nombre, «🟡 (sin nombre)»', () => {
  assert.equal(nombreEnGoogle(camposDeCrm(ana)!), '🟢 Ana Pérez')
  assert.equal(nombreEnGoogle(camposDeCrm(lead)!), '🟡 María López Ruiz')
  const soloApellidos = personaDesdeCampos(camposDeCrm({ ...luis, nombre: null })!, 'c2')
  assert.deepEqual(soloApellidos.names, [{ givenName: '🟡', familyName: 'Gil' }])
  const nadie = personaDesdeCampos(camposDeCrm({ ...luis, nombre: null, apellidos: null })!, 'c2')
  assert.deepEqual(nadie.names, [{ givenName: '🟡 (sin nombre)', familyName: '' }])
})

test('🪤 3a emoji: al leer se quita y se reconoce (también con U+FE0F y solo-emoji): mismo hash, no reescribe', () => {
  assert.deepEqual(quitarPrefijo('🟢 Ana'), { nombre: 'Ana', grupo: 'cliente' })
  assert.deepEqual(quitarPrefijo('🟡\uFE0F  María'), { nombre: 'María', grupo: 'lead' })
  assert.deepEqual(quitarPrefijo('🟡'), { nombre: '', grupo: 'lead' })
  assert.deepEqual(quitarPrefijo('Ana'), { nombre: 'Ana', grupo: null })
  for (const c of [ana, luis, lead, { ...luis, nombre: null }, { ...luis, nombre: null, apellidos: null }]) {
    const plan = planificarSync(entrada({ crm: [c], vinculos: [vinculo(c, 'people/1')], google: [enGoogle(c, 'people/1')] }))
    assert.equal(plan.actualizar.length + plan.refrescar.length + plan.revisiones.length, 0, `cicla: ${c.clienteId}`)
  }
})

test('emoji borrado a mano en Google → se vuelve a poner (CRM manda) y queda constancia', () => {
  const g = enGoogle(ana, 'people/1', { names: [{ givenName: 'Ana', familyName: 'Pérez' }] })
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], google: [g] }))
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].persona.names[0].givenName, '🟢 Ana')
  assert.deepEqual(plan.revisiones.map((r) => r.campos), [['grupo']])
})

test('lead que pasa a cliente → UN update con 🟢 (sin «cambio en Google» falso) y la hora siguiente nada', () => {
  const comoLead = { ...ana, grupo: 'lead' as const }
  const g = enGoogle(comoLead, 'people/1')
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(comoLead, 'people/1')], google: [g] }))
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.revisiones.length, 0)
  const escrito = plan.actualizar[0].persona
  assert.equal(escrito.names[0].givenName, '🟢 Ana')
  assert.deepEqual(escrito.organizations, [{ name: 'Grupo ASegura', title: 'Cliente' }])
  const releido: PersonaGoogle = { ...g, names: escrito.names, organizations: escrito.organizations }
  const plan2 = planificarSync(entrada({ crm: [ana], vinculos: [vinculo(ana, 'people/1')], google: [releido] }))
  assert.equal(plan2.actualizar.length + plan2.refrescar.length + plan2.revisiones.length, 0)
})

test('vincular por teléfono: el emoji no cuenta como nombre distinto («🟢 Ana Pérez» = «Ana Pérez»)', () => {
  const ya: PersonaGoogle = { resourceName: 'people/5', etag: 'x', names: [{ givenName: '🟢 Ana', familyName: 'Pérez' }], phoneNumbers: [{ value: '+34 600 11 22 33' }], memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }] }
  const plan = planificarSync(entrada({ crm: [ana], google: [ya] }))
  assert.equal(plan.revisiones.length, 0)
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].origen, 'vinculado_telefono')
})

test('puerta del cron: sin la marca de «sync activada» NO se escribe (pendiente_activar)', () => {
  assert.equal(puertaSync(null), 'sin_conexion')
  assert.equal(puertaSync({ estado: 'revocada', syncActivadaEn: new Date() }), 'revocada')
  assert.equal(puertaSync({ estado: 'conectada', syncActivadaEn: null }), 'pendiente_activar')
  assert.equal(puertaSync({ estado: 'conectada', syncActivadaEn: new Date() }), 'adelante')
})
