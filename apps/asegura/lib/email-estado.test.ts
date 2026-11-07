// Cepo del estado del email y de rebote ≠ baja (07/11/2026). Fechas RELATIVAS a hoy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accionPorEvento, contactabilidad, emailBloqueado, estadoEmail, estadoTelefonos, reboteEsDeLaFicha, telefonoUtilizable } from './email-estado.ts'
import { destinatarioDeCliente } from './avisos-vencimiento-reglas.ts'

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000)
const base = { optOutAt: null, rebotadoAt: null, eventos: [], entroPortal: false } as const

test('sin eventos ni portal, leído todo: «sin comprobar», nunca «válido»', () => {
  assert.equal(estadoEmail(base), 'sin_comprobar')
})

test('null = no se pudo mirar: no se afirma nada (ni sin comprobar)', () => {
  assert.equal(estadoEmail({ ...base, eventos: null }), null)
  assert.equal(estadoEmail({ ...base, entroPortal: null }), null)
})

test('la baja manda sobre todo, también sobre un clic', () => {
  assert.equal(estadoEmail({ ...base, optOutAt: hace(1), eventos: [{ tipo: 'email.clicked', en: hace(2) }] }), 'baja')
})

test('la marca de rebote manda sobre la entrada al portal', () => {
  assert.equal(estadoEmail({ ...base, rebotadoAt: hace(1), entroPortal: true }), 'rebotado')
})

test('un rebote sin marca (webhook caído) también se pinta como rebotado', () => {
  assert.equal(estadoEmail({ ...base, eventos: [{ tipo: 'email.delivered', en: hace(10) }, { tipo: 'email.bounced', en: hace(3) }] }), 'rebotado')
})

test('una entrega POSTERIOR al rebote lo supera', () => {
  assert.equal(estadoEmail({ ...base, eventos: [{ tipo: 'email.bounced', en: hace(10) }, { tipo: 'email.delivered', en: hace(2) }] }), 'entregado')
})

test('queja = baja aunque no se escribiera la baja', () => {
  assert.equal(estadoEmail({ ...base, eventos: [{ tipo: 'email.delivered', en: hace(2) }, { tipo: 'email.complained', en: hace(1) }] }), 'baja')
})

test('escalera: entregado < abierto < entró al portal', () => {
  assert.equal(estadoEmail({ ...base, eventos: [{ tipo: 'email.delivered', en: hace(2) }] }), 'entregado')
  assert.equal(estadoEmail({ ...base, eventos: [{ tipo: 'email.delivered', en: hace(2) }, { tipo: 'email.clicked', en: hace(1) }] }), 'abierto')
  assert.equal(estadoEmail({ ...base, eventos: [{ tipo: 'email.delivered', en: hace(2) }], entroPortal: true }), 'entro_portal')
})

test('rebote duro y supresión marcan; transitorio no; queja es baja; el resto, nada', () => {
  assert.deepEqual(accionPorEvento('email.bounced', { tipoRebote: 'Permanent', subtipoRebote: 'General' }), { accion: 'marcar_rebote', motivo: 'rebote:General' })
  assert.deepEqual(accionPorEvento('email.bounced', {}), { accion: 'marcar_rebote', motivo: 'rebote' })
  assert.equal(accionPorEvento('email.bounced', { tipoRebote: 'Transient' }), null)
  assert.deepEqual(accionPorEvento('email.suppressed'), { accion: 'marcar_rebote', motivo: 'suprimido' })
  assert.deepEqual(accionPorEvento('email.complained'), { accion: 'baja' })
  assert.equal(accionPorEvento('email.delivered'), null)
})

test('el motivo nunca lleva el texto del servidor remoto (puede traer la dirección)', () => {
  const a = accionPorEvento('email.bounced', { subtipoRebote: '550 <ana@x.es> no existe', motivo: 'ana@x.es unknown' })
  assert.deepEqual(a, { accion: 'marcar_rebote', motivo: 'rebote' })
})

test('rebote de una dirección que la ficha ya no tiene: no se marca', () => {
  assert.equal(reboteEsDeLaFicha('h-vieja', ['h-nueva', null]), false)
  assert.equal(reboteEsDeLaFicha('h-nueva', ['h-nueva']), true)
  assert.equal(reboteEsDeLaFicha(null, ['h-nueva']), true)
})

test('baja y rebote bloquean igual', () => {
  assert.equal(emailBloqueado({ emailOptOutAt: null, emailRebotadoAt: null }), false)
  assert.equal(emailBloqueado({ emailOptOutAt: hace(1), emailRebotadoAt: null }), true)
  assert.equal(emailBloqueado({ emailOptOutAt: null, emailRebotadoAt: hace(1) }), true)
})

test('destinatarioDeCliente se salta un email rebotado igual que una baja', () => {
  const ficha = { emailOptOutAt: null, emailRebotadoAt: null, email: 'ana@ejemplo.es', emails: [] }
  assert.equal(destinatarioDeCliente(ficha), 'ana@ejemplo.es')
  assert.equal(destinatarioDeCliente({ ...ficha, emailRebotadoAt: hace(1) }), null)
  assert.equal(destinatarioDeCliente({ ...ficha, emailOptOutAt: hace(1) }), null)
})

// ─── Contactabilidad ─────────────────────────────────────────────────────────

test('ilocalizable = email malo (rebotado o sin email) Y teléfono revisado y vacío', () => {
  assert.equal(contactabilidad('rebotado', 'vacio'), 'ilocalizable')
  assert.equal(contactabilidad('sin_email', 'vacio'), 'ilocalizable')
})

test('un rebote con móvil bueno es localizable: el rebote no da de baja', () => {
  assert.equal(contactabilidad('rebotado', 'utilizable'), 'localizable')
})

test('teléfono que no consta (null) = pendiente, nunca se afirma ilocalizable', () => {
  assert.equal(contactabilidad('rebotado', null), 'pendiente')
  assert.equal(contactabilidad(null, 'vacio'), 'pendiente')
})

test('la baja sin teléfono no es «ilocalizable»: es su decisión', () => {
  assert.equal(contactabilidad('baja', 'vacio'), 'no_aplica')
})

test('teléfonos: comodín, el de la correduría o corto no valen; ilegible deja pendiente', () => {
  assert.equal(telefonoUtilizable('612 345 678'), true)
  assert.equal(telefonoUtilizable('000000000'), false)
  assert.equal(telefonoUtilizable('+34 637 349 990'), false)
  assert.equal(telefonoUtilizable('12345'), false)
  assert.equal(estadoTelefonos(['000000000', null, '']), 'vacio')
  assert.equal(estadoTelefonos([undefined, null]), null)
  assert.equal(estadoTelefonos([undefined, '612345678']), 'utilizable')
  assert.equal(estadoTelefonos(null), null)
})
