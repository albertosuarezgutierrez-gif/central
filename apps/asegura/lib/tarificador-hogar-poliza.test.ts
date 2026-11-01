// «Probar» de HOGAR desde la póliza en vigor (01/11/2026). `node --test`. Datos FICTICIOS; sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { firmezaPrecioRpa } from '@central/module-tarificacion'
import { SUPUESTOS_HOGAR_DESDE_POLIZA, elegirReconstruccionHogar, polizasHogarEnVigor, riesgoHogarDePolizas, type FilaPolizaHogar } from './tarificador-hogar-poliza.ts'
import { decidirRiesgoProbar, type ReconstruccionRiesgo } from './tarificador-relanzar-reglas.ts'
import { validarEntradaRamo } from './tarificador-reglas.ts'

const AHORA = new Date('2026-11-01T10:00:00Z')
const CLARO = 'CALLE FICTICIA 7 2º B'
const descifrar = (v: string) => (v === 'v1:malo' ? (() => { throw new Error('x') })() : v === 'v1:otra' ? 'AVENIDA OTRA 12' : CLARO)
const datos = (x: Record<string, unknown> = {}) => ({
  direccion: 'v1:aaa', cp: '41003', localidad: 'SEVILLA', metrosCuadrados: '76.00', anioConstruccionCima: '1994', usoInmueble: 'HA', claseInmueble: 'PI', ...x,
})
const fila = (x: Partial<FilaPolizaHogar> = {}): FilaPolizaHogar => ({
  id: 'p1', desde: '2015-09-30', estado: 'activa', importRef: null, eiacXmlHash: 'h', sustituidaAt: null, datosEspecificos: datos(), ...x,
})
const probar = (r: ReconstruccionRiesgo) => decidirRiesgoProbar({ reconstruccion: r, previo: null, soloPurgados: false, validar: (riesgo) => validarEntradaRamo('hogar', riesgo, 'allianz') })

test('cartera: solo hogar EN VIGOR (cancelada, volcado histórico y sustituida fuera); sin ninguna → polizaId null y sin_oportunidad (409 aguas arriba)', () => {
  const fuera = [fila({ id: 'a', estado: 'cancelada' }), fila({ id: 'b', importRef: 'intranet:1', eiacXmlHash: null }), fila({ id: 'c', sustituidaAt: new Date() })]
  assert.deepEqual(polizasHogarEnVigor(fuera), [])
  const r = riesgoHogarDePolizas(fuera, descifrar, AHORA)
  assert.equal(r.polizaId, null)
  assert.ok(!r.reconstruccion.riesgo && 'motivo' in r.reconstruccion && r.reconstruccion.motivo === 'sin_oportunidad')
})

test('póliza en vigor: precarga + calle/número de la dirección descifrada; falta SOLO régimen y madera → 422 con etiquetas, sin valores', () => {
  const r = riesgoHogarDePolizas([fila()], descifrar, AHORA)
  assert.equal(r.polizaId, 'p1')
  const d = probar(r.reconstruccion)
  assert.ok(!d.ok && d.status === 422 && d.motivo === 'riesgo_incompleto', JSON.stringify(d))
  if (!d.ok) {
    assert.equal(d.errores?.length, 2, JSON.stringify(d.errores))
    assert.ok(d.errores?.some((e) => /Régimen/.test(e)) && d.errores?.some((e) => /madera/.test(e)))
    const txt = JSON.stringify(d)
    for (const valor of ['FICTICIA', '41003', '1994', '76']) assert.ok(!txt.includes(valor), valor)
  }
})

test('con régimen y madera (vía que SÍ los tenga): riesgo válido para Allianz; uso/tipo/año salen como supuestos, firmeza SIEMPRE estimado', () => {
  const r = riesgoHogarDePolizas([fila()], descifrar, AHORA, { regimen: 'propietario', conMadera: 'no' })
  const d = probar(r.reconstruccion)
  assert.ok(d.ok, JSON.stringify(d))
  if (d.ok) {
    const x = d.entrada.riesgo as Record<string, any>
    assert.equal(x.inmueble.nombreVia, 'FICTICIA'); assert.equal(x.inmueble.numero, '7'); assert.equal(x.inmueble.anioConstruccion, 1994); assert.equal(x.inmueble.superficieM2, 76)
    assert.equal(x.hogar.uso, 'habitual'); assert.equal(x.hogar.tipoVivienda, 'piso')
  }
  assert.deepEqual([...r.supuestos].sort(), ['anioConstruccion', 'conMadera', 'regimen', 'tipoVivienda', 'uso'])
  assert.equal(firmezaPrecioRpa({ compania: 'allianz', ramo: 'hogar', riesgo: {}, oferta: { polizaAnteriorTecleada: true, avisos: [] } }), 'estimado')
})

test('sin año de construcción en ninguna clave → falta el año (no se inventa); código de uso/clase desconocido → sin contestar', () => {
  const r = riesgoHogarDePolizas([fila({ datosEspecificos: datos({ anioConstruccionCima: null, usoInmueble: 'ZZ', claseInmueble: 'ZZ' }) })], descifrar, AHORA, { regimen: 'propietario', conMadera: 'no' })
  const re = r.reconstruccion
  assert.ok(re.riesgo === null && 'faltan' in re)
  if (re.riesgo === null && 'faltan' in re) for (const x of [/Año de construcción/, /Uso de la vivienda/, /Tipo de vivienda/]) assert.ok(re.faltan.some((e) => x.test(e)), String(x))
})

test('dirección que no se puede descifrar → faltan calle y número (nunca el v1: ni un valor)', () => {
  const r = riesgoHogarDePolizas([fila({ datosEspecificos: datos({ direccion: 'v1:malo' }) })], descifrar, AHORA, { regimen: 'propietario', conMadera: 'no' })
  const re = r.reconstruccion
  assert.ok(re.riesgo === null && 'faltan' in re && re.faltan.some((e) => /Calle/.test(e)) && re.faltan.some((e) => /Número/.test(e)))
})

test('varias en vigor: la más reciente; dirección distinta → aviso; misma → otro aviso; una sola → sin avisos', () => {
  const vieja = fila({ id: 'vieja', desde: '2015-07-06', datosEspecificos: datos({ direccion: 'v1:otra' }) })
  const nueva = fila({ id: 'nueva', desde: '2016-01-01' })
  const a = riesgoHogarDePolizas([vieja, nueva], descifrar, AHORA)
  assert.equal(a.polizaId, 'nueva'); assert.deepEqual(a.avisos, ['varias_polizas_hogar_direcciones_distintas'])
  const b = riesgoHogarDePolizas([fila({ id: 'x', desde: '2015-07-06' }), nueva], descifrar, AHORA)
  assert.deepEqual(b.avisos, ['varias_polizas_hogar_misma_direccion'])
  assert.deepEqual(riesgoHogarDePolizas([nueva], descifrar, AHORA).avisos, [])
})

test('elegir: oportunidad con riesgo manda; sin oportunidad → póliza (aunque incompleta, para nombrar lo que falta); oportunidad incompleta + póliza incompleta → la de la oportunidad', () => {
  const ok: ReconstruccionRiesgo = { riesgo: { ramo: 'hogar' }, bloqueos: [], repreguntar: [] }
  const sinOp: ReconstruccionRiesgo = { riesgo: null, motivo: 'sin_oportunidad' }
  const incompleta: ReconstruccionRiesgo = { riesgo: null, motivo: 'faltan_datos', faltan: ['Régimen'] }
  const pol = (reconstruccion: ReconstruccionRiesgo) => ({ polizaId: 'p1', reconstruccion, supuestos: [], avisos: [] })
  assert.equal(elegirReconstruccionHogar(ok, pol(ok)).usaPoliza, false)
  assert.equal(elegirReconstruccionHogar(sinOp, pol(incompleta)).usaPoliza, true)
  assert.equal(elegirReconstruccionHogar(sinOp, null).usaPoliza, false)
  assert.equal(elegirReconstruccionHogar(sinOp, { ...pol(incompleta), polizaId: null }).usaPoliza, false)
  assert.equal(elegirReconstruccionHogar(incompleta, pol(incompleta)).usaPoliza, false)
  assert.equal(elegirReconstruccionHogar(incompleta, pol(ok)).usaPoliza, true)
})

test('UD (unifamiliar) → adosada como supuesto; régimen propietario y madera no con las elecciones por defecto de «probar» desde póliza (riesgo válido, sin 422)', () => {
  const r = riesgoHogarDePolizas([fila({ datosEspecificos: datos({ claseInmueble: 'UD', usoInmueble: 'SE' }) })], descifrar, AHORA, SUPUESTOS_HOGAR_DESDE_POLIZA)
  const d = probar(r.reconstruccion)
  assert.ok(d.ok, JSON.stringify(d))
  if (d.ok) {
    const x = d.entrada.riesgo as Record<string, any>
    assert.equal(x.hogar.tipoVivienda, 'adosada'); assert.equal(x.hogar.regimen, 'propietario'); assert.equal(x.hogar.conMadera, false); assert.equal(x.hogar.uso, 'secundaria')
  }
  for (const k of ['tipoVivienda', 'regimen', 'conMadera', 'uso', 'anioConstruccion']) assert.ok(r.supuestos.includes(k), k)
  assert.deepEqual({ ...SUPUESTOS_HOGAR_DESDE_POLIZA }, { regimen: 'propietario', conMadera: 'no' })
})

test('ruta: solo hogar y solo sin riesgo de oportunidad; vincula la oportunidad DESPUÉS de decidir y solo si el riesgo salió de la póliza; el 422 no pierde los avisos', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', 'app/api/operador/tarificador/probar/route.ts'), 'utf8')
  assert.match(ruta, /ramo === 'hogar' && deOportunidad\.riesgo === null \? await riesgoHogarDePolizasDelCliente/)
  assert.match(ruta, /elegirReconstruccionHogar\(deOportunidad, dePoliza\)/)
  assert.ok(ruta.indexOf('decidirRiesgoProbar') < ruta.indexOf('abrirRiesgoDePoliza(correduria.id'), 'abrir la oportunidad solo tras decidir')
  assert.match(ruta, /usaPoliza && dePoliza\?\.polizaId && valida\.origen === 'oportunidad'/)
  assert.match(ruta, /oportunidadId,\s*clienteId, polizaId: null/)
  assert.match(ruta, /motivo: d\.motivo[^\n]*avisos/)
  assert.match(readFileSync(join(import.meta.dirname, 'tarificacion-lead.ts'), 'utf8'), /riesgoHogarDePolizas\(filas, decryptField, ahora, SUPUESTOS_HOGAR_DESDE_POLIZA\)/)
  assert.match(readFileSync(join(import.meta.dirname, 'tarificador-hogar-poliza.ts'), 'utf8'), /elecciones: \{ regimen\?: string; conMadera\?: string \} = \{\}/, 'el defecto de la función sigue sin suponer nada')
  assert.ok(!/console\.(log|error)/.test(readFileSync(join(import.meta.dirname, 'tarificador-hogar-poliza.ts'), 'utf8')), 'sin logs en el módulo puro (PII)')
})

test('dirección con número pegado al marcador o «S/N»: el número llega al riesgo (S/N como supuesto numeroSinNumero), sin valores en avisos', () => {
  const con = (dir: string) => riesgoHogarDePolizas([fila()], () => dir, AHORA, SUPUESTOS_HOGAR_DESDE_POLIZA)
  const a = con('CL FICTICIA Nº12-3-A')
  assert.ok(a.reconstruccion.riesgo, JSON.stringify(a.reconstruccion))
  const inm = (a.reconstruccion.riesgo as { inmueble: Record<string, unknown> }).inmueble
  assert.equal(inm.numero, '12')
  assert.ok(!a.supuestos.includes('numeroSinNumero'))
  const b = con('PZ FICTICIA S/N')
  const inb = (b.reconstruccion.riesgo as { inmueble: Record<string, unknown> } | null)?.inmueble
  assert.equal(inb?.numero, 'S/N')
  assert.ok(b.supuestos.includes('numeroSinNumero'))
  const c = con('PZ FICTICIA')
  assert.ok(!c.reconstruccion.riesgo && 'faltan' in c.reconstruccion && c.reconstruccion.faltan.some((e) => /Número de la calle/.test(e)))
  assert.deepEqual(c.supuestos, [])
})
