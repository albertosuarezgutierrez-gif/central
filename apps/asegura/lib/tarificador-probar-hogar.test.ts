// «Probar» autónomo de HOGAR (27/10/2026): con el riesgo del último trabajo purgado, el riesgo se reconstruye de la oportunidad de
// hogar del cliente con el MISMO constructor que el botón «pedir precio» (`formularioBotHogar` de @central/module-tarificacion).
// Lo que falta sale como 422 con etiquetas de campo. `node --test`. Datos FICTICIOS; sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidirRiesgoProbar, riesgoHogarDeRiesgoOportunidad, type ReconstruccionRiesgo } from './tarificador-relanzar-reglas.ts'
import { validarEntradaRamo } from './tarificador-reglas.ts'

const vivienda = (x: Record<string, unknown> = {}) => ({
  cp: '41003', municipio: 'Sevilla', nombreVia: 'Via Ficticia', numeroVia: '7', planta: '2', puertaVivienda: 'B',
  anioConstruccion: 1990, metrosCuadrados: 85, referenciaCatastral: '1234567VK1234A0001XX',
  ocupacion: 'MainResidence', uso: 'Owner', tipoVivienda: 'MiddleFloor', conMadera: false, ...x,
})
const riesgoOp = (datos: Record<string, unknown> | null, empresa = false) => ({
  datosRiesgo: datos ? { clave: 'datosVivienda', datos } : null,
  figuras: [{ rol: 'tomador', clienteId: 'c1', empresa, faltan: [] as string[] }],
})
const probar = (r: ReconstruccionRiesgo, compania = 'allianz') =>
  decidirRiesgoProbar({ reconstruccion: r, previo: null, soloPurgados: true, validar: (riesgo) => validarEntradaRamo('hogar', riesgo, compania) })

test('hogar: vivienda completa en la oportunidad → riesgo reconstruido que valida (y NO cae en 409 sin_riesgo_previo/origen_purgado)', () => {
  const d = probar(riesgoHogarDeRiesgoOportunidad(riesgoOp(vivienda()), new Date('2026-10-27T10:00:00Z')))
  assert.ok(d.ok, JSON.stringify(d))
  if (d.ok) {
    assert.equal(d.origen, 'oportunidad')
    const r = d.entrada.riesgo as Record<string, any>
    assert.equal(r.ramo, 'hogar')
    assert.equal(r.inmueble.codigoPostal, '41003')
    assert.equal(r.hogar.uso, 'habitual')
    assert.equal(r.hogar.regimen, 'propietario')
    assert.equal('tomador' in r, false)
  }
})

test('hogar: faltan año y superficie → 422 riesgo_incompleto con los NOMBRES de los campos (sin valores)', () => {
  const d = probar(riesgoHogarDeRiesgoOportunidad(riesgoOp(vivienda({ anioConstruccion: null, metrosCuadrados: null }))))
  assert.ok(!d.ok && d.status === 422 && d.motivo === 'riesgo_incompleto', JSON.stringify(d))
  if (!d.ok) {
    assert.ok(d.errores?.some((e) => /Año de construcción/.test(e)))
    assert.ok(d.errores?.some((e) => /Superficie/.test(e)))
    assert.ok(!JSON.stringify(d.errores).includes('Via Ficticia'))
  }
})

test('hogar: uso/régimen/tipo/madera sin contestar NO se suponen → 422 que los nombra', () => {
  const d = probar(riesgoHogarDeRiesgoOportunidad(riesgoOp(vivienda({ ocupacion: null, uso: null, tipoVivienda: null, conMadera: null }))))
  assert.ok(!d.ok && d.status === 422, JSON.stringify(d))
  if (!d.ok) for (const re of [/Uso de la vivienda/, /Régimen/, /Tipo de vivienda/, /madera/]) assert.ok(d.errores?.some((e) => re.test(e)), String(re))
})

test('hogar: sin bloque de vivienda → 422 (todo «no consta»), nunca valores de relleno; tomador empresa → 422', () => {
  const a = probar(riesgoHogarDeRiesgoOportunidad(riesgoOp(null)))
  assert.ok(!a.ok && a.status === 422 && (a.errores?.length ?? 0) >= 5, JSON.stringify(a))
  const b = probar(riesgoHogarDeRiesgoOportunidad(riesgoOp(vivienda(), true)))
  assert.ok(!b.ok && b.status === 422 && b.errores?.some((e) => /empresa/.test(e)))
})

test('hogar: el tipo guardado es un ID de Codeoscopic no atestiguado (TerracedHouse): sin catálogo → 422 que lo nombra; con el catálogo vivo (como la pantalla) → adosada', () => {
  const op = riesgoOp(vivienda({ tipoVivienda: 'TerracedHouse' }))
  const sin = probar(riesgoHogarDeRiesgoOportunidad(op, new Date('2026-10-27T10:00:00Z')))
  assert.ok(!sin.ok && sin.status === 422 && sin.errores?.some((e) => /Tipo de vivienda/.test(e)), JSON.stringify(sin))
  // Nombre ficticio de fixture (frase ya admitida en FRASES_CANONICAS): el catálogo real manda.
  const con = probar(riesgoHogarDeRiesgoOportunidad(op, new Date('2026-10-27T10:00:00Z'), { tipoVivienda: [{ id: 'TerracedHouse', nombre: 'Chalet adosado' }] }))
  assert.ok(con.ok, JSON.stringify(con))
  if (con.ok) assert.equal((con.entrada.riesgo as Record<string, any>).hogar.tipoVivienda, 'adosada')
  // Un nombre que no casa EXACTO sigue sin suponerse.
  const raro = probar(riesgoHogarDeRiesgoOportunidad(op, new Date('2026-10-27T10:00:00Z'), { tipoVivienda: [{ id: 'TerracedHouse', nombre: 'Chalet' }] }))
  assert.ok(!raro.ok && raro.status === 422, JSON.stringify(raro))
})

test('hogar: sin oportunidad sigue siendo 409 (no inventa datos)', () => {
  const d = probar({ riesgo: null, motivo: 'sin_oportunidad' })
  assert.deepEqual(d, { ok: false, status: 409, motivo: 'origen_purgado' })
})

test('cableado: riesgoDesdeOportunidadDelCliente ramifica hogar al constructor compartido (leerRiesgo + riesgoHogarDeRiesgoOportunidad) ANTES de esRamoBotLead', () => {
  const lead = readFileSync(join(import.meta.dirname, 'tarificacion-lead.ts'), 'utf8')
  const f = lead.slice(lead.indexOf('export async function riesgoDesdeOportunidadDelCliente'))
  assert.ok(f.indexOf("ramo === 'hogar'") > -1 && f.indexOf("ramo === 'hogar'") < f.indexOf('esRamoBotLead(ramo)'))
  assert.match(lead, /async function riesgoHogarDeOportunidadDelCliente[\s\S]*?leerRiesgo\([\s\S]*?riesgoHogarDeRiesgoOportunidad\(riesgo, ahora, await catalogosHogarVivos\(\)\)/)
  assert.match(lead, /async function catalogosHogarVivos[\s\S]*?'property-types'[\s\S]*?'occupancy-types'[\s\S]*?'uses'/, 'los mismos 3 catálogos que useCatalogosHogar')
  const reglas = readFileSync(join(import.meta.dirname, 'tarificador-relanzar-reglas.ts'), 'utf8')
  assert.match(reglas, /formularioBotHogar\(\{ \.\.\.datosViviendaParaBot\(r\), \.\.\.eleccionesInicialesHogar\(r, catalogos\) \}/)
  const plat = readFileSync(join(import.meta.dirname, '../../plataforma/lib/tarificador-hogar-formulario.ts'), 'utf8')
  assert.match(plat, /export \{ formularioBotHogar/, 'plataforma re-exporta el MISMO constructor')
})
