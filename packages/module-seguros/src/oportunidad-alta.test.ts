import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTIVO_DESCARTE, aplicarAccion, historialDeclaradoDe, incoherenciaHistorialDeclarado, seguroAnteriorDe, ultimosDigitosPoliza, validarAltaOportunidad, validarEdicionOportunidad } from './oportunidad-seguimiento.ts'

const hoy = new Date(Date.UTC(2026, 8, 24))

test('alta a mano: nace con su primer paso o no nace', () => {
  assert.equal(validarAltaOportunidad({ ramo: 'hogar' }, hoy).ok, false, 'sin fecha del primer paso no se abre')
  assert.equal(validarAltaOportunidad({ ramo: 'hogar', fechaTarea: '2026-09-23' }, hoy).ok, false, 'primer paso en el pasado')
  assert.equal(validarAltaOportunidad({ fechaTarea: '2026-09-25' }, hoy).ok, false, 'sin ramo')
  assert.equal(validarAltaOportunidad({ ramo: 'hogar', estado: 'ganada', fechaTarea: '2026-09-25' }, hoy).ok, false, 'no nace ganada')
  const r = validarAltaOportunidad({ ramo: 'hogar', fechaTarea: '2026-09-25', aseguradora: ' Mapfre ', prima: '412,50', fechaFinVigencia: '' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.alta.estado, 'en_negociacion')
  assert.equal(r.alta.tarea.tipo, 'llamada')
  assert.equal(r.alta.tarea.fechaLimite, '2026-09-25')
  assert.equal(r.alta.aseguradora, 'Mapfre')
  assert.equal(r.alta.prima, 412.5)
  assert.equal(r.alta.fechaFinVigencia, null)
})

test('alta: una prima de 0 no es una prima (NULL ≠ 0)', () => {
  assert.equal(validarAltaOportunidad({ ramo: 'auto', fechaTarea: '2026-09-25', prima: 0 }, hoy).ok, false)
  const r = validarAltaOportunidad({ ramo: 'auto', fechaTarea: '2026-09-25', prima: '' }, hoy)
  assert.ok(r.ok)
  assert.equal(r.alta.prima, null)
})

test('edición: undefined no toca, vacío borra, nada que cambiar es un error', () => {
  assert.equal(validarEdicionOportunidad({}).ok, false)
  assert.equal(validarEdicionOportunidad({ ramo: 'barco' }).ok, false)
  assert.equal(validarEdicionOportunidad({ fechaFinVigencia: '2026-02-30' }).ok, false)
  const r = validarEdicionOportunidad({ aseguradora: '', fechaFinVigencia: '2027-01-31' })
  assert.ok(r.ok)
  assert.deepEqual(r.cambios, { aseguradora: null, fechaFinVigencia: '2027-01-31' })
  assert.equal('ramo' in r.cambios, false)
  assert.equal('prima' in r.cambios, false)
})

test('descartar es perder con MOTIVO_DESCARTE, sin exigir detalle, y solo desde abierta', () => {
  const abierta = aplicarAccion({ estado: 'competencia', aparcadaHasta: null }, { accion: 'perder', motivo: MOTIVO_DESCARTE }, hoy)
  assert.ok(abierta.ok)
  assert.equal(abierta.cambios.motivoPerdida, 'error_alta')
  assert.equal(aplicarAccion({ estado: 'ganada', aparcadaHasta: null }, { accion: 'perder', motivo: MOTIVO_DESCARTE }, hoy).ok, false)
})

test('el motivo de descartar no vale para una venta perdida ni para «no le interesa»', async () => {
  const { MOTIVOS_PERDIDA_VENTA } = await import('./oportunidad-seguimiento.ts')
  const { planLlamada } = await import('./llamada-resultado.ts')
  assert.equal(MOTIVOS_PERDIDA_VENTA.includes(MOTIVO_DESCARTE), false)
  assert.equal(planLlamada({ resultado: 'no_interesa', motivo: MOTIVO_DESCARTE }, 'competencia', hoy).ok, false)
})

test('alta: el seguro anterior (bonus) se guarda saneado; 0 siniestros es un dato', () => {
  const r = validarAltaOportunidad({ ramo: 'moto', fechaTarea: '2026-09-25', seguroAnterior: { codigoDgs: ' c0058 ', aniosSinSiniestros: 5, siniestrosUltimos5: 0, fechaEfecto: '2026-02-30' } }, hoy)
  assert.ok(r.ok)
  assert.deepEqual(r.alta.seguroAnterior, { codigoDgs: 'C0058', fechaEfecto: null, aniosSinSiniestros: 5, siniestrosUltimos5: 0 })
  assert.equal(seguroAnteriorDe({ aniosSinSiniestros: 'varios', siniestrosUltimos5: -1, codigoDgs: 'Mapfre' }), null, 'basura con forma de dato no se guarda')
  assert.equal(seguroAnteriorDe(undefined), null)
  assert.equal(seguroAnteriorDe({ aniosSinSiniestros: '7' })?.aniosSinSiniestros, 7)
})

test('pendiente_cliente: solo cuando el alta la abre el servidor (lead web)', () => {
  const hoy = new Date('2026-09-24T00:00:00Z')
  const d = { ramo: 'auto', estado: 'pendiente_cliente', fechaTarea: '2026-09-24' }
  assert.equal(validarAltaOportunidad(d, hoy).ok, false, 'desde la pantalla no')
  const r = validarAltaOportunidad(d, hoy, { desdeServidor: true })
  assert.ok(r.ok && r.alta.estado === 'pendiente_cliente')
  assert.equal(validarAltaOportunidad({ ...d, estado: 'ganada' }, hoy, { desdeServidor: true }).ok, false, 'ni el servidor la abre ganada')
})

test('edición del historial: null = sin dato, 0 = dato, basura = error (nunca 0), solo las claves enviadas', () => {
  const ok = (hd: unknown) => { const r = validarEdicionOportunidad({ historialDeclarado: hd }); return r.ok ? r.cambios.historial : r }
  assert.deepEqual(ok({ aniosAsegurado: 7, aniosEnCompania: 0 }), { aniosAsegurado: 7, aniosEnCompania: 0 })
  assert.deepEqual(ok({ aniosAsegurado: null }), { aniosAsegurado: null }, 'null quita el dato')
  assert.deepEqual(ok({ aniosEnCompania: '' }), { aniosEnCompania: null }, 'vacío = sin dato')
  assert.deepEqual(ok({ aniosEnCompania: '4' }), { aniosEnCompania: 4 })
  // Merge sin pisar: las claves no enviadas NO aparecen (ni como null) y las que no son del historial se ignoran.
  const solo = ok({ aniosAsegurado: 3, codigoDgs: 'C0058', aseguradoAntes: true }) as Record<string, unknown>
  assert.deepEqual(solo, { aniosAsegurado: 3 })
  assert.equal('aniosEnCompania' in solo, false)
  for (const malo of [-1, 1.5, 'abc', 101, true, {}]) {
    const r = validarEdicionOportunidad({ historialDeclarado: { aniosAsegurado: malo } })
    assert.equal(r.ok, false, String(malo))
  }
  assert.equal(validarEdicionOportunidad({ historialDeclarado: 'x' }).ok, false)
  assert.equal(validarEdicionOportunidad({ historialDeclarado: [] }).ok, false)
  assert.equal(validarEdicionOportunidad({ historialDeclarado: {} }).ok, false, 'sin nada que cambiar')
  const mixto = validarEdicionOportunidad({ prima: 100, historialDeclarado: { aniosAsegurado: 2 } })
  assert.equal(mixto.ok && mixto.cambios.prima === 100 && mixto.cambios.historial?.aniosAsegurado === 2, true)
  // La clave vieja ya no es la vía: mandar los años dentro de `seguroAnterior` no escribe nada.
  assert.equal(validarEdicionOportunidad({ seguroAnterior: { aniosAsegurado: 2 } } as never).ok, false, 'sin nada que cambiar')
})

test('historial declarado FUERA del seguro anterior: solo años ≠ un seguro anterior leído', () => {
  assert.equal(seguroAnteriorDe({ aniosAsegurado: 5, aniosEnCompania: 2 }), null, 'solo años = ningún seguro anterior')
  const conAnios = seguroAnteriorDe({ codigoDgs: 'C0058', aniosAsegurado: 5 }) as Record<string, unknown>
  assert.equal('aniosAsegurado' in conAnios, false, 'el saneado del seguro anterior no arrastra los años')
  // Tres estados: null pendiente · 0 revisado · dato. Basura = null, nunca 0.
  assert.deepEqual(historialDeclaradoDe(undefined), NADA)
  assert.deepEqual(historialDeclaradoDe({ aniosAsegurado: 0, aniosEnCompania: 6 }), { ...NADA, aniosAsegurado: 0, aniosEnCompania: 6 })
  assert.deepEqual(historialDeclaradoDe({ aniosAsegurado: -2, aniosEnCompania: 'x' }), NADA)
  assert.deepEqual(historialDeclaradoDe([3]), NADA)
})

const NADA = {
  aniosAsegurado: null, aniosEnCompania: null, tieneSeguroActual: null, companiaActual: null, numeroPoliza: null,
  aniosSinSiniestros: null, siniestrosUltimos5: null,
}

test('historial declarado (13/10/2026): seguro actual, compañía, póliza y siniestros — tres estados, 0 y false son dato', () => {
  const h = historialDeclaradoDe({ tieneSeguroActual: false, companiaActual: '  Mapfre ', numeroPoliza: ' 4840402030 01 ', aniosSinSiniestros: 0, siniestrosUltimos5: 0 })
  assert.deepEqual(h, { ...NADA, tieneSeguroActual: false, companiaActual: 'Mapfre', numeroPoliza: '4840402030 01', aniosSinSiniestros: 0, siniestrosUltimos5: 0 })
  // Basura = null (nunca false ni 0): 'si' no es un booleano, una póliza de 3 caracteres no sirve para SINCO.
  assert.deepEqual(historialDeclaradoDe({ tieneSeguroActual: 'si', numeroPoliza: '123', siniestrosUltimos5: 51, companiaActual: 7 }), NADA)
})

test('edición del historial (13/10/2026): valida cada clave nueva y su coherencia', () => {
  const ok = (hd: unknown) => { const r = validarEdicionOportunidad({ historialDeclarado: hd }); return r.ok ? r.cambios.historial : r.motivo }
  assert.deepEqual(ok({ tieneSeguroActual: true, companiaActual: 'Reale', numeroPoliza: 'AB-123456' }), { tieneSeguroActual: true, companiaActual: 'Reale', numeroPoliza: 'AB-123456' })
  assert.deepEqual(ok({ tieneSeguroActual: '', companiaActual: '', numeroPoliza: null }), { tieneSeguroActual: null, companiaActual: null, numeroPoliza: null }, 'vacío = sin dato')
  assert.deepEqual(ok({ aniosSinSiniestros: 0, siniestrosUltimos5: 0 }), { aniosSinSiniestros: 0, siniestrosUltimos5: 0 }, '0 es dato')
  assert.match(String(ok({ tieneSeguroActual: 'si' })), /sí, no o sin dato/)
  assert.match(String(ok({ numeroPoliza: '12 3' })), /5 últimos/)
  assert.match(String(ok({ companiaActual: 3 })), /no es un texto/)
  assert.match(String(ok({ siniestrosUltimos5: 51 })), /0 a 50/)
  assert.match(String(ok({ aniosSinSiniestros: -1 })), /0 a 100/)
  // Coherencia: sin siniestros ≤ asegurado; ≥5 limpios = 0 siniestros en 5; sin seguro, ni compañía ni póliza.
  assert.match(String(ok({ aniosAsegurado: 3, aniosSinSiniestros: 9 })), /sin siniestros no pueden ser más que los años asegurado/)
  assert.deepEqual(ok({ aniosAsegurado: 9, aniosSinSiniestros: 9 }), { aniosAsegurado: 9, aniosSinSiniestros: 9 }, 'igual sí vale')
  assert.match(String(ok({ aniosSinSiniestros: 6, siniestrosUltimos5: 1 })), /5 años o más sin siniestros/)
  assert.match(String(ok({ tieneSeguroActual: false, companiaActual: 'Reale' })), /no tiene seguro ahora/)
  assert.deepEqual(ok({ tieneSeguroActual: false, companiaActual: null, numeroPoliza: null }), { tieneSeguroActual: false, companiaActual: null, numeroPoliza: null })
})

test('incoherenciaHistorialDeclarado: un null no choca con nada', () => {
  assert.equal(incoherenciaHistorialDeclarado(NADA), null)
  assert.equal(incoherenciaHistorialDeclarado({ ...NADA, aniosSinSiniestros: 40 }), null, 'sin años asegurado no hay con qué comparar')
  assert.match(incoherenciaHistorialDeclarado({ ...NADA, aniosAsegurado: 2, aniosEnCompania: 3 }) ?? '', /en la compañía/)
})

test('ultimosDigitosPoliza: los 5 últimos para Codeoscopic; sin sufijo Mapfre; menos de 5 = null', () => {
  assert.equal(ultimosDigitosPoliza('4840402030 01', 'C0058'), '02030', 'Mapfre: fuera el sufijo de suplemento')
  assert.equal(ultimosDigitosPoliza('4840402030 01', 'C0072'), '03001', 'otra compañía: se quitan los espacios')
  assert.equal(ultimosDigitosPoliza(' ab-12/345 '), '12345')
  assert.equal(ultimosDigitosPoliza('98765'), '98765', 'si solo se dan los 5, son esos')
  assert.equal(ultimosDigitosPoliza('1234'), null)
  assert.equal(ultimosDigitosPoliza(null), null)
})
