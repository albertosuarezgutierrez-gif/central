// Guardián de la verificación de Google Search Console.
//
// GSC es la única fuente de tráfico SIN SESGO que esta web puede tener: PostHog
// va detrás del consentimiento de Cookiebot a propósito, así que mide solo a
// quien acepta, y «cero visitas medidas» no es cero visitas. Sin GSC, cualquier
// afirmación sobre por qué consultas entra la gente es una opinión.
//
// Lo que se vigila no es que la env esté puesta —eso es cosa de Vercel— sino la
// FORMA de ponerla: un `|| ''` dejaría `<meta name="google-site-verification"
// content="">` en cada página, que Google lee como una verificación fallida en
// vez de como una web sin verificar. Es el mismo fallo de familia que un `?? 0`
// pintado como dato: el hueco disfrazado de valor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LAYOUT = readFileSync(join(import.meta.dirname, '..', 'app', 'layout.tsx'), 'utf8')

test('el layout declara la verificación de GSC desde la env', () => {
  assert.match(
    LAYOUT,
    /verification:\s*\{\s*google:\s*process\.env\.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION/,
    'app/layout.tsx ya no declara `verification.google`: la web no se puede dar de alta en Search Console sin tocar código',
  )
})

test('sin la env NO se emite la etiqueta, en vez de emitirla vacía', () => {
  // El spread condicional es lo que garantiza la ausencia. Un fallback a cadena
  // vacía o a un literal de relleno rompe esa garantía sin que nada falle.
  assert.match(
    LAYOUT,
    /\.\.\.\(process\.env\.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION\s*\n?\s*\?/,
    'la verificación ya no es un spread condicional: comprobar que sin env no se emite ninguna etiqueta',
  )
  const malos = [
    /NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION\s*\|\|\s*['"]/,
    /NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION\s*\?\?\s*['"]/,
  ]
  for (const re of malos) {
    assert.doesNotMatch(LAYOUT, re, `fallback a literal en la verificación de GSC (${re}): una etiqueta vacía es peor que ninguna`)
  }
})
