// Tests del semáforo del feed PSD2. Runner: `node --test` (type-stripping).
// Fija el caso fundacional (16/08/2026): 6 días sin movimientos con la sesión viva → roto,
// y las fronteras de los tres estados (nunca colapsar «no sé» en «todo bien»).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { semaforoFeed, fechaCaducidadConsent, diasEntre, CONSENT_DIAS } from './psd2-semaforo.ts'

const CONSENT = '2026-06-14' // consentimiento real (SCA del 14/06/2026)

test('caso fundacional 16/08: 6 días sin movimientos → roto aunque no haya avisos', () => {
  const e = semaforoFeed({ hoyISO: '2026-08-16', ultimoMovISO: '2026-08-10', avisos: null, consentCreadaISO: CONSENT })
  assert.equal(e.nivel, 'roto')
  assert.match(e.titular, /6 días sin movimientos/)
})

test('avisos del sync presentes → roto con los avisos en el detalle', () => {
  const e = semaforoFeed({
    hoyISO: '2026-08-16', ultimoMovISO: '2026-08-15',
    avisos: ['BBVA ****1175: /transactions falló — HTTP 401'], consentCreadaISO: CONSENT,
  })
  assert.equal(e.nivel, 'roto')
  assert.ok(e.detalles.some(d => d.includes('/transactions falló')))
})

test('avisos null (sync antiguo) NO es «sin avisos»: decide la frescura sola', () => {
  const ok = semaforoFeed({ hoyISO: '2026-08-11', ultimoMovISO: '2026-08-10', avisos: null, consentCreadaISO: CONSENT })
  assert.equal(ok.nivel, 'ok')
})

test('fronteras de frescura: 2 días ok · 3 atención · 6 roto', () => {
  assert.equal(semaforoFeed({ hoyISO: '2026-08-12', ultimoMovISO: '2026-08-10', avisos: [], consentCreadaISO: CONSENT }).nivel, 'ok')
  assert.equal(semaforoFeed({ hoyISO: '2026-08-13', ultimoMovISO: '2026-08-10', avisos: [], consentCreadaISO: CONSENT }).nivel, 'atencion')
  assert.equal(semaforoFeed({ hoyISO: '2026-08-16', ultimoMovISO: '2026-08-10', avisos: [], consentCreadaISO: CONSENT }).nivel, 'roto')
})

test('sin movimientos importados nunca → atención («no lo sé»), jamás ok', () => {
  const e = semaforoFeed({ hoyISO: '2026-06-15', ultimoMovISO: null, avisos: [], consentCreadaISO: CONSENT })
  assert.equal(e.nivel, 'atencion')
  assert.match(e.titular, /sin movimientos importados/)
})

test('consentimiento a punto de caducar → atención aunque el feed esté fresco', () => {
  // consentimiento del 14/06 caduca el 11/09; el 3/09 quedan 8 días (≤10).
  const e = semaforoFeed({ hoyISO: '2026-09-03', ultimoMovISO: '2026-09-03', avisos: [], consentCreadaISO: CONSENT })
  assert.equal(e.nivel, 'atencion')
  assert.match(e.titular, /caduca en 8 días/)
})

test('consentimiento caducado → roto, gane quien gane el resto', () => {
  const e = semaforoFeed({ hoyISO: '2026-09-12', ultimoMovISO: '2026-09-12', avisos: [], consentCreadaISO: CONSENT })
  assert.equal(e.nivel, 'roto')
  assert.match(e.titular, /CADUCADO/)
})

test('fechaCaducidadConsent = created_at + 89 días (el valid_until de iniciarAuth)', () => {
  assert.equal(fechaCaducidadConsent(CONSENT), '2026-09-11')
  assert.equal(diasEntre(CONSENT, fechaCaducidadConsent(CONSENT)), CONSENT_DIAS)
})

test('feed fresco y consentimiento lejos → ok con la fecha de caducidad declarada', () => {
  const e = semaforoFeed({ hoyISO: '2026-08-11', ultimoMovISO: '2026-08-11', avisos: [], consentCreadaISO: CONSENT })
  assert.equal(e.nivel, 'ok')
  assert.ok(e.detalles.some(d => d.includes('11/09')))
})
