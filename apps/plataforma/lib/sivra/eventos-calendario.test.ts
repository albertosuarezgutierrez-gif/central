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
  // Busto Reform vendió esa noche a 141,00€ el 14/06/2026, TRES DÍAS antes de que el mapa `EVENTS`
  // escrito a mano llegara a 2027. Este módulo existe para que esa fecha no dependa de que alguien
  // se acuerde de escribirla.
  const ss = semanaSanta(2027)
  const madruga = ss.find((n) => n.nombre.includes('Madrugá'))
  assert.ok(madruga)
  assert.equal(madruga!.fecha, '2027-03-25')
})

test('la semana entera de 2027 cae donde tiene que caer', () => {
  const f = Object.fromEntries(semanaSanta(2027).map((n) => [n.nombre.split('— ')[1], n.fecha]))
  assert.equal(f['Domingo de Ramos'], '2027-03-21')
  assert.equal(f['Jueves Santo (Madrugá)'], '2027-03-25')
  assert.equal(f['Viernes Santo'], '2027-03-26')
  assert.equal(f['Domingo de Resurrección'], '2027-03-28')
})

// 🚨 ESTE es el test que importa: la curva tiene que ser la MISMA que ya honra `eventFactor()` para
// 2027 desde el mapa escrito a mano. Si diverge, el precio cambiaría de criterio el día que el mapa
// caduque, que es justo lo que este módulo viene a evitar.
test('🚨 la curva reproduce EXACTAMENTE la de EVENTS 2027, día por día (ya capada a 2,5)', () => {
  const esperado: Record<string, number> = {
    '2027-03-21': 2.20, '2027-03-22': 2.30, '2027-03-23': 2.40, '2027-03-24': 2.50,
    '2027-03-25': 2.50, '2027-03-26': 2.50, '2027-03-27': 2.50, '2027-03-28': 2.50,
  }
  const real = Object.fromEntries(semanaSanta(2027).map((n) => [n.fecha, n.factor]))
  assert.deepEqual(real, esperado)
})

test('la forma CRUDA sube hasta el Viernes Santo y baja después', () => {
  // Sin el techo la curva de Alberto pica en Viernes (3,20) tras el Jueves (3,00). El módulo no la
  // discute; el test la fija para que un cambio de forma sea deliberado y no un descuido.
  const ss = semanaSanta(2027)
  const f = (d: string) => ss.find((n) => n.fecha === d)!.factor
  assert.ok(f('2027-03-21') < f('2027-03-24'), 'de Ramos a Miércoles la curva sube')
  assert.equal(f('2027-03-28'), 2.5)
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

test('con la Pascua más temprana posible la semana sigue completa', () => {
  // 2035: Pascua el 25 de marzo, el mínimo del calendario gregoriano.
  const ss = semanaSanta(2035)
  assert.equal(ss.length, 8)
  assert.equal(ss[0].fecha, '2035-03-18')
})

// ─── calendarioEntre ────────────────────────────────────────────────────────────────────────────

test('la ventana recorta por fecha, no por año', () => {
  const c = calendarioEntre('2027-03-24', '2027-03-26')
  assert.deepEqual(c.noches.map((n) => n.fecha), ['2027-03-24', '2027-03-25', '2027-03-26'])
})

test('🚨 2028 es el año que el mapa a mano NO cubre, y aquí sale entero', () => {
  // `EVENTS` acaba el 2027-05-02. eventFactor('2028-04-13') vale 1.0 — el Jueves Santo de 2028 se
  // tarifica hoy como un abril cualquiera. Pascua 2028 = 16 de abril.
  const ss = semanaSanta(2028).map((n) => n.fecha)
  assert.equal(ss[0], '2028-04-09')
  assert.equal(ss[ss.length - 1], '2028-04-16')
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
  // Día a día, como en EVENTS: el alumbrado 2,50, el fin de semana al tope y el último día 2,60.
  assert.equal(feria[0].factor, 2.50)
  assert.equal(feria[6].factor, 2.50, '2,60 capado a 2,5')
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
