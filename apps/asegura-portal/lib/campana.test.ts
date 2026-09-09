// Guardián de la CAMPANA de avisos de la cabecera.
//
// Las formas de romperla son MUDAS: la campana desaparece de la barra, o
// acepta una autorización desde el panel, o pinta «sin avisos» sobre una fuente
// que no se leyó — y ninguna falla en el build. Cada aserción se rompió a mano
// y se vio en rojo antes de dejarla (regla del `CLAUDE.md` de la raíz).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

const LAYOUT = 'app/layout.tsx'
const PUERTA = 'app/CampanaAvisos.tsx'
const CAMPANA = 'app/Campana.tsx'
const RUTA = 'app/api/avisos/route.ts'
const CSS = 'app/globals.css'

test('la campana está en la cabecera, antes del tema y con Salir al final', () => {
  const layout = leer(LAYOUT)
  const salir = layout.indexOf('<SalirDelPortal />')
  const campana = layout.indexOf('<CampanaAvisos />')
  const tema = layout.indexOf('<InterruptorTema />')
  assert.ok(campana > 0, 'la campana no está montada en el layout raíz')
  // El orden es el que pidió Alberto (instalar → avisos → tema → salir, con
  // Salir «a la derecha del todo») y los cuatro van dentro del contenedor que
  // lleva el único `margin-left:auto`.
  const acciones = layout.indexOf('className="marca-acciones"')
  assert.ok(acciones > 0 && acciones < campana, 'la campana ya no está dentro de .marca-acciones')
  assert.ok(campana < tema && tema < salir, 'el orden campana → tema → Salir se ha roto: Salir va a la derecha del todo')
})

test('la campana solo se pinta con sesión VERIFICADA, no con que exista la cookie', () => {
  const puerta = leer(PUERTA)
  assert.match(puerta, /verificarSesion\(token\)/, 'la puerta ya no verifica el token: una cookie caducada pintaría la campana')
  assert.match(puerta, /return null/, 'sin sesión tiene que devolver null')
  assert.match(leer(LAYOUT), /import \{ CampanaAvisos \} from '\.\/CampanaAvisos'/, 'el layout monta otra cosa que no es la puerta')
})

test('desde la campana NO se acepta ni se revoca nada: enlaza a donde se resuelve', () => {
  const fuente = leer(CAMPANA)
  // Solo un `fetch`, y es el GET de avisos. Un PATCH/POST desde aquí sería
  // aceptar sin el alcance ni el texto delante.
  const fetches = fuente.match(/fetch\(/g) ?? []
  assert.equal(fetches.length, 1, 'la campana hace más de una llamada: solo puede leer /api/avisos')
  assert.match(fuente, /fetch\('\/api\/avisos'/, 'la campana ya no lee /api/avisos')
  assert.ok(!/method:\s*'(PATCH|POST|DELETE|PUT)'/.test(fuente), 'la campana escribe: eso se hace en la pantalla de cada cosa')
  // Sin los comentarios: el «por qué» de arriba nombra el aceptar para
  // prohibirlo, y un cepo que lee comentarios se pone rojo con la explicación.
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.ok(!/aceptar|revocar/i.test(codigo), 'la campana ofrece aceptar o revocar: eso vive en /autorizaciones')
  assert.match(fuente, /href=\{a\.href\}/, 'los avisos dejaron de ser enlaces')
})

test('el globo tiene tres desenlaces y un fallo de red es «!», nunca «sin avisos»', () => {
  const fuente = leer(CAMPANA)
  assert.match(fuente, /datos === 'error' \? '!'/, 'un fallo de red ya no pinta «!»')
  assert.match(fuente, /setDatos\('error'\)/, 'el catch del fetch ya no marca error: pintaría «nada pendiente» sobre lo que no se leyó')
  // La cifra solo cuando es cierta: el globo se pinta con lo que decide `lib/avisos.ts`.
  assert.match(fuente, /datos\?\.globo/, 'la campana ya no pinta el globo que compone lib/avisos.ts')
})

test('el número también va al icono de la app instalada, y se limpia al no haber nada', () => {
  const fuente = leer(CAMPANA)
  // Las LLAMADAS, no el nombre: el tipo de arriba declara los dos métodos y un
  // cepo que busque la palabra pasa con la llamada borrada.
  assert.match(fuente, /nav\.setAppBadge\(/, 'se perdió el globo del icono de la app instalada')
  assert.match(fuente, /nav\.clearAppBadge\(\)/, 'sin limpiar el globo del icono, el «3» se queda para siempre')
})

test('la ruta resuelve la identidad por la cookie y NO colapsa una fuente caída a []', () => {
  const ruta = leer(RUTA)
  assert.match(ruta, /requireIdentidad\(\)/, 'la ruta ya no resuelve la identidad por la puerta única')
  assert.ok(!/searchParams|req\.json|identidadId\s*=/.test(ruta), 'la ruta lee la identidad de la petición: cualquiera vería los avisos de cualquiera')
  assert.match(ruta, /Promise\.allSettled/, 'con `all`, una fuente caída se lleva la otra; con un catch a [], miente')
  assert.match(ruta, /autorizaciones\.status === 'fulfilled' \? autorizaciones\.value : null/, 'la fuente caída ya no llega como null a avisosDe')
  assert.match(ruta, /obligaciones\.status === 'fulfilled' \? obligaciones\.value : null/, 'la fuente caída ya no llega como null a avisosDe')
  assert.match(ruta, /no-store/, 'sin no-store, una copia guardada enseña avisos ya resueltos')
})

test('el CSS junta instalar, Salir, campana y tema en UN contenedor con el único margin-left:auto', () => {
  const css = leer(CSS)
  // Con el `auto` repartido entre botones (y una regla de hermano para
  // quitárselo al tema), cada botón que entraba o salía cambiaba el reparto del
  // hueco: instalar solo existe si el navegador lo ofrece.
  const acciones = css.match(/\.marca-acciones \{[^}]*\}/)?.[0] ?? ''
  assert.match(acciones, /margin-left: auto/, '.marca-acciones perdió su margin-left:auto: los botones dejan de ir a la derecha')
  const salir = css.match(/\.salir-form \{[^}]*\}/)?.[0] ?? ''
  const tema = css.match(/\.tema-boton \{[^}]*\}/)?.[0] ?? ''
  assert.ok(!/margin-left: auto/.test(salir), '.salir-form volvió a llevar margin-left:auto: reparte el hueco y separa los botones')
  assert.ok(!/margin-left: auto/.test(tema), '.tema-boton volvió a llevar margin-left:auto: reparte el hueco y separa los botones')
  assert.ok(!/\.salir-form\s*[+~]\s*\.tema-boton/.test(css), 'volvió la regla de hermano de Salir: ya no hace falta y con instalar en medio se rompe')
  // 44 px: el mínimo táctil de la casa, y esta barra la usa gente de 50-70 años.
  const boton = css.match(/\.campana-boton \{[^}]*\}/)?.[0] ?? ''
  assert.match(boton, /width: 44px/, 'la campana ya no mide 44 px de ancho')
  assert.match(boton, /height: 44px/, 'la campana ya no mide 44 px de alto')
  // El panel en el móvil se ancla a la pantalla: colgado del botón, a 320 px se
  // sale por la izquierda.
  assert.match(css, /@media \(max-width: 480px\) \{\s*\.campana-panel \{[^}]*left: 8px;[^}]*right: 8px;/, 'el panel dejó de anclarse a la pantalla en el móvil')
})
