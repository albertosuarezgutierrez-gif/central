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
const RUTA_PANTALLA = 'apps/asegura-portal/app/(portal)/boveda/MiDireccion.tsx'

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

test('el portal NO descifra: lo que lee de vuelta llega ENMASCARADO por asegura', () => {
  const cliente = leer(RUTA_CLIENTE)
  // Se mira el CÓDIGO, no la prosa: la cabecera del módulo explica justamente
  // por qué no descifra, y una expresión que casara con el texto daría rojo por
  // documentar bien la decisión.
  const codigo = cliente.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.ok(
    !/PII_ENCRYPTION_KEY|decryptField|descifrarCampo/.test(codigo),
    'esta app no descifra PII: si aprende, la app pública puede leer la cartera',
  )
  // Desde el 08/09/2026 SÍ hay una lectura, y es la del puerto que enmascara
  // (`contacto-estado`): la máscara la fabrica asegura, el portal solo la pinta.
  assert.match(codigo, /\/api\/portal\/contacto-estado/, 'la lectura pasa por el puerto que enmascara')
  // Y la vigencia NO se calcula aquí: viene decidida del puente.
  assert.ok(!/estadoConfirmacion\(/.test(codigo), 'el portal no calcula la vigencia: la recibe del puente')
  // La pantalla tiene que DECIR que el formulario sale vacío, no dejar creer que no consta.
  assert.match(leer(RUTA_PANTALLA), /No podemos mostrarte la que tenemos guardada/)
})

test('ningún desenlace que no haya guardado dice «guardado»', () => {
  const fuente = leer(RUTA_PANTALLA)
  // El único `tipo: 'guardado'` del fichero es el del caso 'ok'.
  const guardados = fuente.match(/return \{ tipo: 'guardado' \}/g) ?? []
  assert.equal(guardados.length, 1, 'solo el desenlace ok puede decir que se guardó')
  const okIdx = fuente.indexOf("case 'ok':")
  const guardadoIdx = fuente.indexOf("return { tipo: 'guardado' }")
  assert.ok(okIdx !== -1 && guardadoIdx > okIdx && guardadoIdx - okIdx < 80, 'el «guardado» cuelga del caso ok')
  // Y los caminos que no guardan lo dicen con todas las letras.
  for (const estado of ['sin_ficha', 'varias_fichas', 'sin_puente']) {
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

// ─── «Comprueba tus datos de contacto» (08/09/2026) ─────────────────────────
//
// Dictado de Alberto: «tiene que ser automático, un aviso en la intranet; yo no
// intervengo». El cliente ve sus datos tapados y sella «siguen igual» o corrige.
// Tres cosas que no pueden caer: quién sella (la cookie, nunca el cuerpo), qué
// se pinta como confirmado (solo el `ok` del puente / el `vigente` que él
// decide) y qué NO se edita (el email, que es la llave de acceso).

const RUTA_CONFIRMAR = 'apps/asegura-portal/app/api/mis-datos/confirmar/route.ts'
const RUTA_MIS_DATOS_API = 'apps/asegura-portal/app/api/mis-datos/route.ts'
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

test('confirmar toma la identidad de la SESIÓN y no lee nada del cuerpo', () => {
  const fuente = sinComentarios(leer(RUTA_CONFIRMAR))
  assert.match(fuente, /requireIdentidad\(\)/, 'la identidad sale de la cookie')
  assert.match(fuente, /confirmarMisDatos\(identidad\.id\)/, 'se confirma la identidad de la sesión, no otra')
  // El cuerpo NI SE LEE: no hay nada que la ruta necesite saber además de quién
  // tiene la sesión. Un `identidadId` o `clienteId` de fuera dejaría sellar
  // como «revisados» los datos de otra persona.
  assert.ok(!/clienteId/.test(fuente), 'clienteId no puede aparecer en la ruta de confirmar')
  assert.ok(!/identidadId/.test(fuente), 'identidadId no puede leerse del cuerpo: viene de la sesión')
  assert.ok(!/\.json\(\)|formData\(\)|\.text\(\)/.test(fuente), 'la ruta de confirmar no lee el cuerpo')
})

test('solo el ok del puente pasa a «confirmado», y solo vigente pinta «confirmados»', () => {
  const fuente = sinComentarios(leer(RUTA_PANTALLA))
  // El desenlace puro: un único VALOR `{ tipo: 'confirmado', … }` (el tipo de
  // retorno lo declara con `;`, y eso no es un camino), colgado de `estado === 'ok'`.
  const confirmados = fuente.match(/\{ tipo: 'confirmado', confirmadoEn \}/g) ?? []
  assert.equal(confirmados.length, 1, 'solo el ok del puente puede devolver confirmado')
  const okIdx = fuente.indexOf("estado === 'ok' && typeof confirmadoEn === 'string'")
  const confIdx = fuente.indexOf("{ tipo: 'confirmado', confirmadoEn }")
  assert.ok(okIdx !== -1 && confIdx > okIdx && confIdx - okIdx < 80, 'el «confirmado» cuelga del ok CON fecha')
  // La palabra «confirmados» solo existe DENTRO de `LineaVigente` (con fecha y
  // sin ella, que son sus dos frases): ni en el bloque de aviso ni en los fallos.
  const lineaIdx = fuente.indexOf('function LineaVigente')
  const finLinea = fuente.indexOf('\nfunction ', lineaIdx + 1)
  assert.ok(lineaIdx !== -1 && finLinea > lineaIdx, 'existe LineaVigente y no es la última función')
  const fuera = fuente.slice(0, lineaIdx) + fuente.slice(finLinea)
  assert.ok(!/confirmados/.test(fuera), '«confirmados» solo puede escribirse dentro de LineaVigente')
  assert.match(fuente.slice(lineaIdx, finLinea), /confirmados/, 'LineaVigente es la que dice «confirmados»')
  // …y `LineaVigente` se monta una sola vez, bajo `confirmacion === 'vigente'`.
  const montajes = fuente.match(/<LineaVigente/g) ?? []
  assert.equal(montajes.length, 1, 'la línea de vigente se monta en un solo sitio')
  const montajeIdx = fuente.indexOf('<LineaVigente')
  const guardaIdx = fuente.lastIndexOf("confirmacion === 'vigente'", montajeIdx)
  assert.ok(guardaIdx !== -1 && montajeIdx - guardaIdx < 120, 'LineaVigente cuelga de confirmacion === vigente')
  // Y los estados que no son ok tienen cada uno su frase, ninguna de «en orden».
  for (const estado of ['sin_ficha', 'varias_fichas', 'sin_puente', 'error']) {
    assert.match(fuente, new RegExp(`case '${estado}':\\s*\\n\\s*return '`), `falta la frase de ${estado}`)
  }
})

test('el email NO se edita desde el portal: es la llave de acceso', () => {
  const pantalla = sinComentarios(leer(RUTA_PANTALLA))
  assert.ok(!/k: 'email'/.test(pantalla), 'el email no puede ser un campo del formulario')
  assert.ok(!/type="email"|inputMode="email"|modo: 'email'/.test(pantalla), 'ningún input de email en la pantalla')
  const api = sinComentarios(leer(RUTA_MIS_DATOS_API))
  assert.ok(!/email:\s*z\./.test(api), 'la ruta no acepta email: cambiarlo es cambiar la cerradura con la puerta abierta')
  // El teléfono SÍ, y viaja aparte de `libre` (contrato del puerto).
  assert.match(api, /telefono:\s*z\./, 'el teléfono se acepta')
  assert.match(sinComentarios(leer(RUTA_CLIENTE)), /cuerpo\.telefono = /, 'el teléfono viaja a nivel raíz, no dentro de libre')
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

const RUTA_SUGERENCIA_UI = 'apps/asegura-portal/app/(portal)/boveda/Sugerencia.tsx'
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
