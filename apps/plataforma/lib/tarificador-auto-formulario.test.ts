// Cepos de «Bots (gratis)» del cotizador de COCHE (14/10/2026, Mapfre NSEI). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { claveCerrada, formularioBotAuto, garajeNocheDeCodigo, type EntradaBotAuto } from './tarificador-auto-formulario.ts'
import { completarRiesgoAutoDesdeFicha, datoDePersonaBot, historialBot, mensajeFaltanDeFicha, type FichaParaBot } from './tarificador-moto-formulario.ts'

const HOY = new Date('2026-10-14T10:00:00Z')
const entrada = (c: Partial<EntradaBotAuto> = {}): EntradaBotAuto => ({
  matricula: '1234 BCD', marca: 'SEAT', modelo: 'IBIZA', version: '1.0 TSI 95 CV',
  codigoPostal: '41003', fechaNacimiento: '1985-04-12', fechaCarne: '2005-06-30', sexo: null, garaje: null,
  conductorEnOtraFicha: false, propietarioEnOtraFicha: false,
  tieneSeguroActual: true, aniosAsegurado: '8', aniosSinSiniestros: '8', siniestrosUltimos5: '',
  ...c,
})
const ok = (e: EntradaBotAuto) => {
  const r = formularioBotAuto(e, HOY)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r as Extract<typeof r, { ok: true }>
}
const faltan = (e: EntradaBotAuto) => {
  const r = formularioBotAuto(e, HOY)
  assert.equal(r.ok, false)
  return (r as Extract<typeof r, { ok: false }>).faltan.join(' | ')
}

test('completo: riesgo de AUTO con la forma de FormularioAuto (matrícula, CP de circulación, conductor, historial, vehículo)', () => {
  const r = ok(entrada())
  assert.deepEqual(r.completarDesdeFicha, [])
  assert.equal(r.riesgo.ramo, 'auto')
  assert.equal(r.riesgo.matricula, '1234BCD')
  assert.equal(r.riesgo.codigoPostal, '41003')
  assert.deepEqual(r.riesgo.conductor, { fechaNacimiento: '1985-04-12', fechaCarne: '2005-06-30', sexo: null })
  assert.deepEqual(r.riesgo.seleccionVehiculo, { marca: 'SEAT', modelo: 'IBIZA', descripcion: '1.0 TSI 95 CV' })
  assert.equal(r.riesgo.aniosAseguradoAnterior, 8)
  assert.equal(r.riesgo.siniestrosUltimos5Anios, 0) // 8 años sin siniestros ⇒ 0 en los últimos 5 (deducción)
  assert.equal(r.riesgo.garajeNoche, null) // garaje sin dato → no consta
  // Lo que FormularioAuto no tiene (matriculación, km) no viaja: no hay claves inventadas.
  assert.deepEqual(Object.keys(r.riesgo).sort(), ['ambitoCirculacion', 'aniosAseguradoAnterior', 'clasePermiso', 'codigoPostal', 'conductor', 'garajeNoche', 'matricula', 'ramo', 'seleccionVehiculo', 'siniestrosUltimos5Anios', 'tomadorEsConductor', 'tomadorEsPropietario', 'usoVehiculo'])
})

test('garaje: calle/vía pública → false; garajes → true; vacío o código no visto → null (no se traduce a ojo)', () => {
  assert.equal(garajeNocheDeCodigo('PublicRoad'), false)
  assert.equal(garajeNocheDeCodigo('Street'), false)
  for (const g of ['PrivateGarage', 'IndividualGarage', 'CommunalParking', 'Garage']) assert.equal(garajeNocheDeCodigo(g), true, g)
  for (const g of [null, undefined, '', 'Desconocido', 'publicroad']) assert.equal(garajeNocheDeCodigo(g), null, String(g))
  assert.equal(ok(entrada({ garaje: 'PublicRoad' })).riesgo.garajeNoche, false)
  assert.equal(ok(entrada({ garaje: 'PrivateGarage' })).riesgo.garajeNoche, true)
})

test('marca/modelo opcionales en coche (Mapfre confirma por matrícula): sin los dos, no viaja seleccionVehiculo', () => {
  assert.equal('seleccionVehiculo' in ok(entrada({ marca: null })).riesgo, false)
  assert.equal('descripcion' in (ok(entrada({ version: 'llamar al 600123456' })).riesgo.seleccionVehiculo as object), false)
})

test('historial que el bot exige y no consta → se ENSEÑA como falta (no se encola a ciegas, nunca 0 inventado)', () => {
  assert.match(faltan(entrada({ tieneSeguroActual: false })), /Seguro actual/)
  assert.match(faltan(entrada({ aniosAsegurado: '' })), /Años asegurado/)
  assert.match(faltan(entrada({ aniosSinSiniestros: '2', siniestrosUltimos5: '' })), /Siniestros con culpa/)
  assert.equal(ok(entrada({ aniosSinSiniestros: '2', siniestrosUltimos5: '0' })).riesgo.siniestrosUltimos5Anios, 0)
  assert.equal(ok(entrada({ aniosSinSiniestros: '2', siniestrosUltimos5: '1' })).riesgo.siniestrosUltimos5Anios, 1)
})

test('falta algo obligatorio → ok:false y dice CUÁL (sin valores); lo de la ficha va a completarDesdeFicha', () => {
  assert.match(faltan(entrada({ matricula: '' })), /Matrícula/)
  assert.match(faltan(entrada({ matricula: 'ZZZ' })), /Matrícula: no tiene formato/)
  assert.match(faltan(entrada({ codigoPostal: null })), /Código postal de circulación/)
  assert.match(faltan(entrada({ fechaNacimiento: null })), /nacimiento/)
  assert.match(faltan(entrada({ fechaCarne: null })), /carné B/)
  assert.match(faltan(entrada({ conductorEnOtraFicha: true })), /conductor habitual es otra ficha/)
  assert.match(faltan(entrada({ propietarioEnOtraFicha: true })), /propietario es otra ficha/)
  const t = faltan(entrada({ matricula: '9999ZZZ-mala', fechaCarne: 'nacido-el-1985' }))
  assert.equal(t.includes('9999ZZZ'), false)
  assert.equal(t.includes('1985'), false)
  const f = ok(entrada({ codigoPostal: 'ficha', fechaNacimiento: 'ficha', fechaCarne: 'ficha' }))
  assert.deepEqual(f.completarDesdeFicha, ['codigoPostal', 'fechaNacimiento', 'fechaCarne'])
  assert.equal('codigoPostal' in f.riesgo, false)
  assert.deepEqual(f.riesgo.conductor, { sexo: null })
})

test('la validación de forma real de asegura corre aquí cuando todo viaja del navegador', () => {
  assert.match(faltan(entrada({ fechaCarne: '2030-01-01' })), /futura/)
})

// ─── Servidor: completar con la ficha (carné B) ─────────────────────────────
const ficha = (c: Partial<FichaParaBot> = {}): FichaParaBot => ({
  contacto: { codigoPostal: '41003' },
  identidad: { fechaNacimiento: '1985-04-12' },
  dePolizas: null,
  carnets: [{ tipo: 'A', fechaExpedicion: '2001-01-01' }, { tipo: 'B', fechaExpedicion: '2004-02-02' }],
  ...c,
})
const base = { ramo: 'auto', conductor: { sexo: null } }

test('ficha (coche): CP, nacimiento y el carné B (no el de moto); respaldo en pólizas; lo que no hay → faltan', () => {
  const r = completarRiesgoAutoDesdeFicha(base, ficha(), ['codigoPostal', 'fechaNacimiento', 'fechaCarne'])
  assert.deepEqual(r.faltan, [])
  assert.equal(r.riesgo.codigoPostal, '41003')
  assert.deepEqual(r.riesgo.conductor, { sexo: null, fechaNacimiento: '1985-04-12', fechaCarne: '2004-02-02' })
  const soloMoto = completarRiesgoAutoDesdeFicha(base, ficha({ carnets: [{ tipo: 'A2', fechaExpedicion: '2001-01-01' }] }), ['fechaCarne'])
  assert.deepEqual(soloMoto.faltan, ['fechaCarne'])
  const pol = completarRiesgoAutoDesdeFicha(base, ficha({ carnets: null, dePolizas: { fechaNacimiento: null, fechaCarnet: '2006-03-03' } }), ['fechaCarne'])
  assert.deepEqual(pol.riesgo.conductor, { sexo: null, fechaCarne: '2006-03-03' })
  assert.match(mensajeFaltanDeFicha(['fechaCarne'], 'auto'), /carné B \(coche\)/)
})

test('historialBot y datoDePersonaBot (compartidos con moto)', () => {
  assert.deepEqual(historialBot({ tieneSeguroActual: false, aniosAsegurado: '9', aniosSinSiniestros: '9', siniestrosUltimos5: '0' }), { aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null })
  assert.deepEqual(historialBot({ tieneSeguroActual: true, aniosAsegurado: 'x', aniosSinSiniestros: '', siniestrosUltimos5: '' }), { aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null })
  assert.equal(datoDePersonaBot('fechaCarnet', [], { fechaCarnet: ' 2005-01-01 ' }), '2005-01-01')
  assert.equal(datoDePersonaBot('fechaCarnet', [{ campo: 'fechaCarnet' }], {}), null)
  assert.equal(datoDePersonaBot('fechaCarnet', null, {}), 'ficha')
  assert.equal(datoDePersonaBot('fechaCarnet', [{ campo: 'dni' }], {}), 'ficha')
})

// ─── Cepos de fuente ────────────────────────────────────────────────────────
const APP = join(import.meta.dirname, '..')
const leer = (...r: string[]) => readFileSync(join(APP, ...r), 'utf8')

test('cotizador de coche monta «Bots (gratis)» con ramo auto; garaje solo si es dato; la ruta acepta auto con su carné', () => {
  const c = leer('app', '(usuario)', 'correduria', 'cliente', '[id]', 'auto-nuevo', 'AutoNuevo.tsx')
  assert.match(c, /<PrecioBots\s+ramo="auto"/)
  // 15/10/2026: el del riesgo viaja (antes iba null con el cotizador abierto); el defecto de la pantalla no (`garajeParaBot`).
  assert.match(c, /garaje: garajeParaBot\(\{ garajeRiesgo: datosRiesgo\?\.garaje, actual: garaje, elegido: garajeElegido\.current, resueltoDelRiesgo: garajeDelRiesgo \}\)/)
  const r = leer('app', 'api', 'correduria', 'tarificador', 'encolar', 'route.ts')
  assert.match(r, /b\.ramo !== 'moto' && b\.ramo !== 'auto'/)
  assert.match(r, /completarRiesgoVehiculoDesdeFicha\(vehiculo, /)
  assert.match(r, /encolarTarificacionVehiculo\(vehiculo, /)
})

test('uso, ámbito, clase del permiso y compañía anterior (Mapfre, 14/10/2026): defectos de coche, valores cerrados, sin inventar', () => {
  const d = ok(entrada())
  assert.deepEqual([d.riesgo.usoVehiculo, d.riesgo.ambitoCirculacion, d.riesgo.clasePermiso], ['particular', 'espana', 'b'])
  assert.equal('companiaAnterior' in d.riesgo, false, 'sin nombre no viaja compañía anterior')
  const x = ok(entrada({ usoVehiculo: 'Particular', ambitoCirculacion: ' espana ', clasePermiso: 'A2', companiaAnterior: '  Compañía   Ejemplo ' }))
  assert.deepEqual([x.riesgo.usoVehiculo, x.riesgo.ambitoCirculacion, x.riesgo.clasePermiso, x.riesgo.companiaAnterior], ['particular', 'espana', 'a2', 'Compañía Ejemplo'])
  assert.equal(ok(entrada({ usoVehiculo: '', clasePermiso: null })).riesgo.clasePermiso, 'b')
  assert.equal('companiaAnterior' in ok(entrada({ companiaAnterior: 'x'.repeat(81) })).riesgo, false)
  const mal = faltan(entrada({ usoVehiculo: 'taxi-zzz', clasePermiso: 'Z9zzz' }))
  assert.match(mal, /Uso del vehículo/)
  assert.match(mal, /Clase del permiso/)
  assert.doesNotMatch(mal, /zzz/, 'el valor no se repite')
  assert.equal(claveCerrada('', ['b'], 'b'), 'b')
  assert.equal(claveCerrada('c', ['b'], 'b'), undefined)
})
