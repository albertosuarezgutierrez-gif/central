import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// El portal del CLIENTE no tuvo botón de cerrar sesión hasta el 07/09/2026, y
// la cookie dura 30 días: quien entraba desde el ordenador de casa o desde un
// móvil compartido no tenía forma de deshacerlo. Estos cepos protegen las tres
// cosas que hacen que ese botón signifique algo — y las tres fallan EN SILENCIO
// si se rompen: la pantalla sigue pintando «Salir», la persona lo pulsa, ve la
// portada y se cree fuera.
const RAIZ = join(import.meta.dirname, '..', 'apps', 'asegura-portal')
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')

/**
 * 🪤 Los comentarios FUERA antes de mirar la forma del código.
 *
 * El primer intento de este cepo salió rojo sin que hubiera ningún fallo: la
 * regla «aquí no puede haber un `<Link>`» encontraba la palabra `<Link>` en el
 * comentario del propio componente, que explica justamente por qué no lo hay.
 * Es la misma familia de fallo que ya documenta `CLAUDE.md` —un guardián que
 * mira al sitio equivocado— y aquí salió en la dirección amable (rojo de más).
 * En la otra dirección habría sido invisible.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const RUTA = leer('app', 'api', 'salir', 'route.ts')
const BOTON = leer('app', 'SalirDelPortal.tsx')
const LAYOUT = leer('app', 'layout.tsx')
const CSS = leer('app', 'globals.css')

test('🚨 la ruta de salir NO acepta GET', () => {
  // La cookie es `sameSite: 'lax'`, o sea que viaja en una navegación de primer
  // nivel por GET. Con un GET aquí, cualquier enlace ajeno cierra la sesión —y
  // ni siquiera hace falta pulsarlo: los navegadores y el `<Link>` de Next
  // PRECARGAN, así que bastaría con pasar el ratón por encima.
  assert.ok(
    !/export\s+(async\s+)?function\s+GET\b/.test(sinComentarios(RUTA)),
    'app/api/salir/route.ts no puede exportar GET: la precarga de enlaces cerraría la sesión sola',
  )
  assert.ok(
    /export\s+async\s+function\s+POST\b/.test(RUTA),
    'la salida tiene que ser un POST',
  )
})

test('🚨 la cookie se borra con las MISMAS opciones con las que se puso', () => {
  // Éste es el que de verdad duele: un borrado con otro `path` (o sin `secure`)
  // NO falla. Responde igual, redirige igual, la persona ve la portada — y la
  // cookie sigue en el navegador con la sesión viva. El síntoma del fallo es
  // idéntico al del éxito, así que solo lo puede cazar un cepo.
  // 🪤 Se mira la LLAMADA, no el fichero. La primera versión de este brazo
  // buscaba `COOKIE_OPTS` en todo el fuente y se quedaba VERDE con las opciones
  // escritas a mano, porque el `import` de arriba ya contiene esa palabra.
  const set = sinComentarios(RUTA).match(/res\.cookies\.set\([\s\S]*?\)\n/)?.[0] ?? ''
  assert.notEqual(set, '', 'no se encuentra la llamada que borra la cookie')
  assert.ok(
    /\.\.\.COOKIE_OPTS/.test(set),
    'el borrado tiene que esparcir COOKIE_OPTS, no repetir las opciones a mano: con otro `path` o sin `secure` la cookie NO se borra y nada falla',
  )
  assert.ok(
    /maxAge:\s*0/.test(set),
    'sin `maxAge: 0` la cookie no se borra: se reescribe con otros 30 días',
  )
})

test('🚨 el botón sale del layout RAÍZ y va a la derecha del todo', () => {
  // Desde el 08/09/2026 los botones de la derecha (instalar, salir, avisos,
  // tema) viven en UN contenedor, `.marca-acciones`, que es quien lleva el
  // único `margin-left:auto`. Antes lo llevaba `.salir-form` y se le quitaba
  // al interruptor con una regla de hermano; cada botón nuevo la rompía y el
  // hueco se repartía separándolos sin que nada fallara.
  assert.ok(/<SalirDelPortal\s*\/>/.test(LAYOUT), 'falta <SalirDelPortal /> en la barra')
  // Y Salir es el ÚLTIMO del grupo: «a la derecha del todo, es lo lógico»
  // (Alberto, 08/09/2026).
  const acciones = LAYOUT.indexOf('className="marca-acciones"')
  const salir = LAYOUT.indexOf('<SalirDelPortal')
  const tema = LAYOUT.indexOf('<InterruptorTema')
  assert.ok(acciones > 0 && acciones < tema && tema < salir, 'SalirDelPortal tiene que ir dentro de .marca-acciones y el último: a la derecha del todo')
  const bloque = CSS.match(/\.marca-acciones\s*\{[^}]*\}/)?.[0] ?? ''
  assert.ok(/margin-left:\s*auto/.test(bloque), 'falta el margin-left:auto de .marca-acciones: los botones dejan de ir a la derecha')
  const salirCss = CSS.match(/\.salir-form\s*\{[^}]*\}/)?.[0] ?? ''
  assert.ok(!/margin-left:\s*auto/.test(salirCss), '.salir-form volvió a llevar margin-left:auto: reparte el hueco y separa los botones')
})

test('🚨 el botón no se pinta sin sesión, y la sesión se VERIFICA', () => {
  // Ver que la cookie existe no es tener sesión: una caducada o manipulada
  // sigue siendo una cookie. Y al revés importa más — un botón pintado siempre
  // ofrecería «Salir» en la portada de quien todavía no ha entrado.
  assert.ok(
    /verificarSesion/.test(BOTON),
    'hay que verificar el token, no solo mirar si la cookie está',
  )
  assert.ok(
    /return null/.test(BOTON),
    'sin sesión válida el componente devuelve null',
  )
})

test('🚨 la salida es un formulario POST, no un enlace', () => {
  // Un `<Link>` a una ruta que solo acepta POST no cierra nada: la persona
  // pulsa, no pasa nada visible, y se va creyendo que ha salido.
  assert.ok(
    /method="post"/.test(BOTON) && /action="\/api\/salir"/.test(BOTON),
    'el botón tiene que ser un <form method="post" action="/api/salir">',
  )
  const jsx = sinComentarios(BOTON)
  assert.ok(
    !/<Link\b/.test(jsx) && !/<a\b/.test(jsx),
    'nada de enlaces: un GET no puede cerrar la sesión (ver la ruta)',
  )
})
