// Cepos de «Precio por bot (gratis)» del cotizador de moto (13/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  claseMotoPorCilindrada, claveDeCompania, cilindradaDeTexto, completarRiesgoMotoDesdeFicha, formularioBotMoto, leerEncoladoBot,
  mensajeFaltanDeFicha, type EntradaBotMoto, type FichaParaBot,
} from './tarificador-moto-formulario.ts'

const HOY = new Date('2026-10-13T10:00:00Z')
const entrada = (c: Partial<EntradaBotMoto> = {}): EntradaBotMoto => ({
  matricula: '1234 BCD', marca: 'YAMAHA', modelo: 'MT-07', version: 'MT-07 74 CV', cilindrada: '689',
  codigoPostal: '41003', fechaNacimiento: '1985-04-12', fechaCarne: '2005-06-30', sexo: null,
  conductorEnOtraFicha: false, propietarioEnOtraFicha: false,
  tieneSeguroActual: true, aniosAsegurado: '8', aniosSinSiniestros: '8', siniestrosUltimos5: '',
  ...c,
})
const ok = (e: EntradaBotMoto) => {
  const r = formularioBotMoto(e, HOY)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r as Extract<typeof r, { ok: true }>
}
const faltan = (e: EntradaBotMoto) => {
  const r = formularioBotMoto(e, HOY)
  assert.equal(r.ok, false)
  return (r as Extract<typeof r, { ok: false }>).faltan.join(' | ')
}

test('completo: riesgo de moto con la forma de FormularioAuto, sin inventar nada', () => {
  const r = ok(entrada())
  assert.deepEqual(r.completarDesdeFicha, [])
  assert.equal(r.riesgo.ramo, 'moto')
  assert.equal(r.riesgo.matricula, '1234BCD')
  assert.equal(r.riesgo.codigoPostal, '41003')
  assert.deepEqual(r.riesgo.conductor, { fechaNacimiento: '1985-04-12', fechaCarne: '2005-06-30', sexo: null })
  assert.deepEqual(r.riesgo.seleccionVehiculo, { marca: 'YAMAHA', modelo: 'MT-07', clase: 3, cilindradaCc: 689, descripcion: 'MT-07 74 CV' })
  // El garaje del cotizador es un supuesto, no un dato; los años sin siniestros < 5 no autorizan a inventar siniestros.
  assert.equal(r.riesgo.garajeNoche, null)
  assert.equal(r.riesgo.aniosAseguradoAnterior, 8)
  assert.equal(r.riesgo.siniestrosUltimos5Anios, 0) // 8 años sin siniestros ⇒ 0 en los últimos 5
})

test('siniestros: sin 5 años limpios y sin dato declarado → null (no consta), nunca 0', () => {
  assert.equal(ok(entrada({ aniosSinSiniestros: '2', siniestrosUltimos5: '' })).riesgo.siniestrosUltimos5Anios, null)
  assert.equal(ok(entrada({ aniosSinSiniestros: '2', siniestrosUltimos5: '1' })).riesgo.siniestrosUltimos5Anios, 1)
  assert.equal(ok(entrada({ aniosSinSiniestros: '2', siniestrosUltimos5: '0' })).riesgo.siniestrosUltimos5Anios, 0)
})

test('sin seguro actual: 0 años asegurado (no hay compañía anterior que nombrar); siniestros no constan (null)', () => {
  const r = ok(entrada({ tieneSeguroActual: false }))
  assert.equal(r.riesgo.aniosAseguradoAnterior, 0)
  assert.equal(r.riesgo.siniestrosUltimos5Anios, null)
})

test('seguro actual NO SE SABE (null): no es «sin seguro» → años null (supuesto favorable), nunca 0/novel; la compañía anterior sigue viajando', () => {
  const r = ok(entrada({ tieneSeguroActual: null, aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '' }))
  assert.equal(r.riesgo.aniosAseguradoAnterior, null)
  assert.equal(r.riesgo.siniestrosUltimos5Anios, null)
  assert.equal(ok(entrada({ tieneSeguroActual: null, aniosAsegurado: '', companiaAnterior: 'Línea Directa' })).riesgo.companiaAnterior, 'Línea Directa')
  assert.equal(ok(entrada({ tieneSeguroActual: false, companiaAnterior: 'Línea Directa' })).riesgo.aniosAseguradoAnterior, 0)
})

test('tieneSeguroParaBots: tres estados; la casilla sin tocar y sin dato NO es «no tiene»', async () => {
  const { tieneSeguroParaBots } = await import('./tarificador-moto-formulario.ts')
  assert.equal(tieneSeguroParaBots({ tiene: true, sinDato: true, tocado: true }), true)
  assert.equal(tieneSeguroParaBots({ tiene: true, sinDato: false, tocado: false }), true)
  assert.equal(tieneSeguroParaBots({ tiene: false, sinDato: true, tocado: false }), null, 'sin dato y sin tocar: no se sabe')
  assert.equal(tieneSeguroParaBots({ tiene: false, sinDato: true, tocado: true }), false, 'desmarcada a propósito')
  assert.equal(tieneSeguroParaBots({ tiene: false, sinDato: false, tocado: false }), false, 'declarado arriba: no tiene')
})

test('sexo: solo hombre/mujer elegidos; otra cosa → null', () => {
  assert.equal((ok(entrada({ sexo: 'mujer' })).riesgo.conductor as { sexo: unknown }).sexo, 'mujer')
  assert.equal((ok(entrada({ sexo: 'x' })).riesgo.conductor as { sexo: unknown }).sexo, null)
})

test('lo que está en la ficha no se inventa: va a completarDesdeFicha y el riesgo no lo lleva', () => {
  const r = ok(entrada({ codigoPostal: 'ficha', fechaNacimiento: 'ficha', fechaCarne: 'ficha' }))
  assert.deepEqual(r.completarDesdeFicha, ['codigoPostal', 'fechaNacimiento', 'fechaCarne'])
  assert.equal('codigoPostal' in r.riesgo, false)
  assert.deepEqual(r.riesgo.conductor, { sexo: null })
})

test('falta algo obligatorio → ok:false y dice CUÁL (sin valores)', () => {
  assert.match(faltan(entrada({ matricula: '' })), /Matrícula/)
  assert.match(faltan(entrada({ matricula: 'ZZZ' })), /Matrícula: no tiene formato/)
  assert.match(faltan(entrada({ marca: null })), /Marca y modelo/)
  assert.match(faltan(entrada({ modelo: ' ' })), /Marca y modelo/)
  assert.match(faltan(entrada({ cilindrada: '' })), /Cilindrada/)
  assert.match(faltan(entrada({ cilindrada: 'abc' })), /Cilindrada/)
  assert.match(faltan(entrada({ cilindrada: '50' })), /ciclomotor/)
  assert.match(faltan(entrada({ codigoPostal: null })), /Código postal/)
  assert.match(faltan(entrada({ fechaNacimiento: null })), /nacimiento/)
  assert.match(faltan(entrada({ fechaCarne: null })), /carné/)
  assert.match(faltan(entrada({ fechaCarne: '30/06/2005' })), /formato no válido/)
  assert.match(faltan(entrada({ conductorEnOtraFicha: true })), /conductor habitual es otra ficha/)
  assert.match(faltan(entrada({ propietarioEnOtraFicha: true })), /propietario es otra ficha/)
  // Varias a la vez: se listan todas.
  assert.equal(faltan(entrada({ matricula: '', marca: null, cilindrada: '' })).split(' | ').length, 3)
})

test('nunca repite el valor personal en lo que falta', () => {
  const t = faltan(entrada({ matricula: '9999ZZZ-mala', fechaCarne: 'nacido-el-1985' }))
  assert.equal(t.includes('9999ZZZ'), false)
  assert.equal(t.includes('1985'), false)
})

test('la validación de forma real de asegura corre aquí cuando todo viaja del navegador (conductor menor, carné futuro…)', () => {
  assert.match(faltan(entrada({ fechaNacimiento: '2020-01-01', fechaCarne: '2025-01-01' })), /edad fuera de rango/)
  assert.match(faltan(entrada({ fechaCarne: '2030-01-01' })), /futura/)
})

test('versión con forma de dato personal no viaja como descripción (pero el resto sí)', () => {
  const r = ok(entrada({ version: 'contacto juan@correo.es' }))
  assert.equal('descripcion' in (r.riesgo.seleccionVehiculo as object), false)
})

test('clase y cilindrada por tramos del portal', () => {
  assert.deepEqual([50, 51, 125, 126, 350, 351, 750, 751, 1200].map(claseMotoPorCilindrada), [null, 1, 1, 2, 2, 3, 3, 4, 4])
  assert.equal(claseMotoPorCilindrada(null), null)
  assert.equal(cilindradaDeTexto('1.000'), 1000)
  assert.equal(cilindradaDeTexto('125 cc'), 125)
  assert.equal(cilindradaDeTexto('12,5'), null)
  assert.equal(cilindradaDeTexto(''), null)
})

// ─── Servidor: completar con la ficha ───────────────────────────────────────

const ficha = (c: Partial<FichaParaBot> = {}): FichaParaBot => ({
  contacto: { codigoPostal: '41003' },
  identidad: { fechaNacimiento: '1985-04-12' },
  dePolizas: null,
  carnets: [{ tipo: 'B', fechaExpedicion: '2003-01-01' }, { tipo: 'A2', fechaExpedicion: '2007-05-05' }, { tipo: 'A', fechaExpedicion: '2005-06-30' }],
  ...c,
})
const base = { ramo: 'moto', conductor: { sexo: null } }

test('ficha: pone CP, nacimiento y el carné de MOTO más antiguo (no el B)', () => {
  const r = completarRiesgoMotoDesdeFicha(base, ficha(), ['codigoPostal', 'fechaNacimiento', 'fechaCarne'])
  assert.deepEqual(r.faltan, [])
  assert.equal(r.riesgo.codigoPostal, '41003')
  assert.deepEqual(r.riesgo.conductor, { sexo: null, fechaNacimiento: '1985-04-12', fechaCarne: '2005-06-30' })
})

test('ficha: solo lo pedido, y nunca pisa lo que ya viene', () => {
  const r = completarRiesgoMotoDesdeFicha({ ...base, codigoPostal: '28001', conductor: { fechaNacimiento: '1990-01-01' } }, ficha(), ['codigoPostal', 'fechaNacimiento'])
  assert.equal(r.riesgo.codigoPostal, '28001')
  assert.deepEqual(r.riesgo.conductor, { fechaNacimiento: '1990-01-01' })
  const sin = completarRiesgoMotoDesdeFicha(base, ficha(), [])
  assert.equal('codigoPostal' in sin.riesgo, false)
})

test('ficha: lo que no tiene → faltan (nada inventado); sin ficha → todo falta', () => {
  const r = completarRiesgoMotoDesdeFicha(base, ficha({ carnets: [{ tipo: 'B', fechaExpedicion: '2003-01-01' }], identidad: null, contacto: { codigoPostal: '4100' } }), ['codigoPostal', 'fechaNacimiento', 'fechaCarne'])
  assert.deepEqual(r.faltan, ['codigoPostal', 'fechaNacimiento', 'fechaCarne'])
  assert.deepEqual(completarRiesgoMotoDesdeFicha(base, null, ['fechaCarne']).faltan, ['fechaCarne'])
  assert.match(mensajeFaltanDeFicha(['fechaNacimiento', 'fechaCarne']), /fecha de nacimiento, la fecha del carné de moto/)
})

test('ficha: respaldo en lo que traen sus pólizas', () => {
  const r = completarRiesgoMotoDesdeFicha(base, ficha({ identidad: null, carnets: [], dePolizas: { fechaNacimiento: '1986-02-02', fechaCarnet: '2006-03-03' } }), ['fechaNacimiento', 'fechaCarne'])
  assert.deepEqual(r.riesgo.conductor, { sexo: null, fechaNacimiento: '1986-02-02', fechaCarne: '2006-03-03' })
})

// ─── Cliente: respuesta de encolar ──────────────────────────────────────────

const ID = '11111111-2222-3333-4444-555555555555'
test('encolar: 202 con trabajo, duplicado y errores legibles', () => {
  assert.deepEqual(leerEncoladoBot(202, { estado: 'encolado', trabajoId: ID, duplicado: false }), { ok: true, trabajoId: ID, duplicado: false })
  assert.deepEqual(leerEncoladoBot(202, { estado: 'encolado', trabajoId: ID, duplicado: true }), { ok: true, trabajoId: ID, duplicado: true })
  const e400 = leerEncoladoBot(400, { estado: 'error', errores: ['conductor: obligatorio'] })
  assert.equal(e400.ok, false)
  assert.match((e400 as { mensaje: string }).mensaje, /conductor: obligatorio/)
  assert.match((leerEncoladoBot(422, { mensaje: 'La ficha del cliente no tiene la fecha de nacimiento.' }) as { mensaje: string }).mensaje, /fecha de nacimiento/)
  assert.match((leerEncoladoBot(409, { mensaje: 'Esa compañía no tiene el bot activo para este ramo.' }) as { mensaje: string }).mensaje, /no tiene el bot activo/)
  assert.equal(leerEncoladoBot(202, { estado: 'encolado' }).ok, false)
  assert.equal(leerEncoladoBot(503, { estado: 'apagado' }).ok, false)
})

test('clave de compañía: minúsculas y forma de clave', () => {
  assert.equal(claveDeCompania(' Allianz '), 'allianz')
  assert.equal(claveDeCompania('x y'), null)
  assert.equal(claveDeCompania(''), null)
  assert.equal(claveDeCompania(7), null)
})

// ─── Cepos de fuente (lo que tsc no ve) ─────────────────────────────────────

const APP = join(import.meta.dirname, '..')
const leer = (...r: string[]) => readFileSync(join(APP, ...r), 'utf8')

test('ruta de encolar: la compañía solo vale si está entre las integraciones activas (fail-closed) y no se registra nada', () => {
  const f = leer('app', 'api', 'correduria', 'tarificador', 'encolar', 'route.ts')
  assert.match(f, /leerIntegracionesTarificador\(\)/)
  assert.match(f, /i\.compania === c && i\.ramo === ramo/)
  assert.match(f, /!l\.ok\) return NextResponse\.json[^\n]*502/) // lista ilegible = se corta
  assert.doesNotMatch(f, /console\./)
})

test('bloque «Bots (gratis)»: sin emisión, un botón por integración del ramo, doble clic guardado, un solo montaje por pantalla', () => {
  const f = leer('app', '(usuario)', 'correduria', 'cliente', '[id]', 'PrecioBots.tsx')
  assert.match(f, /i\.ramo === ramo/)
  assert.match(f, /enVuelo\.current/)
  assert.match(f, /disabled=\{!formulario\.ok \|\| ocupado\}/)
  assert.match(f, /\/correduria\/tarificador/) // la elección de versión apunta a la bandeja «Necesita tu atención»
  assert.doesNotMatch(f, /Probar tarificación/)
  assert.doesNotMatch(f, /emitir|emision|console\./i)
  const c = leer('app', '(usuario)', 'correduria', 'cliente', '[id]', 'moto-nuevo', 'CotizadorMoto.tsx')
  assert.match(c, /<PrecioBots/)
  assert.doesNotMatch(c, /PrecioPorBot/)
  const e = leer('app', '(usuario)', 'correduria', 'oportunidad', '[id]', 'PedirPrecioEmbebido.tsx')
  assert.match(e, /HuecoBotsContext\.Provider/)
  assert.match(e, /Avant2 — 0,50€ por petición/)
  assert.match(e, /!ramoConAdaptador && <PrecioBots/) // la carcasa solo monta el suyo si el cotizador del ramo no lo hace
})

test('companiaActualParaBots: la compañía elegida arriba viaja al bot (código DGS → nombre común)', async () => {
  const { companiaActualParaBots } = await import('./tarificador-moto-formulario.ts')
  const cat = [{ codigoDgs: 'C0001', nombreComun: 'Aseguradora Beta' }]
  const base = { tieneSeguroActual: true, companias: cat, codigo: 'C0001', libre: '' }
  assert.equal(companiaActualParaBots(base), 'Aseguradora Beta')
  assert.equal(companiaActualParaBots({ ...base, codigo: '', libre: '  Texto   libre ' }), 'Texto libre')
  assert.equal(companiaActualParaBots({ ...base, companias: null, codigo: '', libre: 'C0001' }), 'C0001')
  assert.equal(companiaActualParaBots({ ...base, codigo: '', leida: ' Aseguradora Gamma ' }), 'Aseguradora Gamma')
  assert.equal(companiaActualParaBots({ ...base, codigo: 'C9999' }), null, 'código fuera de catálogo y sin texto: no consta')
  assert.equal(companiaActualParaBots({ ...base, tieneSeguroActual: false }), null)
  // de punta a punta: con años = 0 el formulario descarta la compañía; con años > 0 la lleva
  const nombre = companiaActualParaBots(base)
  assert.equal('companiaAnterior' in ok(entrada({ aniosAsegurado: '0', companiaAnterior: nombre })).riesgo, false)
  assert.equal(ok(entrada({ aniosAsegurado: '8', companiaAnterior: nombre })).riesgo.companiaAnterior, 'Aseguradora Beta')
})

test('poblacion: el municipio elegido viaja en el riesgo; vacío o con caracteres prohibidos no viaja', () => {
  assert.equal(ok(entrada({ poblacion: '  Villa   Álamo ' })).riesgo.poblacion, 'Villa Álamo')
  for (const p of [null, undefined, '', '   ', 'x'.repeat(81), 'Villa <Álamo>']) assert.equal('poblacion' in ok(entrada({ poblacion: p })).riesgo, false, String(p))
})
