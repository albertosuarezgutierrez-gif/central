// Cepos del ALTA A MANO de una póliza (`normalizarAlta`), la que declara el
// cliente sin documento.
//
// ─── Qué protege, y por qué se escribió ─────────────────────────────────────
// El alta reutiliza la validación del PATCH (`normalizarParche`) a propósito:
// lo que se rechaza al corregir no puede colarse al crear. Lo que añade —y es
// lo que se fija aquí— son dos cosas: que TODAS las claves existan (en un alta
// no hay «no lo toques»: lo no escrito es `null`, «no lo sé»), y que haga falta
// compañía O número de póliza. Una fila con ramo y prima pero sin nada que
// diga de qué seguro se habla es ruido que nadie reconocerá después.
//
// Las reglas de cada campo (fecha imposible, prima negativa, `''` → null…) ya
// tienen su guardián en `test/regression-portal-poliza-editable.test.ts` (raíz);
// aquí solo se comprueba que el alta las HEREDA, no se vuelven a enumerar.
import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizarAlta } from './poliza-editable.ts'

const HOY = new Date(Date.UTC(2026, 8, 3))

const ok = (r: ReturnType<typeof normalizarAlta>) => {
  assert.equal(r.ok, true, `esperaba ok, salió ${JSON.stringify(r)}`)
  return (r as { ok: true; datos: Record<string, unknown> }).datos
}
const fallo = (r: ReturnType<typeof normalizarAlta>) => {
  assert.equal(r.ok, false, `esperaba error, salió ${JSON.stringify(r)}`)
  return (r as { ok: false; error: string }).error
}

test('un cuerpo vacio se rechaza: no hay nada que identifique la poliza', () => {
  assert.equal(fallo(normalizarAlta({}, HOY)), 'sin_identificacion')
  // Y con campos pero sin compañía ni número, igual: ramo y prima no dicen DE QUÉ seguro.
  assert.equal(fallo(normalizarAlta({ ramo: 'auto', primaAnual: 320 }, HOY)), 'sin_identificacion')
  // La cadena vacía es un hueco, no una compañía.
  assert.equal(fallo(normalizarAlta({ compania: '   ', numeroPoliza: '' }, HOY)), 'sin_identificacion')
})

test('un cuerpo que no es objeto se rechaza como cuerpo invalido, no como sin identificar', () => {
  for (const basura of [null, 'texto', 42, [1, 2], true]) {
    assert.equal(fallo(normalizarAlta(basura, HOY)), 'cuerpo_invalido')
  }
})

test('solo compañia basta, y el resto sale a null (no ausente)', () => {
  const d = ok(normalizarAlta({ compania: '  Mapfre ' }, HOY))
  assert.deepEqual(d, {
    compania: 'Mapfre',
    numeroPoliza: null,
    ramo: null,
    primaAnual: null,
    fechaVencimiento: null,
  })
  // Las cinco claves EXISTEN: en un alta «no lo toques» no significa nada.
  assert.deepEqual(Object.keys(d).sort(), ['compania', 'fechaVencimiento', 'numeroPoliza', 'primaAnual', 'ramo'])
})

test('solo numero de poliza basta', () => {
  const d = ok(normalizarAlta({ numeroPoliza: 'P-12345' }, HOY))
  assert.equal(d.numeroPoliza, 'P-12345')
  assert.equal(d.compania, null)
})

test('prima negativa se rechaza igual que al editar', () => {
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', primaAnual: -1 }, HOY)), 'prima_negativa')
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', primaAnual: 'doscientos' }, HOY)), 'prima_invalida')
})

test('fecha invalida se rechaza igual que al editar', () => {
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', fechaVencimiento: '2026-02-31' }, HOY)), 'fecha_inexistente')
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', fechaVencimiento: '03/09/2026' }, HOY)), 'fecha_formato')
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', fechaVencimiento: '1970-01-01' }, HOY)), 'fecha_fuera_de_rango')
})

test('un alta completa sale normalizada: prima con coma, fecha a medianoche UTC', () => {
  const d = ok(
    normalizarAlta(
      { compania: 'Allianz', numeroPoliza: '77', ramo: 'hogar', primaAnual: '412,50', fechaVencimiento: '2027-01-15' },
      HOY,
    ),
  )
  assert.equal(d.primaAnual, 412.5)
  assert.equal((d.fechaVencimiento as Date).toISOString(), '2027-01-15T00:00:00.000Z')
  assert.equal(d.ramo, 'hogar')
})

test('ninguna clave desconocida se propaga al alta', () => {
  const d = ok(normalizarAlta({ compania: 'Axa', identidadId: 'otro', confirmadaPorUsuario: false, procedencia: 'compania' }, HOY))
  assert.equal('identidadId' in d, false)
  assert.equal('confirmadaPorUsuario' in d, false)
  assert.equal('procedencia' in d, false)
})
