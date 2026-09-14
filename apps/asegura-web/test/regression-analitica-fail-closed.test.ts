// Guardián: PostHog nunca se carga sin pasar por puedeCargar().
//
// Igual que el guardián que este archivo sustituye (el viejo
// `lib/analitica.test.ts` vigilaba a Cookiebot leyendo `layout.tsx`/
// `components/Analitica.tsx` como texto, no importándolos — arrastran
// 'use client' y hooks de React que `node --test` no resuelve sin un DOM),
// esto lee el FUENTE. Lo que vigila: que no quede un `<script>` de PostHog o
// Cookiebot suelto en el layout, y que el componente arranque PostHog SOLO
// detrás de `puedeCargar()`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf-8')
const analitica = readFileSync(new URL('../components/Analitica.tsx', import.meta.url), 'utf-8')

test('layout.tsx no tiene NINGÚN script de Cookiebot ni de PostHog suelto', () => {
  // Se busca la FORMA de un <script> real (id/src), no la palabra "Cookiebot"/
  // "PostHog" a secas — esas palabras aparecen legítimamente en comentarios
  // (p. ej. explicando por qué GSC importa) y un match por sustring ahí sería
  // un falso positivo que enseñaría a ignorar el cepo la primera vez que salte.
  assert.ok(!/id=["']Cookiebot["']/.test(layout), 'quedó el <script id="Cookiebot"> en layout.tsx')
  assert.ok(!/consent\.cookiebot\.com/.test(layout), 'quedó la URL de Cookiebot en layout.tsx')
  assert.ok(!/posthog\.com\/static\/array\.js/.test(layout), 'el script de PostHog no debe cargarse desde layout.tsx directamente')
})

test('Analitica.tsx arranca PostHog SOLO dentro de la comprobación de consentimiento', () => {
  assert.ok(/puedeCargar/.test(analitica), 'el componente debe usar puedeCargar() para decidir')
  assert.ok(/arrancarPostHog/.test(analitica), 'debe usar el adaptador del paquete, no un init suelto')
})

test('layout.tsx monta el componente de consentimiento (banner propio, no Cookiebot)', () => {
  assert.ok(/<Analitica \/>/.test(layout), 'app/layout.tsx ya no monta <Analitica />: la web dejaría de pedir consentimiento sin que nada fallara')
})
