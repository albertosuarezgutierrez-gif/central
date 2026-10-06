// HARNESS OFFLINE del formulario de Allianz ePAC «Comunidades 2020» (06/10/2026).
//
//   npx tsx scripts/probar-formulario.ts <ruta-del-html-de-evidencia.html>
//
// Carga el HTML de evidencia que guarda el runner (`seguros.documentos`, ya redactado; con los marcos
// separados por `<!-- tarificador:marco … -->`, ver src/evidencia.ts) en un Chromium SIN RED (toda
// petición se aborta) y SIN JavaScript de la página, vuelve a montar cada marco con `srcdoc` y recorre
// la tabla `CAMPOS` del adaptador con un riesgo FICTICIO:
//   · cada campo tiene que resolver a EXACTAMENTE un control adjunto (y se informa si es visible);
//   · texto/fecha: `fill` + relectura del valor; checkbox nativo: `setChecked`;
//   · desplegable: `<select>` nativo → se listan las opciones y se intenta el valor de ejemplo (si no
//     existe es AVISO, no fallo: los valores admitidos son TODO); `nx-dropdown` → solo que resuelve.
// NO pulsa nada: ni Calcular, ni abre desplegables ndbx, ni datepickers (sin el JS de Angular/del
// servlet no se abrirían). «Calcular» SÍ se comprueba (sin pulsar): entre TODOS los marcos tiene que
// resolver a EXACTAMENTE un elemento (`marcoDeCalcular`) y su descripción tiene que pasar `comprobarBoton`
// (lo mismo que mira `pulsar()` del guard). La lectura tras calcular y el avance solo se validan en REAL;
// aquí los locators de esas fases se listan como «presente/ausente» a título informativo.
//
// 🚨 El HTML de prueba NO se commitea (aunque esté redactado, es de un trabajo real): se pasa por ruta.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Frame } from 'playwright'
import { comprobarBoton, type RiesgoComunidad } from '@central/module-tarificacion'
import {
  ASISTENCIAS,
  CAMPOS,
  PARTIDAS,
  botonCalcular,
  campoPorEtiqueta,
  costesAnuales,
  fechaEs,
  filaPorEtiqueta,
  marcoDeCalcular,
  marcoFormulario,
  tipoControl,
} from '../src/adapters/allianz/comunidades.ts'
import { separarMarcos } from '../src/evidencia.ts'

// Riesgo de EJEMPLO, ficticio (no es de ningún cliente).
const RIESGO: RiesgoComunidad = {
  ramo: 'comunidades',
  direccion: { via: null, numero: null, codigoPostal: '41001', municipio: null, provincia: null },
  polizaAReemplazar: '000000000',
  documentoIdentidad: 'H00000000',
  tipoDocumento: 'Dispone NIF/CIF/NIE',
  fechaEfecto: '2026-11-01',
  fechaTermino: '2027-11-01',
  m2Construidos: 1200,
  anioConstruccion: 1980,
  anioRehabilitacion: 2010,
  tipoVivienda: 'Viviendas Pisos en Alto',
  uso: 'Habitual',
  plantas: 5,
  plantasBajoRasante: 1,
  sotanos: 1,
  numEdificios: 1,
  contiguos: null,
  numViviendasYLocales: 20,
  numViviendas: 18,
  numLocales: 2,
  listaPropietarios: '> 50%',
  instalacionesAnexas: false,
  formaPagoPrimerRecibo: 'Bancario',
  formaPagoSucesivos: 'Bancario',
  comision: 'A',
  capitalContinente: 1500000,
  capitalContenido: null,
  asistenciaPlagas: true,
  asesoramientoJuridico: true,
  impagoCuotas: false,
  ite: false,
  ascensor: null,
}

function escaparAtributo(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** Mete `hijo` como `srcdoc` del iframe `nombre` (o `#índice`) de `html`. */
function incrustar(html: string, nombre: string, hijo: string): string {
  const tags = [...html.matchAll(/<iframe\b[^>]*>/gi)]
  let tag: RegExpMatchArray | undefined
  if (nombre.startsWith('#')) tag = tags[Number(nombre.slice(1))]
  else tag = tags.find((t) => new RegExp(`\\b(name|id)\\s*=\\s*["']${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(t[0]))
  if (!tag || tag.index === undefined) {
    if (/<frame\b/i.test(html)) console.log(`  ⚠ el marco «${nombre}» parece de un <frameset> (<frame>): este harness solo remonta <iframe>`)
    else console.log(`  ⚠ no se encontró el iframe «${nombre}» en su padre`)
    return html
  }
  const nuevo = tag[0].replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*')/i, '').replace(/>$/, ` srcdoc="${escaparAtributo(hijo)}">`)
  return html.slice(0, tag.index) + nuevo + html.slice(tag.index + tag[0].length)
}

/** Recompone la página con sus marcos anidados (de dentro afuera). */
function componer(html: string): { compuesto: string; nMarcos: number } {
  const { principal, marcos } = separarMarcos(html)
  const porRuta = new Map(marcos.map((m) => [m.ruta.join('/'), m.html]))
  const montar = (ruta: string[], contenido: string): string => {
    const hijos = marcos.filter((m) => m.ruta.length === ruta.length + 1 && m.ruta.slice(0, ruta.length).join('/') === ruta.join('/'))
    let r = contenido
    for (const h of hijos) r = incrustar(r, h.ruta[h.ruta.length - 1], montar(h.ruta, porRuta.get(h.ruta.join('/'))!))
    return r
  }
  return { compuesto: montar([], principal), nMarcos: marcos.length }
}

async function lanzar(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true })
  } catch (e) {
    // La versión de los navegadores instalados puede no casar con la de playwright: se usa la que haya.
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    console.log(`(chromium de playwright no disponible; uso ${exe})`)
    return chromium.launch({ headless: true, executablePath: exe })
  }
}

function ejemplo(v: string | number | boolean, tipo: string): string {
  return tipo === 'fecha' ? fechaEs(String(v)) : String(v)
}

async function main(): Promise<number> {
  const ruta = process.argv[2]
  if (!ruta || !existsSync(ruta)) {
    console.error('uso: npx tsx scripts/probar-formulario.ts <ruta-del-html>')
    return 2
  }
  const { compuesto, nMarcos } = componer(readFileSync(ruta, 'utf8'))
  console.log(`HTML: ${ruta} · marcos guardados en la evidencia: ${nMarcos}`)

  const browser = await lanzar()
  try {
    const context = await browser.newContext({ javaScriptEnabled: false })
    await context.route('**/*', (r) => r.abort())
    const page = await context.newPage()
    page.setDefaultTimeout(3_000)
    await page.setContent(compuesto, { waitUntil: 'domcontentloaded' })
    const marcos = page.frames()
    console.log(`marcos en la página: ${marcos.map((f) => (f === page.mainFrame() ? '(principal)' : f.name() || '(sin nombre)')).join(', ')}`)

    let formulario: Frame
    try {
      formulario = await marcoFormulario(page, 3_000)
    } catch (e) {
      console.log(`✗ FORMULARIO NO ENCONTRADO: ${e instanceof Error ? e.message : e}`)
      console.log('  (si la evidencia no trae marcos, es anterior a src/evidencia.ts: el formulario vive en el iframe appArea y no se guardó)')
      console.log(`RESULTADO: 0/${CAMPOS.length} campos OK`)
      return 1
    }
    console.log(`formulario en el marco «${formulario === page.mainFrame() ? '(principal)' : formulario.name()}»`)

    let ok = 0
    for (const c of CAMPOS) {
      const nombre = `${c.etiqueta}${c.indice ? ` [#${c.indice}]` : ''} (${c.tipo})`
      const loc = campoPorEtiqueta(formulario, c.etiqueta, c.indice ?? 0)
      const n = await loc.count()
      if (n !== 1) {
        console.log(`✗ ${nombre}: resuelve a ${n} elementos`)
        continue
      }
      const visible = await loc.isVisible()
      const tipo = await tipoControl(loc)
      const id = await loc.evaluate((el) => el.id || (el as HTMLInputElement).name || el.tagName.toLowerCase())
      const v = c.valor(RIESGO)
      try {
        if (c.tipo === 'texto' || c.tipo === 'fecha') {
          if (tipo !== 'texto') throw new Error(`control «${tipo}», se esperaba texto`)
          const val = v === null || v === undefined ? 'x' : ejemplo(v as string | number, c.tipo)
          await loc.fill(val)
          const leido = await loc.inputValue()
          if (leido !== val) throw new Error(`fill no quedó escrito («${leido}»)`)
          console.log(`✓ ${nombre}: input #${id}${visible ? '' : ' (no visible)'} · fill OK`)
        } else if (c.tipo === 'check') {
          if (tipo !== 'checkbox') throw new Error(`control «${tipo}», se esperaba checkbox`)
          if (await loc.isEnabled()) {
            await loc.setChecked(true)
            console.log(`✓ ${nombre}: checkbox #${id}${visible ? '' : ' (no visible)'} · setChecked OK`)
          } else {
            // Como el <select> deshabilitado: el locator es el bueno; el portal lo habilita (o no) en REAL.
            console.log(`✓ ${nombre}: checkbox #${id} (deshabilitado en la captura: no se marca)`)
          }
        } else if (tipo === 'select') {
          const opciones = (await loc.locator('option').allTextContents()).map((t) => t.trim())
          let nota = `${opciones.length} opciones`
          if (v !== null && v !== undefined && v !== '') {
            const casa = opciones.includes(String(v))
            if (casa && (await loc.isEnabled())) await loc.selectOption({ label: String(v) })
            nota += casa ? ` · «${v}» seleccionable` : ` · ⚠ «${v}» NO está entre las opciones (TODO valores admitidos)`
          }
          console.log(`✓ ${nombre}: <select> #${id}${visible ? '' : ' (no visible)'}${(await loc.isEnabled()) ? '' : ' (deshabilitado)'} · ${nota}`)
        } else if (tipo === 'nx-dropdown') {
          console.log(`✓ ${nombre}: nx-dropdown (abrir y elegir solo se valida en REAL)`)
        } else {
          throw new Error(`control «${tipo}», se esperaba desplegable`)
        }
        ok++
      } catch (e) {
        console.log(`✗ ${nombre}: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
      }
    }

    // «Calcular»: resuelve a UNO entre todos los marcos y su descripción pasa el guard. NO se pulsa.
    let calcularOk = false
    try {
      const marco = await marcoDeCalcular(page, 3_000)
      const boton = botonCalcular(marco)
      const desc = await boton.evaluate((el) => {
        const h = el as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
        return [
          h.innerText ?? h.textContent ?? '',
          h.getAttribute('aria-label'),
          h.getAttribute('title'),
          typeof h.value === 'string' ? h.value : null,
          h.id || null,
          typeof h.name === 'string' ? h.name : null,
          typeof h.href === 'string' ? h.href : h.getAttribute('href'),
          h.getAttribute('onclick'),
          h.getAttribute('formaction'),
        ]
      })
      comprobarBoton(desc)
      const tag = await boton.evaluate((el) => `<${el.tagName.toLowerCase()} id="${el.id}">`)
      console.log(`✓ Calcular: 1 elemento (${tag}) en el marco «${marco === page.mainFrame() ? '(principal)' : marco.name() || '(sin nombre)'}» · pasa comprobarBoton · NO se pulsa`)
      calcularOk = true
    } catch (e) {
      console.log(`✗ Calcular: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }

    // Fases siguientes: solo informativo (aparecen tras «Calcular»/«Aceptar»; aquí no se pulsa nada).
    const info: [string, number][] = [
      ['fila COSTE ANUAL (inputs)', await costesAnuales(formulario).count()],
      ['filas de partidas', (await Promise.all(PARTIDAS.map((p) => filaPorEtiqueta(formulario, p.fila, p.grupo).count()))).reduce((a, b) => a + b, 0)],
      [
        'partidas con columnas estandar/personalizado[/franquicia] (1 c/u)',
        (
          await Promise.all(
            PARTIDAS.map(async (p) => {
              const f = filaPorEtiqueta(formulario, p.fila, p.grupo)
              const n = async (pre: string) => f.locator(`input[id^="${pre}"], select[id^="${pre}"]`).count()
              return (await n('estandar')) === 1 && (await n('personalizado')) === 1 && (!p.franquicia || (await n('franquicia')) === 1) ? 1 : 0
            }),
          )
        ).reduce((a: number, b: number) => a + b, 0),
      ],
      ['control de avance de Datos Básicos (#aceptar, el que busca guard.ts)', await formulario.locator('#aceptar').filter({ hasText: /^\s*Aceptar\s*$/i }).count()],
      ['filas de asistencias', (await Promise.all(ASISTENCIAS.map((a) => filaPorEtiqueta(formulario, a.fila).count()))).reduce((a, b) => a + b, 0)],
      ['radios de modalidad', await formulario.locator('xpath=//tr[td[contains(translate(normalize-space(.),"elijaunopcó","ELIJAUNOPCÓ"),"ELIJA UNA OPCI")]]//input[@type="radio"]').count()],
      ['fila Prima Total', await filaPorEtiqueta(formulario, 'Prima Total').count()],
      ['pestaña Proyecto', await formulario.getByText('Proyecto', { exact: true }).count()],
    ]
    console.log('— fases siguientes (informativo; dependen de calcular/avanzar) —')
    for (const [q, n] of info) console.log(`  ${q}: ${n}`)
    console.log(`RESULTADO: ${ok}/${CAMPOS.length} campos OK · Calcular ${calcularOk ? 'OK' : 'FALLA'}`)
    return ok === CAMPOS.length && calcularOk ? 0 : 1
  } finally {
    await browser.close()
  }
}

main().then(
  (c) => process.exit(c),
  (e: unknown) => {
    console.error(e)
    process.exit(2)
  },
)
