// «Avisarme cuando vaya a caducar mi carné» (21/10/2026): el interruptor, su SQL y quién lo respeta.
// Las reglas puras tienen sus tests junto al código; esto vigila el CABLEADO entre ficheros.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { TIPOS_AVISO_CIMA, TIPOS_AVISO_INTERRUPTOR, TIPO_AVISO_VENCIMIENTO_CARNET } from '../packages/module-seguros-portal/src/avisos-cima.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const SQL = leer('apps/asegura-portal/prisma/sql/2026-10-21_aviso_vencimiento_carnet.sql').replace(/--.*$/gm, '')

test('🚨 el carné NO está en TIPOS_AVISO_CIMA (el cron no lo sella) pero SÍ en la lista del interruptor', () => {
  assert.equal((TIPOS_AVISO_CIMA as readonly string[]).includes(TIPO_AVISO_VENCIMIENTO_CARNET), false)
  assert.deepEqual([...TIPOS_AVISO_INTERRUPTOR], [...TIPOS_AVISO_CIMA, TIPO_AVISO_VENCIMIENTO_CARNET])
})

test('🚨 el CHECK de portal_aviso_silenciado del SQL nuevo es EXACTAMENTE la lista del interruptor, y no toca el sello del cron', () => {
  const m = /ADD CONSTRAINT portal_aviso_silenciado_tipo_check\s+CHECK \(tipo IN \(([^)]*)\)\)/.exec(SQL)
  assert.ok(m, 'el SQL no amplía el CHECK del interruptor')
  const lista = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()
  assert.deepEqual(lista, [...TIPOS_AVISO_INTERRUPTOR].sort())
  assert.doesNotMatch(SQL, /portal_aviso_cima/)
  assert.match(SQL, /BEGIN;[\s\S]*COMMIT;/)
})

test('la ruta de preferencias acepta el tipo nuevo y dice 503 si no se pudo guardar (no finge)', () => {
  const r = sinComentarios(leer('apps/asegura-portal/app/api/push/preferencias/route.ts'))
  assert.match(r, /z\.enum\(TIPOS_AVISO_INTERRUPTOR\)/)
  assert.match(r, /no_guardado/)
  assert.match(r, /status: 503/)
})

test('🚨 la campana pasa el interruptor a avisosDe; si no se lee, NO lo apaga (se avisa)', () => {
  const r = sinComentarios(leer('apps/asegura-portal/app/api/avisos/route.ts'))
  assert.match(r, /avisoCarnetSilenciado\(identidad\.id\)/)
  assert.match(r, /carnetsSilenciados: carnetSilenciado\.status === 'fulfilled' \? carnetSilenciado\.value : false/)
})

test('la lectura del interruptor va acotada por la identidad de la cookie', () => {
  const r = sinComentarios(leer('apps/asegura-portal/lib/avisos-preferencias.ts'))
  assert.match(r, /identidadId_tipo: \{ identidadId, tipo: TIPO_AVISO_VENCIMIENTO_CARNET \}/)
})

test('el mismo componente de interruptor sale en «Mis carnés» y en «Configuración → Avisos»', () => {
  for (const f of ['apps/asegura-portal/app/(portal)/boveda/MisCarnets.tsx', 'apps/asegura-portal/app/(portal)/configuracion/AjustesAvisos.tsx']) {
    assert.match(sinComentarios(leer(f)), /<InterruptorAvisoCarnet \/>/, f)
  }
  assert.match(leer('apps/asegura-portal/app/InterruptorAvisoCarnet.tsx'), /Avisarme cuando vaya a caducar mi carné de conducir/)
})

test('🔒 la expedición cruza el puente solo con el conjunto de fichas permitido (y la nacimiento, nunca)', () => {
  const t = sinComentarios(leer('apps/asegura/lib/carnets-titulares.ts'))
  assert.match(t, /fichasConExpedicion: ReadonlySet<string> = new Set\(\)/)
  const p = sinComentarios(leer('apps/asegura/lib/carnets-portal.ts'))
  assert.match(p, /agruparCarnetsPorTitular\([\s\S]*?calculados,\s*conExpedicion,\s*\)/)
  assert.doesNotMatch(sinComentarios(leer('apps/asegura/lib/carnets-titulares.ts')), /nacimiento/i) // el agrupador de lo que cruza ni conoce el nacimiento
})
