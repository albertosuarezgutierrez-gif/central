// Guardián de la copia del contrato de leads.
//
// El desplegable de esta web y el validador de `apps/plataforma` son dos listas
// escritas en dos sitios. Si se separan, el fallo es SILENCIOSO: el visitante
// elige un ramo que plataforma rechaza (422 y lead perdido), o falta un ramo que
// allí ya existe y ese cliente no encuentra su opción. Nada peta, nadie se
// entera. Este test lee el fichero de plataforma y compara.
//
// Se lee el fuente en vez de importarlo a propósito: importar entre apps ataría
// el build de esta web al de plataforma, que es justo lo que no se quiere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TIPOS_SEGURO, ETIQUETA_TIPO, CAMPO_HONEYPOT, MAX_COMENTARIO } from './contrato-lead.ts'

const FUENTE = join(import.meta.dirname, '..', '..', 'plataforma', 'lib', 'leads-web.ts')

function fuentePlataforma(): string {
  return readFileSync(FUENTE, 'utf8')
}

/** Extrae el contenido de un `export const X = [...] as const`. */
function listaDeclarada(src: string, nombre: string): string[] {
  const m = src.match(new RegExp(`export const ${nombre}\\s*=\\s*\\[([^\\]]*)\\]`))
  assert.ok(m, `no se encontró "export const ${nombre} = [...]" en ${FUENTE}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('los ramos del desplegable son EXACTAMENTE los que acepta plataforma', () => {
  const deAlla = listaDeclarada(fuentePlataforma(), 'TIPOS_SEGURO_LEAD')
  assert.deepEqual(
    [...TIPOS_SEGURO],
    deAlla,
    'El desplegable de asegura-web y TIPOS_SEGURO_LEAD de plataforma han divergido. ' +
      'Si el ramo se añadió allí, añádelo aquí (y a ETIQUETA_TIPO). Si se añadió aquí, plataforma lo rechazará con 422.',
  )
})

test('todos los ramos tienen etiqueta visible', () => {
  for (const t of TIPOS_SEGURO) {
    assert.ok(ETIQUETA_TIPO[t]?.trim().length > 0, `sin etiqueta: ${t}`)
  }
  // Al revés también: una etiqueta huérfana es un ramo que se quitó a medias.
  assert.deepEqual(Object.keys(ETIQUETA_TIPO).sort(), [...TIPOS_SEGURO].sort())
})

test('el honeypot y el tope de comentario coinciden con plataforma', () => {
  const src = fuentePlataforma()
  const hp = src.match(/export const CAMPO_HONEYPOT\s*=\s*'([^']+)'/)
  assert.ok(hp, 'no se encontró CAMPO_HONEYPOT en plataforma')
  assert.equal(CAMPO_HONEYPOT, hp[1], 'el honeypot no coincide: el nuestro no frenaría ningún bot')

  const max = src.match(/export const MAX_COMENTARIO\s*=\s*(\d+)/)
  assert.ok(max, 'no se encontró MAX_COMENTARIO en plataforma')
  assert.equal(MAX_COMENTARIO, Number(max[1]), 'el tope del comentario no coincide: se aceptaría texto que allí se rechaza')
})
