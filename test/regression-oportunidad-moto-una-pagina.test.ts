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
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const activas = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

test('🪤 RiesgoPantalla: en moto el principal es un BOTÓN que despliega el cotizador aquí, no un enlace a moto-nuevo', () => {
  const r = activas(leer(OP + 'RiesgoPantalla.tsx'))
  assert.match(r, /const esMoto = op\.ramo === 'moto'/)
  assert.match(r, /\{esMoto \? \(\s*<button type="button" onClick=\{\(\) => setMotoAbierto\(true\)\}/, 'moto: botón que abre el bloque')
  assert.match(r, /\) : \(\s*<BtnLink href=\{acciones\.principal\.href\} variante="primario">/, 'el enlace a la pantalla de precio solo en los OTROS ramos')
  assert.match(r, /\{esMoto && motoAbierto && \(/)
  assert.match(r, /<PedirPrecioMoto\s/)
  assert.doesNotMatch(r, /moto-nuevo/, 'ningún enlace a moto-nuevo en la pantalla del riesgo')
  // Mientras se paga no se deja editar el riesgo.
  assert.match(r, /const ocupado = recargando \|\| cotizandoMoto/)
  assert.equal((r.match(/ocupado=\{ocupado\}/g) ?? []).length, 2, 'Datos del vehículo e Intervinientes, ocupados mientras se cotiza')
  assert.match(r, /onEditando=\{alEditarVehiculo\}/)
  assert.match(r, /onEditando=\{alEditarFiguras\}/)
  assert.match(r, /<HistorialVariantes riesgo=\{riesgo\} abrirPrecios=\{abrirPrecios\} \/>/)
})

test('🪤 PedirPrecioMoto monta el cotizador EMBEBIDO, con bloqueo y una instancia nueva por lectura del riesgo', () => {
  const p = activas(leer(OP + 'PedirPrecioMoto.tsx'))
  const montaje = p.slice(p.indexOf('<CotizadorMoto'), p.indexOf('/>', p.indexOf('<CotizadorMoto')))
  assert.match(montaje, /\n\s*embebido\n/, 'modo embebido')
  assert.match(montaje, /key=\{carga\.n\}/, 'cada lectura del riesgo, un cotizador nuevo (nada del riesgo anterior sobrevive)')
  assert.match(montaje, /bloqueo=\{bloqueo\}/)
  assert.match(montaje, /datosRiesgo=\{riesgo\.datosVehiculo\}/, 'el vehículo es el leído en el servidor al abrir')
  assert.match(p, /const bloqueo = motivoBloqueoCotizador\(\{ editandoVehiculo, editandoFiguras, recargando, riesgoCambiado, pantallaDesfasada \}\)/)
  assert.match(p, /const riesgoCambiado = carga\.estado === 'ok' && carga\.firmaBase !== firmaActual/)
  assert.match(p, /if \(firmaServidor !== firmaBase\) onDesfase\(\)/)
  // Los catálogos y el riesgo se leen al ABRIR el bloque (acción de servidor), no en cada visita de la página.
  assert.match(p, /await abrirCotizadorMotoDeOportunidad\(\{ oportunidadId \}\)/)
})

test('🪤 la acción que abre el bloque exige acceso a la correduría y que el riesgo sea de moto', () => {
  const a = activas(leer(MOTO + 'acciones.ts'))
  const f = a.slice(a.indexOf('export async function abrirCotizadorMotoDeOportunidad'))
  assert.match(f, /const guarda = await exigirCorreduria\(\)\s*\n\s*if \(!guarda\.ok\) return/)
  assert.match(f, /if \(l\.riesgo\.oportunidad\.ramo !== 'moto'\) return \{ estado: 'error'/)
  assert.match(f, /const clienteId = tomadorDelRiesgo\(l\.riesgo\)/)
})

test('🪤 las acciones de moto que PAGAN (0,50€) o leen lo pagado de un cliente exigen acceso a la correduría', () => {
  const a = activas(leer(MOTO + 'acciones.ts'))
  for (const nombre of ['pedirCotizacionMoto', 'pedirTarificacionGuardadaMoto', 'pedirPrecalificacionMoto']) {
    const ini = a.indexOf(`export async function ${nombre}`)
    assert.ok(ini >= 0, nombre)
    const cuerpo = a.slice(ini, a.indexOf('\nexport ', ini + 1) === -1 ? undefined : a.indexOf('\nexport ', ini + 1))
    assert.match(cuerpo, /const guarda = await exigirCorreduria\(\)\s*\n\s*if \(!guarda\.ok\) return \{ estado: 'error'/, `${nombre}: sin guarda de correduría`)
  }
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

test('🪤 «Presupuestos de este riesgo» (moto): precios y Emitir en la misma página, solo de ESA variante y vigente', () => {
  const h = activas(leer(OP + 'HistorialVariantes.tsx'))
  assert.match(h, /const preciosAqui = op\.ramo === 'moto'/)
  assert.match(h, /: preciosAqui \? null\s*\n\s*: ramo && ramoRetomable/, 'moto: sin «Abrir» hacia moto-nuevo')
  assert.match(h, /<PreciosVarianteMoto clienteId=\{v\.tomador\.clienteId\} oportunidadId=\{op\.id\} tarificacionId=\{v\.id\} simulado=\{v\.simulado\} \/>/)
  const c = activas(leer(MOTO + 'CotizadorMoto.tsx'))
  const p = c.slice(c.indexOf('export function PreciosVarianteMoto'), c.indexOf('const RESUELTOS_EN_PANTALLA'))
  assert.match(p, /if \(g\.cotizacionId !== tarificacionId\) \{/, 'nunca otra en su lugar')
  assert.match(p, /if \(g\.caducada\) \{/, 'una caducada no se confirma ni se emite')
  assert.match(p, /<Precios r=\{carga\.r\} simulacion=\{false\} emitible sustituye=\{false\}/)
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
