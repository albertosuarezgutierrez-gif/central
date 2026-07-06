import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarPorKeywords, normalizarTexto } from './subcategoria-keywords.ts'

test('supermercados obvios', () => {
  assert.equal(clasificarPorKeywords('COMPRA', 'MERCADONA S.A.'), 'supermercado')
  assert.equal(clasificarPorKeywords('SUPERMERCADOS DIA', null), 'supermercado')
  assert.equal(clasificarPorKeywords(null, 'LIDL SEVILLA'), 'supermercado')
  assert.equal(clasificarPorKeywords('PAGO EN CARREFOUR EXPRESS', null), 'supermercado')
})

test('bares y restaurantes', () => {
  assert.equal(clasificarPorKeywords(null, 'BAR LA ESQUINA'), 'restaurante_bar')
  assert.equal(clasificarPorKeywords('RESTAURANTE EL FARO', null), 'restaurante_bar')
  assert.equal(clasificarPorKeywords(null, 'GLOVO'), 'restaurante_bar')
})

test('gasolina y transporte no se confunden', () => {
  assert.equal(clasificarPorKeywords(null, 'REPSOL E.S. ALCALA'), 'gasolina')
  assert.equal(clasificarPorKeywords(null, 'UBER TRIP'), 'transporte')
  assert.equal(clasificarPorKeywords(null, 'RENFE VIAJEROS'), 'transporte')
})

test('suscripciones', () => {
  assert.equal(clasificarPorKeywords(null, 'NETFLIX.COM'), 'suscripcion')
  assert.equal(clasificarPorKeywords('PAGO CLAUDE.AI ANTHROPIC', null), 'suscripcion')
})

test('suministros vs supermercado (DIGI/IBERDROLA)', () => {
  assert.equal(clasificarPorKeywords('RECIBO DIGI SPAIN TELECO', null), 'suministros_piso')
  assert.equal(clasificarPorKeywords(null, 'IBERDROLA CLIENTES'), 'suministros_piso')
})

test('farmacia', () => {
  assert.equal(clasificarPorKeywords(null, 'FARMACIA LOPEZ'), 'farmacia')
})

test('devuelve null cuando nada casa', () => {
  assert.equal(clasificarPorKeywords('TRANSFERENCIA RECIBIDA', 'JUAN PEREZ'), null)
  assert.equal(clasificarPorKeywords('', ''), null)
  assert.equal(clasificarPorKeywords(null, null), null)
})

test("'BAR ' no casa dentro de 'BARCELONA'", () => {
  assert.equal(clasificarPorKeywords(null, 'HOTEL BARCELONA'), null)
})

test('comercios locales reales (datos de producción de Alberto)', () => {
  // Alimentación local: hornos/panaderías, ultramarinos, marisco, tiendas de alimentación
  assert.equal(clasificarPorKeywords('COMPRA EN HORNO NUEVA FLORIDA', null), 'supermercado')
  assert.equal(clasificarPorKeywords('COMPRA EN IBA.EZ ULTRAMARINO', null), 'supermercado')
  assert.equal(clasificarPorKeywords('COMPRA EN MARISCOS GONZALEZ S.L.', null), 'supermercado')
  assert.equal(clasificarPorKeywords('COMPRA EN ALIMENTACION BIZCOCHO DEL', null), 'supermercado')
  // Farmacia abreviada como FCIA.
  assert.equal(clasificarPorKeywords('COMPRA EN FCIA.MARINA DE LA CAMARA', null), 'farmacia')
  // Ropa/deporte por marca
  assert.equal(clasificarPorKeywords('COMPRA EN adidas Espana S.A.U.', null), 'deporte')
  assert.equal(clasificarPorKeywords('COMPRA EN GOCCO C.C.MORALEJA GREEN', null), 'ropa')
  // Estanco / tanatorio → otros_gasto (última prioridad)
  assert.equal(clasificarPorKeywords('COMPRA EN EXPENDIDURIA 113', null), 'otros_gasto')
  assert.equal(clasificarPorKeywords('COMPRA EN TANATORIO SE-30 SEVILL', null), 'otros_gasto')
})

test('vivienda: comunidad de propietarios', () => {
  // Caso real de la captura de Alberto.
  assert.equal(clasificarPorKeywords('COMPRA', 'CDAD. DE PROP. MONTE CARMELO 68'), 'comunidad')
  assert.equal(clasificarPorKeywords('RECIBO COMUNIDAD DE PROPIETARIOS', null), 'comunidad')
  assert.equal(clasificarPorKeywords(null, 'ADMINISTRACION DE FINCAS GARCIA'), 'comunidad')
  assert.equal(clasificarPorKeywords('MANCOMUNIDAD LOS NARANJOS', null), 'comunidad')
})

test('vivienda: IBI y tributos municipales', () => {
  assert.equal(clasificarPorKeywords('RECIBO IBI 2026', null), 'ibi')
  assert.equal(clasificarPorKeywords('IMPUESTO BIENES INMUEBLES', null), 'ibi')
  assert.equal(clasificarPorKeywords(null, 'PATRONATO RECAUDACION PROVINCIAL'), 'ibi')
  assert.equal(clasificarPorKeywords('TASA DE BASURA 2026', null), 'ibi')
})

test("'IBI' no casa dentro de IBIZA (límites de palabra)", () => {
  assert.equal(clasificarPorKeywords(null, 'HOTEL IBIZA PLAYA'), null)
  assert.equal(clasificarPorKeywords('VUELO A IBIZA', null), null)
})

test('servicios personales → otros_gasto', () => {
  assert.equal(clasificarPorKeywords('COMPRA EN PELUQUERIA MARISA', null), 'otros_gasto')
  assert.equal(clasificarPorKeywords(null, 'CLINICA VETERINARIA EL BOSQUE'), 'otros_gasto')
  assert.equal(clasificarPorKeywords('COMPRA EN TINTORERIA ELENA', null), 'otros_gasto')
})

test('normalizarTexto quita acentos y envuelve en espacios', () => {
  assert.equal(normalizarTexto('Café'), ' CAFE ')
  assert.equal(normalizarTexto(null), '')
  assert.equal(normalizarTexto('  '), '')
})
