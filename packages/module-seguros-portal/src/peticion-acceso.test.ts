import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RESULTADOS_PETICION,
  RESPUESTAS_PUBLICAS,
  respuestaPublica,
  TEXTO_REGISTRADA,
  MAX_PETICIONES_DIA,
  ESTADOS_PETICION,
  DIAS_VIGENCIA_PETICION,
  caducidadPeticion,
  estadoPeticion,
  peticionResoluble,
  MAX_MENSAJE_PETICION,
  normalizarMensajePeticion,
} from './peticion-acceso.ts'
import type { PeticionFechas, ResultadoPeticion } from './peticion-acceso.ts'

const HOY = new Date('2026-09-03T10:00:00Z')
const AYER = new Date('2026-09-02T10:00:00Z')
const MANANA = new Date('2026-09-04T10:00:00Z')
const HACE_UN_MES = new Date('2026-08-03T10:00:00Z')

/** Una pendiente sana: creada ayer, con plazo hasta mañana y sin resolver. */
function peticion(p: Partial<PeticionFechas> = {}): PeticionFechas {
  return {
    creadaEn: AYER,
    caducaEn: MANANA,
    concedidaEn: null,
    rechazadaEn: null,
    retiradaEn: null,
    ...p,
  }
}

// ─── 1. El cepo central: respuestaPublica() no puede hacer de oráculo ────────

test('los CUATRO resultados que dependen del destinatario salen por la MISMA puerta', () => {
  // Este es el test que hay que leer antes de «simplificar» respuestaPublica().
  // Que `creada` y `sin_destinatario` contesten distinto convierte el portal en
  // una máquina de comprobar quién es cliente de la correduría: un correo por
  // intento, desde fuera y sin límite, sobre 32.600 fichas.
  const dependenDelOtro: ResultadoPeticion[] = [
    'creada',
    'sin_destinatario',
    'ya_pendiente',
    'ya_autorizado',
  ]
  for (const r of dependenDelOtro) {
    assert.equal(
      respuestaPublica(r),
      'registrada',
      `${r} tiene respuesta propia: eso revela si el destinatario existe`,
    )
  }
  // Y que el cepo muerde: si los cuatro colapsaran porque respuestaPublica()
  // devolviera SIEMPRE lo mismo, no estaría protegiendo nada.
  assert.notEqual(respuestaPublica('a_si_mismo'), 'registrada')
  assert.notEqual(respuestaPublica('limite_diario'), 'registrada')
})

test('lo que depende SOLO de quien pregunta si se le dice', () => {
  // No revelan nada de nadie más: quien pregunta ya sabe quién es y cuántas
  // veces ha pedido hoy.
  assert.equal(respuestaPublica('a_si_mismo'), 'a_si_mismo')
  assert.equal(respuestaPublica('limite_diario'), 'limite_diario')
})

test('TODO resultado cae dentro de RESPUESTAS_PUBLICAS, tambien los que no existen aun', () => {
  // El día que alguien añada un resultado nuevo (`bloqueado`, `sin_canal`…),
  // este test le obliga a DECIDIR por qué puerta sale. Sin él, el resultado
  // nuevo se cuela por el `return 'registrada'` final sin que nadie lo piense,
  // o peor: alguien le da respuesta propia y reabre el oráculo.
  assert.deepEqual(
    [...RESPUESTAS_PUBLICAS],
    ['registrada', 'a_si_mismo', 'limite_diario'],
    'han cambiado las respuestas públicas: repasa si la nueva revela algo del destinatario',
  )
  for (const r of RESULTADOS_PETICION) {
    const pub = respuestaPublica(r)
    assert.ok(
      (RESPUESTAS_PUBLICAS as readonly string[]).includes(pub),
      `respuestaPublica('${r}') devuelve '${pub}', que no es una respuesta pública`,
    )
  }
  // Los resultados internos son SEIS y no se enseñan enteros a nadie.
  assert.deepEqual(
    [...RESULTADOS_PETICION],
    ['creada', 'sin_destinatario', 'ya_pendiente', 'ya_autorizado', 'a_si_mismo', 'limite_diario'],
  )
  // Hay más resultados internos que respuestas: el colapso EXISTE.
  assert.ok(RESULTADOS_PETICION.length > RESPUESTAS_PUBLICAS.length)
})

test('el texto de registrada no afirma que exista nadie ni que le haya llegado nada', () => {
  // Es condicional a propósito: dice lo único que es verdad en los cuatro casos.
  assert.match(TEXTO_REGISTRADA, /^Si esa persona/)
  for (const delator of [
    /no (hemos )?(la |lo )?encontrad/i,
    /no (existe|es cliente|tiene)/i,
    /ya (te|le) (autoriz|concedi)/i,
    /ya (se lo|la) (pediste|habías pedido)/i,
  ]) {
    assert.equal(delator.test(TEXTO_REGISTRADA), false, `el texto delata al destinatario: ${delator}`)
  }
})

test('el cupo es por SOLICITANTE y son cinco', () => {
  // Un límite por DESTINATARIO volvería a filtrar: «este me deja pedir cinco
  // veces, luego existe».
  assert.equal(MAX_PETICIONES_DIA, 5)
})

// ─── 2. estadoPeticion(): lo RESUELTO gana a la caducidad ───────────────────

test('una concedida hace un mes con el plazo pasado sigue siendo CONCEDIDA', () => {
  // Mirar la fecha primero borraría de la pantalla del solicitante la única
  // prueba de que se la concedieron.
  const p = peticion({ creadaEn: HACE_UN_MES, caducaEn: AYER, concedidaEn: HACE_UN_MES })
  assert.equal(estadoPeticion(p, HOY), 'concedida')
})

test('rechazada y retirada tampoco se convierten en caducadas al pasar el plazo', () => {
  assert.equal(
    estadoPeticion(peticion({ caducaEn: AYER, rechazadaEn: HACE_UN_MES }), HOY),
    'rechazada',
  )
  assert.equal(
    estadoPeticion(peticion({ caducaEn: AYER, retiradaEn: HACE_UN_MES }), HOY),
    'retirada',
  )
})

test('la precedencia entre las tres resueltas es retirada > concedida > rechazada', () => {
  const todas = peticion({ concedidaEn: AYER, rechazadaEn: AYER, retiradaEn: AYER })
  assert.equal(estadoPeticion(todas, HOY), 'retirada')
  assert.equal(estadoPeticion({ ...todas, retiradaEn: null }, HOY), 'concedida')
  assert.equal(estadoPeticion({ ...todas, retiradaEn: null, concedidaEn: null }, HOY), 'rechazada')
})

test('sin resolver y en plazo es PENDIENTE, y los estados son cinco', () => {
  assert.equal(estadoPeticion(peticion(), HOY), 'pendiente')
  assert.deepEqual(
    [...ESTADOS_PETICION],
    ['pendiente', 'concedida', 'rechazada', 'retirada', 'caducada'],
  )
})

test('la caducidad es una FRONTERA exacta, no un aproximado', () => {
  const caducaEn = new Date('2026-09-03T10:00:00Z')
  const unMsAntes = new Date(caducaEn.getTime() - 1)
  assert.equal(
    estadoPeticion(peticion({ caducaEn }), unMsAntes),
    'pendiente',
    'un milisegundo antes del límite todavía se puede conceder',
  )
  assert.equal(
    estadoPeticion(peticion({ caducaEn }), caducaEn),
    'caducada',
    'en el instante exacto ya NO: `hoy >= caducaEn`',
  )
  assert.equal(
    estadoPeticion(peticion({ caducaEn }), new Date(caducaEn.getTime() + 1)),
    'caducada',
  )
})

// ─── 3. caducidadPeticion(): 30 días en DÍAS, no en meses ───────────────────

test('la vigencia son treinta dias exactos', () => {
  assert.equal(DIAS_VIGENCIA_PETICION, 30)
  const desde = new Date('2026-09-03T10:00:00Z')
  const hasta = caducidadPeticion(desde)
  assert.equal(hasta.toISOString(), '2026-10-03T10:00:00.000Z')
  assert.equal(hasta.getTime() - desde.getTime(), 30 * 24 * 60 * 60 * 1000)
  // No toca el original.
  assert.equal(desde.toISOString(), '2026-09-03T10:00:00.000Z')
})

test('desde un 31 de enero NO cae en el bug de setUTCMonth', () => {
  // `setUTCMonth(m+1)` sobre un 31 de enero da un «31 de febrero» que JavaScript
  // normaliza al 3 de marzo sin avisar. Sumando días, el 31/01/2026 + 30 días es
  // el 2 de marzo — y son fechas DISTINTAS, que es justo lo que prueba el cepo.
  const hasta = caducidadPeticion(new Date('2026-01-31T12:00:00Z'))
  assert.equal(hasta.toISOString(), '2026-03-02T12:00:00.000Z')

  const conElBug = new Date('2026-01-31T12:00:00Z')
  conElBug.setUTCMonth(conElBug.getUTCMonth() + 1)
  assert.equal(conElBug.toISOString().slice(0, 10), '2026-03-03', 'el bug ya no se reproduce')
  assert.notEqual(hasta.toISOString(), conElBug.toISOString())
})

test('desde un 30 de enero de un ano BISIESTO cae en el 29 de febrero', () => {
  // 2024 es bisiesto: 30/01 + 30 días = 29/02. El día que existe una vez cada
  // cuatro años es el que revienta cualquier aritmética de calendario a mano.
  const hasta = caducidadPeticion(new Date('2024-01-30T00:00:00Z'))
  assert.equal(hasta.toISOString(), '2024-02-29T00:00:00.000Z')

  // Y el mismo día de un año NO bisiesto se va al 1 de marzo.
  assert.equal(
    caducidadPeticion(new Date('2026-01-30T00:00:00Z')).toISOString().slice(0, 10),
    '2026-03-01',
  )
})

// ─── 4. peticionResoluble(): solo una pendiente ─────────────────────────────

test('solo una PENDIENTE se puede conceder o rechazar', () => {
  assert.equal(peticionResoluble(peticion(), HOY), true)
  assert.equal(peticionResoluble(peticion({ concedidaEn: AYER }), HOY), false)
  assert.equal(peticionResoluble(peticion({ rechazadaEn: AYER }), HOY), false)
  assert.equal(peticionResoluble(peticion({ retiradaEn: AYER }), HOY), false)
  assert.equal(peticionResoluble(peticion({ caducaEn: AYER }), HOY), false)
  // Y no se olvida ningún estado: resoluble ⇔ estado === 'pendiente'.
  const casos: PeticionFechas[] = [
    peticion(),
    peticion({ concedidaEn: AYER }),
    peticion({ rechazadaEn: AYER }),
    peticion({ retiradaEn: AYER }),
    peticion({ caducaEn: AYER }),
    peticion({ caducaEn: AYER, concedidaEn: HACE_UN_MES }),
  ]
  for (const c of casos) {
    assert.equal(peticionResoluble(c, HOY), estadoPeticion(c, HOY) === 'pendiente')
  }
})

// ─── 5. normalizarMensajePeticion(): vacío es null, nunca '' ────────────────

test('el mensaje se recorta a MAX_MENSAJE_PETICION', () => {
  assert.equal(MAX_MENSAJE_PETICION, 300)
  const largo = 'a'.repeat(400)
  const n = normalizarMensajePeticion(largo)
  assert.equal(n?.length, 300)
  assert.equal(n, 'a'.repeat(300))
  // Justo en el límite no recorta.
  assert.equal(normalizarMensajePeticion('b'.repeat(300))?.length, 300)
  assert.equal(normalizarMensajePeticion('b'.repeat(299))?.length, 299)
})

test('colapsa los espacios y quita los de los extremos', () => {
  assert.equal(
    normalizarMensajePeticion('  Papá,   soy \n\n Marta,\tpara lo del coche.  '),
    'Papá, soy Marta, para lo del coche.',
  )
  assert.equal(normalizarMensajePeticion('hola\r\nmundo'), 'hola mundo')
})

test('vacio y solo-espacios dan NULL, nunca la cadena vacia', () => {
  // `''` es el valor de cajón que se cuela por todas las guardas de NULL: un
  // `if (mensaje)` lo trata como «no hay», pero un `mensaje !== null` lo trata
  // como «sí hay» y acaba pintando un globo de texto vacío en la pantalla del
  // destinatario.
  for (const v of ['', ' ', '   ', '\n', '\t\t', ' \r\n ']) {
    const n = normalizarMensajePeticion(v)
    assert.equal(n, null, `${JSON.stringify(v)} no dio null`)
    assert.notEqual(n, '', 'devolvió la cadena vacía en vez de null')
  }
})

test('lo que no es una cadena da NULL, no revienta ni se convierte', () => {
  for (const v of [null, undefined, 0, 42, true, false, {}, [], ['hola'], new Date()]) {
    assert.equal(normalizarMensajePeticion(v), null, `${JSON.stringify(v)} no dio null`)
  }
  // Y un `String(v)` accidental se vería aquí.
  assert.notEqual(normalizarMensajePeticion(42), '42')
})
