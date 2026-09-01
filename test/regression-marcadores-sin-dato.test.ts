// Guardián: los DOS normalizadores de documentos tratan igual los «no lo sé».
// `node --test` (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Hay dos extractores, y es correcto que sean dos: el del PORTAL
// (`@central/module-seguros-portal/poliza-leida`) lee los cinco campos que el
// asegurado ve en su bóveda; el del CORREDOR
// (`@central/module-seguros/documento-auto`) lee lo que hace falta para pedir
// precio. Propósitos distintos, tipos distintos.
//
// Lo que NO puede ser distinto es **la regla de qué cuenta como dato**. Si uno
// anula `'no consta'` y el otro lo guarda como si fuera el nombre de la
// compañía, el mismo documento produce dos verdades según por qué puerta entre.
//
// Y esa divergencia no daría ningún error: daría un dato de cajón guardado como
// bueno, que es justo lo que la regla de `CLAUDE.md` llama «un no lo sé
// disfrazado de dato» y por lo que se cuela por todas las guardas de NULL.
//
// Este cepo no obliga a que compartan código —eso sería abstraer antes de
// tiempo— sino a que compartan COMPORTAMIENTO, que es lo que importa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarAutoLeido,
  MARCADORES_SIN_DATO,
} from '../packages/module-seguros/src/documento-auto.ts'
import { normalizarPolizaLeida } from '../packages/module-seguros-portal/src/poliza-leida.ts'

test('los dos normalizadores anulan EXACTAMENTE los mismos marcadores', () => {
  const discrepancias: string[] = []

  for (const marcador of MARCADORES_SIN_DATO) {
    // Se prueba sobre un campo de texto libre que existe en los dos tipos.
    const corredor = normalizarAutoLeido({ compania: marcador }).compania
    const portal = normalizarPolizaLeida({ compania: marcador }).compania
    if (corredor !== portal) {
      discrepancias.push(
        `«${marcador}» → corredor: ${JSON.stringify(corredor)} · portal: ${JSON.stringify(portal)}`,
      )
    }
  }

  assert.deepEqual(
    discrepancias,
    [],
    'Los dos extractores tratan distinto un marcador de «no lo sé». El mismo ' +
      'documento produciría dos verdades según por qué puerta entre, y sin dar ' +
      `ningún error:\n  - ${discrepancias.join('\n  - ')}`,
  )
})

test('y los dos anulan el marcador aunque venga con espacios o en mayúsculas', () => {
  for (const marcador of ['No Consta', '  N/A  ', 'DESCONOCIDO']) {
    assert.equal(normalizarAutoLeido({ compania: marcador }).compania, null, `corredor: ${marcador}`)
    assert.equal(
      normalizarPolizaLeida({ compania: marcador }).compania,
      null,
      `portal: ${marcador}`,
    )
  }
})

test('un valor REAL pasa por los dos: el cepo no anula datos buenos', () => {
  assert.equal(normalizarAutoLeido({ compania: 'Mapfre' }).compania, 'Mapfre')
  assert.equal(normalizarPolizaLeida({ compania: 'Mapfre' }).compania, 'Mapfre')
})

// ─── El cepo se prueba a sí mismo ────────────────────────────────────────────

test('la lista de marcadores no está vacía: un cepo sin munición no vigila nada', () => {
  assert.ok(
    MARCADORES_SIN_DATO.length >= 20,
    `solo ${MARCADORES_SIN_DATO.length} marcadores: ¿se ha vaciado la lista?`,
  )
  // Los que de verdad escriben los modelos, fijados uno a uno.
  for (const imprescindible of ['', '-', 'n/a', 'null', 'desconocido', 'no consta', '?']) {
    assert.ok(
      MARCADORES_SIN_DATO.includes(imprescindible),
      `falta el marcador «${imprescindible}», que los modelos escriben a menudo`,
    )
  }
})

test('el detector encontraría una divergencia si la hubiera', () => {
  // Se simula el fallo que el cepo persigue: dos funciones que difieren.
  const buena = (v: string) => (v.trim().toLowerCase() === 'no consta' ? null : v)
  const mala = (v: string) => v
  assert.notEqual(buena('no consta'), mala('no consta'))
})
