// Guardián del lector de «Módulos del portal» de la ficha (`apps/plataforma/lib/portal-modulos-asegura.ts`). Puro.
// Protege: ilegible ≠ «sin módulos»; solo un `true` explícito habilita el botón; «ok» solo si asegura confirma.
import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarModulos, notaModulo, textoEscritura } from '../apps/plataforma/lib/portal-modulos-asegura.ts'

const m = (o: Record<string, unknown> = {}) => ({
  id: 'alquileres', nombre: 'Patrimonio y alquileres', descripcion: 'x', estado: 'inactivo',
  puedeActivar: true, motivoNoActivar: null, puedeRetirar: false, ...o,
})

test('respuesta buena: se lee tal cual', () => {
  const r = interpretarModulos(200, { estado: 'ok', modulos: [m()] })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.modulos[0]!.puedeActivar, true)
})

test('puedeActivar ausente o "true" en texto NO habilita el botón', () => {
  const r = interpretarModulos(200, { estado: 'ok', modulos: [m({ puedeActivar: 'true' }), m({ id: 'flota', puedeActivar: undefined })] })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.deepEqual(r.modulos.map((x) => x.puedeActivar), [false, false])
})

test('lo ilegible o fallido es error, nunca lista vacía', () => {
  for (const [s, j] of [[200, null], [200, { estado: 'ok' }], [200, { estado: 'ok', modulos: [{ id: 'a' }] }], [200, { estado: 'ok', modulos: [m({ estado: 'raro' })] }], [500, { estado: 'error', causa: 'permisos' }]] as const) {
    assert.equal(interpretarModulos(s, j).estado, 'error')
  }
  assert.equal(interpretarModulos(401, {}).estado, 'error')
  assert.equal(interpretarModulos(404, {}).estado, 'no_encontrado')
  assert.equal(interpretarModulos(503, { estado: 'sin_configurar' }).estado, 'sin_configurar')
})

test('escritura: ok solo con 200 + estado ok; el 409 enseña el motivo de asegura', () => {
  assert.deepEqual(textoEscritura(200, { estado: 'ok', cambios: 1 }, 'activar', 'Flota'), { ok: true, texto: '«Flota» activado.' })
  assert.match(textoEscritura(200, { estado: 'ok', cambios: 0 }, 'retirar', 'Flota').texto, /ya estaba retirado/)
  const c = textoEscritura(409, { estado: 'no_permitido', motivo: 'Solo con póliza en vigor.' }, 'activar', 'Patrimonio')
  assert.deepEqual(c, { ok: false, texto: 'Solo con póliza en vigor.' })
  assert.equal(textoEscritura(200, { estado: 'error' }, 'activar', 'x').ok, false)
  assert.match(textoEscritura(500, { estado: 'error', causa: 'permisos' }, 'activar', 'x').texto, /2026-10-24_portal_modulos_operador/)
})

test('nota de Patrimonio (27/10/2026): dice que va ligado al email de entrada, que avise si cambia y que puede tener más; el resto sin nota', () => {
  const n = notaModulo('alquileres') ?? ''
  assert.match(n, /email con el que el cliente entra/)
  assert.match(n, /cambia de email tiene que avisar/)
  assert.match(n, /más emails en su ficha/)
  assert.match(n, /póliza en vigor en CIMA/)
  assert.equal(notaModulo('flota'), null)
  assert.equal(notaModulo('rrhh'), null)
})
