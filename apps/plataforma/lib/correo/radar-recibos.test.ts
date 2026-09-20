import test from 'node:test'
import assert from 'node:assert/strict'

import { dominioDe, radarRecibos } from './radar-recibos.ts'

test('dominioDe: extrae el dominio de una dirección, vacío si no hay @', () => {
  assert.equal(dominioDe('mediadores@occidentinforma.com'), 'occidentinforma.com')
  assert.equal(dominioDe('sin arroba'), '')
  assert.equal(dominioDe(''), '')
})

test('radarRecibos: marca visto=true solo para las compañías con un remitente real', () => {
  const r = radarRecibos(['mediadores@occidentinforma.com', 'avisos@allianz.es'])
  const porEtiqueta = Object.fromEntries(r.map((x) => [x.etiqueta, x.visto]))
  assert.equal(porEtiqueta['Occident'], true)
  assert.equal(porEtiqueta['allianz.es'], true)
  assert.equal(porEtiqueta['mapfre.com'], false)
  assert.equal(porEtiqueta['reale.es'], false)
})

test('🚨 sin ningún remitente visto, TODAS quedan sin ver — nunca se asume visto', () => {
  const r = radarRecibos([])
  assert.ok(r.every((x) => x.visto === false))
  assert.ok(r.length > 0)
})

test('radarRecibos: un subdominio del dominio conocido también cuenta como visto', () => {
  const r = radarRecibos(['aviso@notificaciones.mapfre.com'])
  assert.equal(r.find((x) => x.etiqueta === 'mapfre.com')?.visto, true)
})

test('🚨 un dominio que solo CONTIENE el nombre como texto no cuenta — tiene que ser el dominio o un subdominio real', () => {
  // 'notoccidentinforma.com' lleva 'occidentinforma.com' como subcadena, pero
  // NO es ese dominio ni un subdominio suyo (le falta el punto delante).
  const r = radarRecibos(['aviso@notoccidentinforma.com'])
  assert.equal(r.find((x) => x.etiqueta === 'Occident')?.visto, false)
})

// ── El agrupado por compañía (20/09/2026) ────────────────────────────────────

test('🚨 Occident cuenta como VISTA si avisa por CUALQUIERA de sus cuatro dominios, no solo por el que se vio', () => {
  const r = radarRecibos(['recibo@newsoccident.com'])
  const occident = r.find((x) => x.etiqueta === 'Occident')
  assert.equal(occident?.visto, true)
  assert.deepEqual(
    [...occident!.dominios].sort(),
    ['comunicacionesoccident.com', 'newsoccident.com', 'occident.com', 'occidentinforma.com'].sort(),
  )
})

test('🚨 Generali cuenta como VISTA si avisa por cualquiera de sus dos dominios', () => {
  const r = radarRecibos(['recibo@tugenerali.es'])
  assert.equal(r.find((x) => x.etiqueta === 'Generali')?.visto, true)
})

test('las compañías agrupadas salen UNA sola vez en la lista, no una por dominio', () => {
  const r = radarRecibos([])
  assert.equal(r.filter((x) => x.etiqueta === 'Occident').length, 1)
  assert.equal(r.filter((x) => x.etiqueta === 'Generali').length, 1)
})
