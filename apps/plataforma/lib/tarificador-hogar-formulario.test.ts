// Formulario del bot de HOGAR (19/10/2026). Datos SINTÉTICOS. `node --test`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  avisoFichaTomadorParaHogar, datosViviendaParaBot, eleccionesInicialesHogar, faltanFichaTomadorParaHogar, formularioBotHogar, tomadorDeRiesgoHogar,
  type EntradaBotHogar, type RiesgoParaBotsHogar,
} from './tarificador-hogar-formulario.ts'

const BASE: EntradaBotHogar = {
  codigoPostal: '41001', municipio: 'VILLAPRUEBA', nombreVia: 'INVENTADA', numero: '1', planta: '2', puerta: 'B', anioConstruccion: 1990, anioReforma: null,
  superficieM2: 90, referenciaCatastral: '1234567ab1234c0001df', capitalContinenteEur: 120000, capitalContenidoEur: null, tomadorEmpresa: false,
  uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: 'no',
}
const faltan = (e: EntradaBotHogar): string[] => { const r = formularioBotHogar(e); return r.ok ? [] : r.faltan }

test('con todo, arma el riesgo de hogar SIN tomador: vivienda + cuatro elecciones + capitales solo si > 0', () => {
  const r = formularioBotHogar(BASE)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.riesgo, {
    ramo: 'hogar',
    inmueble: { codigoPostal: '41001', municipio: 'VILLAPRUEBA', nombreVia: 'INVENTADA', numero: '1', planta: '2', puerta: 'B', anioConstruccion: 1990, superficieM2: 90, referenciaCatastral: '1234567AB1234C0001DF' },
    hogar: { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: false, capitalContinenteEur: 120000 },
  })
  assert.deepEqual(r.completarDesdeFicha, [])
})

test('las cuatro elecciones: sin elegir (o fuera de la lista) FALTAN; la madera "no" es una respuesta, vacía no', () => {
  for (const [campo, texto] of [['uso', /Uso de la vivienda/], ['regimen', /Régimen/], ['tipoVivienda', /Tipo de vivienda/], ['conMadera', /madera/]] as const) {
    for (const malo of [undefined, null, '', '  ', 'MainResidence', 'quizas']) {
      const f = faltan({ ...BASE, [campo]: malo })
      assert.ok(f.some((x) => texto.test(x)), `${campo}=${String(malo)}`)
    }
  }
  assert.equal(formularioBotHogar({ ...BASE, conMadera: 'no' }).ok, true)
  const si = formularioBotHogar({ ...BASE, conMadera: 'si' })
  assert.ok(si.ok && (si.riesgo.hogar as Record<string, unknown>).conMadera === true)
  // Nada se infiere: ni el régimen del uso ni el tipo de la planta.
  assert.equal(faltan({ ...BASE, regimen: '' }).length, 1)
})

test('año y m² (obligatorios, el Catastro los trae): sin ellos faltan; 0 y no enteros no valen; null ≠ 0', () => {
  assert.ok(faltan({ ...BASE, anioConstruccion: null }).some((f) => /Año de construcción/.test(f)))
  assert.ok(faltan({ ...BASE, superficieM2: null }).some((f) => /Superficie construida/.test(f)))
  assert.ok(faltan({ ...BASE, superficieM2: 0 }).some((f) => /Superficie construida/.test(f)))
  assert.ok(faltan({ ...BASE, superficieM2: 76.5 }).some((f) => /número entero/.test(f)), 'no se redondea a escondidas')
})

test('dirección: CP de 5 cifras, calle y número; los avisos dicen qué falta, nunca el valor', () => {
  const f = faltan({ ...BASE, codigoPostal: '410', nombreVia: null, numero: ' ' })
  assert.deepEqual(f.map((x) => x.split(' ')[0]), ['Código', 'Calle', 'Número'])
  assert.ok(f.every((x) => !x.includes('410')))
})

test('empresa: el bot de hogar de Allianz solo tarifica personas con DNI/NIE', () => {
  assert.ok(faltan({ ...BASE, tomadorEmpresa: true }).some((f) => /empresa/.test(f)))
})

test('lo opcional solo viaja si hay dato; capitales ≤ 0 o null no viajan; reforma anterior a la obra la rechaza el validador', () => {
  const r = formularioBotHogar({ ...BASE, municipio: null, planta: null, puerta: null, referenciaCatastral: null, capitalContinenteEur: 0, capitalContenidoEur: null })
  assert.ok(r.ok)
  if (r.ok) {
    assert.deepEqual(Object.keys(r.riesgo.inmueble as object).sort(), ['anioConstruccion', 'codigoPostal', 'nombreVia', 'numero', 'superficieM2'])
    assert.deepEqual(r.riesgo.hogar, { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: false })
  }
  const mal = formularioBotHogar({ ...BASE, anioReforma: 1980 })
  assert.ok(!mal.ok && mal.faltan.some((f) => f.startsWith('inmueble.anioReforma')))
  const rcMala = formularioBotHogar({ ...BASE, referenciaCatastral: 'XYZ' })
  assert.ok(!rcMala.ok && rcMala.faltan.some((f) => f.startsWith('inmueble.referenciaCatastral')))
})

// ─── Del riesgo de la oportunidad ───────────────────────────────────────────────
const riesgo = (datos: Record<string, unknown> | null, figuras: RiesgoParaBotsHogar['figuras'] = []): RiesgoParaBotsHogar & { oportunidad: { clienteId: string } } => ({
  datosRiesgo: datos === null ? null : { clave: 'datosVivienda', datos },
  figuras, oportunidad: { clienteId: 'c-oportunidad' },
})
const DATOS = {
  referenciaCatastral: '1234567AB1234C0001DF', cp: '41001', municipio: 'VILLAPRUEBA', nombreVia: 'INVENTADA', numeroVia: '1', planta: '2', puertaVivienda: 'B',
  metrosCuadrados: 90, anioConstruccion: 1990, anioUltimaReforma: null, capitalContinente: 120000, capitalContenido: null,
  tipoVivienda: 'MiddleFloor', uso: 'Owner', ocupacion: 'MainResidence', conMadera: null,
}

test('datosViviendaParaBot: lee los datos guardados con sus nombres del bot; sin bloque de vivienda todo es null (no se sabe)', () => {
  const v = datosViviendaParaBot(riesgo(DATOS, [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: [] }]))
  assert.deepEqual(v, {
    codigoPostal: '41001', municipio: 'VILLAPRUEBA', nombreVia: 'INVENTADA', numero: '1', planta: '2', puerta: 'B', anioConstruccion: 1990, anioReforma: null,
    superficieM2: 90, referenciaCatastral: '1234567AB1234C0001DF', capitalContinenteEur: 120000, capitalContenidoEur: null, tomadorEmpresa: false,
  })
  const vacio = datosViviendaParaBot(riesgo(null))
  assert.ok(Object.entries(vacio).every(([k, x]) => (k === 'tomadorEmpresa' ? x === false : x === null)))
  assert.equal(datosViviendaParaBot(riesgo(DATOS, [{ rol: 'tomador', clienteId: 'c1', empresa: true, faltan: [] }])).tomadorEmpresa, true)
  assert.equal(tomadorDeRiesgoHogar(riesgo(DATOS, [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: [] }])), 'c1')
  assert.equal(tomadorDeRiesgoHogar(riesgo(DATOS)), 'c-oportunidad')
})

test('elecciones iniciales: solo lo que casa EXACTAMENTE; ojo ocupacion = USO y uso = RÉGIMEN; la madera null queda sin contestar', () => {
  assert.deepEqual(eleccionesInicialesHogar(riesgo(DATOS)), { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: '' })
  assert.equal(eleccionesInicialesHogar(riesgo({ ...DATOS, conMadera: true })).conMadera, 'si')
  assert.equal(eleccionesInicialesHogar(riesgo({ ...DATOS, conMadera: false })).conMadera, 'no')
  // Id desconocido: sin catálogo no se adivina; con el nombre exacto del catálogo, sí.
  const raro = { ...DATOS, ocupacion: 'X1', tipoVivienda: 'X2', uso: 'X3' }
  assert.deepEqual(eleccionesInicialesHogar(riesgo(raro)), { uso: '', regimen: '', tipoVivienda: '', conMadera: '' })
  const conCatalogo = eleccionesInicialesHogar(riesgo(raro), {
    ocupacion: [{ id: 'X1', nombre: 'Segunda residencia' }], tipoVivienda: [{ id: 'X2', nombre: 'Ático' }], uso: [{ id: 'X3', nombre: 'Inquilino' }],
  })
  assert.deepEqual(conCatalogo, { uso: 'secundaria', regimen: 'inquilino', tipoVivienda: 'atico', conMadera: '' })
  // Un nombre parecido pero no exacto: sin dato.
  assert.equal(eleccionesInicialesHogar(riesgo(raro), { ocupacion: [{ id: 'X1', nombre: 'Segunda residencia de verano' }] }).uso, '')
  // Sin bloque de vivienda: todo sin elegir.
  assert.deepEqual(eleccionesInicialesHogar(riesgo(null)), { uso: '', regimen: '', tipoVivienda: '', conMadera: '' })
})

test('ficha del tomador: DNI/NIE y nacimiento faltantes se avisan sin valores; no se sabe (null) no se afirma; empresa no vale', () => {
  const t = (faltanFicha: string[] | null, empresa = false) => riesgo(DATOS, [{ rol: 'tomador', clienteId: 'c1', empresa, faltan: faltanFicha }])
  assert.deepEqual(faltanFichaTomadorParaHogar(t(['dni', 'sexo', 'telefono', 'fechaNacimiento'])), ['el DNI/NIE', 'la fecha de nacimiento'])
  assert.deepEqual(faltanFichaTomadorParaHogar(t(['fechaNacimiento_invalida'])), ['la fecha de nacimiento'])
  assert.deepEqual(faltanFichaTomadorParaHogar(t([])), [])
  assert.equal(faltanFichaTomadorParaHogar(t(null)), null)
  assert.equal(faltanFichaTomadorParaHogar(riesgo(DATOS)), null)
  assert.match(faltanFichaTomadorParaHogar(t([], true))![0], /persona física/)
  assert.equal(avisoFichaTomadorParaHogar([]), null)
  assert.equal(avisoFichaTomadorParaHogar(null), null)
  assert.match(avisoFichaTomadorParaHogar(['el DNI/NIE', 'la fecha de nacimiento'])!, /^Falta el DNI\/NIE y la fecha de nacimiento en la ficha del tomador/)
})

// 🔒 El DNI/NIE y el nacimiento del tomador NO salen de plataforma: ni el helper ni el adaptador ni la ruta los arman.
test('cepo de fuente: plataforma no construye ni envía el tomador de hogar (lo pone asegura desde la ficha)', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const lib = join(import.meta.dirname)
  const helper = readFileSync(join(lib, 'tarificador-hogar-formulario.ts'), 'utf8').replace(/\/\/.*$/gm, '')
  assert.ok(!/documentoIdentidad|fechaNacimiento\s*:|[{,]\s*tomador\s*:/.test(helper), 'el helper no arma `tomador`')
  const bots = readFileSync(join(lib, 'tarificador-bots-ramos.ts'), 'utf8').replace(/\/\/.*$/gm, '')
  const hogar = bots.slice(bots.indexOf('const adaptadorHogar'), bots.indexOf('const ADAPTADORES'))
  assert.ok(hogar.length > 200 && !/documentoIdentidad|fechaNacimiento/.test(hogar))
  assert.ok(!/porDefecto: '[^']/.test(hogar), 'ninguna de las cuatro elecciones tiene valor por defecto')
  const ruta = readFileSync(join(lib, '..', 'app/api/correduria/tarificador/encolar/route.ts'), 'utf8')
  assert.match(ruta, /ramo === 'hogar'\s*\?\s*await encolarTarificacionHogar\(clienteId, oportunidadId, riesgoHogarSinTomador\(riesgo\), compania\)/)
})

test('riesgoHogarSinTomador: quita tomador y dni/nif/nacimiento, deja la vivienda y no muta', async () => {
  const { riesgoHogarSinTomador } = await import('./tarificador-hogar-formulario.ts')
  const entrada = { ramo: 'hogar', inmueble: { codigoPostal: '41001', dni: 'X' }, hogar: { uso: 'habitual' }, tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '1980-01-01' }, nif: 'Y' }
  const copia = structuredClone(entrada)
  assert.deepEqual(riesgoHogarSinTomador(entrada), { ramo: 'hogar', inmueble: { codigoPostal: '41001' }, hogar: { uso: 'habitual' } })
  assert.deepEqual(entrada, copia)
})

test('la ruta encolar pasa el riesgo de hogar por riesgoHogarSinTomador', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../app/api/correduria/tarificador/encolar/route.ts', import.meta.url), 'utf8')
  assert.match(src, /encolarTarificacionHogar\(clienteId, oportunidadId, riesgoHogarSinTomador\(riesgo\)/)
})
