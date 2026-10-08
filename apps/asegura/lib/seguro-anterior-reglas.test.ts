import test from 'node:test'
import assert from 'node:assert/strict'
import { bonusSupuestoFinal, carnetMasAntiguo, imputarConLectura as imputarSeguroAnterior, imputarParaPrecalificar, type LecturaCandidatas } from './seguro-anterior-reglas.ts'
import { historialParaImputar, origenesHistorialManual, type CandidataSeguroAnterior } from '@central/module-seguros'

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

test('años ASEGURADO también son bonus: precargados al máximo o por encima de lo acreditado → supuesto, aunque bonusOrigen sea documento', () => {
  // Pantalla manual: 4 limpios leídos del PDF (dato) y los años asegurado precargados al máximo (10).
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, { aniosAsegurado: 10, aniosSinSiniestros: 4, bonusOrigen: 'documento' }, null), true)
  // Dentro de lo acreditado y dicho de dónde sale: dato.
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, { aniosAsegurado: 4, aniosSinSiniestros: 4, bonusOrigen: 'documento', aniosAseguradoOrigen: 'documento' }, null), false)
  // «corredor» ya no basta: un número tecleado por encima de los datos se verifica antes de emitir.
  assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, { aniosAsegurado: 4, aniosSinSiniestros: 4, bonusOrigen: 'corredor', aniosAseguradoOrigen: 'documento' }, null), true)
})

test('misma póliza, mismos datos: la pantalla manual y la imputación automática dan el mismo bonusSupuesto', () => {
  const casos = [
    { fechaEfecto: '2024-09-01', aniosSinSiniestros: 4 }, // 4 limpios leídos, asegurado al máximo → supuesto
    { fechaEfecto: '2014-09-01', aniosSinSiniestros: 10 }, // todo acreditado → dato
    { fechaEfecto: '2022-09-01', aniosSinSiniestros: null }, // limpios no constan → supuesto
  ]
  for (const sa of casos) {
    const c = cand({ id: 'poliza:x', siniestrosAnotados: 0, seguro: { codigoDgs: 'C0058', siniestrosUltimos5: 0, numeroPoliza: '5000000001', ...sa } })
    const auto = historialParaImputar({ ...c, faltan: [], conSiniestrosConocidos: false }, { fechaCarnet: '2001-01-01', hoy: HOY })
    // Lo que precarga la pantalla manual (`historialDeclarado`): lo leído, y el máximo (10) en lo que no.
    const limpios = sa.aniosSinSiniestros ?? 10
    const asegurado = Math.max(10, limpios)
    const correcciones = { aniosAsegurado: asegurado, aniosSinSiniestros: limpios, siniestrosUltimos5: 0, ...origenesHistorialManual({ seguro: sa, aniosAsegurado: asegurado, aniosSinSiniestros: limpios, hoy: HOY }) }
    assert.equal(bonusSupuestoFinal({ aseguradoAntes: true }, correcciones, null), auto.bonusSupuesto, JSON.stringify(sa))
  }
})

test('precalificar (gratis): una EXCEPCIÓN al leer/imputar degrada a no_disponible, nunca revienta (500)', async () => {
  const revienta = async (): Promise<LecturaCandidatas> => { throw new Error('boom postgres://u:p@h/db') }
  // la ruta que paga sí propaga (corta con 503 antes de gastar): no cambia
  await assert.rejects(imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: undefined, leer: revienta }))
  const r = await imputarParaPrecalificar({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: undefined, leer: revienta })
  assert.ok(!r.ok && r.status === 503 && r.causa === 'seguro_anterior_no_disponible')
  assert.ok(!r.ok && !/postgres:\/\//.test(r.mensaje), 'no filtra la URL de la BD')
  const ok = await imputarParaPrecalificar({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: undefined, leer: leer([COCHE]) })
  assert.ok(ok.ok && ok.publico.estado === 'imputado')
})

test('cónyuge no mirado: la lectura lo declara y el público lo lleva (también sin elegida)', async () => {
  const conFallo = (cs: CandidataSeguroAnterior[], conyugeNoMirado?: boolean) => async (): Promise<LecturaCandidatas> => ({ ok: true, candidatas: cs, conyugeNoMirado })
  for (const cs of [[COCHE], []]) {
    const r = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: undefined, leer: conFallo(cs, true) })
    assert.ok(r.ok && r.publico.conyugeNoMirado === true)
  }
  const bien = await imputarSeguroAnterior({ ...base, tipoNuevo: 'auto', cuerpo: {}, correcciones: undefined, leer: conFallo([COCHE]) })
  assert.ok(bien.ok && !bien.publico.conyugeNoMirado)
})
