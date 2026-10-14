// GUARDIÁN de la REGLA «todo bot con IA detrás y aprendizaje» (Alberto, 14/10/2026; docs/TARIFICADOR-RPA.md).
// Todo adaptador REGISTRADO resuelve sus controles por la CAPA COMÚN de formador.ts (`conRespaldoIA`, `campoConRespaldo` o
// `resolverConFormador`): selector fijo → aprendido → IA, con la misma validación y el mismo guard. Un adaptador nuevo
// registrado sin pasar por ella hace fallar este test; la única salida es la lista de PENDIENTES, con su motivo escrito.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const SRC = join(import.meta.dirname, '..', 'src')
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Adaptadores registrados que AÚN no pasan por la capa común, con el porqué. Vaciarla es el objetivo; añadir uno exige
 * motivo y decisión de Alberto (no un «ya lo haré»).
 */
export const PENDIENTES_RESPALDO_IA: Readonly<Record<string, string>> = {
  'adapters/allianz/auto.ts': 'Allianz Moto: campos por selector fijo sin etiquetas reales grabadas (el respaldo de campo exige contrastar la etiqueta de la fila); los avances de pestaña ya van por el guard autorizado. F2 del plan de robustez.',
}

const USA_CAPA = /\b(conRespaldoIA|campoConRespaldo|resolverConFormador)\(/

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
    assert.match(sinComentarios(leer(fichero)), USA_CAPA, `${nombre} (${fichero}) resuelve controles sin la capa común de respaldo IA (formador.ts)`)
  }
  // Sin entradas muertas: cada pendiente es un adaptador registrado de verdad y su motivo no está vacío.
  const ficheros = new Set(regs.values())
  for (const [f, motivo] of Object.entries(PENDIENTES_RESPALDO_IA)) {
    assert.ok(ficheros.has(f), `PENDIENTES_RESPALDO_IA nombra ${f}, que no es un adaptador registrado`)
    assert.ok(motivo.trim().length >= 20, `PENDIENTES_RESPALDO_IA[${f}] sin motivo`)
  }
})

test('ningún adaptador pulsa por su cuenta (`.click()`): las acciones van por ctx (guard) con el locator que dé la capa', () => {
  for (const f of ['adapters/allianz/auto.ts', 'adapters/allianz/comunidades.ts', 'adapters/mapfre/auto.ts', 'adapters/mapfre/entrada.ts', 'adapters/mapfre/login.ts']) {
    assert.ok(!/\.(click|dblclick|tap)\(/.test(sinComentarios(leer(f))), `${f} llama a .click()/.tap() directamente`)
  }
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
