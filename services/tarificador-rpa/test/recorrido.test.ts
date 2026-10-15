// Recorrido del trabajo (15/10/2026): cada ejecución documenta TODO su camino (una captura ligera por pantalla/paso) y
// captura un diálogo EN EL MOMENTO en que aparece (antes de que se cierre), sin datos personales y con topes de tamaño.
// Fixtures SINTÉTICAS (NIF, correo, teléfono, matrícula y nombres inventados). `tsx --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { crearRedactor, enmascararTextoRecorrido, MAX_BYTES_CAPTURA_RECORRIDO, MAX_BYTES_RECORRIDO, sanearRecorrido, valoresSensiblesDeRiesgo } from '@central/module-tarificacion'
import { crearCapturadorRecorrido, EXTRACTOR_CAPTURA, INIT_SCRIPT_RECORRIDO, unirMarcos } from '../src/recorrido.ts'

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v))

// ─── Doble de Playwright ────────────────────────────────────────────────────

type Crudo = Record<string, unknown>
const marco = (c: Crudo, url = 'https://portal.example.test/nsei/alta?token=zzz') => ({
  isDetached: () => false,
  evaluate: async () => ({ url, titulo: 'Alta', encabezados: [], etiquetas: [], botones: [], enlaces: [], dialogos: [], tablas: [], campos: 0, ...c }),
})
function contextoFalso(paginas: { crudos: Crudo[] }[]) {
  const enlaces: { nombre: string; fn: (src: unknown, json: unknown) => void }[] = []
  const scripts: string[] = []
  const ctx = {
    exposeBinding: async (nombre: string, fn: (src: unknown, json: unknown) => void) => { enlaces.push({ nombre, fn }) },
    addInitScript: async (s: { content: string }) => { scripts.push(s.content) },
    pages: () => paginas.map((p) => ({ isClosed: () => false, frames: () => p.crudos.map((c) => marco(c)) })),
  }
  return { ctx: ctx as never, enlaces, scripts }
}

test('captura en CADA transición: paso, avance y fallo dejan una captura por pantalla distinta; la repetida se omite', async () => {
  const pantalla = { crudos: [{ titulo: 'Inicio', encabezados: ['Menú'], botones: ['Nueva tarificación'] }] as Crudo[] }
  const { ctx } = contextoFalso([pantalla])
  const cap = crearCapturadorRecorrido({ redactar: (t) => t, valores: [] })
  await cap.capturar(ctx, 'paso', 'login')
  await cap.capturar(ctx, 'paso_fin', 'login') // misma pantalla: no se repite
  pantalla.crudos = [{ titulo: 'Datos del tomador', encabezados: ['Datos del tomador'], etiquetas: ['Nombre', 'NIF'], campos: 2 }]
  await cap.capturar(ctx, 'avance')
  pantalla.crudos = [{ titulo: 'Datos del tomador', encabezados: ['Datos del tomador'], etiquetas: ['Nombre', 'NIF'], campos: 2, dialogos: [{ rol: 'dialog', id: 'dlg1', clase: 'mat-dialog-container', titulo: 'Tomador existente', botones: ['Aceptar'] }] }]
  await cap.capturar(ctx, 'pantalla_no_reconocida')
  const r = cap.recorrido()
  assert.deepEqual(r.capturas.map((c) => c.motivo), ['paso', 'avance', 'pantalla_no_reconocida'])
  assert.equal(r.capturas[0].paso, 'login')
  assert.equal(r.capturas[0].url, 'https://portal.example.test/nsei/alta') // sin query
  assert.deepEqual(r.capturas.map((c) => c.n), [1, 2, 3])
  assert.equal(r.capturas[2].dialogos[0].id, 'dlg1')
  assert.deepEqual(r.capturas[1].etiquetas, ['Nombre', 'NIF']) // solo etiquetas, nunca valores
})

test('un diálogo o un fallo se registran SIEMPRE, aunque la pantalla sea idéntica a la anterior', async () => {
  const { ctx } = contextoFalso([{ crudos: [{ titulo: 'X', encabezados: ['X'] }] }])
  const cap = crearCapturadorRecorrido({})
  await cap.capturar(ctx, 'avance')
  await cap.capturar(ctx, 'fallo')
  await cap.capturar(ctx, 'fallo')
  assert.deepEqual(cap.recorrido().capturas.map((c) => c.motivo), ['avance', 'fallo', 'fallo'])
})

test('une los marcos (el principal manda la URL y el título)', () => {
  const u = unirMarcos([
    { url: 'https://a.test/', titulo: 'Padre', botones: ['A'], campos: 1 },
    { url: 'https://b.test/iframe', titulo: 'Hijo', botones: ['B'], etiquetas: ['Matrícula'], campos: 2 },
  ])!
  assert.equal(u.url, 'https://a.test/')
  assert.equal(u.titulo, 'Padre')
  assert.deepEqual(u.botones, ['A', 'B'])
  assert.equal(u.campos, 3)
  assert.equal(unirMarcos([]), null)
})

// ─── Diálogo capturado ANTES de que se cierre (observador en la página) ─────────────────────────────────────────

/** Mini-DOM suficiente para el init script: lo que devuelve cada `querySelectorAll` lo decide el selector. */
function paginaFalsa() {
  const el = (o: Record<string, unknown> = {}) => ({
    id: '', tagName: 'DIV', innerText: '', textContent: '', labels: null, parentElement: null,
    getAttribute: (n: string) => (o.attrs as Record<string, string> | undefined)?.[n] ?? null,
    getBoundingClientRect: () => ({ width: 10, height: 10 }),
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    ...o,
  })
  const estado = { dialogos: [] as unknown[], botones: [] as unknown[], encabezados: [] as unknown[] }
  const llamadas: string[] = []
  const reloj = { t: 1_000_000 } // reloj falso: el observador se limita a ~250 ms
  let observador: (() => void) | null = null
  const documento = {
    title: 'Alta de tomador',
    documentElement: {},
    getElementById: () => null,
    querySelectorAll: (sel: string) => {
      if (sel.startsWith('dialog,')) return estado.dialogos
      if (sel.startsWith('h1,')) return estado.encabezados
      if (sel.startsWith('button,')) return estado.botones
      return []
    },
  }
  const caja: Record<string, unknown> = {
    document: documento,
    location: { href: 'https://portal.example.test/nsei/alta?token=zzz' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    MutationObserver: class { constructor(cb: () => void) { observador = cb } observe() {} },
    queueMicrotask, setTimeout, clearTimeout, Date: { now: () => reloj.t },
  }
  caja.window = caja
  caja.__rpaRecorrido = (json: string) => { llamadas.push(json) }
  vm.createContext(caja)
  vm.runInContext(INIT_SCRIPT_RECORRIDO, caja)
  return { estado, llamadas, el, mutar: () => observador?.(), documento, reloj }
}

test('un diálogo se captura en el MISMO microtarea en que aparece, antes de que se cierre', async () => {
  const p = paginaFalsa()
  const aceptar = p.el({ innerText: 'Aceptar', textContent: 'Aceptar', tagName: 'BUTTON' })
  const dlg = p.el({
    id: 'dlgTomador', tagName: 'MAT-DIALOG-CONTAINER', attrs: { role: 'dialog', class: 'mat-dialog-container', 'aria-label': 'Tomador existente' },
    innerText: 'Ya existe un tomador', querySelectorAll: () => [aceptar],
  })
  p.mutar()
  await Promise.resolve()
  assert.equal(p.llamadas.length, 0) // sin diálogo, nada
  p.estado.dialogos = [dlg]
  p.estado.botones = [aceptar]
  p.reloj.t += 300
  p.mutar() // el portal pinta el diálogo
  await Promise.resolve() // un solo microtarea: nadie ha esperado ni actuado
  assert.equal(p.llamadas.length, 1)
  p.estado.dialogos = [] // el diálogo se cierra ya
  p.reloj.t += 300
  p.mutar()
  await Promise.resolve()
  // La captura sigue ahí y, pasada por el colector, documenta el diálogo cerrado.
  const cap = crearCapturadorRecorrido({})
  const crudo = JSON.parse(p.llamadas[0])
  assert.equal(crudo.motivo, 'dialogo')
  const { ctx, enlaces } = contextoFalso([{ crudos: [] }])
  await cap.instalar(ctx)
  assert.equal(enlaces[0].nombre, '__rpaRecorrido')
  enlaces[0].fn({}, p.llamadas[0])
  const c = cap.recorrido().capturas[0]
  assert.equal(c.motivo, 'dialogo')
  assert.equal(c.dialogos[0].id, 'dlgTomador')
  assert.equal(c.dialogos[0].rol, 'dialog')
  assert.equal(c.dialogos[0].clase, 'mat-dialog-container')
  assert.equal(c.dialogos[0].titulo, 'Tomador existente')
  assert.deepEqual(c.dialogos[0].botones, ['Aceptar'])
  assert.equal(c.url, 'https://portal.example.test/nsei/alta')
})

test('el observador se limita (~250 ms): una ráfaga de mutaciones no vuelve a mirar el DOM hasta pasado el plazo', async () => {
  const p = paginaFalsa()
  let miradas = 0
  const orig = p.documento.querySelectorAll
  p.documento.querySelectorAll = (sel: string) => { if (sel.startsWith('dialog,')) miradas++; return orig(sel) }
  p.mutar()
  await Promise.resolve()
  assert.equal(miradas, 1)
  for (let i = 0; i < 50; i++) { p.reloj.t += 1; p.mutar() }
  await Promise.resolve()
  assert.equal(miradas, 1, 'una ráfaga dentro de 250 ms no puede volver a leer el DOM')
  const fuente = INIT_SCRIPT_RECORRIDO
  assert.match(fuente, /\.cdk-overlay-pane'/, 'el observador no vigila el mismo selector de diálogos que la captura')
  assert.doesNotMatch(fuente.slice(fuente.indexOf('var firmaDlg')), /innerText/, 'el observador no debe forzar layout con innerText')
})

test('el binding ignora basura y cargas enormes sin lanzar', async () => {
  const cap = crearCapturadorRecorrido({})
  const { ctx, enlaces } = contextoFalso([{ crudos: [] }])
  await cap.instalar(ctx)
  enlaces[0].fn({}, 'no es json')
  enlaces[0].fn({}, 42)
  enlaces[0].fn({}, 'x'.repeat(70 * 1024))
  assert.equal(cap.recorrido().capturas.length, 0)
})

// ─── Sin datos personales ───────────────────────────────────────────────────

const RIESGO = { tomador: { nombre: 'Genoveva', apellido1: 'Quintanilla', apellido2: 'Arrabal', documentoIdentidad: '12345678Z' }, documentoTomador: '12345678Z' }
const PII = ['12345678Z', 'B12345674', 'X1234567L', 'pepa.perez@correo.test', '612 345 678', '1234 BCD', '15/01/1980', '1980-01-15', '15 de enero de 1980', 'Pepa Pérez García', 'Juan López', 'Genoveva', 'Quintanilla']

function crudoConPii(): Crudo {
  return {
    titulo: 'Alta del tomador 12345678Z',
    encabezados: ['Datos de Genoveva Quintanilla', 'Tomador: Pepa Pérez García'],
    etiquetas: ['Nombre Pepa', 'NIF 12345678Z', 'CIF B12345674', 'NIE X1234567L', 'Correo pepa.perez@correo.test', 'Teléfono 612 345 678', 'Matrícula 1234 BCD', 'Nacimiento 15/01/1980', 'Efecto 1980-01-15', 'Desde el 15 de enero de 1980', 'Asegurado - Juan López', 'Titular Juan López', 'Genoveva Quintanilla Arrabal'],
    botones: ['Continuar', 'Cliente 12345678Z'],
    enlaces: ['Ver a Genoveva (pepa.perez@correo.test)'],
    dialogos: [{ rol: 'dialog', id: 'dlg', clase: 'modal', titulo: 'El tomador: Pepa Pérez García ya existe', botones: ['Aceptar'] }],
    tablas: [4],
    campos: 3,
    // Claves que NO existen en el contrato: nunca deben salir.
    value: 'Pepa Pérez García', valor: '12345678Z',
  }
}

function prueba(redactar: (t: string) => string, valores: readonly string[]) {
  const cap = crearCapturadorRecorrido({ redactar, valores })
  return { cap, crudo: crudoConPii() }
}

test('SIN PII: NIF/NIE/CIF, correo, teléfono, matrícula, fechas y nombres tras «tomador/asegurado/titular/nombre» no salen', async () => {
  const { cap, crudo } = prueba(crearRedactor(['12345678Z']), valoresSensiblesDeRiesgo(RIESGO))
  const { ctx } = contextoFalso([{ crudos: [crudo] }])
  await cap.capturar(ctx, 'dialogo')
  const salida = JSON.stringify(cap.recorrido())
  for (const dato of PII) assert.ok(!salida.includes(dato), `se coló: ${dato}`)
  // Lo estructural sí sale.
  assert.ok(salida.includes('Continuar'))
  assert.ok(salida.includes('Aceptar'))
  assert.ok(salida.includes('dlg'))
  // Y el cable de asegura (re-saneado) tampoco deja pasar nada.
  const otraVez = JSON.stringify(sanearRecorrido(JSON.parse(salida)))
  for (const dato of PII) assert.ok(!otraVez.includes(dato), `se coló en asegura: ${dato}`)
})

test('el enmascarado es idempotente (asegura lo vuelve a pasar sin romper nada)', () => {
  const uno = enmascararTextoRecorrido('Tomador: Pepa Pérez García, nacido el 15/01/1980')!
  assert.equal(enmascararTextoRecorrido(uno), uno)
  assert.match(uno, /^Tomador: \[PERSONAL\]/)
})

test('un texto con un VALOR conocido del riesgo se quita entero (nombre llano que ningún patrón detecta)', async () => {
  const cap = crearCapturadorRecorrido({ valores: valoresSensiblesDeRiesgo(RIESGO) })
  const { ctx } = contextoFalso([{ crudos: [{ titulo: 'Ficha', botones: ['Genoveva Quintanilla', 'Guardar'] }] }])
  await cap.capturar(ctx, 'avance')
  assert.deepEqual(cap.recorrido().capturas[0].botones, ['Guardar'])
})

// ─── Topes de tamaño ────────────────────────────────────────────────────────

test('una captura enorme se recorta a ≤4 KB (y se marca)', async () => {
  const largo = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p} ${i} con un texto bastante largo para ocupar sitio`)
  const { ctx } = contextoFalso([{ crudos: [{ titulo: 'Enorme', encabezados: largo('Encabezado', 40), etiquetas: largo('Campo', 90), botones: largo('Botón', 80), enlaces: largo('Enlace', 80), tablas: Array.from({ length: 30 }, (_, i) => i) }] }])
  const cap = crearCapturadorRecorrido({})
  await cap.capturar(ctx, 'avance')
  const c = cap.recorrido().capturas[0]
  assert.ok(bytes(c) <= MAX_BYTES_CAPTURA_RECORRIDO, `${bytes(c)} bytes`)
  assert.equal(c.recortada, true)
  assert.ok(c.botones.length > 0 && c.etiquetas.length > 0) // recorta, no vacía
})

test('el recorrido del trabajo no pasa de ~60 KB y cuenta lo que no cupo', async () => {
  const pantalla = { crudos: [{}] as Crudo[] }
  const { ctx } = contextoFalso([pantalla])
  const cap = crearCapturadorRecorrido({})
  for (let i = 0; i < 200; i++) {
    pantalla.crudos = [{ titulo: `Pantalla ${i}`, encabezados: [`Paso ${i}`], etiquetas: Array.from({ length: 40 }, (_, j) => `Campo ${i}-${j} descripción larga`), botones: Array.from({ length: 30 }, (_, j) => `Botón ${i}-${j} largo`) }]
    await cap.capturar(ctx, 'avance')
  }
  const r = cap.recorrido()
  assert.ok(bytes(r) <= MAX_BYTES_RECORRIDO, `${bytes(r)} bytes`)
  assert.ok(cap.colector.bytes() <= MAX_BYTES_RECORRIDO)
  assert.ok(r.descartadas > 0)
  assert.ok(r.capturas.length > 5)
})

// ─── Cableado en el runner (capa común, no por adaptador) ───────────────────────────────────────────────────────

test('el runner cablea el recorrido: instalar, paso, login, avance, pantalla no reconocida y el envío en el error', () => {
  const f = readFileSync(new URL('../src/runner.ts', import.meta.url), 'utf8')
  assert.match(f, /k\.recorrido\.instalar\(context\)/)
  assert.match(f, /domcontentloaded/)
  assert.match(f, /capturar\('paso', nombre\)/)
  assert.match(f, /capturar\('paso_fin', nombre\)/)
  assert.match(f, /capturar\('login'\)/)
  assert.match(f, /capturar\('avance'\)/)
  assert.match(f, /pideInventarioDom\(error\) \? 'pantalla_no_reconocida' : 'fallo'/)
  assert.match(f, /recorrido: recorridoDelTrabajo/)
  assert.match(f, /valoresSensiblesDeRiesgo\(trabajo\.riesgo\)/)
  // La captura va ANTES de la evidencia del fallo.
  assert.ok(f.indexOf("'pantalla_no_reconocida' : 'fallo'") < f.indexOf('await capturarEvidencia(actual)'))
})

test('el extractor de la página nunca lee valores de campos', () => {
  for (const script of [EXTRACTOR_CAPTURA, INIT_SCRIPT_RECORRIDO]) {
    assert.doesNotMatch(script, /\.value\b/)
    assert.doesNotMatch(script, /\.options\b/)
    assert.doesNotMatch(script, /\.checked\b/)
  }
})

// ─── Terceros dentro de tablas/listas/opciones (homónimos del diálogo de tomador de Mapfre) ─────────────────────

test('EXTRACTOR: el texto dentro de table/tr/li/opciones NO se lee (solo el nº de filas); lo de fuera sí', () => {
  const el = (texto: string, enLista: boolean, o: Record<string, unknown> = {}) => ({
    innerText: texto, textContent: texto, id: '', tagName: 'DIV', labels: null, parentElement: null,
    getAttribute: () => null, getBoundingClientRect: () => ({ width: 5, height: 5 }),
    closest: () => (enLista ? {} : null), querySelector: () => null, querySelectorAll: () => [], ...o,
  })
  const nombre = 'GARCÍA LÓPEZ, JUAN'
  const filaBtn = el(nombre, true)
  const filaEnlace = el('PÉREZ RUIZ, ANA', true)
  const opcion = el('MARTÍN SOLER, LUIS', true)
  const aceptar = el('Aceptar', false)
  const dlg = el('', false, {
    tagName: 'MAT-DIALOG-CONTAINER', id: 'dlg', getAttribute: (n: string) => (n === 'role' ? 'dialog' : n === 'aria-label' ? 'Tomador existente' : null),
    querySelectorAll: () => [filaBtn, aceptar],
  })
  const tabla = el('', false, { querySelectorAll: () => [1, 2, 3] as unknown[], rows: [1, 2, 3] })
  const documento = {
    title: 'Alta', getElementById: () => null,
    querySelectorAll: (sel: string) => {
      if (sel.startsWith('h1,')) return [el('Tomador existente', false), el(nombre, true)]
      if (sel.startsWith('input,')) return [el('', false, { getAttribute: () => null, labels: [el('Nombre', false)] }), el('', true, { getAttribute: () => null, labels: [el(nombre, true)] })]
      if (sel.startsWith('button,')) return [aceptar, filaBtn, opcion]
      if (sel.startsWith('[ng-click]')) return [el(nombre, true)]
      if (sel === 'a') return [filaEnlace, el('Ayuda', false)]
      if (sel.startsWith('dialog,')) return [dlg]
      if (sel === 'table') return [tabla]
      return []
    },
  }
  const caja: Record<string, unknown> = { document: documento, location: { href: 'https://portal.example.test/x' }, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) }
  caja.window = caja
  vm.createContext(caja)
  const crudo = JSON.parse(JSON.stringify(vm.runInContext(EXTRACTOR_CAPTURA, caja))) as Record<string, unknown> // JSON: otro realm de vm
  const salida = JSON.stringify(crudo)
  for (const n of ['GARCÍA', 'PÉREZ', 'MARTÍN', 'JUAN']) assert.ok(!salida.includes(n), `se leyó un nombre de lista: ${n}`)
  assert.deepEqual(crudo.botones, ['Aceptar'])
  assert.deepEqual(crudo.enlaces, ['Ayuda'])
  assert.deepEqual(crudo.etiquetas, ['Nombre'])
  assert.equal((crudo.dialogos as { titulo: string; botones: string[] }[])[0].titulo, 'Tomador existente')
  assert.deepEqual((crudo.dialogos as { botones: string[] }[])[0].botones, ['Aceptar'])
  assert.deepEqual(crudo.tablas, [3]) // de una tabla solo el nº de filas
})

test('colector: cabecera ePAC del mediador («209-C/12/0000 - Nombre Apellidos») y «Último acceso» se QUITAN, no se tapan', async () => {
  const cap = crearCapturadorRecorrido({})
  const { ctx } = contextoFalso([{ crudos: [{ titulo: 'ePAC', encabezados: ['209-C/12/0000 - Mediadora Ficticia Sola', 'Resumen'], botones: ['Salir', 'Mediadora Ficticia Sola cerrar sesión'], enlaces: ['Último acceso: 14/10/2026 10:30'] }] }])
  await cap.capturar(ctx, 'avance')
  const salida = JSON.stringify(cap.recorrido())
  assert.ok(!/Mediadora|Ficticia|209-C|acceso|PERSONAL|DATO/i.test(salida), `queda cabecera: ${salida}`)
  assert.deepEqual(cap.recorrido().capturas[0].encabezados, ['Resumen'])
  assert.deepEqual(cap.recorrido().capturas[0].botones, ['Salir'])
})

test('runner: contador de capturas en vuelo (no boolean) y ms de captura por intento en el log', () => {
  const f = readFileSync(new URL('../src/runner.ts', import.meta.url), 'utf8')
  assert.match(f, /let capturando = 0/)
  assert.match(f, /capturando\+\+/)
  assert.match(f, /capturando--/)
  assert.doesNotMatch(f, /capturando = (true|false)/)
  assert.match(f, /log\('recorrido_ms_capturas', \{ ms: msCapturas \}\)/)
})
