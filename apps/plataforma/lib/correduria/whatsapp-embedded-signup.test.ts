import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faltanParaConectar, leerEventoSignup, opcionesLogin, origenMeta } from './whatsapp-embedded-signup.ts'

const FIN = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '111', phone_number_id: '222', business_id: '333' } }

test('FB.login: code + override + onboarding de la app (Coexistence)', () => {
  const o = opcionesLogin('CFG')
  assert.equal(o.config_id, 'CFG')
  assert.equal(o.response_type, 'code')
  assert.equal(o.override_default_response_type, true)
  assert.equal(o.extras.featureType, 'whatsapp_business_app_onboarding')
  assert.equal(o.extras.sessionInfoVersion, '3')
})

test('solo se aceptan mensajes de facebook.com por https', () => {
  assert.ok(origenMeta('https://www.facebook.com'))
  assert.ok(origenMeta('https://web.facebook.com'))
  assert.ok(!origenMeta('https://facebook.com.evil.es'))
  assert.ok(!origenMeta('http://www.facebook.com'))
  assert.equal(leerEventoSignup('https://evil.es', FIN), null)
})

test('fin del onboarding (objeto o string JSON) → ids', () => {
  const esperado = { tipo: 'fin', wabaId: '111', phoneNumberId: '222', businessId: '333' }
  assert.deepEqual(leerEventoSignup('https://www.facebook.com', FIN), esperado)
  assert.deepEqual(leerEventoSignup('https://www.facebook.com', JSON.stringify(FIN)), esperado)
})

test('sin phone_number_id o con ids raros → error explicado, no se sigue', () => {
  assert.equal(leerEventoSignup('https://www.facebook.com', { ...FIN, data: { waba_id: '111' } })?.tipo, 'error')
  assert.equal(leerEventoSignup('https://www.facebook.com', { ...FIN, data: { waba_id: '1/../x', phone_number_id: '2' } })?.tipo, 'error')
})

test('cancelado y otros tipos', () => {
  assert.deepEqual(leerEventoSignup('https://www.facebook.com', { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE_NUMBER_SETUP' } }), { tipo: 'cancelado', paso: 'PHONE_NUMBER_SETUP' })
  assert.equal(leerEventoSignup('https://www.facebook.com', { type: 'OTRA_COSA' }), null)
  assert.equal(leerEventoSignup('https://www.facebook.com', 'no json'), null)
})

test('qué falta: sin variables la pantalla lo dice (y no rompe)', () => {
  assert.deepEqual(faltanParaConectar({ appId: 'A', configId: 'C', config: { appId: true, appSecret: true, versionGraph: 'v24.0' } }), [])
  const f = faltanParaConectar({ appId: undefined, configId: undefined, config: { appId: false, appSecret: true, versionGraph: null } })
  assert.equal(f.length, 4)
  assert.ok(f.some((x) => x.startsWith('NEXT_PUBLIC_META_APP_ID')))
  assert.ok(f.some((x) => x.startsWith('WHATSAPP_APP_ID')))
  assert.ok(faltanParaConectar({ appId: 'A', configId: 'C', config: null }).length === 1)
  assert.deepEqual(faltanParaConectar({ appId: 'A', configId: 'C', config: { appId: true, appSecret: false, versionGraph: 'v24.0' } }), ['WHATSAPP_APP_SECRET (asegura)'])
})
