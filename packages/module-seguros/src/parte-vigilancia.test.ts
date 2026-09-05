// Cepos del vigía de partes. Lee `parte-vigilancia.ts` antes: aquí solo se
// comprueba que sus tres decisiones sigan en pie.
//
//   · `recibido` NO sale de la vigilancia — es el estado que engaña
//   · la firma va por CUBOS, no por días exactos — si no, suena los 7 días
//   · fuera de plazo NO es pérdida de cobertura, y el texto no puede decirlo

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TOPE_AVISO_PARTES,
  firmaPartes,
  ordenarPorUrgencia,
  partesPendientes,
  textoAvisoPartes,
  urgenciaParte,
  type ParteVigilado,
} from './parte-vigilancia.ts'

function parte(x: Partial<ParteVigilado> & { id: string }): ParteVigilado {
  return { cliente: 'Cliente', estado: 'enviado', comunicado: false, diasRestantes: 5, ...x }
}

test('`recibido` SIGUE vigilado: es el estado que engaña', () => {
  // Alberto lo ha leído; la compañía no sabe nada. La bandeja lo saca de «sin
  // atender» con razón, pero para el PLAZO sacarlo es perderlo de vista justo
  // cuando el cliente ya cree que está hecho.
  const leido = parte({ id: 'a', estado: 'recibido' })
  assert.deepEqual(partesPendientes([leido]).map((p) => p.id), ['a'])
})

test('lo que manda es `comunicado`, NUNCA `estado !== "enviado"`', () => {
  const abierto = parte({ id: 'b', estado: 'abierto_en_compania', comunicado: true })
  const descartado = parte({ id: 'c', estado: 'descartado' })
  const raro = parte({ id: 'd', estado: 'un_estado_que_no_conocemos' })
  const salida = partesPendientes([abierto, descartado, raro]).map((p) => p.id)
  assert.deepEqual(
    salida,
    ['d'],
    'Solo salen el comunicado y el descartado. Un estado desconocido se queda dentro: no saber qué ' +
      'es no autoriza a dar por hecho que está en la compañía.',
  )
})

test('un parte SIN fecha del hecho no desaparece ni se cuela entre los holgados', () => {
  assert.equal(urgenciaParte(null), 'sin_plazo')
  const sinFecha = parte({ id: 'x', diasRestantes: null })
  const holgado = parte({ id: 'y', diasRestantes: 6 })
  assert.deepEqual(
    ordenarPorUrgencia([holgado, sinFecha]).map((p) => p.id),
    ['x', 'y'],
    '«No se puede contar el plazo» NO es «no corre prisa»: es justo el que hay que mirar a mano.',
  )
})

test('los cubos, y sus bordes exactos', () => {
  assert.equal(urgenciaParte(-1), 'vencido')
  assert.equal(urgenciaParte(0), 'hoy')
  assert.equal(urgenciaParte(1), 'hoy')
  assert.equal(urgenciaParte(2), 'pronto')
  assert.equal(urgenciaParte(3), 'pronto')
  assert.equal(urgenciaParte(4), 'holgado')
})

test('la firma va por CUBO: no cambia cada día, sí cuando el parte empeora', () => {
  const hoy5 = firmaPartes([parte({ id: 'a', diasRestantes: 5 })])
  const manana4 = firmaPartes([parte({ id: 'a', diasRestantes: 4 })])
  assert.equal(
    hoy5,
    manana4,
    'Con la firma por días exactos el aviso sonaría los siete días seguidos de cada parte. Un aviso ' +
      'que suena a diario se silencia, y entonces deja de sonar también el día que importa.',
  )
  const empeora = firmaPartes([parte({ id: 'a', diasRestantes: 3 })])
  assert.notEqual(empeora, hoy5, 'Al pasar de «con margen» a «esta semana» SÍ hay algo nuevo que hacer.')
  // Y un parte nuevo la cambia siempre.
  assert.notEqual(firmaPartes([parte({ id: 'a' }), parte({ id: 'b' })]), hoy5)
})

test('la firma no depende del orden en que llegue la lista', () => {
  // Sin `sort`, el orden que devolviera la BD haría sonar el aviso solo.
  const a = parte({ id: 'a', diasRestantes: 2 })
  const b = parte({ id: 'b', diasRestantes: 6 })
  assert.equal(firmaPartes([a, b]), firmaPartes([b, a]))
})

test('el aviso NUNCA dice que se ha perdido la cobertura', () => {
  const { texto } = textoAvisoPartes([parte({ id: 'a', diasRestantes: -4 })])
  assert.doesNotMatch(
    texto,
    /pierde|perdido|sin cobertura|ya no (te |le )?cubre|no cubierto/i,
    'El art. 16 solo permite a la compañía reclamar los daños del retraso; perder el derecho exige ' +
      'dolo o culpa grave. Un parte vencido se abre igual y cuanto antes.',
  )
  // Cepo POSITIVO: y tiene que DECIRLO, o el que lo lea lo dará por perdido.
  assert.match(texto, /NO quita la cobertura/)
})

test('el aviso no puede insinuar que algo de la lista ya está comunicado', () => {
  const { texto, pendientes } = textoAvisoPartes([
    parte({ id: 'a', estado: 'recibido', diasRestantes: 1 }),
    parte({ id: 'ok', estado: 'abierto_en_compania', comunicado: true }),
  ])
  assert.equal(pendientes, 1, 'El comunicado no entra en el recuento.')
  assert.match(
    texto,
    /no lo est[áa]/i,
    'La frase que sostiene el aviso: el cliente da por hecho que está en marcha, y no lo está.',
  )
  // El estado se escribe al lado del plazo justo porque `recibido` parece atendido.
  assert.match(texto, /«recibido»/)
})

test('el aviso se corta, y dice cuántos se ha dejado', () => {
  const muchos = Array.from({ length: TOPE_AVISO_PARTES + 3 }, (_, i) => parte({ id: `p${i}` }))
  const { texto, pendientes } = textoAvisoPartes(muchos)
  assert.equal(pendientes, TOPE_AVISO_PARTES + 3, 'El recuento es el REAL, no el de los que caben.')
  assert.match(texto, /y 3 más en \/correduria/)
})

test('un cliente sin ficha se declara, no se esconde', () => {
  const { texto } = textoAvisoPartes([parte({ id: 'a', cliente: null })])
  assert.match(
    texto,
    /sin ficha identificada/,
    'Que quien mandó el parte no esté vinculado a una ficha es trabajo pendiente, no una fila que ' +
      'se pueda omitir del aviso.',
  )
})
