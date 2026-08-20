import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloqueSubasta, lecturaRatio, urlFicha, type DatosAviso } from './aviso-cierre.ts'
import type { CalibracionZona } from '@central/module-subastas'

const base: DatosAviso = {
  identificador: 'SUB-JA-2026-262310',
  descripcion: 'URBANA. Vivienda en planta segunda.',
  municipio: 'HUELVA',
  provincia: 'Huelva',
  valorSubasta: 96652.74,
  deposito: 4832.64,
  fechaFin: '2026-09-07T16:00:00.000Z',
  pujas: { estado: 'sin_pujas', importe: null },
  pujasAt: '2026-08-20T06:15:00.000Z',
  sueloLaj: 48326.37,
  techoPuja: 72489.55,
  cargas: '🟠 El BOE SÍ publica «certificación de cargas» pero NO tenemos su cuadro de cargas: ábrela antes de pujar.',
  url: urlFicha('SUB-JA-2026-262310'),
}

const zona = (provincia: string, ratioMediano: number | null, muestraRatio: number): CalibracionZona => ({
  provincia, muestra: muestraRatio, adjudicadas: muestraRatio, desiertas: 0, ratioMediano, muestraRatio,
})

// ── El dinero, en formato español y con el depósito delante ─────────────────

test('el bloque lleva tipo, depósito y cierre en hora de Madrid', () => {
  const l = bloqueSubasta(base, null).join('\n')
  assert.match(l, /Tipo 96\.652,74€/)
  assert.match(l, /depósito <b>4\.832,64€<\/b>/)
  // 16:00 UTC en septiembre = 18:00 en Madrid: si sale 16:00 el aviso miente.
  assert.match(l, /cierra 7\/9\/26, 18:00 \(hora Madrid\)/)
})

test('sin valor de subasta NO se inventa un depósito', () => {
  const l = bloqueSubasta({ ...base, valorSubasta: null, deposito: null }, null).join('\n')
  assert.match(l, /Tipo no publicado/)
  assert.match(l, /depósito sin calcular/)
  assert.ok(!/0,00€/.test(l), l)
})

// ── Pujas: el suelo legal solo cuando de verdad no hay ninguna ──────────────

test('«sin pujas» canta el suelo del art. 670', () => {
  const l = bloqueSubasta(base, null).join('\n')
  assert.match(l, /Todavía SIN pujas/)
  assert.match(l, /suelo del art\. 670 LEC está en 48\.326,37€/)
})

test('🚨 con puja viva NO se sugiere pujar por el suelo', () => {
  // Sería invitar a pujar por debajo de lo que ya hay sobre la mesa.
  const l = bloqueSubasta({ ...base, pujas: { estado: 'con_puja', importe: null } }, null).join('\n')
  assert.ok(!/suelo del art/.test(l), l)
  assert.match(l, /no publica el importe sin iniciar sesión/)
})

test('🚨 lo NO comprobado tampoco lo sugiere, y se declara como hueco', () => {
  const l = bloqueSubasta({ ...base, pujas: { estado: 'desconocido', importe: null }, pujasAt: null }, null).join('\n')
  assert.ok(!/suelo del art/.test(l), l)
  assert.match(l, /sin comprobar/)
  // Y sin fecha de lectura no se cuelga un «leído …» falso.
  assert.ok(!/leído/.test(l), l)
})

test('las pujas secretas se dicen como ausencia definitiva, no como pendiente', () => {
  const l = bloqueSubasta({ ...base, pujas: { estado: 'secretas', importe: null } }, null).join('\n')
  assert.match(l, /SECRETAS/)
  assert.ok(!/suelo del art/.test(l), l)
})

// ── Ratio de remate por provincia ──────────────────────────────────────────

test('el ratio de SU provincia se dice como suyo', () => {
  const cal = [zona('Huelva', 0.63, 3), zona('(todas)', 0.64, 8)]
  assert.equal(lecturaRatio(cal, 'Huelva'), '📊 En Huelva el remate mediano va al 63% del tipo (3 remates vistos)')
})

test('🚨 el agregado nacional NUNCA se presenta como el de la provincia', () => {
  const cal = [zona('Sevilla', 2.08, 2), zona('(todas)', 0.64, 8)]
  const t = lecturaRatio(cal, 'Asturias')
  assert.match(t!, /Sin muestra de Asturias/)
  assert.match(t!, /en el conjunto del corpus/)
  assert.match(t!, /64% del tipo/)
})

test('sin muestra ninguna no se dice nada (mejor callar que inventar)', () => {
  assert.equal(lecturaRatio([], 'Huelva'), null)
  assert.equal(lecturaRatio([zona('(todas)', null, 0)], 'Huelva'), null)
  // Una provincia presente pero SIN ratios cae al global, no devuelve null.
  const cal = [zona('Huelva', null, 0), zona('(todas)', 0.64, 8)]
  assert.match(lecturaRatio(cal, 'Huelva')!, /Sin muestra de Huelva/)
})

// ── Seguridad del HTML de Telegram ─────────────────────────────────────────

test('el texto del BOE no rompe el HTML del mensaje', () => {
  const l = bloqueSubasta({ ...base, descripcion: 'Local <b>A&B</b> "raro"', municipio: 'A & B' }, null).join('\n')
  assert.match(l, /&lt;b&gt;A&amp;B&lt;\/b&gt;/)
  assert.match(l, /A &amp; B/)
})
