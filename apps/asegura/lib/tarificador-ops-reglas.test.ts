// Cepos de la operación del tarificador RPA (07/10/2026): renovaciones, detector de tarifa y métricas. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ORIGEN_RENOVACION,
  TOPE_ABSOLUTO_DIA,
  calcularMetricas,
  clasificarRenovacion,
  cupoPasada,
  detectarCambiosTarifa,
  elegirParaEncolar,
  elegirRiesgoPrevio,
  enVentanaRenovacion,
  esCambioRelevante,
  esOrigenRenovacion,
  hashRiesgo,
  maxRenovacionesDia,
  pasoDelError,
  primaAnualMinima,
  renovacionesActivas,
  riesgoParaRenovacion,
  sumarUnAnio,
  trabajosDeLaPoliza,
} from './tarificador-ops-reglas.ts'

const APP = join(import.meta.dirname, '..')
const HOY = new Date('2026-10-07T09:00:00Z')

const RIESGO = {
  ramo: 'comunidades',
  direccion: { via: 'Calle Falsa', numero: '1', codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla' },
  documentoIdentidad: 'H12345678',
  fechaEfecto: '2026-01-10',
  fechaTermino: '2027-01-10',
  m2Construidos: 1200,
  anioConstruccion: 1990,
  tipoVivienda: 'Viviendas Pisos en Alto',
  uso: 'Habitual',
  plantas: 5,
  numEdificios: 1,
  numViviendasYLocales: 20,
  listaPropietarios: '> 50%',
  capitalContinente: 1_500_000,
  capitalContenido: null,
  ascensor: true,
  numViviendas: null,
  numLocales: null,
}

// ─── Interruptores ───────────────────────────────────────────────────────────

test('renovaciones: apagadas salvo «1» exacto', () => {
  assert.equal(renovacionesActivas({}), false)
  assert.equal(renovacionesActivas({ TARIFICADOR_RENOVACIONES_ACTIVO: 'true' }), false)
  assert.equal(renovacionesActivas({ TARIFICADOR_RENOVACIONES_ACTIVO: '1' }), true)
})

test('tope diario: 3 por defecto, basura → defecto, nunca por encima del techo', () => {
  assert.equal(maxRenovacionesDia({}), 3)
  assert.equal(maxRenovacionesDia({ TARIFICADOR_RENOVACIONES_MAX_DIA: 'muchas' }), 3)
  assert.equal(maxRenovacionesDia({ TARIFICADOR_RENOVACIONES_MAX_DIA: '-1' }), 3)
  assert.equal(maxRenovacionesDia({ TARIFICADOR_RENOVACIONES_MAX_DIA: '0' }), 0)
  assert.equal(maxRenovacionesDia({ TARIFICADOR_RENOVACIONES_MAX_DIA: '5' }), 5)
  assert.equal(maxRenovacionesDia({ TARIFICADOR_RENOVACIONES_MAX_DIA: '500' }), TOPE_ABSOLUTO_DIA)
})

test('cupo por pasada: uno como mucho, cero con otra renovación en cola o con el tope gastado', () => {
  assert.equal(cupoPasada({ topeDia: 3, hechasHoy: 0, renovacionesEnCola: 0 }), 1)
  assert.equal(cupoPasada({ topeDia: 3, hechasHoy: 0, renovacionesEnCola: 1 }), 0)
  assert.equal(cupoPasada({ topeDia: 3, hechasHoy: 3, renovacionesEnCola: 0 }), 0)
  assert.equal(cupoPasada({ topeDia: 0, hechasHoy: 0, renovacionesEnCola: 0 }), 0)
})

test('origen: la marca del cron se reconoce', () => {
  assert.equal(esOrigenRenovacion(ORIGEN_RENOVACION), true)
  assert.equal(esOrigenRenovacion('usuario:abc'), false)
  assert.equal(esOrigenRenovacion(null), false)
})

// ─── Ventana y fechas ────────────────────────────────────────────────────────

test('ventana 45–75 días, ambos inclusive; sin vencimiento no entra', () => {
  assert.equal(enVentanaRenovacion('2026-10-07', '2026-11-20'), false) // 44
  assert.equal(enVentanaRenovacion('2026-10-07', '2026-11-21'), true) // 45
  assert.equal(enVentanaRenovacion('2026-10-07', '2026-12-21'), true) // 75
  assert.equal(enVentanaRenovacion('2026-10-07', '2026-12-22'), false) // 76
  assert.equal(enVentanaRenovacion('2026-10-07', null), false)
})

test('+1 año: el 29 de febrero pasa al 28', () => {
  assert.equal(sumarUnAnio('2026-12-01'), '2027-12-01')
  assert.equal(sumarUnAnio('2028-02-29'), '2029-02-28')
  assert.equal(sumarUnAnio('basura'), null)
})

// ─── Riesgo reutilizable ─────────────────────────────────────────────────────

test('riesgo previo: el de la misma póliza; nunca el de otra; el del cliente solo si tiene UNA comunidad', () => {
  const ts = [
    { polizaId: 'otra', riesgo: { r: 'otra' }, creadoEn: '2026-09-30T00:00:00Z' },
    { polizaId: null, riesgo: { r: 'cliente' }, creadoEn: '2026-09-20T00:00:00Z' },
    { polizaId: 'esta', riesgo: { r: 'esta' }, creadoEn: '2026-08-01T00:00:00Z' },
  ]
  assert.deepEqual(elegirRiesgoPrevio(ts, 'esta', 2), { r: 'esta' })
  assert.deepEqual(elegirRiesgoPrevio(ts.slice(0, 2), 'esta', 1), { r: 'cliente' })
  assert.equal(elegirRiesgoPrevio(ts.slice(0, 2), 'esta', 2), null)
  assert.equal(elegirRiesgoPrevio([ts[0]], 'esta', 1), null)
  assert.equal(trabajosDeLaPoliza(ts, 'esta', 2).length, 1)
  assert.equal(trabajosDeLaPoliza(ts, 'esta', 1).length, 2)
})

test('riesgo de renovación: efecto = vencimiento, término +1 año, el resto intacto', () => {
  const r = riesgoParaRenovacion(RIESGO, '2026-12-01', HOY)
  assert.ok(r.ok)
  assert.equal(r.riesgo.fechaEfecto, '2026-12-01')
  assert.equal(r.riesgo.fechaTermino, '2027-12-01')
  assert.equal(r.riesgo.m2Construidos, 1200)
  assert.equal(r.riesgo.capitalContinente, 1_500_000)
})

test('riesgo de renovación: sin riesgo previo o incompleto → faltan datos (no se inventa)', () => {
  const sin = riesgoParaRenovacion(null, '2026-12-01', HOY)
  assert.equal(sin.ok, false)
  const { m2Construidos: _m, capitalContinente: _c, ...incompleto } = RIESGO
  const r = riesgoParaRenovacion(incompleto, '2026-12-01', HOY)
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.faltan.some((f) => f.startsWith('m2Construidos')))
  assert.ok(!r.ok && r.faltan.some((f) => f.startsWith('capitalContinente')))
})

// ─── Clasificación ───────────────────────────────────────────────────────────

const LISTO = riesgoParaRenovacion(RIESGO, '2026-12-01', HOY)

test('clasificar: ok reciente → cotizada con su prima; vivo → en cola; fallido → fallida', () => {
  const c = clasificarRenovacion([{ trabajoId: 't1', estado: 'ok', creadoEn: '2026-10-01', primaAllianz: 812.4 }], LISTO)
  assert.equal(c.estado, 'cotizada')
  assert.equal(c.primaAllianz, 812.4)
  assert.equal(clasificarRenovacion([{ trabajoId: 't', estado: 'en_curso', creadoEn: '2026-10-01', primaAllianz: null }], LISTO).estado, 'en_cola')
  assert.equal(clasificarRenovacion([{ trabajoId: 't', estado: 'requiere_humano', creadoEn: '2026-10-01', primaAllianz: null }], LISTO).estado, 'fallida')
})

test('clasificar: un cancelado no cuenta; sin trabajos y con riesgo → pendiente; sin riesgo → faltan datos', () => {
  const p = clasificarRenovacion([{ trabajoId: 't', estado: 'cancelado', creadoEn: '2026-10-01', primaAllianz: null }], LISTO)
  assert.equal(p.estado, 'pendiente')
  assert.ok(p.riesgo)
  const f = clasificarRenovacion([], riesgoParaRenovacion(null, '2026-12-01', HOY))
  assert.equal(f.estado, 'faltan_datos')
  assert.equal(f.riesgo, null)
})

test('encolar: solo pendientes, la que antes vence, y nunca más que el cupo', () => {
  const l = [
    { estado: 'pendiente' as const, vencimiento: '2026-12-10' },
    { estado: 'faltan_datos' as const, vencimiento: '2026-11-25' },
    { estado: 'pendiente' as const, vencimiento: '2026-11-30' },
  ]
  assert.deepEqual(elegirParaEncolar(l, 1).map((r) => r.vencimiento), ['2026-11-30'])
  assert.deepEqual(elegirParaEncolar(l, 0), [])
})

test('prima Allianz: la más barata de los sucesivos que constan; ninguno → null (no 0)', () => {
  assert.equal(primaAnualMinima([{ primaTotalSucesivos: 900 }, { primaTotalSucesivos: null }, { primaTotalSucesivos: 850.5 }]), 850.5)
  assert.equal(primaAnualMinima([{ primaTotalSucesivos: null }]), null)
  assert.equal(primaAnualMinima([]), null)
})

// ─── Detector de cambio de tarifa ────────────────────────────────────────────

test('hash: ignora fechas y datos personales; cambia con un campo que tarifica', () => {
  const h = hashRiesgo(RIESGO)
  assert.ok(h)
  assert.equal(hashRiesgo({ ...RIESGO, fechaEfecto: '2027-01-10', documentoIdentidad: 'X', direccion: { ...RIESGO.direccion, via: 'Otra', numero: '9' } }), h)
  assert.equal(hashRiesgo({ ...RIESGO, modalidad: 'estandar' }), h, 'modalidad ausente = estándar')
  assert.notEqual(hashRiesgo({ ...RIESGO, m2Construidos: 1201 }), h)
  assert.notEqual(hashRiesgo({ ...RIESGO, modalidad: 'personalizado' }), h)
  assert.notEqual(hashRiesgo({ ...RIESGO, direccion: { ...RIESGO.direccion, codigoPostal: '41004' } }), h)
  assert.equal(hashRiesgo(null), null)
})

test('relevante: > 1 % o > 5 € (estricto); igual no', () => {
  assert.equal(esCambioRelevante(1000, 1000), false)
  assert.equal(esCambioRelevante(1000, 1005), false) // 5 € y 0,5 %
  assert.equal(esCambioRelevante(1000, 1005.01), true) // > 5 €
  assert.equal(esCambioRelevante(300, 303.01), true) // > 1 % con 3,01 €
  assert.equal(esCambioRelevante(300, 303), false) // 1 % exacto y 3 €
  assert.equal(esCambioRelevante(1000, 990), true) // bajada de 10 €
})

const trabajo = (id: string, fecha: string, prima: number | null, riesgo: unknown = RIESGO, producto = 'Comunidades 2020') => ({
  trabajoId: id, terminadoEn: fecha, riesgo, ofertas: [{ producto, primaTotalSucesivos: prima }],
})

test('detector: mismo riesgo y modalidad con subida > 5 € → alerta con diferencia y porcentaje', () => {
  const a = detectarCambiosTarifa([trabajo('t2', '2026-10-05', 1100), trabajo('t1', '2026-09-01', 1000)])
  assert.equal(a.length, 1)
  assert.equal(a[0].antes.trabajoId, 't1')
  assert.equal(a[0].despues.trabajoId, 't2')
  assert.equal(a[0].diferencia, 100)
  assert.equal(a[0].porcentaje, 10)
  assert.equal(a[0].etiqueta, 'CP 41003 · 1.200 m²')
})

test('detector: sucesivos null NO se compara (dato que no hay ≠ 0); se compara con el anterior que sí consta', () => {
  assert.deepEqual(detectarCambiosTarifa([trabajo('t1', '2026-09-01', 1000), trabajo('t2', '2026-10-01', null)]), [])
  const a = detectarCambiosTarifa([trabajo('t1', '2026-09-01', 1000), trabajo('t2', '2026-09-15', null), trabajo('t3', '2026-10-01', 1000)])
  assert.deepEqual(a, [])
})

test('detector: riesgo distinto, modalidad distinta o producto distinto no se comparan', () => {
  assert.deepEqual(detectarCambiosTarifa([trabajo('t1', '2026-09-01', 1000), trabajo('t2', '2026-10-01', 1200, { ...RIESGO, m2Construidos: 1300 })]), [])
  assert.deepEqual(detectarCambiosTarifa([trabajo('t1', '2026-09-01', 1000), trabajo('t2', '2026-10-01', 1200, { ...RIESGO, modalidad: 'personalizado' })]), [])
  assert.deepEqual(detectarCambiosTarifa([trabajo('t1', '2026-09-01', 1000), trabajo('t2', '2026-10-01', 1200, RIESGO, 'Otro producto')]), [])
})

test('detector: misma prima con fechas de efecto distintas → sin alerta', () => {
  assert.deepEqual(detectarCambiosTarifa([trabajo('t1', '2026-09-01', 1000), trabajo('t2', '2026-10-01', 1004.99, { ...RIESGO, fechaEfecto: '2026-12-01' })]), [])
})

// ─── Métricas ────────────────────────────────────────────────────────────────

const t = (estado: string, dias: number, extra: Partial<{ iniciadoEn: string; terminadoEn: string; error: unknown }> = {}) => ({
  estado,
  creadoEn: new Date(HOY.getTime() - dias * 86_400_000).toISOString(),
  iniciadoEn: extra.iniciadoEn ?? null,
  terminadoEn: extra.terminadoEn ?? null,
  error: extra.error ?? null,
})

test('métricas: tasa = ok / (ok + fallidos); sin terminados → null, no 0 %', () => {
  const m = calcularMetricas([
    t('ok', 1, { iniciadoEn: '2026-10-06T10:00:00Z', terminadoEn: '2026-10-06T10:02:00Z' }),
    t('ok', 2, { iniciadoEn: '2026-10-05T10:00:00Z', terminadoEn: '2026-10-05T10:04:00Z' }),
    t('error_definitivo', 3, { error: { tipo: 'portal', mensaje: 'x' } }),
    t('requiere_humano', 20, { error: { tipo: 'datos', mensaje: 'Cotización detenida en el paso «login»: captcha' } }),
    t('pendiente', 0),
    t('cancelado', 0),
    t('ok', 40),
  ], HOY)
  assert.equal(m.d7.total, 5)
  assert.equal(m.d7.ok, 2)
  assert.equal(m.d7.fallidos, 1)
  assert.equal(m.d7.enCurso, 1)
  assert.equal(m.d7.cancelados, 1)
  assert.equal(m.d7.tasaExito, 66.7)
  assert.equal(m.d7.tiempoMedioSeg, 180)
  assert.equal(m.d30.fallidos, 2)
  assert.equal(m.d30.tasaExito, 50)
  assert.equal(calcularMetricas([t('pendiente', 1)], HOY).d7.tasaExito, null)
  assert.equal(calcularMetricas([t('ok', 1)], HOY).d7.tiempoMedioSeg, null)
})

test('fallos: agrupados por paso y forma del mensaje (cifras fuera), los más repetidos primero', () => {
  const m = calcularMetricas([
    t('error_definitivo', 1, { error: { tipo: 'portal', mensaje: 'timeout 30000 ms' } }),
    t('error_reintentable', 2, { error: { tipo: 'portal', mensaje: 'timeout 45000 ms' } }),
    t('requiere_humano', 3, { error: { tipo: 'datos', mensaje: 'Cotización detenida en el paso «formulario»: falta CP' } }),
    t('ok', 1),
  ], HOY)
  assert.equal(m.fallos.length, 2)
  assert.deepEqual([m.fallos[0].paso, m.fallos[0].mensaje, m.fallos[0].veces], ['portal', 'timeout # ms', 2])
  assert.equal(m.fallos[1].paso, 'formulario')
  assert.equal(pasoDelError(null), null)
})

// ─── Cableado ────────────────────────────────────────────────────────────────

test('cron de renovaciones: en vercel.json, con CRON_SECRET y sin pasar del tope', () => {
  const vercel = JSON.parse(readFileSync(join(APP, 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
  const c = vercel.crons.find((x) => x.path === '/api/cron/tarificador-renovaciones')
  assert.ok(c, 'falta el cron en vercel.json')
  const ruta = readFileSync(join(APP, 'app/api/cron/tarificador-renovaciones/route.ts'), 'utf8')
  assert.match(ruta, /isCronAuthorized\(/)
  assert.match(readFileSync(join(APP, 'lib/cron-auth.ts'), 'utf8'), /requireSecret\('CRON_SECRET'\)/)
  const ops = readFileSync(join(APP, 'lib/tarificador-ops.ts'), 'utf8')
  assert.match(ops, /if \(!renovacionesActivas\(env\)\) return \{ estado: 'apagado' \}/, 'apagado por defecto: no hace nada')
  assert.match(ops, /if \(!rpaActivo\(env\)\) return/, 'con el RPA apagado no encola')
  assert.match(ops, /elegirParaEncolar\(lista, cupo\)/, 'lo encolado pasa por el cupo')
  assert.match(ops, /solicitadoPor: ORIGEN_RENOVACION/, 'los trabajos llevan la marca de renovación')
})

test('panel de operador: Bearer de operador y nunca el riesgo hacia fuera', () => {
  const ruta = readFileSync(join(APP, 'app/api/operador/tarificador/panel/route.ts'), 'utf8')
  assert.match(ruta, /operadorAutorizado\(req\)/)
  const ops = readFileSync(join(APP, 'lib/tarificador-ops.ts'), 'utf8')
  assert.match(ops, /lista: renov\.slice\(0, 100\)\.map\(sinRiesgo\)/)
})
