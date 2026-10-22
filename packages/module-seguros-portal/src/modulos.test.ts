import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CATALOGO_MODULOS,
  ESTADOS_MODULO,
  MODULOS_PORTAL,
  accionModulo,
  admiteSolicitud,
  disponibilidadModulo,
  esModuloPortal,
  mensajeSolicitudModulo,
  tarjetasModulos,
} from './modulos.ts'

const HOY = new Date()

test('el catálogo es cerrado y coincide con el CHECK del SQL', () => {
  const sql = readFileSync(
    new URL('../../../apps/asegura-portal/prisma/sql/2026-10-22_portal_modulos.sql', import.meta.url),
    'utf8',
  ).replace(/--.*$/gm, '')
  const enCheck = (re: RegExp) => [...(sql.match(re)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual(enCheck(/modulo\s+IN\s*\(([^)]*)\)/i), [...MODULOS_PORTAL])
  assert.deepEqual(enCheck(/estado\s+IN\s*\(([^)]*)\)/i), [...ESTADOS_MODULO])
  for (const id of MODULOS_PORTAL) assert.equal(CATALOGO_MODULOS[id].id, id)
})

test('el rol del portal no puede escribir el estado ni el origen (no se autoactiva)', () => {
  const sql = readFileSync(
    new URL('../../../apps/asegura-portal/prisma/sql/2026-10-22_portal_modulos.sql', import.meta.url),
    'utf8',
  ).replace(/--.*$/gm, '')
  const insert = sql.match(/GRANT INSERT \(([^)]*)\)\s+ON seguros\.portal_modulo TO prisma_asegura_portal/)
  assert.ok(insert, 'falta el GRANT INSERT por columnas')
  const cols = insert[1].split(',').map((c) => c.trim())
  assert.ok(!cols.includes('estado') && !cols.includes('origen') && !cols.includes('activado_en'))
  assert.doesNotMatch(sql, /GRANT (UPDATE|DELETE|ALL)[^;]*ON seguros\.portal_modulo TO prisma_asegura_portal/)
})

test('esModuloPortal solo admite ids del catálogo', () => {
  assert.equal(esModuloPortal('flota'), true)
  assert.equal(esModuloPortal('contabilidad'), false)
  assert.equal(esModuloPortal(null), false)
  assert.equal(esModuloPortal({}), false)
})

test('disponibilidad: flota según el acceso, RRHH bajo solicitud, alquileres próximamente', () => {
  assert.equal(disponibilidadModulo('flota', { accesoFlota: true }), 'disponible')
  assert.equal(disponibilidadModulo('flota', { accesoFlota: false }), 'bajo_solicitud')
  assert.equal(disponibilidadModulo('flota', { accesoFlota: null }), null)
  assert.equal(disponibilidadModulo('rrhh', { accesoFlota: true }), 'bajo_solicitud')
  assert.equal(disponibilidadModulo('alquileres', { accesoFlota: true }), 'proximamente')
})

test('flota con acceso se ABRE aunque no haya fila (ni lectura de filas)', () => {
  assert.deepEqual(accionModulo('flota', { accesoFlota: true, filas: [] }), { tipo: 'abrir', href: '/flota' })
  assert.deepEqual(accionModulo('flota', { accesoFlota: true, filas: null }), { tipo: 'abrir', href: '/flota' })
})

test('sin poder mirar (null) no se ofrece Solicitar: «sin comprobar», nunca «no tienes»', () => {
  assert.equal(accionModulo('flota', { accesoFlota: null, filas: [] }).tipo, 'sin_comprobar')
  assert.equal(accionModulo('rrhh', { accesoFlota: false, filas: null }).tipo, 'sin_comprobar')
  assert.equal(accionModulo('alquileres', { accesoFlota: false, filas: null }).tipo, 'sin_comprobar')
})

test('[] = revisado y sin pedir → Solicitar / Apuntarme', () => {
  assert.equal(accionModulo('rrhh', { accesoFlota: false, filas: [] }).tipo, 'solicitar')
  assert.equal(accionModulo('flota', { accesoFlota: false, filas: [] }).tipo, 'solicitar')
  assert.equal(accionModulo('alquileres', { accesoFlota: false, filas: [] }).tipo, 'apuntarse')
})

test('una fila solicitada se dice con su fecha y ya no admite otra', () => {
  const a = accionModulo('rrhh', { accesoFlota: false, filas: [{ modulo: 'rrhh', estado: 'solicitado', solicitadoEn: HOY }] })
  assert.deepEqual(a, { tipo: 'solicitado', desde: HOY })
  assert.equal(admiteSolicitud(a), false)
})

test('una retirada no bloquea volver a pedirlo; la fila de OTRO módulo no cuenta', () => {
  const filas = [
    { modulo: 'rrhh', estado: 'retirado', solicitadoEn: HOY },
    { modulo: 'alquileres', estado: 'solicitado', solicitadoEn: HOY },
  ]
  assert.equal(accionModulo('rrhh', { accesoFlota: false, filas }).tipo, 'solicitar')
})

test('activo: RRHH no se abre en el portal (sin SSO), lo dice; flota activa se abre', () => {
  const activo = [{ modulo: 'rrhh', estado: 'activo', solicitadoEn: HOY }]
  const a = accionModulo('rrhh', { accesoFlota: false, filas: activo })
  assert.equal(a.tipo, 'activo')
  assert.equal(admiteSolicitud(a), false)
  const f = accionModulo('flota', { accesoFlota: false, filas: [{ modulo: 'flota', estado: 'activo', solicitadoEn: HOY }] })
  assert.deepEqual(f, { tipo: 'abrir', href: '/flota' })
})

test('solo solicitar/apuntarse admiten fila', () => {
  assert.equal(admiteSolicitud({ tipo: 'solicitar' }), true)
  assert.equal(admiteSolicitud({ tipo: 'apuntarse' }), true)
  assert.equal(admiteSolicitud({ tipo: 'abrir', href: '/flota' }), false)
  assert.equal(admiteSolicitud({ tipo: 'sin_comprobar' }), false)
})

test('tarjetas en el orden del catálogo', () => {
  const t = tarjetasModulos({ accesoFlota: false, filas: [] })
  assert.deepEqual(t.map((x) => x.id), ['flota', 'rrhh', 'alquileres'])
})

test('el aviso de Telegram escapa el nombre y dice si está sin vincular', () => {
  const m = mensajeSolicitudModulo({ identidadId: 'i-1', nombre: 'Ana <b>&', vinculada: false, modulo: 'rrhh' })
  assert.ok(m.startsWith('🧰 Ana &lt;b&gt;&amp; (sin vincular a tu cartera) pide el módulo Portal del Empleado.'))
  assert.match(m, /Identidad i-1/)
  const v = mensajeSolicitudModulo({ identidadId: 'i-2', nombre: 'Luis', vinculada: true, modulo: 'alquileres' })
  assert.ok(v.startsWith('🧰 Luis se apunta al módulo Gestión de alquileres.'))
  const sinNombre = mensajeSolicitudModulo({ identidadId: 'i-3', nombre: '  ', vinculada: true, modulo: 'flota' })
  assert.ok(sinNombre.startsWith('🧰 Alguien sin nombre pide el módulo'))
})
