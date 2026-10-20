// Guardián del vigía de silencio por compañía.
//
// 🚨 Los cuatro fixtures principales NO están inventados: son la medida real
// contra la BD del CRM el 05/09/2026 (ver la tabla del docstring del módulo).
// Es la regla del repo aplicada a un umbral: un baremo se calibra contra datos
// reales, no contra el caso que uno se imagina — escribir el fixture a mano es
// escribirlo con la misma suposición que el código.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  veredictoEntidad,
  silencioPorEntidad,
  motivosSilencio,
  MIN_HUECOS,
  SUELO_DIAS,
  type EntidadIngesta,
} from './silencio-entidad.ts'

/** Medido el 05/09/2026 contra `cima_ficheros` + `polizas` del CRM. */
const REAL: EntidadIngesta[] = [
  { entidad: 'C0058', diasSinFichero: 74, huecoMaximo: 2, huecosObservados: 2, vivas: 64, vencidasEnSilencio: 7, vencen90d: 12 },
  { entidad: 'C0109', diasSinFichero: 12, huecoMaximo: 19, huecosObservados: 13, vivas: 26, vencidasEnSilencio: 0, vencen90d: 5 },
  { entidad: 'C0613', diasSinFichero: 11, huecoMaximo: 23, huecosObservados: 1, vivas: 1, vencidasEnSilencio: 0, vencen90d: 0 },
  { entidad: 'C0468', diasSinFichero: 6, huecoMaximo: 9, huecosObservados: 24, vivas: 19, vencidasEnSilencio: 0, vencen90d: 0 },
]

test('sobre los datos REALES acusa a Mapfre y NO acusa a nadie más', () => {
  const r = silencioPorEntidad(REAL)!
  const porEntidad = Object.fromEntries(r.map(e => [e.entidad, e.veredicto]))
  assert.equal(porEntidad['C0058'], 'silencio', 'Mapfre: 74 días con su récord en 2')
  assert.equal(porEntidad['C0109'], 'ok', 'Allianz: 12 días dentro de su hueco de 19')
  assert.equal(porEntidad['C0468'], 'ok', 'Occident: 6 días dentro de su hueco de 9')
  // Reale manda cada 23 días y solo tiene UN hueco observado: no se puede
  // juzgar. Decir «ok» sería absolver sin haber mirado.
  assert.equal(porEntidad['C0613'], 'sin_base')
})

test('el silencio va primero en la lista, y las carteras grandes antes', () => {
  const r = silencioPorEntidad(REAL)!
  assert.equal(r[0].entidad, 'C0058')
})

// 🚨 Este es el test que fija la calibración de MIN_HUECOS. Mapfre tiene solo
// DOS huecos observados (sus 14 ficheros se agolpan en pocos días); exigir tres
// habría dejado mudo justo el caso que motivó el módulo.
test('MIN_HUECOS no puede subir por encima de la muestra de Mapfre', () => {
  assert.ok(MIN_HUECOS <= 2, 'con MIN_HUECOS=3 el caso fundacional no habría saltado')
})

test('la renovación perdida alarma SIN necesidad de baremo', () => {
  // Sin histórico utilizable, pero con una pérdida medida: es un hecho, no una
  // inferencia, y no puede quedar tapado por «no tengo muestra».
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: 40, huecoMaximo: null, huecosObservados: 0,
    vivas: 3, vencidasEnSilencio: 2, vencen90d: null,
  })
  assert.equal(v.veredicto, 'silencio')
  assert.match(v.motivos.join(' '), /2 renovación/)
})

test('sin muestra y sin pérdida NO se absuelve: es «sin_base», nunca «ok»', () => {
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: 40, huecoMaximo: null, huecosObservados: 0,
    vivas: 3, vencidasEnSilencio: 0, vencen90d: null,
  })
  assert.equal(v.veredicto, 'sin_base')
  assert.ok(v.motivos.length > 0, 'un hueco de conocimiento tiene que decirse')
})

test('`vencidasEnSilencio: null` (no comprobado) NO cuenta como pérdida', () => {
  // Es la regla NULL≠0 por su lado peligroso: un `null` tratado como «hay
  // pérdida» convertiría cada consulta caída en una alarma, y el vigía se
  // silenciaría solo en una semana.
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: 5, huecoMaximo: 9, huecosObservados: 24,
    vivas: 19, vencidasEnSilencio: null, vencen90d: null,
  })
  assert.equal(v.veredicto, 'ok')
})

test('el suelo de días impide que un puente sea una avería', () => {
  // Manda a diario (hueco máximo 1) y lleva 5 días callada: 5 > 1×2, pero por
  // debajo del suelo no se alarma.
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: SUELO_DIAS - 1, huecoMaximo: 1, huecosObservados: 30,
    vivas: 10, vencidasEnSilencio: 0, vencen90d: 0,
  })
  assert.equal(v.veredicto, 'ok')
  const w = veredictoEntidad({ ...v, diasSinFichero: SUELO_DIAS })
  assert.equal(w.veredicto, 'silencio')
})

test('la que no ha mandado nunca no se confunde con la que se ha callado', () => {
  const v = veredictoEntidad({
    entidad: 'C0072', diasSinFichero: null, huecoMaximo: null, huecosObservados: 0,
    vivas: 0, vencidasEnSilencio: null, vencen90d: null,
  })
  assert.equal(v.veredicto, 'nunca')
})

test('la lista a null es «no se ha podido mirar», jamás «todas bien»', () => {
  assert.equal(silencioPorEntidad(null), null)
  const m = motivosSilencio(null)
  assert.equal(m.length, 1)
  assert.match(m[0], /No se ha podido comprobar/)
})

test('los motivos NO enumeran a las compañías sanas', () => {
  const m = motivosSilencio(silencioPorEntidad(REAL))
  assert.ok(!m.some(x => x.includes('C0468')), 'Occident está bien: no genera línea')
  assert.ok(m.some(x => x.includes('C0058')), 'Mapfre sí')
  assert.ok(m.some(x => x.includes('C0613')), 'y el hueco de conocimiento de Reale también')
})

test('el aviso de Mapfre dice el tamaño de la cartera y lo que viene', () => {
  const texto = veredictoEntidad(REAL[0]).motivos.join(' · ')
  assert.match(texto, /64 póliza/)
  assert.match(texto, /12 más vencen en 90 días/)
  assert.match(texto, /su mayor hueco hasta ahora eran 2/)
})

// --- Las renovaciones sin llegar NO son «ha dejado de mandar» ------------------
// Caso Mapfre real (05/10/2026): último fichero hace 4 días y una póliza que
// vence hoy. Eso es una renovación pendiente (se avisa en «renovaciones sin
// llegar»), no una compañía muda.

test('Mapfre: último fichero hace 4 días + 1 póliza vence hoy → NO es silencio', () => {
  const v = veredictoEntidad({
    entidad: 'C0058', diasSinFichero: 4, huecoMaximo: 2, huecosObservados: 5,
    vivas: 64, vencidasEnSilencio: 1, vencen90d: 12,
  })
  assert.equal(v.veredicto, 'ok')
})

test('fichero reciente (< suelo) sin histórico + vencidas → NO es silencio', () => {
  const v = veredictoEntidad({
    entidad: 'C0058', diasSinFichero: SUELO_DIAS - 1, huecoMaximo: null, huecosObservados: 0,
    vivas: 64, vencidasEnSilencio: 3, vencen90d: null,
  })
  assert.notEqual(v.veredicto, 'silencio')
})

test('con histórico, ≥ suelo pero dentro de su ritmo + vencidas → NO es silencio (decide el ritmo)', () => {
  const v = veredictoEntidad({
    entidad: 'C0109', diasSinFichero: 20, huecoMaximo: 19, huecosObservados: 13,
    vivas: 26, vencidasEnSilencio: 2, vencen90d: 5,
  })
  assert.equal(v.veredicto, 'ok')
})

test('20 días sin fichero, sin histórico y con vencidas → SIGUE siendo silencio (conservador)', () => {
  const v = veredictoEntidad({
    entidad: 'C0999', diasSinFichero: 20, huecoMaximo: null, huecosObservados: 0,
    vivas: 3, vencidasEnSilencio: 2, vencen90d: null,
  })
  assert.equal(v.veredicto, 'silencio')
})

test('el ritmo roto sigue alarmando aunque no haya vencidas', () => {
  const v = veredictoEntidad({
    entidad: 'C0058', diasSinFichero: 30, huecoMaximo: 2, huecosObservados: 5,
    vivas: 64, vencidasEnSilencio: 0, vencen90d: 0,
  })
  assert.equal(v.veredicto, 'silencio')
})

// ── Baremo por hueco TÍPICO (20/10/2026) ─────────────────────────────────────
// Huecos APROXIMADOS medidos: el máximo de Reale (48) y Allianz (46) lo puso el
// alta; su ritmo normal es de pocos días. Mapfre tiene 94 d de máximo.
import {
  umbralSilencio, ACCION_SILENCIO, DIAS_RENOVACION_RIESGO,
} from './silencio-entidad.ts'

const REALE: EntidadIngesta = {
  entidad: 'C0613', diasSinFichero: 21, huecoMaximo: 48, huecoMediano: 6, huecosObservados: 5,
  vivas: 3, vencidasEnSilencio: 0, vencen90d: 1, vencen30d: 0,
}
const ALLIANZ: EntidadIngesta = {
  entidad: 'C0109', nombre: 'Allianz', diasSinFichero: 16, huecoMaximo: 46, huecoMediano: 4, huecosObservados: 14,
  vivas: 26, vencidasEnSilencio: 0, vencen90d: 9, vencen30d: 4,
}
const GENERALI: EntidadIngesta = {
  entidad: 'C0735', diasSinFichero: 9, huecoMaximo: 20, huecoMediano: 7, huecosObservados: 10,
  vivas: 8, vencidasEnSilencio: 0, vencen90d: 2, vencen30d: 1,
}
const MAPFRE: EntidadIngesta = {
  entidad: 'C0058', diasSinFichero: 40, huecoMaximo: 94, huecoMediano: 3, huecosObservados: 9,
  vivas: 64, vencidasEnSilencio: 0, vencen90d: 12, vencen30d: 5,
}

test('mediana: Reale y Allianz, cuyo máximo lo puso el alta, SÍ saltan', () => {
  assert.equal(veredictoEntidad(REALE).veredicto, 'silencio', '21 d > max(14, 2×6)')
  assert.equal(veredictoEntidad(ALLIANZ).veredicto, 'silencio', '16 d > max(14, 2×4)')
  // Con el baremo viejo (máximo) ninguna de las dos habría saltado:
  const viejo = (e: EntidadIngesta) => veredictoEntidad({ ...e, huecoMediano: undefined }).veredicto
  assert.equal(viejo(REALE), 'ok')
  assert.equal(viejo(ALLIANZ), 'ok')
})

test('mediana: Generali dentro de su ritmo no salta; Mapfre con máximo 94 sí', () => {
  assert.equal(veredictoEntidad(GENERALI).veredicto, 'ok')
  assert.equal(veredictoEntidad(MAPFRE).veredicto, 'silencio')
})

test('el umbral es max(SUELO, FACTOR × mediana): el suelo protege un ritmo muy apretado', () => {
  assert.equal(umbralSilencio({ huecoMaximo: 9, huecoMediano: 1, huecosObservados: 5 }), SUELO_DIAS)
  assert.equal(umbralSilencio({ huecoMaximo: 99, huecoMediano: 10, huecosObservados: 5 }), 20)
  // 13 días con mediana 1: puente, no avería.
  assert.equal(veredictoEntidad({ ...GENERALI, diasSinFichero: 13, huecoMediano: 1 }).veredicto, 'ok')
})

test('huecoMediano undefined (asegura vieja) o null cae al baremo del máximo', () => {
  const sinCampo = { ...ALLIANZ } as Partial<EntidadIngesta>
  delete sinCampo.huecoMediano
  assert.equal(veredictoEntidad(sinCampo as EntidadIngesta).veredicto, 'ok', 'comportamiento actual: 16 < 2×46')
  assert.equal(veredictoEntidad({ ...ALLIANZ, huecoMediano: null }).veredicto, 'ok')
  assert.equal(veredictoEntidad({ ...ALLIANZ, diasSinFichero: 100, huecoMediano: undefined }).veredicto, 'silencio')
  assert.equal(umbralSilencio({ huecoMaximo: 46, huecosObservados: 5 }), 92, 'undefined ≠ 0')
  assert.equal(umbralSilencio({ huecoMaximo: 46, huecoMediano: null, huecosObservados: 5 }), 92, 'null ≠ 0')
  // Con mediana 0 (días pegados) el número 0 SÍ cuenta: no es «ausente».
  assert.equal(umbralSilencio({ huecoMaximo: 30, huecoMediano: 0, huecosObservados: 3 }), SUELO_DIAS)
})

test('sin muestra suficiente la mediana no absuelve ni acusa: sin_base', () => {
  assert.equal(veredictoEntidad({ ...REALE, huecosObservados: 1 }).veredicto, 'sin_base')
})

test('renovaciones en riesgo: solo con silencio, con recuento y compañía, sin PII', () => {
  const a = veredictoEntidad(ALLIANZ)
  assert.equal(a.renovacionesEnRiesgo, 4)
  assert.match(a.motivos.join(' | '), new RegExp(`Allianz: 4 pólizas vencen en ≤${DIAS_RENOVACION_RIESGO} d y lleva 16 d sin mandar`))
  // Sin silencio no se informa ni se avisa.
  const g = veredictoEntidad(GENERALI)
  assert.equal(g.renovacionesEnRiesgo, undefined)
  assert.doesNotMatch(g.motivos.join(' '), /vencen? en ≤/)
  // Con 0 no hay motivo.
  const r = veredictoEntidad(REALE)
  assert.equal(r.renovacionesEnRiesgo, 0)
  assert.doesNotMatch(r.motivos.join(' '), /vencen? en ≤/)
  // Singular.
  assert.match(veredictoEntidad({ ...ALLIANZ, vencen30d: 1 }).motivos.join(' '), /1 póliza vence en ≤30 d/)
})

test('renovaciones en riesgo: undefined ≠ null ≠ 0', () => {
  const sin = { ...ALLIANZ } as Partial<EntidadIngesta>
  delete sin.vencen30d
  assert.equal('renovacionesEnRiesgo' in veredictoEntidad(sin as EntidadIngesta), false)
  const nulo = veredictoEntidad({ ...ALLIANZ, vencen30d: null })
  assert.equal(nulo.renovacionesEnRiesgo, null)
  assert.doesNotMatch(nulo.motivos.join(' '), /vencen? en ≤/)
})

test('acción sugerida: una sola línea fija por aviso con silencio, y ninguna sin él', () => {
  const dos = motivosSilencio(silencioPorEntidad([ALLIANZ, REALE])!)
  assert.equal(dos.filter(m => m === ACCION_SILENCIO).length, 1)
  assert.match(ACCION_SILENCIO, /^Qué hacer: baja «Ficheros recibidos» del Portal CIMA filtrado por la compañía/)
  assert.equal(motivosSilencio(silencioPorEntidad([GENERALI])!).includes(ACCION_SILENCIO), false)
  assert.equal(motivosSilencio(silencioPorEntidad([{ ...GENERALI, huecosObservados: 0, huecoMaximo: null, huecoMediano: null }])!).includes(ACCION_SILENCIO), false)
})
