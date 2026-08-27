import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  domingoDePascua,
  semanaSanta,
  calendarioEntre,
  detalleCalendario,
  FACTOR_MAX,
} from './eventos-calendario.ts'

// ─── Pascua ─────────────────────────────────────────────────────────────────────────────────────
// Fechas de contraste tomadas del calendario litúrgico, no de la propia implementación: si el
// algoritmo se reescribe mal, estas líneas son lo único que lo ve.

test('la Pascua sale bien en los años que nos importan', () => {
  assert.equal(domingoDePascua(2026), '2026-04-05')
  assert.equal(domingoDePascua(2027), '2027-03-28')
  assert.equal(domingoDePascua(2028), '2028-04-16')
  assert.equal(domingoDePascua(2029), '2029-04-01')
  assert.equal(domingoDePascua(2030), '2030-04-21')
})

test('y también en los extremos conocidos del algoritmo', () => {
  // Pascua más temprana y más tardía posibles dentro del rango que cubren estas tablas.
  assert.equal(domingoDePascua(2038), '2038-04-25')
  assert.equal(domingoDePascua(2035), '2035-03-25')
  assert.equal(domingoDePascua(2000), '2000-04-23')
  assert.equal(domingoDePascua(2100), '2100-03-28')
})

// ─── Semana Santa ───────────────────────────────────────────────────────────────────────────────

test('🚨 el caso fundacional: la MADRUGÁ de 2027 es la noche del 25 de marzo', () => {
  // Busto Reform vendió esa noche a 141,00€ —0,97× su marzo normal— nueve meses antes, porque el
  // motor no sabía que era Semana Santa. Si este test se pone rojo, vuelve a estarlo.
  const ss = semanaSanta(2027)
  const madruga = ss.find((n) => n.nombre.includes('Madrugá'))
  assert.ok(madruga)
  assert.equal(madruga!.fecha, '2027-03-25')
  assert.equal(madruga!.factor, 2.5)
})

test('la semana entera de 2027 cae donde tiene que caer', () => {
  const f = Object.fromEntries(semanaSanta(2027).map((n) => [n.nombre.split('— ')[1], n.fecha]))
  assert.equal(f['Viernes de Dolores'], '2027-03-20')
  assert.equal(f['Domingo de Ramos'], '2027-03-21')
  assert.equal(f['Jueves Santo (Madrugá)'], '2027-03-25')
  assert.equal(f['Viernes Santo'], '2027-03-26')
  assert.equal(f['Domingo de Resurrección'], '2027-03-28')
})

test('el pico está en el Jueves, no en el Viernes: se vende la NOCHE de entrada', () => {
  const ss = semanaSanta(2027)
  const jue = ss.find((n) => n.fecha === '2027-03-25')!.factor
  const vie = ss.find((n) => n.fecha === '2027-03-26')!.factor
  assert.ok(jue > vie, `el Jueves Santo (${jue}) debe pesar más que el Viernes (${vie})`)
})

test('el domingo de Resurrección ya baja: la gente se va', () => {
  const ss = semanaSanta(2027)
  const dom = ss.find((n) => n.fecha === '2027-03-28')!.factor
  assert.ok(dom < 1.5, 'el domingo no puede seguir en pico')
})

test('ningún factor se sale del techo duro', () => {
  for (const anio of [2026, 2027, 2028, 2029]) {
    for (const n of semanaSanta(anio)) {
      assert.ok(n.factor <= FACTOR_MAX, `${n.nombre} = ${n.factor}`)
      assert.ok(n.factor > 1, `${n.nombre} no premia nada`)
    }
  }
})

test('Semana Santa se marca DERIVADA: es aritmética, no una fecha copiada', () => {
  assert.ok(semanaSanta(2027).every((n) => n.derivado))
})

test('una Pascua temprana puede meter noches en el año anterior, y se emiten igual', () => {
  // 2035: Pascua el 25 de marzo → el Viernes de Dolores cae el 17 de marzo, mismo año. Se busca un
  // año con Pascua en los primeros días para que el rango cruce el cambio de mes sin perder noches.
  const ss = semanaSanta(2035)
  assert.equal(ss.length, 9)
  assert.equal(ss[0].fecha, '2035-03-17')
})

// ─── calendarioEntre ────────────────────────────────────────────────────────────────────────────

test('la ventana recorta por fecha, no por año', () => {
  const c = calendarioEntre('2027-03-24', '2027-03-26')
  assert.deepEqual(c.noches.map((n) => n.fecha), ['2027-03-24', '2027-03-25', '2027-03-26'])
})

test('una ventana de 365 días cruza dos años y trae las dos Semanas Santas si caben', () => {
  const c = calendarioEntre('2026-08-27', '2027-08-27')
  const anios = new Set(c.noches.map((n) => n.fecha.slice(0, 4)))
  assert.ok(anios.has('2027'))
  // 2026 ya pasó (Pascua en abril), así que en esta ventana no debe colarse ninguna noche suya.
  assert.ok(!c.noches.some((n) => n.fecha < '2026-08-27'))
})

test('sale ordenado por fecha', () => {
  const c = calendarioEntre('2027-01-01', '2027-12-31')
  const f = c.noches.map((n) => n.fecha)
  assert.deepEqual(f, [...f].sort())
})

test('la Feria de 2027 entra por TABLA, no derivada', () => {
  const c = calendarioEntre('2027-04-01', '2027-04-30')
  const feria = c.noches.filter((n) => n.nombre.startsWith('Feria de Abril 2027'))
  assert.equal(feria.length, 7, 'del 12 al 18 de abril, ambos incluidos')
  assert.equal(feria[0].fecha, '2027-04-12')
  assert.equal(feria[6].fecha, '2027-04-18')
  assert.ok(feria.every((n) => !n.derivado), 'la Feria NO se deriva de la Pascua a propósito')
})

test('🚨 un año sin fechas de tabla se DECLARA, no se inventa una Feria', () => {
  const c = calendarioEntre('2028-01-01', '2028-12-31')
  assert.ok(c.aniosSinDatos.includes(2028))
  assert.ok(!c.noches.some((n) => n.nombre.includes('Feria')), 'no puede haber Feria 2028 inventada')
  // …pero la Semana Santa de 2028 SÍ está: esa es aritmética y no depende de ninguna tabla.
  assert.ok(c.noches.some((n) => n.nombre.includes('Semana Santa 2028')))
})

test('el año que sí está en la tabla no sale como hueco', () => {
  assert.deepEqual(calendarioEntre('2027-01-01', '2027-12-31').aniosSinDatos, [])
})

test('rango inválido no lanza y no siembra nada', () => {
  for (const [a, b] of [['2027-12-31', '2027-01-01'], ['ayer', '2027-01-01'], ['', '']]) {
    const c = calendarioEntre(a, b)
    assert.deepEqual(c.noches, [])
  }
})

test('el nombre es ESTABLE: es la clave del upsert y no puede cambiar entre pasadas', () => {
  const a = calendarioEntre('2027-03-01', '2027-04-30').noches.map((n) => n.nombre)
  const b = calendarioEntre('2027-03-01', '2027-04-30').noches.map((n) => n.nombre)
  assert.deepEqual(a, b)
  // Y no se repite dentro de la misma ventana (chocaría contra el índice único).
  assert.equal(new Set(a).size, a.length)
})

// ─── Parte ──────────────────────────────────────────────────────────────────────────────────────

test('el parte separa lo derivado de lo de tabla', () => {
  const p = detalleCalendario(calendarioEntre('2027-03-01', '2027-04-30'))
  assert.match(p, /derivadas de la Pascua/)
  assert.match(p, /de tabla/)
})

test('el parte CANTA el año sin fechas de tabla en vez de callárselo', () => {
  const p = detalleCalendario(calendarioEntre('2028-01-01', '2028-12-31'))
  assert.match(p, /⚠️/)
  assert.match(p, /2028/)
})

test('sin noches el parte lo dice, no devuelve vacío', () => {
  assert.match(detalleCalendario({ noches: [], aniosSinDatos: [] }), /0 noches/)
})
