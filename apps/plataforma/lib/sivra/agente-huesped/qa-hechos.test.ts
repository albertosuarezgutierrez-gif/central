// Guardián: el CONTROL DE CALIDAD tiene que ver los hechos que Alberto enseña.
//
// `debeEscalar` (en `decidir.ts`) recibía solo `ctx.ficha` y `ctx.guia`. El redactor sí veía
// `ctx.hechos`, pero el que JUZGA no — así que respondía ESCALAR («la INFORMACIÓN no cubre la
// pregunta») por muchas veces que se le hubiera enseñado el asunto, y ese veredicto es justo el que
// enciende el aviso «❓ Esto no lo encuentro en la guía». Desde fuera se veía como que el agente no
// aprendía nunca (queja de Alberto, 02/09/2026, con el phishing por WhatsApp enseñado tres veces).
//
// El prompt es un `template literal`: quitar la interpolación de los hechos no rompe ni `tsc` ni el
// build, y el fallo vuelve a ser invisible. Por eso este test lee el FUENTE.
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const FUENTE = new URL('./decidir.ts', import.meta.url)

// Recorta el cuerpo de `debeEscalar` (de su firma a la llave de cierre de la función).
function cuerpoDebeEscalar(): string {
  const src = readFileSync(FUENTE, 'utf8')
  const ini = src.indexOf('async function debeEscalar(')
  assert.notEqual(ini, -1, 'no encuentro debeEscalar en decidir.ts')
  const fin = src.indexOf('\n}', ini)
  assert.notEqual(fin, -1, 'no encuentro el final de debeEscalar')
  return src.slice(ini, fin)
}

test('el control de calidad recibe los HECHOS del piso, no solo ficha y guía', () => {
  const cuerpo = cuerpoDebeEscalar()
  assert.ok(/ctx\.hechos/.test(cuerpo), 'debeEscalar no lee ctx.hechos: lo aprendido le será invisible')
  assert.ok(/INFORMACIÓN:/.test(cuerpo), 'el bloque INFORMACIÓN del prompt cambió de nombre — revisa este guardián')
})

test('los hechos van DENTRO del bloque INFORMACIÓN, que es lo que el prompt manda evaluar', () => {
  const cuerpo = cuerpoDebeEscalar()
  const info = cuerpo.indexOf('INFORMACIÓN:')
  const hechos = cuerpo.lastIndexOf('ctx.hechos')
  // Los hechos se preparan antes del literal y se interpolan después de la etiqueta.
  assert.ok(hechos < info || cuerpo.slice(info).includes('hechosQA'),
    'los hechos no llegan al bloque INFORMACIÓN del prompt de calidad')
})
