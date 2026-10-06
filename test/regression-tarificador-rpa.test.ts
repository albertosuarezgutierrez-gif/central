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
  for (const p of pulsaciones) assert.match(p, /^botonCalcular\(\w+\)$|sel\(|INICIAR SESI|^\s*page\.locator\('#link_new_policy'|modal\.getByText\(textoExacto\('(Particulares|Comunidades)'\)|^desplegableNx\(s\)$|^opcionNx\(raiz, valor\)$|^alterno\.locator$/, `pulsación inesperada en el adaptador: ${p}`)
  assert.match(adaptador, /function botonCalcular\(raiz: Raiz\): Locator \{\s*return raiz\.locator\('#calcular'\)\.filter\(\{ hasText: textoExacto\('Calcular'\) \}\)\s*\}/, 'botonCalcular solo puede devolver el #calcular de texto exacto «Calcular»')
  assert.match(adaptador, /function desplegableNx\(c: Locator\): Locator \{\s*return c\.locator\('xpath=ancestor-or-self::nx-dropdown\[1\]'\)\s*\}/, 'desplegableNx solo puede devolver el nx-dropdown del campo')
  assert.match(adaptador, /function opcionNx\(raiz: Raiz, valor: string\): Locator \{\s*return raiz\.locator\('nx-dropdown-item, \[role="option"\]'\)\.filter\(\{ hasText: textoExacto\(valor\) \}\)\s*\}/, 'opcionNx solo puede devolver opciones de lista por texto exacto')
  // 5. Listas del guard del módulo.
  const g = readFileSync(join(RAIZ, 'packages/module-tarificacion/src/guard-emision.ts'), 'utf8')
  assert.match(g, /TEXTOS_BLOQUEADOS_ALTA/)
  assert.match(g, /PATRON_ACEPTAR/)
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
  assert.match(src, /validarResolucion\(p\.tipo, p\.clave, d, p\.textoEsperado\)/, 'resolverConFormador tiene que validar antes de devolver')
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
})
