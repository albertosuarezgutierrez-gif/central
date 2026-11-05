// Avisos: calendario fiscal (10/5/1 días) con «hoy» INYECTADO, caída de ventas/margen, caja negativa, hechos rechazados, efectivo.
// Ninguna fecha se compara con el reloj real: todas se construyen relativas a un `hoy` fijo del propio test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisosCalendarioFiscal, avisosCaida, avisoTesoreriaNegativa, avisoHechosRechazados, avisosEfectivo, evaluarAvisos, previsionTesoreria,
  vencimientosFiscalesDelAnio, canalNoConectado, sumarDias, aFechaISO,
} from '../src/index.ts'
import type { PuntoSerie } from '../src/index.ts'

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const antes = (iso: string, n: number) => dia(sumarDias(iso, -n))

test('calendario: 20 abr, 20 jul, 20 oct y 30 ene existen cada año; 347 el último día de febrero (bisiesto incluido)', () => {
  const v = vencimientosFiscalesDelAnio(2028)
  for (const f of ['2028-01-30', '2028-04-20', '2028-07-20', '2028-10-20', '2028-02-29']) assert.ok(v.some((x) => x.fecha === f), f)
  assert.ok(vencimientosFiscalesDelAnio(2027).some((x) => x.fecha === '2027-02-28'))
})

test('fiscal: avisa a 10, 5 y 1 días (y el día del vencimiento) con el umbral y la clave correctos', () => {
  const q1 = '2027-04-20'
  const umbral = (n: number) => avisosCalendarioFiscal(antes(q1, n), 'sociedad').filter((a) => a.clave.includes('abr-q1')).map((a) => a.clave)
  assert.deepEqual(umbral(11), [])
  assert.deepEqual(umbral(10), ['fiscal:2027-abr-q1:10'])
  assert.deepEqual(umbral(7), ['fiscal:2027-abr-q1:10'])
  assert.deepEqual(umbral(5), ['fiscal:2027-abr-q1:5'])
  assert.deepEqual(umbral(2), ['fiscal:2027-abr-q1:5'])
  assert.deepEqual(umbral(1), ['fiscal:2027-abr-q1:1'])
  assert.deepEqual(umbral(0), ['fiscal:2027-abr-q1:1'])
  assert.deepEqual(avisosCalendarioFiscal(dia('2027-04-21'), 'sociedad').filter((a) => a.clave.includes('abr-q1')), [], 'pasado: no avisa')
  const hoy = avisosCalendarioFiscal(dia(q1), 'sociedad').find((a) => a.clave.includes('abr-q1'))!
  assert.equal(hoy.severidad, 'alerta'); assert.match(hoy.titulo, /Vence hoy/)
  assert.match(hoy.detalle, /festivo/)
})

test('fiscal: mismo día dos veces = mismas claves (deduplicable); autónomo no recibe lo de sociedades; enero ve el 30 de enero', () => {
  const h = dia('2027-07-15')
  assert.deepEqual(avisosCalendarioFiscal(h, 'sociedad').map((a) => a.clave), avisosCalendarioFiscal(h, 'sociedad').map((a) => a.clave))
  const soc = avisosCalendarioFiscal(dia('2027-07-15'), 'sociedad').map((a) => a.clave)
  const aut = avisosCalendarioFiscal(dia('2027-07-15'), 'autonomo').map((a) => a.clave)
  assert.ok(soc.some((c) => c.includes('jul-is')) && !aut.some((c) => c.includes('jul-is')))
  assert.ok(avisosCalendarioFiscal(dia('2028-01-20'), 'autonomo').some((a) => a.clave === 'fiscal:2028-enero-q4:10'))
  assert.deepEqual(avisosCalendarioFiscal(dia('2027-11-15'), 'sociedad'), [])
})

const p = (clave: string, ventas: number | null, margenPct: number | null, hasta: string): PuntoSerie => ({
  clave, etiqueta: clave, desde: `${clave}-01`, hasta, ventas, gastos: null, resultado: null, margenPct, caja: null, resultadoAcumulado: null, ventasAnioAnterior: null,
})
const serie = (ventas: (number | null)[], margenes: (number | null)[]): PuntoSerie[] =>
  ventas.map((v, i) => p(`2027-0${i + 1}`, v, margenes[i], `2027-0${i + 1}-28`))

test('caída: ventas o margen del último mes completo > 20 % bajo la media de 3 meses → aviso; el mes en curso no cuenta', () => {
  const hoy = dia('2027-05-10')
  const s = serie([10000, 10000, 10000, 7000, 99], [40, 40, 40, 40, 1])
  const r = avisosCaida(s, hoy)
  assert.deepEqual(r.map((a) => a.clave), ['ventas:2027-04'])
  assert.match(r[0].titulo, /30 %/)
  const m = avisosCaida(serie([10000, 10000, 10000, 10000, 5], [40, 40, 40, 20, 0]), hoy)
  assert.deepEqual(m.map((a) => a.clave), ['margen:2027-04'])
  assert.equal(avisosCaida(serie([10000, 10000, 10000, 8000, 5], [40, 40, 40, 40, 0]), hoy).length, 0, 'justo 20 % no supera el umbral')
  assert.equal(avisosCaida(serie([10000, 10000, 10000, 8000, 5], [40, 40, 40, 40, 0]), hoy, 10).length, 1, 'umbral configurable')
})

test('caída: SIN DATOS no se afirma nada (mes en blanco, base 0, pocos meses)', () => {
  const hoy = dia('2027-05-10')
  assert.deepEqual(avisosCaida(serie([10000, null, 10000, 3000, 1], [40, 40, 40, 40, 1]), hoy), [], 'un mes previo sin datos')
  assert.deepEqual(avisosCaida(serie([0, 0, 0, 0, 1], [null, null, null, null, 1]), hoy), [])
  assert.deepEqual(avisosCaida(serie([10000, 10000, null, 5, 1], [40, 40, 40, 40, 1]).slice(2), hoy), [])
  assert.deepEqual(avisosCaida(serie([10000, 10000, 10000, null, 1], [40, 40, 40, null, 1]), hoy), [], 'último mes sin datos')
  assert.throws(() => avisosCaida([], hoy, 0))
})

test('tesorería: saldo previsto negativo avisa con su fecha; sin previsión o sin negativo, no', () => {
  const hoy = dia('2027-06-01')
  assert.deepEqual(avisoTesoreriaNegativa(null), [])
  assert.deepEqual(avisoTesoreriaNegativa(previsionTesoreria({ saldoCaja: 1000, vencimientos: [], hoy })), [])
  const prev = previsionTesoreria({ saldoCaja: 1000, vencimientos: [{ fecha: '2027-06-10', importe: -5000 }], hoy })
  const a = avisoTesoreriaNegativa(prev)
  assert.equal(a.length, 1); assert.equal(a[0].clave, 'tesoreria:2027-06-15'); assert.equal(a[0].severidad, 'alerta')
  assert.match(a[0].detalle, /-40,00€/)
})

test('hechos: rechazados y por clasificar avisan; null (no contado) y 0 no', () => {
  assert.deepEqual(avisoHechosRechazados(null, null), [])
  assert.deepEqual(avisoHechosRechazados(0, 0), [])
  const a = avisoHechosRechazados(2, 1)
  assert.deepEqual(a.map((x) => x.clave), ['hechos:rechazados:2', 'hechos:pendientes:1'])
  assert.match(a[0].titulo, /2 hechos rechazados/)
})

test('efectivo: cobros en efectivo ≥ 1.000 € avisan una vez por referencia; por debajo, no', () => {
  const a = avisosEfectivo([{ ref: 'K-1', fecha: '2027-06-01', importe: 100000 }, { ref: 'K-2', fecha: '2027-06-01', importe: 99999 }])
  assert.deepEqual(a.map((x) => x.clave), ['efectivo:K-1'])
  assert.match(a[0].titulo, /1\.000,00€/)
})

test('evaluarAvisos junta todo con claves únicas; el canal externo NO está conectado (no envía)', async () => {
  const hoy = dia('2027-04-19')
  const todos = evaluarAvisos({
    hoy, forma: 'sociedad', mensual: serie([10000, 10000, 10000, 5000, 1], [40, 40, 40, 40, 1]).map((x, i) => ({ ...x, hasta: sumarDias('2027-04-19', -30 * (4 - i) - 1) })),
    prevision: previsionTesoreria({ saldoCaja: 0, vencimientos: [{ fecha: '2027-04-25', importe: -1 }], hoy }),
    hechosRechazados: 1, hechosPendientes: 0, cobrosEfectivo: [{ ref: 'K', fecha: aFechaISO(hoy), importe: 200000 }],
  })
  const claves = todos.map((x) => x.clave)
  assert.equal(new Set(claves).size, claves.length)
  for (const tipo of ['fiscal', 'ventas', 'tesoreria', 'hechos', 'efectivo']) assert.ok(todos.some((x) => x.tipo === tipo), tipo)
  assert.equal(await canalNoConectado.enviar({ empresaId: 'x' }, todos[0]), undefined)
})
