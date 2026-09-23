import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirRetencion } from './retencion-fuga.ts'

const base = { tipo: 'POLIZA_ANULA_AL_VENCIMIENTO', ramo: 'auto', compania: 'MAPFRE', numeroPoliza: '123', vencimiento: '2026-10-23', hoy: '2026-09-23' }

test('anula al vencimiento con tiempo por delante abre retención con el plazo', () => {
  const d = decidirRetencion(base)
  assert.equal(d.abrir, true)
  if (d.abrir) {
    assert.equal(d.diasRestantes, 30)
    assert.match(d.texto, /auto MAPFRE nº 123/)
    assert.match(d.texto, /vence el 23\/10\/2026 \(quedan 30 días\)/)
  }
})

test('una baja o desaparición no abre nada: ya no hay a quién retener', () => {
  assert.deepEqual(decidirRetencion({ ...base, tipo: 'POLIZA_BAJA' }), { abrir: false, motivo: 'no_es_anulacion' })
  assert.deepEqual(decidirRetencion({ ...base, tipo: 'POLIZA_DESAPARECIDA' }), { abrir: false, motivo: 'no_es_anulacion' })
})

test('ya vencida no abre; vence hoy sí; sin fecha abre y lo dice (NULL no es «vencida»)', () => {
  assert.deepEqual(decidirRetencion({ ...base, vencimiento: '2026-09-22' }), { abrir: false, motivo: 'ya_vencida' })
  const hoy = decidirRetencion({ ...base, vencimiento: '2026-09-23' })
  assert.ok(hoy.abrir && /\(hoy\)/.test(hoy.texto))
  const sinFecha = decidirRetencion({ ...base, vencimiento: null })
  assert.ok(sinFecha.abrir && sinFecha.diasRestantes === null && /sin fecha de vencimiento/.test(sinFecha.texto))
})
