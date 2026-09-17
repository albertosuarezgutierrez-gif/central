// Guardián: GA4 nunca se carga sin pasar por puedeCargar().
//
// Mismo patrón que `apps/asegura-web/test/regression-analitica-fail-closed.test.ts`
// (Task Group B del plan de consentimiento unificado): lee el FUENTE en vez de
// importar `layout.tsx`/`ConsentimientoAnalitica.tsx` (arrastran 'use client' y
// hooks de React que `node --test` no resuelve sin un DOM). Lo que vigila: que
// no quede un <script> de GA4 suelto en el layout, y que el layout monte el
// componente gateado por consentimiento.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf-8')

test('layout.tsx no tiene el script de GA4 suelto (debe vivir dentro del adaptador gateado)', () => {
  // Se busca la FORMA de un <script src> real hacia gtag.js, no la palabra
  // "GA4"/"googletagmanager" a secas — esas palabras pueden aparecer
  // legítimamente en un comentario en prosa, y un match por sustring ahí sería
  // un falso positivo que enseñaría a ignorar el cepo la primera vez que salte.
  assert.ok(!/googletagmanager\.com\/gtag\/js/.test(layout), 'quedó un <script> de GA4 sin condición en layout.tsx')
  assert.ok(!/gtag\(['"]config['"],\s*['"]G-EN2YQLRLEX['"]/.test(layout), 'quedó un gtag(\'config\', ...) suelto en layout.tsx')
})

test('layout.tsx monta el componente de consentimiento (GA4 gateado, no suelto)', () => {
  assert.ok(/<ConsentimientoAnalitica \/>/.test(layout), 'app/layout.tsx no monta <ConsentimientoAnalitica />: la web dejaría de gatear GA4 sin que nada fallara')
})
