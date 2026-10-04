import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Vida, salud y decesos: lo que la PANTALLA manda en `resueltos` tiene que ser lo que el SERVIDOR (asegura)
// lee, y lo que no viaja no se pide como si viajara. Se leen los dos fuentes, como `retarificar-asegura-oferta.test.ts`.
const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const base = '../app/(usuario)/correduria/cliente/[id]'
const pantalla = {
  vida: leer(`${base}/vida-nuevo/VidaNuevo.tsx`),
  salud: leer(`${base}/salud-nuevo/SaludNuevo.tsx`),
  decesos: leer(`${base}/decesos-nuevo/DecesosNuevo.tsx`),
}
const servidor = leer('../../asegura/lib/retarificar-cartera.ts')

/** El cuerpo de `prepararRetarificacionNueva<Ramo>` en asegura. */
function bloqueServidor(Ramo: 'Vida' | 'Salud' | 'Decesos'): string {
  const i = servidor.indexOf(`export function prepararRetarificacionNueva${Ramo}`)
  assert.ok(i > 0, `no se encuentra prepararRetarificacionNueva${Ramo}`)
  const j = servidor.indexOf('\nexport ', i + 10)
  return servidor.slice(i, j === -1 ? undefined : j)
}

test('vida: profesion y fumador viajan desde la pantalla y el servidor los lee; la duración ya no se pide', () => {
  const srv = bloqueServidor('Vida')
  for (const k of ['profesion', 'fumador']) {
    assert.match(pantalla.vida, new RegExp(`\\b${k}\\b[^\\n]*(trim\\(\\)|===)`), `la pantalla manda ${k}`)
    assert.match(srv, new RegExp(`resueltos\\?\\.${k}\\b`), `el servidor lee ${k}`)
  }
  assert.doesNotMatch(pantalla.vida, /setDuracionAnios|Duración \(años\)/, 'la duración no viaja: no se pide')
  assert.doesNotMatch(pantalla.vida, /duracionAnios: Number/)
})

test('salud y decesos: los asegurados adicionales viajan en resueltos.asegurados y el servidor los lee', () => {
  for (const r of ['salud', 'decesos'] as const) {
    assert.match(pantalla[r], /asegurados: aseguradosParaEnviar\(asegurados\)/, r)
    assert.match(pantalla[r], /<AseguradosAdicionales /, r)
    assert.match(bloqueServidor(r === 'salud' ? 'Salud' : 'Decesos'), /asegurados: leerAseguradosAdicionales\(entrada\.cuerpo\.resueltos\?\.asegurados\)/, r)
  }
})

test('lo que NO viaja se rotula como nota: capital/modalidad de salud y prestación de decesos', () => {
  assert.match(pantalla.salud, /Nota: importe de referencia[^"]*no viaja/)
  assert.match(pantalla.salud, /Nota: modalidad deseada[^"]*no viaja/)
  assert.match(pantalla.decesos, /Nota: prestación de referencia[^"]*no viaja/)
})

test('un hueco que la pantalla no sabe resolver bloquea el botón (no se paga un 400 evitable)', () => {
  for (const r of ['vida', 'salud', 'decesos'] as const) {
    assert.match(pantalla[r], /const faltaAlgo = [^\n]*huerfanos\.length > 0/, r)
  }
})
