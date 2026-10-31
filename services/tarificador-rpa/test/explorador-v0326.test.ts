// Explorador 0.3.26 (31/10/2026, Fidelidade real 24fd7252): «POST a un destino fuera de la lista blanca: …/OPI_ES_Vivienda/ClientData.aspx
// [ruta en la lista, pero con query: claves ?]». Con «?» no se puede decidir si la query es de la simulación: NO se abre nada; el diagnóstico
// nombra claves de framework (`_ts`, `__EVENTTARGET`) y de las ocultas solo su FORMA. Nunca valores ni longitudes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clavesQueryDiagnostico, destinoAvancePermitido } from '../src/guard.ts'

const CD = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/ClientData.aspx'

test('0.3.26 · claves de framework con guion bajo delante se nombran; las ocultas, solo su forma', () => {
  assert.equal(clavesQueryDiagnostico(new URL(`${CD}?_ts=VALOR_SECRETO&__EVENTTARGET=x`)), '_ts,__EVENTTARGET')
  const t = clavesQueryDiagnostico(new URL(`${CD}?12345678&12345678Z=1&=v`))
  assert.equal(t, '?(cifras),?(otra),?(vacía)')
  assert.doesNotMatch(t, /\d|VALOR_SECRETO/)
  assert.equal(clavesQueryDiagnostico(new URL(`${CD}?___x=1`)), '?(otra)', 'tres guiones bajos ya no es nombre de framework')
})

test('0.3.26 · solo diagnóstico: ClientData.aspx con CUALQUIER query sigue fuera de la lista blanca del avance', () => {
  for (const q of ['?_ts=1', '?__EVENTTARGET=x', '?12345678']) assert.equal(destinoAvancePermitido(`${CD}${q}`, [CD]), false)
  assert.equal(destinoAvancePermitido(CD, [CD]), true)
})
