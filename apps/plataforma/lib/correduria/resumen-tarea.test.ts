import test from 'node:test'
import assert from 'node:assert/strict'
import { resumirTarea } from './resumen-tarea.ts'

// Textos REALES de «Tareas de hoy» (29/09/2026), copiados de la pantalla.
const REALE = 'Reale ha devuelto el recibo de renovación 690041622859 (184,58€, efecto 19/09/2026, motivo banco «RAZONES.REG.»). Llamar: ¿ha vendido el coche, se ha ido a otra compañía o es por precio? Si es precio → pasarle presupuesto (retarificar). Si sigue con Reale → regularizar el cobro antes del ~19/10 (suspensión de cobertura, art. 15 LCS).'
const MAPFRE = 'Mapfre ha DEVUELTO el recibo 8808116169 (aviso «Devolución de Recibo MAPFRE» del 22/09/2026 a «Sra. ALCALA», y el 17/09 su departamento de recibos intentó llamar — tel. 978 224 551). El recibo NO está en nuestra BD: casa con la renovación de esta RC (vencía el 10/09/2026, sin recibo 2026 en CIMA), pero COMPRUÉBALO en el portal de Mapfre.'

test('una tarea corta se queda como está, sin detalle', () => {
  assert.deepEqual(resumirTarea('Presentarle el presupuesto'), { titulo: 'Presentarle el presupuesto', detalle: null })
})

test('un párrafo en una línea da un titular corto y el detalle es el texto ENTERO', () => {
  const r = resumirTarea(REALE)
  assert.equal(r.titulo, 'Reale ha devuelto el recibo de renovación 690041622859')
  assert.equal(r.detalle, REALE)
  const m = resumirTarea(MAPFRE)
  assert.equal(m.titulo, 'Mapfre ha DEVUELTO el recibo 8808116169')
  assert.equal(m.detalle, MAPFRE)
})

test('con saltos de línea, la primera es el titular y el resto el detalle', () => {
  const r = resumirTarea('🧾 Recibo DEVUELTO de 184,58€ · auto de Reale\nMotivo del banco: cuenta.\nLa cobertura queda en suspenso el 19/10/2026.')
  assert.equal(r.titulo, '🧾 Recibo DEVUELTO de 184,58€ · auto de Reale')
  assert.equal(r.detalle, 'Motivo del banco: cuenta.\nLa cobertura queda en suspenso el 19/10/2026.')
})

test('sin corte natural se recorta por palabra, con puntos suspensivos, y el titular nunca pasa del máximo', () => {
  const largo = 'palabra '.repeat(30).trim()
  const r = resumirTarea(largo, 40)
  assert.ok(r.titulo.endsWith('…'))
  assert.ok(r.titulo.length <= 41)
  assert.equal(r.detalle, largo)
  for (const t of [REALE, MAPFRE]) assert.ok(resumirTarea(t).titulo.length <= 90)
})

test('vacío o null no se inventa un titular', () => {
  assert.deepEqual(resumirTarea(''), { titulo: '', detalle: null })
  assert.deepEqual(resumirTarea(null), { titulo: '', detalle: null })
})
