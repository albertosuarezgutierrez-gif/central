// Guardián de la RETIRADA de PriceLabs (25/08/2026, PR #1703). `node --test` (gate en CI).
//
// PriceLabs fue el SaaS de pricing dinámico, de baja el 09/08/2026. Su retirada dejó tres
// piezas con reglas distintas, y confundirlas ya ha costado dos bugs en producción. Este
// guardián fija cuál es cuál para que no vuelvan a mezclarse.
//
// ── 1. El SUELO PL: RETIRADO, no puede volver ────────────────────────────────────────────
// `PL_FLOOR_RATIO`, `acotarSueloPL`, `PL_REF_MAX_AGE_DAYS` y el módulo `pricing-suelo-pl`.
// Era un suelo del 85% sobre una foto congelada del 08/08/2026 que solo cubría 2 de los 4
// pisos. Desde el techo de mercado medido (#1698) se perfora aguas abajo: ya no protegía
// nada, solo disparaba avisos contra una fuente muerta. Las noches especiales las cubren
// el ancla de fecha, el premio de mercado, el calendario de eventos y las guardas de
// evento a ciegas y de outlier.
//
// ── 2. `price_pricelabs`: NO es PriceLabs, es el precio VIVO en Smoobu ────────────────────
// Se llamó así porque cuando nació lo escribía PL. Ese nombre causó los dos bugs:
//   · 14/08 — el suelo PL se recapturaba de esta columna → suelo autorreferente eterno.
//   · 25/08 — `auto_register_experiments()` la usaba de «baseline de PriceLabs» → el A/B
//     se medía contra sí mismo y el digest de los lunes lo publicaba como victoria.
// Renombrada a `price_live`. Durante la fase EXPAND el escritor del snapshot escribe las
// DOS y un trigger las sincroniza; al hacer el CONTRACT, la vieja desaparece y este test
// debe quedarse SIN allowlist (borra la entrada y el test seguirá pasando).
//
// ── 3. `pricing_pl_referencia`: SOBREVIVE a propósito 🚨 ──────────────────────────────────
// NO se borra. Es la curva PL congelada que usa `/sivra/pricing-rentabilidad` (#1702) como
// contrafactual para responder «¿mereció la pena el motor frente a PL?». Su propio código
// declara que el contrafactual de MERCADO la relevará cuando la curva muera el 06/12/2026.
// Hasta entonces, un `DROP TABLE pricing_pl_referencia` deja esa página en 500.
// El allowlist de abajo es la lista de quién depende de ella: si crece, revísalo; si queda
// vacío, la tabla ya se puede soltar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** El suelo PL, retirado. Ninguna de estas señas puede reaparecer en el código. */
const SUELO_RETIRADO = /PL_FLOOR_RATIO|PL_FLOOR_VS_ANCLA|PL_REF_MAX_AGE_DAYS|acotarSueloPL|pricing-suelo-pl/

/**
 * `price_pricelabs` (el precio VIVO, mal nombrado). Solo el escritor del snapshot puede
 * nombrarla, y solo mientras dure la fase expand.
 */
const COLUMNA_VIEJA = /price_pricelabs/
const COLUMNA_VIEJA_OK = [
  'apps/plataforma/app/api/sivra/rates/snapshot/route.ts', // fase expand: escribe las dos
]

/**
 * `pricing_pl_referencia` (la curva PL congelada). Quien aparezca aquí es quien se rompe si
 * alguien la borra. Mantener esta lista al día ES el punto del guardián.
 */
const TABLA_PL = /pricing_pl_referencia/
const TABLA_PL_OK = [
  'apps/plataforma/app/api/sivra/pricing/rentabilidad/route.ts', // cuadro Motor vs PL (#1702)
  'apps/plataforma/lib/sivra/pricing-rentabilidad.ts',           // su helper puro (comentarios)
]

function ficherosDeCodigo(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).filter((f) => {
    if (f.includes('node_modules')) return false
    if (f.startsWith('test/')) return false // este propio test contiene los patrones
    // Las migraciones .sql son el registro histórico: conservan el nombre viejo a propósito.
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)
  })
}

function culpables(patron: RegExp, permitidos: string[]): string[] {
  const out: string[] = []
  for (const f of ficherosDeCodigo()) {
    if (permitidos.includes(f)) continue
    let contenido = ''
    try { contenido = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
    const lineas = contenido.split('\n')
    for (let i = 0; i < lineas.length; i++) {
      if (patron.test(lineas[i])) out.push(`${f}:${i + 1}  ${lineas[i].trim().slice(0, 100)}`)
    }
  }
  return out
}

test('el suelo de PriceLabs no ha vuelto al motor', () => {
  const encontrados = culpables(SUELO_RETIRADO, [])
  assert.deepEqual(
    encontrados,
    [],
    'El suelo PL se retiró el 25/08/2026 (PR #1703): era una foto congelada del 08/08 que solo ' +
    'cubría 2 de los 4 pisos y que el techo de mercado medido ya perfora. Si de verdad hace falta ' +
    'un suelo por fecha, constrúyelo sobre mercado MEDIDO, no sobre una referencia estática ' +
    'muerta:\n  - ' + encontrados.join('\n  - '),
  )
})

test('`price_pricelabs` solo la nombra el escritor del snapshot (fase expand)', () => {
  const encontrados = culpables(COLUMNA_VIEJA, COLUMNA_VIEJA_OK)
  assert.deepEqual(
    encontrados,
    [],
    'Esa columna NO es PriceLabs: es el precio VIVO en Smoobu, y se llama `price_live` desde el ' +
    '25/08/2026. Su nombre viejo ya causó dos bugs (suelo autorreferente el 14/08, baseline falso ' +
    'del A/B el 25/08). Usa `price_live`:\n  - ' + encontrados.join('\n  - '),
  )
})

test('quién depende de `pricing_pl_referencia` está declarado (no la borres a ciegas)', () => {
  const encontrados = culpables(TABLA_PL, TABLA_PL_OK)
  assert.deepEqual(
    encontrados,
    [],
    'Nuevo consumidor de la curva PL congelada sin declarar. Esa tabla NO se borró a propósito: ' +
    'la usa /sivra/pricing-rentabilidad como contrafactual hasta que caduque el 06/12/2026. Si tu ' +
    'uso es legítimo, añádelo a TABLA_PL_OK — esa lista es lo que hay que mirar ANTES de soltar la ' +
    'tabla:\n  - ' + encontrados.join('\n  - '),
  )
})
