import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barrasPeriodicas, barrasCerradas, claveDePeriodo, caidaDesdeMaximo, volumenRelativo, senalCapitulacion, serieDiscontinua } from './velas.ts'
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

// ── Barra EN CURSO: la landmine del 06/08/2026 ────────────────────────────────
// Descubierta en producción: el volumen relativo mensual daba mediana 0,047 cuando el día 1 del
// snapshot caía en día hábil, y 1,02 cuando caía en sábado/domingo. Misma serie, mismo código: la
// diferencia era que en finde no hay cotización y la última barra ya era el mes anterior CERRADO.

test('claveDePeriodo agrupa igual que barrasPeriodicas (mes y semana ISO)', () => {
  assert.equal(claveDePeriodo('2026-04-01', 'mes'), '2026-04')
  // 2026-04-01 es miércoles → su semana ISO empieza el lunes 2026-03-30.
  assert.equal(claveDePeriodo('2026-04-01', 'sem'), '2026-03-30')
  assert.equal(claveDePeriodo('2026-03-30', 'sem'), '2026-03-30')  // el propio lunes
  assert.equal(claveDePeriodo('2026-04-05', 'sem'), '2026-03-30')  // domingo = fin de ESA semana ISO
})

test('barrasCerradas descarta el mes EN CURSO; barrasPeriodicas lo dejaba entrar', () => {
  const puntos = [
    p('2026-02-10', 100, 1000), p('2026-02-20', 100, 1000),   // febrero completo: 2000
    p('2026-03-10', 100, 1000), p('2026-03-20', 100, 1000),   // marzo completo: 2000
    p('2026-04-01', 90, 90),                                  // 1 día de abril: 90
  ]
  const conEnCurso = barrasPeriodicas(puntos, '2026-04-01', 'mes')
  assert.equal(conEnCurso[conEnCurso.length - 1].clave, '2026-04')
  assert.equal(conEnCurso[conEnCurso.length - 1].volumen, 90)    // el mes a medias

  const cerradas = barrasCerradas(puntos, '2026-04-01', 'mes')
  assert.equal(cerradas.length, conEnCurso.length - 1)
  assert.equal(cerradas[cerradas.length - 1].clave, '2026-03')
  assert.equal(cerradas[cerradas.length - 1].volumen, 2000)      // mes completo
})

test('barrasCerradas NO descarta nada si el último periodo ya está cerrado (día 1 en finde)', () => {
  const puntos = [
    p('2026-02-10', 100, 1000),
    p('2026-02-27', 100, 1000),   // viernes: último día hábil de febrero
  ]
  // 2026-03-01 cae en domingo → no hay cotización, la última barra ES febrero cerrado.
  const cerradas = barrasCerradas(puntos, '2026-03-01', 'mes')
  assert.equal(cerradas.length, 1)
  assert.equal(cerradas[0].clave, '2026-02')
})

test('el volumen relativo deja de hundirse: la barra truncada daba ~1/21, la cerrada da ~1', () => {
  // 13 meses completos de 2.000 (dos sesiones de 1.000) + un mes en curso con UNA sesión de 1.000.
  // Hacen falta 13 cerradas porque `volumenRelativo` mide la actual contra las 12 ANTERIORES.
  const puntos: PuntoVol[] = []
  for (let i = 0; i < 13; i++) {
    const total = 2025 * 12 + i
    const ym = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
    puntos.push(p(`${ym}-10`, 100, 1000), p(`${ym}-20`, 100, 1000))
  }
  puntos.push(p('2026-02-02', 100, 1000))  // 1 sola sesión del mes en curso

  const roto = volumenRelativo(barrasPeriodicas(puntos, '2026-02-02', 'mes'))
  assert.ok(roto !== null && roto < 0.6, `barra en curso: ${roto} (media sesión contra meses enteros)`)
  const sano = volumenRelativo(barrasCerradas(puntos, '2026-02-02', 'mes'))
  assert.equal(sano, 1)  // último mes CERRADO (2.000) contra la media de los 11 anteriores (2.000)
})

test('capitulación real: con la barra en curso NO salta, con la cerrada SÍ', () => {
  // 12 meses planos a 100 con volumen 2.000, y un mes de capitulación (cierra a 70, volumen 6.000).
  const puntos: PuntoVol[] = []
  for (let i = 0; i < 12; i++) {
    const total = 2025 * 12 + i
    const ym = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
    puntos.push(p(`${ym}-10`, 100, 1000), p(`${ym}-20`, 100, 1000))
  }
  puntos.push(p('2026-01-10', 70, 3000), p('2026-01-20', 70, 3000))  // enero: capitulación clara
  puntos.push(p('2026-02-02', 71, 120))                              // febrero: 1 sesión floja

  // Snapshot del 2026-02-02 (lunes hábil): con la barra en curso, la señal mira febrero a medias.
  const conEnCurso = senalCapitulacion(barrasPeriodicas(puntos, '2026-02-02', 'mes'))
  assert.equal(conEnCurso.activa, false)
  assert.equal(conEnCurso.motivo, 'sin-volumen')   // «mirado y no salta» — pero era una barra a medias

  const cerrada = senalCapitulacion(barrasCerradas(puntos, '2026-02-02', 'mes'))
  assert.equal(cerrada.activa, true)               // enero cerrado: −30% con 3× de volumen
  assert.ok(cerrada.caida !== null && cerrada.caida <= -0.25)
  assert.ok(cerrada.volRel !== null && cerrada.volRel >= 1.5)
})

test('serieDiscontinua caza el contrasplit y el split, y NO una caída fuerte de verdad', () => {
  const plano = (n: number, precio: number) => Array.from({ length: n }, (_, i) => [precio, 2000] as [number, number])
  // 13 barras planas a 100 → sin costura.
  assert.equal(serieDiscontinua(barrasPeriodicas(meses(plano(13, 100)), '2030-01-01', 'mes')), false)
  // Caída BRUTAL pero continua (−60% en un mes): es mercado, no una costura.
  const caidaReal = barrasPeriodicas(meses([...plano(12, 100), [40, 6000]]), '2030-01-01', 'mes')
  assert.equal(serieDiscontinua(caidaReal), false)
  // Contrasplit 1:20 (precio ×20 de un mes al siguiente).
  const contrasplit = barrasPeriodicas(meses([...plano(12, 5), [100, 2000]]), '2030-01-01', 'mes')
  assert.equal(serieDiscontinua(contrasplit), true)
  // Split 10:1 (precio ÷10) en mitad de la ventana, no solo en la última barra.
  const split = barrasPeriodicas(meses([...plano(6, 500), ...plano(7, 50)]), '2030-01-01', 'mes')
  assert.equal(serieDiscontinua(split), true)
})

test('capitulación: un CONTRASPLIT no se guarda como señal — devuelve null, no true ni false', () => {
  // Caso QUHUO: 12 meses a 100 y el último cierra a 8 (÷12,5) con volumen alto. Sin la guarda esto
  // es «caída del −92% con 3× de volumen» = capitulación de manual, y jamás ocurrió.
  const puntos: PuntoVol[] = []
  for (let i = 0; i < 12; i++) {
    const total = 2025 * 12 + i
    const ym = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
    puntos.push(p(`${ym}-10`, 100, 1000), p(`${ym}-20`, 100, 1000))
  }
  puntos.push(p('2026-01-10', 8, 3000), p('2026-01-20', 8, 3000))

  const s = senalCapitulacion(barrasCerradas(puntos, '2026-02-01', 'mes'))
  assert.equal(s.activa, null)          // «no se puede saber», NUNCA true
  assert.equal(s.motivo, 'serie-rota')
  assert.equal(s.caida, null)           // la caída del −92% tampoco es un dato
  assert.equal(s.volRel, null)
})

test('capitulación: volumen relativo imposible (ticker recién listado) también da null', () => {
  // Caso Smurfit Westrock: 12 meses de cotización residual (volumen 1) y el primero de verdad
  // (volumen 100.000) → volRel ≈ 100.000. Precios continuos: solo lo caza el techo de volumen.
  const puntos: PuntoVol[] = []
  for (let i = 0; i < 12; i++) {
    const total = 2025 * 12 + i
    const ym = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
    puntos.push(p(`${ym}-10`, 100, 1), p(`${ym}-20`, 95, 1))
  }
  puntos.push(p('2026-01-10', 70, 50_000), p('2026-01-20', 70, 50_000))

  const s = senalCapitulacion(barrasCerradas(puntos, '2026-02-01', 'mes'))
  assert.equal(s.activa, null)
  assert.equal(s.motivo, 'serie-rota')
})

test('capitulación de verdad: la guarda NO la anula', () => {
  // La misma serie del test anterior de capitulación real (−30% con 3× de volumen) sigue saltando.
  const puntos: PuntoVol[] = []
  for (let i = 0; i < 12; i++) {
    const total = 2025 * 12 + i
    const ym = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
    puntos.push(p(`${ym}-10`, 100, 1000), p(`${ym}-20`, 100, 1000))
  }
  puntos.push(p('2026-01-10', 70, 3000), p('2026-01-20', 70, 3000))

  const s = senalCapitulacion(barrasCerradas(puntos, '2026-02-01', 'mes'))
  assert.equal(s.activa, true)
  assert.equal(s.motivo, 'activa')
})
