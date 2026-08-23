// Tests del semáforo del feed PSD2. Runner: `node --test` (type-stripping).
// Fija el caso fundacional (16/08/2026): 6 días sin movimientos con la sesión viva → roto,
// y las fronteras de los tres estados (nunca colapsar «no sé» en «todo bien»).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { semaforoFeed, fechaCaducidadConsent, diasEntre, partirAvisos, avisosNuevos, CONSENT_DIAS } from './psd2-semaforo.ts'

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

test('el detalle de «atención» explica el hueco (fin de semana) y no alarma con falsedades', () => {
  // Queja de Alberto (23/08/2026): domingo con último movimiento el jueves → el texto decía
  // «>1 día no había pasado», que es falso (hubo huecos legítimos de hasta 10 días) y confunde.
  const e = semaforoFeed({ hoyISO: '2026-08-23', ultimoMovISO: '2026-08-20', avisos: [], consentCreadaISO: CONSENT })
  assert.equal(e.nivel, 'atencion')
  const detalle = e.detalles[0]
  assert.match(detalle, /fin de semana/)
  assert.doesNotMatch(detalle, /no había pasado|nunca hubo/)
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

test('aviso INFORMATIVO (ℹ️ ventana degradada) NO rompe el semáforo: feed fresco sigue ok y la nota se muestra', () => {
  // Caso Kutxabank 17/08/2026: el banco rechaza la ventana de 89 días pero la de 30 funciona —
  // el feed está VIVO. Un aviso ℹ️ no puede pedir re-vincular (quemaría SCAs sin motivo).
  const e = semaforoFeed({
    hoyISO: '2026-08-11', ultimoMovISO: '2026-08-11',
    avisos: ['ℹ️ Kutxabank ****0855: el banco rechazó la ventana de 89 días — importado solo desde 2026-07-18'],
    consentCreadaISO: CONSENT,
  })
  assert.equal(e.nivel, 'ok')
  assert.ok(e.notas.some(d => d.startsWith('ℹ️')))
})

test('aviso de FALLO real sigue poniendo el semáforo en roto aunque haya también una nota ℹ️', () => {
  const e = semaforoFeed({
    hoyISO: '2026-08-11', ultimoMovISO: '2026-08-11',
    avisos: ['Kutxabank ****0855: /transactions falló — HTTP 400', 'ℹ️ BBVA ****1175: nota'],
    consentCreadaISO: CONSENT,
  })
  assert.equal(e.nivel, 'roto')
  assert.match(e.titular, /no está entregando movimientos/)
})

test('partirAvisos separa fallos de notas (mismo corte que usa el cron)', () => {
  const { criticos, notas } = partirAvisos([
    'BBVA ****1175: /transactions falló — HTTP 401',
    'ℹ️ Kutxabank ****0855: el banco rechazó la ventana de 89 días — importado solo desde 2026-07-22',
  ])
  assert.deepEqual(criticos, ['BBVA ****1175: /transactions falló — HTTP 401'])
  assert.equal(notas.length, 1)
  assert.deepEqual(partirAvisos(null), { criticos: [], notas: [] })
})

test('la MISMA nota con la fecha corrida un día NO cuenta como nueva', () => {
  // La ventana corta es «hoy − 30 días», así que el texto cambia solo cada mañana: comparar
  // en crudo repetiría el aviso a diario, que es como se rompió el 21/08/2026.
  const ayer = ['ℹ️ Kutxabank ****0855: el banco rechazó la ventana de 89 días — importado solo desde 2026-07-21']
  const hoy = ['ℹ️ Kutxabank ****0855: el banco rechazó la ventana de 89 días — importado solo desde 2026-07-22']
  assert.deepEqual(avisosNuevos(ayer, hoy), [])
})

test('una nota de OTRA cuenta sí es nueva aunque ya hubiera una nota', () => {
  const previos = ['ℹ️ Kutxabank ****0855: el banco rechazó la ventana de 89 días — importado solo desde 2026-07-22']
  const nuevos = [...previos, 'ℹ️ BBVA ****1175: el banco rechazó la ventana de 89 días — importado solo desde 2026-07-22']
  assert.deepEqual(avisosNuevos(previos, nuevos), [nuevos[1]])
})

test('sin avisos previos (primera pasada) la nota se cuenta una vez', () => {
  const nota = 'ℹ️ Kutxabank ****0855: el banco rechazó la ventana de 89 días — importado solo desde 2026-07-22'
  assert.deepEqual(avisosNuevos([], [nota]), [nota])
})

test('las notas ℹ️ viajan en `notas`, NO mezcladas en `detalles` (la UI las pinta también en verde)', () => {
  const nota = 'ℹ️ Kutxabank ****0855: el banco rechazó la ventana de 89 días — importado solo desde 2026-07-22'
  const e = semaforoFeed({ hoyISO: '2026-08-11', ultimoMovISO: '2026-08-11', avisos: [nota], consentCreadaISO: CONSENT })
  assert.equal(e.nivel, 'ok')
  assert.deepEqual(e.notas, [nota])
  assert.ok(!e.detalles.some(d => d.startsWith('ℹ️')))
})
