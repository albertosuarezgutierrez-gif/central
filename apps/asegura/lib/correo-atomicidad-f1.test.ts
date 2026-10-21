import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Cepos de atomicidad del F1 del agente de correo (21/10/2026). El SQL se prueba por su forma en el fuente (no hay BD en CI).
const lee = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')

test('asignar a mano una solicitud: la fila se reclama (0 filas = conflicto) ANTES de apuntar la solicitud', () => {
  const src = lee('correo-asignar-bd.ts')
  const rama = src.slice(src.indexOf("d.via === 'solicitud'"), src.indexOf('const resumen = `asignado a mano'))
  const iReclamo = rama.indexOf("estado = 'sin_resolver'")
  const iFijar = rama.indexOf('await fijarSolicitudCompania')
  assert.ok(iReclamo > 0 && iFijar > 0, 'faltan el reclamo o fijarSolicitudCompania')
  assert.ok(iReclamo < iFijar, 'el reclamo atómico debe ir antes de fijarSolicitudCompania')
  assert.match(rama.slice(iReclamo, iFijar), /reclamada === 0\) return \{ ok: false, status: 409/)
})

test('avisos de cruce pendientes: se reclaman con UPDATE … RETURNING y reclamado_at, no con un SELECT', () => {
  const src = lee('correo-cruce-cima-bd.ts')
  const f = src.slice(src.indexOf('async function avisosCrucePendientes'), src.indexOf('const UUID'))
  assert.match(f, /update correo_cruce_aviso set reclamado_at = now\(\)/)
  assert.match(f, /avisado_at is null/)
  assert.match(f, /reclamado_at is null or reclamado_at < now\(\)/)
  assert.match(f, /for update skip locked/)
  assert.match(f, /returning id::text/)
})

test('la columna reclamado_at está en el SQL del F1 y en el schema Prisma', () => {
  assert.match(readFileSync(join(import.meta.dirname, '../prisma/sql/2026-10-21_correo_agente_f1.sql'), 'utf8'), /reclamado_at\s+timestamptz/)
  assert.match(readFileSync(join(import.meta.dirname, '../prisma/asegura.prisma'), 'utf8'), /reclamadoAt\s+DateTime\?\s+@map\("reclamado_at"\)/)
})
