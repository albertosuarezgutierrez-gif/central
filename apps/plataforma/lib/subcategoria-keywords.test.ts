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

test('Bizum siempre gana, aunque el motivo mencione otra categoría', () => {
  assert.equal(clasificarPorKeywords('ENVIO BIZUM asiento', null), 'bizum')
  assert.equal(clasificarPorKeywords('ENVIO BIZUM padel', null), 'bizum')
  assert.equal(clasificarPorKeywords('ENVIO BIZUM bar tal', null), 'bizum')
})

test('financiación BanSabadell ya cancelada → otros_gasto', () => {
  assert.equal(clasificarPorKeywords('RECIBO BANSABADELL F.', null), 'otros_gasto')
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
  assert.equal(clasificarPorKeywords('RECIBO AYTO. SEVILLA', null), 'ibi')
})

test('impuestos estatales (IRPF/Hacienda) — separado de IBI', () => {
  assert.equal(clasificarPorKeywords('IMPUESTO DE HACIENDA IRPF 1005358505523', null), 'impuestos')
  assert.equal(clasificarPorKeywords('IMPUESTO DE HACIENDA', null), 'impuestos')
  assert.equal(clasificarPorKeywords('TRIBUT HACIENDA', null), 'impuestos')
  assert.equal(clasificarPorKeywords('IMPUESTO DE HACIENDA TASAS ORG. AUTONO 7915022', null), 'impuestos')
  // NO confundir con el IBI (tributo municipal de la vivienda)
  assert.equal(clasificarPorKeywords('IMPUESTO BIENES INMUEBLES', null), 'ibi')
})

test('Amazon abreviado por el banco (AMZN) → ocio', () => {
  assert.equal(clasificarPorKeywords('COMPRA EN AMZN Mktp ES', null), 'ocio')
  assert.equal(clasificarPorKeywords('COMPRA EN AMZN Mktp ES*Z97RC85F4', null), 'ocio')
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

test('Círculo Mercantil gana a deporte aunque el concepto diga GYM/PADEL', () => {
  // Caso real: el recibo del club trae 'GYM DUO' en el concepto, pero Alberto quiere TODO el
  // Círculo Mercantil bajo 'club' (comercio específico gana a la palabra genérica de categoría).
  assert.equal(clasificarPorKeywords('RECIBO CIRCULO MERCANTIL GYM DUO 2026', 'CIRCULO MERCANTIL E INDUSTRIAL'), 'club')
  assert.equal(clasificarPorKeywords('CIRCULO MERCANTIL PADEL', null), 'club')
  // Un gimnasio normal SÍ es deporte
  assert.equal(clasificarPorKeywords(null, 'BASIC FIT SEVILLA'), 'deporte')
})

test('recurrentes conocidos de Alberto (07/07/2026)', () => {
  assert.equal(clasificarPorKeywords(null, 'RECIBO D - MONTECARMELO'), 'comunidad')
  assert.equal(clasificarPorKeywords('RECIBO TOTAL GAS Y ELECT', null), 'suministros_piso')
  assert.equal(clasificarPorKeywords('COMPRA EN TEMU.COM', null), 'ocio')
  assert.equal(clasificarPorKeywords(null, 'COMPRA EN PETROPRIX GINES'), 'gasolina')
  assert.equal(clasificarPorKeywords('COMPRA EN PRIMAPRIX T88', null), 'supermercado')
  assert.equal(clasificarPorKeywords(null, 'COMPRA EN GALOS CMI S.L'), 'restaurante_bar')
  assert.equal(clasificarPorKeywords('COMPRA EN TUSSAM EMV', null), 'transporte')
  assert.equal(clasificarPorKeywords('PAGO CON TARJETA EN RESTAURANTES Y CAFETERIAS', null), 'restaurante_bar')
  assert.equal(clasificarPorKeywords(null, 'RECIBO ACPA SAN JOSE SSC'), 'colegio')
})

test('normalizarTexto quita acentos y envuelve en espacios', () => {
  assert.equal(normalizarTexto('Café'), ' CAFE ')
  assert.equal(normalizarTexto(null), '')
  assert.equal(normalizarTexto('  '), '')
})
