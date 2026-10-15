// «Verificación antes de pedir precio» del cotizador auto EMBEBIDO en la oportunidad (13/10/2026).
// La lógica pura vive en `verificacion-embebido.ts` y se importa tal cual. Más cepos de fuente: el botón de pago exige
// la verificación, los datos de arriba van en resumen y el orden de la pantalla del riesgo
// (intervinientes → objeto → historial → pedir precio).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { avisoGarajeSinCasar, gruposVerificacion, notaAniosEnCompania, notaOrigen, rotuloVacioResumen, seguroActualEmbebido, verificacionCompleta, type GrupoVerificacion as Grupo } from './verificacion-embebido.ts'

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
  for (const e of ['¿Dónde duerme?', 'Kilómetros al año', 'Fecha de compra', 'Años asegurado sin interrupción', 'Años en esta compañía',
    '¿Tiene seguro ahora?', 'Compañía actual', 'Nº de póliza (van los 5 últimos)', 'Años sin siniestros', 'Siniestros en los últimos 5 años']) {
    assert.ok(fuente.includes(`<ResumenCampo\n`) && new RegExp(`<ResumenCampo\\s+etiqueta="${e.replace(/[?()]/g, '\\$&')}"`).test(fuente), `falta el resumen de «${e}»`)
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

// ── 13/10/2026: el seguro actual y los siniestros se declaran ARRIBA; aquí resumen y ✗ si falta lo que pide SINCO ──

const con = (h: Record<string, unknown>) => gruposVerificacion(entrada({ historial: { ...entrada().historial, ...h }, faltaAlgo: true }))

test('grupo 3: con seguro actual, sin compañía o sin los 5 dígitos = ✗ que lleva ARRIBA («Historial y bonificaciones»)', () => {
  for (const [campo, clave] of [['faltaCompania', 'compania'], ['faltaPoliza', 'poliza']] as const) {
    const g = con({ [campo]: true })
    assert.equal(item(g, clave)?.estado, 'falta', clave)
    assert.equal(item(g, clave)?.ancla, 'historial-riesgo', clave)
    assert.equal(item(g, clave)?.arriba, true, clave)
    assert.equal(verificacionCompleta(g), false, clave)
    assert.ok(g[2].items.some((i) => i.clave === clave), `${clave} va en el grupo 3`)
  }
  // Todo el grupo 3 se arregla arriba: ningún ítem lleva al cotizador.
  const g = con({ faltaAniosSinSiniestros: true, siniestros5Pendiente: true, sinSiniestrosSuperaAsegurado: true })
  for (const i of g[2].items) assert.equal(i.ancla, 'historial-riesgo', i.clave)
})

test('grupo 3: compañía declarada que no casa con la lista de Codeoscopic = ✗ con el porqué', () => {
  const g = con({ faltaCompania: true, companiaNoReconocida: 'La Mía Seguros' })
  assert.match(item(g, 'compania')?.nota ?? '', /«La Mía Seguros» no está en la lista/)
})

test('grupo 3: sin seguro no pide compañía ni póliza; «no se sabe» ≠ «no tiene»', () => {
  const no = con({ tieneSeguro: false })
  assert.equal(item(no, 'compania'), undefined)
  assert.equal(item(no, 'sin-seguro')?.texto, 'Sin seguro en vigor declarado')
  assert.equal(item(con({ tieneSeguro: false, tieneSeguroSinDato: true }), 'sin-seguro')?.texto, 'No consta si tiene seguro ahora')
})

const LEIDO = { tiene: true, companiaCodigo: 'C0072', companiaLibre: '', poliza: '999888777', aniosSinSiniestros: 10, siniestrosUltimos5: 0 }
const CODIGOS: Record<string, string> = { mapfre: 'C0058', reale: 'C0613', c0058: 'C0058' }
const codigoDe = (t: string) => CODIGOS[t.trim().toLowerCase()] ?? null

test('seguroActualEmbebido: lo declarado arriba MANDA; la póliza entera viaja como sus 5 últimos', () => {
  const r = seguroActualEmbebido({ arriba: { tieneSeguroActual: true, companiaActual: 'Mapfre', numeroPoliza: '4840402030 01', aniosSinSiniestros: 3, siniestrosUltimos5: 1 }, leido: LEIDO, conCatalogo: true, codigoDe })
  assert.equal(r.companiaCodigo, 'C0058')
  assert.equal(r.polizaDigitos, '02030', 'Mapfre: sin el sufijo de suplemento, los 5 últimos')
  assert.deepEqual([r.aniosSinSiniestros, r.siniestrosUltimos5], ['3', '1'])
  assert.deepEqual(r.origen, { tiene: 'arriba', compania: 'arriba', poliza: 'arriba', sinSiniestros: 'arriba', siniestros5: 'arriba' })
  assert.equal(notaOrigen(r.origen.poliza), undefined, 'lo de arriba no lleva la nota de «leído»')
})

test('seguroActualEmbebido: sin dato arriba, lo de siempre (lo leído) y se dice; 0 y false de arriba son dato', () => {
  const r = seguroActualEmbebido({ arriba: null, leido: LEIDO, conCatalogo: true, codigoDe })
  assert.deepEqual([r.tieneSeguroActual, r.companiaCodigo, r.polizaDigitos, r.aniosSinSiniestros, r.siniestrosUltimos5], [true, 'C0072', '88777', '10', '0'])
  assert.equal(r.origen.poliza, 'leido')
  assert.match(notaOrigen(r.origen.poliza) ?? '', /sin dato arriba/)
  const no = seguroActualEmbebido({ arriba: { tieneSeguroActual: false, aniosSinSiniestros: 0, siniestrosUltimos5: 0 }, leido: LEIDO, conCatalogo: true, codigoDe })
  assert.deepEqual([no.tieneSeguroActual, no.tieneSeguroSinDato, no.aniosSinSiniestros, no.siniestrosUltimos5], [false, false, '0', '0'])
  const nada = seguroActualEmbebido({ arriba: {}, leido: { ...LEIDO, tiene: false, companiaCodigo: '', poliza: '' }, conCatalogo: true, codigoDe })
  assert.deepEqual([nada.tieneSeguroActual, nada.tieneSeguroSinDato, nada.polizaDigitos], [false, true, ''])
})

test('seguroActualEmbebido: compañía que no casa = código vacío (✗) y se nombra; póliza corta = vacío (✗), nunca inventada', () => {
  const r = seguroActualEmbebido({ arriba: { tieneSeguroActual: true, companiaActual: 'La Mía', numeroPoliza: '12 34' }, leido: LEIDO, conCatalogo: true, codigoDe })
  assert.deepEqual([r.companiaCodigo, r.companiaNoReconocida, r.polizaDigitos], ['', 'La Mía', ''])
  const sinLista = seguroActualEmbebido({ arriba: { companiaActual: 'C0058' }, leido: LEIDO, conCatalogo: false, codigoDe })
  assert.deepEqual([sinLista.companiaCodigo, sinLista.companiaLibre, sinLista.companiaNoReconocida], ['', 'C0058', null])
})

test('fuente: el embebido toma el seguro actual de `seguroActualEmbebido` (lo de arriba), no de inputs propios', () => {
  assert.match(fuente, /const seguroArriba = embebido\s+\? seguroActualEmbebido\(\{\s+arriba: historialRiesgo,/)
  assert.match(fuente, /useState\(seguroArriba\?\.polizaDigitos \?\? seguroLeido\.poliza\)/)
  assert.match(fuente, /companiaNoReconocida: seguroArriba\?\.companiaNoReconocida \?\? null/)
  assert.match(op('PedirPrecioAuto.tsx'), /historialRiesgo=\{riesgo\.historial\?\.historialDeclarado \?\? null\}/)
})

test('resumen coherente con la checklist: lo que ella trata como aviso se pinta ámbar «Sin dato», no rojo «Falta»', () => {
  assert.deepEqual(rotuloVacioResumen('aviso'), { texto: 'Sin dato — complétalo arriba', color: 'var(--warning)' })
  assert.deepEqual(rotuloVacioResumen('falta'), { texto: 'Falta — complétalo arriba', color: 'var(--negative)' })
  // La checklist: «no consta si tiene seguro» y «siniestros en 5 años» son aviso…
  const sinDato = gruposVerificacion(entrada({ historial: { ...entrada().historial, tieneSeguro: false, tieneSeguroSinDato: true } }))
  assert.equal(item(sinDato, 'sin-seguro')?.estado, 'aviso')
  const s5 = gruposVerificacion(entrada({ historial: { ...entrada().historial, siniestros5Pendiente: true } }))
  assert.equal(item(s5, 'siniestros-5')?.estado, 'aviso')
  // …y el resumen de esos dos campos se pinta como aviso (un `ResumenCampo` por etiqueta, hasta el cierre `/>`).
  const bloque = (etiqueta: string) => {
    const i = fuente.indexOf(`etiqueta="${etiqueta}"`)
    assert.ok(i > 0, `falta el resumen «${etiqueta}»`)
    return fuente.slice(i, fuente.indexOf('/>', i))
  }
  for (const e of ['¿Tiene seguro ahora?', 'Siniestros en los últimos 5 años']) assert.match(bloque(e), /vacio="aviso"/, `«${e}» vacío no es «Falta» rojo`)
  // ResumenCampo usa el rótulo (no un «Falta» rojo fijo).
  const rc = fuente.slice(fuente.indexOf('function ResumenCampo('), fuente.indexOf('function Verificacion('))
  assert.match(rc, /rotuloVacioResumen\(vacio\)/)
  assert.doesNotMatch(rc, /Falta — complétalo arriba/)
})

// 15/10/2026: el riesgo dice «En la vía pública» y el catálogo no la trae → ✗ que lo DICE, y el pago no se enciende.
test('garaje del riesgo sin casar con el catálogo: ✗ con «El riesgo dice … elígelo» y verificación incompleta', () => {
  const g = gruposVerificacion(entrada({ vehiculo: { faltaVersion: false, faltaMatriculacion: false, faltaGaraje: true, garajeSinCasar: 'En la vía pública', kmInvalido: false, compraInvalida: false }, faltaAlgo: true }))
  const v = item(g, 'garaje')
  assert.equal(v?.estado, 'falta')
  assert.equal(v?.nota, avisoGarajeSinCasar('En la vía pública'))
  assert.match(v?.nota ?? '', /El riesgo dice «En la vía pública» pero no está en la lista de la compañía/)
  assert.equal(verificacionCompleta(g), false)
  // Elegido ya: ✓ y sin el aviso.
  const ok = item(gruposVerificacion(entrada({ vehiculo: { faltaVersion: false, faltaMatriculacion: false, faltaGaraje: false, garajeSinCasar: 'En la vía pública', kmInvalido: false, compraInvalida: false } })), 'garaje')
  assert.equal(ok?.estado, 'ok')
  assert.equal(ok?.nota, undefined)
  assert.match(avisoGarajeSinCasar('X'), /^El riesgo dice «X» pero no está en la lista de la compañía: elige el equivalente/)
  assert.match(avisoGarajeSinCasar('X'), /no tiene opción de calle, avisa a Alberto en vez de declarar un garaje/)
})

test('«Años en esta compañía» sin dato arriba: se dice SUPUESTO de los años asegurado, nunca «leído de su póliza»', () => {
  const n = notaAniosEnCompania('leido') ?? ''
  assert.match(n, /supuesto/)
  assert.match(n, /años asegurado/)
  assert.doesNotMatch(n, /leído de su póliza/)
  assert.equal(notaAniosEnCompania('arriba'), undefined)
  // Las dos pantallas la usan para ese campo (no la nota genérica de «lo leído»).
  assert.match(fuente, /etiqueta="Años en esta compañía"[\s\S]{0,200}notaAniosEnCompania\(/)
  assert.match(readFileSync(new URL('../moto-nuevo/CotizadorMoto.tsx', dir), 'utf8'), /etiqueta="Años en esta compañía"[\s\S]{0,200}notaAniosEnCompania\(/)
})
