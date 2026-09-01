import test from 'node:test'
import assert from 'node:assert/strict'
import { fiabilidad, etiquetaProcedencia, sePuedeAfirmar, debeSustituir, PROCEDENCIAS } from './procedencia.ts'

test('las procedencias son exactamente esas, y no hay una de cajón', () => {
  // Se añadió `documento` el 01/09/2026 (lo leído de un papel del cliente).
  // La lista sigue siendo CERRADA: lo que no encaje en una de estas cuatro no
  // se inventa una quinta, se queda sin procedencia y por tanto no se afirma.
  assert.deepEqual([...PROCEDENCIAS], ['compania', 'documento', 'calculado', 'declarado'])
})

test('solo el dato de la compañía se puede afirmar sin confirmar', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'compania', confirmadoPorUsuario: false }), true)
})

test('un dato CALCULADO no se afirma hasta que el usuario lo confirma', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'calculado', confirmadoPorUsuario: false }), false)
  assert.equal(sePuedeAfirmar({ procedencia: 'calculado', confirmadoPorUsuario: true }), true)
})

test('un dato DECLARADO nunca se presenta como verificado, ni confirmado', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'declarado', confirmadoPorUsuario: true }), false)
})

test('la fiabilidad ordena: compania > calculado > declarado', () => {
  assert.ok(fiabilidad('compania') > fiabilidad('calculado'))
  assert.ok(fiabilidad('calculado') > fiabilidad('declarado'))
})

test('cada procedencia tiene una etiqueta que el usuario entiende', () => {
  assert.equal(etiquetaProcedencia('compania'), 'Confirmado por la compañía')
  assert.equal(etiquetaProcedencia('calculado'), 'Calculado — confírmalo')
  assert.equal(etiquetaProcedencia('declarado'), 'Lo has indicado tú')
})

// ─── `documento`: el dato leído de un papel que aporta el cliente ────────────
// Añadido el 01/09/2026 para la subida de pólizas del corredor. No encajaba en
// ninguno de los tres anteriores: detrás hay un documento real (vale más que lo
// que alguien teclea) pero lo ha leído una máquina (no es la compañía).

test('«documento» se sitúa entre la compañía y lo calculado', () => {
  assert.ok(fiabilidad('compania') > fiabilidad('documento'))
  assert.ok(fiabilidad('documento') > fiabilidad('calculado'))
  assert.ok(fiabilidad('calculado') > fiabilidad('declarado'))
})

test('un dato leído de un documento NO se afirma hasta que alguien lo confirma', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'documento', confirmadoPorUsuario: false }), false)
  assert.equal(sePuedeAfirmar({ procedencia: 'documento', confirmadoPorUsuario: true }), true)
})

test('lo de la compañía se afirma sin que nadie lo confirme; lo declarado, nunca', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'compania', confirmadoPorUsuario: false }), true)
  assert.equal(sePuedeAfirmar({ procedencia: 'declarado', confirmadoPorUsuario: true }), false)
})

test('todas las procedencias tienen etiqueta y fiabilidad — ninguna se queda fuera', () => {
  for (const p of PROCEDENCIAS) {
    assert.equal(typeof etiquetaProcedencia(p), 'string')
    assert.ok(etiquetaProcedencia(p).length > 0, `${p} sin etiqueta`)
    assert.ok(Number.isFinite(fiabilidad(p)), `${p} sin fiabilidad`)
  }
})

// ─── debeSustituir: la guarda contra pisar a la compañía ────────────────────

test('🚨 lo leído de un documento NO pisa lo que mandó la compañía', () => {
  assert.equal(debeSustituir('compania', 'documento'), false)
  assert.equal(debeSustituir('compania', 'declarado'), false)
  assert.equal(debeSustituir('compania', 'calculado'), false)
})

test('un documento SÍ mejora lo calculado y lo declarado', () => {
  assert.equal(debeSustituir('calculado', 'documento'), true)
  assert.equal(debeSustituir('declarado', 'documento'), true)
})

test('sin dato previo, cualquier procedencia entra', () => {
  for (const p of PROCEDENCIAS) assert.equal(debeSustituir(null, p), true)
})

test('el empate NO sustituye: reescribir sin ganar solo pierde la fecha del dato', () => {
  for (const p of PROCEDENCIAS) assert.equal(debeSustituir(p, p), false)
})
