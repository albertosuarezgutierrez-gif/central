// apps/ia-rest/scripts/seo/test-guardrails.ts
// Verificación de lógica pura (no hay test runner; se corre con tsx).
import {
  agenteHabilitado, rutaEditable, dentroDeLimite, rutaEnCooldown, superaUmbral,
} from '../../src/lib/seo/guardrails'

let fallos = 0
function check(nombre: string, cond: boolean) {
  if (!cond) { console.error(`✗ ${nombre}`); fallos++ } else { console.log(`✓ ${nombre}`) }
}

check('habilitado solo con "true"', agenteHabilitado({ SEO_AGENT_ENABLED: 'true' }) === true)
check('deshabilitado por defecto', agenteHabilitado({}) === false)
check('deshabilitado con "false"', agenteHabilitado({ SEO_AGENT_ENABLED: 'false' }) === false)

const allow = ['/restaurantes', '/restaurantes/*']
check('ruta exacta editable', rutaEditable('/restaurantes', allow) === true)
check('ruta wildcard editable', rutaEditable('/restaurantes/sevilla', allow) === true)
check('ruta no editable', rutaEditable('/registro', allow) === false)
check('wildcard no matchea padre distinto', rutaEditable('/espacios', allow) === false)

check('dentro de límite', dentroDeLimite(4, 5) === true)
check('en el límite (no permite)', dentroDeLimite(5, 5) === false)

const ahora = new Date('2026-06-13T07:00:00Z')
const recientes = [{ ruta: '/restaurantes', created_at: '2026-06-10T07:00:00Z' }]
check('en cooldown (3 días < 7)', rutaEnCooldown('/restaurantes', recientes, ahora, 7) === true)
check('fuera de cooldown (otra ruta)', rutaEnCooldown('/restaurantes/sevilla', recientes, ahora, 7) === false)
const viejos = [{ ruta: '/restaurantes', created_at: '2026-06-01T07:00:00Z' }]
check('fuera de cooldown (12 días > 7)', rutaEnCooldown('/restaurantes', viejos, ahora, 7) === false)

check('supera umbral', superaUmbral(50, 30) === true)
check('no supera umbral', superaUmbral(10, 30) === false)

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1) }
console.log('\nTodos los checks de guardrails OK')
