// Umbrales legales de aprobación del remate (LEC 670/671, RGR). `node --test`.
// La confusión que fija esta suite: el 70% es del VALOR DE SUBASTA, no de la
// deuda — y la deuda (cantidad reclamada) entra como vía alternativa.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoPujaMinima, umbralesPuja } from '../src/umbrales.ts'
import type { SubastaInmueble } from '../src/types.ts'

const base: SubastaInmueble = {
  dedupeKey: 'SUB-JA-2026-1',
  fuente: 'boe',
  tipo: 'judicial',
  valorSubasta: 100000,
}

test('judicial: 70% aprobación directa, 50% suelo del LAJ, deuda si se conoce', () => {
  const u = umbralesPuja({ ...base, cantidadReclamada: 40000 })
  assert.equal(u.regimen, 'judicial')
  assert.deepEqual(
    u.umbrales.map((x) => [x.clave, x.importe, x.pct]),
    [['deuda', 40000, null], ['suelo_laj', 50000, 0.5], ['aprobacion_directa', 70000, 0.7]],
  )
  // La nota del art. 671 (subasta desierta) acompaña siempre al régimen judicial.
  assert.ok(u.notas.some((n) => n.includes('671')))
  // Y las etiquetas llevan el importe en formato español.
  assert.ok(u.umbrales[2].etiqueta.includes('70.000,00€'))
})

test('la deuda no se inventa: sin cantidad reclamada solo hay 2 umbrales', () => {
  const u = umbralesPuja(base)
  assert.deepEqual(u.umbrales.map((x) => x.clave), ['suelo_laj', 'aprobacion_directa'])
  assert.equal(u.cantidadReclamada, null)
})

test('la notarial se rige por la LEC: mismos umbrales que la judicial', () => {
  assert.deepEqual(
    umbralesPuja({ ...base, tipo: 'notarial' }).umbrales,
    umbralesPuja(base).umbrales,
  )
})

test('administrativas (AEAT/TGSS/otras): solo la referencia del 50% del tipo', () => {
  for (const tipo of ['agencia_tributaria', 'seguridad_social', 'administrativa'] as const) {
    const u = umbralesPuja({ ...base, tipo })
    assert.equal(u.regimen, 'administrativa')
    assert.deepEqual(u.umbrales.map((x) => [x.clave, x.importe]), [['suelo_laj', 50000]])
    assert.ok(u.umbrales[0].etiqueta.includes('RGR'))
  }
})

test('concursal y venta directa: sin umbrales, con nota que lo explica', () => {
  const c = umbralesPuja({ ...base, tipo: 'concursal' })
  assert.equal(c.regimen, null)
  assert.deepEqual(c.umbrales, [])
  assert.ok(c.notas.some((n) => n.includes('Régimen especial')))
  const v = umbralesPuja({ ...base, tipo: 'venta_adjudicado' })
  assert.ok(v.notas.some((n) => n.includes('Venta directa')))
})

test('sin valor de subasta no hay umbrales, pero la deuda se conserva', () => {
  const u = umbralesPuja({ ...base, valorSubasta: null, cantidadReclamada: 40000 })
  assert.deepEqual(u.umbrales, [])
  assert.equal(u.cantidadReclamada, 40000)
  assert.ok(u.notas.some((n) => n.includes('Sin valor de subasta')))
})

test('«Sin puja mínima» (0) añade la nota de admisión — el 0 NO es un null', () => {
  const con = umbralesPuja({ ...base, pujaMinima: 0 })
  assert.ok(con.notas.some((n) => n.includes('cualquier postura es admisible')))
  const sin = umbralesPuja(base)
  assert.ok(!sin.notas.some((n) => n.includes('cualquier postura')))
})

test('estadoPujaMinima: tres estados, el 0 no colapsa con el null', () => {
  assert.equal(estadoPujaMinima(12000), 'publicada')
  assert.equal(estadoPujaMinima(0), 'sin_minimo')
  assert.equal(estadoPujaMinima(null), 'no_publicada')
  assert.equal(estadoPujaMinima(undefined), 'no_publicada')
})
