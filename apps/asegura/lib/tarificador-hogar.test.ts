// Cepos del Hogar de Allianz en el orquestador (19/10/2026). `node --test`. Datos SINTÉTICOS; fechas relativas a hoy (sin bombas de reloj).
//
// Reglas que se atan aquí:
//   · hogar solo se tarifica con Allianz (`COMPANIAS_HOGAR_RPA`); Mapfre/Occident hogar siguen solo explorando;
//   · el DNI/NIE y el nacimiento del tomador NO cruzan el puerto ni se guardan: salen de la ficha, se COMPRUEBAN al encolar y se
//     inyectan al ENTREGAR el trabajo (como el NIF de Mapfre); los motivos nombran qué falta, jamás el valor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  aplicarTomadorHogar, companiaAdmiteRamoRpa, lecturaTomadorHogar, necesitaTomadorHogar, riesgoParaEncolar, riesgoSinNifTomador, validarEntradaRamo,
  type LecturaTomadorHogar,
} from './tarificador-reglas.ts'

const APP = join(import.meta.dirname, '..')
const DNI = '00000000T'
const haceAnios = (n: number): string => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10) }
const FILA = { dni: DNI, nombre: null, apellidos: null, fechaNacimiento: haceAnios(40), tipoPersona: 'fisica' }
const sinDescifrar = (v: string): string => { throw new Error(`no debería descifrar ${v.length}`) }

const HOGAR = {
  ramo: 'hogar',
  inmueble: { codigoPostal: '41001', municipio: 'VILLAPRUEBA', nombreVia: 'INVENTADA', numero: '1', planta: '2', anioConstruccion: 1990, superficieM2: 90 },
  hogar: { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: false },
}
const noLeer = (): never => { throw new Error('no debería leer') }

test('encolar hogar: el formulario SIN tomador pasa; un tomador que venga se descarta (el DNI no entra por plataforma)', () => {
  const v = validarEntradaRamo('hogar', HOGAR)
  assert.equal(v.ok, true)
  const con = validarEntradaRamo('hogar', { ...HOGAR, tomador: { documentoIdentidad: DNI, fechaNacimiento: haceAnios(40) } })
  assert.ok(con.ok && con.entrada.ramo === 'hogar' && !('tomador' in con.entrada.riesgo), 'el tomador no se guarda ni aunque lo manden')
})

test('encolar hogar: uso, régimen, tipo y madera son obligatorios y explícitos (null = no contestado, nunca un valor por defecto)', () => {
  for (const campo of ['uso', 'regimen', 'tipoVivienda', 'conMadera']) {
    const malo = structuredClone(HOGAR) as typeof HOGAR
    delete (malo.hogar as Record<string, unknown>)[campo]
    assert.equal(validarEntradaRamo('hogar', malo).ok, false, campo)
    ;(malo.hogar as Record<string, unknown>)[campo] = null
    assert.equal(validarEntradaRamo('hogar', malo).ok, false, `${campo}: null`)
  }
  assert.equal(validarEntradaRamo('hogar', { ...HOGAR, hogar: { ...HOGAR.hogar, conMadera: 'no' } }).ok, false, 'madera es booleano, no texto')
})

test('hogar solo con Allianz: otra compañía se rechaza (validarEntradaRamo con compañía y companiaAdmiteRamoRpa)', () => {
  assert.equal(validarEntradaRamo('hogar', HOGAR, 'allianz').ok, true)
  assert.equal(validarEntradaRamo('hogar', HOGAR, ' Allianz ').ok, true)
  for (const c of ['mapfre', 'occident', 'generali', 'reale']) {
    const v = validarEntradaRamo('hogar', HOGAR, c)
    assert.ok(!v.ok && /^ramo_no_admitido/.test(v.mensaje), c)
    assert.equal(companiaAdmiteRamoRpa(c, 'hogar'), false, c)
    assert.equal(companiaAdmiteRamoRpa(c, 'auto'), true, `${c}: el resto de ramos no cambia`)
  }
  assert.equal(companiaAdmiteRamoRpa('allianz', 'hogar'), true)
})

test('encolar hogar con Allianz: lo que falta se dice con etiquetas, sin tomador (es de la ficha) y sin valores', () => {
  const sinAnio = structuredClone(HOGAR) as typeof HOGAR
  delete (sinAnio.inmueble as Record<string, unknown>).anioConstruccion
  const v = validarEntradaRamo('hogar', sinAnio, 'allianz')
  assert.equal(v.ok, false)
  // El tomador sin ficha no se pide al formulario: con todo lo demás, pasa.
  assert.equal(validarEntradaRamo('hogar', HOGAR, 'allianz').ok, true)
})

test('lecturaTomadorHogar: DNI y nacimiento de la ficha (cifrados o legado); lo que falta se nombra sin valores', () => {
  const ok = lecturaTomadorHogar(FILA, sinDescifrar)
  assert.deepEqual(ok, { estado: 'ok', tomador: { documentoIdentidad: DNI, fechaNacimiento: FILA.fechaNacimiento } })
  const cifrada = lecturaTomadorHogar({ ...FILA, dni: 'v1:xx', fechaNacimiento: 'v1:yy' }, (v) => (v === 'v1:xx' ? '00000000-t' : '15/01/1985'))
  assert.deepEqual(cifrada, { estado: 'ok', tomador: { documentoIdentidad: DNI, fechaNacimiento: '1985-01-15' } })
  assert.deepEqual(lecturaTomadorHogar(null, sinDescifrar), { estado: 'incompleta', faltan: ['la ficha'] })
  assert.deepEqual(lecturaTomadorHogar({ ...FILA, dni: null }, sinDescifrar), { estado: 'incompleta', faltan: ['el DNI/NIE'] })
  assert.deepEqual(lecturaTomadorHogar({ ...FILA, dni: '12345678A' }, sinDescifrar), { estado: 'incompleta', faltan: ['un DNI/NIE válido'] })
  assert.deepEqual(lecturaTomadorHogar({ ...FILA, fechaNacimiento: null }, sinDescifrar), { estado: 'incompleta', faltan: ['la fecha de nacimiento'] })
  assert.deepEqual(lecturaTomadorHogar({ ...FILA, fechaNacimiento: '31/02/1980' }, sinDescifrar), { estado: 'incompleta', faltan: ['una fecha de nacimiento válida'] })
  assert.deepEqual(lecturaTomadorHogar({ ...FILA, dni: null, fechaNacimiento: '' }, sinDescifrar), { estado: 'incompleta', faltan: ['el DNI/NIE', 'la fecha de nacimiento'] })
})

test('lecturaTomadorHogar: cifrado que no abre = ilegible (nunca «falta»); empresa (CIF o tipo) = no admitida', () => {
  assert.deepEqual(lecturaTomadorHogar({ ...FILA, dni: 'v1:zz' }, () => { throw new Error('clave') }), { estado: 'ilegible' })
  const emp = lecturaTomadorHogar({ ...FILA, tipoPersona: 'juridica' }, sinDescifrar)
  assert.ok(emp.estado === 'incompleta' && /persona física/.test(emp.faltan[0]))
  const cif = lecturaTomadorHogar({ ...FILA, dni: 'A58818501' }, sinDescifrar)
  assert.equal(cif.estado, 'incompleta')
})

test('aplicarTomadorHogar: Allianz hogar lo inyecta; otra compañía u otro ramo, tal cual; los motivos no llevan el documento', () => {
  const ok = aplicarTomadorHogar('allianz', 'hogar', HOGAR, () => lecturaTomadorHogar(FILA, sinDescifrar))
  assert.ok(ok.ok && JSON.stringify(ok.riesgo).includes(DNI))
  assert.deepEqual(aplicarTomadorHogar('mapfre', 'hogar', HOGAR, noLeer), { ok: true, riesgo: HOGAR })
  assert.deepEqual(aplicarTomadorHogar('allianz', 'auto', HOGAR, noLeer), { ok: true, riesgo: HOGAR })
  const ilegible = aplicarTomadorHogar('allianz', 'hogar', HOGAR, () => ({ estado: 'ilegible' }))
  assert.ok(!ilegible.ok && ilegible.status === 503 && /^datos_tomador_ilegibles/.test(ilegible.motivo))
  const falta = aplicarTomadorHogar('allianz', 'hogar', HOGAR, () => lecturaTomadorHogar({ ...FILA, dni: null }, sinDescifrar))
  assert.ok(!falta.ok && falta.status === 422 && /^falta_datos_tomador: falta el DNI\/NIE en la ficha/.test(falta.motivo))
  assert.ok(!falta.ok && !falta.motivo.includes(DNI))
  assert.equal(necesitaTomadorHogar('allianz', 'hogar'), true)
  assert.equal(necesitaTomadorHogar('mapfre', 'hogar'), false)
  assert.equal(necesitaTomadorHogar('allianz', 'moto'), false)
})

test('riesgoParaEncolar hogar: se GUARDA sin tomador (aunque lo traiga), tras comprobar la ficha', () => {
  const lee = (): LecturaTomadorHogar => lecturaTomadorHogar(FILA, sinDescifrar)
  const r = riesgoParaEncolar('allianz', 'hogar', HOGAR, noLeer, noLeer, lee)
  assert.deepEqual(r, { ok: true, riesgo: HOGAR })
  const conTomador = riesgoParaEncolar('allianz', 'hogar', { ...HOGAR, tomador: { documentoIdentidad: DNI, fechaNacimiento: FILA.fechaNacimiento } }, noLeer, noLeer, lee)
  assert.deepEqual(conTomador, { ok: true, riesgo: HOGAR }, 'el riesgo guardado nunca lleva el DNI')
  assert.ok(!JSON.stringify(riesgoSinNifTomador({ ...HOGAR, tomador: { documentoIdentidad: DNI } })).includes(DNI))
})

test('riesgoParaEncolar hogar: ficha sin DNI → 422 sin encolar; cifrado ilegible → 503; tomador menor de edad → 422 antes de gastar máquina', () => {
  const sinDni = riesgoParaEncolar('allianz', 'hogar', HOGAR, noLeer, noLeer, () => lecturaTomadorHogar({ ...FILA, dni: null }, sinDescifrar))
  assert.ok(!sinDni.ok && sinDni.status === 422 && /^falta_datos_tomador/.test(sinDni.motivo))
  const ilegible = riesgoParaEncolar('allianz', 'hogar', HOGAR, noLeer, noLeer, () => ({ estado: 'ilegible' }))
  assert.ok(!ilegible.ok && ilegible.status === 503)
  const menor = riesgoParaEncolar('allianz', 'hogar', HOGAR, noLeer, noLeer, () => lecturaTomadorHogar({ ...FILA, fechaNacimiento: haceAnios(10) }, sinDescifrar))
  assert.ok(!menor.ok && menor.status === 422 && /^riesgo_invalido: .*tomador\.fechaNacimiento/.test(menor.motivo))
  assert.ok(!menor.ok && !menor.motivo.includes(FILA.fechaNacimiento) && !menor.motivo.includes(DNI))
  // Sin lector de tomador (llamada antigua de 5 argumentos): fail-closed, nunca «no hace falta».
  const sinLector = riesgoParaEncolar('allianz', 'hogar', HOGAR, noLeer, noLeer)
  assert.ok(!sinLector.ok && sinLector.status === 503)
})

test('riesgoParaEncolar hogar: lo que falta del formulario se dice y no se encola (etiquetas, sin valores)', () => {
  const sinAnio = structuredClone(HOGAR) as typeof HOGAR
  delete (sinAnio.inmueble as Record<string, unknown>).anioConstruccion
  const r = riesgoParaEncolar('allianz', 'hogar', sinAnio, noLeer, noLeer, () => lecturaTomadorHogar(FILA, sinDescifrar))
  assert.ok(!r.ok && r.status === 422 && /^faltan_datos: Falta: año de construcción\./.test(r.motivo))
})

test('cableado: encolar valida con la compañía, el tomador se lee de la ficha al encolar y se inyecta SOLO al entregar (nunca en BD)', () => {
  const src = readFileSync(join(APP, 'lib/tarificador.ts'), 'utf8')
  const fn = src.slice(src.indexOf('export async function encolarTrabajo'), src.indexOf('// ─── Reclamar y lanzar'))
  assert.match(fn, /if \(!companiaAdmiteRamoRpa\(e\.compania, e\.ramo\)\) return \{ estado: 'rechazado', status: 409, motivo: `ramo_no_admitido/)
  assert.ok(fn.indexOf('companiaAdmiteRamoRpa(') < fn.indexOf('leerIntegracion('), 'el ramo no admitido se corta antes de mirar la integración')
  assert.match(fn, /necesitaTomadorHogar\(e\.compania, e\.ramo\) \? await leerTomadorFicha\(e\.correduriaId, clienteId\) : null/)
  assert.ok(!fn.includes('aplicarTomadorHogar('), 'encolar NO inyecta el tomador (eso es al entregar)')
  const w = src.slice(src.indexOf('export async function trabajoParaWorker'), src.indexOf('// ─── Resultado'))
  assert.match(w, /if \(modo !== 'exploracion' && modo !== 'humo' && necesitaTomadorHogar\(f\.compania, f\.ramo\)\)/)
  assert.match(w, /aplicarTomadorHogar\(f\.compania, f\.ramo, riesgo, \(\) => lecturaTomadorHogar\(fila, decryptField\)\)/)
  assert.ok(w.indexOf('aplicarTomadorHogar(') < w.indexOf('const base = {'), 'se inyecta antes de armar la respuesta')
  const ruta = readFileSync(join(APP, 'app/api/operador/tarificador/encolar/route.ts'), 'utf8')
  assert.match(ruta, /validarEntradaRamo\(body\.ramo, body\.riesgo, compania\)/)
})

test('duplicados hogar: con el primero ya ok y purgado, otra vivienda NO es duplicada; la idéntica sin purgar sí', async () => {
  const { formasRiesgoDuplicado } = await import('./tarificador-duplicados.ts')
  const { riesgoSinDatosPersonales } = await import('@central/module-tarificacion')
  const otra = { ...HOGAR, inmueble: { ...HOGAR.inmueble, numero: '2' } }
  const purgado = JSON.stringify(riesgoSinDatosPersonales(HOGAR, 'hogar')) // lo que queda en BD tras el ok
  const casa = (previo: string, f: { riesgoJson: string; riesgoPurgadoJson: string | null }): boolean => previo === f.riesgoJson || previo === f.riesgoPurgadoJson
  assert.equal(casa(purgado, formasRiesgoDuplicado(otra, 'hogar')), false, 'otra vivienda vs primero purgado')
  assert.equal(casa(purgado, formasRiesgoDuplicado(HOGAR, 'hogar')), false, 'ni la misma vivienda casa con la forma purgada')
  assert.equal(casa(JSON.stringify(HOGAR), formasRiesgoDuplicado(HOGAR, 'hogar')), true, 'idéntico sin purgar: duplicado')
  assert.equal(casa(JSON.stringify(HOGAR), formasRiesgoDuplicado(otra, 'hogar')), false)
  const src = readFileSync(join(APP, 'lib/tarificador.ts'), 'utf8')
  assert.match(src, /formasRiesgoDuplicado\(guardar\.riesgo/)
})
