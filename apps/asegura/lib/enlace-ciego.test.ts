import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACTOR_ENLACE_WEB, enlaceACiegas, politicaDocEnlace, NOTA_DOC_PENDIENTE_REVISION } from './enlace-ciego.ts'

test('enlace del formulario web: sin contraseñas de la ficha, sin oportunidades, documento para revisión', () => {
  assert.equal(ACTOR_ENLACE_WEB, 'web')
  assert.deepEqual(politicaDocEnlace('web'), { probarContrasenasFicha: false, abrirOportunidad: false, notaRevision: NOTA_DOC_PENDIENTE_REVISION })
  assert.deepEqual(politicaDocEnlace('alberto@x.es'), { probarContrasenasFicha: true, abrirOportunidad: true, notaRevision: null })
  assert.equal(enlaceACiegas(null), false)
})

test('subirDocumentoSolicitud aplica la política: contraseñas y oportunidad SOLO si no es a ciegas; nota de revisión', () => {
  const src = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')
  const f = src.slice(src.indexOf('export async function subirDocumentoSolicitud'), src.indexOf('export async function responderSolicitud'))
  assert.match(f, /const politica = politicaDocEnlace\(f\.creadaPor\)/)
  // `contrasenasDeLaFicha` solo dentro de la rama que la política permite.
  assert.match(f, /politica\.probarContrasenasFicha \? \{ contrasenas: \(\) => contrasenasDeLaFicha\(/)
  assert.equal(f.split('contrasenasDeLaFicha(').length - 1, 1)
  assert.match(f, /if \(politica\.abrirOportunidad && \(leido\.tipo === 'poliza'/)
  assert.ok(f.indexOf('politica.abrirOportunidad') < f.indexOf('oportunidadDesdeFichero('))
  assert.match(f, /politica\.notaRevision \?/)
})
