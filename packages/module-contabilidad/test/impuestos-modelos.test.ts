// F4 — 111/115/190/180, 347, 349, 130, calendario, ciclo de vida, asientos de liquidación y borrador. Casos numéricos completos.
// Cepos vistos fallar el 05/11/2026 (rompo, miro rojo, restauro): (1) 347: `>` por `>=` en el umbral → rojo en «justo en el umbral»;
// (2) 130: 20 % por 25 % → rojo en «130 con pagos previos»; (3) liquidación: intercambiar 4750/4700 → rojo en «liquidación del 303»;
// (4) 190: ignorar los perceptores sin NIF en el total → rojo en «190 ≡ suma de los 111»; (5) calendario: 4T al 20/01 → rojo en «coincide con avisos F2».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularModelo111, calcularModelo115, calcularModelo190, calcularModelo180, calcularModelo347, calcularModelo349, calcularModelo130, calcularModelo303,
  acumuladoDeAsientos, exentoDe130, periodicidad349, UMBRAL_347, importeDe, casillaDe,
  vencimientoModelo, proximosPlazos, vencimientosFiscalesDelAnio, puedeTransitar, problemasParaRevisar, problemasPresentacion, modelosDeForma,
  asientosPresentacion303, asientosDePresentacion, asientoDesdeHecho, crearAsiento, crearPlan, ejercicioNatural, sumasDeAsientos, operacionesDeHecho,
  borradorHtml, borradorCsv, DISENO_OFICIAL_PENDIENTE, AVISO_PRESENTACION, ErrorContable,
  type RetencionPracticada, type OperacionIva, type Asiento, type HechoContable,
} from '../src/index.ts'

let n = 0
const ret = (r: Partial<RetencionPracticada> & Pick<RetencionPracticada, 'fecha' | 'concepto' | 'percepcion' | 'retencion'>): RetencionPracticada =>
  ({ ref: `R-${++n}`, perceptor: { nif: 'X1234567L', nombre: 'Perceptor' }, ...r })
const op = (o: Partial<OperacionIva> & Pick<OperacionIva, 'sentido' | 'fecha' | 'base' | 'tipoIva' | 'cuota'>): OperacionIva =>
  ({ ref: `OP-${++n}`, numero: `N-${n}`, tercero: { nif: `B0000000${n % 10}`, nombre: `T${n}` }, clase: 'interior', ...o })

// ── 111 / 115 ───────────────────────────────────────────────────────────────────────────────────────────────────

const retencionesT1 = (): RetencionPracticada[] => [
  ret({ ref: 'NOM-ENE-ANA', fecha: '2026-01-31', concepto: 'trabajo', perceptor: { nif: '12345678Z', nombre: 'Ana', provincia: '41' }, percepcion: 200000, retencion: 30000, origen: 'nominas' }),
  ret({ ref: 'NOM-ENE-BRU', fecha: '2026-01-31', concepto: 'trabajo', perceptor: { nif: '87654321X', nombre: 'Bruno', provincia: '41' }, percepcion: 150000, retencion: 15000, origen: 'nominas' }),
  ret({ ref: 'NOM-FEB-ANA', fecha: '2026-02-28', concepto: 'trabajo', perceptor: { nif: '12345678z', nombre: 'Ana', provincia: '41' }, percepcion: 200000, retencion: 30000, origen: 'nominas' }),
  ret({ ref: 'K-1', fecha: '2026-02-15', concepto: 'actividad_profesional', perceptor: { nif: 'B99999990', nombre: 'Gestoría' }, percepcion: 100000, retencion: 15000, origen: 'compras' }),
  ret({ ref: 'NOM-ABR', fecha: '2026-04-30', concepto: 'trabajo', perceptor: { nif: '12345678Z', nombre: 'Ana' }, percepcion: 999, retencion: 99 }),
]

test('111 T1: trabajo (2 perceptores, 3 pagos), profesionales, suma 28 y resultado 31 con negativos anteriores', () => {
  const c = calcularModelo111(retencionesT1(), { anio: 2026, trimestre: 1, negativosAnteriores: 10000 })
  assert.deepEqual([importeDe(c, '01'), importeDe(c, '02'), importeDe(c, '03')], [2, 550000, 75000], 'Ana cuenta una sola vez aunque el NIF venga en minúscula')
  assert.deepEqual([importeDe(c, '07'), importeDe(c, '08'), importeDe(c, '09')], [1, 100000, 15000])
  assert.deepEqual([importeDe(c, '04'), importeDe(c, '05'), importeDe(c, '06')], [0, 0, 0])
  assert.equal(importeDe(c, '28'), 90000)
  assert.equal(importeDe(c, '29'), 10000)
  assert.equal(importeDe(c, '31'), 80000)
  assert.equal(c.resultado, 80000)
  assert.deepEqual(casillaDe(c, '03')!.origen, ['NOM-ENE-ANA', 'NOM-ENE-BRU', 'NOM-FEB-ANA'])
  assert.deepEqual(casillaDe(c, '09')!.origen, ['K-1'])
  assert.ok(!c.casillas.some((x) => x.origen.includes('NOM-ABR')), 'el pago de abril es del T2')
  assert.equal(c.ficheroOficial, DISENO_OFICIAL_PENDIENTE)
})

test('111: la entrada es GENÉRICA — en especie, premios y sin NIF se separan y se avisan', () => {
  const rs = [
    ret({ fecha: '2026-05-10', concepto: 'trabajo', especie: true, percepcion: 50000, retencion: 5000, perceptor: { nif: '11111111H', nombre: 'Eva' } }),
    ret({ fecha: '2026-05-10', concepto: 'premio', percepcion: 100000, retencion: 1900, perceptor: { nif: null, nombre: 'Anónimo' } }),
  ]
  const c = calcularModelo111(rs, { anio: 2026, trimestre: 2 })
  assert.deepEqual([importeDe(c, '04'), importeDe(c, '05'), importeDe(c, '06')], [1, 50000, 5000])
  assert.deepEqual([importeDe(c, '13'), importeDe(c, '14'), importeDe(c, '15')], [1, 100000, 1900])
  assert.equal(importeDe(c, '28'), 6900)
  assert.ok(c.avisos.some((a) => /sin NIF/.test(a)))
  assert.equal(calcularModelo111([], { anio: 2026, trimestre: 3 }).avisos[0], 'Sin datos: no hay retenciones pagadas en el periodo')
})

test('111: retención inválida (mayor que la percepción) queda fuera con su motivo', () => {
  const c = calcularModelo111([ret({ ref: 'MAL', fecha: '2026-01-10', concepto: 'trabajo', percepcion: 1000, retencion: 2000 })], { anio: 2026, trimestre: 1 })
  assert.equal(importeDe(c, '28'), 0)
  assert.equal(c.excluidas[0].ref, 'MAL')
})

test('115 T3: alquiler de un local, 3 meses a 19 %', () => {
  const rs = ['2026-07-05', '2026-08-05', '2026-09-05'].map((f, i) => ret({ ref: `ALQ-${i + 1}`, fecha: f, concepto: 'alquiler', perceptor: { nif: 'A58818501', nombre: 'Inmobiliaria' }, percepcion: 80000, retencion: 15200, refCatastral: '1234567VK1234N0001AB' }))
  const c = calcularModelo115([...rs, ret({ fecha: '2026-06-30', concepto: 'alquiler', percepcion: 80000, retencion: 15200 })], { anio: 2026, trimestre: 3 })
  assert.deepEqual([importeDe(c, '01'), importeDe(c, '02'), importeDe(c, '03'), importeDe(c, '06')], [1, 240000, 45600, 45600])
  assert.equal(c.resultado, 45600)
  assert.deepEqual(casillaDe(c, '03')!.origen, ['ALQ-1', 'ALQ-2', 'ALQ-3'])
})

test('190 ≡ suma de los cuatro 111 (nóminas + profesionales) y agrupa por perceptor/clave', () => {
  const rs = [
    ...retencionesT1().filter((r) => r.ref !== 'NOM-ABR'),
    ret({ ref: 'NOM-JUL', fecha: '2026-07-31', concepto: 'trabajo', perceptor: { nif: '12345678Z', nombre: 'Ana', provincia: '41' }, percepcion: 210000, retencion: 31500 }),
    ret({ ref: 'NOM-DIC', fecha: '2026-12-20', concepto: 'trabajo', perceptor: { nif: '87654321X', nombre: 'Bruno', provincia: '41' }, percepcion: 160000, retencion: 16000 }),
    ret({ ref: 'K-9', fecha: '2026-11-05', concepto: 'actividad_profesional', perceptor: { nif: 'B99999990', nombre: 'Gestoría' }, percepcion: 50000, retencion: 7500 }),
    ret({ ref: 'ALQ-X', fecha: '2026-07-05', concepto: 'alquiler', percepcion: 80000, retencion: 15200 }),
  ]
  const c190 = calcularModelo190(rs, 2026)
  const t = ([1, 2, 3, 4] as const).map((q) => calcularModelo111(rs, { anio: 2026, trimestre: q }))
  const suma28 = t.reduce((s, x) => s + importeDe(x, '28'), 0)
  const suma = t.reduce((s, x) => s + importeDe(x, '02') + importeDe(x, '08'), 0)
  assert.equal(c190.totales.retenciones, suma28)
  assert.equal(c190.totales.retenciones, 30000 + 15000 + 30000 + 15000 + 31500 + 16000 + 7500)
  assert.equal(c190.totales.percepciones, suma)
  assert.equal(c190.totales.nPerceptores, 3)
  const ana = c190.perceptores.find((p) => p.nif === '12345678Z')!
  assert.deepEqual([ana.clave, ana.percepcionDineraria, ana.retencionDineraria], ['A', 610000, 91500])
  const ges = c190.perceptores.find((p) => p.nif === 'B99999990')!
  assert.deepEqual([ges.clave, ges.percepcionDineraria, ges.retencionDineraria], ['G', 150000, 22500])
  assert.ok(!c190.perceptores.some((p) => p.refs.includes('ALQ-X')), 'el alquiler va al 180, no al 190')
})

test('190: retención sin NIF o con concepto sin clave no entra en perceptores, pero SÍ en el total y se avisa', () => {
  const rs = [
    ret({ ref: 'A', fecha: '2026-03-01', concepto: 'trabajo', perceptor: { nif: null, nombre: 'Sin NIF' }, percepcion: 10000, retencion: 1000 }),
    ret({ ref: 'B', fecha: '2026-03-01', concepto: 'premio', perceptor: { nif: '12345678Z', nombre: 'Ana' }, percepcion: 10000, retencion: 1900 }),
    ret({ ref: 'C', fecha: '2026-03-01', concepto: 'premio', clave: 'K', perceptor: { nif: '12345678Z', nombre: 'Ana' }, percepcion: 10000, retencion: 1900 }),
  ]
  const c = calcularModelo190(rs, 2026)
  assert.deepEqual(c.incompletas.map((x) => x.ref), ['A', 'B'])
  assert.equal(c.totales.retenciones, 4800)
  assert.equal(c.perceptores.length, 1)
})

test('180 ≡ suma de los 115, por arrendador e inmueble; sin referencia catastral se avisa', () => {
  const rs = [
    ...[1, 4, 7, 10].map((m) => ret({ ref: `ALQ-${m}`, fecha: `2026-${String(m).padStart(2, '0')}-05`, concepto: 'alquiler', perceptor: { nif: 'A58818501', nombre: 'Inmobiliaria' }, percepcion: 240000, retencion: 45600, refCatastral: '1234567VK1234N0001AB' })),
    ret({ ref: 'ALQ-OTRO', fecha: '2026-05-05', concepto: 'alquiler', perceptor: { nif: '12345678Z', nombre: 'Particular' }, percepcion: 60000, retencion: 11400 }),
  ]
  const c = calcularModelo180(rs, 2026)
  const t = ([1, 2, 3, 4] as const).map((q) => calcularModelo115(rs, { anio: 2026, trimestre: q }))
  assert.equal(c.totales.retenciones, t.reduce((s, x) => s + importeDe(x, '03'), 0))
  assert.equal(c.totales.retenciones, 45600 * 4 + 11400)
  assert.equal(c.totales.base, 240000 * 4 + 60000)
  assert.equal(c.arrendadores.length, 2)
  assert.ok(c.avisos.some((a) => /referencia catastral/.test(a)))
})

// ── 347 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('347: un NIF JUSTO en el umbral (3.005,06 €) NO se declara y otro con 3.005,07 € SÍ; umbral estricto', () => {
  assert.equal(UMBRAL_347, 300506)
  // 2.483,52 + 21 % (521,54) = 3.005,06 / 2.483,53 + 521,54 = 3.005,07
  const justo = op({ ref: 'J', sentido: 'emitida', fecha: '2026-02-01', base: 248352, tipoIva: 21, cuota: 52154, tercero: { nif: 'B11111111', nombre: 'Justo SL' } })
  const encima = op({ ref: 'E', sentido: 'emitida', fecha: '2026-02-01', base: 248353, tipoIva: 21, cuota: 52154, tercero: { nif: 'B22222222', nombre: 'Encima SL' } })
  assert.equal(justo.base + justo.cuota, 300506)
  assert.equal(encima.base + encima.cuota, 300507)
  const c = calcularModelo347([justo, encima], 2026)
  assert.deepEqual(c.declarados.map((t) => [t.nif, t.clave, t.total]), [['B22222222', 'B', 300507]])
  assert.deepEqual(c.bajoUmbral, [{ nif: 'B11111111', clave: 'B', total: 300506 }])
  assert.equal(importeDe(c, 'N'), 1)
  assert.equal(importeDe(c, 'B'), 300507)
})

test('347: trimestres, abonos que netean, claves A/B separadas, exclusiones y operaciones sin NIF', () => {
  const T = { nif: 'B33333333', nombre: 'Proveedor SA' }
  const ops: OperacionIva[] = [
    op({ ref: 'A1', sentido: 'recibida', fecha: '2026-01-10', base: 100000, tipoIva: 21, cuota: 21000, tercero: T }),
    op({ ref: 'A2', sentido: 'recibida', fecha: '2026-04-10', base: 100000, tipoIva: 21, cuota: 21000, tercero: T }),
    op({ ref: 'A3', sentido: 'recibida', fecha: '2026-10-10', base: 60000, tipoIva: 21, cuota: 12600, tercero: T }),
    op({ ref: 'A4-ABONO', sentido: 'recibida', fecha: '2026-11-10', base: -10000, tipoIva: 21, cuota: -2100, rectificativa: true, tercero: T }),
    op({ ref: 'B1', sentido: 'emitida', fecha: '2026-06-10', base: 200000, tipoIva: 21, cuota: 42000, tercero: T }), // clave B: 2.420 € < umbral
    op({ ref: 'IC', sentido: 'recibida', fecha: '2026-02-10', base: 900000, tipoIva: 21, cuota: 189000, clase: 'intracom_bienes', tercero: { nif: 'FR12345678901', nombre: 'FR' } }),
    op({ ref: 'AL', sentido: 'recibida', fecha: '2026-02-10', base: 900000, tipoIva: 21, cuota: 189000, alquilerConRetencion: true, tercero: { nif: 'B44444444', nombre: 'Arrendador' } }),
    op({ ref: 'SN', sentido: 'emitida', fecha: '2026-03-10', base: 500000, tipoIva: 21, cuota: 105000, tercero: { nif: null, nombre: 'Mostrador' } }),
    op({ ref: 'OTRO-AÑO', sentido: 'recibida', fecha: '2025-12-31', base: 900000, tipoIva: 21, cuota: 189000, tercero: T }),
  ]
  const c = calcularModelo347(ops, 2026)
  const a = c.declarados.find((t) => t.clave === 'A')!
  assert.equal(a.total, 121000 + 121000 + 72600 - 12100)
  assert.equal(a.total, 302500)
  assert.deepEqual(a.trimestres, [121000, 121000, 0, 72600 - 12100])
  assert.equal(a.trimestres.reduce((s, x) => s + x, 0), a.total)
  assert.deepEqual(a.refs, ['A1', 'A2', 'A3', 'A4-ABONO'])
  assert.equal(c.declarados.some((t) => t.clave === 'B'), false, 'la clave B del mismo NIF no suma con la A')
  assert.deepEqual(c.excluidas.map((e) => e.ref).sort(), ['AL', 'IC'])
  assert.deepEqual(c.sinNif, [{ ref: 'SN', total: 605000 }])
  assert.ok(c.avisos.some((x) => /metálico/.test(x)))
})

// ── 349 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('349 T1: claves E/A/S/I/T, agrupa por operador y clave; las rectificaciones bloquean (no soportado)', () => {
  const FR = { nif: 'FR12345678901', nombre: 'Pièces SAS' }
  const DE = { nif: 'DE123456789', nombre: 'Teile GmbH' }
  const ops: OperacionIva[] = [
    op({ ref: 'A1', sentido: 'recibida', fecha: '2026-01-10', base: 100000, tipoIva: 21, cuota: 21000, clase: 'intracom_bienes', tercero: FR }),
    op({ ref: 'A2', sentido: 'recibida', fecha: '2026-03-10', base: 50000, tipoIva: 21, cuota: 10500, clase: 'intracom_bienes', tercero: FR }),
    op({ ref: 'E1', sentido: 'emitida', fecha: '2026-02-10', base: 300000, tipoIva: 0, cuota: 0, clase: 'intracom_bienes', tercero: DE }),
    op({ ref: 'S1', sentido: 'emitida', fecha: '2026-02-11', base: 40000, tipoIva: 0, cuota: 0, clase: 'intracom_servicios', tercero: DE }),
    op({ ref: 'I1', sentido: 'recibida', fecha: '2026-02-12', base: 20000, tipoIva: 21, cuota: 4200, clase: 'intracom_servicios', tercero: FR }),
    op({ ref: 'T1', sentido: 'recibida', fecha: '2026-02-13', base: 70000, tipoIva: 21, cuota: 14700, clase: 'intracom_bienes', triangular: true, tercero: DE }),
    op({ ref: 'INT', sentido: 'emitida', fecha: '2026-02-10', base: 999, tipoIva: 21, cuota: 210 }),
    op({ ref: 'ABR', sentido: 'recibida', fecha: '2026-04-10', base: 5, tipoIva: 21, cuota: 1, clase: 'intracom_bienes', tercero: FR }),
  ]
  const c = calcularModelo349(ops, { anio: 2026, trimestre: 1 })
  assert.deepEqual(c.totales, { E: 300000, A: 150000, T: 70000, S: 40000, I: 20000 })
  assert.deepEqual(c.operadores.find((o) => o.clave === 'A')!.refs, ['A1', 'A2'])
  assert.equal(c.noSoportado.length, 0)
  assert.equal(c.periodicidad, 'T')
  const rect = calcularModelo349([...ops, op({ ref: 'RE', sentido: 'recibida', fecha: '2026-03-20', base: -1000, tipoIva: 21, cuota: -210, clase: 'intracom_bienes', rectificativa: true, tercero: FR })], { anio: 2026, trimestre: 1 })
  assert.match(rect.noSoportado.join(' '), /rectificaciones/)
  assert.equal(periodicidad349([5_000_000]), 'T')
  assert.equal(periodicidad349([5_000_001]), 'M')
})

// ── 130 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('130 T2 con pagos previos: 20 % del neto acumulado − pagos anteriores − retenciones', () => {
  const c = calcularModelo130({ ingresos: 3_000_000, gastos: 1_200_000, retenciones: 50_000, pagosAnteriores: 150_000 }, { anio: 2026, trimestre: 2 })
  assert.equal(importeDe(c, '03'), 1_800_000)
  assert.equal(importeDe(c, '04'), 360_000)
  assert.equal(importeDe(c, '07'), 360_000 - 150_000 - 50_000)
  assert.equal(c.resultado, 160_000)
  assert.equal(importeDe(c, '19'), 160_000)
})

test('130: neto negativo o pagos/retenciones mayores → 0 a ingresar (con aviso), nunca negativo', () => {
  const neg = calcularModelo130({ ingresos: 100_000, gastos: 300_000, retenciones: 0, pagosAnteriores: 0 }, { anio: 2026, trimestre: 1 })
  assert.equal(importeDe(neg, '04'), 0)
  assert.equal(neg.resultado, 0)
  const exceso = calcularModelo130({ ingresos: 1_000_000, gastos: 0, retenciones: 150_000, pagosAnteriores: 100_000 }, { anio: 2026, trimestre: 3 })
  assert.equal(importeDe(exceso, '07'), -50_000)
  assert.equal(exceso.resultado, 0)
  assert.ok(exceso.avisos.some((a) => /exceso/.test(a)))
})

test('130: simplificada, objetiva o minoración 110.3.c → NO soportado (sin resultado)', () => {
  const a = { ingresos: 1_000_000, gastos: 0, retenciones: 0, pagosAnteriores: 0 }
  assert.equal(calcularModelo130(a, { anio: 2026, trimestre: 1, estimacion: 'directa_simplificada' }).resultado, null)
  assert.equal(calcularModelo130(a, { anio: 2026, trimestre: 1, estimacion: 'objetiva' }).resultado, null)
  assert.match(calcularModelo130(a, { anio: 2026, trimestre: 1, minoracion110: true }).noSoportado.join(' '), /110\.3\.c/)
  assert.throws(() => calcularModelo130({ ...a, ingresos: -1 }, { anio: 2026, trimestre: 1 }), RangeError)
})

test('130 desde asientos: acumulado del año hasta el trimestre, con los asientos de origen; exención por 70 % de retenciones', () => {
  const as: Asiento[] = [
    { numero: 1, fecha: '2026-01-10', ejercicio: 2026, concepto: 'v', apuntes: [{ cuenta: '430', debe: 121000, haber: 0 }, { cuenta: '705', debe: 0, haber: 100000 }, { cuenta: '477', debe: 0, haber: 21000 }], origen: { tipo: 'venta', ref: 'F-1' } },
    { numero: 2, fecha: '2026-02-10', ejercicio: 2026, concepto: 'c', apuntes: [{ cuenta: '622', debe: 40000, haber: 0 }, { cuenta: '472', debe: 8400, haber: 0 }, { cuenta: '400', debe: 0, haber: 48400 }], origen: { tipo: 'compra', ref: 'C-1' } },
    { numero: 3, fecha: '2026-05-10', ejercicio: 2026, concepto: 'v2', apuntes: [{ cuenta: '430', debe: 100000, haber: 0 }, { cuenta: '473', debe: 15000, haber: 0 }, { cuenta: '705', debe: 0, haber: 100000 }, { cuenta: '477', debe: 0, haber: 15000 }], origen: { tipo: 'venta', ref: 'F-2' } },
    { numero: 4, fecha: '2026-08-10', ejercicio: 2026, concepto: 'fuera', apuntes: [{ cuenta: '430', debe: 100, haber: 0 }, { cuenta: '705', debe: 0, haber: 100 }], origen: { tipo: 'venta', ref: 'F-3' } },
  ]
  const ac = acumuladoDeAsientos(as, { anio: 2026, trimestre: 2, pagosAnteriores: 10000 })
  assert.deepEqual([ac.ingresos, ac.gastos, ac.retenciones], [200000, 40000, 15000])
  assert.deepEqual(ac.refsIngresos, ['F-1', 'F-2'])
  assert.deepEqual(ac.refsGastos, ['C-1'])
  const c = calcularModelo130(ac, { anio: 2026, trimestre: 2 })
  assert.equal(importeDe(c, '04'), 32000)
  assert.equal(c.resultado, 32000 - 10000 - 15000)
  assert.deepEqual(casillaDe(c, '01')!.origen, ['F-1', 'F-2'])
  assert.equal(exentoDe130(1_000_000, 700_000), true)
  assert.equal(exentoDe130(1_000_000, 699_999), false)
  assert.equal(exentoDe130(0, 0), null)
})

// ── Calendario y ciclo de vida ─────────────────────────────────────────────────────────────────────────────────

test('vencimientos por modelo coinciden con los avisos fiscales F2 (mismas fechas) para los modelos que ambos conocen', () => {
  const f2 = Object.fromEntries(vencimientosFiscalesDelAnio(2027).map((v) => [v.id, v.fecha]))
  assert.equal(vencimientoModelo('303', 2026, '4T'), f2['2027-enero-q4'])
  assert.equal(vencimientoModelo('111', 2026, '4T'), f2['2027-enero-q4'])
  assert.equal(vencimientoModelo('130', 2026, '4T'), f2['2027-enero-q4'])
  assert.equal(vencimientoModelo('390', 2026, '0A'), f2['2027-enero-anuales'])
  assert.equal(vencimientoModelo('190', 2026, '0A'), f2['2027-enero-190'])
  assert.equal(vencimientoModelo('180', 2026, '0A'), f2['2027-enero-190'])
  assert.equal(vencimientoModelo('347', 2026, '0A'), f2['2027-feb-347'])
  const g = Object.fromEntries(vencimientosFiscalesDelAnio(2026).map((v) => [v.id, v.fecha]))
  assert.equal(vencimientoModelo('303', 2026, '1T'), g['2026-abr-q1'])
  assert.equal(vencimientoModelo('115', 2026, '2T'), g['2026-jul-q2'])
  assert.equal(vencimientoModelo('349', 2026, '3T'), g['2026-oct-q3'])
  assert.equal(vencimientoModelo('347', 2027, '0A'), '2028-02-29', 'febrero bisiesto')
  assert.throws(() => vencimientoModelo('303', 2026, '0A'), ErrorContable)
  assert.throws(() => vencimientoModelo('347', 2026, '1T'), ErrorContable)
})

test('próximos plazos con reloj inyectado: orden, días restantes y 130 solo para autónomos', () => {
  const hoy = new Date('2027-01-10T10:00:00Z')
  const soc = proximosPlazos(hoy, 'sociedad', 60)
  assert.deepEqual(soc.map((p) => [p.modelo, p.periodo, p.anio, p.vencimiento, p.diasRestantes]).slice(0, 3), [
    ['111', '4T', 2026, '2027-01-30', 20], ['115', '4T', 2026, '2027-01-30', 20], ['303', '4T', 2026, '2027-01-30', 20],
  ])
  assert.ok(!soc.some((p) => p.modelo === '130'))
  assert.ok(proximosPlazos(hoy, 'autonomo', 60).some((p) => p.modelo === '130'))
  assert.ok(proximosPlazos(hoy, 'sociedad', 60).some((p) => p.modelo === '347' && p.vencimiento === '2027-02-28'))
  assert.deepEqual(modelosDeForma('sociedad').includes('130'), false)
})

test('ciclo de vida: borrador → revisado → presentado; presentado es definitivo; no se revisa lo no soportado', () => {
  assert.equal(puedeTransitar('borrador', 'revisado'), true)
  assert.equal(puedeTransitar('borrador', 'presentado'), false, 'no se salta la revisión')
  assert.equal(puedeTransitar('revisado', 'presentado'), true)
  assert.equal(puedeTransitar('revisado', 'borrador'), true)
  assert.equal(puedeTransitar('presentado', 'borrador'), false)
  assert.equal(puedeTransitar('presentado', 'revisado'), false)
  const bloqueado = calcularModelo303([op({ sentido: 'recibida', fecha: '2026-01-10', base: 1, tipoIva: 21, cuota: 0, regimen: 'prorrata' })], { anio: 2026, trimestre: 1, regimenIva: 'general' })
  assert.match(problemasParaRevisar(bloqueado).join(' '), /no soportados/)
  assert.deepEqual(problemasParaRevisar(calcularModelo303([], { anio: 2026, trimestre: 1, regimenIva: 'general' })), [])
})

test('presentación manual: fecha real no futura (reloj inyectado) y justificante como referencia de texto', () => {
  const hoy = new Date('2026-04-20T12:00:00Z')
  assert.deepEqual(problemasPresentacion({ fechaPresentacion: '2026-04-18', justificante: '1234567890123 / CSV-AB12' }, hoy), [])
  assert.equal(problemasPresentacion({ fechaPresentacion: '2026-04-21', justificante: 'ABC123' }, hoy).length, 1, 'futura')
  assert.equal(problemasPresentacion({ fechaPresentacion: '2026-02-30', justificante: 'ABC123' }, hoy).length, 1, 'no existe')
  assert.equal(problemasPresentacion({ fechaPresentacion: '2026-04-18', justificante: '' }, hoy).length, 1)
  assert.equal(problemasPresentacion({ fechaPresentacion: '2026-04-18', justificante: '<script>alert(1)</script>' }, hoy).length, 1)
})

// ── Asientos de liquidación ────────────────────────────────────────────────────────────────────────────────────

const plan = crearPlan()
const ej = ejercicioNatural(2026)

function trimestreCompleto() {
  const hechos: HechoContable[] = [
    { tipo: 'venta', fecha: '2026-01-10', ref: 'V-1', desglose: [{ base: 100000, tipoIva: 21 }, { base: 50000, tipoIva: 10 }] },
    { tipo: 'compra', fecha: '2026-02-15', ref: 'K-1', desglose: [{ base: 100000, tipoIva: 21 }], retencion: 15000 },
  ]
  const asientos: Asiento[] = hechos.map((h, i) => ({ ...asientoDesdeHecho(h), numero: i + 1 }))
  const ops = hechos.flatMap((h) => operacionesDeHecho(h as never))
  const rs: RetencionPracticada[] = [ret({ ref: 'K-1', fecha: '2026-02-15', concepto: 'actividad_profesional', percepcion: 100000, retencion: 15000, perceptor: { nif: 'B99999990', nombre: 'Gestoría' } })]
  return { asientos, ops, rs }
}
const saldo = (as: readonly Asiento[], cuenta: string) => { const s = sumasDeAsientos(as).find((x) => x.cuenta === cuenta); return s ? s.debe - s.haber : 0 }

test('caso completo T1 (2 tipos de IVA + retención): 303 = 5.000, 111 = 150,00; 111 ≡ mayor 4751; 303 ≡ mayor 477/472', () => {
  const { asientos, ops, rs } = trimestreCompleto()
  const c303 = calcularModelo303(ops, { anio: 2026, trimestre: 1, regimenIva: 'general' })
  const c111 = calcularModelo111(rs, { anio: 2026, trimestre: 1 })
  assert.equal(importeDe(c303, '27'), 21000 + 5000)
  assert.equal(importeDe(c303, '45'), 21000)
  assert.equal(c303.resultado, 5000)
  assert.equal(c111.resultado, 15000)
  assert.equal(-saldo(asientos, '477'), importeDe(c303, '27'))
  assert.equal(saldo(asientos, '472'), importeDe(c303, '45'))
  assert.equal(-saldo(asientos, '4751'), c111.resultado)
})

test('liquidación del 303: 477/472 → 4750, pago 4750 → 572; los asientos cuadran, son válidos y dejan 477/472/4750 a cero', () => {
  const { asientos, ops } = trimestreCompleto()
  const c = calcularModelo303(ops, { anio: 2026, trimestre: 1, regimenIva: 'general' })
  const props = asientosPresentacion303(c, { pagar: true })
  assert.deepEqual(props.map((p) => p.rol), ['liquidacion', 'pago'])
  const hechos = props.map((p, i) => crearAsiento({ fecha: '2026-03-31', ejercicio: 2026, concepto: p.concepto, apuntes: p.apuntes, origen: { tipo: 'manual', ref: 'm' } }, plan, ej))
  const liq = props[0].apuntes
  assert.deepEqual(liq.map((a) => [a.cuenta, a.debe, a.haber]), [['477', 26000, 0], ['472', 0, 21000], ['4750', 0, 5000]])
  assert.deepEqual(props[1].apuntes.map((a) => [a.cuenta, a.debe, a.haber]), [['4750', 5000, 0], ['572', 0, 5000]])
  const todos = [...asientos, ...hechos.map((h, i) => ({ ...h, numero: 10 + i }))]
  assert.equal(saldo(todos, '477'), 0)
  assert.equal(saldo(todos, '472'), 0)
  assert.equal(saldo(todos, '4750'), 0)
  assert.equal(saldo(todos, '572'), -5000)
  const sinPagar = asientosPresentacion303(c, { pagar: false })
  assert.deepEqual(sinPagar.map((p) => p.rol), ['liquidacion'])
})

test('liquidación del 303 a compensar (4700) y con compensación de cuotas anteriores', () => {
  const ops = [
    op({ ref: 'F', sentido: 'emitida', fecha: '2026-01-10', base: 100000, tipoIva: 21, cuota: 21000 }),
    op({ ref: 'C', sentido: 'recibida', fecha: '2026-01-11', base: 200000, tipoIva: 21, cuota: 42000 }),
  ]
  const neg = asientosPresentacion303(calcularModelo303(ops, { anio: 2026, trimestre: 1, regimenIva: 'general' }), { pagar: true })
  assert.deepEqual(neg.map((p) => p.rol), ['liquidacion'], 'no hay pago si sale a compensar')
  assert.deepEqual(neg[0].apuntes.map((a) => [a.cuenta, a.debe, a.haber]), [['477', 21000, 0], ['472', 0, 42000], ['4700', 21000, 0]])
  const comp = asientosPresentacion303(calcularModelo303(ops.filter((o) => o.ref === 'F'), { anio: 2026, trimestre: 1, regimenIva: 'general', compensarAnteriores: 6000 }), { pagar: true })
  assert.deepEqual(comp[0].apuntes.map((a) => [a.cuenta, a.debe, a.haber]), [['477', 21000, 0], ['4750', 0, 21000], ['4750', 6000, 0], ['4700', 0, 6000]])
  assert.deepEqual(comp[1].apuntes.map((a) => [a.cuenta, a.debe, a.haber]), [['4750', 15000, 0], ['572', 0, 15000]])
  for (const p of [...neg, ...comp]) crearAsiento({ fecha: '2026-03-31', ejercicio: 2026, concepto: p.concepto, apuntes: p.apuntes }, plan, ej)
})

test('pago de retenciones 111/115: 4751 → 572; el 130, el 390 y los anuales no generan asiento; lo no soportado no se liquida', () => {
  const { rs } = trimestreCompleto()
  const c111 = calcularModelo111(rs, { anio: 2026, trimestre: 1 })
  const p = asientosDePresentacion(c111, { pagar: true })
  assert.deepEqual(p[0].apuntes.map((a) => [a.cuenta, a.debe, a.haber]), [['4751', 15000, 0], ['572', 0, 15000]])
  crearAsiento({ fecha: '2026-04-20', ejercicio: 2026, concepto: p[0].concepto, apuntes: p[0].apuntes }, plan, ej)
  assert.deepEqual(asientosDePresentacion(c111, { pagar: false }), [])
  assert.deepEqual(asientosDePresentacion(calcularModelo130({ ingresos: 1_000_000, gastos: 0, retenciones: 0, pagosAnteriores: 0 }, { anio: 2026, trimestre: 1 }), { pagar: true }), [])
  assert.deepEqual(asientosDePresentacion(calcularModelo190([], 2026), { pagar: true }), [])
  const bloqueado = calcularModelo303([op({ sentido: 'recibida', fecha: '2026-01-10', base: 1, tipoIva: 21, cuota: 0, regimen: 'otro' })], { anio: 2026, trimestre: 1, regimenIva: 'general' })
  assert.throws(() => asientosPresentacion303(bloqueado, { pagar: true }), ErrorContable)
})

// ── Borrador ────────────────────────────────────────────────────────────────────────────────────────────────────

test('borrador HTML/CSV: lleva la marca «diseño oficial pendiente», el aviso de presentación, el origen de cada casilla y escapa el texto', () => {
  const { ops } = trimestreCompleto()
  const c = calcularModelo303([...ops, op({ ref: '<img src=x>', sentido: 'emitida', fecha: '2026-01-12', base: 100, tipoIva: 21, cuota: 21 })], { anio: 2026, trimestre: 1, regimenIva: 'general' })
  const html = borradorHtml(c, { empresa: 'Taller <b>Ñ</b> SL', nif: 'B12345678', generado: '2026-04-01' })
  assert.match(html, /diseño oficial pendiente de contrastar/)
  assert.ok(html.includes(AVISO_PRESENTACION.slice(0, 40)))
  assert.match(html, /Borrador sin validez ante la AEAT/)
  assert.ok(!html.includes('<img src=x>') && !html.includes('<b>Ñ</b>'), 'HTML escapado')
  assert.match(html, /V-1/)
  const csv = borradorCsv(c)
  assert.ok(csv.startsWith('﻿Modelo;Periodo;Ejercicio;Casilla'))
  assert.match(csv, /303;1T;2026;09;[^;]*;210,21;alta;/)
  assert.match(csv, /diseño oficial pendiente de contrastar/)
  assert.match(csv, /303;1T;2026;08;[^;]*;21;alta/)
})
