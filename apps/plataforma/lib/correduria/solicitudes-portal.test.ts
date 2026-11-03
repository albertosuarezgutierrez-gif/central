import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { confirmacionProspecto, cuerpoAccion, fechaSolicitud, interpretarSolicitudesPortal, leerSolicitud, textoResultadoAccion } from './solicitudes-portal.ts'

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
    id: 'm1', modulo: 'alquileres', moduloNombre: 'Patrimonio y alquileres', clienteId: 'c1', identidadId: null, creaProspecto: false,
    cliente: 'Ana Pérez', sinFicha: false, solicitadoEn: '2026-10-25T09:00:00.000Z', puedeActivar: true, motivoNoActivar: null,
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

// 27/10/2026 (Alberto): una petición SIN ficha se puede activar; asegura crea una ficha de prospecto. El botón solo se
// enciende si el puerto dice `creaProspecto` Y trae la identidad (un puerto viejo, sin eso, deja el botón apagado con motivo).
test('🚨 sin ficha + creaProspecto: activable por identidad; sin identidad o puerto viejo, no', () => {
  const s = leerSolicitud(fila({ cliente_id: null, cliente: null, identidad_id: 'i1', creaProspecto: true, puedeActivar: true }))
  assert.deepEqual([s?.puedeActivar, s?.creaProspecto, s?.identidadId, s?.sinFicha], [true, true, 'i1', true])
  assert.equal(leerSolicitud(fila({ cliente_id: null, identidad_id: null, creaProspecto: true, puedeActivar: true })), null)
  const vieja = leerSolicitud(fila({ cliente_id: null, identidad_id: 'i1', puedeActivar: true }))
  assert.deepEqual([vieja?.puedeActivar, vieja?.creaProspecto], [false, false])
  assert.match(vieja?.motivoNoActivar ?? '', /Sin ficha vinculada/)
  // Con ficha, `creaProspecto` no aplica aunque el puerto lo mande.
  assert.equal(leerSolicitud(fila({ identidad_id: 'i1', creaProspecto: true }))?.creaProspecto, false)
  const sm = textoResultadoAccion('activar', 503, { estado: 'sin_migracion' })
  assert.ok(!sm.ok && /2026-10-27_portal_acceso_por_autorizacion/.test(sm.texto))
})

test('🚨 cuerpo del POST: con ficha por clienteId; sin ficha SOLO activar y por identidadId; nunca rechazar sin ficha', () => {
  const conFicha = leerSolicitud(fila())!
  assert.deepEqual(cuerpoAccion(conFicha, 'activar'), { clienteId: 'c1', modulo: 'alquileres', accion: 'activar' })
  assert.equal(confirmacionProspecto(conFicha, 'activar'), null)
  const sin = leerSolicitud(fila({ cliente_id: null, cliente: null, identidad_id: 'i1', creaProspecto: true }))!
  assert.deepEqual(cuerpoAccion(sin, 'activar'), { identidadId: 'i1', modulo: 'alquileres', accion: 'activar' })
  assert.equal(cuerpoAccion(sin, 'retirar'), null)
  assert.match(confirmacionProspecto(sin, 'activar') ?? '', /ficha de PROSPECTO.*no cuenta como cliente/)
  const vieja = leerSolicitud(fila({ cliente_id: null, identidad_id: 'i1' }))!
  assert.equal(cuerpoAccion(vieja, 'activar'), null)
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
