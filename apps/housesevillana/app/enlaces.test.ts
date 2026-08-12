import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DOMINIOS_MUERTOS, MOTOR_RESERVAS } from './reservas.ts'

// Guardián del enlace que da de comer.
//
// El 12/08/2026 los SEIS botones de reserva de la landing apuntaban a
// `https://reservas.house-sevillana.com`, un dominio sin registro DNS. El botón principal de
// una web cuyo único objetivo es la reserva directa devolvía un error del navegador, en todas
// las páginas. Nadie lo vio porque el enlace estaba copiado a mano seis veces: mirar uno no
// dice nada de los otros cinco, así que revisarlos no entraba en la cabeza de nadie.
//
// Este test no comprueba que la URL responda —eso no se puede hacer sin red en CI— sino algo
// más útil a largo plazo: que **haya un solo sitio donde equivocarse**.

const APP = fileURLToPath(new URL('.', import.meta.url))

/**
 * Una «página» es un fichero que contiene un documento HTML. No vale filtrar por nombre:
 * los diccionarios de traducción hablan de «Reservar» y «disponibilidad» sin ser páginas, y
 * contarlos daba un falso positivo en la última comprobación de aquí abajo.
 */
const PAGINAS = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => ({ fichero: f, texto: readFileSync(new URL(f, import.meta.url), 'utf8') }))
  .filter(({ texto }) => texto.includes('<!DOCTYPE html>'))

describe('enlaces de reserva', () => {
  test('hay páginas que revisar (el propio recorrido no se ha quedado vacío)', () => {
    // Sin esto, un cambio de estructura dejaría el bucle sin ficheros y el test pasaría
    // en verde sin comprobar nada — la peor forma de fallar.
    assert.ok(PAGINAS.length >= 4, `solo se han encontrado ${PAGINAS.length} páginas`)
  })

  test('ninguna página enlaza a un dominio muerto', () => {
    const culpables: string[] = []
    for (const { fichero, texto } of PAGINAS)
      for (const dominio of DOMINIOS_MUERTOS)
        if (texto.includes(dominio)) culpables.push(`${fichero} → ${dominio}`)
    assert.deepEqual(culpables, [], `enlaces a dominios que no resuelven:\n${culpables.join('\n')}`)
  })

  test('ninguna página escribe la URL del motor a mano', () => {
    // La regla real: el destino de reserva se importa, no se teclea. Si alguien pega la URL
    // literal en una página, el día que cambie volvemos a tener seis sitios que tocar.
    const culpables = PAGINAS.filter(({ texto }) => texto.includes(MOTOR_RESERVAS)).map((p) => p.fichero)
    assert.deepEqual(culpables, [], `usa la URL literal en vez de MOTOR_RESERVAS: ${culpables.join(', ')}`)
  })

  test('la constante apunta a un https ajeno a los dominios muertos', () => {
    assert.match(MOTOR_RESERVAS, /^https:\/\//, 'el motor de reservas debe ir por https')
    for (const dominio of DOMINIOS_MUERTOS)
      assert.ok(!MOTOR_RESERVAS.includes(dominio), `MOTOR_RESERVAS vuelve a apuntar a ${dominio}`)
  })

  test('toda página con botón de reserva lo saca de la constante', () => {
    const conBoton = PAGINAS.filter(({ texto }) => /Reservar|disponibilidad|availability|disponibilit/i.test(texto))
    assert.ok(conBoton.length > 0, 'ninguna página ofrece reservar: eso ya sería el fallo')
    const sinImportar = conBoton.filter(({ texto }) => !texto.includes('MOTOR_RESERVAS')).map((p) => p.fichero)
    assert.deepEqual(sinImportar, [], `hablan de reservar sin usar MOTOR_RESERVAS: ${sinImportar.join(', ')}`)
  })
})
