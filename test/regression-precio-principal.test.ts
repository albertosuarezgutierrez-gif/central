// Guardián de «pedir precio desde la oportunidad» (07/10/2026). `node --test`.
//
// Objetivo de Alberto: en /correduria/oportunidad/[id], para CADA ramo, editar los datos del riesgo → elegir del
// catálogo (gratis) → pedir precio, desde la misma pantalla y con todo precargado. Nunca una cotización de pago (0,50€)
// que se dispare sola.
//
// Erosiones que dejarían el CI en verde (compilan y no hay test de comportamiento que las vea):
//  1. Que con PÓLIZA el botón principal vuelva a ser «Retarificar con las mismas personas»: tarifica el riesgo VIEJO de
//     la póliza, no lo que el corredor acaba de editar en la oportunidad.
//  2. Que «Pedir precio →» de un bloque pase de enlazar a la pantalla de precio a cotizar por sí mismo.
//  3. Que el buscador del Catastro de hogar vuelva a partir solo del texto libre y pierda la calle/municipio del riesgo.
//  4. Que se vuelva a ofrecer la «duración» de vida (el vendor no tiene campo: TermLifeRisk_V1).
//  5. Que cambiar el CP deje el municipio del catálogo de OTRO código postal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const DIR = 'apps/plataforma/app/(usuario)/correduria/oportunidad/[id]/'
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const activas = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

test('🪤 RiesgoPantalla: el botón PRIMARIO es accionesPrecio().principal; retarificar la póliza solo se pinta como secundario', () => {
  const src = activas(leer(DIR + 'RiesgoPantalla.tsx'))
  assert.match(src, /accionesPrecio\(\{ ramo: op\.ramo, polizaId: op\.polizaId, tomadorId: tomadorDelRiesgo\(riesgo\), oportunidadId: op\.id \}\)/)
  assert.match(src, /<BtnLink href=\{acciones\.principal\.href\} variante="primario">/, 'el principal es el de pedir precio con la oportunidad')
  assert.match(src, /<BtnLink href=\{acciones\.secundario\.href\} variante="secundario">/, 'retarificar la póliza, secundario')
  assert.equal((src.match(/variante="primario"/g) ?? []).length, 1, 'un solo primario en la pantalla del riesgo')
  assert.doesNotMatch(src, /\/retarificar|retarificaEnRiesgo|rutaRetarificarPoliza|mismas personas/i, 'la ruta de retarificar vive en variante.ts, no se arma a mano aquí')
})

test('🪤 variante.ts: el principal usa rutaVariante (oportunidad) y el secundario rutaRetarificarPoliza, nunca al revés', () => {
  const v = activas(leer(DIR + 'variante.ts'))
  const f = v.slice(v.indexOf('export function accionesPrecio'), v.indexOf('export function motivoSinPrecioRamo'))
  assert.match(f, /const principal: AccionPrecio = \{\s*href: rutaVariante\(ramo, e\.tomadorId, e\.oportunidadId\)/)
  assert.match(f, /const secundario: AccionPrecio \| null = e\.polizaId && retarificaEnRiesgo\(e\.ramo\)\s*\? \{\s*href: rutaRetarificarPoliza\(e\.polizaId, e\.oportunidadId\)/)
  assert.match(f, /Retarificar con los datos de la póliza/)
  assert.doesNotMatch(f.slice(0, f.indexOf('const secundario')), /retarificar/i, 'el principal no menciona retarificar')
})

test('🪤 UN ÚNICO bloque «Pedir precio» (Fase 0): los bloques de Datos no llevan botón, ni aviso «Falta para pedir precio», ni rutaVariante', () => {
  assert.equal(existsSync(join(ROOT, DIR + 'BotonPedirPrecio.tsx')), false, 'BotonPedirPrecio se borró: no hay segundo botón de precio')
  for (const f of ['DatosRiesgo.tsx', 'DatosVehiculo.tsx']) {
    const d = activas(leer(DIR + f))
    assert.doesNotMatch(d, /pedirCotizacion|cotizarAsegura|rutaVariante|BotonPedirPrecio|Pedir precio →|0,50€|textoFaltanVehiculo|textoFaltanVivienda|textoFaltanCapital/, f + ': el precio vive solo en RiesgoPantalla')
    assert.doesNotMatch(d, /precio=\{/, f + ': ningún bloque de datos pasa un botón de precio')
  }
  const r = activas(leer(DIR + 'RiesgoPantalla.tsx'))
  assert.equal((r.match(/Falta para pedir precio|\{faltaDatos\}/g) ?? []).length, 1, 'el aviso de lo que falta se pinta UNA vez')
  assert.equal((r.match(/0,50€/g) ?? []).length, 1, 'el coste de 0,50€ se dice UNA vez en la pantalla del riesgo')
  assert.doesNotMatch(r, /Nueva variante/, 'el bloque «Nueva variante» ya no existe: su contenido es «Pedir precio»')
  assert.equal((r.match(/<section id="pedir-precio"/g) ?? []).length, 1)
  const i = (t: string) => r.indexOf(t)
  assert.ok(i('<FigurasRiesgo') < i('id="pedir-precio"') && i('id="pedir-precio"') < i('<OfertasOportunidad'), 'el bloque va justo después de Intervinientes y antes de Ofertas/Presupuestos')
  assert.match(r, /<a href="#presupuestos"/, 'comunidades: el bloque único lleva al formulario de bots, no a rutaVariante')
})

test('🪤 la página de la oportunidad tiene UN solo enlace a rutaVariante (el principal de accionesPrecio)', () => {
  const carpeta = join(ROOT, DIR)
  const usos: string[] = []
  for (const f of readdirSync(carpeta)) {
    if (!/\.tsx?$/.test(f) || /\.test\.ts$/.test(f)) continue
    const n = (activas(readFileSync(join(carpeta, f), 'utf8')).match(/\brutaVariante\(/g) ?? []).length
    for (let k = 0; k < n; k++) usos.push(f)
  }
  // variante.ts (la define y la usa accionesPrecio) + HistorialVariantes (retomar una variante concreta, `?tarificacion=`)
  // + cotizador-embebido.ts (`rutaPedirPrecio`, 10/10/2026: el «Tarificar →» de la ficha; un ramo SIN cotizador embebido
  // sigue yendo a su `…-nuevo`). Esa no se pinta en esta página.
  const fuera = usos.filter((f) => f !== 'variante.ts' && f !== 'HistorialVariantes.tsx' && f !== 'cotizador-embebido.ts')
  assert.equal(usos.filter((f) => f === 'cotizador-embebido.ts').length, 1, 'rutaPedirPrecio: solo la caída al …-nuevo')
  assert.deepEqual(fuera, [], 'ningún bloque de datos ni RiesgoPantalla arma su propio enlace a la pantalla de precio')
  assert.equal(usos.filter((f) => f === 'variante.ts').length, 2, 'definición + el principal de accionesPrecio, nada más')
  assert.equal((activas(leer(DIR + 'RiesgoPantalla.tsx')).match(/acciones\.principal\.href/g) ?? []).length, 1, 'un solo enlace principal en la pantalla')
})

test('hogar sin referencia: el buscador del Catastro parte de la calle del riesgo, no solo del texto libre', () => {
  const p = activas(leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/hogar-nuevo/page.tsx'))
  assert.match(p, /busquedaCatastroDeVivienda\(vivienda, tipoViaNombre\)/)
  assert.match(p, /direccion=\{busca\.direccion \?\? deFicha\?\.direccion \?\? ''\}/)
  assert.match(p, /municipio=\{busca\.municipio \?\?/)
  assert.match(p, /provincia=\{busca\.provincia \?\?/)
  assert.match(p, /vivienda\?\.referenciaCatastral/, 'con referencia anotada no se pasa por el buscador')
})

test('vida: la duración ya no se ofrece, ni se pinta, ni se siembra; profesión y fumador sí', () => {
  const mod = activas(leer('packages/module-seguros/src/datos-capital-riesgo.ts'))
  assert.match(mod, /ramo === 'vida' \? \['capital', 'profesion', 'fumador'\]/)
  const d = activas(leer(DIR + 'DatosRiesgo.tsx'))
  assert.doesNotMatch(d, /duracionAnios|Duración/, 'la pantalla del riesgo no habla de duración')
  assert.doesNotMatch(activas(leer(DIR + 'variante.ts')), /duracionAnios/)
  const vida = activas(leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/vida-nuevo/VidaNuevo.tsx'))
  assert.doesNotMatch(vida, /duracionAnios/)
  assert.match(vida, /useState\(inicial\?\.profesion \?\? ''\)/, 'la pantalla de precio precarga la profesión del riesgo')
  assert.match(vida, /inicial\?\.fumador === true \? 'si' : inicial\?\.fumador === false \? 'no' : ''/, 'y si fuma: false es un dato, no un vacío')
  assert.match(d, /pedirCatalogo\(\{ tipo: 'profesiones' \}\)/, 'la profesión sale del catálogo CNO-11 del vendor')
})

test('salud y decesos: los asegurados adicionales se precargan del riesgo', () => {
  for (const [dir, f] of [['salud-nuevo', 'SaludNuevo.tsx'], ['decesos-nuevo', 'DecesosNuevo.tsx']]) {
    const s = activas(leer(`apps/plataforma/app/(usuario)/correduria/cliente/[id]/${dir}/${f}`))
    assert.match(s, /useState<AseguradoForm\[\]>\(\(\) => aseguradosDeRiesgo\(inicial\?\.asegurados\)\)/, dir)
    const page = activas(leer(`apps/plataforma/app/(usuario)/correduria/cliente/[id]/${dir}/page.tsx`))
    assert.match(page, /asegurados: c\.asegurados/, dir)
  }
  const d = activas(leer(DIR + 'DatosRiesgo.tsx'))
  assert.match(d, /JSON\.stringify\(nuevo\) !== JSON\.stringify\(aseguradosParaEnviar\(aseguradosDeRiesgo\(guardados\)\)\)/, 'la lista solo se manda si cambia')
})

test('hogar: cambiar el código postal suelta el municipio del catálogo (era de otro CP)', () => {
  const d = activas(leer(DIR + 'DatosRiesgo.tsx'))
  assert.match(d, /onChange=\{k === 'cp' \? alCambiarCp : E\.set\(k\)\}/)
  const f = d.slice(d.indexOf('function alCambiarCp'), d.indexOf('const aviso = textoFaltanVivienda'))
  assert.match(f, /municipioId: igualAlGuardado && d\.municipioId != null \? String\(d\.municipioId\) : ''/)
  assert.match(f, /setMunicipios\(null\)/)
})

test('comercio: sin ruta de tarifa el aviso no promete «tarificar»; comunidades dice que se cotiza por bots', () => {
  const d = activas(leer(DIR + 'DatosRiesgo.tsx'))
  assert.match(d, /textoFaltanComercio\(faltan as CampoFaltaComercio\[\], \{ hayRutaTarifa: tarifica \}\)/)
  assert.match(d, /nota=\{avisoRamoSinTarifa\(ramo, AVISO_RIESGO_LIBRE\)\}/)
  const r = activas(leer(DIR + 'RiesgoPantalla.tsx'))
  assert.match(r, /avisoRamoSinTarifa\(op\.ramo, /)
})
