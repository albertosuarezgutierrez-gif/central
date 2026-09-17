import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guardián de la cabecera de la ficha de cliente (08/09/2026). Hasta ese día
// pintaba SIETE botones del mismo peso (subir póliza + seis «Presupuestar <ramo>
// (oportunidad nueva)») más dos avisos sueltos, en tres filas: Alberto, con la
// captura delante, «esto es una guarrería, tantos botones». Los seis ramos son
// una sola acción con parámetro y viven en UN menú. Ni tsc ni el build cazan
// que alguien vuelva a sacarlos a la fila: se vigila leyendo el FUENTE.

const CABECERA = join(import.meta.dirname, '..', 'apps/plataforma/app/(usuario)/correduria/cliente/[id]/Cabecera.tsx')
const fuente = readFileSync(CABECERA, 'utf8')
const acciones = fuente.slice(fuente.indexOf('function Acciones('), fuente.indexOf('// ── Contacto'))

test('la cabecera ofrece los seis ramos dentro de UN menú, no como seis botones', () => {
  assert.equal((acciones.match(/<details/g) ?? []).length, 1, 'un solo menú desplegable')
  assert.equal((acciones.match(/<BtnLink/g) ?? []).length, 1, 'un solo botón suelto: subir póliza')
  assert.doesNotMatch(fuente, /\(oportunidad nueva\)/, 'el rótulo largo de cada ramo no vuelve a la fila')
  for (const url of ['urlAutoNuevo', 'urlHogarNuevo', 'urlMotoNuevo', 'urlVidaNuevo', 'urlSaludNuevo', 'urlDecesosNuevo']) {
    assert.match(fuente, new RegExp(`url: ${url}\\b`), `el menú sigue ofreciendo ${url}`)
  }
})

test('los avisos van pegados a lo que avisan, no sueltos entre botones', () => {
  // vida/salud/decesos llevan su 🚧 en el propio ítem; el aviso de «solo auto» va en el title del botón de subir.
  assert.equal((fuente.match(/sinVerificar: true/g) ?? []).length, 3)
  assert.match(acciones, /title="Hoy el agente lee pólizas de AUTO/)
  assert.doesNotMatch(acciones, /<span style=\{\{ color: 'var\(--muted\)' \}\}/, 'ningún aviso gris suelto en la fila de botones')
})
