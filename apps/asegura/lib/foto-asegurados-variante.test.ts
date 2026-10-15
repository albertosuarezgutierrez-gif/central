// Foto de asegurados por variante (13/10/2026): salud/decesos/vida guardan QUIÉN es cada asegurado (cliente_id) con la
// tarificación, y el comparador la usa. Cepo de fuente: el cableado no es puro (BD), así que se vigila el texto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const riesgo = readFileSync(new URL('./oportunidad-riesgo.ts', import.meta.url), 'utf8')
const cot = readFileSync(new URL('./codeoscopic/cotizaciones.ts', import.meta.url), 'utf8')

test('salud/decesos y vida meten la foto de asegurados en el contexto de la variante', () => {
  assert.match(riesgo, /contexto: \{ oportunidadId, figuras, nota, asegurados: aseg\.clienteIds \}/)
  assert.match(riesgo, /asegurados: dv\.aseguradoClienteId \? \[dv\.aseguradoClienteId\] : \[\]/)
  assert.match(riesgo, /clienteIds\.push\(f\.cliente_id\)/, 'los ids van en el MISMO orden que risk.insureds[1..]')
})

test('la foto se guarda en tarificaciones.figuras con el escritor puro (solo uuids, nunca DNI)', () => {
  // 15/10/2026: con los supuestos de la pantalla (clave `supuestos`), por el mismo escritor puro.
  assert.match(cot, /\$\{fotoVarianteJson\(e\.contexto\.figuras, e\.contexto\.asegurados, e\.contexto\.supuestos\)\}::jsonb/)
})

test('el historial y la comparación pasan la foto de cada variante al comparador', () => {
  assert.match(riesgo, /diferenciasVariante\(vars\[i - 1\]\.peticion, v\.peticion, \{ antes: vars\[i - 1\]\.figuras, despues: v\.figuras \}\)/)
  assert.match(riesgo, /diferenciasVariante\(ta\.peticion, tb\.peticion, \{ antes: ta\.figuras, despues: tb\.figuras \}\)/)
})
