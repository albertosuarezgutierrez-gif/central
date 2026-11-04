import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decidirLeadSeguros, consentimientoAseguraVigente, consentimientoTallerVigente, ultimoConsentimiento,
  TEXTOS_CONSENTIMIENTO_ASEGURA, VERSION_TEXTO_ASEGURA_VIGENTE, type Consentimiento,
} from '../src/index.ts'
import { hoy, masDias } from './_util.ts'

const H = hoy()
const T = 'taller-1'
const C = 'cliente-1'
const asegura = (over: Partial<Consentimiento> = {}): Consentimiento => ({
  id: 'k1', tallerId: T, clienteId: C, finalidad: 'asegura', otorgado: true,
  versionTexto: VERSION_TEXTO_ASEGURA_VIGENTE, textoMostrado: TEXTOS_CONSENTIMIENTO_ASEGURA[VERSION_TEXTO_ASEGURA_VIGENTE],
  canal: 'recepcion', otorgadoEn: masDias(H, -10), retiradoEn: null, ...over,
})

test('la versión vigente del texto ASegura está registrada y no está vacía', () => {
  assert.ok(TEXTOS_CONSENTIMIENTO_ASEGURA[VERSION_TEXTO_ASEGURA_VIGENTE]?.includes('Grupo ASegura'))
  assert.ok(Object.isFrozen(TEXTOS_CONSENTIMIENTO_ASEGURA))
})

// 🚨 GUARDIÁN (a): sin consentimiento → NUNCA lead. Visto fallar el 04/11/2026 haciendo que
// `consentimientoAseguraVigente` devolviera permitido con `sin_registro` (ver informe del agente).
test('guardián lead: sin consentimiento registrado, nunca hay lead', () => {
  const d = decidirLeadSeguros({ tallerId: T, clienteId: C, consentimientoId: null }, [], H)
  assert.deepEqual(d, { permitido: false, motivo: 'sin_registro' })
  const d2 = decidirLeadSeguros({ tallerId: T, clienteId: C, consentimientoId: 'k1' }, [], H)
  assert.equal(d2.permitido, false)
})

test('lead permitido con consentimiento vigente y el id correcto', () => {
  const d = decidirLeadSeguros({ tallerId: T, clienteId: C, consentimientoId: 'k1' }, [asegura()], H)
  assert.deepEqual(d, { permitido: true, consentimientoId: 'k1', versionTexto: VERSION_TEXTO_ASEGURA_VIGENTE })
})

test('lead rechazado: id que no es el vigente, casilla sin marcar, retirada', () => {
  assert.deepEqual(decidirLeadSeguros({ tallerId: T, clienteId: C, consentimientoId: 'otro' }, [asegura()], H),
    { permitido: false, motivo: 'consentimiento_no_coincide' })
  assert.deepEqual(decidirLeadSeguros({ tallerId: T, clienteId: C, consentimientoId: 'k1' }, [asegura({ otorgado: false })], H),
    { permitido: false, motivo: 'no_otorgado' })
  assert.deepEqual(decidirLeadSeguros({ tallerId: T, clienteId: C, consentimientoId: 'k1' }, [asegura({ retiradoEn: masDias(H, -1) })], H),
    { permitido: false, motivo: 'retirado' })
})

test('lead rechazado: versión no registrada o texto distinto del registrado', () => {
  assert.equal(consentimientoAseguraVigente([asegura({ versionTexto: 'inventada' })], T, C, H).permitido, false)
  const d = consentimientoAseguraVigente([asegura({ textoMostrado: 'Acepto que me llamen.' })], T, C, H)
  assert.deepEqual(d, { permitido: false, motivo: 'texto_no_coincide' })
  // claves heredadas de Object.prototype no cuentan como versión registrada
  assert.equal(consentimientoAseguraVigente([asegura({ versionTexto: 'toString' })], T, C, H).permitido, false)
})

test('finalidad equivocada, otro cliente u otro taller no valen', () => {
  assert.equal(consentimientoAseguraVigente([asegura({ finalidad: 'taller_comercial' })], T, C, H).permitido, false)
  assert.equal(consentimientoAseguraVigente([asegura({ clienteId: 'otro' })], T, C, H).permitido, false)
  assert.equal(consentimientoAseguraVigente([asegura({ tallerId: 'otro' })], T, C, H).permitido, false)
})

test('manda la fila MÁS RECIENTE; una fila con fecha futura no cuenta', () => {
  const viejo = asegura({ id: 'k0', otorgadoEn: masDias(H, -30), retiradoEn: masDias(H, -20) })
  const nuevo = asegura({ id: 'k2', otorgadoEn: masDias(H, -5) })
  assert.equal(ultimoConsentimiento([nuevo, viejo], T, C, 'asegura', H)?.id, 'k2')
  assert.deepEqual(decidirLeadSeguros({ tallerId: T, clienteId: C, consentimientoId: 'k2' }, [viejo, nuevo], H).permitido, true)
  // dijo que no después de decir que sí
  const no = asegura({ id: 'k3', otorgado: false, otorgadoEn: masDias(H, -1) })
  assert.equal(consentimientoAseguraVigente([nuevo, no], T, C, H).permitido, false)
  // fila futura (reloj desajustado) no consiente
  assert.equal(consentimientoAseguraVigente([asegura({ otorgadoEn: masDias(H, 1) })], T, C, H).permitido, false)
})

test('consentimiento comercial del taller: texto configurable pero debe constar', () => {
  const t = asegura({ finalidad: 'taller_comercial', versionTexto: 'taller-v7', textoMostrado: 'Promos del taller' })
  assert.equal(consentimientoTallerVigente([t], T, C, H).permitido, true)
  assert.equal(consentimientoTallerVigente([{ ...t, textoMostrado: '  ' }], T, C, H).permitido, false)
  // el de ASegura NO sirve para promociones del taller
  assert.equal(consentimientoTallerVigente([asegura()], T, C, H).permitido, false)
})
