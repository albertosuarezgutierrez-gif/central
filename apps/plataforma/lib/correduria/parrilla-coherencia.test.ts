// Coherencia de la parrilla y del panel de emisión, con los textos REALES del proyecto 40975463.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { avisosCompania, cambioDePrecio, comunesParrilla, partirSinLeer, tipoFallo, titularFallo } from './parrilla-coherencia.ts'

test('partirSinLeer: garantías null (aún sin leer) van aparte; un objeto es leída', () => {
  const r = partirSinLeer([
    { id: 'mapfre', garantias: null },
    { id: 'reale', garantias: { version: 4, porClave: {} } },
  ])
  assert.deepEqual(r.sinLeer.map((x) => x.id), ['mapfre'])
  assert.deepEqual(r.leidas.map((x) => x.id), ['reale'])
})

test('comunesParrilla: lo igual en todas se dice una vez; si difiere, en cada fila', () => {
  assert.deepEqual(comunesParrilla([{ franquiciaEur: null, firmeza: 'estimado' }, { franquiciaEur: null, firmeza: 'estimado' }]), {
    franquiciaNoDeclaradaEnTodas: true,
    firmezaComun: 'estimado',
  })
  assert.deepEqual(comunesParrilla([{ franquiciaEur: 300, firmeza: 'estimado' }, { franquiciaEur: null, firmeza: 'firme' }]), {
    franquiciaNoDeclaradaEnTodas: false,
    firmezaComun: null,
  })
  // Sin filas no se afirma nada.
  assert.deepEqual(comunesParrilla([]), { franquiciaNoDeclaradaEnTodas: false, firmezaComun: null })
})

test('avisosCompania: Reale y Mapfre piden revisión; el bloqueo no se repite', () => {
  const reale = avisosCompania([
    'Observaciones de la compañía: Riesgo condicionado',
    'PENDIENTE REALIZAR CONSULTA SINCO',
  ])
  assert.equal(reale.revision, true)
  assert.deepEqual(reale.textos, ['Riesgo condicionado', 'PENDIENTE REALIZAR CONSULTA SINCO'])
  assert.equal(avisosCompania(['Para este riesgo se requiere aceptación del riesgo por parte de la compañía (217)']).revision, true)
  const bloqueo = avisosCompania(['La póliza quedará BLOQUEADA hasta recibir la documentación'])
  assert.deepEqual(bloqueo, { revision: false, textos: [] })
  // Occident sin avisos, y un null (no se sabe) no se inventa ninguno.
  assert.deepEqual(avisosCompania([]), { revision: false, textos: [] })
  assert.deepEqual(avisosCompania(null), { revision: false, textos: [] })
  assert.equal(avisosCompania(['Precio válido 30 días']).revision, false)
})

test('tipoFallo: el fallo técnico de Avant2 no es un rechazo; «vehículo no permitido» sí', () => {
  assert.equal(tipoFallo('Error: Se ha producido un error en el envío (Código 2115). Por favor contacte con el departamento de soporte de Avant2.'), 'tecnico')
  assert.equal(tipoFallo('Error: Vehículo no permitido.'), 'rechazo')
  assert.equal(tipoFallo('La matrícula ya está asegurada en la compañía'), 'otro')
  assert.equal(tipoFallo(null), 'otro')
  // 30/09/2026: una negativa de la compañía no se rotula «fallo técnico» (invitaría a pagar otra vez).
  assert.notEqual(tipoFallo('Producto no disponible en esta provincia'), 'tecnico')
  assert.equal(tipoFallo('Error interno: riesgo no asegurable'), 'rechazo')
  assert.match(titularFallo('tecnico'), /no es un rechazo/)
  assert.notEqual(titularFallo('tecnico'), titularFallo('rechazo'))
})

test('cambioDePrecio: se avisa y se emite con el confirmado; sin cambio o sin dato, nada', () => {
  const t = cambioDePrecio(358.36, 361.2)
  assert.ok(t)
  assert.match(t as string, /361,20€/)
  assert.match(t as string, /358,36€/)
  assert.match(t as string, /\+2,84€/)
  assert.equal(cambioDePrecio(358.36, 358.36), null)
  assert.equal(cambioDePrecio(358.36, 358.364), null)
  assert.equal(cambioDePrecio(null, 361.2), null)
  assert.equal(cambioDePrecio(358.36, null), null)
  assert.match(cambioDePrecio(400, 390) as string, /-10,00€/)
})
