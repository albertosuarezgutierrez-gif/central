import test from 'node:test'
import assert from 'node:assert/strict'
import { leerCorreoEventoAseguradora } from './evento-correo-aseguradora.ts'

// Regularización de RC de Occident (03/11/2026): subtipo, periodo normalizado, fecha de envío y 2º aviso.
// Textos inventados con el formato real.

const CLIENTES = 'clientes@occidentinforma.com'
const MEDIADORES = 'mediadores@occidentinforma.com'
const ASUNTO_REG = 'OBRAS INVENTADAS SL, Regularización responsabilidad civil'
const ASUNTO_SUS = 'Suscripción RC.constr. - Póliza BIDS000002 - OBRAS INVENTADAS SL'

const cuerpoReg = (periodo: string, insiste: boolean) =>
  `| Ref. póliza de Responsabilidad Civil nº BIDS000002 Tomador: OBRAS INVENTADAS SL ${periodo} | Apreciado colaborador: | ` +
  (insiste ? 'le comunicamos que nos dirigimos nuevamente al Asegurado y le volvemos a insistir en la necesidad de facilitarnos dicha información. |'
    : 'nos dirigimos al Asegurado para solicitarle los datos de facturación. |')
const cuerpoSus = (envio: string, periodo: string) =>
  `| Contrato: M00000-Nombre Mediador Aviso Recordatorio Regularización ${envio} carta de recordatorio al mediador, indicándole que no han ingresado suplemento de regularización comunicando el dato real de facturación. ${periodo} |`

function sup(remitente: string, asunto: string, cuerpoTexto: string) {
  const e = leerCorreoEventoAseguradora({ remitente, asunto, cuerpoTexto })
  assert.ok(e && e.tipo === 'suplemento')
  return e
}

test('clientes@ con periodo: subtipo, periodo en meses y 1er aviso (no recordatorio)', () => {
  const e = sup(CLIENTES, ASUNTO_REG, cuerpoReg('Período de regularización: 6/2025 a 6/2026', false))
  assert.equal(e.subtipo, 'regularizacion_rc')
  assert.equal(e.periodo, '2025-06_2026-06')
  assert.equal(e.esRecordatorio, false)
  assert.equal(e.fechaEnvioCompania, null)
  assert.equal(e.ilegibles, 0)
})

test('clientes@ «volvemos a insistir»: esRecordatorio', () => {
  const e = sup(CLIENTES, ASUNTO_REG, cuerpoReg('Período de regularización: 6/2025 a 6/2026', true))
  assert.equal(e.esRecordatorio, true)
})

test('clientes@ sin periodo: periodo null y 1 ilegible (se dice), sigue siendo regularización', () => {
  const e = sup(CLIENTES, ASUNTO_REG, cuerpoReg('', false))
  assert.equal(e.subtipo, 'regularizacion_rc')
  assert.equal(e.periodo, null)
  assert.equal(e.ilegibles, 1)
})

test('Suscripción RC.constr. con fecha de envío y periodo: mismo periodo normalizado que clientes@', () => {
  const e = sup(MEDIADORES, ASUNTO_SUS, cuerpoSus('Enviada en fecha 02.10.2026', 'Periodo: 18.06.2025 a 18.06.2026.'))
  assert.equal(e.subtipo, 'regularizacion_rc')
  assert.equal(e.esRecordatorio, true)
  assert.equal(e.fechaEnvioCompania, '2026-10-02')
  assert.equal(e.periodo, '2025-06_2026-06')
  assert.equal(e.periodoHasta, '2026-06-18')
  assert.equal(e.ilegibles, 0)
})

test('Suscripción RC.constr. sin fecha de envío ni periodo: nulls, nunca inventados', () => {
  const e = sup(MEDIADORES, ASUNTO_SUS, cuerpoSus('', ''))
  assert.equal(e.esRecordatorio, true)
  assert.equal(e.fechaEnvioCompania, null)
  assert.equal(e.periodo, null)
  assert.equal(e.ilegibles, 1)
})

test('Suscripción sin las frases del recordatorio: suplemento genérico, sin subtipo', () => {
  const e = sup(MEDIADORES, ASUNTO_SUS, 'Otro aviso cualquiera. Periodo: 18.06.2025 a 18.06.2026.')
  assert.equal(e.subtipo, undefined)
  assert.equal(e.esRecordatorio, undefined)
})
