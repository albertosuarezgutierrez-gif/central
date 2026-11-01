// Mapfre auto v0.8.45 · PDF multiprecio con tabla comparativa POR COLUMNAS: cabeceras «TERCEROS» + «TERCEROS AMPLIADO» consecutivas. Datos SINTÉTICOS.
// Antes: TERCEROS quedaba sin garantías y TERCEROS AMPLIADO leía la columna del otro producto (o toda la tabla).
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'
import { coberturasDeColumnas, coberturasPorProducto } from '../src/adapters/mapfre/garantias.ts'
import { textoDePdf } from '../src/pdf-texto.ts'

const PRODUCTOS = ['TERCEROS', 'TERCEROS AMPLIADO']

test('v0.8.45 · versión', () => assert.equal(mapfreAuto.version, '0.8.47'))

// Una celda por línea (así sale del PDF: cada Td es una línea).
const TABLA_LINEAS = [
  'Resumen del proyecto', 'PRIMA TOTAL', '238,37 €',
  'TERCEROS', 'TERCEROS AMPLIADO',
  'Responsabilidad civil obligatoria', 'Incluida', 'Incluida',
  'Robo', 'No incluida', 'Incluida',
  'Lunas', 'No incluida', 'Límite 600 €',
  'Daños propios', 'No incluida', 'Franquicia 300 €',
]

test('tabla por columnas (celdas en líneas sueltas): cada producto lee SU columna; ninguno copia la del otro', () => {
  const m = coberturasPorProducto(TABLA_LINEAS, PRODUCTOS)
  const t = m.get('terceros')!, a = m.get('terceros ampliado')!
  assert.equal(t.coberturas.length, 4)
  assert.equal(a.coberturas.length, 4)
  const por = (r: typeof t) => Object.fromEntries(r.coberturas.map((c) => [c.clave, c]))
  assert.equal(por(t)['Robo']!.estado, 'excluida')
  assert.equal(por(a)['Robo']!.estado, 'incluida')
  assert.equal(por(t)['Lunas']!.estado, 'excluida')
  assert.equal(por(a)['Lunas']!.limite, 600)
  assert.equal(por(a)['Daños propios']!.franquicia, 300)
  assert.equal(por(t)['Daños propios']!.franquicia, null)
})

test('tabla por columnas (fila en una línea con separadores)', () => {
  const l = ['TERCEROS', 'TERCEROS AMPLIADO', 'Robo   No incluida   Incluida', 'Lunas   No incluida   Límite 600 €']
  const m = coberturasPorProducto(l, PRODUCTOS)
  assert.equal(m.get('terceros')!.coberturas[0]!.estado, 'excluida')
  assert.equal(m.get('terceros ampliado')!.coberturas[0]!.estado, 'incluida')
  assert.equal(m.get('terceros ampliado')!.coberturas[1]!.limite, 600)
})

test('filas que no traen exactamente un valor por columna se descartan (nunca se inventa ni se copia)', () => {
  const r = coberturasDeColumnas(['Robo', 'Incluida', 'Lunas', 'No incluida', 'Incluida', 'Incluida', 'Incendio', 'Incluida', 'Incluida'], 2)
  assert.deepEqual(r[0]!.coberturas.map((c) => c.clave), ['Incendio'])
  assert.deepEqual(r[1]!.coberturas.map((c) => c.clave), ['Incendio'])
  const solo = coberturasPorProducto(['TERCEROS', 'TERCEROS AMPLIADO', 'Robo', 'Incluida'], PRODUCTOS)
  assert.equal(solo.size, 0, 'una columna sola con dos productos no se reparte')
})

test('secciones separadas (cabecera, contenido, cabecera, contenido) siguen funcionando como antes', () => {
  const l = ['TERCEROS', 'Robo   No incluida', 'Lunas   Incluida', 'TERCEROS AMPLIADO', 'Robo   Incluida', 'Lunas   Incluida', 'Incendio   Incluida']
  const m = coberturasPorProducto(l, PRODUCTOS)
  assert.equal(m.get('terceros')!.coberturas.length, 2)
  assert.equal(m.get('terceros ampliado')!.coberturas.length, 3)
})

test('de extremo a extremo con un PDF sintético: la tabla por columnas sale del texto del PDF', () => {
  const contenido = 'BT ' + TABLA_LINEAS.map((x) => `(${x.replace(/[()\\]/g, '')}) Tj T*`).join(' ') + ' ET'
  const z = deflateSync(Buffer.from(contenido, 'latin1'))
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n'), z, Buffer.from('\nendstream\nendobj\n%%EOF\n')])
  const m = coberturasPorProducto(textoDePdf(pdf).split('\n'), PRODUCTOS)
  assert.equal(m.get('terceros')!.coberturas.find((c) => c.clave === 'Robo')!.estado, 'excluida')
  assert.equal(m.get('terceros ampliado')!.coberturas.find((c) => c.clave === 'Robo')!.estado, 'incluida')
})

test('diagnóstico: producto sin garantías y PDF bajado → ESTRUCTURA (formas), sin filtrar NIF, matrícula, nombre ni dirección', async () => {
  const { diagnosticoGarantiasMapfre, estructuraPdfMapfre } = await import('../src/adapters/mapfre/garantias.ts')
  const l = [
    'Tomador: Juan Ficticio Pérez', 'NIF 12345678Z', 'Matrícula 0000ZZZ', 'Calle Inventada 7, 99999 Villaejemplo',
    'TERCEROS', 'Robo', 'Texto libre raro sin sentido 4567', 'TERCEROS AMPLIADO', 'Responsabilidad civil obligatoria', 'Incluida', '300 €',
  ]
  const e = estructuraPdfMapfre(l, PRODUCTOS)
  assert.match(e, /CABECERA:TERCEROS/); assert.match(e, /CABECERA:TERCEROS AMPLIADO/)
  assert.match(e, /ETIQUETA\(robo\)/); assert.match(e, /ETIQUETA\(rc\)/); assert.match(e, /VALOR\(Incluida\)/); assert.match(e, /VALOR\(importe\)/); assert.match(e, /OTRO\(\d+\)/)
  for (const prohibido of ['12345678Z', '0000ZZZ', 'Ficticio', 'Inventada', 'Villaejemplo', '99999', 'Texto libre', '4567']) assert.equal(e.includes(prohibido), false, prohibido)
  assert.ok(e.length <= 600)
  const d = diagnosticoGarantiasMapfre({ pdfBytes: 5000, pdfLineas: l.length, deLaPdf: new Map(), deLaPantalla: new Map(), productos: PRODUCTOS, lineasPdf: l })
  assert.match(d, /Estructura del PDF: \[/)
  assert.equal(/12345678Z|0000ZZZ|Ficticio/.test(d), false)
  const sin = diagnosticoGarantiasMapfre({ pdfBytes: 5000, pdfLineas: l.length, deLaPdf: coberturasPorProducto(TABLA_LINEAS, PRODUCTOS), deLaPantalla: new Map(), productos: PRODUCTOS, lineasPdf: TABLA_LINEAS })
  assert.doesNotMatch(sin, /Estructura del PDF/)
})
