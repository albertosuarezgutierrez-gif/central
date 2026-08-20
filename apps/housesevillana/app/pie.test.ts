import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Guardián del año del pie de página.
//
// El 19/08/2026 el pie de la portada seguía diciendo «© 2025». Un año quemado no falla
// nunca: simplemente envejece en silencio y, para quien llega a la web a reservar, una
// página con el año pasado es una página abandonada — justo lo contrario de lo que el
// canal directo necesita transmitir.
//
// El arreglo no fue poner 2026 (eso vuelve a caducar el 1 de enero) ni interpolar
// `new Date().getFullYear()`: el HTML es una constante de módulo y Next puede prerenderizar
// estas rutas, así que el año quedaría clavado en el del build igualmente. Se quitó el año.
// Un aviso de copyright no necesita fecha para ser válido, y sin número no hay nada que se
// pueda quedar viejo. Este test impide que vuelva a colarse uno.

const APP = fileURLToPath(new URL('.', import.meta.url))

/** Igual que en `enlaces.test.ts`: una «página» es un fichero que lleva un documento HTML. */
const PAGINAS = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => ({ fichero: f, texto: readFileSync(new URL(f, import.meta.url), 'utf8') }))
  .filter(({ texto }) => texto.includes('<!DOCTYPE html>'))

describe('pie de página', () => {
  test('hay páginas que revisar (el recorrido no se ha quedado vacío)', () => {
    assert.ok(PAGINAS.length >= 4, `solo se han encontrado ${PAGINAS.length} páginas`)
  })

  for (const { fichero, texto } of PAGINAS) {
    test(`${fichero} — el copyright no lleva año quemado`, () => {
      // `&copy;` o `©` seguido de un año de cuatro cifras, con o sin espacios de por medio.
      const quemados = texto.match(/(?:&copy;|©)\s*(?:19|20)\d{2}/g) || []
      assert.deepEqual(
        quemados,
        [],
        `año fijo en el copyright (caduca solo): ${quemados.join(', ')}`,
      )
    })
  }
})
