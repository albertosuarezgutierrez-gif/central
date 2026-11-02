import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMd, escaparHtml } from './render-md.ts'

const C = { ink: '#000', ink2: '#111', paper3: '#eee', red: '#f00' }

test('<img onerror> y <script> salen escapados, sin etiquetas vivas', () => {
  const out = renderMd('hola <img src=x onerror=alert(1)> <script>alert(2)</script>\n\n**<b>x</b>** `<i>`', C)
  assert.ok(!/<img|<script|<b>|<i>/.test(out), out)
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(out, /&lt;script&gt;/)
})

test('comillas y & se escapan; el markdown legítimo sigue funcionando', () => {
  assert.equal(escaparHtml(`&"'<>`), '&amp;&quot;&#39;&lt;&gt;')
  const out = renderMd('## Título\n- **negrita** y `code`', C)
  assert.match(out, /<strong style="color:#000">negrita<\/strong>/)
  assert.match(out, /<code /)
  assert.match(out, /font-size:14px/)
})
