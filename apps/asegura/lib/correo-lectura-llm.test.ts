// Entrada del puerto de lecturas LLM en sombra (F2 del agente de correo, 21/10/2026). Fixtures inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarEntradaLecturaLLM } from './correo-lectura-llm.ts'

const base = {
  mensajeId: '<abc@compania.test>', proposito: 'cola_larga', modelo: 'anthropic/claude-sonnet-4.5',
  ficha: {
    tipo: 'recibo', numeroPoliza: '0094512345', numeroSolicitud: null, numeroRecibo: '480000123-H', numeroSiniestro: null,
    fechaEfecto: '2026-09-15', fechaVencimiento: null, fechaLimite: 'mañana', importes: [{ concepto: 'recibo', valor: 1234.56 }, { valor: 'x' }],
    estado: 'PTE DOCUMENTACION', confianza: 0.9, tomadorLeido: true,
  },
  noLiterales: ['tomador', 'inventado'],
}

test('entrada válida: se reconstruye la ficha con su forma', () => {
  const v = validarEntradaLecturaLLM(base)
  assert.ok(v.ok)
  if (!v.ok) return
  assert.equal(v.entrada.ficha?.numeroPoliza, '0094512345')
  assert.equal(v.entrada.ficha?.fechaLimite, null, 'una fecha que no es ISO se anula, no se interpreta')
  assert.deepEqual(v.entrada.ficha?.importes, [{ concepto: 'recibo', valor: 1234.56 }])
  assert.deepEqual(v.entrada.noLiterales, ['tomador'])
  assert.equal(v.entrada.comparacion, null)
})

test('🚨 el nombre del tomador NUNCA se guarda aunque llegue, y un nº con NIF dentro se anula', () => {
  const v = validarEntradaLecturaLLM({ ...base, ficha: { ...base.ficha, tomador: 'EMPRESA EJEMPLO SL', numeroPoliza: '12345678Z', estado: 'Titular 12345678Z' } })
  assert.ok(v.ok)
  if (!v.ok) return
  const json = JSON.stringify(v.entrada)
  assert.ok(!json.includes('EJEMPLO'), 'el tomador pasa al puerto')
  assert.ok(!json.includes('12345678Z'), 'el NIF pasa al puerto')
  assert.equal(v.entrada.ficha?.numeroPoliza, null)
})

test('comparación: los contadores se recalculan, no se fían del llamante', () => {
  const v = validarEntradaLecturaLLM({
    ...base, proposito: 'comparacion',
    comparacion: { tipoLector: 'pre_anulacion', campos: { tipo: 'acierto', numeroPoliza: 'fallo', importes: 'raro' }, aciertos: 99, fallos: 0 },
  })
  assert.ok(v.ok)
  if (!v.ok) return
  assert.equal(v.entrada.comparacion?.aciertos, 1)
  assert.equal(v.entrada.comparacion?.fallos, 1)
  assert.equal(v.entrada.comparacion?.campos.importes, 'sin_referencia')
})

test('entradas inválidas → motivo', () => {
  assert.deepEqual(validarEntradaLecturaLLM(null), { ok: false, motivo: 'cuerpo no es un objeto' })
  assert.equal(validarEntradaLecturaLLM({ ...base, mensajeId: '' }).ok, false)
  assert.equal(validarEntradaLecturaLLM({ ...base, proposito: 'vivo' }).ok, false)
  assert.equal(validarEntradaLecturaLLM({ ...base, modelo: 'rm -rf /' }).ok, false)
  assert.equal(validarEntradaLecturaLLM({ ...base, proposito: 'comparacion' }).ok, false, 'comparación sin datos del lector')
})
