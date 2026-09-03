// Guardián del PUERTO que gasta dinero: `/api/operador/codeoscopic/*`.
// `node --test` (gate en CI).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// El 03/09/2026 la correduría se unificó en `apps/plataforma` → `/correduria`,
// la única pantalla que Alberto abre. Hasta entonces, para retarificar saltaba
// a `apps/asegura` por un enlace ↗ y **le echaba al login**: son dos apps con
// sesiones separadas. La solución fue servir la operación por el puerto de
// operador… y eso cambió quién puede gastar.
//
// `lib/operador.ts` autoriza **solo por un Bearer compartido y no distingue
// método**. Hasta ese día el puerto leía la cartera y escribía en NUESTRA base
// (clientes, siniestros, documentos): nada de lo que había ahí gastaba dinero
// en un tercero. `POST /api/operador/codeoscopic/retarificar` sí: 0,50€ reales
// por llamada, con credenciales de producción y sin sandbox.
//
// Lo que este cepo persigue no es un bug de lógica, es la erosión:
//   - que alguien exponga un `GET` en esa ruta (un prefetch la dispararía);
//   - que se pierda la confirmación explícita, que es lo que sustituye a la
//     pantalla de confirmación que daba la sesión propia de asegura;
//   - que la lógica que gasta se COPIE en la ruta nueva en vez de compartirse:
//     dos copias divergen, y la que diverge es la que nadie mira;
//   - que la ruta de catálogos —que es gratis— acabe cotizando.
//
// Complementa a `test/regression-asegura-gasto-codeoscopic.test.ts`, que vigila
// el embudo del vendor. Este vigila la PUERTA.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

const RUTA_GASTA = 'apps/asegura/app/api/operador/codeoscopic/retarificar/route.ts'
const RUTA_CATALOGOS_PUERTO = 'apps/asegura/app/api/operador/codeoscopic/catalogos/route.ts'
const RUTA_GASTA_SESION = 'apps/asegura/app/api/cartera/polizas/[polizaId]/retarificar/route.ts'
const RUTA_CATALOGOS_SESION = 'apps/asegura/app/api/cartera/catalogos/route.ts'
const LIB_COMPARTIDO = 'apps/asegura/lib/retarificar-cartera.ts'

function fuente(f: string): string {
  const p = join(ROOT, f)
  assert.ok(existsSync(p), `falta ${f}: o se ha movido, o este guardián se ha quedado ciego`)
  return readFileSync(p, 'utf8')
}

/**
 * El código sin comentarios ni cadenas de texto. Sin esto, un cepo que busca
 * `cotizar(` se dispara con la frase «pasa por `cotizar()`» de una cabecera —
 * y un guardián que da falsos positivos acaba desactivado, que es peor que no
 * tenerlo.
 */
function codigo(f: string): string {
  return fuente(f)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
}

/** ¿Exporta este fichero un manejador HTTP con ese verbo? */
function exportaVerbo(src: string, verbo: string): boolean {
  return new RegExp(`export\\s+(async\\s+)?function\\s+${verbo}\\b`).test(src)
}

/** ¿Importa este fichero la orquestación compartida? */
function importaLibCompartido(src: string): boolean {
  return /from ['"]@\/lib\/retarificar-cartera['"]/.test(src)
}

// ─── 1. La ruta que gasta no responde a GET ──────────────────────────────────

test('la ruta del puerto que GASTA no expone un GET: un prefetch costaría 0,50€', () => {
  const src = fuente(RUTA_GASTA)
  assert.ok(exportaVerbo(src, 'POST'), 'la ruta que gasta tiene que ser un POST')
  for (const verbo of ['GET', 'HEAD']) {
    assert.ok(
      !exportaVerbo(src, verbo),
      `${RUTA_GASTA} exporta ${verbo}. Esta ruta cuesta 0,50€ por llamada: un prefetch del ` +
        'navegador, un bot o un reintento dispararían el cargo.',
    )
  }
})

// ─── 2. La confirmación explícita del gasto ──────────────────────────────────

test('la ruta del puerto EXIGE `confirmado === true` estricto antes de gastar', () => {
  const src = fuente(RUTA_GASTA)

  // Estricto a propósito: `"false"` es una cadena no vacía y sería `true` en
  // cualquier comprobación laxa; `1` también. El sustituto de la pantalla de
  // confirmación tiene que ser una afirmación, no un valor camelable.
  assert.ok(
    /confirmado\s*!==\s*true/.test(src),
    'no se ve la comprobación `cuerpo.confirmado !== true`. Ese campo es lo único que sustituye ' +
      'a la pantalla de confirmación que daba la sesión propia de asegura: sin él, quien tenga el ' +
      'Bearer gasta 0,50€ sin decir que quiere gastarlos.',
  )
  assert.ok(
    !/confirmado\s*(==|!=)[^=]/.test(src),
    'la comprobación de `confirmado` tiene que ser estricta (=== / !==): con == , "true" y 1 ' +
      'colarían un cargo.',
  )
  assert.ok(
    /causa:\s*'sin_confirmar'/.test(src),
    "el rechazo tiene que llevar `causa: 'sin_confirmar'`: es lo que la pantalla distingue de un " +
      'fallo de verdad.',
  )
  assert.ok(
    /status:\s*400/.test(src),
    'una llamada sin confirmar se rechaza con 400, no se intenta y no se cobra',
  )

  // La guarda va ANTES de llamar a la orquestación: comprobarla después sería
  // haber leído la cartera —y, peor, haber podido llegar al vendor— ya.
  // Sobre el código sin comentarios: las cabeceras de la ruta nombran las tres
  // cosas y falsearían el orden.
  const cod = codigo(RUTA_GASTA)
  const iGuarda = cod.indexOf('confirmado !== true')
  const iLlamada = cod.indexOf('prepararRetarificacion(')
  const iCotizar = cod.indexOf('await cotizar(')
  assert.ok(iGuarda > -1 && iLlamada > -1 && iCotizar > -1, 'faltan la guarda o las llamadas')
  assert.ok(
    iGuarda < iLlamada && iGuarda < iCotizar,
    'la comprobación de `confirmado` tiene que ir ANTES de prepararRetarificacion() y, sobre todo, ' +
      'antes de cotizar()',
  )
})

// ─── 3. Una sola copia de la lógica que gasta ────────────────────────────────

test('las DOS rutas de retarificación comparten lib/retarificar-cartera.ts', () => {
  for (const f of [RUTA_GASTA, RUTA_GASTA_SESION]) {
    assert.ok(
      importaLibCompartido(fuente(f)),
      `${f} no importa @/lib/retarificar-cartera. Dos copias de la lógica que gasta dinero ` +
        'divergen, y la que diverge es la que nadie mira.',
    )
  }
})

test('ninguna de las dos rutas vuelve a construir la petición por su cuenta', () => {
  // Lo que NO puede reaparecer en una ruta: el mapeo de la cartera, la revisión
  // previa y el constructor del cuerpo del vendor. Todo eso vive en el lib
  // compartido; verlo en una ruta es que se ha vuelto a copiar.
  const prohibido = [
    'construirPeticionAuto',
    'construirPeticionHogar',
    'revisarDatosAuto',
    'revisarDatosHogar',
    'precalificarAuto',
    'precalificarHogarCartera',
    'origenRetarificacion(',
    'correduriaUnica(',
    'resumirCotizacion(',
  ]
  for (const f of [RUTA_GASTA, RUTA_GASTA_SESION]) {
    const src = codigo(f)
    const reincidencias = prohibido.filter((p) => src.includes(p))
    assert.deepEqual(
      reincidencias,
      [],
      `${f} vuelve a hacer por su cuenta lo que ya hace lib/retarificar-cartera.ts: ` +
        `${reincidencias.join(', ')}. La diferencia entre las dos rutas tiene que ser SOLO quién ` +
        'autoriza, de dónde sale solicitadoPor y la línea que llama a cotizar().',
    )
    // Y sí llaman a las dos mitades del lib, no a una y media.
    for (const debe of ['prepararRetarificacion(', 'respuestaRetarificacion(']) {
      assert.ok(src.includes(debe), `${f} tiene que llamar a ${debe} del lib compartido`)
    }
  }

  // Y el lib es de verdad el que lo hace, no un envoltorio vacío.
  const lib = fuente(LIB_COMPARTIDO)
  for (const p of ['construirPeticionAuto', 'construirPeticionHogar', 'origenRetarificacion(']) {
    assert.ok(lib.includes(p), `lib/retarificar-cartera.ts debería contener «${p}»`)
  }
})

test('la línea que PAGA sigue escrita en la ruta, no escondida en el lib', () => {
  // No es cosmética: `test/regression-asegura-gasto-codeoscopic.test.ts` marca
  // las rutas que gastan buscando `cotizar(` **en el fichero de la ruta**, y con
  // eso les prohíbe exponer un `GET`. Si el embudo se metiera dentro del lib
  // compartido, aquel guardián seguiría en verde sin vigilar ninguna ruta: el
  // fallo más caro que hay, uno que se pone verde porque ya no mira nada.
  for (const f of [RUTA_GASTA, RUTA_GASTA_SESION]) {
    const src = codigo(f)
    assert.ok(
      /\bcotizar\s*\(/.test(src) && /from ['"][^'"]*codeoscopic\/cotizar['"]/.test(fuente(f)),
      `${f} tiene que llamar a cotizar() importado de @/lib/codeoscopic/cotizar. Moverlo al lib ` +
        'compartido dejaría CIEGO al guardián de gasto, que reconoce las rutas que pagan por esa ' +
        'llamada.',
    )
  }
  // El lib prepara y redacta, pero NO paga: si algún día llamara él, la frase
  // de arriba dejaría de ser cierta y habría dos caminos al dinero.
  assert.ok(
    !/\bcotizar\s*\(/.test(
      readFileSync(join(ROOT, LIB_COMPARTIDO), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' '),
    ),
    'lib/retarificar-cartera.ts no debe llamar a cotizar(): solo prepara la petición y redacta la ' +
      'respuesta. La llamada que paga vive en la ruta, junto a la autorización.',
  )
})

test('las dos rutas de catálogos comparten el mismo resolutor', () => {
  for (const f of [RUTA_CATALOGOS_PUERTO, RUTA_CATALOGOS_SESION]) {
    const src = fuente(f)
    assert.ok(
      importaLibCompartido(src) && /\bresolverCatalogo\s*\(/.test(codigo(f)),
      `${f} tiene que resolver los catálogos con resolverCatalogo() del lib compartido: una copia ` +
        'del switch que se quedara sin onlyPopular=false, o sin exigir el combustible en las ' +
        'versiones, no daría error — daría una lista recortada.',
    )
    assert.ok(
      !/\bmarcas\s*\(config/.test(codigo(f)) && !/\blineasDeSeguro\s*\(/.test(codigo(f)),
      `${f} vuelve a llamar a los catálogos del vendor por su cuenta`,
    )
  }
})

// ─── 4. Los catálogos del puerto son GRATIS ──────────────────────────────────

test('la ruta de catálogos del puerto NO cotiza: es gratis y tiene que seguir siéndolo', () => {
  const src = codigo(RUTA_CATALOGOS_PUERTO)
  assert.ok(
    !/\bcotizar\s*\(/.test(src),
    `${RUTA_CATALOGOS_PUERTO} llama a cotizar(). Los catálogos son consultas gratuitas y se ` +
      'resuelven con el interruptor de tarificación apagado: elegir marca y modelo tiene que ' +
      'poder hacerse antes de decidir pagar.',
  )
  assert.ok(
    !/metodo:\s*'POST'/.test(src),
    'los catálogos son GET del vendor: un POST ahí sería una cotización disfrazada',
  )
})

// ─── 5. Las dos rutas del puerto exigen el Bearer ────────────────────────────

test('las dos rutas nuevas del puerto autorizan antes de hacer nada', () => {
  for (const f of [RUTA_GASTA, RUTA_CATALOGOS_PUERTO]) {
    const src = fuente(f)
    assert.ok(
      /operadorAutorizado\(req\)/.test(src),
      `${f} no comprueba operadorAutorizado(req)`,
    )
    const iAuth = src.indexOf('operadorAutorizado(req)')
    const iCuerpo = Math.min(
      ...[src.indexOf('req.json('), src.indexOf('new URL(req.url)')].filter((i) => i > -1),
    )
    assert.ok(
      iAuth < iCuerpo,
      `${f} lee la petición antes de autorizar`,
    )
  }
})

// ─── El cepo se prueba a sí mismo ────────────────────────────────────────────

test('los detectores no son un adorno: reconocen lo que buscan', () => {
  // `codigo()` tiene que borrar comentarios y cadenas, o el cepo de arriba se
  // dispararía con la propia cabecera de las rutas (que hablan de cotizar()).
  // Se prueba sobre el fichero de ESTE test, que contiene las tres formas.
  const limpio = codigo('test/regression-puerto-retarificar.test.ts')
  assert.ok(
    !limpio.includes('// Guardián del PUERTO'),
    'codigo() no ha borrado los comentarios de línea',
  )
  assert.ok(!limpio.includes('sin_confirmar'), 'codigo() no ha vaciado las cadenas')
  assert.ok(limpio.includes('assert.ok('), 'codigo() se ha llevado por delante el código')

  assert.ok(exportaVerbo('export async function GET(req: Request) {}', 'GET'))
  assert.ok(exportaVerbo('export function POST() {}', 'POST'))
  assert.ok(!exportaVerbo('export async function POST() {}', 'GET'))
  // Un comentario que hable de GET no debe contar como una exportación.
  assert.ok(!exportaVerbo('// no exportamos GET aquí\nexport async function POST() {}', 'GET'))

  assert.ok(importaLibCompartido("import { x } from '@/lib/retarificar-cartera'"))
  assert.ok(!importaLibCompartido("import { x } from '@/lib/codeoscopic/cotizar'"))
})
