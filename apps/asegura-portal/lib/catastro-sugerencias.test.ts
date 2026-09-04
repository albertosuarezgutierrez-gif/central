// Cepos del ÚLTIMO recurso antes de teclear la casa a mano: proponer con IA,
// confirmar con el Catastro, decidir la PERSONA.
//
// ─── Qué protege de verdad ──────────────────────────────────────────────────
// Lo que sale de aquí se le enseña a alguien para que lo meta en SU póliza de
// hogar y la firme. El fallo caro no es un 500: es un candidato PLAUSIBLE que
// no es su casa. Los metros, el año y el CP de la vivienda de al lado no dan
// error, no se ven en ningún log, y en un siniestro se pagan como infraseguro.
//
// De ahí que los cepos sean estos y no otros:
//   1. La IA solo se llama cuando lo determinista ya ha fallado del todo.
//   2. Lo que el Catastro NO confirma no sale de aquí. Nunca texto de la IA.
//   3. Nunca se elige por la persona, ni con un solo candidato.
//   4. La IA no puede inventarse un número de portal (el 40 → 4 existe, el
//      Catastro lo confirma, y el candidato parece bueno).
//   5. «No hemos podido preguntar» (503) ≠ «no hay nada» (404) ≠ «el Catastro
//      se ha caído» (502). Tres estados, tres códigos, ninguno colapsado.
//   6. La dirección no aparece en ningún log ni viaja con nada de la persona.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RespuestaCatastro } from './catastro.ts'
import {
  HTTP_POR_ESTADO_SUGERENCIA,
  MAX_CANDIDATOS,
  MAX_PROPUESTAS_IA,
  promptSugerencias,
  propuestasDeIa,
  sugerirDirecciones,
  type EntradaSugerencias,
  type PuertoSugerencias,
} from './catastro-sugerencias.ts'

// ── Ayudas ──────────────────────────────────────────────────────────────────

const ENTRADA: EntradaSugerencias = {
  direccion: 'C/ San Vicente 40, 2º 14',
  municipio: 'SEVILLA',
  provincia: 'SEVILLA',
}

const OK: Extract<RespuestaCatastro, { estado: 'ok' }> = {
  estado: 'ok',
  referencia: '4632121TG3443B0001AB',
  sugerencia: { metrosCuadrados: 76, anioConstruccion: 1994, codigoPostal: '41002' },
  sinDato: [],
  contexto: { direccion: 'CL SAN VICENTE 40', uso: 'Residencial', localidad: 'SEVILLA', provincia: 'SEVILLA' },
  supuestos: [],
  avisos: [],
}

const ELEGIR: Extract<RespuestaCatastro, { estado: 'elegir' }> = {
  estado: 'elegir',
  via: 'SAN VICENTE',
  inmuebles: [
    { referencia: '4632121TG3443B0001AB', etiqueta: 'Planta baja', planta: '00', puerta: null, codigoPostal: '41002' },
    { referencia: '4632121TG3443B0002CD', etiqueta: 'Planta 2, puerta 14', planta: '02', puerta: '14', codigoPostal: '41002' },
  ],
  interiorNoCaso: true,
}

/**
 * Una reescritura que la IA podría proponer y que NO es ninguna de las
 * variantes deterministas: la vía con su nombre oficial completo. Si se usara
 * una que el módulo puro ya genera, se descartaría por repetida —que es lo
 * correcto— y el test estaría midiendo otra cosa.
 */
const VIA_LARGA = 'CALLE SAN VICENTE MARTIR 40'
const PROPUESTA_IA = JSON.stringify({ variantes: [VIA_LARGA] })
const CAIDO: RespuestaCatastro = { estado: 'catastro_no_responde' }

type Guion = {
  /** Qué contesta el Catastro a cada dirección. Lo no listado: `no_encontrado`. */
  catastro?: Record<string, RespuestaCatastro>
  /**
   * Respuestas POR TURNO (la última se repite). Se usa cuando lo que importa es
   * el orden y no el texto: las variantes deterministas las genera el módulo
   * puro, y atar un test a cómo escribe hoy la tercera lo rompería al pulirlo.
   */
  turnos?: RespuestaCatastro[]
  /** Respuesta cruda de la IA, o un error para simular que revienta. */
  ia?: string | Error
  iaConfigurada?: boolean
}

/** Puerto de mentira: ni una petición sale a internet en este fichero. */
function puerto(g: Guion) {
  const consultadas: string[] = []
  const promptsIa: { instruccion: string; prompt: string }[] = []
  const p: PuertoSugerencias = {
    consultarCatastro: async (c) => {
      assert.equal(c.por, 'direccion', 'esta ruta solo consulta por dirección')
      const dir = c.por === 'direccion' ? c.direccion : ''
      consultadas.push(dir)
      if (g.turnos) return g.turnos[Math.min(consultadas.length - 1, g.turnos.length - 1)]
      return g.catastro?.[dir] ?? { estado: 'no_encontrado' }
    },
    iaConfigurada: () => g.iaConfigurada ?? true,
    pedirAIa: async (instruccion, prompt) => {
      promptsIa.push({ instruccion, prompt })
      if (g.ia instanceof Error) throw g.ia
      return g.ia ?? '{"variantes":[]}'
    },
  }
  return { p, consultadas, promptsIa }
}

/** Ejecuta algo con `console.warn` capturado, para poder mirar qué se loguea. */
async function conLogs<T>(fn: () => Promise<T>): Promise<{ valor: T; logs: string }> {
  const original = console.warn
  const trozos: string[] = []
  console.warn = (...args: unknown[]) => {
    trozos.push(args.map(String).join(' '))
  }
  try {
    return { valor: await fn(), logs: trozos.join('\n') }
  } finally {
    console.warn = original
  }
}

// ── 1. El orden: lo barato primero, la IA solo si hace falta ────────────────

test('si una variante DETERMINISTA la encuentra, la IA no se llama ni una vez', async () => {
  const { p, promptsIa, consultadas } = puerto({ turnos: [OK] })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'candidatos')
  if (r.estado !== 'candidatos') return
  assert.equal(r.iaConsultada, false, 'gastar IA con lo determinista resuelto es tirar dinero')
  assert.deepEqual(promptsIa, [])
  assert.equal(r.candidatos[0].origen, 'determinista')
  assert.ok(consultadas.length >= 1)
})

test('la dirección ORIGINAL no se vuelve a consultar: quien llama ya la ha probado', async () => {
  const { p, consultadas } = puerto({})
  await sugerirDirecciones(ENTRADA, p)
  assert.ok(!consultadas.includes(ENTRADA.direccion), `se reconsultó la original: ${consultadas.join(' | ')}`)
})

test('la IA entra solo cuando NINGUNA determinista resuelve', async () => {
  const { p, promptsIa } = puerto({ ia: PROPUESTA_IA, catastro: { [VIA_LARGA]: OK } })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(promptsIa.length, 1, 'UNA llamada a la IA, no una por variante')
  assert.equal(r.estado, 'candidatos')
  if (r.estado !== 'candidatos') return
  assert.equal(r.iaConsultada, true)
  assert.equal(r.candidatos[0].origen, 'ia', 'que lo haya propuesto una máquina viaja con el candidato')
})

// ── 2. Lo que el Catastro no confirma, NO sale ──────────────────────────────

test('una propuesta de la IA que el Catastro no confirma no llega a ser candidata', async () => {
  const { p } = puerto({
    ia: JSON.stringify({ variantes: [VIA_LARGA, 'AVENIDA SAN VICENTE 40'] }),
    catastro: { [VIA_LARGA]: OK }, // la otra cae en `no_encontrado`
  })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'candidatos')
  if (r.estado !== 'candidatos') return
  assert.deepEqual(
    r.candidatos.map((c) => c.direccion),
    [VIA_LARGA],
    'solo sale lo confirmado por el Catastro, nunca el texto suelto del modelo',
  )
})

test('`elegir` también es una confirmación: la dirección existe y tiene varios pisos', async () => {
  const { p } = puerto({ ia: PROPUESTA_IA, catastro: { [VIA_LARGA]: ELEGIR } })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'candidatos')
  if (r.estado !== 'candidatos') return
  assert.equal(r.candidatos[0].resultado.estado, 'elegir')
})

// ── 3. Nunca se elige por la persona ────────────────────────────────────────

test('con UN solo candidato tampoco se resuelve: se devuelve la lista para que confirme', async () => {
  const { p } = puerto({ turnos: [OK, { estado: 'no_encontrado' }] })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'candidatos')
  if (r.estado !== 'candidatos') return
  assert.equal(r.candidatos.length, 1)
  assert.ok(Array.isArray(r.candidatos), 'la salida es una LISTA, no un inmueble resuelto')
  // Ni una sola clave de la respuesta dice «esta es la buena».
  assert.deepEqual(Object.keys(r).sort(), ['busquedaIncompleta', 'candidatos', 'consultasCatastro', 'estado', 'iaConsultada'])
})

test('nunca se devuelven más de MAX_CANDIDATOS: la lista es para reconocer, no para bucear', async () => {
  // Todo confirma: si no hubiera tope, saldrían las 6 variantes deterministas.
  const { p } = puerto({ turnos: [OK] })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'candidatos')
  if (r.estado !== 'candidatos') return
  assert.ok(r.candidatos.length <= MAX_CANDIDATOS, `${r.candidatos.length} candidatos`)
})

// ── 4. El tope duro de la IA, y el número que no se puede inventar ──────────

test('de la IA se consultan como mucho MAX_PROPUESTAS_IA, aunque proponga diez', async () => {
  const muchas = Array.from({ length: 10 }, (_, i) => `CALLE SAN VICENTE 40 ${'X'.repeat(i + 1)}`)
  const { p, consultadas } = puerto({ ia: JSON.stringify({ variantes: muchas }) })
  await sugerirDirecciones(ENTRADA, p)

  const deIa = consultadas.filter((d) => muchas.includes(d))
  assert.equal(deIa.length, MAX_PROPUESTAS_IA, 'cada propuesta es una consulta a un servicio público que no es nuestro')
})

test('la IA NO puede inventarse ni cambiar el número de portal', async () => {
  // El 4 de esa calle existe y el Catastro lo confirmaría: es el candidato
  // plausible-pero-equivocado que nadie detectaría después.
  const props = propuestasDeIa('{"variantes":["CALLE SAN VICENTE 4","CALLE SAN VICENTE 41","CALLE SAN VICENTE 40"]}', ENTRADA.direccion)
  assert.deepEqual(props, ['CALLE SAN VICENTE 40'])
})

test('quitar el número sí vale (es una búsqueda más amplia), inventarlo no', async () => {
  assert.deepEqual(propuestasDeIa('["CALLE SAN VICENTE"]', ENTRADA.direccion), ['CALLE SAN VICENTE'])
})

test('un JSON que no parsea son CERO propuestas, nunca propuestas a medias', () => {
  assert.deepEqual(propuestasDeIa('lo siento, no puedo ayudarte con eso', ENTRADA.direccion), [])
  assert.deepEqual(propuestasDeIa('', ENTRADA.direccion), [])
  assert.deepEqual(propuestasDeIa('{"variantes":[null,42,{"a":1}]}', ENTRADA.direccion), [])
})

test('no se reconsulta ni la original ni lo ya probado, escrito como esté', () => {
  const ya = new Set(['CALLESANVICENTE40'])
  assert.deepEqual(
    propuestasDeIa('{"variantes":["  c/  san   vicente 40, 2º 14 ","calle san vicente 40","CALLE SAN VICENTE"]}', ENTRADA.direccion, ya),
    ['CALLE SAN VICENTE'],
  )
})

test('una propuesta más larga que el tope de dirección se descarta', () => {
  assert.deepEqual(propuestasDeIa(JSON.stringify(['A'.repeat(500)]), ENTRADA.direccion), [])
})

// ── 5. Tres «no» distintos, tres códigos distintos ──────────────────────────

test('sin IA configurada NO se contesta «no hay nada»: se dice que no se ha podido mirar', async () => {
  const { p, promptsIa } = puerto({ iaConfigurada: false })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'ia_no_disponible')
  assert.equal(HTTP_POR_ESTADO_SUGERENCIA[r.estado], 503)
  assert.deepEqual(promptsIa, [], 'sin proveedor no se paga ni el timeout')
})

test('la IA que revienta degrada a ia_no_disponible, jamás a sin_candidatos', async () => {
  const { p } = puerto({ ia: new Error('502 Bad Gateway') })
  const { valor: r } = await conLogs(() => sugerirDirecciones(ENTRADA, p))
  assert.equal(r.estado, 'ia_no_disponible')
})

test('la IA que contesta pero no propone nada útil SÍ es sin_candidatos: se pudo mirar', async () => {
  const { p } = puerto({ ia: '{"variantes":[]}' })
  const r = await sugerirDirecciones(ENTRADA, p)
  assert.equal(r.estado, 'sin_candidatos')
  assert.equal(HTTP_POR_ESTADO_SUGERENCIA[r.estado], 404)
  if (r.estado !== 'sin_candidatos') return
  assert.equal(r.iaConsultada, true)
})

test('el Catastro caído para en seco: 502, sin gastar IA y sin parecerse a «no existe»', async () => {
  const { p, consultadas, promptsIa } = puerto({ turnos: [CAIDO] })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'catastro_no_responde')
  assert.equal(HTTP_POR_ESTADO_SUGERENCIA[r.estado], 502)
  assert.equal(consultadas.length, 1, 'no se sigue machacando un servicio que ya no contesta')
  assert.deepEqual(promptsIa, [], 'sin Catastro que confirme, la IA no puede aportar nada')
})

test('si el Catastro se cae DESPUÉS de confirmar uno, la lista se marca incompleta', async () => {
  const { p } = puerto({ turnos: [OK, CAIDO] })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'candidatos')
  if (r.estado !== 'candidatos') return
  assert.equal(r.busquedaIncompleta, true, 'decir que la lista está completa invita a descartar la propia casa')
})

test('todo ilegible no se colapsa en «no encontrado»: así escrito no se puede ni buscar', async () => {
  const { p } = puerto({ turnos: [{ estado: 'direccion_ilegible' }], ia: PROPUESTA_IA })
  const r = await sugerirDirecciones(ENTRADA, p)

  assert.equal(r.estado, 'direccion_ilegible')
  assert.equal(HTTP_POR_ESTADO_SUGERENCIA[r.estado], 422)
})

test('cada estado tiene su código y solo `candidatos` es un 200', () => {
  const codigos = Object.entries(HTTP_POR_ESTADO_SUGERENCIA)
  assert.equal(codigos.length, 5)
  for (const [estado, http] of codigos) {
    assert.equal(http === 200, estado === 'candidatos', `${estado} → ${http}`)
  }
})

// ── 6. Dato personal: ni en los logs, ni junto a quién pregunta ─────────────

test('la dirección no aparece en NINGÚN log, ni cuando el error de la IA la trae dentro', async () => {
  // Un proveedor puede devolver el prompt en el mensaje de error: por eso se
  // loguea el NOMBRE del error, no su mensaje.
  const e = new Error(`400 Bad Request: {"prompt":"${ENTRADA.direccion}"}`)
  const { valor: r, logs } = await conLogs(() => sugerirDirecciones(ENTRADA, puerto({ ia: e }).p))

  assert.equal(r.estado, 'ia_no_disponible')
  assert.doesNotMatch(logs, /San Vicente/i, `la dirección se escribió en un log:\n${logs}`)
  assert.doesNotMatch(logs, /SEVILLA/i)
})

test('a la IA solo le va el texto de la dirección: nada que identifique a la persona', async () => {
  const { p, promptsIa } = puerto({})
  await sugerirDirecciones(ENTRADA, p)

  assert.equal(promptsIa.length, 1)
  assert.equal(promptsIa[0].prompt, promptSugerencias(ENTRADA))
  // Solo tres líneas, y las tres son la propia dirección.
  assert.deepEqual(promptsIa[0].prompt.split('\n').length, 3)
  assert.doesNotMatch(promptsIa[0].prompt, /identidad|cliente|poliza|póliza|email|@|dni|tel/i)
})

// ── 7. Cepos estáticos sobre el propio código ───────────────────────────────

const AQUI = import.meta.dirname
const FUENTE = readFileSync(join(AQUI, 'catastro-sugerencias.ts'), 'utf8')
const RUTA = readFileSync(join(AQUI, '..', 'app', 'api', 'catastro', 'sugerir', 'route.ts'), 'utf8')

/**
 * Quita comentarios antes de mirar: los dos ficheros dicen POR ESCRITO que no
 * tocan `prisma`, y un cepo que no los quitara se mordería a sí mismo (el mismo
 * detalle que `test/regression-portal-parte-siniestro.test.ts`).
 */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
}

test('ni la lógica ni la ruta tocan la BD: esto solo consulta', () => {
  for (const [nombre, src] of [['lib', FUENTE], ['route', RUTA]] as const) {
    assert.doesNotMatch(soloCodigo(src), /\bprisma\b/i, `${nombre}: esta ruta no escribe ni lee nada de la BD`)
  }
})

test('la ruta exige sesión: sin ella sería un proxy anónimo que además gasta IA', () => {
  assert.match(RUTA, /requireIdentidad\(\)/)
  assert.match(RUTA, /status:\s*401/)
})

test('no se loguea la entrada en ningún sitio', () => {
  // Se permite `console.warn('...', e.name)`; lo que no se permite es meter la
  // dirección, el municipio o la provincia en un log.
  assert.doesNotMatch(soloCodigo(FUENTE), /console\.\w+\([^)]*\b(direccion|municipio|provincia|entrada)\b/)
})
