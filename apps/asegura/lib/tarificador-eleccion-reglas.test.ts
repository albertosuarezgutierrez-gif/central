// Elección automática de la versión del vehículo con IA (13/10/2026). `node --test`. BD, IA y lanzador INYECTADOS.
// Fixtures SINTÉTICAS (matrícula, fechas y CP inventados).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveMemoriaDeRiesgo, eleccionIaActiva, memoriaAInvalidar, memoriaTrasExito, planEleccionVersion, procesarEleccionVersion, type ClaveMemoria, type DepsEleccion, type FilaEleccion } from './tarificador-eleccion-reglas.ts'
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
function deps(f: FilaEleccion | null, salidaIa: string | (() => never), env: Record<string, string> = { TARIFICADOR_IA_ELECCION: '1' }, memoria: { codigo: string } | null = null) {
  const log = { leer: 0, ia: [] as string[], aplicar: [] as unknown[], baja: [] as unknown[], lanzar: [] as string[], memoria: [] as ClaveMemoria[], invalidar: [] as unknown[], marcas: [] as unknown[] }
  const d: DepsEleccion = {
    env,
    leer: async () => { log.leer++; return f },
    ia: async (system, prompt) => { log.ia.push(prompt); if (typeof salidaIa === 'function') salidaIa(); return salidaIa as string },
    leerMemoria: async (k) => { log.memoria.push(k); return memoria },
    invalidarMemoria: async (k, codigo) => { log.invalidar.push({ ...k, codigo }) },
    aplicar: async (_f, e, _m, en, marca) => { log.aplicar.push({ ...e, en }); log.marcas.push(marca); return true },
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
  assert.deepEqual(await procesarEleccionVersion(JOB, d), { estado: 'aplicado', codigo: 'V002', origen: 'ia' })
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

test('bandeja: las etiquetas se comparan SIN tildes (misma normalización que el bot) y la ambigüedad se rechaza igual', () => {
  const lista = (...e: string[]) => ({ tipo: 'eleccion', mensaje: 'x', opcionesVersion: e.map((etiqueta) => ({ codigo: null, etiqueta })) })
  assert.deepEqual(eleccionContraLista({ codigo: null, etiqueta: 'citroen c4 picasso' }, lista('CITROËN C4 PICASSO', 'OTRO')), { ok: true, eleccion: { codigo: null, etiqueta: 'CITROËN C4 PICASSO' } })
  // «Peña» y «Pena» son la MISMA etiqueta para el bot (elegiría una al azar): ambigua → rechazada.
  const r = eleccionContraLista({ codigo: null, etiqueta: 'Pena GT' }, lista('PEÑA GT', 'PENA GT'))
  assert.ok(!r.ok && /repetida/.test(r.motivo))
})

test('bandeja: forma de eleccionVersion en el cuerpo', () => {
  assert.deepEqual(leerEleccionBandeja(undefined), { ok: true, eleccion: null })
  assert.deepEqual(leerEleccionBandeja({ codigo: ' V001 ' }), { ok: true, eleccion: { codigo: 'V001', etiqueta: null } })
  for (const malo of ['V001', [], { codigo: '' }, { codigo: 7 }, { codigo: 'x'.repeat(61) }, { codigo: 'V1', etiqueta: 3 }]) assert.equal(leerEleccionBandeja(malo).ok, false)
})

// ─── Opciones SIN código (Mapfre, 15/10/2026: «Selección de vehículo» solo da la denominación) ─────────────
const SIN_CODIGO = [
  { codigo: null, etiqueta: 'Marca Prueba Modelo 2.9 Gl · 163 CV · 2902 cc · 01/01/2004' },
  { codigo: null, etiqueta: 'Marca Prueba Modelo 2.9 Gls · 163 CV · 2902 cc · 01/01/2004' },
]
const errorSinCodigo = { tipo: 'eleccion', mensaje: 'requiere_eleccion_version: …', opcionesVersion: SIN_CODIGO }

test('bandeja (D): con opciones SIN código se elige por la ETIQUETA EXACTA de una opción; nunca por parecido ni contra una con código', () => {
  assert.deepEqual(leerEleccionBandeja({ codigo: null, etiqueta: SIN_CODIGO[1].etiqueta }), { ok: true, eleccion: { codigo: null, etiqueta: SIN_CODIGO[1].etiqueta } })
  assert.deepEqual(leerEleccionBandeja({ etiqueta: 'x' }), { ok: true, eleccion: { codigo: null, etiqueta: 'x' } })
  for (const malo of [{ codigo: null }, { codigo: null, etiqueta: '  ' }, { codigo: null, etiqueta: 'x'.repeat(201) }]) assert.equal(leerEleccionBandeja(malo).ok, false, JSON.stringify(malo))
  // Mayúsculas/espacios no cuentan; lo escrito es la etiqueta DE LA LISTA, con código null.
  assert.deepEqual(eleccionContraLista({ codigo: null, etiqueta: '  marca prueba modelo 2.9 GLS ·  163 CV · 2902 cc · 01/01/2004 ' }, errorSinCodigo), { ok: true, eleccion: { codigo: null, etiqueta: SIN_CODIGO[1].etiqueta } })
  assert.equal(eleccionContraLista({ codigo: null, etiqueta: 'Marca Prueba Modelo 2.9' }, errorSinCodigo).ok, false, 'un trozo no vale')
  assert.equal(eleccionContraLista({ codigo: null, etiqueta: 'F 800 GS 85 CV' }, fila().error).ok, false, 'sin código no se elige una opción que SÍ tiene código')
  const repetida = { ...errorSinCodigo, opcionesVersion: [SIN_CODIGO[0], { codigo: null, etiqueta: SIN_CODIGO[0].etiqueta.toUpperCase() }] }
  assert.equal(eleccionContraLista({ codigo: null, etiqueta: SIN_CODIGO[0].etiqueta }, repetida).ok, false, 'dos opciones con la misma etiqueta: no se adivina')
  // Un código no casa con una opción sin código.
  assert.equal(eleccionContraLista({ codigo: 'V001', etiqueta: null }, errorSinCodigo).ok, false)
  // El item de la bandeja expone las opciones sin código (la lista viaja con tipo `eleccion`).
  const base = { id: JOB, compania: 'mapfre', ramo: 'auto', estado: 'requiere_humano', intentos: 1, oportunidad_id: null, bot_version: null, fecha: new Date(EN) }
  assert.deepEqual(proyectarItemBandeja({ ...base, error: errorSinCodigo }).opcionesVersion, SIN_CODIGO)
})

test('cable (C): `eleccion` es el tipo propio de «hay que elegir» y trae su lista; `captcha` (workers antiguos) también', () => {
  for (const tipo of ['eleccion', 'captcha']) {
    const l = leerResultadoWorker({ trabajoId: JOB, resultado: 'error', error: { tipo, mensaje: 'requiere_eleccion_version: …', url: null, opcionesVersion: SIN_CODIGO } })
    assert.ok(l.ok && l.r.tipo === 'error' && l.r.error.tipo === tipo)
    assert.deepEqual(l.ok && l.r.tipo === 'error' ? l.r.error.opcionesVersion : null, SIN_CODIGO, tipo)
  }
  // Con otro tipo la lista no se acepta (no es una elección).
  const p = leerResultadoWorker({ trabajoId: JOB, resultado: 'error', error: { tipo: 'portal', mensaje: 'x', url: null, opcionesVersion: SIN_CODIGO } })
  assert.ok(p.ok && p.r.tipo === 'error' && p.r.error.opcionesVersion === undefined)
  // La elección automática (IA/memoria) también reconoce el tipo nuevo.
  const conEleccion = planEleccionVersion(fila({ error: { tipo: 'eleccion', mensaje: 'requiere_eleccion_version: x', url: null, opcionesVersion: OPCIONES, en: EN } }))
  assert.ok(conEleccion.intentar || conEleccion.motivo !== 'no es una elección de versión')
})

test('bandeja: el item expone la lista de versiones (solo catálogo) y null si no la hay', () => {
  const base = { id: JOB, compania: 'allianz', ramo: 'moto', estado: 'requiere_humano', intentos: 1, oportunidad_id: null, bot_version: null, fecha: new Date(EN) }
  assert.deepEqual(proyectarItemBandeja({ ...base, error: fila().error }).opcionesVersion, OPCIONES)
  assert.equal(proyectarItemBandeja({ ...base, error: { tipo: 'portal', mensaje: 'x' } }).opcionesVersion, null)
})

// ─── MEMORIA de elecciones (13/10/2026) ─────────────────────────────────────

const CLAVE = 'BMW|F 800|4|798|BMW F 800 ST 85 CV'
const NO_LLAMAR_IA = () => { throw new Error('la IA NO debía llamarse') }

test('memoria: clave del riesgo CONGELADA y sin datos personales', () => {
  assert.equal(claveMemoriaDeRiesgo(RIESGO, new Date(EN)), CLAVE)
  for (const personal of ['1234BCD', '41003', '1980', '2000-06', 'HOMBRE']) assert.ok(!CLAVE.includes(personal), personal)
})

test('memoria ACIERTA (código en la lista de hoy) → aplica sin llamar a la IA, origen memoria, etiqueta de la LISTA', async () => {
  const { d, log } = deps(fila(), NO_LLAMAR_IA, undefined, { codigo: 'V002' })
  assert.deepEqual(await procesarEleccionVersion(JOB, d), { estado: 'aplicado', codigo: 'V002', origen: 'memoria' })
  assert.equal(log.ia.length, 0)
  assert.deepEqual(log.memoria, [{ correduriaId: fila().correduria_id, compania: 'allianz', ramo: 'moto', clave: CLAVE }])
  assert.deepEqual(log.aplicar, [{ codigo: 'V002', etiqueta: 'F 800 ST 85 CV', en: EN }])
  assert.deepEqual(log.marcas, [{ origen: 'memoria', clave: CLAVE }])
  assert.deepEqual(log.lanzar, ['allianz'])
})

test('memoria con código que YA NO está en la lista (catálogo cambió) → se ignora y se pregunta a la IA', async () => {
  const { d, log } = deps(fila(), '{"codigo":"V003","confianza":"alta","motivo":"GS"}', undefined, { codigo: 'V777' })
  assert.deepEqual(await procesarEleccionVersion(JOB, d), { estado: 'aplicado', codigo: 'V003', origen: 'ia' })
  assert.equal(log.ia.length, 1)
  assert.deepEqual(log.marcas, [{ origen: 'ia', clave: CLAVE }])
})

test('memoria con interruptor APAGADO → ni se lee', async () => {
  const { d, log } = deps(fila(), NO_LLAMAR_IA, {}, { codigo: 'V002' })
  assert.equal((await procesarEleccionVersion(JOB, d)).estado, 'omitido')
  assert.equal(log.memoria.length + log.aplicar.length, 0)
})

test('aprender: SOLO tras un ok, y solo si la versión fue automática (IA o memoria) con su clave', () => {
  const t = { correduria_id: 'c0', compania: 'allianz', ramo: 'moto' }
  const ev = { codigo: 'V002', etiqueta: 'F 800 ST 85 CV' }
  // Al ELEGIR no se guarda nada: `procesarEleccionVersion` no tiene dependencia de escritura de memoria (solo leer/invalidar).
  assert.deepEqual(memoriaTrasExito({ ...t, riesgo: { ...RIESGO, eleccionVersion: ev, eleccionVersionIa: { motivo: 'x', en: EN, origen: 'ia', clave: CLAVE } } }),
    { k: { correduriaId: 'c0', compania: 'allianz', ramo: 'moto', clave: CLAVE }, codigo: 'V002', etiqueta: 'F 800 ST 85 CV' })
  assert.equal(memoriaTrasExito({ ...t, riesgo: { ...RIESGO, eleccionVersion: ev, eleccionVersionIa: { motivo: 'x', en: EN, origen: 'memoria', clave: CLAVE } } })?.codigo, 'V002')
  assert.equal(memoriaTrasExito({ ...t, riesgo: { ...RIESGO, eleccionVersion: ev } }), null, 'elección humana: se guardó en la bandeja')
  assert.equal(memoriaTrasExito({ ...t, riesgo: { ...RIESGO, eleccionVersion: ev, eleccionVersionIa: { motivo: 'x', en: EN } } }), null, 'marca antigua sin clave')
  assert.equal(memoriaTrasExito({ ...t, riesgo: RIESGO }), null)
})

test('invalidar: versión de MEMORIA que vuelve a pedir versión → se borra esa entrada (y queda para una persona)', async () => {
  const riesgo = { ...RIESGO, eleccionVersion: { codigo: 'V002', etiqueta: 'F 800 ST 85 CV' }, eleccionVersionIa: { motivo: 'm', en: EN, origen: 'memoria', clave: CLAVE } }
  const { d, log } = deps(fila({ riesgo }), NO_LLAMAR_IA, undefined, { codigo: 'V002' })
  assert.equal((await procesarEleccionVersion(JOB, d)).estado, 'omitido')
  assert.deepEqual(log.invalidar, [{ correduriaId: fila().correduria_id, compania: 'allianz', ramo: 'moto', clave: CLAVE, codigo: 'V002' }])
  assert.equal(log.ia.length + log.aplicar.length, 0)
})

test('invalidar: NO si la versión vino de la IA o de una persona, ni si el fallo no es de versión', () => {
  const ev = { codigo: 'V002', etiqueta: 'F 800 ST 85 CV' }
  assert.equal(memoriaAInvalidar(fila({ riesgo: { ...RIESGO, eleccionVersion: ev, eleccionVersionIa: { origen: 'ia', clave: CLAVE } } })), null)
  assert.equal(memoriaAInvalidar(fila({ riesgo: { ...RIESGO, eleccionVersion: ev } })), null)
  assert.equal(memoriaAInvalidar(fila({ riesgo: { ...RIESGO, eleccionVersion: ev, eleccionVersionIa: { origen: 'memoria', clave: CLAVE } }, error: { tipo: 'portal', mensaje: 'x' } })), null)
})

test('cableado (fuente): IA capaz (categoría redaccion), privada, ≤30 s; la persona se guarda como humano; la IA solo tras ok', async () => {
  const { readFileSync } = await import('node:fs')
  const leer = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
  const el = leer('./tarificador-eleccion.ts')
  assert.match(el, /CATEGORIA_IA_ELECCION = 'redaccion'/)
  assert.match(el, /privado: true, categoria: CATEGORIA_IA_ELECCION/)
  const ms = Number(/TIMEOUT_IA_ELECCION_MS = ([\d_]+)/.exec(el)?.[1].replaceAll('_', ''))
  assert.ok(ms > 0 && ms <= 30_000, `timeout ${ms}`)
  assert.match(leer('./tarificador-bandeja.ts'), /guardarMemoriaVersion\([^)]*origen: 'humano' \}\)/)
  const tar = leer('./tarificador.ts')
  assert.match(tar, /estadoTrabajo === 'ok' && interno\.res\.tarificacionId[^\n]*\n\s*const aprender = memoriaTrasExito/)
  assert.equal((tar.match(/guardarMemoriaVersion\(/g) ?? []).length, 1, 'la IA se aprende en UN solo sitio (tras el ok)')
})
