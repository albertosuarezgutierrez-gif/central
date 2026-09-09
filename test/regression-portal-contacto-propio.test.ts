import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🪤 Guardián de «el cliente corrige su dirección de contacto desde el portal»
 * (08/09/2026).
 *
 * Lee el FUENTE, no importa los módulos: los de asegura y los del portal
 * arrastran Prisma y este job (`Tests (packages + guardián)`) corre SIN
 * `prisma generate`. Importarlos lo tumbaría entero.
 *
 * Lo que vigila, y qué se rompe si cae cada uno:
 *  1. El portal no aprende a descifrar PII para enseñar la dirección guardada.
 *  2. El puerto de asegura no acepta un `clienteId` de fuera — con él, la app
 *     pública podría escribir en cualquiera de las 32.600 fichas.
 *  3. El portal usa su secreto propio, NO el de operador (que abre la cartera).
 *  4. Ningún desenlace que no haya guardado se le enseña al cliente como
 *     guardado.
 *  5. La pantalla dice que esto NO cambia la dirección de sus pólizas.
 */
const raiz = join(import.meta.dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')

const RUTA_PUERTO = 'apps/asegura/app/api/portal/contacto/route.ts'
const RUTA_APLICA = 'apps/asegura/lib/contacto-portal.ts'
const RUTA_CLIENTE = 'apps/asegura-portal/lib/mis-datos.ts'
// 09/09/2026: «Mis datos» sustituye a «Dónde te escribimos», con su propia
// pestaña, y ahora también teléfono y correo (no solo la dirección).
const RUTA_PANTALLA = 'apps/asegura-portal/app/(portal)/boveda/MisDatos.tsx'

test('el puerto NO acepta un clienteId de fuera: la ficha la resuelve el vínculo', () => {
  const fuente = leer(RUTA_PUERTO)
  assert.ok(
    !/body\.clienteId|clienteId\s*=\s*.*body/.test(fuente),
    'el puerto del portal no puede leer clienteId del cuerpo: sería poder escribir en cualquier ficha',
  )
  assert.match(leer(RUTA_APLICA), /from portal_vinculo/, 'la ficha se resuelve por portal_vinculo')
})

test('el puerto aplica LISTA BLANCA de campos: nada de identidad', () => {
  const fuente = leer(RUTA_PUERTO)
  assert.match(fuente, /CAMPOS_CONTACTO_PROPIO/, 'los campos permitidos salen del módulo puro')
  for (const vetado of ['dni', 'nombre', 'apellidos', 'fechaNacimiento', 'notas']) {
    assert.ok(
      !new RegExp(`['"\`]${vetado}['"\`]`).test(fuente),
      `${vetado} no puede aparecer en el puerto del portal: la identidad se cambia documentada`,
    )
  }
})

test('el portal usa su secreto propio y NUNCA el de operador', () => {
  const cliente = leer(RUTA_CLIENTE)
  assert.match(cliente, /ASEGURA_PORTAL_PUENTE_SECRET/)
  assert.ok(
    !/ASEGURA_OPERADOR_SECRET/.test(cliente),
    'el secreto de operador abre la cartera entera: el portal no lo tiene',
  )
  // Y cerrado por defecto: sin las envs no se inventa un destino.
  assert.match(cliente, /sin_puente/)
})

test('el portal NO aprende a descifrar PII, aunque desde el 09/09/2026 SÍ lee de vuelta', () => {
  const cliente = leer(RUTA_CLIENTE)
  // Se mira el CÓDIGO, no la prosa: la cabecera del módulo explica justamente
  // por qué no descifra, y una expresión que casara con el texto daría rojo por
  // documentar bien la decisión.
  const codigo = cliente.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.ok(
    !/PII_ENCRYPTION_KEY|decryptField|descifrarCampo/.test(codigo),
    'esta app no descifra PII: si aprende, la app pública puede leer la cartera',
  )
  // Desde el 09/09/2026 SÍ hay una lectura (`leerMisDatos`/`GET`), pero viene YA
  // descifrada del puerto de asegura: el portal solo la reenvía.
  assert.match(cliente, /leerMisDatos/, 'la lectura tiene que existir: Alberto pidió poder VER los datos')
  // Y cuando esa lectura falla, la pantalla lo DICE — no deja un hueco que
  // parezca «no consta».
  assert.match(leer(RUTA_PANTALLA), /No hemos podido/)
})

test('ningún desenlace que no haya guardado dice «guardado»', () => {
  const fuente = leer(RUTA_PANTALLA)
  // El único `return { tipo: 'guardado', ... }` del fichero es el del caso 'ok'
  // (el tipo `Estado` también declara la forma, pero eso no es un `return`).
  const guardados = fuente.match(/return \{ tipo: 'guardado'/g) ?? []
  assert.equal(guardados.length, 1, 'solo el desenlace ok puede decir que se guardó')
  const okIdx = fuente.indexOf("case 'ok':")
  const guardadoIdx = fuente.indexOf("return { tipo: 'guardado'")
  assert.ok(okIdx !== -1 && guardadoIdx > okIdx && guardadoIdx - okIdx < 200, 'el «guardado» cuelga del caso ok')
  // Y los caminos que no guardan lo dicen con todas las letras.
  for (const estado of ['sin_ficha', 'varias_fichas', 'sin_puente', 'en_otra_ficha']) {
    assert.match(fuente, new RegExp(`case '${estado}':`), `falta el desenlace de ${estado}`)
  }
  assert.match(fuente, /No se ha cambiado nada/, 'un fallo tiene que decir que no se cambió nada')
})

test('la pantalla avisa de que esto NO cambia la dirección de las pólizas', () => {
  const fuente = leer(RUTA_PANTALLA)
  assert.match(
    fuente,
    /No es la dirección que figura en tus\s*\n?\s*pólizas/,
    'sin este aviso, el cliente cree que su hogar ya cubre la casa nueva',
  )
  // También en el acuse: el aviso previo se lee antes de escribir y se olvida.
  assert.match(fuente, /esto no cambia la\s*\n?\s*dirección de tus pólizas/)
})

test('el historial de la ficha dice que lo hizo el CLIENTE', () => {
  assert.match(leer(RUTA_APLICA), /const ACTOR = 'el cliente, desde el portal'/)
  assert.match(leer(RUTA_APLICA), /textoHistorialContactoPropio/)
})

// ─── El botón de sugerencias (08/09/2026) ────────────────────────────────────
//
// Va en este mismo fichero porque protege la MISMA regla desde otro ángulo: lo
// que el cliente hace en el portal tiene que llegar a Alberto, y lo que no ha
// llegado no se le puede agradecer.

// 09/09/2026: sube a la barra de la cabecera («donde está la campanita, la
// luna y salir»), fuera del grupo `(portal)/boveda`.
const RUTA_SUGERENCIA_UI = 'apps/asegura-portal/app/Sugerencia.tsx'
const RUTA_SUGERENCIA_LIB = 'apps/asegura-portal/lib/sugerencia.ts'
const RUTA_SUGERENCIA_API = 'apps/asegura-portal/app/api/sugerencia/route.ts'

test('solo UN desenlace de la sugerencia da las gracias', () => {
  // Sin los comentarios: la cabecera explica esta misma regla citándola, y un
  // cepo que se muerda a sí mismo por documentar bien la decisión es inútil (es
  // la trampa que ya avisa `apps/asegura-portal/CLAUDE.md`).
  const fuente = leer(RUTA_SUGERENCIA_UI).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const oks = fuente.match(/ok: true/g) ?? []
  assert.equal(oks.length, 1, 'un fallo de envío no puede agradecerse: para un lead, Telegram es el único registro')
  const idx = fuente.indexOf("case 'enviada':")
  assert.ok(idx !== -1 && fuente.indexOf('ok: true') > idx, 'las gracias cuelgan del caso enviada')
  // Y los que no salieron lo dicen con todas las letras.
  assert.match(fuente, /No se ha guardado nada/)
})

test('la API solo devuelve 200 cuando el envío salió', () => {
  const fuente = leer(RUTA_SUGERENCIA_API)
  assert.match(fuente, /r === 'enviada' \? 200/, 'el 200 tiene que colgar de «enviada», no de que la ruta terminara')
  assert.match(fuente, /rateLimit\(/, 'sin tope, quien tenga sesión puede llenar el Telegram de Alberto')
  assert.match(fuente, /requireIdentidad/, 'la identidad sale de la cookie')
})

test('la sugerencia queda además en la ficha, y sin ficha no se calla', () => {
  const lib = leer(RUTA_SUGERENCIA_LIB)
  assert.match(lib, /api\/portal\/nota/, 'lo que hace el cliente tiene que llegar a su historial')
  assert.match(lib, /no queda en ninguna ficha/, 'un lead no tiene historial: se dice en el log, no se supone')
})
