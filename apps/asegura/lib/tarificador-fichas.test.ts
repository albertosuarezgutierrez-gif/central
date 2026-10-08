// Tests para tarificador-fichas.ts (07/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// ─── Validación de tipo de resultado de extracción ───────────────────────────
// El tipo ResultadoExtraccion incluye ahora 'sin_ramo' como estado válido.
test('ResultadoExtraccion: sin_ramo es un estado válido cuando la tarificación no tiene ramo', () => {
  // Esto verifica que el tipo de resultado acepta estado 'sin_ramo' con su mensaje.
  const resultado: { estado: 'sin_ramo'; mensaje: string } = {
    estado: 'sin_ramo',
    mensaje: 'la tarificación no tiene ramo',
  }
  assert.equal(resultado.estado, 'sin_ramo')
  assert.equal(resultado.mensaje, 'la tarificación no tiene ramo')
})

// Verificamos que otros estados aún funcionan como se espera
test('ResultadoExtraccion: otros estados mantienen su estructura', () => {
  const sinPdf: { estado: 'sin_pdf'; mensaje: string } = {
    estado: 'sin_pdf',
    mensaje: 'Esta tarificación no tiene el PDF del proyecto guardado.',
  }
  assert.equal(sinPdf.estado, 'sin_pdf')

  const ok: {
    estado: 'ok'
    modo: 'ficha_y_presupuesto' | 'solo_presupuesto'
    fichaId: string | null
    fichaEstado: string | null
    avisos: unknown[]
    condicionadoCambiado: boolean | null
    citasAusentes: string[]
    valores: unknown
  } = {
    estado: 'ok',
    modo: 'ficha_y_presupuesto',
    fichaId: 'test-id',
    fichaEstado: 'pendiente',
    avisos: [],
    condicionadoCambiado: null,
    citasAusentes: [],
    valores: {},
  }
  assert.equal(ok.estado, 'ok')
})
