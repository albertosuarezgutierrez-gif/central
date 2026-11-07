// Mapfre auto v0.8.58 · regresión del run real 457d81a4 (0 garantías, sin BASICar): el «diálogo desconocido» tras elegir la variante era TRANSITORIO
// (ya no estaba al leerlo) y la restauración dejó las tarjetas SIN importe → «Generar Proyecto» no guardaba → sin PDF → sin garantías.
// Fixtures FICTICIOS; sin PII.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { mapfreAuto, tarificarVariantesComercialesMapfre, type ProductoVistoMapfre, type TarjetaLeidaMapfre } from '../src/adapters/mapfre/auto.ts'
import {
  confirmarVehiculoMapfre, elegirOpcionComercialMapfre, ErrorSelectorComercialAlteradoMapfre, instalarGuardEmision, leerOpcionesComercialesMapfre,
  pulsarContinuarMapfre, type GuardEmision,
} from '../src/guard.ts'

test('v0.8.58 · versión', () => assert.equal(mapfreAuto.version, '0.8.62'))

const MATRICULA = '1234BCD'
const OPCIONES = ['TERCEROS', 'TERCEROS AMPLIADO', 'BASICar TERCEROS AMPLIADO']
type Modo = { dialogo?: 'transitorio' | 'persistente'; sinImporte?: boolean }

/** Elegir recalcula SOLO, mostrando un diálogo cuyo texto NO es de «Calculando»; `sinImporte`: la tarjeta 2 arranca sin prima y solo «Calcular» la repone. */
const PAGINA = (m: Modo = {}) => `<body>
<mat-step-header id="h" aria-selected="true">Datos básicos</mat-step-header>
<button onclick="siguiente()">Continuar</button>
<div id="vehiculo"></div>
<app-coberturas class="tarjetas">
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TERCEROS</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>PRIMA TOTAL: 238,37 €</strong></p></div></prima-producto>
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TERCEROS AMPLIADO</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>${m.sinImporte ? '' : 'PRIMA TOTAL: 355,07 €'}</strong></p></div></prima-producto>
 <button class="calc" onclick="calcular()"><mat-icon>calculate</mat-icon> Calcular</button>
</app-coberturas>
<div class="cdk-overlay-container"></div>
<script>
const PASOS=['Datos básicos','Objeto asegurado','Figuras','Coberturas'];let paso=0;
const OPC=${JSON.stringify(OPCIONES)};
const PRIMAS={'TERCEROS':'PRIMA TOTAL: 238,37 €','TERCEROS AMPLIADO':'PRIMA TOTAL: 355,07 €','BASICar TERCEROS AMPLIADO':'PRIMA TOTAL: 290,00 €'};
let pendiente=null;
function siguiente(){paso++;document.getElementById('h').textContent=PASOS[paso];
 if(paso===1)document.getElementById('vehiculo').innerHTML='<div class="cdk-overlay-pane custom-dialog"><mat-dialog-container><app-matricula-dialog><h2>Selección de vehículo</h2><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th></tr></thead><tbody><tr class="mat-row"><td></td><td>${MATRICULA}</td><td>BASTIDOR-FICTICIO-0</td><td onclick="document.getElementById(\\'okv\\').disabled=false">VEHICULO FICTICIO</td></tr></tbody></table><button id="okv" disabled onclick="document.querySelector(\\'.custom-dialog\\').remove()">Aceptar</button></app-matricula-dialog></mat-dialog-container></div>';
 if(paso===3&&${m.sinImporte ? 'true' : 'false'})pendiente=document.querySelectorAll('mat-select.comercial')[1]}
function abrir(sel){const actual=sel.querySelector('.mat-select-value-text').textContent;
 const p=document.createElement('div');p.className='cdk-overlay-pane';p.id='panel-comercial';
 p.innerHTML=OPC.map(t=>'<mat-option class="'+(t===actual?'mat-selected':'')+'" onclick="elegir(this)">'+t+'</mat-option>').join('');
 document.querySelector('.cdk-overlay-container').appendChild(p);window.__sel=sel}
function recalcular(sel,ms){const t=sel.querySelector('.mat-select-value-text').textContent;
 ${m.dialogo ? "const d=document.createElement('mat-dialog-container');d.innerHTML='<h2>Atención</h2><p>Un momento por favor</p>';document.body.appendChild(d);" : ''}
 setTimeout(()=>{${m.dialogo === 'persistente' ? '' : m.dialogo ? 'd.remove();' : ''}sel.closest('prima-producto').querySelector('.caja-primas strong').textContent=PRIMAS[t]},ms)}
function elegir(op){const t=op.textContent;const sel=window.__sel;
 document.getElementById('panel-comercial').remove();
 sel.querySelector('.mat-select-value-text').textContent=t;recalcular(sel,1500)}
function calcular(){window.__calculos=(window.__calculos||0)+1;if(pendiente){const s=pendiente;pendiente=null;recalcular(s,300)}}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const p=document.getElementById('panel-comercial');if(p)p.remove()})
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

async function preparar(html: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await navegador.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(html)
  await pulsarContinuarMapfre(page, guard, 'datosBasicos')
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  await pulsarContinuarMapfre(page, guard, 'objetoAsegurado')
  await pulsarContinuarMapfre(page, guard, 'figuras')
  for (const i of [0, 1]) await leerOpcionesComercialesMapfre(page, guard, i)
  return { context, page, guard }
}
const marca = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)

test('guard: diálogo de texto desconocido que se cierra SOLO (recálculo) → NO aborta; se lee la prima de la variante BASICar', async () => {
  const { context, page, guard } = await preparar(PAGINA({ dialogo: 'transitorio' }))
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES)
  assert.equal(e.valor, 'BASICar TERCEROS AMPLIADO')
  assert.match(e.textoPrima, /290,00/)
  assert.equal(e.recalculo, 'auto')
  assert.equal(await marca(page, '__calculos'), null, 'no se pulsa «Calcular» si el portal recalcula solo')
  await context.close()
})

test('CEPO: diálogo desconocido que NO se cierra → aborta como antes, con su texto saneado en el motivo', async () => {
  const { context, page, guard } = await preparar(PAGINA({ dialogo: 'persistente' }))
  await assert.rejects(() => elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES), (x) => x instanceof ErrorSelectorComercialAlteradoMapfre && /di[aá]logo desconocido/.test(x.message) && /momento por favor/.test(x.message))
  await context.close()
})

test('guard: la tarjeta YA muestra el producto pero SIN importe → no se reelige; se pulsa «Calcular» y vuelve la prima', async () => {
  const { context, page, guard } = await preparar(PAGINA({ sinImporte: true }))
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'TERCEROS AMPLIADO', OPCIONES)
  assert.equal(e.recalculo, 'calcular')
  assert.match(e.textoPrima, /355,07/)
  assert.equal(await marca(page, '__calculos'), 1)
  // Con importe ya a la vista: no se toca nada.
  const r = await elegirOpcionComercialMapfre(page, guard, 1, 'TERCEROS AMPLIADO', OPCIONES)
  assert.equal(r.recalculo, 'ninguno')
  assert.equal(await marca(page, '__calculos'), 1)
  await context.close()
})

// ───────────────────────── adaptador ─────────────────────────
const OPC = ['TERCEROS', 'TERCEROS AMPLIADO', 'BASICar TERCEROS AMPLIADO']
const vistos = (): ProductoVistoMapfre[] => [
  { producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '', comercial: { opciones: ['TERCEROS', 'TERCEROS AMPLIADO'], seleccionada: 'TERCEROS' } },
  { producto: 'TERCEROS AMPLIADO', prima: 355.07, deshabilitado: false, texto: '', comercial: { opciones: OPC, seleccionada: 'TERCEROS AMPLIADO' } },
]

test('adaptador: recuperación repide TAMBIÉN las tarjetas no tocadas que quedaron sin importe; con importes de vuelta → estado base confirmado', async () => {
  const pantalla: TarjetaLeidaMapfre[] = [{ valor: 'TERCEROS', prima: 'PRIMA TOTAL: 238,37 €' }, { valor: 'TERCEROS AMPLIADO', prima: 'PRIMA TOTAL: 355,07 €' }]
  const pedidas: number[] = []
  const r = await tarificarVariantesComercialesMapfre({} as Page, vistos(), [], async (_p, i, o) => {
    if (o.startsWith('BASICar')) { pantalla[0]!.prima = ''; pantalla[1]!.prima = ''; throw new ErrorSelectorComercialAlteradoMapfre('apareció un diálogo desconocido tras elegir la variante') }
    pedidas.push(i)
    if (pedidas.length > 1) pantalla[i]!.prima = i === 0 ? 'PRIMA TOTAL: 238,37 €' : 'PRIMA TOTAL: 355,07 €'
    return { valor: o, textoPrima: pantalla[i]!.prima, textoTarjeta: 'ANUAL', bloqueada: false }
  }, Date.now, async () => pantalla.map((t) => ({ ...t })), { leer: async () => [] })
  assert.ok(pedidas.includes(0), 'la tarjeta 1 (no tocada) también se recalcula')
  assert.equal(r.restaurado, true)
  assert.ok(r.notas.some((n) => /productos e importes originales confirmados/.test(n)))
  assert.ok(r.notas.some((n) => /transitorio/.test(n)), 'el diálogo que ya no estaba se anota como transitorio')
})
