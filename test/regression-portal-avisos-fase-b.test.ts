// Avisos fase B del portal (13/10/2026): vencimiento de aportadas, subida de prima y vencimientos de
// pólizas autorizadas. Las reglas tienen sus brazos en `packages/module-seguros-portal/src/avisos-ampliados.test.ts`;
// esto vigila el CABLEADO del cron y el SQL, que un test puro no ve.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { UMBRALES_SUBIDA_PRIMA } from '../packages/module-seguros-portal/src/avisos-ampliados.ts'
import { TIPOS_AVISO_CIMA, TIPO_SEMILLA } from '../packages/module-seguros-portal/src/avisos-cima.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const APP = 'apps/asegura-portal'
const CRON = sinComentarios(leer(`${APP}/app/api/cron/avisos-cima/route.ts`))
const SQL = leer(`${APP}/prisma/sql/2026-10-13_avisos_fase_b.sql`).replace(/--.*$/gm, '')

test('el cron mete los eventos de la fase B en el plan (si no, nunca se mandan ni se silencian)', () => {
  const i = CRON.indexOf('eventosFaseB(identidadId')
  assert.ok(i !== -1, 'el cron no llama a eventosFaseB')
  assert.ok(i < CRON.indexOf('planificarAvisos('), 'eventosFaseB tiene que ir ANTES de planificar (escribe la prima observada)')
  assert.match(CRON, /planificarAvisos\([\s\S]*?modificadas,\s*extra,\s*\)/)
  // Quien no tiene vínculo puede tener aportadas: el corte de «sin novedad» tiene que contarlas.
  assert.match(CRON, /extra\.length === 0\)/)
})

test('🚨 «no molestar» sigue cortando ANTES de la fase B (ni envía ni escribe la prima observada)', () => {
  const corte = CRON.indexOf("if (motivo === 'no_molestar')")
  assert.ok(corte !== -1 && corte < CRON.indexOf('eventosFaseB(identidadId'))
})

test('el umbral de subida sale de las preferencias de la identidad, no de una constante', () => {
  assert.match(CRON, /umbralSubidaPrima: true/)
  assert.match(CRON, /observarPrima\(previa, a\.prima, prefs\.umbralSubidaPrima, ahora\)/)
})

test('🔒 la fase B del cron filtra por la identidad de la pasada en TODAS sus lecturas', () => {
  const cuerpo = CRON.slice(CRON.indexOf('async function eventosFaseB'))
  for (const m of ['portalPolizaDeclarada', 'portalAvisoLeido', 'portalConsentimiento', 'portalPrimaObservada.findMany']) {
    const i = cuerpo.indexOf(m)
    assert.ok(i !== -1, `no lee ${m}`)
    assert.match(cuerpo.slice(i, i + 160), /where: \{ identidadId/, `${m} sin identidadId en el where`)
  }
  assert.match(cuerpo, /identidadId_origen_refId: \{ identidadId,/)
})

test('🔒 la comparativa solo se ofrece con el consentimiento comercial VIGENTE (=== true)', () => {
  assert.match(CRON, /consentimientoVigente\(consentimientos, 'comercial', VERSION_TEXTO_COMERCIAL\) === true/)
})

test('la notificación abre la ficha de la novedad (no siempre la bóveda)', () => {
  // El payload lleva más campos (tag, acciones): lo que se vigila es que la url salga de urlPushCima.
  assert.match(CRON, /const data = \{\s*url: urlPushCima\(plan\.enviar\),/)
})

test('🚨 el SQL de la fase B amplía los CHECK con EXACTAMENTE los tipos del módulo', () => {
  const lista = (tabla: string) => {
    const m = new RegExp(`ADD CONSTRAINT ${tabla}_tipo_check\\s+CHECK \\(tipo IN \\(([^)]*)\\)\\)`).exec(SQL)
    assert.ok(m, `sin CHECK de ${tabla}`)
    return m[1].split(',').map((v) => v.trim().replace(/'/g, '')).sort()
  }
  assert.deepEqual(lista('portal_aviso_silenciado'), [...TIPOS_AVISO_CIMA].sort())
  assert.deepEqual(lista('portal_aviso_cima'), [...TIPOS_AVISO_CIMA, TIPO_SEMILLA].sort())
})

test('el SQL acepta exactamente los umbrales del módulo', () => {
  const m = /umbral_subida_prima IN \(([^)]*)\)/.exec(SQL)
  assert.ok(m, 'sin CHECK del umbral')
  assert.deepEqual(m[1].split(',').map((x) => Number(x.trim())), [...UMBRALES_SUBIDA_PRIMA])
})

test('🔒 portal_prima_observada: sin DELETE, sin RLS y sin el rol del CRM', () => {
  assert.match(SQL, /GRANT SELECT, INSERT, UPDATE ON seguros\.portal_prima_observada TO prisma_asegura_portal;/)
  assert.doesNotMatch(SQL, /GRANT[^;]*DELETE[^;]*portal_prima_observada/)
  assert.match(SQL, /ALTER TABLE seguros\.portal_prima_observada DISABLE ROW LEVEL SECURITY;/)
  assert.match(SQL, /REVOKE ALL ON seguros\.portal_prima_observada FROM crm_seguros;/)
})

test('🔒 pantalla de bloqueo: el cron no le pasa importes al texto de la subida (detalle solo en la app)', () => {
  // El texto es fijo en el módulo (`TEXTO_SUBIDA_PRIMA`); si el cron vuelve a pasarle un formateador
  // de dinero es que alguien está metiendo el importe en el push.
  assert.match(CRON, /eventosSubidaPrima\(observadas\)/)
  assert.doesNotMatch(CRON, /from '@\/lib\/dinero'/)
})
