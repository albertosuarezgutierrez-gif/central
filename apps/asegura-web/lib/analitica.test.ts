// Guardián de la invariante «sin banner no hay medición».
//
// Lo que vigila no es que el código compile —eso ya lo hace tsc— sino que no se
// pueda llegar por descuido al único estado inaceptable: PostHog cargado sin
// que Cookiebot esté configurado, es decir, midiendo al visitante sin haberle
// preguntado (art. 22.2 LSSI). Ese estado no da ningún error: la web se ve
// perfecta y los datos entran. Por eso hace falta un test y no basta con leer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerConfigAnalitica } from './analitica.ts'

const CLAVE = 'phc_wa9fxuRhoAicHxKcuFxL7WBZnw8NgmxCsRfFyWb5DLJN'
const HOST = 'https://eu.i.posthog.com'
const CBID = '5d75b875-d14c-4eb1-881c-371cb8629db6'

const COMPLETA = {
  NEXT_PUBLIC_POSTHOG_KEY: CLAVE,
  NEXT_PUBLIC_POSTHOG_HOST: HOST,
  NEXT_PUBLIC_COOKIEBOT_ID: CBID,
}

test('con las tres variables bien, la medición se configura', () => {
  assert.deepEqual(leerConfigAnalitica(COMPLETA), { clave: CLAVE, host: HOST, cookiebotId: CBID })
})

test('SIN Cookiebot no hay medición, aunque PostHog esté completo', () => {
  // Es LA invariante: medir sin banner es medir sin consentimiento.
  assert.equal(leerConfigAnalitica({ ...COMPLETA, NEXT_PUBLIC_COOKIEBOT_ID: undefined }), null)
  assert.equal(leerConfigAnalitica({ ...COMPLETA, NEXT_PUBLIC_COOKIEBOT_ID: '' }), null)
})

test('un CBID con errata NO se acepta: sin banner real, medir sería sin consentimiento', () => {
  for (const malo of ['5d75b875', 'CBID-PENDIENTE', 'null', 'undefined', '5d75b875-d14c-4eb1-881c']) {
    assert.equal(leerConfigAnalitica({ ...COMPLETA, NEXT_PUBLIC_COOKIEBOT_ID: malo }), null, malo)
  }
})

test('sin clave de PostHog no se configura nada (tampoco el banner suelto)', () => {
  assert.equal(leerConfigAnalitica({ ...COMPLETA, NEXT_PUBLIC_POSTHOG_KEY: undefined }), null)
  // Una clave con otra forma es casi siempre una variable pegada a medias.
  assert.equal(leerConfigAnalitica({ ...COMPLETA, NEXT_PUBLIC_POSTHOG_KEY: 'phc_corta' }), null)
})

test('un host a medias se rechaza en vez de mandar los eventos a nuestro dominio', () => {
  // Sin esquema, PostHog resolvería la URL contra grupoasegura.es: 404 nuestros
  // y cero visitas medidas, sin un solo error visible.
  for (const malo of ['eu.i.posthog.com', 'http://eu.i.posthog.com', '/ingest', '']) {
    assert.equal(leerConfigAnalitica({ ...COMPLETA, NEXT_PUBLIC_POSTHOG_HOST: malo }), null, malo)
  }
})

test('del host se conserva solo el origen, sin barra ni ruta', () => {
  const c = leerConfigAnalitica({ ...COMPLETA, NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com/' })
  assert.equal(c?.host, 'https://eu.i.posthog.com')
})

test('los espacios de un copiar-pegar no rompen la configuración', () => {
  const c = leerConfigAnalitica({
    NEXT_PUBLIC_POSTHOG_KEY: `  ${CLAVE} `,
    NEXT_PUBLIC_POSTHOG_HOST: ` ${HOST}`,
    NEXT_PUBLIC_COOKIEBOT_ID: `${CBID}  `,
  })
  assert.deepEqual(c, { clave: CLAVE, host: HOST, cookiebotId: CBID })
})
