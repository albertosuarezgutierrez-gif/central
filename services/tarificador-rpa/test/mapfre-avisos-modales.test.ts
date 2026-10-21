// Mapfre · aviso modal AngularJS UI-Bootstrap sobre la home (v0.8.13). Páginas SINTÉTICAS con setContent, sin datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { cerrarAvisosModales } from '../src/adapters/mapfre/avisos.ts'
import { ErrorTarificador } from '../src/errores.ts'

let browser: Browser
before(async () => {
  const opciones = { headless: true }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

const MODAL = (cuerpo: string, escape: boolean) => `<!doctype html><html><body>
  <div id="m" role="dialog" class="modal fade in" style="display:block;position:fixed;inset:0;background:#ccc">
    <div class="modal-dialog"><h4 class="modal-title">Novedades 2026</h4><p>${cuerpo}</p>
      <button class="close" id="x" aria-label="Cerrar">×</button><button id="otro">Ver más</button></div></div>
  <script>
    const cerrar = () => document.getElementById('m').remove()
    document.getElementById('x').onclick = cerrar
    ${escape ? "document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar() })" : ''}
    document.getElementById('otro').onclick = () => { window.otroPulsado = 1 }
  </script></body></html>`

async function pagina(html: string): Promise<Page> {
  const p = await browser.newPage()
  p.setDefaultTimeout(2_000)
  await p.setContent(html)
  return p
}
function ctxDe() {
  const pulsados: string[] = []
  const logs: Array<{ m: string; d?: Record<string, unknown> }> = []
  return {
    pulsados, logs,
    ctx: {
      pulsar: async (b: import('playwright').Locator) => { pulsados.push(((await b.innerText()) || '').trim()); await b.click() },
      pausa: async () => undefined,
      log: (m: string, d?: Record<string, unknown>) => { logs.push({ m, d }) },
    },
  }
}

test('modal cerrado con Escape: sin pulsar nada y con el título en el log', async () => {
  const p = await pagina(MODAL('Texto de la noticia.', true))
  const { ctx, pulsados, logs } = ctxDe()
  await cerrarAvisosModales(p, ctx)
  assert.equal(await p.locator('#m').count(), 0)
  assert.deepEqual(pulsados, [])
  assert.equal(logs[0]!.m, 'aviso_modal_portal')
  assert.match(String(logs[0]!.d?.titulo), /Novedades/)
  await p.close()
})

test('Escape no basta: se pulsa «Cerrar» (×) por ctx.pulsar y no otros botones', async () => {
  const p = await pagina(MODAL('Texto de la noticia.', false))
  const { ctx, pulsados } = ctxDe()
  await cerrarAvisosModales(p, ctx)
  assert.equal(await p.locator('#m').count(), 0)
  assert.equal(pulsados.length, 1)
  assert.match(pulsados[0]!, /^(×|x|cerrar)$/i)
  assert.equal(await p.evaluate(() => (window as unknown as { otroPulsado?: number }).otroPulsado), undefined)
  await p.close()
})

test('modal con «emitir»: NO se pulsa nada y lanza portal con el texto', async () => {
  const p = await pagina(MODAL('Recuerde emitir la póliza antes del cierre.', false))
  const { ctx, pulsados } = ctxDe()
  await assert.rejects(cerrarAvisosModales(p, ctx), (e: unknown) => e instanceof ErrorTarificador && e.tipo === 'portal' && /aviso modal del portal tapa la pantalla de inicio y no se pudo cerrar: «Novedades/.test(e.message))
  assert.deepEqual(pulsados, [])
  assert.equal(await p.locator('#m').count(), 1)
  await p.close()
})

test('sin control de cierre reconocible y sin Escape: lanza portal', async () => {
  const html = `<div role="dialog" class="modal in" style="display:block;position:fixed;inset:0"><p>Aviso</p><button>Ver más</button></div>`
  const p = await pagina(html)
  const { ctx, pulsados } = ctxDe()
  await assert.rejects(cerrarAvisosModales(p, ctx), (e: unknown) => e instanceof ErrorTarificador && e.tipo === 'portal')
  assert.deepEqual(pulsados, [])
  await p.close()
})

test('sin modal: no hace nada', async () => {
  const p = await pagina('<body><nav><a role="tab">Nueva producción</a></nav></body>')
  const { ctx, pulsados, logs } = ctxDe()
  await cerrarAvisosModales(p, ctx)
  assert.deepEqual(pulsados, [])
  assert.deepEqual(logs, [])
  await p.close()
})
