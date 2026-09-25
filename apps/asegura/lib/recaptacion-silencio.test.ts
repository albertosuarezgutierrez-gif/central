import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esLeadSilencioso, UMBRAL_SILENCIO } from './recaptacion-silencio.ts'

test('menos envíos que el umbral nunca es silencioso, aunque no haya abierto nada', () => {
  assert.equal(esLeadSilencioso(UMBRAL_SILENCIO - 1, false), false)
})

test('umbral alcanzado y ninguna apertura → silencioso', () => {
  assert.equal(esLeadSilencioso(UMBRAL_SILENCIO, false), true)
})

test('umbral alcanzado pero con apertura/clic → no se descarta', () => {
  assert.equal(esLeadSilencioso(UMBRAL_SILENCIO, true), false)
})

test('por encima del umbral sigue siendo silencioso', () => {
  assert.equal(esLeadSilencioso(UMBRAL_SILENCIO + 5, false), true)
})

// Cepo (25/09/2026): hasta ese día Resend no medía aperturas. Si la regla de
// silencio o la tasa del panel dejan de filtrar por la fecha, 30 envíos que
// nadie pudo medir cuentan como «no abiertos» y el cron descarta leads vivos.
test('silencio y tasa de apertura solo cuentan envíos desde SEGUIMIENTO_EMAIL_DESDE', async () => {
  const { readFile } = await import('node:fs/promises')
  const fuente = await readFile(new URL('./cartera-recaptacion.ts', import.meta.url), 'utf8')
  const cuerpo = (nombre: string) => {
    const i = fuente.indexOf(`function ${nombre}(`)
    assert.ok(i >= 0, `no encuentro ${nombre}`)
    return fuente.slice(i, fuente.indexOf('\n}\n', i))
  }
  const silencio = cuerpo('descartarLeadsSilenciosos')
  assert.equal(silencio.match(/created_at >= \$\{SEGUIMIENTO_EMAIL_DESDE\}/g)?.length, 2, 'el count y el having')
  assert.match(cuerpo('contadoresEmailHistorico'), /created_at >= \$\{SEGUIMIENTO_EMAIL_DESDE\}/)
})
