// Cotizador de MOTO embebido en la oportunidad (13/10/2026, lo mismo que auto): historial declarado arriba → Avant2,
// resúmenes de solo lectura de lo que está arriba, «Verificación antes de pedir precio» y relectura por `firmaRiesgo`.
// Lógica pura en `../auto-nuevo/verificacion-embebido.ts`; el resto, cepos de fuente (lo que tsc no ve).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { gruposVerificacion, historialConTopes, verificacionCompleta, type GrupoVerificacion as Grupo } from '../auto-nuevo/verificacion-embebido.ts'

const dir = new URL('.', import.meta.url)
const fuente = readFileSync(new URL('./CotizadorMoto.tsx', dir), 'utf8')
const op = (f: string) => readFileSync(new URL(`../../../oportunidad/[id]/${f}`, dir), 'utf8')
const peticionMoto = readFileSync(new URL('../../../../../../../asegura/lib/codeoscopic/peticion-moto.ts', dir), 'utf8')

function entrada(cambios: Record<string, unknown> = {}) {
  const base = {
    ramo: 'moto',
    tomador: { empresa: false, sinPrecalificar: false, faltaCivil: false, faltaMunicipio: false, aMano: [], enFicha: [], sinUbicar: [] },
    figuras: [] as unknown[],
    figuraRepetida: false,
    ocasionalDuplicado: false,
    personaLibreIncompleta: false,
    vehiculo: { faltaVersion: false, faltaMatriculacion: false, faltaGaraje: false, kmInvalido: false, compraInvalida: false, faltaMotoAnterior: false },
    historial: {
      tieneSeguro: true, faltaCompania: false, faltaPoliza: false, faltaAniosAsegurado: false, faltaAniosCompania: false,
      faltaAniosSinSiniestros: false, siniestros5Pendiente: false, reparos: [],
    },
    faltaAlgo: false,
  }
  return { ...base, ...cambios } as Parameters<typeof gruposVerificacion>[0]
}
const item = (g: Grupo[], clave: string) => g.flatMap((x) => x.items).find((i) => i.clave === clave)

test('moto: tres grupos (figuras, la moto, historial), todo en ✓', () => {
  const g = gruposVerificacion(entrada())
  assert.deepEqual(g.map((x) => x.titulo), ['1 · Figuras (tomador e intervinientes)', '2 · Riesgo: la moto', '3 · Historial y bonificaciones'])
  assert.equal(verificacionCompleta(g), true)
  // Auto (sin `ramo`) sigue con su rótulo y sin el ítem de experiencia.
  const auto = gruposVerificacion({ ...entrada(), ramo: undefined, vehiculo: { faltaVersion: false, faltaMatriculacion: false, faltaGaraje: false, kmInvalido: false, compraInvalida: false } })
  assert.equal(auto[1].titulo, '2 · Riesgo: el vehículo')
  assert.equal(item(auto, 'moto-anterior'), undefined)
})

test('moto: experiencia en OTRA moto sin su código Base7 = ✗ que lleva al campo del cotizador (no arriba)', () => {
  const g = gruposVerificacion(entrada({ vehiculo: { ...entrada().vehiculo, faltaMotoAnterior: true }, faltaAlgo: true }))
  const m = item(g, 'moto-anterior')
  assert.equal(m?.estado, 'falta')
  assert.equal(m?.ancla, 'cotizador-experiencia')
  assert.notEqual(m?.arriba, true)
  assert.equal(verificacionCompleta(g), false)
})

test('moto: fecha de compra anterior a la matriculación = ✗ que se arregla arriba', () => {
  const g = gruposVerificacion(entrada({ vehiculo: { ...entrada().vehiculo, compraInvalida: true }, faltaAlgo: true }))
  assert.equal(item(g, 'compra')?.estado, 'falta')
  assert.equal(item(g, 'compra')?.ancla, 'datos-vehiculo')
  assert.equal(verificacionCompleta(g), false)
})

test('moto: conductor ocasional en el riesgo = aviso (no se declara), no bloquea', () => {
  const g = gruposVerificacion(entrada({ ocasionalIgnorado: true }))
  assert.equal(item(g, 'ocasional-ignorado')?.estado, 'aviso')
  assert.equal(verificacionCompleta(g), true)
})

test('moto: historial incoherente o incompleto con seguro = ✗ arriba («Historial y bonificaciones»)', () => {
  const h = entrada().historial
  for (const [cambio, clave] of [[{ faltaCompania: true }, 'compania'], [{ faltaPoliza: true }, 'poliza'], [{ companiaSuperaAsegurado: true }, 'compania-supera'], [{ sinSiniestrosSuperaAsegurado: true }, 'sin-siniestros-supera']] as const) {
    const g = gruposVerificacion(entrada({ historial: { ...h, ...cambio }, faltaAlgo: true }))
    assert.equal(item(g, clave)?.estado, 'falta', clave)
    assert.equal(item(g, clave)?.ancla, 'historial-riesgo', clave)
    assert.equal(verificacionCompleta(g), false, clave)
  }
})

test('historialConTopes: lo declarado arriba manda; lo leído / el máximo se topa a los años asegurado', () => {
  const max = { aniosAsegurado: 30, aniosEnCompania: 30, aniosSinSiniestros: 30, siniestrosUltimos5: 0 }
  const r = historialConTopes(max, { aniosAsegurado: 4, aniosEnCompania: null })
  assert.deepEqual([r.aniosAsegurado, r.aniosEnCompania, r.aniosSinSiniestros, r.siniestrosUltimos5], [4, 4, 4, 0])
  assert.deepEqual([r.origenAsegurado, r.origenEnCompania], ['arriba', 'leido'])
  // Arriba se declara en la compañía: manda tal cual (si choca con asegurado, la checklist lo marca ✗; no se arregla en silencio).
  const c = historialConTopes(max, { aniosAsegurado: 4, aniosEnCompania: 6 })
  assert.equal(c.aniosEnCompania, 6)
  assert.equal(c.origenEnCompania, 'arriba')
  // Sin dato arriba: lo de siempre; 0 arriba es dato (menos de un año), no «sin dato».
  assert.deepEqual([historialConTopes(max, null).aniosAsegurado, historialConTopes(max, null).origenAsegurado], [30, 'leido'])
  const cero = historialConTopes(max, { aniosAsegurado: 0 })
  assert.deepEqual([cero.aniosAsegurado, cero.aniosEnCompania, cero.aniosSinSiniestros, cero.origenAsegurado], [0, 0, 0, 'arriba'])
})

test('fuente: el bloque «Pedir precio» de moto pasa el historial declarado del riesgo y relee por la carcasa común', () => {
  const p = op('PedirPrecioMoto.tsx')
  assert.match(p, /historialRiesgo=\{riesgo\.historial\?\.historialDeclarado \?\? null\}/)
  assert.match(p, /<PedirPrecioEmbebido<AperturaOk>/)
  assert.match(p, /key=\{n\}/, 'cada relectura del riesgo monta un cotizador nuevo')
  // La carcasa vigila `firmaRiesgo`, y la huella lleva TODAS las claves del historial declarado (sea cual sea el ramo).
  assert.match(op('PedirPrecioEmbebido.tsx'), /const firmaActual = firmaRiesgo\(riesgo\)/)
  assert.match(op('cotizador-embebido.ts'), /CLAVES_HISTORIAL_DECLARADO\.map\(\(k\) => \[k, hd\[k\] \?\? null\]\)/)
})

test('fuente: en embebido el seguro actual sale de `seguroActualEmbebido` (lo de arriba) con el catálogo de compañías de moto', () => {
  assert.match(fuente, /const seguroArriba = embebido\s+\? seguroActualEmbebido\(\{\s+arriba: historialRiesgo,/)
  assert.match(fuente, /const historialEmb = embebido \? historialConTopes\(historialLeido, historialRiesgo\) : null/)
  assert.match(fuente, /useState\(seguroArriba\?\.polizaDigitos \?\? seguroLeido\.poliza\)/)
  assert.match(fuente, /useState\(seguroArriba\?\.tieneSeguroActual \?\? seguroLeido\.tiene\)/)
  assert.match(fuente, /companiaNoReconocida: seguroArriba\?\.companiaNoReconocida \?\? null/)
  // Lo que viaja a Avant2 es lo de esos estados: el paquete completo del historial (como exige `revisarDatosMoto`).
  for (const k of ['aseguradoAntes = true', 'companiaAnteriorCodigo = companiaActualElegida', 'polizaAnterior = polizaActualDigitos.trim()',
    'aniosAsegurado = Number(aniosAsegurado)', 'aniosEnCompania = Number(aniosEnCompania)', 'aniosSinSiniestros = Number(aniosSinSiniestros)']) {
    assert.ok(fuente.includes(`correccionesFinal.${k}`), k)
  }
  // Y esos son los campos de la petición real de moto (Avant2).
  for (const k of ['companiaAnteriorCodigo', 'polizaAnterior', 'aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros', 'siniestrosUltimos5', 'fechaCompra']) {
    assert.match(peticionMoto, new RegExp(`\\b${k}\\??:`), `peticion-moto.ts no tiene ${k}`)
  }
})

test('fuente: moto NO declara conductor ocasional ni remolque (Avant2 no los tiene en moto)', () => {
  assert.match(peticionMoto, /no existen `secondaryDriver` ni `lightTrailer`/)
  assert.doesNotMatch(fuente, /remolqueLigero|conductorOcasional|lightTrailer|secondaryDriver/)
  assert.match(fuente, /const ROLES_MOTO: readonly RolExtra\[\] = \['propietario', 'conductor_habitual'\]/)
})

test('fuente: el botón de pago exige la verificación; el texto viejo solo fuera de embebido', () => {
  assert.match(fuente, /const puedePulsarEmb = puedePulsar && \(!embebido \|\| verificacionOk\)/)
  assert.match(fuente, /onClick=\{\(\) => void cotizar\(\)\} disabled=\{!puedePulsarEmb\}/)
  assert.match(fuente, /deshabilitado=\{!puedePulsarEmb\}/)
  assert.match(fuente, /if \(embebido && !verificacionOk\) return/)
  assert.match(fuente, /\{faltaAlgo && !embebido && \(/)
  assert.match(fuente, /\{embebido && <Verificacion grupos=\{verificacion\} completa=\{verificacionOk\} \/>\}/)
  assert.match(fuente, /ramo: 'moto',/)
})

test('fuente: en embebido garaje / km / compra y todo el historial son RESUMEN («Editar arriba»)', () => {
  for (const e of ['¿Dónde duerme?', 'Kilómetros al año', 'Fecha de compra', '¿Tiene seguro ahora?', 'Compañía actual', 'Nº de póliza (van los 5 últimos)',
    'Años asegurado sin interrupción', 'Años en esta compañía', 'Años sin siniestros', 'Siniestros en los últimos 5 años']) {
    assert.ok(new RegExp(`<ResumenCampo\\s+etiqueta="${e.replace(/[?()]/g, '\\$&')}"`).test(fuente), `falta el resumen de «${e}»`)
  }
  // Lo que la checklist trata como aviso no se pinta como «Falta» rojo.
  const bloque = (etiqueta: string) => {
    const i = fuente.search(new RegExp(`<ResumenCampo\\s+etiqueta="${etiqueta.replace(/[?()]/g, '\\$&')}"`))
    assert.ok(i > 0, `falta el resumen «${etiqueta}»`)
    return fuente.slice(i, fuente.indexOf('/>', i))
  }
  for (const e of ['¿Tiene seguro ahora?', 'Siniestros en los últimos 5 años', 'Kilómetros al año']) assert.match(bloque(e), /vacio="aviso"/, e)
  // La fecha de compra de arriba viaja (Avant2 `purchaseDate`), solo si es coherente.
  assert.match(fuente, /const fechaCompra = embebido \? datosRiesgo\?\.fechaCompra \?\? '' : ''/)
  assert.match(fuente, /\.\.\.\(fechaCompra !== '' && !compraInvalida \? \{ fechaCompra \} : \{\}\)/)
})

test('fuente: las anclas de «Ir al campo» existen en el cotizador de moto', () => {
  for (const id of ['id="cotizador-tomador"', 'id="cotizador-seguro-actual"', 'id="cotizador-experiencia"', 'id={`cotizador-figura-${rol}`}']) {
    assert.ok(fuente.includes(id), id)
  }
})
