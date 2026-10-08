import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  alertaPrioritaria, camposDeCrm, camposDeGoogle, conLineasEstado, hashCampos, lineasEstado, notaExCliente, personaDesdeCampos,
  planificarSync, quitarPrefijo, type ContactoGoogle, type EntradaPlan, type PersonaGoogle, type Vinculo,
} from './google-contactos.ts'

// ESTADOS en el contacto (05/10/2026, decisión de Alberto): 🚨 siniestro abierto · 💶 recibo devuelto ·
// ⚪ ex-cliente. Máximo 2 emojis (tipo + el más urgente: 🚨 > 💶 > ⏰). Lo escrito se relee igual:
// nada de reescritura horaria.

const GRUPO = 'contactGroups/abc'
const ana: ContactoGoogle = { clienteId: 'c1', nombre: 'Ana', apellidos: 'Pérez', telefono: '600112233', email: null, grupo: 'cliente', nota: 'Pólizas en vigor: ninguna', aviso: true }
const entrada = (e: Partial<EntradaPlan>): EntradaPlan =>
  ({ crm: [], seleccionCompleta: true, vinculos: [], fusiones: new Map(), google: [], modo: 'completo', grupoResourceName: GRUPO, ...e })
const escrito = (c: ContactoGoogle): PersonaGoogle => ({
  resourceName: 'people/1', etag: 'e1', ...personaDesdeCampos(camposDeCrm(c)!, c.clienteId),
  memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }],
})
const vinculo = (c: ContactoGoogle): Vinculo => ({ clienteId: c.clienteId, resourceName: 'people/1', etag: 'e1', hashEnviado: hashCampos(camposDeCrm(c)!), origen: 'creado', estado: 'activo' })

test('🪤 prioridad y máximo 2 emojis: 🚨 > 💶 > ⏰', () => {
  assert.equal(alertaPrioritaria({ siniestroAbierto: true, reciboDevuelto: true }), 'siniestro')
  assert.equal(alertaPrioritaria({ siniestroAbierto: false, reciboDevuelto: true }), 'recibo')
  assert.equal(alertaPrioritaria({ siniestroAbierto: false, reciboDevuelto: false }), null)
  const g = (c: ContactoGoogle) => personaDesdeCampos(camposDeCrm(c)!, 'c1').names[0].givenName
  assert.equal(g({ ...ana, alerta: 'siniestro' }), '🟢🚨 Ana')
  assert.equal(g({ ...ana, alerta: 'recibo' }), '🟢💶 Ana')
  assert.equal(g(ana), '🟢⏰ Ana')
  assert.equal(g({ ...ana, grupo: 'lead', alerta: 'siniestro' }), '🟡 Ana', 'un lead no lleva estado')
})

test('🪤 lo escrito se relee igual (también con ⏰ tapado por 🚨): sin reescritura horaria', () => {
  for (const c of [{ ...ana, alerta: 'siniestro' as const }, { ...ana, alerta: 'recibo' as const }, { ...ana, grupo: 'ex_cliente' as const, aviso: false }, { ...ana, grupo: 'ex_cliente' as const, alerta: 'siniestro' as const }]) {
    const p = planificarSync(entrada({ crm: [c], google: [escrito(c)], vinculos: [vinculo(c)] }))
    assert.equal(p.actualizar.length + p.revisiones.length + p.refrescar.length, 0, JSON.stringify(c))
    assert.equal(hashCampos(camposDeGoogle(escrito(c))), hashCampos(camposDeCrm(c)!))
  }
})

test('🪤 sin alerta el hash es el de antes del 05/10 (el despliegue no reescribe la agenda)', () => {
  const c = camposDeCrm(ana)!
  const antes = createHash('sha256').update(JSON.stringify(['nombre', 'apellidos', 'telefono', 'email', 'grupo', 'nota', 'url', 'cumpleanos', 'aviso'].map((k) => c[k as keyof typeof c]))).digest('hex')
  assert.equal(hashCampos(c), antes)
})

test('el estado cambia → UN update, sin revisión (es derivado: no va a la cola)', () => {
  const p = planificarSync(entrada({ crm: [{ ...ana, alerta: 'siniestro' }], google: [escrito(ana)], vinculos: [vinculo(ana)] }))
  assert.equal(p.actualizar.length, 1)
  assert.equal(p.actualizar[0].persona.names[0].givenName, '🟢🚨 Ana')
  assert.equal(p.revisiones.length, 0)
  const sale = planificarSync(entrada({ crm: [ana], google: [escrito({ ...ana, alerta: 'siniestro' })], vinculos: [vinculo({ ...ana, alerta: 'siniestro' })] }))
  assert.equal(sale.actualizar.length, 1)
  assert.equal(sale.actualizar[0].persona.names[0].givenName, '🟢⏰ Ana')
  assert.equal(sale.revisiones.length, 0)
})

test('⚪ ex-cliente: emoji y organization propios; el parser lo reconoce', () => {
  const c = camposDeCrm({ ...ana, grupo: 'ex_cliente' })!
  const p = personaDesdeCampos(c, 'c1')
  assert.equal(p.names[0].givenName, '⚪ Ana', 'el ⏰ es solo de clientes')
  assert.deepEqual(p.organizations, [{ name: 'Grupo ASegura', title: 'Ex cliente' }])
  assert.deepEqual(quitarPrefijo('⚪️💶 Ana'), { nombre: 'Ana', grupo: 'ex_cliente', aviso: false, alerta: 'recibo' })
})

test('nota: importes en español, null ≠ 0€, ordenada; ex-cliente con su baja', () => {
  const l = lineasEstado({
    siniestros: [{ numero: 'S-9', estado: 'en_tramitacion' }],
    recibos: [{ importe: 2162.49, ramo: 'hogar', compania: 'Mapfre' }, { importe: null, ramo: 'auto', compania: null }],
  })
  assert.equal(l[0], '🚨 Siniestro S-9 · en tramitación')
  assert.ok(l.some((x) => x.includes('2.162,49€')), l.join('|'))
  assert.ok(l.some((x) => x.includes('importe no consta')), 'un importe ilegible no es 0€')
  assert.ok(!l.some((x) => x.includes('0,00€')))
  assert.equal(notaExCliente({ baja: '2026-05-31', compania: 'Allianz' }), 'Ex cliente: baja 05/2026, Allianz')
  assert.equal(notaExCliente({ baja: null, compania: null }), 'Ex cliente: baja (fecha no consta), compañía sin identificar')
  assert.equal(conLineasEstado('Pólizas en vigor: ninguna', []), 'Pólizas en vigor: ninguna')
  const orden1 = lineasEstado({ siniestros: [{ numero: 'B', estado: 'abierto' }, { numero: 'A', estado: 'abierto' }], recibos: [] })
  const orden2 = lineasEstado({ siniestros: [{ numero: 'A', estado: 'abierto' }, { numero: 'B', estado: 'abierto' }], recibos: [] })
  assert.deepEqual(orden1, orden2)
})

test('🪤 alguien quita el 🚨 a mano en Google → se repone sin encolar (el estado es derivado, no de Alberto)', () => {
  const crm = { ...ana, alerta: 'siniestro' as const }
  // Google: escrito con 💶 y luego tocado a mano (sin emoji de estado) → distinto del CRM y de lo enviado.
  const g = escrito({ ...ana, aviso: false })
  const p = planificarSync(entrada({ crm: [crm], google: [g], vinculos: [vinculo({ ...ana, alerta: 'recibo' })] }))
  assert.equal(p.actualizar.length, 1)
  assert.equal(p.actualizar[0].persona.names[0].givenName, '🟢🚨 Ana')
  assert.equal(p.revisiones.length, 0, JSON.stringify(p.revisiones))
})
