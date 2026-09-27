import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarBannerHtml } from './snippetVanilla.ts'

// housesevillana no tiene árbol de componentes: sirve el HTML entero como un template
// literal (`app/route.ts`). Este snippet se interpola DENTRO de ese template, así que una
// sola comilla invertida en el resultado rompería el build de esa app.
test('el HTML generado no contiene comillas invertidas (rompería el template literal de housesevillana)', () => {
  const html = montarBannerHtml('es')
  assert.ok(!html.includes('`'), 'una comilla invertida en el snippet rompe app/route.ts')
})

test('incluye la carga de la librería vanilla-cookieconsent', () => {
  assert.ok(montarBannerHtml('es').includes('CookieConsent'))
})

test('el idioma pedido queda en la config generada', () => {
  assert.ok(montarBannerHtml('en').includes('"default":"en"') || montarBannerHtml('en').includes("default: 'en'"))
})
