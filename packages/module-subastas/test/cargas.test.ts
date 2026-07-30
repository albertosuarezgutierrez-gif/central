import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cargasQueSubsisten,
  consensoCuadros,
  mismoAcreedorQueEjecutante,
  normalizarCuadroCargas,
  resumirCargas,
  compararCuadros,
  type CuadroCargas,
} from '../src/cargas.ts'
import { extraerJson } from '../src/cargas-prompt.ts'
import { agruparBandas, dimensionesJpeg, localizarJpegs, pareceEscaneado } from '../src/pdf-imagenes.ts'

// ── El caso real: SUB-JA-2026-264269 (Belmonte de Miranda), leído a mano el
// 30/07/2026 de la certificación escaneada. Es el fixture de referencia porque
// contiene el patrón que arruina la operación.
const BELMONTE: CuadroCargas = {
  procedimiento: 'embargo',
  sinMasCargas: true,
  confianza: 0.9,
  fuente: 'ocr_ia',
  notas: ['Afecciones fiscales vigentes al día de la fecha.'],
  cargas: [
    {
      tipo: 'hipoteca',
      acreedor: 'CAJA DE AHORROS DE ASTURIAS',
      importe: 44850,
      fecha: '2009-08-17',
      rango: 'anterior',
      cancelada: false,
      literal: 'HIPOTECA a favor de CAJA DE AHORROS DE ASTURIAS por un principal de 30.000,00 euros…',
    },
    {
      tipo: 'embargo',
      acreedor: 'Jzdo 1ª Inst. Gijón nº 4 (autos 2304/2016)',
      importe: 3600,
      fecha: '2018-01-29',
      rango: 'anterior',
      cancelada: false,
      literal: 'ANOTACION PREVENTIVA DE EMBARGO … 3.600,00 € … Anotado con la letra C)',
    },
    {
      tipo: 'embargo',
      acreedor: 'LIBERBANK S.A.',
      importe: 7016.54,
      fecha: '2020-08-24',
      rango: 'la_que_ejecuta',
      cancelada: false,
      literal: 'ANOTACION PREVENTIVA DE EMBARGO a favor de LIBERBANK S.A. … Anotado con la letra D)',
    },
    {
      tipo: 'embargo',
      acreedor: 'anotación letra A)',
      importe: 65420.4,
      fecha: null,
      rango: 'anterior',
      cancelada: true,
      literal: 'CANCELACION ANOTACION LETRA A)',
    },
  ],
}

test('embargo con hipoteca anterior: la hipoteca SUBSISTE y se avisa', () => {
  const r = cargasQueSubsisten(BELMONTE)
  // Hipoteca 44.850 + embargo anterior 3.600. La letra D) se purga (es la que
  // ejecuta) y la A) no cuenta porque está cancelada.
  assert.equal(r.importe, 48450)
  assert.equal(r.cargas.length, 2)
  assert.ok(r.purgadas.some((c) => c.rango === 'la_que_ejecuta'))
  assert.ok(r.avisos.some((a) => a.includes('ANOTACIÓN DE EMBARGO') && a.includes('hipoteca ANTERIOR')))
})

test('ejecución hipotecaria: las posteriores se purgan y no suman', () => {
  const cuadro: CuadroCargas = {
    ...BELMONTE,
    procedimiento: 'hipotecaria',
    cargas: [
      { ...BELMONTE.cargas[0], rango: 'la_que_ejecuta' },
      { tipo: 'embargo', acreedor: 'Ayuntamiento', importe: 2354.07, fecha: '2021-09-01', rango: 'posterior', cancelada: false, literal: 'embargo posterior' },
    ],
  }
  const r = cargasQueSubsisten(cuadro)
  assert.equal(r.importe, 0)
  assert.equal(r.purgadas.length, 2)
  assert.equal(r.avisos.some((a) => a.includes('ANOTACIÓN DE EMBARGO')), false)
})

test('procedimiento desconocido: NUNCA devuelve 0 (un 0 se leería como «sin cargas»)', () => {
  const r = cargasQueSubsisten({ ...BELMONTE, procedimiento: 'desconocido' })
  assert.equal(r.importe, null)
  assert.ok(r.avisos[0].includes('NO se puede saber qué cargas se purgan'))
})

test('carga anterior sin importe legible: importe null, no una suma parcial', () => {
  const cuadro: CuadroCargas = {
    ...BELMONTE,
    cargas: [BELMONTE.cargas[0], { ...BELMONTE.cargas[1], importe: null }],
  }
  const r = cargasQueSubsisten(cuadro)
  assert.equal(r.importe, null)
  assert.ok(r.avisos.some((a) => a.includes('sin importe legible')))
})

test('rango desconocido cuenta como subsistente y lo dice', () => {
  const cuadro: CuadroCargas = {
    ...BELMONTE,
    cargas: [{ ...BELMONTE.cargas[0], rango: 'desconocido' }],
  }
  const r = cargasQueSubsisten(cuadro)
  assert.equal(r.importe, 44850)
  assert.ok(r.avisos.some((a) => a.includes('rango indeterminado')))
})

test('las afecciones fiscales avisan pero no se suman', () => {
  const cuadro: CuadroCargas = {
    ...BELMONTE,
    cargas: [{ tipo: 'afeccion_fiscal', acreedor: 'Hacienda', importe: 900, fecha: null, rango: 'anterior', cancelada: false, literal: 'afección fiscal' }],
  }
  const r = cargasQueSubsisten(cuadro)
  assert.equal(r.importe, 0)
  assert.ok(r.avisos.some((a) => a.includes('afecciones fiscales')))
})

test('mismoAcreedorQueEjecutante casa Liberbank con Caja de Ahorros de Asturias solo si comparte token', () => {
  // Tras la absorción el registro dice «CAJA DE AHORROS DE ASTURIAS» y el juzgado
  // «LIBERBANK S.A.»: NO comparten token, así que no se puede afirmar.
  assert.equal(mismoAcreedorQueEjecutante(BELMONTE.cargas, 'LIBERBANK S.A.'), false)
  // Cuando sí coinciden, se detecta (el caso habitual en ejecución hipotecaria).
  assert.ok(mismoAcreedorQueEjecutante(BELMONTE.cargas, 'CAJA DE AHORROS DE ASTURIAS'))
  assert.equal(mismoAcreedorQueEjecutante(BELMONTE.cargas, ''), false)
  assert.equal(mismoAcreedorQueEjecutante(BELMONTE.cargas, 'S.A.'), false)
})

test('consenso: importes que discrepan se anulan', () => {
  const b: CuadroCargas = {
    ...BELMONTE,
    cargas: [{ ...BELMONTE.cargas[0], importe: 44850 }, { ...BELMONTE.cargas[1], importe: 8600 }],
  }
  const { cuadro, discrepancias } = consensoCuadros(BELMONTE, b)
  // La hipoteca coincide en las dos lecturas → se conserva.
  assert.equal(cuadro.cargas.find((c) => c.tipo === 'hipoteca')?.importe, 44850)
  // El embargo anterior discrepa (3.600 vs 8.600) → cifra descartada.
  const emb = cuadro.cargas.find((c) => c.tipo === 'embargo' && c.rango === 'anterior')
  assert.equal(emb?.importe, null)
  assert.ok(discrepancias.some((d) => d.includes('discrepante')))
})

test('consenso: discrepar en la vía deja el procedimiento en desconocido', () => {
  const { cuadro } = consensoCuadros(BELMONTE, { ...BELMONTE, procedimiento: 'hipotecaria' })
  assert.equal(cuadro.procedimiento, 'desconocido')
})

test('normalizar: tolera tipos inventados, importes en formato español y basura', () => {
  const c = normalizarCuadroCargas(
    {
      procedimiento: 'EMBARGO',
      sinMasCargas: true,
      confianza: 0.8,
      cargas: [
        { tipo: 'HIPOTECA INVERSA RARA', importe: '44.850,00 €', rango: 'ANTERIOR', acreedor: '  Unicaja  ', literal: 'x' },
        { tipo: 'embargo', importe: -5, rango: 'nada' },
        null,
      ],
      notas: ['ok', 42],
    },
    'ocr_ia',
  )
  assert.equal(c.procedimiento, 'embargo')
  assert.equal(c.cargas[0].tipo, 'otra')
  assert.equal(c.cargas[0].importe, 44850)
  assert.equal(c.cargas[0].rango, 'anterior')
  assert.equal(c.cargas[0].acreedor, 'Unicaja')
  assert.equal(c.cargas[1].importe, null) // negativo → null
  assert.equal(c.cargas[1].rango, 'desconocido')
  assert.equal(c.cargas[2].tipo, 'otra') // null no revienta
  assert.deepEqual(c.notas, ['ok'])
})

test('normalizar: entrada vacía o basura no lanza', () => {
  for (const entrada of [null, undefined, 'texto', 42, {}, { cargas: 'no es lista' }]) {
    const c = normalizarCuadroCargas(entrada, 'ocr_ia')
    assert.equal(c.cargas.length, 0)
    assert.equal(c.procedimiento, 'desconocido')
  }
})

test('extraerJson: quita <think>, bloques cercados y texto alrededor', () => {
  assert.deepEqual(extraerJson('<think>divago</think>{"a":1}'), { a: 1 })
  assert.deepEqual(extraerJson('Aquí tienes:\n```json\n{"a":2}\n```\nUn saludo'), { a: 2 })
  assert.deepEqual(extraerJson('basura {"a":3} más basura'), { a: 3 })
  assert.equal(extraerJson('sin json'), null)
  assert.equal(extraerJson(''), null)
  assert.equal(extraerJson(null), null)
  assert.equal(extraerJson('{roto'), null)
})

test('resumirCargas incluye la vía, las cifras en formato español y los avisos', () => {
  const texto = resumirCargas(BELMONTE, cargasQueSubsisten(BELMONTE))
  assert.ok(texto.includes('anotación de embargo'))
  assert.ok(texto.includes('44.850,00€'))
  assert.ok(texto.includes('48.450,00€')) // lo que hereda
  assert.ok(texto.includes('CANCELADA'))
})

// ── PDFs escaneados ─────────────────────────────────────────────────────────

/** JPEG mínimo válido: SOI + SOF0 con dimensiones + relleno + EOI. */
function jpegFalso(ancho: number, alto: number, relleno = 4000): Uint8Array {
  const cabecera = [
    0xff, 0xd8, 0xff, // SOI
    0xc0, 0x00, 0x11, // SOF0, longitud 17
    0x08,
    (alto >> 8) & 0xff, alto & 0xff,
    (ancho >> 8) & 0xff, ancho & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]
  const cuerpo = new Array(relleno).fill(0x55)
  return new Uint8Array([...cabecera, ...cuerpo, 0xff, 0xd9])
}

test('localizarJpegs encuentra las imágenes y descarta las miniaturas', () => {
  const grande = jpegFalso(1600, 200, 5000)
  const mini = jpegFalso(20, 20, 10)
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, ...grande, 0x00, 0x00, ...mini, ...grande])
  const hallados = localizarJpegs(pdf)
  assert.equal(hallados.length, 2) // la miniatura queda fuera por tamaño
  assert.ok(hallados[0].inicio < hallados[1].inicio)
  assert.ok(hallados.every((h) => h.bytes >= 3000))
})

test('localizarJpegs no se cuelga con un SOI sin cierre', () => {
  const pdf = new Uint8Array([0xff, 0xd8, 0xff, ...new Array(5000).fill(0x11)])
  assert.deepEqual(localizarJpegs(pdf), [])
})

test('dimensionesJpeg lee ancho y alto del SOF', () => {
  assert.deepEqual(dimensionesJpeg(jpegFalso(1645, 2120)), { ancho: 1645, alto: 2120 })
  assert.equal(dimensionesJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null)
})

test('agruparBandas apila por anchura y respeta el alto máximo', () => {
  const bandas = [
    { indice: 0, ancho: 1600, alto: 100 },
    { indice: 1, ancho: 1600, alto: 100 },
    { indice: 2, ancho: 1200, alto: 300 }, // cambia de ancho → grupo nuevo
    { indice: 3, ancho: 1200, alto: 300 },
  ]
  const grupos = agruparBandas(bandas, 3000)
  assert.equal(grupos.length, 2)
  assert.deepEqual(grupos[0].map((b) => b.indice), [0, 1])
  assert.deepEqual(grupos[1].map((b) => b.indice), [2, 3])
})

test('agruparBandas corta cuando se pasa del alto máximo', () => {
  const bandas = Array.from({ length: 6 }, (_, i) => ({ indice: i, ancho: 1000, alto: 600 }))
  const grupos = agruparBandas(bandas, 1500)
  // 600×2 = 1200 cabe, el tercero se pasaría → grupos de 2.
  assert.equal(grupos.length, 3)
  assert.ok(grupos.every((g) => g.reduce((s, b) => s + b.alto, 0) <= 1500))
})

test('agruparBandas descarta los grupos de unos pocos píxeles (ruido del escáner)', () => {
  const grupos = agruparBandas([{ indice: 0, ancho: 1000, alto: 30 }])
  assert.equal(grupos.length, 0)
})

test('pareceEscaneado distingue el PDF con texto del fotocopiado', () => {
  assert.ok(pareceEscaneado(''))
  assert.ok(pareceEscaneado('   \n  '))
  assert.ok(pareceEscaneado('cuatro palabras sueltas del OCR'))
  assert.equal(pareceEscaneado('x'.repeat(600)), false)
})

// ── Comparar con una nota simple nueva (la certificación del BOE suele ser vieja)

test('compararCuadros detecta carga nueva, cancelada, importe cambiado y desaparecida', () => {
  const nuevo = {
    ...BELMONTE,
    cargas: [
      // La hipoteca sigue, pero con menos pendiente.
      { ...BELMONTE.cargas[0], importe: 21000 },
      // El embargo de Gijón ya está cancelado (caducó).
      { ...BELMONTE.cargas[1], cancelada: true },
      // Aparece un embargo nuevo de Hacienda.
      { tipo: 'embargo' as const, acreedor: 'AEAT', importe: 4200, fecha: '2025-03-01', rango: 'anterior' as const, cancelada: false, literal: 'embargo AEAT' },
    ],
  }
  const cambios = compararCuadros(BELMONTE, nuevo)
  const tipos = cambios.map((c) => c.tipo)

  assert.ok(tipos.includes('importe'))
  assert.ok(tipos.includes('cancelada'))
  assert.ok(tipos.includes('nueva'))
  // La anotación letra D) (la que ejecuta) no está en el nuevo cuadro → desaparecida.
  assert.ok(tipos.includes('desaparecida'))
  assert.ok(cambios.find((c) => c.tipo === 'nueva')!.detalle.includes('AEAT'))
  assert.ok(cambios.find((c) => c.tipo === 'importe')!.detalle.includes('21.000,00€'))
})

test('compararCuadros no inventa cambios cuando el cuadro es el mismo', () => {
  assert.deepEqual(compararCuadros(BELMONTE, BELMONTE), [])
})

test('compararCuadros ignora variaciones de céntimos (redondeo del OCR)', () => {
  const nuevo = { ...BELMONTE, cargas: [{ ...BELMONTE.cargas[0], importe: 44850.2 }, ...BELMONTE.cargas.slice(1)] }
  assert.equal(compararCuadros(BELMONTE, nuevo).length, 0)
})
