// Guardián de lo que la pantalla del presupuesto AFIRMA.
//
// No comprueba estilo: comprueba que ninguna de las frases que decide esta
// pieza convierta un «no lo sé» en un dato, ni un presupuesto en una promesa de
// precio. Es el tipo de red barato de mantener y difícil de saltarse sin darse
// cuenta.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { revisarCopy, explicarInfracciones } from '@central/module-seguros'

import {
  AVISO_NO_ES_CONTRATACION,
  ETIQUETA_FIRMEZA,
  TEXTO_CARATULA,
  TEXTO_COMPARACION,
  TEXTO_FIRMEZA,
  TEXTO_SIN_EQUIVALENTE,
  coberturasDeJson,
  compararGarantias,
  copyFijo,
  esPapel,
  etiquetaPapeles,
  leerFirmeza,
  leerSinEquivalente,
  normalizarGarantia,
  revisarCopyFijo,
  textoCaducidad,
  textoCompaniasConsultadas,
  textoFranquicia,
} from './presupuesto-vista.ts'

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')}€`

// ─── Franquicia ──────────────────────────────────────────────────────────────

test('franquicia NULL dice «no la declara», JAMÁS «sin franquicia»', () => {
  const t = textoFranquicia(null, eur)
  assert.match(t, /no la declara/i)
  assert.doesNotMatch(
    t,
    /sin\s+franquicia/i,
    'NULL es «el producto no declara franquicia». «Sin franquicia» afirma que no la hay, ' +
      'y eso es un dato que nadie ha leído.',
  )
})

test('una franquicia que SÍ está se pinta con su importe', () => {
  assert.match(textoFranquicia(1500, eur), /1500,00€/)
})

// ─── Firmeza ─────────────────────────────────────────────────────────────────

test('una firmeza desconocida cae a `estimado`, nunca a `firme`', () => {
  assert.equal(leerFirmeza('firme'), 'firme')
  assert.equal(leerFirmeza('condicionado'), 'condicionado')
  assert.equal(leerFirmeza('estimado'), 'estimado')
  assert.equal(leerFirmeza(null), 'estimado')
  assert.equal(leerFirmeza('vete a saber'), 'estimado')
})

test('ningún texto de firmeza presenta el precio como cerrado', () => {
  for (const [firmeza, texto] of Object.entries(TEXTO_FIRMEZA)) {
    assert.doesNotMatch(texto, /\btu precio es\b/i, `${firmeza}: no se puede decir «tu precio es X»`)
  }
  // Los dos que hoy se usan (y hoy son el 100 %) nombran la confirmación con la
  // compañía: sin esa frase, un `estimado` se lee como una oferta.
  assert.match(TEXTO_FIRMEZA.estimado, /confirmo con la compañía/i)
  assert.match(TEXTO_FIRMEZA.condicionado, /confirmo con ella/i)
  // Y hasta el `firme` dice que la póliza no existe hasta que la emitan: la
  // firma NO es la contratación, y ese aviso no depende de la firmeza.
  assert.match(TEXTO_FIRMEZA.firme, /no existe hasta que la emita/i)
})

test('el aviso de que elegir no contrata nombra la falta de cobertura', () => {
  assert.match(AVISO_NO_ES_CONTRATACION, /no tienes cobertura/i)
  assert.match(AVISO_NO_ES_CONTRATACION, /hasta que la compañía emita/i)
})

// ─── Los papeles de la portada ───────────────────────────────────────────────

test('los papeles se funden y se dicen, no se reparten', () => {
  assert.equal(etiquetaPapeles(['equivalente'], false), 'La equivalente a lo que tienes hoy')
  const dos = etiquetaPapeles(['equivalente', 'mas_barata'], false)
  assert.match(dos ?? '', /^Es a la vez /)
  assert.match(dos ?? '', /equivalente/)
  assert.match(dos ?? '', /menor importe/)
})

test('sin equivalente, la de menor importe DICE que su cobertura es distinta', () => {
  const t = etiquetaPapeles(['mas_barata'], true) ?? ''
  assert.match(
    t,
    /DISTINTA de la tuya/,
    'Ordenar por precio mezclando Terceros y Todo Riesgo es la mentira que motiva esta pantalla: ' +
      'si no hay equivalente, la de menor importe tiene que decirlo.',
  )
})

test('una opción sin papeles no lleva etiqueta de portada', () => {
  assert.equal(etiquetaPapeles([], false), null)
})

test('un papel que no conocemos se ignora, no se pinta crudo', () => {
  assert.equal(esPapel('mas_barata'), true)
  assert.equal(esPapel('la_que_mas_mola'), false)
  assert.equal(esPapel(null), false)
})

// ─── Los dos motivos de «no hay equivalente» ────────────────────────────────

test('los DOS motivos de sin-equivalente dicen cosas distintas y no se colapsan', () => {
  assert.notEqual(TEXTO_SIN_EQUIVALENTE.actual_sin_coberturas, TEXTO_SIN_EQUIVALENTE.sin_equivalente)
  // «no puedo compararlo con lo que tienes» ≠ «no hay nada parecido».
  assert.match(TEXTO_SIN_EQUIVALENTE.actual_sin_coberturas, /no.*manda el desglose/i)
  assert.match(TEXTO_SIN_EQUIVALENTE.actual_sin_coberturas, /no quiere decir que no haya/i)
  assert.match(TEXTO_SIN_EQUIVALENTE.sin_equivalente, /ninguna compañía me ha dado/i)
  assert.equal(leerSinEquivalente('otra cosa'), null)
})

// ─── La tabla de garantías: CUATRO estados ──────────────────────────────────

test('compara los cuatro estados, y `peor` va PRIMERO', () => {
  const c = compararGarantias(
    ['Responsabilidad civil', 'Lunas', 'Asistencia en viaje'],
    ['Responsabilidad civil', 'Robo'],
    { hayPolizaActual: true },
  )
  assert.equal(c.estado, 'comparada')
  assert.equal(c.peores, 2)
  // Lo que puede dejar a alguien peor cubierto no se entierra.
  assert.equal(c.lineas[0]?.estado, 'peor')
  assert.equal(c.lineas[1]?.estado, 'peor')
  const porEtiqueta = new Map(c.lineas.map((l) => [l.etiqueta, l.estado]))
  assert.equal(porEtiqueta.get('Lunas'), 'peor')
  assert.equal(porEtiqueta.get('Asistencia en viaje'), 'peor')
  assert.equal(porEtiqueta.get('Robo'), 'mejor')
  assert.equal(porEtiqueta.get('Responsabilidad civil'), 'igual')
})

test('la comparación NO depende de acentos, mayúsculas ni espacios', () => {
  const c = compararGarantias(['RESPONSABILIDAD CIVIL '], ['Responsabilidad Civil'], { hayPolizaActual: true })
  assert.equal(c.peores, 0)
  assert.equal(c.lineas[0]?.estado, 'igual')
  assert.equal(normalizarGarantia('Asistencia en Viaje'), 'asistencia en viaje')
})

test('sin desglose de la ACTUAL, todo es `no_consta` y NUNCA `igual`', () => {
  const c = compararGarantias(null, ['Robo', 'Lunas'], { hayPolizaActual: true })
  assert.equal(c.estado, 'actual_sin_desglose')
  assert.equal(c.peores, 0)
  for (const l of c.lineas) {
    assert.equal(
      l.estado,
      'no_consta',
      'Una garantía que no se sabe si está es lo contrario de una que se sabe que está. ' +
        'Pintarla como `igual` convierte un hueco en una frase tranquilizadora.',
    )
  }
})

test('sin garantías congeladas en la OPCIÓN, se dice — no se afirma que no cubra nada', () => {
  // Hoy es el caso de TODAS: `presupuesto_opcion.coberturas` nace `[]` y nadie
  // lo rellena. `[]` aquí significa «no se congeló», jamás «no cubre nada».
  const c = compararGarantias(['Robo'], [], { hayPolizaActual: true })
  assert.equal(c.estado, 'opcion_sin_desglose')
  assert.equal(c.peores, 0)
  assert.equal(c.lineas[0]?.estado, 'no_consta')
  assert.match(TEXTO_COMPARACION.opcion_sin_desglose, /no tengo el desglose/i)
})

test('sin póliza actual no se compara nada ni se insinúa un ahorro', () => {
  const c = compararGarantias(null, ['Robo'], { hayPolizaActual: false })
  assert.equal(c.estado, 'sin_poliza')
  assert.match(TEXTO_COMPARACION.sin_poliza, /no tengo tu seguro actual/i)
  for (const t of Object.values(TEXTO_COMPARACION)) {
    assert.doesNotMatch(t, /ahorr/i, 'ninguna frase de la comparación puede insinuar un ahorro')
  }
})

test('el ruido del EIAC no se cuela como garantía', () => {
  const c = compararGarantias(['Robo', '  ', '—', 'Robo'], ['Robo'], { hayPolizaActual: true })
  assert.equal(c.lineas.length, 1)
  assert.equal(c.lineas[0]?.etiqueta, 'Robo')
})

test('las coberturas del jsonb se leen sin fiarse de su forma', () => {
  assert.deepEqual(coberturasDeJson(['a', 'b']), ['a', 'b'])
  assert.deepEqual(coberturasDeJson([{ descripcion: 'Robo' }, { nombre: 'Lunas' }]), ['Robo', 'Lunas'])
  assert.deepEqual(coberturasDeJson(null), [])
  assert.deepEqual(coberturasDeJson({ a: 1 }), [])
  assert.deepEqual(coberturasDeJson([1, true, {}]), [])
})

// ─── Caducidad ───────────────────────────────────────────────────────────────

test('la caducidad NUNCA se dice como «válido hasta el X» a secas', () => {
  const vivo = textoCaducidad('1 de enero de 2026', '16 de enero de 2026', false)
  assert.doesNotMatch(
    vivo,
    /v[áa]lido hasta/i,
    '«Válido hasta el X» suena a compromiso de la compañía, y la compañía no ha comprometido nada.',
  )
  assert.match(vivo, /Precios calculados el 1 de enero de 2026/)
  assert.match(vivo, /pueden cambiar/i)
  const muerto = textoCaducidad('1 de enero de 2026', '16 de enero de 2026', true)
  assert.match(muerto, /ya ha pasado/i)
  assert.match(muerto, /precio actualizado/i)
})

// ─── Lo que NO se puede afirmar del análisis objetivo ───────────────────────

test('no se inventa cuántas compañías se consultaron', () => {
  const t = textoCompaniasConsultadas(2)
  assert.match(t, /son de 2 compañías/)
  // El snapshot no guarda el recuento de consultadas: decir «consulté 2» sobre
  // una tarificación de ocho sería inventarse el número que sostiene la
  // afirmación legal del análisis objetivo.
  assert.match(t, /Consulté más de las que aparecen aquí/)
  assert.match(textoCompaniasConsultadas(1), /son de 1 compañía\./)
})

// ─── La carátula pública ─────────────────────────────────────────────────────

test('la carátula no nombra ni el ramo ni el bien ni un importe', () => {
  const t = `${TEXTO_CARATULA.titulo} ${TEXTO_CARATULA.cuerpo}`
  for (const palabra of ['coche', 'moto', 'hogar', 'vivienda', 'salud', 'vida', 'decesos', 'matrícula', '€']) {
    assert.ok(
      !t.toLowerCase().includes(palabra.toLowerCase()),
      `la carátula es PÚBLICA y reenviable: no puede nombrar «${palabra}»`,
    )
  }
  assert.match(TEXTO_CARATULA.cuerpo, /entra con tu correo/i)
  assert.match(TEXTO_CARATULA.cuerpo, /c[óo]digo de un solo uso/i)
})

// ─── El copy regulado ────────────────────────────────────────────────────────

test('todo el texto fijo pasa `revisarCopy()`', () => {
  // Un presupuesto YA es asesoramiento: una promesa de ahorro aquí es una
  // promesa contractualizable, y hace peor daño que en una landing.
  assert.equal(revisarCopyFijo(), '', `copy prohibido en la pantalla del presupuesto: ${revisarCopyFijo()}`)
  assert.ok(copyFijo().length >= 15, 'el cepo tiene que estar mirando el texto de verdad, no una lista vacía')
})

test('el cepo de copy SABE morder: «la más barata» es exactamente lo prohibido', () => {
  // Contra-prueba de que el test de arriba no pasa por estar mirando a la nada.
  const infracciones = revisarCopy('Te buscamos la póliza más barata y te ahorras 300 €')
  assert.ok(infracciones.length >= 2, explicarInfracciones(infracciones))
})

test('ninguna etiqueta de firmeza promete nada', () => {
  for (const e of Object.values(ETIQUETA_FIRMEZA)) {
    assert.ok(e.length <= 14, `la etiqueta «${e}» va pegada al importe: tiene que caber a 320 px`)
  }
})
