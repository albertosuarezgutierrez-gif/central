// Mapfre auto v0.8.49 · LEER las opciones del selector de «producto comercial» de cada tarjeta de Coberturas (abre, lee el overlay y cierra con Escape SIN elegir).
// Fixture FICTICIO (stepper + mat-select simulado con overlay); sin PII.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { ErrorTarificador } from '../src/errores.ts'
import { mapfreAuto, avisoProductosVistosMapfre, leerProductosVistosMapfre } from '../src/adapters/mapfre/auto.ts'
import {
  confirmarVehiculoMapfre, ErrorSelectorComercialAlteradoMapfre, instalarGuardEmision, leerOpcionesComercialesMapfre, pulsarContinuarMapfre, type GuardEmision,
} from '../src/guard.ts'

test('v0.8.49 · versión', () => assert.equal(mapfreAuto.version, '0.8.62'))

const MATRICULA = '1234BCD'
type Mutar = 'ninguna' | 'valor' | 'prima' | 'sinCierre'
const OPCIONES = ['TERCEROS', 'TERCEROS BÁSICO', 'TERCEROS PLUS 24H']

/** Stepper (Datos básicos → Objeto asegurado → Figuras → Coberturas) + diálogo de vehículo + 2 tarjetas; el selector comercial se simula con overlay. */
const PAGINA = (o: { mutar?: Mutar; sinPanel?: boolean; tarjeta2SinSelect?: boolean } = {}) => `<body>
<mat-step-header id="h" aria-selected="true">Datos básicos</mat-step-header>
<button onclick="siguiente()">Continuar</button>
<div id="vehiculo"></div>
<app-coberturas class="tarjetas">
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TERCEROS</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>PRIMA TOTAL: 238,37 €</strong></p></div></prima-producto>
 <prima-producto>${o.tarjeta2SinSelect ? '' : '<mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TERCEROS</span></mat-select>'}<div class="caja-primas"><p><strong>PRIMA TOTAL: 301,10 €</strong></p></div></prima-producto>
</app-coberturas>
<div class="cdk-overlay-container"></div>
<script>
const PASOS=['Datos básicos','Objeto asegurado','Figuras','Coberturas'];let paso=0;
const OPC=${JSON.stringify(OPCIONES)};
function siguiente(){paso++;document.getElementById('h').textContent=PASOS[paso];
 if(paso===1)document.getElementById('vehiculo').innerHTML='<div class="cdk-overlay-pane custom-dialog"><mat-dialog-container><app-matricula-dialog><h2>Selección de vehículo</h2><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th></tr></thead><tbody><tr class="mat-row"><td></td><td>${MATRICULA}</td><td>BASTIDOR-FICTICIO-0</td><td onclick="document.getElementById(\\'okv\\').disabled=false">VEHICULO FICTICIO</td></tr></tbody></table><button id="okv" disabled onclick="document.querySelector(\\'.custom-dialog\\').remove()">Aceptar</button></app-matricula-dialog></mat-dialog-container></div>'}
function abrir(sel){window.__aperturas=(window.__aperturas||0)+1;${o.sinPanel ? 'return' : ''}
 const actual=sel.querySelector('.mat-select-value-text').textContent;
 const p=document.createElement('div');p.className='cdk-overlay-pane';p.id='panel-comercial';
 p.innerHTML=OPC.map(t=>'<mat-option class="'+(t===actual?'mat-selected':'')+'" onclick="window.__elegida=1">'+t+'</mat-option>').join('');
 document.querySelector('.cdk-overlay-container').appendChild(p);window.__sel=sel}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;
 const p=document.getElementById('panel-comercial');if(!p)return;
 ${o.mutar === 'sinCierre' ? 'return' : 'p.remove()'};
 ${o.mutar === 'valor' ? "window.__sel.querySelector('.mat-select-value-text').textContent='TERCEROS BÁSICO'" : ''};
 ${o.mutar === 'prima' ? "document.querySelector('.caja-primas strong').textContent='PRIMA TOTAL: 999,99 €'" : ''}})
</script></body>`

let navegador: Browser
before(async () => {
  try { navegador = await chromium.launch({ headless: true }) } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    navegador = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => { await navegador?.close() })

async function preparar(html: string, hastaCoberturas = true): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await navegador.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(html)
  if (hastaCoberturas) {
    await pulsarContinuarMapfre(page, guard, 'datosBasicos')
    await confirmarVehiculoMapfre(page, guard, MATRICULA)
    await pulsarContinuarMapfre(page, guard, 'objetoAsegurado')
    await pulsarContinuarMapfre(page, guard, 'figuras')
  }
  return { context, page, guard }
}
const marca = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)

test('lee las opciones, marca la seleccionada, cierra SIN elegir y deja valor y prima intactos', async () => {
  const { context, page, guard } = await preparar(PAGINA())
  const r = await leerOpcionesComercialesMapfre(page, guard, 0)
  assert.deepEqual(r.opciones, OPCIONES)
  assert.equal(r.seleccionada, 'TERCEROS')
  assert.equal(await marca(page, '__elegida'), null, 'ninguna opción se pulsó')
  assert.equal(await page.locator('#panel-comercial').count(), 0, 'panel cerrado')
  assert.equal(await page.locator('mat-select.comercial .mat-select-value-text').first().textContent(), 'TERCEROS')
  assert.match((await page.locator('.caja-primas strong').first().textContent()) ?? '', /238,37/)
  // Una apertura por tarjeta y trabajo; otra tarjeta sí.
  await assert.rejects(() => leerOpcionesComercialesMapfre(page, guard, 0), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase')
  assert.equal(await marca(page, '__aperturas'), 1)
  assert.equal((await leerOpcionesComercialesMapfre(page, guard, 1)).opciones.length, 3)
  assert.equal(await marca(page, '__aperturas'), 2)
  await context.close()
})

test('fuera de orden (antes de calcular las primas): bloqueado sin abrir nada', async () => {
  const { context, page, guard } = await preparar(PAGINA(), false)
  await assert.rejects(() => leerOpcionesComercialesMapfre(page, guard, 0), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase')
  assert.equal(await marca(page, '__aperturas'), null)
  await context.close()
})

test('si al cerrar cambia el valor, la prima o el panel no se cierra: error portal ALTERADO (aborta)', async () => {
  for (const mutar of ['valor', 'prima', 'sinCierre'] as const) {
    const { context, page, guard } = await preparar(PAGINA({ mutar }))
    await assert.rejects(() => leerOpcionesComercialesMapfre(page, guard, 0), (e) => e instanceof ErrorSelectorComercialAlteradoMapfre && e.tipo === 'portal', mutar)
    await context.close()
  }
})

test('fallos blandos (selector ausente, overlay que no aparece): ErrorTarificador que NO es alterado', async () => {
  const a = await preparar(PAGINA({ tarjeta2SinSelect: true }))
  await assert.rejects(() => leerOpcionesComercialesMapfre(a.page, a.guard, 1), (e) => e instanceof ErrorTarificador && !(e instanceof ErrorSelectorComercialAlteradoMapfre) && /selector ausente/.test(e.message))
  await a.context.close()
  const b = await preparar(PAGINA({ sinPanel: true }))
  await assert.rejects(() => leerOpcionesComercialesMapfre(b.page, b.guard, 0), (e) => e instanceof ErrorTarificador && !(e instanceof ErrorSelectorComercialAlteradoMapfre) && /no apareció/.test(e.message))
  await b.context.close()
})

test('lector: recoge el comercial por tarjeta; el fallo blando queda como motivo; el alterado y el guard se propagan', async () => {
  const { context, page } = await preparar(PAGINA(), false)
  const v = await leerProductosVistosMapfre(page, async (i) => {
    if (i === 1) throw new ErrorTarificador('portal', 'selector ausente o no visible')
    return { opciones: OPCIONES, seleccionada: 'TERCEROS' }
  })
  assert.deepEqual(v.productos[0]!.comercial, { opciones: OPCIONES, seleccionada: 'TERCEROS' })
  assert.deepEqual(v.productos[1]!.comercial, { error: 'selector ausente o no visible' })
  await assert.rejects(() => leerProductosVistosMapfre(page, async () => { throw new ErrorSelectorComercialAlteradoMapfre('x') }), ErrorSelectorComercialAlteradoMapfre)
  await assert.rejects(() => leerProductosVistosMapfre(page, async () => { throw new EmisionBloqueadaError('fase', 'x') }), EmisionBloqueadaError)
  await context.close()
})

test('aviso: «TERCEROS [comercial: X (seleccionada) / Y / Z]», motivo del fallo y sin texto crudo/PII', () => {
  const a = avisoProductosVistosMapfre([
    { producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '', comercial: { opciones: OPCIONES, seleccionada: 'TERCEROS' } },
    { producto: 'TODO RIESGO', prima: 612.1, deshabilitado: false, texto: '', comercial: { error: 'selector ausente 12345678Z juan@ejemplo.test' } },
    { producto: 'PLUS', prima: null, deshabilitado: true, texto: 'no disponible', comercial: { opciones: ['A 123456789 pepe@x.es', 'B'], seleccionada: null } },
  ], null)
  assert.match(a, /TERCEROS \(prima 238,37€\) \[comercial: TERCEROS \(seleccionada\) \/ TERCEROS BÁSICO \/ TERCEROS PLUS 24H\]/)
  assert.match(a, /TODO RIESGO \(prima 612,10€\) \[selector comercial no leído: selector ausente/)
  assert.match(a, /PLUS \(deshabilitado: no disponible en el portal\) \[comercial: A [A-Z ]*\/ B\]/)
  assert.ok(!/12345678Z|juan@|pepe@|123456789/.test(a))
  assert.match(a, /solo se LEYERON las opciones/)
})
