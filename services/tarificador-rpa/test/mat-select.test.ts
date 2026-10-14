// Elegir opción en un `mat-select` COMÚN a todos los bots (pieza 4, 14/10/2026; src/mat-select.ts). Fixture SINTÉTICA de Angular
// Material: el desplegable abre un panel en `.cdk-overlay-container` (fuera del formulario) con `mat-option role=option`.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import { ErrorTarificador, pideInventarioDom } from '../src/errores.ts'
import { coincidenciaOpcion, elegirOpcionMatSelect, ErrorOpcionSinResolver } from '../src/mat-select.ts'
import { opcionPermitida, prepararFormador, type ContextoFormador } from '../src/formador.ts'

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => {
  await browser?.close()
})

async function preparar(html: string): Promise<{ page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<body>${html}</body>`)
  return { page, guard }
}

/** Un mat-select que abre su panel en el overlay; elegir una opción lo cierra y escribe el texto. `extra` = atributos de la opción n. */
function MAT(opciones: string[], o: { extraOpcion?: Record<number, string>; sinOpciones?: boolean } = {}): string {
  return `<form><label>Uso</label><mat-select id="uso" role="combobox" aria-controls="panel-uso">Seleccione</mat-select></form>
<div class="cdk-overlay-container"></div>
<script>
const OPS=${JSON.stringify(opciones)}; const EXTRA=${JSON.stringify(o.extraOpcion ?? {})}; window.__elegida=null
const cont=document.querySelector('.cdk-overlay-container')
document.getElementById('uso').addEventListener('click',()=>{ cont.innerHTML='<div id="panel-uso" role="listbox">'+${o.sinOpciones ? "''" : "OPS.map((t,i)=>'<mat-option role=\"option\" '+(EXTRA[i]||'')+' data-i=\"'+i+'\">'+t+'</mat-option>').join('')"}+'</div>'
  cont.insertAdjacentHTML('afterbegin','<div class="cdk-overlay-backdrop" style="position:fixed;left:0;top:0;width:5px;height:5px"></div>'); cont.querySelector('.cdk-overlay-backdrop').addEventListener('click',()=>{ cont.innerHTML='' })
  cont.querySelectorAll('mat-option').forEach((m)=>m.addEventListener('click',()=>{ window.__elegida=m.textContent; document.getElementById('uso').textContent=m.textContent; cont.innerHTML='' })) })
</script>`
}
const elegida = (page: Page) => page.evaluate(() => (window as unknown as { __elegida: string | null }).__elegida)
const abierto = (page: Page) => page.locator('.cdk-overlay-container mat-option').count()

test('coincidenciaOpcion: sin tildes ni mayúsculas, exacta o por palabras; ambigua y sin coincidencia NO adivinan', () => {
  assert.deepEqual(coincidenciaOpcion(['Alquiler', 'España', 'Europa'], ['ESPAÑA']), { indice: 1 })
  assert.deepEqual(coincidenciaOpcion(['Alquiler', 'Espana', 'Europa'], ['españa']), { indice: 1 })
  assert.deepEqual(coincidenciaOpcion(['Uso particular', 'Alquiler con conductor'], ['Particular']), { indice: 0 }, 'palabra entera contenida')
  assert.deepEqual(coincidenciaOpcion(['A', 'AM', 'A1'], ['A']), { indice: 0 }, 'la exacta gana a las que la contienen')
  assert.deepEqual(coincidenciaOpcion(['Particular', 'Particular'], ['particular']), { indice: null, motivo: 'ambigua' })
  assert.deepEqual(coincidenciaOpcion(['Uso particular', 'Particular especial'], ['particular']), { indice: null, motivo: 'ambigua' })
  assert.deepEqual(coincidenciaOpcion(['Alquiler'], ['Particular']), { indice: null, motivo: 'sin_coincidencia' })
  assert.deepEqual(coincidenciaOpcion(['Partic'], ['Particular']), { indice: null, motivo: 'sin_coincidencia' }, 'no vale un trozo de palabra')
  assert.deepEqual(coincidenciaOpcion(['Particular'], ['']), { indice: null, motivo: 'sin_coincidencia' })
  // Se prueba cada buscado en orden de preferencia.
  assert.deepEqual(coincidenciaOpcion(['Privado', 'Alquiler'], ['Particular', 'Privado']), { indice: 0 })
})

test('opciones con palabras de emisión/pago NO participan (ni por coincidencia ni por la IA)', () => {
  assert.deepEqual(coincidenciaOpcion(['Emitir póliza'], ['Emitir póliza']), { indice: null, motivo: 'sin_coincidencia' })
  assert.deepEqual(coincidenciaOpcion(['Contratar', 'Particular'], ['contratar']), { indice: null, motivo: 'sin_coincidencia' })
  for (const t of ['Emitir', 'Contratación', 'Pagar ahora', 'Baja', 'Grabar póliza', 'Firmar', 'Aceptar']) assert.equal(opcionPermitida(t), false, t)
  for (const t of ['Particular', 'España', 'B']) assert.equal(opcionPermitida(t), true, t)
})

test('elegirOpcionMatSelect: abre el panel del overlay, elige por coincidencia clara y comprueba que el desplegable lo enseña', async () => {
  const { page, guard } = await preparar(MAT(['Alquiler con conductor', 'Particular', 'Profesional']))
  const r = await elegirOpcionMatSelect(page.locator('#uso'), ['PARTICULAR'], { pulsar: (b) => pulsar(b, guard), etiqueta: 'uso del vehículo' })
  assert.deepEqual(r, { texto: 'Particular', origen: 'coincidencia' })
  assert.equal(await elegida(page), 'Particular')
  assert.equal(await abierto(page), 0)
})

test('sin coincidencia y sin formador: ErrorOpcionSinResolver (portal, pide inventario), panel cerrado (telón), nada elegido, sin el valor en el mensaje', async () => {
  const { page, guard } = await preparar(MAT(['Alquiler con conductor', 'Profesional']))
  const t0 = Date.now()
  await assert.rejects(
    () => elegirOpcionMatSelect(page.locator('#uso'), ['VALOR-SECRETO-ZZZ'], { pulsar: (b) => pulsar(b, guard), etiqueta: 'uso del vehículo' }),
    (e) => {
      assert.ok(e instanceof ErrorOpcionSinResolver && e instanceof ErrorTarificador)
      assert.equal(e.tipo, 'portal')
      assert.equal(e.transitorio, false)
      assert.ok(pideInventarioDom(e))
      assert.deepEqual(e.opciones, ['Alquiler con conductor', 'Profesional'])
      assert.ok(/Profesional/.test(e.message) && !/ZZZ/.test(e.message))
      return true
    },
  )
  assert.ok(Date.now() - t0 < 10_000, 'error rápido, no timeout')
  assert.equal(await elegida(page), null)
  assert.equal(await abierto(page), 0, 'el panel se cerró (clic en el telón, sin teclado)')
})

async function formadorConIA(elegir: (opciones: (string | null)[], descripcion: string) => number | null, llamadas: { sugerir: number; estructuras: (string | null)[][] }): Promise<ContextoFormador> {
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/sugerir')) {
      llamadas.sugerir++
      const cuerpo = JSON.parse(String(init?.body)) as { descripcion: string; estructura: { etiqueta: string | null }[] }
      const ops = cuerpo.estructura.map((c) => c.etiqueta)
      llamadas.estructuras.push(ops)
      return new Response(JSON.stringify({ indice: elegir(ops, cuerpo.descripcion) }))
    }
    return new Response(JSON.stringify({ formadorActivo: true, conocimiento: [], acompanamiento: { activo: false } }))
  }) as unknown as typeof fetch
  return prepararFormador({ trabajoId: '00000000-0000-4000-8000-000000000000', compania: 'mapfre', ramo: 'auto', apiUrl: 'https://x', secreto: 'x'.repeat(20), redactar: (t) => t, log: () => undefined, fetchImpl })
}

test('sin coincidencia clara: el FORMADOR recibe la lista de opciones como candidatos y su índice se aplica', async () => {
  const llamadas = { sugerir: 0, estructuras: [] as (string | null)[][] }
  const formador = await formadorConIA((ops, descripcion) => (/Valor buscado: «Particular»/.test(descripcion) ? ops.indexOf('Uso privado') : null), llamadas)
  const { page, guard } = await preparar(MAT(['Alquiler con conductor', 'Uso privado', 'Profesional']))
  const r = await elegirOpcionMatSelect(page.locator('#uso'), ['Particular'], { pulsar: (b) => pulsar(b, guard), formador, etiqueta: 'uso del vehículo' })
  assert.deepEqual(r, { texto: 'Uso privado', origen: 'ia' })
  assert.equal(await elegida(page), 'Uso privado')
  assert.equal(llamadas.sugerir, 1)
  assert.deepEqual(llamadas.estructuras[0], ['Alquiler con conductor', 'Uso privado', 'Profesional'])
})

test('con coincidencia clara NO se consulta a la IA', async () => {
  const llamadas = { sugerir: 0, estructuras: [] as (string | null)[][] }
  const formador = await formadorConIA(() => 0, llamadas)
  const { page, guard } = await preparar(MAT(['Alquiler', 'Particular']))
  await elegirOpcionMatSelect(page.locator('#uso'), 'particular', { pulsar: (b) => pulsar(b, guard), formador, etiqueta: 'uso' })
  assert.equal(llamadas.sugerir, 0)
})

test('la IA no resuelve (o devuelve un índice fuera de rango): el mismo error tipado, no un timeout', async () => {
  for (const respuesta of [null, 99, -1]) {
    const llamadas = { sugerir: 0, estructuras: [] as (string | null)[][] }
    const formador = await formadorConIA(() => respuesta, llamadas)
    const { page, guard } = await preparar(MAT(['Alquiler', 'Profesional']))
    await assert.rejects(() => elegirOpcionMatSelect(page.locator('#uso'), ['Particular'], { pulsar: (b) => pulsar(b, guard), formador, etiqueta: 'uso' }), (e) => e instanceof ErrorOpcionSinResolver, String(respuesta))
    assert.equal(await elegida(page), null)
  }
})

test('las opciones de emisión/pago no llegan a la IA ni se eligen: si solo hay esas, ni se pregunta', async () => {
  const llamadas = { sugerir: 0, estructuras: [] as (string | null)[][] }
  const formador = await formadorConIA(() => 0, llamadas)
  const { page, guard } = await preparar(MAT(['Emitir póliza', 'Contratar ahora']))
  await assert.rejects(() => elegirOpcionMatSelect(page.locator('#uso'), ['Emitir póliza'], { pulsar: (b) => pulsar(b, guard), formador, etiqueta: 'uso' }), (e) => e instanceof ErrorOpcionSinResolver)
  assert.equal(llamadas.sugerir, 0)
  assert.equal(await elegida(page), null)
  // Y mezcladas: la IA solo ve las permitidas.
  const l2 = { sugerir: 0, estructuras: [] as (string | null)[][] }
  const f2 = await formadorConIA(() => 0, l2)
  const b = await preparar(MAT(['Emitir póliza', 'Profesional']))
  await elegirOpcionMatSelect(b.page.locator('#uso'), ['Otra cosa'], { pulsar: (x) => pulsar(x, b.guard), formador: f2, etiqueta: 'uso' })
  assert.deepEqual(l2.estructuras[0], ['Profesional'])
  assert.equal(await elegida(b.page), 'Profesional')
})

test('GUARD: una opción que pasa por el guard con un manejador de contratar se bloquea y no se elige', async () => {
  const { page, guard } = await preparar(MAT(['Particular', 'Profesional'], { extraOpcion: { 0: `onclick="contratarPoliza()"` } }))
  await assert.rejects(() => elegirOpcionMatSelect(page.locator('#uso'), ['Particular'], { pulsar: (b) => pulsar(b, guard), etiqueta: 'uso' }), (e) => e instanceof EmisionBloqueadaError)
  assert.equal(await elegida(page), null)
})

test('desplegable ausente, deshabilitado, múltiple o que no abre opciones: error tipado con inventario', async () => {
  const { page, guard } = await preparar(MAT(['A']))
  const ctx = { pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard), etiqueta: 'uso' }
  await assert.rejects(() => elegirOpcionMatSelect(page.locator('#nada'), ['A'], ctx), (e) => e instanceof ErrorOpcionSinResolver && /no aparece/.test(e.message))
  await page.evaluate(() => document.getElementById('uso')!.setAttribute('aria-disabled', 'true'))
  await assert.rejects(() => elegirOpcionMatSelect(page.locator('#uso'), ['A'], ctx), (e) => e instanceof ErrorOpcionSinResolver && /deshabilitado/.test(e.message))
  await page.evaluate(() => { const u = document.getElementById('uso')!; u.setAttribute('aria-disabled', 'false'); u.setAttribute('aria-multiselectable', 'true') })
  await assert.rejects(() => elegirOpcionMatSelect(page.locator('#uso'), ['A'], ctx), (e) => e instanceof ErrorOpcionSinResolver && /múltiple/.test(e.message))
  const vacio = await preparar(MAT([], { sinOpciones: true }))
  await assert.rejects(() => elegirOpcionMatSelect(vacio.page.locator('#uso'), ['A'], { pulsar: (b) => pulsar(b, vacio.guard), etiqueta: 'uso', esperaMs: 500 }), (e) => e instanceof ErrorOpcionSinResolver && /no mostró opciones/.test(e.message))
})
