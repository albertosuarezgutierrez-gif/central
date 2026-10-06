import test from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoVencimiento, camposDeCrm, camposDeGoogle, conBloque, extraerBloque, hashCampos, MASCARA_GESTIONADA,
  nombreCompaniaContacto, normalizarNacimiento, notaCliente, notaLead, planificarSync, proximoVencimiento, quitarPrefijo,
  type ContactoGoogle, type EntradaPlan, type PersonaGoogle, type Vinculo,
} from './google-contactos.ts'

// B nota · C compañías 🔵 · D aviso ⏰ · E cumpleaños (05/10/2026, decisiones de Alberto).

const GRUPO = 'contactGroups/abc'
const URL_FICHA = 'https://plataforma.example/correduria/cliente/c1'
const NOTA = notaCliente({ polizas: [{ ramo: 'hogar', compania: 'Mapfre' }, { ramo: 'auto', compania: 'Allianz' }], proximoVencimiento: '2026-11-12' })
const ana: ContactoGoogle = {
  clienteId: 'c1', nombre: 'Ana', apellidos: 'Pérez', telefono: '600112233', email: null, grupo: 'cliente',
  nota: NOTA, url: URL_FICHA, cumpleanos: '1980-03-12', aviso: false,
}
const entrada = (e: Partial<EntradaPlan>): EntradaPlan =>
  ({ crm: [], seleccionCompleta: true, vinculos: [], fusiones: new Map(), google: [], modo: 'completo', grupoResourceName: GRUPO, ...e })
const miembro = [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }]

/** Lo que Google devuelve tras escribir lo que manda el plan (crear). */
function creado(c: ContactoGoogle, extra: Partial<PersonaGoogle> = {}): { g: PersonaGoogle; v: Vinculo } {
  const plan = planificarSync(entrada({ crm: [c] }))
  const e = plan.crear[0]
  const g: PersonaGoogle = { resourceName: 'people/1', etag: 'e1', ...e.persona, memberships: miembro, ...extra }
  return { g, v: { clienteId: c.clienteId, resourceName: 'people/1', etag: 'e1', hashEnviado: e.hash, origen: 'creado', estado: 'activo' } }
}

test('máscara: los campos nuevos se escriben (y nada más)', () => {
  assert.equal(MASCARA_GESTIONADA, 'names,phoneNumbers,emailAddresses,organizations,externalIds,biographies,urls,birthdays')
})

// ─── B: nota ────────────────────────────────────────────────────────────────

test('B: la ficha rápida: ramo + compañía y próximo vencimiento dd/mm/aaaa; sin NIF, importes ni nº de póliza', () => {
  assert.match(NOTA, /Hogar · Mapfre/)
  assert.match(NOTA, /Auto · Allianz/)
  assert.match(NOTA, /12\/11\/2026/)
  assert.doesNotMatch(NOTA, /€|\d{8}[A-Z]/)
  assert.match(notaCliente({ polizas: [{ ramo: 'vida', compania: null }], proximoVencimiento: null }), /Vida · compañía sin identificar/)
  assert.match(notaLead({ ramo: 'hogar', compania: 'Mapfre', vencimiento: '2026-12-01' }), /Lead.*Hogar · Mapfre.*01\/12\/2026/s)
})

test('B: el bloque del CRM va entre marcas y el texto de Alberto fuera del bloque se conserva', () => {
  const bio = 'Le gusta que le llamen por la tarde.'
  const con = conBloque(bio, NOTA)
  assert.ok(con.startsWith(bio))
  assert.equal(extraerBloque(con), NOTA)
  const otra = conBloque(con, 'Pólizas en vigor:\n· Vida · Ocaso')
  assert.ok(otra.startsWith(bio), 'el texto propio sigue')
  assert.equal(extraerBloque(otra), 'Pólizas en vigor:\n· Vida · Ocaso')
  assert.equal(otra.split('— Grupo ASegura —').length, 2, 'un solo bloque')
  assert.equal(extraerBloque('nada'), null)
})

test('B: en un contacto existente se reescribe SOLO el bloque; lo de Alberto queda', () => {
  const { g, v } = creado(ana)
  const g2 = { ...g, biographies: [{ value: `Llamar por la tarde.\n\n${g.biographies![0].value}`, contentType: 'TEXT_PLAIN' }] }
  const cambiado = { ...ana, nota: notaCliente({ polizas: [{ ramo: 'vida', compania: 'Ocaso' }], proximoVencimiento: null }) }
  const plan = planificarSync(entrada({ crm: [cambiado], vinculos: [v], google: [g2] }))
  assert.equal(plan.actualizar.length, 1)
  const bio = plan.actualizar[0].persona.biographies![0].value
  assert.ok(bio.startsWith('Llamar por la tarde.'))
  assert.match(bio, /Vida · Ocaso/)
  assert.doesNotMatch(bio, /Mapfre/)
})

test('B: tocar el bloque en Google NO va a la cola (el CRM lo repone sin más)', () => {
  const { g, v } = creado(ana)
  const g2 = { ...g, biographies: [{ value: conBloque('', 'texto tocado'), contentType: 'TEXT_PLAIN' }] }
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [v], google: [g2] }))
  assert.equal(plan.revisiones.length, 0)
  assert.equal(plan.actualizar.length, 1)
  assert.equal(extraerBloque(plan.actualizar[0].persona.biographies![0].value), NOTA)
})

test('B: nota y URL sin cambios → no se reescribe; la URL del CRM va en urls conservando las de Alberto', () => {
  const { g, v } = creado(ana, {})
  assert.deepEqual(g.urls, [{ value: URL_FICHA, type: 'Grupo ASegura' }])
  const g2 = { ...g, urls: [...g.urls!, { value: 'https://linkedin.com/x', type: 'profile' }] }
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [v], google: [g2] }))
  assert.equal(plan.actualizar.length + plan.revisiones.length, 0)
  const cambio = planificarSync(entrada({ crm: [{ ...ana, url: 'https://otra/correduria/cliente/c1' }], vinculos: [v], google: [g2] }))
  assert.deepEqual(cambio.actualizar[0].persona.urls!.map((u) => u.value), ['https://otra/correduria/cliente/c1', 'https://linkedin.com/x'])
})

test('B: nota desconocida (null) → la de Google no se toca (se reenvía tal cual)', () => {
  const { g, v } = creado(ana)
  const g2 = { ...g, biographies: [{ value: 'Solo lo de Alberto', contentType: 'TEXT_PLAIN' }] }
  const plan = planificarSync(entrada({ crm: [{ ...ana, nota: null, email: 'nuevo@x.es' }], vinculos: [v], google: [g2] }))
  assert.equal(plan.actualizar[0].persona.biographies![0].value, 'Solo lo de Alberto')
})

// ─── C: compañías ───────────────────────────────────────────────────────────

test('C: nombre «🔵 Mapfre · Siniestros (Laura)» y organization con el tipo en texto', () => {
  assert.equal(nombreCompaniaContacto({ compania: 'Mapfre', area: 'siniestros', nombre: 'Laura' }), 'Mapfre · Siniestros (Laura)')
  assert.equal(nombreCompaniaContacto({ compania: 'Mapfre', area: null, nombre: 'Laura' }), 'Mapfre (Laura)')
  assert.equal(nombreCompaniaContacto({ compania: 'Mapfre', area: 'administracion', nombre: '' }), 'Mapfre · Administración')
  const laura: ContactoGoogle = { clienteId: 'compania:u1', nombre: 'Mapfre · Siniestros (Laura)', apellidos: null, telefono: '915 55 55 55', email: null, grupo: 'compania' }
  const plan = planificarSync(entrada({ crm: [laura] }))
  assert.deepEqual(plan.crear[0].persona.names, [{ givenName: '🔵 Mapfre · Siniestros (Laura)', familyName: '' }])
  assert.deepEqual(plan.crear[0].persona.organizations, [{ name: 'Grupo ASegura', title: 'Compañía' }])
  const g: PersonaGoogle = { resourceName: 'people/l', ...plan.crear[0].persona, memberships: miembro }
  assert.equal(hashCampos(camposDeGoogle(g)), plan.crear[0].hash, 'se relee igual: sin reescritura horaria')
})

test('C: una compañía del .vcf/agenda fuera de la etiqueta con su nombre se adopta igual', () => {
  const laura: ContactoGoogle = { clienteId: 'compania:u1', nombre: 'Mapfre · Siniestros (Laura)', apellidos: null, telefono: '915555555', email: null, grupo: 'compania' }
  const g: PersonaGoogle = { resourceName: 'people/l', names: [{ givenName: 'Mapfre · Siniestros (Laura)' }], phoneNumbers: [{ value: '+34 915 55 55 55' }] }
  const plan = planificarSync(entrada({ crm: [laura], google: [g] }))
  assert.equal(plan.actualizar[0]?.origen, 'adoptado')
})

// ─── D: aviso ⏰ ─────────────────────────────────────────────────────────────

test('D: ≤30 días (incluidos hoy y el día 30) → aviso; NULL o vencida no cuentan', () => {
  assert.equal(avisoVencimiento(['2026-10-05'], '2026-10-05'), true)
  assert.equal(avisoVencimiento(['2026-11-04'], '2026-10-05'), true)
  assert.equal(avisoVencimiento(['2026-11-05'], '2026-10-05'), false)
  assert.equal(avisoVencimiento(['2026-10-04', null], '2026-10-05'), false)
  assert.equal(proximoVencimiento(['2027-01-01', '2026-10-04', '2026-12-01', null], '2026-10-05'), '2026-12-01')
})

test('D: prefijo «🟢⏰ », el parser lo reconoce y no hay revisiones falsas; UN update al entrar y otro al salir', () => {
  assert.deepEqual(quitarPrefijo('🟢⏰ Ana'), { nombre: 'Ana', grupo: 'cliente', aviso: true, alerta: null })
  assert.deepEqual(quitarPrefijo('🟢️⏰️ Ana'), { nombre: 'Ana', grupo: 'cliente', aviso: true, alerta: null })
  const { g, v } = creado(ana)
  const entra = planificarSync(entrada({ crm: [{ ...ana, aviso: true }], vinculos: [v], google: [g] }))
  assert.equal(entra.actualizar.length, 1)
  assert.equal(entra.revisiones.length, 0)
  assert.equal(entra.actualizar[0].persona.names[0].givenName, '🟢⏰ Ana')
  const g2: PersonaGoogle = { ...g, ...entra.actualizar[0].persona, etag: 'e2' }
  const v2 = { ...v, etag: 'e2', hashEnviado: entra.actualizar[0].hash }
  const quieto = planificarSync(entrada({ crm: [{ ...ana, aviso: true }], vinculos: [v2], google: [g2] }))
  assert.equal(quieto.actualizar.length + quieto.revisiones.length, 0, 'estable dentro de la ventana')
  const sale = planificarSync(entrada({ crm: [ana], vinculos: [v2], google: [g2] }))
  assert.equal(sale.actualizar.length, 1)
  assert.equal(sale.revisiones.length, 0)
  assert.equal(sale.actualizar[0].persona.names[0].givenName, '🟢 Ana')
})

// ─── E: cumpleaños ──────────────────────────────────────────────────────────

test('E: fecha de nacimiento normalizada; ilegible o rara → null', () => {
  assert.equal(normalizarNacimiento('1980-03-12'), '1980-03-12')
  assert.equal(normalizarNacimiento('12/03/1980'), '1980-03-12')
  assert.equal(normalizarNacimiento('1980-02-31'), null)
  assert.equal(normalizarNacimiento('v1:aa:bb'), null)
  assert.equal(normalizarNacimiento(null), null)
})

test('E: con fecha en el CRM va a birthdays; sin ella, la de Google no se toca', () => {
  const plan = planificarSync(entrada({ crm: [ana] }))
  assert.deepEqual(plan.crear[0].persona.birthdays, [{ date: { year: 1980, month: 3, day: 12 } }])
  const { g, v } = creado({ ...ana, cumpleanos: null })
  const g2 = { ...g, birthdays: [{ date: { month: 7, day: 1 } }] }
  const plan2 = planificarSync(entrada({ crm: [{ ...ana, cumpleanos: null, email: 'nuevo@x.es' }], vinculos: [v], google: [g2] }))
  assert.deepEqual(plan2.actualizar[0].persona.birthdays, [{ date: { month: 7, day: 1 } }])
  assert.equal(plan2.revisiones.length, 0)
})

test('E: si en Google cambian el cumpleaños, CRM gana y lo de Google va a la cola', () => {
  const { g, v } = creado(ana)
  const g2 = { ...g, birthdays: [{ date: { year: 1981, month: 3, day: 12 } }] }
  const plan = planificarSync(entrada({ crm: [ana], vinculos: [v], google: [g2] }))
  assert.equal(plan.revisiones[0]?.tipo, 'cambio_en_google')
  assert.deepEqual(plan.revisiones[0].campos, ['cumpleanos'])
  assert.deepEqual(plan.actualizar[0].persona.birthdays, [{ date: { year: 1980, month: 3, day: 12 } }])
})

test('E: el campo nuevo vacío en la ficha no hace «cambio en Google»: camposDeCrm sin extras = null', () => {
  const c = camposDeCrm({ clienteId: 'x', nombre: 'A', apellidos: 'B', telefono: null, email: null, grupo: 'lead' })!
  assert.equal(c.nota, null)
  assert.equal(c.url, null)
  assert.equal(c.cumpleanos, null)
  assert.equal(c.aviso, false)
})
