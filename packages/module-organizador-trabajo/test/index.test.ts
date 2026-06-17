import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as mod from '../src/index.ts'

test('el barrel exporta toda la API pública', () => {
  for (const fn of ['estaOcioso', 'planificarPorCaducidad', 'asignarTrabajo', 'siguienteTarea', 'construirParte', 'resumirPartes', 'tareasDesbloqueadas', 'tareasBloqueadas', 'avisosAlCompletar', 'agruparPorPartida', 'estimarMinutosProduccion', 'personasNecesarias', 'estimarCompra', 'aprenderFactor']) {
    assert.equal(typeof (mod as Record<string, unknown>)[fn], 'function', `falta export: ${fn}`)
  }
})
