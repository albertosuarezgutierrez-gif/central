import test from 'node:test'
import assert from 'node:assert/strict'
import {
  casarFacturaConPago,
  desgloseDeFactura,
  pisoDeConcepto,
  validarFactura,
  type FacturaCruda,
} from './factura-limpieza.ts'

const TARIFAS: Record<string, number> = {
  prop_busto_reform: 20,
  prop_duplex_center: 25,
  prop_luxury_busto: 28,
  prop_house_sevillana: 90,
}

// Cifras REALES de la factura 2025/333 de Si que Brilla (julio 2026, pagada el 03/08/2026):
// LUXURY 4×28 + BUSTOS REFORMA 2×20 + DUPLEX 2×25 + CASA SOCORRO 3×90 = 472€ de limpieza,
// lavandería 86,18 + 86,53 = 172,71€, base 644,71€, IVA 135,39€, total 780,10€.
// Los IMPORTES son del documento; la forma del objeto es la que devuelve el lector, no el layout
// del PDF (ver la cabecera de `factura-limpieza.ts`: el layout lo lee la IA, aquí se valida).
const FACTURA_JULIO: FacturaCruda = {
  numero: '2025/333',
  periodo: '2026-07',
  total: 780.10,
  base: 644.71,
  iva: 135.39,
  limpieza: [
    { concepto: 'LUXURY',          sesiones: 4, tarifa: 28, importe: 112 },
    { concepto: 'BUSTOS REFORMA',  sesiones: 2, tarifa: 20, importe: 40 },
    { concepto: 'DUPLEX',          sesiones: 2, tarifa: 25, importe: 50 },
    { concepto: 'CASA SOCORRO',    sesiones: 3, tarifa: 90, importe: 270 },
  ],
  lavanderia: [
    { concepto: 'LAVANDERÍA (kg)', importe: 86.18 },
    { concepto: 'LAVANDERÍA (kg)', importe: 86.53 },
  ],
}

test('la factura real de julio se valida y cuadra con su total', () => {
  const { factura, avisos } = validarFactura(FACTURA_JULIO, TARIFAS)
  assert.ok(factura)
  assert.deepEqual(avisos, [])
  assert.equal(factura.base, 644.71)
  assert.equal(factura.iva, 135.39)
  assert.equal(factura.lavanderia, 172.71)
  assert.equal(factura.limpieza.length, 4)
  assert.equal(factura.numero, '2025/333')
  assert.equal(factura.periodo, '2026-07')
})

test('el desglose con IVA coincide al céntimo con lo que ya calculaba el P&L por inferencia', () => {
  const { factura } = validarFactura(FACTURA_JULIO, TARIFAS)
  const d = desgloseDeFactura(factura!)
  assert.equal(d.limpieza.get('prop_house_sevillana'), 326.70)
  assert.equal(d.limpieza.get('prop_luxury_busto'), 135.52)
  assert.equal(d.limpieza.get('prop_busto_reform'), 48.40)
  assert.equal(d.limpieza.get('prop_duplex_center'), 60.50)
  assert.equal(d.lavanderia, 208.98)
  const suma = [...d.limpieza.values()].reduce((s, n) => s + n, 0) + d.lavanderia
  assert.ok(Math.abs(suma - 780.10) < 0.005, `suma ${suma}`)
})

test('una lectura que no suma el total NO produce desglose (aunque las líneas parezcan sanas)', () => {
  // Falta una línea de lavandería: todo lo demás es correcto y aun así no se afirma nada.
  const cruda = { ...FACTURA_JULIO, lavanderia: [{ concepto: 'LAVANDERÍA', importe: 86.18 }] }
  const { factura, avisos } = validarFactura(cruda, TARIFAS)
  assert.equal(factura, null)
  assert.match(avisos[0], /no cuadra con el total/)
})

test('sin total leído no hay nada que validar contra: null', () => {
  assert.equal(validarFactura({ ...FACTURA_JULIO, total: null }, TARIFAS).factura, null)
  assert.equal(validarFactura({ ...FACTURA_JULIO, total: 0 }, TARIFAS).factura, null)
})

test('una línea cuyo importe no es sesiones × tarifa se descarta y tumba el cuadre', () => {
  const cruda: FacturaCruda = {
    ...FACTURA_JULIO,
    limpieza: [
      ...FACTURA_JULIO.limpieza.slice(0, 3),
      { concepto: 'CASA SOCORRO', sesiones: 3, tarifa: 90, importe: 250 }, // 3×90 = 270, no 250
    ],
  }
  const { factura, avisos } = validarFactura(cruda, TARIFAS)
  assert.equal(factura, null)
  assert.ok(avisos.some(a => /3×90€ son 270€/.test(a)))
})

test('una SUBIDA de tarifas cuadra pero se declara — es la señal de que la inferencia dejará de valer', () => {
  // Mismas salidas, Socorro a 95€: 4×28+2×20+2×25+3×95 = 487€ + 172,71 = 659,71 → 798,25€.
  const cruda: FacturaCruda = {
    ...FACTURA_JULIO,
    total: 798.25,
    base: 659.71,
    iva: 138.54,
    limpieza: [
      ...FACTURA_JULIO.limpieza.slice(0, 3),
      { concepto: 'CASA SOCORRO', sesiones: 3, tarifa: 95, importe: 285 },
    ],
  }
  const { factura, avisos } = validarFactura(cruda, TARIFAS)
  assert.ok(factura, 'la factura es válida: sus líneas suman su total')
  assert.ok(avisos.some(a => /Tarifa distinta de la contratada.*95.*90/.test(a)))
  assert.equal(desgloseDeFactura(factura).limpieza.get('prop_house_sevillana'), 344.85)
})

test('un piso que no se reconoce no se inventa: se descarta y el cuadre lo delata', () => {
  const cruda: FacturaCruda = {
    ...FACTURA_JULIO,
    limpieza: [...FACTURA_JULIO.limpieza.slice(0, 3), { concepto: 'PISO NUEVO X', sesiones: 3, tarifa: 90, importe: 270 }],
  }
  const { factura, avisos } = validarFactura(cruda, TARIFAS)
  assert.equal(factura, null)
  assert.ok(avisos.some(a => /sin piso reconocible/.test(a)))
})

test('una factura SOLO de limpieza (sin lavandería) es válida', () => {
  // Patrón real de los primeros meses del año: 888€ de limpieza × 1,21 = 1.074,48€.
  const cruda: FacturaCruda = {
    numero: '2025/120',
    periodo: '2026-03',
    total: 1074.48,
    limpieza: [
      { concepto: 'LUXURY', sesiones: 6, tarifa: 28 },
      { concepto: 'BUSTOS REFORMA', sesiones: 8, tarifa: 20 },
      { concepto: 'DUPLEX', sesiones: 8, tarifa: 25 },
      { concepto: 'CASA SOCORRO', sesiones: 4, tarifa: 90 },
    ],
    lavanderia: [],
  }
  const { factura } = validarFactura(cruda, TARIFAS)
  assert.ok(factura)
  assert.equal(factura.lavanderia, 0)
  assert.equal(desgloseDeFactura(factura).lavanderia, 0)
})

test('pisoDeConcepto reconoce las variantes que usa la factura', () => {
  assert.equal(pisoDeConcepto('Luxury (5x28€)'), 'prop_luxury_busto')
  assert.equal(pisoDeConcepto('Bustos Reforma (3x20€)'), 'prop_busto_reform')
  assert.equal(pisoDeConcepto('Busto Reform'), 'prop_busto_reform')
  assert.equal(pisoDeConcepto('Duplex'), 'prop_duplex_center')
  assert.equal(pisoDeConcepto('Dúplex Center'), 'prop_duplex_center')
  assert.equal(pisoDeConcepto('CASA SOCORRO'), 'prop_house_sevillana')
  assert.equal(pisoDeConcepto('Socorro 24'), 'prop_house_sevillana')
  assert.equal(pisoDeConcepto('Limpieza general oficina'), null)
})

test('casarFacturaConPago: por total exacto y sin reutilizar la ya casada', () => {
  const a = { total: 780.10, id: 'a' }
  const b = { total: 780.10, id: 'b' }
  const usadas = new Set<typeof a>()
  const p1 = casarFacturaConPago(780.10, [a, b], usadas)
  assert.equal(p1?.id, 'a')
  usadas.add(p1!)
  assert.equal(casarFacturaConPago(780.10, [a, b], usadas)?.id, 'b')
  usadas.add(b)
  assert.equal(casarFacturaConPago(780.10, [a, b], usadas), null)
  assert.equal(casarFacturaConPago(902.65, [a, b], new Set()), null)
})
