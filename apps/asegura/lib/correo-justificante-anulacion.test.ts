// Cepo del correo con la baja firmada. Lleva compañía y fechas (lo que la persona reconoce) y NADA más de
// la cartera en el cuerpo: el número de póliza y el nombre del tomador van en el PDF adjunto.
import test from 'node:test'
import assert from 'node:assert/strict'

import { cuerpoCorreoJustificante, type DatosCorreoJustificante } from './correo-justificante-anulacion.ts'

const BASE: DatosCorreoJustificante = {
  nombre: 'Pablo', compania: 'Mapfre', tipo: 'sustitucion', fechaEfecto: '2026-09-29', firmadaEl: '2026-09-28',
  comunicada: true, enlace: 'https://clientes.grupoasegura.es',
}

test('dice qué firmó, cuándo y con qué efecto, en fecha española', () => {
  const c = cuerpoCorreoJustificante(BASE)
  assert.match(c.texto, /Hola, Pablo:/)
  assert.match(c.texto, /firma del 28\/09\/2026 de la baja de tu seguro de Mapfre con efecto el 29\/09\/2026/)
  assert.match(c.texto, /Te adjuntamos el documento firmado/)
  assert.match(c.texto, /en la ficha de esa póliza/)
  assert.match(c.html, /href="https:\/\/clientes\.grupoasegura\.es"/)
})

test('solo dice «ya se lo hemos enviado» si de verdad salió hacia la compañía', () => {
  assert.match(cuerpoCorreoJustificante(BASE).texto, /Ya se lo hemos enviado a la compañía/)
  const pendiente = cuerpoCorreoJustificante({ ...BASE, comunicada: false }).texto
  assert.doesNotMatch(pendiente, /Ya se lo hemos enviado/)
  assert.match(pendiente, /Nosotros se lo comunicamos a la compañía/)
})

test('sin compañía o sin nombre no inventa: «tu seguro» y «Hola:»', () => {
  const c = cuerpoCorreoJustificante({ ...BASE, compania: null, nombre: '  ' })
  assert.match(c.texto, /^Hola:$/m)
  assert.match(c.texto, /la baja de tu seguro con efecto/)
  assert.doesNotMatch(c.texto, /null|undefined/)
})

test('la no renovación se llama así, no «baja con efecto»', () => {
  const c = cuerpoCorreoJustificante({ ...BASE, tipo: 'no_renovacion' })
  assert.equal(c.asunto, 'Tu carta de no renovación, firmada')
  assert.match(c.texto, /no renovación de tu seguro de Mapfre \(efecto al vencimiento, el 29\/09\/2026\)/)
})

test('escapa lo que viene de la ficha y exige https', () => {
  const c = cuerpoCorreoJustificante({ ...BASE, nombre: '<b>Pablo</b>', compania: 'A&B "Seguros"' })
  assert.doesNotMatch(c.html, /<b>Pablo<\/b>/)
  assert.match(c.html, /&lt;b&gt;Pablo/)
  assert.match(c.html, /A&amp;B &quot;Seguros&quot;/)
  assert.throws(() => cuerpoCorreoJustificante({ ...BASE, enlace: 'http://clientes.grupoasegura.es' }), /enlace_no_https/)
})
