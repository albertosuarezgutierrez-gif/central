import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ACTIVIDADES,
  DIAS_ACTIVIDAD_DEFECTO,
  definicionActividad,
  etiquetaActividad,
  mayorCaidaEmbudo,
  nuevosDesde,
  parseFiltroActividad,
  riesgoActividad,
  VENTANAS_ACTIVIDAD,
  type EmbudoPortal,
} from './actividad.ts'

const EMBUDO_VACIO: EmbudoPortal = {
  clientes: null,
  conEmail: null,
  invitados: null,
  hanEntrado: null,
  activos30: null,
}

test('los tipos no se repiten y todos tienen rótulo', () => {
  const vistos = new Set<string>()
  for (const a of ACTIVIDADES) {
    assert.equal(vistos.has(a.v), false, `tipo duplicado: ${a.v}`)
    vistos.add(a.v)
    assert.ok(a.label.length > 0, `${a.v} sin rótulo`)
  }
})

test('un cambio de dirección AVISA de que el domicilio tarifica', () => {
  // El cepo de la regla: si alguien degrada este evento a una notificación más,
  // el aviso desaparece de la pantalla sin que falle nada y el día del siniestro
  // nadie sabe que el cliente lo había dicho.
  const r = riesgoActividad('direccion')
  assert.notEqual(r, null, 'el cambio de dirección se quedó sin aviso')
  assert.match(String(r), /hogar|auto/i)
})

test('la supresión nombra el plazo legal', () => {
  assert.match(String(riesgoActividad('supresion')), /plazo|mes|art\. 17/i)
})

test('entrar en la intranet es información, no trabajo', () => {
  assert.equal(riesgoActividad('acceso'), null)
})

test('lo que escribe el cliente en el portal consta como suyo', () => {
  for (const t of ['acceso', 'direccion', 'sugerencia', 'parte', 'poliza_declarada', 'supresion']) {
    assert.equal(definicionActividad(t)?.origen, 'cliente', `${t} debería constar como del cliente`)
  }
})

test('una anotación de ficha NO se atribuye a nadie', () => {
  // `historial_interno` no tiene autor estructurado: el autor va dentro del
  // texto. Marcarla como 'cliente' afirmaría quién la escribió sin haberlo
  // mirado, que es justo lo que esta pantalla no puede hacer.
  assert.equal(definicionActividad('ficha')?.origen, 'ficha')
})

test('un tipo desconocido se ve, no desaparece ni inventa alarma', () => {
  assert.equal(definicionActividad('loquesea'), null)
  assert.equal(etiquetaActividad('loquesea'), 'loquesea')
  assert.equal(riesgoActividad('loquesea'), null)
})

test('el filtro por defecto son 30 días de todo, en la página 1', () => {
  const { filtro, descartados } = parseFiltroActividad(new URLSearchParams(''))
  assert.deepEqual(filtro, { quien: 'todo', dias: DIAS_ACTIVIDAD_DEFECTO, pagina: 1 })
  assert.deepEqual(descartados, [])
})

test('un valor de filtro que no se reconoce se DECLARA, no se ignora', () => {
  const { filtro, descartados } = parseFiltroActividad(new URLSearchParams('quien=marciano&dias=abc&pagina=0'))
  assert.deepEqual(filtro, { quien: 'todo', dias: DIAS_ACTIVIDAD_DEFECTO, pagina: 1 })
  assert.deepEqual(descartados.sort(), ['dias=abc', 'pagina=0', 'quien=marciano'])
})

test('solo se aceptan las ventanas que la pantalla ofrece', () => {
  for (const v of VENTANAS_ACTIVIDAD) {
    const { filtro, descartados } = parseFiltroActividad(new URLSearchParams(`dias=${v.v}`))
    assert.equal(filtro.dias, v.v)
    assert.deepEqual(descartados, [])
  }
  // 45 no está en el desplegable: aceptarlo dejaría que una URL a mano pidiera
  // una ventana que la pantalla luego no sabe pintar como seleccionada.
  assert.deepEqual(parseFiltroActividad(new URLSearchParams('dias=45')).descartados, ['dias=45'])
})

test('la mayor caída del embudo es el escalón donde más gente se queda', () => {
  // Cifras del orden de las reales (80 clientes vivos, 44 con correo): el peor
  // salto es el primero, y por eso «invita a más gente» no sería el consejo.
  const e: EmbudoPortal = { clientes: 80, conEmail: 44, invitados: 40, hanEntrado: 6, activos30: 2 }
  const peor = mayorCaidaEmbudo(e)
  assert.equal(peor?.desde.clave, 'clientes')
  assert.equal(peor?.hasta.clave, 'conEmail')
  assert.equal(peor?.pierde, 36)
})

test('cuando el cuello está en medio, señala el de en medio', () => {
  const e: EmbudoPortal = { clientes: 80, conEmail: 78, invitados: 70, hanEntrado: 6, activos30: 2 }
  const peor = mayorCaidaEmbudo(e)
  assert.equal(peor?.desde.clave, 'invitados')
  assert.equal(peor?.hasta.clave, 'hanEntrado')
  assert.equal(peor?.pierde, 64)
})

test('sin cuentas no se señala ningún escalón', () => {
  assert.equal(mayorCaidaEmbudo(EMBUDO_VACIO), null)
})

test('un hueco en medio no inventa una caída con el escalón de al lado', () => {
  // `conEmail: null` es «no se pudo contar». Saltárselo y medir clientes→invitados
  // daría una caída de 40 que no ha medido nadie.
  const e: EmbudoPortal = { clientes: 80, conEmail: null, invitados: 40, hanEntrado: 39, activos30: 38 }
  const peor = mayorCaidaEmbudo(e)
  assert.equal(peor?.desde.clave, 'invitados')
  assert.equal(peor?.pierde, 1)
})

test('«nuevos desde» distingue no saber cuándo miraste de que todo sea nuevo', () => {
  const eventos = [{ fecha: '2026-09-12T10:00:00.000Z' }, { fecha: '2026-09-11T10:00:00.000Z' }]
  assert.equal(nuevosDesde(eventos, null), null)
  assert.equal(nuevosDesde(eventos, ''), null)
  assert.equal(nuevosDesde(eventos, 'ayer por la tarde'), null)
  assert.equal(nuevosDesde(eventos, '2026-09-11T12:00:00.000Z'), 1)
  assert.equal(nuevosDesde(eventos, '2026-09-12T23:00:00.000Z'), 0)
})
