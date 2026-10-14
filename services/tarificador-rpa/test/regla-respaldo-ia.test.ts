// GUARDIÁN de la REGLA «todo bot con IA detrás y aprendizaje» (Alberto, 14/10/2026; docs/TARIFICADOR-RPA.md).
// Todo adaptador REGISTRADO resuelve sus controles por la CAPA COMÚN de formador.ts (`conRespaldoIA`, `campoConRespaldo` o
// `resolverConFormador`): selector fijo → aprendido → IA, con la misma validación y el mismo guard. Un adaptador nuevo
// registrado sin pasar por ella hace fallar este test; la única salida es la lista de PENDIENTES, con su motivo escrito.
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const SRC = join(import.meta.dirname, '..', 'src')
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
/**
 * Llamadas REALES del código (AST de TypeScript): nombres de las funciones llamadas (`f(…)`) y de los métodos (`x.m(…)`).
 * Un nombre dentro de un comentario o de una cadena/plantilla NO es una llamada y no cuenta.
 */
export function llamadas(fuente: string): { funciones: Set<string>; metodos: Set<string> } {
  const sf = ts.createSourceFile('x.ts', fuente, ts.ScriptTarget.Latest, true)
  const funciones = new Set<string>()
  const metodos = new Set<string>()
  const visitar = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      if (ts.isIdentifier(n.expression)) funciones.add(n.expression.text)
      else if (ts.isPropertyAccessExpression(n.expression)) metodos.add(n.expression.name.text)
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return { funciones, metodos }
}
const CAPA = ['conRespaldoIA', 'campoConRespaldo', 'resolverConFormador']
const usaCapa = (fuente: string) => CAPA.some((f) => llamadas(fuente).funciones.has(f))
const PULSA_DIRECTO = ['click', 'dblclick', 'tap']
/** Todos los .ts de src/adapters (recursivo). */
function ficherosAdaptadores(dir = join(SRC, 'adapters'), rel = 'adapters'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? ficherosAdaptadores(join(dir, e.name), `${rel}/${e.name}`) : e.name.endsWith('.ts') ? [`${rel}/${e.name}`] : [])
}

/**
 * Adaptadores registrados que AÚN no pasan por la capa común, con el porqué. Vaciarla es el objetivo; añadir uno exige
 * motivo y decisión de Alberto (no un «ya lo haré»).
 */
export const PENDIENTES_RESPALDO_IA: Readonly<Record<string, string>> = {
  'adapters/allianz/auto.ts': 'Allianz Moto: campos por selector fijo sin etiquetas reales grabadas (el respaldo de campo exige contrastar la etiqueta de la fila); los avances de pestaña ya van por el guard autorizado. F2 del plan de robustez.',
}


/** Fichero (relativo a src/) de cada adaptador registrado en adapters/index.ts. */
function registrados(): Map<string, string> {
  const idx = sinComentarios(leer('adapters/index.ts'))
  const origen = new Map<string, string>()
  for (const m of idx.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g)) {
    for (const n of m[1]!.split(',').map((x) => x.trim().split(/\s+as\s+/).pop()!).filter(Boolean)) origen.set(n, `adapters/${m[2]}`)
  }
  const out = new Map<string, string>()
  for (const m of idx.matchAll(/adaptadores\.registrar\((\w+)\)/g)) {
    const f = origen.get(m[1]!)
    assert.ok(f, `adaptador registrado «${m[1]}» sin import reconocible en adapters/index.ts`)
    out.set(m[1]!, f!)
  }
  return out
}

test('todo adaptador registrado pasa por la capa común de respaldo (o está en PENDIENTES con motivo)', () => {
  const regs = registrados()
  assert.ok(regs.size >= 3, 'se esperaban los adaptadores de Allianz y Mapfre registrados')
  for (const [nombre, fichero] of regs) {
    assert.ok(existsSync(join(SRC, fichero)), `${fichero} no existe`)
    if (Object.hasOwn(PENDIENTES_RESPALDO_IA, fichero)) continue
    assert.ok(usaCapa(leer(fichero)), `${nombre} (${fichero}) resuelve controles sin la capa común de respaldo IA (formador.ts)`)
  }
  // Sin entradas muertas: cada pendiente es un adaptador registrado de verdad y su motivo no está vacío.
  const ficheros = new Set(regs.values())
  for (const [f, motivo] of Object.entries(PENDIENTES_RESPALDO_IA)) {
    assert.ok(ficheros.has(f), `PENDIENTES_RESPALDO_IA nombra ${f}, que no es un adaptador registrado`)
    assert.ok(motivo.trim().length >= 20, `PENDIENTES_RESPALDO_IA[${f}] sin motivo`)
  }
})

test('ningún fichero de src/adapters/** pulsa por su cuenta (`.click()`): las acciones van por ctx (guard) con el locator de la capa', () => {
  const todos = ficherosAdaptadores()
  assert.ok(todos.length >= 10, `se esperaban los ficheros de adaptadores (${todos.length})`)
  for (const f of new Set([...todos, ...registrados().values()])) {
    const m = llamadas(leer(f)).metodos
    assert.ok(!PULSA_DIRECTO.some((x) => m.has(x)), `${f} llama a .click()/.dblclick()/.tap() directamente`)
  }
})

test('llamadas (AST): un nombre dentro de un comentario o de una cadena no cuenta como uso', () => {
  assert.equal(usaCapa(`const a = 'conRespaldoIA(x)'\n// campoConRespaldo(y)\nconst b = \`resolverConFormador(z)\``), false)
  assert.equal(usaCapa(`const r = await conRespaldoIA(page, f, fijo, p) // nota`), true)
  assert.ok(llamadas(`await loc.click()`).metodos.has('click'))
  assert.ok(!llamadas(`log('nunca loc.click()') // loc.click()`).metodos.has('click'))
})

test('capa común: el respaldo valida SIEMPRE (resolverConFormador → validarResolucion) y respeta el PLAN B (presupuesto)', () => {
  const src = sinComentarios(leer('formador.ts'))
  const capa = src.slice(src.indexOf('export async function conRespaldoIA'), src.indexOf('// ─── Modo acompañado'))
  assert.match(capa, /if \(!esHuecoDeSelector\(e\)\) throw e/, 'solo un hueco de selector consulta el respaldo')
  assert.match(capa, /const r = await resolverConFormador\(page, formador, p\)/, 'conRespaldoIA pasa por resolverConFormador')
  assert.match(capa, /if \(!r\) throw e/, 'sin respaldo, el error ORIGINAL (con inventario)')
  assert.match(capa, /const res = await resolverConFormador\(r\.page, r\.formador, \{/, 'campoConRespaldo pasa por resolverConFormador')
  const resolver = src.slice(src.indexOf('export async function resolverConFormador'), src.indexOf('// ─── CAPA COMÚN'))
  assert.match(resolver, /if \(!quedaPresupuestoIA\(ctx\.usoIA\)\)/, 'sin presupuesto de IA no se pregunta (plan B)')
  assert.ok(resolver.indexOf('quedaPresupuestoIA(') < resolver.indexOf("llamar<{ indice?"), 'el presupuesto se mira ANTES de llamar a la IA')
})

test('Mapfre: la entrada resuelve sus tres pulsaciones con respaldo (pestaña, opción y enlace de entrada)', () => {
  const src = sinComentarios(leer('adapters/mapfre/entrada.ts'))
  const menus = src.slice(src.indexOf('async function abrirPorMenus'))
  assert.equal([...menus.matchAll(/await conRespaldo\(page, ctx,/g)].length, 3)
  assert.match(menus, /clave: ACCION_ENLACE_ENTRADA/)
  assert.match(menus, /await ctx\.pulsarEnlaceEntrada\(enlace\)/, 'el enlace de entrada (fijo o IA) solo por la excepción exacta del guard')
})

/**
 * Funciones-STUB de hueco: una función de un adaptador cuyo cuerpo es SOLO `throw new ErrorMapa…(…)` (o devuelve una promesa
 * rechazada con él). Así murió el trabajo d7987f90 (lupa de Mapfre, 14/10/2026) sin preguntar a la IA ni atascarse. Un control
 * sin DOM grabado se localiza por la capa común (fijo → aprendido → IA → atasco), nunca con un stub.
 */
export function stubsDeHueco(fuente: string): string[] {
  const sf = ts.createSourceFile('x.ts', fuente, ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const esNuevoHueco = (e: ts.Expression | undefined) => !!e && ts.isNewExpression(e) && ts.isIdentifier(e.expression) && /^ErrorMapa/.test(e.expression.text)
  // `throw new ErrorMapa…` o `return Promise.reject(new ErrorMapa…)`
  const esRechazo = (e: ts.Expression | undefined) => !!e && ts.isCallExpression(e) && e.expression.getText(sf) === 'Promise.reject' && esNuevoHueco(e.arguments[0])
  const esHueco = (s: ts.Statement) => (ts.isThrowStatement(s) && esNuevoHueco(s.expression)) || (ts.isReturnStatement(s) && esRechazo(s.expression))
  const visitar = (n: ts.Node): void => {
    if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) && n.body && ts.isBlock(n.body)) {
      const st = n.body.statements
      if (st.length === 1 && esHueco(st[0]!)) out.push((n as ts.FunctionDeclaration).name?.getText(sf) ?? '(anónima)')
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return out
}

test('ningún adaptador registrado tiene una función-stub que solo lanza un hueco de mapa (va por la capa común)', () => {
  for (const f of new Set(registrados().values())) assert.deepEqual(stubsDeHueco(leer(f)), [], `${f}: stub de hueco sin respaldo IA/atasco`)
  assert.deepEqual(stubsDeHueco('export async function lupa(_p: unknown): Promise<void> {\n  throw new ErrorMapaIncompleto(\'x\', true)\n}'), ['lupa'])
  assert.deepEqual(stubsDeHueco('function g() { return Promise.reject(new ErrorMapaIncompleto(\'x\')) }'), ['g'], 'Promise.reject también')
  assert.deepEqual(stubsDeHueco('function f(a: number) { if (a) throw new ErrorMapaIncompleto(\'x\'); return 1 }'), [], 'un throw condicional no es stub')
})

test('Allianz Hogar (apagado, aún sin registrar) ya resuelve campos y SIGUIENTE por la capa común y sin stubs de hueco', () => {
  const src = leer('adapters/allianz/hogar.ts')
  assert.ok(usaCapa(src), 'hogar.ts debe pasar por conRespaldoIA/campoConRespaldo')
  assert.deepEqual(stubsDeHueco(src), [])
  assert.ok(!PULSA_DIRECTO.some((x) => llamadas(src).metodos.has(x)), 'hogar.ts no pulsa por su cuenta')
})
