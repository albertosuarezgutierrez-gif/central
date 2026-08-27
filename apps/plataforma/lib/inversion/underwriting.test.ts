import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analizarInversion, type EntradaUnderwriting } from './underwriting.ts'
import type { Costes, FichaInmueble, MesMercado, PuertaLegal, Supuestos } from './tipos.ts'

/** Curva plana de 12 meses: sirve para comprobar aritmética sin ruido de temporada. */
const curvaPlana = (adr: number | null, ocupacion: number | null): MesMercado[] =>
  Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    adrGuest: adr,
    comparables: adr == null ? 0 : 5,
    ocupacionProxy: ocupacion,
  }))

const LEGAL_OK: PuertaLegal = {
  licenciaVUT: 'confirmada',
  registroUnico: 'confirmada',
  edificioCompleto: true,
  notas: [],
}

const FICHA: FichaInmueble = {
  referencia: 'demo',
  municipio: 'Conil de la Frontera',
  precio: 400_000,
  m2: 200,
  plazasTotales: 8,
  unidades: [
    { nombre: 'bajo', plazas: 4 },
    { nombre: 'primera', plazas: 4 },
  ],
  reforma: 0,
  gastosCompraPct: 0.1,
}

const COSTES_CERO: Costes = {
  comisionCanal: 0.1972,
  gestionPct: 0,
  limpiezaPorEstancia: 0,
  nochesPorEstancia: 5,
  ibiAnual: 0,
  seguroAnual: 0,
  suministrosAnual: 0,
  comunidadAnual: 0,
  mantenimientoPct: 0,
}

const SUPUESTOS: Supuestos = {
  ocupacionPorDefecto: null,
  rampaAnio1: 0.2,
  aniosHorizonte: 10,
  alternativaLiquida: 0.07,
  largaDuracionMensual: null,
  revalorizacionAnual: 0,
  comisionRecuperableAnual: null,
}

const entrada = (p: Partial<EntradaUnderwriting> = {}): EntradaUnderwriting => ({
  ficha: FICHA,
  legal: LEGAL_OK,
  mercado: [
    { aforo: 8, curva: curvaPlana(550, 0.4) },
    { aforo: 4, curva: curvaPlana(332.5, 0.4) },
  ],
  costes: COSTES_CERO,
  financiacion: null,
  supuestos: SUPUESTOS,
  ...p,
})

// ── La puerta legal ─────────────────────────────────────────────────────────

test('sin número de Registro Único no se calcula NADA: no hay yield que enseñar', () => {
  const r = analizarInversion(entrada({ legal: { ...LEGAL_OK, registroUnico: 'sin_verificar' } }))
  assert.equal(r.veredicto.decision, 'no_calculable')
  assert.equal(r.escenarios, null)
  assert.ok(r.veredicto.faltan.some(f => /registro/i.test(f)))
})

test('«sin verificar» y «no tiene» dan los dos no_calculable, pero con motivos distintos', () => {
  const sinVerificar = analizarInversion(entrada({ legal: { ...LEGAL_OK, licenciaVUT: 'sin_verificar' } }))
  const noTiene = analizarInversion(entrada({ legal: { ...LEGAL_OK, licenciaVUT: 'no_tiene' } }))
  assert.equal(sinVerificar.veredicto.decision, 'no_calculable')
  assert.equal(noTiene.veredicto.decision, 'no_calculable')
  assert.notDeepEqual(sinVerificar.veredicto.motivos, noTiene.veredicto.motivos)
})

test('comprar el edificio entero se anota como lo que es: se esquiva el veto de la comunidad', () => {
  const r = analizarInversion(entrada())
  assert.ok(r.veredicto.motivos.some(m => /comunidad|edificio/i.test(m)))
})

// ── Datos que faltan ────────────────────────────────────────────────────────

test('sin precio no hay análisis, y lo dice por su nombre', () => {
  const r = analizarInversion(entrada({ ficha: { ...FICHA, precio: null } }))
  assert.equal(r.veredicto.decision, 'no_calculable')
  assert.ok(r.veredicto.faltan.includes('precio'))
  assert.equal(r.precioPorM2, null)
})

test('sin m² el análisis sigue, pero el €/m² es null en vez de 0', () => {
  const r = analizarInversion(entrada({ ficha: { ...FICHA, m2: null } }))
  assert.equal(r.precioPorM2, null)
  assert.notEqual(r.veredicto.decision, 'no_calculable')
})

test('con menos de 9 meses medidos no se decide: el suelo es demasiado bajo', () => {
  const soloTres: MesMercado[] = [7, 8, 9].map(mes => ({ mes, adrGuest: 550, comparables: 5, ocupacionProxy: 0.9 }))
  const r = analizarInversion(entrada({ mercado: [{ aforo: 8, curva: soloTres }] }))
  assert.equal(r.veredicto.decision, 'no_calculable')
  assert.ok(r.veredicto.faltan.some(f => /mercado|mes/i.test(f)))
})

test('un mes con ADR pero sin ocupación se anota y no aporta ingreso inventado', () => {
  const curva = curvaPlana(550, 0.4)
  curva[0] = { ...curva[0], ocupacionProxy: null }
  const r = analizarInversion(entrada({ mercado: [{ aforo: 8, curva }] }))
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.deepEqual(entero.mesesSinOcupacion, [1])
  assert.ok(entero.esSuelo)
})

test('con ocupación por defecto, ese mes SÍ entra pero queda marcado como supuesto', () => {
  const curva = curvaPlana(550, null)
  const r = analizarInversion(
    entrada({ mercado: [{ aforo: 8, curva }], supuestos: { ...SUPUESTOS, ocupacionPorDefecto: 0.4 } }),
  )
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.equal(entero.mesesConOcupacionSupuesta.length, 12)
  assert.equal(entero.cobertura, 1)
})

// ── Aritmética ──────────────────────────────────────────────────────────────

test('ingreso bruto = Σ (ADR × noches del mes × ocupación) sobre los 365 días', () => {
  const r = analizarInversion(entrada({ mercado: [{ aforo: 8, curva: curvaPlana(100, 0.5) }] }))
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.equal(Math.round(entero.ingresoBrutoAnual), 18_250) // 365 × 100 × 0,5
  assert.equal(Math.round(entero.nochesVendidas * 10) / 10, 182.5)
})

test('la comisión del canal se descuenta UNA vez: el ADR de Booking ya es precio guest', () => {
  const r = analizarInversion(entrada({ mercado: [{ aforo: 8, curva: curvaPlana(100, 0.5) }] }))
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.equal(Math.round(entero.costes.comisionCanal * 100) / 100, 3598.9)
  assert.equal(Math.round(entero.noi * 100) / 100, 14_651.1)
})

test('las limpiezas salen de las estancias, no de las noches', () => {
  const costes: Costes = { ...COSTES_CERO, limpiezaPorEstancia: 60, nochesPorEstancia: 5 }
  const r = analizarInversion(entrada({ mercado: [{ aforo: 8, curva: curvaPlana(100, 0.5) }], costes }))
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  // 182,5 noches / 5 = 36,5 estancias × 60€
  assert.equal(Math.round(entero.costes.limpieza * 100) / 100, 2190)
})

test('el yield se calcula sobre la inversión TOTAL, no sobre el precio pedido', () => {
  const r = analizarInversion(entrada({ mercado: [{ aforo: 8, curva: curvaPlana(100, 0.5) }] }))
  // 400.000 × 1,10 + 0 de reforma
  assert.equal(r.inversionTotal, 440_000)
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.equal(Math.round(entero.yieldBruto * 10_000) / 10_000, 0.0415)
})

test('€/m² usa el precio pedido, que es lo que se compara con los comparables', () => {
  assert.equal(analizarInversion(entrada()).precioPorM2, 2000)
})

// ── Financiación ────────────────────────────────────────────────────────────

test('sin financiación declarada el cash-on-cash es null, NO 0', () => {
  const r = analizarInversion(entrada())
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.equal(entero.cashOnCash, null)
  assert.equal(r.capitalAportado, 440_000)
})

test('con financiación, el capital aportado baja y el cash-on-cash aparece', () => {
  const r = analizarInversion(entrada({ financiacion: { porcentaje: 0.6, tipoInteres: 0.03, anios: 25 } }))
  assert.equal(r.capitalAportado, 440_000 - 240_000)
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.ok(entero.cashOnCash != null)
})

test('si el flujo anual no es positivo, el payback es null (no un número enorme)', () => {
  const r = analizarInversion(
    entrada({
      mercado: [{ aforo: 8, curva: curvaPlana(50, 0.2) }],
      financiacion: { porcentaje: 0.9, tipoInteres: 0.12, anios: 10 },
    }),
  )
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.equal(entero.paybackAnios, null)
  assert.ok(entero.cashOnCash! < 0, 'el cash-on-cash sí es negativo: eso es un dato, no un hueco')
})

// ── Entero vs segregado ─────────────────────────────────────────────────────

test('segregar gana cuando el mercado de aforo grande paga menos por plaza', () => {
  const r = analizarInversion(entrada())
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  const segregado = r.escenarios!.find(e => e.nombre === 'segregado')!
  assert.ok(segregado.ingresoBrutoAnual > entero.ingresoBrutoAnual)
  assert.equal(r.recomendado, 'segregado')
})

test('sin unidades declaradas no se inventa el escenario segregado', () => {
  const r = analizarInversion(entrada({ ficha: { ...FICHA, unidades: [] } }))
  assert.equal(r.escenarios!.length, 1)
  assert.equal(r.escenarios![0].nombre, 'entero')
})

test('un escenario sin mercado medido a su aforo no se calcula a ojo', () => {
  const r = analizarInversion(entrada({ mercado: [{ aforo: 8, curva: curvaPlana(550, 0.4) }] }))
  assert.equal(r.escenarios!.length, 1)
  assert.equal(r.escenarios![0].nombre, 'entero')
})

// ── Veredicto ───────────────────────────────────────────────────────────────

test('el veredicto dice NO por defecto cuando el yield no llega al umbral', () => {
  const r = analizarInversion(entrada({ mercado: [{ aforo: 8, curva: curvaPlana(100, 0.3) }] }))
  assert.equal(r.veredicto.decision, 'no')
  assert.ok(r.veredicto.motivos.some(m => /umbral/i.test(m)))
})

test('superar el umbral no basta: hay que batir a la alternativa + prima de iliquidez', () => {
  const r = analizarInversion(
    entrada({
      mercado: [{ aforo: 8, curva: curvaPlana(200, 0.5) }],
      supuestos: { ...SUPUESTOS, alternativaLiquida: 0.2 },
    }),
  )
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.ok(entero.yieldNeto > 0.055, `yield neto ${entero.yieldNeto}`)
  assert.equal(r.veredicto.decision, 'no')
  assert.equal(Math.round(r.veredicto.listonAnual! * 100) / 100, 0.22)
})

test('con el año entero medido y batiendo el listón, el veredicto es «sí»', () => {
  const r = analizarInversion(
    entrada({
      mercado: [{ aforo: 8, curva: curvaPlana(400, 0.6) }],
      supuestos: { ...SUPUESTOS, ocupacionPorDefecto: 0.6, alternativaLiquida: 0.03 },
    }),
  )
  assert.equal(r.veredicto.decision, 'si')
})

test('si el año no está medido del todo, lo mejor a lo que se llega es «condicional»', () => {
  const curva = curvaPlana(400, 0.6)
  curva[0] = { ...curva[0], adrGuest: null, comparables: 0 }
  const r = analizarInversion(
    entrada({ mercado: [{ aforo: 8, curva }], supuestos: { ...SUPUESTOS, alternativaLiquida: 0.03 } }),
  )
  assert.equal(r.veredicto.decision, 'condicional')
  assert.ok(r.veredicto.motivos.some(m => /suelo/i.test(m)))
})

test('la comisión de Booking recuperable se compara aparte, sin fingir que es un yield', () => {
  const r = analizarInversion(entrada({ supuestos: { ...SUPUESTOS, comisionRecuperableAnual: 12_000 } }))
  const alt = r.veredicto.alternativas.find(a => /booking/i.test(a.nombre))!
  assert.equal(alt.rentabilidad, null)
  assert.match(alt.nota, /12\.000,00€/)
})

test('la larga duración entra como alternativa solo si se declara su alquiler', () => {
  const sin = analizarInversion(entrada())
  assert.equal(sin.veredicto.alternativas.find(a => /larga/i.test(a.nombre))!.rentabilidad, null)
  const con = analizarInversion(entrada({ supuestos: { ...SUPUESTOS, largaDuracionMensual: 2000 } }))
  assert.ok(con.veredicto.alternativas.find(a => /larga/i.test(a.nombre))!.rentabilidad! > 0)
})

// ── Rampa de reseñas y TIR ──────────────────────────────────────────────────

test('la rampa del año 1 baja la TIR pero no toca el NOI estabilizado', () => {
  const base = entrada({
    mercado: [{ aforo: 8, curva: curvaPlana(400, 0.6) }],
    supuestos: { ...SUPUESTOS, rampaAnio1: 0 },
  })
  const conRampa = entrada({
    mercado: [{ aforo: 8, curva: curvaPlana(400, 0.6) }],
    supuestos: { ...SUPUESTOS, rampaAnio1: 0.3 },
  })
  const a = analizarInversion(base).escenarios!.find(e => e.nombre === 'entero')!
  const b = analizarInversion(conRampa).escenarios!.find(e => e.nombre === 'entero')!
  assert.equal(Math.round(a.noi), Math.round(b.noi))
  assert.ok(b.tir! < a.tir!, `TIR sin rampa ${a.tir} debería superar a ${b.tir}`)
})

test('la TIR es coherente con el yield cuando no hay deuda ni revalorización', () => {
  const r = analizarInversion(
    entrada({ mercado: [{ aforo: 8, curva: curvaPlana(400, 0.6) }], supuestos: { ...SUPUESTOS, rampaAnio1: 0 } }),
  )
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  // Sin revalorización, se recupera la base (precio+reforma) pero no los gastos de compra,
  // así que la TIR queda por debajo del yield neto.
  assert.ok(entero.tir! > 0 && entero.tir! < entero.yieldNeto, `tir ${entero.tir} vs yield ${entero.yieldNeto}`)
})

test('el motor sella su versión en el resultado', () => {
  assert.equal(analizarInversion(entrada()).motorVersion, '1.0.0')
})

// ── Honestidad de los mensajes (fallos encontrados en la prueba real de Conil) ──

test('el veredicto nombra la métrica que DE VERDAD compara, no otra', () => {
  // Con hipoteca se decide por cash-on-cash. Citar el yield neto al lado del
  // listón producía frases falsas: «yield 8,27% … bate el listón de 9,00%».
  const r = analizarInversion(
    entrada({
      mercado: [{ aforo: 8, curva: curvaPlana(400, 0.6) }],
      financiacion: { porcentaje: 0.6, tipoInteres: 0.032, anios: 25 },
      supuestos: { ...SUPUESTOS, alternativaLiquida: 0.03 },
    }),
  )
  const entero = r.escenarios!.find(e => e.nombre === 'entero')!
  assert.ok(entero.cashOnCash != null)
  const frase = r.veredicto.motivos.find(m => /listón/i.test(m))!
  assert.match(frase, /cash-on-cash/i)
  assert.ok(!frase.includes(`${(entero.yieldNeto * 100).toFixed(2)}%`), `no debe citar el yield neto: ${frase}`)
})

test('sin hipoteca sí se cita el yield neto, que es lo que se compara', () => {
  const r = analizarInversion(
    entrada({
      mercado: [{ aforo: 8, curva: curvaPlana(400, 0.6) }],
      supuestos: { ...SUPUESTOS, alternativaLiquida: 0.03 },
    }),
  )
  assert.match(r.veredicto.motivos.find(m => /listón/i.test(m))!, /yield neto/i)
})

test('el ADR medido no convierte una ocupación SUPUESTA en medida', () => {
  const r = analizarInversion(
    entrada({
      mercado: [{ aforo: 8, curva: curvaPlana(400, null) }],
      supuestos: { ...SUPUESTOS, ocupacionPorDefecto: 0.6, alternativaLiquida: 0.03 },
    }),
  )
  assert.ok(
    r.veredicto.motivos.some(m => /ocupación NO está medida/i.test(m)),
    'el veredicto debe declarar que la ocupación es un supuesto',
  )
})

test('con ocupación medida no se cuela el aviso de supuesto', () => {
  const r = analizarInversion(
    entrada({
      mercado: [{ aforo: 8, curva: curvaPlana(400, 0.6) }],
      supuestos: { ...SUPUESTOS, alternativaLiquida: 0.03 },
    }),
  )
  assert.ok(!r.veredicto.motivos.some(m => /ocupación NO está medida/i.test(m)))
})
