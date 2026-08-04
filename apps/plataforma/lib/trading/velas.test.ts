import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barrasPeriodicas, caidaDesdeMaximo, volumenRelativo, senalCapitulacion } from './velas.ts'
import type { PuntoVol } from './precios-stooq.ts'

const p = (fecha: string, cierre: number, volumen: number | null = 1000): PuntoVol => ({ fecha, cierre, volumen })

// Serie sintética de `n` barras mensuales al precio y volumen dados (día 15 de cada mes desde 2024-01).
function meses(valores: Array<[number, number | null]>): PuntoVol[] {
  return valores.map(([cierre, volumen], i) => {
    const total = 2024 * 12 + i
    return p(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-15`, cierre, volumen)
  })
}

test('barrasPeriodicas agrupa por mes: apertura/cierre/extremos de CIERRES y suma el volumen', () => {
  const b = barrasPeriodicas([
    p('2024-01-03', 10, 100), p('2024-01-17', 14, 200), p('2024-01-31', 12, 300),
    p('2024-02-02', 13, 50),
  ], '2024-12-31', 'mes')
  assert.equal(b.length, 2)
  assert.deepEqual(b[0], { clave: '2024-01', apertura: 10, cierre: 12, maxCierre: 14, minCierre: 10, volumen: 600 })
  assert.equal(b[1].clave, '2024-02')
})

test('barrasPeriodicas agrupa la semana por su LUNES (mismo criterio que cierresPeriodicos)', () => {
  // 2024-01-04 es jueves y 2024-01-05 viernes → misma semana (lunes 2024-01-01); el 8 es el lunes siguiente.
  const b = barrasPeriodicas([p('2024-01-04', 10), p('2024-01-05', 11), p('2024-01-08', 12)], '2024-12-31', 'sem')
  assert.equal(b.length, 2)
  assert.equal(b[0].clave, '2024-01-01')
  assert.equal(b[0].cierre, 11)
  assert.equal(b[1].clave, '2024-01-08')
})

test('barrasPeriodicas respeta el corte `hasta` (sin look-ahead)', () => {
  const b = barrasPeriodicas([p('2024-01-15', 10), p('2024-02-15', 20), p('2024-03-15', 30)], '2024-02-28', 'mes')
  assert.equal(b.length, 2)
  assert.equal(b[b.length - 1].cierre, 20)
})

test('un día sin volumen no cuenta como cero; la barra solo es null si NINGÚN día lo trajo', () => {
  const conAlguno = barrasPeriodicas([p('2024-01-03', 10, null), p('2024-01-17', 11, 500)], '2024-12-31', 'mes')
  assert.equal(conAlguno[0].volumen, 500)
  const sinNinguno = barrasPeriodicas([p('2024-01-03', 10, null), p('2024-01-17', 11, null)], '2024-12-31', 'mes')
  assert.equal(sinNinguno[0].volumen, null)
})

test('caidaDesdeMaximo: null sin histórico suficiente — «no se sabe», nunca 0', () => {
  const b = barrasPeriodicas(meses(Array.from({ length: 12 }, () => [100, 1000] as [number, number])), '2030-01-01', 'mes')
  assert.equal(b.length, 12)
  assert.equal(caidaDesdeMaximo(b, 12), null)   // hacen falta 12 PREVIAS + la actual
})

test('caidaDesdeMaximo compara con el máximo de las 12 anteriores, excluida la actual', () => {
  // 12 meses a 100 (con un pico de 200 en medio) y el 13º a 150: cae respecto al pico, no respecto a 100.
  const valores: Array<[number, number | null]> = Array.from({ length: 12 }, () => [100, 1000])
  valores[5] = [200, 1000]
  valores.push([150, 1000])
  const b = barrasPeriodicas(meses(valores), '2030-01-01', 'mes')
  assert.equal(caidaDesdeMaximo(b, 12), 150 / 200 - 1)
})

test('caidaDesdeMaximo da ~0 en máximos y no confunde «en máximos» con «sin datos»', () => {
  const valores: Array<[number, number | null]> = Array.from({ length: 13 }, (_, i) => [100 + i, 1000])
  const b = barrasPeriodicas(meses(valores), '2030-01-01', 'mes')
  const c = caidaDesdeMaximo(b, 12)
  assert.ok(c !== null && c > 0)   // el último es el más alto de todos
})

test('volumenRelativo: 2x cuando la última barra dobla la media previa', () => {
  const valores: Array<[number, number | null]> = Array.from({ length: 12 }, () => [100, 1000])
  valores.push([100, 2000])
  const b = barrasPeriodicas(meses(valores), '2030-01-01', 'mes')
  assert.equal(volumenRelativo(b, 12), 2)
})

test('volumenRelativo es null si la barra actual no trae volumen (no 0)', () => {
  const valores: Array<[number, number | null]> = Array.from({ length: 12 }, () => [100, 1000])
  valores.push([100, null])
  const b = barrasPeriodicas(meses(valores), '2030-01-01', 'mes')
  assert.equal(volumenRelativo(b, 12), null)
})

test('volumenRelativo es null si menos de media ventana previa tiene volumen', () => {
  const valores: Array<[number, number | null]> = Array.from({ length: 12 }, (_, i) => [100, i < 5 ? 1000 : null])
  valores.push([100, 2000])
  const b = barrasPeriodicas(meses(valores), '2030-01-01', 'mes')
  assert.equal(volumenRelativo(b, 12), null)
})

test('senalCapitulacion: TRES estados — null sin datos, false mirado-y-no-salta, true salta', () => {
  const corta = barrasPeriodicas(meses([[100, 1000], [90, 1000]]), '2030-01-01', 'mes')
  assert.equal(senalCapitulacion(corta).activa, null)
  assert.equal(senalCapitulacion(corta).motivo, 'sin-datos')

  const planos: Array<[number, number | null]> = Array.from({ length: 12 }, () => [100, 1000])

  const sinCaida = barrasPeriodicas(meses([...planos, [98, 5000]]), '2030-01-01', 'mes')
  assert.equal(senalCapitulacion(sinCaida).activa, false)
  assert.equal(senalCapitulacion(sinCaida).motivo, 'sin-caida')

  const sinVolumen = barrasPeriodicas(meses([...planos, [60, 1000]]), '2030-01-01', 'mes')
  assert.equal(senalCapitulacion(sinVolumen).activa, false)
  assert.equal(senalCapitulacion(sinVolumen).motivo, 'sin-volumen')

  const salta = barrasPeriodicas(meses([...planos, [60, 2000]]), '2030-01-01', 'mes')
  const s = senalCapitulacion(salta)
  assert.equal(s.activa, true)
  assert.equal(s.motivo, 'activa')
  assert.equal(s.caida, 60 / 100 - 1)
  assert.equal(s.volRel, 2)
})

test('senalCapitulacion respeta el borde exacto de los umbrales (−25% y 1,5x)', () => {
  const planos: Array<[number, number | null]> = Array.from({ length: 12 }, () => [100, 1000])
  const justo = barrasPeriodicas(meses([...planos, [75, 1500]]), '2030-01-01', 'mes')
  assert.equal(senalCapitulacion(justo).activa, true)
  const casi = barrasPeriodicas(meses([...planos, [75.5, 1500]]), '2030-01-01', 'mes')
  assert.equal(senalCapitulacion(casi).activa, false)
  const flojo = barrasPeriodicas(meses([...planos, [75, 1499]]), '2030-01-01', 'mes')
  assert.equal(senalCapitulacion(flojo).activa, false)
})

test('senalCapitulacion sin volumen en la serie NO afirma «no hay señal»: devuelve null', () => {
  const valores: Array<[number, number | null]> = Array.from({ length: 12 }, () => [100, null])
  valores.push([50, null])
  const b = barrasPeriodicas(meses(valores), '2030-01-01', 'mes')
  const s = senalCapitulacion(b)
  assert.equal(s.activa, null)
  assert.ok(s.caida !== null)      // la caída SÍ se conoce
  assert.equal(s.volRel, null)     // el volumen no
})
