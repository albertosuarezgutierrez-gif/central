// Cepo de la REGLA DE VISIBILIDAD del portal del cliente (03/09/2026).
//
// Dictado de Alberto: «que aparezcan los datos que tengamos, el resto que no
// aparezca vacío, simplemente no se ve… por ejemplo tramitador no, porque esa
// es función mía».
//
// Traducido: SE OCULTA lo que, si falta, no cambia nada para el cliente; SE
// DICE EN VOZ ALTA lo que sí cambiaría lo que el cliente haría.
//
// 🚫 El tramitador y el perito NO son «un dato que falta»: son GESTIÓN DEL
// CORREDOR. El punto de contacto único es Alberto — el cliente le llama a él,
// no al tramitador de la compañía. Por eso no se pintan en gris ni como
// «pendiente»: no existen ni en el tipo ni en el `select`. Un campo que no se
// pide a la BD es un campo que nadie puede pintar por descuido tres meses
// después, que es exactamente lo que este fichero impide.
//
// ⚠️ Esto NO deroga la regla del CLAUDE.md de la RAÍZ («dato que NO hay ≠ dato
// que NO se ha mirado»): la AFINA para esta app. Quien lea solo uno de los dos
// se lleva la idea contraria, así que están escritos juntos aquí y en
// `apps/asegura-portal/CLAUDE.md`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const LECTURA = 'apps/asegura-portal/lib/cartera-lectura.ts'

const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

test('el fichero de lectura de cartera existe', () => {
  // Un guardián que se salta a sí mismo cuando el fichero no está no es un
  // guardián: es el mismo «no lo he mirado» disfrazado de verde que persigue.
  assert.ok(existsSync(join(ROOT, LECTURA)), `falta ${LECTURA}`)
})

test('la lectura del portal NO trae tramitador ni perito', () => {
  const src = leer(LECTURA)
  for (const campo of ['tramitadorNombre', 'tramitadorTelefono', 'peritoNombre', 'peritoTelefono']) {
    assert.doesNotMatch(
      src,
      new RegExp(campo),
      `${campo} no puede volver a ${LECTURA}: no es un dato que le falte al cliente, ` +
        'es gestión del corredor (contacto único = Alberto). Si vuelve al `select`, ' +
        'vuelve a la vista.',
    )
  }
})

test('lo que SÍ cambia la decisión del cliente sigue llegando', () => {
  // La otra mitad de la regla. Si un día alguien «limpia» también estos, el
  // portal deja de poder decir en voz alta las tres ausencias que importan y
  // se convierte en la máquina de tranquilizar que la regla del NULL prohíbe.
  const src = leer(LECTURA)
  assert.match(src, /fechaVencimiento/, 'sin vencimiento hay que poder decirlo: la fecha tiene que llegar')
  // 📌 Cambió el 05/09/2026: `total` ya NO es `lista.length`. Contaba los
  // anulados, y por eso 20 pólizas de las 110 vivas no pintaban nada de nada —
  // ni el hueco (porque el total era > 0) ni una línea (porque no quedaba
  // ningún recibo que enseñar). Lo que tiene que llegar ahora es el `estado`,
  // que es quien puede decir «no informó» y «informó y está todo anulado» con
  // dos frases distintas.
  assert.match(src, /estado: estadoRecibos\(/, 'el estado de los recibos tiene que llegar: 0 NO es «al corriente»')
  assert.match(src, /total: cobs\.length/, '`coberturas.total` tiene que llegar: 0 NO es «no tiene coberturas»')
})

test('los tres ceros siguen documentados como «no es que esté bien»', () => {
  // El comentario es la mitad del cepo: el número por sí solo no dice que un 0
  // sea un hueco, y es justo lo que se lee mal al pintarlo.
  const src = leer(LECTURA)
  assert.match(src, /NO es «al corriente»/, 'el comentario de los recibos no puede desaparecer')
  assert.match(src, /ninguna cobertura informada/, 'el comentario de coberturas.total no puede desaparecer')
})

test('los siniestros pasan por el NIVEL, como la prima y los recibos', () => {
  // 🚨 Este cepo nace de un agujero REAL (04/09/2026): `prima`, `coberturas` y
  // `recibos` preguntaban por `ve.*` y `siniestrosAbiertos` NO. Un tercero con
  // el alcance más bajo (`ver` → nivel `tarjeta`) veía los siniestros abiertos
  // de quien le autorizó: referencia, estado y fecha. No fallaba nada —salían—,
  // que es el modo de fallo que este portal persigue.
  //
  // 📌 Desde el 05/09/2026 la lectura trae el HISTORIAL entero (los cuatro
  // estados, no solo los abiertos) y `siniestrosAbiertos` se DERIVA de él, así
  // que la guarda tiene que estar en la lectura única. Un siniestro cerrado es
  // igual de personal que uno abierto — si acaso más, porque es un historial.
  const src = leer(LECTURA)
  assert.match(
    src,
    /const historial[^=]*=\s*ve\.siniestros/,
    'la lectura del historial tiene que preguntar por `ve.siniestros` antes de traer nada.',
  )
  assert.match(
    src,
    /siniestrosAbiertos:\s*historial === null \? null : historial\.filter/,
    '`siniestrosAbiertos` se deriva del historial ya filtrado por nivel: si se lee aparte, ' +
      'vuelve a haber dos sitios donde acordarse de la guarda y uno se olvidará.',
  )
  assert.match(
    src,
    /no visible en este nivel.*\n.*siniestrosAbiertos/i,
    'el tipo tiene que declarar que `null` es «no visible en tu nivel» y `[]` «no hay ninguno»: ' +
      'colapsarlos convierte un «no puedo enseñártelo» en un «no tiene».',
  )
})

test('el historial NO trae el `tipo`: es un código numérico de la compañía', () => {
  // 🚨 Medido en la cartera viva el 05/09/2026: `siniestros.tipo` vale `1107`,
  // `1915`, `1312`, `17`, `2102`… Es el código de la compañía, no una palabra.
  // Pintarlo sería peor que no pintar nada: «Tipo 1107» parece un dato que
  // significa algo. El cepo mira el bloque del `select` de siniestros, no el
  // fichero entero, porque `tipo` es también el nombre de la columna del RAMO
  // de una póliza y ahí sí se lee.
  const src = leer(LECTURA)
  const i = src.indexOf('prisma.siniestro.findMany')
  assert.ok(i > 0, 'no encuentro la consulta de siniestros')
  const bloque = src.slice(i, src.indexOf('}),', i))
  assert.doesNotMatch(
    bloque,
    /^\s*tipo:\s*true/m,
    'el `select` de siniestros no puede pedir `tipo` mientras sea un código sin traducir',
  )
})

test('el `estado` de los recibos se calcula sobre la lista CRUDA, no sobre la limpia', () => {
  // 🚨 El corazón del asunto (05/09/2026). Si `estadoRecibos()` recibe la lista
  // ya filtrada de anulados, «todos anulados» es indistinguible de «no hay
  // ninguno» y las 20 pólizas afectadas vuelven a decirle a su dueño que su
  // compañía no informó nada — cuando informó, y todo está anulado. Son dos
  // frases distintas porque son dos cosas distintas.
  const src = leer(LECTURA)
  assert.match(
    src,
    /estado: estadoRecibos\(crudos\)/,
    '`estadoRecibos` tiene que ver los anulados. Con la lista ya limpia no puede distinguir ' +
      '«no informó» de «informó y está todo anulado».',
  )
  assert.match(
    src,
    /const historial = ordenarRecibos\(crudos\)/,
    'la lista del cliente sale de `ordenarRecibos` (que quita anulados y pone lo sin fecha al final), ' +
      'no de un `orderBy` de Prisma: en Postgres `DESC` implica `NULLS FIRST`.',
  )
  assert.match(
    src,
    /fechaEmision: fechaReciboFiable\(/,
    'las fechas pasan por el filtro de centinelas: hay un recibo con `fecha_emision` 0001-01-01, ' +
      'que es un «no lo sé» con forma de dato y se colaría por cualquier guarda de NULL.',
  )
})

test('los recibos NO traen `forma_pago`: es un código del EIAC', () => {
  // 🚨 Medido en la cartera viva el 05/09/2026: vale `CC` (117), `OF` (6) y
  // `TA` (4), y 56 recibos no lo traen. `CC` se adivina, `OF` no. Mismo caso
  // que `siniestros.tipo`: no se pide, así que no hay nada que se pueda colar
  // en pantalla por descuido.
  const src = leer(LECTURA)
  const i = src.indexOf('prisma.polizaRecibo.findMany')
  assert.ok(i > 0, 'no encuentro la consulta de recibos')
  const bloque = src.slice(i, src.indexOf('}),', i))
  assert.doesNotMatch(
    bloque,
    /^\s*formaPago:\s*true/m,
    'el `select` de recibos no puede pedir `formaPago` mientras sea un código sin traducir',
  )
})

test('la pantalla de recibos dice las TRES cosas, y ninguna tranquiliza de más', () => {
  const src = leer('apps/asegura-portal/app/(portal)/boveda/PolizaVista.tsx')
  assert.match(
    src,
    /No significa que estés al corriente/,
    'el hueco de «sin informar» tiene que seguir diciéndolo con todas las letras',
  )
  // 🚨 Contra la RAMA, no contra la palabra: `solo_anulados` sale también en el
  // comentario de la cabecera, así que un `/solo_anulados//` pelado seguiría
  // pasando con el `if` borrado. Ya pasó con otro cepo de este portal.
  assert.match(
    src,
    /if \(r\.estado === 'solo_anulados'\)/,
    'la pantalla tiene que tratar el caso «informó y está todo anulado»: son 20 pólizas de 110, ' +
      'y sin esta rama vuelven a decir «tu compañía no informó nada», que es falso',
  )
  // Y lo que NO puede pasar: que los anulados desaparezcan sin decirlo. El
  // cliente echa cuentas contra su banco, y le faltarían movimientos.
  assert.match(
    src,
    /r\.anulados > 0/,
    'si se ocultan los anulados hay que DECIR que están ahí fuera, no callarlos',
  )
})

// ── La 2ª pasada del extractor: «no lo hemos leído» ≠ «no lo trae» ──────────
//
// Medido en producción el 07/09/2026 con una póliza de auto real: la 1ª pasada
// leyó compañía, número, vencimiento y matrícula; la 2ª —marca, modelo, uso—
// se llevó un `OpenRouter: respuesta vacía` con toda la cadena de suplentes
// apagada. `datosRamo` quedó a NULL y la pantalla dijo «Leída de tu PDF» sin
// una palabra más. Desde fuera eso es indistinguible de una póliza que no trae
// esos datos, y el cliente concluye lo que no es.
//
// Estos cepos afirman la FORMA del arreglo, no el texto: que el estado exista
// con sus tres valores, que el fallo lo produzca (y no se pierda por el camino)
// y que la pantalla lo pinte solo en `no_leidos`.
const EXTRACTOR = 'apps/asegura-portal/lib/extraer-poliza.ts'
const SUBIR = 'apps/asegura-portal/app/(portal)/boveda/SubirPoliza.tsx'
const RUTA_POLIZAS = 'apps/asegura-portal/app/api/polizas/route.ts'

/** Sin comentarios: aquí la prosa explica justo lo que se prohíbe. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

test('🚨 la 2ª pasada tiene TRES estados, no un booleano', () => {
  // Dos estados colapsarían «no había nada que preguntar» con «se preguntó y
  // falló», y la pantalla avisaría de un fallo que no ocurrió en toda póliza de
  // ramo desconocido.
  const src = leer(EXTRACTOR)
  for (const v of ["'leidos'", "'no_leidos'", "'no_aplica'"]) {
    assert.ok(src.includes(v), `falta el estado ${v} de la 2ª pasada`)
  }
})

test('🚨 un fallo de la 2ª pasada devuelve no_leidos, nunca se calla', () => {
  const src = sinComentarios(leer(EXTRACTOR))
  const cuerpo = src.slice(src.indexOf('async function leerDatosRamo'))
  const fin = cuerpo.indexOf('export async function extraerPoliza')
  const fn = fin > 0 ? cuerpo.slice(0, fin) : cuerpo
  // Las DOS salidas de fallo —la IA que lanza y el JSON que no parsea— tienen
  // que marcarlo. Con una sola, la otra sigue siendo muda.
  const marcas = fn.match(/no_leidos/g) ?? []
  assert.ok(
    marcas.length >= 2,
    `las dos ramas de fallo de leerDatosRamo deben devolver 'no_leidos' (encontradas ${marcas.length})`,
  )
})

test('🚨 el estado LLEGA a la respuesta de la ruta, no se queda dentro', () => {
  // Producirlo y no propagarlo es peor que no producirlo: parece hecho.
  const src = sinComentarios(leer(RUTA_POLIZAS))
  assert.match(src, /camposRamo/, 'la ruta /api/polizas no propaga camposRamo')
})

test('🚨 la pantalla avisa SOLO cuando se intentó y falló', () => {
  const src = sinComentarios(leer(SUBIR))
  assert.match(
    src,
    /camposRamo === 'no_leidos'/,
    'SubirPoliza debe condicionar el aviso a no_leidos',
  )
  assert.ok(
    !/camposRamo === 'no_aplica'/.test(src),
    'no se avisa en no_aplica: ahí no había nada que preguntar',
  )
})

test('🚨 la 2ª pasada NO tiene menos presupuesto que la 1ª', () => {
  // Pide MÁS campos y su instrucción es más larga (lleva etiqueta y ayuda de
  // cada campo del catálogo). Quedarse corto la trunca, y una respuesta
  // truncada de OpenRouter no llega a medias: llega VACÍA.
  const src = sinComentarios(leer(EXTRACTOR))
  const topes = [...src.matchAll(/maxTokens:\s*(\d+)/g)].map((m) => Number(m[1]))
  assert.ok(topes.length >= 2, 'se esperan al menos dos llamadas con maxTokens')
  assert.ok(
    Math.min(...topes) >= 600,
    `ninguna pasada puede ir por debajo de 600 tokens (mínimo encontrado: ${Math.min(...topes)})`,
  )
})

// ── Un SUPLEMENTO no es una póliza, y su importe no es la prima anual ───────
//
// Alberto, 07/09/2026, sobre los 55,85 € que el portal guardó como prima anual
// de un auto: «es porque es un suplemento (cambio de vehículo)». O sea, la IA
// no leyó mal el número: leyó bien un número que no es una prima anual y lo
// metió en el campo de la prima anual.
//
// Es «el dato que SÍ está pero se lee mal» del CLAUDE.md de la raíz, que avisa
// de que es PEOR que un hueco: no hay nada que delate el error. 55,85 € llamó
// la atención; 340 € habría pasado, y sobre esa cifra se decide si un seguro
// está caro.
test('🚨 el extractor PREGUNTA qué documento es', () => {
  // Sin la clave en el prompt no hay nada que clasificar, y el `null` que
  // llegaría deja pasar el importe de cualquier papel como prima anual.
  // 🪤 Acotado al ESQUEMA JSON, no al fichero entero: la primera versión de
  // este cepo buscaba `"tipoDocumento"` en todo el fuente y se ponía verde con
  // la clave borrada del esquema, porque la palabra seguía apareciendo en la
  // línea de Reglas. Verde el 100 % de las veces = indistinguible de uno que
  // funciona. Se vio.
  const src = leer(EXTRACTOR)
  const esquema = src.split('\n').find((l) => l.startsWith('{"') && l.includes('"compania"'))
  assert.ok(esquema, 'no se encuentra la línea del esquema JSON de INSTRUCCION')
  assert.match(esquema, /"tipoDocumento"/, 'el esquema JSON debe pedir tipoDocumento')
  for (const t of ['suplemento', 'recibo']) {
    assert.ok(esquema.includes(t), `el esquema debe ofrecer "${t}" como valor`)
    assert.ok(src.includes(t), `el prompt debe explicar qué es "${t}"`)
  }
})

test('🚨 la prima se anula con el helper puro, no con un if a mano', () => {
  // Una segunda copia de la regla en el app diverge del módulo sin que nada
  // falle, y entonces la pantalla avisaría de un suplemento cuya prima sí se
  // guardó — o al revés.
  const src = sinComentarios(leer(EXTRACTOR))
  assert.match(
    src,
    /importeEsPrimaAnual\([^)]*\)\s*\?\s*contrato\.primaAnual\s*:\s*null/,
    'primaAnual debe pasar por importeEsPrimaAnual()',
  )
})

test('🚨 la pantalla avisa cuando el papel no es la póliza', () => {
  // Callarlo deja un «—» en la prima justo después de subir un documento que
  // traía una cifra: se lee como un fallo de lectura nuestro.
  const src = sinComentarios(leer(SUBIR))
  assert.match(src, /avisoDocumentoNoPoliza/, 'SubirPoliza debe pintar el aviso')
})

// ── El armazón es de la marca, no andamio genérico ─────────────────────────
//
// Alberto, 07/09/2026: «el diseño es como un básico fuera de Grupo ASegura, y
// el lateral con las pestañas, y dentro otro diseño». Tenía razón: la barra era
// blanco puro, el suelo del lateral un gris neutro y la pestaña activa gris
// sobre negro — cero marca en todo el marco, mientras la isla de dentro llevaba
// Fraunces, el azul y el radio grande. Dos lenguajes pegados.
//
// Estos cepos protegen las dos REGLAS que sobreviven a cualquier retoque de
// tono, no los valores exactos.
const CSS_PORTAL = 'apps/asegura-portal/app/globals.css'

test('🚨 el nombre de la correduría va en --display, NUNCA en --serif', () => {
  // En esta marca `--serif` ES Inter y el nombre engaña: volver a él pinta
  // «Grupo ASegura» con la misma letra que un menú de sistema, y nada falla.
  // Es la misma trampa que ya documentan el h1 y el h2 de sección.
  const bloque = leer(CSS_PORTAL).split('.marca-nombre {')[1]?.split('}')[0] ?? ''
  assert.match(bloque, /font-family:\s*var\(--display/, '.marca-nombre debe usar --display')
})

/**
 * Todos los bloques declarados para un selector, no el primero.
 *
 * 🪤 La primera versión de los dos cepos de abajo usaba `indexOf`/`lastIndexOf`
 * y se ponía VERDE con el fallo dentro: `.portal-shell` y `.portal-contenido`
 * se declaran varias veces (base + media query de escritorio), y el bloque que
 * salía por sorteo no llevaba la propiedad que se quería vigilar. Sin propiedad
 * no hay nada que comparar y el test pasa. Se vio, y por eso está escrito aquí.
 */
const bloquesDe = (src, sel) => {
  const out = []
  let i = src.indexOf(`${sel} {`)
  while (i !== -1) {
    out.push(src.slice(i, src.indexOf('}', i)))
    i = src.indexOf(`${sel} {`, i + 1)
  }
  return out
}

test('🚨 el armazón NO se tiñe con el azul a plena carga', () => {
  // El azul saturado significa ACCIÓN (botones) y ESTADO (vencida, al cobro).
  // Gastarlo en el decorado del lateral deja el semáforo sin contraste, y el
  // semáforo es el que hay que leer. Se tiñe con mezclas suaves o --brand-soft.
  const src = leer(CSS_PORTAL)
  for (const sel of ['.portal-shell', '.marca-barra']) {
    const fondos = bloquesDe(src, sel)
      .map((b) => b.match(/background:\s*([^;]+);/)?.[1]?.trim())
      .filter(Boolean)
    assert.ok(fondos.length > 0, `${sel} no declara ningún fondo: el cepo no vigila nada`)
    for (const f of fondos) {
      assert.ok(f !== 'var(--brand)', `${sel} no puede llevar --brand a plena carga de fondo`)
    }
  }
})

test('🚨 la isla y sus secciones comparten radio', () => {
  // Con dos radios distintos, la isla y las tarjetas de dentro parecen de dos
  // juegos de piezas — que es justo la sensación de «marco ajeno».
  const src = leer(CSS_PORTAL)
  const radio = (sel) => {
    const rs = bloquesDe(src, sel)
      .map((b) => b.match(/border-radius:\s*calc\(var\(--radius\)\s*\*\s*([\d.]+)\)/)?.[1])
      .filter(Boolean)
    assert.ok(rs.length > 0, `${sel} no declara radio en múltiplo de --radius: el cepo no vigila nada`)
    return rs
  }
  const isla = radio('.portal-contenido')
  const seccion = radio('.seccion')
  for (const r of isla) {
    assert.ok(seccion.includes(r), `la isla usa radio ×${r} y .seccion usa ×${seccion.join('/')}`)
  }
})
