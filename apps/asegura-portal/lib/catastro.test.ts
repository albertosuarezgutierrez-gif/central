// Cepos de lo que este portal hace con el Catastro. Lo que se prueba aquí es
// SOLO lo que se ha escrito en esta app: el paquete `@central/core-catastro`
// (parseo del XML, callejero, cerrojo anti-corte) trae sus propios tests y no
// se le repiten.
//
// ─── Lo que de verdad protege ────────────────────────────────────────────────
// La regla de la casa dice que un «no lo sé» no puede salir vestido de dato.
// Aquí eso tiene un precio concreto: el número que esta ruta devuelve se le
// enseña al cliente para que lo meta en SU póliza y la firme. Si el Catastro no
// contesta y la respuesta sale como `{ metrosCuadrados: 0 }` —o como un objeto
// vacío con un 200— nadie ve un error en ningún log: se ve una vivienda de cero
// metros cuadrados asegurada a propósito.
//
// De ahí que los cepos sean estos cuatro y no otros:
//   1. El servicio caído NO puede parecerse a «esa vivienda no existe».
//   2. Varios pisos en el portal NO se resuelven eligiendo uno.
//   3. Un valor que el catálogo rechaza no se ofrece, pero tampoco se calla:
//      «fuera de rango» y «el Catastro no lo publica» son cosas distintas.
//   4. La dirección no aparece en ningún log. Es dato personal.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { camposDeRamo } from '@central/module-seguros-portal'
import type { DatosHogar, InmuebleCatastro } from '@central/core-catastro'

import {
  CAMPOS_DESDE_CATASTRO,
  HTTP_POR_ESTADO,
  consultarCatastroHogar,
  etiquetaInmueble,
  normalizarReferencia,
  sugerenciaHogar,
  type PuertoCatastro,
} from './catastro.ts'

// ── Ayudas ──────────────────────────────────────────────────────────────────

/** La ficha real de CL SAN VICENTE 40, 2º-14 (Sevilla), medida el 04/09/2026. */
const SAN_VICENTE: DatosHogar = {
  metrosCuadrados: 76,
  anioConstruccion: 1994,
  uso: 'Residencial',
  direccion: 'CL SAN VICENTE 40 Es:1 Pl:02 Pt:14 41002 SEVILLA',
  localidad: 'SEVILLA',
  provincia: 'SEVILLA',
  codigoPostal: '41002',
  enBloque: null,
}

function inmueble(planta: string | null, puerta: string | null, sufijo: string): InmuebleCatastro {
  return {
    refCompleta: `4632121TG3443B00${sufijo}`,
    refParcela: '4632121TG3443B',
    planta,
    puerta,
    codigoPostal: '41002',
  }
}

/** Puerto de mentira: ni una petición sale a internet en este fichero. */
function puerto(over: Partial<PuertoCatastro>): PuertoCatastro {
  return {
    inmueblesPorDireccion: async () => ({ via: 'SAN VICENTE', inmuebles: [] }),
    bajarCatastro: async () => null,
    ...over,
  } as PuertoCatastro
}

const DIRECCION = { por: 'direccion' as const, direccion: 'CL SAN VICENTE 40, 2º 14', municipio: 'SEVILLA', provincia: 'SEVILLA' }

/** Ejecuta algo con `console.warn` capturado, para poder mirar qué se loguea. */
async function conLogs<T>(fn: () => Promise<T>): Promise<{ valor: T; logs: string }> {
  const original = console.warn
  const trozos: string[] = []
  console.warn = (...args: unknown[]) => { trozos.push(args.map(String).join(' ')) }
  try {
    return { valor: await fn(), logs: trozos.join('\n') }
  } finally {
    console.warn = original
  }
}

// ── 1. El servicio caído ≠ la vivienda no existe ────────────────────────────

test('el Catastro que no responde da 502, NUNCA un 404 ni una sugerencia vacía', async () => {
  const { valor: r } = await conLogs(() =>
    consultarCatastroHogar(DIRECCION, puerto({
      inmueblesPorDireccion: async () => { throw new Error('HTTP 503') },
    })),
  )
  assert.equal(r.estado, 'catastro_no_responde')
  assert.equal(HTTP_POR_ESTADO[r.estado], 502)
  // Lo que NO puede pasar: que el fallo de red se lea como «no hay nada ahí».
  assert.notEqual(r.estado, 'no_encontrado')
  // Ni que se cuele una sugerencia: no hay dato ninguno que ofrecer.
  assert.equal('sugerencia' in r, false)
})

test('un corte al pedir los datos del piso (tras localizarlo) también es 502', async () => {
  const { valor: r } = await conLogs(() =>
    consultarCatastroHogar(DIRECCION, puerto({
      inmueblesPorDireccion: async () => ({ via: 'SAN VICENTE', inmuebles: [inmueble('02', '14', '15JW')] }),
      bajarCatastro: async () => { throw new Error('fetch failed') },
    })),
  )
  assert.equal(r.estado, 'catastro_no_responde')
})

test('el Catastro que responde «aquí no hay nada» sí es 404', async () => {
  const r = await consultarCatastroHogar(DIRECCION, puerto({}))
  assert.equal(r.estado, 'no_encontrado')
  assert.equal(HTTP_POR_ESTADO[r.estado], 404)
})

test('el piso localizado pero sin ficha (respuesta de error del servicio) es 404, no 502', async () => {
  const r = await consultarCatastroHogar(DIRECCION, puerto({
    inmueblesPorDireccion: async () => ({ via: 'SAN VICENTE', inmuebles: [inmueble('02', '14', '15JW')] }),
    // `null` = el Catastro contestó con un `<des>` de error. Un corte de red
    // llega por excepción y sale por el 502 de arriba: son cosas distintas.
    bajarCatastro: async () => null,
  }))
  assert.equal(r.estado, 'no_encontrado')
})

test('la vía ambigua tiene código propio: no es «no existe» ni «no responde»', async () => {
  const r = await consultarCatastroHogar(DIRECCION, puerto({ inmueblesPorDireccion: async () => null }))
  assert.equal(r.estado, 'via_ambigua')
  assert.equal(HTTP_POR_ESTADO[r.estado], 409)
})

test('una dirección de la que no sale ni calle ni número es 422, no 404', async () => {
  const r = await consultarCatastroHogar(
    { ...DIRECCION, direccion: 'al lado de la plaza, el portal verde' },
    // Si llegara a consultar el Catastro sería un fallo: no hay nada que pedir.
    puerto({ inmueblesPorDireccion: async () => { throw new Error('no debería llamarse') } }),
  )
  assert.equal(r.estado, 'direccion_ilegible')
  assert.equal(HTTP_POR_ESTADO[r.estado], 422)
})

// ── 2. Varios pisos: elige una persona ──────────────────────────────────────

test('un portal con varios pisos se devuelve ENTERO para que elija la persona', async () => {
  const inmuebles = [inmueble('00', 'A', '01YF'), inmueble('02', '13', '14HQ'), inmueble('02', '14', '15JW')]
  const r = await consultarCatastroHogar(DIRECCION, puerto({
    inmueblesPorDireccion: async () => ({ via: 'SAN VICENTE', inmuebles }),
    bajarCatastro: async () => { throw new Error('no se pide la ficha de un piso sin elegir') },
  }))
  assert.equal(r.estado, 'elegir')
  assert.equal(HTTP_POR_ESTADO[r.estado], 300)
  assert.notEqual(HTTP_POR_ESTADO.elegir, HTTP_POR_ESTADO.ok, 'elegir no puede compartir código con ok')
  if (r.estado !== 'elegir') return
  // Los tres, en el mismo orden y con su referencia: nadie ha elegido por nadie.
  assert.deepEqual(r.inmuebles.map((i) => i.referencia), inmuebles.map((i) => i.refCompleta))
  assert.equal(r.interiorNoCaso, false)
})

test('si el piso escrito no casa, se reintenta sin él y se DICE (interiorNoCaso)', async () => {
  const llamadas: Array<string | null | undefined> = []
  const r = await consultarCatastroHogar(DIRECCION, puerto({
    inmueblesPorDireccion: async (p) => {
      llamadas.push(p.planta)
      // 1ª con planta '2' → el Catastro la archiva como '02' y no encuentra nada.
      return p.planta ? { via: 'SAN VICENTE', inmuebles: [] }
        : { via: 'SAN VICENTE', inmuebles: [inmueble('02', '13', '14HQ'), inmueble('02', '14', '15JW')] }
    },
  }))
  assert.deepEqual(llamadas, ['2', null], 'primero con el interior, y solo si falla sin él')
  assert.equal(r.estado, 'elegir')
  if (r.estado !== 'elegir') return
  assert.equal(r.interiorNoCaso, true, 'la pantalla tiene que poder decir que esta lista es la del portal entero')
})

test('el reintento sin interior que tampoco encuentra nada acaba en 404, no en una lista vacía «elegir»', async () => {
  const r = await consultarCatastroHogar(DIRECCION, puerto({ inmueblesPorDireccion: async () => ({ via: 'SAN VICENTE', inmuebles: [] }) }))
  assert.equal(r.estado, 'no_encontrado')
})

test('un solo inmueble sí se resuelve solo: no hay nada que elegir', async () => {
  const r = await consultarCatastroHogar(DIRECCION, puerto({
    inmueblesPorDireccion: async () => ({ via: 'SAN VICENTE', inmuebles: [inmueble('02', '14', '15JW')] }),
    bajarCatastro: async () => SAN_VICENTE_CATASTRO,
  }))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.referencia, '4632121TG3443B0015JW')
  assert.deepEqual(r.sugerencia, { metrosCuadrados: 76, anioConstruccion: 1994, codigoPostal: '41002' })
  assert.deepEqual(r.sinDato, [])
})

// El puerto devuelve `DatosCatastro` (lo del paquete), no `DatosHogar`.
const SAN_VICENTE_CATASTRO = {
  direccion: 'CL SAN VICENTE 40 Es:1 Pl:02 Pt:14 41002 SEVILLA',
  superficie: 76,
  anioConstruccion: 1994,
  uso: 'Residencial',
  cuotaParticipacion: 3.08,
  clase: 'UR',
  provincia: 'SEVILLA',
  municipio: 'SEVILLA',
  codigoPostal: '41002',
}

// ── 3. Lo que falta se dice, y con su motivo ────────────────────────────────

test('las tres claves son las del catálogo de hogar y están marcadas desdeCatastro', () => {
  const hogar = camposDeRamo('hogar')
  for (const id of CAMPOS_DESDE_CATASTRO) {
    const campo = hogar.find((c) => c.id === id)
    assert.ok(campo, `el catálogo de hogar ya no tiene «${id}»: la sugerencia no tendría dónde entrar`)
    assert.equal(campo.desdeCatastro, true, `«${id}» debería estar marcado desdeCatastro en el catálogo`)
  }
})

test('la ficha completa da los tres campos y ningún hueco', () => {
  const { sugerencia, sinDato } = sugerenciaHogar(SAN_VICENTE)
  assert.deepEqual(sugerencia, { metrosCuadrados: 76, anioConstruccion: 1994, codigoPostal: '41002' })
  assert.deepEqual(sinDato, [])
})

test('lo que el Catastro no publica sale null y CON su motivo, nunca 0', () => {
  const { sugerencia, sinDato } = sugerenciaHogar({ ...SAN_VICENTE, metrosCuadrados: null, anioConstruccion: null })
  assert.equal(sugerencia.metrosCuadrados, null)
  assert.equal(sugerencia.anioConstruccion, null)
  assert.notEqual(sugerencia.metrosCuadrados, 0, 'un 0 aquí es una vivienda de cero metros, no un hueco')
  assert.deepEqual(sinDato, [
    { campo: 'metrosCuadrados', motivo: 'no_publicado' },
    { campo: 'anioConstruccion', motivo: 'no_publicado' },
  ])
})

test('un valor que el catálogo rechaza no se ofrece, y NO se confunde con «no publicado»', () => {
  // 40.000 m² es el edificio entero (el catálogo topa en 10.000) y 1500 está
  // por debajo del 1800 del catálogo: son datos que existen y no valen.
  const { sugerencia, sinDato } = sugerenciaHogar({ ...SAN_VICENTE, metrosCuadrados: 40000, anioConstruccion: 1500 })
  assert.equal(sugerencia.metrosCuadrados, null)
  assert.equal(sugerencia.anioConstruccion, null)
  assert.deepEqual(sinDato, [
    { campo: 'metrosCuadrados', motivo: 'fuera_de_rango' },
    { campo: 'anioConstruccion', motivo: 'fuera_de_rango' },
  ])
  // El código postal bueno sobrevive: un campo malo no se lleva por delante el
  // resto de la sugerencia.
  assert.equal(sugerencia.codigoPostal, '41002')
})

test('el código postal viaja como TEXTO: los que empiezan por cero se conservan', () => {
  const { sugerencia } = sugerenciaHogar({ ...SAN_VICENTE, codigoPostal: '01001' })
  assert.equal(sugerencia.codigoPostal, '01001')
  assert.equal(typeof sugerencia.codigoPostal, 'string')
})

// ── 4. La dirección no se loguea ────────────────────────────────────────────

test('el log del fallo dice el motivo, nunca la dirección', async () => {
  const { logs } = await conLogs(() =>
    consultarCatastroHogar(
      { por: 'direccion', direccion: 'CL PEPITA GRILLO 7, 3º B', municipio: 'SEVILLA', provincia: 'SEVILLA' },
      puerto({ inmueblesPorDireccion: async () => { throw new Error('HTTP 503') } }),
    ),
  )
  assert.match(logs, /no respondió/)
  assert.doesNotMatch(logs, /PEPITA GRILLO/i)
  assert.doesNotMatch(logs, /3º B/i)
})

test('ningún fichero del Catastro de esta app loguea la dirección de entrada', () => {
  for (const f of ['lib/catastro.ts', 'app/api/catastro/route.ts']) {
    const src = readFileSync(join(import.meta.dirname, '..', f), 'utf8')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    for (const linea of src.split('\n')) {
      if (!/console\.(log|warn|error|info)/.test(linea)) continue
      assert.doesNotMatch(linea, /direccion|destino|municipio/, `«${linea.trim()}» mete dato personal en los logs`)
    }
  }
})

// ── Contrato de la ruta ─────────────────────────────────────────────────────

test('la ruta exige sesión y no escribe en la BD', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'app/api/catastro/route.ts'), 'utf8')
  assert.match(src, /requireIdentidad/, 'sin sesión el portal sería un proxy anónimo contra el Catastro')
  assert.match(src, /status:\s*401/, 'sin cookie tiene que contestar 401')
  assert.doesNotMatch(src, /prisma/, 'esta ruta solo consulta: el dato lo acepta el cliente en su formulario')
  assert.match(src, /safeParse/, 'la entrada se valida con zod')
  assert.match(src, /max\(/, 'los textos llevan tope de longitud')
})

// ── Detalles de forma ───────────────────────────────────────────────────────

test('cada estado tiene su código, y ningún estado malo devuelve 200', () => {
  const estados = Object.keys(HTTP_POR_ESTADO)
  assert.ok(estados.length >= 7)
  for (const [estado, codigo] of Object.entries(HTTP_POR_ESTADO)) {
    if (estado === 'ok') { assert.equal(codigo, 200); continue }
    assert.notEqual(codigo, 200, `«${estado}» no puede contestar 200: se leería como una respuesta buena`)
  }
  // Los tres casos malos que más se colapsan, cada uno con el suyo.
  const malos = [HTTP_POR_ESTADO.no_encontrado, HTTP_POR_ESTADO.catastro_no_responde, HTTP_POR_ESTADO.elegir]
  assert.equal(new Set(malos).size, 3)
})

test('la planta 00 del Catastro se dice «planta baja», no «Planta 00»', () => {
  assert.equal(etiquetaInmueble(inmueble('00', 'A', '01YF')), 'Planta baja, puerta A')
  assert.equal(etiquetaInmueble(inmueble('02', '14', '15JW')), 'Planta 2, puerta 14')
  assert.equal(etiquetaInmueble(inmueble('03', null, '20XX')), 'Planta 3')
  assert.equal(etiquetaInmueble(inmueble('EN', 'DR', '21XX')), 'Planta EN, puerta DR')
  assert.equal(etiquetaInmueble(inmueble(null, null, '22XX')), 'Sin planta ni puerta informadas')
})

test('la referencia del EDIFICIO (14) no se toma por la del piso', async () => {
  const r = await consultarCatastroHogar({ por: 'referencia', referencia: '4632121TG3443B' }, puerto({
    bajarCatastro: async () => { throw new Error('no se consulta una referencia inválida') },
  }))
  assert.equal(r.estado, 'referencia_invalida')
  assert.equal(HTTP_POR_ESTADO[r.estado], 422)
})

test('la referencia se normaliza (espacios, guiones y minúsculas) antes de mirarla', async () => {
  assert.equal(normalizarReferencia(' 4632121tg3443b 0015-jw '), '4632121TG3443B0015JW')
  const r = await consultarCatastroHogar({ por: 'referencia', referencia: '4632121tg3443b 0015 jw' }, puerto({
    bajarCatastro: async (rc) => (rc === '4632121TG3443B0015JW' ? SAN_VICENTE_CATASTRO : null),
  }))
  assert.equal(r.estado, 'ok')
})
