// Guardián del worker del tarificador RPA (services/tarificador-rpa, 05/10/2026). `node --test`.
//
// El servicio está FUERA del workspace pnpm (no lo typechequea ni lo testea el CI de apps), así que
// lo que tiene que seguir siendo verdad de su FORMA se vigila aquí, leyendo el fuente:
//   · TARIFICAR ≠ EMITIR: ningún adaptador pulsa con `.click()` directo (solo `ctx.pulsar()`, guardado);
//   · credenciales: nunca se arranca tracing; el worker no nombra la cartera ni Codeoscopic;
//   · Fly: sin servicios HTTP (máquina efímera), shared-cpu-2x / 2 GB / cdg;
//   · la imagen de Playwright y la dependencia van en la MISMA versión.
// Las reglas puras (guard de emisión, redactor, fail-closed) tienen sus tests en packages/module-tarificacion.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const SRV = join(RAIZ, 'services/tarificador-rpa')

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? ficheros(p) : p.endsWith('.ts') ? [p] : []
  })
}

function sinComentarios(src: string): string {
  return src
    // Solo bloques que EMPIEZAN línea: un glob como '**/*' dentro de un string no abre comentario.
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .map((l) => l.replace(/\s\/\/.*$/, ''))
    .join('\n')
}

test('el servicio existe y está fuera del workspace pnpm', () => {
  assert.ok(existsSync(join(SRV, 'package.json')), 'falta services/tarificador-rpa/package.json')
  const ws = readFileSync(join(RAIZ, 'pnpm-workspace.yaml'), 'utf8')
  assert.ok(!/services/.test(ws), 'services/* NO va en el workspace pnpm (ver README del servicio)')
})

test('ningún fichero del worker pulsa con .click()/.dblclick()/.tap() salvo pulsar() de guard.ts', () => {
  const infractores: string[] = []
  for (const f of ficheros(join(SRV, 'src'))) {
    if (f.endsWith('/src/guard.ts')) continue
    const src = sinComentarios(readFileSync(f, 'utf8'))
    if (/\.(click|dblclick|tap)\s*\(|dispatchEvent\(\s*['"]click/.test(src)) infractores.push(relative(RAIZ, f))
  }
  assert.deepEqual(infractores, [], 'pulsar SOLO con ctx.pulsar() (guardado contra emisión)')
  const guard = sinComentarios(readFileSync(join(SRV, 'src/guard.ts'), 'utf8'))
  assert.match(guard, /comprobarBoton\(desc\)\s*\n\s*await boton\.click\(\)/, 'pulsar() tiene que comprobar ANTES de pulsar')
  assert.match(guard, /isNavigationRequest\(\)/, 'el guard de navegación tiene que mirar las navegaciones')
})

// Más formas de «pulsar» que `.click()` (revisión 10/10/2026): Enter en un formulario, submit, eventos de ratón/teclado
// sintéticos. Fuera de guard.ts están PROHIBIDAS sin excepción.
const PULSACION_ENCUBIERTA = new RegExp(
  [
    String.raw`\.press\s*\(\s*[^)]*Enter`,
    String.raw`keyboard\s*\.\s*(?:press|down|type|insertText)\s*\(`,
    String.raw`\.(?:submit|requestSubmit)\s*\(`,
    String.raw`dispatchEvent\(\s*['"\`](?:click|dblclick|submit|mousedown|mouseup|pointerdown|pointerup|keydown|keypress|keyup|touchstart|touchend|tap)`,
    String.raw`new\s+(?:MouseEvent|PointerEvent|KeyboardEvent|SubmitEvent|TouchEvent)\b`,
    String.raw`new\s+Event\(\s*['"\`](?:click|submit|keydown|keypress|keyup|mousedown|mouseup)`,
  ].join('|'),
)
// Cambios que disparan los manejadores del portal (`onchange`/`onclick`): solo con `comprobarCampo(`/`comprobarBoton(`
// en las 6 líneas anteriores. Las excepciones son las REVISADAS antes de esta regla (nº exacto: una nueva rompe).
const CAMBIO_CON_MANEJADOR = /\.(?:check|uncheck|setChecked|dispatchEvent)\s*\(/
const EXCEPCIONES_CAMBIO: Record<string, number> = {
  // marcar(): checkbox solo por la vía determinista campoPorEtiqueta (ver el comentario 🔒 de comunidades.ts).
  'services/tarificador-rpa/src/adapters/allianz/comunidades.ts': 1,
  // fijarSelectOculto(): `change` de un <select> bootstrap oculto, valor validado contra sus opciones.
  'services/tarificador-rpa/src/adapters/allianz/comercio.ts': 1,
}

/** Infracciones de la regla de pulsación en un fuente (sin comentarios). Exportada en el test para verla FALLAR. */
function infraccionesPulsacion(rel: string, src: string): string[] {
  const out: string[] = []
  const lineas = src.split('\n')
  let cambiosSinGuard = 0
  lineas.forEach((l, i) => {
    if (PULSACION_ENCUBIERTA.test(l)) out.push(`${rel}:${i + 1} pulsación encubierta`)
    if (CAMBIO_CON_MANEJADOR.test(l) && !/comprobar(?:Campo|Boton)\(/.test(lineas.slice(Math.max(0, i - 6), i + 1).join('\n'))) cambiosSinGuard++
  })
  if (cambiosSinGuard !== (EXCEPCIONES_CAMBIO[rel] ?? 0)) out.push(`${rel}: ${cambiosSinGuard} check/setChecked/dispatchEvent sin comprobarCampo() (excepciones revisadas: ${EXCEPCIONES_CAMBIO[rel] ?? 0})`)
  return out
}

test('ningún fichero del worker pulsa por la puerta de atrás (Enter, submit, eventos sintéticos, cambios sin guard)', () => {
  const infractores: string[] = []
  for (const f of ficheros(join(SRV, 'src'))) {
    if (f.endsWith('/src/guard.ts')) continue
    infractores.push(...infraccionesPulsacion(relative(RAIZ, f), sinComentarios(readFileSync(f, 'utf8'))))
  }
  assert.deepEqual(infractores, [], 'pulsar SOLO con ctx.pulsar(); cambiar un campo solo tras comprobarCampo()')
})

test('la regla de pulsación ve FALLAR cada forma (cepo del cepo)', () => {
  const r = 'services/tarificador-rpa/src/adapters/x.ts'
  for (const malo of [
    "await campo.press('Enter')",
    'await page.keyboard.press("Enter")',
    'await form.evaluate((f) => f.submit())',
    'await form.evaluate((f) => f.requestSubmit())',
    "await boton.dispatchEvent('mousedown')",
    "el.dispatchEvent(new MouseEvent('click'))",
    "el.dispatchEvent(new Event('submit', { bubbles: true }))",
  ]) assert.notDeepEqual(infraccionesPulsacion(r, malo), [], malo)
  for (const malo of ['await c.check()', 'await c.setChecked(true)', "await c.dispatchEvent('change')"]) assert.notDeepEqual(infraccionesPulsacion(r, malo), [], malo)
  assert.deepEqual(infraccionesPulsacion(r, "await comprobarCampo(c)\nawait c.fill(v)\nawait c.dispatchEvent('change')\nawait c.setChecked(true)"), [])
})

test('el worker nunca arranca tracing ni nombra la cartera o Codeoscopic', () => {
  for (const f of ficheros(join(SRV, 'src'))) {
    const src = sinComentarios(readFileSync(f, 'utf8'))
    const r = relative(RAIZ, f)
    assert.ok(!/tracing\s*\.\s*start/.test(src), `${r} arranca tracing (las credenciales acabarían en el trace)`)
    assert.ok(!/CODEOSCOPIC|DATABASE_URL|DIRECT_URL|ASEGURA_OPERADOR_SECRET/.test(src), `${r} nombra una variable que el worker no puede tener`)
    assert.ok(!/@prisma|from ['"]pg['"]|postgres/i.test(src), `${r} habla con una BD: el worker solo habla HTTP con asegura`)
  }
  const runner = readFileSync(join(SRV, 'src/runner.ts'), 'utf8')
  assert.match(runner, /variablesProhibidas\(env\)/, 'el runner tiene que negarse a arrancar con variables prohibidas')
  assert.match(runner, /redactarHtml\(/, 'el HTML de evidencia tiene que salir redactado')
})

test('fly.toml: sin servicios HTTP, shared-cpu-2x / 2 GB, región cdg, app asegura-tarificador', () => {
  const toml = readFileSync(join(SRV, 'fly.toml'), 'utf8')
  const sinCom = toml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  assert.ok(!/\[\s*http_service\s*\]|\[\[\s*services\s*\]\]|auto_start_machines\s*=\s*true/.test(sinCom), 'el worker no expone servicios ni se auto-arranca')
  assert.match(sinCom, /app\s*=\s*"asegura-tarificador"/)
  assert.match(sinCom, /primary_region\s*=\s*"cdg"/)
  assert.match(sinCom, /size\s*=\s*"shared-cpu-2x"/)
  assert.match(sinCom, /memory\s*=\s*"2gb"/)
})

test('la imagen de Playwright y la dependencia van en la misma versión fijada', () => {
  const pkg = JSON.parse(readFileSync(join(SRV, 'package.json'), 'utf8'))
  const dep = pkg.dependencies?.playwright as string
  assert.match(dep ?? '', /^\d+\.\d+\.\d+$/, 'playwright tiene que ir FIJADA (sin ^ ni ~)')
  const docker = readFileSync(join(SRV, 'Dockerfile'), 'utf8')
  const m = docker.match(/^FROM mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-/m)
  assert.ok(m, 'el Dockerfile tiene que partir de mcr.microsoft.com/playwright:vX.Y.Z-…')
  assert.equal(m![1], dep, `imagen v${m![1]} ≠ dependencia ${dep}: los navegadores no casarían`)
})

test('el middleware de asegura deja pasar /api/tarificador (auth propia del worker)', () => {
  const fuente = readFileSync(join(RAIZ, 'apps/asegura/middleware.ts'), 'utf8')
  const publica = fuente.match(/const PUBLIC = \[([^\]]*)\]/)
  assert.ok(publica)
  assert.match(publica![1], /['"]\/api\/tarificador['"]/)
})

test('ePAC Comunidades 2020: «Aceptar» y el radio de opción solo se pulsan por las funciones guardadas por FASE de guard.ts', () => {
  const guard = sinComentarios(readFileSync(join(SRV, 'src/guard.ts'), 'utf8'))
  // 1. Solo guard.ts nombra «Aceptar»/«Elija una opción» en código: ningún otro fichero tiene con qué pulsarlos.
  for (const f of ficheros(join(SRV, 'src'))) {
    if (f.endsWith('/src/guard.ts')) continue
    const src = sinComentarios(readFileSync(f, 'utf8'))
    assert.ok(!/aceptar|elij[ae][\s_-]*una[\s_-]*opci|recuperaci[oó]n/i.test(src), `${relative(RAIZ, f)} nombra un control de alta/credenciales de ePAC`)
    assert.ok(!/radio/i.test(src.replace(/:not\(\[type=radio\]\)/g, '')), `${relative(RAIZ, f)} no puede tocar radios (solo excluirlos al leer)`)
  }
  // 2. En guard.ts, cada click()/check() vive en una función que primero pasa por la máquina de fases o por comprobarBoton.
  const funciones = guard.split(/^export async function /m).slice(1)
  assert.ok(funciones.length >= 4)
  for (const fn of funciones) {
    const acciones = fn.search(/\.(click|check)\s*\(/)
    if (acciones < 0) continue
    const nombre = fn.slice(0, fn.indexOf('('))
    const previo = fn.slice(0, acciones)
    // La emisión autorizada (10/10/2026) NO cuenta con la fase sola: además tiene que gastar el permiso de un solo uso.
    if (nombre === 'pulsarEmisionAutorizada') {
      assert.ok(/fases\.autorizarEmision\(/.test(previo) && /usarPermisoEmision\(/.test(previo), `${nombre}: click sin fase de emisión Y permiso de un solo uso`)
      continue
    }
    assert.match(previo, /comprobarBoton\(|fases\.autorizar(Aceptar|Opcion|Proyecto)\(/, `${nombre}: click/check sin pasar antes por el guard`)
  }
  const aceptar = funciones.find((f) => f.startsWith('pulsarAvance'))!
  assert.ok(aceptar.indexOf('fases.autorizarAceptar(') > -1 && aceptar.indexOf('fases.autorizarAceptar(') < aceptar.indexOf('.click('), 'pulsarAvance tiene que autorizar por fase ANTES de pulsar')
  assert.match(aceptar, /pestanaActiva\(/, 'pulsarAvance tiene que verificar la pestaña activa en el DOM')
  assert.match(aceptar, /confirmarTarificar\(/, 'pulsarAvance tiene que comprobar que el avance llegó a Tarificar')
  const opcion = funciones.find((f) => f.startsWith('elegirOpcion'))!
  assert.ok(opcion.indexOf('fases.autorizarOpcion(') > -1 && opcion.indexOf('fases.autorizarOpcion(') < opcion.indexOf('.check('), 'elegirOpcion tiene que autorizar por fase ANTES de marcar')
  // 3. El runner enchufa esas funciones y no ofrece otra vía.
  const runner = readFileSync(join(SRV, 'src/runner.ts'), 'utf8')
  assert.match(runner, /avanzarATarificar:\s*\(\)\s*=>\s*pulsarAvance\(page, guard\)/)
  // 4. El único botón que el adaptador pulsa en Datos Básicos es «Calcular».
  const adaptador = sinComentarios(readFileSync(join(SRV, 'src/adapters/allianz/comunidades.ts'), 'utf8'))
  const pulsaciones = [...adaptador.matchAll(/ctx\.pulsar\(([^)]*\)?)\)/g)].map((m) => m[1])
  // Desplegables ndbx (06/10/2026): abrir el `nx-dropdown` y elegir la opción de texto EXACTO. Lista blanca
  // ESTRECHA: la llamada literal y la forma de los dos helpers (no pueden apuntar a otra cosa).
  // «Calcular» (06/10/2026): solo `botonCalcular(<marco>)`, y botonCalcular clavado a `#calcular` con texto EXACTO.
  for (const p of pulsaciones) assert.match(p, /^botonCalcular\(\w+\)$|sel\(|INICIAR SESI|^\s*page\.locator\('#link_new_policy'|modal\.getByText\(textoExacto\('(Particulares|Comunidades)'\)|^desplegableNx\(s\)$|^opcionNx\(raiz, valor\)$|^alterno\.locator$|^lupaCodigoPostal\(raiz\)$|^opcionLocalidad$/, `pulsación inesperada en el adaptador: ${p}`)
  assert.match(adaptador, /function botonCalcular\(raiz: Raiz\): Locator \{\s*return raiz\.locator\('#calcular'\)\.filter\(\{ hasText: textoExacto\('Calcular'\) \}\)\s*\}/, 'botonCalcular solo puede devolver el #calcular de texto exacto «Calcular»')
  assert.match(adaptador, /function desplegableNx\(c: Locator\): Locator \{\s*return c\.locator\('xpath=ancestor-or-self::nx-dropdown\[1\]'\)\s*\}/, 'desplegableNx solo puede devolver el nx-dropdown del campo')
  assert.match(adaptador, /function opcionNx\(raiz: Raiz, valor: string\): Locator \{\s*return raiz\.locator\('nx-dropdown-item, \[role="option"\]'\)\.filter\(\{ hasText: textoExacto\(valor\) \}\)\s*\}/, 'opcionNx solo puede devolver opciones de lista por texto exacto')
  // 4b. «Proyecto» (07/10/2026): solo por `ctx.abrirProyecto(pestana)` (fase Tarificar + guard), con `pestana` =
  // `pestanaProyecto(raiz)` y ese helper clavado a `td#MENU` de texto EXACTO «Proyecto» (nunca «Proyecto Ampliado»).
  const proyectos = [...adaptador.matchAll(/ctx\.abrirProyecto\(([^)]*)\)/g)].map((m) => m[1])
  assert.deepEqual(proyectos, ['pestana'], 'abrirProyecto solo se llama una vez, con la pestaña de pestanaProyecto()')
  assert.match(adaptador, /const pestana = pestanaProyecto\(raiz\)\n/, 'la pestaña de abrirProyecto tiene que salir de pestanaProyecto(raiz)')
  assert.match(adaptador, /function pestanaProyecto\(raiz: Raiz\): Locator \{\s*return raiz\.locator\('td#MENU'\)\.filter\(\{ hasText: textoExacto\('Proyecto'\) \}\)\s*\}/, 'pestanaProyecto solo puede devolver td#MENU de texto exacto «Proyecto»')
  assert.match(runner, /abrirProyecto:\s*\(pestana\)\s*=>\s*pulsarProyecto\(page, pestana, guard\)/)
  const proyecto = funciones.find((f) => f.startsWith('pulsarProyecto'))!
  assert.ok(proyecto.indexOf('fases.autorizarProyecto(') > -1 && proyecto.indexOf('fases.autorizarProyecto(') < proyecto.indexOf('.click('), 'pulsarProyecto tiene que autorizar por fase ANTES de pulsar')
  assert.ok(!/\.(click|check|fill|press|selectOption|setChecked)\s*\(/.test(sinComentarios(readFileSync(join(SRV, 'src/descarga-pdf.ts'), 'utf8'))), 'descarga-pdf.ts solo escucha: no actúa sobre la página')
  // 5. Listas del guard del módulo.
  const g = readFileSync(join(RAIZ, 'packages/module-tarificacion/src/guard-emision.ts'), 'utf8')
  assert.match(g, /TEXTOS_BLOQUEADOS_ALTA/)
  assert.match(g, /PATRON_ACEPTAR/)
})

test('varias opciones: las variantes solo cambian <select> nativos, recalculan con calcular() y restauran la base ANTES del avance', () => {
  const src = sinComentarios(readFileSync(join(SRV, 'src/adapters/allianz/comunidades.ts'), 'utf8'))
  const ini = src.indexOf('export type ColumnaPartida')
  const fin = src.indexOf('export async function leerPrimas')
  assert.ok(ini > -1 && fin > ini, 'falta el bloque de variantes (ColumnaPartida … leerPrimas)')
  const bloque = src.slice(ini, fin)
  // Sin pulsaciones propias: lo único que se pulsa es «Calcular», dentro de calcular() (botonCalcular, ya vigilado).
  assert.ok(!/ctx\.pulsar\(|\.(click|dblclick|tap|check|setChecked|fill|press|type)\s*\(/.test(bloque), 'variantes: ni pulsaciones ni escrituras salvo selectOption')
  assert.match(bloque, /\.locator\(`select\[id\^="\$\{columna\}"\]`\)/, 'variantes: solo <select> nativos de la fila de la partida')
  assert.match(bloque, /export type ColumnaPartida = 'estandar' \| 'personalizado' \| 'franquicia'\n/)
  assert.match(bloque, /await calcular\(page, ctx\)/)
  assert.match(bloque, /finally \{[^}]*restaurarBase\(/, 'variantes: la base se restaura SIEMPRE (finally)')
  // En tarificar: las variantes, solo con riesgo.opciones y ANTES de elegir modalidad / avanzar.
  const t = src.slice(src.indexOf('async tarificar('))
  assert.match(t, /riesgo\.opciones \? await calcularVariantes\(/)
  assert.ok(t.indexOf('calcularVariantes(') < t.indexOf('ctx.elegirOpcion('), 'las variantes van antes del avance a Tarificar')
})

test('sesión reutilizada: solo en memoria (sin disco), y el runner pulsa siempre por pulsar(boton, guard)', () => {
  for (const f of ficheros(join(SRV, 'src'))) {
    const src = sinComentarios(readFileSync(f, 'utf8'))
    assert.ok(!/storageState\(\s*\{[^)]*path/.test(src), `${relative(RAIZ, f)} guarda el storageState en disco`)
  }
  const sesion = sinComentarios(readFileSync(join(SRV, 'src/sesion.ts'), 'utf8'))
  assert.ok(!/from ['"](node:)?fs/.test(sesion), 'sesion.ts no puede tocar el disco')
  assert.match(sesion, /toJSON\(\): string \{\s*return '\[sesion\]'/, 'la sesión no se serializa (toJSON)')
  const runner = sinComentarios(readFileSync(join(SRV, 'src/runner.ts'), 'utf8'))
  assert.match(runner, /pulsar: async \(boton\) => \{\s*await ctx\.pausaAccion\(\)\s*await pulsar\(boton, guard\)\s*\}/, 'ctx.pulsar = pausa + pulsar(boton, guard), nada más')
  assert.match(runner, /sesionEpac\.invalidar\(\)/, 'el runner invalida la sesión ante un fallo')
})

test('formador con IA: solo la lista de bloqueo nombra emitir/contratar/formalizar; la tabla de acciones permitidas, nunca', () => {
  const src = sinComentarios(readFileSync(join(SRV, 'src/formador.ts'), 'utf8'))
  const PROHIBIDAS = /emitir|contratar|formalizar/i
  // 1. La lista de bloqueo existe, en UNA línea, y nombra las tres.
  const bloqueo = src.match(/^export const BLOQUEO_FORMADOR = \[[^\n]*\] as const$/m)
  assert.ok(bloqueo, 'falta BLOQUEO_FORMADOR (una línea, `as const`) en services/tarificador-rpa/src/formador.ts')
  for (const p of ['emitir', 'contratar', 'formalizar']) assert.ok(bloqueo![0].includes(`'${p}'`), `BLOQUEO_FORMADOR tiene que nombrar '${p}'`)
  // 2. Fuera de esa línea, el fichero no las nombra.
  const resto = src.replace(bloqueo![0], '')
  assert.ok(!PROHIBIDAS.test(resto), 'formador.ts nombra emitir/contratar/formalizar fuera de BLOQUEO_FORMADOR')
  // 3. La tabla cerrada de acciones permitidas no contiene ninguna palabra de emisión (ni del guard del módulo).
  const tabla = src.match(/export const ACCIONES_PERMITIDAS = \{([\s\S]*?)\} as const/)
  assert.ok(tabla, 'falta la tabla ACCIONES_PERMITIDAS')
  assert.ok(!PROHIBIDAS.test(tabla![1]), 'ACCIONES_PERMITIDAS contiene una acción de emisión')
  assert.ok(!/emit|emisi|contrat|formaliz|suplement|anul|baja|aceptar|archivar|ampliado/i.test(tabla![1]), 'ACCIONES_PERMITIDAS casa con el patrón de emisión del guard')
  // 4. El formador no actúa (devuelve el locator) y valida antes de devolver.
  assert.match(src, /pareceEmision\(/, 'validarAccion tiene que pasar por pareceEmision()')
  assert.match(src, /BLOQUEO_FORMADOR\.find\(/, 'validarAccion tiene que mirar la lista de bloqueo')
  assert.match(src, /const v = validarResolucion\(p, d, ctx\.compania\)/, 'resolverConFormador tiene que validar antes de devolver')
  // 5. (revisión de seguridad 06/10/2026) La tabla solo tiene «calcular» + la navegación de menús que autorizó Alberto
  //    (14/10/2026, respaldo IA); el enlace de entrada NO está en la tabla (va por la lista de guard.ts y `pulsarEnlaceEntrada`).
  const claves = [...tabla![1].matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1])
  assert.deepEqual(claves, ['calcular', 'pestana_nueva_produccion', 'menu_automoviles', 'continuar', 'elegir_opcion'], 'ACCIONES_PERMITIDAS: solo «calcular», la navegación autorizada y elegir una opción visible (sin lupa del tomador: Mapfre busca sola)')
  assert.match(src, /export function validarAccionEntrada[\s\S]*?textosEntradaDe\(compania\)\.includes\(esperado\)[\s\S]*?normalizarTexto\(d\.texto\) !== esperado/, 'el enlace de entrada: solo textos de guard.ts y texto visible exacto')
  const vc = src.slice(src.indexOf('export function validarCampo'), src.indexOf('export function validarResolucion'))
  assert.match(vc, /bloqueoPalabras\(\[\['id', d\.id\], \['name', d\.name\], \['title', d\.title\], \['aria-label', d\.ariaLabel\], \['onclick', d\.onclick\], \['onchange', d\.onchange\]\]\)/, 'validarCampo tiene que bloquear palabras de emisión en id/name/title/aria-label/onclick/onchange')
  assert.match(vc, /type === 'checkbox' \|\| \(role !== '' && !ROLES_EDITABLES\.includes\(role\)\)/, 'validarCampo no admite casillas (ni roles que no sean de edición)')
  assert.match(vc, /return contrastarEtiqueta\(etiqueta, d\.etiquetaFila\)/, 'validarCampo tiene que contrastar la etiqueta de la fila')
  assert.ok(!/'checkbox'/.test(src.match(/export const TIPOS_INPUT_EDITABLES = \[[^\]]*\]/)![0]), 'TIPOS_INPUT_EDITABLES no puede admitir checkbox')
  assert.ok(!/\.(check|fill|press|selectOption|setChecked)\s*\(/.test(src), 'el formador no actúa sobre la página: solo señala')
})

test('formador en el adaptador ePAC: FALLBACK acotado (campos + «Calcular»), acompañado en sus 5 puntos y sin pulsar nada que no valide formador.ts', () => {
  const src = sinComentarios(readFileSync(join(SRV, 'src/adapters/allianz/comunidades.ts'), 'utf8'))
  // 1. Solo dos peticiones al formador: los campos (tipo 'campo') y la acción `calcular`. Nada más.
  const llamadas = [...src.matchAll(/resolverConFormador\(([^]*?)\)\.catch\(/g)].map((m) => m[1])
  assert.equal(llamadas.length, 2, 'resolverConFormador solo se usa en campoResuelto y en calcularConFormador')
  assert.ok(llamadas.some((l) => /tipo: 'campo'/.test(l)), 'falta el fallback de campos')
  const accion = llamadas.find((l) => /tipo: 'accion'/.test(l))
  assert.ok(accion && /clave: 'calcular'/.test(accion) && /textoEsperado: 'Calcular'/.test(accion), 'la única acción que se pide al formador es «calcular»')
  // 2. Lo que se pulsa de lo que devuelva el formador es UNA sola cosa, en la rama de «Calcular», tras el fallback.
  assert.equal([...src.matchAll(/ctx\.pulsar\(alterno\.locator\)/g)].length, 1)
  assert.ok(!/resolverConFormador[^]*\.(click|check|fill)\(/.test(src.slice(src.indexOf('async function calcularConFormador'), src.indexOf('async function calcular('))), 'calcularConFormador solo señala')
  // 3. El fallback de «Calcular» NO se activa por ambigüedad (más de un Calcular).
  assert.match(src, /e\.message\.includes\(SIN_CALCULAR\)/)
  // 4. Acompañado en los cinco puntos de formador.ts (PUNTOS_ENGANCHE), en orden.
  const puntos = [...src.matchAll(/await acompanarPaso\(page, ctx, '(\w+)'/g)].map((m) => m[1])
  assert.deepEqual(puntos, ['login', 'formulario', 'tras_calcular', 'resultado', 'proyecto'])
  // 5. Apagable y no bloqueante: sin `activo` no se llama, y un fallo que no sea ErrorTarificador no tumba.
  assert.match(src, /if \(!ctx\.formador\?\.activo\) return/)
  assert.match(src, /if \(e instanceof ErrorTarificador\) throw e\s*ctx\.log\(`formador: acompañamiento/)
  // 6. A la IA no viajan credenciales ni valores del riesgo: la descripción solo usa la etiqueta del formulario.
  const bloque = src.slice(src.indexOf('async function campoResuelto'), src.indexOf('const SIN_CALCULAR'))
  assert.ok(!/credenciales|contrasena|riesgo|valor/i.test(bloque), 'campoResuelto no puede pasar credenciales ni valores a la IA')
  // 7. La clave que viaja es un slug (asegura exige [a-z0-9_]) y la etiqueta real va aparte para contrastarla.
  assert.match(bloque, /clave: claveCampo\(etiqueta, indice\)/, 'la clave del campo tiene que ser claveCampo(etiqueta, indice)')
  assert.match(bloque, /^\s*etiqueta,$/m, 'campoResuelto tiene que pasar la etiqueta real al formador')
  // 8. setChecked solo sobre una casilla confirmada por tipoControl (no pasa por el guard).
  const m = src.slice(src.indexOf('async function marcar'), src.indexOf('async function login'))
  assert.ok(m.indexOf("(await tipoControl(campo)) !== 'checkbox'") > -1 && m.indexOf("(await tipoControl(campo)) !== 'checkbox'") < m.indexOf('setChecked('), 'marcar tiene que comprobar que es una casilla antes de setChecked')
})

test('EMISIÓN (10/10/2026): un solo camino para pulsar el botón de emitir, y solo con permiso de un solo uso', () => {
  const guard = sinComentarios(readFileSync(join(SRV, 'src/guard.ts'), 'utf8'))
  const fn = guard.split(/^export async function /m).find((f) => f.startsWith('pulsarEmisionAutorizada'))
  assert.ok(fn, 'falta pulsarEmisionAutorizada en guard.ts')
  const clic = fn!.indexOf('.click(')
  for (const paso of ['guard.comprobar()', 'esBotonDeListaBlanca(', 'fases.autorizarEmision(', 'pestanaActiva(', 'usarPermisoEmision(']) {
    const i = fn!.indexOf(paso)
    assert.ok(i > -1 && i < clic, `pulsarEmisionAutorizada: «${paso}» tiene que ir ANTES del clic`)
  }
  assert.ok(fn!.indexOf('usarPermisoEmision(') < fn!.indexOf('abrir('), 'la ventana de red se abre DESPUÉS de gastar el permiso')
  assert.equal((fn!.match(/\.click\(/g) ?? []).length, 1, 'un solo clic')
  // Nadie más la llama salvo el flujo de emisión del worker, y solo tras un canje OK.
  const llamadas = ficheros(join(SRV, 'src')).filter((f) => !f.endsWith('/src/guard.ts') && /pulsarEmisionAutorizada\(/.test(sinComentarios(readFileSync(f, 'utf8'))))
  assert.deepEqual(llamadas.map((f) => relative(RAIZ, f)), ['services/tarificador-rpa/src/emision.ts'])
  const em = sinComentarios(readFileSync(join(SRV, 'src/emision.ts'), 'utf8'))
  assert.ok(em.indexOf('canjearToken(') > -1 && em.indexOf('canjearToken(') < em.indexOf('crearPermisoEmision('), 'el permiso solo se crea tras el canje')
  assert.match(em, /if \(!canje\.ok\)/)
  assert.match(em, /botonDelCanjeValido\(/)
  // El guard del módulo no se toca para emitir: sigue sin saber nada de permisos.
  const g = readFileSync(join(RAIZ, 'packages/module-tarificacion/src/guard-emision.ts'), 'utf8')
  assert.ok(!/permiso/i.test(g), 'guard-emision.ts no puede conocer el permiso: el guard queda INTACTO por defecto')
})

test('AVANCE DE PESTAÑA Moto (Alberto 13/10/2026): lista blanca EXACTA {td#datosBasicos, td#rate}, ventana de red con dos capas y flag propio', () => {
  const guard = sinComentarios(readFileSync(join(SRV, 'src/guard.ts'), 'utf8'))
  // 1. La lista blanca: exactamente dos selectores, cada uno con su único destino de red (nunca tarifa/control.do ni MotoServlet).
  const bloque = guard.match(/export const AVANCES_PESTANA_AUTORIZADOS = Object\.freeze\(\{([\s\S]*?)\n\}\)\n/)
  assert.ok(bloque, 'falta AVANCES_PESTANA_AUTORIZADOS (Object.freeze) en guard.ts')
  const claves = [...bloque![1].matchAll(/^ {2}'([^']+)': Object\.freeze\(/gm)].map((m) => m[1])
  assert.deepEqual(claves, ['td#datosBasicos', 'td#rate'], 'la lista blanca de avances de pestaña es EXACTAMENTE td#datosBasicos y td#rate')
  const endpoints = [...bloque![1].matchAll(/endpoints: Object\.freeze\(\[([^\]]*)\]\)/g)].map((m) => m[1].trim())
  assert.deepEqual(endpoints, ["'https://www.e-pacallianz.com/drpc18/riesgoMunicipio/control.do'", "'https://www.e-pacallianz.com/drpc18/datosBasicos/control.do'"])
  assert.ok(!/tarifa\/control|MotoServlet|contract|store|emit/i.test(endpoints.join(' ')), 'ningún destino de Tarificar/emisión en la lista blanca de red')
  // 1b. Validaciones AJAX del avance (Moto 0.7.7): SOLO la lista negra del NIF y SOLO en td#datosBasicos.
  const ajax = [...bloque![1].matchAll(/ajaxValidacion: Object\.freeze\(\[([^\]]*)\]/g)].map((m) => m[1].trim())
  assert.deepEqual(ajax, ['AJAX_LISTA_NEGRA_NIF_ALLIANZ, ...AJAX_LECTURA_ALLIANZ', '...AJAX_LECTURA_ALLIANZ'], 'ajaxValidacion: lista negra del NIF solo en td#datosBasicos; lecturas (ayuda) en ambos')
  const lectura = guard.match(/export const AJAX_LECTURA_ALLIANZ[^\n]*Object\.freeze\(\[([^\]]*)\]\)/)
  assert.ok(lectura, 'falta AJAX_LECTURA_ALLIANZ')
  assert.equal(lectura![1].trim(), 'AJAX_AYUDA_APLICACIONES_ALLIANZ', 'lista de lectura: solo la ayuda de aplicaciones')
  const ayuda = guard.match(/export const AJAX_AYUDA_APLICACIONES_ALLIANZ: AjaxValidacionAvance = Object\.freeze\(\{([\s\S]*?)\n\}\)/)
  assert.ok(ayuda, 'falta AJAX_AYUDA_APLICACIONES_ALLIANZ')
  assert.match(ayuda![1], /resource: 'com\.ats\.sea\.visuals\.util\.AyudaAplicacionesAjax',/)
  assert.ok(!/contract|store|emit|grab|aceptar|alta|poliza|pago|firma/i.test(ayuda![1]), 'la ayuda no puede llevar nada de emisión/grabación')
  assert.ok(ayuda![1].includes('valorCuerpo: /^[A-Za-z0-9_.:$-]{0,64}$/'), 'la ayuda admite «$» (PAGEID real `datosBasicos$datosBasicos`) y nada más allá de [A-Za-z0-9_.:$-]')
  assert.match(guard, /export function motivoAjaxRechazado\(/, 'el diagnóstico del AJAX rechazado existe')
  assert.match(guard, /\[motivo: \$\{motivo\}\]/, 'el mensaje del guard lleva el motivo del AJAX rechazado')
  assert.match(readFileSync(join(SRV, 'src/adapters/allianz/auto.ts'), 'utf8'), /ramo === 'moto' \? '0\.7\.16' : '0\.6\.18'/, 'versión Allianz moto 0.7.16')
  // 20/10/2026 (trabajo real 6cd26c10, 0.7.11): Datos básicos de Moto rellena compañía/póliza/justificante del seguro anterior y la fecha de
  // adquisición, y los huecos de datos paran ANTES del login (nunca se inventa); el carné se comprueba contra los 18 años antes de abrir el portal.
  const autoMoto = sinComentarios(readFileSync(join(SRV, 'src/adapters/allianz/auto.ts'), 'utf8'))
  assert.match(autoMoto, /planDatosBasicosMoto\(form\)\s*\n\s*exigirDatosPortalMoto\(form\)[\s\S]*?await login\(page, ctx\)/, 'exigirDatosPortalMoto va ANTES del login en tarificarMoto')
  assert.match(autoMoto, /await rellenarDatosBasicosMoto\(datos, form, page, ctx\)/, 'Datos básicos recibe page y ctx (capa común de la compañía de origen)')
  assert.match(autoMoto, /exigirCarneCoherente\(form\)\n\s*const f = conAntecedentesFavorables/, 'el plan de Datos básicos comprueba el carné antes de nada')
  assert.match(autoMoto, /sugerirOpcion\(ctx\.formador, \{\s*clave: 'elegir_opcion_compania_origen'/, 'la compañía de origen usa la IA solo como ÍNDICE entre opciones visibles')
  const listaNegra = guard.match(/export const AJAX_LISTA_NEGRA_NIF_ALLIANZ: AjaxValidacionAvance = Object\.freeze\(\{([\s\S]*?)\n\}\)/)
  assert.ok(listaNegra, 'falta AJAX_LISTA_NEGRA_NIF_ALLIANZ')
  assert.match(listaNegra![1], /endpoint: 'https:\/\/www\.e-pacallianz\.com\/drpc18\/AJAXServlet',\n\s*resource: 'pt\.allianz\.clientes\.negocio\.BlackListOperationsAjax',/)
  assert.match(listaNegra![1], /cuerpo: Object\.freeze\(\['idNumberBL'\]\)/)
  assert.ok(!/contract|store|emit|grab|aceptar|alta|poliza/i.test(listaNegra![1]), 'nada de emisión/grabación en la validación AJAX')
  // 2. La función: lista blanca (hasOwn) + comprobarBoton + pantalla de origen ANTES de abrir la ventana; un clic; finally cierra.
  const fn = guard.split(/^export async function /m).find((f) => f.startsWith('pulsarAvancePestanaAutorizado'))
  assert.ok(fn, 'falta pulsarAvancePestanaAutorizado en guard.ts')
  const abrir = fn!.indexOf('abrir(hasta, regla.endpoints, regla.ajaxValidacion)')
  const clic = fn!.indexOf('.click(')
  for (const paso of ['guard.comprobar()', 'guard.ventana.abierta()', 'Object.hasOwn(AVANCES_PESTANA_AUTORIZADOS, selector)', 'aceptar_onclick', 'comprobarBoton(desc, { permitirAceptar: true })', 'regla.formOrigen']) {
    const i = fn!.indexOf(paso)
    assert.ok(i > -1 && i < abrir && abrir < clic, `pulsarAvancePestanaAutorizado: «${paso}» tiene que ir ANTES de abrir la ventana y pulsar`)
  }
  assert.equal((fn!.match(/\.click\(/g) ?? []).length, 1, 'un solo clic')
  assert.match(fn!, /\} finally \{\s*page\.off\('dialog', alDialogo\)\s*guard\.avance\.cerrar\(\)\s*\}/, 'la ventana del avance (y el manejador de diálogos) se cierra SIEMPRE (finally)')
  // UN solo plazo: la ventana de red y la espera del destino vencen con el mismo `hasta`; ningún diálogo se acepta.
  assert.match(fn!, /const hasta = Date\.now\(\) \+ VENTANA_RED_AVANCE_MS/)
  assert.match(fn!, /if \(Date\.now\(\) >= hasta\)/)
  assert.ok(!/\.accept\(/.test(fn!) && /d\.dismiss\(\)/.test(fn!), 'los diálogos del portal se descartan, nunca se aceptan')
  // 3. El guard de red: capa (a) patrón de emisión en query y cuerpo; capa (b) destinos no GET en lista blanca.
  assert.match(guard, /const enLista = av !== null && destinoAvancePermitido\(url, av\.endpoints\)\n[\s\S]{0,400}?const op = \{ permitirAceptar: fases\.aceptarEnVuelo\(\) \|\| enLista, permitirGuardarPresupuesto: enGuardado \}/, 'capa (a): «aceptar» permitido SOLO hacia un destino de la lista blanca')
  assert.match(guard, /const enAjaxValidacion = av !== null && noGet && ajaxValidacionAvancePermitida\(req\.method\(\), url, cuerpoDe\(req\), av\.ajax\)\n\s*if \(av && noGet && !enLista && !enAjaxValidacion\)/, 'capa (b): todo no-GET fuera de la lista blanca (o de la validación AJAX declarada) se aborta')
  assert.ok(!/permitirAceptar:[^\n]*enAjaxValidacion/.test(guard), 'la validación AJAX nunca relaja la capa (a)')
  assert.match(guard, /&& Date\.now\(\) < ventanaHasta && av === null && gv === null\)/, 'la ventana de emisión no vale con el avance ni con el guardado abiertos')
  // 4. Solo el runner la enchufa y solo auto.ts la usa, con los dos selectores literales; Moto con flag PROPIO y apagado.
  const runner = sinComentarios(readFileSync(join(SRV, 'src/runner.ts'), 'utf8'))
  assert.match(runner, /avanzarPestanaAutorizada: \(selector\) => pulsarAvancePestanaAutorizado\(page, guard, selector\)/)
  const usos = ficheros(join(SRV, 'src')).filter((f) => !f.endsWith('/src/guard.ts') && !f.endsWith('/src/runner.ts') && /pulsarAvancePestanaAutorizado\(|avanzarPestanaAutorizada\(/.test(sinComentarios(readFileSync(f, 'utf8'))))
  assert.deepEqual(usos.map((f) => relative(RAIZ, f)), ['services/tarificador-rpa/src/adapters/allianz/auto.ts'])
  const auto = sinComentarios(readFileSync(join(SRV, 'src/adapters/allianz/auto.ts'), 'utf8'))
  assert.match(auto, /if \(ramo !== 'moto'\) \{\s*throw new ErrorMapaIncompleto\(/, 'Turismos sigue siendo hueco')
  assert.match(auto, /await ctx\.avanzarPestanaAutorizada\(destino === 'datosBasicos' \? 'td#datosBasicos' : 'td#rate'\)/)
  assert.match(auto, /^export const AUTO_ACTIVO = true$/m) // encendido para explorar (15/10/2026); sigue sin mapa: ErrorMapaIncompleto antes de rellenar
  assert.match(auto, /^export const MOTO_ACTIVO = (true|false)$/m)
  // Registro (runner tipado por ramo, 13/10/2026): Moto SOLO condicionada a su flag; Turismos SOLO con su flag (15/10/2026); sin casts dobles en el worker.
  const idx = sinComentarios(readFileSync(join(SRV, 'src/adapters/index.ts'), 'utf8'))
  assert.match(idx, /^if \(MOTO_ACTIVO\) adaptadores\.registrar\(allianzMoto\)$/m, 'allianzMoto se registra SOLO con `if (MOTO_ACTIVO)`')
  assert.equal((idx.match(/allianzMoto/g) ?? []).length, 2, 'allianzMoto: un import y un registro condicionado, ningún otro uso')
  assert.match(idx, /^if \(AUTO_ACTIVO\) adaptadores\.registrar\(allianzAuto\)$/m, 'allianzAuto se registra SOLO con `if (AUTO_ACTIVO)`')
  assert.equal((idx.match(/allianzAuto/g) ?? []).length, 2, 'allianzAuto: un import y un registro condicionado, ningún otro uso')
  for (const f of ficheros(join(SRV, 'src'))) assert.ok(!/as unknown as/.test(sinComentarios(readFileSync(f, 'utf8'))), `${relative(RAIZ, f)}: sin casts dobles (as unknown as): el runner valida por ramo`)
  const ramo = sinComentarios(readFileSync(join(SRV, 'src/ramo.ts'), 'utf8'))
  assert.match(ramo, /case 'comunidades':[\s\S]*?validarRiesgoComunidad\(crudo\)/, 'comunidades se valida con validarRiesgoComunidad')
  assert.match(ramo, /case 'auto':\s*case 'moto':[\s\S]*?validarFormularioAuto\(crudo, hoy\)/, 'auto/moto se validan con validarFormularioAuto')
  assert.match(runner, /prepararTrabajo\(adaptador, trabajo\.riesgo\)/, 'el runner valida con el validador del ramo (prepararTrabajo)')
  assert.ok(!/validarRiesgoComunidad/.test(runner), 'el runner ya no valida con el de Comunidades a pelo')
})

test('Allianz HOGAR (14/10/2026; encendido por Alberto 21/10/2026): flag propio, registro solo bajo el flag, hogar validado con su formulario y sin puertas de avance/guardado', () => {
  const hogar = sinComentarios(readFileSync(join(SRV, 'src/adapters/allianz/hogar.ts'), 'utf8'))
  assert.match(hogar, /^export const ALLIANZ_HOGAR_ACTIVO = true$/m, 'Allianz Hogar ENCENDIDO por Alberto (21/10/2026); apagarlo es volver a false')
  // Solo `ctx.pulsar`: ni el avance autorizado (Aceptar), ni guardar/emitir, ni la pestaña de Moto.
  assert.ok(!/pulsarExploracionAutorizada|avanzarPestanaAutorizada|avanzarATarificar|pulsarGuardado|pulsarEmision|abrirProyecto/.test(hogar), 'Hogar no usa puertas de avance/guardado/emisión')
  const idx = sinComentarios(readFileSync(join(SRV, 'src/adapters/index.ts'), 'utf8'))
  assert.match(idx, /^if \(ALLIANZ_HOGAR_ACTIVO\) adaptadores\.registrar\(allianzHogar\)$/m, 'allianzHogar se registra SOLO con `if (ALLIANZ_HOGAR_ACTIVO)`')
  assert.equal((idx.match(/allianzHogar/g) ?? []).length, 2, 'allianzHogar: un import y un registro condicionado')
  const ramo = sinComentarios(readFileSync(join(SRV, 'src/ramo.ts'), 'utf8'))
  assert.match(ramo, /case 'hogar':[\s\S]*?validarFormularioHogar\(crudo, hoy\)/, 'hogar se valida con validarFormularioHogar')
})

test('Mapfre HOGAR (21/10/2026): flag APAGADO, registro solo bajo el flag y asegura solo lo abre con el interruptor (lista cerrada, sin Occident)', () => {
  const m = sinComentarios(readFileSync(join(SRV, 'src/adapters/mapfre/hogar.ts'), 'utf8'))
  assert.match(m, /^export const MAPFRE_HOGAR_ACTIVO = false$/m, 'Mapfre Hogar nace APAGADO (lo enciende Alberto)')
  assert.ok(!/pulsarExploracionAutorizada|avanzarPestanaAutorizada|pulsarGuardado|pulsarEmision|IMPRIMIR/.test(m), 'Mapfre Hogar no usa puertas de avance/guardado/emisión ni imprime')
  const idx = sinComentarios(readFileSync(join(SRV, 'src/adapters/index.ts'), 'utf8'))
  assert.match(idx, /^if \(MAPFRE_HOGAR_ACTIVO\) adaptadores\.registrar\(mapfreHogar\)$/m, 'mapfreHogar se registra SOLO con `if (MAPFRE_HOGAR_ACTIVO)`')
  assert.ok(!/occidentHogar/.test(idx), 'Occident Hogar sigue SIN registrar (aparcado)')
  const reglas = sinComentarios(readFileSync(join(RAIZ, 'apps/asegura/lib/tarificador-reglas.ts'), 'utf8'))
  assert.match(reglas, /export const COMPANIAS_HOGAR_RPA_CON_INTERRUPTOR = \['mapfre'\] as const/, 'el interruptor solo puede abrir Mapfre (Occident: su fila está activa para explorar)')
  assert.match(reglas, /export const ENV_HOGAR_COMPANIAS_EXTRA = 'TARIFICADOR_HOGAR_COMPANIAS_EXTRA'/)
  assert.match(reglas, /\.filter\(\(c\) => \(COMPANIAS_HOGAR_RPA_CON_INTERRUPTOR as readonly string\[\]\)\.includes\(c\)\)/, 'el env se filtra contra la lista cerrada')
})

/** Infracciones del EXPLORADOR IA del worker (fase B, 13/10/2026). Exportada en el test para verla FALLAR. */
function infraccionesExplorador(explorador: string, guard: string, otros: Record<string, string>): string[] {
  const out: string[] = []
  // 1. El bucle solo actúa así: pulsar por el guard (marcar/avanzar), el avance autorizado por su función guardada, rellenar
  //    con el valor de `resolverDato` y elegir por valor exacto. Nada de goto, teclado ni marcar fuera del guard.
  const pulsaciones = [...explorador.matchAll(/\b(k\.pulsar|k\.pulsarAutorizado|k\.pulsarGuardadoDialogo)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`)
  if (pulsaciones.some((p) => !/^k\.pulsar\(loc\)$|^k\.pulsarAutorizado\(loc, hit\.el, hit\.marco\)$|^k\.pulsarGuardadoDialogo\(loc, hit\.el, hit\.marco\)$/.test(p))) out.push(`pulsación inesperada: ${pulsaciones.join(' | ')}`)
  // 1b. «Guardar» de modal (Alberto, 14/10/2026): una sola llamada, y SOLO bajo la autorización del módulo para ESA entrada.
  const dialogo = [...explorador.matchAll(/k\.pulsarGuardadoDialogo\(/g)].length
  if (dialogo > 1) out.push('pulsarGuardadoDialogo: más de una llamada')
  if (dialogo === 1 && !/\} else if \(esGuardadoEnDialogoAutorizado\(k\.entrada, hit\.el\)\) \{\n(?:[^\n]*\n){0,4}?\s*await k\.pulsarGuardadoDialogo\(loc, hit\.el, hit\.marco\)/.test(explorador)) out.push('pulsarGuardadoDialogo fuera de su rama autorizada (esGuardadoEnDialogoAutorizado)')
  // `escrito` = `valorParaControl(d.valor, hit.el)` y nada más; se escribe UNA vez con `fill` y, si el portal lo vació (datepicker,
  // 14/10/2026), se reteclea UNA vez en `fijarValor` con ESE mismo valor (`pressSequentially`, sin Enter ni Tab).
  const fills = [...explorador.matchAll(/\.fill\(([^\n]*)\)/g)].map((m) => m[1])
  if (fills.length !== 1 || !/^escrito, \{ timeout: 10_000 \}$/.test(fills[0]) || !/const escrito = valorParaControl\(d\.valor, hit\.el\)\n/.test(explorador)) out.push(`fill inesperado: ${fills.join(' | ')}`)
  const tecleos = [...explorador.matchAll(/\.pressSequentially\(([^\n]*)\)/g)].map((m) => m[1])
  const fijar = [...explorador.matchAll(/\bfijarValor\(([^)]*)\)/g)].map((m) => m[1])
  if (tecleos.length > 1 || tecleos.some((t) => !/^valor, \{ delay: \d+, timeout: [\d_]+ \}$/.test(t))) out.push(`tecleo inesperado: ${tecleos.join(' | ')}`)
  if (tecleos.length && (!/async function fijarValor\(loc: Locator, valor: string\)/.test(explorador) || fijar.some((f) => !/^loc, escrito$|^loc: Locator, valor: string$/.test(f)))) out.push(`fijarValor con otro valor: ${fijar.join(' | ')}`)
  if (/\.goto\(|\.press\(|\.type\(|keyboard|\.check\(|setChecked|\.tap\(/.test(explorador)) out.push('el explorador navega, teclea o marca fuera del guard')
  // 2. El valor del dato no va al log ni a asegura: `d.valor` aparece SOLO en el fill.
  if ((explorador.match(/d\.valor/g) ?? []).length !== 1) out.push('d.valor se usa fuera del fill (¿log? ¿cable?)')
  // 3. Revalidación contra el inventario propio ANTES de actuar.
  const iVal = explorador.indexOf('validarRespuestaExplorador(r.respuesta, { inventario: inv')
  // El lote se recorre por índice (14/10/2026: se puede CORTAR tras un repintado): el ancla es su asignación, que ORDENA
  // (`ordenarLote`, 8d0676f9) las acciones YA validadas: solo las reordena, nunca añade ni cambia ninguna.
  const iAct = explorador.search(/const lote = (?:ordenarLote\()?v\.respuesta\.acciones/)
  if (iVal < 0 || iAct < 0 || iVal > iAct || !/if \(!v\.ok\) throw new Parar\('ambiguo'(?:, '[a-z_]+')?\)/.test(explorador)) out.push('el lote no se revalida contra el inventario propio antes de actuar')
  // 4. Paradas humanas (CAPTCHA, SMS/OTP) ANTES de cada inventario.
  const iBucle = explorador.indexOf('for (;;) {')
  const iInv = explorador.indexOf('capturarInventarioExploracion(page)', iBucle)
  for (const p of ['exigirSinCaptcha(page)', 'exigirSinVerificacion(page, k.compania)']) {
    const i = explorador.indexOf(p, iBucle)
    if (i < 0 || i > iInv) out.push(`falta ${p} antes del inventario`)
  }
  // 5. La función guardada del avance autorizado: autorización del módulo + bloqueo + comprobarBoton ANTES de abrir y pulsar.
  const fn = guard.split(/^export async function /m).find((f) => f.startsWith('pulsarExploracionAutorizada'))
  if (!fn) out.push('falta pulsarExploracionAutorizada en guard.ts')
  else {
    const abrir = fn.indexOf('abrir(hasta, [endpoint])')
    const clic = fn.indexOf('.click(')
    for (const p of ['guard.comprobar()', 'guard.ventana.abierta()', "usados.has('exploracion')", 'esAvanceAutorizado(aut.entrada, aut.el, aut.marco)', 'bloqueoAvance(aut.entrada, aut.el, aut.marco) !== null', 'comprobarBoton(desc, { permitirAceptar: true })']) {
      const i = fn.indexOf(p)
      if (i < 0 || abrir < 0 || i > abrir || abrir > clic) out.push(`pulsarExploracionAutorizada: «${p}» tiene que ir ANTES de abrir la ventana y pulsar`)
    }
    if ((fn.match(/\.click\(/g) ?? []).length !== 1) out.push('pulsarExploracionAutorizada: un solo clic')
    if (!/\} finally \{\s*page\.off\('dialog', alDialogo\)\s*guard\.avance\.cerrar\(\)\s*\}/.test(fn)) out.push('pulsarExploracionAutorizada: la ventana se cierra SIEMPRE (finally)')
  }
  // 5b. La puerta del «Guardar» de modal: autorización del módulo por ENTRADA + diálogo y título VIVOS + un solo candidato +
  //     comprobarBoton SIN permisos, todo ANTES del único clic; sin ventana de red y con el manejador de diálogos retirado.
  const fd = guard.split(/^export async function /m).find((f) => f.startsWith('pulsarGuardadoDialogoAutorizado'))
  if (!fd) out.push('falta pulsarGuardadoDialogoAutorizado en guard.ts')
  else {
    const clic = fd.indexOf('.click(')
    for (const p of ['guard.comprobar()', 'guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()', 'MAX_GUARDADOS_DIALOGO', 'exigirSinCuentaBancaria(page)', 'esGuardadoEnDialogoAutorizado(aut.entrada, aut.el)', 'bloqueoAvance(aut.entrada, aut.el, aut.marco) !== null', 'boton.evaluate(tituloDialogoVivo, SELECTOR_DIALOGO)', 'casaGuardadoEnDialogo(aut.entrada, desc[0], titulo)', 'candidatos !== 1', 'comprobarBoton(desc)\n', 'cat.emision || cat.prohibida']) {
      const i = fd.indexOf(p)
      if (i < 0 || clic < 0 || i > clic) out.push(`pulsarGuardadoDialogoAutorizado: «${p.trim()}» tiene que ir ANTES del clic`)
    }
    if ((fd.match(/\.click\(/g) ?? []).length !== 1) out.push('pulsarGuardadoDialogoAutorizado: un solo clic')
    if (/ABRIR_|abrir\(|permitirAceptar|permitirGuardarPresupuesto/.test(fd)) out.push('pulsarGuardadoDialogoAutorizado: no abre ventanas de red ni permisos del guard')
    if (!/\} finally \{\s*page\.off\('dialog', alDialogo\)\s*\}/.test(fd)) out.push('pulsarGuardadoDialogoAutorizado: el manejador de diálogos se retira SIEMPRE (finally)')
  }
  // 6. Solo el explorador llama a las funciones guardadas.
  for (const [rel, src] of Object.entries(otros)) {
    if (/pulsarExploracionAutorizada\(/.test(src)) out.push(`${rel} llama a pulsarExploracionAutorizada`)
    if (/pulsarGuardadoDialogoAutorizado\(/.test(src)) out.push(`${rel} llama a pulsarGuardadoDialogoAutorizado`)
  }
  return out
}

test('EXPLORADOR IA (worker): solo actúa por el guard, revalida, para en OTP/CAPTCHA y no saca valores', () => {
  const explorador = sinComentarios(readFileSync(join(SRV, 'src/explorador.ts'), 'utf8'))
  const guard = sinComentarios(readFileSync(join(SRV, 'src/guard.ts'), 'utf8'))
  const otros = Object.fromEntries(ficheros(join(SRV, 'src')).filter((f) => !/\/src\/(explorador|guard)\.ts$/.test(f)).map((f) => [relative(RAIZ, f), sinComentarios(readFileSync(f, 'utf8'))]))
  assert.deepEqual(infraccionesExplorador(explorador, guard, otros), [])
  // El runner solo lo arranca para `modo === 'exploracion'`.
  assert.match(sinComentarios(readFileSync(join(SRV, 'src/runner.ts'), 'utf8')), /if \(trabajo\.modo === 'exploracion'\) return ejecutarExploracion\(/)
  // Cepo del cepo: cada forma de romperlo se ve en ROJO.
  const malos: [string, string][] = [
    ['pulsación directa', explorador.replace('await k.pulsar(loc)', 'await k.pulsar(page.locator("#x"))')],
    ['valor al log', explorador.replace("k.log('exploracion_paso', {", "k.log('exploracion_paso', { v: d.valor,")],
    ['sin revalidar', explorador.replace("if (!v.ok) throw new Parar('ambiguo', 'lote_no_valido')", '')],
    ['sin OTP', explorador.replace('await exigirSinVerificacion(page, k.compania)', '')],
    ['navega', explorador + "\nawait page.goto('https://x')"],
    ['teclea otra cosa', explorador.replace('loc.pressSequentially(valor, {', "loc.pressSequentially('\\n', {")],
    ['retecleo con otro valor', explorador.replace('await fijarValor(loc, escrito)', 'await fijarValor(loc, d.valor)')],
  ]
  for (const [nombre, src] of malos) {
    assert.notEqual(src, explorador, `el cepo «${nombre}» no cambió nada`)
    assert.notDeepEqual(infraccionesExplorador(src, guard, otros), [], nombre)
  }
  const sinAut = guard.replace('esAvanceAutorizado(aut.entrada, aut.el, aut.marco) ||', '')
  assert.notEqual(sinAut, guard)
  assert.notDeepEqual(infraccionesExplorador(explorador, sinAut, otros), [], 'guard sin autorización')
  assert.notDeepEqual(infraccionesExplorador(explorador, guard, { 'x.ts': 'await pulsarExploracionAutorizada(page, guard, b, a)' }), [], 'otro fichero la llama')
  // Cepos del «Guardar» de modal (14/10/2026): cada brazo, en ROJO.
  const cambia = (src: string, de: string, a: string) => {
    const r = src.replace(de, a)
    assert.notEqual(r, src, `el cepo no cambió nada: «${de}»`)
    return r
  }
  const malosDialogo: [string, string, string][] = [
    ['puerta sin autorización por entrada', explorador, cambia(guard, 'esGuardadoEnDialogoAutorizado(aut.entrada, aut.el) ||', '')],
    ['puerta sin título vivo', explorador, cambia(guard, 'if (!casaGuardadoEnDialogo(aut.entrada, desc[0], titulo))', 'if (false)')],
    ['puerta sin candidato único', explorador, cambia(guard, 'if (candidatos !== 1)', 'if (false)')],
    ['puerta sin comprobarBoton', explorador, ((m) => guard.slice(0, guard.indexOf(m)) + cambia(guard.slice(guard.indexOf(m)), '  comprobarBoton(desc)\n', ''))('export async function pulsarGuardadoDialogoAutorizado')],
    ['puerta que abre la red', explorador, cambia(guard, '  usados.add(`dialogo:${n + 1}`)', '  ABRIR_GUARDADO.get(guard)?.(origen)\n  usados.add(`dialogo:${n + 1}`)')],
    ['bucle sin la rama autorizada', cambia(explorador, '} else if (esGuardadoEnDialogoAutorizado(k.entrada, hit.el)) {', '} else if (true) {'), guard],
    ['bucle con otro botón', cambia(explorador, 'await k.pulsarGuardadoDialogo(loc, hit.el, hit.marco)', 'await k.pulsarGuardadoDialogo(page.locator("#x"), hit.el, hit.marco)'), guard],
  ]
  for (const [nombre, e, g] of malosDialogo) assert.notDeepEqual(infraccionesExplorador(e, g, otros), [], nombre)
  assert.notDeepEqual(infraccionesExplorador(explorador, guard, { 'x.ts': 'await pulsarGuardadoDialogoAutorizado(page, guard, b, a)' }), [], 'otro fichero llama a la puerta del modal')
})

test('GUARDAR PRESUPUESTO (Alberto 14/10/2026): lista única, puerta propia en guard.ts y la emisión intacta', () => {
  const guard = sinComentarios(readFileSync(join(SRV, 'src/guard.ts'), 'utf8'))
  const fn = guard.split(/^export async function /m).find((f) => f.startsWith('pulsarGuardadoPresupuesto'))
  assert.ok(fn, 'falta pulsarGuardadoPresupuesto en guard.ts')
  const abrir = fn!.indexOf('abrir(origen)')
  const clic = fn!.indexOf('.click(')
  for (const paso of ['guard.comprobar()', 'guard.ventana.abierta()', 'MAX_GUARDADOS_PRESUPUESTO', 'bloqueoGuardadoPresupuesto(aut.el, aut.pantalla)', 'comprobarBoton(desc, { permitirGuardarPresupuesto: true })', 'clasificarAccionPortal(desc)', 'cat.emision || cat.prohibida || !cat.guardar']) {
    const i = fn!.indexOf(paso)
    assert.ok(i > -1 && i < abrir && abrir < clic, `pulsarGuardadoPresupuesto: «${paso}» tiene que ir ANTES de abrir la ventana y pulsar`)
  }
  assert.equal((fn!.match(/\.click\(/g) ?? []).length, 1, 'un solo clic')
  assert.ok(!/permitirAceptar: true/.test(fn!), 'el guardado NUNCA abre «Aceptar»')
  assert.match(fn!, /\} finally \{\s*page\.off\('dialog', alDialogo\)\s*guard\.guardado\.cerrar\(\)\s*\}/, 'la ventana del guardado se cierra SIEMPRE (finally)')
  // Red: durante el guardado, no-GET a otro origen se aborta; el cuerpo se sigue mirando (contract/emitir abortan).
  assert.match(guard, /if \(gv && noGet && !enGuardado\)/)
  assert.match(guard, /const porCuerpo = !porUrl && noGet && parametrosParecenEmision\(cuerpoDe\(req\), op\)/)
  // Solo el explorador la usa.
  const usos = ficheros(join(SRV, 'src')).filter((f) => !f.endsWith('/src/guard.ts') && /pulsarGuardadoPresupuesto\(/.test(sinComentarios(readFileSync(f, 'utf8'))))
  assert.deepEqual(usos.map((f) => relative(RAIZ, f)), ['services/tarificador-rpa/src/explorador.ts'])
  // El guard del módulo: Archivar sigue en TEXTOS_BLOQUEADOS_ALTA (solo se abre con la opción) y PATRON_EMISION intacto.
  const g = readFileSync(join(RAIZ, 'packages/module-tarificacion/src/guard-emision.ts'), 'utf8')
  // Tras fusionar con la frontera (14/10/2026): las mismas alternativas de siempre + los verbos prohibidos (firmar/pagar/domiciliar).
  assert.match(g, /export const PATRON_EMISION = new RegExp\(`emit\|emisi\|contrat\|formaliz\|suplement\|anul\|baja\|\$\{VERBOS_PROHIBIDOS\}`, 'i'\)/)
  assert.match(g, /\.\.\.PATRONES_GUARDADO_GUARD,/)
  assert.match(g, /const accionesDuras = opciones\.permitirGuardarPresupuesto \? 'contract' : 'store\|contract'/)
  // La lista única: emisión con todo lo que pidió Alberto; Proyecto ampliado ES guardar (Alberto, 14/10/2026), nunca prohibida.
  const lista = readFileSync(join(RAIZ, 'packages/module-tarificacion/src/acciones-portal.ts'), 'utf8')
  for (const n of ['Emitir', 'Contratar', 'Formalizar', 'Firmar', 'Pagar / Pago', 'Pago fraccionado', 'Tramitar póliza', 'Confirmar contratación', 'Domiciliar']) {
    assert.match(lista, new RegExp(`A\\('emision', '${n.replace(/[/]/g, '\\/')}'`), `«${n}» tiene que estar en EMISIÓN`)
  }
  assert.match(lista, /A\('guardar_presupuesto', 'Proyecto ampliado'/)
  assert.doesNotMatch(lista, /A\('prohibida', 'Proyecto ampliado'/)
  // Frontera de emisión por campos: la lista de campos bancarios vive AQUÍ (fuente única) y la aplica `detectarParada`.
  assert.match(lista, /export const CAMPOS_BANCARIOS/)
  assert.match(lista, /export const EXCEPCION_PROYECTO_AMPLIADO = Object\.freeze\(\{ id: 'EMISION_PROJ', texto: 'proyecto ampliado' \}\)/)
  assert.match(lista, /id === EXCEPCION_PROYECTO_AMPLIADO\.id/)
  const expl = readFileSync(join(RAIZ, 'packages/module-tarificacion/src/explorador.ts'), 'utf8')
  assert.match(expl, /fronteraEmisionPorCampos\(campos\)/)
})

/** Infracciones del LOGIN ASISTIDO (14/10/2026). Exportada en el test para verla FALLAR. */
function infraccionesLoginAsistido(login: string, explorador: string, otros: Record<string, string>): string[] {
  const out: string[] = []
  // 1. Un solo `fill`, con el valor LOCAL de la clave validada, y justo antes la comprobación de host del SSO.
  const fills = [...login.matchAll(/\.fill\(([^\n]*)\)/g)].map((m) => m[1])
  if (fills.length !== 1 || fills[0] !== 'valorCredencial(a.dato, k.credenciales), { timeout: 10_000 }') out.push(`fill inesperado: ${fills.join(' | ')}`)
  const iFill = login.indexOf('.fill(valorCredencial(')
  const previo = login.slice(Math.max(0, iFill - 400), iFill)
  if (!/if \(!enSso\(\)\) throw/.test(previo)) out.push('el fill no va precedido de la comprobación de host del SSO')
  if (!/a\.dato === CLAVE_CONTRASENA && tipo !== 'password'/.test(login.slice(0, iFill))) out.push('la contraseña no exige un campo password VIVO')
  // 2. El valor no va a ningún otro sitio: `valorCredencial(` solo en su definición y en el fill; `.contrasena` solo dentro.
  if ((login.match(/valorCredencial\(/g) ?? []).length !== 2) out.push('valorCredencial se usa fuera del fill')
  if ((login.match(/\.contrasena\b/g) ?? []).length !== 1) out.push('la contraseña se nombra fuera de valorCredencial')
  if (/\.goto\(|\.press\(|\.type\(|keyboard|\.check\(|setChecked|\.tap\(|pressSequentially/.test(login)) out.push('el login asistido navega, teclea o marca fuera del guard')
  // 3. Lo que sale: marcado + última red ANTES de pedir el paso; revalidación ANTES de actuar; OTP/CAPTCHA ANTES del inventario.
  const iPedir = login.indexOf('k.pedirPaso(')
  for (const p of ['marcarCredencialesInventario(captura.inventario, k.credenciales)', 'inventarioSinCredenciales(inv, k.credenciales)']) {
    const i = login.indexOf(p)
    if (i < 0 || i > iPedir) out.push(`«${p}» tiene que ir ANTES de pedir el paso`)
  }
  const iVal = login.indexOf('validarRespuestaLogin(r.respuesta, { inventario: inv, entrada: k.entrada })')
  const iEje = login.indexOf('await ejecutar(')
  if (iVal < 0 || iEje < 0 || iVal > iEje || !/if \(!v\.ok\) throw/.test(login)) out.push('el lote del login no se revalida contra el inventario propio antes de actuar')
  const iInv = login.indexOf('capturarInventarioExploracion(page)')
  for (const p of ['await k.exigirSinCaptcha()', 'await exigirSinVerificacion(page, la.compania)', 'esUrlSsoLoginAsistido(la.compania, page.url())']) {
    const i = login.indexOf(p)
    if (i < 0 || i > iInv) out.push(`falta «${p}» antes del inventario`)
  }
  // 4. Avance: ventana de red del login abierta SOLO alrededor de la pulsación (y cerrada siempre).
  if (!/abrirVentanaLogin\(k\.guard, origen\)\n\s*try \{\n\s*await k\.pulsar\(loc\)[\s\S]*?\} finally \{\n\s*cerrarVentanaLogin\(k\.guard\)/.test(login)) out.push('el avance del login no va con la ventana de red abierta y cerrada en finally')
  // 5. El explorador solo le da el login asistido a las compañías de la lista cerrada; nadie más abre la ventana.
  if (!/\.\.\.\(loginAsistidoDe\(exp\.entrada\) \? \{ loginAsistido:/.test(explorador)) out.push('el login asistido no está atado a loginAsistidoDe(entrada)')
  for (const [rel, src] of Object.entries(otros)) if (/abrirVentanaLogin\(/.test(src)) out.push(`${rel} abre la ventana de red del login`)
  return out
}

test('LOGIN ASISTIDO (14/10/2026): la IA solo da claves; el valor va SOLO al campo del SSO; revalida y para en OTP', () => {
  const login = sinComentarios(readFileSync(join(SRV, 'src/login-asistido.ts'), 'utf8'))
  const explorador = sinComentarios(readFileSync(join(SRV, 'src/explorador.ts'), 'utf8'))
  const otros = Object.fromEntries(ficheros(join(SRV, 'src')).filter((f) => !/\/src\/(login-asistido|guard)\.ts$/.test(f)).map((f) => [relative(RAIZ, f), sinComentarios(readFileSync(f, 'utf8'))]))
  assert.deepEqual(infraccionesLoginAsistido(login, explorador, otros), [])
  // Cepo del cepo: cada brazo, en ROJO.
  const cambia = (src: string, de: string, a: string) => {
    const r = src.replace(de, a)
    assert.notEqual(r, src, `el cepo no cambió nada: «${de}»`)
    return r
  }
  const malos: [string, string, string?][] = [
    ['fill con otro valor', cambia(login, 'loc.fill(valorCredencial(a.dato, k.credenciales), {', "loc.fill('x', {")],
    ['sin host antes del fill', cambia(login, "if (!enSso()) throw new ErrorTarificador('portal', 'login asistido: el campo no está en el SSO: no se escribe')", '')],
    ['contraseña sin password vivo', cambia(login, "a.dato === CLAVE_CONTRASENA && tipo !== 'password'", 'false')],
    ['valor al log', cambia(login, "k.log('login_asistido_paso', { n,", "k.log('login_asistido_paso', { v: valorCredencial(CLAVE_CONTRASENA, k.credenciales), n,")],
    ['contraseña nombrada fuera', login + '\nconst x = k.credenciales.contrasena'],
    ['sin marcar el inventario', cambia(login, 'marcarCredencialesInventario(captura.inventario, k.credenciales)', 'captura.inventario')],
    ['sin última red', cambia(login, 'inventarioSinCredenciales(inv, k.credenciales)', 'true')],
    ['sin revalidar', cambia(login, 'validarRespuestaLogin(r.respuesta, { inventario: inv, entrada: k.entrada })', 'r.respuesta as never')],
    ['sin OTP', cambia(login, 'await exigirSinVerificacion(page, la.compania)', '')],
    ['navega', login + "\nawait page.goto('https://x')"],
    ['sin ventana de red', cambia(login, 'abrirVentanaLogin(k.guard, origen)\n', '')],
    ['explorador sin puerta por entrada', login, cambia(explorador, '...(loginAsistidoDe(exp.entrada) ? { loginAsistido:', '...(true ? { loginAsistido:')],
  ]
  for (const [nombre, l, e] of malos) assert.notDeepEqual(infraccionesLoginAsistido(l, e ?? explorador, otros), [], nombre)
  assert.notDeepEqual(infraccionesLoginAsistido(login, explorador, { 'x.ts': 'abrirVentanaLogin(guard, o)' }), [], 'otro fichero abre la ventana')
})

// ─── Mapfre NSEI (Alberto, 14/10/2026) ───────────────────────────────────────

test('MAPFRE · la PUERTA es la fila companias_integracion: el worker registra siempre y asegura no encola/reclama sin ella', () => {
  const idx = sinComentarios(readFileSync(join(SRV, 'src/adapters/index.ts'), 'utf8'))
  assert.ok(!/TARIFICADOR_MAPFRE_ACTIVO|mapfreActivo|process\.env/.test(idx), 'el registro de adaptadores no lee interruptores del entorno para Mapfre')
  assert.match(idx, /^adaptadores\.registrar\(mapfreAuto\)$/m)
  assert.match(idx, /^adaptadores\.registrar\(mapfreMoto\)$/m)
  const t = sinComentarios(readFileSync(join(RAIZ, 'apps/asegura/lib/tarificador.ts'), 'utf8'))
  const encolar = t.slice(t.indexOf('export async function encolarTrabajo'), t.indexOf('export async function reclamarSiguiente'))
  const puerta = encolar.indexOf('if (!integ || !integ.activo || !puedeAutomatizar(integ.modo))')
  assert.ok(puerta > -1 && puerta < encolar.indexOf('insert into seguros.tarificacion_trabajos'), 'encolarTrabajo: sin fila activa rpa_autorizada no se inserta')
  const reclamar = t.slice(t.indexOf('export async function reclamarSiguiente'), t.indexOf('export type DepsLanzador'))
  assert.match(reclamar, /where correduria_id = \$\{correduriaId\}::uuid and compania = \$\{clave\} and activo and modo = 'rpa_autorizada'/, 'el cupo sale SOLO de filas activas rpa_autorizada')
  assert.match(reclamar, /join seguros\.companias_integracion ci[\s\S]*?and ci\.activo and ci\.modo = 'rpa_autorizada'[\s\S]*?set estado = 'en_curso'|set estado = 'en_curso'[\s\S]*?join seguros\.companias_integracion ci[\s\S]*?and ci\.activo and ci\.modo = 'rpa_autorizada'/, 'solo se pone en_curso un trabajo con fila activa rpa_autorizada')
  // `en_curso` (lo único que el worker recibe) solo lo pone reclamarSiguiente.
  const todos = ficheros(join(RAIZ, 'apps/asegura/lib')).concat(ficheros(join(RAIZ, 'apps/asegura/app')))
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => /tarificacion_trabajos/.test(readFileSync(f, 'utf8')) && /estado\s*=\s*'en_curso'\s*,/.test(sinComentarios(readFileSync(f, 'utf8'))))
  assert.deepEqual(todos.map((f) => relative(RAIZ, f)), ['apps/asegura/lib/tarificador.ts'])
  const mod = readFileSync(join(RAIZ, 'packages/module-tarificacion/src/modo-integracion.ts'), 'utf8')
  assert.match(mod, /export function puedeAutomatizar\(modo: unknown\): boolean \{\s*return modo === 'rpa_autorizada'\s*\}/)
})

test('MAPFRE AUTO (coche, 14/10/2026) · se encola desde la ficha como moto: asegura y plataforma aceptan el ramo, y la puerta sigue siendo la fila', () => {
  const reglas = sinComentarios(readFileSync(join(RAIZ, 'apps/asegura/lib/tarificador-reglas.ts'), 'utf8'))
  assert.match(reglas, /export const RAMOS_TARIFICABLES_RPA = \['comunidades', 'moto', 'auto', 'hogar'\] as const/)
  // 19/10/2026: Hogar solo con Allianz (la fila mapfre/occident hogar solo habilita la exploración), formulario sin tomador.
  assert.match(reglas, /export const COMPANIAS_HOGAR_RPA = \['allianz'\] as const/)
  assert.match(reglas, /if \(ramo === 'hogar'\) \{\s*const v = validarFormularioHogarSinTomador\(riesgo\)/)
  assert.match(reglas, /if \(ramo === 'moto' \|\| ramo === 'auto'\) \{\s*const v = validarFormularioAuto\(riesgo\)[\s\S]*?v\.formulario\.ramo !== ramo/, 'auto/moto: mismo validador y el formulario tiene que ser del ramo del trabajo')
  const t = sinComentarios(readFileSync(join(RAIZ, 'apps/asegura/lib/tarificador.ts'), 'utf8'))
  assert.match(t, /ramo: 'comunidades' \| 'moto' \| 'auto' \| 'hogar'/)
  const ruta = sinComentarios(readFileSync(join(RAIZ, 'apps/plataforma/app/api/correduria/tarificador/encolar/route.ts'), 'utf8'))
  assert.match(ruta, /b\.ramo !== 'comunidades' && b\.ramo !== 'moto' && b\.ramo !== 'auto' && b\.ramo !== 'hogar'/)
  assert.match(ruta, /i\.compania === c && i\.ramo === ramo/, 'la compañía solo si (compañía, ramo) está entre las integraciones activas')
  const bots = sinComentarios(readFileSync(join(RAIZ, 'apps/plataforma/lib/tarificador-bots-ramos.ts'), 'utf8'))
  assert.match(bots, /const ADAPTADORES: Readonly<Record<string, AdaptadorBot>> = \{ moto: adaptadorMoto, auto: adaptadorAuto, hogar: adaptadorHogar \}/)
})

test('MAPFRE · «Continuar» solo por pulsarContinuarMapfre: lista cerrada 1→2→3 y todas las comprobaciones ANTES del único clic', () => {
  const guard = sinComentarios(readFileSync(join(SRV, 'src/guard.ts'), 'utf8'))
  const bloque = guard.match(/export const PASOS_CONTINUAR_MAPFRE = Object\.freeze\(\{([\s\S]*?)\n\}\)\n/)
  assert.ok(bloque, 'falta PASOS_CONTINUAR_MAPFRE (Object.freeze) en guard.ts')
  assert.deepEqual([...bloque![1].matchAll(/^ {2}(\w+): Object\.freeze\(/gm)].map((m) => m[1]), ['datosBasicos', 'objetoAsegurado', 'figuras'])
  assert.ok(!/contrataci|proyecto|emisi/i.test(bloque![1]), 'ningún «Continuar» desde Coberturas/Proyectos ni hacia Contratación')
  const fn = guard.split(/^export async function /m).find((f) => f.startsWith('pulsarContinuarMapfre'))
  assert.ok(fn, 'falta pulsarContinuarMapfre en guard.ts')
  const clic = fn!.indexOf('.click(')
  for (const paso of ['guard.comprobar()', 'guard.ventana.abierta()', 'Object.hasOwn(PASOS_CONTINUAR_MAPFRE, paso)', 'usados.has(clave)', 'regla.previos.some(', 'exigirSinCuentaBancaria(page)', 'pasoActivoMapfre(page)', "'CONTINUAR'", 'comprobarBoton(desc)', 'usados.add(clave)']) {
    const i = fn!.indexOf(paso)
    assert.ok(i > -1 && i < clic, `pulsarContinuarMapfre: «${paso}» tiene que ir ANTES del clic`)
  }
  assert.ok(!/permitirAceptar|ABRIR_(VENTANA|AVANCE|GUARDADO)/.test(fn!), 'sin «Aceptar» permitido y sin abrir ventanas de red')
  assert.equal((fn!.match(/\.click\(/g) ?? []).length, 1, 'un solo clic')
  // El adaptador de Mapfre llega a «Continuar» solo por la función guardada del contexto.
  const mapfre = sinComentarios(readFileSync(join(SRV, 'src/adapters/mapfre/auto.ts'), 'utf8'))
  assert.ok(!/ctx\.pulsar\(|continuar['"]?\s*\)?\s*\.click|Continuar/.test(mapfre.replace(/'[^'\n]*'|`[^`\n]*`/g, '')), 'mapfre/auto.ts no nombra «Continuar» ni pulsa')
  const runner = sinComentarios(readFileSync(join(SRV, 'src/runner.ts'), 'utf8'))
  assert.match(runner, /continuarMapfre: async \(pagina, paso\) => \{\s*if \(pagina\.context\(\) !== context\)[^\n]*\n\s*await pulsarContinuarMapfre\(pagina, guard, paso, \(p\) => localizarContinuarConRespaldo\(p, k\.formador\)\)\s*\}/)
  // Pieza 4 (14/10/2026): los helpers COMUNES («Continuar» y mat-select) pulsan SOLO por el `pulsar` que reciben (= guard).
  for (const f of ['src/continuar.ts', 'src/mat-select.ts']) {
    const src = sinComentarios(readFileSync(join(SRV, f), 'utf8'))
    assert.ok(!/\.(?:click|dblclick|tap|press|check|setChecked|fill)\s*\(/.test(src), `${f}: nada de click()/press() directos`)
    assert.match(src, /\bo\.pulsar\(/, `${f}: pulsa por el pulsar guardado`)
  }
  // CADA helper recibe `pulsar: ctx.pulsar` (no basta una aparición): continuar Y mat-select, cada uno en su propia entrada.
  assert.match(runner, /pulsarContinuarSeguro\(destino, \{[^}]*pulsar: ctx\.pulsar/, 'el runner pasa ctx.pulsar a continuar')
  assert.match(runner, /elegirOpcionMatSelect\(select, valores, \{[^}]*pulsar: ctx\.pulsar/, 'el runner pasa ctx.pulsar a mat-select')
  assert.match(runner, /elegirMatSelect: [^\n]*\n\s*if \(select\.page\(\)\.context\(\) !== context\)/, 'mat-select comprueba la pestaña del trabajo')
})

test('MAPFRE · SIN LUPA (14/10/2026): el tomador se busca solo al salir del campo del NIF; ni rastro de la lupa ni de un clic en auto.ts', () => {
  const mapfre = sinComentarios(readFileSync(join(SRV, 'src/adapters/mapfre/auto.ts'), 'utf8'))
  assert.match(mapfre, /await campo\.blur\(\)/, 'al teclear el NIF se sale del campo (Mapfre busca sola)')
  assert.ok(!/\.click\(|ctx\.pulsar\(/.test(mapfre), 'auto.ts no pulsa nada')
  for (const f of ['src/adapters/mapfre/auto.ts', 'src/formador.ts', 'src/guard.ts', 'src/runner.ts', 'src/adaptador.ts']) {
    assert.ok(!/buscar_tomador|buscarTomadorMapfre|pulsarBuscarTomadorMapfre|TEXTOS_BUSCAR_TOMADOR|esControlBuscarTomador/.test(sinComentarios(readFileSync(join(SRV, f), 'utf8'))), `${f}: la lupa del tomador ya no existe`)
  }
  assert.match(mapfre, /reaccion === 'nuevo'\) await altaTomadorNuevo\(/, 'tomador no existente → alta en el formulario (no error)')
  assert.ok(!/ErrorTarificador\('datos', 'mapfre\/auto: Mapfre no encuentra al tomador/.test(mapfre), 'ya no es error `datos` definitivo')
})

test('MAPFRE · el NIF del tomador es SECRETO del trabajo en el worker: redactado en mensajes/URL/HTML y sin captura', () => {
  const runner = sinComentarios(readFileSync(join(SRV, 'src/runner.ts'), 'utf8'))
  assert.match(runner, /const secretosRiesgo = secretosDelRiesgo\(trabajo\.riesgo\)/)
  assert.match(runner, /const secretos = \[\.\.\.secretosDelEntorno\(env\), \.\.\.secretosRiesgo\]/)
  assert.match(runner, /evidencia\.captura && secretosRiesgo\.length === 0 &&/, 'con NIF en el riesgo no viaja la captura (una imagen no se redacta)')
  const tras = runner.slice(runner.indexOf('const redactarTrabajo'))
  assert.ok(!/(?<![\w.])redactar\((?!Trabajo)/.test(tras.replace(/ejecutarEmision\([^\n]*\n/, '')), 'tras leer el trabajo, todo pasa por redactarTrabajo')
})

// ─── Relevo del código SMS de Okta por Telegram (Generali, Alberto 19/10/2026) ───────────────────────────────────

/** Infracciones de la FORMA del relevo. Exportada en el test para verla FALLAR brazo a brazo. */
function infraccionesRelevoSms(runner: string, relevo: string, guard: string): string[] {
  const out: string[] = []
  // 1. `trasLogin`: el corte por SMS va ANTES de la parada genérica de verificación, y solo con relevo sin usar en la URL exacta.
  const tras = runner.slice(runner.indexOf('trasLogin: async () => {'), runner.indexOf('adjuntarPdf:'))
  const iCorte = tras.indexOf('if (k.relevoSms && !k.relevoSms.usado && esUrlOktaSmsGenerali(page.url())) throw new ErrorCodigoSmsPendiente(k.compania)')
  const iVerif = tras.indexOf('await exigirSinVerificacion(page, k.compania)')
  if (iCorte < 0 || iVerif < 0 || iCorte > iVerif) out.push('trasLogin: el corte por SMS tiene que ir antes de exigirSinVerificacion (y solo con relevo sin usar)')
  // 2. El relevo: solo ante ErrorCodigoSmsPendiente, con el guard LIMPIO, y se gasta ANTES de relevar (uno por trabajo).
  if (!/if \(error instanceof ErrorCodigoSmsPendiente && k\.relevoSms && !k\.relevoSms\.usado && !guard\.violacion\(\)\) \{\s*k\.relevoSms\.usado = true\s*const rv: Relevo = await k\.relevoSms\.relevar\(page, guard\)/.test(runner)) out.push('runner: el relevo solo con el guard limpio y gastándolo antes de relevar')
  // 3. El código abierto: UNA sola lectura, y va DIRECTA a verificarCodigoSmsGenerali (ni logs, ni mensajes, ni resultado).
  const usos = relevo.match(/espera\.codigo\.valor/g) ?? []
  if (usos.length !== 1 || !/await verificarCodigoSmsGenerali\(page, guard, espera\.codigo\.valor\)/.test(relevo)) out.push('relevo-sms: el código solo va a verificarCodigoSmsGenerali')
  if (/console\.|d\.log\([^)]*codigo\.|d\.log\([^)]*sello/.test(relevo)) out.push('relevo-sms: un log nombra el código o el sello')
  if (!/\} finally \{\s*await vaciarCodigoSmsGenerali\(page\)/.test(relevo)) out.push('relevo-sms: el campo del código se vacía SIEMPRE (finally)')
  // 4. guard: el valor se escribe UNA vez, solo en verificarCodigoSmsGenerali, tras comprobar la pantalla, el botón y su texto.
  const fn = guard.split(/^export async function /m).find((f) => f.startsWith('verificarCodigoSmsGenerali'))
  if (!fn) out.push('falta verificarCodigoSmsGenerali en guard.ts')
  else {
    const iFill = fn.indexOf('await campo.fill(codigo')
    for (const p of ["exigirPantallaOkta(page, guard, '«Verificar» del SMS')", "marcarUsoOkta(guard, 'generali:okta:verificar')", 'comprobarBoton(desc)', 'if (texto !== BOTON_VERIFICAR_SMS_GENERALI)']) {
      const i = fn.indexOf(p)
      if (i < 0 || iFill < 0 || i > iFill) out.push(`verificarCodigoSmsGenerali: «${p}» tiene que ir antes de escribir el código`)
    }
  }
  if ((guard.match(/\.fill\(codigo/g) ?? []).length !== 1) out.push('guard: el código se escribe en un solo sitio')
  const enviar = guard.split(/^export async function /m).find((f) => f.startsWith('pulsarEnviarSmsGenerali'))
  if (!enviar || !/exigirPantallaOkta\(page, guard, '«Enviar» del SMS'\)[\s\S]*comprobarBoton\(desc\)\s*marcarUsoOkta\(guard, 'generali:okta:enviar'\)\s*await control\.click\(\)/.test(enviar)) out.push('pulsarEnviarSmsGenerali: pantalla exacta + comprobarBoton + una vez, antes del clic')
  return out
}

test('RELEVO SMS (19/10/2026): corte en trasLogin, relevo único con guard limpio, el código solo a su campo y vaciado al acabar', () => {
  const runner = sinComentarios(readFileSync(join(SRV, 'src/runner.ts'), 'utf8'))
  const relevo = sinComentarios(readFileSync(join(SRV, 'src/relevo-sms.ts'), 'utf8'))
  const guard = sinComentarios(readFileSync(join(SRV, 'src/guard.ts'), 'utf8'))
  assert.deepEqual(infraccionesRelevoSms(runner, relevo, guard), [])
  const cambia = (src: string, de: string, a: string) => {
    const r = src.replace(de, a)
    assert.notEqual(r, src, `el cepo no cambió nada: «${de}»`)
    return r
  }
  const malos: [string, string, string, string][] = [
    ['corte sin relevo', cambia(runner, 'if (k.relevoSms && !k.relevoSms.usado && esUrlOktaSmsGenerali(page.url())) throw', 'if (esUrlOktaSmsGenerali(page.url())) throw'), relevo, guard],
    ['relevo con guard violado', cambia(runner, '!k.relevoSms.usado && !guard.violacion()) {', '!k.relevoSms.usado) {'), relevo, guard],
    ['relevo sin gastar', cambia(runner, 'k.relevoSms.usado = true\n', ''), relevo, guard],
    ['código al log', runner, cambia(relevo, "d.log('codigo_sms_recibido')", "d.log('codigo_sms_recibido', { c: espera.codigo.valor })"), guard],
    ['sin vaciar', runner, cambia(relevo, 'await vaciarCodigoSmsGenerali(page).catch(() => undefined)', ''), guard],
    ['escribe antes de comprobar', runner, relevo, cambia(cambia(guard, '  await campo.fill(codigo, { timeout: 5_000 })\n', ''), '  const campo = await campoCodigoOkta(page)\n', '  const campo = await campoCodigoOkta(page)\n  await campo.fill(codigo, { timeout: 5_000 })\n')],
    ['Enviar sin comprobarBoton', runner, relevo, cambia(guard, "comprobarBoton(desc)\n  marcarUsoOkta(guard, 'generali:okta:enviar')", "marcarUsoOkta(guard, 'generali:okta:enviar')")],
  ]
  for (const [nombre, r, rl, g] of malos) assert.notDeepEqual(infraccionesRelevoSms(r, rl, g), [], nombre)
})
