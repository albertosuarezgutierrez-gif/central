import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ANIOS_MAXIMOS_ATRAS,
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  DIAS_COMUNICACION_LCS,
  LUGAR_MAX,
  PARTE_ESTADOS,
  comunicadoACompania,
  normalizarParte,
  parsearFechaHecho,
  plazoComunicacion,
} from './parte-siniestro.ts'

// «Hoy» SIEMPRE se inyecta: un test que llame a `new Date()` se pone rojo solo
// el día que la fecha de prueba caiga fuera de los 5 años.
const HOY = new Date(Date.UTC(2026, 8, 3)) // 03/09/2026
const DESC = 'Se me ha roto el parabrisas con una piedra en la A-49' // > 15 caracteres

/** Un parte que valida entero, para poder romper UN campo cada vez. */
function parteValido(extra: Record<string, unknown> = {}) {
  return { descripcion: DESC, fechaHecho: '2026-09-01', ...extra }
}

// ── 🚨 Enviado NO es comunicado ──────────────────────────────────────────────

test('SOLO «abierto_en_compania» significa que la compañía lo sabe', () => {
  assert.equal(comunicadoACompania('abierto_en_compania'), true)
  assert.equal(comunicadoACompania('enviado'), false)
  assert.equal(comunicadoACompania('descartado'), false)
})

test('🚨 «recibido» NO cuenta como comunicado: lo hemos leído NOSOTROS, no la entidad', () => {
  // Este es el fallo que el fichero existe para evitar. Una correduría media
  // por el CLIENTE: que Alberto haya visto el parte no abre nada en la
  // compañía, y `estado !== 'enviado'` diría que sí.
  assert.equal(comunicadoACompania('recibido'), false)
})

test('ningún estado nuevo se cuela como comunicado sin pasar por aquí', () => {
  // Si mañana se añade un estado a PARTE_ESTADOS, sigue sin ser «comunicado»
  // salvo que alguien lo decida a mano en `comunicadoACompania`.
  const comunican = PARTE_ESTADOS.filter(comunicadoACompania)
  assert.deepEqual(comunican, ['abierto_en_compania'])
})

// ── Descripción ──────────────────────────────────────────────────────────────

test('sin descripción el parte no vale: ausente, vacía o solo espacios es «falta»', () => {
  for (const d of [undefined, null, '', '   ', '\n\t ']) {
    const r = normalizarParte({ ...parteValido(), descripcion: d }, HOY)
    assert.equal(r.ok, false)
    assert.equal(r.ok === false && r.errores.descripcion, 'falta', `descripcion=${JSON.stringify(d)}`)
  }
})

test('la frontera de la descripción son 15 caracteres: 14 es «corta», 15 vale', () => {
  assert.equal(DESCRIPCION_MIN, 15)
  const corta = normalizarParte({ ...parteValido(), descripcion: 'a'.repeat(14) }, HOY)
  assert.equal(corta.ok === false && corta.errores.descripcion, 'corta')

  const justa = normalizarParte({ ...parteValido(), descripcion: 'a'.repeat(15) }, HOY)
  assert.equal(justa.ok, true)
  assert.equal(justa.ok === true && justa.valor.descripcion.length, 15)
})

test('la frontera de arriba son 2000 caracteres: 2001 es «larga»', () => {
  assert.equal(DESCRIPCION_MAX, 2000)
  const larga = normalizarParte({ ...parteValido(), descripcion: 'a'.repeat(2001) }, HOY)
  assert.equal(larga.ok === false && larga.errores.descripcion, 'larga')
  assert.equal(normalizarParte({ ...parteValido(), descripcion: 'a'.repeat(2000) }, HOY).ok, true)
})

// ── Fecha del hecho ──────────────────────────────────────────────────────────

test('sin fecha no hay parte: no se puede contar el plazo del art. 16 LCS', () => {
  for (const f of [undefined, null, '', '   ']) {
    const r = normalizarParte({ descripcion: DESC, fechaHecho: f }, HOY)
    assert.equal(r.ok === false && r.errores.fechaHecho, 'falta', `fechaHecho=${JSON.stringify(f)}`)
  }
})

test('la fecha solo se acepta en YYYY-MM-DD, no en formato español ni sin ceros', () => {
  for (const f of ['03/09/2026', '2026-9-3', '3-9-2026', 'ayer', '2026-09-03T10:00:00Z']) {
    const r = normalizarParte({ descripcion: DESC, fechaHecho: f }, HOY)
    assert.equal(r.ok === false && r.errores.fechaHecho, 'formato', `fechaHecho=${f}`)
  }
})

test('🚨 el 31 de febrero se RECHAZA: JS lo desbordaría a marzo sin avisar', () => {
  // `new Date('2026-02-31')` no falla: devuelve el 3 de marzo. Sin la
  // comprobación de ida y vuelta se guardaría un día que el cliente no
  // escribió, y con él un plazo distinto del real.
  const r = normalizarParte({ descripcion: DESC, fechaHecho: '2026-02-31' }, HOY)
  assert.equal(r.ok === false && r.errores.fechaHecho, 'formato')
  // Y el día que sí existe del mismo mes entra sin problema.
  assert.equal(normalizarParte({ descripcion: DESC, fechaHecho: '2026-02-28' }, HOY).ok, true)
})

test('un hecho de MAÑANA es «futura»; el de HOY vale', () => {
  const manana = normalizarParte({ descripcion: DESC, fechaHecho: '2026-09-04' }, HOY)
  assert.equal(manana.ok === false && manana.errores.fechaHecho, 'futura')

  const hoy = normalizarParte({ descripcion: DESC, fechaHecho: '2026-09-03' }, HOY)
  assert.equal(hoy.ok, true)
  assert.equal(hoy.ok === true && hoy.valor.fechaHecho, '2026-09-03')
})

test('la frontera de los 5 años: el día exacto vale, un día antes es «antigua»', () => {
  assert.equal(ANIOS_MAXIMOS_ATRAS, 5)
  const justo = normalizarParte({ descripcion: DESC, fechaHecho: '2021-09-03' }, HOY)
  assert.equal(justo.ok, true)

  const uno_mas = normalizarParte({ descripcion: DESC, fechaHecho: '2021-09-02' }, HOY)
  assert.equal(uno_mas.ok === false && uno_mas.errores.fechaHecho, 'antigua')
})

test('la hora de «hoy» no adelanta la frontera: se compara por día UTC', () => {
  // A las 23:59 del 03/09 el hecho de ese mismo día sigue sin ser futuro.
  const tarde = new Date(Date.UTC(2026, 8, 3, 23, 59, 59))
  assert.equal(normalizarParte({ descripcion: DESC, fechaHecho: '2026-09-03' }, tarde).ok, true)
})

// ── Hora aproximada ──────────────────────────────────────────────────────────

test('la hora es opcional: si no la sabe, sale null y no se inventa', () => {
  for (const h of [undefined, null, '', '   ']) {
    const r = normalizarParte({ ...parteValido(), horaAproximada: h }, HOY)
    assert.equal(r.ok, true, `horaAproximada=${JSON.stringify(h)}`)
    assert.equal(r.ok === true && r.valor.horaAproximada, null)
  }
})

test('la hora solo vale en HH:MM de 24 horas y con los dos dígitos', () => {
  for (const h of ['25:00', '9:30', '0930', '24:00', '09:60', '9:3', '09:30:00', 'mediodía']) {
    const r = normalizarParte({ ...parteValido(), horaAproximada: h }, HOY)
    assert.equal(r.ok === false && r.errores.horaAproximada, 'formato', `horaAproximada=${h}`)
  }
})

test('las horas de los bordes del día son válidas', () => {
  for (const h of ['09:30', '00:00', '23:59']) {
    const r = normalizarParte({ ...parteValido(), horaAproximada: h }, HOY)
    assert.equal(r.ok, true, `horaAproximada=${h}`)
    assert.equal(r.ok === true && r.valor.horaAproximada, h)
  }
})

// ── Lugar ────────────────────────────────────────────────────────────────────

test('el lugar es opcional pero no ilimitado: 201 caracteres es «larga»', () => {
  assert.equal(LUGAR_MAX, 200)
  const larga = normalizarParte({ ...parteValido(), lugar: 'a'.repeat(201) }, HOY)
  assert.equal(larga.ok === false && larga.errores.lugar, 'larga')
  assert.equal(normalizarParte({ ...parteValido(), lugar: 'a'.repeat(200) }, HOY).ok, true)
  const sin = normalizarParte(parteValido(), HOY)
  assert.equal(sin.ok === true && sin.valor.lugar, null)
})

// ── Póliza ───────────────────────────────────────────────────────────────────

test('las dos pólizas a la vez es «ambigua»: un parte no cuelga de dos contratos', () => {
  const r = normalizarParte({ ...parteValido(), polizaId: 'p-1', polizaDeclaradaId: 'd-1' }, HOY)
  assert.equal(r.ok === false && r.errores.poliza, 'ambigua')
})

test('SIN ninguna póliza el parte es VÁLIDO: «no sé cuál me cubre» es el caso normal', () => {
  // Exigirle al cliente que elija la póliza deja fuera justo a quien más
  // necesita a Alberto. Los dos campos salen a null, no a cadena vacía.
  const r = normalizarParte(parteValido(), HOY)
  assert.equal(r.ok, true)
  assert.equal(r.ok === true && r.valor.polizaId, null)
  assert.equal(r.ok === true && r.valor.polizaDeclaradaId, null)
})

test('cada póliza por separado sí vale', () => {
  const cartera = normalizarParte({ ...parteValido(), polizaId: 'p-1' }, HOY)
  assert.equal(cartera.ok === true && cartera.valor.polizaId, 'p-1')
  assert.equal(cartera.ok === true && cartera.valor.polizaDeclaradaId, null)

  const declarada = normalizarParte({ ...parteValido(), polizaDeclaradaId: 'd-1' }, HOY)
  assert.equal(declarada.ok === true && declarada.valor.polizaDeclaradaId, 'd-1')
  assert.equal(declarada.ok === true && declarada.valor.polizaId, null)
})

// ── Todos los errores a la vez ───────────────────────────────────────────────

test('devuelve TODOS los errores juntos, no solo el primero', () => {
  // Corregir de uno en uno en el móvil, con el accidente delante, es la forma
  // más rápida de que el cliente abandone el formulario.
  const r = normalizarParte({ descripcion: 'me han dado', fechaHecho: '2026-09-04' }, HOY)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.errores.descripcion, 'corta')
  assert.equal(r.ok === false && r.errores.fechaHecho, 'futura')
})

test('un formulario roto entero devuelve un error por campo', () => {
  const r = normalizarParte(
    {
      descripcion: '   ',
      fechaHecho: '2026-02-31',
      horaAproximada: '25:00',
      lugar: 'a'.repeat(201),
      polizaId: 'p-1',
      polizaDeclaradaId: 'd-1',
    },
    HOY,
  )
  assert.equal(r.ok, false)
  assert.deepEqual(
    r.ok === false && Object.keys(r.errores).sort(),
    ['descripcion', 'fechaHecho', 'horaAproximada', 'lugar', 'poliza'],
  )
})

// ── Limpieza ─────────────────────────────────────────────────────────────────

test('los espacios de los bordes se recortan antes de guardar', () => {
  const r = normalizarParte(
    { descripcion: `  ${DESC}  `, fechaHecho: '  2026-09-01  ', lugar: '  hola  ', polizaId: '  p-1  ' },
    HOY,
  )
  assert.equal(r.ok, true)
  assert.equal(r.ok === true && r.valor.descripcion, DESC)
  assert.equal(r.ok === true && r.valor.lugar, 'hola')
  assert.equal(r.ok === true && r.valor.polizaId, 'p-1')
  assert.equal(r.ok === true && r.valor.fechaHecho, '2026-09-01')
})

// ── 🚨 El tri-estado de heridos y terceros ───────────────────────────────────

test('🚨 lo que el cliente NO ha contestado sale null, NUNCA false', () => {
  // Si un «no me lo ha dicho» se guardara como `false`, la ficha de Alberto
  // diría «sin heridos» de un accidente sobre el que nadie preguntó — y un
  // parte con heridos se tramita en horas.
  for (const v of [undefined, null, 'quizá', '', '   ', 'no lo sé', 0, 1, 'ns/nc']) {
    const r = normalizarParte({ ...parteValido(), hayHeridos: v, hayTerceros: v }, HOY)
    assert.equal(r.ok, true, `valor=${JSON.stringify(v)}`)
    assert.equal(r.ok === true && r.valor.hayHeridos, null, `hayHeridos con ${JSON.stringify(v)}`)
    assert.equal(r.ok === true && r.valor.hayTerceros, null, `hayTerceros con ${JSON.stringify(v)}`)
  }
})

test('un «no» explícito sí es false, escrito como lo escriba', () => {
  for (const v of [false, 'no', 'false', 'No', 'NO', '  no  ']) {
    const r = normalizarParte({ ...parteValido(), hayHeridos: v, hayTerceros: v }, HOY)
    assert.equal(r.ok, true, `valor=${JSON.stringify(v)}`)
    assert.equal(r.ok === true && r.valor.hayHeridos, false, `valor=${JSON.stringify(v)}`)
    assert.equal(r.ok === true && r.valor.hayTerceros, false, `valor=${JSON.stringify(v)}`)
  }
})

// La caja y la tilde NO pueden decidir esto: un `<select>` que emita `'Sí'`
// dejaría TODOS los partes con heridos a `null`, y como `null` es un estado
// legítimo («no contestado») nadie vería nunca un error.
test('un «sí» explícito es true venga con tilde, en mayúsculas o con espacios', () => {
  for (const v of [true, 'si', 'sí', 'Sí', 'SÍ', 'SI', ' Si ', 'true']) {
    const r = normalizarParte({ ...parteValido(), hayHeridos: v, hayTerceros: v }, HOY)
    assert.equal(r.ok === true && r.valor.hayHeridos, true, `valor=${JSON.stringify(v)}`)
    assert.equal(r.ok === true && r.valor.hayTerceros, true, `valor=${JSON.stringify(v)}`)
  }
})

test('los dos tri-estados son independientes: uno contestado no contesta al otro', () => {
  const r = normalizarParte({ ...parteValido(), hayHeridos: 'no' }, HOY)
  assert.equal(r.ok, true)
  assert.equal(r.ok === true && r.valor.hayHeridos, false)
  assert.equal(r.ok === true && r.valor.hayTerceros, null)
})

// ── El plazo del art. 16 LCS ─────────────────────────────────────────────────

test('el plazo para comunicar el siniestro es de 7 días', () => {
  assert.equal(DIAS_COMUNICACION_LCS, 7)
})

test('un hecho de HOY no ha gastado plazo: 0 transcurridos, 7 restantes', () => {
  const p = plazoComunicacion({ fechaHecho: new Date(Date.UTC(2026, 8, 3)), hoy: HOY })
  assert.deepEqual(p, { diasTranscurridos: 0, diasRestantes: 7, fueraDePlazo: false })
})

test('el día 7 TODAVÍA está en plazo: la frontera es «más de 7», no «7 o más»', () => {
  const p = plazoComunicacion({ fechaHecho: new Date(Date.UTC(2026, 7, 27)), hoy: HOY }) // 27/08 → 03/09
  assert.equal(p.diasTranscurridos, 7)
  assert.equal(p.diasRestantes, 0)
  assert.equal(p.fueraDePlazo, false)
})

test('al día 8 ya está fuera de plazo y los días restantes van en negativo', () => {
  const p = plazoComunicacion({ fechaHecho: new Date(Date.UTC(2026, 7, 26)), hoy: HOY }) // 26/08 → 03/09
  assert.equal(p.diasTranscurridos, 8)
  assert.equal(p.diasRestantes, -1)
  assert.equal(p.fueraDePlazo, true)
})

test('la hora de los dos extremos no mueve el conteo: se cuenta por días UTC', () => {
  // Si contara por milisegundos, 6 días y 23 horas darían 6 y no 7.
  const p = plazoComunicacion({
    fechaHecho: new Date(Date.UTC(2026, 7, 27, 23, 30)),
    hoy: new Date(Date.UTC(2026, 8, 3, 0, 15)),
  })
  assert.equal(p.diasTranscurridos, 7)
  assert.equal(p.fueraDePlazo, false)
})

test('el plazo cruza el cambio de mes sin perder un día', () => {
  const p = plazoComunicacion({ fechaHecho: new Date(Date.UTC(2026, 7, 31)), hoy: HOY }) // 31/08 → 03/09
  assert.equal(p.diasTranscurridos, 3)
  assert.equal(p.diasRestantes, 4)
})

// ── parsearFechaHecho ────────────────────────────────────────────────────────

test('una fecha válida se parsea a medianoche UTC, no a la hora del servidor', () => {
  const d = parsearFechaHecho('2026-09-03')
  assert.notEqual(d, null)
  assert.equal(d?.getUTCHours(), 0)
  assert.equal(d?.getUTCMinutes(), 0)
  assert.equal(d?.getUTCSeconds(), 0)
  assert.equal(d?.getUTCMilliseconds(), 0)
  assert.equal(d?.toISOString(), '2026-09-03T00:00:00.000Z')
})

test('parsearFechaHecho devuelve null para todo lo que no sea un día real', () => {
  for (const v of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-09-00', '03/09/2026', '2026-9-3', '', 'ayer']) {
    assert.equal(parsearFechaHecho(v), null, `valor=${v}`)
  }
})

test('el 29 de febrero existe en año bisiesto y no en el que no lo es', () => {
  assert.equal(parsearFechaHecho('2028-02-29')?.toISOString().slice(0, 10), '2028-02-29')
  assert.equal(parsearFechaHecho('2026-02-29'), null)
})
