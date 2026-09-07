import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// «Si él sube esas pólizas a nombre de empresa, se pregunta» (Alberto,
// 07/09/2026). Estos cepos protegen las tres cosas que hacen que esa pregunta
// signifique algo, y las tres fallan EN SILENCIO: la pantalla sigue pintando,
// la póliza se guarda, y lo único que cambia es que una afirmación falsa entra
// en la base de datos.
const RAIZ = join(import.meta.dirname, '..')
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')
/**
 * 🪤 Quita comentarios para mirar solo lo que se ejecuta — pero es un apaño con
 * un límite REAL, encontrado aquí el 07/09/2026: un `/*` dentro de una CADENA
 * abre un comentario falso. En `SubirPoliza.tsx` lo hace
 * `accept="application/pdf,image/*"`, y a partir de ahí se comió veinte líneas
 * hasta el siguiente cierre — incluida una de las guardas que este fichero
 * vigila. El cepo salió rojo con el código correcto, que es el lado amable del
 * fallo; en el otro habría sido invisible.
 *
 * Por eso no se usa a ciegas: donde la comprobación es sobre CÓDIGO que puede
 * llevar rutas o globs, se mira el fuente crudo.
 */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SUBIR = leer('apps', 'asegura-portal', 'app', '(portal)', 'boveda', 'SubirPoliza.tsx')
const RUTA = leer('apps', 'asegura-portal', 'app', 'api', 'polizas', 'route.ts')
const PUERTO = leer('apps', 'asegura', 'lib', 'leads-portal.ts')
const MANUAL = leer('apps', 'asegura-portal', 'app', '(portal)', 'boveda', 'AnadirPoliza.tsx')
const SQL = leer('apps', 'asegura-portal', 'prisma', 'sql', '2026-09-07_portal_declarada_titular.sql')

test('🚨 la pregunta NO nace contestada', () => {
  // Un valor por defecto aquí no es una comodidad: es responder por el cliente.
  // Y de esa respuesta depende contra qué ficha se comprueba después si la
  // correduría ya lleva esa póliza.
  const codigo = sinComentarios(SUBIR)
  assert.match(
    codigo,
    /useState<'propio' \| 'empresa' \| null>\(null\)/,
    'el estado de «¿de quién es?» tiene que arrancar en null, sin respuesta',
  )
})

test('🚨 no se puede subir sin contestar, ni decir «empresa» sin decir cuál', () => {
  // «De mi empresa» sin nombre no identifica ninguna empresa: viajaría como si
  // lo hiciera. La BD lo rechaza con un CHECK, pero llegar hasta allí devuelve
  // un error de Postgres en vez de decir qué falta.
  const codigo = sinComentarios(SUBIR)
  assert.match(codigo, /listoParaSubir/, 'falta la guarda que impide subir sin contestar')
  assert.match(
    codigo,
    /deQuien === 'empresa' && empresa\.trim\(\) !== ''/,
    'decir «de mi empresa» tiene que exigir el nombre',
  )
  assert.match(codigo, /disabled=\{subiendo \|\| !listoParaSubir\}/, 'el input de fichero tiene que estar bloqueado sin respuesta')
})

test('🚨 «no se preguntó» se guarda como NULL, nunca como «propio»', () => {
  const codigo = sinComentarios(RUTA)
  assert.match(
    codigo,
    /titularTipo:\s*t\.tipo === 'sin_preguntar' \? null : t\.tipo/,
    'sin_preguntar tiene que llegar a la BD como NULL: un default a «propio» sería cómodo y falso',
  )
})

test('🚨 la respuesta viaja en el MISMO envío que el documento', () => {
  // Separarla en una segunda petición dejaría filas guardadas sin respuesta
  // cuando alguien cierra la pestaña, y esas son indistinguibles de un «no se
  // preguntó» de verdad.
  const codigo = sinComentarios(SUBIR)
  const bloque = codigo.match(/const body = new FormData\(\)[\s\S]*?fetch\('\/api\/polizas'/)?.[0] ?? ''
  assert.notEqual(bloque, '', 'no se encuentra el envío del documento')
  assert.match(bloque, /titularTipo/, 'el titular tiene que ir en el mismo FormData que el documento')
})

test('🚨 lo declarado de una EMPRESA no se coteja contra la ficha personal', () => {
  // Es el fallo concreto que todo esto arregla: si se cotejara contra la ficha
  // de quien la sube, una póliza que su sociedad ya tiene contigo saldría como
  // oportunidad y le ofrecerías lo que ya le vendiste.
  const codigo = sinComentarios(PUERTO)
  assert.match(codigo, /fichaParaCotejar\(titular, clienteId\)/, 'el puerto tiene que decidir el cotejo con el módulo puro')
  assert.match(
    codigo,
    /yaEnCartera: fichaCotejo === null \? null : yaEnLaCartera\(yaTiene, fichaCotejo,/,
    'el cotejo tiene que usar la ficha que decide el módulo, no `clienteId` a pelo',
  )
  assert.ok(
    !/yaEnLaCartera\(yaTiene, clienteId,/.test(codigo),
    'sigue cotejándose contra la ficha personal de quien sube: eso es lo que rompe',
  )
})

test('🚨 el SQL concede por COLUMNA antes de declararlas en Prisma', () => {
  // Declarar una columna en Prisma sin GRANT rompe TODAS las lecturas del
  // modelo con 42501, no solo la columna nueva.
  for (const c of ['titular_tipo', 'titular_empresa_nombre', 'titular_empresa_cif']) {
    assert.ok(SQL.includes(c), `falta ${c} en el SQL`)
  }
  assert.match(SQL, /grant select \(titular_tipo/, 'falta el GRANT al rol del portal')
  assert.match(SQL, /to prisma_seguros/, 'el corredor tiene que poder leerlo para reconciliarlo')
  assert.match(SQL, /check \(titular_tipo is null or titular_tipo in/, 'falta el CHECK del vocabulario')
})

test('🚨 el alta A MANO manda la misma respuesta', () => {
  // Agujero real, encontrado el mismo día que se construyó esto: la API ya
  // aceptaba el titular pero el formulario manual no lo mandaba, así que todo
  // lo añadido a mano nacía como «no se preguntó» aunque la persona acabara de
  // contestar dos centímetros más arriba. Y «no se preguntó» decide que NO se
  // coteje contra ninguna ficha: el lead salía siempre sin comprobar.
  const codigo = sinComentarios(MANUAL)
  const envio = codigo.match(/body: JSON\.stringify\(\{[\s\S]*?\}\)/)?.[0] ?? ''
  assert.notEqual(envio, '', 'no se encuentra el cuerpo del alta a mano')
  assert.match(envio, /titularTipo: titular\.tipo/, 'el alta a mano tiene que mandar el titular')
})

test('🚨 la pregunta se hace UNA vez, y bloquea los DOS caminos', () => {
  // Dos controles para la misma pregunta acaban discrepando, y el que se
  // guarda es el que esté más cerca del `fetch` — o sea, cuestión de suerte.
  const manual = sinComentarios(MANUAL)
  assert.ok(
    !/useState<'propio' \| 'empresa'/.test(manual),
    'el formulario manual NO puede tener su propio estado de «¿de quién es?»: viaja como prop',
  )
  // 🪤 La primera versión miraba que `disabled` fuera el atributo pegado a
  // `onClick={abrirManual}`, y salía roja con el código correcto: entre los dos
  // hay un salto de línea y sangría, y el orden de los atributos de un JSX no
  // es una propiedad que merezca protegerse. Se afirma lo que importa: que la
  // guarda aparece DOS veces — una por camino.
  // Crudo y no `sinComentarios`: este fichero contiene `image/*` y el apaño de
  // arriba se comería la mitad del JSX (ver su cabecera).
  // 🪤 `(?<!aria-)` no es cosmética: sin ella el contador sumaba el
  // `aria-disabled` de la etiqueta y llegaba a dos aun habiendo quitado la
  // guarda del botón. Se comprobó rompiéndolo.
  const guardas = SUBIR.match(/(?<!aria-)disabled=\{subiendo \|\| !listoParaSubir\}/g) ?? []
  assert.ok(
    guardas.length >= 2,
    `la guarda tiene que bloquear los dos caminos (fichero y alta a mano); encontrada ${guardas.length} vez/veces`,
  )
  assert.match(SUBIR, /onClick=\{abrirManual\}/, 'sigue existiendo el botón de alta a mano')
})
