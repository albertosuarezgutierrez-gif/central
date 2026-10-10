// Guardián de la Fase 1 «la oportunidad es la única página» — MOTO (07/10/2026, OK explícito de Alberto a llevar
// «Emitir» dentro de la oportunidad). `node --test`.
//
// En /correduria/oportunidad/[id] de una moto se pide precio y se emite SIN cambiar de URL: el bloque «Pedir precio»
// despliega el `CotizadorMoto` EMBEBIDO (vehículo y figuras del riesgo; solo las condiciones de la cotización) y
// «Presupuestos de este riesgo» abre `<Emision>` con `idPrecio` y `modalidad` (regla 21).
//
// Erosiones que dejarían el CI en verde (todo compila y nada lo prueba en vivo):
//  1. Que vuelva el enlace a moto-nuevo en la oportunidad de moto (el corredor sale de la página y vuelve a teclear).
//  2. Que el cotizador se monte en modo completo (catálogo y figuras otra vez) o sin `bloqueo`: cotizaría con el
//     riesgo ANTERIOR mientras arriba se edita (0,50€ por un precio de otra moto u otras personas).
//  3. Que en modo embebido la última tarificación precargue su moto (otra vez: precio de otra moto).
//  4. Que el panel de emisión pierda `idPrecio`, o la guarda síncrona de un solo envío.
//  5. Que «Ver precios y emitir» emita lo leído aunque no sea ESA variante, o una caducada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CORR = 'apps/plataforma/app/(usuario)/correduria/'
const OP = CORR + 'oportunidad/[id]/'
const MOTO = CORR + 'cliente/[id]/moto-nuevo/'
const AUTO = CORR + 'cliente/[id]/auto-nuevo/'
const HOGAR = CORR + 'cliente/[id]/hogar-nuevo/'
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const activas = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

test('🪤 RiesgoPantalla: con cotizador embebido el principal es un BOTÓN que lo despliega aquí, no un enlace a …-nuevo', () => {
  const r = activas(leer(OP + 'RiesgoPantalla.tsx'))
  // 10/10/2026: el cotizador se elige por ramo en el registro (moto y auto dados de alta).
  assert.match(r, /const ramoEmbebido = ramoCotizadorEmbebido\(op\.ramo\)/)
  assert.match(r, /const CotizadorEmbebido = ramoEmbebido \? COTIZADOR_EMBEBIDO\[ramoEmbebido\] : null/)
  assert.match(r, /\{CotizadorEmbebido \? \(\s*<button type="button" onClick=\{\(\) => setCotizadorAbierto\(true\)\}/, 'botón que abre el bloque')
  assert.match(r, /\) : \(\s*<BtnLink href=\{acciones\.principal\.href\} variante="primario">/, 'el enlace a la pantalla de precio solo en los OTROS ramos')
  assert.match(r, /\{CotizadorEmbebido && cotizadorAbierto && \(/)
  assert.match(r, /<CotizadorEmbebido\s/)
  assert.doesNotMatch(r, /moto-nuevo|auto-nuevo/, 'ningún enlace a moto-nuevo ni auto-nuevo en la pantalla del riesgo')
  // Mientras se paga no se deja editar el riesgo.
  assert.match(r, /const ocupado = recargando \|\| cotizandoEmbebido/)
  assert.equal((r.match(/ocupado=\{ocupado\}/g) ?? []).length, 3, 'Datos del vehículo, Datos del riesgo (vivienda) e Intervinientes, ocupados mientras se cotiza')
  // 10/10/2026 (hogar): el bloque del objeto, sea vehículo o vivienda, avisa de lo que tiene a medias.
  assert.equal((r.match(/onEditando=\{alEditarObjeto\}/g) ?? []).length, 2, 'DatosVehiculo y DatosRiesgo bloquean el cotizador al editar')
  assert.match(r, /onEditando=\{alEditarFiguras\}/)
  assert.match(r, /<HistorialVariantes riesgo=\{riesgo\} abrirPrecios=\{abrirPrecios\} \/>/)
  // Llegar con #pedir-precio solo ABRE (lee gratis); nada cotiza sin el clic.
  assert.match(r, /if \(acciones\.principal && abrirAlCargar\(window\.location\.hash, op\.ramo\)\) setCotizadorAbierto\(true\)/)
})

test('🪤 registro: moto, auto y hogar dados de alta, y el tipo obliga a registrar cada ramo de la lista', () => {
  const c = activas(leer(OP + 'cotizadores-embebidos.tsx'))
  assert.match(c, /COTIZADOR_EMBEBIDO: Record<RamoCotizadorEmbebido, ComponentType<PropsPedirPrecioEmbebido>> = \{\s*auto: PedirPrecioAuto,\s*moto: PedirPrecioMoto,\s*hogar: PedirPrecioHogar,\s*\}/)
  assert.match(c, /PRECIOS_VARIANTE: Record<RamoCotizadorEmbebido, ComponentType<PropsPreciosVariante>> = \{\s*auto: PreciosVarianteAuto,\s*moto: PreciosVarianteMoto,\s*hogar: PreciosVarianteHogar,\s*\}/)
})

test('🪤 la carcasa común (PedirPrecioEmbebido): bloqueo, relectura y una instancia nueva por lectura del riesgo', () => {
  const p = activas(leer(OP + 'PedirPrecioEmbebido.tsx'))
  assert.match(p, /const bloqueo = motivoBloqueoCotizador\(\{ editandoObjeto, objeto: bloqueObjetoDeRamo\(riesgo\.oportunidad\.ramo\), editandoFiguras, recargando, riesgoCambiado, pantallaDesfasada \}\)/)
  // La huella cubre el objeto de CUALQUIER ramo (vivienda incluida), no solo el vehículo.
  assert.match(p, /const firmaActual = firmaRiesgo\(riesgo\)/)
  assert.match(p, /const riesgoCambiado = carga\.estado === 'ok' && carga\.firmaBase !== firmaActual/)
  assert.match(p, /if \(firmaServidor !== firmaBase\) onDesfase\(\)/)
  // Los catálogos y el riesgo se leen al ABRIR el bloque (acción de servidor), no en cada visita de la página.
  assert.match(p, /const r = await abrir\(\{ oportunidadId \}\)/)
  assert.match(p, /n: \+\+montajes\.current/)
  assert.match(p, /montar\(\{ apertura: carga\.apertura, n: carga\.n, bloqueo, onCotizando: alCotizar, onCotizado \}\)/)
})

for (const [fichero, cotizador, accion] of [
  ['PedirPrecioMoto.tsx', 'CotizadorMoto', 'abrirCotizadorMotoDeOportunidad'],
  ['PedirPrecioAuto.tsx', 'AutoNuevo', 'abrirCotizadorAutoDeOportunidad'],
] as const) {
  test(`🪤 ${fichero} monta ${cotizador} EMBEBIDO sobre la carcasa común, con bloqueo y key por lectura`, () => {
    const p = activas(leer(OP + fichero))
    assert.match(p, new RegExp(`<PedirPrecioEmbebido<AperturaOk>\\s*\\n\\s*props=\\{props\\}\\s*\\n\\s*abrir=\\{${accion}\\}`))
    const montaje = p.slice(p.indexOf(`<${cotizador}`), p.indexOf('/>', p.indexOf(`<${cotizador}`)))
    assert.match(montaje, /\n\s*embebido\n/, 'modo embebido')
    assert.match(montaje, /key=\{n\}/, 'cada lectura del riesgo, un cotizador nuevo (nada del riesgo anterior sobrevive)')
    assert.match(montaje, /bloqueo=\{bloqueo\}/)
    assert.match(montaje, /datosRiesgo=\{riesgo\.datosVehiculo\}/, 'el vehículo es el leído en el servidor al abrir')
  })
}

for (const [dir, Ramo, ramo] of [[MOTO, 'Moto', 'moto'], [AUTO, 'Auto', 'auto'], [HOGAR, 'Hogar', 'hogar']] as const) {
test(`🪤 la acción que abre el bloque exige acceso a la correduría y que el riesgo sea de ${ramo}`, () => {
  const a = activas(leer(dir + 'acciones.ts'))
  const f = a.slice(a.indexOf(`export async function abrirCotizador${Ramo}DeOportunidad`))
  assert.match(f, /const guarda = await exigirCorreduria\(\)\s*\n\s*if \(!guarda\.ok\) return/)
  assert.match(f, new RegExp(`if \\(l\\.riesgo\\.oportunidad\\.ramo !== '${ramo}'\\) return \\{ estado: 'error'`))
  assert.match(f, /const clienteId = tomadorDelRiesgo\(l\.riesgo\)/)
})

test(`🪤 las acciones de ${ramo} que PAGAN (0,50€) o leen lo pagado de un cliente exigen acceso a la correduría`, () => {
  const a = activas(leer(dir + 'acciones.ts'))
  for (const nombre of [`pedirCotizacion${Ramo}`, `pedirTarificacionGuardada${Ramo}`, `pedirPrecalificacion${Ramo}`]) {
    const ini = a.indexOf(`export async function ${nombre}`)
    assert.ok(ini >= 0, nombre)
    const cuerpo = a.slice(ini, a.indexOf('\nexport ', ini + 1) === -1 ? undefined : a.indexOf('\nexport ', ini + 1))
    assert.match(cuerpo, /const guarda = await exigirCorreduria\(\)\s*\n\s*if \(!guarda\.ok\) return \{ estado: 'error'/, `${nombre}: sin guarda de correduría`)
  }
})
}

test('🪤 AutoNuevo embebido: no cotiza bloqueado, sin borrador, no precarga la última tarificación ni pinta catálogo', () => {
  const c = activas(leer(AUTO + 'AutoNuevo.tsx'))
  assert.match(c, /const puedePulsar = !cotizando && !faltaAlgo && bloqueo === null && /)
  const sinGuarda = c.slice(c.indexOf('async function cotizarSinGuarda'), c.indexOf("setResultado({ estado: 'cotizando' })"))
  assert.match(sinGuarda, /if \(bloqueo !== null\) return/, 'ni con el botón forzado se paga con el riesgo en edición')
  assert.match(c, /if \(!variante \|\| embebido\) return\s*\n\s*let vivo = true\s*\n\s*pedirTarificacionGuardadaAuto/, 'embebido: la última tarificación no precarga su coche')
  assert.match(c, /const c = embebido \? null : plan\.cascada/)
  assert.match(c, /\{!embebido && !\(usarPrevio && previo\) && \(<>/, 'embebido: sin selectores de catálogo')
  assert.match(c, /const puedeRellenarFecha = !embebido && /)
  assert.match(c, /const bloqueado = useRef\(embebido\)/, 'embebido: nada de borrador (nace bloqueado)')
  assert.match(c, /useEffect\(\(\) => \{\s*\n\s*if \(embebido\) return\s*\n\s*let vivo = true\s*\n\s*const local = leerBorradorAutoNuevoConSello/, 'embebido: no se restaura ningún borrador')
  assert.match(c, /\{fichaTomador && !embebido && \(/, 'embebido: la ficha del tomador se corrige arriba, en Intervinientes')
  assert.match(c, /\{!embebido && \(\s*\n\s*<PackVehiculos/, 'embebido: sin pack')
  assert.match(c, /if \(embebido && onCotizado\) \{\s*\n\s*const id = cotizacionIdDe\(r\.guardado\)\s*\n\s*if \(id !== null\) onCotizado\(id\)/)
  assert.match(c, /if \(cotizandoEnVuelo\.current\) return\s*\n\s*cotizandoEnVuelo\.current = true/)
})

test('🪤 CotizadorMoto embebido: no cotiza bloqueado, no precarga la última moto ni pinta catálogo', () => {
  const c = activas(leer(MOTO + 'CotizadorMoto.tsx'))
  assert.match(c, /const puedePulsar = !cotizando && !faltaAlgo && bloqueo === null && /)
  const sinGuarda = c.slice(c.indexOf('async function pedirPrecioSinGuarda'), c.indexOf("setResultado({ estado: 'cotizando' })"))
  assert.match(sinGuarda, /if \(bloqueo !== null\) return/, 'ni con el botón forzado se paga con el riesgo en edición')
  assert.match(c, /if \(poliza !== null \|\| embebido\) return\s*\n\s*let vivo = true\s*\n\s*pedirTarificacionGuardadaMoto/, 'embebido: la última tarificación no precarga su moto')
  assert.match(c, /const c = embebido \? null : plan\.cascada/)
  assert.match(c, /\{!embebido && !\(usarPrevio && previo\) && \(<>/, 'embebido: sin selectores de catálogo')
  assert.match(c, /const faltaVersion = !codigoVehiculo \|\| \(embebido && \(!marcaId \|\| !modeloId \|\| !motorId\)\)/, 'sin los 4 ids no se cruza el carné con la versión')
  assert.match(c, /const puedeRellenarFecha = !poliza && !embebido && /)
  assert.match(c, /soloCondiciones=\{embebido\}/, 'figuras: solo estado civil y carné; lo demás, en Intervinientes')
  assert.match(c, /if \(embebido && onCotizado\) \{\s*\n\s*const id = cotizacionIdDe\(r\.guardado\)\s*\n\s*if \(id !== null\) onCotizado\(id\)/)
  // La guarda síncrona anti doble clic sigue envolviendo la llamada.
  assert.match(c, /if \(cotizandoEnVuelo\.current\) return\s*\n\s*cotizandoEnVuelo\.current = true/)
})

test('🪤 MotoNuevo (pantalla completa de la ficha) sigue montando el cotizador en modo COMPLETO', () => {
  const m = activas(leer(MOTO + 'MotoNuevo.tsx'))
  assert.match(m, /return <CotizadorMoto \{\.\.\.props\} \/>/)
  assert.match(m, /Omit<ComponentProps<typeof CotizadorMoto>, 'embebido'/, 'la pantalla completa no puede pasar `embebido`')
})

test('🪤 «Presupuestos de este riesgo» (cotizador embebido): precios y Emitir en la misma página, solo de ESA variante y vigente', () => {
  const h = activas(leer(OP + 'HistorialVariantes.tsx'))
  assert.match(h, /const PreciosVariante = ramoEmbebido \? PRECIOS_VARIANTE\[ramoEmbebido\] : null/)
  assert.match(h, /: preciosAqui \? null\s*\n\s*: ramo && ramoRetomable/, 'sin «Abrir» hacia …-nuevo')
  assert.match(h, /<PreciosVariante clienteId=\{v\.tomador\.clienteId\} oportunidadId=\{op\.id\} tarificacionId=\{v\.id\} simulado=\{v\.simulado\} \/>/)
  const g = activas(leer(OP + 'PreciosVarianteGuardada.tsx'))
  assert.match(g, /if \(g\.cotizacionId !== tarificacionId\) \{/, 'nunca otra en su lugar')
  assert.match(g, /if \(g\.caducada\) \{/, 'una caducada no se confirma ni se emite')
  const m = activas(leer(MOTO + 'CotizadorMoto.tsx'))
  const pm = m.slice(m.indexOf('export function PreciosVarianteMoto'), m.indexOf('const RESUELTOS_EN_PANTALLA'))
  assert.match(pm, /<PreciosVarianteGuardada[\s\S]*leer=\{pedirTarificacionGuardadaMoto\}/)
  assert.match(pm, /simulacion=\{false\} emitible sustituye=\{false\}/)
  const a = activas(leer(AUTO + 'AutoNuevo.tsx'))
  const pa = a.slice(a.indexOf('export function PreciosVarianteAuto'))
  assert.match(pa, /<PreciosVarianteGuardada[\s\S]*leer=\{pedirTarificacionGuardadaAuto\}/)
  assert.match(pa, /coste: '0 € \(ya estaba pagada\)'/)
})

test('🪤 Emision: recibe idPrecio y modalidad en cada panel del cotizador, y lleva guarda de un solo envío', () => {
  const c = activas(leer(MOTO + 'CotizadorMoto.tsx'))
  const usos = c.split('<Emision').length - 1
  assert.equal(usos, 2)
  assert.equal((c.match(/idPrecio=\{/g) ?? []).length, usos, 'cada <Emision> con idPrecio')
  assert.equal((c.match(/modalidad=\{/g) ?? []).length, usos, 'cada <Emision> con modalidad')
  const e = activas(leer(CORR + 'poliza/[id]/retarificar/emision.tsx'))
  assert.match(e, /if \(llamadaEnVuelo\.current\) return\s*\n\s*llamadaEnVuelo\.current = true\s*\n\s*try \{[\s\S]*?\} finally \{\s*\n\s*llamadaEnVuelo\.current = false/)
  assert.match(e, /return unaALaVez\(\(\) => confirmarPrecioSinGuarda\(/)
  assert.match(e, /return unaALaVez\(\(\) => emitirSinGuarda\(/)
})

test('🪤 HOGAR (10/10/2026): PedirPrecioHogar monta el Formulario de hogar-nuevo EMBEBIDO, con bloqueo y key por lectura', () => {
  const p = activas(leer(OP + 'PedirPrecioHogar.tsx'))
  assert.match(p, /<PedirPrecioEmbebido<AperturaOk>\s*\n\s*props=\{props\}\s*\n\s*abrir=\{abrirCotizadorHogarDeOportunidad\}/)
  const montaje = p.slice(p.indexOf('<Formulario'), p.indexOf('/>', p.indexOf('<Formulario')))
  assert.match(montaje, /\n\s*embebido\n/, 'modo embebido («solo condiciones»)')
  assert.match(montaje, /key=\{n\}/)
  // Lo de arriba a medias manda; después, la contradicción propietario/vivienda: nunca se pierde ninguno de los dos.
  assert.match(montaje, /bloqueo=\{bloqueo \?\? fig\.bloqueo\}/)
  assert.match(p, /if \(referencia === null \|\| pre === null\) \{/, 'sin referencia catastral no se monta (no se cotiza a ciegas)')
})

test('🪤 HOGAR: el Formulario embebido no paga bloqueado, solo deja tocar condiciones y avisa el coste como moto/auto', () => {
  const c = activas(leer(HOGAR + 'Formulario.tsx'))
  assert.match(c, /bloqueo === null &&\s*\n\s*consumoPermite/, 'el botón se apaga con el riesgo a medias')
  assert.match(c, /soloLectura=\{embebido && !filaHogarEditableEmbebida\(f\.campo\)\}/, 'vivienda y personas se corrigen arriba')
  assert.match(c, /const sePuedeTocar = !soloLectura && /)
  assert.match(c, /Este clic gasta 0,50€ reales\./)
  assert.match(c, /if \(embebido && onCotizado\) \{\s*\n\s*const id = cotizacionIdDe\(r\.guardado\)\s*\n\s*if \(id !== null\) onCotizado\(id\)/)
  const pv = c.slice(c.indexOf('export function PreciosVarianteHogar'))
  assert.match(pv, /<PreciosVarianteGuardada[\s\S]*leer=\{pedirTarificacionGuardadaHogar\}/)
  // La pantalla completa hogar-nuevo sigue montándolo sin `embebido`.
  const page = activas(leer(HOGAR + 'page.tsx'))
  assert.match(page, /<Formulario clienteId=\{clienteId\} referencia=\{referencia\} preInicial=\{pre\.pre\} variante=\{variante\} iniciales=\{hayIniciales \? iniciales : null\} \/>/)
})

test('🪤 HOGAR: abrir el bloque deriva «el tomador es el propietario» de Intervinientes (no deja que asegura suponga «sí»)', () => {
  const a = activas(leer(HOGAR + 'acciones.ts'))
  const f = a.slice(a.indexOf('export async function abrirCotizadorHogarDeOportunidad'))
  assert.match(f, /const propietarioEsTomador = propietarioEsTomadorDeRiesgo\(/)
  assert.match(f, /if \(propietarioEsTomador !== null\) iniciales\.resueltos\.propietarioEsTomador = propietarioEsTomador/)
  assert.match(f, /if \(l\.riesgo\.datosRiesgo === null\) return \{ estado: 'error'/, 'sin el bloque de la vivienda no se cotiza')
})
