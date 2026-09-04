// Cepos del ALTA A MANO de una póliza (`normalizarAlta`), la que declara el
// cliente sin documento.
//
// ─── Qué protege, y por qué se escribió ─────────────────────────────────────
// El alta reutiliza la validación del PATCH (`normalizarParche`) a propósito:
// lo que se rechaza al corregir no puede colarse al crear. Lo que añade —y es
// lo que se fija aquí— son dos cosas: que TODAS las claves existan (en un alta
// no hay «no lo toques»: lo no escrito es `null`, «no lo sé»), y que haga falta
// compañía O número de póliza. Una fila con ramo y prima pero sin nada que
// diga de qué seguro se habla es ruido que nadie reconocerá después.
//
// Las reglas de cada campo (fecha imposible, prima negativa, `''` → null…) ya
// tienen su guardián en `test/regression-portal-poliza-editable.test.ts` (raíz);
// aquí solo se comprueba que el alta las HEREDA, no se vuelven a enumerar.
import test from 'node:test'
import assert from 'node:assert/strict'

import { camposDeRamo, RAMOS_POLIZA } from '@central/module-seguros-portal'

import { normalizarAlta, normalizarParche } from './poliza-editable.ts'

const HOY = new Date(Date.UTC(2026, 8, 3))

const ok = (r: ReturnType<typeof normalizarAlta>) => {
  assert.equal(r.ok, true, `esperaba ok, salió ${JSON.stringify(r)}`)
  return (r as { ok: true; datos: Record<string, unknown> }).datos
}
const fallo = (r: ReturnType<typeof normalizarAlta>) => {
  assert.equal(r.ok, false, `esperaba error, salió ${JSON.stringify(r)}`)
  return (r as { ok: false; error: string }).error
}

test('un cuerpo vacio se rechaza: no hay nada que identifique la poliza', () => {
  assert.equal(fallo(normalizarAlta({}, HOY)), 'sin_identificacion')
  // Y con campos pero sin compañía ni número, igual: ramo y prima no dicen DE QUÉ seguro.
  assert.equal(fallo(normalizarAlta({ ramo: 'auto', primaAnual: 320 }, HOY)), 'sin_identificacion')
  // La cadena vacía es un hueco, no una compañía.
  assert.equal(fallo(normalizarAlta({ compania: '   ', numeroPoliza: '' }, HOY)), 'sin_identificacion')
})

test('un cuerpo que no es objeto se rechaza como cuerpo invalido, no como sin identificar', () => {
  for (const basura of [null, 'texto', 42, [1, 2], true]) {
    assert.equal(fallo(normalizarAlta(basura, HOY)), 'cuerpo_invalido')
  }
})

test('solo compañia basta, y el resto sale a null (no ausente)', () => {
  const d = ok(normalizarAlta({ compania: '  Mapfre ' }, HOY))
  assert.deepEqual(d, {
    compania: 'Mapfre',
    numeroPoliza: null,
    ramo: null,
    primaAnual: null,
    fechaVencimiento: null,
    matricula: null,
    bastidor: null,
    fechaMatriculacion: null,
    referenciaCatastral: null,
    datosRamo: null,
    datosRamoOrigen: null,
  })
  // Las once claves EXISTEN: en un alta «no lo toques» no significa nada, así
  // que un campo que no se rellenó vale `null` y está presente, nunca ausente.
  assert.deepEqual(Object.keys(d).sort(), [
    'bastidor',
    'compania',
    'datosRamo',
    'datosRamoOrigen',
    'fechaMatriculacion',
    'fechaVencimiento',
    'matricula',
    'numeroPoliza',
    'primaAnual',
    'ramo',
    'referenciaCatastral',
  ])
})

test('solo numero de poliza basta', () => {
  const d = ok(normalizarAlta({ numeroPoliza: 'P-12345' }, HOY))
  assert.equal(d.numeroPoliza, 'P-12345')
  assert.equal(d.compania, null)
})

test('prima negativa se rechaza igual que al editar', () => {
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', primaAnual: -1 }, HOY)), 'prima_negativa')
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', primaAnual: 'doscientos' }, HOY)), 'prima_invalida')
})

test('fecha invalida se rechaza igual que al editar', () => {
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', fechaVencimiento: '2026-02-31' }, HOY)), 'fecha_inexistente')
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', fechaVencimiento: '03/09/2026' }, HOY)), 'fecha_formato')
  assert.equal(fallo(normalizarAlta({ compania: 'Axa', fechaVencimiento: '1970-01-01' }, HOY)), 'fecha_fuera_de_rango')
})

test('un alta completa sale normalizada: prima con coma, fecha a medianoche UTC', () => {
  const d = ok(
    normalizarAlta(
      { compania: 'Allianz', numeroPoliza: '77', ramo: 'hogar', primaAnual: '412,50', fechaVencimiento: '2027-01-15' },
      HOY,
    ),
  )
  assert.equal(d.primaAnual, 412.5)
  assert.equal((d.fechaVencimiento as Date).toISOString(), '2027-01-15T00:00:00.000Z')
  assert.equal(d.ramo, 'hogar')
})

test('ninguna clave desconocida se propaga al alta', () => {
  const d = ok(normalizarAlta({ compania: 'Axa', identidadId: 'otro', confirmadaPorUsuario: false, procedencia: 'compania' }, HOY))
  assert.equal('identidadId' in d, false)
  assert.equal('confirmadaPorUsuario' in d, false)
  assert.equal('procedencia' in d, false)
})

// ─── Identificadores del BIEN en el PATCH (matrícula, bastidor, matriculación) ──
//
// La regla es la MISMA que al leer un documento (`lib/extraer-poliza.ts`, con
// sus cepos en `extraer-poliza.test.ts`): mismo VIN de 17 sin I/O/Q, misma lista
// de centinelas, misma matrícula compactada. Lo que cambia —y es lo que se fija
// aquí— es la REACCIÓN, porque quien habla es una PERSONA:
//   · centinela o vacío → borrado silencioso, porque «no lo sé» es un dato;
//   · forma incorrecta → ERROR, porque anularle en silencio lo que ha escrito le
//     deja creyendo que lo ha guardado, y con un bastidor eso es otro coche.

const okP = (r: ReturnType<typeof normalizarParche>) => {
  assert.equal(r.ok, true, `esperaba ok, salió ${JSON.stringify(r)}`)
  return (r as { ok: true; parche: Record<string, unknown> }).parche
}
const falloP = (r: ReturnType<typeof normalizarParche>) => {
  assert.equal(r.ok, false, `esperaba error, salió ${JSON.stringify(r)}`)
  return (r as { ok: false; error: string }).error
}

test('el parche normaliza la matricula y el bastidor: mayusculas, sin separadores', () => {
  const p = okP(normalizarParche({ matricula: ' 1234-bcd ', bastidor: 'wvw zzz1kzaw123456' }, HOY))
  assert.equal(p.matricula, '1234BCD')
  assert.equal(p.bastidor, 'WVWZZZ1KZAW123456')
})

test('un bastidor mal escrito por una persona es ERROR, no un null callado', () => {
  // 16, 18 y con I/O/Q: los tres identifican OTRO coche.
  assert.equal(falloP(normalizarParche({ bastidor: 'VF1RFA0056712345' }, HOY)), 'bastidor_invalido')
  assert.equal(falloP(normalizarParche({ bastidor: 'VF1RFA005671234567' }, HOY)), 'bastidor_invalido')
  assert.equal(falloP(normalizarParche({ bastidor: 'VF1RFAI0567123456' }, HOY)), 'bastidor_invalido')
  assert.equal(falloP(normalizarParche({ bastidor: 'VF1RFAO0567123456' }, HOY)), 'bastidor_invalido')
  assert.equal(falloP(normalizarParche({ bastidor: 'VF1RFAQ0567123456' }, HOY)), 'bastidor_invalido')
  assert.equal(falloP(normalizarParche({ matricula: 'NO CONSTA EN LA POLIZA' }, HOY)), 'matricula_invalida')
  assert.equal(falloP(normalizarParche({ bastidor: 12345 }, HOY)), 'bastidor_invalido')
})

test('centinela y vacio BORRAN el identificador, no dan error', () => {
  // Que alguien teclee «N/A» no es una equivocación: es «no lo sé».
  for (const centinela of ['', '   ', 'N/A', 'no consta', '-', '0000000']) {
    const p = okP(normalizarParche({ compania: 'Axa', matricula: centinela, bastidor: centinela }, HOY))
    assert.equal(p.matricula, null, `matricula ${JSON.stringify(centinela)}`)
    assert.equal(p.bastidor, null, `bastidor ${JSON.stringify(centinela)}`)
  }
  const p = okP(normalizarParche({ matricula: null, bastidor: null, fechaMatriculacion: null }, HOY))
  assert.deepEqual(p, { matricula: null, bastidor: null, fechaMatriculacion: null })
})

test('los identificadores AUSENTES no viajan en el parche', () => {
  const p = okP(normalizarParche({ compania: 'Axa' }, HOY))
  assert.equal('matricula' in p, false)
  assert.equal('bastidor' in p, false)
  assert.equal('fechaMatriculacion' in p, false)
  // Y un identificador solo YA es un parche: no hace falta tocar el contrato.
  assert.deepEqual(Object.keys(okP(normalizarParche({ bastidor: 'WVWZZZ1KZAW123456' }, HOY))), ['bastidor'])
})

test('la fecha de matriculacion mira al PASADO, al reves que el vencimiento', () => {
  const p = okP(normalizarParche({ fechaMatriculacion: '2010-05-20' }, HOY))
  assert.equal((p.fechaMatriculacion as Date).toISOString(), '2010-05-20T00:00:00.000Z')

  // Futura: o es un año tecleado de más, o es el vencimiento de la póliza
  // puesto en el sitio equivocado. Las dos cosas dan antigüedad negativa.
  assert.equal(falloP(normalizarParche({ fechaMatriculacion: '2027-01-15' }, HOY)), 'fecha_matriculacion_futura')
  assert.equal(falloP(normalizarParche({ fechaMatriculacion: '2026-09-04' }, HOY)), 'fecha_matriculacion_futura')
  // Hoy sí entra.
  assert.ok(normalizarParche({ fechaMatriculacion: '2026-09-03' }, HOY).ok)

  assert.equal(falloP(normalizarParche({ fechaMatriculacion: '1899-12-31' }, HOY)), 'fecha_matriculacion_fuera_de_rango')
  assert.equal(falloP(normalizarParche({ fechaMatriculacion: '2020-02-31' }, HOY)), 'fecha_matriculacion_inexistente')
  assert.equal(falloP(normalizarParche({ fechaMatriculacion: '15/01/2020' }, HOY)), 'fecha_matriculacion_formato')
  assert.equal(falloP(normalizarParche({ fechaMatriculacion: 1577836800000 }, HOY)), 'fecha_matriculacion_formato')

  // ⚠️ El rango del VENCIMIENTO no se ha tocado al compartir el parseo: sigue
  // aceptando el futuro (que es donde vive un vencimiento) y rechazando 1970.
  assert.ok(normalizarParche({ fechaVencimiento: '2027-01-15' }, HOY).ok)
  assert.equal(falloP(normalizarParche({ fechaVencimiento: '1970-01-01' }, HOY)), 'fecha_fuera_de_rango')
})

test('el alta a mano tiene ONCE campos: la poliza, el bien, los del ramo y su origen', () => {
  // La forma de `DatosAlta` la fija `test/regression-portal-poliza-editable.test.ts`
  // (raíz) con un `deepEqual` del objeto entero, y los dos se actualizan a la vez:
  // ese cepo existe para que añadir un campo al alta sea una decisión y no un
  // descuido. Los tres del vehículo entraron el 03/09/2026 porque el alta a mano
  // es donde el cliente teclea la matrícula, y de ahí sale la fecha estimada;
  // `datosRamo` entró el 04/09/2026 porque el formulario del alta es donde se
  // despliegan los campos del ramo elegido — si no se pudieran declarar al
  // crear, se pedirían dos veces o no se pedirían nunca. Y ese mismo día
  // entraron `referenciaCatastral` (el identificador del inmueble, de donde sale
  // el autorrelleno del Catastro) y `datosRamoOrigen` (de dónde salió cada campo:
  // los metros que se aceptan del Catastro no son los que se estiman a ojo).
  const d = ok(normalizarAlta({ compania: 'Axa', matricula: '1234BCD', bastidor: 'WVWZZZ1KZAW123456' }, HOY))
  assert.deepEqual(Object.keys(d).sort(), [
    'bastidor',
    'compania',
    'datosRamo',
    'datosRamoOrigen',
    'fechaMatriculacion',
    'fechaVencimiento',
    'matricula',
    'numeroPoliza',
    'primaAnual',
    'ramo',
    'referenciaCatastral',
  ])
  assert.equal(d.matricula, '1234BCD')
  assert.equal(d.bastidor, 'WVWZZZ1KZAW123456')
})


// ─── `datosRamo` en el PATCH: QUÉ RAMO manda al validar ──────────────────────
//
// Los campos específicos no significan nada sin su ramo, y en un parche el ramo
// puede venir en el propio cuerpo o estar ya guardado. Lo que se fija aquí es la
// decisión, porque las tres alternativas fallan en silencio:
//   · validar contra el ramo VIEJO dejaría entrar datos que la pantalla del ramo
//     nuevo no enseña nunca;
//   · dejar los del ramo viejo al cambiar de ramo los ENTIERRA (invisibles en la
//     pantalla, presentes en la columna, listos para reaparecer);
//   · y aceptar `datosRamo` sin saber el ramo vaciaría la columna en cada
//     corrección de la prima sin que nada fallara.

/** Un ramo con algún campo de texto, leído del catálogo EN CALIENTE: lo llena
 *  otra gente, y fijar aquí sus campos rompería el test con cada uno nuevo. */
function campoTextoDelCatalogo(): { ramo: string; id: string } | null {
  for (const ramo of RAMOS_POLIZA) {
    const campo = camposDeRamo(ramo).find((c) => c.tipo === 'texto')
    if (campo) return { ramo, id: campo.id }
  }
  return null
}

test('manda el ramo que la poliza VA A TENER: el del parche gana al guardado', () => {
  const elegido = campoTextoDelCatalogo()
  if (!elegido) return // catálogo vacío: no hay nada que validar todavía

  // Ramo en el parche → se valida contra ESE catálogo, aunque haya otro guardado.
  const p = normalizarParche(
    { ramo: elegido.ramo, datosRamo: { [elegido.id]: 'Un valor' } },
    HOY,
    { ramoGuardado: 'vida' },
  )
  assert.equal(p.ok, true, JSON.stringify(p))
  assert.deepEqual((p as { ok: true; parche: { datosRamo: unknown } }).parche.datosRamo, {
    [elegido.id]: 'Un valor',
  })

  // Sin ramo en el parche → manda el GUARDADO, que es el que la póliza tiene.
  const q = normalizarParche({ datosRamo: { [elegido.id]: 'Otro' } }, HOY, { ramoGuardado: elegido.ramo })
  assert.deepEqual((q as { ok: true; parche: { datosRamo: unknown } }).parche.datosRamo, {
    [elegido.id]: 'Otro',
  })
})

test('cambiar de ramo LIMPIA los datos del anterior, en vez de enterrarlos', () => {
  // Los campos del ramo viejo se quedan sin catálogo: ni se enseñan ni se pueden
  // corregir. Se prefiere perder un dato descriptivo a conservar uno invisible
  // que reaparecería el día que alguien volviera al ramo original.
  const p = normalizarParche({ ramo: 'vida' }, HOY, { ramoGuardado: 'hogar' })
  assert.equal('datosRamo' in okP(p), true, 'el cambio de ramo tiene que arrastrar el borrado')
  assert.equal(okP(p).datosRamo, null)

  // Y si el ramo NO cambia, no se toca nada: la clave ni siquiera viaja.
  const q = normalizarParche({ ramo: 'hogar', compania: 'Axa' }, HOY, { ramoGuardado: 'hogar' })
  assert.equal('datosRamo' in okP(q), false, 'sin cambio de ramo, datosRamo no puede viajar en el parche')

  // Lo mismo cuando el parche no menciona el ramo: corregir la prima no puede
  // borrar los campos del ramo. Es el modo de fallo silencioso que se persigue.
  const r = normalizarParche({ primaAnual: 300 }, HOY, { ramoGuardado: 'hogar' })
  assert.equal('datosRamo' in okP(r), false)
})

test('sin ramo conocido, datosRamo es un ERROR; borrarlo NO necesita ramo', () => {
  // `ramoGuardado` ausente = «no se ha consultado». Aceptarlo callando sería
  // vaciar la columna con cada parche que no dijera el ramo.
  assert.equal(falloP(normalizarParche({ datosRamo: { loQueSea: 1 } }, HOY)), 'datos_ramo_sin_ramo')
  // Consultado y sin ramo en la póliza: mismo caso, no hay catálogo.
  assert.equal(
    falloP(normalizarParche({ datosRamo: { loQueSea: 1 } }, HOY, { ramoGuardado: null })),
    'datos_ramo_sin_ramo',
  )
  // Pero BORRAR no exige catálogo: `null` vacía la columna diga lo que diga el ramo.
  const p = normalizarParche({ datosRamo: null }, HOY)
  assert.equal(p.ok, true)
  assert.equal((p as { ok: true; parche: { datosRamo: unknown } }).parche.datosRamo, null)
})


// ─── La REFERENCIA CATASTRAL: 20 es tu piso, 14 es el edificio ───────────────
//
// Es el identificador del BIEN inmueble, hermano de la matrícula, y por eso vive
// en una COLUMNA y no dentro de `datosRamo`: se consulta («¿tengo otra póliza de
// esta misma vivienda?») y está indexada.
//
// Lo que se fija aquí es la distinción que sostiene el campo: una referencia de
// 14 caracteres es REAL, pero es la de la FINCA (el edificio o la parcela).
// Aceptarla como si fuera la vivienda trae los metros del bloque entero a una
// póliza de un piso: un número plausible y equivocado que no da error, no se ve,
// y en un siniestro se paga como infraseguro. Y por eso su error es PROPIO: hay
// que poder decirle a la persona «esa es la del edificio, necesitamos la de tu
// piso» en vez de un «no es válida» que la deja sin saber qué corregir.

const REF_INMUEBLE = '9872023VH5797S0001WX' // 20 caracteres: el piso
const REF_FINCA = '9872023VH5797S' // 14: el edificio

test('la referencia del INMUEBLE se guarda compactada y en mayusculas', () => {
  const p = okP(normalizarParche({ referenciaCatastral: ' 9872023vh5797s 0001 wx ' }, HOY))
  assert.equal(p.referenciaCatastral, REF_INMUEBLE)
  // Y con los separadores con los que la copia la gente del recibo del IBI.
  assert.equal(
    okP(normalizarParche({ referenciaCatastral: '9872023VH5797S-0001-WX' }, HOY)).referenciaCatastral,
    REF_INMUEBLE,
  )
})

test('una referencia de FINCA (14) se rechaza con un error DISTINTO al de invalida', () => {
  assert.equal(falloP(normalizarParche({ referenciaCatastral: REF_FINCA }, HOY)), 'referencia_catastral_de_finca')
  // El error tiene que ser otro que el de basura: son dos conversaciones
  // distintas con la persona.
  assert.notEqual(
    falloP(normalizarParche({ referenciaCatastral: REF_FINCA }, HOY)),
    falloP(normalizarParche({ referenciaCatastral: 'esto no es una referencia' }, HOY)),
  )
})

test('lo que no tiene forma de referencia es invalido, no un null callado', () => {
  for (const mala of [
    'esto no es una referencia',
    '9872023VH5797S0001', // 18: ni finca ni inmueble
    '9872023VH5797S0001WXY', // 21
    '9872023VH5797S0001W*', // un carácter que no es alfanumérico
    12345,
    { ref: REF_INMUEBLE },
  ]) {
    assert.equal(
      falloP(normalizarParche({ referenciaCatastral: mala }, HOY)),
      'referencia_catastral_invalida',
      JSON.stringify(mala),
    )
  }
})

test('centinela y null BORRAN la referencia; ausente no la toca', () => {
  for (const centinela of ['', '   ', 'N/A', 'no consta', '-', '00000000000000000000']) {
    const p = okP(normalizarParche({ compania: 'Axa', referenciaCatastral: centinela }, HOY))
    assert.equal(p.referenciaCatastral, null, JSON.stringify(centinela))
  }
  assert.equal(okP(normalizarParche({ referenciaCatastral: null }, HOY)).referenciaCatastral, null)
  assert.equal('referenciaCatastral' in okP(normalizarParche({ compania: 'Axa' }, HOY)), false)
})

test('la referencia entra en el alta y no es obligatoria', () => {
  const d = ok(normalizarAlta({ compania: 'Axa', referenciaCatastral: REF_INMUEBLE }, HOY))
  assert.equal(d.referenciaCatastral, REF_INMUEBLE)
  // Sin ella el alta sigue siendo válida: la única guarda es la identificación.
  assert.equal(ok(normalizarAlta({ compania: 'Axa' }, HOY)).referenciaCatastral, null)
  // Y la de finca no se guarda a medias tampoco al crear.
  assert.equal(
    fallo(normalizarAlta({ compania: 'Axa', referenciaCatastral: REF_FINCA }, HOY)),
    'referencia_catastral_de_finca',
  )
})

// ─── El ORIGEN de los datos del ramo: viaja SIEMPRE con sus datos ────────────
//
// La columna responde «¿en qué me estoy apoyando?»: 76 m² que dijo el Catastro y
// 76 m² estimados a ojo se pintan igual y no valen lo mismo. Justo por eso un
// origen desalineado es PEOR que ninguno — pone un sello de «lo dice el
// Catastro» sobre un valor que ya no es el que el Catastro dijo, sin error y sin
// que se vea.

test('el origen entra junto a sus datos, y los huerfanos se descartan', () => {
  const elegido = campoTextoDelCatalogo()
  if (!elegido) return // catálogo vacío: no hay campo con el que probar

  const p = okP(
    normalizarParche(
      {
        ramo: elegido.ramo,
        datosRamo: { [elegido.id]: 'Un valor' },
        datosRamoOrigen: { [elegido.id]: 'catastro', otroQueNoEsta: 'documento' },
      },
      HOY,
      { ramoGuardado: elegido.ramo },
    ),
  )
  // Solo sobrevive el origen del campo que existe de verdad en los datos.
  assert.deepEqual(p.datosRamoOrigen, { [elegido.id]: 'catastro' })

  // Un origen fuera del vocabulario tampoco entra, y si no queda ninguna clave
  // la columna es `null`, nunca `{}`.
  const q = okP(
    normalizarParche(
      { ramo: elegido.ramo, datosRamo: { [elegido.id]: 'X' }, datosRamoOrigen: { [elegido.id]: 'me lo ha dicho un amigo' } },
      HOY,
      { ramoGuardado: elegido.ramo },
    ),
  )
  assert.equal(q.datosRamoOrigen, null)
})

test('cambiar los datos del ramo REESCRIBE el origen: los viejos ya no valen', () => {
  const elegido = campoTextoDelCatalogo()
  if (!elegido) return

  // Datos nuevos sin orígenes → la columna de orígenes se VACÍA. Quedarse con
  // los de antes sería afirmar de un valor nuevo lo que se sabía del anterior.
  const p = okP(
    normalizarParche({ datosRamo: { [elegido.id]: 'Otro' } }, HOY, { ramoGuardado: elegido.ramo }),
  )
  assert.equal('datosRamoOrigen' in p, true, 'el cambio de datos tiene que arrastrar el origen')
  assert.equal(p.datosRamoOrigen, null)

  // Borrar los datos borra los orígenes.
  const q = okP(normalizarParche({ datosRamo: null }, HOY, { ramoGuardado: elegido.ramo }))
  assert.equal(q.datosRamoOrigen, null)

  // Y cambiar de ramo (que ya limpia los datos) limpia también los orígenes.
  const r = okP(normalizarParche({ ramo: 'vida' }, HOY, { ramoGuardado: 'hogar' }))
  assert.equal(r.datosRamo, null)
  assert.equal(r.datosRamoOrigen, null)
})

test('un origen SIN datos que lo acompañen es un error, no un guardado a medias', () => {
  // Aquí no se leen los datos guardados, así que aceptarlo sería escribir
  // orígenes que nadie ha podido comprobar contra las claves que hay.
  assert.equal(
    falloP(normalizarParche({ compania: 'Axa', datosRamoOrigen: { metrosCuadrados: 'catastro' } }, HOY, { ramoGuardado: 'hogar' })),
    'origen_sin_datos',
  )
  // Pero BORRAR el origen siempre vale: no necesita datos contra los que validar.
  const p = okP(normalizarParche({ datosRamoOrigen: null }, HOY, { ramoGuardado: 'hogar' }))
  assert.equal(p.datosRamoOrigen, null)
  assert.equal('datosRamo' in p, false, 'borrar el origen no puede borrar los datos')
})

test('sin tocar datosRamo, el origen NO viaja en el parche', () => {
  // Corregir la prima no puede reescribir de dónde salieron los metros.
  const p = okP(normalizarParche({ primaAnual: 300 }, HOY, { ramoGuardado: 'hogar' }))
  assert.equal('datosRamoOrigen' in p, false)
  assert.equal('datosRamo' in p, false)
})

test('el origen entra en el alta pegado a sus datos', () => {
  const elegido = campoTextoDelCatalogo()
  if (!elegido) return

  const d = ok(
    normalizarAlta(
      {
        compania: 'Axa',
        ramo: elegido.ramo,
        datosRamo: { [elegido.id]: 'Un valor' },
        datosRamoOrigen: { [elegido.id]: 'catastro' },
      },
      HOY,
    ),
  )
  assert.deepEqual(d.datosRamoOrigen, { [elegido.id]: 'catastro' })

  // Y un alta que declara orígenes sin datos falla igual que el parche.
  assert.equal(
    fallo(normalizarAlta({ compania: 'Axa', datosRamoOrigen: { loQueSea: 'catastro' } }, HOY)),
    'origen_sin_datos',
  )
})
