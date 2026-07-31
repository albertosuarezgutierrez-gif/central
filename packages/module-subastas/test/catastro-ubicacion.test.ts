// Ubicación EXACTA vía Catastro: dirección legible, dirección → referencia
// catastral (`Consulta_DNPLOC`) y enlaces externos.
//
// El fixture `fixture-dnploc.xml` es la respuesta REAL del servicio (30/07/2026)
// para «CL PACO GANDIA 26, SEVILLA» — una de las subastas del corpus que el BOE
// publicó SIN referencia catastral. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  direccionCatastro,
  elegirVia,
  normVia,
  paramsDnploc,
  terminoBusquedaVia,
  parcelaUnica,
  parsearInmueblesDnploc,
  refParcela,
} from '../src/catastro.ts'
import { urlFichaCatastro, urlGoogleMaps, urlStreetView } from '../src/geo.ts'

const DNPLOC = readFileSync(new URL('./fixture-dnploc.xml', import.meta.url), 'utf8')

// ── refParcela ───────────────────────────────────────────────────────────────

test('refParcela: recorta la de 20 a los 14 que acepta Consulta_CPMRC', () => {
  // Caso real: con los 20 el servicio responde «DEBE SER DE 14 POSICIONES».
  assert.equal(refParcela('8033101TG3483S0026RR'), '8033101TG3483S')
  assert.equal(refParcela('8342605QA4584A0006YM'), '8342605QA4584A')
})

test('refParcela: tolera espacios y minúsculas; rechaza lo corto', () => {
  assert.equal(refParcela(' 8033101tg3483s0026rr '), '8033101TG3483S')
  assert.equal(refParcela('8033101TG'), null)
  assert.equal(refParcela(null), null)
  assert.equal(refParcela(''), null)
})

// ── direccionCatastro ────────────────────────────────────────────────────────

test('REAL — separa la dirección densa del Catastro en piezas', () => {
  // `ldt` real de la subasta SUB-JA-2026-263723 (San Pablo, Sevilla).
  const d = direccionCatastro('AV PEDRO ROMERO (DE) 2 Es:1 Pl:07 Pt:B 41007 SEVILLA')
  assert.ok(d)
  assert.equal(d.escalera, '1')
  assert.equal(d.planta, '07')
  assert.equal(d.puerta, 'B')
  // El «(DE)» se va: ningún buscador de mapas lo reconoce.
  assert.ok(!d.postal.includes('(DE)'), d.postal)
  assert.equal(d.postal, 'AV PEDRO ROMERO 2, 41007 SEVILLA')
})

test('quita el municipio duplicado entre paréntesis del final', () => {
  // Formato del `ldt` que devuelve Consulta_CPMRC.
  const d = direccionCatastro('CL PACO GANDIA 26 SEVILLA (SEVILLA)')
  assert.equal(d?.postal, 'CL PACO GANDIA 26 SEVILLA')
})

test('sin datos de interior deja escalera/planta/puerta a null', () => {
  const d = direccionCatastro('CL VIRGEN MILAGROS 83 11500 EL PUERTO DE SANTA MARIA')
  assert.ok(d)
  assert.equal(d.planta, null)
  assert.equal(d.puerta, null)
  assert.equal(d.postal, 'CL VIRGEN MILAGROS 83, 11500 EL PUERTO DE SANTA MARIA')
})

test('entrada vacía no revienta', () => {
  assert.equal(direccionCatastro(''), null)
  assert.equal(direccionCatastro(null), null)
  assert.equal(direccionCatastro('   '), null)
})

// ── DNPLOC: dirección → referencia catastral ─────────────────────────────────

test('REAL — un portal devuelve los 10 inmuebles con su referencia', () => {
  const inmuebles = parsearInmueblesDnploc(DNPLOC)
  assert.equal(inmuebles.length, 10)
  const primero = inmuebles[0]
  assert.equal(primero.refParcela, '7325012TG3472N')
  assert.equal(primero.refCompleta, '7325012TG3472N0001FW')
  assert.equal(primero.refCompleta.length, 20)
  assert.equal(primero.codigoPostal, '41007')
})

test('REAL — los 10 comparten parcela, así que el punto del mapa es único', () => {
  // Esto es lo que permite ubicar el EDIFICIO sin saber qué piso se subasta.
  const inmuebles = parsearInmueblesDnploc(DNPLOC)
  assert.equal(parcelaUnica(inmuebles), '7325012TG3472N')
})

test('si la dirección es ambigua (parcelas distintas) NO se elige una a dedo', () => {
  const mezcla = parsearInmueblesDnploc(DNPLOC).slice(0, 1).concat([
    { refCompleta: '9999999ZZ9999Z0001AA', refParcela: '9999999ZZ9999Z', planta: null, puerta: null, codigoPostal: null },
  ])
  assert.equal(parcelaUnica(mezcla), null)
})

test('respuesta de error o vacía devuelve lista vacía', () => {
  const err = `<consulta_dnp><control><cuerr>1</cuerr></control><lerr><err><cod>5</cod>
    <des>NO EXISTE NINGÚN INMUEBLE CON LOS PARÁMETROS INDICADOS</des></err></lerr></consulta_dnp>`
  assert.deepEqual(parsearInmueblesDnploc(err), [])
  assert.deepEqual(parsearInmueblesDnploc(''), [])
})

// ── paramsDnploc: dirección del BOE → parámetros del Catastro ────────────────

test('REAL — dirección registral con coleta descriptiva', () => {
  // Tal como la publica el BOE en SUB-JA-2026-263723.
  const p = paramsDnploc('AVENIDA PEDRO ROMERO Nº 2, planta séptima de la casa número Ochenta y ocho, en el Barrio D, del Polígono de San Pablo')
  assert.deepEqual(
    { sigla: p?.sigla, calle: p?.calle, numero: p?.numero },
    { sigla: 'AV', calle: 'PEDRO ROMERO', numero: '2' },
  )
})

test('REAL — «C/ PACO GANDÍA 26» pierde la tilde (el Catastro la guarda sin ella)', () => {
  // Verificado contra el servicio: con GANDIA responde; con GANDÍA, no.
  const g = paramsDnploc('C/ PACO GANDÍA 26')
  assert.deepEqual(
    { sigla: g?.sigla, calle: g?.calle, numero: g?.numero },
    { sigla: 'CL', calle: 'PACO GANDIA', numero: '26' },
  )
})

test('reconoce los tipos de vía habituales', () => {
  assert.equal(paramsDnploc('CALLE VIRGEN DE LOS MILAGROS 79')?.sigla, 'CL')
  assert.equal(paramsDnploc('PLAZA DE ESPAÑA 3')?.sigla, 'PZ')
  assert.equal(paramsDnploc('CTRA DE CADIZ 12')?.sigla, 'CR')
  assert.equal(paramsDnploc('Avda. de la Constitución 8')?.sigla, 'AV')
})

test('sin sigla o sin número no se consulta (evita ubicar en otra calle)', () => {
  assert.equal(paramsDnploc('PEDRO ROMERO 2'), null, 'sin tipo de vía')
  assert.equal(paramsDnploc('CALLE SIN NUMERO'), null, 'sin número')
  assert.equal(paramsDnploc('LA M1 DE LA UE-1 DEL PP-G3 DE GUILLENA'), null)
  assert.equal(paramsDnploc(''), null)
  assert.equal(paramsDnploc(null), null)
})

// ── Enlaces externos ─────────────────────────────────────────────────────────

test('urlGoogleMaps: la DIRECCIÓN manda sobre las coordenadas', () => {
  // Con lat/lon Google pone un pin anónimo; con la dirección resuelve el portal.
  const u = urlGoogleMaps({
    lat: 37.3977102, lon: -5.9607369,
    direccion: 'AV PEDRO ROMERO 2, 41007 SEVILLA',
    municipio: 'SEVILLA', provincia: 'Sevilla',
  })
  assert.ok(u)
  assert.ok(!u.includes('37.3977'), 'no debe caer a coordenadas habiendo dirección')
  assert.match(decodeURIComponent(u), /AV PEDRO ROMERO 2, 41007 SEVILLA/)
})

test('urlGoogleMaps: no repite el municipio si la dirección ya lo trae', () => {
  const u = urlGoogleMaps({ direccion: 'CL PACO GANDIA 26 SEVILLA', municipio: 'SEVILLA', provincia: 'Sevilla' })
  const q = decodeURIComponent(u!)
  assert.equal(q.match(/SEVILLA/g)?.length, 1, q)
})

test('urlGoogleMaps: sin dirección usa las coordenadas', () => {
  const u = urlGoogleMaps({ lat: 36.5997, lon: -6.2249, municipio: 'El Puerto de Santa María' })
  assert.equal(u, 'https://www.google.com/maps/search/?api=1&query=36.5997,-6.2249')
})

test('urlGoogleMaps: sin nada útil, null (un pin en "Sevilla" engaña)', () => {
  assert.equal(urlGoogleMaps({ provincia: 'Sevilla' }), null)
  assert.equal(urlGoogleMaps({}), null)
})

test('urlStreetView: necesita coordenadas', () => {
  assert.match(urlStreetView(37.3977, -5.9607)!, /map_action=pano&viewpoint=37\.3977,-5\.9607/)
  assert.equal(urlStreetView(null, null), null)
  assert.equal(urlStreetView(37.3, Number.NaN), null)
})

test('urlFichaCatastro: acepta 14 y 20, rechaza lo corto', () => {
  assert.match(urlFichaCatastro('7325012TG3472N')!, /RefC=7325012TG3472N/)
  assert.match(urlFichaCatastro('8033101TG3483S0026RR')!, /RefC=8033101TG3483S0026RR/)
  assert.equal(urlFichaCatastro('8033101'), null)
  assert.equal(urlFichaCatastro(null), null)
})

// ── Regresiones del 31/07/2026 ───────────────────────────────────────────────
// Tres fallos vistos en producción tras la primera pasada del cron. Cada test
// fija un caso REAL comprobado contra el servicio.

test('REGRESIÓN — la Ñ sobrevive a la normalización (CAÑAL ≠ CANAL)', () => {
  // Verificado contra ConsultaVia: `NombreVia=CAÑAL` encuentra «CARLOS CAÑAL»;
  // `CANAL` no devuelve NADA. Perder la Ñ dejó sin ubicar Carlos Cañal 28.
  assert.equal(normVia('Carlos Cañal'), 'CARLOS CAÑAL')
  assert.equal(normVia('SÉNECA'), 'SENECA', 'las tildes de vocales sí se van')
  assert.equal(paramsDnploc('Calle Carlos Cañal, número 28-A')?.calle, 'CARLOS CAÑAL')
})

test('REGRESIÓN — se pregunta por UNA palabra distintiva, no por el nombre entero', () => {
  // El Catastro abrevia a su gusto: «Ronda de Nuestra Señora de la Oliva» está
  // archivada como «NUESTRA SEÑORA D LA OLIVA» (DE → D). Preguntar el nombre
  // completo no encuentra nada; preguntar «NUESTRA» u «OLIVA» sí, porque el
  // servicio busca por subcadena.
  assert.equal(terminoBusquedaVia('PACO GANDIA'), 'GANDIA')
  assert.equal(terminoBusquedaVia('CARLOS CAÑAL'), 'CARLOS', 'la más larga, con Ñ intacta')
  const t = terminoBusquedaVia('NUESTRA SEÑORA DE LA OLIVA')
  assert.ok(['NUESTRA', 'SEÑORA', 'OLIVA'].includes(t), t)
  assert.ok(!['DE', 'LA'].includes(t), 'nunca un artículo')
})

test('REGRESIÓN — la vía oficial se elige por TOKENS, tolerando abreviaturas', () => {
  // Caso real: buscar «OLIVA» devuelve el nombre abreviado del Catastro.
  assert.equal(
    elegirVia([{ tipo: 'RD', nombre: 'NUESTRA SEÑORA D LA OLIVA' }], 'NUESTRA SEÑORA DE LA OLIVA'),
    'NUESTRA SEÑORA D LA OLIVA',
  )
  // Caso real: «GANDIA» devuelve DOS vías; gana la que no tiene palabras de más.
  assert.equal(
    elegirVia([{ tipo: 'CL', nombre: 'CIUDAD DE GANDIA' }, { tipo: 'CL', nombre: 'PACO GANDIA' }], 'PACO GANDIA'),
    'PACO GANDIA',
  )
  // Ambigüedad real (dos candidatas igual de ajustadas) → no se elige a dedo.
  assert.equal(
    elegirVia([{ tipo: 'CL', nombre: 'REAL ALTA' }, { tipo: 'CL', nombre: 'REAL BAJA' }], 'REAL'),
    null,
  )
  // Ninguna contiene los tokens buscados → null, no la primera que pase.
  assert.equal(elegirVia([{ tipo: 'CL', nombre: 'CIUDAD DE GANDIA' }], 'PACO GANDIA'), null)
})

test('REGRESIÓN — el interior se extrae y «ESC.1» no captura la C', () => {
  // El orden de la alternancia importaba: `ES` casaba antes que `ESC` y la
  // escalera salía «C» en vez de «1».
  const a = paramsDnploc('CL. CHAROLISTAS, 4, ESC.1 PLANTA 4, PUERTA B')
  assert.deepEqual(
    { e: a?.escalera, pl: a?.planta, pt: a?.puerta },
    { e: '1', pl: '4', pt: 'B' },
  )
  const b = paramsDnploc('RD NUESTRA SEÑORA DE LA OLIVA 6 ESC: 5 PL:04 PT:A')
  assert.deepEqual({ e: b?.escalera, pl: b?.planta, pt: b?.puerta }, { e: '5', pl: '04', pt: 'A' })
  // «2º IZQUIERDA» sin etiquetas: planta por el ordinal, puerta por la palabra.
  const c = paramsDnploc('C/ ANTONIO GONZALEZ CARREÑO, Nº8, 2º IZQUIERDA')
  assert.equal(c?.planta, '2')
  assert.equal(c?.puerta, 'IZ')
  assert.equal(c?.calle, 'ANTONIO GONZALEZ CARREÑO')
})

test('sin datos de interior, los campos van a null (no a cadena vacía)', () => {
  // La consulta los manda como '' y un valor basura filtraría de más.
  const p = paramsDnploc('CALLE SÉNECA, Nº 15')
  assert.equal(p?.escalera, null)
  assert.equal(p?.planta, null)
  assert.equal(p?.puerta, null)
})
