import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Datos del riesgo POR RAMO (30/09/2026): hogar (`datosVivienda`), vida/salud/decesos (`datosCapital`) y
// RC/comercio/comunidades/otros (`datosRiesgoLibre`), con el patrón del vehículo (`datosVehiculo`); y pedir
// precio desde la oportunidad en hogar, vida, salud y decesos. Lo que vigila esto vive en TSX, en
// rutas y en pantallas que ni `tsc` ni el build contrastan entre sí (un prop que se pierde por el camino
// compila igual): por eso se lee el FUENTE.

const RAIZ = join(import.meta.dirname, '..')
const P = join(RAIZ, 'apps/plataforma')
const CORR = join(P, 'app/(usuario)/correduria')
const leer = (ruta: string) => readFileSync(ruta, 'utf8')
const activas = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

const PANTALLAS = [
  { ramo: 'hogar', dir: 'hogar-nuevo', cliente: 'Formulario.tsx', lib: 'hogar-nuevo-asegura.ts', accion: 'pedirCotizacionHogar' },
  { ramo: 'vida', dir: 'vida-nuevo', cliente: 'VidaNuevo.tsx', lib: 'vida-nuevo-asegura.ts', accion: 'pedirCotizacionVida' },
  { ramo: 'salud', dir: 'salud-nuevo', cliente: 'SaludNuevo.tsx', lib: 'salud-nuevo-asegura.ts', accion: 'pedirCotizacionSalud' },
  { ramo: 'decesos', dir: 'decesos-nuevo', cliente: 'DecesosNuevo.tsx', lib: 'decesos-nuevo-asegura.ts', accion: 'pedirCotizacionDecesos' },
] as const

for (const x of PANTALLAS) {
  test(`🪤 regla 9 · ${x.ramo}: la oportunidad viaja de la URL al puerto (page → pantalla → acción → lib), sin perderse`, () => {
    const dir = join(CORR, 'cliente/[id]', x.dir)
    const page = activas(leer(join(dir, 'page.tsx')))
    assert.match(page, /searchParams/, 'la página lee sus searchParams')
    assert.match(page, new RegExp(`cargarVariante\\(paramTexto\\(sp\\.oportunidad\\), null, clienteId, '${x.ramo}'\\)`), 'lee ?oportunidad= y comprueba que el riesgo es de ESTE ramo')
    assert.match(page, /variante=\{variante\}|variante=\{variante\}/, 'pasa la variante a la pantalla')
    const pantalla = activas(leer(join(dir, x.cliente)))
    assert.match(pantalla, /variante: variante \? \{ oportunidadId: variante\.oportunidadId, nota: null \} : null/, 'la pantalla manda la oportunidad al pedir precio')
    const accion = activas(leer(join(dir, 'acciones.ts')))
    assert.match(accion, /oportunidadId: entrada\.variante\?\.oportunidadId \?\? null/, 'la acción la pasa a la lib')
    const lib = activas(leer(join(P, 'lib', x.lib)))
    assert.match(lib, /\.\.\.\(entrada\.oportunidadId \? \{ oportunidadId: entrada\.oportunidadId \} : \{\}\)/, 'la lib la manda al puerto de asegura')
  })
}

test('🪤 hogar: el buscador (GET) no pierde la oportunidad al ir de la dirección a la referencia', () => {
  const page = activas(leer(join(CORR, 'cliente/[id]/hogar-nuevo/page.tsx')))
  assert.equal((page.match(/<input type="hidden" name="oportunidad"/g) ?? []).length, 2, 'los dos formularios de búsqueda la llevan')
  assert.match(page, /conOportunidad\(\{ referencia: i\.refCompleta \}\)/)
  assert.match(page, /conOportunidad\(\{ direccion: c\.direccion, municipio, provincia \}\)/)
  assert.match(page, /vivienda\?\.referenciaCatastral/, 'la referencia anotada en el riesgo se usa si la URL no trae otra')
})

test('sin `?oportunidad=` el flujo de hogar es idéntico: la precalificación solo lleva lo declarado si lo hay', () => {
  const page = activas(leer(join(CORR, 'cliente/[id]/hogar-nuevo/page.tsx')))
  assert.match(page, /\.\.\.\(hayIniciales \? \{ resueltos: iniciales\.resueltos, correcciones: iniciales\.correcciones \} : \{\}\)/)
  const lib = activas(leer(join(P, 'lib/hogar-nuevo-asegura.ts')))
  assert.match(lib, /\.\.\.\(entrada\.oportunidadId && entrada\.nota/, 'la nota solo viaja con oportunidad')
})

test('🪤 PATCH del proxy: una sola clave de datos, confirmar solo booleano (422) y datos objeto (400)', () => {
  const r = activas(leer(join(P, 'app/api/correduria/oportunidad/riesgo/route.ts')))
  assert.match(r, /CLAVES_DATOS_RIESGO\.filter\(\(k\) => body\[k\] !== undefined\)/)
  assert.match(r, /claves\.length !== 1[\s\S]{0,200}status: 422/)
  assert.match(r, /Array\.isArray\(datos\)[\s\S]{0,200}status: 400/, 'un array no son los datos')
  assert.match(r, /body\.confirmar !== undefined && typeof body\.confirmar !== 'boolean'[\s\S]{0,200}status: 422/)
  assert.match(r, /actor: guarda\.session\.email/, 'el actor lo pone el servidor')
  assert.ok(r.lastIndexOf('actor:') > r.lastIndexOf('...(typeof body.confirmar'), 'y va el ÚLTIMO')
})

test('🪤 la acción que lee la ficha para editarla exige sesión de la correduría ANTES de leer nada', () => {
  const a = activas(leer(join(CORR, 'oportunidad/[id]/acciones.ts')))
  const cuerpo = a.slice(a.indexOf('export async function pedirFichaParaEditar'))
  const iGuarda = cuerpo.indexOf('exigirCorreduria()')
  assert.ok(iGuarda > 0, 'llama a exigirCorreduria')
  assert.ok(iGuarda < cuerpo.indexOf('riesgoAsegura('), 'antes de hablar con asegura')
  assert.ok(iGuarda < cuerpo.indexOf('fichaAsegura('), 'y antes de leer la ficha')
})

test('🪤 el modal «Editar datos»: monta el panel único y cerrar con cambios sin guardar pregunta', () => {
  const m = activas(leer(join(CORR, 'oportunidad/[id]/EditarFichaModal.tsx')))
  assert.doesNotMatch(m, /\bversion\b/, 'ya no hay una versión compartida que remonte los dos a la vez')
  assert.match(m, /<PanelDatosCliente\b[\s\S]*?onGuardado=/, 'el mismo editor que la ficha, sin uno propio')
  assert.match(m, /todoGuardado/, 'solo se da por limpio si el panel guardó TODOS los tramos')
  assert.match(m, /window\.confirm\(/, 'avisa antes de perder lo tecleado')
  assert.match(m, /onClick=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) cerrar\(\) \}\}/, 'también al clicar fuera')
  assert.match(m, /cerrarRef\.current\(\)/, 'y con Escape')
})

test('🪤 «Datos del vehículo»: solo se manda lo que difiere del estado inicial, nunca el formulario entero', () => {
  const d = activas(leer(join(CORR, 'oportunidad/[id]/DatosVehiculo.tsx')))
  assert.match(d, /soloLoQueCambia\(d as unknown as Record<string, unknown>, form\)/)
  assert.doesNotMatch(d, /guardar\(\{ \.\.\.form \}/, 'copiar el fallback «vehiculo» a marca o pisar escrituras concurrentes')
  const r = activas(leer(join(CORR, 'oportunidad/[id]/DatosRiesgo.tsx')))
  assert.match(r, /soloLoQueCambia\(datos, deForm\(spec, form\)\)/, 'los bloques nuevos, igual')
})

test('la pantalla del riesgo enseña el bloque de datos de CUALQUIER ramo y no manda a «pedir precio desde la ficha»', () => {
  const r = activas(leer(join(CORR, 'oportunidad/[id]/RiesgoPantalla.tsx')))
  assert.match(r, /<DatosRiesgo\s[\s\S]{0,200}riesgo=\{riesgo\}/)
  assert.match(r, /<DatosVehiculo/)
  assert.doesNotMatch(r, /pide precio desde la/, 'hogar/vida/salud/decesos piden precio desde aquí')
  const f = activas(leer(join(CORR, 'oportunidad/[id]/FigurasRiesgo.tsx')))
  assert.match(f, /const conEnlace = ramoConEnlaceDatos\(op\.ramo\)/, 'el enlace de datos sigue siendo de moto y coche (asegura responde 422 al resto)')
  assert.match(f, /Editar datos/, '«Editar datos» vale para todo ramo')
  assert.doesNotMatch(f, /ramo !== 'auto' && ramo !== 'moto'[\s\S]{0,40}Editar datos/)
})

test('los selectores de la vivienda salen de los catálogos de hogar-nuevo (mapa único), no de listas propias', () => {
  const r = activas(leer(join(CORR, 'oportunidad/[id]/DatosRiesgo.tsx')))
  assert.match(r, /Object\.entries\(CATALOGO_HOGAR_DE_CAMPO\)/)
  assert.match(r, /tipo: 'hogar', nombre/)
  assert.doesNotMatch(r, /'MiddleFloor'|'Owner'|'MainResidence'|'Replacement'/, 'ninguna opción de catálogo escrita a mano')
})

test('🪤 comercio tiene bloque PROPIO (datosComercio), no el libre, y se enchufa en las tres puntas', () => {
  const ramo = activas(leer(join(RAIZ, 'packages/module-seguros/src/datos-riesgo-ramo.ts')))
  assert.match(ramo, /'datosCapital', 'datosComercio', 'datosRiesgoLibre'\]/, 'la clave está en CLAVES_DATOS_RIESGO (el PATCH del proxy la acepta)')
  assert.match(ramo, /if \(admiteDatosComercio\(ramo\)\) return 'datosComercio'/, 'el ramo comercio elige su clave ANTES de caer en la libre')
  assert.match(ramo, /return claveDatosDeRamo\(ramo\) !== 'datosRiesgoLibre' && !admiteDatosComercio\(ramo\)/, 'clave propia no es tarifa: el comercio se cotiza fuera')
  const libre = activas(leer(join(RAIZ, 'packages/module-seguros/src/datos-riesgo-libre.ts')))
  assert.match(libre, /'decesos', 'comercio'\]\.includes\(ramo\)/, 'el riesgo libre ya no admite comercio')
  const ui = activas(leer(join(CORR, 'oportunidad/[id]/DatosRiesgo.tsx')))
  assert.match(ui, /b\.clave === 'datosComercio'\) return <DatosComercio /, 'la pantalla monta el formulario del comercio')
  assert.match(ui, /listaAMandar\(guardadosCap, capitalesDeFilas\(caps\)\)/, 'las listas solo se mandan si cambian')
  const lector = activas(leer(join(P, 'lib/riesgo-asegura.ts')))
  assert.match(lector, /case 'datosComercio':/, 'plataforma lee el bloque que manda asegura')
  const puerto = activas(leer(join(RAIZ, 'apps/asegura/lib/oportunidad-riesgo.ts')))
  assert.match(puerto, /datosComercio: 'datos_comercio'/, 'historial y auditoría con su prefijo')
  assert.match(puerto, /tarifica: ramoTarificable\(op\.tipo\)/, 'la marca «tarifica» sale del ramo, no de la clave')
})

// ─── Tramo SERVIDOR (asegura): se lee el FUENTE, sin importar módulos con Prisma ───────────────────────────
const A = join(RAIZ, 'apps/asegura')
const RUTAS_NUEVO = [
  { ramo: 'hogar', anota: 'anotarViviendaDeCotizacion' },
  { ramo: 'vida', anota: 'anotarCapitalDeCotizacion' },
  { ramo: 'salud', anota: 'anotarCapitalDeCotizacion' },
  { ramo: 'decesos', anota: 'anotarCapitalDeCotizacion' },
] as const

for (const x of RUTAS_NUEVO) {
  test(`🪤 asegura ${x.ramo}-nuevo: la oportunidad entra en el contexto ANTES de cotizar y el write-back va tras la guarda «guardada»`, () => {
    const r = activas(leer(join(A, `app/api/operador/codeoscopic/${x.ramo}-nuevo/route.ts`)))
    const iMerge = r.search(/p\.peticion\.contexto = \{ \.\.\.p\.peticion\.contexto, \.\.\.variante\.v\.contexto \}/)
    const iCotizar = r.indexOf('await cotizar(p.peticion)')
    assert.ok(iMerge > 0, 'la oportunidad se mezcla en el contexto de la petición')
    assert.ok(iCotizar > iMerge, 'y se hace ANTES de cotizar (si no, el precio no cuelga de la oportunidad)')
    const iGuarda = r.search(/if \(correduria && variante\.v\.contexto && r\.ok && r\.guardado\.estado === 'guardada'\) \{\s*await /)
    assert.ok(iGuarda > iCotizar, 'el write-back va tras cotizar, con la guarda «guardada»')
    assert.ok(r.indexOf(`await ${x.anota}(`) > iGuarda, 'y la anotación solo se llama DENTRO de esa guarda')
    assert.equal((r.match(new RegExp(`${x.anota}\\(`, 'g')) ?? []).length, 1, 'una sola llamada de write-back')
  })

  test(`🪤 asegura ${x.ramo}-nuevo: correduriaUnica() solo se lee con oportunidad (sin ella, flujo idéntico a main)`, () => {
    const r = activas(leer(join(A, `app/api/operador/codeoscopic/${x.ramo}-nuevo/route.ts`)))
    assert.match(r, /const correduria = oportunidadPedida \? await correduriaUnica\(\)\.catch\(\(\) => null\) : null/)
    assert.equal((r.match(/correduriaUnica\(\)/g) ?? []).length, 1)
  })
}

test('🪤 editarDatosRiesgo: el SELECT y el UPDATE filtran por correduria_id (aislamiento por código)', () => {
  const s = activas(leer(join(A, 'lib/oportunidad-riesgo.ts')))
  const cuerpo = s.slice(s.indexOf('export async function editarDatosRiesgo('), s.indexOf('async function anotarBloqueDeCotizacion('))
  assert.match(cuerpo, /from seguros\.oportunidades o\s+where o\.id = \$\{e\.oportunidadId\}::uuid and o\.correduria_id = \$\{correduriaId\}::uuid\s+for update/, 'el SELECT ... FOR UPDATE')
  assert.match(cuerpo, /update seguros\.oportunidades set info_riesgo = [^\n]+\s+where id = \$\{e\.oportunidadId\}::uuid and correduria_id = \$\{correduriaId\}::uuid/, 'el UPDATE')
})

test('🪤 el aviso «no se pudo enlazar a la oportunidad» se pinta en las 6 pantallas de precio de cliente nuevo', () => {
  for (const [dir, f] of [['auto-nuevo', 'AutoNuevo.tsx'], ['moto-nuevo', 'MotoNuevo.tsx'], ['hogar-nuevo', 'Formulario.tsx'], ['vida-nuevo', 'VidaNuevo.tsx'], ['salud-nuevo', 'SaludNuevo.tsx'], ['decesos-nuevo', 'DecesosNuevo.tsx']]) {
    const p = activas(leer(join(CORR, 'cliente/[id]', dir, f)))
    assert.match(p, /<EnlaceOportunidad guardado=\{r\.guardado\} \/>/, `${dir} pinta el enlace/aviso`)
  }
  const c = activas(leer(join(CORR, 'EnlaceOportunidad.tsx')))
  assert.match(c, /e\.estado === 'fallo'[\s\S]{0,200}No se ha podido anotar en su oportunidad/, 'y dice el fallo, no lo calla')
})

test('salud: `modalidadDeseada` solo viaja con oportunidad', () => {
  const s = activas(leer(join(CORR, 'cliente/[id]/salud-nuevo/SaludNuevo.tsx')))
  assert.match(s, /\.\.\.\(variante && modalidadDeseada\.trim\(\) !== ''/)
})
