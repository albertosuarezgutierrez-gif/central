// Tests del motor PURO de deducciones IRPF. Runner: `node --test` (type-stripping).
//   node --test apps/plataforma/lib/fiscal-deducciones.test.ts
//
// Caso de referencia: 3 hijos (2018, 2024, 2025), madre autónoma, familia numerosa
// general, guardería, declaración conjunta, Andalucía, ejercicio 2025.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  esMenor3,
  mesesMenor3,
  calcularMaternidadGuarderia,
  minimoPersonalYFamiliar,
  calcularDeducciones,
  calcularResultadoFiscal,
  deduccionesAplicablesNoMarcadas,
  compararDeclaracion,
  type PerfilFiscal,
  type Descendiente,
} from './fiscal-deducciones.ts'

const PERFIL: PerfilFiscal = {
  comunidadAutonoma: 'andalucia',
  declaracionConjunta: true,
  familiaNumerosa: 'general',
  conyugeTrabaja: true, // madre autónoma
  gastoGuarderiaAnual: 1500,
  aportacionPlanPensiones: 0,
  gradoDiscapacidadTitular: 0,
  gradoDiscapacidadConyuge: 0,
  ascendientesACargo: 0,
  ascendientesMayores75: 0,
  donativosAnual: 0,
  gastoDeportivoAnual: 0,
  cuotasSSMadreAnual: 6000, // holgado: no topa los tests que no hablan del tope
  familiaNumerosaDesde: '2020-01-01', // título vigente todo el año (el prorrateo se prueba aparte)
}

const HIJOS: Descendiente[] = [
  { nombre: 'Hijo 2018', fechaNacimiento: '2018-05-10', gradoDiscapacidad: 0, computoCompleto: true },
  { nombre: 'Hijo 2024', fechaNacimiento: '2024-03-01', gradoDiscapacidad: 0, computoCompleto: true },
  { nombre: 'Hijo 2025', fechaNacimiento: '2025-01-20', gradoDiscapacidad: 0, computoCompleto: true },
]

test('esMenor3: 2024 y 2025 sí, 2018 no (ejercicio 2025)', () => {
  assert.equal(esMenor3('2018-05-10', 2025), false)
  assert.equal(esMenor3('2024-03-01', 2025), true)
  assert.equal(esMenor3('2025-01-20', 2025), true)
})

test('mínimo personal y familiar = 20.250 € (5.550 + 2.400 + 5.500 + 6.800)', () => {
  // 1º 2018: 2400 · 2º 2024: 2700+2800 · 3º 2025: 4000+2800
  assert.equal(minimoPersonalYFamiliar(PERFIL, HIJOS, 2025), 20250)
})

test('deducciones: maternidad 2.400, guardería 1.500, FN 1.200, Andalucía nacimiento 200 (FN andaluza incompatible ese año)', () => {
  const d = calcularDeducciones(PERFIL, HIJOS, 2025)
  const por = (k: string) => d.find(x => x.clave === k)?.importe ?? 0
  assert.equal(por('maternidad'), 2400) // 2 hijos < 3
  assert.equal(por('guarderia'), 1500) // 2 hijos < 3 ⇒ tope 2×1000; 1500 no topa
  assert.equal(por('fn_general'), 1200)
  assert.equal(por('and_nacimiento'), 200) // 1 nacido en 2025
  assert.equal(por('and_fn'), 0) // incompatible con nacimiento: se aplica la mayor (empate → nacimiento, como la renta 2025)
  assert.equal(calcularDeducciones(PERFIL, HIJOS, 2026).find(x => x.clave === 'and_fn')?.importe, 200) // 2026 sin nacimientos
})

test('resultado fiscal: reembolsables salen aunque la cuota sea baja (sale a devolver)', () => {
  // Base baja ⇒ cuota íntegra ~0 tras restar el mínimo; maternidad+guardería+FN devuelven.
  const r = calcularResultadoFiscal(18000, 1000, PERFIL, HIJOS, 2025)
  assert.equal(r.minimoPersonalYFamiliar, 20250)
  assert.ok(r.cuotaIntegra >= 0)
  // reembolsables = 2400 + 1000 + 1200 = 4600; resultado = cuotaLiquida − ret − reembolsables < 0
  assert.ok(r.resultado < 0, `esperaba a devolver, fue ${r.resultado}`)
})

test('borde: sin hijos ni situación ⇒ solo mínimo del contribuyente y 0 deducciones', () => {
  const vacio: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, conyugeTrabaja: false, gastoGuarderiaAnual: 0, gastoDeportivoAnual: 0 }
  assert.equal(minimoPersonalYFamiliar(vacio, [], 2025), 5550)
  assert.equal(calcularDeducciones(vacio, [], 2025).length, 0)
})

test('checklist: detecta familia numerosa no solicitada con 3 hijos', () => {
  const sinFN: PerfilFiscal = { ...PERFIL, familiaNumerosa: null }
  const sug = deduccionesAplicablesNoMarcadas(sinFN, HIJOS, 2025)
  assert.ok(sug.some(s => s.clave === 'fn'))
})

// ── Cambios de la auditoría fiscal (18/07/2026) ──────────────────────────────

test('maternidad PRORRATEA por mes en el año de nacimiento (hijo de noviembre ≈ 200 €, no 1.200)', () => {
  const perfilUno: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, gastoGuarderiaAnual: 0 }
  const hijoNov: Descendiente[] = [{ nombre: 'Bebé nov', fechaNacimiento: '2025-11-15', gradoDiscapacidad: 0, computoCompleto: true }]
  const d = calcularDeducciones(perfilUno, hijoNov, 2025)
  // 12 − getMonth(10) = 2 meses (nov+dic) → 1.200 × 2/12 = 200
  assert.equal(d.find(x => x.clave === 'maternidad')?.importe, 200)
  // Un hijo nacido en un año ANTERIOR (aún < 3) da el año completo.
  const hijoPrev: Descendiente[] = [{ nombre: 'Bebé 2024', fechaNacimiento: '2024-11-15', gradoDiscapacidad: 0, computoCompleto: true }]
  assert.equal(calcularDeducciones(perfilUno, hijoPrev, 2025).find(x => x.clave === 'maternidad')?.importe, 1200)
})

test('FN autonómica Andalucía: se aplica bajo el límite de renta y se RETIRA por encima', () => {
  const por = (base?: number) => calcularDeducciones(PERFIL, HIJOS, 2026, undefined, base).find(x => x.clave === 'and_fn')?.importe ?? 0
  assert.equal(por(28000), 200)   // ≤ 30.000 conjunta → aplica
  assert.equal(por(45000), 0)     // > 30.000 conjunta → NO aplica (Alberto está aquí)
  assert.equal(por(undefined), 200) // sin base conocida → compat: aplica (no gatea)
  // El nacimiento NO lleva límite de renta (Ley 8/2025) → sigue aunque la base sea alta.
  assert.equal(calcularDeducciones(PERFIL, HIJOS, 2025, undefined, 45000).find(x => x.clave === 'and_nacimiento')?.importe, 200)
})

test('mecenazgo: la base de deducción se topa al 10 % de la base liquidable', () => {
  const perfilDon: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, conyugeTrabaja: false, gastoGuarderiaAnual: 0, donativosAnual: 1000 }
  // Sin base conocida (2025): 0,8×250 + 0,4×750 = 500
  assert.equal(calcularDeducciones(perfilDon, [], 2025).find(x => x.clave === 'donativos')?.importe, 500)
  // Base 5.000 → tope 500 → 0,8×250 + 0,4×250 = 300
  assert.equal(calcularDeducciones(perfilDon, [], 2025, undefined, 5000).find(x => x.clave === 'donativos')?.importe, 300)
})

// ── compararDeclaracion ──────────────────────────────────────────────────────
// Regresión del bug "arriba a pagar, comparativa a devolver": la función estimaba las
// retenciones del titular como 15 % de TODA la base (incluido el capital inmobiliario,
// que no lleva retención) e inventaba miles de € de pagos a cuenta.

test('compararDeclaracion: usa las retenciones REALES del titular, no el 15 % de la base', () => {
  const perfilSolo: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, conyugeTrabaja: false, gastoGuarderiaAnual: 0 }
  // Base alta y 0 retenciones ⇒ sin deducciones reembolsables el resultado DEBE ser a pagar.
  const c = compararDeclaracion(46160, 0, 0, 0, perfilSolo, [], 2025)
  assert.ok(c.conjunta.resultado > 0, `conjunta debía salir a pagar, fue ${c.conjunta.resultado}`)
  assert.ok(c.separada.titular.resultado > 0, `separada debía salir a pagar, fue ${c.separada.titular.resultado}`)
  // Las retenciones entran tal cual: subirlas en X baja el resultado exactamente X.
  const conRet = compararDeclaracion(46160, 583, 0, 0, perfilSolo, [], 2025)
  assert.equal(Math.round(c.conjunta.resultado - conRet.conjunta.resultado), 583)
})

test('compararDeclaracion: la reducción conjunta (3.400) se aplica UNA sola vez y solo en la conjunta', () => {
  const c = compararDeclaracion(49560, 583, 0, 0, PERFIL, HIJOS, 2025)
  assert.equal(c.conjunta.base, 49560 - 3400) // base de entrada SIN reducción; la resta la función
  assert.equal(c.separada.titular.base, 49560) // la separada no lleva reducción conjunta
})

test('compararDeclaracion: las cuotas son ≥ 0 (el signo va en resultado) y la recomendación es coherente', () => {
  const c = compararDeclaracion(46160, 583, 9000, 400, PERFIL, HIJOS, 2025)
  assert.ok(c.conjunta.cuota >= 0)
  assert.ok(c.separada.titular.cuota >= 0)
  assert.ok(c.separada.conyuge.cuota >= 0)
  assert.equal(c.recomendacion, c.ahorroConjunta >= 0 ? 'conjunta' : 'separada')
  assert.equal(Math.round(c.ahorroConjunta), Math.round(c.separada.total - c.conjunta.resultado))
})

// Ley 49/2002 art. 19 (RDL 6/2023): 80 % primeros 250 € + 40 % resto desde 2024; ≤2023: 150 € y 35 %.
test('donativos 2026: 130 € = 104 €; 300 € = 200 + 20 = 220 €; recurrente 45 % del resto', () => {
  const p = (n: number, extra: Partial<PerfilFiscal> = {}): PerfilFiscal => ({ ...PERFIL, familiaNumerosa: null, conyugeTrabaja: false, gastoGuarderiaAnual: 0, donativosAnual: n, ...extra })
  const don = (perfil: PerfilFiscal, anio: number) => calcularDeducciones(perfil, [], anio).find(x => x.clave === 'donativos')?.importe
  assert.equal(don(p(130), 2026), 104)
  assert.equal(don(p(300), 2026), 220)
  assert.equal(don(p(1000, { donativosRecurrentes: true }), 2026), 200 + 338) // 0,45×750 = 337,5 → 338
})

test('donativos 2023 (régimen anterior): tramo 150 €, 35 % del resto', () => {
  const perfil: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, conyugeTrabaja: false, gastoGuarderiaAnual: 0, donativosAnual: 150 }
  assert.equal(calcularDeducciones(perfil, [], 2023).find(x => x.clave === 'donativos')?.importe, 120)
  assert.equal(calcularDeducciones({ ...perfil, donativosAnual: 250 }, [], 2023).find(x => x.clave === 'donativos')?.importe, 155) // 120 + 0,35×100
})

test('guardería: tope 1.000 € POR HIJO < 3 (2 hijos ⇒ 2.000)', () => {
  const perfil: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, gastoGuarderiaAnual: 5000 }
  const dos: Descendiente[] = HIJOS.slice(1) // 2024 y 2025, ambos < 3 en 2025
  assert.equal(calcularDeducciones(perfil, dos, 2025).find(x => x.clave === 'guarderia')?.importe, 2000)
  assert.equal(calcularDeducciones(perfil, dos.slice(0, 1), 2025).find(x => x.clave === 'guarderia')?.importe, 1000)
})

// ── Tope por cotizaciones SS de la madre (art. 81 LIRPF) y meses de menor de 3 años ─────────
const PILAR = { nombre: 'Pilar', fechaNacimiento: '2024-04-11', gradoDiscapacidad: 0, computoCompleto: true }
const ALBERTO = { nombre: 'Alberto', fechaNacimiento: '2025-11-10', gradoDiscapacidad: 0, computoCompleto: true }
const imp = (d: ReturnType<typeof calcularDeducciones>, k: string) => d.find(x => x.clave === k)

test('mesesMenor3: nacido 11/04/2024 → 9 (2024), 12 (2025-26), 3 (2027), 0 (2028); sin desfase de zona horaria', () => {
  assert.deepEqual([2023, 2024, 2025, 2026, 2027, 2028].map(a => mesesMenor3('2024-04-11', a)), [0, 9, 12, 12, 3, 0])
  assert.equal(mesesMenor3('2025-01-01', 2025), 12) // 1 de enero no se desplaza a diciembre
})

test('hijo que cumple 3 años a mitad de año: 2027 da 3 meses (300 €), no 1.200', () => {
  const p: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, gastoGuarderiaAnual: 0, cuotasSSMadreAnual: 6000 }
  assert.equal(imp(calcularDeducciones(p, [PILAR], 2027), 'maternidad')?.importe, 300)
  assert.equal(imp(calcularDeducciones(p, [PILAR], 2028), 'maternidad'), undefined) // ya no es menor de 3
})

test('TOPE POR HIJO (art. 81 literal): Pilar 2026, cuotas 467,45 → 2 hijos <3 = 934,90 € (no 4.400)', () => {
  const p: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, gastoGuarderiaAnual: 3435.5, cuotasSSMadreAnual: 467.45 }
  const r = calcularMaternidadGuarderia(p, [PILAR, ALBERTO], 2026)
  assert.equal(r.maternidadBruta, 2400)
  assert.equal(r.guarderiaBruta, 2000)
  assert.equal(r.tope, 934.9) // 467,45 por cada hijo
  assert.equal(r.maternidad, 934.9) // cada hijo agota su límite con la maternidad (1.200 > 467,45)
  assert.equal(r.guarderia, 0)
  const d = calcularDeducciones(p, [PILAR, ALBERTO], 2026)
  assert.equal((imp(d, 'maternidad')?.importe ?? 0) + (imp(d, 'guarderia')?.importe ?? 0), 934.9)
  // Con UN solo hijo el límite es 467,45.
  assert.equal(calcularMaternidadGuarderia(p, [PILAR], 2026).maternidad, 467.45)
})

test('guardería entra en el límite de SU hijo: cuotas 1.300, gasto 800 ⇒ 100 € por hijo (200)', () => {
  const p: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, gastoGuarderiaAnual: 800, cuotasSSMadreAnual: 1300 }
  const r = calcularMaternidadGuarderia(p, [PILAR, ALBERTO], 2026)
  assert.equal(r.maternidad, 2400) // 1.200 ≤ 1.300 por hijo
  assert.equal(r.guarderia, 200) // 400 por hijo pedidos, solo caben 100 (1.300 − 1.200)
  // Con cuotas holgadas se concede entera.
  assert.equal(calcularMaternidadGuarderia({ ...p, cuotasSSMadreAnual: 5000 }, [PILAR, ALBERTO], 2026).guarderia, 800)
})

test('hijo nacido en el año: su límite son las cuotas desde el mes de nacimiento (nov ⇒ 2/12)', () => {
  const p: PerfilFiscal = { ...PERFIL, familiaNumerosa: null, gastoGuarderiaAnual: 1000, cuotasSSMadreAnual: 1200 }
  const nov = { nombre: 'x', fechaNacimiento: '2026-11-15', gradoDiscapacidad: 0, computoCompleto: true }
  const r = calcularMaternidadGuarderia(p, [nov], 2026)
  assert.equal(r.tope, 200)
  assert.equal(r.maternidad, 200)
  assert.equal(r.guarderia, 0) // sin el prorrateo del límite saldrían 1.000 de guardería
})

test('SIN cuotas ⇒ null («sin dato»), nunca el importe sin tope', () => {
  for (const cuotas of [undefined, null]) {
    const p: PerfilFiscal = { ...PERFIL, gastoGuarderiaAnual: 3435.5, cuotasSSMadreAnual: cuotas }
    const r = calcularMaternidadGuarderia(p, [PILAR, ALBERTO], 2026)
    assert.equal(r.maternidad, null)
    assert.equal(r.guarderia, null)
    assert.equal(r.tope, null)
    const d = calcularDeducciones(p, [PILAR, ALBERTO], 2026)
    assert.equal(imp(d, 'maternidad')?.sinDato, true)
    assert.equal(imp(d, 'maternidad')?.importe, 0)
    assert.equal(imp(d, 'guarderia')?.sinDato, true)
  }
  // Cuotas 0 es un dato (revisado): tope 0, no «sin dato».
  assert.equal(calcularMaternidadGuarderia({ ...PERFIL, cuotasSSMadreAnual: 0 }, [PILAR], 2026).maternidad, 0)
})
