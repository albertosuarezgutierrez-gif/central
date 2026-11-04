import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decidirAviso, estadoVencimiento, diasEntre, canalesAviso, esAvisoComercial, configDeAlta,
  TEXTOS_CONSENTIMIENTO_ASEGURA, VERSION_TEXTO_ASEGURA_VIGENTE,
  type EntradaAviso, type Consentimiento, type IntervalosAvisos,
} from '../src/index.ts'
import { hoy, masDias } from './_util.ts'

const H = hoy()
// Intervalos ARBITRARIOS del test (no los de alta): demuestra que salen de configuración.
const I: IntervalosAvisos = { itvAntelacionDias: 15, revisionFechaAntelacionDias: 7, revisionKmAntelacion: 500, seguroAntelacionDias: 20, recordatorioCitaHoras: 12 }

const entrada = (over: Partial<EntradaAviso> = {}): EntradaAviso => ({
  tipo: 'itv', tallerId: 'T', clienteId: 'C',
  cliente: { appInstalada: true, correo: 'cliente@example.com' },
  vehiculo: { itvHasta: null, seguroHasta: null, proximaRevisionFecha: null, proximaRevisionKm: null, kmEstimados: null },
  consentimientos: [], intervalos: I, hoy: H, ...over,
})
const asegura: Consentimiento = {
  id: 'k1', tallerId: 'T', clienteId: 'C', finalidad: 'asegura', otorgado: true,
  versionTexto: VERSION_TEXTO_ASEGURA_VIGENTE, textoMostrado: TEXTOS_CONSENTIMIENTO_ASEGURA[VERSION_TEXTO_ASEGURA_VIGENTE],
  canal: 'recepcion', otorgadoEn: masDias(H, -3), retiradoEn: null,
}

test('estadoVencimiento: null = desconocido, NUNCA vigente', () => {
  assert.equal(estadoVencimiento(null, H, 15), 'desconocido')
  assert.equal(estadoVencimiento(masDias(H, 40), H, 15), 'vigente')
  assert.equal(estadoVencimiento(masDias(H, 15), H, 15), 'proximo')
  assert.equal(estadoVencimiento(H, H, 15), 'proximo')
  assert.equal(estadoVencimiento(masDias(H, -1), H, 15), 'vencido')
  assert.equal(diasEntre(H, masDias(H, 3)), 3)
})

test('fecha desconocida no dispara aviso', () => {
  for (const tipo of ['itv', 'revision_fecha', 'seguro'] as const) {
    assert.deepEqual(decidirAviso(entrada({ tipo, consentimientos: [asegura] })), { enviar: false, motivo: 'fecha_desconocida' })
  }
  assert.deepEqual(decidirAviso(entrada({ tipo: 'revision_km' })), { enviar: false, motivo: 'km_desconocidos' })
})

test('ITV: la antelación sale de la configuración', () => {
  const v = { ...entrada().vehiculo, itvHasta: masDias(H, 10) }
  assert.equal(decidirAviso(entrada({ vehiculo: v })).enviar, true)
  assert.deepEqual(decidirAviso(entrada({ vehiculo: v, intervalos: { ...I, itvAntelacionDias: 5 } })), { enviar: false, motivo: 'aun_no_toca' })
})

test('aviso de servicio no exige consentimiento comercial', () => {
  const d = decidirAviso(entrada({ tipo: 'itv', vehiculo: { ...entrada().vehiculo, itvHasta: masDias(H, 2) } }))
  assert.deepEqual(d, { enviar: true, canales: ['push', 'correo'], comercial: false, consentimientoId: null })
  assert.equal(decidirAviso(entrada({ tipo: 'terminado' })).enviar, true)
  assert.equal(esAvisoComercial('terminado'), false)
})

test('revisión por km: con km estimados dentro de la antelación', () => {
  const v = { ...entrada().vehiculo, proximaRevisionKm: 60000, kmEstimados: 59600 }
  assert.equal(decidirAviso(entrada({ tipo: 'revision_km', vehiculo: v })).enviar, true)
  assert.equal(decidirAviso(entrada({ tipo: 'revision_km', vehiculo: { ...v, kmEstimados: 50000 } })).enviar, false)
})

test('aviso comercial de seguro exige consentimiento ASegura vigente', () => {
  const v = { ...entrada().vehiculo, seguroHasta: masDias(H, 5) }
  assert.deepEqual(decidirAviso(entrada({ tipo: 'seguro', vehiculo: v })), { enviar: false, motivo: 'sin_registro' })
  const ok = decidirAviso(entrada({ tipo: 'seguro', vehiculo: v, consentimientos: [asegura] }))
  assert.deepEqual(ok, { enviar: true, canales: ['push', 'correo'], comercial: true, consentimientoId: 'k1' })
  const retirado = decidirAviso(entrada({ tipo: 'seguro', vehiculo: v, consentimientos: [{ ...asegura, retiradoEn: H }] }))
  assert.deepEqual(retirado, { enviar: false, motivo: 'retirado' })
})

test('promoción del taller exige SU consentimiento (el de ASegura no vale)', () => {
  assert.equal(decidirAviso(entrada({ tipo: 'promocion', consentimientos: [asegura] })).enviar, false)
  const t: Consentimiento = { ...asegura, id: 't1', finalidad: 'taller_comercial', versionTexto: 'v1', textoMostrado: 'Promos' }
  assert.equal(decidirAviso(entrada({ tipo: 'promocion', consentimientos: [t] })).enviar, true)
})

test('canales: con app push + correo; sin app solo correo; sin nada no se envía', () => {
  assert.deepEqual(canalesAviso({ appInstalada: true, correo: 'a@b.es' }), ['push', 'correo'])
  assert.deepEqual(canalesAviso({ appInstalada: false, correo: 'a@b.es' }), ['correo'])
  assert.deepEqual(decidirAviso(entrada({ tipo: 'terminado', cliente: { appInstalada: false, correo: ' ' } })), { enviar: false, motivo: 'sin_canal' })
})

test('los intervalos de alta existen y son enteros', () => {
  for (const v of Object.values(configDeAlta().intervalosAvisos)) assert.ok(Number.isInteger(v) && v >= 0)
})
