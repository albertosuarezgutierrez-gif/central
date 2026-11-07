// Cepos de la RETENCIÓN DE CARTERA F1 (07/11/2026). Datos sintéticos; fechas RELATIVAS a un `hoy` inyectado (sin reloj real).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  DIAS_ANTELACION_DEFECTO, HORIZONTE_MAX_DIAS, UMBRAL_SUBIDA_DEFECTO,
  accionesPendientes, botonesResumenDiario, cicloDeAnualidad, diasHasta, etapaRenovacion, modoRetencion, preferenciasEfectivas,
  subidaPrimaRenovacion, textoEnsayo, textoResumenDiario, type LineaPoliza,
} from './retencion-cartera-reglas.ts'

const HOY = '2030-03-10'
const mas = (d: number) => new Date(Date.parse(`${HOY}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10)
const hogar = (dias: number | null) => ({ enVigor: true, ramo: 'hogar', vencimiento: dias === null ? null : mas(dias) })

test('diasHasta: días naturales, fecha ilegible = null', () => {
  assert.equal(diasHasta(mas(40), HOY), 40)
  assert.equal(diasHasta(mas(-1), HOY), -1)
  assert.equal(diasHasta('basura', HOY), null)
})

test('etapas con el defecto (D = 40): 60 datos · 45 bots · 40 propuesta · ≤30 tarde', () => {
  assert.equal(etapaRenovacion(hogar(61), HOY), 'fuera')
  assert.equal(etapaRenovacion(hogar(60), HOY), 't60_datos')
  assert.equal(etapaRenovacion(hogar(46), HOY), 't60_datos')
  assert.equal(etapaRenovacion(hogar(45), HOY), 't45_bots')
  assert.equal(etapaRenovacion(hogar(41), HOY), 't45_bots')
  assert.equal(etapaRenovacion(hogar(40), HOY), 't40_propuesta')
  assert.equal(etapaRenovacion(hogar(31), HOY), 't40_propuesta')
  assert.equal(etapaRenovacion(hogar(30), HOY), 'tarde')
  assert.equal(etapaRenovacion(hogar(0), HOY), 'tarde')
  assert.equal(etapaRenovacion(hogar(-1), HOY), 'vencida')
})

test('no en vigor, otro ramo o sin vencimiento: nunca entra en el calendario', () => {
  assert.equal(etapaRenovacion({ enVigor: false, ramo: 'hogar', vencimiento: mas(40) }, HOY), 'no_aplica')
  assert.equal(etapaRenovacion({ enVigor: true, ramo: 'vida', vencimiento: mas(40) }, HOY), 'no_aplica')
  assert.equal(etapaRenovacion({ enVigor: true, ramo: null, vencimiento: mas(40) }, HOY), 'no_aplica')
  assert.equal(etapaRenovacion(hogar(null), HOY), 'sin_vencimiento')
  assert.equal(etapaRenovacion({ enVigor: true, ramo: 'auto', vencimiento: mas(40) }, HOY), 't40_propuesta')
})

test('preferencia del cliente desplaza TODO el calendario (D = 70 → 90/75/70)', () => {
  const pref = { diasAntelacion: 70, umbralSubidaPct: null }
  assert.equal(etapaRenovacion(hogar(91), HOY, pref), 'fuera')
  assert.equal(etapaRenovacion(hogar(90), HOY, pref), 't60_datos')
  assert.equal(etapaRenovacion(hogar(75), HOY, pref), 't45_bots')
  assert.equal(etapaRenovacion(hogar(70), HOY, pref), 't40_propuesta')
  assert.equal(etapaRenovacion(hogar(40), HOY, pref), 't40_propuesta')
  assert.equal(etapaRenovacion(hogar(30), HOY, pref), 'tarde')
  assert.ok(HORIZONTE_MAX_DIAS >= 90 + 20)
})

test('preferencias: nulo = defecto; fuera de rango = defecto marcado «invalida» (nunca recortado)', () => {
  assert.deepEqual(preferenciasEfectivas(null), { diasAntelacion: DIAS_ANTELACION_DEFECTO, umbralSubidaPct: UMBRAL_SUBIDA_DEFECTO, origen: 'defecto' })
  assert.deepEqual(preferenciasEfectivas({ diasAntelacion: null, umbralSubidaPct: 5 }), { diasAntelacion: 40, umbralSubidaPct: 5, origen: 'cliente' })
  assert.deepEqual(preferenciasEfectivas({ diasAntelacion: 0, umbralSubidaPct: 0 }).diasAntelacion, 40) // 0 no es «nulo»: inválido
  assert.equal(preferenciasEfectivas({ diasAntelacion: 0, umbralSubidaPct: null }).origen, 'invalida')
  assert.equal(preferenciasEfectivas({ diasAntelacion: 34, umbralSubidaPct: null }).diasAntelacion, 40)
  assert.equal(preferenciasEfectivas({ diasAntelacion: 91, umbralSubidaPct: null }).diasAntelacion, 40)
  assert.equal(preferenciasEfectivas({ diasAntelacion: 35, umbralSubidaPct: 50 }).origen, 'cliente')
  assert.equal(preferenciasEfectivas({ diasAntelacion: null, umbralSubidaPct: 51 }).umbralSubidaPct, 10)
  assert.equal(preferenciasEfectivas({ diasAntelacion: null, umbralSubidaPct: 0 }).umbralSubidaPct, 0) // 0 % es un valor válido
})

test('acciones: hogar por etapa, recuperando lo saltado; auto solo propuesta; nada dos veces', () => {
  assert.deepEqual(accionesPendientes('t60_datos', 'hogar', null), ['datos'])
  assert.deepEqual(accionesPendientes('t45_bots', 'hogar', null), ['datos', 'bots'])
  assert.deepEqual(accionesPendientes('t40_propuesta', 'hogar', null), ['bots', 'propuesta'])
  assert.deepEqual(accionesPendientes('t40_propuesta', 'auto', null), ['propuesta'])
  assert.deepEqual(accionesPendientes('t60_datos', 'auto', null), [])
  const hecho = { datosAt: '2030-01-01', botsAt: '2030-01-02', propuestaAt: null, subidaAvisadaAt: null }
  assert.deepEqual(accionesPendientes('t45_bots', 'hogar', hecho), [])
  assert.deepEqual(accionesPendientes('t40_propuesta', 'hogar', hecho), ['propuesta'])
  assert.deepEqual(accionesPendientes('t40_propuesta', 'hogar', { ...hecho, propuestaAt: new Date() }), [])
  for (const e of ['tarde', 'vencida', 'fuera', 'no_aplica', 'sin_vencimiento'] as const) assert.deepEqual(accionesPendientes(e, 'hogar', null), [])
})

test('anualidad: un vencimiento corregido unos días es la MISMA; el del año siguiente, otra', () => {
  const ciclos = [{ id: 'a', vencimiento: '2030-04-20' }, { id: 'b', vencimiento: '2029-04-20' }]
  assert.equal(cicloDeAnualidad(ciclos, '2030-04-22')?.id, 'a')
  assert.equal(cicloDeAnualidad(ciclos, '2030-04-20')?.id, 'a')
  assert.equal(cicloDeAnualidad(ciclos, '2031-04-20'), null)
  assert.equal(cicloDeAnualidad([], '2030-04-20'), null)
})

const R = (fin: string, prima: string, extra: Partial<{ claseRecibo: string; situacion: string }> = {}) => ({ claseRecibo: 'CA', situacion: 'cobrado', primaTotal: prima, fechaVencimiento: fin, ...extra })

test('subida: CIMA trae el recibo de la anualidad nueva y sube > umbral', () => {
  const venc = mas(50)
  const recibos = [R(venc, '300.00'), R(mas(50 + 365), '345.00', { situacion: 'pendiente' })]
  const s = subidaPrimaRenovacion({ recibos, vencimiento: venc, fraccionamiento: 'anual', umbralPct: 10 })
  assert.deepEqual(s, { estado: 'subida', anterior: 300, nueva: 345, pct: 15 })
  assert.equal(subidaPrimaRenovacion({ recibos, vencimiento: venc, fraccionamiento: 'anual', umbralPct: 15 }).estado, 'sin_subida') // estrictamente mayor
  assert.equal(subidaPrimaRenovacion({ recibos, vencimiento: venc, fraccionamiento: 'anual', umbralPct: 20 }).estado, 'sin_subida')
})

test('subida: sin recibo nuevo, fraccionado, anulado o importe ilegible = sin_dato (nunca «no sube»)', () => {
  const venc = mas(50)
  assert.equal(subidaPrimaRenovacion({ recibos: [R(venc, '300.00')], vencimiento: venc, fraccionamiento: 'anual', umbralPct: 10 }).estado, 'sin_dato')
  const dos = [R(venc, '300.00'), R(mas(415), '400.00')]
  assert.equal(subidaPrimaRenovacion({ recibos: dos, vencimiento: venc, fraccionamiento: 'mensual', umbralPct: 10 }).estado, 'sin_dato')
  assert.equal(subidaPrimaRenovacion({ recibos: dos, vencimiento: venc, fraccionamiento: null, umbralPct: 10 }).estado, 'sin_dato')
  assert.equal(subidaPrimaRenovacion({ recibos: [R(venc, '300.00'), R(mas(415), '400.00', { situacion: 'anulado' })], vencimiento: venc, fraccionamiento: 'anual', umbralPct: 10 }).estado, 'sin_dato')
  assert.equal(subidaPrimaRenovacion({ recibos: [R(venc, '300,00'), R(mas(415), '400.00')], vencimiento: venc, fraccionamiento: 'anual', umbralPct: 10 }).estado, 'sin_dato')
  assert.equal(subidaPrimaRenovacion({ recibos: [R(venc, '300.00'), R(mas(415), '400.00', { claseRecibo: 'SU' })], vencimiento: venc, fraccionamiento: 'anual', umbralPct: 10 }).estado, 'sin_dato')
})

test('interruptor: solo «1» activa; ?contar=1 siempre ensayo', () => {
  assert.equal(modoRetencion({}, false), 'ensayo')
  assert.equal(modoRetencion({ RENOVACION_AUTO_ACTIVA: 'true' }, false), 'ensayo')
  assert.equal(modoRetencion({ RENOVACION_AUTO_ACTIVA: '0' }, false), 'ensayo')
  assert.equal(modoRetencion({ RENOVACION_AUTO_ACTIVA: '1' }, false), 'activo')
  assert.equal(modoRetencion({ RENOVACION_AUTO_ACTIVA: '1' }, true), 'ensayo')
})

const L = (over: Partial<LineaPoliza>): LineaPoliza => ({
  polizaId: '11111111-1111-4111-8111-111111111111', nombre: 'Lucía', ramo: 'hogar', compania: 'Allianz', vencimiento: mas(40),
  etapa: 't40_propuesta', acciones: ['propuesta'], subida: { estado: 'sin_dato' }, ...over,
})

test('ensayo: dice que no ha hecho nada, cuenta por etapa y qué HARÍA; sin apellidos ni identificadores', () => {
  const t = textoEnsayo({ lineas: [L({}), L({ etapa: 'tarde', acciones: [] }), L({ etapa: 't60_datos', acciones: ['datos'], subida: { estado: 'subida', anterior: 300, nueva: 345, pct: 15 } })], motivo: 'interruptor', preferenciasLeidas: true })
  assert.match(t, /ENSAYO/)
  assert.match(t, /no he creado ni enviado nada/)
  assert.match(t, /1 en datos · 0 en bots · 1 en propuesta · 1 tarde/)
  assert.match(t, /haría: prepararte la propuesta/)
  assert.match(t, /sube 15 %/)
  assert.doesNotMatch(t, /11111111/)
  assert.match(textoEnsayo({ lineas: [], motivo: 'sin_migracion', preferenciasLeidas: false }), /Falta la migración[\s\S]*valores por defecto/)
})

test('resumen diario: enumera cada propuesta y sus botones SOLO son enlaces (ninguno envía)', () => {
  const lineas = [L({ resultados: { propuesta: 'preparada' } }), L({ nombre: 'Pedro', ramo: 'auto', resultados: { propuesta: 'sin_ofertas' } })]
  const t = textoResumenDiario({ lineas, preferenciasLeidas: true })
  assert.match(t, /Propuestas listas para revisar \(1\)/)
  assert.match(t, /Lucía · hogar · Allianz/)
  assert.match(t, /Pedro · auto[\s\S]*propuesta: sin_ofertas/)
  const b = botonesResumenDiario(lineas, (id) => `https://p/x/${id}`)
  assert.equal(b.length, 1)
  for (const fila of b) for (const x of fila) { assert.ok(x.url); assert.equal((x as { callback?: string }).callback, undefined) }
})

test('cepo de fuente: el lib de BD nunca llama a Avant2 ni publica al cliente por su cuenta', () => {
  const src = readFileSync(new URL('./retencion-cartera.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /codeoscopic|retarificar|tarificarAvant2|Avant2Real/i)
  assert.doesNotMatch(src, /publicarRenovacion\(|publicarSolicitudRenovacion\(|avisarPresupuesto\(/)
  assert.match(src, /vencimientoConRecibos/)
  assert.match(src, /esCarteraEnVigor|WHERE_CARTERA_EN_VIGOR/)
})
