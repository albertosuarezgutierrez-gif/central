import { test } from 'node:test'
import assert from 'node:assert'
import { decidirAutoEnvio } from './auto.ts'
import type { Decision } from './decidir.ts'

// Hasta el 04/09/2026 esta regla —la única que decide si un huésped recibe un mensaje sin que
// Alberto lo vea— no tenía ningún test: los tenían sus ingredientes por separado.
const base: Decision = {
  reply: '¡De nada! Un saludo.',
  confidence: 0.9,
  needs_human: false,
  requiere_respuesta: false,
  es_cortesia: true,
  apoyada_en_fuente: true,
  categoria: 'general',
  sentimiento: 'positivo',
  motivo: '',
  fuente: 'ia',
}
const con = (p: Partial<Decision>): Decision => ({ ...base, ...p })

test('auto por CORTESÍA', () => assert.deepEqual(decidirAutoEnvio(base), { auto: true, via: 'cortesia' }))

test('auto por FUENTE (no es cortesía pero está apoyada)', () =>
  assert.deepEqual(decidirAutoEnvio(con({ es_cortesia: false, requiere_respuesta: true })), { auto: true, via: 'apoyada' }))

// Las guardas comunes mandan sobre AMBAS vías.
test('needs_human bloquea la cortesía', () =>
  assert.equal(decidirAutoEnvio(con({ needs_human: true })).auto, false))
test('sentimiento negativo bloquea la cortesía', () =>
  assert.equal(decidirAutoEnvio(con({ sentimiento: 'negativo' })).auto, false))
test('sin borrador no se envía nada', () =>
  assert.equal(decidirAutoEnvio(con({ reply: '' })).auto, false))

// Una respuesta apoyada a un mensaje que no pedía nada NO entra por la vía «apoyada»: si además no
// es cortesía (p. ej. la rama de recomendaciones), va a Telegram.
test('recomendación web: ni cortesía ni apoyada → Telegram', () =>
  assert.deepEqual(decidirAutoEnvio(con({ es_cortesia: undefined, apoyada_en_fuente: undefined, requiere_respuesta: undefined })), { auto: false, via: null }))
test('apoyada pero requiere_respuesta=false y sin cortesía → Telegram', () =>
  assert.equal(decidirAutoEnvio(con({ es_cortesia: false })).auto, false))
