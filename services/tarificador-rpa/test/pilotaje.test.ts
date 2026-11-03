// MODO PILOTADO (03/11/2026): el bucle publica la pantalla, espera un comando y lo ejecuta SOLO por la puerta del guard. Portal
// SINTÉTICO por `context.route` (sin red real) y datos ficticios. TARIFICAR ≠ EMITIR: «Emitir»/«Contratar»/«Confirmar» se rechazan
// y NO se pulsan (el clic se mide en la propia página y en la red).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { InventarioDom } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar, type GuardEmision } from '../src/guard.ts'
import { buclePilotaje, problemaTrabajoPilotaje, type ContextoPilotaje } from '../src/pilotaje.ts'
import { leerComando, loteExploradorDe, motivoCampoProhibido, motivoValorLiteralProhibido, pasaLuhn, TOPES_PILOTAJE } from '../src/pilotaje-reglas.ts'
import type { ResultadoComandoPilotaje } from '../src/api.ts'

const ORIGEN = 'https://mediadores.pelayo.com'
const ENTRADA = 'pelayo:presupuestos:auto'

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
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
after(async () => { await browser.close() })

// Cada botón «final» cuenta su clic en la página Y dispara una petición de red a su ruta (doble testigo de «no se pulsó»).
const boton = (id: string, texto: string) => `<button type="button" id="${id}" onclick="window.__clics.push('${id}');fetch('/accion/${id}',{method:'POST'})">${texto}</button>`
const FORM = `<!doctype html><html><body><script>window.__clics=[]</script>
  <h1>Datos del vehículo</h1>
  <label for="mod">Modelo</label><input id="mod" name="modelo" type="text">
  <label for="fi">Firma del tomador</label><input id="fi" name="firmaTomador" type="text">
  <label for="uso">Uso</label><select id="uso" name="uso"><option value="">Elige</option><option value="P">Particular</option><option value="C">Comercial</option></select>
  ${boton('emi', 'Emitir póliza')} ${boton('con', 'Contratar')} ${boton('cfm', 'Confirmar')}
  <button type="button" id="sig" onclick="window.__clics.push('sig');location.href='/paso2/'">Siguiente</button>
</body></html>`
const CUENTA = '<!doctype html><html><body><h1>Domiciliación</h1><label for="ib">IBAN</label><input id="ib" name="iban" type="text"><button type="button">Siguiente</button></body></html>'
const PASO2 = '<!doctype html><html><body><h1>Coberturas</h1><label for="x">Kilómetros</label><input id="x" name="km" type="number"><button type="button">Calcular</button></body></html>'

async function abrir(ruta = '/formulario/'): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision; red: string[] }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const red: string[] = []
  await context.route(`${ORIGEN}/**`, (r) => {
    const u = new URL(r.request().url())
    if (r.request().method() !== 'GET') red.push(u.pathname)
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body: u.pathname === '/paso2/' ? PASO2 : u.pathname === '/cuenta/' ? CUENTA : u.pathname.startsWith('/accion/') ? 'ok' : FORM })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  await page.goto(`${ORIGEN}${ruta}`)
  return { context, page, guard, red }
}

/** Ref del primer elemento cuyo texto/etiqueta/id casa. */
function refDe(inv: InventarioDom, casa: (e: { texto?: string | null; etiqueta?: string | null; id?: string | null }) => boolean): string {
  for (const m of inv.marcos) for (const e of m.elementos) if (casa(e) && e.ref) return e.ref
  throw new Error('ref no encontrada')
}

type Publicado = { n: number; inventario: InventarioDom; resultadoAnterior?: ResultadoComandoPilotaje; final?: boolean; url?: string }

/** Contexto con un operador falso: `guion(inventario, n)` da el comando de cada pantalla (o null = aún no hay). */
function contexto(guard: GuardEmision, guion: (inv: InventarioDom, n: number) => unknown, extra: Partial<ContextoPilotaje> = {}) {
  const publicados: Publicado[] = []
  let reloj = 0
  const k: ContextoPilotaje = {
    trabajoId: '00000000-0000-4000-8000-000000000001', compania: 'pelayo', ramo: 'auto', entrada: ENTRADA, env: {}, guard,
    pulsar: (b) => pulsar(b, guard),
    pausaAccion: async () => undefined,
    publicar: async (c) => { publicados.push(c); return 'ok' },
    pedirComando: async (n) => ({ estado: 'ok', comando: guion(publicados[publicados.length - 1].inventario, n) }),
    log: () => undefined,
    sinCaptura: true,
    ahora: () => reloj,
    dormir: async (ms) => { reloj += ms },
    ...extra,
  }
  return { k, publicados }
}

// ─── Puras ───────────────────────────────────────────────────────────────────

test('leerComando: lista cerrada de acciones y claves; nada fuera', () => {
  assert.equal(leerComando({ accion: 'pulsar', ref: 'm0e3' }).ok, true)
  assert.equal(leerComando({ accion: 'click', ref: 'm0e3' }).ok, false)
  assert.equal(leerComando({ accion: 'pulsar', ref: 'm0e3', forzar: true }).ok, false, 'clave extra (p. ej. «forzar») no se admite')
  assert.equal(leerComando({ accion: 'pulsar', ref: '#emitir' }).ok, false, 'un selector libre no es un ref')
  assert.equal(leerComando({ accion: 'pulsar', ref: 'm0e3', efecto: 'guardar_presupuesto' }).ok, false, 'el guardado del presupuesto no se pilota')
  assert.equal(leerComando({ accion: 'rellenar', ref: 'm0e3' }).ok, false)
  assert.equal(leerComando({ accion: 'rellenar', ref: 'm0e3', valor: 'a', dato: 'vehiculo.matricula' }).ok, false)
  assert.equal(leerComando({ accion: 'rellenar', ref: 'm0e3', dato: 'credencial.usuario' }).ok, false)
  assert.equal(leerComando({ accion: 'esperar', ms: 60_000 }).ok, false)
  assert.equal(leerComando({ accion: 'navegar', url: 'https://x' }).ok, false, 'no hay navegación libre')
  assert.deepEqual(leerComando({ accion: 'esperar' }), { ok: true, c: { accion: 'esperar', ms: 2_000 } })
})

test('valor literal: solo ficticio inocuo (ni IBAN, ni tarjeta, ni NIF, ni correo)', () => {
  assert.equal(motivoValorLiteralProhibido('Ibiza 1.0 TSI'), null)
  assert.equal(motivoValorLiteralProhibido('41003'), null)
  assert.ok(motivoValorLiteralProhibido('ES91 2100 0418 4502 0005 1332'))
  assert.ok(motivoValorLiteralProhibido('4111 1111 1111 1111'))
  assert.equal(pasaLuhn('4111111111111111'), true)
  assert.ok(motivoValorLiteralProhibido('12345678Z'))
  assert.ok(motivoValorLiteralProhibido('alguien@ejemplo.es'))
})

test('campo prohibido: cuenta, tarjeta y firma nunca se rellenan', () => {
  assert.ok(motivoCampoProhibido({ ref: 'm0e1', tag: 'input', type: 'text', etiqueta: 'IBAN' } as never))
  assert.ok(motivoCampoProhibido({ ref: 'm0e1', tag: 'input', type: 'text', name: 'numeroTarjeta' } as never))
  assert.ok(motivoCampoProhibido({ ref: 'm0e1', tag: 'input', type: 'text', etiqueta: 'Firma del tomador' } as never))
  assert.equal(motivoCampoProhibido({ ref: 'm0e1', tag: 'input', type: 'text', etiqueta: 'Modelo' } as never), null)
})

test('pulsar sobre un radio/casilla es «marcar»; sobre un botón, «avanzar» (ambos pasan por el validador del explorador)', () => {
  const lr = loteExploradorDe({ accion: 'pulsar', ref: 'm0e1', efecto: 'siguiente_pantalla' }, { ref: 'm0e1', tag: 'input', type: 'radio' } as never) as { acciones: { accion: string }[] }
  assert.equal(lr.acciones[0].accion, 'marcar')
  const lb = loteExploradorDe({ accion: 'pulsar', ref: 'm0e2', efecto: 'siguiente_pantalla' }, { ref: 'm0e2', tag: 'button' } as never) as { acciones: { accion: string }[] }
  assert.equal(lb.acciones[0].accion, 'avanzar')
  assert.equal(loteExploradorDe({ accion: 'rellenar', ref: 'm0e2', valor: 'x' }, { ref: 'm0e2', tag: 'input' } as never), null)
})

test('topes duros: 60 comandos y 30 minutos', () => {
  assert.equal(TOPES_PILOTAJE.maxComandos, 60)
  assert.equal(TOPES_PILOTAJE.maxMs, 30 * 60_000)
  assert.equal(TOPES_PILOTAJE.esperaComandoMs, 10 * 60_000)
})

test('problemaTrabajoPilotaje: entrada de la lista cerrada que casa con compañía/ramo', () => {
  assert.equal(problemaTrabajoPilotaje({ id: 'x', compania: 'pelayo', ramo: 'auto', riesgo: {}, modo: 'pilotaje', pilotaje: { entrada: ENTRADA } }), null)
  assert.ok(problemaTrabajoPilotaje({ id: 'x', compania: 'mapfre', ramo: 'auto', riesgo: {}, modo: 'pilotaje', pilotaje: { entrada: ENTRADA } }))
  assert.ok(problemaTrabajoPilotaje({ id: 'x', compania: 'pelayo', ramo: 'auto', riesgo: {}, modo: 'pilotaje', pilotaje: { entrada: 'https://evil' } }))
  assert.ok(problemaTrabajoPilotaje({ id: 'x', compania: 'pelayo', ramo: 'auto', riesgo: {}, modo: 'pilotaje' }))
})

// ─── El bucle contra un portal falso ─────────────────────────────────────────

test('TARIFICAR ≠ EMITIR: «pulsar» sobre Emitir/Contratar/Confirmar se RECHAZA y no hace clic (ni en la página ni en la red)', async () => {
  const { context, page, guard, red } = await abrir()
  try {
    const textos = ['Emitir póliza', 'Contratar', 'Confirmar']
    const { k, publicados } = contexto(guard, (inv, n) => (n <= 3 ? { accion: 'pulsar', ref: refDe(inv, (e) => e.texto === textos[n - 1]) } : { accion: 'fin' }))
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'fin')
    // El resultado de cada comando viaja con la pantalla SIGUIENTE.
    for (const n of [2, 3, 4]) {
      const r = publicados[n - 1].resultadoAnterior
      assert.equal(r?.estado, 'rechazado', `comando ${n - 1}: ${JSON.stringify(r)}`)
    }
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), [], 'ningún clic en la página')
    assert.deepEqual(red, [], 'ninguna petición de red de los botones finales')
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('aunque el validador lo dejara pasar, la puerta del guard (`pulsar`) bloquea «Emitir» antes del clic', async () => {
  const { context, page, guard } = await abrir()
  try {
    await assert.rejects(() => pulsar(page.locator('#emi'), guard), /emisi|bloquead|Emitir/i)
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), [])
  } finally {
    await context.close()
  }
})

test('rellenar ficticio y seleccionar se ejecutan; firma o valor con forma de IBAN se rechazan sin escribir; «Siguiente» avanza por el guard', async () => {
  const { context, page, guard } = await abrir()
  try {
    const guion = (inv: InventarioDom, n: number): unknown => {
      switch (n) {
        case 1: return { accion: 'rellenar', ref: refDe(inv, (e) => e.id === 'mod'), valor: 'Ibiza 1.0' }
        case 2: return { accion: 'rellenar', ref: refDe(inv, (e) => e.id === 'fi'), valor: 'prueba' }
        case 3: return { accion: 'rellenar', ref: refDe(inv, (e) => e.id === 'mod'), valor: 'ES91 2100 0418 4502 0005 1332' }
        case 4: return { accion: 'seleccionar', ref: refDe(inv, (e) => e.id === 'uso'), valor: 'Particular' }
        case 5: return { accion: 'pulsar', ref: refDe(inv, (e) => e.texto === 'Siguiente') }
        default: return { accion: 'fin' }
      }
    }
    const { k, publicados } = contexto(guard, guion)
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'fin')
    const res = publicados.slice(1).map((p) => p.resultadoAnterior)
    assert.equal(res[0]?.estado, 'hecho')
    assert.equal(res[1]?.estado, 'rechazado')
    assert.equal(res[1]?.motivo, 'campo_de_pago_o_firma')
    assert.equal(await page.locator('#fi').inputValue().catch(() => ''), '', 'no se escribió en la firma')
    assert.equal(res[2]?.estado, 'rechazado')
    assert.equal(res[2]?.motivo, 'valor_no_ficticio')
    assert.equal(res[3]?.estado, 'hecho', JSON.stringify(res[3]))
    assert.equal(res[4]?.estado, 'hecho', JSON.stringify(res[4]))
    assert.equal(new URL(page.url()).pathname, '/paso2/')
    // El último inventario publicado es la pantalla 2 (y sin valores escritos: el saneado no los lleva).
    const ultimo = JSON.stringify(publicados[publicados.length - 1].inventario)
    assert.match(ultimo, /Coberturas/)
    assert.doesNotMatch(JSON.stringify(publicados.map((p) => p.inventario)), /Ibiza 1\.0/, 'el valor escrito no sale en el inventario')
  } finally {
    await context.close()
  }
})

test('un comando mal formado o con ref inexistente se registra como rechazado y la sesión sigue', async () => {
  const { context, page, guard } = await abrir()
  try {
    const { k, publicados } = contexto(guard, (_inv, n) => (n === 1 ? { accion: 'pulsar', ref: 'm9e999' } : n === 2 ? { accion: 'click', selector: '#emi' } : { accion: 'fin' }))
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'fin')
    assert.equal(publicados[1].resultadoAnterior?.motivo, 'ref_no_existe')
    assert.equal(publicados[2].resultadoAnterior?.motivo, 'comando_no_valido')
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), [])
  } finally {
    await context.close()
  }
})

test('sin comando en el tope de espera, la sesión se cierra (`sin_comando`)', async () => {
  const { context, page, guard } = await abrir()
  try {
    const { k } = contexto(guard, () => null, { topes: { esperaComandoMs: 10_000, pollMs: 2_000 } })
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'sin_comando')
    assert.equal(fin.nUltimo, 1)
  } finally {
    await context.close()
  }
})

test('tope de comandos: el que lo supera no se ejecuta y la sesión cierra (`tope_comandos`)', async () => {
  const { context, page, guard } = await abrir()
  try {
    const { k } = contexto(guard, () => ({ accion: 'esperar', ms: 0 }), { topes: { maxComandos: 3 } })
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'tope_comandos')
    assert.equal(fin.comandos, 4)
    assert.equal(fin.resultadoUltimo?.motivo, 'tope_comandos')
  } finally {
    await context.close()
  }
})

test('los topes de un contexto solo BAJAN los duros (60 comandos / 30 min nunca se suben)', async () => {
  const { context, page, guard } = await abrir()
  try {
    // 1 h de espera pedida y 1 h de sesión: manda el tope duro de 30 min (el reloj falso avanza con cada sondeo).
    const { k } = contexto(guard, () => null, { topes: { maxMs: 60 * 60_000, esperaComandoMs: 60 * 60_000, pollMs: 60_000 } })
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'sin_comando', 'la espera de comando topa en 10 min, antes que la sesión')
  } finally {
    await context.close()
  }
})

test('sesión perdida (asegura dice 404) → el worker sale sin ejecutar nada', async () => {
  const { context, page, guard } = await abrir()
  try {
    const { k } = contexto(guard, () => ({ accion: 'pulsar', ref: 'm0e1' }), { pedirComando: async () => ({ estado: 'perdido' }) })
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'perdido')
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), [])
  } finally {
    await context.close()
  }
})

test('pantalla con cuenta bancaria (IBAN): se publica como FINAL y la sesión se cierra sin admitir comando', async () => {
  const { context, page, guard } = await abrir('/cuenta/')
  try {
    let pedidos = 0
    const { k, publicados } = contexto(guard, () => ({ accion: 'fin' }), { pedirComando: async () => { pedidos++; return { estado: 'ok', comando: { accion: 'fin' } } } })
    const fin = await buclePilotaje(page, k)
    assert.equal(fin.motivo, 'parada')
    assert.equal(publicados.length, 1)
    assert.equal(publicados[0].final, true)
    assert.equal(pedidos, 0, 'no se pide comando en una pantalla de parada')
  } finally {
    await context.close()
  }
})

test('barrera 1 sola (validador del explorador): con una puerta de clic SIN guard en el contexto, «Emitir»/«Contratar»/«Confirmar» siguen sin pulsarse', async () => {
  const { context, page, guard } = await abrir()
  try {
    const textos = ['Emitir póliza', 'Contratar', 'Confirmar']
    let clicsPuerta = 0
    const { k, publicados } = contexto(guard, (inv, n) => (n <= 3 ? { accion: 'pulsar', ref: refDe(inv, (e) => e.texto === textos[n - 1]) } : { accion: 'fin' }), {
      pulsar: async (b) => { clicsPuerta++; await b.click() },
    })
    await buclePilotaje(page, k)
    for (const n of [2, 3, 4]) assert.equal(publicados[n - 1].resultadoAnterior?.motivo, 'validador', JSON.stringify(publicados[n - 1].resultadoAnterior))
    assert.equal(clicsPuerta, 0, 'la puerta de clic no llegó a llamarse')
    assert.deepEqual(await page.evaluate(() => (window as unknown as { __clics: string[] }).__clics), [])
  } finally {
    await context.close()
  }
})
