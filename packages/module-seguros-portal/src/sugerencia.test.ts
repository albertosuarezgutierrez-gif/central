import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_SUGERENCIA,
  escaparHtml,
  mensajeSugerencia,
  normalizarSugerencia,
  resultadoSugerencia,
} from './sugerencia.ts'

const BASE = { identidadId: 'id-1', nombre: 'Ana', vinculada: true, desde: null }

test('el texto de la persona se ESCAPA: un < no puede tumbar el envío', () => {
  // Telegram manda con parse_mode HTML: sin escapar, este texto devuelve 400,
  // tgSend contesta null y la sugerencia se pierde sin un solo error.
  const m = mensajeSugerencia(BASE, 'el botón de <ver póliza> no se ve')
  assert.ok(!m.includes('<ver'), 'el < del cliente sigue crudo en el mensaje')
  assert.match(m, /&lt;ver póliza&gt;/)
  // Y las etiquetas NUESTRAS siguen vivas: escapar no puede comerse el formato.
  assert.match(m, /<b>Ana<\/b>/)
})

test('el nombre solo se dice si hay vínculo', () => {
  const sin = mensajeSugerencia({ ...BASE, vinculada: false }, 'hola qué tal')
  assert.ok(!sin.includes('Ana'), 'sin vínculo el nombre no está comprobado')
  assert.match(sin, /NO está casado con ninguna ficha/)
})

test('el nombre del cliente también se escapa', () => {
  const m = mensajeSugerencia({ ...BASE, nombre: 'Ana <script>' }, 'una sugerencia')
  assert.ok(!m.includes('<script>'))
})

test('la identidad va entera: es lo único con lo que volver a esa persona', () => {
  assert.match(mensajeSugerencia(BASE, 'una sugerencia'), /Identidad id-1/)
})

test('normalizar: recorta, aplana espacios y respeta los párrafos', () => {
  assert.equal(normalizarSugerencia('  hola   mundo  '), 'hola mundo')
  // Tres cosas en tres líneas siguen siendo tres líneas.
  assert.equal(normalizarSugerencia('uno\ndos\ntres'), 'uno\ndos\ntres')
  assert.equal(normalizarSugerencia('uno\n\n\n\ndos'), 'uno\n\ndos')
  assert.equal(normalizarSugerencia('x'.repeat(MAX_SUGERENCIA + 50))?.length, MAX_SUGERENCIA)
})

test('lo que no es una sugerencia devuelve null, que NO es un error', () => {
  assert.equal(normalizarSugerencia(''), null)
  assert.equal(normalizarSugerencia('   '), null)
  assert.equal(normalizarSugerencia('ok'), null)
  assert.equal(normalizarSugerencia(42), null)
  assert.equal(normalizarSugerencia(null), null)
})

test('«no hay canal» y «falló el envío» NO se colapsan, y solo uno es «enviada»', () => {
  assert.equal(resultadoSugerencia(123, 'ok'), 'enviada')
  assert.equal(resultadoSugerencia(null, 'ok'), 'sin_canal')
  assert.equal(resultadoSugerencia(null, 'fallo'), 'error')
  // 🚨 El caso que importa: aunque haya id, si el envío se fue por el catch no
  // se puede prometer nada. Aquí Telegram es el ÚNICO registro.
  assert.equal(resultadoSugerencia(123, 'fallo'), 'error')
})

test('escaparHtml hace los tres, y el & primero', () => {
  assert.equal(escaparHtml('a & <b> c'), 'a &amp; &lt;b&gt; c')
})
