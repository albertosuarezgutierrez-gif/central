// 🔢 Guardián de la numeración de `docs/RUTINAS-PROGRAMADAS.md`.
//
// El número de una ficha es un IDENTIFICADOR ESTABLE: se cita desde la memoria, desde
// `CLAUDE.md` y desde los specs. Dos PRs en vuelo que eligen a la vez «el siguiente número»
// producen una colisión que NO rompe nada visible — el doc se lee igual de bien — y por eso
// nadie la ve. Ha pasado dos veces:
//
//   · 07/2026 · `agentes-entrenador` (#716) y `Triaje de correo` (#718), ambos «10».
//   · 22/08/2026 · `conectores-vigia` (#1581) y `radar-espana` (#1591), ambos «16», mergeados
//     con SEIS MINUTOS de diferencia.
//
// Un número duplicado convierte «ver punto 10» en una referencia que apunta a dos sitios, y el
// lector se queda con el que encuentre primero. Es el fallo de siempre: no falta el dato, es que
// se lee mal — y sale plausible.
//
// Este guardián NO exige orden secuencial ni ausencia de huecos: renumerar una ficha vieja para
// «dejarlo bonito» es justo lo que rompería las referencias de fuera. Solo exige que cada número
// identifique a UNA ficha, y que las referencias internas «ver punto N» apunten a algo que existe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = 'docs/RUTINAS-PROGRAMADAS.md'

/** Los sufijos (`8-bis`, `12-bis`) son variantes deliberadas: cuentan como identificador propio. */
function fichas(): { id: string; titulo: string }[] {
  const texto = readFileSync(join(ROOT, DOC), 'utf8')
  const encontradas: { id: string; titulo: string }[] = []
  for (const linea of texto.split('\n')) {
    const m = /^### (\d+(?:-[a-z]+)?)\.\s+(.*)$/.exec(linea)
    if (m) encontradas.push({ id: m[1], titulo: m[2] })
  }
  return encontradas
}

test('el doc de rutinas tiene fichas numeradas (si no, el resto del guardián no prueba nada)', () => {
  const encontradas = fichas()
  assert.ok(
    encontradas.length >= 15,
    `solo ${encontradas.length} fichas en ${DOC} — ¿ha cambiado el formato de los encabezados?`,
  )
})

test('ningún número de ficha identifica a dos rutinas distintas', () => {
  const porId = new Map<string, string[]>()
  for (const { id, titulo } of fichas()) {
    porId.set(id, [...(porId.get(id) ?? []), titulo])
  }

  const colisiones = [...porId.entries()].filter(([, titulos]) => titulos.length > 1)
  assert.deepEqual(
    colisiones.map(([id, titulos]) => `${id} → ${titulos.join(' / ')}`),
    [],
    'dos fichas comparten número. La que se mergeó ANTES se queda con él; la otra coge uno libre. ' +
      'No renumeres las viejas: sus números se citan desde fuera del doc.',
  )
})

test('las referencias internas «ver punto N» apuntan a una ficha que existe', () => {
  const texto = readFileSync(join(ROOT, DOC), 'utf8')
  const ids = new Set(fichas().map((f) => f.id))

  const rotas: string[] = []
  for (const m of texto.matchAll(/ver punto (\d+(?:-[a-z]+)?)/g)) {
    if (!ids.has(m[1])) rotas.push(m[1])
  }

  assert.deepEqual(
    rotas,
    [],
    `«ver punto N» apunta a fichas inexistentes: ${rotas.join(', ')}. ` +
      'Si renumeraste una ficha, actualiza también quien la cita.',
  )
})
