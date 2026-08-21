import { test } from 'node:test'
import assert from 'node:assert'
import { bloqueSalida, bloqueSalidaTardia, SALIDA_FLEX_HASTA, llavesAlSalir, TAREAS_AL_SALIR, pideMasAllaDeLaVentana } from './salida.ts'
import { contieneDatoInventado } from './guardrail.ts'
import { bloqueEquipaje } from './equipaje.ts'

test('la ficha explica la ventana gratis y que más allá tiene coste sin precio', () => {
  const b = bloqueSalida('11:00')
  assert.match(b, /hasta las 12:00 SIN COSTE/)
  assert.match(b, /TIENE UN COSTE/)
  assert.match(b, /NUNCA des un precio/)
  // La respuesta al «¿dónde dejo las maletas el último día?» sale de aquí, no de la consigna de pago.
  assert.match(b, /no hace falta ninguna consigna de pago/)
})

test('el piso libre el día de la salida: se confirma hasta las 12:00 hoy mismo', () => {
  const b = bloqueSalidaTardia({ chequeado: true, posible: true, esDiaSalida: true })
  assert.match(b, /SÍ puedes confirmarle/)
  assert.match(b, /12:00 sin coste/)
  assert.match(b, /dejar dentro las maletas/)
  assert.match(b, /lo consultas y se lo confirmas/)
})

test('libre pero AÚN NO es el día de salida: no se promete en firme', () => {
  const b = bloqueSalidaTardia({ chequeado: true, posible: true, esDiaSalida: false })
  assert.match(b, /EN PRINCIPIO/)
  assert.match(b, /NO se lo prometas en firme/)
})

test('entra otro huésped: no hay hora extra NI equipaje dentro, y se ofrece la consigna', () => {
  const b = bloqueSalidaTardia({ chequeado: true, posible: false, esDiaSalida: true })
  assert.match(b, /NO es posible/)
  assert.match(b, /tampoco pueden dejar el equipaje dentro/)
  assert.match(b, /consigna/i)
})

test('sin poder comprobar la ocupación no se afirma nada en ninguna dirección', () => {
  const b = bloqueSalidaTardia({ chequeado: false, posible: false, esDiaSalida: true })
  assert.match(b, /NO se lo confirmes NI se lo niegues/)
  assert.match(b, /NUNCA inventes disponibilidad/)
})

test('en ningún caso el agente recibe una cifra de precio que pueda soltar', () => {
  const todos = [
    bloqueSalida('11:00'),
    bloqueSalidaTardia({ chequeado: true, posible: true, esDiaSalida: true }),
    bloqueSalidaTardia({ chequeado: true, posible: true, esDiaSalida: false }),
  ].join('\n')
  assert.ok(!/\d+\s?(€|eur)/i.test(todos), 'la política no debe contener importes')
})

test('la hora de la ventana la fija la constante, no un literal suelto', () => {
  assert.equal(SALIDA_FLEX_HASTA, '12:00')
  assert.ok(bloqueSalidaTardia({ chequeado: true, posible: true, esDiaSalida: true }).includes(SALIDA_FLEX_HASTA))
})

test('las horas del bloque no disparan el guardrail anti-invención al ir en la ficha', () => {
  const ficha = bloqueSalida('11:00')
  assert.equal(contieneDatoInventado('Podéis quedaros hasta las 12:00 sin coste.', ficha), false)
})

test('el bloque de consigna manda a mirar la SALIDA antes de derivar a una taquilla de pago', () => {
  // El caso de Pilar: preguntó por dejar las maletas su último día y se le ofreció una consigna de
  // pago sin comprobar antes si el piso quedaba libre.
  const b = bloqueEquipaje('prop_house_sevillana')
  assert.match(b, /ANTES DE MANDARLE A UNA CONSIGNA/)
  assert.match(b, /12:00 sin coste/)
  assert.ok(b.indexOf('ANTES DE MANDARLE A UNA CONSIGNA') < b.indexOf('Lock & Explore'),
    'el aviso tiene que ir ANTES de la lista de consignas')
})

test('las llaves: el Dúplex dentro, el resto donde se cogieron', () => {
  assert.match(llavesAlSalir('prop_duplex_center'), /mesa alta de la cocina/)
  for (const p of ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto', '']) {
    assert.match(llavesAlSalir(p), /donde se recogieron|caja de llaves/i, p)
  }
  // Nunca revela un código de acceso, así que vale aunque aún no toque dar las instrucciones.
  assert.ok(!/\d{4,}/.test(llavesAlSalir('prop_busto_reform')))
})

test('lo que se les pide al salir son cuatro cosas, y no una lista interminable', () => {
  assert.match(TAREAS_AL_SALIR, /aire acondicionado y las luces/)
  assert.match(TAREAS_AL_SALIR, /cerrar las ventanas/)
  assert.match(TAREAS_AL_SALIR, /sacar la basura/)
  assert.match(TAREAS_AL_SALIR, /mensaje cuando se vayan/)
  assert.match(TAREAS_AL_SALIR, /y nada más/)
})

test('antes de ENTRAR con la noche anterior ocupada, el equipaje no se queda dentro', () => {
  const b = bloqueSalida('11:00', 'prop_house_sevillana')
  assert.match(b, /ANTES DE ENTRAR[^\n]*NO se puede dejar el equipaje dentro/)
})

test('pedir salir a una hora POSTERIOR a las 12:00 sale de la ventana gratuita', () => {
  for (const t of [
    '¿podríamos salir a las 13:00?',
    'nos gustaría quedarnos hasta las 14h',
    'can we check out at 2pm?',
    'salimos sobre las 12:30 si se puede',
  ]) assert.equal(pideMasAllaDeLaVentana(t), true, t)
})

test('dentro de la ventana (o sin hora) NO se sale de ella', () => {
  for (const t of [
    '¿podemos salir un poco más tarde?',
    'nos iremos sobre las 12:00',
    'salimos a las 11:30',
    'somos 4 personas con 3 maletas, ¿podemos salir más tarde?',
    'we would like to leave at 12',
  ]) assert.equal(pideMasAllaDeLaVentana(t), false, t)
})

test('una hora de MADRUGADA no cuenta como salida tardía', () => {
  assert.equal(pideMasAllaDeLaVentana('llegamos a las 23:30'), false)
})
