import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Guardián de consentimiento: GA4 y Meta Pixel cargaban SIEMPRE, sin esperar a que el
// visitante decidiera nada. Ver Task Group D de
// docs/superpowers/plans/2026-09-14-consentimiento-unificado.md.
//
// `route.ts` se lee como TEXTO y no se importa, por lo mismo que explica
// `i18n/traducciones.test.ts`: arrastra `next/server`, que el runner de Node no resuelve.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')

const route = leer('./route.ts')

describe('consentimiento — GA4 y Meta Pixel gateados', () => {
  test('el fbq(init) de Meta Pixel no aparece ANTES del gate de consentimiento', () => {
    const antesDelGate = route.split('cc:onConsent')[0]
    assert.ok(!/fbq\('init'/.test(antesDelGate), 'Meta Pixel se inicializa antes de comprobar el consentimiento')
  })

  test('el gtag(config) de GA4 no aparece ANTES del gate de consentimiento', () => {
    const antesDelGate = route.split('cc:onConsent')[0]
    assert.ok(!/gtag\('config'/.test(antesDelGate), 'GA4 se configura antes de comprobar el consentimiento')
  })

  test('route.ts monta el snippet del banner (montarBannerHtml)', () => {
    assert.ok(/montarBannerHtml/.test(route))
  })

  test('ningún bloque <script> contiene una comilla invertida (rompería el template literal del HTML)', () => {
    const bloques = route.match(/<script>[\s\S]*?<\/script>/g) || []
    assert.ok(bloques.length >= 2, `solo se han encontrado ${bloques.length} bloques <script>`)
    for (const bloque of bloques) assert.ok(!bloque.includes('`'), 'comilla invertida dentro de un <script>')
  })
})
