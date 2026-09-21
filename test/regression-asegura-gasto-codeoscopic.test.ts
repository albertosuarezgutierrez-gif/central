// Guardián del GASTO en `apps/asegura`. `node --test` (gate en CI).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Cada `POST /insurances` de Codeoscopic cuesta 0,50€ reales, con credenciales
// de PRODUCCIÓN y sin sandbox utilizable. La defensa de la app es un embudo:
// `lib/codeoscopic/cotizar.ts` es la única función que llama al vendor pagando,
// y comprueba interruptor, libro y tope antes de hacerlo.
//
// El modo de fallo que este cepo persigue no es un bug de lógica: es que
// alguien, con toda la buena fe, añada un segundo camino al dinero — un `GET`
// que cotice (y que un prefetch del navegador dispare solo), o una pantalla que
// llame al vendor sin pasar por el embudo. Eso no da error: da factura.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

function ficheros(patron: RegExp): string[] {
  const out = execFileSync('git', ['ls-files', 'apps/asegura'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).filter((f) => patron.test(f))
}

const RUTAS = ficheros(/^apps\/asegura\/app\/.*route\.ts$/)
const FUENTE = (f: string) => readFileSync(join(ROOT, f), 'utf8')

/** Quién importa `cotizar` (la función que paga), no `probarConexion` ni tipos. */
function llamaAlEmbudoDePago(src: string): boolean {
  return /\bcotizar\s*\(/.test(src) && /from ['"][^'"]*codeoscopic\/cotizar['"]/.test(src)
}

test('hay al menos una ruta de cotización: si no, este guardián no vigila nada', () => {
  assert.ok(RUTAS.length > 0, 'no se han encontrado rutas en apps/asegura')
  assert.ok(
    RUTAS.some((f) => llamaAlEmbudoDePago(FUENTE(f))),
    'ninguna ruta llama a cotizar(): o se ha movido el embudo, o el cepo se ha quedado ciego',
  )
})

test('ninguna ruta que cotiza expone un GET: un prefetch del navegador gastaría 0,50€', () => {
  const infractoras = RUTAS.filter((f) => {
    const src = FUENTE(f)
    return llamaAlEmbudoDePago(src) && /export\s+(async\s+)?function\s+GET\b/.test(src)
  })
  assert.deepEqual(
    infractoras,
    [],
    'Estas rutas gastan dinero y además responden a GET. Un prefetch, un bot o un ' +
      `reintento del navegador dispararían el cargo:\n  - ${infractoras.join('\n  - ')}`,
  )
})

test('nadie llama al vendor por su cuenta: el POST de cotización pasa por cotizar()', () => {
  // `peticion()` es el transporte. Usarlo con POST fuera del embudo es saltarse
  // el interruptor, el libro y el tope de golpe.
  //
  // 🚨 `lib/codeoscopic/emitir.ts` es la SEGUNDA excepción (11/09/2026): el
  // embudo del ENVÍO real (ReRate + Submit), detrás de su propio interruptor
  // `CODEOSCOPIC_EMISION_ACTIVA` — distinto del de cotizar — y con su propio
  // candado de un solo intento (`submit_in_flight_at`). No es un segundo
  // camino sin control: es un segundo embudo, con guardas propias.
  //
  // 🚨 `lib/codeoscopic/product-form.ts` es la TERCERA excepción (17/09/2026):
  // el relay hacia `POST /product-form-requests` que usa la Product Form
  // Library (el widget del vendor para pintar el formulario REAL de cada
  // compañía, en vez del catálogo estático adivinado de `opciones-producto.ts`).
  // Es una operación DISTINTA de `/insurances*`: `docs/CODEOSCOPIC-API-PORTAL.md`
  // solo marca `POST /insurances` como facturable, y esta va detrás del mismo
  // interruptor GRATIS que `/insurance-lines` (`ignorarInterruptor: true`).
  // Sin confirmación explícita del fabricante de que sea gratis (no hay
  // fixture ni sandbox), pero no es la operación que cotiza ni la que
  // compromete un contrato — esas siguen siendo las dos excepciones de arriba.
  const infractores = ficheros(/^apps\/asegura\/(app|lib)\/.*\.tsx?$/)
    .filter(
      (f) =>
        !f.includes('lib/codeoscopic/cotizar.ts') &&
        !f.includes('lib/codeoscopic/emitir.ts') &&
        !f.includes('lib/codeoscopic/product-form.ts'),
    )
    .filter((f) => {
      const src = FUENTE(f)
      if (!/from ['"][^'"]*codeoscopic\/cliente(\.ts)?['"]/.test(src)) return false
      return /metodo:\s*'POST'/.test(src)
    })

  assert.deepEqual(
    infractores,
    [],
    'Estos ficheros hacen un POST al vendor sin pasar por cotizar(), que es donde ' +
      `viven el interruptor, el libro de consumo y el tope:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('los catálogos NO cotizan: son consultas gratis y solo hacen GET', () => {
  const catalogos = join(ROOT, 'apps/asegura/lib/codeoscopic/catalogos.ts')
  const src = readFileSync(catalogos, 'utf8')
  assert.ok(
    !/metodo:\s*'POST'/.test(src),
    'catalogos.ts no debe hacer POST: todo lo suyo es consulta gratuita',
  )
  assert.ok(
    !/\bcotizar\s*\(/.test(src),
    'catalogos.ts no debe cotizar: es la parte que puede usarse con el gasto apagado',
  )
})

test('🚨 el catálogo de MARCAS pide onlyPopular=false: por defecto el vendor recorta la lista', () => {
  // El portal documenta `onlyPopular` con **Default: true** en `GET /car/brands`.
  // Llamarlo a secas devuelve solo las marcas «populares»: una marca que no esté
  // en esa lista NO aparece en el desplegable, sin error y sin hueco que lo
  // delate — se ve exactamente igual que si no existiera. Es la ausencia
  // silenciosa que persigue `CLAUDE.md`, y aquí además hace imposible
  // retarificar un coche entero.
  const src = readFileSync(join(ROOT, 'apps/asegura/lib/codeoscopic/catalogos.ts'), 'utf8')
  const llamadas = src.match(/'\/car\/brands[^']*'/g) ?? []
  assert.ok(llamadas.length > 0, 'debe existir la llamada al catálogo de marcas')
  for (const l of llamadas) {
    if (l.includes('/models')) continue // los modelos de UNA marca no tienen ese filtro
    assert.ok(
      l.includes('onlyPopular=false'),
      `la llamada ${l} tiene que pasar onlyPopular=false explícitamente`,
    )
  }
})

test('la precalificación no inventa datos PERSONALES, solo circunstancias', () => {
  // Un km/año supuesto es una hipótesis del riesgo y se enseña. Un DNI o una
  // fecha de nacimiento supuestos serían datos falsos de una persona real.
  const src = readFileSync(join(ROOT, 'apps/asegura/lib/codeoscopic/desde-cartera.ts'), 'utf8')
  for (const campo of ['dni', 'nombre', 'fechaNacimiento', 'telefono', 'fechaCarnet', 'sexo']) {
    assert.ok(
      !new RegExp(`suponer\\(\\s*'${campo}'`).test(src),
      `desde-cartera.ts no puede suponer «${campo}»: es un dato personal, no una hipótesis`,
    )
  }
})

// ─── Las OTRAS dos llamadas que gastan: ReRate y Submit (21/09/2026) ─────────
//
// `cotizar()` no es el único camino al vendor. El ReRate
// (`POST /insurances/{id}/offers`) y el Submit
// (`POST /insurances/{id}/policy-applications`) van por su propio embudo
// (`lib/codeoscopic/emitir.ts`, la segunda excepción de arriba) y hasta el
// 21/09/2026 **no escribían NI UNA línea en `seguros.codeoscopic_consumo`**:
// `puedeCotizar()` no las veía y el tope no las contaba. Si facturan —y el CRM
// de Manuel trata el ReRate como facturable y `noRetry`—, el libro llevaba
// contando de menos.
//
// Estos cuatro brazos vigilan el arreglo. El modo de fallo que persiguen es el
// mismo de arriba, una vuelta más abajo: que alguien añada un camino al vendor
// que no pase por el libro. Eso no da error: da una factura que no cuadra con
// el libro, y un tope que protege menos de lo que dice.

/**
 * El CÓDIGO, sin comentarios. Hace falta aquí y no arriba: `reRate` se cita en
 * prosa en varios sitios (`respuesta.ts`, cabeceras de módulo), y un cepo que
 * confunde una referencia en un comentario con una llamada real señala
 * ficheros inocentes hasta que alguien lo apaga.
 */
const FUENTE_LIBRO = (f: string) =>
  FUENTE(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

test('el ReRate abre su línea en el libro: nadie llama a reRate() sin el embudo de gasto', () => {
  // `emitir.ts` es donde se DEFINE; el resto son llamantes y todos tienen que
  // envolverla en `conLibroDeEmision`.
  const llamantes = ficheros(/^apps\/asegura\/(app|lib)\/.*\.tsx?$/)
    .filter((f) => !f.includes('lib/codeoscopic/emitir.ts'))
    .filter((f) => /\breRate\s*\(/.test(FUENTE_LIBRO(f)))

  assert.ok(
    llamantes.length > 0,
    'nadie llama a reRate(): o se ha movido el ReRate, o este cepo se ha quedado ciego',
  )

  const sinLibro = llamantes.filter((f) => {
    const src = FUENTE_LIBRO(f)
    return !(
      /from ['"][^'"]*codeoscopic\/libro-emision['"]/.test(src) && /\bconLibroDeEmision\s*\(/.test(src)
    )
  })
  assert.deepEqual(
    sinLibro,
    [],
    'Estos ficheros piden un ReRate a la compañía sin abrir su línea en ' +
      '`seguros.codeoscopic_consumo`, así que el tope no lo cuenta:\n  - ' +
      sinLibro.join('\n  - '),
  )
})

test('el Submit abre su línea en el libro, y la reserva va ANTES del fetch', () => {
  const src = FUENTE_LIBRO('apps/asegura/lib/codeoscopic/emitir-envio.ts')
  assert.match(
    src,
    /from ['"]\.\/libro-emision\.ts['"]/,
    'el Submit tiene que pasar por el embudo del libro',
  )
  assert.match(src, /conLibroDeEmision\s*\(/, 'y llamarlo de verdad, no solo importarlo')
  assert.match(
    src,
    /operacion:\s*'submit'/,
    'con su propio motivo: sin él, la línea se contaría como una cotización',
  )
  // El `fetch` al vendor tiene que estar DENTRO del embudo: si estuviera antes,
  // habría llamada sin reserva, que es el agujero que esto tapa.
  const iEmbudo = src.indexOf('conLibroDeEmision(')
  const iFetch = src.indexOf('await fetch(')
  assert.ok(iEmbudo > 0 && iFetch > iEmbudo, 'el fetch del Submit tiene que ir DENTRO de conLibroDeEmision()')
})

test('🚨 los contadores están SEPARADOS: el libro de cotizar no cuenta el ReRate ni el Submit', () => {
  // Si se mezclaran, agotar el tope de una cosa apagaría la otra sin que nadie
  // supiera por qué, y la cifra de «cotizaciones que te quedan hoy» que pinta
  // la pantalla del corredor contaría cosas que no son cotizaciones.
  const src = FUENTE_LIBRO('apps/asegura/lib/codeoscopic/consumo.ts')
  assert.match(
    src,
    /motivo not in \(\$\{MOTIVO_RERATE\}, \$\{MOTIVO_SUBMIT\}\)/,
    'consumoActual() (el libro de cotizar) tiene que excluir los motivos de emisión',
  )
  assert.match(
    src,
    /export async function consumoEmision\(/,
    'y la emisión tiene que tener su propio recuento, no reusar el de cotizar',
  )
  assert.match(
    src,
    /and motivo = \$\{operacion\}/,
    'consumoEmision() cuenta SOLO su operación',
  )
})

test('el embudo de emisión reserva antes de llamar y no libera cupo sin evidencia', () => {
  const src = FUENTE_LIBRO('apps/asegura/lib/codeoscopic/libro-emision.ts')
  const iReserva = src.indexOf('await reservarEmision(')
  const iLlamada = src.indexOf('await llamada()')
  assert.ok(iReserva > 0, 'el embudo tiene que reservar')
  assert.ok(iLlamada > iReserva, 'la reserva va ANTES de la llamada al vendor, nunca después')
  assert.match(
    src,
    /pruebaQueNoHuboCargo/,
    'solo se descarta con evidencia de que el vendor no llegó a cobrar',
  )
  // Fail-closed: si no se puede leer el libro, no se llama.
  assert.match(src, /razon: 'sin-libro'/, 'sin libro no se llama al vendor')
  assert.doesNotMatch(
    src,
    /catch[\s\S]{0,120}return\s*\{\s*diaFacturables:\s*0/,
    'un fallo de lectura no puede convertirse en «no se ha gastado nada»',
  )
})

test('🚨 un 5xx del Submit NO se cierra como facturable: se queda `reservado`, como un timeout', () => {
  // Hallazgo de code-review (21/09/2026): el `fetch` del Submit no lanza en un
  // 5xx (resuelve con el estado HTTP como valor), así que sin un `exitoso`
  // explícito el embudo cerraba la línea como `facturable` por defecto —
  // contradiciendo la cabecera del propio fichero («un timeout o un 5xx dejan
  // la línea en reservado»). El caso real: proyecto 40685793, Submit con 500
  // «Unknown error while waiting…», sin saber si la compañía llegó a emitir.
  const libro = FUENTE_LIBRO('apps/asegura/lib/codeoscopic/libro-emision.ts')
  assert.match(
    libro,
    /opciones\.exitoso\?\.\(valor\)/,
    'el embudo tiene que preguntar si el valor resuelto es de verdad un éxito, no darlo por hecho',
  )
  assert.match(
    libro,
    /\}\s*else if\s*\(exitoso\)\s*\{/,
    'sin evidencia de que no costó Y sin éxito confirmado, la línea NO se cierra (se queda reservado)',
  )

  const envio = FUENTE_LIBRO('apps/asegura/lib/codeoscopic/emitir-envio.ts')
  assert.match(
    envio,
    /exitoso:\s*\(r\)\s*=>\s*r\.correcto/,
    'el Submit tiene que decirle al embudo que un 5xx (r.correcto === false) NO es un éxito facturable',
  )
})

test('ni el ReRate ni el Submit se exponen por GET: un prefetch los dispararía', () => {
  for (const ruta of [
    'apps/asegura/app/api/operador/codeoscopic/oferta/route.ts',
    'apps/asegura/app/api/operador/codeoscopic/emitir/route.ts',
  ]) {
    assert.ok(
      !/export\s+(async\s+)?function\s+GET\b/.test(FUENTE_LIBRO(ruta)),
      `${ruta} compromete dinero y un contrato: no puede responder a GET`,
    )
  }
})

// ─── El cepo se prueba a sí mismo ────────────────────────────────────────────

test('el detector reconoce una ruta que cotiza, y no confunde la sonda', () => {
  assert.ok(
    llamaAlEmbudoDePago("import { cotizar } from '@/lib/codeoscopic/cotizar'\nawait cotizar({})"),
  )
  assert.ok(
    !llamaAlEmbudoDePago(
      "import { probarConexion } from '@/lib/codeoscopic/cotizar'\nawait probarConexion()",
    ),
    'la sonda es gratis: no debe contar como gasto',
  )
  assert.ok(!llamaAlEmbudoDePago('const x = cotizar()'), 'sin el import no es nuestro embudo')
})
