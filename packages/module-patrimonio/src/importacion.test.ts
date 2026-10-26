import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CABECERAS_PLANTILLA,
  TIPOS_IMPORTACION,
  aplicarMapeo,
  camposQueFaltan,
  claveContrato,
  claveGasto,
  clavesDeInmueble,
  clavesDeInmuebleExistente,
  componerDireccion,
  detectarTipo,
  esColumnaSensible,
  evaluarFilas,
  leerFecha,
  leerImporte,
  leerUso,
  parsearCsv,
  plantillaCsv,
  proponerMapeo,
  resolverInmueble,
  resumirEvaluacion,
  validarMapeo,
  type InmuebleRef,
  type Mapeo,
} from './importacion.ts'

// ─── Importes y fechas ────────────────────────────────────────────────────────────────────────────────────

test('importes en formato español → céntimos; vacío NO es 0; el inglés y los negativos son ilegibles', () => {
  assert.deepEqual(leerImporte('1.234,56'), { cent: 123456 })
  assert.deepEqual(leerImporte('800'), { cent: 80000 })
  assert.deepEqual(leerImporte('800,5 €'), { cent: 80050 })
  assert.deepEqual(leerImporte('1.234'), { cent: 123400 }, 'grupo de 3 dígitos sin coma = miles')
  assert.deepEqual(leerImporte('12.5'), { cent: 1250 })
  assert.deepEqual(leerImporte(950.25), { cent: 95025 }, 'número de la hoja')
  assert.deepEqual(leerImporte(''), { vacio: true })
  assert.deepEqual(leerImporte(null), { vacio: true })
  assert.deepEqual(leerImporte('1,234.56'), { invalido: true })
  assert.deepEqual(leerImporte('-5'), { invalido: true })
  assert.deepEqual(leerImporte('abc'), { invalido: true })
  assert.deepEqual(leerImporte('0'), { invalido: true }, 'un gasto/renta de 0 no es un importe')
  assert.deepEqual(leerImporte('0', true), { cent: 0 }, 'pero una fianza de 0 sí puede ser real')
  assert.deepEqual(leerImporte('1,005'), { invalido: true }, '3 decimales')
})

test('fechas dd/mm/aaaa (y variantes) → ISO; mes 13, 30 de febrero o año de 2 cifras son ilegibles', () => {
  assert.deepEqual(leerFecha('01/02/2026'), { fecha: '2026-02-01' })
  assert.deepEqual(leerFecha('1-2-2026'), { fecha: '2026-02-01' })
  assert.deepEqual(leerFecha('15.03.2024'), { fecha: '2024-03-15' })
  assert.deepEqual(leerFecha('2026-02-01'), { fecha: '2026-02-01' })
  assert.deepEqual(leerFecha(46054), { fecha: '2026-02-01' }, 'serie de Excel')
  assert.deepEqual(leerFecha(''), { vacio: true })
  assert.deepEqual(leerFecha('13/13/2026'), { invalido: true })
  assert.deepEqual(leerFecha('30/02/2026'), { invalido: true })
  assert.deepEqual(leerFecha('01/02/26'), { invalido: true })
  assert.deepEqual(leerFecha('ayer'), { invalido: true })
  assert.deepEqual(leerFecha(12), { invalido: true }, 'un número suelto no es una fecha')
})

// ─── CSV ──────────────────────────────────────────────────────────────────────────────────────────────────

test('CSV: separador ; autodetectado, BOM, comillas con ; y saltos dentro, líneas finales vacías fuera', () => {
  const t = '﻿Nombre;Dirección;Renta\r\n"Piso; centro";"Calle ""Sol"" 4";1.200,50\r\n\r\n'
  assert.deepEqual(parsearCsv(t), [['Nombre', 'Dirección', 'Renta'], ['Piso; centro', 'Calle "Sol" 4', '1.200,50']])
  assert.deepEqual(parsearCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']])
  assert.deepEqual(parsearCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']])
})

// ─── Datos personales fuera ───────────────────────────────────────────────────────────────────────────────

test('🚨 columnas con NIF, correo, teléfono, IBAN o inquilino son sensibles y nunca se mapean', () => {
  for (const c of ['NIF inquilino', 'DNI', 'Correo electrónico', 'E-mail', 'Teléfono', 'Móvil', 'IBAN', 'Inquilino', 'Arrendatario']) {
    assert.equal(esColumnaSensible(c), true, c)
  }
  for (const c of ['Dirección', 'Renta mensual', 'En comunidad de propietarios', 'Referencia catastral']) assert.equal(esColumnaSensible(c), false, c)
  const p = proponerMapeo(['Inmueble', 'Inquilino', 'NIF', 'Fecha de inicio', 'Renta mensual'], [], 'contrato')
  assert.deepEqual(p.sensibles, [1, 2])
  assert.ok(!Object.values(p.mapeo.columnas).includes(1) && !Object.values(p.mapeo.columnas).includes(2))
  // Aunque el cliente lo pida a mano, se rechaza.
  assert.deepEqual(validarMapeo('contrato', { columnas: { inmueble: 0, renta: 2 } }, ['Inmueble', 'x', 'NIF']), { ok: false, campo: 'renta' })
})

// ─── Mapeo ────────────────────────────────────────────────────────────────────────────────────────────────

test('la plantilla de cada tipo se autodetecta y se mapea entera', () => {
  for (const t of TIPOS_IMPORTACION) {
    const cab = CABECERAS_PLANTILLA[t]
    assert.equal(detectarTipo(cab, []), t, `tipo ${t}`)
    const p = proponerMapeo(cab, [], t)
    const mapeadas = Object.values(p.mapeo.columnas).filter((v) => v !== null)
    assert.equal(mapeadas.length, cab.length, `${t}: todas las columnas de la plantilla se reconocen`)
    assert.deepEqual(p.sinReconocer, [])
  }
  assert.ok(plantillaCsv('gasto').startsWith('﻿Inmueble;Fecha;'))
  assert.deepEqual(parsearCsv(plantillaCsv('inmueble'))[0], [...CABECERAS_PLANTILLA.inmueble])
})

test('autodetección: cabeceras de otro orden y con sinónimos; una hoja que no encaja no se adivina', () => {
  const p = proponerMapeo(['Piso', 'Desde', 'Hasta', 'Alquiler mensual (€)', 'Depósito'], [], null)
  assert.equal(p.tipo, 'contrato')
  assert.deepEqual(p.mapeo.columnas, { inmueble: 0, inicio: 1, fin: 2, renta: 3, fianza: 4, indice: null })
  assert.equal(detectarTipo(['Foo', 'Bar', 'Baz'], []), null)
  assert.equal(proponerMapeo(['Foo', 'Bar'], [], null).tipo, null)
})

test('la muestra desempata: una columna sin nombre claro con 5 cifras es el código postal', () => {
  const p = proponerMapeo(['Nombre', 'Col2', 'Dirección'], [['A', '41003', 'Socorro 24'], ['B', '41001', 'Sierpes 3']], 'inmueble')
  assert.equal(p.mapeo.columnas.cp, 1)
})

test('mapeo propuesto: faltan campos si no hay lo mínimo; el uso por defecto lo elige el cliente', () => {
  const sin: Mapeo = { columnas: { alias: 0, uso: null } }
  assert.deepEqual(camposQueFaltan('inmueble', sin), ['uso'])
  assert.deepEqual(camposQueFaltan('inmueble', { ...sin, usoPorDefecto: 'vivienda' }), [])
  assert.deepEqual(camposQueFaltan('contrato', { columnas: { inmueble: 0, inicio: 1, renta: null } }), ['renta'])
  assert.deepEqual(camposQueFaltan('gasto', { columnas: { fecha: 0, importe: 1 } }), [])
  assert.deepEqual(validarMapeo('inmueble', { columnas: { alias: 0, uso: 0 } }, ['a']), { ok: false, campo: 'uso' }, 'una columna no sirve para dos campos')
  assert.deepEqual(validarMapeo('inmueble', { columnas: { alias: 5 } }, ['a']), { ok: false, campo: 'alias' })
  assert.deepEqual(validarMapeo('inmueble', { columnas: { nada: 0 } }, ['a']), { ok: false, campo: 'nada' })
  assert.deepEqual(validarMapeo('inmueble', { columnas: { alias: 0 }, usoPorDefecto: 'castillo' }, ['a']), { ok: false, campo: 'usoPorDefecto' })
  assert.deepEqual(validarMapeo('gasto', { columnas: { fecha: 0 }, usoPorDefecto: 'vivienda' }, ['a']), { ok: false, campo: 'usoPorDefecto' })
})

// ─── Aplicar el mapeo: inmuebles ──────────────────────────────────────────────────────────────────────────

const MAPEO_INM: Mapeo = { columnas: { alias: 0, uso: 1, referenciaCatastral: 2, direccion: 3, cp: 4, municipio: 5, provincia: 6, enComunidad: 7 } }

test('inmueble: dirección sin validar → «por validar» (aviso, NO error); sin dirección no se inventa nada', () => {
  const [a, b] = aplicarMapeo('inmueble', [
    ['Socorro', 'Piso', '', 'Calle Socorro 24', 41003, 'Sevilla', 'Sevilla', 'sí'],
    ['Trastero', 'trastero', '', '', '', '', '', ''],
  ], MAPEO_INM)
  assert.equal(a.problema, null)
  assert.equal(a.datos.porValidar, true)
  assert.equal(a.datos.uso, 'vivienda')
  assert.equal(a.datos.cp, '41003')
  assert.equal(a.datos.direccionNormalizada, 'Calle Socorro 24, 41003 Sevilla (Sevilla)', 'mismo formato que la app')
  assert.equal(a.datos.enComunidad, true)
  assert.ok(a.avisos.some((x) => /por validar/i.test(x)))
  assert.equal(a.n, 2)
  assert.equal(b.problema, null)
  assert.equal(b.datos.direccion, null)
  assert.equal(b.datos.direccionNormalizada, null)
  assert.equal(b.datos.porValidar, false)
  assert.equal(b.datos.enComunidad, null, '«en comunidad» vacío = no consta, nunca false')
  assert.equal(b.datos.cp, null)
  assert.equal(b.n, 3)
})

test('inmueble: uso desconocido o ausente es PROBLEMA (no se rellena con «otro»); el uso por defecto es decisión explícita', () => {
  const [raro, vacio] = aplicarMapeo('inmueble', [['A', 'castillo', '', 'Calle X 1', '', '', '', ''], ['B', '', '', 'Calle Y 2', '', '', '', '']], MAPEO_INM)
  assert.match(raro.problema!, /castillo/)
  assert.match(vacio.problema!, /Falta el uso/)
  assert.equal(raro.datos.uso, null)
  const [ok] = aplicarMapeo('inmueble', [['B', '', '', 'Calle Y 2', '', '', '', '']], { ...MAPEO_INM, usoPorDefecto: 'local' })
  assert.equal(ok.problema, null)
  assert.equal(ok.datos.uso, 'local')
  assert.ok(ok.avisos.some((x) => /elegido por ti/.test(x)))
  assert.equal(leerUso('Plaza de garaje'), 'garaje')
})

test('inmueble: referencia catastral y CP ilegibles; «no sé» no es «no»; 4 cifras de Excel se rellenan', () => {
  const [rc, cp, ns, cero] = aplicarMapeo('inmueble', [
    ['A', 'piso', '123', 'Calle 1', '', '', '', ''],
    ['B', 'piso', '', 'Calle 2', 'ABCDE', '', '', ''],
    ['C', 'piso', '', 'Calle 3', '', '', '', 'no sé'],
    ['D', 'piso', '', 'Calle 4', 7001, '', '', 'no'],
  ], MAPEO_INM)
  assert.match(rc.problema!, /referencia catastral/)
  assert.equal(cp.problema, null)
  assert.equal(cp.datos.cp, null)
  assert.ok(cp.avisos.some((x) => /postal/.test(x)))
  assert.equal(ns.datos.enComunidad, null)
  assert.equal(cero.datos.cp, '07001')
  assert.equal(cero.datos.enComunidad, false)
})

test('filas totalmente vacías se saltan pero la numeración sigue la de la hoja', () => {
  const r = aplicarMapeo('inmueble', [['A', 'piso', '', 'C 1', '', '', '', ''], ['', '', '', '', '', '', '', ''], ['B', 'piso', '', 'C 2', '', '', '', '']], MAPEO_INM)
  assert.deepEqual(r.map((f) => f.n), [2, 4])
})

// ─── Aplicar el mapeo: contratos y gastos ─────────────────────────────────────────────────────────────────

const MAPEO_CT: Mapeo = { columnas: { inmueble: 0, inicio: 1, fin: 2, renta: 3, fianza: 4, indice: 5 } }

test('contrato: fechas dd/mm/aaaa, renta española, fianza vacía = null (no 0), actualización reconocida', () => {
  const [a, b, c] = aplicarMapeo('contrato', [
    ['Socorro', '01/09/2025', '31/08/2026', '1.250,00', '', 'IPC'],
    ['Socorro', '01/09/2025', '', '900', '0', ''],
    ['Socorro', '01/09/2025', '', '900', '', 'revisión libre'],
  ], MAPEO_CT)
  assert.equal(a.problema, null)
  assert.deepEqual([a.datos.inicio, a.datos.fin, a.datos.rentaCent, a.datos.fianzaCent, a.datos.clausula, a.datos.indice], ['2025-09-01', '2026-08-31', 125000, null, 'indice', 'IPC'])
  assert.equal(b.datos.fianzaCent, 0, 'una fianza de 0 escrita es 0')
  assert.equal(b.datos.fin, null)
  assert.ok(b.avisos.some((x) => /ninguna/.test(x)))
  assert.match(c.problema!, /actualización/)
})

test('contrato: cada error de dato aparta la fila con su motivo (nunca se arregla solo)', () => {
  const casos: [unknown[], RegExp][] = [
    [['', '01/09/2025', '', '900', '', ''], /Falta el inmueble/],
    [['A', '', '', '900', '', ''], /fecha de inicio/],
    [['A', '32/09/2025', '', '900', '', ''], /inicio no es legible/],
    [['A', '01/09/2025', '01/01/2025', '900', '', ''], /anterior/],
    [['A', '01/09/2025', '', '', '', ''], /Falta la renta/],
    [['A', '01/09/2025', '', '1,234.50', '', ''], /renta no es legible/],
    [['A', '01/09/2025', '', '900', 'x', ''], /fianza/],
  ]
  for (const [fila, re] of casos) assert.match(aplicarMapeo('contrato', [fila as never], MAPEO_CT)[0].problema!, re)
})

const MAPEO_GT: Mapeo = { columnas: { inmueble: 0, fecha: 1, concepto: 2, categoria: 3, importe: 4, base: 5 } }

test('gasto: categoría por sinónimo, desconocida = sin categoría con aviso, sin inmueble = del titular', () => {
  const [a, b, c, d] = aplicarMapeo('gasto', [
    ['Socorro', '05/03/2026', 'IBI 2026', 'IBI', '412,30', ''],
    ['', '06/03/2026', 'Gestoría', 'cosas raras', '90', '74,38'],
    ['Socorro', '07/03/2026', '', '', '0', ''],
    ['Socorro', '', 'Luz', 'Luz', '50', ''],
  ], MAPEO_GT)
  assert.equal(a.problema, null)
  assert.equal(a.datos.categoria, 'IMPUESTOS')
  assert.equal(a.datos.totalCent, 41230)
  assert.equal(b.problema, null)
  assert.equal(b.datos.categoria, null)
  assert.equal(b.datos.baseCent, 7438)
  assert.ok(b.avisos.some((x) => /no reconocida/.test(x)))
  assert.ok(b.avisos.some((x) => /titular/.test(x)))
  assert.match(c.problema!, /importe/i, 'un gasto de 0 € no se crea')
  assert.match(d.problema!, /Falta la fecha/)
})

// ─── Inmueble al que apunta una fila ──────────────────────────────────────────────────────────────────────

const INMUEBLES: InmuebleRef[] = [
  { id: 'i1', alias: 'Socorro', referenciaCatastral: '1234567VK1234A0001AB', direccionNormalizada: 'Calle Socorro 24, 41003 Sevilla (Sevilla)' },
  { id: 'i2', alias: 'Bustos', referenciaCatastral: null, direccionNormalizada: 'Calle Bustos Tavera 22, 41003 Sevilla (Sevilla)' },
  { id: 'i3', alias: 'Bustos 2', referenciaCatastral: null, direccionNormalizada: 'Calle Bustos Tavera 22, 41003 Sevilla (Sevilla)' },
]

test('resolverInmueble: refcat → nombre exacto → dirección única; ambiguo no se elige; ninguno = no encontrado', () => {
  assert.deepEqual(resolverInmueble('1234567vk1234a0001ab', INMUEBLES), { id: 'i1' })
  assert.deepEqual(resolverInmueble('socorro', INMUEBLES), { id: 'i1' })
  assert.deepEqual(resolverInmueble('Calle Socorro 24', INMUEBLES), { id: 'i1' })
  assert.deepEqual(resolverInmueble('Bustos Tavera 22', INMUEBLES), { error: 'ambiguo' })
  assert.deepEqual(resolverInmueble('Bustos', INMUEBLES), { id: 'i2' }, 'el nombre exacto gana a la dirección')
  assert.deepEqual(resolverInmueble('Sierpes', INMUEBLES), { error: 'no_encontrado' })
  assert.deepEqual(resolverInmueble('  ', INMUEBLES), { error: 'no_encontrado' })
})

// ─── Idempotencia: duplicados ─────────────────────────────────────────────────────────────────────────────

test('🚨 reimportar el mismo fichero no duplica: lo ya existente es «ya_existe», no «nueva»', () => {
  const filas = aplicarMapeo('inmueble', [
    ['Socorro', 'piso', '1234567VK1234A0001AB', 'Calle Socorro 24', '41003', '', '', ''],
    ['Nuevo', 'piso', '', 'Calle Sierpes 3', '41004', '', '', ''],
  ], MAPEO_INM)
  const primera = evaluarFilas(filas, { inmuebles: [], existentes: new Set() })
  assert.deepEqual(primera.map((f) => f.estado), ['nueva', 'nueva'])
  // «Confirmar» crea ambas: sus claves pasan a existir y la segunda importación no crea nada.
  const existentes = new Set(primera.flatMap((f) => f.claves))
  const segunda = evaluarFilas(filas, { inmuebles: [], existentes })
  assert.deepEqual(segunda.map((f) => f.estado), ['ya_existe', 'ya_existe'])
  assert.deepEqual(resumirEvaluacion(segunda), { nuevas: 0, yaExisten: 2, repetidas: 0, conProblema: 0, porValidar: 0 })
})

test('inmueble: se reconoce por refcat o por dirección+CP aunque cambie el nombre; sin dirección ni refcat, por nombre', () => {
  assert.deepEqual(clavesDeInmueble({ referenciaCatastral: 'abc', direccion: 'Calle  Sol 4', cp: '41001', alias: 'x' }), ['rc:ABC', 'dir:calle sol 4|41001'])
  assert.deepEqual(clavesDeInmueble({ referenciaCatastral: null, direccion: null, cp: null, alias: 'Trastero 1' }), ['alias:trastero 1'])
  const otro = evaluarFilas(aplicarMapeo('inmueble', [['OTRO NOMBRE', 'piso', '', 'CALLE SOL 4', '41001', '', '', '']], MAPEO_INM), {
    inmuebles: [], existentes: new Set(['dir:calle sol 4|41001']),
  })
  assert.equal(otro[0].estado, 'ya_existe')
})

test('contrato: misma clave inmueble+inicio = ya existe; el inmueble se resuelve; uno inexistente aparta la fila', () => {
  const filas = aplicarMapeo('contrato', [
    ['Socorro', '01/09/2025', '', '900', '', ''],
    ['Socorro', '01/09/2026', '', '950', '', ''],
    ['Sierpes', '01/09/2026', '', '950', '', ''],
    ['Bustos Tavera 22', '01/09/2026', '', '950', '', ''],
  ], MAPEO_CT)
  const r = evaluarFilas(filas, { inmuebles: INMUEBLES, existentes: new Set([claveContrato('i1', '2025-09-01')]) })
  assert.deepEqual(r.map((f) => f.estado), ['ya_existe', 'nueva', 'con_problema', 'con_problema'])
  assert.equal(r[1].inmuebleId, 'i1')
  assert.match(r[2].motivo!, /Sierpes/)
  assert.match(r[3].motivo!, /más de un inmueble/)
})

test('gasto: misma fecha+importe+concepto en el mismo inmueble = ya existe; repetida en el fichero se aparta con su fila', () => {
  const filas = aplicarMapeo('gasto', [
    ['Socorro', '05/03/2026', 'IBI', 'IBI', '412,30', ''],
    ['Socorro', '05/03/2026', 'ibi', 'IBI', '412,30', ''],
    ['Socorro', '06/03/2026', 'IBI', 'IBI', '412,30', ''],
  ], MAPEO_GT)
  const r = evaluarFilas(filas, { inmuebles: INMUEBLES, existentes: new Set() })
  assert.deepEqual(r.map((f) => f.estado), ['nueva', 'repetida', 'nueva'])
  assert.match(r[1].motivo!, /fila 2/)
  const yaEstaba = evaluarFilas(filas.slice(0, 1), { inmuebles: INMUEBLES, existentes: new Set([claveGasto({ inmuebleId: 'i1', fecha: '2026-03-05', totalCent: 41230, concepto: 'IBI' })]) })
  assert.equal(yaEstaba[0].estado, 'ya_existe')
})

test('🚨 una fila con problema NUNCA es «nueva» (no se crea sola)', () => {
  const filas = aplicarMapeo('contrato', [['Socorro', 'mañana', '', '900', '', '']], MAPEO_CT)
  const [f] = evaluarFilas(filas, { inmuebles: INMUEBLES, existentes: new Set() })
  assert.equal(f.estado, 'con_problema')
  assert.deepEqual(f.claves, [])
})

test('componerDireccion: con lo que haya, sin inventar nada', () => {
  assert.equal(componerDireccion({ direccion: null, cp: '41003', municipio: 'Sevilla', provincia: 'Sevilla' }), null)
  assert.equal(componerDireccion({ direccion: 'Calle  Sol 4', cp: null, municipio: null, provincia: null }), 'Calle Sol 4')
  assert.equal(componerDireccion({ direccion: 'Calle Sol 4', cp: '41001', municipio: null, provincia: null }), 'Calle Sol 4, 41001')
})

test('🚨 lo que se creó desde un fichero se reconoce al reimportarlo (con CP, sin CP con municipio, sin dirección)', () => {
  const filas = aplicarMapeo('inmueble', [
    ['A', 'piso', '', 'Calle Sol, 4 2ºB', '41001', 'Sevilla', 'Sevilla', ''],
    ['B', 'piso', '', 'Calle Luna 7', '', 'Sevilla', 'Sevilla', ''],
    ['C', 'piso', '', 'Calle Mar 1', '', '', '', ''],
    ['Trastero 1', 'trastero', '', '', '', '', '', ''],
  ], MAPEO_INM)
  const primera = evaluarFilas(filas, { inmuebles: [], existentes: new Set() })
  assert.deepEqual(primera.map((f) => f.estado), ['nueva', 'nueva', 'nueva', 'nueva'])
  // Lo que queda en la BD tras crearlas: alias, refcat y dirección normalizada.
  const enBd = filas.map((f) => clavesDeInmuebleExistente({
    referenciaCatastral: f.datos.referenciaCatastral as string | null,
    direccionNormalizada: f.datos.direccionNormalizada as string | null,
    alias: f.datos.alias as string,
  }))
  const segunda = evaluarFilas(filas, { inmuebles: [], existentes: new Set(enBd.flat()) })
  assert.deepEqual(segunda.map((f) => f.estado), ['ya_existe', 'ya_existe', 'ya_existe', 'ya_existe'])
  // Y uno distinto no se confunde.
  const otra = evaluarFilas(aplicarMapeo('inmueble', [['Z', 'piso', '', 'Calle Sol, 5', '41001', '', '', '']], MAPEO_INM), { inmuebles: [], existentes: new Set(enBd.flat()) })
  assert.equal(otra[0].estado, 'nueva')
})
