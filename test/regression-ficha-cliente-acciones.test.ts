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
//
// 🔀 Desde el 20/09/2026 la LISTA de los seis ramos (`RAMOS_PRESUPUESTO`) vive
// en `lib/ficha-asegura.ts`, no aquí: `NuevoCliente.tsx` (alta de un lead) la
// necesita igual para saltar directo al presupuesto del ramo elegido, y con
// dos copias un ramo añadido a una y olvidado en la otra ofrece una opción que
// la pantalla hermana no conoce. La cabecera sigue siendo quien la CONSUME
// dentro de un único menú — eso es lo que este guardián sigue vigilando.

const CABECERA = join(import.meta.dirname, '..', 'apps/plataforma/app/(usuario)/correduria/cliente/[id]/Cabecera.tsx')
const FICHA_ASEGURA = join(import.meta.dirname, '..', 'apps/plataforma/lib/ficha-asegura.ts')
const fuente = readFileSync(CABECERA, 'utf8')
const fuenteRamos = readFileSync(FICHA_ASEGURA, 'utf8')
const acciones = fuente.slice(fuente.indexOf('function Acciones('), fuente.indexOf('// ── Contacto'))

test('la cabecera ofrece los seis ramos dentro de UN menú, no como seis botones', () => {
  assert.equal((acciones.match(/<details/g) ?? []).length, 1, 'un solo menú desplegable')
  assert.equal((acciones.match(/<BtnLink/g) ?? []).length, 1, 'un solo botón suelto: subir póliza')
  assert.doesNotMatch(fuente, /\(oportunidad nueva\)/, 'el rótulo largo de cada ramo no vuelve a la fila')
  assert.match(acciones, /RAMOS_PRESUPUESTO\.map/, 'el menú sigue construyéndose desde la lista compartida')
  for (const url of ['urlAutoNuevo', 'urlHogarNuevo', 'urlMotoNuevo', 'urlVidaNuevo', 'urlSaludNuevo', 'urlDecesosNuevo']) {
    assert.match(fuenteRamos, new RegExp(`url: ${url}\\b`), `la lista compartida sigue ofreciendo ${url}`)
  }
})

test('los avisos van pegados a lo que avisan, no sueltos entre botones', () => {
  // salud lleva su 🚧 en el propio ítem (vida/decesos ya tienen dato vivo de CIMA, 20/09/2026);
  // el aviso de «solo auto» va en el title del botón de subir.
  assert.equal((fuenteRamos.match(/sinVerificar: true/g) ?? []).length, 1)
  assert.match(acciones, /title="Hoy el agente lee pólizas de AUTO/)
  assert.doesNotMatch(acciones, /<span style=\{\{ color: 'var\(--muted\)' \}\}/, 'ningún aviso gris suelto en la fila de botones')
})
