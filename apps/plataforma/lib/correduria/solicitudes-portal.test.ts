import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { fechaSolicitud, interpretarSolicitudesPortal, leerSolicitud, textoResultadoAccion } from './solicitudes-portal.ts'

const fila = (p: Record<string, unknown> = {}) => ({
  id: 'm1', modulo: 'alquileres', estado: 'solicitado', solicitado_en: '2026-10-25T09:00:00.000Z', nombre: 'ana',
  cliente_id: 'c1', cliente: 'Ana Pérez', moduloNombre: 'Patrimonio y alquileres', puedeActivar: true, motivoNoActivar: null, ...p,
})
const ok = (filas: unknown[]) => ({ estado: 'ok', filas })

test('lista vacía de verdad ≠ error ≠ sin configurar', () => {
  assert.deepEqual(interpretarSolicitudesPortal(200, ok([])), { estado: 'ok', solicitudes: [] })
  assert.equal(interpretarSolicitudesPortal(200, { estado: 'error', causa: 'esquema' }).estado, 'error')
  assert.equal(interpretarSolicitudesPortal(500, null).estado, 'error')
  assert.equal(interpretarSolicitudesPortal(200, null).estado, 'error')
  assert.equal(interpretarSolicitudesPortal(404, null).estado, 'error')
  assert.equal(interpretarSolicitudesPortal(503, { estado: 'sin_configurar' }).estado, 'sin_configurar')
})

test('mapea la fila a la vista: ficha, módulo legible, fecha y botón', () => {
  const r = interpretarSolicitudesPortal(200, ok([fila()]))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.solicitudes[0], {
    id: 'm1', modulo: 'alquileres', moduloNombre: 'Patrimonio y alquileres', clienteId: 'c1', cliente: 'Ana Pérez', sinFicha: false,
    solicitadoEn: '2026-10-25T09:00:00.000Z', puedeActivar: true, motivoNoActivar: null,
  })
  assert.equal(fechaSolicitud('2026-10-25T09:00:00.000Z'), '25/10/2026')
})

test('no se puede activar: el motivo viaja; sin motivo la fila es ilegible', () => {
  const s = leerSolicitud(fila({ puedeActivar: false, motivoNoActivar: 'Sin póliza en vigor.' }))
  assert.equal(s?.puedeActivar, false)
  assert.equal(s?.motivoNoActivar, 'Sin póliza en vigor.')
  assert.equal(leerSolicitud(fila({ puedeActivar: false, motivoNoActivar: null })), null)
})

test('sin ficha: usa lo tecleado, no enlaza y se marca', () => {
  const s = leerSolicitud(fila({ cliente_id: null, cliente: null, puedeActivar: false, motivoNoActivar: 'Sin ficha.' }))
  assert.equal(s?.sinFicha, true)
  assert.equal(s?.clienteId, null)
  assert.equal(s?.cliente, 'ana')
})

test('una fila incompleta o un puerto viejo (sin puedeActivar) hace error, no lista vacía', () => {
  const vieja: Record<string, unknown> = fila()
  delete vieja.puedeActivar
  assert.equal(interpretarSolicitudesPortal(200, ok([fila(), vieja])).estado, 'error')
  assert.equal(interpretarSolicitudesPortal(200, ok([fila({ id: '' })])).estado, 'error')
})

test('solo entran las solicitadas', () => {
  const r = interpretarSolicitudesPortal(200, ok([fila(), fila({ id: 'm2', estado: 'activo' })]))
  assert.equal(r.estado === 'ok' && r.solicitudes.length, 1)
})

test('textoResultadoAccion: no dice «hecho» si no se sabe', () => {
  assert.deepEqual(textoResultadoAccion('activar', 200, { estado: 'ok' }), { ok: true, texto: 'Activado.' })
  assert.deepEqual(textoResultadoAccion('retirar', 200, { estado: 'ok' }), { ok: true, texto: 'Rechazada.' })
  const r = textoResultadoAccion('activar', 409, { estado: 'no_permitido', motivo: 'Sin póliza.' })
  assert.ok(!r.ok && /NO se ha activado: Sin póliza/.test(r.texto))
  assert.ok(!textoResultadoAccion('retirar', 502, null).ok)
})

test('el proxy de plataforma es de solo lectura: ni POST/PUT/PATCH/DELETE', () => {
  const src = readFileSync(new URL('../../app/api/correduria/solicitudes-portal/route.ts', import.meta.url), 'utf8')
  assert.match(src, /export async function GET\b/)
  assert.doesNotMatch(src, /export\s+(async\s+)?(function|const)\s+(POST|PUT|PATCH|DELETE)\b/)
  assert.doesNotMatch(src, /method:\s*['"](POST|PUT|PATCH|DELETE)/)
  assert.match(src, /exigirCorreduria/)
})
