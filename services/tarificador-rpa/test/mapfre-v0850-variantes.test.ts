// Mapfre auto v0.8.50 · tarificar las variantes comerciales «BASICar …»: elegir en UNA tarjeta, esperar el recálculo, leer la prima y RESTAURAR la selección original.
// Fixtures FICTICIOS (stepper + mat-select simulado con overlay y recálculo con retraso); sin PII.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { ErrorTarificador } from '../src/errores.ts'
import {
  avisoProductosVistosMapfre, mapfreAuto, ofertasDesdePrimasMapfre, tarificarVariantesComercialesMapfre, MAX_VARIANTES_COMERCIALES_MAPFRE,
  type PrimaProductoMapfre, type ProductoVistoMapfre,
} from '../src/adapters/mapfre/auto.ts'
import {
  confirmarVehiculoMapfre, elegirOpcionComercialMapfre, ErrorSelectorComercialAlteradoMapfre, instalarGuardEmision, leerOpcionesComercialesMapfre, MAX_CAMBIOS_COMERCIALES_MAPFRE,
  pulsarContinuarMapfre, type GuardEmision,
} from '../src/guard.ts'

test('v0.8.50 · versión', () => assert.equal(mapfreAuto.version, '0.8.50'))

const MATRICULA = '1234BCD'
const OPCIONES = ['TERCEROS', 'TERCEROS AMPLIADO', 'TODO RIESGO', 'BASICar TERCEROS AMPLIADO', 'BASICar TODO RIESGO']
type Mutar = 'ninguna' | 'otraTarjeta' | 'dialogo' | 'dialogoControles'

/** Tarjetas: TERCEROS 238,37 · TERCEROS AMPLIADO 301,10 · TODO RIESGO (bloqueada). El recálculo tarda 300 ms (diálogo «Calculando»); BASICar TODO RIESGO sale bloqueada. */
const PAGINA = (o: { mutar?: Mutar } = {}) => `<body>
<mat-step-header id="h" aria-selected="true">Datos básicos</mat-step-header>
<button onclick="siguiente()">Continuar</button>
<div id="vehiculo"></div>
<app-coberturas class="tarjetas">
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TERCEROS</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>PRIMA TOTAL: 238,37 €</strong></p></div></prima-producto>
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TERCEROS AMPLIADO</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>PRIMA TOTAL: 301,10 €</strong></p></div></prima-producto>
 <prima-producto><mat-select class="comercial" onclick="abrir(this)"><span class="mat-select-value-text">TODO RIESGO</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>Existen controles técnicos que impiden tarificar</strong></p></div></prima-producto>
</app-coberturas>
<div class="cdk-overlay-container"></div>
<script>
const PASOS=['Datos básicos','Objeto asegurado','Figuras','Coberturas'];let paso=0;
const OPC=${JSON.stringify(OPCIONES)};
const PRIMAS={'TERCEROS':'PRIMA TOTAL: 238,37 €','TERCEROS AMPLIADO':'PRIMA TOTAL: 301,10 €','TODO RIESGO':'Existen controles técnicos que impiden tarificar','BASICar TERCEROS AMPLIADO':'PRIMA TOTAL: 1.234,50 €','BASICar TODO RIESGO':'Existen controles técnicos que impiden tarificar'};
function siguiente(){paso++;document.getElementById('h').textContent=PASOS[paso];
 if(paso===1)document.getElementById('vehiculo').innerHTML='<div class="cdk-overlay-pane custom-dialog"><mat-dialog-container><app-matricula-dialog><h2>Selección de vehículo</h2><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th></tr></thead><tbody><tr class="mat-row"><td></td><td>${MATRICULA}</td><td>BASTIDOR-FICTICIO-0</td><td onclick="document.getElementById(\\'okv\\').disabled=false">VEHICULO FICTICIO</td></tr></tbody></table><button id="okv" disabled onclick="document.querySelector(\\'.custom-dialog\\').remove()">Aceptar</button></app-matricula-dialog></mat-dialog-container></div>'}
function abrir(sel){window.__aperturas=(window.__aperturas||0)+1;
 const actual=sel.querySelector('.mat-select-value-text').textContent;
 const p=document.createElement('div');p.className='cdk-overlay-pane';p.id='panel-comercial';
 p.innerHTML=OPC.map(t=>'<mat-option class="'+(t===actual?'mat-selected':'')+'" onclick="elegir(this)">'+t+'</mat-option>').join('');
 document.querySelector('.cdk-overlay-container').appendChild(p);window.__sel=sel}
function elegir(op){const t=op.textContent;const sel=window.__sel;window.__elegidas=(window.__elegidas||[]).concat([t]);
 document.getElementById('panel-comercial').remove();
 sel.querySelector('.mat-select-value-text').textContent=t;
 const caja=sel.closest('prima-producto').querySelector('.caja-primas strong');
 const d=document.createElement('mat-dialog-container');d.textContent='Calculando las primas';document.body.appendChild(d);
 setTimeout(()=>{d.remove();caja.textContent=PRIMAS[t];
  ${o.mutar === 'otraTarjeta' ? "document.querySelectorAll('.caja-primas strong')[0].textContent='PRIMA TOTAL: 999,99 €';" : ''}
  ${o.mutar === 'dialogo' ? "const x=document.createElement('mat-dialog-container');x.textContent='Desea hacer algo inesperado';document.body.appendChild(x);" : ''}
  ${o.mutar === 'dialogoControles' ? "const x=document.createElement('mat-dialog-container');x.className='controles-tecnicos-dialog';x.innerHTML='<h2>Controles técnicos</h2><p>Código 123 variante no tarificable</p><button onclick=\"this.parentElement.remove()\">Cerrar</button>';document.body.appendChild(x);" : ''}
 },300)}
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

async function preparar(html: string, leer: number[] = [0, 1, 2]): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await navegador.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(html)
  await pulsarContinuarMapfre(page, guard, 'datosBasicos')
  await confirmarVehiculoMapfre(page, guard, MATRICULA)
  await pulsarContinuarMapfre(page, guard, 'objetoAsegurado')
  await pulsarContinuarMapfre(page, guard, 'figuras')
  for (const i of leer) await leerOpcionesComercialesMapfre(page, guard, i)
  return { context, page, guard }
}
const marca = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)
const primaDe = (page: Page, i: number) => page.locator('.caja-primas strong').nth(i).textContent()
const valorDe = (page: Page, i: number) => page.locator('mat-select.comercial .mat-select-value-text').nth(i).textContent()

test('guard: elige la variante por texto exacto, espera el recálculo, lee la prima, no toca otras tarjetas y se restaura', async () => {
  const { context, page, guard } = await preparar(PAGINA())
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES)
  assert.equal(e.valor, 'BASICar TERCEROS AMPLIADO')
  assert.match(e.textoPrima, /1\.234,50/)
  assert.equal(e.bloqueada, false)
  assert.match(await primaDe(page, 0) ?? '', /238,37/, 'otra tarjeta intacta')
  assert.deepEqual(await marca(page, '__elegidas'), ['BASICar TERCEROS AMPLIADO'])
  const r = await elegirOpcionComercialMapfre(page, guard, 1, 'TERCEROS AMPLIADO', OPCIONES)
  assert.equal(r.valor, 'TERCEROS AMPLIADO')
  assert.match(r.textoPrima, /301,10/)
  assert.deepEqual(await marca(page, '__elegidas'), ['BASICar TERCEROS AMPLIADO', 'TERCEROS AMPLIADO'])
  await context.close()
})

test('guard: una variante bloqueada (controles técnicos) se devuelve como bloqueada, sin prima', async () => {
  const { context, page, guard } = await preparar(PAGINA())
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TODO RIESGO', OPCIONES)
  assert.equal(e.bloqueada, true)
  assert.match(e.textoTarjeta, /controles técnicos/i)
  await context.close()
})

test('guard: la opción tiene que estar en la lista cerrada leída; la tarjeta tiene que haberse leído; sin abrir nada', async () => {
  const { context, page, guard } = await preparar(PAGINA(), [1])
  for (const mala of ['TODO', 'basicar todo riesgo', '', 'BASICar TERCEROS AMPLIADO ']) {
    const permitidas = mala === 'BASICar TERCEROS AMPLIADO ' ? ['TERCEROS AMPLIADO'] : OPCIONES
    await assert.rejects(() => elegirOpcionComercialMapfre(page, guard, 1, mala, permitidas), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase', mala)
  }
  await assert.rejects(() => elegirOpcionComercialMapfre(page, guard, 2, 'BASICar TODO RIESGO', OPCIONES), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase', 'tarjeta 2 sin leer')
  await assert.rejects(() => elegirOpcionComercialMapfre(page, guard, 99, 'BASICar TODO RIESGO', OPCIONES), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase')
  assert.equal(await marca(page, '__aperturas'), 1, 'solo la apertura de la lectura')
  await context.close()
})

test('guard: opción de la lista que el panel real no trae → fallo blando (no alterado) y panel cerrado', async () => {
  const { context, page, guard } = await preparar(PAGINA(), [1])
  await assert.rejects(() => elegirOpcionComercialMapfre(page, guard, 1, 'OTRA VARIANTE', [...OPCIONES, 'OTRA VARIANTE']), (e) => e instanceof ErrorTarificador && !(e instanceof ErrorSelectorComercialAlteradoMapfre) && /no está en el panel/.test(e.message))
  assert.equal(await page.locator('#panel-comercial').count(), 0)
  assert.equal(await valorDe(page, 1), 'TERCEROS AMPLIADO')
  await context.close()
})

test('guard: si cambia OTRA tarjeta o sale un diálogo desconocido → ErrorSelectorComercialAlteradoMapfre', async () => {
  for (const mutar of ['otraTarjeta', 'dialogo'] as const) {
    const { context, page, guard } = await preparar(PAGINA({ mutar }), [1])
    await assert.rejects(() => elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TERCEROS AMPLIADO', OPCIONES), (e) => e instanceof ErrorSelectorComercialAlteradoMapfre && e.tipo === 'portal', mutar)
    await context.close()
  }
})

test('guard: el diálogo «Controles técnicos» se cierra por su botón validado y la variante queda bloqueada', async () => {
  const { context, page, guard } = await preparar(PAGINA({ mutar: 'dialogoControles' }), [1])
  const e = await elegirOpcionComercialMapfre(page, guard, 1, 'BASICar TODO RIESGO', OPCIONES)
  assert.equal(e.bloqueada, true)
  assert.equal(await page.locator('.controles-tecnicos-dialog').count(), 0)
  await context.close()
})

test('guard: tope duro de cambios de selección por trabajo', async () => {
  const { context, page, guard } = await preparar(PAGINA(), [0])
  for (let i = 0; i < MAX_CAMBIOS_COMERCIALES_MAPFRE; i++) await elegirOpcionComercialMapfre(page, guard, 0, i % 2 === 0 ? 'TERCEROS AMPLIADO' : 'TERCEROS', OPCIONES)
  await assert.rejects(() => elegirOpcionComercialMapfre(page, guard, 0, 'TERCEROS AMPLIADO', OPCIONES), (e) => e instanceof EmisionBloqueadaError && e.donde === 'fase' && /tope/.test(e.message))
  await context.close()
})

// ───────────────────────── adaptador (sin navegador) ─────────────────────────
const OPC_COM = { opciones: OPCIONES, seleccionada: '' as string | null }
const vistos = (): ProductoVistoMapfre[] => [
  { producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '', comercial: { ...OPC_COM, seleccionada: 'TERCEROS' } },
  { producto: 'TERCEROS AMPLIADO', prima: 301.1, deshabilitado: false, texto: '', comercial: { ...OPC_COM, seleccionada: 'TERCEROS AMPLIADO' } },
  { producto: 'TODO RIESGO', prima: null, deshabilitado: false, texto: 'controles técnicos', comercial: { ...OPC_COM, seleccionada: 'TODO RIESGO' } },
]
const PRIMAS: PrimaProductoMapfre[] = [
  { producto: 'TERCEROS', periodicidad: 'anual', primaTotalEur: 238.37, requiereVerificacionVehiculo: false },
  { producto: 'TERCEROS AMPLIADO', periodicidad: 'anual', primaTotalEur: 301.1, requiereVerificacionVehiculo: true },
]
type Llamada = { indice: number; opcion: string }
/** Portal simulado: cada tarjeta muestra una opción; las BASICar dan prima (TERCEROS AMPLIADO) o bloqueo (TODO RIESGO). */
function portalFalso(o: { fallaAlElegir?: string; restauraMal?: boolean } = {}) {
  const llamadas: Llamada[] = []
  const actual = ['TERCEROS', 'TERCEROS AMPLIADO', 'TODO RIESGO']
  const original = [...actual]
  const base: Record<string, string> = { TERCEROS: 'PRIMA TOTAL: 238,37 €', 'TERCEROS AMPLIADO': 'PRIMA TOTAL: 301,10 €', 'BASICar TERCEROS AMPLIADO': 'PRIMA TOTAL: 1.234,50 €' }
  const elegir = async (_p: Page, indice: number, opcion: string, permitidas: readonly string[]) => {
    assert.ok(permitidas.includes(opcion), 'siempre de la lista cerrada')
    llamadas.push({ indice, opcion })
    if (o.fallaAlElegir === opcion) throw new ErrorSelectorComercialAlteradoMapfre('cambió OTRA tarjeta')
    actual[indice] = opcion
    const restaura = opcion === original[indice]
    const prima = restaura && o.restauraMal ? 'PRIMA TOTAL: 777,00 €' : base[opcion] ?? ''
    return { valor: opcion, textoPrima: prima, textoTarjeta: `${opcion} ANUAL ${prima || 'Existen controles técnicos que impiden tarificar'}`, bloqueada: prima === '' }
  }
  return { elegir, llamadas, actual }
}

test('adaptador: tarifica solo las BASICar no tarificadas, en la tarjeta base, restaura cada vez y anota la bloqueada', async () => {
  const p = portalFalso()
  const v = vistos()
  const r = await tarificarVariantesComercialesMapfre({} as Page, v, PRIMAS, p.elegir)
  assert.equal(r.restaurado, true)
  assert.deepEqual(r.primas.map((x) => [x.producto, x.primaTotalEur, x.variante?.tarjeta]), [['BASICar TERCEROS AMPLIADO', 1234.5, 'TERCEROS AMPLIADO']])
  assert.equal(r.primas[0]!.requiereVerificacionVehiculo, true, 'hereda el aviso de verificación de su tarjeta')
  // Anfitriona de «BASICar TERCEROS AMPLIADO»: la tarjeta 1; «BASICar TODO RIESGO» (su base está bloqueada): la primera con prima y esa opción en su lista (0).
  assert.deepEqual(p.llamadas, [
    { indice: 1, opcion: 'BASICar TERCEROS AMPLIADO' }, { indice: 1, opcion: 'TERCEROS AMPLIADO' },
    { indice: 0, opcion: 'BASICar TODO RIESGO' }, { indice: 0, opcion: 'TERCEROS' },
  ])
  assert.deepEqual(p.actual, ['TERCEROS', 'TERCEROS AMPLIADO', 'TODO RIESGO'], 'selección original restaurada')
  assert.deepEqual(v[1]!.variantes, [{ opcion: 'BASICar TERCEROS AMPLIADO', estado: 'prima', prima: 1234.5 }])
  assert.equal(v[0]!.variantes![0]!.estado, 'bloqueada')
  assert.equal(v[0]!.variantes![0]!.motivo, 'controles técnicos')
  const aviso = avisoProductosVistosMapfre(v, null, r.notas)
  assert.match(aviso, /TERCEROS AMPLIADO \(prima 301,10€\) \[comercial: [^\]]*\] \[variantes: BASICar TERCEROS AMPLIADO \(prima 1\.234,50€\)\]/)
  assert.match(aviso, /\[variantes: BASICar TODO RIESGO \(no disponible: controles técnicos\)\]/)
  assert.match(aviso, /TEMPORALMENTE/)
})

test('adaptador: sin BASICar en las listas o ya tarificadas no se elige nada', async () => {
  const p = portalFalso()
  const sin = vistos().map((x) => ({ ...x, comercial: { opciones: ['TERCEROS', 'TERCEROS AMPLIADO', 'TODO RIESGO'], seleccionada: (x.comercial as { seleccionada: string | null }).seleccionada } }))
  assert.deepEqual((await tarificarVariantesComercialesMapfre({} as Page, sin, PRIMAS, p.elegir)).primas, [])
  const ya = await tarificarVariantesComercialesMapfre({} as Page, vistos(), [...PRIMAS, { producto: 'BASICar TERCEROS AMPLIADO', periodicidad: 'anual', primaTotalEur: 1, requiereVerificacionVehiculo: false }, { producto: 'BASICar TODO RIESGO', periodicidad: 'anual', primaTotalEur: 2, requiereVerificacionVehiculo: false }], p.elegir)
  assert.deepEqual(ya.primas, [])
  assert.deepEqual(p.llamadas, [])
})

test('adaptador: tope de variantes por trabajo y tiempo máximo', async () => {
  const muchas = ['BASICar A', 'BASICar B', 'BASICar C', 'BASICar D', 'BASICar E', 'BASICar F']
  const v: ProductoVistoMapfre[] = [{ producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '', comercial: { opciones: ['TERCEROS', ...muchas], seleccionada: 'TERCEROS' } }]
  const llamadas: string[] = []
  const elegir = async (_p: Page, _i: number, opcion: string) => { llamadas.push(opcion); return { valor: opcion, textoPrima: opcion === 'TERCEROS' ? 'PRIMA TOTAL: 238,37 €' : 'PRIMA TOTAL: 500,00 €', textoTarjeta: `${opcion} ANUAL`, bloqueada: false } }
  const r = await tarificarVariantesComercialesMapfre({} as Page, v, PRIMAS, elegir)
  assert.equal(r.primas.length, MAX_VARIANTES_COMERCIALES_MAPFRE)
  assert.equal(llamadas.filter((x) => x !== 'TERCEROS').length, MAX_VARIANTES_COMERCIALES_MAPFRE)
  assert.ok(llamadas.length <= MAX_CAMBIOS_COMERCIALES_MAPFRE, 'variantes + restauraciones caben en el tope del guard')
  assert.ok(r.notas.some((n) => /2 variante\(s\).*tope/.test(n)))
  // Tiempo: el reloj salta más allá del máximo tras la primera variante.
  let t = 0
  const v2: ProductoVistoMapfre[] = [{ producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '', comercial: { opciones: ['TERCEROS', 'BASICar A', 'BASICar B'], seleccionada: 'TERCEROS' } }]
  const l2: string[] = []
  const r2 = await tarificarVariantesComercialesMapfre({} as Page, v2, PRIMAS, async (_p, _i, o) => { l2.push(o); t += 100_000; return { valor: o, textoPrima: 'PRIMA TOTAL: 238,37 €', textoTarjeta: `${o} ANUAL`, bloqueada: false } }, () => t)
  assert.equal(r2.primas.length, 1)
  assert.ok(r2.notas.some((n) => /tiempo máximo/.test(n)))
})

test('adaptador: una anomalía aborta SOLO las variantes (lo ya leído se conserva) y restaura la tarjeta', async () => {
  const p = portalFalso({ fallaAlElegir: 'BASICar TODO RIESGO' })
  const r = await tarificarVariantesComercialesMapfre({} as Page, vistos(), PRIMAS, p.elegir)
  assert.equal(r.primas.length, 1, 'la primera variante ya estaba leída')
  assert.equal(r.restaurado, true)
  assert.ok(r.notas.some((n) => /ABORTADAS/.test(n)))
  assert.deepEqual(p.actual, ['TERCEROS', 'TERCEROS AMPLIADO', 'TODO RIESGO'])
})

test('adaptador: restauración que no se verifica → restaurado=false (el llamador no genera el proyecto); y un EmisionBloqueadaError se relanza', async () => {
  const p = portalFalso({ restauraMal: true })
  const r = await tarificarVariantesComercialesMapfre({} as Page, vistos(), PRIMAS, p.elegir)
  assert.equal(r.restaurado, false)
  assert.ok(r.notas.some((n) => /NO verificada/.test(n)))
  assert.equal(p.llamadas.length, 2, 'se detiene tras la primera restauración fallida')
  await assert.rejects(() => tarificarVariantesComercialesMapfre({} as Page, vistos(), PRIMAS, async () => { throw new EmisionBloqueadaError('fase', 'x') }), EmisionBloqueadaError)
})

test('ofertas: la variante sale como oferta propia «Auto · BASICar …» con aviso de variante comercial', () => {
  const o = ofertasDesdePrimasMapfre([...PRIMAS, { producto: 'BASICar TERCEROS AMPLIADO', periodicidad: 'anual', primaTotalEur: 1234.5, requiereVerificacionVehiculo: false, variante: { tarjeta: 'TERCEROS AMPLIADO' } }], null)
  assert.deepEqual(o.map((x) => x.producto), ['Auto · TERCEROS', 'Auto · TERCEROS AMPLIADO', 'Auto · BASICar TERCEROS AMPLIADO'])
  assert.ok(o[2]!.avisos.some((a) => /Variante comercial de Mapfre/.test(a) && /TEMPORALMENTE/.test(a) && /no figura en el PDF/.test(a)))
  assert.ok(!o[0]!.avisos.some((a) => /Variante comercial/.test(a)))
  assert.equal(o[2]!.primaAnualEur, 1234.5)
})

test('cableado: la variante nunca se elige después de «Generar Proyecto» y sin restauración verificada no se genera el proyecto', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/adapters/mapfre/auto.ts'), 'utf8')
  const iVar = src.indexOf('await tarificarVariantesComercialesMapfre(')
  const iGen = src.indexOf('await ctx.generarProyectoMapfre(nsei')
  assert.ok(iVar > -1 && iGen > iVar, 'las variantes se tarifican ANTES de «Generar Proyecto»')
  assert.match(src, /!variantes\.restaurado\s*\n\s*\? \{ estado: 'no_generado'/)
  const guard = readFileSync(join(import.meta.dirname, '../src/guard.ts'), 'utf8')
  const fn = guard.slice(guard.indexOf('export async function elegirOpcionComercialMapfre'), guard.indexOf('// ─────────── Diagnóstico de pantalla SIN datos personales'))
  assert.ok(fn.indexOf('comprobarBoton(await descripcion(select))') < fn.indexOf('clicSinDialogoNativo(page, guard, select'), 'comprobarBoton antes del clic del selector')
  assert.ok(fn.indexOf('comprobarBoton(await descripcion(fila))') < fn.indexOf('clicSinDialogoNativo(page, guard, fila'), 'comprobarBoton antes del clic de la opción')
  assert.ok(!/\.nth\(\s*(?!indice)/.test(fn.replace(/tarjetas\.nth\(indice\)/, '')), 'la opción no se elige por índice')
  assert.ok(!/\.click\(|\.selectOption\(|\.dispatchEvent\(/.test(src.slice(src.indexOf('export async function tarificarVariantesComercialesMapfre'), src.indexOf('/** Primas → ofertas normalizadas'))), 'la tarificación de variantes en auto.ts no hace clics directos: todo va por la función guardada')
})
