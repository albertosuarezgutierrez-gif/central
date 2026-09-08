// Guardián de la INSTALACIÓN del portal como app (PWA).
//
// 🚨 Las cinco formas de romper esto son MUDAS: no hay build que falle, no hay
// typecheck que se queje y no hay excepción en el servidor. El botón de
// «Instalar» simplemente deja de aparecer —o aparece y no instala nada— y de
// eso solo se entera el cliente, que no va a escribir para contarlo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

const MANIFIESTO = 'app/manifest.ts'
const SW = 'public/sw.js'
const ICONO_APP = 'app/icono-app/route.tsx'
const OFERTA = 'app/(portal)/InstalarApp.tsx'
/** El almacén compartido: quién escucha el evento de Chrome y quién detecta iOS (desde el 08/09/2026). */
const INSTALACION = 'app/instalacion.tsx'

test('el manifiesto declara lo que Chrome exige para ofrecer instalar', () => {
  assert.ok(existsSync(join(RAIZ, MANIFIESTO)), 'sin manifiesto no hay app instalable')
  const fuente = leer(MANIFIESTO)
  // Sin `standalone` la «app» abre con la barra del navegador: indistinguible
  // de un marcador, que es justo lo que no se quería.
  assert.match(fuente, /display:\s*'standalone'/, 'el manifiesto dejó de pedir modo standalone')
  assert.match(fuente, /start_url:\s*'\/'/, 'el manifiesto perdió su start_url')
  // Con un icono de menos de 192 px Chrome NO ofrece instalar, y no lo dice.
  // Se comprueban TODAS las entradas, no que exista una buena: el manifiesto
  // declara dos (`any` y `maskable`) y degradar solo una dejaba el cepo verde.
  const tamanos = [...fuente.matchAll(/sizes:\s*'(\d+)x\d+'/g)].map((m) => Number(m[1]))
  assert.ok(tamanos.length >= 2, 'el manifiesto dejó de declarar sus dos iconos')
  for (const lado of tamanos) {
    assert.ok(lado >= 192, `hay un icono de ${lado} px en el manifiesto: por debajo de 192 Chrome no ofrece instalar`)
  }
  assert.match(fuente, /purpose:\s*'maskable'/, 'sin variante maskable, Android recorta el logo a su gusto')
})

test('el icono del manifiesto apunta a algo que EXISTE', () => {
  // Un `src` a una ruta que no está no rompe nada: deja el icono en blanco y
  // Chrome se calla. Es el mismo agujero que el `<img>` roto de la web.
  const rutas = [...leer(MANIFIESTO).matchAll(/src:\s*'([^']+)'/g)].map((m) => m[1])
  assert.ok(rutas.length > 0, 'el manifiesto no declara ningún icono')
  for (const ruta of new Set(rutas)) {
    assert.equal(ruta, '/icono-app', `el manifiesto declara ${ruta}, que ya no es la ruta del icono`)
  }
  assert.ok(existsSync(join(RAIZ, ICONO_APP)), 'la ruta que genera el icono de la app no existe')
})

test('los colores del manifiesto salen de la marca, no escritos a mano', () => {
  const fuente = leer(MANIFIESTO)
  assert.match(fuente, /MARCA_ASEGURA\.paleta/, 'el manifiesto ya no lee la paleta de la marca')
  assert.ok(
    !/#[0-9a-fA-F]{6}/.test(fuente),
    'hay un hex a mano en el manifiesto: el día que cambie la marca, la app instalada se queda con el color viejo',
  )
})

test('el service worker existe, tiene fetch y NO cachea', () => {
  assert.ok(existsSync(join(RAIZ, SW)), 'sin service worker Chrome no ofrece instalar la app')
  const fuente = leer(SW)
  assert.match(fuente, /addEventListener\('fetch'/, 'el SW perdió su manejador de fetch: Chrome dejaría de ofrecer instalar')
  // 🚨 El cepo que de verdad importa. Aquí dentro hay pólizas y partes de
  // siniestro de personas identificadas: una respuesta guardada en `caches`
  // sobrevive al cierre de sesión y se queda legible en el disco del visitante.
  assert.ok(
    !/\bcaches\b/.test(fuente),
    'el SW ha empezado a cachear: eso deja datos personales en el disco de quien abra el portal',
  )
})

test('el service worker se registra de verdad', () => {
  // Un SW que nadie registra es un fichero muerto y el botón no aparece nunca.
  assert.match(leer('app/RegistrarSW.tsx'), /register\('\/sw\.js'\)/, 'el registrador ya no registra el SW')
  assert.match(leer('app/layout.tsx'), /<RegistrarSW\s*\/>/, 'el registrador no está montado en el layout raíz')
})

test('la oferta cubre iPhone, donde NO hay evento de instalación', () => {
  const almacen = leer(INSTALACION)
  const fuente = leer(OFERTA)
  // Safari no implementa `beforeinstallprompt`. Si esto solo escuchara el
  // evento, en iOS no se vería NADA —ni error ni banner—, y ahí está la mitad
  // de los clientes de la correduría.
  // Exigido DENTRO del `addEventListener`: el nombre del evento aparece también
  // en el comentario de arriba, y un cepo que se conforma con eso pasa aunque
  // nadie escuche nada.
  assert.match(
    almacen,
    /addEventListener\('beforeinstallprompt'/,
    'el almacén de instalación dejó de escuchar el evento de Chrome',
  )
  assert.match(almacen, /iphone\|ipad\|ipod/i, 'el almacén dejó de detectar iOS: ahí no se vería nada')
  // La franja y la campana leen el MISMO almacén: dos listeners del mismo
  // evento es cómo el segundo `prompt()` rechaza sin que nadie lo pinte.
  assert.match(fuente, /useInstalacion\(\)/, 'la franja ya no lee el almacén compartido de instalación')
  assert.match(leer('app/Campana.tsx'), /useInstalacion\(\)/, 'la campana ya no lee el almacén compartido de instalación')
  assert.ok(
    !/addEventListener\('beforeinstallprompt'/.test(fuente),
    'la franja volvió a escuchar el evento por su cuenta: con dos listeners el segundo prompt() rechaza en silencio',
  )
  assert.match(
    almacen,
    // En un literal de cadena, no en el comentario que lo explica.
    // Dentro del `<strong>` del JSX, no en el comentario que lo explica: el
    // nombre del gesto aparece también ahí arriba, y un cepo que se conforma
    // con eso pasa aunque el aviso ya no lo diga.
    /<strong>«Añadir a pantalla de inicio»<\/strong>/,
    'se perdieron las instrucciones de iOS: sin ellas, en iPhone la oferta no explica cómo instalar',
  )
  assert.match(
    almacen,
    /<IconoCompartir \/>/,
    'se perdió el dibujo del botón Compartir: en iPhone el aviso solo puede explicar el gesto',
  )
  // Y la franja enseña esas instrucciones (no un texto propio que se desvíe).
  assert.match(fuente, /<InstruccionesIOS \/>/, 'la franja dejó de enseñar las instrucciones de iOS')
  // Enseñárselo a quien ya la tiene instalada es la forma tonta de molestar.
  // La consulta de verdad, no la frase: la cabecera del almacén la nombra para
  // explicarla, y con solo la palabra el cepo pasaba con la comprobación borrada.
  assert.match(almacen, /matchMedia\('\(display-mode: standalone\)'\)/, 'el almacén ya no comprueba si la app está instalada')
  const layout = leer('app/(portal)/layout.tsx')
  assert.match(layout, /<InstalarApp\s*\/>/, 'la oferta no está montada en el portal')
  // Y ANTES del contenido: detrás de las pólizas, en el móvil se iba fuera de
  // la primera pantalla y en iPhone es lo único que explica cómo instalar.
  assert.ok(
    layout.indexOf('<InstalarApp') < layout.indexOf('{children}'),
    'la oferta volvió a quedar debajo del contenido: en el móvil no se ve',
  )
})
