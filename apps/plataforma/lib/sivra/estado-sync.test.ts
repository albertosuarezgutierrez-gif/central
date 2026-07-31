import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoSyncSmoobu, leerDetalleSync, type LatidoSync } from './estado-sync.ts'

const AHORA = new Date('2026-07-31T07:00:00Z')
const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000)

function latido(over: Partial<LatidoSync> = {}): LatidoSync {
  return {
    ultimoOkAt: hace(2),
    ultimoAt: hace(2),
    ok: true,
    detalle: JSON.stringify({ origen: 'cron', vistas: 12, nuevas: 0 }),
    ...over,
  }
}

// ── El caso que motivó el módulo ────────────────────────────────────────────

test('una pasada buena reciente SIN reservas nuevas es OK, no un fallo', () => {
  // 31/07/2026: el cron corrió a las 05:01 y devolvió 200, pero la última
  // reserva nueva era del 25/07 → el check viejo (MAX(createdAt) > 2 días)
  // gritaba 🔴. La pasada buena manda; las reservas nuevas no pintan nada aquí.
  const e = estadoSyncSmoobu({ ahora: AHORA, latido: latido({ detalle: JSON.stringify({ origen: 'cron', vistas: 9, nuevas: 0 }) }) })
  assert.equal(e.nivel, 'ok')
  assert.match(e.titular, /activo/)
})

// ── Nunca verde sin evidencia ───────────────────────────────────────────────

test('sin latido NO es «ok»: es aviso explícito de que no se sabe', () => {
  const e = estadoSyncSmoobu({ ahora: AHORA, latido: null })
  assert.equal(e.nivel, 'aviso')
  assert.match(e.titular, /NO es «va bien»/)
})

test('ha corrido pero nunca completó bien → fallo', () => {
  const e = estadoSyncSmoobu({
    ahora: AHORA,
    latido: latido({ ultimoOkAt: null, ok: false, detalle: JSON.stringify({ error: 'Smoobu 401' }) }),
  })
  assert.equal(e.nivel, 'fallo')
  assert.match(e.titular, /NUNCA ha completado/)
  assert.match(e.titular, /Smoobu 401/)
})

test('latido rancio → fallo, con el detalle del error si lo hay', () => {
  const e = estadoSyncSmoobu({
    ahora: AHORA,
    latido: latido({ ultimoOkAt: hace(50), ok: false, detalle: JSON.stringify({ error: 'Smoobu 500' }) }),
  })
  assert.equal(e.nivel, 'fallo')
  assert.match(e.titular, /2 días/)
  assert.match(e.titular, /Smoobu 500/)
})

test('umbral 30 h: una pasada saltada aún no alerta, dos sí', () => {
  assert.equal(estadoSyncSmoobu({ ahora: AHORA, latido: latido({ ultimoOkAt: hace(26) }) }).nivel, 'ok')
  assert.equal(estadoSyncSmoobu({ ahora: AHORA, latido: latido({ ultimoOkAt: hace(50) }) }).nivel, 'fallo')
})

test('última pasada fallida con una buena reciente → aviso, no fallo', () => {
  const e = estadoSyncSmoobu({
    ahora: AHORA,
    latido: latido({ ultimoOkAt: hace(20), ultimoAt: hace(1), ok: false, detalle: JSON.stringify({ error: 'timeout' }) }),
  })
  assert.equal(e.nivel, 'aviso')
  assert.match(e.titular, /última pasada FALLÓ/)
})

test('corre bien pero Smoobu no devuelve ninguna reserva → aviso (clave recortada)', () => {
  const e = estadoSyncSmoobu({ ahora: AHORA, latido: latido({ detalle: JSON.stringify({ origen: 'cron', vistas: 0 }) }) })
  assert.equal(e.nivel, 'aviso')
  assert.match(e.titular, /NI UNA reserva/)
})

test('el sync por webhook también cuenta como pasada buena', () => {
  const e = estadoSyncSmoobu({ ahora: AHORA, latido: latido({ detalle: JSON.stringify({ origen: 'webhook', vistas: 1 }) }) })
  assert.equal(e.nivel, 'ok')
  assert.match(e.titular, /vía webhook/)
})

// ── `detalle` ilegible = «no se sabe», nunca 0 ──────────────────────────────

test('detalle ilegible no se convierte en «vio 0 reservas»', () => {
  for (const d of [null, '', 'no soy json', '"texto suelto"', '[]', JSON.stringify({ vistas: 'muchas' })]) {
    assert.equal(leerDetalleSync(d).reservasVistas, null, `detalle: ${d}`)
  }
  // …y por tanto NO dispara el aviso de «ni una reserva».
  const e = estadoSyncSmoobu({ ahora: AHORA, latido: latido({ detalle: 'no soy json' }) })
  assert.equal(e.nivel, 'ok')
  assert.doesNotMatch(e.titular, /NI UNA reserva/)
})

test('leerDetalleSync extrae lo que sí entiende', () => {
  const d = leerDetalleSync(JSON.stringify({ origen: 'cron', vistas: 7, error: 'x' }))
  assert.deepEqual(d, { reservasVistas: 7, origen: 'cron', error: 'x' })
})
