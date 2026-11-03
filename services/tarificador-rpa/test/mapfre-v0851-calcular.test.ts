// Mapfre auto v0.8.51 · regresión del run real 49569458: las variantes «BASICar» ya NO van antes de «Generar Proyecto» (un fallo de restauración costaba el proyecto y las garantías),
// y tras elegir una variante, si el portal no recalcula solo, se pulsa «Calcular» (icono `calculate`). Fixtures FICTICIOS; sin PII.
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import {
  avisoProductosVistosMapfre, coberturasAccesiblesMapfre, mapfreAuto, tarificarVariantesComercialesMapfre,
  type PrimaProductoMapfre, type ProductoVistoMapfre, type TarjetaLeidaMapfre,
} from '../src/adapters/mapfre/auto.ts'
import {
  confirmarVehiculoMapfre, elegirOpcionComercialMapfre, ErrorSelectorComercialAlteradoMapfre, instalarGuardEmision, leerOpcionesComercialesMapfre,
  pulsarContinuarMapfre, type GuardEmision,
} from '../src/guard.ts'

test('v0.8.51 · versión', () => assert.equal(mapfreAuto.version, '0.8.56'))

const MATRICULA = '1234BCD'
const OPCIONES = ['TERCEROS', 'TERCEROS AMPLIADO', 'TODO RIESGO', 'BASICar TERCEROS AMPLIADO', 'BASICar TODO RIESGO']
type Modo = { mutaProducto?: boolean; auto?: boolean; sinBoton?: boolean; calcularTodas?: boolean; botonDoble?: boolean }

/** Elegir la opción NO recalcula (salvo `auto`): hay que pulsar «Calcular» (`<mat-icon>calculate</mat-icon> Calcular`), que tarda 300 ms (diálogo «Calculando»). */
const PAGINA = (m: Modo = {}) => `<body>
<mat-step-header id="h" aria-selected="true">Datos básicos</mat-step-header>
<button onclick="siguiente()">Continuar</button>
<div id="vehiculo"></div>
<app-coberturas class="tarjetas">
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TERCEROS</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>PRIMA TOTAL: 238,37 €</strong></p></div></prima-producto>
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TERCEROS AMPLIADO</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>PRIMA TOTAL: 301,10 €</strong></p></div></prima-producto>
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TODO RIESGO</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>Existen controles técnicos que impiden tarificar</strong></p></div></prima-producto>
 ${m.sinBoton || m.auto ? '' : '<button class="calc" onclick="calcular()"><mat-icon>calculate</mat-icon> Calcular</button>'}
 ${m.botonDoble ? '<button class="calc" onclick="calcular()"><mat-icon>calculate</mat-icon> Calcular</button>' : ''}
 <button onclick="window.__generar=1">Ir a generar proyecto</button>
</app-coberturas>
<div class="cdk-overlay-container"></div>
<script>
const PASOS=['Datos básicos','Objeto asegurado','Figuras','Coberturas'];let paso=0;
const OPC=${JSON.stringify(OPCIONES)};
const PRIMAS={'TERCEROS':'PRIMA TOTAL: 238,37 €','TERCEROS AMPLIADO':'PRIMA TOTAL: 301,10 €','TODO RIESGO':'Existen controles técnicos que impiden tarificar','BASICar TERCEROS AMPLIADO':'PRIMA TOTAL: 1.234,50 €','BASICar TODO RIESGO':'Existen controles técnicos que impiden tarificar'};
let pendiente=null;
function siguiente(){paso++;document.getElementById('h').textContent=PASOS[paso];
 if(paso===1)document.getElementById('vehiculo').innerHTML='<div class="cdk-overlay-pane custom-dialog"><mat-dialog-container><app-matricula-dialog><h2>Selección de vehículo</h2><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th></tr></thead><tbody><tr class="mat-row"><td></td><td>${MATRICULA}</td><td>BASTIDOR-FICTICIO-0</td><td onclick="document.getElementById(\\'okv\\').disabled=false">VEHICULO FICTICIO</td></tr></tbody></table><button id="okv" disabled onclick="document.querySelector(\\'.custom-dialog\\').remove()">Aceptar</button></app-matricula-dialog></mat-dialog-container></div>'}
function abrir(sel){const actual=sel.querySelector('.mat-select-value-text').textContent;
 const p=document.createElement('div');p.className='cdk-overlay-pane';p.id='panel-comercial';
 p.innerHTML=OPC.map(t=>'<mat-option class="'+(t===actual?'mat-selected':'')+'" onclick="elegir(this)">'+t+'</mat-option>').join('');
 document.querySelector('.cdk-overlay-container').appendChild(p);window.__sel=sel}
function recalcular(sel){const t=sel.querySelector('.mat-select-value-text').textContent;
 const d=document.createElement('mat-dialog-container');d.textContent='Calculando las primas';document.body.appendChild(d);
 setTimeout(()=>{d.remove();sel.closest('prima-producto').querySelector('.caja-primas strong').textContent=PRIMAS[t];
  ${m.mutaProducto ? "document.querySelectorAll('.mat-select-value-text')[0].textContent='OTRO PRODUCTO';" : ''}
  ${m.calcularTodas ? "document.querySelectorAll('.caja-primas strong')[0].textContent='PRIMA TOTAL: 240,00 €';" : ''}
 },300)}
function elegir(op){const t=op.textContent;const sel=window.__sel;window.__elegidas=(window.__elegidas||[]).concat([t]);
 document.getElementById('panel-comercial').remove();
 sel.querySelector('.mat-select-value-text').textContent=t;pendiente=sel;
 ${m.auto ? 'recalcular(sel);pendiente=null;' : ''}}
function calcular(){window.__calculos=(window.__calculos||0)+1;if(pendiente){const s=pendiente;pendiente=null;recalcular(s)}}
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
  for (const i of [0, 1, 2]) await leerOpcionesComercialesMapfre(page, guard, i)
  return { context, page, guard }
}
const marca = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)
const primaDe = (page: Page, i: number) => page.locator('.caja-primas strong').nth(i).textContent()

test('guard: el portal NO recalcula al elegir → pulsa «Calcular» (icono calculate) UNA vez y lee la prima nueva', async () => {
  const { context, page, guard } = await preparar(PAGINA())
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES)
  assert.equal(e.recalculo, 'calcular')
  assert.match(e.textoPrima, /1\.234,50/)
  assert.equal(await marca(page, '__calculos'), 1)
  assert.equal(await marca(page, '__generar'), null, 'no se toca «Ir a generar proyecto»')
  assert.match(await primaDe(page, 0) ?? '', /238,37/)
  const r = await elegirOpcionComercialMapfre(page, guard, 1, 'TERCEROS AMPLIADO', OPCIONES)
  assert.equal(r.recalculo, 'calcular')
  assert.match(r.textoPrima, /301,10/, 'la restauración también recalcula con «Calcular»')
  assert.equal(await marca(page, '__calculos'), 2)
  await context.close()
})

test('guard: si el portal recalcula solo NO se pulsa «Calcular»', async () => {
  const { context, page, guard } = await preparar(PAGINA({ auto: true }))
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES)
  assert.equal(e.recalculo, 'auto')
  assert.match(e.textoPrima, /1\.234,50/)
  assert.equal(await marca(page, '__calculos'), null)
  await context.close()
})

test('guard: sin recálculo y sin botón «Calcular» → recalculo «ninguno» (la prima vieja NO se presenta como la de la variante)', async () => {
  const { context, page, guard } = await preparar(PAGINA({ sinBoton: true }))
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES)
  assert.equal(e.recalculo, 'ninguno')
  assert.match(e.textoPrima, /301,10/)
  await context.close()
})

test('guard: dos botones «Calcular» visibles → ambiguo, no se pulsa ninguno', async () => {
  const { context, page, guard } = await preparar(PAGINA({ botonDoble: true }))
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES)
  assert.equal(e.recalculo, 'ninguno')
  assert.equal(await marca(page, '__calculos'), null)
  await context.close()
})

test('guard: «Calcular» que recalcula OTRAS tarjetas → se anota (importes) y se sigue; un cambio de producto sí aborta', async () => {
  const { context, page, guard } = await preparar(PAGINA({ calcularTodas: true }))
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES)
  assert.equal(e.recalculo, 'calcular')
  assert.deepEqual(e.otrasPrimas, ['tarjeta 1: 240,00 € (antes 238,37 €)'])
  await context.close()
  const t = await preparar(PAGINA({ mutaProducto: true }))
  await assert.rejects(() => elegirOpcionComercialMapfre(t.page, t.guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES), (x) => x instanceof ErrorSelectorComercialAlteradoMapfre)
  await t.context.close()
})

// ───────────────────────── adaptador ─────────────────────────
const OPC1 = ['TERCEROS', 'TERCEROS AMPLIADO', 'BASICar TERCEROS AMPLIADO']
const vistos = (): ProductoVistoMapfre[] => [
  { producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '', comercial: { opciones: OPC1, seleccionada: 'TERCEROS' } },
  { producto: 'TERCEROS AMPLIADO', prima: 301.1, deshabilitado: false, texto: '', comercial: { opciones: OPC1, seleccionada: 'TERCEROS AMPLIADO' } },
]
const PRIMAS: PrimaProductoMapfre[] = [
  { producto: 'TERCEROS', periodicidad: 'anual', primaTotalEur: 238.37, requiereVerificacionVehiculo: false },
  { producto: 'TERCEROS AMPLIADO', periodicidad: 'anual', primaTotalEur: 301.1, requiereVerificacionVehiculo: false },
]
type Est = Awaited<ReturnType<Parameters<typeof tarificarVariantesComercialesMapfre>[3]>>
const est = (valor: string, prima: string, extra: Partial<Est> = {}): Est => ({ valor, textoPrima: prima, textoTarjeta: `${valor} ANUAL ${prima}`, bloqueada: prima === '', ...extra })

test('adaptador: variante sin recálculo → no_leida con motivo «sin recálculo» y sin prima ofertada', async () => {
  const v = vistos()
  const r = await tarificarVariantesComercialesMapfre({} as Page, v, PRIMAS, async (_p, _i, o) => (o === 'BASICar TERCEROS AMPLIADO' ? est(o, 'PRIMA TOTAL: 301,10 €', { recalculo: 'ninguno' }) : est(o, o === 'TERCEROS AMPLIADO' ? 'PRIMA TOTAL: 301,10 €' : 'PRIMA TOTAL: 238,37 €')))
  assert.deepEqual(r.primas, [])
  assert.equal(v[1]!.variantes![0]!.estado, 'no_leida')
  assert.match(v[1]!.variantes![0]!.motivo!, /sin recálculo/)
  assert.match(avisoProductosVistosMapfre(v, null, r.notas), /BASICar TERCEROS AMPLIADO \(no leída: sin recálculo/)
})

test('adaptador: restauración sin confirmar por la elección pero CONFIRMADA por la relectura → restaurado=true, nota con visto vs esperado, sin abortar', async () => {
  const v = vistos()
  const elegir = async (_p: Page, _i: number, o: string): Promise<Est> =>
    o === 'BASICar TERCEROS AMPLIADO' ? est(o, 'PRIMA TOTAL: 1.234,50 €') : o === 'TERCEROS AMPLIADO' ? est(o, 'PRIMA TOTAL: 777,00 €') : est(o, 'PRIMA TOTAL: 238,37 €')
  const releer = async (): Promise<TarjetaLeidaMapfre[]> => [{ valor: 'TERCEROS', prima: 'PRIMA TOTAL: 238,37 €' }, { valor: 'TERCEROS AMPLIADO', prima: 'PRIMA TOTAL: 310,00 €' }]
  const r = await tarificarVariantesComercialesMapfre({} as Page, v, PRIMAS, elegir, Date.now, releer)
  assert.equal(r.restaurado, true)
  assert.equal(r.primas.length, 1, 'la variante leída se conserva')
  const n = r.notas.join(' | ')
  assert.match(n, /restauración de «TERCEROS AMPLIADO»: producto visto «TERCEROS AMPLIADO» vs esperado «TERCEROS AMPLIADO»; prima vista 777,00€ vs esperada 301,10€/)
  assert.match(n, /primas de las tarjetas distintas tras restaurar: TERCEROS AMPLIADO: 310,00€ \(leída antes 301,10€\)/)
})

test('adaptador: restauración sin confirmar y relectura con otro producto → restaurado=false con el motivo; no lanza', async () => {
  const v = vistos()
  const elegir = async (_p: Page, _i: number, o: string): Promise<Est> => (o === 'BASICar TERCEROS AMPLIADO' ? est(o, 'PRIMA TOTAL: 1.234,50 €') : est('BASICar TERCEROS AMPLIADO', 'PRIMA TOTAL: 1.234,50 €'))
  const releer = async (): Promise<TarjetaLeidaMapfre[]> => [{ valor: 'TERCEROS', prima: '' }, { valor: 'BASICar TERCEROS AMPLIADO', prima: '' }]
  const r = await tarificarVariantesComercialesMapfre({} as Page, v, PRIMAS, elegir, Date.now, releer)
  assert.equal(r.restaurado, false)
  assert.ok(r.notas.some((x) => /producto visto «BASICar TERCEROS AMPLIADO» vs esperado «TERCEROS AMPLIADO»/.test(x) && /relectura sin confirmar/.test(x)))
  assert.ok(r.notas.some((x) => /NO verificada/.test(x) && /a salvo/.test(x)))
  // Sin `releer` tampoco se aborta: restaurado=false y se informa.
  const r2 = await tarificarVariantesComercialesMapfre({} as Page, vistos(), PRIMAS, async () => { throw new ErrorSelectorComercialAlteradoMapfre('x') })
  assert.equal(r2.restaurado, false)
})

test('adaptador: «Calcular» que cambia otras tarjetas deja nota con los importes', async () => {
  const r = await tarificarVariantesComercialesMapfre({} as Page, vistos(), PRIMAS, async (_p, _i, o) => (o === 'BASICar TERCEROS AMPLIADO' ? est(o, 'PRIMA TOTAL: 1.234,50 €', { recalculo: 'calcular', otrasPrimas: ['tarjeta 1: 240,00 € (antes 238,37 €)'] }) : est(o, o === 'TERCEROS AMPLIADO' ? 'PRIMA TOTAL: 301,10 €' : 'PRIMA TOTAL: 238,37 €')))
  assert.ok(r.notas.some((n) => /«Calcular» cambió la prima de otras tarjetas.*240,00 € \(antes 238,37 €\)/.test(n)))
  assert.equal(r.primas.length, 1)
})

test('coberturasAccesiblesMapfre: misma pantalla → null; otro nº de tarjetas o producto → motivo', async () => {
  const { context, page } = await preparar(PAGINA())
  const tres: ProductoVistoMapfre[] = [...vistos(), { producto: 'TODO RIESGO', prima: null, deshabilitado: false, texto: '', comercial: { opciones: OPCIONES, seleccionada: 'TODO RIESGO' } }]
  assert.equal(await coberturasAccesiblesMapfre(page, tres), null)
  assert.match((await coberturasAccesiblesMapfre(page, vistos())) ?? '', /3 tarjeta\(s\)/)
  await page.evaluate(() => { document.querySelectorAll('.mat-select-value-text')[0]!.textContent = 'OTRO' })
  assert.match((await coberturasAccesiblesMapfre(page, tres)) ?? '', /tarjeta 1/)
  await context.close()
})

test('cableado (0.8.56): variantes ANTES de «Generar Proyecto», tras las garantías base de pantalla; sin restauración verificada no se genera el proyecto; auto.ts sin «Continuar» ni clics directos', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/adapters/mapfre/auto.ts'), 'utf8')
  const cuerpo = src.slice(src.indexOf('export async function precioDesdeObjetoAsegurado'), src.indexOf('export const mapfreAuto'))
  const iGen = cuerpo.indexOf('await ctx.generarProyectoMapfre(nsei')
  const iPdf = cuerpo.indexOf('await descargarProyectoAuto(')
  const iGarPant = cuerpo.indexOf('garantiasPantalla = await leerGarantiasPantallaMapfre(')
  const iVar = cuerpo.indexOf('\n  await probarVariantes()')
  const iOfertas = cuerpo.indexOf('return { ofertas:')
  assert.ok(iGarPant > -1 && iVar > iGarPant && iGen > iVar && iPdf > iGen && iOfertas > iPdf, 'orden: garantías base de pantalla → variantes → proyecto → PDF → ofertas')
  assert.equal(cuerpo.split('probarVariantes()').length - 1, 1, 'las variantes se prueban una sola vez')
  assert.match(cuerpo.slice(iVar, iGen), /!variantes\.restaurado/, 'el proyecto depende de la restauración verificada')
  const variantes = src.slice(src.indexOf('export async function tarificarVariantesComercialesMapfre'), src.indexOf('/** Primas → ofertas normalizadas'))
  assert.ok(!/\.click\(|\.selectOption\(|\.dispatchEvent\(|Continuar|\.press\(|\.fill\(/.test(variantes), 'sin clics directos ni «Continuar» en la tarificación de variantes')
  const guard = readFileSync(join(import.meta.dirname, '../src/guard.ts'), 'utf8')
  const fn = guard.slice(guard.indexOf('export async function elegirOpcionComercialMapfre'), guard.indexOf('// ─────────── Diagnóstico de pantalla SIN datos personales'))
  assert.ok(fn.indexOf('comprobarBoton(await descripcion(boton))') > -1 && fn.indexOf('comprobarBoton(await descripcion(boton))') < fn.indexOf("clicSinDialogoNativo(page, guard, boton, 'Calcular"), 'comprobarBoton antes del clic de «Calcular»')
  assert.match(fn, /RE_ROTULO_CALCULAR/)
  assert.match(guard, /const RE_ROTULO_CALCULAR = \/\^\\s\*\(\?:calculate\\s\*\)\?Calcular\\s\*\$\/i/, 'rótulo exacto «Calcular» (con o sin icono)')
})
