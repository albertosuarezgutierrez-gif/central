import test from 'node:test'
import assert from 'node:assert/strict'

import { DIAS_PREAVISO_TOMADOR } from './obligacion.ts'
import {
  estadoLead,
  leadDeclarada,
  normalizarNumeroPoliza,
  ordenarLeads,
  type EntradaLead,
} from './lead-declarada.ts'

const HOY = new Date('2026-09-07T00:00:00Z')

function entrada(p: Partial<EntradaLead> = {}): EntradaLead {
  return {
    id: 'a',
    compania: 'Generali',
    numeroPoliza: '04Z113777894',
    ramo: 'auto',
    fechaVencimiento: new Date('2027-04-03T00:00:00Z'),
    confirmadaPorUsuario: true,
    yaEnCartera: false,
    ...p,
  }
}

test('🚨 la fecha ÚTIL es un mes antes del vencimiento, no el vencimiento', () => {
  // Es el plazo del art. 22 LCS para oponerse a la prórroga. Un lead ordenado
  // por la fecha de vencimiento se trabaja treinta días tarde: cuando Alberto
  // llama, la póliza ya se ha prorrogado sola y no hay nada que ofrecer.
  const l = leadDeclarada(entrada(), HOY)
  assert.equal(l.fechaAccionable?.toISOString().slice(0, 10), '2027-03-04')
  assert.equal(DIAS_PREAVISO_TOMADOR, 30, 'si esto cambia, la fecha de arriba cambia con ello')
})

test('🚨 tres estados, nunca una lista plana', () => {
  // Un lead cuya fecha adivinó una IA y nadie miró NO puede tener el mismo
  // aspecto que uno que el cliente confirmó. Alberto decide a quién llama y qué
  // le dice sobre esta lista: si los dos se ven igual, llamará con una fecha
  // inventada y lo descubrirá el cliente, no él.
  assert.equal(estadoLead(entrada({ confirmadaPorUsuario: true })), 'confirmado')
  assert.equal(estadoLead(entrada({ confirmadaPorUsuario: false })), 'sin_confirmar')
  assert.equal(estadoLead(entrada({ fechaVencimiento: null })), 'sin_fecha')
})

test('🚨 sin fecha manda sobre sin confirmar', () => {
  // Sin fecha no hay nada que contar hacia atrás: es el reparo que hay que
  // arreglar primero. Es el mismo orden que ya aplica `reparoDeclarada()`.
  assert.equal(estadoLead(entrada({ fechaVencimiento: null, confirmadaPorUsuario: false })), 'sin_fecha')
})

test('🚨 lo que YA es de la casa no es un lead', () => {
  // Ofrecerle a un cliente una póliza que ya tiene contratada CON ÉL no es un
  // fallo estético: le dice que su correduría no sabe qué le ha vendido.
  assert.equal(leadDeclarada(entrada({ yaEnCartera: true }), HOY), null)
})

test('🚨 «no se ha podido comprobar» NO es «no es nuestra»', () => {
  // Cuando la persona no está casada con ninguna ficha de la cartera no hay
  // contra qué cotejar el número de póliza. Colapsar eso a `false` diría que
  // se comprobó y no estaba, que es una afirmación que nadie ha hecho.
  //
  // Sigue saliendo como lead —esconderlo perdería al cliente— pero el estado
  // viaja hasta la pantalla para que ella lo pueda decir.
  const l = leadDeclarada(entrada({ yaEnCartera: null }), HOY)
  assert.notEqual(l, null, 'no se esconde: sería perder un cliente por una duda')
  assert.equal(l?.yaEnCartera, null, 'el «no lo sé» tiene que llegar a la pantalla, no colapsarse a false')
  assert.equal(leadDeclarada(entrada({ yaEnCartera: false }), HOY)?.yaEnCartera, false)
})

test('🚨 un lead cuya fecha útil ya pasó se marca, NO se tira ni se adelanta un año', () => {
  // Tirarlo pierde al cliente; moverlo a 2028 sería inventar una fecha que
  // nadie ha dicho (la póliza puede no haberse prorrogado). Se dice lo que se
  // sabe: la ventana de este año se pasó.
  const l = leadDeclarada(entrada({ fechaVencimiento: new Date('2026-04-03T00:00:00Z') }), HOY)
  assert.notEqual(l, null)
  assert.equal(l?.ventanaPasada, true)
  assert.equal(l?.diasParaAccionable, null, 'no se cuentan días hacia atrás: confundirían con un plazo vivo')
})

test('los días que faltan se cuentan hasta la fecha ÚTIL', () => {
  const l = leadDeclarada(entrada({ fechaVencimiento: new Date('2026-10-07T00:00:00Z') }), HOY)
  assert.equal(l?.diasParaAccionable, 0, '07/10 − 30 días = 07/09, que es hoy')
  assert.equal(l?.ventanaPasada, false)
})

test('🚨 los sin fecha van al FINAL, no se pierden por el camino', () => {
  // Un lead sin fecha sigue siendo un cliente con una póliza de otra compañía.
  // Dejarlo fuera de la lista lo convierte en un dato que solo existe en la BD.
  const leads = [
    leadDeclarada(entrada({ id: 'sin', fechaVencimiento: null }), HOY),
    leadDeclarada(entrada({ id: 'tarde', fechaVencimiento: new Date('2027-12-01T00:00:00Z') }), HOY),
    leadDeclarada(entrada({ id: 'pronto', fechaVencimiento: new Date('2026-11-01T00:00:00Z') }), HOY),
  ].filter((x) => x !== null)
  assert.deepEqual(ordenarLeads(leads).map((l) => l.id), ['pronto', 'tarde', 'sin'])
})

test('🚨 a igual fecha, el orden lo fija el id — y se comprueba la PROPIEDAD, no dos ejecuciones', () => {
  // 🪤 La primera versión de este cepo comparaba dos llamadas seguidas y se
  // quedaba VERDE con el desempate roto: con dos elementos, un orden aleatorio
  // coincide consigo mismo la mitad de las veces. Un guardián que acierta a cara
  // o cruz es peor que ninguno, porque parece que vigila.
  //
  // Sin desempate, el orden de los que empatan depende del algoritmo de `sort`
  // y del orden de llegada de la BD, así que la lista «se mueve» entre visitas
  // sin que haya cambiado nada. Se afirma la propiedad, que es determinista.
  const ids = ['d', 'a', 'c', 'b']
  const leads = ids
    .map((id) => leadDeclarada(entrada({ id, fechaVencimiento: null }), HOY))
    .filter((x) => x !== null)
  assert.deepEqual(ordenarLeads(leads).map((l) => l.id), ['a', 'b', 'c', 'd'])
})

test('🚨 el mismo contrato escrito de dos formas es el MISMO número', () => {
  // El PDF de la compañía lo escribe con espacios o guiones y la cartera sin
  // ellos. Compararlos crudos da dos pólizas distintas, y eso significa
  // ofrecerle a un cliente exactamente lo que ya le has vendido.
  const canon = normalizarNumeroPoliza('04Z113777894')
  assert.equal(normalizarNumeroPoliza('04Z11 3777894'), canon)
  assert.equal(normalizarNumeroPoliza('04-Z11-3777894'), canon)
  assert.equal(normalizarNumeroPoliza('04z11.3777894'), canon)
  assert.equal(normalizarNumeroPoliza(' 04Z11/3777894 '), canon)
})

test('🚨 sin número es `null`, nunca una cadena vacía', () => {
  // La cadena vacía es el valor de cajón que se cuela por `IS NULL`, `??` y
  // `COALESCE` — y aquí haría que DOS pólizas sin número se consideraran la
  // misma, que es la peor forma de acertar.
  assert.equal(normalizarNumeroPoliza(null), null)
  assert.equal(normalizarNumeroPoliza('   '), null)
  assert.equal(normalizarNumeroPoliza('- / .'), null)
})
