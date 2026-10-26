// Cepo de «Inicio» y del menú del portal (24/10/2026; reescrito el 26/10/2026 con el menú de cinco y «Inicio = solo lo pendiente»).
//
// Vigila lo que las reglas puras (`lib/inicio-pendientes.test.ts`, `vista-portal.test.ts`) no pueden ver:
//   1. tras el login y desde `/` se llega a `/inicio`; `/boveda` sigue existiendo (enlaces profundos);
//   2. el menú son CINCO entradas (Inicio · Seguros · Herramientas · Contactos · Cuenta), sin enlaces metidos a mano en
//      `NavPortal`, y la barra móvil es `Inicio · Seguros · Herramientas · WhatsApp · Más`;
//   3. cada fuente de Inicio se lee por separado (`allSettled`) y la que falla es «sin comprobar», nunca vacía;
//   4. leer no escribe: Inicio no sincroniza obligaciones ni registra usos de autorizaciones;
//   5. en Inicio no hay «no tienes», «0 pólizas», «Hola, cliente» ni `?? 0` / `?? []`;
//   6. Inicio es SOLO lo pendiente: ni lista de seguros por familia ni bloque de herramientas, y `HuecosProteccion` está
//      en UN solo sitio de todo el portal;
//   7. el diseño único: las pantallas del portal pintan su titular con `PaginaPortal`/`EncabezadoPortal`, no con un `<h1>` a mano;
//   8. la cabecera lleva «Herramientas» y «Seguros» (como la del Portal del Empleado);
//   9. WhatsApp: el logo oficial, el número de `MEDIADOR` (nunca a mano) y montado en el layout raíz.
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const PORTAL = 'apps/asegura-portal'
const PAGINA = `${PORTAL}/app/(portal)/inicio/page.tsx`
const LECTURA = `${PORTAL}/lib/inicio.ts`
const PENDIENTES = `${PORTAL}/lib/inicio-pendientes.ts`
const COMPONENTE = `${PORTAL}/app/(portal)/inicio/PendienteInicio.tsx`

test('🚨 tras el login y desde la raíz se llega a /inicio (por defecto), y la bóveda sigue en su sitio', () => {
  assert.match(leer(`${PORTAL}/app/page.tsx`), /redirect\('\/inicio'\)/)
  assert.match(leer(`${PORTAL}/app/api/acceso/verificar/route.ts`), /let irA = '\/inicio'/)
  assert.match(leer(`${PORTAL}/app/Entrada.tsx`), /\? cuerpo\.irA : '\/inicio'/)
  assert.doesNotMatch(leer(`${PORTAL}/app/page.tsx`), /redirect\('\/boveda'\)/)
  // `/boveda` NO se redirige: la usan push, invitaciones, vista previa y los marcadores de la gente.
  assert.doesNotMatch(leer(`${PORTAL}/app/(portal)/boveda/page.tsx`), /redirect\('\/inicio'\)/)
})

test('🚨 menú de CINCO; barra móvil: Inicio · Seguros · Herramientas (+ WhatsApp + Más); nada metido a mano en NavPortal', async () => {
  const nav = leer(`${PORTAL}/app/(portal)/NavPortal.tsx`)
  const m = /const TABBAR = \[([\s\S]*?)\] as const/.exec(nav)
  assert.ok(m, 'no encuentro TABBAR')
  const hrefs = [...m[1].matchAll(/href: '([^']+)'/g)].map((x) => x[1])
  assert.deepEqual(hrefs, ['/inicio', '/boveda', '/herramientas'])
  assert.match(nav, /portal-tabbar-wsp/, 'WhatsApp sigue en la barra')
  assert.match(nav, /aria-label="Más secciones"/, '«Más» sigue en la barra')
  const { pestanasPortal } = await import('../packages/module-seguros-portal/src/vista-portal.ts')
  const p = pestanasPortal()
  assert.deepEqual(p.map((x) => x.etiqueta), ['Inicio', 'Seguros', 'Herramientas', 'Contactos', 'Cuenta'])
  assert.equal(p[0].href, '/inicio')
  // 🚨 Las entradas salen de `pestanasPortal()`: ni un `href="/…"` tecleado en el JSX del menú (así se llegó a 12 entradas:
  // «Mi resumen», «Patrimonio» y «Herramientas» estaban metidas a mano). Y ni rastro de las props/ramas viejas.
  assert.doesNotMatch(nav, /href="\//, 'NavPortal tiene un enlace tecleado a mano')
  assert.doesNotMatch(nav, /patrimonio\??:|accesosPatrimonio/, 'la entrada condicional de Patrimonio ya no existe: vive en Herramientas')
  // Recibos, Siniestros y Mi QR son sub-vistas de Seguros (chips de la bóveda), no entradas del menú.
  assert.ok(!p.some((x) => /recibos|siniestros|mi qr/i.test(x.etiqueta)), 'Recibos/Siniestros/Mi QR viven dentro de Seguros')
})

test('el logo de la cabecera lleva a Inicio (por la raíz, que decide con o sin sesión)', () => {
  assert.match(leer(`${PORTAL}/app/layout.tsx`), /<a href="\/" className="marca-inicio"/)
})

test('🚨 cada fuente por separado: allSettled, y la que falla queda en null (sin comprobar)', () => {
  const src = leer(LECTURA)
  assert.match(src, /await Promise\.allSettled\(\[/)
  for (const f of ['cartera', 'declaradas', 'sugerencia']) {
    assert.match(src, new RegExp(`valor\\(r\\w+, '${f}'\\)`), `la fuente «${f}» no pasa por valor()`)
  }
  assert.match(src, /if \(r\.status === 'fulfilled'\) return r\.value\s+console\.error[^\n]*\n\s+return null/)
  // Inicio ya no lee patrimonio, flota ni calendario (26/10/2026): son de Herramientas.
  assert.doesNotMatch(src, /resumenPatrimonio|empresasDeFlota|portalObligacion/)
})

test('🚨 Inicio parte de la cookie y LEER NO ESCRIBE', () => {
  const src = leer(LECTURA)
  assert.match(src, /const sesion = await getIdentidad\(\)\s+if \(!sesion \|\| sesion\.id !== identidadId\) return null/)
  assert.match(src, /carteraDeIdentidad\(identidadId\)/)
  for (const prohibido of [/sincronizarObligaciones/, /registrarUso/, /\.create\(/, /\.update(Many)?\(/, /\.upsert\(/, /\.delete/]) {
    assert.doesNotMatch(src, prohibido, `Inicio no escribe: ${prohibido}`)
    for (const f of [PAGINA, PENDIENTES, COMPONENTE]) assert.doesNotMatch(leer(f), prohibido)
  }
  // Solo cuentas: ni primas ni nº de póliza en Inicio.
  for (const f of [LECTURA, PENDIENTES, PAGINA, COMPONENTE]) assert.doesNotMatch(leer(f), /numeroPoliza|prima/i, f)
})

test('🚨 en Inicio no se dice «no tienes» ni se inventa un cero', () => {
  for (const f of [PAGINA, LECTURA, PENDIENTES, COMPONENTE]) {
    const src = leer(f)
    assert.doesNotMatch(src, /no tienes|0 pólizas|ninguna póliza|Hola, cliente|no hemos encontrado/i, f)
    assert.doesNotMatch(src, /\?\?\s*(0|\[\])(?![.\d])/, `${f}: «no se sabe» convertido en vacío`)
  }
})

/** Todos los `.tsx` de `app/` (menos node_modules/.next). */
function tsxDe(dir: string): string[] {
  const out: string[] = []
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) out.push(...tsxDe(ruta))
    else if (nombre.endsWith('.tsx')) out.push(ruta)
  }
  return out
}

test('🚨 Inicio es SOLO lo pendiente: sin lista de seguros por familia ni bloque de herramientas; Huecos en UN solo sitio', () => {
  for (const f of [PAGINA, COMPONENTE]) {
    assert.doesNotMatch(leer(f), /inicio-tarjeta|inicio-rejilla|Tus seguros|Tus herramientas|tarjetasFamilias|textoPatrimonio|Más herramientas/, f)
  }
  // `HuecosProteccion` (la sugerencia comercial) se pinta en Inicio y en NINGÚN otro sitio del portal.
  const usos = tsxDe(join(ROOT, PORTAL, 'app'))
    .filter((f) => /<HuecosProteccion\b/.test(sinComentarios(readFileSync(f, 'utf8'))))
    .map((f) => f.slice(ROOT.length + 1))
  assert.deepEqual(usos, [PAGINA])
  assert.equal((leer(PAGINA).match(/<HuecosProteccion/g) ?? []).length, 1)
  // El estado vacío amable existe y lleva a Seguros.
  assert.match(leer(COMPONENTE), /Todo al día/)
  assert.match(leer(COMPONENTE), /href="\/boveda"/)
  // Lo que pide Inicio, y sólo eso: vencimientos, recibos, siniestros abiertos, avisos.
  const c = leer(COMPONENTE)
  for (const t of ['Vencimientos', 'Recibos', 'Siniestros abiertos', 'Avisos']) assert.match(c, new RegExp(t), t)
})

test('🚨 diseño único: las pantallas del portal pintan su titular con PaginaPortal/EncabezadoPortal, no con un <h1> suelto', () => {
  const PANTALLAS = [
    'inicio', 'herramientas', 'cuenta', 'configuracion', 'autorizaciones', 'resumen', 'flota', 'patrimonio', 'boveda',
  ].map((d) => `${PORTAL}/app/(portal)/${d}/page.tsx`)
  PANTALLAS.push(`${PORTAL}/app/mi-alquiler/page.tsx`, `${PORTAL}/app/mi-alquiler/[contratoId]/page.tsx`, `${PORTAL}/app/inquilino/[token]/page.tsx`)
  for (const f of PANTALLAS) {
    const src = leer(f)
    assert.match(src, /PaginaPortal|EncabezadoPortal/, `${f} no usa el encabezado único`)
    assert.doesNotMatch(src, /<h1[\s>]/, `${f} tiene un <h1> a mano`)
    assert.doesNotMatch(src, /fontSize:\s*'1\.5rem'/, `${f} fija el tamaño del titular en línea`)
    assert.doesNotMatch(src, /<main style=/, `${f} abre un <main> con estilos en línea`)
  }
  // El encabezado único pinta la palabra de acento en <em> (cobalto en CSS, sin cursiva) y el componente de tarjeta es `.seccion`.
  assert.match(leer(`${PORTAL}/app/PaginaPortal.tsx`), /<em>\{acento\}<\/em>/)
  assert.match(leer(`${PORTAL}/app/TarjetaPortal.tsx`), /className=\{`seccion tarjeta-portal/)
  // Lo viejo no vuelve: la tarjeta propia de Inicio se borró del CSS.
  assert.doesNotMatch(readFileSync(join(ROOT, PORTAL, 'app/globals.css'), 'utf8'), /\.inicio-tarjeta|\.inicio-rejilla/)
})

test('🚨 la cabecera lleva «Herramientas» y «Seguros» (como la del Portal del Empleado), solo con sesión', () => {
  const cab = leer(`${PORTAL}/app/CabeceraEnlaces.tsx`)
  const hrefs = [...cab.matchAll(/href="([^"]+)"/g)].map((x) => x[1])
  assert.deepEqual(hrefs, ['/herramientas', '/boveda'])
  assert.match(cab, />Herramientas</)
  assert.match(cab, />Seguros</)
  assert.match(cab, /seccionActiva\(/, 'la activa se decide con la MISMA regla que el menú')
  assert.match(leer(`${PORTAL}/app/layout.tsx`), /<CabeceraEnlacesSesion \/>/)
  assert.match(leer(`${PORTAL}/app/CabeceraEnlacesSesion.tsx`), /verificarSesion\(token\)/, 'sin sesión no se pinta')
})

test('🚨 WhatsApp: logo oficial, número de MEDIADOR (nunca a mano) y montado en el layout raíz', () => {
  const flot = leer(`${PORTAL}/app/WhatsappFlotante.tsx`)
  const nav = leer(`${PORTAL}/app/(portal)/NavPortal.tsx`)
  assert.match(flot, /whatsappUrl\(/)
  assert.match(flot, /WHATSAPP_PATH/)
  assert.match(nav, /WHATSAPP_PATH/)
  // Ni emoji ni número tecleado: el teléfono sale de `MEDIADOR` (`whatsappUrl` lo compone).
  for (const f of [flot, nav, leer(`${PORTAL}/app/(portal)/layout.tsx`)]) {
    assert.doesNotMatch(f, /💬|📱|wa\.me\/\d|\b[6-9]\d{8}\b/, 'WhatsApp: un número o emoji a mano')
  }
  assert.match(leer(`${PORTAL}/app/layout.tsx`), /<WhatsappFlotante \/>/)
  // El dibujo es el glifo oficial de WhatsApp (Simple Icons), no un icono genérico: su trazo empieza así.
  assert.match(readFileSync(join(ROOT, PORTAL, 'app/whatsapp-icono.ts'), 'utf8'), /M12\.04 2C6\.58 2 2\.13 6\.45/)
})

test('🚨 Herramientas: tarjeta «Portal del Empleado (RRHH)» que enlaza a empleados.grupoasegura.es', () => {
  assert.match(leer(`${PORTAL}/lib/herramientas.ts`), /URL_PORTAL_EMPLEADO = 'https:\/\/empleados\.grupoasegura\.es'/)
  const p = leer(`${PORTAL}/app/(portal)/herramientas/page.tsx`)
  assert.match(p, /Portal del Empleado \(RRHH\)/)
  assert.match(p, /href=\{URL_PORTAL_EMPLEADO\}[^>]*rel="noopener noreferrer"/, 'enlace externo sin noopener')
  // Calendario y Mi resumen viven aquí (ya no en Inicio ni como entradas del menú).
  assert.match(p, /\/herramientas\/calendario/)
  assert.match(p, /href="\/resumen"/)
})
