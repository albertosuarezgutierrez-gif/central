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
  const infractores = ficheros(/^apps\/asegura\/(app|lib)\/.*\.tsx?$/)
    .filter((f) => !f.includes('lib/codeoscopic/cotizar.ts'))
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
