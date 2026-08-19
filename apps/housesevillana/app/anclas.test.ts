import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Guardián de las anclas internas de la landing.
//
// 🚨 Por qué existe (12/08/2026): el botón «Reservar» del nav de `/barrio` y `/que-ver`
// apuntaba a `/#reservar`, y en la portada el bloque del motor tiene `id="reserva"` —sin
// la erre final—. No hay ningún `id="reservar"` en todo el repo. El botón funcionaba a
// medias, que es lo peor que puede pasar: llevaba a la portada y ahí te dejaba, arriba
// del todo, sin bajar nunca al motor de reservas. No da error, no sale en ningún log, y
// en escritorio ni se nota porque la portada entra de un vistazo.
//
// Es el MISMO patrón que costó los seis botones al dominio muerto (ver `app/reservas.ts`):
// un destino escrito a mano en varias páginas, que nadie vuelve a comprobar porque
// comprobar uno no dice nada de los otros. Allí la solución fue una constante; aquí no
// sirve —un ancla es parte del HTML de cada página— así que la red es este test.
//
// Las páginas se leen como TEXTO y no se importan, por lo mismo que explica
// `i18n/traducciones.test.ts`: `app/route.ts` arrastra `next/server` y el resto importa
// `../reservas` sin extensión, y el runner de Node no resuelve ninguna de las dos cosas.
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')

const PORTADA = leer('./route.ts')

/** Páginas con HTML propio. Las variantes en/it derivan de la portada por diccionario. */
const PAGINAS: Array<{ nombre: string; html: string }> = [
  { nombre: 'portada', html: PORTADA },
  { nombre: '/barrio', html: leer('./barrio/route.ts') },
  { nombre: '/que-ver', html: leer('./que-ver/route.ts') },
  { nombre: '/parking', html: leer('./parking/contenido.ts') },
]

/** Todos los `id="..."` declarados en un HTML. */
function idsDe(html: string): Set<string> {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
}

/** Anclas de un HTML, separadas en las de la propia página y las que apuntan a la portada. */
function anclasDe(html: string) {
  const propias = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
  const aPortada = [...html.matchAll(/href="\/#([^"]+)"/g)].map((m) => m[1])
  return { propias, aPortada }
}

describe('anclas internas', () => {
  const idsPortada = idsDe(PORTADA)

  test('el recorrido encuentra anclas de verdad (no se ha quedado en vacío)', () => {
    // Los bucles de abajo recorren lo que devuelven `anclasDe`/`idsDe`. Si un cambio de
    // comillas o de formato dejara esas expresiones sin casar, no fallaría ningún test:
    // pasarían todos sin haber mirado una sola ancla. Igual que en `enlaces.test.ts`.
    const total = PAGINAS.reduce((n, { html }) => {
      const { propias, aPortada } = anclasDe(html)
      return n + propias.length + aPortada.length
    }, 0)
    assert.ok(total >= 10, `solo se han encontrado ${total} anclas en ${PAGINAS.length} páginas`)
    assert.ok(idsPortada.size >= 5, `la portada solo declara ${idsPortada.size} ids`)
  })

  for (const { nombre, html } of PAGINAS) {
    const { propias, aPortada } = anclasDe(html)
    const idsPropios = idsDe(html)

    test(`${nombre}: cada href="#x" tiene su id en la misma página`, () => {
      for (const ancla of propias) {
        assert.ok(
          idsPropios.has(ancla),
          `${nombre} enlaza a "#${ancla}" pero no existe ningún id="${ancla}" en esa página. ` +
            `Ids disponibles: ${[...idsPropios].join(', ') || '(ninguno)'}`,
        )
      }
    })

    test(`${nombre}: cada href="/#x" tiene su id en la portada`, () => {
      for (const ancla of aPortada) {
        assert.ok(
          idsPortada.has(ancla),
          `${nombre} enlaza a la portada con "/#${ancla}" pero la portada no tiene ningún ` +
            `id="${ancla}". Ids de la portada: ${[...idsPortada].join(', ') || '(ninguno)'}`,
        )
      }
    })
  }

  // El caso concreto que motivó el fichero, fijado aparte para que no se pierda entre los
  // bucles: si alguien renombra el ancla del motor en la portada, este test lo canta.
  test('la portada conserva el ancla del motor de reservas', () => {
    assert.ok(
      idsPortada.has('reserva'),
      'La portada ya no tiene id="reserva". Si se ha renombrado a propósito, hay que ' +
        'actualizar los href="#reserva" de la propia portada y los href="/#reserva" de ' +
        '/barrio y /que-ver EN EL MISMO CAMBIO — si no, el botón de reservar deja de bajar ' +
        'al motor sin dar ningún error.',
    )
  })

  // Un botón «Reservar» que no lleva al motor no se distingue de uno que sí, así que la
  // única forma de que esto no vuelva es exigir que las dos páginas de contenido SEO
  // (las que traen tráfico de búsqueda) tengan su camino a la reserva.
  test('/barrio y /que-ver mantienen su camino a la reserva', () => {
    for (const nombre of ['/barrio', '/que-ver']) {
      const pagina = PAGINAS.find((p) => p.nombre === nombre)!
      const { aPortada } = anclasDe(pagina.html)
      assert.ok(
        aPortada.includes('reserva') || pagina.html.includes('MOTOR_RESERVAS'),
        `${nombre} se ha quedado sin ningún enlace al motor de reservas`,
      )
    }
  })
})
