// Guardián: un valor tiene TRES estados, no dos.
// `node --test` (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────────────────────
// La regla fundacional del CLAUDE.md raíz —«dato que NO hay ≠ dato que NO se ha mirado»— se venía
// cumpliendo por VIGILANCIA: cada pantalla nueva tenía que acordarse de no pintar un 0 donde hay
// un NULL. `apps/plataforma/lib/dato.ts` la convierte en la opción por defecto, y este cepo fija
// su semántica para que nadie la «simplifique» más adelante a un booleano.
//
// Hay DOS formas de romperla, y son simétricas:
//
//   1. Tratar el NULL como si fuera un dato. Es la cara cara: `?? 0` / `?? []` y la pantalla dice
//      «sin documentos adjuntos» o «0 €» sobre algo que nadie ha mirado todavía. Caso fundacional
//      (PR #1180): una subasta decía «sin documentos» mientras el BOE publicaba su edicto Y su
//      certificación de cargas.
//
//   2. Tratar el 0 como si fuera un hueco. Es la que aparece al ARREGLAR la primera, y estropea
//      cifras que sí son correctas: «0 €» y «0 incidencias» son afirmaciones legítimas que
//      alguien comprobó. Si `0` cae en «pendiente», la pantalla deja de decir lo que sabe.
//
// Por eso el test no comprueba «distingue null de valor», sino la tabla ENTERA.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDato, esPendiente, colorImporte } from '../apps/plataforma/lib/dato.ts'

test('null y undefined son «pendiente» — nadie lo ha mirado todavía', () => {
  assert.equal(estadoDato(null), 'pendiente')
  assert.equal(estadoDato(undefined), 'pendiente')
  assert.equal(esPendiente(null), true)
  assert.equal(esPendiente(undefined), true)
})

test('el 0 es un VALOR, no un hueco', () => {
  // El error simétrico al que motiva este módulo: si «0 €» se pinta como «sin revisar», la
  // pantalla deja de afirmar algo que sí se comprobó.
  assert.equal(estadoDato(0), 'valor', 'un 0 comprobado es una cifra, no un «no lo sé»')
  assert.equal(esPendiente(0), false)
})

test('false y NaN también son valores', () => {
  assert.equal(estadoDato(false), 'valor', 'false es una respuesta, no una ausencia')
  // NaN, si aparece, es un fallo de cálculo aguas arriba: debe VERSE, no esconderse tras un
  // «sin revisar» que haría creer que el cron todavía no ha pasado.
  assert.equal(estadoDato(NaN), 'valor')
})

test('solo el array vacío y la cadena vacía son «revisado, no hay»', () => {
  assert.equal(estadoDato([]), 'vacio')
  assert.equal(estadoDato(''), 'vacio')
})

test('cualquier contenido real es «valor»', () => {
  for (const v of [[1], 'texto', { a: 1 }, 42, -3.5, new Date()]) {
    assert.equal(estadoDato(v), 'valor', `${JSON.stringify(v)} debería contar como dato`)
  }
})

test('los tres estados son mutuamente excluyentes y cubren todo', () => {
  const muestras: unknown[] = [null, undefined, 0, false, NaN, '', [], [0], 'x', {}, 1]
  for (const v of muestras) {
    const e = estadoDato(v)
    assert.ok(
      e === 'pendiente' || e === 'vacio' || e === 'valor',
      `estadoDato devolvió «${e}», que no es uno de los tres estados`,
    )
    // «pendiente» y `esPendiente` no pueden divergir: media base de código guarda por NULL.
    assert.equal(e === 'pendiente', esPendiente(v))
  }
})

test('colorImporte devuelve tokens, nunca un hex fijo', () => {
  // Un hex fijo no cambia en modo oscuro: la cifra queda ilegible sobre fondo oscuro. Era el
  // patrón `x >= 0 ? '#16a34a' : '#dc2626'`, copiado a mano por todo el panel.
  for (const n of [10, 0, -10]) {
    const c = colorImporte(n)
    assert.ok(c.startsWith('var(--'), `colorImporte(${n}) devolvió «${c}», que no es un token`)
  }
  assert.equal(colorImporte(0), colorImporte(1), 'el 0 se pinta como un importe no negativo')
  assert.notEqual(colorImporte(1), colorImporte(-1), 'ingreso y gasto deben distinguirse')
})
