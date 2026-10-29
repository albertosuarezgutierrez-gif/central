// CEPO (29/10/2026, Alberto): la factura del huésped NUNCA se emite ni se envía sola. La única vía es el botón de
// Alberto: ✅ Enviar en Telegram (`fhu_emi` → `telegram-acciones.ts`) o el «Reenviar» de /sivra/facturas (sesión).
// El agente, al leer la petición de factura, solo prepara el borrador y se lo manda por Telegram.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('../../../', import.meta.url))
const leer = (rel: string) => readFileSync(join(APP, rel), 'utf8')

function fuentes(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) fuentes(p, out)
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(relative(APP, p).split('\\').join('/'))
  }
  return out
}
const TODAS = [...fuentes(join(APP, 'app')), ...fuentes(join(APP, 'lib'))]
const quienLlama = (fn: string) => TODAS.filter((f) => f !== 'lib/sivra/facturas/emitir.ts' && new RegExp(`\\b${fn}\\(`).test(leer(f))).sort()

test('emitirFactura solo la llama el ✅ de Telegram', () => {
  assert.deepEqual(quienLlama('emitirFactura'), ['lib/sivra/facturas/telegram-acciones.ts'])
})

test('enviarFactura solo la llaman el botón de Telegram y el «Reenviar» con sesión de /sivra/facturas', () => {
  assert.deepEqual(quienLlama('enviarFactura'), ['app/api/sivra/facturas/[id]/route.ts', 'lib/sivra/facturas/telegram-acciones.ts'])
  assert.match(leer('app/api/sivra/facturas/[id]/route.ts'), /const g = await exigirSesionFacturas\(\)\n\s*if \(!g\.ok\) return g\.respuesta/)
})

test('emitirFactura no tiene salto del ✅: sin mensaje vigente no emite nunca', () => {
  const emitir = leer('lib/sivra/facturas/emitir.ts')
  assert.doesNotMatch(emitir, /automatico/)
  const firma = emitir.slice(emitir.indexOf('export async function emitirFactura'), emitir.indexOf('): Promise<ResultadoEmision>'))
  assert.doesNotMatch(firma, /opts/)
  assert.match(emitir, /\n\s*if \(!mensajeVigente\(f\.telegram_message_id, mensajeId\)\) return \{ estado: 'obsoleta' \} as const/)
})

test('no hay cron de facturas de huésped (ni en el dispatcher ni como ruta)', () => {
  assert.doesNotMatch(leer('lib/cron-dispatch.ts'), /sivra-factura|factura[s-]*hu[eé]sped|salida-auto/i)
  assert.equal(existsSync(join(APP, 'app/api/cron/sivra-facturas-salida')), false)
  assert.doesNotMatch(leer('vercel.json'), /sivra-factura|salida/i)
})

test('el agente solo PREPARA: chat.ts y el orquestador no tocan emitir.ts ni telegram-acciones.ts', () => {
  for (const f of ['lib/sivra/facturas/chat.ts', 'lib/sivra/agente-huesped/orquestador.ts', 'lib/sivra/facturas/servicio.ts']) {
    const s = leer(f)
    assert.doesNotMatch(s, /from '[^']*\/emitir'|from '\.\/emitir'/, f)
    assert.doesNotMatch(s, /from '[^']*telegram-acciones'/, f)
    assert.doesNotMatch(s, /\b(emitirFactura|enviarFactura|resolverBotonFactura)\(/, f)
  }
  const orq = leer('lib/sivra/agente-huesped/orquestador.ts')
  const i = orq.indexOf('if (!estadoFactura?.completa) ctx.enlaceFactura = solFactura.url')
  assert.ok(i > 0 && orq.indexOf('proponerSiCompleta(solFactura.id)', i) > i, 'completa → borrador a Telegram')
})

test('proponerSiCompleta: un solo Telegram por solicitud (reclamo pendiente → completada antes del borrador)', () => {
  const chat = leer('lib/sivra/facturas/chat.ts')
  const fn = chat.slice(chat.indexOf('export async function proponerSiCompleta'))
  assert.match(fn, /SET estado = 'completada', completada_at = now\(\), updated_at = now\(\)\n\s*WHERE id = \$\{solicitudId\}::uuid AND estado = 'pendiente' RETURNING id::text/)
  assert.ok(fn.indexOf("RETURNING id::text") < fn.indexOf('prepararBorrador('), 'el reclamo va ANTES de preparar/enviar el Telegram')
  assert.match(fn, /if \(!reclamada\.length\) return 'ya'/)
})
