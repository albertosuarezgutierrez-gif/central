// Cepos del comprobador de coherencia de precios (04/11/2026). `node --test`. Datos inventados; `hoy` inyectado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { comprobarCoherenciaPrecios, fechaEfectoDeRiesgos, lineasRevisar, MAX_LINEAS_REVISAR, type PrecioCoherencia, type RiesgoCoherencia } from './tarificacion-coherencia.ts'
import { textoAvisoPresupuestoRpa } from './presupuesto-rpa-reglas.ts'

const HOY = '2026-11-04'
const inc = (n: number, exc = 0) => [...Array(n).fill({ estado: 'incluida' as const }), ...Array(exc).fill({ estado: 'excluida' as const })]
const p = (compania: string, primaAnualEur: number, extra: Partial<PrecioCoherencia> = {}): PrecioCoherencia => ({
  compania, producto: 'Terceros', primaAnualEur, fraccionamiento: null, importeReciboEur: null, ...extra,
})
const auto: RiesgoCoherencia = { ramo: 'auto', fechaEfecto: '2026-11-20' }
const codigos = (precios: PrecioCoherencia[], riesgo = auto) => comprobarCoherenciaPrecios(precios, riesgo, { hoy: HOY }).map((a) => a.codigo)

test('caso normal: sin avisos', () => {
  const r = comprobarCoherenciaPrecios([
    p('Mapfre', 420.5, { producto: 'Terceros', coberturas: inc(5, 3) }),
    p('Mapfre', 690, { producto: 'Todo riesgo', coberturas: inc(8) }),
    p('Generali', 455.1), p('Allianz', 510.25, { fraccionamiento: 'mensual', importeReciboEur: 43.5 }),
  ], auto, { hoy: HOY })
  assert.deepEqual(r, [])
})

test('prima ≤0 o no numérica → prima_invalida (y no entra en las demás reglas)', () => {
  assert.deepEqual(codigos([p('Mapfre', 0), p('Generali', 400), p('Allianz', 450)]), ['prima_invalida'])
  assert.deepEqual(codigos([p('Mapfre', -10)]), ['prima_invalida'])
  assert.deepEqual(codigos([p('Mapfre', Number.NaN)]), ['prima_invalida'])
})

test('prima fuera del rango del ramo (auto 80–6.000€, hogar 40–3.000€); ramo sin rango no avisa', () => {
  assert.deepEqual(codigos([p('Mapfre', 12)]), ['prima_fuera_rango'])
  assert.deepEqual(codigos([p('Mapfre', 7000)]), ['prima_fuera_rango'])
  assert.deepEqual(codigos([p('Mapfre', 80)]), [])
  assert.deepEqual(codigos([p('Mapfre', 3500)], { ramo: 'hogar', fechaEfecto: null }), ['prima_fuera_rango'])
  assert.deepEqual(codigos([p('Mapfre', 3500)], { ramo: 'vida', fechaEfecto: null }), [])
  const [a] = comprobarCoherenciaPrecios([p('Mapfre', 7000)], auto, { hoy: HOY })
  assert.match(a.texto, /7\.000,00€\/año/)
  assert.match(a.texto, /80,00€–6\.000,00€/)
  // Rangos configurables.
  assert.deepEqual(comprobarCoherenciaPrecios([p('X', 7000)], auto, { hoy: HOY, rangos: { auto: { min: 1, max: 9000 } } }), [])
})

test('misma compañía: la de MÁS coberturas más barata → modalidad_incoherente', () => {
  const precios = [p('Mapfre', 690, { producto: 'Terceros', coberturas: inc(4) }), p('Mapfre', 520, { producto: 'Todo riesgo', coberturas: inc(9) })]
  assert.deepEqual(codigos(precios), ['modalidad_incoherente'])
  // Distinta compañía: no se compara. Sin coberturas leídas: no se sabe, no se avisa.
  assert.deepEqual(codigos([p('Mapfre', 690, { coberturas: inc(4) }), p('Generali', 520, { coberturas: inc(9) })]), [])
  assert.deepEqual(codigos([p('Mapfre', 690, { coberturas: inc(4) }), p('Mapfre', 520, { coberturas: [] })]), [])
})

test('desviación >3× respecto a la mediana del resto de compañías', () => {
  assert.deepEqual(codigos([p('Mapfre', 1900), p('Generali', 450), p('Allianz', 500)]), ['desviacion_mediana'])
  assert.deepEqual(codigos([p('Mapfre', 100), p('Generali', 450), p('Allianz', 500)]), ['desviacion_mediana'])
  assert.deepEqual(codigos([p('Mapfre', 1400), p('Generali', 450), p('Allianz', 500)]), [])
  // Con una sola compañía en el resto no hay mediana fiable.
  assert.deepEqual(codigos([p('Mapfre', 1900), p('Generali', 450)]), [])
})

test('precio idéntico en compañías distintas → precio_repetido (una vez)', () => {
  const r = comprobarCoherenciaPrecios([p('Mapfre', 412.37), p('Generali', 412.37), p('Allianz', 500)], auto, { hoy: HOY })
  assert.deepEqual(r.map((a) => a.codigo), ['precio_repetido'])
  assert.match(r[0].texto, /412,37€ idéntico en Mapfre, Generali/)
  // Misma compañía, dos productos al mismo precio: no es señal de lectura cruzada.
  assert.deepEqual(codigos([p('Mapfre', 412.37), p('Mapfre', 412.37, { producto: 'Otro' })]), [])
})

test('fraccionado que no cuadra con el anual (±5%)', () => {
  assert.deepEqual(codigos([p('Mapfre', 600, { fraccionamiento: 'mensual', importeReciboEur: 60 })]), ['fraccionado_descuadrado'])
  assert.deepEqual(codigos([p('Mapfre', 600, { fraccionamiento: 'trimestral', importeReciboEur: 156 })]), []) // +4%
  assert.deepEqual(codigos([p('Mapfre', 600, { fraccionamiento: 'semestral', importeReciboEur: 320 })]), ['fraccionado_descuadrado']) // +6,7%
  assert.deepEqual(codigos([p('Mapfre', 600, { fraccionamiento: 'mensual', importeReciboEur: null })]), [])
})

test('fecha de efecto pasada; sin fecha no avisa', () => {
  assert.deepEqual(codigos([p('Mapfre', 400)], { ramo: 'auto', fechaEfecto: '2026-11-03' }), ['efecto_pasado'])
  assert.deepEqual(codigos([p('Mapfre', 400)], { ramo: 'auto', fechaEfecto: HOY }), [])
  assert.deepEqual(codigos([p('Mapfre', 400)], { ramo: 'auto', fechaEfecto: null }), [])
  assert.deepEqual(fechaEfectoDeRiesgos([{ fechaEfecto: '2026-12-01' }, null, { fechaEfecto: '2026-11-10' }, { fechaEfecto: 'mañana' }]), '2026-11-10')
  assert.equal(fechaEfectoDeRiesgos([{}, 'x']), null)
})

test('Telegram: «⚠️ Revisar» escapado, con tope de líneas, y sin avisos no aparece', () => {
  const base = { cliente: 'Ana', referencia: 'AS-26-0001', ramo: 'auto', companias: ['Mapfre'], primas: [400], enlace: 'https://x/y', narrativa: 'ia' as const, sinIa: null }
  assert.doesNotMatch(textoAvisoPresupuestoRpa(base), /Revisar/)
  const lineas = lineasRevisar(comprobarCoherenciaPrecios([p('A<b>', 12), p('Generali', 412.37), p('Allianz', 412.37)], auto, { hoy: HOY }))
  const t = textoAvisoPresupuestoRpa({ ...base, revisar: lineas })
  assert.match(t, /⚠️ Revisar: A&lt;b&gt; · Terceros: 12,00€\/año/)
  assert.match(t, /⚠️ Revisar: 412,37€ idéntico/)
  const muchos = Array.from({ length: 9 }, (_, i) => ({ codigo: 'prima_invalida' as const, texto: `t${i}` }))
  const l = lineasRevisar(muchos)
  assert.equal(l.length, MAX_LINEAS_REVISAR + 1)
  assert.match(l.at(-1)!, /y 3 aviso\(s\) más/)
})

test('cableado: el presupuesto RPA guarda la coherencia en el estudio y la pasa al Telegram', () => {
  const src = readFileSync(join(import.meta.dirname, 'presupuesto-rpa.ts'), 'utf8')
  assert.match(src, /coherencia \? \{ coherencia \} : \{\}/)
  assert.match(src, /revisar: coherencia \? lineasRevisar\(coherencia\) : \[\]/)
})
