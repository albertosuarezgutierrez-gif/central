import { test } from 'node:test'
import assert from 'node:assert/strict'
import { impactoEvento, clasificarTipo, FACTOR_MAX } from './eventos-impacto.ts'

test('un concierto de estadio ya no se queda en 1.60', () => {
  // La Cartuja, 60.000 (Karol G). Antes salía 1.60 y hubo que corregirlo a mano.
  const f = impactoEvento(60000, 'Concierto')
  assert.ok(f > 1.6, `debe superar el techo viejo, salió ${f}`)
  assert.equal(f, 2.2)
})

test('un partido de liga NO vale lo mismo que un concierto del mismo aforo', () => {
  const partido = impactoEvento(43000, 'Fútbol - LaLiga')
  const concierto = impactoEvento(43000, 'Concierto')
  assert.ok(partido < concierto, 'el aficionado local no pernocta')
  assert.equal(partido, 1.35)
})

test('el derbi tampoco: llena el estadio, no los hoteles', () => {
  assert.equal(impactoEvento(60000, 'Sevilla FC vs Real Betis'), 1.35)
})

test('nada sale por encima del techo del calendario', () => {
  for (const aforo of [1, 1000, 20000, 60000, 500000, 1e9]) {
    for (const tipo of ['Concierto', 'Fútbol', 'Congreso', 'Festival', '', null]) {
      const f = impactoEvento(aforo, tipo)
      assert.ok(f <= FACTOR_MAX, `${aforo}/${tipo} dio ${f}`)
      assert.ok(f >= 1, `${aforo}/${tipo} dio ${f}: nunca baja precios`)
    }
  }
})

test('un congreso de FIBES pesa por asistentes, no por aforo de estadio', () => {
  // 7.000 congresistas 3 noches entre semana mueven más hotel que 7.000 en un concierto.
  assert.ok(impactoEvento(7000, 'Congreso médico') > impactoEvento(7000, 'Concierto'))
  assert.equal(impactoEvento(7000, 'Congreso médico'), 1.5)
})

test('sin aforo fiable se queda en el mínimo, no se inventa un premio', () => {
  assert.equal(impactoEvento(0, 'Concierto'), 1.08)
  assert.equal(impactoEvento(NaN, 'Concierto'), 1.08)
  assert.equal(impactoEvento(-5, 'Concierto'), 1.08)
})

test('la escala es monótona en el aforo dentro de cada tipo', () => {
  for (const tipo of ['Concierto', 'Fútbol', 'Congreso']) {
    let previo = 0
    for (const aforo of [100, 800, 1500, 3000, 6000, 12000, 25000, 45000]) {
      const f = impactoEvento(aforo, tipo)
      assert.ok(f >= previo, `${tipo}: ${aforo} bajó respecto al anterior`)
      previo = f
    }
  }
})

test('clasificarTipo entiende lo que mandan las fuentes de verdad', () => {
  assert.equal(clasificarTipo('Fútbol - LaLiga EA Sports'), 'deporte')
  assert.equal(clasificarTipo('Sevilla FC vs Rayo Vallecano'), 'deporte')
  assert.equal(clasificarTipo('Music'), 'concierto')
  assert.equal(clasificarTipo('Icónica Santalucía Sevilla Fest'), 'festival')
  assert.equal(clasificarTipo('Congreso Nacional de Cardiología (FIBES)'), 'congreso')
  assert.equal(clasificarTipo(''), 'otro')
  assert.equal(clasificarTipo(null), 'otro')
})

test('un nombre sin palabra clave cae en `otro`, y eso NO le cuesta dinero', () => {
  // Caso real: el `tipo` llega vacío y lo que se pasa es el nombre pelado. "KAROL G - VIAJANDO POR
  // EL MUNDO TROPITOUR" no contiene ni "concierto" ni "música". Lo que importa es que el factor
  // resultante sea el de la curva general, no el plano del deporte.
  assert.equal(clasificarTipo('KAROL G - VIAJANDO POR EL MUNDO TROPITOUR'), 'otro')
  assert.equal(
    impactoEvento(60000, 'KAROL G - VIAJANDO POR EL MUNDO TROPITOUR'),
    impactoEvento(60000, 'Concierto'),
  )
})

test('un tipo desconocido usa la curva general, no la de deporte', () => {
  assert.equal(impactoEvento(60000, 'no sé qué es esto'), 2.2)
})
