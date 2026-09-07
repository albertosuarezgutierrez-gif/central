// Guardián: el cron SEO de sivra no puede morir MUDO por presupuesto de tiempo (07/09/2026).
//
// El lunes 07/09 el cron semanal /api/seo-refresh no dejó rastro alguno: ni commit en la landing,
// ni fila en seo_proposals, ni ❌ de Telegram. La ruta declaraba `maxDuration = 60` pero su cadena
// de análisis suma en el peor caso ~130-140s (Serper 10s + redacción 45s + aiSearch 50s + NIM 25s
// + GitHub/BD): cuando los primeros niveles fallan LENTO, Vercel mata la función en 504 antes de
// llegar al catch — y el tgAlert vive en el catch. Un fallo que no puede alcanzar su alerta es un
// fallo invisible (misma lección que facturas-scan, 31/07/2026).
//
// Este guardián fija dos invariantes sobre el FUENTE de la ruta (ni tsc ni build las miran):
//  1. maxDuration = 300 — techo por encima del peor caso de la cadena, con margen.
//  2. Toda llamada aiComplete/aiSearch de la ruta lleva timeoutMs explícito — si una pierde su
//     tope, el peor caso deja de estar acotado y el techo vuelve a ser alcanzable.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RUTA = join(import.meta.dirname, '..', 'apps/sivra/app/api/seo-refresh/route.ts')

test('seo-refresh declara maxDuration = 300 (peor caso de la cadena ≈140s)', () => {
  const src = readFileSync(RUTA, 'utf8')
  assert.match(
    src,
    /export const maxDuration = 300\b/,
    'apps/sivra/app/api/seo-refresh/route.ts debe declarar `export const maxDuration = 300`. ' +
      'Con un techo menor que el peor caso de la cadena de análisis la función muere en 504 sin ' +
      'pasar por el catch: ni commit, ni fila, ni Telegram (lunes 07/09/2026).',
  )
})

test('toda llamada aiComplete/aiSearch del seo-refresh lleva timeoutMs explícito', () => {
  const src = readFileSync(RUTA, 'utf8')
  // Cada invocación abre `aiComplete(` / `aiSearch(`; buscamos su objeto de opciones hasta el
  // cierre de línea lógico. Aproximación por bloques: desde la llamada hasta el `))` que la cierra.
  const llamadas = [...src.matchAll(/ai(?:Complete|Search)\(/g)]
  assert.ok(llamadas.length >= 3, `se esperaban ≥3 llamadas aiComplete/aiSearch, hay ${llamadas.length}`)
  for (const m of llamadas) {
    const bloque = src.slice(m.index, src.indexOf('))', m.index) + 2)
    assert.ok(
      /timeoutMs\s*:/.test(bloque),
      `una llamada ${m[0]}…) del seo-refresh no lleva timeoutMs explícito:\n${bloque.slice(0, 200)}\n` +
        'Sin tope por nivel, el peor caso de la cadena deja de estar acotado y puede volver a ' +
        'comerse el maxDuration entero → muerte muda en 504.',
    )
  }
})
