// Guardián de los DOS puertos que comprometen un contrato real:
// `/api/operador/codeoscopic/oferta` (ReRate) y `.../emitir` (Submit).
// `node --test` (gate en CI).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Construidos el 11/09/2026 sobre el caso real de Pilar Franco Ruz, sin
// sandbox: un `GET` que dispare cualquiera de las dos por accidente (un
// prefetch, un bot) sería un ReRate o un Submit reales sobre un contrato de
// verdad, y una llamada sin `confirmado: true` sería lo mismo sin que nadie lo
// haya pedido. Mismo espíritu que `test/regression-puerto-retarificar.test.ts`,
// aplicado al escalón siguiente (emitir, no solo tarificar).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

const RUTA_OFERTA = 'apps/asegura/app/api/operador/codeoscopic/oferta/route.ts'
const RUTA_EMITIR = 'apps/asegura/app/api/operador/codeoscopic/emitir/route.ts'
const LIB_EMITIR = 'apps/asegura/lib/codeoscopic/emitir.ts'
const LIB_EMITIR_ENVIO = 'apps/asegura/lib/codeoscopic/emitir-envio.ts'

function fuente(f: string): string {
  const p = join(ROOT, f)
  assert.ok(existsSync(p), `falta ${f}: o se ha movido, o este guardián se ha quedado ciego`)
  return readFileSync(p, 'utf8')
}

function exportaVerbo(src: string, verbo: string): boolean {
  return new RegExp(`export\\s+(async\\s+)?function\\s+${verbo}\\b`).test(src)
}

/** El código sin comentarios: un cepo que mira código no puede dispararse
 *  porque un COMENTARIO nombre, a modo de explicación, lo que NO hay que
 *  hacer (como el propio comentario de `emitir.ts` que dice «distinto del
 *  interruptor de tarificar, CODEOSCOPIC_TARIFICACION_ACTIVA»). */
function codigo(f: string): string {
  return fuente(f)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
}

for (const ruta of [RUTA_OFERTA, RUTA_EMITIR]) {
  test(`${ruta} no expone GET/HEAD: un prefetch dispararía una llamada real al vendor`, () => {
    const src = fuente(ruta)
    assert.ok(exportaVerbo(src, 'POST'), `${ruta} tiene que ser un POST`)
    for (const verbo of ['GET', 'HEAD']) {
      assert.ok(!exportaVerbo(src, verbo), `${ruta} exporta ${verbo}: eso dispararía la llamada sola`)
    }
  })

  test(`${ruta} exige \`confirmado === true\` estricto antes de tocar nada`, () => {
    const src = fuente(ruta)
    assert.ok(
      /confirmado\s*!==\s*true/.test(src),
      `${ruta} no comprueba \`confirmado !== true\`: sin eso, quien tenga el Bearer del operador ` +
        'dispara la llamada real sin haber dicho que quiere hacerlo.',
    )
    assert.ok(
      !/confirmado\s*(==|!=)[^=]/.test(src),
      `${ruta}: la comprobación de \`confirmado\` tiene que ser estricta (===/!==), no laxa`,
    )
    assert.ok(/status:\s*400/.test(src), `${ruta}: sin confirmar se rechaza con 400, no se intenta`)
  })

  test(`${ruta} autoriza con operadorAutorizado ANTES de leer el cuerpo`, () => {
    const src = fuente(ruta)
    assert.ok(/operadorAutorizado\(req\)/.test(src), `${ruta} no comprueba operadorAutorizado(req)`)
    const iAuth = src.indexOf('operadorAutorizado(req)')
    const iCuerpo = src.indexOf('req.json(')
    assert.ok(iAuth > -1 && iCuerpo > -1 && iAuth < iCuerpo, `${ruta} lee el cuerpo antes de autorizar`)
  })
}

test('las dos rutas pasan por el embudo de emisión, no por el vendor a pelo', () => {
  assert.ok(
    /from ['"]@\/lib\/codeoscopic\/emitir['"]/.test(fuente(RUTA_OFERTA)) &&
      /\breRate\s*\(/.test(fuente(RUTA_OFERTA)),
    `${RUTA_OFERTA} tiene que llamar a reRate() de @/lib/codeoscopic/emitir`,
  )
  assert.ok(
    /from ['"]@\/lib\/codeoscopic\/emitir-envio['"]/.test(fuente(RUTA_EMITIR)) &&
      /\benviarEmision\s*\(/.test(fuente(RUTA_EMITIR)),
    `${RUTA_EMITIR} tiene que llamar a enviarEmision() de @/lib/codeoscopic/emitir-envio`,
  )
})

test('el embudo de emisión exige su PROPIO interruptor, distinto del de tarificar', () => {
  const src = codigo(LIB_EMITIR)
  assert.ok(
    src.includes('CODEOSCOPIC_EMISION_ACTIVA'),
    'lib/codeoscopic/emitir.ts tiene que comprobar CODEOSCOPIC_EMISION_ACTIVA',
  )
  // Sobre el código sin comentarios: el propio fichero EXPLICA en prosa que su
  // interruptor es distinto del de tarificar, y esa frase no puede disparar
  // el cepo (sería el mismo falso positivo que ya evita `codigo()` en el
  // guardián de retarificar).
  assert.ok(
    !/CODEOSCOPIC_TARIFICACION_ACTIVA/.test(src),
    'el gate de emisión no puede depender del interruptor de tarificar en el CÓDIGO: son compromisos distintos',
  )
})

test('enviarEmision() toma un candado antes de llamar al vendor', () => {
  const src = fuente(LIB_EMITIR_ENVIO)
  assert.ok(
    /submit_in_flight_at/.test(src) && /submit_attempt_id/.test(src),
    'el Submit tiene que pasar por el candado submit_in_flight_at/submit_attempt_id antes de llamar',
  )
})

test('emitir.ts (el fichero PURO) no importa tenant/prisma: tiene que poder correr bajo node --test', () => {
  const src = codigo(LIB_EMITIR)
  assert.ok(
    !/from ['"]\.\.\/tenant(\.ts)?['"]/.test(src),
    'lib/codeoscopic/emitir.ts importa tenant.ts: eso rompe cualquier test que lo importe bajo ' +
      '`node --test` (tenant.ts arrastra ./db sin extensión, que ese loader no resuelve). El Submit ' +
      'con BD va en emitir-envio.ts.',
  )
})

// ─── El cepo se prueba a sí mismo ────────────────────────────────────────────

test('los detectores no son un adorno', () => {
  assert.ok(exportaVerbo('export async function POST(req: Request) {}', 'POST'))
  assert.ok(!exportaVerbo('export async function POST(req: Request) {}', 'GET'))
  assert.ok(!exportaVerbo('// GET no exportado aquí\nexport async function POST() {}', 'GET'))
})
