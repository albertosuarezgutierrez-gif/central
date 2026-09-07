// apps/plataforma/lib/contable/documentos-tipos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarExtraccion, motivoNoLeido, resumenDocumento, refFactura, accionConciliar, matchDeCruce, nombreArchivoFactura } from './documentos-tipos.ts'

const FACTURA = { proveedor: 'Endesa', fecha: '2026-05-10', total: 84.5, numero: 'F-1', concepto: null }
const MOV = { movId: 'mov-1', fecha: '2026-05-09', concepto: 'RECIBO ENDESA', importe: -84.5, banco: 'BBVA' }
const COBERTURA = [{ banco: 'BBVA', ultima: '2026-05-20' }, { banco: 'Kutxabank', ultima: '2026-05-08' }]

test('source none → no leído (no inventa nada)', () => {
  const r = interpretarExtraccion({ total: 42, fecha: '2026-05-01' }, 'none')
  assert.equal(r.ok, false)
})

// ── Por qué NO se ha leído. El caso que los motivó: «movimientos (2).pdf» (02/09/2026) recibió la
// frase genérica «prueba con una foto más nítida o un PDF que tenga texto», que a un PDF le pide una
// foto y no dice si el documento se ha llegado a mirar. Cada desenlace manda a un sitio distinto.
test('sin motivo → se conserva la frase histórica (llamadas antiguas)', () => {
  assert.match(motivoNoLeido(), /No he podido leer el documento/)
  assert.match(motivoNoLeido(null), /No he podido leer el documento/)
})

test('PDF que ni se abre → lo dice y NO pide una foto más nítida', () => {
  const m = motivoNoLeido({ clase: 'pdf_ilegible', detalle: 'bad XRef entry' })
  assert.match(m, /no he podido ni ABRIR el PDF/i)
  assert.match(m, /bad XRef entry/)
  assert.match(m, /contraseña/i)
  assert.doesNotMatch(m, /nítida/i)   // el problema no es la calidad de la imagen
})

test('PDF escaneado sin OCR → declara que NO lo ha mirado', () => {
  const m = motivoNoLeido({ clase: 'pdf_sin_texto', paginas: 3, ocr: 'no_intentado' })
  assert.match(m, /3 páginas/)
  assert.match(m, /imagen escaneada/i)
  assert.match(m, /no lo he mirado/i)
})

test('escaneado + no se pudo rasterizar → NO llegó a mirarse (nunca «no pone nada»)', () => {
  const m = motivoNoLeido({ clase: 'pdf_sin_texto', paginas: 1, ocr: 'sin_paginas' })
  assert.match(m, /1 página\b/)                 // singular, no «1 páginas»
  assert.match(m, /NO lo he llegado a mirar/i)
})

test('escaneado + la visión falló → «sin mirar», no «no hay datos»', () => {
  const m = motivoNoLeido({ clase: 'pdf_sin_texto', paginas: 2, ocr: 'error' })
  assert.match(m, /SIN mirar/i)
  assert.match(m, /no es que no ponga nada/i)
  assert.match(m, /Reinténtalo/i)
})

test('escaneado + leído por visión sin importe → sí se miró, y no se inventa nada', () => {
  const m = motivoNoLeido({ clase: 'pdf_sin_texto', paginas: 1, ocr: 'sin_datos' })
  assert.match(m, /Lo he leído por visión/i)
  assert.match(m, /no me los invento/i)
})

test('formato no soportado → nombra el tipo y no habla de nitidez', () => {
  const m = motivoNoLeido({ clase: 'formato_no_soportado', mimeType: 'application/zip' })
  assert.match(m, /application\/zip/)
  assert.doesNotMatch(m, /nítida/i)
})

test('todo motivo de PDF/formato enruta al extracto por /banca', () => {
  for (const m of [
    motivoNoLeido({ clase: 'pdf_sin_texto', paginas: 1, ocr: 'no_intentado' }),
    motivoNoLeido({ clase: 'pdf_sin_texto', paginas: 1, ocr: 'sin_paginas' }),
    motivoNoLeido({ clase: 'pdf_sin_texto', paginas: 1, ocr: 'error' }),
    motivoNoLeido({ clase: 'pdf_sin_texto', paginas: 1, ocr: 'sin_datos' }),
    motivoNoLeido({ clase: 'formato_no_soportado', mimeType: 'text/csv' }),
  ]) assert.match(m, /\/banca/)
})

test('source none con motivo → interpretarExtraccion lo propaga', () => {
  const r = interpretarExtraccion({}, 'none', { clase: 'pdf_sin_texto', paginas: 4, ocr: 'sin_datos' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.motivo, /4 páginas/)
})

test('factura legible (texto) → estructurada y normalizada', () => {
  const r = interpretarExtraccion(
    { proveedor: '  Endesa  ', fecha: '2026-05-10', total: -84.5, numero_factura: 'F-1', concepto: 'Luz' },
    'text',
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.factura.proveedor, 'Endesa')
    assert.equal(r.factura.total, 84.5)         // abs
    assert.equal(r.factura.fecha, '2026-05-10')
    assert.equal(r.factura.numero, 'F-1')
  }
})

test('imagen (visión) sin importe → sin datos (nunca inventa importe)', () => {
  const r = interpretarExtraccion({ proveedor: 'X', fecha: '2026-05-10', total: null }, 'vision')
  assert.equal(r.ok, false)
})

test('importe 0 → sin datos', () => {
  const r = interpretarExtraccion({ proveedor: 'X', fecha: '2026-05-10', total: 0 }, 'text')
  assert.equal(r.ok, false)
})

test('fecha inválida → sin datos', () => {
  const r = interpretarExtraccion({ proveedor: 'X', fecha: 'ayer', total: 10 }, 'vision')
  assert.equal(r.ok, false)
})

test('proveedor vacío → fallback', () => {
  const r = interpretarExtraccion({ fecha: '2026-01-02', total: 10 }, 'text')
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.factura.proveedor, 'Proveedor desconocido')
})

test('resumenDocumento con match pregunta si concilia (y el dinero va en formato español)', () => {
  const s = resumenDocumento(FACTURA, { estado: 'match', mov: MOV })
  assert.match(s, /Endesa/)
  assert.match(s, /84,50€/)
  assert.match(s, /10\/05\/2026/)
  assert.match(s, /concilio/i)
})

test('sin_match dice que SÍ ha mirado y hasta dónde llegan los extractos', () => {
  const s = resumenDocumento(FACTURA, { estado: 'sin_match', cobertura: COBERTURA })
  assert.match(s, /He mirado/i)
  assert.doesNotMatch(s, /todavía NO puedo/i)
  assert.match(s, /BBVA hasta el 20\/05\/2026/)
})

// El fallo fundacional (05 y 07/08/2026): la factura era posterior al último movimiento que había
// llegado del banco, y el agente contestaba «no encuentro un movimiento que cuadre» — afirmando una
// ausencia que no había podido comprobar.
test('sin_cobertura NO afirma que el cargo no exista: dice que aún no ha llegado', () => {
  const s = resumenDocumento(FACTURA, { estado: 'sin_cobertura', cobertura: COBERTURA })
  assert.match(s, /Todavía NO puedo decirte/i)
  assert.match(s, /Kutxabank hasta el 08\/05\/2026/)
  assert.doesNotMatch(s, /no hay ninguno/i)
})

test('ya_conciliado no se confunde con "no lo encuentro"', () => {
  const s = resumenDocumento(FACTURA, { estado: 'ya_conciliado', mov: MOV })
  assert.match(s, /ya está conciliado/i)
  assert.match(s, /09\/05\/2026/)
  assert.doesNotMatch(s, /no encuentro/i)
})

test('fuera_de_ventana propone el cargo lejano como pregunta', () => {
  const s = resumenDocumento(FACTURA, { estado: 'fuera_de_ventana', mov: { ...MOV, fecha: '2026-06-08' }, dias: 29 })
  assert.match(s, /29 días/)
  assert.match(s, /¿Es ese\?/)
})

test('matchDeCruce solo propone acción sobre un cargo conciliable', () => {
  assert.equal(matchDeCruce({ estado: 'match', mov: MOV })!.movId, 'mov-1')
  assert.equal(matchDeCruce({ estado: 'fuera_de_ventana', mov: MOV, dias: 20 })!.movId, 'mov-1')
  assert.equal(matchDeCruce({ estado: 'ya_conciliado', mov: MOV }), null)
  assert.equal(matchDeCruce({ estado: 'sin_cobertura', cobertura: COBERTURA }), null)
  assert.equal(matchDeCruce({ estado: 'sin_match', cobertura: [] }), null)
})

test('refFactura corta y con prefijo doc:', () => {
  const r = refFactura({ proveedor: 'Endesa', fecha: '2026-05-10', total: 84.5, numero: 'F-1', concepto: null })
  assert.equal(r, 'doc:Endesa F-1')
})

test('accionConciliar sin match → null (no propone nada)', () => {
  assert.equal(accionConciliar({ proveedor: 'X', fecha: '2026-05-10', total: 10, numero: null, concepto: null }, null), null)
})

test('accionConciliar con match → propuesta con movId y ref', () => {
  const p = accionConciliar(
    { proveedor: 'Endesa', fecha: '2026-05-10', total: 84.5, numero: 'F-1', concepto: null },
    { movId: 'mov-1', concepto: 'RECIBO ENDESA', importe: -84.5 },
  )
  assert.ok(p)
  assert.equal(p!.tipo, 'conciliar')
  assert.equal(p!.params.movId, 'mov-1')
  assert.equal(p!.params.facturaRef, 'doc:Endesa F-1')
  assert.match(p!.resumen, /Endesa/)
  assert.match(p!.resumen, /84,50€/)
})

// ── Archivado + contabilización de una factura subida a mano (07/09/2026) ────────────────────────
// El hueco que cierran: subir una factura por el chat la leía pero no la archivaba ni la
// contabilizaba, y el resumen no decía nada de eso — o sea, se leía como si sí.

test('nombre de archivo: renombra la foto del móvil por proveedor/fecha/importe, con su extensión', () => {
  assert.equal(
    nombreArchivoFactura(FACTURA, '20260907_093156.jpg'),
    '2026-05-10_Endesa_F-1_84.50.jpg',
  )
})

test('nombre de archivo: sin extensión reconocible cae a .pdf, y los acentos/signos no viajan', () => {
  const f = { proveedor: 'Gestoría Pérez & Cía', fecha: '2026-01-02', total: 1200, numero: null, concepto: null }
  assert.equal(nombreArchivoFactura(f, 'documento'), '2026-01-02_Gestoria-Perez-Cia_1200.00.pdf')
})

test('archivada + contabilizada → el resumen lo DICE (carpeta y libro)', () => {
  const t = resumenDocumento(FACTURA, { estado: 'sin_match', cobertura: COBERTURA }, {
    carpeta: 'Facturas/2026/05', url: 'https://drive/x', driveError: false, decision: 'auto',
  })
  assert.match(t, /Archivada en Drive \(Facturas\/2026\/05\)/)
  assert.match(t, /Contabilizada/)
})

test('Drive falla pero el gasto entra → se avisa del descuadre, no se calla', () => {
  const t = resumenDocumento(FACTURA, { estado: 'sin_match', cobertura: COBERTURA }, {
    carpeta: null, url: null, driveError: true, decision: 'bandeja',
  })
  assert.match(t, /NO he podido archivarla en Drive/)
  // Nombrar la pantalla es parte del aviso: «está en la bandeja» sin decir cuál no se ve.
  assert.match(t, /\/expenses\/pendientes/)
})

// Regla de la casa: un «no se ha intentado» no se cuenta como un «no hay». Si la cuenta no es la
// dueña del libro de gastos NO se archiva nada, y callarlo se leería como «hecho».
test('decision null (cuenta ajena al libro) → se declara que no se ha intentado', () => {
  const t = resumenDocumento(FACTURA, { estado: 'sin_match', cobertura: COBERTURA }, {
    carpeta: null, url: null, driveError: false, decision: null,
  })
  assert.match(t, /no es la dueña del libro de gastos/)
})

test('duplicado → dice que ya estaba, no la mete dos veces', () => {
  const t = resumenDocumento(FACTURA, { estado: 'match', mov: MOV }, {
    carpeta: 'Facturas/2026/05', url: 'u', driveError: false, decision: 'duplicado',
  })
  assert.match(t, /Ya estaba contabilizada/)
  assert.match(t, /¿Lo concilio\?/)   // el cruce bancario sigue intacto
})

test('sin archivado (llamada antigua, 2 argumentos) → el resumen no cambia', () => {
  const t = resumenDocumento(FACTURA, { estado: 'match', mov: MOV })
  assert.doesNotMatch(t, /Drive|Contabilizada|libro de gastos/)
})
