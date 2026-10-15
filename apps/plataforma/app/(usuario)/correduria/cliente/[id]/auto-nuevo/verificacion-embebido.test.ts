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

// 15/10/2026: cada dato aparece UNA vez en la página. En embebido el cotizador ya NO repite en resumen lo de arriba
// (vehículo, personas, historial): solo lo propio de la cotización + la verificación compacta (con «Editar arriba»).
test('fuente: en embebido no se repite lo de arriba; los campos propios de la cotización siguen existiendo', () => {
  assert.doesNotMatch(fuente, /<ResumenCampo\b/, 'ningún resumen de lo de arriba en el cotizador de coche')
  assert.doesNotMatch(fuente, /function (IrA|ResumenCampo|Verificacion)\(/, 'sin copias locales: las de piezas-embebido')
  assert.match(fuente, /import \{ Verificacion \} from '\.\/piezas-embebido'/)
  assert.doesNotMatch(fuente, /1 · Condiciones del coche|Propietario y conductores/, 'las secciones duplicadas no vuelven')
  // «1 · El vehículo» solo en la pantalla completa (sin oportunidad arriba sigue viéndose todo).
  assert.match(fuente, /\{!embebido && \(\n\s*<div style=\{cardStyle\}>\n\s*<CardHeader\n\s*title="1 · El vehículo"/)
  // Lo que solo existe aquí sigue existiendo (y en embebido, dentro de «Condiciones de esta cotización»).
  for (const e of ['Fecha de efecto', 'Remolque ligero (< 750 kg)', 'Matrícula de esa póliza', 'Estado civil', 'Municipio', 'Carnet expedido en', 'Tipo de carnet']) {
    assert.ok(fuente.includes(`etiqueta="${e}"`), `falta el campo «${e}»`)
  }
  const emb = fuente.slice(fuente.indexOf('title="1 · Condiciones de esta cotización"'), fuente.indexOf('{/* Embebido (oportunidad): sin pack'))
  assert.match(emb, /\{campoEfecto\}\s*\n\s*\{campoRemolque\}/)
  assert.match(emb, /<div id="cotizador-tomador"/)
  assert.match(emb, /<div key=\{rol\} id=\{anclaFiguraAqui\(rol\)\}>\s*\n\s*<BloqueFigura [\s\S]{0,300}soloCondiciones \/>/, 'estado civil y carné de las figuras de otras fichas')
  assert.match(emb, /<div id="cotizador-seguro-actual" style=\{SUBSECCION\}>[\s\S]{0,900}\{campoMatriculaAnterior\}[\s\S]{0,300}<PanelSeguroImputado /)
})

test('verificación: dice con qué se cotiza cada dato (la nota de `valoresQueViajan`), sin tapar las notas propias', () => {
  const g = gruposVerificacion(entrada({ detalle: { km: 'Sin dato · se cotizará con 10.000 km (supuesto)', garaje: 'X', 'anios-compania': 'Sin dato · se cotizará con 3 años (supuesto)' } }))
  assert.equal(item(g, 'km')?.nota, 'Sin dato · se cotizará con 10.000 km (supuesto)')
  assert.equal(item(g, 'anios-compania')?.nota, 'Sin dato · se cotizará con 3 años (supuesto)')
  const sinCasar = gruposVerificacion(entrada({ vehiculo: { faltaVersion: false, faltaMatriculacion: false, faltaGaraje: true, garajeSinCasar: 'En la vía pública', kmInvalido: false, compraInvalida: false }, faltaAlgo: true, detalle: { garaje: 'otra cosa' } }))
  assert.equal(item(sinCasar, 'garaje')?.nota, 'El riesgo dice «En la vía pública» pero no está en la lista de la compañía: elige el equivalente. Si la lista no tiene opción de calle, avisa a Alberto en vez de declarar un garaje', 'la nota propia manda')
  assert.match(fuente, /'anios-compania': viajan\.aniosEnCompania\.nota,/)
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

test('fuente: el embebido toma el seguro actual de lo de arriba (`valoresQueViajan` → `seguroActualEmbebido`), no de inputs propios', () => {
  assert.match(fuente, /historialDeclarado: embebido \? historialRiesgo : null/)
  assert.match(fuente, /useState\(ini\.polizaActualDigitos\)/)
  assert.match(fuente, /companiaNoReconocida: viajan\.compania\.noReconocida,/)
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
  // ResumenCampo (el de `piezas-embebido`, que usa moto; auto ya no repite lo de arriba) usa el rótulo, no un «Falta» rojo fijo.
  const piezas = readFileSync(new URL('./piezas-embebido.tsx', dir), 'utf8')
  const rc = piezas.slice(piezas.indexOf('export function ResumenCampo('), piezas.indexOf('export function Verificacion('))
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
  // Moto la usa para ese campo (no la nota genérica de «lo leído»); auto, desde el 15/10/2026, la nota de la fuente única
  // (`valoresQueViajan`: «Sin dato · se cotizará con N años, los años asegurado como mucho 10 (supuesto)») en la verificación.
  assert.match(fuente, /'anios-compania': viajan\.aniosEnCompania\.nota,/)
  assert.match(readFileSync(new URL('../moto-nuevo/CotizadorMoto.tsx', dir), 'utf8'), /etiqueta="Años en esta compañía"[\s\S]{0,200}notaAniosEnCompania\(/)
})

// ── Conductor ocasional en tres estados (15/10/2026) ─────────────────────────────────────────────────────────────────
test('ocasional SIN PREGUNTAR: ✗ «¿Conduce alguien más el coche?» (art. 10 LCS), lleva a Intervinientes y apaga el pago', () => {
  const g = gruposVerificacion(entrada({ ocasional: 'sin_preguntar' }))
  const i = item(g, 'ocasional-sin-preguntar')
  assert.equal(i?.estado, 'falta')
  assert.match(i?.texto ?? '', /¿Conduce alguien más el coche\?/)
  assert.match(i?.texto ?? '', /art\. 10 LCS/)
  assert.equal(i?.ancla, 'interviniente-conductor_ocasional')
  assert.equal(i?.arriba, true)
  assert.equal(verificacionCompleta(g), false)
})

test('ocasional confirmado «ninguno»: ✓ y no bloquea; con ficha o sin el dato (pantalla completa), sin ítem propio', () => {
  const n = gruposVerificacion(entrada({ ocasional: 'ninguno' }))
  assert.equal(item(n, 'ocasional-ninguno')?.estado, 'ok')
  assert.equal(verificacionCompleta(n), true)
  for (const o of ['si', 'no_aplica', undefined]) {
    const g = gruposVerificacion(entrada({ ocasional: o }))
    assert.equal(item(g, 'ocasional-sin-preguntar'), undefined, String(o))
    assert.equal(verificacionCompleta(g), true, String(o))
  }
})

test('moto comparte la verificación pero no tiene ocasional: «sin preguntar» no le pone ✗', () => {
  const g = gruposVerificacion(entrada({ ramo: 'moto', ocasional: 'sin_preguntar' }))
  assert.equal(item(g, 'ocasional-sin-preguntar'), undefined)
  assert.equal(verificacionCompleta(g), true)
})

test('cepo de fuente: el embebido pasa el estado del ocasional del RIESGO a la verificación', () => {
  assert.match(fuente, /ocasional: ocasionalRiesgo,/, 'AutoNuevo debe pasar `ocasional` a gruposVerificacion')
  assert.match(op('PedirPrecioAuto.tsx'), /ocasionalRiesgo=\{estadoOcasional\(riesgo\)\}/, 'PedirPrecioAuto debe pasar el estado del ocasional')
})

test('siniestros en 5 años sin dato con < 5 años sin siniestros: ✗ «Sin dato no se puede declarar 0» y apaga el pago', () => {
  const g = gruposVerificacion(entrada({ historial: { ...entrada().historial, siniestros5SinDato: true, siniestros5Pendiente: true } }))
  const s5 = g.flatMap((x) => x.items).filter((i) => i.clave === 'siniestros-5')
  assert.equal(s5.length, 1, 'un solo ítem: el ✗ manda sobre el aviso')
  assert.equal(s5[0]!.estado, 'falta')
  assert.match(s5[0]!.texto, /¿Cuántos siniestros en los últimos 5 años\? Sin dato no se puede declarar 0/)
  assert.equal(verificacionCompleta(g), false)
  // Cepo de fuente: el cotizador bloquea con el dato vacío aunque los años sin siniestros igualen a los asegurados.
  assert.match(fuente, /const siniestros5SinDato = aniosSinSiniestros\.trim\(\) !== '' && Number\(aniosSinSiniestros\) < 5 && siniestrosUltimos5\.trim\(\) === ''/)
  assert.match(fuente, /\|\| siniestros5SinDato\n/)
})
