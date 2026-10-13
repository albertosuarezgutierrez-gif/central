import test from 'node:test'
import assert from 'node:assert/strict'
import { estiloAviso, interpretarBanda } from './avisos-banda.ts'

const linea = (o: Record<string, unknown> = {}) => ({
  tipo: 'quejas', nivel: 'urgente', texto: '2 quejas abiertas · plazo 18/10/2026 (5 d)', n: 2, plazo: '2026-10-18', diasRestantes: 5,
  href: '/correduria?s=gestion', ...o,
})

test('banda: una respuesta rota NO es «sin avisos»: es error y se dice', () => {
  for (const [st, j] of [[500, { estado: 'error' }], [200, null], [200, { estado: 'ok' }], [200, { estado: 'ok', avisos: 'x' }], [401, {}], [500, { estado: 'ok', avisos: [] }], [200, { estado: 'error', avisos: [] }]] as const) {
    assert.equal(interpretarBanda(st, j).estado, 'error', `${st} ${JSON.stringify(j)}`)
  }
})

test('banda: lista vacía con ok = comprobado y nada pendiente', () => {
  assert.deepEqual(interpretarBanda(200, { estado: 'ok', hoy: '2026-10-13', avisos: [] }), { estado: 'ok', avisos: [], descartados: 0 })
})

test('banda: «no comprobado» sobrevive y se cuenta lo que no tiene forma (no se pinta a ciegas)', () => {
  const r = interpretarBanda(200, {
    estado: 'ok',
    avisos: [
      linea(), linea({ tipo: 'partes', nivel: 'no_comprobado', texto: 'No se han podido comprobar los partes del portal', n: null, plazo: null, diasRestantes: null }),
      linea({ nivel: 'raro' }), linea({ href: 'https://malo.example' }), linea({ href: '//malo.example' }), linea({ texto: '  ' }), 7,
    ],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.avisos.map(a => a.nivel), ['urgente', 'no_comprobado'])
  assert.equal(r.avisos[1].n, null)
  assert.equal(r.descartados, 5)
})

test('estilo: urgente rojo, no comprobado ámbar, aviso neutro (solo tokens)', () => {
  assert.equal(estiloAviso('urgente').color, 'var(--negative)')
  assert.equal(estiloAviso('no_comprobado').color, 'var(--warning)')
  assert.ok(!/#/.test(JSON.stringify([estiloAviso('aviso'), estiloAviso('urgente'), estiloAviso('no_comprobado')])))
})
