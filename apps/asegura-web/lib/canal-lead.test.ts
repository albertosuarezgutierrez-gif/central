// Guardián del canal de salida del formulario.
//
// Esta web no tiene base de datos: lo ÚNICO que sale de ella es el lead, y sale
// por `app/api/lead/route.ts`, que reenvía a `apps/plataforma`. Dos cosas de ese
// reenvío rompen el negocio en silencio, y las dos se comprueban aquí:
//
//  1. Que la URL de plataforma tenga un valor por defecto REAL. El 06/09/2026 el
//     defecto era `''` y el proyecto Vercel se desplegó sin la variable: el
//     formulario contestaba «ahora mismo no podemos recoger tu solicitud» a todo
//     el mundo. Sin ficha, sin Telegram y sin el cuerpo del formulario en ningún
//     log — cada intento se perdía sin rastro recuperable.
//  2. Que la ruta a la que reenvía siga existiendo allí. Si plataforma la mueve
//     o la renombra, este reenvío empieza a comerse un 404 y el visitante ve un
//     error genérico: otra vez un canal muerto que no rompe ningún test.
//
// Se lee el fuente en vez de importarlo (igual que `contrato-lead.test.ts`):
// importar la ruta arrastraría `next/server`, e importar entre apps ataría el
// build de esta web al de plataforma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RUTA = join(import.meta.dirname, '..', 'app', 'api', 'lead', 'route.ts')

function fuenteRuta(): string {
  return readFileSync(RUTA, 'utf8')
}

/** El literal del `||` con el que se lee `process.env.PLATAFORMA_URL`. */
function defectoDeclarado(src: string): string {
  const m = src.match(/process\.env\.PLATAFORMA_URL\s*\|\|\s*'([^']*)'/)
  assert.ok(
    m,
    'no se encontró `process.env.PLATAFORMA_URL || \'…\'` en la ruta. Si cambia la forma de leer la ' +
      'variable, actualiza este guardián: sin él, un defecto vacío deja el formulario muerto sin que falle nada.',
  )
  return m[1]
}

test('el reenvío a plataforma tiene un origen por defecto que funciona', () => {
  const defecto = defectoDeclarado(fuenteRuta())
  assert.notEqual(
    defecto,
    '',
    'PLATAFORMA_URL vuelve a caer a la cadena vacía. Un despliegue sin esa variable deja el ÚNICO canal ' +
      'de venta de la correduría contestando «escríbenos por correo» a todo el mundo, sin rastro del lead.',
  )
  assert.match(defecto, /^https:\/\/[^/]+$/, `el defecto debe ser un origen https sin barra final: "${defecto}"`)
  assert.doesNotMatch(
    defecto,
    /grupoasegura/,
    'el defecto apunta a esta misma web: el reenvío se llamaría a sí mismo en bucle en vez de llegar a plataforma',
  )
})

test('la ruta de plataforma a la que se reenvía existe', () => {
  const src = fuenteRuta()
  const m = src.match(/\$\{PLATAFORMA_URL\}(\/[a-z0-9/_-]+)/)
  assert.ok(m, 'no se encontró la ruta del reenvío en la plantilla del `fetch`')
  const destino = join(import.meta.dirname, '..', '..', 'plataforma', 'app', ...m[1].split('/').filter(Boolean), 'route.ts')
  assert.ok(
    existsSync(destino),
    `el formulario reenvía a "${m[1]}" y en plataforma no hay ruta ahí (${destino}). ` +
      'Si allí se movió, el lead se pierde con un 404 que el visitante ve como un error genérico.',
  )
})
