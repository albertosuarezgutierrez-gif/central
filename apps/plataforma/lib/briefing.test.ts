// Tests de la lógica PURA del briefing consolidado. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { agregarBriefing, formatBriefingTexto, type NegocioResumen } from './briefing.ts'

const items: NegocioResumen[] = [
  { nombre: 'Sique Brilla', sector: 'limpieza', ingresosYtd: 1000, gastosYtd: 400, resultadoYtd: 600, disponible: true },
  { nombre: 'Busto Reform', sector: 'turístico', ingresosYtd: 2000, gastosYtd: 500, resultadoYtd: 1500, disponible: true },
  { nombre: 'Bar Pepe', sector: 'hostelería', ingresosYtd: 0, gastosYtd: 0, resultadoYtd: 0, disponible: false, nota: 'sin local vinculado' },
]

test('agregarBriefing: suma solo lo disponible y cuenta negocios', () => {
  const t = agregarBriefing(items)
  assert.equal(t.ingresos, 3000)
  assert.equal(t.gastos, 900)
  assert.equal(t.resultado, 2100)
  assert.equal(t.negocios, 3)
  assert.equal(t.disponibles, 2)
})

test('agregarBriefing: lista vacía da ceros', () => {
  const t = agregarBriefing([])
  assert.deepEqual(t, { ingresos: 0, gastos: 0, resultado: 0, negocios: 0, disponibles: 0 })
})

test('formatBriefingTexto: asunto con nombre y año, cuerpo con líneas y total', () => {
  const { asunto, cuerpo } = formatBriefingTexto('Alberto', items, agregarBriefing(items), 2026)
  assert.match(asunto, /Alberto/)
  assert.match(asunto, /2026/)
  assert.match(cuerpo, /Sique Brilla/)
  assert.match(cuerpo, /Busto Reform/)
  // negocio no disponible aparece con su nota, no con cifras
  assert.match(cuerpo, /Bar Pepe.*sin local vinculado/s)
  // total consolidado presente
  assert.match(cuerpo, /TOTAL/)
})
