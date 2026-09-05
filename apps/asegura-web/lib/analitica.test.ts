// Guardián del consentimiento: sin banner NO hay medición.
//
// El fallo que este archivo impide está medido en la otra web de la correduría
// (04/09/2026): allí PostHog arranca aunque falte el identificador de Cookiebot,
// así que una variable de entorno olvidada deja cookies de análisis instaladas
// sin permiso (art. 22.2 LSSI). Es un fallo que NO se ve — la web funciona y los
// datos llegan; lo único que falta es el banner. De ahí que se pruebe la regla
// pura Y el fuente: ni tsc ni `next build` miran si alguien quitó un `if`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { POSTHOG_HOST, puedeMedir, scriptPostHog } from './analitica.ts'

const RAIZ = join(import.meta.dirname, '..')
const COMPLETA = { cookiebotId: 'cbid-de-prueba', posthogKey: 'phc_prueba' }

/** Quita comentarios para mirar solo lo que se EJECUTA. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const ANALITICA = sinComentarios(readFileSync(join(RAIZ, 'components', 'Analitica.tsx'), 'utf8'))
const LAYOUT = sinComentarios(readFileSync(join(RAIZ, 'app', 'layout.tsx'), 'utf8'))

test('SIN gestor de consentimiento no se mide, aunque el visitante hubiera aceptado', () => {
  // Este es el caso exacto del fallo de la app de Manuel: la env de Cookiebot
  // no está puesta y la medición arranca igual.
  assert.equal(puedeMedir({ statistics: true }, { ...COMPLETA, cookiebotId: '' }), false)
})

test('sin clave de PostHog no se mide', () => {
  assert.equal(puedeMedir({ statistics: true }, { ...COMPLETA, posthogKey: '' }), false)
})

test('«todavía no ha contestado» NO es un sí', () => {
  assert.equal(puedeMedir(null, COMPLETA), false)
  assert.equal(puedeMedir(undefined, COMPLETA), false)
  assert.equal(puedeMedir({}, COMPLETA), false)
})

test('rechazar la medición se respeta', () => {
  assert.equal(puedeMedir({ statistics: false }, COMPLETA), false)
  // Aceptar marketing no autoriza a medir: son categorías distintas.
  assert.equal(puedeMedir({ marketing: true, preferences: true }, COMPLETA), false)
})

test('con consentimiento explícito y todo configurado, se mide', () => {
  assert.equal(puedeMedir({ statistics: true }, COMPLETA), true)
})

test('el host por defecto de PostHog está en la UE', () => {
  // Un defecto apuntando a la nube de EE. UU. sacaría del EEE los datos de
  // visitantes españoles sin que nada fallara ni se notara.
  assert.match(POSTHOG_HOST, /^https:\/\/eu\./, `POSTHOG_HOST fuera de la UE: ${POSTHOG_HOST}`)
})

test('la URL del script de PostHog no duplica la barra', () => {
  assert.equal(scriptPostHog('https://eu.i.posthog.com/'), 'https://eu.i.posthog.com/static/array.js')
})

test('PostHog solo se inicializa detrás de puedeMedir()', () => {
  assert.match(ANALITICA, /puedeMedir\(/, 'components/Analitica.tsx ya no consulta la regla de consentimiento')
  // La única llamada a init tiene que estar en el mismo archivo que la guarda.
  const inits = ANALITICA.match(/\.init\(/g) ?? []
  assert.equal(inits.length, 1, `se esperaba UNA llamada a init, hay ${inits.length}`)
  assert.match(ANALITICA, /opt_out_capturing\(\)/, 'retirar el consentimiento tiene que apagar la medición, no solo dejar de arrancarla')
})

test('las grabaciones de sesión están desactivadas', () => {
  // El formulario de leads pide nombre, teléfono y correo: una grabación los
  // captura tecleados aunque el enmascarado falle.
  assert.match(ANALITICA, /disable_session_recording:\s*true/, 'session recording activo en una web con formulario de datos personales')
})

test('PostHog NO viaja en el bundle: se carga de su CDN tras consentir', () => {
  for (const f of ['components/Analitica.tsx', 'app/layout.tsx', 'lib/analitica.ts']) {
    const src = sinComentarios(readFileSync(join(RAIZ, f), 'utf8'))
    assert.doesNotMatch(src, /from\s+['"]posthog-js['"]/, `${f} importa posthog-js: la librería quedaría cargada antes de que nadie acepte`)
  }
})

test('el layout monta el gestor de consentimiento y solo si hay identificador', () => {
  assert.match(LAYOUT, /<Analitica \/>/, 'app/layout.tsx ya no monta <Analitica />: la web dejaría de medir sin que nada fallara')
  assert.match(LAYOUT, /COOKIEBOT_ID \?/, 'el script de Cookiebot ya no está condicionado a que exista el identificador')
  assert.match(LAYOUT, /consent\.cookiebot\.com\/uc\.js/, 'el layout ya no carga el gestor de consentimiento')
})

test('no hay otros rastreadores colados en la web', () => {
  // Cualquier script de terceros que mida se somete a la misma puerta. Si
  // alguien añade uno directo en el HTML, este cepo lo caza.
  const PROHIBIDO = [/googletagmanager\.com/, /google-analytics\.com/, /connect\.facebook\.net/, /hotjar/i, /clarity\.ms/]
  for (const re of PROHIBIDO) {
    assert.doesNotMatch(LAYOUT, re, `app/layout.tsx carga un rastreador fuera del consentimiento: ${re}`)
  }
})
