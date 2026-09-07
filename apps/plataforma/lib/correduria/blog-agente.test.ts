// Guardián del agente quincenal del blog.
//
// Lo que se vigila aquí es la puerta: qué sale del modelo y qué se deja pasar.
// Los cepos de `apps/asegura-web` son la segunda red —y la que de verdad
// bloquea el merge—, pero para cuando actúan el PR ya está abierto y en rojo.
// Estos evitan abrirlo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirPrompt,
  revisarGenerado,
  textoPlano,
  bloqueTs,
  insertarEnFuente,
  slugsPublicados,
  parsearRespuesta,
  MARCADOR,
  type ArticuloGenerado,
} from './blog-agente.ts'
import { TEMAS, elegirTema, temasRestantes } from './blog-temas.ts'
import { normaPorId, idsDesconocidos } from '@central/module-seguros'

const TEMA = TEMAS.find((t) => t.normas.includes('lcs-22'))!

function articuloValido(): ArticuloGenerado {
  return {
    h1: 'Te han subido el recibo del seguro sin avisarte',
    title: 'Subida del recibo sin aviso',
    description:
      'Qué puedes hacer si el recibo de tu seguro llega más caro que el año pasado y nadie te avisó, y qué plazo tienes para oponerte a la prórroga.',
    resumen:
      'Puedes oponerte a la prórroga comunicándolo con un mes de antelación al vencimiento; la compañía necesita avisar con dos.',
    secciones: [
      { titulo: 'Qué dice el contrato', parrafos: ['El contrato se prorroga solo salvo que alguien se oponga.'] },
      { titulo: 'Tu plazo', parrafos: ['El artículo 22 fija un mes de antelación para el tomador.'] },
      { titulo: 'Qué hacer ahora', parrafos: ['Mira la fecha de vencimiento antes que el importe.'] },
    ],
    faq: [{ pregunta: '¿Puedo anularlo hoy?', respuesta: 'Depende de cuánto falte para el vencimiento.' }],
  }
}

test('la cola de temas es coherente con la lista blanca de normas', () => {
  const slugs = new Set<string>()
  for (const t of TEMAS) {
    assert.ok(!slugs.has(t.slug), `tema duplicado: ${t.slug}`)
    slugs.add(t.slug)
    assert.match(t.slug, /^[a-z0-9-]+$/)
    assert.ok(t.consulta.trim().length > 10, `${t.slug}: consulta demasiado vaga`)
    assert.ok(t.angulo.trim().length > 30, `${t.slug}: sin ángulo, el artículo saldrá genérico`)
    // 🚨 Un tema que pide citar una norma inexistente produce un artículo que
    // el cepo del blog rechazará. Mejor descubrirlo aquí que en un PR rojo.
    assert.deepEqual(idsDesconocidos(t.normas), [], `${t.slug}: declara normas fuera de NORMAS_CITABLES`)
  }
})

test('elegirTema salta lo publicado y devuelve null al agotarse', () => {
  assert.equal(elegirTema([])?.slug, TEMAS[0].slug)
  assert.equal(elegirTema([TEMAS[0].slug])?.slug, TEMAS[1].slug)
  assert.equal(elegirTema(TEMAS.map((t) => t.slug)), null)
  assert.equal(temasRestantes([]), TEMAS.length)
  assert.equal(temasRestantes(TEMAS.map((t) => t.slug)), 0)
})

// El prompt es lo único que impide al modelo citar de memoria. Si las normas
// dejan de viajar en él, el modelo escribe igual — y ya nadie sabe de dónde
// saca los plazos.
test('el prompt lleva las normas permitidas con su síntesis', () => {
  const p = construirPrompt(TEMA, '2026-09-21')
  const n = normaPorId('lcs-22')!
  assert.match(p, /NORMAS QUE PUEDES CITAR/)
  assert.ok(p.includes(n.sintesis), 'la síntesis verificada no viaja en el prompt')
  assert.match(p, /No cites ninguna ley, artículo, orden ni real decreto que no esté/)
  assert.ok(p.includes(TEMA.consulta))
})

test('un tema sin normas prohíbe citar explícitamente', () => {
  const sinNormas = TEMAS.find((t) => t.normas.length === 0)!
  const p = construirPrompt(sinNormas, '2026-09-21')
  assert.match(p, /NO CITES NINGUNA NORMA/)
})

test('un artículo correcto no tiene reparos', () => {
  assert.deepEqual(revisarGenerado(articuloValido(), TEMA), [])
})

// 🚨 EL reparo. Es la razón de ser de todo esto.
test('citar una norma no verificada es un reparo', () => {
  const a = articuloValido()
  a.secciones[1].parrafos = ['El artículo 38 obliga al perito a emitir su informe.']
  const reparos = revisarGenerado(a, TEMA)
  assert.ok(reparos.some((r) => r.campo === 'citas'), `no se cazó la cita inventada: ${JSON.stringify(reparos)}`)
})

test('el copy prohibido es un reparo', () => {
  const conPrecio = articuloValido()
  conPrecio.resumen = 'Te conseguimos el mejor precio del mercado.'
  assert.ok(revisarGenerado(conPrecio, TEMA).some((r) => r.campo === 'copy'))

  const conAmbito = articuloValido()
  conAmbito.secciones[0].parrafos = ['Somos tu correduría en Sevilla y te acompañamos.']
  assert.ok(revisarGenerado(conAmbito, TEMA).some((r) => r.campo === 'copy'))
})

test('las medidas de la SERP son reparos', () => {
  const largo = articuloValido()
  largo.title = 'Un titular deliberadamente larguísimo que no cabe de ninguna manera'
  assert.ok(revisarGenerado(largo, TEMA).some((r) => r.campo === 'title'))

  const conMarca = articuloValido()
  conMarca.title = 'Subida de Grupo ASegura'
  assert.ok(revisarGenerado(conMarca, TEMA).some((r) => r.campo === 'title'))

  const corta = articuloValido()
  corta.description = 'Muy corta.'
  assert.ok(revisarGenerado(corta, TEMA).some((r) => r.campo === 'description'))
})

test('un artículo incompleto es un reparo, no un artículo', () => {
  const pocas = articuloValido()
  pocas.secciones = pocas.secciones.slice(0, 2)
  assert.ok(revisarGenerado(pocas, TEMA).some((r) => r.campo === 'secciones'))

  const vacio = articuloValido()
  vacio.h1 = '   '
  assert.ok(revisarGenerado(vacio, TEMA).some((r) => r.campo === 'h1'))
})

test('el texto revisado incluye todo lo visible', () => {
  const a = articuloValido()
  const t = textoPlano(a)
  for (const trozo of [a.h1, a.resumen, a.secciones[0].parrafos[0], a.faq[0].respuesta]) {
    assert.ok(t.includes(trozo), `«${trozo}» no entra en la revisión`)
  }
})

test('el bloque generado es TypeScript con los campos del artículo', () => {
  const b = bloqueTs(articuloValido(), TEMA, '2026-09-21')
  assert.match(b, new RegExp(`slug: '${TEMA.slug}'`))
  assert.match(b, /fecha: '2026-09-21'/)
  assert.match(b, /base: \['lcs-22'\]/)
  assert.match(b, /secciones: \[/)
  // Una comilla sin escapar rompe el fichero entero y con él las 13 apps del
  // typecheck. Es el modo de fallo más caro de este generador.
  const conComilla = articuloValido()
  conComilla.resumen = "No es 'sencillo' de leer"
  assert.match(bloqueTs(conComilla, TEMA, '2026-09-21'), /No es \\'sencillo\\' de leer/)
})

test('insertar respeta lo que ya hay y falla ALTO si no está el marcador', () => {
  const fuente = `export const ARTICULOS = [\n  { slug: 'uno' },\n${MARCADOR}\n]\n`
  const salida = insertarEnFuente(fuente, "  { slug: 'dos' },\n")
  assert.ok(salida.includes("slug: 'uno'"), 'se perdió lo que ya había')
  assert.ok(salida.indexOf("slug: 'dos'") < salida.indexOf(MARCADOR), 'se insertó en el sitio equivocado')

  assert.throws(
    () => insertarEnFuente("export const ARTICULOS = [\n]\n", '  {},\n'),
    /marcador de inserción/,
    'sin marcador debe lanzar, no devolver el fuente intacto',
  )
})

test('los slugs publicados se leen del fuente', () => {
  const fuente = `export const ARTICULOS = [\n    slug: 'uno',\n    slug: 'dos-tres',\n]\n`
  assert.deepEqual(slugsPublicados(fuente), ['uno', 'dos-tres'])
})

test('parsearRespuesta aguanta lo que devuelven los modelos, y se rinde en voz alta', () => {
  const bueno = '{"h1":"a","title":"b","description":"c","resumen":"d","secciones":[],"faq":[]}'
  assert.equal(parsearRespuesta(bueno)?.h1, 'a')
  assert.equal(parsearRespuesta('```json\n' + bueno + '\n```')?.h1, 'a')
  assert.equal(parsearRespuesta('Aquí tienes:\n' + bueno)?.h1, 'a')
  // Y lo que no se puede leer no se rellena con un objeto vacío: un artículo
  // vacío pasaría media validación por no tener nada que revisar.
  assert.equal(parsearRespuesta('no hay json aquí'), null)
  assert.equal(parsearRespuesta('{roto'), null)
})
