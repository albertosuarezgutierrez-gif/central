// Cepos de lo que se LEE de un documento de póliza: los tres identificadores
// del bien (matrícula, bastidor/VIN y fecha de primera matriculación).
//
// ─── Qué se protege, y por qué ───────────────────────────────────────────────
// 🚨 Un bastidor mal leído es PEOR que ninguno: identifica OTRO coche. Con él se
// pide precio, se retarifica y se declara un siniestro, y nada falla por el
// camino porque el valor es plausible. De ahí que la regla sea «ante la duda,
// null»: `null` dice «no lo hemos sabido leer» y se completa a mano; un VIN de
// 16 caracteres afirma algo falso.
//
// Y el segundo frente: los valores de CAJÓN. Un extractor de IA devuelve con
// toda naturalidad 'N/A', 'no consta', '-' o '0000000'. Ninguno es un dato:
// todos son un «no lo sé» disfrazado de valor, y por eso se cuelan por TODAS
// las guardas basadas en NULL (`??`, `COALESCE`, `IS NULL`) y acaban pisando
// dato bueno — el caso `'otro'` de `subastas.tipo_bien` del CLAUDE.md de la raíz.
//
// ⚠️ POR QUÉ ESTE FICHERO NO IMPORTA `./extraer-poliza.ts`. Medido: no se puede.
// Ese módulo importa `@central/core-ai`, cuyo `src/index.ts` reexporta con rutas
// SIN extensión, y el resolvedor ESM de Node se cae con `ERR_MODULE_NOT_FOUND:
// .../packages/core-ai/src/clean-json` antes de ejecutar un solo test. Next lo
// resuelve porque usa su propio bundler, `node --test` no. Por eso:
//   · la lógica se prueba contra `./poliza-editable.ts`, que es puro y es donde
//     vive de verdad (una sola fuente para la máquina y para la persona);
//   · y el CONTRATO del extractor —que le pida los tres campos a la IA y que los
//     normalice— se comprueba leyendo su fuente. No es un adorno: si alguien
//     añade el campo al tipo y se olvida del `INSTRUCCION`, la IA no lo devuelve
//     nunca y la columna se queda a `null` para siempre sin que nada falle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CENTINELAS_SIN_DATO,
  esBastidorValido,
  esCentinelaSinDato,
  normalizarBastidor,
  normalizarFechaMatriculacionISO,
  normalizarMatricula,
  normalizarVehiculoLeido,
  vehiculoLeidoVacio,
} from './poliza-editable.ts'

const HOY = new Date(Date.UTC(2026, 8, 3))

// ── 1. El bastidor: 17, y ni uno más ni uno menos ────────────────────────────

test('un VIN de 17 validos se conserva en mayusculas y sin separadores', () => {
  assert.equal(normalizarBastidor('VF1RFA00567123456'), 'VF1RFA00567123456')
  assert.equal(normalizarBastidor('vf1rfa00567123456'), 'VF1RFA00567123456')
  // El permiso de circulación lo imprime en grupos; el cliente lo copia igual.
  assert.equal(normalizarBastidor('VF1 RFA00 567123456'), 'VF1RFA00567123456')
  assert.equal(normalizarBastidor('VF1-RFA00-567123456'), 'VF1RFA00567123456')
  assert.equal(normalizarBastidor('  WVWZZZ1KZAW123456  '), 'WVWZZZ1KZAW123456')
})

test('16 y 18 caracteres NO son «casi»: son otro numero, y salen null', () => {
  assert.equal('VF1RFA0056712345'.length, 16)
  assert.equal(normalizarBastidor('VF1RFA0056712345'), null)
  assert.equal('VF1RFA005671234567'.length, 18)
  assert.equal(normalizarBastidor('VF1RFA005671234567'), null)
  assert.equal(normalizarBastidor(''), null)
})

test('un VIN con I, O o Q se descarta: la ISO 3779 las excluye', () => {
  // Están excluidas justo para que no se confundan con 1 y 0. Que aparezcan
  // significa que la lectura es mala, no que el bastidor sea raro.
  for (const letra of ['I', 'O', 'Q']) {
    const vin = `VF1RFA${letra}0567123456`.slice(0, 17)
    assert.equal(vin.length, 17)
    assert.equal(normalizarBastidor(vin), null, `${vin} lleva ${letra}: no puede pasar`)
  }
  // Y en minúscula, que es como llega de un OCR, tampoco cuela por la puerta de atrás.
  assert.equal(normalizarBastidor('vf1rfai0567123456'), null)
  assert.equal(esBastidorValido('VF1RFA00567123456'), true)
})

test('17 caracteres de relleno pasarian la FORMA del VIN y aun asi se anulan', () => {
  // El centinela que nadie pone en la lista: tiene la longitud y el juego de
  // caracteres correctos, y no identifica ningún coche.
  assert.equal('00000000000000000'.length, 17)
  assert.equal(normalizarBastidor('00000000000000000'), null)
  assert.equal(normalizarBastidor('XXXXXXXXXXXXXXXXX'), null)
  assert.equal(normalizarBastidor('-----------------'), null)
})

// ── 2. Los valores de cajón, uno a uno ───────────────────────────────────────

test('cada centinela de la lista se anula, en matricula y en bastidor', () => {
  for (const centinela of CENTINELAS_SIN_DATO) {
    assert.equal(esCentinelaSinDato(centinela), true, `${JSON.stringify(centinela)} tiene que ser centinela`)
    assert.equal(normalizarMatricula(centinela), null, `matricula ${JSON.stringify(centinela)}`)
    assert.equal(normalizarBastidor(centinela), null, `bastidor ${JSON.stringify(centinela)}`)
    assert.equal(normalizarFechaMatriculacionISO(centinela, HOY), null, `fecha ${JSON.stringify(centinela)}`)
    // Y con la caja y los espacios que trae el modelo de verdad.
    assert.equal(esCentinelaSinDato(`  ${centinela.toUpperCase()} `), true)
  }
})

test('los centinelas que mas escribe una IA, nombrados', () => {
  for (const basura of ['N/A', 'no consta', 'DESCONOCIDO', '-', '0000000', 'Sin datos', 'pendiente', '?']) {
    assert.equal(normalizarMatricula(basura), null, `matricula ${basura}`)
    assert.equal(normalizarBastidor(basura), null, `bastidor ${basura}`)
  }
})

test('un centinela NO es lo mismo que un dato: el dato bueno sobrevive', () => {
  // El cepo al revés. Sin esto, una lista de centinelas demasiado ansiosa
  // convierte en «no se sabe» matrículas perfectamente legibles y nadie se entera.
  assert.equal(normalizarMatricula('1234BCD'), '1234BCD')
  assert.equal(normalizarBastidor('WVWZZZ1KZAW123456'), 'WVWZZZ1KZAW123456')
})

// ── 3. Matrícula: normalizada, no adivinada ──────────────────────────────────

test('la matricula sale compactada y en mayusculas', () => {
  assert.equal(normalizarMatricula('1234 bcd'), '1234BCD')
  assert.equal(normalizarMatricula('1234-BCD'), '1234BCD')
  assert.equal(normalizarMatricula(' se 1234 bc '), 'SE1234BC')
  assert.equal(normalizarMatricula('m123456'), 'M123456')
  assert.equal(normalizarMatricula('R1234BBB'), 'R1234BBB')
})

test('la prosa no es una matricula', () => {
  for (const texto of ['NO CONSTA EN LA POLIZA', 'el vehiculo asegurado', 'MATRICULA', '1234567890123']) {
    assert.equal(normalizarMatricula(texto), null, texto)
  }
})

test('lo que no es texto se anula, nunca se convierte', () => {
  for (const basura of [null, undefined, 42, {}, [], true]) {
    assert.equal(normalizarMatricula(basura), null)
    assert.equal(normalizarBastidor(basura), null)
    assert.equal(normalizarFechaMatriculacionISO(basura, HOY), null)
  }
})

// ── 4. Fecha de matriculación: mira al pasado ────────────────────────────────

test('una fecha de matriculacion absurda se anula', () => {
  // Futura: un coche no se matricula mañana. O es un año tecleado de más, o el
  // extractor ha leído el vencimiento de la póliza y lo ha puesto aquí — y con
  // eso el vehículo tiene antigüedad negativa, que es lo que se usa al tarificar.
  assert.equal(normalizarFechaMatriculacionISO('2027-01-15', HOY), null)
  assert.equal(normalizarFechaMatriculacionISO('2026-09-04', HOY), null)
  // Anterior a 1900.
  assert.equal(normalizarFechaMatriculacionISO('1899-12-31', HOY), null)
  assert.equal(normalizarFechaMatriculacionISO('0001-01-01', HOY), null)
  // Inexistente: JS la «arreglaría» a marzo sin avisar.
  assert.equal(normalizarFechaMatriculacionISO('2020-02-31', HOY), null)
  // Y solo YYYY-MM-DD: nada de `new Date(loQueSea)`.
  for (const mala of ['15/01/2020', '2020-1-5', '2020-01-15T00:00:00Z', 'enero de 2020']) {
    assert.equal(normalizarFechaMatriculacionISO(mala, HOY), null, mala)
  }
})

test('las fechas de matriculacion validas pasan, bordes incluidos', () => {
  assert.equal(normalizarFechaMatriculacionISO('2020-01-15', HOY), '2020-01-15')
  assert.equal(normalizarFechaMatriculacionISO(' 1998-06-30 ', HOY), '1998-06-30')
  // Hoy mismo es válido (matriculado esta mañana, asegurado esta tarde).
  assert.equal(normalizarFechaMatriculacionISO('2026-09-03', HOY), '2026-09-03')
  assert.equal(normalizarFechaMatriculacionISO('1900-01-01', HOY), '1900-01-01')
})

// ── 5. El parseo: ausente ≠ vacío ≠ centinela, y los tres acaban igual ───────

test('campo AUSENTE, VACIO y CENTINELA: los tres son null, y la clave existe', () => {
  const ausente = normalizarVehiculoLeido({ compania: 'Mapfre' }, HOY)
  const vacio = normalizarVehiculoLeido({ matricula: '', bastidor: '   ', fechaMatriculacion: '' }, HOY)
  const centinela = normalizarVehiculoLeido(
    { matricula: 'N/A', bastidor: 'no consta', fechaMatriculacion: 'desconocido' },
    HOY,
  )
  for (const [nombre, v] of [['ausente', ausente], ['vacio', vacio], ['centinela', centinela]] as const) {
    assert.deepEqual(v, vehiculoLeidoVacio(), nombre)
    // Las tres claves EXISTEN: quien lo guarde escribe NULL, no deja el campo sin tocar.
    assert.deepEqual(Object.keys(v).sort(), ['bastidor', 'fechaMatriculacion', 'matricula'], nombre)
  }
})

test('un objeto con datos buenos sale entero; lo que no es objeto sale vacio', () => {
  assert.deepEqual(
    normalizarVehiculoLeido(
      { matricula: '1234 bcd', bastidor: 'wvwzzz1kzaw123456', fechaMatriculacion: '2010-05-20' },
      HOY,
    ),
    { matricula: '1234BCD', bastidor: 'WVWZZZ1KZAW123456', fechaMatriculacion: '2010-05-20' },
  )
  for (const basura of [null, undefined, 'texto', 42, [1, 2], true]) {
    assert.deepEqual(normalizarVehiculoLeido(basura, HOY), vehiculoLeidoVacio(), String(basura))
  }
})

test('un campo malo NO contamina a los demas', () => {
  // Media extracción es lo normal: el bastidor se lee mal y la matrícula bien.
  // Anular la fila entera perdería el dato bueno; darla por buena entera
  // guardaría el malo.
  const v = normalizarVehiculoLeido(
    { matricula: '1234BCD', bastidor: 'VF1RFA0056712345', fechaMatriculacion: '2099-01-01' },
    HOY,
  )
  assert.equal(v.matricula, '1234BCD')
  assert.equal(v.bastidor, null)
  assert.equal(v.fechaMatriculacion, null)
})

// ── 6. El contrato del extractor (por fuente: ver la cabecera) ───────────────

test('INSTRUCCION le pide a la IA los tres campos, o nunca los devolvera', () => {
  const fuente = readFileSync(new URL('./extraer-poliza.ts', import.meta.url), 'utf8')

  for (const clave of ['matricula', 'bastidor', 'fechaMatriculacion']) {
    assert.match(fuente, new RegExp(`"${clave}"`), `el esquema del prompt tiene que declarar "${clave}"`)
  }
  // La regla que impide el peor fallo: que el modelo «complete» un VIN a ojo.
  assert.match(fuente, /17 caracteres/)
  assert.match(fuente, /NUNCA lo completes/)
  // Y que no invente el centinela en vez de null.
  assert.match(fuente, /NUNCA escribas "N\/A"/)
  // La fecha de matriculación NO es la de vencimiento: si el prompt no lo dice,
  // el modelo repite la del contrato y el coche parece de este año.
  assert.match(fuente, /PRIMERA MATRICULACIÓN/)
})

test('el extractor normaliza el vehiculo con la MISMA funcion que la correccion a mano', () => {
  const fuente = readFileSync(new URL('./extraer-poliza.ts', import.meta.url), 'utf8')

  assert.match(fuente, /from '\.\/poliza-editable'/, 'la regla se importa, no se recopia')
  assert.match(fuente, /normalizarVehiculoLeido\(/, 'lo leído tiene que pasar por el normalizador')
  // El «nada leído» también trae los tres campos: si no, la salida de un fallo
  // de lectura tiene una forma distinta a la de una lectura buena, y quien la
  // guarda deja las columnas sin tocar en vez de escribir NULL.
  assert.match(fuente, /vehiculoLeidoVacio\(\)/)
  // Y nadie recopia la forma del VIN aquí: una segunda copia de la regla acaba
  // divergiendo de la de `poliza-editable.ts` sin que nada falle.
  assert.equal(
    /A-HJ-NPR-Z/.test(fuente),
    false,
    'la expresión del VIN vive SOLO en poliza-editable.ts',
  )
})
