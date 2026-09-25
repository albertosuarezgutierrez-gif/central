// Avisos push de CIMA en el portal del cliente (25/09/2026). Los cepos que no caben en el test del
// módulo puro porque cruzan ficheros: el SQL, el cron y la pantalla.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { TIPOS_AVISO_CIMA, TIPO_SEMILLA } from '../packages/module-seguros-portal/src/avisos-cima.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SQL = 'apps/asegura-portal/prisma/sql/2026-09-25_c_portal_avisos_cima.sql'

function checkDe(tabla: string): string[] {
  const bloque = leer(SQL).split('CREATE TABLE').find((b) => b.startsWith(` IF NOT EXISTS seguros.${tabla} `))
  assert.ok(bloque, `no está la tabla ${tabla}`)
  const m = bloque.match(/tipo\s+text NOT NULL CHECK \(tipo IN \(([^)]*)\)\)/)
  assert.ok(m, `${tabla}.tipo sin CHECK`)
  return m[1].split(',').map((v) => v.trim().replace(/'/g, '')).sort()
}

test('🚨 los CHECK de la BD son la MISMA lista que TIPOS_AVISO_CIMA', () => {
  // Si divergen, el POST de preferencias o el sello del cron mueren con un 23514
  // DESPUÉS de haber enviado la notificación: se repetiría cada día.
  assert.deepEqual(checkDe('portal_aviso_silenciado'), [...TIPOS_AVISO_CIMA].sort())
  assert.deepEqual(checkDe('portal_aviso_cima'), [...TIPOS_AVISO_CIMA, TIPO_SEMILLA].sort())
})

test('🔒 el texto del aviso no usa el tipo de siniestro (sale en la pantalla de bloqueo)', () => {
  const src = sinComentarios(leer('packages/module-seguros-portal/src/avisos-cima.ts'))
  assert.ok(!/tipoLegible/.test(src), 'avisos-cima.ts lee tipoLegible')
  const cron = sinComentarios(leer('apps/asegura-portal/app/api/cron/avisos-cima/route.ts'))
  assert.ok(!/tipoLegible/.test(cron), 'el cron pasa tipoLegible al módulo')
})

test('🔒 las pólizas ajenas solo se avisan con «Acceso total», y el aviso se anota como uso', () => {
  const cron = sinComentarios(leer('apps/asegura-portal/app/api/cron/avisos-cima/route.ts'))
  assert.match(cron, /cartera\.autorizadas\.filter\(conAccesoTotal\)/)
  assert.match(cron, /alcances\.includes\('total'\)/)
  assert.match(cron, /registrarUso\(identidadId/)
})

test('la pantalla ofrece exactamente los tipos que existen', () => {
  const ui = leer('apps/asegura-portal/app/ActivarPush.tsx')
  const enUi = [...ui.matchAll(/\{ tipo: '([a-z_]+)', texto:/g)].map((m) => m[1]).sort()
  assert.deepEqual(enUi, [...TIPOS_AVISO_CIMA].sort())
})
