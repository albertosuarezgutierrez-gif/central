// Guardián de la MITAD DE PLATAFORMA de la retarificación.
// `node --test` (gate en CI).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// El 03/09/2026 la correduría se unificó en `apps/plataforma` → `/correduria`,
// la única pantalla que Alberto abre. Hasta entonces, para retarificar, un
// enlace ↗ le sacaba a `apps/asegura` —otro dominio, otra sesión— y **le echaba
// al login**: medido en producción, `GET /cartera/poliza/9588dad8-… → 307
// /login`. La operación se sirve ahora por el puerto de operador y la pantalla
// vive aquí.
//
// `test/regression-puerto-retarificar.test.ts` vigila la PUERTA (el lado de
// asegura: que no se exponga un `GET`, que `confirmado === true` siga siendo
// estricto, que la lógica no se copie). Este vigila al que LLAMA. Son cuatro
// erosiones distintas, y las cuatro dejarían el CI en verde:
//
//   1. **Que se pierda `confirmado: true`.** El puerto responde 400
//      `sin_confirmar` y **el botón deja de hacer nada**: sin ese booleano no se
//      llama a Codeoscopic. Es un `string`/`boolean` en un JSON, así que ni
//      `tsc` ni el build lo ven — solo se notaría pulsando en producción.
//   2. **Que vuelva un enlace de retarificar a `central-asegura.vercel.app`**,
//      que es el bug que este trabajo arregla. Un `<a href>` a otro dominio
//      compila igual de bien.
//   3. **Que un timeout se cuente como «no se ha gastado».** Si la petición
//      expira, la cotización puede haberse creado igualmente en el vendor y el
//      cargo puede existir: decir «no se ha gastado» es afirmar algo que nadie
//      ha comprobado, y encima invita a repetir — y `POST /insurances` no es
//      idempotente, así que un reintento crea otro proyecto y otro cargo.
//   4. **Que `apps/plataforma` importe de `apps/asegura`.** Son dos apps
//      separadas que se comunican por el puerto HTTP y por nada más; un import
//      cruzado rompe el aislamiento y el `Typecheck · plataforma` del CI no
//      puede ni resolver su `@/lib/...`.
//
// Lee el FUENTE a propósito: es la única forma de vigilar decisiones que no
// tienen tipo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname, dirname, resolve, sep } from 'node:path'
// La mitad de este cepo mira el FUENTE (decisiones que no tienen tipo) y la otra
// mitad EJECUTA las piezas puras de las dos orillas del puerto: el saneador de
// asegura y el lector de plataforma. Ninguna toca red ni BD, así que ninguna
// puede gastar un céntimo.
import {
  sanearSupuestos,
  CAMPOS_PERSONALES,
} from '../apps/asegura/lib/codeoscopic/precalificar-publica.ts'
import {
  interpretarPrecalificacion,
  leerConsumo,
} from '../apps/plataforma/lib/retarificar-asegura.ts'

const ROOT = join(import.meta.dirname, '..')

const LIB_PUERTO = 'apps/plataforma/lib/retarificar-asegura.ts'
const ACCIONES = 'apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/acciones.ts'
const PANTALLA = 'apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/retarificador.tsx'
const PAGINA = 'apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/page.tsx'
const FICHA = 'apps/plataforma/lib/ficha-asegura.ts'

function leer(rel: string): string {
  const p = join(ROOT, rel)
  assert.ok(existsSync(p), `falta ${rel}: la pantalla de retarificación de plataforma vive ahí`)
  return readFileSync(p, 'utf8')
}

/** Todos los `.ts`/`.tsx` de un directorio, recursivo. */
function fuentes(rel: string): string[] {
  const raiz = join(ROOT, rel)
  const out: string[] = []
  const anda = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next' || e === 'generated') continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) anda(p)
      else if (['.ts', '.tsx'].includes(extname(e))) out.push(p)
    }
  }
  anda(raiz)
  return out
}

// ─── 1. El cerrojo del dinero ────────────────────────────────────────────────

test('plataforma manda `confirmado: true` (booleano) al pedir la cotización', () => {
  const lib = leer(LIB_PUERTO)

  // El literal exacto. `'true'` o `1` no valen: el puerto compara con `===`.
  assert.match(
    lib,
    /confirmado:\s*true\b/,
    'el cliente del puerto no manda `confirmado: true`. Sin ese booleano exacto el puerto ' +
      'responde 400 `sin_confirmar`, no llama a Codeoscopic y el botón de la pantalla no hace nada.',
  )
  assert.doesNotMatch(
    lib,
    /confirmado:\s*(['"]true['"]|1\b)/,
    '`confirmado` va como el booleano `true`, no como cadena ni como número: el puerto lo compara ' +
      'con `===` a propósito (un `"false"` de un formulario sería una cadena no vacía).',
  )

  // Y va en el cuerpo de la llamada que gasta, no en cualquier sitio del fichero.
  const cuerpo = lib.slice(lib.indexOf('/api/operador/codeoscopic/retarificar'))
  assert.match(
    cuerpo,
    /confirmado:\s*true\b/,
    '`confirmado: true` tiene que ir en el cuerpo del POST a /api/operador/codeoscopic/retarificar.',
  )
})

/** El fuente sin comentarios: aquí se vigila el CÓDIGO, y los comentarios citan
 *  a propósito los nombres que estos detectores buscan (dicen de dónde sale el
 *  contrato y por qué). Vigilar el texto de un comentario obligaría a escribir
 *  peor la explicación, que es justo lo que no queremos. */
function codigo(rel: string): string {
  return leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

test('la confirmación la pone el SERVIDOR, no llega del navegador', () => {
  const acciones = leer(ACCIONES)
  const pantalla = codigo(PANTALLA)

  assert.match(
    acciones,
    /^'use server'/m,
    'las llamadas al puerto viven en una acción de servidor: el Bearer del puerto no puede bajar al navegador.',
  )
  // Si `confirmado` viajara desde el cliente dejaría de ser una afirmación de
  // que alguien ha decidido pagar y pasaría a ser un campo más que se puede
  // perder en un refactor (o llegar puesto desde donde no debe).
  assert.doesNotMatch(
    pantalla,
    /confirmado/,
    'el componente de cliente NO manda `confirmado`: lo pone el servidor, en un solo sitio ' +
      '(`lib/retarificar-asegura.ts`). Si viaja en el cuerpo desde el navegador, deja de ser el cerrojo.',
  )
})

test('el navegador no llama al puerto ni a Codeoscopic por su cuenta', () => {
  const pantalla = codigo(PANTALLA)
  assert.doesNotMatch(
    pantalla,
    /fetch\(/,
    'el componente de cliente no hace `fetch`: todo pasa por las acciones de servidor de ' +
      '`./acciones.ts`, que son las únicas que tienen el secreto del puerto.',
  )
  assert.doesNotMatch(
    pantalla,
    /ASEGURA_OPERADOR_SECRET/,
    'el secreto del puerto NUNCA aparece en un componente de cliente.',
  )
})

// ─── 2. Ya no se sale a asegura para retarificar ─────────────────────────────

test('ningún enlace de plataforma manda a central-asegura para RETARIFICAR auto', () => {
  const ficha = leer(FICHA)

  // `urlRetarificar` es la que consumen las cinco fichas: tiene que devolver la
  // ruta interna. Si vuelve a apuntar al otro dominio, vuelve el 307 al login.
  const bloque = ficha.slice(ficha.indexOf('export function urlRetarificar('))
  const cuerpo = bloque.slice(0, bloque.indexOf('\n}') + 2)
  assert.match(
    cuerpo,
    /\/correduria\/poliza\//,
    '`urlRetarificar()` tiene que devolver la ruta INTERNA `/correduria/poliza/<id>/retarificar`. ' +
      'Apuntando a asegura, Alberto acaba en su login (307 medido en producción el 03/09/2026).',
  )
  assert.doesNotMatch(
    cuerpo,
    /urlAsegura\(\)|central-asegura/,
    '`urlRetarificar()` no puede volver a componer una URL de asegura.',
  )

  // Y ninguna pantalla de la correduría puede saltarse el helper con un literal.
  for (const f of fuentes('apps/plataforma/app/(usuario)/correduria')) {
    const src = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    assert.doesNotMatch(
      src,
      /central-asegura\.vercel\.app/,
      `${f} enlaza a central-asegura a pelo. Los saltos a asegura pasan por un helper de ` +
        '`lib/ficha-asegura.ts` y hoy solo queda uno (hogar, que no está portado).',
    )
  }
})

test('el único salto que queda a asegura es hogar, y está declarado como tal', () => {
  const ficha = leer(FICHA)
  assert.match(
    ficha,
    /export function urlRetarificarHogarAsegura\(/,
    'hogar sigue retarificándose en asegura (su pantalla pide m², año, capitales y Catastro) y ' +
      'ese salto tiene su propio helper, con nombre que lo dice. Si se porta, se borra el helper.',
  )
  const pagina = leer(PAGINA)
  assert.match(
    pagina,
    /ramo === 'hogar'/,
    'la pantalla interna tiene que ramificar por ramo: con hogar manda al sitio donde HOY funciona, ' +
      'en vez de fingir que no se puede retarificar.',
  )
})

// ─── 3. Un timeout NO es prueba de que no se haya gastado ────────────────────

test('el cliente del puerto no colapsa un timeout en «no se ha gastado»', () => {
  const lib = leer(LIB_PUERTO)

  assert.match(
    lib,
    /gastoDesconocido/,
    'la respuesta de error tiene que llevar `gastoDesconocido`: sin ese campo la pantalla no puede ' +
      'distinguir «asegura cortó antes del vendor» de «no sé si nos han cobrado».',
  )

  // El camino de red/timeout: `gastoDesconocido` tiene que ser `true` ahí.
  const i = lib.indexOf('export function porFalloDeRed(')
  assert.ok(i > 0, 'falta `porFalloDeRed()`: es el único sitio que redacta la duda de un timeout.')
  const red = lib.slice(i, lib.indexOf('\n}', i))
  assert.match(
    red,
    /gastoDesconocido:\s*true/,
    'un timeout o un fallo de red deja `gastoDesconocido: true`. La cotización puede haberse creado ' +
      'en el vendor y el cargo puede existir: decir «no se ha gastado» es afirmar lo que nadie ha mirado.',
  )
  assert.doesNotMatch(
    red,
    /no se ha gastado|sin coste|0,00€/,
    'el mensaje de un timeout no puede afirmar que no se ha gastado nada.',
  )

  // El «cero» solo se afirma cuando lo DECLARA asegura (`gastado: '0,00€'`).
  assert.match(
    lib,
    /gastoDeclaradoCero/,
    'el «no se ha gastado» tiene que salir de una afirmación EXPLÍCITA de asegura ' +
      "(`gastado: '0,00€'`, que solo ponen los cortes anteriores al vendor), no de suponerlo.",
  )
})

test('un timeout no dispara un reintento automático', () => {
  for (const [nombre, src] of [
    [LIB_PUERTO, codigo(LIB_PUERTO)],
    [PANTALLA, codigo(PANTALLA)],
  ] as const) {
    assert.doesNotMatch(
      src,
      /reintent(ar|o)\s*\(|setTimeout\([^)]*cotizar|for\s*\([^)]*intento/i,
      `${nombre} parece reintentar la cotización. \`POST /insurances\` NO es idempotente: un ` +
        'reintento crea otro proyecto y otro cargo de 0,50€. Repetir lo decide una persona que ' +
        'antes ha mirado el consumo.',
    )
  }
})

test('el timeout de cotizar es holgado: el del vendor son hasta 150 s', () => {
  const lib = leer(LIB_PUERTO)
  const m = lib.match(/TIMEOUT_COTIZAR_MS\s*=\s*([\d_]+)/)
  assert.ok(m, 'falta `TIMEOUT_COTIZAR_MS` en el cliente del puerto.')
  const ms = Number(m[1].replace(/_/g, ''))
  assert.ok(
    ms >= 150_000,
    `el timeout de cotizar es ${ms} ms y el vendor puede tardar hasta 150 s. Con menos, la ` +
      'petición muere por reloj mientras el cargo se produce igual: el peor de los dos mundos.',
  )

  // Y la página que hospeda las acciones de servidor tiene que aguantar más.
  const pagina = leer(PAGINA)
  const md = pagina.match(/maxDuration\s*=\s*(\d+)/)
  assert.ok(md, 'la página tiene que declarar `maxDuration`: las acciones de servidor corren en su segmento.')
  assert.ok(
    Number(md[1]) * 1000 > ms,
    `\`maxDuration\` (${md[1]} s) tiene que superar al timeout del cliente (${ms} ms) para que el ` +
      'que corte sea el reloj que sabe redactar la duda, y no la plataforma en seco.',
  )
})

// ─── 4. Las dos apps se hablan por el puerto, y por nada más ─────────────────

test('apps/plataforma no importa nada de apps/asegura', () => {
  // Dos formas de romper el aislamiento, y la segunda es la que se cuela sola:
  //   - por ruta explícita  (`.../apps/asegura/lib/...`, `@asegura/...`)
  //   - por ruta RELATIVA que se sale de la app (`../../asegura/lib/...`), que
  //     no contiene la cadena «apps/asegura» por ninguna parte.
  // Por eso el segundo caso se comprueba RESOLVIENDO el especificador: lo que
  // se prohíbe es salirse de `apps/plataforma`, venga escrito como venga.
  const APP = join(ROOT, 'apps/plataforma')
  const ESPECIFICADOR = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g

  for (const f of fuentes('apps/plataforma/lib').concat(
    fuentes('apps/plataforma/app/(usuario)/correduria'),
  )) {
    // Se citan por su ruta en los COMENTARIOS a propósito (dicen de dónde sale
    // el contrato); lo que no puede haber es un import de verdad.
    const src = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

    for (const m of src.matchAll(ESPECIFICADOR)) {
      const spec = m[1]
      const porque =
        `${f} importa «${spec}», que sale de apps/plataforma. Son dos apps separadas: se ` +
        'comunican por el puerto HTTP `/api/operador/*` y por nada más. Lo compartido de verdad ' +
        'vive en `packages/@central/*`.'

      assert.doesNotMatch(spec, /(^|\/)apps\/asegura(\/|$)|^@asegura\//, porque)

      if (spec.startsWith('.')) {
        const destino = resolve(dirname(f), spec)
        assert.ok(destino.startsWith(APP + sep), porque)
      }
    }
  }
})

test('los detectores no son un adorno: reconocen lo que buscan', () => {
  // Si estas comprobaciones se rompieran, los tests de arriba pasarían sobre
  // cualquier cosa. Se prueban contra ficheros inventados.
  const conCadena = `body: JSON.stringify({ confirmado: 'true' })`
  assert.match(conCadena, /confirmado:\s*(['"]true['"]|1\b)/, 'el detector de `confirmado` como cadena no funciona')

  const sinDuda = `return { gastoDesconocido: false, mensaje: 'no se ha gastado nada' }`
  assert.match(sinDuda, /no se ha gastado/, 'el detector de la afirmación prohibida no funciona')

  // Las dos formas de cruzar la frontera, y las dos tienen que caer.
  assert.match('../../apps/asegura/lib/codeoscopic/cotizar', /(^|\/)apps\/asegura(\/|$)/,
    'el detector de imports cruzados por ruta explícita no funciona')
  assert.ok(
    !resolve('/x/apps/plataforma/lib', '../../asegura/lib/catalogos').startsWith('/x/apps/plataforma' + sep),
    'el detector de imports cruzados por ruta relativa no funciona',
  )
})

// ─── 5. La precalificación: gratis, sin CP, y con los tres estados ───────────
//
// El 03/09/2026 la mudanza de la pantalla a plataforma dejó una regresión: el
// puerto servía catálogos y cotización pero NO la precalificación de la póliza,
// así que la pantalla abría con `vehiculo={null}` y se perdía la preselección de
// marca y modelo — sobre pólizas que SÍ traen las dos. Se tapó con un campo
// manual de código postal, que era peor: hacía teclear un dato que la ficha ya
// tiene Y sacaba por la puerta de atrás justo el dato personal que
// `apps/asegura/CLAUDE.md` mantiene dentro.
//
// Estas cuatro erosiones dejarían el CI en verde y ninguna daría un error de
// tipos:
//   1. Que la ruta de precalificación acabe llamando al embudo de pago. Es un
//      `GET`: un prefetch del navegador dispararía el cargo.
//   2. Que el código postal (o el DNI, o el teléfono) vuelva a cruzar el puerto,
//      sea como campo o escondido dentro de un supuesto.
//   3. Que reaparezca la caja de código postal en la pantalla.
//   4. Que `vehiculo`/`faltan`/`municipios` vuelvan a estar clavados a `null`,
//      `[]` o `false` en vez de venir del puerto.

const RUTA_PRECAL = 'apps/asegura/app/api/operador/codeoscopic/precalificar/route.ts'
const SANEADOR = 'apps/asegura/lib/codeoscopic/precalificar-publica.ts'

/** Nombres de campo que NO pueden aparecer en lo que la ruta PUBLICA. */
const PERSONALES = /codigoPostal|cpResidencia|cpCirculacion|direccion|\bdni\b|telefono|fechaNacimiento|fechaCarnet/i

/**
 * Las líneas de la ruta que nombran un dato personal del tomador.
 *
 * Se hace por LÍNEAS y con lista blanca, no recortando «el payload», porque
 * recortar es frágil: el primer intento cogía desde el último
 * `NextResponse.json(` del fichero y ese resultó ser el helper `error()`, que va
 * DESPUÉS de la respuesta de éxito — el detector daba verde con el código postal
 * publicado dentro. Se comprobó rompiéndolo a propósito, y por eso está así.
 *
 * La lista blanca es EXACTAMENTE el camino por el que el CP puede aparecer: se
 * lee de la ficha y entra en `municipiosPorCp`. Cualquier otra línea que nombre
 * un dato personal es una fuga.
 */
function lineasConDatoPersonal(src: string): string[] {
  const PERMITIDAS = [
    /const\s+cpTomador\s*=\s*origen\.cliente\.codigoPostal/,
    /municipiosPorCp\s*\(/,
  ]
  return src
    .split('\n')
    .filter((l) => PERSONALES.test(l))
    .filter((l) => !PERMITIDAS.some((ok) => ok.test(l)))
}

test('la ruta de precalificación NO llama al embudo de pago', () => {
  const src = codigo(RUTA_PRECAL)

  assert.match(
    src,
    /export\s+async\s+function\s+GET\b/,
    'la precalificación es un GET: es una lectura y tiene que poder pedirse antes de que nadie ' +
      'decida pagar 0,50€.',
  )
  // 🚨 Lo mismo que vigila `test/regression-asegura-gasto-codeoscopic.test.ts` en
  // el otro sentido: una ruta que llame al embudo NO puede exponer un GET. Aquí
  // se fija por la otra punta — esta ruta expone GET, luego no puede gastar.
  assert.doesNotMatch(
    src,
    /\bcotizar\s*\(/,
    'la ruta de precalificación NO puede llamar a la función que paga. Expone un `GET`, así que un ' +
      'prefetch del navegador, un bot o un reintento dispararían el cargo de 0,50€.',
  )
  assert.doesNotMatch(
    src,
    /export\s+(async\s+)?function\s+POST\b/,
    'esta ruta solo lee: no expone POST.',
  )

  // Los catálogos que consulta son GET del vendor y no cuestan nada, así que
  // corre con el interruptor de tarificación apagado, como `/lineas` y `/catalogos`.
  assert.match(
    src,
    /ignorarInterruptor:\s*true/,
    'la precalificación se resuelve con el interruptor de tarificación APAGADO: saber qué falta ' +
      'tiene que poder hacerse antes de encender nada.',
  )
  assert.match(
    src,
    /gastado:\s*'0,00€'/,
    "toda respuesta de esta ruta declara `gastado: '0,00€'`: es la afirmación EXPLÍCITA de que no " +
      'se ha llamado al vendor, y es la única señal que el cliente del puerto acepta como «cero».',
  )
})

test('el código postal y la dirección del tomador NO cruzan el puerto', () => {
  const src = codigo(RUTA_PRECAL)

  // (a) Lo que se publica. `pre.datos` lleva DNI, teléfono, nacimiento y los DOS
  // códigos postales: no puede salir ni entero ni por partes.
  assert.doesNotMatch(
    src,
    /pre\.datos/,
    '`precalificarAuto()` devuelve `datos` con DNI, teléfono, fecha de nacimiento y el código ' +
      'postal del tomador. Eso NO cruza el puerto: de la precalificación solo salen `faltan` y ' +
      '`supuestos` (saneados) — ver `apps/asegura/CLAUDE.md`.',
  )
  assert.deepEqual(
    lineasConDatoPersonal(src),
    [],
    'la ruta nombra un dato personal del tomador fuera del único camino permitido (leer el CP para ' +
      'resolver los municipios). Lo que la cotización necesita NO es el CP: es el id de municipio ' +
      'del catálogo del vendor, que no es personal — por eso asegura hace CP → municipios por dentro ' +
      'y publica solo la lista. Ver `apps/asegura/CLAUDE.md`: DNI, IBAN y dirección no cruzan el puerto.',
  )

  // (b) El CP entra en el resolvedor de municipios y en ningún otro sitio.
  assert.match(
    src,
    /municipiosPorCp\s*\(/,
    'asegura tiene que resolver el CP → municipios por dentro: es lo que permite que el CP se ' +
      'quede en casa y que la pantalla no se lo pida a nadie.',
  )

  // (c) La fuga escondida: los supuestos llevan el CP dentro
  // (`{campo:'cpCirculacion', valor:<el CP>}`), así que publicarlos crudos lo
  // sacaría igual, sin que nada fallase.
  assert.match(
    src,
    /sanearSupuestos\s*\(/,
    'los supuestos se publican SANEADOS: uno de ellos («el coche circula donde vive el tomador») ' +
      'lleva el código postal como valor. Publicar `pre.supuestos` a pelo lo sacaría por la ' +
      'puerta de atrás.',
  )
})

test('el saneador oculta el valor personal pero NO borra el supuesto', () => {
  const supuestos = sanearSupuestos([
    { campo: 'cpCirculacion', valor: '41003', porque: 'se supone que el coche circula donde vive el tomador' },
    { campo: 'kmAnuales', valor: 15000, porque: 'la ficha no recoge los kilómetros al año' },
    { campo: 'aniosSinSiniestros', valor: 3, porque: 'no consta ningún siniestro', optimista: true },
  ])

  // El valor se queda en casa…
  assert.equal(supuestos.length, 3, 'un supuesto sobre un dato personal se OCULTA, no se borra: es ' +
    'letra pequeña del precio, y esconderlo cambiaría una fuga por un silencio.')
  assert.equal(supuestos[0].valor, null)
  assert.equal(supuestos[0].oculto, true)
  assert.equal(supuestos[0].porque, 'se supone que el coche circula donde vive el tomador')

  // …y no aparece en NINGÚN sitio de lo que viaja.
  assert.doesNotMatch(
    JSON.stringify(supuestos),
    /41003/,
    'el código postal no puede aparecer en lo que sale por el puerto, ni siquiera como valor de un supuesto.',
  )

  // Lo que no es personal viaja entero, con su marca de optimista normalizada.
  assert.equal(supuestos[1].valor, 15000)
  assert.equal(supuestos[1].oculto, undefined)
  assert.equal(supuestos[1].optimista, false, '`optimista` viaja SIEMPRE como booleano: si solo se ' +
    'mandara cuando es `true`, una pantalla no podría distinguir «no lo es» de «no me lo han mandado».')
  assert.equal(supuestos[2].optimista, true)

  // Y los dos códigos postales están tapados: son el mismo dato escrito dos veces.
  for (const c of ['cpResidencia', 'cpCirculacion', 'dni', 'telefono', 'fechaNacimiento']) {
    assert.ok(
      CAMPOS_PERSONALES.has(c),
      `«${c}» tiene que estar en CAMPOS_PERSONALES: su valor es un dato personal del tomador.`,
    )
  }
})

test('la pantalla ya NO pide el código postal a mano', () => {
  const pantalla = codigo(PANTALLA)

  assert.doesNotMatch(
    pantalla,
    /id="cp"/,
    'la caja de código postal se retiró: el CP no cruza el puerto y NO hace falta que lo haga — ' +
      'la cotización necesita el id de municipio, que asegura ya resuelve y publica. Pedírselo a ' +
      'Alberto era hacerle teclear un dato que la ficha tiene y sacarlo igual por otra vía.',
  )
  assert.doesNotMatch(pantalla, /setCp\s*\(/, 'no queda estado de código postal en la pantalla.')
  assert.doesNotMatch(
    pantalla,
    /tipo=municipios/,
    'los municipios llegan ya resueltos en la precalificación: la pantalla no los pide por CP.',
  )

  // Y siguen distinguiéndose los tres estados de la lista.
  assert.match(
    pantalla,
    /municipios\s*===\s*null/,
    'la pantalla tiene que distinguir `null` («no se ha podido mirar») de `[]` («se ha mirado y no ' +
      'hay»): un desplegable vacío por un fallo diría que el tomador no tiene municipio.',
  )
})

test('la pantalla recibe la precalificación del puerto, no valores clavados', () => {
  const pagina = codigo(PAGINA)

  assert.match(
    pagina,
    /precalificacionAsegura\s*\(/,
    'la página pide la precalificación al puerto: es lo que devuelve marca y modelo preseleccionados ' +
      'desde la ficha, y su ausencia era la regresión que dejó la mudanza.',
  )

  // Los cinco props que estaban clavados. Ninguno puede volver a estarlo.
  for (const [malo, porque] of [
    [/vehiculo=\{null\}/, '`vehiculo` viene del puerto: clavarlo a `null` es lo que dejaba marca y modelo sin preseleccionar.'],
    [/faltanInicial=\{null\}/, '`faltan` viene del puerto. (Sigue pudiendo llegar `null` si la precalificación falla, pero eso lo decide la respuesta, no el JSX.)'],
    [/municipios=\{\[\]\}/, '`[]` diría «se ha mirado y el tomador no tiene municipio». Los municipios llegan resueltos del puerto.'],
    [/estadoCivilAuto=\{null\}/, 'el estado civil emparejado viene del puerto.'],
    [/fechaMatriculacion=\{null\}/, 'la fecha de matriculación viene del puerto.'],
    [/simulacion=\{false\}/, 'el interruptor de simulación lo publica el puerto; `false` es el valor por defecto ANTE LA DUDA, no una constante.'],
  ] as const) {
    assert.doesNotMatch(pagina, malo, porque)
  }

  assert.match(pagina, /vehiculo=\{pre\?\.vehiculo/, 'el vehículo sale de la precalificación.')
  assert.match(pagina, /municipios=\{pre\?\.municipios/, 'los municipios salen de la precalificación.')

  // 🚨 Y la regla del dinero NO se relaja: que un precio CONCRETO sea simulado lo
  // decide el campo `simulado` de la RESPUESTA de cotizar, nunca esta prop.
  const lib = codigo(LIB_PUERTO)
  assert.match(
    lib,
    /const\s+simulado\s*=\s*r\.simulado\s*===\s*true/,
    'que un precio sea simulado se decide con la RESPUESTA de cotizar (`simulado` + `projectId` ' +
      'negativo), no con la prop de la pantalla. La duda sobre el dinero se resuelve hacia «esto cuesta».',
  )
})

test('el lector del puerto conserva los tres estados de la precalificación', () => {
  // `null` sobrevive: `[]` diría «revisado y no falta nada» y encendería el botón.
  const sinRevisar = interpretarPrecalificacion(200, { estado: 'ok', ramo: 'hogar', precalificado: false })
  assert.equal(sinRevisar.estado, 'ok')
  assert.equal(sinRevisar.estado === 'ok' ? sinRevisar.pre.faltan : 'x', null)
  assert.equal(sinRevisar.estado === 'ok' ? sinRevisar.pre.municipios : 'x', null)
  assert.equal(sinRevisar.estado === 'ok' ? sinRevisar.pre.vehiculo : 'x', null)

  // `[]` es otra cosa: se ha revisado y no falta nada.
  const revisado = interpretarPrecalificacion(200, {
    estado: 'ok',
    ramo: 'auto',
    precalificado: true,
    faltan: [],
    municipios: [{ id: '41091', nombre: 'SEVILLA' }],
    vehiculo: { marca: 'SMART', modelo: 'FORFOUR', versiones: [{ version: 'FORFOUR PURE 1.1', procedencia: 'póliza 123' }] },
    estadoCivil: { id: 'Married', nombre: 'Casado' },
    fechaMatriculacion: '2009-04-09',
    supuestos: [{ campo: 'cpCirculacion', valor: null, porque: 'vive ahí', optimista: false, oculto: true }],
    consumo: { veredicto: { permitido: true, restantesHoy: 4, restantesMes: 40 }, gastadoMes: '8,00€' },
  })
  assert.equal(revisado.estado, 'ok')
  if (revisado.estado !== 'ok') return
  assert.deepEqual(revisado.pre.faltan, [])
  assert.deepEqual(revisado.pre.municipios, [{ id: '41091', nombre: 'SEVILLA' }])
  assert.equal(revisado.pre.vehiculo?.marca, 'SMART')
  assert.equal(revisado.pre.vehiculo?.modelo, 'FORFOUR')
  assert.equal(revisado.pre.vehiculo?.versiones.length, 1)
  assert.equal(revisado.pre.estadoCivil?.id, 'Married')
  assert.equal(revisado.pre.fechaMatriculacion, '2009-04-09')
  assert.equal(revisado.pre.consumo.estado, 'ok')
  assert.equal(revisado.pre.supuestos[0].oculto, true)

  // 🚨 Sin marca de simulación se cuenta como REAL: la duda sobre el dinero
  // siempre se resuelve hacia «esto cuesta».
  assert.equal(revisado.pre.simulacion, false)
  const simulando = interpretarPrecalificacion(200, { estado: 'ok', ramo: 'auto', simulacion: true })
  assert.equal(simulando.estado === 'ok' ? simulando.pre.simulacion : null, true)
  const casi = interpretarPrecalificacion(200, { estado: 'ok', ramo: 'auto', simulacion: 'true' })
  assert.equal(
    casi.estado === 'ok' ? casi.pre.simulacion : null,
    false,
    "solo el booleano `true` enciende el rótulo de simulación: un `'true'` de cadena dejaría creer " +
      'que un cargo real no se ha pagado.',
  )

  // Y los estados que NO son «ok» no se degradan a una precalificación vacía.
  assert.equal(interpretarPrecalificacion(401, {}).estado, 'error')
  assert.equal(interpretarPrecalificacion(503, { estado: 'sin_configurar', mensaje: 'apagado' }).estado, 'sin_configurar')
  assert.equal(interpretarPrecalificacion(502, { estado: 'error', causa: 'credenciales' }).estado, 'error')
  const conCausa = interpretarPrecalificacion(502, { estado: 'error', causa: 'credenciales' })
  assert.match(
    conCausa.estado === 'error' ? conCausa.mensaje : '',
    /contraseña/,
    'la `causa` que clasifica `error-cartera.ts` tiene que traducirse a la frase que dice DÓNDE mirar.',
  )
  assert.equal(interpretarPrecalificacion(200, null).estado, 'error')
})

test('el consumo llega con sus tres estados, y una respuesta rara no permite nada', () => {
  assert.equal(leerConsumo({ error: 'no se pudo leer el libro' }).estado, 'error')
  assert.equal(leerConsumo({ veredicto: { permitido: true, restantesHoy: 3, restantesMes: 30 }, gastadoMes: '5,00€' }).estado, 'ok')
  // 🚨 Ni «quedan 0» ni un veredicto permisivo inventado: «no se ha podido mirar».
  assert.equal(leerConsumo(null).estado, 'no_disponible')
  assert.equal(leerConsumo({ veredicto: 'sí' }).estado, 'no_disponible')
})

test('los detectores de la precalificación reconocen lo que buscan', () => {
  // Si estos se rompieran, los tests de arriba pasarían sobre cualquier cosa.
  assert.deepEqual(
    lineasConDatoPersonal(
      ['  const cpTomador = origen.cliente.codigoPostal', '      codigoPostal: cpTomador,'].join('\n'),
    ),
    ['      codigoPostal: cpTomador,'],
    'el detector de datos personales tiene que dejar pasar la lectura del CP y cazar su publicación. ' +
      '(La primera versión recortaba «el payload» por el último NextResponse.json y cogía el helper ' +
      '`error()`, que va después: daba verde con el CP publicado.)',
  )
  assert.match('  const r = await cotizar(p.peticion)', /\bcotizar\s*\(/, 'el detector del embudo de pago no funciona')
  assert.match('<input id="cp" maxLength={5} />', /id="cp"/, 'el detector de la caja de código postal no funciona')
  assert.match('vehiculo={null}', /vehiculo=\{null\}/, 'el detector del vehículo clavado no funciona')
})
