import test from 'node:test'
import assert from 'node:assert/strict'

import { enlaceFicha, enmascararPoliza, mensajeBajaSolicitada } from './aviso-baja-solicitada.ts'

const c = { polizaId: 'p-1', compania: 'MAPFRE', numeroPoliza: '3021700291186', motivo: 'precio', motivoTexto: 'competidor: AXA · precio_ofrecido: 123,45€', liberaSolaAt: '2026-10-07T10:00:00.000Z' }

test('🚨 el número de póliza va enmascarado, nunca entero', () => {
  assert.equal(enmascararPoliza('3021700291186'), '•••186')
  assert.equal(enmascararPoliza(null), null)
  const m = mensajeBajaSolicitada(c, null)
  assert.ok(!m.includes('3021700291186'), m)
  assert.match(m, /MAPFRE · nº •••186/)
})

test('dice motivo, el texto del cliente (compañía y precio ofrecido) y cuándo se libera sola; con enlace si hay PLATAFORMA_URL https', () => {
  const m = mensajeBajaSolicitada(c, enlaceFicha('p-1', 'https://plataforma.example/'))
  assert.match(m, /Motivo: precio\./)
  assert.match(m, /competidor: AXA · precio_ofrecido: 123,45€/)
  assert.match(m, /se libera sola el 07\/10\/2026 a las 12:00/)
  assert.match(m, /https:\/\/plataforma\.example\/correduria\/poliza\/p-1/)
  assert.equal(enlaceFicha('p-1', 'http://inseguro'), null, 'sin https no se inventa enlace')
  assert.match(mensajeBajaSolicitada(c, null), /Míralo en \/correduria/)
})

test('no lleva nombre ni correo; el texto libre se escapa (Telegram va en HTML); efecto inminente lo dice', () => {
  const m = mensajeBajaSolicitada({ ...c, motivo: 'otro', motivoTexto: '<b>hola</b> & adiós', liberaSolaAt: null }, null)
  assert.ok(!m.includes('<b>') && m.includes('&lt;b&gt;hola&lt;/b&gt; &amp; adiós'), m)
  assert.match(m, /inminente/)
  assert.ok(!/@|nombre/i.test(m))
})
