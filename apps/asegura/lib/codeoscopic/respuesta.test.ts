import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { leerCotizacion, firmezaDe, resumirCotizacion } from './respuesta.ts'

// Se prueba contra el DOCUMENTO REAL de la fuente, no contra un fixture escrito
// por nosotros: `CLAUDE.md` avisa de que un fixture inventado se escribe con la
// misma suposición equivocada que el código, y por eso los tests pasan mientras
// el parser miente (caso ORCL, PR #1189).
const CRUDO = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../fixtures/codeoscopic/2026-06-10-sandbox-quote-response.json'),
    'utf8',
  ),
)

test('lee la cotización real: 18 precios y 3 compañías sin precio', () => {
  const c = leerCotizacion(CRUDO)
  assert.equal(c.precios.length, 18)
  assert.equal(c.fallos.length, 3)
})

test('el projectId de raíz es el número 364732, normalizado a string', () => {
  // El `id` de raíz llega como NÚMERO y los de precio como string «Q…».
  // Es la clave del webhook: sin persistirla salen los `project_not_found`.
  assert.equal(leerCotizacion(CRUDO).projectId, '364732')
})

test('sin id de raíz se LANZA: un proyecto huérfano no se puede correlacionar', () => {
  assert.throws(() => leerCotizacion({ mainQuotes: [] }), /sin_project_id/)
})

// ─── Firmeza: lo que impide pintar una prima que no se sostiene ──────────────
test('en la cotización real NINGÚN precio es «firme»: los 18 traen avisos', () => {
  const c = leerCotizacion(CRUDO)
  const firmes = c.precios.filter((p) => p.firmeza === 'firme')
  assert.equal(firmes.length, 0, 'si esto cambia, revisa el fixture antes que el código')
  assert.equal(c.precios.filter((p) => p.firmeza === 'estimado').length, 2)
  assert.equal(c.precios.filter((p) => p.firmeza === 'condicionado').length, 16)
})

test('el precio de 251,77€ de Reale sale marcado como CONDICIONADO, no como firme', () => {
  const p = leerCotizacion(CRUDO).precios.find((x) => x.id === 'Q7601460')
  assert.ok(p)
  assert.equal(p.primaEur, 251.77)
  assert.equal(p.compania, 'Reale')
  assert.equal(p.firmeza, 'condicionado')
  assert.ok(p.avisos.some((a) => /Riesgo condicionado/i.test(a)))
  // La observación de la compañía viaja entera: es lo que hay que pedirle al cliente.
  assert.ok(p.avisos.some((a) => /BONIFICACION/i.test(a)))
})

test('`estimate: true` manda sobre todo: ningún aviso vuelve firme una estimación', () => {
  assert.equal(firmezaDe(true, []), 'estimado')
  assert.equal(firmezaDe(true, [{ type: 'info', text: 'ok' }]), 'estimado')
})

test('un warning o un error degradan a condicionado', () => {
  assert.equal(firmezaDe(false, [{ type: 'warning', text: 'Riesgo condicionado' }]), 'condicionado')
  assert.equal(firmezaDe(false, [{ type: 'error', text: 'x' }]), 'condicionado')
})

test('solo es firme lo que el vendor dice que es firme y sin reparos', () => {
  assert.equal(firmezaDe(false, [{ type: 'info', text: 'nota' }]), 'firme')
  assert.equal(firmezaDe(false, []), 'firme')
})

test('`estimate` AUSENTE no se asume false: sin el dato el precio no es firme', () => {
  // Regla «dato que NO hay ≠ dato que NO se ha mirado»: la ausencia del campo
  // no autoriza a afirmar que la prima está cerrada.
  assert.equal(firmezaDe(undefined, []), 'estimado')
  assert.equal(firmezaDe(null, []), 'estimado')
})

// ─── Fallos por compañía: información comercial, no ruido ────────────────────
test('los errores por compañía se leen con su motivo legible', () => {
  const c = leerCotizacion(CRUDO)
  const pelayo = c.fallos.find((f) => f.compania === 'Pelayo')
  assert.ok(pelayo)
  assert.match(pelayo.motivo, /matricula/i)
})

test('un fallo sin texto dice que la compañía no lo explicó, no que no pasara nada', () => {
  const c = leerCotizacion({ id: 1, errors: [{ product: { vendor: { name: 'X' } } }] })
  assert.equal(c.fallos[0].motivo, 'la compañía no explicó el motivo')
})

test('un precio sin prima se descarta en vez de colarse como 0€', () => {
  const c = leerCotizacion({ id: 1, mainQuotes: [{ id: 'Q1' }, { id: 'Q2', premium: 10 }] })
  assert.equal(c.precios.length, 1)
  assert.equal(c.precios[0].id, 'Q2')
})

test('el resumen nombra a las compañías que NO dieron precio', () => {
  const r = resumirCotizacion(leerCotizacion(CRUDO))
  assert.match(r, /18 precios/)
  assert.match(r, /0 en firme/)
  assert.match(r, /3 compañías sin precio/)
  assert.match(r, /Pelayo/)
})
