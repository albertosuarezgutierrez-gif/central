// Guardián de los artículos del blog.
//
// El copy pasa por el MISMO cepo que los ramos y que los borradores de redes:
// `revisarCopy` de `@central/module-seguros`. La lista de lo prohibido no se
// reescribe aquí — dos copias divergen y una deja de vigilar sin que nada falle.
//
// 🚨 Y el cepo propio de este fichero: **si el texto cita una norma, el artículo
// declara `base`**. En una web de seguros un número de artículo inventado es
// peor que no citar ninguno: parece autoridad y no lo es, y quien lo lea puede
// tomar una decisión con plazo legal por medio. `base` es lo que permite
// verificar la cita antes de publicar, y comprobarla después.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { revisarCopy, explicarInfracciones, citasNoRespaldadas, idsDesconocidos, mencionesNormativas } from '@central/module-seguros'
import { ARTICULOS, articuloPorSlug, articulosDeRamo, textoArticulo } from './articulos.ts'
import { RAMOS } from './ramos.ts'

const SUFIJO_MARCA = ' · Grupo ASegura'

test('hay artículos y todos tienen sus campos con contenido', () => {
  assert.ok(ARTICULOS.length >= 1, 'sin artículos el cepo estaría en verde mirando al vacío')
  for (const a of ARTICULOS) {
    assert.match(a.slug, /^[a-z0-9-]+$/, `slug inválido: ${a.slug}`)
    for (const campo of ['h1', 'title', 'description', 'resumen', 'consulta'] as const) {
      assert.ok(a[campo].trim().length > 0, `${a.slug}: ${campo} vacío`)
    }
    assert.ok(a.secciones.length >= 3, `${a.slug}: menos de 3 secciones`)
    for (const s of a.secciones) {
      assert.ok(s.titulo.trim().length > 0, `${a.slug}: sección sin título`)
      assert.ok(s.parrafos.length >= 1, `${a.slug}: sección «${s.titulo}» sin párrafos`)
    }
  }
})

test('los slugs no se repiten y articuloPorSlug no inventa', () => {
  const vistos = new Set<string>()
  for (const a of ARTICULOS) {
    assert.ok(!vistos.has(a.slug), `slug duplicado: ${a.slug}`)
    vistos.add(a.slug)
  }
  assert.equal(articuloPorSlug('no-existe'), null)
  assert.equal(articuloPorSlug('')?.slug, undefined)
  assert.equal(articuloPorSlug(ARTICULOS[0].slug)?.slug, ARTICULOS[0].slug)
})

// 🚨 EL cepo. Mismo criterio que la web y que redes: nada que convierta el
// artículo en asesoramiento (RDL 3/2020) ni que acote la oferta a una provincia.
test('ningún artículo promete precio, superlativos ni acota el ámbito', () => {
  for (const a of ARTICULOS) {
    const infracciones = revisarCopy(textoArticulo(a))
    assert.deepEqual(infracciones, [], `${a.slug}: ${explicarInfracciones(infracciones)}`)
  }
})

// 🚨 EL cepo que hace publicable un artículo que no ha escrito una persona.
//
// Hasta el 07/09/2026 esto solo exigía que `base` existiera, y con los tres
// artículos escritos a mano bastaba: los verifiqué contra el BOE uno a uno.
// En cuanto un agente redacte los siguientes deja de bastar — un texto puede
// citar el artículo 38 y declarar el 22, y el cepo viejo se pone verde. Ahora
// `base` son ids de `NORMAS_CITABLES` y se comprueba que TODA norma nombrada
// en el texto esté respaldada por alguno de ellos.
test('toda norma citada en el texto está en la lista blanca verificada', () => {
  for (const a of ARTICULOS) {
    const texto = textoArticulo(a)
    const menciones = mencionesNormativas(texto)
    if (menciones.length === 0) continue

    assert.ok(
      a.base && a.base.length > 0,
      `${a.slug}: el texto cita ${menciones.join(', ')} y no declara \`base\``,
    )
    assert.deepEqual(
      idsDesconocidos(a.base!),
      [],
      `${a.slug}: declara normas que no están en NORMAS_CITABLES`,
    )
    assert.deepEqual(
      citasNoRespaldadas(texto, a.base!),
      [],
      `${a.slug}: cita normas que nadie ha verificado contra el BOE`,
    )
  }
})

test('title y description caben en la SERP sin cortarse a mitad de palabra', () => {
  for (const a of ARTICULOS) {
    const titulo = a.title + SUFIJO_MARCA
    assert.ok(titulo.length <= 65, `${a.slug}: title de ${titulo.length} caracteres con la marca (máx 65)`)
    assert.ok(
      a.description.length >= 110 && a.description.length <= 165,
      `${a.slug}: description de ${a.description.length} caracteres (110-165)`,
    )
  }
})

// La plantilla del layout ya añade la marca: escribirla también aquí la duplica
// en la SERP, que es el fallo que se corrigió en los seis ramos.
test('el title no repite la marca que ya añade la plantilla', () => {
  for (const a of ARTICULOS) {
    assert.ok(!/Grupo\s+ASegura/i.test(a.title), `${a.slug}: el title repite la marca`)
  }
})

// Un `ramos` que apunta a un slug inexistente es un enlace roto en producción,
// y `tsc` no lo ve: son cadenas.
test('los ramos enlazados existen', () => {
  const slugs = new Set(RAMOS.map((r) => r.slug))
  for (const a of ARTICULOS) {
    for (const r of a.ramos ?? []) {
      assert.ok(slugs.has(r), `${a.slug}: enlaza al ramo «${r}», que no existe`)
    }
  }
  // Y al revés: el enlazado sirve de algo solo si algún ramo recibe artículos.
  const conArticulos = RAMOS.filter((r) => articulosDeRamo(r.slug).length > 0)
  assert.ok(conArticulos.length > 0, 'ningún ramo recibe artículos: el enlazado interno no reparte nada')
})

// `datePublished` viaja al JSON-LD. Una fecha con formato raro la ignora el
// buscador; una futura es sencillamente falsa.
test('las fechas son ISO y no están en el futuro', () => {
  const hoy = new Date().toISOString().slice(0, 10)
  for (const a of ARTICULOS) {
    for (const [campo, valor] of [['fecha', a.fecha], ['revisado', a.revisado]] as const) {
      if (!valor) continue
      assert.match(valor, /^\d{4}-\d{2}-\d{2}$/, `${a.slug}: ${campo} no es AAAA-MM-DD`)
      assert.ok(valor <= hoy, `${a.slug}: ${campo} está en el futuro (${valor})`)
    }
    if (a.revisado) assert.ok(a.revisado >= a.fecha, `${a.slug}: revisado es anterior a la publicación`)
  }
})

// Dos artículos sobre la misma búsqueda compiten entre sí en la SERP: es el
// mismo problema de canibalización que ya tenían las FAQ repetidas de los ramos.
test('no hay dos artículos para la misma consulta', () => {
  const vistas = new Map<string, string>()
  for (const a of ARTICULOS) {
    const clave = a.consulta.toLowerCase().trim()
    const previo = vistas.get(clave)
    assert.equal(previo, undefined, `«${a.consulta}» la cubren ${previo} y ${a.slug}: se canibalizan`)
    vistas.set(clave, a.slug)
  }
})

// El agente quincenal inserta por este marcador. Sin él la inserción falla, y
// falla MUDA: el agente no puede saber que el hueco ya no está, así que el
// síntoma sería «el blog dejó de crecer» semanas después.
test('el marcador de inserción del agente sigue en su sitio', () => {
  const fuente = readFileSync(new URL('./articulos.ts', import.meta.url), 'utf8')
  assert.match(fuente, /MARCADOR DE INSERCIÓN/, 'el agente quincenal ya no tiene dónde insertar')
  // Y tiene que estar DENTRO del array, no detrás: insertar tras el cierre
  // produciría un fichero que ni compila.
  const inicio = fuente.indexOf('export const ARTICULOS')
  const cierre = fuente.indexOf('\n]', inicio)
  const marcador = fuente.indexOf('MARCADOR DE INSERCIÓN')
  assert.ok(inicio > 0 && cierre > inicio, 'no se localiza el array de ARTICULOS')
  assert.ok(
    marcador > inicio && marcador < cierre,
    'el marcador quedó fuera del array de ARTICULOS: insertar ahí produciría un fichero que no compila',
  )
})
