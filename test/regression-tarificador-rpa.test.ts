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
  assert.match(src, /const v = validarResolucion\(p, d\)/, 'resolverConFormador tiene que validar antes de devolver')
  // 5. (revisión de seguridad 06/10/2026) La tabla solo tiene «calcular»; el campo pasa por bloqueo + etiqueta + sin casillas.
  const claves = [...tabla![1].matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1])
  assert.deepEqual(claves, ['calcular'], 'ACCIONES_PERMITIDAS solo puede tener «calcular»')
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
  // 2. La función: lista blanca (hasOwn) + comprobarBoton + pantalla de origen ANTES de abrir la ventana; un clic; finally cierra.
  const fn = guard.split(/^export async function /m).find((f) => f.startsWith('pulsarAvancePestanaAutorizado'))
  assert.ok(fn, 'falta pulsarAvancePestanaAutorizado en guard.ts')
  const abrir = fn!.indexOf('abrir(hasta, regla.endpoints)')
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
  assert.match(guard, /const enLista = av !== null && destinoAvancePermitido\(url, av\.endpoints\)\n\s*const op = \{ permitirAceptar: fases\.aceptarEnVuelo\(\) \|\| enLista \}/, 'capa (a): «aceptar» permitido SOLO hacia un destino de la lista blanca')
  assert.match(guard, /if \(av && noGet && !enLista\)/, 'capa (b): todo no-GET fuera de la lista blanca se aborta')
  assert.match(guard, /&& Date\.now\(\) < ventanaHasta && av === null\)/, 'la ventana de emisión no vale con el avance abierto')
  // 4. Solo el runner la enchufa y solo auto.ts la usa, con los dos selectores literales; Moto con flag PROPIO y apagado.
  const runner = sinComentarios(readFileSync(join(SRV, 'src/runner.ts'), 'utf8'))
  assert.match(runner, /avanzarPestanaAutorizada: \(selector\) => pulsarAvancePestanaAutorizado\(page, guard, selector\)/)
  const usos = ficheros(join(SRV, 'src')).filter((f) => !f.endsWith('/src/guard.ts') && !f.endsWith('/src/runner.ts') && /pulsarAvancePestanaAutorizado\(|avanzarPestanaAutorizada\(/.test(sinComentarios(readFileSync(f, 'utf8'))))
  assert.deepEqual(usos.map((f) => relative(RAIZ, f)), ['services/tarificador-rpa/src/adapters/allianz/auto.ts'])
  const auto = sinComentarios(readFileSync(join(SRV, 'src/adapters/allianz/auto.ts'), 'utf8'))
  assert.match(auto, /if \(ramo !== 'moto'\) \{\s*throw new ErrorMapaIncompleto\(/, 'Turismos sigue siendo hueco')
  assert.match(auto, /await ctx\.avanzarPestanaAutorizada\(destino === 'datosBasicos' \? 'td#datosBasicos' : 'td#rate'\)/)
  assert.match(auto, /^export const AUTO_ACTIVO = false$/m)
  assert.match(auto, /^export const MOTO_ACTIVO = (true|false)$/m)
  // Registro (runner tipado por ramo, 13/10/2026): Moto SOLO condicionada a su flag; Turismos nunca; sin casts dobles en el worker.
  const idx = sinComentarios(readFileSync(join(SRV, 'src/adapters/index.ts'), 'utf8'))
  assert.match(idx, /^if \(MOTO_ACTIVO\) adaptadores\.registrar\(allianzMoto\)$/m, 'allianzMoto se registra SOLO con `if (MOTO_ACTIVO)`')
  assert.equal((idx.match(/allianzMoto/g) ?? []).length, 2, 'allianzMoto: un import y un registro condicionado, ningún otro uso')
  assert.ok(!/allianzAuto|AUTO_ACTIVO/.test(idx), 'Turismos (allianzAuto) no se registra')
  for (const f of ficheros(join(SRV, 'src'))) assert.ok(!/as unknown as/.test(sinComentarios(readFileSync(f, 'utf8'))), `${relative(RAIZ, f)}: sin casts dobles (as unknown as): el runner valida por ramo`)
  const ramo = sinComentarios(readFileSync(join(SRV, 'src/ramo.ts'), 'utf8'))
  assert.match(ramo, /case 'comunidades':[\s\S]*?validarRiesgoComunidad\(crudo\)/, 'comunidades se valida con validarRiesgoComunidad')
  assert.match(ramo, /case 'auto':\s*case 'moto':[\s\S]*?validarFormularioAuto\(crudo, hoy\)/, 'auto/moto se validan con validarFormularioAuto')
  assert.match(runner, /prepararTrabajo\(adaptador, trabajo\.riesgo\)/, 'el runner valida con el validador del ramo (prepararTrabajo)')
  assert.ok(!/validarRiesgoComunidad/.test(runner), 'el runner ya no valida con el de Comunidades a pelo')
})

/** Infracciones del EXPLORADOR IA del worker (fase B, 13/10/2026). Exportada en el test para verla FALLAR. */
function infraccionesExplorador(explorador: string, guard: string, otros: Record<string, string>): string[] {
  const out: string[] = []
  // 1. El bucle solo actúa así: pulsar por el guard (marcar/avanzar), el avance autorizado por su función guardada, rellenar
  //    con el valor de `resolverDato` y elegir por valor exacto. Nada de goto, teclado ni marcar fuera del guard.
  const pulsaciones = [...explorador.matchAll(/\b(k\.pulsar|k\.pulsarAutorizado)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`)
  if (pulsaciones.some((p) => !/^k\.pulsar\(loc\)$|^k\.pulsarAutorizado\(loc, hit\.el, hit\.marco\)$/.test(p))) out.push(`pulsación inesperada: ${pulsaciones.join(' | ')}`)
  const fills = [...explorador.matchAll(/\.fill\(([^\n]*)\)/g)].map((m) => m[1])
  if (fills.length !== 1 || !/^valorParaControl\(d\.valor, hit\.el\), \{ timeout: 10_000 \}$/.test(fills[0])) out.push(`fill inesperado: ${fills.join(' | ')}`)
  if (/\.goto\(|\.press\(|\.type\(|keyboard|\.check\(|setChecked|\.tap\(/.test(explorador)) out.push('el explorador navega, teclea o marca fuera del guard')
  // 2. El valor del dato no va al log ni a asegura: `d.valor` aparece SOLO en el fill.
  if ((explorador.match(/d\.valor/g) ?? []).length !== 1) out.push('d.valor se usa fuera del fill (¿log? ¿cable?)')
  // 3. Revalidación contra el inventario propio ANTES de actuar.
  const iVal = explorador.indexOf('validarRespuestaExplorador(r.respuesta, { inventario: inv')
  // El lote se recorre por índice (14/10/2026: se puede CORTAR tras un repintado): el ancla es su asignación.
  const iAct = explorador.indexOf('const lote = v.respuesta.acciones')
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
  // 6. Solo el explorador llama a la función guardada.
  for (const [rel, src] of Object.entries(otros)) if (/pulsarExploracionAutorizada\(/.test(src)) out.push(`${rel} llama a pulsarExploracionAutorizada`)
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
  ]
  for (const [nombre, src] of malos) {
    assert.notEqual(src, explorador, `el cepo «${nombre}» no cambió nada`)
    assert.notDeepEqual(infraccionesExplorador(src, guard, otros), [], nombre)
  }
  const sinAut = guard.replace('esAvanceAutorizado(aut.entrada, aut.el, aut.marco) ||', '')
  assert.notEqual(sinAut, guard)
  assert.notDeepEqual(infraccionesExplorador(explorador, sinAut, otros), [], 'guard sin autorización')
  assert.notDeepEqual(infraccionesExplorador(explorador, guard, { 'x.ts': 'await pulsarExploracionAutorizada(page, guard, b, a)' }), [], 'otro fichero la llama')
})
