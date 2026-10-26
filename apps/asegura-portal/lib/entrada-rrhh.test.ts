import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { destinoValido } from '../../../packages/module-seguros-portal/src/destino.ts'
import { SUBTITULO_RRHH, emailDeEntrada, esOrigenRrhh } from './entrada-rrhh.ts'
import { CASILLA_COMERCIAL_INICIAL, TEXTO_SERVICIO_ALTA } from './alta-servicio.ts'

const quitaComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const leer = (r: string) => quitaComentarios(readFileSync(new URL(r, import.meta.url), 'utf8'))

test('origen rrhh: solo el valor exacto', () => {
  assert.equal(esOrigenRrhh('rrhh'), true)
  assert.equal(esOrigenRrhh(['rrhh', 'x']), true)
  for (const m of [undefined, '', 'RRHH', 'rrhh ', 'otro', 5, null]) assert.equal(esOrigenRrhh(m), false, String(m))
})

test('email de entrada: solo con forma de correo; basura -> campo vacío', () => {
  assert.equal(emailDeEntrada('ana@empresa.es', destinoValido), 'ana@empresa.es')
  assert.equal(emailDeEntrada(' ana@empresa.es ', destinoValido), 'ana@empresa.es')
  for (const m of [undefined, '', 'ana', 'a@b', '<script>@x.es', 'a@b.es,c@d.es', 42, null]) assert.equal(emailDeEntrada(m, destinoValido), '', String(m))
})

test('la entrada prerrellena y rotula, pero NO envía el código sola', () => {
  const e = leer('../app/Entrada.tsx')
  assert.match(e, /emailDeEntrada\(q\.get\('email'\), destinoValido\)/)
  assert.match(e, /SUBTITULO_RRHH/)
  const bloque = e.slice(e.indexOf("q.get('email')") - 200, e.indexOf("q.get('email')") + 500)
  assert.doesNotMatch(bloque, /pedir\(|solicitar/)
  assert.match(leer('../app/page.tsx'), /desdeRrhh=\{esOrigenRrhh\(origen\)\}/)
  assert.match(SUBTITULO_RRHH, /Tu herramienta de seguros gratuita, desde el portal de tu empresa/)
})

test('el alta dice el servicio y Grupo ASegura se escribe bien', () => {
  assert.match(TEXTO_SERVICIO_ALTA, /Guardamos tu póliza, te avisamos antes del vencimiento y al renovar te preparamos una comparativa/)
  assert.match(leer('../app/(portal)/boveda/SubirPoliza.tsx'), /\{TEXTO_SERVICIO_ALTA\}/)
})

test('cepo: la casilla comercial NUNCA nace marcada', () => {
  assert.equal(CASILLA_COMERCIAL_INICIAL, false)
  const c = leer('../app/(portal)/boveda/ConsentimientoComercial.tsx')
  // El estado inicial sale de lo ya guardado: solo `true` explícito marca; `null`/`false` -> desmarcada.
  assert.match(c, /useState\(inicial === true\)/)
  assert.doesNotMatch(c, /useState\(true\)/)
  assert.doesNotMatch(c, /defaultChecked/)
  // Y la casilla del alta se monta con lo guardado (null mientras no contestó), nunca con `true` fijo.
  const p = leer('../app/(portal)/boveda/page.tsx')
  assert.doesNotMatch(p, /<ConsentimientoComercial[^>]*inicial=\{true\}/)
})
