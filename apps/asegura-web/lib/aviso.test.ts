import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CONSENTIMIENTO_VERSION, RAMO_OTRO, tokenDelFragmento } from './aviso.ts'
import { RAMOS } from './ramos.ts'
import { ramoTieneVentana } from './ventana-renovacion.ts'

const RAIZ = join(import.meta.dirname, '..')
const REGLAS_ASEGURA = readFileSync(join(RAIZ, '..', 'asegura', 'lib', 'aviso-web-reglas.ts'), 'utf8')

test('🚨 contrato con asegura: cada ramo que pinta el widget es un ramo que asegura acepta, y al revés', () => {
  const bloque = /RAMO_WEB_A_TIPO[^=]*=\s*\{([\s\S]*?)\n\}/.exec(REGLAS_ASEGURA)
  assert.ok(bloque, 'no se encontró RAMO_WEB_A_TIPO en asegura: el cepo estaría mirando al vacío')
  const aceptados = new Set([...bloque[1]!.matchAll(/^\s*'?([a-z-]+)'?\s*:/gm)].map((m) => m[1]))
  const conWidget = new Set(RAMOS.filter((r) => ramoTieneVentana(r.slug)).map((r) => r.slug))
  assert.ok(conWidget.size > 0)
  // «Otro seguro» no tiene página de ramo: sale solo en el selector de la portada.
  conWidget.add(RAMO_OTRO)
  assert.match(REGLAS_ASEGURA, new RegExp(`RAMO_WEB_OTRO = '${RAMO_OTRO}'`))
  assert.deepEqual([...conWidget].sort(), [...aceptados].sort())
})

test('la versión del consentimiento es la misma en la web y en asegura', () => {
  assert.match(REGLAS_ASEGURA, new RegExp(`CONSENTIMIENTO_VERSION = '${CONSENTIMIENTO_VERSION}'`))
})

test('el token se lee del fragmento y solo con forma de token', () => {
  const t = 'a'.repeat(43)
  assert.equal(tokenDelFragmento(`#t=${t}`), t)
  assert.equal(tokenDelFragmento(''), null)
  assert.equal(tokenDelFragmento('#t=<script>'), null)
  assert.equal(tokenDelFragmento('#x=1'), null)
})

test('el widget no manda el correo a la analítica', () => {
  const src = readFileSync(join(RAIZ, 'components', 'VentanaRenovacion.tsx'), 'utf8')
  for (const m of src.matchAll(/medir\('[a-z_]+',\s*\{([^}]*)\}/g)) {
    assert.doesNotMatch(m[1]!, /email|nombre/i, `medir() con dato personal: ${m[0]}`)
  }
  assert.match(src, /medir\('aviso_solicitado'/)
})

test('las páginas de canje no se indexan', () => {
  for (const a of ['confirmar', 'baja']) {
    const src = readFileSync(join(RAIZ, 'app', 'aviso', a, 'page.tsx'), 'utf8')
    assert.match(src, /robots:\s*\{\s*index:\s*false/)
  }
})
