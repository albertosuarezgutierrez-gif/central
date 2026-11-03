// Mapfre auto v0.8.60 (AS-26-0067) · tabla comparativa del PDF del proyecto: celdas con TEXTO de condición («Mejorada», «Hasta 7 días…»), una celda de
// VARIAS líneas (medio renglón por encima y por debajo de la etiqueta) y «*Indem. pérdida total» (el «total» no la descarta). Maqueta copiada de la
// tabla real (solo nombres de garantía y valores de la tabla; SIN datos personales). Para verlo en rojo: en `coberturasDeColumnasXY` quita la fusión
// de filas sin etiqueta → falla «varias líneas»; quita `valorDescriptivo` → falla «texto de condición» y vuelve la fila descartada; en `etiquetaValida`
// vuelve a `RE_NO_GARANTIA.test(t)` → falla «pérdida total».
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'
import { AVISO_GARANTIAS_POSIBLEMENTE_INCOMPLETAS, coberturasPorProducto, ofertasConGarantiasMapfre, valorDescriptivo } from '../src/adapters/mapfre/garantias.ts'
import { filasDePdf, textoDePdf } from '../src/pdf-texto.ts'
import type { OfertaNormalizada } from '@central/module-tarificacion'

test('v0.8.60 · versión', () => assert.equal(mapfreAuto.version, '0.8.60'))

type Celda = [x: number, y: number, t: string]
const pdfDe = (celdas: Celda[]) => {
  const c = celdas.map(([x, y, t]) => `BT 1 0 0 1 ${x} ${y} Tm (${t.replace(/[()\\]/g, '')}) Tj ET`).join('\n')
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n'), deflateSync(Buffer.from(c, 'latin1')), Buffer.from('\nendstream\nendobj\n%%EOF\n')])
}
// Coordenadas como en el PDF real: etiqueta x=287, TERCEROS ~2233-2370, TERCEROS AMPLIADO ~3204-3810; renglón de 76 y la celda de 2 líneas a ±38.
const T = 2370, A = 3810
const CELDAS: Celda[] = [
  [2233, 2609, 'TERCEROS'], [3592, 2609, 'TERCEROS AMPLIADO'],
  [287, 2533, 'R. C. OBLIGATORIA'], [2280, 2533, 'Incluido'], [A, 2533, 'Incluido'],
  [287, 2457, 'ROBO DEL VEHÍCULO'], [T, 2457, '--'], [A, 2457, 'Incluido'],
  [287, 2381, '    *Indem. pérdida total'], [T, 2381, '--'], [3789, 2381, 'Mejorada'],
  [287, 2305, 'VEHÍCULO DE SUSTITUCIÓN'], [T, 2305, '--'], [3293, 2305, 'Hasta 7 días; máximo 3 accidentes por año'],
  [287, 2191, '    *Indemnización'], [T, 2191, '--'], [3204, 2229, '30€/día en el caso de que no se pueda prestar el'], [3814, 2153, 'servicio'],
  [287, 2077, 'DAÑOS F. ATMOSFÉRICOS'], [T, 2077, '--'], [A, 2077, 'Incluido'],
]
const PRODUCTOS = ['TERCEROS', 'TERCEROS AMPLIADO']
const leer = () => {
  const pdf = pdfDe(CELDAS)
  return coberturasPorProducto(textoDePdf(pdf).split('\n'), PRODUCTOS, filasDePdf(pdf))
}
const de = (r: ReturnType<typeof leer>, p: string, clave: string) => r.get(p)!.coberturas.find((c) => c.clave.trim() === clave)

test('texto de condición en la columna del producto = incluida sin cifra; «--» = excluida; ninguna fila descartada', () => {
  const r = leer()
  assert.equal(de(r, 'terceros ampliado', 'VEHÍCULO DE SUSTITUCIÓN')?.estado, 'incluida')
  assert.equal(de(r, 'terceros ampliado', 'VEHÍCULO DE SUSTITUCIÓN')?.limite, null)
  assert.equal(de(r, 'terceros', 'VEHÍCULO DE SUSTITUCIÓN')?.estado, 'excluida')
  assert.equal(r.get('terceros')!.descartadas, undefined)
  assert.equal(r.get('terceros ampliado')!.descartadas, undefined)
})

test('pérdida total: «*Indem. pérdida total» es garantía (Mejorada / --)', () => {
  const r = leer()
  assert.equal(de(r, 'terceros ampliado', '*Indem. pérdida total')?.estado, 'incluida')
  assert.equal(de(r, 'terceros', '*Indem. pérdida total')?.estado, 'excluida')
})

test('varias líneas: las dos líneas de la celda del ampliado se funden con «*Indemnización» (antes el ampliado la perdía)', () => {
  const r = leer()
  const a = de(r, 'terceros ampliado', '*Indemnización')
  assert.equal(a?.estado, 'incluida')
  assert.equal(de(r, 'terceros', '*Indemnización')?.estado, 'excluida')
  assert.equal(r.get('terceros')!.coberturas.length, r.get('terceros ampliado')!.coberturas.length)
})

test('sin filas descartadas no sale «posiblemente incompletas» (el estudio deja de marcarse «garantías dudosas»)', () => {
  const base = { compania: 'mapfre', primaNetaEur: null, fraccionamiento: 'anual', importeReciboEur: null, coberturas: [], franquicias: [], avisos: [] } as unknown as OfertaNormalizada
  const ofertas = [{ ...base, producto: 'Auto · TERCEROS', primaAnualEur: 238 }, { ...base, producto: 'Auto · TERCEROS AMPLIADO', primaAnualEur: 355 }] as OfertaNormalizada[]
  const out = ofertasConGarantiasMapfre(ofertas, leer(), new Map())
  for (const o of out) assert.equal(o.avisos.includes(AVISO_GARANTIAS_POSIBLEMENTE_INCOMPLETAS), false, o.producto)
})

test('valorDescriptivo: negaciones y textos que no son garantía no cuentan', () => {
  for (const t of ['No', 'Sin cobertura', 'Excluida', 'Prima total', '--', '']) assert.equal(valorDescriptivo(t), null, t)
  assert.equal(valorDescriptivo('Mejorada')?.estado, 'incluida')
})
