// «Verificación antes de pedir precio» del cotizador auto EMBEBIDO en la oportunidad (13/10/2026).
// `gruposVerificacion` vive en `AutoNuevo.tsx` (JSX: node --test no lo importa). Se recorta su tramo del FUENTE, se le
// quitan los tipos (`stripTypeScriptTypes`) y se evalúa: se prueba el comportamiento de verdad, no un texto.
// Más cepos de fuente: el botón de pago exige la verificación, los datos de arriba van en resumen y el orden de la
// pantalla del riesgo (intervinientes → objeto → historial → pedir precio).

// «Verificación antes de pedir precio» del cotizador auto EMBEBIDO en la oportunidad (13/10/2026).
// La lógica pura vive en `verificacion-embebido.ts` y se importa tal cual. Más cepos de fuente: el botón de pago exige
// la verificación, los datos de arriba van en resumen y el orden de la pantalla del riesgo
// (intervinientes → objeto → historial → pedir precio).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { gruposVerificacion, verificacionCompleta, type GrupoVerificacion as Grupo } from './verificacion-embebido.ts'

const dir = new URL('.', import.meta.url)
const fuente = readFileSync(new URL('./AutoNuevo.tsx', dir), 'utf8')
const op = (f: string) => readFileSync(new URL(`../../../oportunidad/[id]/${f}`, dir), 'utf8')

function entrada(cambios: Record<string, unknown> = {}) {
  const base = {
    tomador: { empresa: false, sinPrecalificar: false, faltaCivil: false, faltaMunicipio: false, aMano: [], enFicha: [], sinUbicar: [] },
    figuras: [] as unknown[],
    figuraRepetida: false,
    ocasionalDuplicado: false,
    personaLibreIncompleta: false,
    vehiculo: { faltaVersion: false, faltaMatriculacion: false, faltaGaraje: false, kmInvalido: false, compraInvalida: false },
    historial: {
      tieneSeguro: true, faltaCompania: false, faltaPoliza: false, faltaAniosAsegurado: false, faltaAniosCompania: false,
      faltaAniosSinSiniestros: false, siniestros5Pendiente: false, reparos: [],
    },
    faltaAlgo: false,
  }
  return { ...base, ...cambios } as Parameters<typeof gruposVerificacion>[0]
}
const item = (g: Grupo[], clave: string) => g.flatMap((x) => x.items).find((i) => i.clave === clave)

test('todo completo: tres grupos en orden (figuras, riesgo, historial) y todo en ✓', () => {
  const g = gruposVerificacion(entrada())
  assert.deepEqual(g.map((x) => x.titulo), ['1 · Figuras (tomador e intervinientes)', '2 · Riesgo: el vehículo', '3 · Historial y bonificaciones'])
  assert.equal(verificacionCompleta(g), true)
})

test('coche sin versión del catálogo: ✗ que lleva al botón «Elegir versión del catálogo» de arriba', () => {
  const g = gruposVerificacion(entrada({ vehiculo: { faltaVersion: true, faltaMatriculacion: false, faltaGaraje: false, kmInvalido: false, compraInvalida: false }, faltaAlgo: true }))
  const v = item(g, 'version')
  assert.equal(v?.estado, 'falta')
  assert.equal(v?.ancla, 'elegir-version-catalogo')
  assert.equal(v?.arriba, true)
  assert.equal(verificacionCompleta(g), false)
})

test('estado civil de una figura: ✗ con su nombre, y se arregla AQUÍ (no arriba)', () => {
  const g = gruposVerificacion(entrada({
    figuras: [{ rol: 'conductor_habitual', nombre: 'Luis', empresa: false, faltaCivil: true, carnet: 'no_aplica', enFicha: null, sinLeer: false, completa: false }],
    faltaAlgo: true,
  }))
  const c = item(g, 'conductor_habitual-civil')
  assert.equal(c?.estado, 'falta')
  assert.match(c?.texto ?? '', /Estado civil del conductor habitual \(Luis\)/)
  assert.equal(c?.ancla, 'cotizador-figura-conductor_habitual')
  assert.notEqual(c?.arriba, true)
})

test('figura incompleta sin causa concreta: ✗ genérico, nunca un ✓ falso', () => {
  const g = gruposVerificacion(entrada({
    figuras: [{ rol: 'propietario', nombre: null, empresa: false, faltaCivil: false, carnet: 'no_aplica', enFicha: null, sinLeer: false, completa: false }],
    faltaAlgo: true,
  }))
  assert.equal(item(g, 'propietario-incompleta')?.estado, 'falta')
  assert.equal(verificacionCompleta(g), false)
})

test('faltaAlgo sin ítem que lo recoja: no se da por completa', () => {
  assert.equal(verificacionCompleta(gruposVerificacion(entrada({ faltaAlgo: true }))), false)
})

test('años en la compañía o sin siniestros por encima de los años asegurado: ✗ (el vendor lo rechaza y se paga)', () => {
  const g1 = gruposVerificacion(entrada({ historial: { ...entrada().historial, companiaSuperaAsegurado: true } }))
  assert.equal(item(g1, 'compania-supera')?.estado, 'falta')
  assert.equal(item(g1, 'compania-supera')?.arriba, true)
  assert.equal(verificacionCompleta(g1), false)
  const g2 = gruposVerificacion(entrada({ historial: { ...entrada().historial, sinSiniestrosSuperaAsegurado: true } }))
  assert.equal(item(g2, 'sin-siniestros-supera')?.estado, 'falta')
  assert.equal(verificacionCompleta(g2), false)
})

test('sin seguro en vigor: aviso (precio estimado), no bloquea', () => {
  const g = gruposVerificacion(entrada({ historial: { ...entrada().historial, tieneSeguro: false } }))
  assert.equal(item(g, 'sin-seguro')?.estado, 'aviso')
  assert.equal(item(g, 'poliza'), undefined)
  assert.equal(verificacionCompleta(g), true)
})

test('con seguro: nº de póliza vacío es ✗; años asegurado se arreglan arriba («Historial y bonificaciones»)', () => {
  const g = gruposVerificacion(entrada({ historial: { ...entrada().historial, faltaPoliza: true, faltaAniosAsegurado: true }, faltaAlgo: true }))
  assert.equal(item(g, 'poliza')?.estado, 'falta')
  assert.equal(item(g, 'anios-asegurado')?.ancla, 'historial-riesgo')
})

test('fuente: el botón de pago exige la verificación y el texto viejo solo queda fuera de embebido', () => {
  assert.match(fuente, /const puedePulsarEmb = puedePulsar && \(!embebido \|\| verificacionOk\)/)
  assert.match(fuente, /onClick=\{\(\) => void cotizar\(\)\} disabled=\{!puedePulsarEmb\}/)
  assert.match(fuente, /\{faltaAlgo && !embebido && \(/)
  assert.match(fuente, /\{embebido && <Verificacion grupos=\{verificacion\} completa=\{verificacionOk\} \/>\}/)
})

test('fuente: en embebido, garaje / km / compra y años asegurado / en compañía son RESUMEN', () => {
  for (const e of ['¿Dónde duerme?', 'Kilómetros al año', 'Fecha de compra', 'Años asegurado sin interrupción', 'Años en esta compañía']) {
    assert.ok(fuente.includes(`<ResumenCampo\n`) && new RegExp(`<ResumenCampo\\s+etiqueta="${e.replace('?', '\\?')}"`).test(fuente), `falta el resumen de «${e}»`)
  }
})

test('las anclas a las que lleva la verificación existen en la pantalla del riesgo', () => {
  assert.match(op('DatosVehiculo.tsx'), /<section id="datos-vehiculo"/)
  assert.match(op('DatosVehiculo.tsx'), /<button id="elegir-version-catalogo"/)
  assert.match(op('FigurasRiesgo.tsx'), /<section id="intervinientes"/)
  assert.match(op('FigurasRiesgo.tsx'), /id=\{`interviniente-\$\{rol\}`\}/)
  assert.match(op('HistorialRiesgo.tsx'), /<section id="historial-riesgo"/)
})

test('orden de la pantalla del riesgo: intervinientes → objeto → historial → pedir precio', () => {
  const r = op('RiesgoPantalla.tsx')
  const pos = ['<FigurasRiesgo', '<DatosVehiculo', '<DatosRiesgo', '<HistorialRiesgo', 'id="pedir-precio"'].map((t) => r.indexOf(t))
  assert.ok(pos.every((p) => p >= 0))
  assert.ok(pos[0] < pos[1] && pos[1] < pos[2] && pos[2] < pos[3] && pos[3] < pos[4], `orden roto: ${pos.join(',')}`)
})

test('campos «sin ubicar» del tomador: aviso (!), no ✗, y no bloquean el botón (el servidor los rechaza sin coste)', () => {
  const base = entrada()
  const g = gruposVerificacion(entrada({ tomador: { ...base.tomador, sinUbicar: [{ campo: 'nacionalidad', motivo: 'sin ubicar' }] }, faltaAlgo: false }))
  assert.equal(item(g, 'tomador-otro-nacionalidad')?.estado, 'aviso')
  assert.equal(verificacionCompleta(g), true)
})

test('ficha del tomador que SÍ se arregla con «Editar datos»: sigue siendo ✗ y bloquea', () => {
  const base = entrada()
  const g = gruposVerificacion(entrada({ tomador: { ...base.tomador, enFicha: [{ campo: 'fecha de nacimiento', motivo: 'falta' }] }, faltaAlgo: true }))
  assert.equal(item(g, 'tomador-ficha-fecha de nacimiento')?.estado, 'falta')
  assert.equal(verificacionCompleta(g), false)
})
