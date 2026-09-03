// Los PARTES DE SINIESTRO del portal, leídos desde la bandeja de Alberto en
// `apps/plataforma` (`/correduria`). Intérprete PURO de
// `apps/plataforma/lib/partes-asegura.ts`.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 Lo que vigila este fichero, en una frase: que NINGÚN camino acabe diciendo
// «no hay partes» cuando lo que ha pasado es que no se han podido leer.
//
// Al otro lado de cada fila hay una persona que abrió el parte, dio por hecho
// que su compañía ya lo sabía y no va a volver a llamar. Este bloque solo se
// pinta cuando hay partes sin atender, así que un fallo colapsado en una lista
// vacía es indistinguible de la bandeja limpia — y se lee como buenas noticias.
//
// Y los dos huecos del contenido, que son igual de caros:
//   · `hayHeridos`/`hayTerceros` son TRI-ESTADO. `null` = «no lo ha contestado»,
//     jamás `false`: con heridos el parte se tramita hoy y sin ellos el lunes.
//   · `cliente: null` = quien mandó el parte no está vinculado a ninguna ficha.
//     Es trabajo pendiente, no «cliente desconocido».
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PARTE_ESTADOS,
  interpretarEscrituraParte,
  interpretarPartes,
  leerParte,
  ordenarPorEspera,
  partesSinAtender,
  triestado,
} from '../apps/plataforma/lib/partes-asegura.ts'
import { PARTE_ESTADOS as PARTE_ESTADOS_PORTAL } from '../packages/module-seguros-portal/src/parte-siniestro.ts'

const PARTE = {
  id: 'pa1',
  cliente: { id: 'c1', nombre: 'Jose Suarez Salas' },
  titularDistinto: null,
  descripcion: 'Me han dado por detrás en el semáforo de la ronda',
  fechaHecho: '2026-09-01',
  horaAproximada: '18:30',
  lugar: 'Ronda de Capuchinos, Sevilla',
  hayHeridos: false,
  hayTerceros: true,
  estado: 'enviado',
  comunicado: false,
  siniestroId: null,
  polizaId: 'p1',
  polizaDeclaradaId: null,
  creadoEn: '2026-09-03T09:12:00.000Z',
  plazo: { diasTranscurridos: 2, diasRestantes: 5, fueraDePlazo: false },
}

const ok = (partes: unknown[]) => interpretarPartes(200, { partes })

// ── 200 bien formado ────────────────────────────────────────────────────────

test('un parte bien formado se lee entero', () => {
  const r = ok([PARTE])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.ilegibles, 0)
  const p = r.partes[0]
  assert.equal(p.id, 'pa1')
  assert.deepEqual(p.cliente, { id: 'c1', nombre: 'Jose Suarez Salas' })
  assert.equal(p.hayHeridos, false)
  assert.equal(p.hayTerceros, true)
  assert.equal(p.estado, 'enviado')
  assert.equal(p.comunicado, false)
  assert.deepEqual(p.plazo, { diasTranscurridos: 2, diasRestantes: 5, fueraDePlazo: false })
})

// ── 🚨 Los tri-estados ──────────────────────────────────────────────────────

test('🚨 `hayHeridos` ausente es «no lo ha contestado» (null), NUNCA «sin heridos»', () => {
  const sinCampo = { ...PARTE } as Record<string, unknown>
  delete sinCampo.hayHeridos
  const r = ok([sinCampo])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.partes[0].hayHeridos, null)
  // El error simétrico, que es el que mata: un `?? false` aquí pintaría «Sin
  // heridos» en un accidente sobre el que nadie preguntó.
  assert.notEqual(r.partes[0].hayHeridos, false)
})

test('🚨 solo un booleano de verdad es una respuesta al tri-estado', () => {
  assert.equal(triestado(true), true)
  assert.equal(triestado(false), false)
  for (const basura of [null, undefined, 'no', 'false', 0, 1, '', {}]) {
    assert.equal(triestado(basura), null, `${JSON.stringify(basura)} no es una respuesta`)
  }
})

test('un `null` explícito del puerto también es «no contestado»', () => {
  const r = ok([{ ...PARTE, hayHeridos: null, hayTerceros: null }])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.partes[0].hayHeridos, null)
  assert.equal(r.partes[0].hayTerceros, null)
})

// ── 🚨 Quién manda el parte ─────────────────────────────────────────────────

test('🚨 `cliente: null` se conserva: no está vinculado a ninguna ficha', () => {
  const r = ok([{ ...PARTE, cliente: null }])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  // Ni se inventa una ficha ni se cae la fila: es trabajo pendiente y tiene que
  // verse (identificar a esa persona antes de poder abrir nada).
  assert.equal(r.partes[0].cliente, null)
  assert.equal(r.partes.length, 1)
})

test('un `cliente` sin id no vale como enlace: sin id no hay ficha a la que ir', () => {
  const r = ok([{ ...PARTE, cliente: { nombre: 'Solo el nombre' } }])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.partes[0].cliente, null)
})

test('`titularDistinto` se lee: es a quién hay que llamar', () => {
  const r = ok([{ ...PARTE, titularDistinto: { id: 'c9', nombre: 'Maria Antonia' } }])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.partes[0].titularDistinto, { id: 'c9', nombre: 'Maria Antonia' })
})

// ── 🚨 200 que no trae lista ────────────────────────────────────────────────

test('🚨 un 200 SIN `partes` es un error, no una bandeja vacía', () => {
  assert.deepEqual(interpretarPartes(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('🚨 un `partes` que no es lista tampoco es una bandeja vacía', () => {
  for (const raro of [{ partes: null }, { partes: 'ninguno' }, { partes: {} }, { partes: 3 }]) {
    const r = interpretarPartes(200, raro)
    assert.equal(r.estado, 'error', `${JSON.stringify(raro)} debería ser error`)
  }
})

test('🚨 json ilegible: nunca «no hay partes»', () => {
  assert.deepEqual(interpretarPartes(200, null), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarPartes(200, 'texto suelto'), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('un 200 con `estado: error` propaga su causa', () => {
  assert.deepEqual(interpretarPartes(200, { estado: 'error', causa: 'credenciales' }), {
    estado: 'error', motivo: 'credenciales',
  })
  assert.deepEqual(interpretarPartes(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
})

// ── Fallos del puerto ───────────────────────────────────────────────────────

test('401/403 = el secreto no coincide entre los dos proyectos', () => {
  assert.deepEqual(interpretarPartes(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarPartes(403, null), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('🚨 404 = asegura no sirve (todavía) esta ruta; tampoco es «no hay partes»', () => {
  assert.deepEqual(interpretarPartes(404, null), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarPartes(200, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
})

test('500 y 503 se distinguen: uno es avería y el otro es que falta el secreto', () => {
  assert.deepEqual(interpretarPartes(500, null), { estado: 'error', motivo: 'HTTP 500' })
  assert.deepEqual(interpretarPartes(500, { motivo: 'boom' }), { estado: 'error', motivo: 'boom' })
  assert.deepEqual(interpretarPartes(503, null), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarPartes(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
})

test('🚨 NINGÚN fallo devuelve un `ok` con la lista vacía', () => {
  const fallos = [
    interpretarPartes(401, null), interpretarPartes(403, null), interpretarPartes(404, null),
    interpretarPartes(500, null), interpretarPartes(502, null), interpretarPartes(503, null),
    interpretarPartes(200, null), interpretarPartes(200, {}), interpretarPartes(200, { partes: 'x' }),
    interpretarPartes(200, { estado: 'error' }),
  ]
  for (const r of fallos) assert.notEqual(r.estado, 'ok')
})

// ── Filas raras ─────────────────────────────────────────────────────────────

test('una fila rara NO tumba el bloque, pero se CUENTA', () => {
  const r = ok([PARTE, { id: 'sin-estado' }, null, { ...PARTE, id: 'pa2' }])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.partes.length, 2)
  assert.equal(r.ilegibles, 2)
})

test('🚨 un estado desconocido no cae al inicial por descarte', () => {
  // Caería en la bandeja de «sin atender» algo que quizá ya está abierto en la
  // compañía. Se cuenta como ilegible y se mira en asegura.
  assert.equal(leerParte({ ...PARTE, estado: 'en_tramite' }), null)
  assert.equal(leerParte({ ...PARTE, estado: '' }), null)
})

test('un plazo a medias es un plazo inventado: se queda en null', () => {
  const casos = [
    { diasTranscurridos: 2 },
    { diasTranscurridos: 2, diasRestantes: 5 },
    { diasTranscurridos: 2, diasRestantes: 5, fueraDePlazo: 'no' },
    null,
  ]
  for (const plazo of casos) {
    const r = ok([{ ...PARTE, plazo }])
    assert.equal(r.estado, 'ok')
    if (r.estado !== 'ok') return
    assert.equal(r.partes[0].plazo, null, `${JSON.stringify(plazo)} no es un plazo`)
  }
})

test('la descripción ilegible se declara, no se pinta en blanco', () => {
  const r = ok([{ ...PARTE, descripcion: '   ' }])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.partes[0].descripcion, null)
})

// ── 🚨 `comunicado` ─────────────────────────────────────────────────────────

test('🚨 `comunicado` ausente NO se lee como comunicado', () => {
  const sinCampo = { ...PARTE, estado: 'recibido' } as Record<string, unknown>
  delete sinCampo.comunicado
  const r = ok([sinCampo])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  // El error caro es el contrario: decir «la compañía ya lo sabe» de algo que
  // no lo está deja al cliente sin siniestro y sin enterarse.
  assert.equal(r.partes[0].comunicado, false)
})

test('🚨 `comunicado` NO se deduce del estado', () => {
  const r = ok([
    { ...PARTE, id: 'a', estado: 'recibido', comunicado: false },
    { ...PARTE, id: 'b', estado: 'abierto_en_compania', comunicado: true, siniestroId: 's1' },
  ])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  // `recibido` = lo hemos leído NOSOTROS. La compañía sigue sin saber nada.
  assert.equal(r.partes[0].comunicado, false)
  assert.equal(r.partes[1].comunicado, true)
})

// ── Bandeja ─────────────────────────────────────────────────────────────────

test('la bandeja son los que nadie ha mirado', () => {
  const r = ok([
    { ...PARTE, id: 'a', estado: 'enviado' },
    { ...PARTE, id: 'b', estado: 'recibido' },
    { ...PARTE, id: 'c', estado: 'descartado' },
  ])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(partesSinAtender(r.partes).map((p) => p.id), ['a'])
})

test('primero el que lleva más esperando; el que no tiene plazo va al final, no delante', () => {
  const r = ok([
    { ...PARTE, id: 'nuevo', plazo: { diasTranscurridos: 1, diasRestantes: 6, fueraDePlazo: false } },
    { ...PARTE, id: 'sin-plazo', plazo: null },
    { ...PARTE, id: 'viejo', plazo: { diasTranscurridos: 9, diasRestantes: -2, fueraDePlazo: true } },
  ])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(ordenarPorEspera(r.partes).map((p) => p.id), ['viejo', 'nuevo', 'sin-plazo'])
})

// ── Escritura (PATCH) ───────────────────────────────────────────────────────

test('cada «no se hizo» del puerto llega con su motivo, y separado del «no se pudo»', () => {
  assert.deepEqual(interpretarEscrituraParte(400, { error: 'siniestro_requerido' }), {
    estado: 'invalido', motivo: 'siniestro_requerido',
  })
  assert.deepEqual(interpretarEscrituraParte(400, { error: 'motivo_requerido' }), {
    estado: 'invalido', motivo: 'motivo_requerido',
  })
  assert.deepEqual(interpretarEscrituraParte(409, { error: 'transicion_invalida' }), {
    estado: 'conflicto', motivo: 'transicion_invalida',
  })
  assert.deepEqual(interpretarEscrituraParte(404, null), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarEscrituraParte(503, null), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarEscrituraParte(500, null), { estado: 'error', motivo: 'HTTP 500' })
})

test('un ok devuelve la fila nueva si viene, y `null` si asegura no la manda', () => {
  const conFila = interpretarEscrituraParte(200, { parte: { ...PARTE, estado: 'recibido' } })
  assert.equal(conFila.estado, 'ok')
  if (conFila.estado !== 'ok') return
  assert.equal(conFila.parte?.estado, 'recibido')

  const sinFila = interpretarEscrituraParte(200, { ok: true })
  assert.equal(sinFila.estado, 'ok')
  if (sinFila.estado !== 'ok') return
  assert.equal(sinFila.parte, null)
})

// ── Guardianes ──────────────────────────────────────────────────────────────

test('🚨 el vocabulario de estados NO puede divergir del módulo del portal', () => {
  // `@central/module-seguros-portal` no es dependencia de plataforma (es otra
  // vertical), así que la lista está copiada. La copia no queda suelta: si
  // alguien añade un estado en el portal y aquí no, la bandeja de Alberto se
  // queda muda sobre partes que existen — el fallo de la casa.
  assert.deepEqual([...PARTE_ESTADOS], [...PARTE_ESTADOS_PORTAL])
})

test('🚨 la pantalla no deduce «la compañía lo sabe» del estado', () => {
  // Es un cambio de UNA línea que además parece razonable al leerla, y por eso
  // se vigila el FUENTE: ni tsc ni el build cazan una frase.
  const ruta = join(import.meta.dirname, '..', 'apps/plataforma/app/(usuario)/correduria/PartesPortal.tsx')
  const src = readFileSync(ruta, 'utf8')
  assert.ok(src.includes('p.comunicado'), 'la pantalla tiene que leer `comunicado`')
  // La prosa de este fichero y la de la pantalla evitan a propósito el literal
  // que se persigue, para que el cepo no castigue al comentario que lo explica.
  for (const atajo of [/estado\s*!==\s*'enviado'/, /estado\s*!==\s*"enviado"/]) {
    assert.equal(atajo.test(src), false, 'la comunicación a la compañía no se deduce del estado')
  }
  // Y ningún `?? false` sobre los tri-estados en toda la cadena.
  const lib = readFileSync(join(import.meta.dirname, '..', 'apps/plataforma/lib/partes-asegura.ts'), 'utf8')
  for (const src2 of [src, lib]) {
    assert.equal(/hayHeridos[^\n]*\?\?\s*false/.test(src2), false, 'un `?? false` convierte una pregunta sin responder en una afirmación')
    assert.equal(/hayTerceros[^\n]*\?\?\s*false/.test(src2), false, 'un `?? false` convierte una pregunta sin responder en una afirmación')
  }
})
