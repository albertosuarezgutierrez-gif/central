// Los secretos de servicio de la correduría se comparan en TIEMPO CONSTANTE.
//
// Los cuatro puertos servidor→servidor (operador, puente del portal y los dos
// crons) comparaban su Bearer con `===`, que corta en el primer carácter
// distinto: el tiempo de respuesta filtra cuánto prefijo se ha acertado. Lo que
// lo convierte en un despiste y no en una decisión es que el mismo repo ya lo
// hacía bien en `apps/asegura/lib/codeoscopic/webhook.ts` (timingSafeEqual sobre
// digests) desde el 13/09/2026.
//
// 🪤 Cepo de FUENTE: `===` y `secretosIguales` devuelven lo mismo, así que
// ningún test de comportamiento distingue el fallo. Y se quitan los comentarios
// antes de mirar porque estas cabeceras explican el fallo escribiendo `===`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const HELPER = 'packages/module-seguros-pii/src/secreto.ts'

/** Los cuatro puertos y qué helper compartido usa cada uno. */
const PUERTOS: Array<{ ruta: string; helper: string }> = [
  { ruta: 'apps/asegura/lib/operador.ts', helper: 'bearerAutorizado' },
  { ruta: 'apps/asegura/lib/puente-portal.ts', helper: 'bearerAutorizado' },
  { ruta: 'apps/asegura/lib/cron-auth.ts', helper: 'secretosIguales' },
  { ruta: 'apps/asegura-portal/lib/cron-auth.ts', helper: 'secretosIguales' },
]

test('ningún puerto compara su secreto con === ni con !==', () => {
  for (const { ruta } of PUERTOS) {
    const fuente = sinComentarios(leer(ruta))
    assert.doesNotMatch(fuente, /===\s*`Bearer/, `${ruta}: comparación no constante del Bearer`)
    assert.doesNotMatch(fuente, /===\s*secret\b/, `${ruta}: comparación no constante del secreto`)
    assert.doesNotMatch(fuente, /\bbearer\s*===/i, `${ruta}: comparación no constante del bearer`)
    assert.doesNotMatch(fuente, /p\.bearer\s*===/, `${ruta}: comparación no constante del bearer`)
  }
})

test('los cuatro usan el MISMO helper compartido, no una copia por app', () => {
  for (const { ruta, helper } of PUERTOS) {
    const fuente = sinComentarios(leer(ruta))
    assert.match(
      fuente,
      new RegExp(`import\\s*\\{[^}]*${helper}[^}]*\\}\\s*from\\s*'@central/module-seguros-pii'`),
      `${ruta}: tiene que importar ${helper} del paquete compartido`,
    )
    assert.match(fuente, new RegExp(`${helper}\\(`), `${ruta}: importarlo y no llamarlo no protege de nada`)
    assert.doesNotMatch(fuente, /timingSafeEqual/, `${ruta}: la primitiva vive en el helper, no repetida aquí`)
  }
})

test('el helper compara sobre DIGESTS: ni la longitud del secreto se filtra', () => {
  const fuente = sinComentarios(leer(HELPER))
  assert.match(fuente, /timingSafeEqual\(\s*digest\(/, 'timingSafeEqual pelado sobre dos buffers de distinta longitud LANZA')
  assert.match(fuente, /createHash\('sha256'\)/)
})

test('el helper es fail-closed: sin secreto configurado no autoriza nadie', () => {
  const fuente = sinComentarios(leer(HELPER))
  assert.match(fuente, /if\s*\(!a\s*\|\|\s*!b\)\s*return false/, 'un secreto vacío no puede autorizar')
  assert.match(fuente, /if\s*\(!secreto\)\s*return false/, 'sin secreto no hay Bearer válido')
})

test('el helper NO vive en @central/core-identity, que promete valer en edge', () => {
  // core-identity lo importan nueve apps y su `crypto.ts` declara Web Crypto
  // «válido en Node serverless y edge». Un `node:crypto` en su barril rompería
  // el primer middleware que lo importase, con el build en rojo y el typecheck
  // en verde.
  const barril = leer('packages/core-identity/src/index.ts')
  assert.doesNotMatch(barril, /secretosIguales|bearerAutorizado/)
  for (const f of ['crypto.ts', 'secret.ts', 'token.ts', 'index.ts']) {
    assert.doesNotMatch(leer(`packages/core-identity/src/${f}`), /from\s*'node:crypto'/, `core-identity/${f} no puede arrastrar node:crypto`)
  }
})

test('el contrato de los crons no cambia: sin CRON_SECRET no entra nadie, y solo por Bearer', () => {
  for (const ruta of ['apps/asegura/lib/cron-auth.ts', 'apps/asegura-portal/lib/cron-auth.ts']) {
    const fuente = sinComentarios(leer(ruta))
    assert.match(fuente, /if\s*\(!\s*(p\.)?secret\)/, `${ruta}: sin secreto se deniega`)
    assert.match(fuente, /headers\.get\('authorization'\)/, `${ruta}: solo por cabecera`)
    assert.doesNotMatch(fuente, /searchParams|\?secret=/, `${ruta}: un ?secret= deja la credencial en los logs de acceso`)
  }
})
