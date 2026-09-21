// Guardián de la pantalla del PRESUPUESTO en `apps/asegura-portal` (PR 2,
// 21/09/2026). `node --test` (gate en CI vía `pnpm test:guardia`).
//
// Hermano de `regression-portal-aislamiento.test.ts`, que vigila que ninguna
// consulta se escape del vínculo. Este vigila lo otro: que la pantalla no
// AFIRME lo que no puede afirmar, y que la puerta siga siendo la que es.
//
// Lee el FUENTE con `readFileSync` y no importa los módulos a propósito: casi
// todo lo que hay que fijar vive en un componente de servidor o en una consulta
// de Prisma, y ahí ni `tsc` ni el build miran. Importarlos arrastraría el
// cliente generado de Prisma y tumbaría el job `Tests (packages + guardián)`,
// que corre sin `prisma generate` (misma razón que `actividad-cartera.test.ts`).
//
// ⚠️ Y la lección que este repo ya ha pagado tres veces: **tus propios
// comentarios disparan un cepo que busca texto plano**. Por eso se quitan antes
// de mirar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PORTAL = join(ROOT, 'apps/asegura-portal')

const CARATULA = join(PORTAL, 'app/presupuesto/[token]/page.tsx')
const PANTALLA = join(PORTAL, 'app/(portal)/boveda/presupuesto/[id]/page.tsx')
const COMPARATIVA = join(PORTAL, 'app/(portal)/boveda/presupuesto/[id]/Comparativa.tsx')
const PLEGABLE = join(PORTAL, 'app/(portal)/boveda/presupuesto/[id]/RestoDeOpciones.tsx')
const LIB = join(PORTAL, 'lib/presupuesto.ts')
const VISTA = join(PORTAL, 'lib/presupuesto-vista.ts')
const GRANTS = join(PORTAL, 'prisma/sql/2026-09-21_portal_presupuesto_grants.sql')

function leer(f: string): string {
  return readFileSync(f, 'utf8')
}

/** El fuente SIN comentarios: lo que de verdad se ejecuta y se pinta. */
function codigo(f: string): string {
  return leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
}

// ─── La puerta: el token NO abre sesión ─────────────────────────────────────

test('la carátula pública no enseña NADA del presupuesto', () => {
  const src = codigo(CARATULA)
  // Ni el importe, ni la compañía, ni el bien, ni el nombre del tomador: este
  // enlace se reenvía y vive en buzones compartidos.
  for (const prohibido of ['eur(', 'prima', 'compania', 'franquicia', 'opciones', 'actual.', 'cliente']) {
    assert.ok(
      !src.includes(prohibido),
      `la carátula es PÚBLICA: no puede nombrar «${prohibido}». El token dice QUÉ presupuesto es; ` +
        'quién eres lo dice el código de un solo uso que llega a tu correo.',
    )
  }
})

test('la carátula solo pide `{ estado, id }`, nunca la fila entera', () => {
  const src = codigo(LIB)
  const i = src.indexOf('prisma.presupuesto.findUnique({\n      where: { tokenHash')
  assert.ok(i > 0, 'no encuentro la consulta por token de la carátula')
  const bloque = src.slice(i, i + 400)
  assert.match(
    bloque,
    /select:\s*\{\s*id:\s*true,\s*retiradoAt:\s*true\s*\}/,
    'la consulta sin sesión trae el id y si está retirado, y NADA más: hasta que hay sesión no ' +
      'hay a quien enseñarle nada.',
  )
})

test('los finales malos de la carátula se colapsan en uno solo', () => {
  const src = codigo(LIB)
  // Distinguir «no existe» de «ya no vale» convierte la URL en un oráculo con
  // el que averiguar tokens válidos a base de probar.
  assert.ok(
    !/estado:\s*'(no_existe|caducada|retirada)'/.test(src),
    'la carátula tiene DOS estados: `viva` y `muerta`. Cualquier tercero es un oráculo.',
  )
  assert.ok(src.includes("estado: 'muerta'"), 'falta el final neutro de la carátula')
})

test('el token se valida de FORMA antes de tocar la BD y se compara HASHEADO', () => {
  const src = codigo(LIB)
  assert.match(src, /formatoTokenVistaValido\(tokenCrudo\)/)
  assert.match(
    src,
    /where:\s*\{\s*tokenHash:\s*await hashTokenVista\(tokenCrudo\)\s*\}/,
    'el token se busca por su HASH: una tabla de presupuestos con sus enlaces legibles es una ' +
      'tabla de llaves.',
  )
})

// ─── Quién lo puede ver ─────────────────────────────────────────────────────

test('las DOS ramas de autorización están, y el `destino_hash` NULL no concede', () => {
  const src = codigo(LIB)
  // (b) el vínculo, con el identidadId de la cookie DENTRO del where.
  assert.match(
    src,
    /prisma\.portalVinculo\.findFirst\(\{\s*where:\s*\{\s*identidadId,\s*clienteId:\s*p\.clienteId/,
    'la rama del vínculo lleva la identidad DENTRO del `where`, no comprobada en la línea siguiente',
  )
  // (a) el canal por el que entró.
  assert.match(src, /prisma\.portalCanal\.findFirst/)
  assert.match(
    src,
    /p\.destinoHash !== null && p\.destinoHash !== ''/,
    'un `destino_hash` a NULL es «no consta a quién se avisó», no «no coincide»: se corta ANTES ' +
      'de la comparación, para que el día que alguien relaje el tipo no se abra solo.',
  )
})

test('sin ninguna de las dos ramas NO se enseña, y el texto es NEUTRO', () => {
  const src = codigo(LIB)
  assert.match(src, /if \(vinculo === null && !porCanal\)/)
  assert.match(src, /estado: 'ajeno'/)
  const vista = leer(VISTA)
  const i = vista.indexOf('export const TEXTO_AJENO')
  assert.ok(i > 0)
  const texto = vista.slice(i, vista.indexOf('\n\n', i))
  for (const filtracion of ['Alberto', 'compañía', 'póliza', 'coche']) {
    assert.ok(
      !texto.includes(filtracion),
      `el 403 no dice de quién es el presupuesto («${filtracion}»): sería un oráculo de la cartera`,
    )
  }
})

test('`ambiguo` NO se pinta como «no eres tú»', () => {
  const src = codigo(LIB)
  assert.match(
    src,
    /estadoVinculo === 'ambiguo'[\s\S]{0,80}vinculo_ambiguo/,
    'un correo en dos fichas es «no lo hemos podido decidir». Tratarlo como ajeno es una ' +
      'acusación falsa.',
  )
  assert.match(leer(VISTA), /TEXTO_VINCULO_AMBIGUO[\s\S]{0,300}revisando el corredor/)
})

test('se anota la apertura ajena, sin guardar quién la hizo', () => {
  const src = codigo(LIB)
  assert.match(src, /tipo: 'apertura_ajena'/)
  const i = src.indexOf('async function anotarAperturaAjena')
  const bloque = src.slice(i, src.indexOf('\n}', i))
  for (const pii of ['destino', 'email', 'valorHash', 'identidadId']) {
    assert.ok(
      !bloque.includes(pii),
      `en el detalle del evento no va «${pii}»: el historial de la casa no guarda valores de ` +
        'datos de identidad.',
    )
  }
})

// ─── El sello de `visto_at` ─────────────────────────────────────────────────

test('la vista de CORREDOR no sella `visto_at`', () => {
  const src = codigo(LIB)
  assert.match(
    src,
    /if \(!vistaDeCorredor\) await sellarVisto\(/,
    'Si Alberto sellara `visto_at` al mirar, la cola de Hoy diría «el cliente lo ha abierto» ' +
      'sobre una pantalla que abrió él — y eso decide si se le vuelve a llamar.',
  )
})

test('el sello va filtrado por el cliente ya autorizado y solo la primera vez', () => {
  const src = codigo(LIB)
  const i = src.indexOf('prisma.presupuesto.updateMany')
  assert.ok(i > 0, 'no encuentro el sello de visto_at')
  const bloque = src.slice(i, src.indexOf('})', i))
  assert.match(bloque, /where:\s*\{\s*id,\s*clienteId,\s*vistoAt:\s*null\s*\}/)
})

test('el portal NO escribe ningún otro sello: elegir y firmar son el PR 4', () => {
  const src = codigo(LIB)
  for (const sello of ['elegidoAt:', 'aceptadoAt:', 'emitidoAt:', 'elegidaAt:']) {
    assert.ok(
      !new RegExp(`data:[\\s\\S]{0,200}${sello.replace('[', '\\[')}`).test(src),
      `el PR 2 es SOLO LECTURA: no puede escribir ${sello}`,
    )
  }
  assert.ok(!src.includes('prisma.firma'), 'la firma la compone `apps/asegura` por su puerto, nunca el portal')
})

// ─── Lo que la pantalla afirma ──────────────────────────────────────────────

test('el número de póliza NUNCA identifica una póliza para el cliente', () => {
  const src = codigo(LIB)
  assert.ok(
    !/numeroPoliza/.test(src),
    'regla permanente del portal: nadie se sabe su número de póliza. El bien se describe; el ' +
      'número no se pide siquiera al `select`.',
  )
  assert.ok(!/numeroPoliza/.test(codigo(COMPARATIVA)))
})

test('el dinero va en formato español y por el helper de la casa', () => {
  const src = codigo(COMPARATIVA)
  assert.match(src, /from '@\/lib\/dinero'/)
  assert.ok(
    !/toFixed\(2\)/.test(src) && !/€\$\{/.test(src),
    'nada de `€${x.toFixed(2)}`: el formato es `2.162,49€` y sale de `eur()`',
  )
})

test('ni un hex ni un color a mano en la pantalla', () => {
  for (const f of [CARATULA, PANTALLA, COMPARATIVA, PLEGABLE]) {
    const src = codigo(f)
    assert.ok(
      !/#[0-9a-fA-F]{3,8}\b/.test(src),
      `${f}: los colores salen de los tokens de MARCA_ASEGURA, no de un hex escrito a mano`,
    )
  }
})

test('el mediador y su clave DGSFP salen de MEDIADOR, no tecleados', () => {
  const src = codigo(COMPARATIVA)
  assert.match(src, /from '@central\/module-seguros'/)
  assert.match(src, /MEDIADOR\.identidad/)
  assert.ok(
    !src.includes('CS-F/0170'),
    'la clave DGSFP no se teclea aquí: dos copias de un número de registro es una copia de más',
  )
  assert.match(src, /an[áa]lisis objetivo/i, 'el bloque del mediador tiene que declarar el análisis objetivo')
  // Visible y NO plegado: un `<details>` alrededor lo convertiría en algo que
  // casi nadie abre, y el art. 19 LDS pide que se vea.
  const i = src.indexOf('export function Mediador')
  const bloque = src.slice(i)
  assert.ok(!bloque.includes('<details'), 'el bloque del mediador va visible, no plegado')
})

test('el plegable de «el resto de opciones» monta de verdad en perezoso', () => {
  const src = codigo(PLEGABLE)
  assert.match(
    src,
    /\{abierto && /,
    'un `<details>` cerrado crea igualmente todo su DOM: los hijos no se montan hasta abrirlo',
  )
  assert.match(src, /onToggle=/)
})

/**
 * El CSS SIN comentarios. 🦷 La lección que este repo ya ha pagado tres veces:
 * un cepo que busca texto plano lo dispara la prosa que escribiste para
 * explicar la regla. Aquí pasó literalmente: el comentario que dice «ningún
 * elemento de aquí es `position: fixed`» hacía fallar el cepo del `fixed`.
 */
function cssSinComentarios(): string {
  return readFileSync(join(PORTAL, 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '\n')
}

test('la tabla de garantías son filas etiquetadas, no scroll horizontal', () => {
  const css = cssSinComentarios()
  const i = css.indexOf('.presu-lineas')
  assert.ok(i > 0, 'no encuentro el bloque de garantías en globals.css')
  const bloque = css.slice(i, i + 1200)
  assert.ok(
    !/overflow-x:\s*auto/.test(bloque),
    'una comparación que hay que arrastrar no se compara: filas etiquetadas, no scroll',
  )
  // `no_consta` no puede pintarse como `igual`: tiene su propia forma.
  assert.match(css, /\.presu-lineas li\[data-estado='no_consta'\]\s*\{[^}]*dashed/)
  assert.match(css, /\.presu-lineas li\[data-estado='peor'\][^{]*\{[^}]*--negative/)
})

test('nada de la pantalla es `position: fixed`', () => {
  const css = cssSinComentarios()
  // Se ancla en la PRIMERA regla del bloque, no en su comentario de cabecera:
  // el comentario se acaba de borrar, y anclar en él haría que el cepo mirase
  // a la nada en cuanto alguien reescriba la prosa.
  const i = css.indexOf('.caratula {')
  assert.ok(i > 0, 'no encuentro el bloque de CSS del presupuesto')
  const bloque = css.slice(i)
  assert.ok(
    !/position:\s*fixed/.test(bloque),
    'un `fixed` NO desborda: se pone ENCIMA, y lo que taparía es justo la salida. Es el fallo ' +
      'que el cepo de responsive no ve porque `scrollWidth` sigue siendo correcto.',
  )
})

test('las DOS salidas están y con el mismo peso', () => {
  const src = codigo(COMPARATIVA)
  assert.match(src, /Me cambio de compañía/)
  assert.match(src, /ll[eé]vamelo yo/i)
  // Mismo contenedor y misma clase: si solo se ofrece «me cambio», el que dice
  // que no se va con las manos vacías.
  const i = src.indexOf('export function Salidas')
  const bloque = src.slice(i)
  const salidas = bloque.match(/className="presu-salida"/g) ?? []
  assert.equal(salidas.length, 2, 'las dos salidas comparten clase, o sea peso visual')
})

// ─── Los GRANT ──────────────────────────────────────────────────────────────

test('el rol del portal NO recibe la tarificación ni sus precios ni la firma', () => {
  const src = leer(GRANTS)
    .replace(/^--.*$/gm, ' ')
  assert.ok(
    !/tarificacion_precios/.test(src),
    'el cliente ve el SNAPSHOT y nada más: una lista leída en vivo de una tabla mutable cambia ' +
      'entre dos visitas mientras la portada, congelada, no.',
  )
  assert.ok(
    !/ON seguros\.firma/i.test(src),
    'la firma la compone `apps/asegura` por su puerto: `cumpleArt26()` exige nombre y email/DNI, ' +
      'y el portal no tiene GRANT sobre ninguno de los dos.',
  )
  assert.ok(!/referencia_vendor/.test(src), 'el id del quote del vendor es la llave del ReRate, no un dato del cliente')
  assert.ok(!/retirado_motivo/.test(src), 'la nota con la que Alberto retira un presupuesto no está escrita para el cliente')
})

test('la ÚNICA escritura concedida sobre el presupuesto es visto_at', () => {
  const src = leer(GRANTS).replace(/^--.*$/gm, ' ')
  const updates = src.match(/GRANT UPDATE \(([^)]*)\)/g) ?? []
  assert.deepEqual(
    updates,
    ['GRANT UPDATE (visto_at)'],
    'elegir y firmar son el PR 4. Un permiso concedido «para luego» es un permiso que nadie vigila.',
  )
  assert.ok(!/GRANT DELETE/i.test(src), 'nada se borra desde el portal')
})

// ─── Y la trampa que casi se cuela: DOS rutas para la MISMA URL ─────────────

/**
 * 🚨 Caso fundacional (21/09/2026, este mismo PR). La carátula pública nació en
 * `app/presupuesto/[token]/` y la pantalla con sesión en
 * `app/(portal)/presupuesto/[id]/` — que es literalmente lo que pide el §6 de
 * la spec. **Un grupo entre paréntesis NO añade segmento a la URL**, así que
 * las dos resuelven `/presupuesto/<algo>`.
 *
 * Y lo caro no es que rompa: es que **`next build` las aceptó y las listó las
 * dos** («/presupuesto/[id]» y «/presupuesto/[token]»), y el typecheck ni las
 * mira. Una de las dos no se pinta nunca y cuál depende del emparejador. En el
 * peor reparto, el enlace del correo del cliente cae en la pantalla con sesión,
 * el token no pasa el `UUID.test` y el cliente lee «No encuentro ese
 * presupuesto» sobre un presupuesto que existe. Sin un solo error en ningún
 * log. Por eso la pantalla con sesión vive en `/boveda/presupuesto/[id]`, al
 * lado de sus hermanas (`/boveda/poliza/[id]`, `/boveda/carta/[id]`,
 * `/boveda/anadida/[id]`).
 *
 * El cepo es GENERAL a propósito: no comprueba este caso, comprueba la clase.
 */
test('dos páginas del portal no pueden resolver la misma URL', () => {
  const APP = join(PORTAL, 'app')
  const porRuta = new Map<string, string[]>()

  function recorrer(dir: string): void {
    for (const e of readdirSync(dir)) {
      const abs = join(dir, e)
      if (statSync(abs).isDirectory()) {
        recorrer(abs)
        continue
      }
      if (e !== 'page.tsx' && e !== 'page.ts' && e !== 'route.ts') continue
      // La URL: se quitan los grupos `(x)` —que no aportan segmento— y se
      // normaliza el nombre del parámetro, porque `[id]` y `[token]` son la
      // MISMA ruta con dos nombres.
      const url =
        '/' +
        relative(APP, dir)
          .split('/')
          .filter((s) => s !== '' && !(s.startsWith('(') && s.endsWith(')')))
          .map((s) => (s.startsWith('[') ? '[*]' : s))
          .join('/')
      const clave = `${e === 'route.ts' ? 'API' : 'PAGE'} ${url}`
      porRuta.set(clave, [...(porRuta.get(clave) ?? []), relative(PORTAL, abs)])
    }
  }
  recorrer(APP)

  const choques = [...porRuta.entries()].filter(([, fs]) => fs.length > 1)
  assert.deepEqual(
    choques,
    [],
    'Estas URLs las sirven dos ficheros distintos. Un grupo `(x)` no añade segmento, y `[id]` y ' +
      '`[token]` son la misma ruta: una de las dos páginas no se pinta NUNCA y el build no se ' +
      `queja:\n${choques.map(([r, fs]) => `  - ${r}\n      ${fs.join('\n      ')}`).join('\n')}`,
  )
  assert.ok(porRuta.size > 20, 'el cepo tiene que estar viendo el árbol de rutas de verdad')
})
