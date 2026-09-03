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
  })
  // Las ocho claves EXISTEN: en un alta «no lo toques» no significa nada, así
  // que un campo que no se rellenó vale `null` y está presente, nunca ausente.
  assert.deepEqual(Object.keys(d).sort(), [
    'bastidor',
    'compania',
    'fechaMatriculacion',
    'fechaVencimiento',
    'matricula',
    'numeroPoliza',
    'primaAnual',
    'ramo',
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

test('el alta a mano tiene OCHO campos: los cinco de la poliza y los tres del vehiculo', () => {
  // La forma de `DatosAlta` la fija `test/regression-portal-poliza-editable.test.ts`
  // (raíz) con un `deepEqual` del objeto entero, y los dos se actualizan a la vez:
  // ese cepo existe para que añadir un campo al alta sea una decisión y no un
  // descuido. Los tres del vehículo entraron el 03/09/2026 porque el alta a mano
  // es donde el cliente teclea la matrícula, y de ahí sale la fecha estimada.
  const d = ok(normalizarAlta({ compania: 'Axa', matricula: '1234BCD', bastidor: 'WVWZZZ1KZAW123456' }, HOY))
  assert.deepEqual(Object.keys(d).sort(), [
    'bastidor',
    'compania',
    'fechaMatriculacion',
    'fechaVencimiento',
    'matricula',
    'numeroPoliza',
    'primaAnual',
    'ramo',
  ])
  assert.equal(d.matricula, '1234BCD')
  assert.equal(d.bastidor, 'WVWZZZ1KZAW123456')
})
