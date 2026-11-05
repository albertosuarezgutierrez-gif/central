// Case a tres bandas. Dos sectores: TALLER (recambios, unidades y aceite a granel) y FONTANERÍA (tubería por metros, codos).
// Cepos vistos FALLAR (05/11/2026), uno por aserción, y restaurados:
// (1) en casarTresBandas no comprobar el precio (`ref`) → rojo «diferencia de precio».
// (2) no anotar `linea_de_mas` → rojo «línea de más».
// (3) comparar el IVA solo si `fl.ivaPb > ivaRef` → rojo «IVA distinto» (21 % esperado, 10 % facturado).
// (4) comparar el NIF sin normalizar el prefijo ES → rojo «NIF con prefijo ES casa».
// (5) dar por bueno un NIF del proveedor desconocido → rojo «NIF del proveedor sin registrar».
// (6) quitar la comprobación del total → rojo «total que no cuadra».
// (7) en `emparejar` quitar la pasada 2 (referencia dentro de la descripción) → rojo «fontanería: referencia en la descripción».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casarTresBandas, tolerancias, type BorradorFacturaRecibida, type LineaAlbaranBanda, type LineaPedidoBanda } from '../src/index.ts'

// ── Taller: 4 filtros a 6,50 € y 5 litros de aceite (granel en ml) a 8,00 €/L, IVA 21 % ──
const pedidoTaller: LineaPedidoBanda[] = [
  { id: 'p1', clave: 'W712/75', descripcion: 'Filtro aceite Mann W712/75', cantidadMil: 4000, precioUnitCent: 650, ivaPb: 2100 },
  { id: 'p2', clave: null, descripcion: 'Aceite 5W30 granel', cantidadMil: 5000, precioUnitCent: 800, ivaPb: 2100 },
]
const albaranTaller: LineaAlbaranBanda[] = [
  { id: 'a1', pedidoLineaId: 'p1', clave: 'W712/75', descripcion: 'Filtro aceite Mann W712/75', cantidadMil: 4000, precioUnitCent: null, ivaPb: 2100 },
  { id: 'a2', pedidoLineaId: 'p2', clave: null, descripcion: 'Aceite 5W30 granel', cantidadMil: 5000, precioUnitCent: null, ivaPb: 2100 },
]
// base = 26,00 + 40,00 = 66,00; cuota 13,86; total 79,86
const facturaTaller = (o: Partial<BorradorFacturaRecibida> = {}): BorradorFacturaRecibida => ({
  nifEmisor: 'B41234567', nombreEmisor: 'Recambios Sur SL', nifReceptor: 'B90000000', numero: 'F-2026-118', fecha: '2026-11-03', divisa: 'EUR',
  lineas: [
    { clave: 'W712/75', descripcion: 'FILTRO ACEITE W712/75', cantidadMil: 4000, precioUnitCent: 650, ivaPb: 2100, importeCent: 2600 },
    { clave: null, descripcion: 'Aceite 5W30 granel', cantidadMil: 5000, precioUnitCent: 800, ivaPb: 2100, importeCent: 4000 },
  ],
  bases: [{ ivaPb: 2100, baseCent: 6600, cuotaCent: 1386 }], retencionCent: 0, totalCent: 7986, ...o,
})
const casar = (factura: BorradorFacturaRecibida, nif: string | null = 'B41234567', extra: object = {}) =>
  casarTresBandas({ nifProveedor: nif, pedido: pedidoTaller, albaran: albaranTaller, factura, ...extra })
const tipos = (r: ReturnType<typeof casar>) => r.diferencias.filter((d) => d.bloquea).map((d) => d.tipo)

test('taller: case exacto → cuadra, sin diferencias, parejas con el precio de la factura', () => {
  const r = casar(facturaTaller())
  assert.equal(r.cuadra, true, JSON.stringify(r.diferencias))
  assert.deepEqual(r.diferencias, [])
  assert.deepEqual(r.parejas.map((p) => [p.albaranLineaId, p.precioUnitCent, p.ivaPb]), [['a1', 650, 2100], ['a2', 800, 2100]])
  assert.equal(r.totales.totalCent, 7986)
})

test('diferencia de precio', () => {
  const f = facturaTaller()
  f.lineas[0] = { ...f.lineas[0], precioUnitCent: 690, importeCent: 2760 }
  f.bases = [{ ivaPb: 2100, baseCent: 6760, cuotaCent: 1420 }]
  f.totalCent = 8180
  const r = casar(f)
  assert.equal(r.cuadra, false)
  assert.deepEqual(tipos(r), ['precio'])
  const d = r.diferencias[0]
  assert.equal(d.esperado, 650)
  assert.equal(d.encontrado, 690)
  // dentro de la tolerancia configurable sí cuadra
  assert.equal(casar(f, 'B41234567', { tolerancias: { precioPb: 700 } }).cuadra, true)
})

test('línea de más', () => {
  const f = facturaTaller()
  f.lineas.push({ clave: 'PORTES', descripcion: 'Portes', cantidadMil: 1000, precioUnitCent: 500, ivaPb: 2100, importeCent: 500 })
  f.bases = [{ ivaPb: 2100, baseCent: 7100, cuotaCent: 1491 }]
  f.totalCent = 8591
  const r = casar(f)
  assert.equal(r.cuadra, false)
  assert.deepEqual(tipos(r), ['linea_de_mas'])
  assert.equal(r.diferencias[0].facturaLinea, 2)
})

test('línea recibida sin facturar', () => {
  const f = facturaTaller({ lineas: [facturaTaller().lineas[0]], bases: [{ ivaPb: 2100, baseCent: 2600, cuotaCent: 546 }], totalCent: 3146 })
  assert.deepEqual(tipos(casar(f)), ['linea_sin_facturar'])
})

test('IVA distinto (21 % esperado, 10 % facturado)', () => {
  const f = facturaTaller()
  f.lineas[1] = { ...f.lineas[1], ivaPb: 1000 }
  f.bases = [{ ivaPb: 1000, baseCent: 4000, cuotaCent: 400 }, { ivaPb: 2100, baseCent: 2600, cuotaCent: 546 }]
  f.totalCent = 7546
  const r = casar(f)
  assert.equal(r.cuadra, false)
  assert.deepEqual(tipos(r), ['iva'])
})

test('NIF distinto', () => {
  const r = casar(facturaTaller({ nifEmisor: 'B11111111' }))
  assert.deepEqual(tipos(r), ['nif'])
})
test('NIF con prefijo ES casa', () => {
  assert.equal(casar(facturaTaller(), 'ES-B41234567').cuadra, true)
})
test('NIF del proveedor sin registrar o no leído: NO se da por bueno', () => {
  assert.deepEqual(tipos(casar(facturaTaller(), null)), ['nif_desconocido'])
  assert.deepEqual(tipos(casar(facturaTaller({ nifEmisor: null }))), ['nif_no_leido'])
})
test('total que no cuadra', () => {
  assert.deepEqual(tipos(casar(facturaTaller({ totalCent: 7990 }))), ['total'])
  assert.deepEqual(tipos(casar(facturaTaller({ totalCent: null }))), ['total_desconocido'])
})
test('datos desconocidos (null) bloquean: cantidad, IVA, precio sin referencia', () => {
  const f = facturaTaller()
  f.lineas[0] = { ...f.lineas[0], cantidadMil: null }
  assert.ok(tipos(casar(f)).includes('cantidad_desconocida'))
  const g = facturaTaller()
  g.lineas[0] = { ...g.lineas[0], ivaPb: null }
  assert.ok(tipos(casar(g)).includes('iva_desconocido'))
  const sinPrecio = casarTresBandas({
    nifProveedor: 'B41234567', pedido: pedidoTaller.map((p) => ({ ...p, precioUnitCent: null })), albaran: albaranTaller, factura: facturaTaller(),
  })
  assert.deepEqual([...new Set(sinPrecio.diferencias.map((d) => d.tipo))], ['precio_sin_referencia'])
  assert.equal(sinPrecio.cuadra, false)
})
test('retención: bloquea salvo que el cliente la admita', () => {
  const f = facturaTaller({ retencionCent: 990, totalCent: 6996 })
  assert.deepEqual(tipos(casar(f)), ['retencion'])
  assert.equal(casar(f, 'B41234567', { tolerancias: { admiteRetencion: true } }).cuadra, true)
})
test('recibido distinto de lo pedido es un AVISO, no bloquea', () => {
  const r = casarTresBandas({
    nifProveedor: 'B41234567', pedido: [{ ...pedidoTaller[0], cantidadMil: 6000 }, pedidoTaller[1]], albaran: albaranTaller, factura: facturaTaller(),
  })
  assert.equal(r.cuadra, true)
  assert.deepEqual(r.diferencias.map((d) => [d.tipo, d.bloquea]), [['recibido_distinto_de_pedido', false]])
})
test('tolerancias de la config: negativas o absurdas no abren la puerta', () => {
  const t = tolerancias({ precioUnitCent: -5, totalCent: 1e12, exigirPrecioReferencia: undefined as never })
  assert.equal(t.precioUnitCent, 1)
  assert.equal(t.totalCent, 10_000)
  assert.equal(t.exigirPrecioReferencia, true)
})

// ── Fontanería: 25 m de tubo multicapa a 1,85 €/m, 10 codos a 0,92 €, IVA 21 %. La referencia del albarán va DENTRO de la
//    descripción de la factura (formato habitual del almacén de fontanería). ──
test('fontanería: referencia en la descripción', () => {
  const pedido: LineaPedidoBanda[] = [
    { id: 'fp1', clave: 'MC1620', descripcion: 'Tubo multicapa 16x2', cantidadMil: 25_000, precioUnitCent: 185, ivaPb: 2100 },
    { id: 'fp2', clave: 'CD16', descripcion: 'Codo 90 prensar 16', cantidadMil: 10_000, precioUnitCent: 92, ivaPb: 2100 },
  ]
  const albaran: LineaAlbaranBanda[] = pedido.map((p, i) => ({ ...p, id: `fa${i + 1}`, pedidoLineaId: p.id, precioUnitCent: null }))
  // 46,25 + 9,20 = 55,45 → cuota 11,64 → 67,09
  const factura: BorradorFacturaRecibida = {
    nifEmisor: 'B29876543', nombreEmisor: 'Saneamientos del Sur', nifReceptor: null, numero: 'A/2026/0042', fecha: '2026-10-30', divisa: null,
    lineas: [
      { clave: null, descripcion: 'MC1620 - TUBO MULTICAPA PEX-AL-PEX 16x2,0', cantidadMil: 25_000, precioUnitCent: 185, ivaPb: 2100, importeCent: 4625 },
      { clave: null, descripcion: 'CD16 CODO 90º PRENSAR', cantidadMil: 10_000, precioUnitCent: 92, ivaPb: 2100, importeCent: 920 },
    ],
    bases: [{ ivaPb: 2100, baseCent: 5545, cuotaCent: 1164 }], retencionCent: null, totalCent: 6709,
  }
  const r = casarTresBandas({ nifProveedor: 'B29876543', pedido, albaran, factura })
  assert.equal(r.cuadra, true, JSON.stringify(r.diferencias))
  assert.deepEqual(r.parejas.map((p) => p.albaranLineaId), ['fa1', 'fa2'])
  // y en fontanería la diferencia de cantidad también se ve
  const corta = { ...factura, lineas: [{ ...factura.lineas[0], cantidadMil: 20_000, importeCent: 3700 }, factura.lineas[1]], bases: [{ ivaPb: 2100, baseCent: 4620, cuotaCent: 970 }], totalCent: 5590 }
  assert.deepEqual(casarTresBandas({ nifProveedor: 'B29876543', pedido, albaran, factura: corta }).diferencias.filter((d) => d.bloquea).map((d) => d.tipo), ['cantidad'])
})

test('los textos de las diferencias usan dinero en formato español', async () => {
  const { eur } = await import('../src/index.ts')
  assert.equal(eur(216249), '2.162,49€')
  assert.equal(eur(5), '0,05€')
  assert.equal(eur(-123456789), '-1.234.567,89€')
})
