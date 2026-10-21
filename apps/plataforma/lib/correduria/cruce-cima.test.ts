import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVISOS_POR_MENSAJE, componerAvisosCruce, interpretarCruce } from './cruce-cima.ts'

// F1 del agente corredor de correo (21/10/2026): avisos de cruce correo ↔ CIMA. Ids y textos inventados.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aviso = (n: number, o: Record<string, unknown> = {}) => ({ id: id(n), tipo: 'emision_sin_cima', texto: `📭 Occident … póliza 54000000${n}`, clienteId: null, ...o })

test('🪤 error del puerto ≠ «nada que avisar»; sin_migracion se dice; ok vacío = comprobado', () => {
  assert.deepEqual(interpretarCruce(500, { estado: 'error' }), { estado: 'error', motivo: 'respuesta 500' })
  assert.equal(interpretarCruce(502, null).estado, 'error')
  assert.equal(interpretarCruce(503, { estado: 'sin_migracion' }).estado, 'sin_migracion')
  assert.equal(interpretarCruce(200, { estado: 'ok' }).estado, 'error')
  const ok = interpretarCruce(200, { estado: 'ok', nuevos: 0, pendientes: [] })
  assert.deepEqual(ok, { estado: 'ok', avisos: [], nuevos: 0, descartados: 0 })
})

test('avisos sin forma se descartan y se CUENTAN; tipo desconocido tampoco pasa', () => {
  const l = interpretarCruce(200, { estado: 'ok', nuevos: 2, pendientes: [aviso(1), { id: 'x' }, aviso(2, { tipo: 'otro' })] })
  assert.ok(l.estado === 'ok')
  if (l.estado !== 'ok') return
  assert.equal(l.avisos.length, 1)
  assert.equal(l.descartados, 2)
})

test('componer: lotes de 8, HTML escapado, enlace a la ficha solo si hay cliente; cada lote lleva SUS ids', () => {
  const avisos = Array.from({ length: AVISOS_POR_MENSAJE + 2 }, (_, i) => ({ ...aviso(i), tipo: 'emision_sin_cima' as const, texto: i === 0 ? 'a <b> & c' : `t${i}`, clienteId: i === 1 ? id(99) : null }))
  const m = componerAvisosCruce(avisos, (c) => `https://x/correduria/cliente/${c}`)
  assert.equal(m.length, 2)
  assert.equal(m[0].ids.length, AVISOS_POR_MENSAJE)
  assert.equal(m[1].ids.length, 2)
  assert.match(m[0].texto, /a &lt;b&gt; &amp; c/)
  assert.equal((m[0].texto.match(/Ver ficha/g) ?? []).length, 1)
  assert.match(m[0].texto, /\(1\/2\)/)
})
