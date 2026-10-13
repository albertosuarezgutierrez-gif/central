// Elección automática de la versión del vehículo con IA (13/10/2026). `node --test`. BD, IA y lanzador INYECTADOS.
// Fixtures SINTÉTICAS (matrícula, fechas y CP inventados).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eleccionIaActiva, planEleccionVersion, procesarEleccionVersion, type DepsEleccion, type FilaEleccion } from './tarificador-eleccion-reglas.ts'
import { leerResultadoWorker } from './tarificador-reglas.ts'
import { eleccionContraLista, leerEleccionBandeja, proyectarItemBandeja } from './tarificador-bandeja-reglas.ts'

const JOB = '22222222-2222-4222-8222-222222222222'
const OPCIONES = [
  { codigo: 'V001', etiqueta: 'F 800 S 85 CV' },
  { codigo: 'V002', etiqueta: 'F 800 ST 85 CV' },
  { codigo: 'V003', etiqueta: 'F 800 GS 85 CV' },
]
const RIESGO = {
  ramo: 'moto', matricula: '1234BCD', codigoPostal: '41003',
  conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01', sexo: 'hombre' },
  seleccionVehiculo: { marca: 'BMW', modelo: 'F 800', clase: 4, cilindradaCc: 798, descripcion: 'BMW F 800 ST 85 CV' },
}
const EN = '2026-10-13T10:00:00.000Z'
const fila = (extra: Partial<FilaEleccion> = {}): FilaEleccion => ({
  id: JOB, correduria_id: 'c0000000-0000-4000-8000-000000000000', compania: 'allianz', ramo: 'moto', estado: 'requiere_humano', modo: null,
  riesgo: RIESGO,
  error: { tipo: 'captcha', mensaje: 'requiere_eleccion_version: el catálogo ofrece 3 versiones', url: null, opcionesVersion: OPCIONES, en: EN },
  ...extra,
})

/** Deps de prueba: registran cada llamada. `salidaIa` = lo que «responde» la IA (o una función que lanza). */
function deps(f: FilaEleccion | null, salidaIa: string | (() => never), env: Record<string, string> = { TARIFICADOR_IA_ELECCION: '1' }) {
  const log = { leer: 0, ia: [] as string[], aplicar: [] as unknown[], baja: [] as unknown[], lanzar: [] as string[] }
  const d: DepsEleccion = {
    env,
    leer: async () => { log.leer++; return f },
    ia: async (system, prompt) => { log.ia.push(prompt); if (typeof salidaIa === 'function') salidaIa(); return salidaIa as string },
    aplicar: async (_f, e, _m, en) => { log.aplicar.push({ ...e, en }); return true },
    anotarBaja: async (_f, r) => { log.baja.push(r) },
    lanzar: async (_c, compania) => { log.lanzar.push(compania) },
  }
  return { d, log }
}

test('interruptor fail-closed: solo «1» exacto', () => {
  assert.equal(eleccionIaActiva({ TARIFICADOR_IA_ELECCION: '1' }), true)
  for (const v of [undefined, '', '0', 'true', ' 1', 'si']) assert.equal(eleccionIaActiva({ TARIFICADOR_IA_ELECCION: v }), false)
})

test('env APAGADA → no lee, no pregunta, no cambia nada (comportamiento de antes)', async () => {
  const { d, log } = deps(fila(), '{"codigo":"V002","confianza":"alta","motivo":"x"}', {})
  assert.deepEqual(await procesarEleccionVersion(JOB, d), { estado: 'omitido', motivo: 'TARIFICADOR_IA_ELECCION apagado' })
  assert.equal(log.leer, 0)
  assert.equal(log.ia.length, 0)
  assert.equal(log.aplicar.length + log.baja.length + log.lanzar.length, 0)
})

test('alta con código de la lista → aplica {codigo, etiqueta DE LA LISTA} al mismo trabajo y relanza', async () => {
  const { d, log } = deps(fila(), '{"codigo":"V002","confianza":"alta","motivo":"ST en la descripción"}')
  assert.deepEqual(await procesarEleccionVersion(JOB, d), { estado: 'aplicado', codigo: 'V002' })
  assert.deepEqual(log.aplicar, [{ codigo: 'V002', etiqueta: 'F 800 ST 85 CV', en: EN }])
  assert.deepEqual(log.lanzar, ['allianz'])
  // Lo que viajó a la IA: solo vehículo + lista.
  for (const personal of ['1234BCD', '41003', '1980-05-17', '2000-06-01', 'hombre']) assert.ok(!log.ia[0].includes(personal), personal)
})

test('código FUERA de la lista → baja: se anota, no se aplica ni se lanza', async () => {
  const { d, log } = deps(fila(), '{"codigo":"V999","confianza":"alta","motivo":"seguro"}')
  assert.equal((await procesarEleccionVersion(JOB, d)).estado, 'baja')
  assert.equal(log.aplicar.length, 0)
  assert.equal(log.lanzar.length, 0)
  assert.equal(log.baja.length, 1)
})

test('confianza baja o IA que lanza → baja (queda en requiere_humano)', async () => {
  for (const salida of ['{"codigo":null,"confianza":"baja","motivo":"no distingo S de ST"}', () => { throw new Error('429') }] as const) {
    const { d, log } = deps(fila(), salida)
    assert.equal((await procesarEleccionVersion(JOB, d)).estado, 'baja')
    assert.equal(log.aplicar.length, 0)
  }
})

test('TOPE de 1 intento: con una elección ya en el riesgo (IA o persona) no se vuelve a preguntar', async () => {
  for (const extra of [{ eleccionVersion: { codigo: 'V002', etiqueta: 'F 800 ST 85 CV' } }, { eleccionVersionIa: { motivo: 'x', en: EN } }]) {
    const { d, log } = deps(fila({ riesgo: { ...RIESGO, ...extra } }), '{"codigo":"V001","confianza":"alta","motivo":"x"}')
    const r = await procesarEleccionVersion(JOB, d)
    assert.equal(r.estado, 'omitido')
    assert.equal(log.ia.length, 0)
    assert.equal(log.aplicar.length, 0)
  }
})

test('no se intenta: otro estado, emisión, comunidades, verificación humana sin lista, opción sin código', () => {
  const no = (f: FilaEleccion) => assert.equal(planEleccionVersion(f).intentar, false)
  no(fila({ estado: 'error_definitivo' }))
  no(fila({ modo: 'emision' }))
  no(fila({ ramo: 'comunidades' }))
  no(fila({ error: { tipo: 'captcha', mensaje: 'requiere_verificacion_humana: SMS', en: EN } }))
  no(fila({ error: { tipo: 'captcha', mensaje: 'x', opcionesVersion: [OPCIONES[0], { codigo: null, etiqueta: 'F 800 R' }], en: EN } }))
  assert.equal(planEleccionVersion(fila()).intentar, true)
})

test('carrera (el trabajo cambió entre la lectura y la aplicación) → no se lanza', async () => {
  const { d, log } = deps(fila(), '{"codigo":"V002","confianza":"alta","motivo":"x"}')
  d.aplicar = async () => false
  assert.deepEqual(await procesarEleccionVersion(JOB, d), { estado: 'carrera' })
  assert.equal(log.lanzar.length, 0)
})

test('cable: el resultado de error conserva la lista COMPLETA; una lista inválida se descarta sin rechazar el resultado', () => {
  const veinte = Array.from({ length: 20 }, (_, i) => ({ codigo: `C${i}`, etiqueta: `F 800 v${i}` }))
  const base = { trabajoId: JOB, resultado: 'error', error: { tipo: 'captcha', mensaje: 'requiere_eleccion_version: …', url: null, opcionesVersion: veinte } }
  const l = leerResultadoWorker(base)
  assert.ok(l.ok && l.r.tipo === 'error')
  assert.deepEqual(l.ok && l.r.tipo === 'error' ? l.r.error.opcionesVersion : null, veinte)
  const mala = leerResultadoWorker({ ...base, error: { ...base.error, opcionesVersion: [{ codigo: 'x' }] } })
  assert.ok(mala.ok && mala.r.tipo === 'error' && mala.r.error.opcionesVersion === undefined)
})

test('bandeja: la elección a mano se valida contra la lista guardada del trabajo', () => {
  const error = fila().error
  assert.deepEqual(eleccionContraLista({ codigo: 'V003', etiqueta: null }, error), { ok: true, eleccion: { codigo: 'V003', etiqueta: 'F 800 GS 85 CV' } })
  assert.deepEqual(eleccionContraLista({ codigo: 'V003', etiqueta: ' f 800  gs 85 cv ' }, error), { ok: true, eleccion: { codigo: 'V003', etiqueta: 'F 800 GS 85 CV' } })
  assert.equal(eleccionContraLista({ codigo: 'V999', etiqueta: null }, error).ok, false)
  assert.equal(eleccionContraLista({ codigo: 'V003', etiqueta: 'F 800 S 85 CV' }, error).ok, false, 'etiqueta de otro código')
  assert.equal(eleccionContraLista({ codigo: 'V003', etiqueta: null }, { tipo: 'captcha', mensaje: 'x' }).ok, false, 'sin lista guardada')
})

test('bandeja: forma de eleccionVersion en el cuerpo', () => {
  assert.deepEqual(leerEleccionBandeja(undefined), { ok: true, eleccion: null })
  assert.deepEqual(leerEleccionBandeja({ codigo: ' V001 ' }), { ok: true, eleccion: { codigo: 'V001', etiqueta: null } })
  for (const malo of ['V001', [], { codigo: '' }, { codigo: 7 }, { codigo: 'x'.repeat(61) }, { codigo: 'V1', etiqueta: 3 }]) assert.equal(leerEleccionBandeja(malo).ok, false)
})

test('bandeja: el item expone la lista de versiones (solo catálogo) y null si no la hay', () => {
  const base = { id: JOB, compania: 'allianz', ramo: 'moto', estado: 'requiere_humano', intentos: 1, oportunidad_id: null, bot_version: null, fecha: new Date(EN) }
  assert.deepEqual(proyectarItemBandeja({ ...base, error: fila().error }).opcionesVersion, OPCIONES)
  assert.equal(proyectarItemBandeja({ ...base, error: { tipo: 'portal', mensaje: 'x' } }).opcionesVersion, null)
})
