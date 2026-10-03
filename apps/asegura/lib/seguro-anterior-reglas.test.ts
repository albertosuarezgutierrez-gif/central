import test from 'node:test'
import assert from 'node:assert/strict'
import { bonusSupuestoFinal, carnetMasAntiguo, imputarConLectura as imputarSeguroAnterior, type LecturaCandidatas } from './seguro-anterior-reglas.ts'
import type { CandidataSeguroAnterior } from '@central/module-seguros'

const HOY = '2026-10-03'
const C1 = '11111111-1111-1111-1111-111111111111'
const COR = '99999999-9999-9999-9999-999999999999'

const cand = (x: Partial<CandidataSeguroAnterior> & { id: string }): CandidataSeguroAnterior => ({
  origen: 'cartera', clienteId: C1, tipoVehiculo: 'turismo', compania: 'MAPFRE',
  seguro: { codigoDgs: 'C0058', fechaEfecto: null, aniosSinSiniestros: null, siniestrosUltimos5: null, numeroPoliza: '5000000001' },
  ...x,
})
// Forma del caso real (sintético): coche financiado de 2023 y moto de 2026, misma compañía.
const COCHE = cand({ id: 'poliza:coche', siniestrosAnotados: 0, seguro: { codigoDgs: 'C0058', fechaEfecto: '2023-10-10', aniosSinSiniestros: null, siniestrosUltimos5: null, numeroPoliza: '5000000001', matricula: '0000AAA', canal: 'FINANCIERA X', cesionDerechos: true } })
const MOTO = cand({ id: 'poliza:moto', tipoVehiculo: 'moto', siniestrosAnotados: 0, seguro: { codigoDgs: 'C0058', fechaEfecto: '2026-01-08', aniosSinSiniestros: null, siniestrosUltimos5: null, numeroPoliza: '4000000002' } })
const leer = (cs: CandidataSeguroAnterior[]) => async (): Promise<LecturaCandidatas> => ({ ok: true, candidatas: cs })
const base = { correduriaId: COR, clienteId: C1, cliente: { fechaCarnet: null, carnets: [{ tipo: 'B', fechaExpedicion: '2005-03-01' }] }, hoy: HOY }

test('vehículo nuevo: imputa el coche, con el máximo de bonus y marcado supuesto', async () => {
  const r = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: undefined, leer: leer([MOTO, COCHE]) })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.publico.estado, 'imputado')
  assert.equal(r.publico.elegida?.id, 'poliza:coche')
  assert.deepEqual(r.publico.alternativas.map((a) => a.id), ['poliza:moto'])
  assert.equal(r.publico.bonusSupuesto, true)
  assert.match(r.publico.condicion ?? '', /SINCO/)
  assert.equal(r.historial?.datos.aniosSinSiniestros, 10)
  assert.equal(r.historial?.datos.matriculaAnterior, '0000AAA')
  assert.equal('clienteId' in (r.publico.elegida ?? {}), false, 'la ficha no cruza el puerto')
})

test('override del corredor y apagado', async () => {
  const o = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: { seguroAnteriorId: 'poliza:moto' }, correcciones: undefined, leer: leer([MOTO, COCHE]) })
  assert.ok(o.ok && o.publico.elegida?.id === 'poliza:moto' && o.publico.elegidaPorCorredor)
  const mal = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: { seguroAnteriorId: 'poliza:otra' }, correcciones: undefined, leer: leer([COCHE]) })
  assert.ok(!mal.ok && mal.status === 422)
  const off = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: { sinSeguroAnterior: true }, correcciones: undefined, leer: leer([COCHE]) })
  assert.ok(off.ok && off.publico.estado === 'desactivado' && off.historial === null)
  const off2 = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: { aseguradoAntes: false }, leer: leer([COCHE]) })
  assert.ok(off2.ok && off2.publico.estado === 'desactivado')
})

test('no poder leer sus pólizas NO es «no tiene»: la ruta que paga no cotiza de calle a ciegas', async () => {
  const fallo = async (): Promise<LecturaCandidatas> => ({ ok: false, motivo: 'conexion' })
  const r = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: undefined, leer: fallo })
  assert.ok(!r.ok && r.status === 503)
  const manual = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: { aseguradoAntes: true }, leer: fallo })
  assert.ok(manual.ok && manual.publico.estado === 'manual', 'si el corredor lo teclea, no hace falta leer')
})

test('bonus final: por corrección sin origen cuenta como SUPUESTO (la pantalla precargaba el máximo)', () => {
  const h = { datos: {} as never, supuestos: [], bonusSupuesto: true }
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: false }, undefined, null), false)
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, undefined, h), true)
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, undefined, { ...h, bonusSupuesto: false }), false)
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, { aniosSinSiniestros: 10 }, null), true)
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, { aniosSinSiniestros: 4, bonusOrigen: 'documento' }, h), false)
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, { aniosSinSiniestros: 4, bonusOrigen: 'me lo invento' }, h), true)
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, undefined, null), true, 'declarado sin saber de dónde: supuesto')
})

test('el carné más antiguo de la ficha es el techo del bonus', () => {
  assert.equal(carnetMasAntiguo({ fechaCarnet: '2010-01-01', carnets: [{ tipo: 'A', fechaExpedicion: '2003-02-02' }, { tipo: 'B', fechaExpedicion: null }] }), '2003-02-02')
  assert.equal(carnetMasAntiguo({ fechaCarnet: null, carnets: null }), null)
})
