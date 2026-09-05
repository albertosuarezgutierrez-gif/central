import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarPlanBackfill, interpretarEscrituraBackfill } from './correduria-puerto.ts'

// El riesgo de esta pantalla es el de siempre en el repo: que un fallo se lea
// como «no hay nada que arreglar». Cero fichas por rellenar y cero porque no se
// ha podido preguntar tienen que salir DISTINTAS.

test('un plan bueno se lee entero', () => {
  const p = interpretarPlanBackfill(200, {
    estado: 'ok',
    resumen: { total: 32600, sinDni: 12906, yaTiene: 3896, ilegibles: 40, rellenables: 15000, enChoque: 758 },
    choques: [{ fichas: ['a', 'b'] }, { fichas: ['c', 'd'] }],
  })
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.rellenables, 15000)
  assert.equal(p.enChoque, 758)
  assert.equal(p.grupos, 2)
  assert.equal(p.ilegibles, 40)
})

test('sin configurar NO es «no hay nada que rellenar»', () => {
  assert.deepEqual(interpretarPlanBackfill(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
})

test('un 401 dice que el secreto no cuadra, no «error» a secas', () => {
  const p = interpretarPlanBackfill(401, null)
  assert.equal(p.estado, 'error')
  if (p.estado !== 'error') return
  assert.match(p.motivo, /ASEGURA_OPERADOR_SECRET/)
})

test('un error del puerto conserva su causa (credenciales, permisos, esquema…)', () => {
  const p = interpretarPlanBackfill(500, { estado: 'error', causa: 'credenciales' })
  assert.equal(p.estado, 'error')
  if (p.estado !== 'error') return
  assert.equal(p.motivo, 'credenciales')
})

test('una respuesta que no se entiende es error, nunca un cero tranquilizador', () => {
  for (const json of [null, {}, { estado: 'vaya' }, 'texto']) {
    assert.equal(interpretarPlanBackfill(200, json).estado, 'error', `«${JSON.stringify(json)}» debería ser error`)
  }
})

test('un resumen con campos raros cuenta 0 en vez de reventar la pantalla', () => {
  // Una versión más vieja de asegura puede no mandar algún campo. Que falte una
  // cifra no puede tumbar la página entera: el resto sigue siendo cierto.
  const p = interpretarPlanBackfill(200, { estado: 'ok', resumen: { rellenables: 'muchas', enChoque: null } })
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.rellenables, 0)
  assert.equal(p.enChoque, 0)
  assert.equal(p.grupos, 0)
})

// ─── Paso 3: la escritura (05/09/2026) ───────────────────────────────────────
// El riesgo aquí es el simétrico: que un corte de red se lea como «no se ha
// escrito nada» cuando la escritura del otro lado puede haber terminado.

test('los centinelas se leen aparte de los choques', () => {
  const p = interpretarPlanBackfill(200, {
    estado: 'ok',
    resumen: { total: 32549, sinDni: 12903, yaTiene: 3893, ilegibles: 936, rellenables: 14148, enChoque: 40, compartidos: 20 },
    choques: [{ fichas: ['a', 'b'] }],
    compartidos: [{ fichas: ['c', 'd', 'e'], nombresDistintos: 3 }],
  })
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.compartidas, 20)
  assert.equal(p.gruposCompartidos, 1)
  assert.equal(p.enChoque, 40, 'un centinela no se cuenta como choque: no se fusiona, se corrige')
})

test('una versión de asegura sin centinelas da 0, no rompe', () => {
  const p = interpretarPlanBackfill(200, {
    estado: 'ok',
    resumen: { total: 10, sinDni: 0, yaTiene: 0, ilegibles: 0, rellenables: 10, enChoque: 0 },
    choques: [],
  })
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.compartidas, 0)
  assert.equal(p.gruposCompartidos, 0)
})

test('una escritura buena se lee entera', () => {
  const r = interpretarEscrituraBackfill(200, { estado: 'ok', escritos: 8000, restantes: 6148, fallidos: [] })
  assert.deepEqual(r, { estado: 'ok', escritos: 8000, restantes: 6148, fallidos: 0 })
})

test('las fichas que la BD rechazó se cuentan, no se esconden', () => {
  const r = interpretarEscrituraBackfill(200, { estado: 'ok', escritos: 99, restantes: 0, fallidos: ['a', 'b'] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.fallidos, 2)
})

test('un error de escritura NO se lee como «escritos: 0»', () => {
  // Es la trampa de la casa: «no he podido» y «no había nada» tienen que salir
  // distintos. Un `{estado:'ok', escritos:0}` diría que ya estaba todo hecho.
  for (const [status, json] of [
    [500, { estado: 'error', causa: 'credenciales' }],
    [401, null],
    [503, { estado: 'sin_configurar' }],
    [422, { estado: 'invalido', motivo: 'falta {"confirmar":"escribir"}' }],
  ] as const) {
    const r = interpretarEscrituraBackfill(status, json)
    assert.notEqual(r.estado, 'ok', `«${JSON.stringify(json)}» no puede leerse como escritura correcta`)
  }
})
