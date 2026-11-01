// Mapfre auto v0.8.46 · celdas vacías en la tabla por columnas (TERCEROS sin LUNAS/ROBO/INCENDIO) con posición X, guiones como valor, filas no asignadas
// contadas + «posiblemente incompletas» y garantías idénticas entre productos de distinto precio. Datos SINTÉTICOS.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'
import { AVISO_GARANTIAS_IDENTICAS, AVISO_GARANTIAS_POSIBLEMENTE_INCOMPLETAS, coberturasDeColumnas, coberturasPorProducto, ofertasConGarantiasMapfre } from '../src/adapters/mapfre/garantias.ts'
import { filasDePdf, textoDePdf } from '../src/pdf-texto.ts'

const PRODUCTOS = ['TERCEROS', 'TERCEROS AMPLIADO']

test('v0.8.46 · versión', () => assert.equal(mapfreAuto.version, '0.8.47'))

type Celda = [x: number, y: number, t: string]
const pdfDe = (celdas: Celda[]) => {
  const c = celdas.map(([x, y, t]) => `BT 1 0 0 1 ${x} ${y} Tm (${t.replace(/[()\\]/g, '')}) Tj ET`).join('\n')
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n'), deflateSync(Buffer.from(c, 'latin1')), Buffer.from('\nendstream\nendobj\n%%EOF\n')])
}
// Columnas: etiqueta x=50, TERCEROS x=200, TERCEROS AMPLIADO x=350. En LUNAS/ROBO/INCENDIO la celda de TERCEROS está VACÍA (no hay fragmento).
const CELDAS: Celda[] = [
  [200, 750, 'TERCEROS'], [350, 750, 'TERCEROS AMPLIADO'],
  [50, 720, 'Responsabilidad civil obligatoria'], [200, 720, 'Incluida'], [350, 720, 'Incluida'],
  [50, 700, 'Lunas'], [350, 700, 'Incluida'],
  [50, 680, 'Robo'], [350, 680, 'Limite 600 EUR'],
  [50, 660, 'Incendio'], [350, 660, 'Incluida'],
  [50, 640, 'Defensa juridica'], [200, 640, 'Incluida'], [350, 640, 'Incluida'],
]

test('con X: la celda vacía de TERCEROS no copia la del ampliado; el ampliado conserva sus garantías propias', () => {
  const pdf = pdfDe(CELDAS)
  const filas = filasDePdf(pdf)
  assert.ok(filas.length >= 6)
  const m = coberturasPorProducto(textoDePdf(pdf).split('\n'), PRODUCTOS, filas)
  const t = m.get('terceros')!, a = m.get('terceros ampliado')!
  const claves = (r: typeof t) => r.coberturas.map((c) => c.clave).sort()
  assert.deepEqual(claves(t), ['Defensa juridica', 'Responsabilidad civil obligatoria'])
  assert.deepEqual(claves(a), ['Defensa juridica', 'Incendio', 'Lunas', 'Responsabilidad civil obligatoria', 'Robo'])
  assert.equal(a.coberturas.find((c) => c.clave === 'Lunas')!.estado, 'incluida')
  assert.equal(a.coberturas.find((c) => c.clave === 'Robo')!.limite, 600)
  assert.equal(t.descartadas, undefined)
})

test('SIN posiciones (solo líneas) esas filas ambiguas se descartan y se cuentan, no se asignan a ningún producto', () => {
  const m = coberturasPorProducto(textoDePdf(pdfDe(CELDAS)).split('\n'), PRODUCTOS)
  const a = m.get('terceros ampliado')!
  assert.equal(a.coberturas.some((c) => c.clave === 'Lunas'), false)
  assert.equal(a.descartadas!.filas, 3)
  assert.match(a.descartadas!.estructura, /ETIQUETA\(lunas\)=VALOR\(Incluida\)/)
  assert.match(a.descartadas!.estructura, /ETIQUETA\(robo\)=VALOR\(importe\)/)
  assert.match(a.descartadas!.estructura, /ETIQUETA\(incendio\)/)
})

test('guiones y «No contratada» cuentan como valor (excluida)', () => {
  for (const celda of ['—', '-', '–', 'No', 'No incluida', 'Excluida', 'No contratada']) {
    const r = coberturasDeColumnas(['Lunas', celda, 'Incluida'], 2)
    assert.equal(r[0]!.coberturas[0]!.estado, 'excluida', celda)
    assert.equal(r[1]!.coberturas[0]!.estado, 'incluida', celda)
  }
  const unaLinea = coberturasDeColumnas(['Robo   —   Incluida'], 2)
  assert.equal(unaLinea[0]!.coberturas[0]!.estado, 'excluida')
})

const oferta = (producto: string, prima: number) => ({ producto: `Auto · ${producto}`, primaAnualEur: prima, avisos: [] as string[], coberturas: [], franquicias: [] }) as never

test('filas no asignadas → aviso con recuento y estructura (sin dígitos ni texto libre) + marca de posiblemente incompletas', () => {
  const m = coberturasPorProducto(textoDePdf(pdfDe(CELDAS)).split('\n'), PRODUCTOS)
  const [t, a] = ofertasConGarantiasMapfre([oferta('TERCEROS', 238.37), oferta('TERCEROS AMPLIADO', 355.07)], m, new Map())
  for (const o of [t!, a!]) {
    const av = o.avisos.find((x) => x.includes('filas de garantías no asignadas a producto'))!
    assert.match(av, /^3 filas de garantías no asignadas a producto · estructura: /)
    assert.equal(/\d/.test(av.replace(/^3 filas/, '')), false, 'la estructura no lleva dígitos')
    assert.ok(o.avisos.includes(AVISO_GARANTIAS_POSIBLEMENTE_INCOMPLETAS))
  }
  const pdf = pdfDe(CELDAS)
  const [limpio] = ofertasConGarantiasMapfre([oferta('TERCEROS', 238.37), oferta('TERCEROS AMPLIADO', 355.07)], coberturasPorProducto(textoDePdf(pdf).split('\n'), PRODUCTOS, filasDePdf(pdf)), new Map())
  assert.equal(limpio!.avisos.includes(AVISO_GARANTIAS_POSIBLEMENTE_INCOMPLETAS), false)
})

test('garantías idénticas entre productos de distinto precio → aviso + estructura + posiblemente incompletas; mismo precio no avisa', () => {
  const l = ['TERCEROS', 'Responsabilidad civil obligatoria   Incluida', 'Defensa juridica   Incluida', 'TERCEROS AMPLIADO', 'Responsabilidad civil obligatoria   Incluida', 'Defensa juridica   Incluida']
  const m = coberturasPorProducto(l, PRODUCTOS)
  const [t, a] = ofertasConGarantiasMapfre([oferta('TERCEROS', 238.37), oferta('TERCEROS AMPLIADO', 355.07)], m, new Map(), undefined, '[CABECERA:TERCEROS ETIQUETA(rc)]')
  for (const o of [t!, a!]) {
    assert.ok(o.avisos.some((x) => x.startsWith(AVISO_GARANTIAS_IDENTICAS) && x.includes('CABECERA:TERCEROS')))
    assert.ok(o.avisos.includes(AVISO_GARANTIAS_POSIBLEMENTE_INCOMPLETAS))
  }
  const [t2] = ofertasConGarantiasMapfre([oferta('TERCEROS', 300), oferta('TERCEROS AMPLIADO', 300)], m, new Map())
  assert.equal(t2!.avisos.some((x) => x.startsWith(AVISO_GARANTIAS_IDENTICAS)), false)
})
