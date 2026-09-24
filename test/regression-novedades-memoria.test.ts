// Guardián: las «novedades» del panel de arquitectura son TITULARES DE SESIÓN, no fragmentos.
//
// 🐛 Lo que arregla (02/09/2026). El auditor los sacaba con `^[-*] \*\*(.+?)\*\*`, que casa con
// cualquier bullet en negrita. Como el cuerpo de cada entrada está lleno de sub-bullets SIN
// indentar (`- **Titular:** …`), el panel pintaba trozos sueltos de argumentación —«Cablear un
// valor es lo que deja una primitiva sin adoptar:»— todos sin fecha, y NO mostraba ninguna
// entrada del formato `### `, que es el que usan casi todas las sesiones. Medido: 0 de 15
// novedades traían fecha.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extraerNovedades, tituloDeEntrada, fechaDeEntrada } from '../scripts/auditar-novedades.mjs'

const RAIZ = join(import.meta.dirname, '..')

test('reconoce las entradas `### `, que antes no salían nunca', () => {
  const md = [
    '### 🩺 (02/09/2026) Salud de la arquitectura a cero avisos',
    '- **La reimplementación era real:** apps/alquiler llevaba su propio catálogo.',
    '- **CLAUDE.md propios** para almacen y asegura-portal.',
    '',
    '### 🧱 (01/09/2026, noche) Las 43 cabeceras al componente compartido',
    '- **Es un cambio de ASPECTO:** títulos a 20px.',
  ].join('\n')
  const n = extraerNovedades(md)
  assert.equal(n.length, 2, 'los sub-bullets del cuerpo NO son entradas')
  assert.equal(n[0].titulo, '🩺 Salud de la arquitectura a cero avisos')
  assert.equal(n[0].fecha, '02/09/2026')
  assert.equal(n[1].fecha, '01/09/2026')
})

test('sigue reconociendo el formato antiguo `- **Título (fecha).**`', () => {
  const n = extraerNovedades('- **Rotado el scope a @central (11/06/2026).** Cuerpo.')
  assert.equal(n.length, 1)
  assert.equal(n[0].titulo, 'Rotado el scope a @central')
  assert.equal(n[0].fecha, '11/06/2026')
})

test('una entrada antigua FECHADA bajo una `### ` se sigue reconociendo', () => {
  const md = [
    '### Entrada nueva (04/09/2026)',
    '- **Sub-bullet del cuerpo:** no es una entrada.',
    '- **Entrada vieja (03/09/2026).** Sí lo es: lleva fecha en la negrita.',
  ].join('\n')
  const n = extraerNovedades(md)
  assert.deepEqual(n.map(x => x.fecha), ['04/09/2026', '03/09/2026'])
})

test('el título no arrastra la fecha ni el matiz entre paréntesis', () => {
  assert.equal(tituloDeEntrada(['### 🕳️ (02/09/2026, noche) El feed PSD2']), '🕳️ El feed PSD2')
  assert.equal(fechaDeEntrada(['### 🕳️ (02/09/2026, noche) El feed PSD2']), '02/09/2026')
})

// 🪤 La ambigüedad que NO resuelve el parser, y por eso la vigila un test.
// Una cabecera del formato antiguo y un sub-bullet del cuerpo son la MISMA sintaxis; lo único
// que las separa es que la cabecera lleva la fecha ENTRE PARÉNTESIS. Así que un bullet de
// cuerpo que cite una fecha entre paréntesis se lee como entrada y se cuela en el panel —
// medido el 02/09/2026 con `- **Hecho por Claude Chrome (02/09):**`, que salía como novedad
// con la fecha vacía y solo se salvaba por caer en la posición 16 de 15.
// El arreglo no es endurecer el parser (las cabeceras reales llevan la fecha en medio tan a
// menudo como al final: 14 de 137 en la historia archivada), sino no escribir eso en el cuerpo.
test('la memoria viva no tiene bullets de cuerpo con fecha entre paréntesis', () => {
  const lineas = readFileSync(join(RAIZ, 'docs', 'CONTEXTO-SESIONES.md'), 'utf8').split('\n')
  const culpables: string[] = []
  let dentroDeEntrada = false
  for (const l of lineas) {
    if (l.startsWith('### ')) { dentroDeEntrada = true; continue }
    if (dentroDeEntrada && l.startsWith('- **') && /\([0-3]?\d\/[01]\d(?:\/20\d\d)?\)/.test(l)) {
      culpables.push(l.slice(0, 90))
    }
  }
  assert.deepEqual(
    culpables, [],
    'Un bullet del CUERPO con la fecha entre paréntesis se lee como cabecera de entrada y se ' +
    'cuela en las novedades del panel. Arreglo: saca la fecha de los paréntesis («el 02/09:» en ' +
    'vez de «(02/09):»), o indenta el bullet si de verdad es un sub-item.',
  )
})

test('sobre la memoria REAL: hay novedades y todas traen fecha', () => {
  const txt = readFileSync(join(RAIZ, 'docs', 'CONTEXTO-SESIONES.md'), 'utf8')
  const n = extraerNovedades(txt)
  assert.ok(n.length > 0, 'no se extrajo ninguna novedad de la memoria real')
  const sinFecha = n.filter(x => !x.fecha)
  assert.equal(sinFecha.length, 0, `novedades sin fecha: ${sinFecha.map(x => x.titulo).join(' · ')}`)
  assert.ok(n.every(x => x.titulo.length > 0), 'hay novedades con título vacío')
})
