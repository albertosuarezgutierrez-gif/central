// Guardián de la rotación mensual de la memoria (`scripts/rotar-memoria.mjs`).
//
// Lo que protege: QUÉ fecha de una cabecera decide en qué mes se archiva la entrada. Es una
// decisión silenciosa — si se equivoca, la entrada no se pierde pero acaba en el archivo del mes
// que no es, y nadie lo nota hasta que busca algo y no está donde debería.
//
// Las dos convenciones de cabecera del archivo ponen la fecha de la entrada ENTRE PARÉNTESIS, y
// el título puede citar otras fechas fuera de ellos. Ni «la primera» ni «la última» sirven para
// las dos: cada una rompe un caso real, y los dos casos están fijados aquí.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trocear, clasificar, esInicioEntrada } from '../scripts/rotar-memoria.mjs'

const entrada = (cabecera: string, ...cuerpo: string[]) => [cabecera, ...cuerpo]

test('una cabecera `###` se archiva por su fecha entre paréntesis, no por la que cita el título', () => {
  // Caso real (01/09/2026): esta entrada acababa en `docs/memoria/2026-08.md` porque `31/08`
  // aparece después de la fecha buena.
  const e = entrada(
    '### 🔴 (01/09/2026) `GH_PAT_TRIGGER` caducado: la radiografía lleva desde el 31/08 sin actualizarse',
    'cuerpo',
  )
  const { vivas, porMes } = clasificar([e], '2026-09')
  assert.equal(vivas.length, 1, 'es del mes vivo: no se archiva')
  assert.equal(porMes.size, 0)
})

test('un RANGO de días en el título no arrastra la entrada a otro mes (ni a otro año)', () => {
  // Caso real, encontrado al arreglar el anterior: con «la última fecha» esta entrada se archivaba
  // en `docs/memoria/2025-10.md` — `25/10` es la última coincidencia, sin año, y el rotador le
  // heredaba 2025. No es una fecha: es la mitad de un rango de noches de una reserva.
  const e = entrada('### 💶 (15/08/2026) Reserva Luxury 22-25/10 a 430€: el canal se comió el 29,4%', 'x')
  const { porMes } = clasificar([e], '2026-09')
  assert.deepEqual([...porMes.keys()], ['2026-08'])
})

test('una cabecera `- **` se archiva por la fecha del final, aunque el título cite otra antes', () => {
  // El caso inverso, que es por el que se dejó de usar «la primera».
  const e = entrada('- **Radar de subastas: sin novedades desde el 30/07 (06/08/2026).**', '  cuerpo')
  const { vivas, porMes } = clasificar([e], '2026-09')
  assert.equal(vivas.length, 0)
  assert.deepEqual([...porMes.keys()], ['2026-08'])
})

test('la entrada del mes vivo se queda y la del mes cerrado se archiva', () => {
  const viva = entrada('### 🧭 (01/09/2026) algo de septiembre', 'x')
  const vieja = entrada('### 🗂️ (14/08/2026) algo de agosto', 'y')
  const { vivas, porMes } = clasificar([viva, vieja], '2026-09')
  assert.deepEqual(vivas, [viva])
  assert.deepEqual(porMes.get('2026-08'), [vieja])
})

test('una entrada sin fecha hereda el mes de la de arriba, no se queda viva por defecto', () => {
  const conFecha = entrada('### 🗂️ (14/08/2026) con fecha', 'x')
  const sinFecha = entrada('### 🤷 sin ninguna fecha en la cabecera', 'y')
  const { vivas, porMes } = clasificar([conFecha, sinFecha], '2026-09')
  assert.equal(vivas.length, 0)
  assert.deepEqual(porMes.get('2026-08'), [conFecha, sinFecha])
})

test('solo `- **` y `### ` abren entrada: una cabecera `## ` se funde con la anterior', () => {
  assert.equal(esInicioEntrada('### 🧭 (01/09/2026) x'), true)
  assert.equal(esInicioEntrada('- **algo (01/09/2026).**'), true)
  assert.equal(esInicioEntrada('## 🧭 (01/09/2026) x'), false)
  // Y por eso trocear la trata como cuerpo de la entrada de arriba.
  const troceadas = trocear(['### 🧭 (01/09/2026) buena', 'cuerpo', '## 🧭 (01/09/2026) mal formada', 'mas cuerpo'])
  assert.equal(troceadas.length, 1)
  assert.equal(troceadas[0].length, 4)
})
