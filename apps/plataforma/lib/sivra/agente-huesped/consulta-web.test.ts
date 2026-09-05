import { test } from 'node:test'
import assert from 'node:assert'
import {
  preguntaDeEntorno, procedeConsultarWeb, construirConsulta,
  partirRespuesta, aportaAlgo, consultarEntorno, bloqueConsulta,
} from './consulta-web.ts'

const base = { escalaPorConocimiento: true, categoria: 'faq', sensible: false, sentimiento: 'neutro' as const }
const CTX = { zona: 'Sevilla', direccion: 'Calle Socorro 24', checkIn: '2026-10-01' }

test('la pregunta del caso real (llegar desde el aeropuerto) es de entorno', () => {
  assert.equal(preguntaDeEntorno('we’re all arriving at the airport around 2:00 PM. What do you recommend for getting to your place?'), true)
  assert.equal(preguntaDeEntorno('¿Cómo llegamos desde el aeropuerto?'), true)
  assert.equal(preguntaDeEntorno('Wie kommen wir vom Flughafen?'), true)
})

test('una pregunta sobre el PISO no es de entorno (internet no lo sabe)', () => {
  assert.equal(preguntaDeEntorno('¿el apartamento tiene plancha y secador?'), false)
  assert.equal(preguntaDeEntorno('what is the wifi password?'), false)
  assert.equal(preguntaDeEntorno('¿a qué hora es el check-out?'), false)
})

test('solo procede si el agente iba a escalar por no saber', () => {
  assert.equal(procedeConsultarWeb('¿cómo llegamos del aeropuerto?', base), true)
  assert.equal(procedeConsultarWeb('¿cómo llegamos del aeropuerto?', { ...base, escalaPorConocimiento: false }), false)
})

test('una recomendación procede aunque escale por política, no por ignorancia', () => {
  assert.equal(
    procedeConsultarWeb('¿nos recomiendas algún restaurante de tapas?', { ...base, escalaPorConocimiento: false, categoria: 'recomendacion' }),
    true,
  )
})

test('lo sensible y lo negativo NUNCA disparan una búsqueda', () => {
  assert.equal(procedeConsultarWeb('el taxi del aeropuerto me cobró de más, quiero que me devolváis', { ...base, sensible: true }), false)
  assert.equal(procedeConsultarWeb('¿cómo llegamos del aeropuerto?', { ...base, sentimiento: 'negativo' }), false)
})

test('la consulta lleva la dirección del piso y la fecha de llegada', () => {
  const { system, user } = construirConsulta('¿cómo llegamos del aeropuerto?', CTX)
  assert.match(system, /Calle Socorro 24/)
  assert.match(user, /2026-10-01/)
  assert.match(system, /SIN DATO/)
})

test('separa los datos de las URLs citadas', () => {
  const { datos, fuentes } = partirRespuesta(
    'Taxi aeropuerto-centro: tarifa fija 26€ (L-V 7-21h) y 29€ noches/festivos.\nBus EA: 6€.\nFUENTES: https://tussam.es/a | https://sevilla.org/b',
  )
  assert.match(datos, /26€/)
  assert.doesNotMatch(datos, /FUENTES/)
  assert.deepEqual(fuentes, ['https://tussam.es/a', 'https://sevilla.org/b'])
})

test('sin línea FUENTES el dato se conserva, pero sin enlaces', () => {
  const { datos, fuentes } = partirRespuesta('El bus EA cuesta 6€ el billete de ida.')
  assert.match(datos, /6€/)
  assert.deepEqual(fuentes, [])
})

test('«SIN DATO» repetido NO cuenta como respuesta', () => {
  assert.equal(aportaAlgo('SIN DATO\nSIN DATO'), false)
  assert.equal(aportaAlgo('Taxi: tarifa fija de 26 euros de lunes a viernes.'), true)
})

test('un fallo de búsqueda se declara, no se convierte en «no hay»', async () => {
  const r = await consultarEntorno('¿cómo llegamos del aeropuerto?', CTX, async () => { throw new Error('429 sin cuota') })
  assert.equal(r.ok, false)
  assert.match(r.error || '', /429/)
  assert.equal(r.datos, '')
})

test('una búsqueda que no resuelve nada tampoco se da por buena', async () => {
  const r = await consultarEntorno('¿cómo llegamos del aeropuerto?', CTX, async () => 'SIN DATO\nFUENTES: https://x.com/a')
  assert.equal(r.ok, false)
})

test('el bloque para el redactor prohíbe redondear e inventar', () => {
  const b = bloqueConsulta('Taxi: 26€')
  assert.match(b, /no redondees/)
  assert.match(b, /SIN DATO/)
})
