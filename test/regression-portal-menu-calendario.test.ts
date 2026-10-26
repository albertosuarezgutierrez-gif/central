// Cepo del menú ADAPTADO por quién mira y del CALENDARIO ÚNICO del portal (26/10/2026).
//
// Lo que las reglas puras (`menu-visible.test.ts`, `calendario-unico.test.ts`, `lib/calendario-portal.test.ts`) no pueden ver:
//   1. el menú es SOLO visibilidad: el layout pasa `visibles` al `NavPortal` y a la cabecera, y `lib/menu-portal.ts` no
//      escribe en la BD ni abre/cierra ninguna ruta (las pantallas siguen decidiendo su acceso por código);
//   2. cada lectura del menú se captura (`null` = «no se ha podido comprobar») y sale de la identidad de la COOKIE;
//   3. las rutas viejas del calendario REDIRIGEN al calendario único (nada de enlaces rotos) y los avisos apuntan allí;
//   4. el calendario se compone con la regla pura, lee el patrimonio solo por `calendarioDeIdentidad` (que parte de
//      `accesosPatrimonio`) y declara la fuente que falla.
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const P = 'apps/asegura-portal'
const MENU = `${P}/lib/menu-portal.ts`
const CAL = `${P}/app/(portal)/herramientas/calendario/page.tsx`

test('🚨 el menú se adapta por VISIBILIDAD: layout → NavPortal y cabecera reciben lo que se ofrece', () => {
  assert.match(leer(`${P}/app/(portal)/layout.tsx`), /<NavPortal[^>]*visibles=\{menu\?\.visibles\}/)
  assert.match(leer(`${P}/app/(portal)/layout.tsx`), /menuDeSesion\(\)\.catch\(\(\) => null\)/, 'sin menú se ofrece todo')
  const nav = leer(`${P}/app/(portal)/NavPortal.tsx`)
  assert.match(nav, /pestanasPortal\(\)\.filter\(\(p\) => visibles === undefined \|\| visibles\.includes\(p\.id\)\)/)
  assert.match(leer(`${P}/app/CabeceraEnlacesSesion.tsx`), /menu === null \|\| menu\.visibles\.includes\('herramientas'\)/)
  assert.match(leer(`${P}/app/CabeceraEnlaces.tsx`), /herramientas &&/)
})

test('🚨 el menú NO es control de acceso: menu-portal.ts no escribe y no decide rutas', () => {
  const src = leer(MENU)
  assert.doesNotMatch(src, /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/, 'el menú no escribe en la BD')
  assert.doesNotMatch(src, /redirect\(|notFound\(|NextResponse/, 'el menú no corta ninguna ruta')
  // Los dos "accesos" salen de las MISMAS fuentes que las pantallas (no una copia de la regla).
  assert.match(src, /accesosPatrimonio\(identidadId\)/)
  assert.match(src, /accesosFlota\(identidadId\)/)
  assert.match(src, /nombramientosPendientes\(identidadId\)/)
})

test('🚨 menu-portal: la identidad sale de la cookie y cada lectura caída vale null (nunca 0)', () => {
  const src = leer(MENU)
  assert.match(src, /const identidad = await getIdentidad\(\)/)
  assert.match(src, /if \(!identidad\) return null/)
  assert.match(src, /Promise\.allSettled\(/)
  assert.match(src, /function leyo<T>\(r: PromiseSettledResult<T>[^)]*\): T \| null/)
  assert.match(src, /porAceptar = filas\.filter\(/)
  // El `catch` de «por aceptar» deja `null`, no 0.
  assert.match(src, /let porAceptar: number \| null = null/)
  // Toda consulta a una tabla de autorización lleva a la identidad (o a sus fichas) en el `where`.
  assert.match(src, /autorizadoIdentidadId: identidadId/)
  assert.match(src, /portalVinculo\.findMany\(\{ where: \{ identidadId \}/)
  assert.match(src, /portalPolizaDeclarada\.count\(\{ where: \{ identidadId, \.\.\.DECLARADA_NO_ELIMINADA \}/)
})

test('🚨 «Contactos» fuera del menú se ofrece en Cuenta (no hay acceso sin forma de verlo)', () => {
  const c = leer(`${P}/app/(portal)/cuenta/page.tsx`)
  assert.match(c, /menu\?\.contactosEnCuenta/)
  assert.match(c, /href="\/autorizaciones"/)
})

test('🚨 Herramientas oculta lo que no es de quien mira (resumen, catálogo, calendario) con la regla pura', () => {
  const h = leer(`${P}/app/(portal)/herramientas/page.tsx`)
  assert.match(h, /herramientasVisibles\(HECHOS_DESCONOCIDOS\)/, 'sin lectura se ofrece todo')
  assert.match(h, /ver\.calendario &&/)
  assert.match(h, /ver\.resumen &&/)
  assert.match(h, /ver\.catalogo && \(\s*<li>/, 'el Portal del Empleado es del catálogo')
  assert.match(h, /ver\.catalogo && solicitables\.length > 0/, 'lo solicitable es del catálogo')
  assert.match(h, /href="\/herramientas\/calendario"/)
  assert.doesNotMatch(h, /vista=recordatorios|patrimonio\/calendario/, 'Herramientas no enlaza a los calendarios viejos')
})

test('🚨 las rutas viejas del calendario redirigen al único', () => {
  assert.match(leer(`${P}/app/(portal)/patrimonio/calendario/page.tsx`), /redirect\(RUTA_CALENDARIO\)/)
  const b = leer(`${P}/app/(portal)/boveda/page.tsx`)
  assert.match(b, /if \(vista === 'recordatorios'\) redirect\(RUTA_CALENDARIO\)/)
  // Y la bóveda ya no monta el editor de recordatorios.
  assert.doesNotMatch(b, /<Recordatorios/)
  assert.doesNotMatch(b, /recordatoriosDeIdentidad/)
})

test('🚨 los enlaces del portal apuntan al calendario único, no a los viejos', () => {
  for (const f of [
    `${P}/lib/pendiente-de-ti.ts`,
    `${P}/lib/patrimonio/avisos-push-bd.ts`,
    `${P}/app/(portal)/patrimonio/page.tsx`,
    `${P}/app/(portal)/patrimonio/inmueble/[id]/page.tsx`,
  ]) {
    assert.doesNotMatch(leer(f), /patrimonio\/calendario|vista=recordatorios/, `${f} enlaza a un calendario viejo`)
  }
  const avisos = leer('packages/module-seguros-portal/src/avisos.ts')
  assert.match(avisos, /carnet_caducado: RUTA_CALENDARIO/)
  assert.match(avisos, /itv_en_ventana: RUTA_CALENDARIO/)
  assert.match(avisos, /patrimonio_en_ventana: RUTA_CALENDARIO/)
})

test('🚨 el calendario único: composición pura, patrimonio solo por calendarioDeIdentidad, fuentes caídas declaradas', () => {
  const src = leer(CAL)
  assert.match(src, /componerCalendario\(/)
  assert.match(src, /calendarioDeIdentidad\(identidad\.id\)/)
  assert.doesNotMatch(src, /portalPatrimonio/, 'el patrimonio no se lee a pelo: parte de accesosPatrimonio')
  assert.match(src, /Promise\.allSettled\(/)
  assert.match(src, /calendario\.sinComprobar\.length > 0/)
  assert.match(src, /No hemos podido comprobar/)
  assert.match(src, /calendario\.vacio &&/)
  // Un fallo de lectura de patrimonio NO se convierte en «sin patrimonio».
  assert.match(src, /patrimonioR\.status === 'rejected' \? null/)
  // Los avisos son los de la campana (misma lectura) y declaran su incompletitud.
  assert.match(src, /GET as leerAvisos/)
  assert.match(src, /\n\s+incompletas: avisos !== null && avisosDeFechaIncompletos\(avisos\.fuentesIlegibles\) \? \['aviso'\] : \[\]/)
  // Todo se acota a la identidad de la cookie.
  assert.match(src, /const identidad = await getIdentidad\(\)/)
  assert.match(src, /identidadId: identidad\.id, \.\.\.DECLARADA_NO_ELIMINADA/)
  // Plegado perezoso: la lista recibe un tope.
  assert.match(src, /tope=\{TOPE_VER_MAS_CALENDARIO\}/)
})

test('el calendario usa PaginaPortal/TarjetaPortal y no pinta colores a mano', () => {
  const src = readFileSync(join(ROOT, CAL), 'utf8')
  assert.match(src, /<PaginaPortal /)
  assert.match(src, /<TarjetaPortal /)
  for (const f of [CAL, `${P}/app/(portal)/herramientas/calendario/ListaCalendario.tsx`]) {
    const t = readFileSync(join(ROOT, f), 'utf8')
    assert.doesNotMatch(t, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${f}: color a mano`)
  }
  assert.match(readFileSync(join(ROOT, `${P}/app/(portal)/herramientas/calendario/ListaCalendario.tsx`), 'utf8'), /minmax\(0, 1fr\)/)
})
