import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_DIRECCION,
  MAX_VARIANTES,
  ORIGENES_CAMPO,
  esOrigenCampo,
  formatoReferencia,
  normalizarOrigenes,
  normalizarReferencia,
  variantesDireccion,
} from './direccion-catastro.ts'

/** Sin acentos, en mayúsculas y sin puntuación: para comparar «Guía» con «GUIA». */
function llano(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

// ── El residuo que hacía gastar una consulta en una dirección que no existe ──

test('🚨 el interior se va ENTERO: no queda la puerta colgando tras la coma', () => {
  // El fallo que este fichero existe para evitar: al quitar el «2º» se quedaba
  // «CALLE San Vicente 40, 14», que no es la dirección de nadie y aun así se
  // consultaba al Catastro.
  assert.deepEqual(variantesDireccion('C/ San Vicente 40, 2º 14'), [
    'CALLE San Vicente 40, 2º 14',
    'CALLE San Vicente 40',
  ])
})

// ── Cómo escribe la gente el interior ────────────────────────────────────────

test('el interior se quita lo escriba como lo escriba', () => {
  const casos: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['Calle Mayor 12, 3º B', ['Calle Mayor 12']],
    ['Calle Mayor 12, 3 B', ['Calle Mayor 12']],
    ['Calle Mayor 12, bajo dcha', ['Calle Mayor 12']],
    ['Calle Mayor 12, Esc 2 4ºC', ['Calle Mayor 12']],
    ['Calle Mayor 12, Pl:02 Pt:14', ['Calle Mayor 12']],
    ['Calle Mayor 12, 1º izquierda', ['Calle Mayor 12']],
    ['Calle Mayor 12, ático', ['Calle Mayor 12']],
    ['Calle Mayor 12, -1', ['Calle Mayor 12']],
    ['Calle Mayor 12, local 3', ['Calle Mayor 12']],
    ['Calle Mayor 12, portal 2', ['Calle Mayor 12']],
    ['Calle Mayor 12, piso 4 puerta 9', ['Calle Mayor 12']],
    ['Calle Mayor 12 3ºB', ['Calle Mayor 12']],
    ['Calle Mayor 12 bajo', ['Calle Mayor 12']],
    ['Calle Mayor 12, escalera 2, 1 A', ['Calle Mayor 12']],
  ]
  for (const [entrada, esperado] of casos) {
    assert.deepEqual(variantesDireccion(entrada), esperado, entrada)
  }
})

test('el número «bis» pegado al portal NO es una puerta: 12B se queda en 12B', () => {
  // «Calle Mayor 12B» y «Calle Mayor 12» son dos portales distintos.
  assert.deepEqual(variantesDireccion('Calle Mayor 12B, 3º'), ['Calle Mayor 12B'])
  assert.deepEqual(variantesDireccion('Calle Mayor 12-14, 3º B'), ['Calle Mayor 12-14'])
})

test('el código postal y la localidad NO son interior: se quedan', () => {
  // Un CP son cinco cifras; una puerta, una o dos. Colapsarlos dejaría la
  // dirección sin la única pista de municipio que trae.
  assert.deepEqual(variantesDireccion('Calle Mayor 12, 3º B, 41002 Sevilla'), [
    'Calle Mayor 12, 41002 Sevilla',
    'Calle Mayor 12',
  ])
})

// ── 🚨 Cepo anti-destrozo de calle ───────────────────────────────────────────
//
// Vías REALES cuyo nombre lleva dentro una de las palabras trampa. Si la regla
// de quitar el interior no está anclada al número de portal, se come parte del
// nombre y el Catastro responde con OTRA vivienda —y eso no da error: da metros
// y año equivocados en una póliza de hogar.

const VIAS_TRAMPA: ReadonlyArray<readonly [string, string]> = [
  ['Calle Bajo Guía 12', 'Bajo Guia'],
  ['Avenida Ático Sur 3', 'Atico Sur'],
  ['Calle Puerta Real 8', 'Puerta Real'],
  ['Plaza del Portal 3', 'del Portal'],
  ['Calle Doctor Esquerdo 12', 'Doctor Esquerdo'],
  ['Calle Puerto Real 8', 'Puerto Real'],
  ['Calle Escalerillas 4', 'Escalerillas'],
  ['Calle Sótano Viejo 9', 'Sotano Viejo'],
  ['Calle Centro 6', 'Centro'],
  ['Calle Piso Alto 2', 'Piso Alto'],
  ['Calle Bloque Nuevo 5', 'Bloque Nuevo'],
  ['Calle Local Mayor 7', 'Local Mayor'],
]

test('🚨 el nombre de la vía sobrevive INTACTO en todas las variantes', () => {
  for (const [via, nucleo] of VIAS_TRAMPA) {
    // Con interior detrás, para que haya variantes de verdad que revisar: un
    // cepo sobre una lista vacía no vigila nada.
    for (const sufijo of [', 3º B', ', bajo dcha', ', Esc 2 Pt 4', ' 1º izq']) {
      const entrada = `${via}${sufijo}`
      const variantes = variantesDireccion(entrada)
      assert.ok(variantes.length > 0, `sin variantes que comprobar: ${entrada}`)
      for (const v of variantes) {
        assert.ok(
          llano(v).includes(llano(nucleo)),
          `«${nucleo}» destrozado en «${v}» (entrada: ${entrada})`,
        )
      }
    }
  }
})

test('🚨 sin nada detrás del número, una vía trampa no genera NINGUNA variante', () => {
  // No hay interior que quitar: cualquier variante aquí solo puede ser un
  // trozo de la calle mutilado.
  for (const [via] of VIAS_TRAMPA) {
    assert.deepEqual(variantesDireccion(via), [], via)
  }
})

test('🚨 un número dentro del nombre de la vía no se toma por el portal', () => {
  // «Calle 28 de Febrero 5»: cortar por el PRIMER número daría «Calle 28».
  assert.deepEqual(variantesDireccion('Calle 28 de Febrero 5'), [])
  assert.deepEqual(variantesDireccion('Calle 28 de Febrero 5, 2º D'), ['Calle 28 de Febrero 5'])
})

// ── Siglas de vía ────────────────────────────────────────────────────────────

test('la sigla corta se expande a la larga, que es como está el callejero', () => {
  const casos: ReadonlyArray<readonly [string, string]> = [
    ['C/ Mayor 3, 2º', 'CALLE Mayor 3'],
    ['C. Mayor 3, 2º', 'CALLE Mayor 3'],
    ['Avda. Mayor 3, 2º', 'AVENIDA Mayor 3'],
    ['Av. Mayor 3, 2º', 'AVENIDA Mayor 3'],
    ['Pza. Mayor 3, 2º', 'PLAZA Mayor 3'],
    ['Plza. Mayor 3, 2º', 'PLAZA Mayor 3'],
    ['Pº Mayor 3, 2º', 'PASEO Mayor 3'],
    ['Ctra. Mayor 3, 2º', 'CARRETERA Mayor 3'],
    ['Urb. Mayor 3, 2º', 'URBANIZACION Mayor 3'],
    ['Trav. Mayor 3, 2º', 'TRAVESIA Mayor 3'],
    ['Gta. Mayor 3, 2º', 'GLORIETA Mayor 3'],
    ['Cno. Mayor 3, 2º', 'CAMINO Mayor 3'],
    ['Rda. Mayor 3, 2º', 'RONDA Mayor 3'],
    ['Bda. Mayor 3, 2º', 'BARRIADA Mayor 3'],
    ['Cjon. Mayor 3, 2º', 'CALLEJON Mayor 3'],
    ['Pol. Mayor 3, 2º', 'POLIGONO Mayor 3'],
    ['Pje. Mayor 3, 2º', 'PASAJE Mayor 3'],
    // Las de DOS letras del Catastro, tal cual vienen en los papeles.
    ['CL Mayor 3, 2º', 'CALLE Mayor 3'],
    ['CM Mayor 3, 2º', 'CAMINO Mayor 3'],
    ['GL Mayor 3, 2º', 'GLORIETA Mayor 3'],
    ['CJ Mayor 3, 2º', 'CALLEJON Mayor 3'],
    ['RD Mayor 3, 2º', 'RONDA Mayor 3'],
    ['BO Mayor 3, 2º', 'BARRIO Mayor 3'],
    ['PZ Mayor 3, 2º', 'PLAZA Mayor 3'],
    ['TR Mayor 3, 2º', 'TRAVESIA Mayor 3'],
  ]
  for (const [entrada, esperado] of casos) {
    assert.ok(
      variantesDireccion(entrada).includes(esperado),
      `${entrada} → ${JSON.stringify(variantesDireccion(entrada))} (falta «${esperado}»)`,
    )
  }
})

test('🚨 una palabra que EMPIEZA como una sigla no se parte por la mitad', () => {
  // «Avenida» empieza por «Av», «Clara» por «Cl», «Plaza» por «Pl»: si la sigla
  // se aceptara sin exigir el separador, saldría «AVENIDA enida …».
  for (const via of [
    'Avenida Mayor 3, 2º',
    'Clara Campoamor 3, 2º',
    'Plaza Nueva 3, 2º',
    'Camino Viejo 3, 2º',
    'Pasaje Andaluz 3, 2º',
    'Colonia Nueva 3, 2º',
  ]) {
    const nucleo = llano(via.split(' ')[0])
    for (const v of variantesDireccion(via)) {
      assert.ok(llano(v).startsWith(nucleo), `«${via}» → «${v}»`)
    }
  }
})

test('las siglas de dos letras solo cuentan en MAYÚSCULAS y con espacio detrás', () => {
  // En minúscula «Co», «Cu» o «Bo» pueden ser el principio de un nombre real;
  // en mayúscula y sueltas son el código de vía de un papel oficial.
  for (const v of variantesDireccion('Co Bermejo 3, 2º')) {
    assert.ok(!llano(v).startsWith('COLONIA'), `«Co Bermejo» expandido a «${v}»`)
  }
  assert.ok(variantesDireccion('CO Bermejo 3, 2º').includes('COLONIA Bermejo 3'))
})

test('las abreviaturas de dentro del nombre se prueban en las DOS formas', () => {
  // El callejero suele escribir «DOCTOR FLEMING», pero no siempre: se consultan
  // las dos, no se elige por la cara.
  const v = variantesDireccion('C/ Dr. Fleming 40, 2º')
  assert.ok(v.includes('CALLE Dr. Fleming 40'), JSON.stringify(v))
  assert.ok(v.includes('CALLE DOCTOR Fleming 40'), JSON.stringify(v))
})

// ── Invariantes de la lista ──────────────────────────────────────────────────

const ENTRADAS: readonly string[] = [
  'C/ San Vicente 40, 2º 14',
  'C/ Dr. Fleming nº 40, 2º 14, 41002 Sevilla',
  'Avda. de la Constitución nº 12, 4º dcha',
  'CL SAN VICENTE 40 PL:02 PT:14',
  'Calle Bajo Guía 12, 3º B',
  'Plaza del Portal 3',
  'Calle Mayor 12',
  '12',
  'Calle sin número',
  'Sta. María la Blanca 4, 1º',
]

test('nunca más de MAX_VARIANTES: cada variante es una consulta al Catastro', () => {
  for (const e of ENTRADAS) {
    assert.ok(variantesDireccion(e).length <= MAX_VARIANTES, `${e} → ${variantesDireccion(e).length}`)
  }
  // Y el tope MUERDE de verdad: esta dirección da 8 candidatas distintas.
  assert.equal(variantesDireccion('C/ Dr. Fleming nº 40, 2º 14, 41002 Sevilla').length, MAX_VARIANTES)
})

test('nunca la original, nunca duplicados, nunca cadena vacía', () => {
  for (const e of ENTRADAS) {
    const v = variantesDireccion(e)
    const claves = v.map(llano).map((x) => x.replace(/[^A-Z0-9]/g, ''))
    assert.ok(!claves.includes(llano(e).replace(/[^A-Z0-9]/g, '')), `${e} devuelve la original`)
    assert.equal(new Set(claves).size, claves.length, `${e} tiene duplicados`)
    for (const x of v) {
      assert.notEqual(x.trim(), '', `${e} devuelve una cadena vacía`)
      assert.equal(x, x.trim())
      assert.ok(!/[,;.\-]$/.test(x), `${e} deja puntuación colgando: «${x}»`)
    }
  }
})

test('el orden es de más probable a menos: primero se recorta poco, luego mucho', () => {
  const v = variantesDireccion('C/ Dr. Fleming nº 40, 2º 14, 41002 Sevilla')
  assert.deepEqual(v, [
    'CALLE Dr. Fleming nº 40, 2º 14, 41002 Sevilla',
    'CALLE DOCTOR Fleming nº 40, 2º 14, 41002 Sevilla',
    'CALLE Dr. Fleming nº 40, 41002 Sevilla',
    'CALLE DOCTOR Fleming nº 40, 41002 Sevilla',
    'CALLE Dr. Fleming 40, 41002 Sevilla',
    'CALLE DOCTOR Fleming 40, 41002 Sevilla',
  ])
})

test('vacía, solo espacios o más larga que MAX_DIRECCION: ninguna variante', () => {
  assert.deepEqual(variantesDireccion(''), [])
  assert.deepEqual(variantesDireccion('   '), [])
  assert.deepEqual(variantesDireccion('\n\t '), [])

  const relleno = 'A'.repeat(MAX_DIRECCION - 12)
  const justa = `C/ ${relleno} 12, 3º B`
  assert.equal(justa.length, MAX_DIRECCION)
  assert.ok(variantesDireccion(justa).length > 0, 'la frontera exacta SÍ se procesa')
  assert.deepEqual(variantesDireccion(`${justa}x`), [])
})

test('es determinista: dos llamadas seguidas dan exactamente lo mismo', () => {
  for (const e of ENTRADAS) {
    assert.deepEqual(variantesDireccion(e), variantesDireccion(e), e)
  }
})

// ── La referencia catastral ──────────────────────────────────────────────────

const REF_INMUEBLE = '9872023VH5797S0001WX' // 20
const REF_FINCA = '9872023VH5797S' // 14

test('🚨 la de 14 NO es la vivienda: es la finca, o sea el EDIFICIO', () => {
  // Aceptar una de 14 como si identificara el piso trae los metros del edificio
  // entero — un número plausible y equivocado. Por eso esto dice QUÉ es, para
  // poder pedirle a la persona la de su piso.
  assert.equal(REF_FINCA.length, 14)
  assert.equal(formatoReferencia(REF_FINCA), 'finca')

  assert.equal(REF_INMUEBLE.length, 20)
  assert.equal(formatoReferencia(REF_INMUEBLE), 'inmueble')

  assert.notEqual(formatoReferencia(REF_FINCA), formatoReferencia(REF_INMUEBLE))
})

test('los espacios, puntos, guiones y barras de por medio no cambian nada', () => {
  assert.equal(formatoReferencia('9872023 VH5797S 0001 WX'), 'inmueble')
  assert.equal(formatoReferencia('9872023-VH5797S-0001-WX'), 'inmueble')
  assert.equal(formatoReferencia('9872023.VH5797S/0001 WX'), 'inmueble')
  assert.equal(formatoReferencia(' 9872023 VH5797S '), 'finca')
  assert.equal(normalizarReferencia('9872023 vh5797s 0001 wx'), REF_INMUEBLE)
})

test('minúsculas valen: el Catastro no distingue caja', () => {
  assert.equal(formatoReferencia(REF_INMUEBLE.toLowerCase()), 'inmueble')
  assert.equal(formatoReferencia(REF_FINCA.toLowerCase()), 'finca')
})

test('13 o 21 caracteres es «invalida»: solo 14 y 20 son longitudes de referencia', () => {
  assert.equal(formatoReferencia(REF_FINCA.slice(0, 13)), 'invalida')
  assert.equal(formatoReferencia(`${REF_INMUEBLE}Z`), 'invalida')
  assert.equal(formatoReferencia(REF_INMUEBLE.slice(0, 19)), 'invalida')
})

test('la Ñ y cualquier símbolo la invalidan: solo A-Z y 0-9', () => {
  assert.equal(formatoReferencia(`Ñ872023VH5797S0001WX`), 'invalida')
  assert.equal(formatoReferencia(`9872023VH5797S0001W@`), 'invalida')
  assert.equal(formatoReferencia(`9872023VH5797S0001Wñ`), 'invalida')
})

test('lo que no es texto no es una referencia', () => {
  for (const v of [null, undefined, '', '   ', 12345678901234 as unknown as string]) {
    assert.equal(formatoReferencia(v as string | null | undefined), 'invalida', JSON.stringify(v))
  }
})

// ── Orígenes por campo ───────────────────────────────────────────────────────

test('un origen de una clave que NO está en los datos se descarta', () => {
  // «el campo X vino del Catastro» cuando X no existe es un sello de verificado
  // sobre un hueco.
  const r = normalizarOrigenes(
    { metrosCuadrados: 76 },
    { metrosCuadrados: 'catastro', anioConstruccion: 'catastro' },
  )
  assert.deepEqual(r, { metrosCuadrados: 'catastro' })
})

test('un valor fuera del vocabulario se descarta', () => {
  const r = normalizarOrigenes(
    { metrosCuadrados: 76, anioConstruccion: 1980 },
    { metrosCuadrados: 'catastro', anioConstruccion: 'compania' },
  )
  assert.deepEqual(r, { metrosCuadrados: 'catastro' })
  assert.deepEqual(ORIGENES_CAMPO, ['catastro', 'documento', 'declarado'])
  assert.equal(esOrigenCampo('compania'), false)
  assert.equal(esOrigenCampo('calculado'), false)
})

test('🚨 si no queda ningún origen sale null, NUNCA un objeto vacío', () => {
  // `{}` se lee como «ya lo he mirado y no hay procedencia»; `null` es «no se
  // sabe». No son lo mismo aguas abajo.
  assert.equal(normalizarOrigenes({ metrosCuadrados: 76 }, { anioConstruccion: 'catastro' }), null)
  assert.equal(normalizarOrigenes({ metrosCuadrados: 76 }, { metrosCuadrados: 'inventado' }), null)
  assert.equal(normalizarOrigenes({ metrosCuadrados: 76 }, {}), null)
})

test('sin datos, sin orígenes, o con algo que no es un objeto: null', () => {
  assert.equal(normalizarOrigenes(null, { m: 'catastro' }), null)
  assert.equal(normalizarOrigenes(undefined, { m: 'catastro' }), null)
  assert.equal(normalizarOrigenes({ m: 1 }, null), null)
  assert.equal(normalizarOrigenes({ m: 1 }, undefined), null)
  assert.equal(normalizarOrigenes({ m: 1 }, 'catastro'), null)
  assert.equal(normalizarOrigenes({ m: 1 }, [['m', 'catastro']]), null)
})

test('una clave presente pero a null en los datos sigue teniendo origen', () => {
  // `null` en `datos_ramo` es «pendiente», no «no existe el campo»: si el
  // origen desapareciera, se perdería quién tenía que rellenarlo.
  assert.deepEqual(normalizarOrigenes({ metrosCuadrados: null }, { metrosCuadrados: 'declarado' }), {
    metrosCuadrados: 'declarado',
  })
})
