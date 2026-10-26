import test from 'node:test'
import assert from 'node:assert/strict'
import { camposSolicitud, NADA_CONOCIDO } from '@central/module-seguros'
import { textoAvisoDatosRiesgo } from './aviso-datos-riesgo.ts'

const BASE = { enlaceFicha: 'https://x/correduria/cliente/1', tercero: false, anotados: 3 }

test('vehículo: resumen sin DNI, sin nacimiento ni matrícula entera; catálogo comprobado; seguro actual con su DGS', () => {
  const t = textoAvisoDatosRiesgo({
    ...BASE, ramo: 'auto', catalogoComprobado: true, companiaDgs: 'C0058',
    respuestas: {
      dni: '12345678Z', fechaNacimiento: '1980-02-01', matricula: '1234BCD', marca: 'Seat', modelo: 'Ibiza <b>', fechaMatriculacion: '2019-05-17',
      versionCatalogoCodigo: 'X1', versionCatalogoVersion: '1.0 TSI', garaje: 'calle', kmAnuales: 12000, aniosSinSiniestros: 0,
      tieneSeguro: true, companiaActual: 'Mapfre', vencimientoActual: '2027-03-01',
    },
  })
  assert.ok(!t.includes('12345678Z') && !t.includes('1980') && !t.includes('1234BCD'))
  assert.match(t, /…BCD/)
  assert.match(t, /Ibiza &lt;b&gt;/)
  assert.match(t, /1\.0 TSI \(comprobada\)/)
  assert.match(t, /años sin partes con culpa: 0/, 'el 0 es un dato')
  assert.match(t, /Mapfre \(C0058\) · vence el 01\/03\/2027/)
  assert.match(t, /3 datos pasados al riesgo/)
})

test('vida: hipoteca vinculada en rojo con el banco y lo pendiente; sin dato = «sin dato», nunca «no»', () => {
  const t = textoAvisoDatosRiesgo({ ...BASE, ramo: 'vida', respuestas: { capitalDeseado: 150000, fumador: null, hipoteca: true, paraBanco: true, entidadHipoteca: 'BBVA', capitalPendienteHipoteca: 90000 } })
  assert.match(t, /🔴 <b>Vinculada a la hipoteca<\/b>: BBVA de beneficiario · pendiente 90\.000,00€/)
  assert.match(t, /fuma: sin dato/)
})

test('salud, mascotas, comercio y un libre: cada uno su línea; lo que queda a preguntar; bloque confirmado', () => {
  assert.match(textoAvisoDatosRiesgo({ ...BASE, ramo: 'salud', respuestas: { personasAsegurar: 3, edades: '45, 43, 12' } }), /Personas: 3 · edades: 45, 43, 12/)
  const m = textoAvisoDatosRiesgo({ ...BASE, ramo: 'mascotas', respuestas: { especieMascota: 'perro', razaMascota: 'Mestizo', ppp: false, microchip: '941000012345678' } })
  assert.match(m, /Perro · Mestizo · nacido: sin dato · PPP: no · microchip: sí/)
  assert.ok(!m.includes('941000012345678'))
  assert.match(textoAvisoDatosRiesgo({ ...BASE, ramo: 'comercio', respuestas: { descripcionRiesgo: 'Bar de tapas' } }), /Actividad: Bar de tapas/)
  const campos = camposSolicitud('responsabilidad_civil', NADA_CONOCIDO)
  const rc = textoAvisoDatosRiesgo({ ...BASE, ramo: 'responsabilidad_civil', campos, confirmado: true, respuestas: { descripcionRiesgo: 'RC de jardinería', tieneSeguro: null, _noLoSe: 'tieneSeguro' } })
  assert.match(rc, /No lo sabe \(a preguntar\)/)
  assert.match(rc, /confirmados: no se han tocado/)
})
