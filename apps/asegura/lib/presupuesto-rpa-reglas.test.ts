// Cepos del presupuesto en BORRADOR tras el tarificador RPA (18/10/2026). `node --test`. Datos inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACTOR_RPA, AVISO_OPCION_RPA, MAX_LLAMADAS_IA_24H, avisosOpcionRpa, claveRpaDeFila, decidirDisparo, decidirIaAuto, enlaceOportunidad,
  filaOfertaRpa, garantiasRpa, mismoConjunto, nombreDePila, ofertasDeRespuesta, rangoPrimas, sobreCoberturasRpa, textoAvisoPresupuestoRpa,
  borradorTocado, decidirSustitucion, repartirAvisos, textoAvisoCorteRpa,
} from './presupuesto-rpa-reglas.ts'
import { coberturasDeSobre } from './codeoscopic/coberturas-presupuesto.ts'

const AHORA = new Date().toISOString()
const TAR = '22222222-2222-4222-8222-222222222222'
const JOB = '33333333-3333-4333-8333-333333333333'
const DOC = '44444444-4444-4444-8444-444444444444'

const oferta = (extra: Record<string, unknown> = {}) => ({
  compania: 'Compañía Uno', producto: 'Auto · Terceros', primaAnualEur: 400.5, primaNetaEur: null, fraccionamiento: 'anual', importeReciboEur: 400.5,
  coberturas: [
    { clave: 'Daños propios', literal: 'Daños propios', estado: 'excluida', capital: null, limite: null, franquicia: null },
    { clave: 'rc_obligatoria', literal: 'RC obligatoria', estado: 'incluida', capital: null, limite: 1_000_000, franquicia: null },
    { clave: 'Asistencia', literal: 'Asistencia en viaje', estado: null, capital: null, limite: null, franquicia: null },
  ],
  franquicias: [], validaHasta: null, referenciaPortal: null, avisos: ['Precio con supuestos: conductor ocasional no declarado', 'Aviso de la compañía'],
  ...extra,
})

test('coberturas RPA → sobre que entiende coberturasDeSobre: excluida = no cubre, incluida = cubre, sin estado = no consta', () => {
  const s = sobreCoberturasRpa(oferta().coberturas, AHORA)
  assert.ok(s)
  assert.equal(s.estado, 'leidas')
  const l = coberturasDeSobre(s).lista!
  assert.deepEqual(l.map((c) => [c.nombre, c.incluida]), [['Daños propios', false], ['RC obligatoria', true], ['Asistencia en viaje', null]])
  assert.equal(l[1].texto, 'Límite 1.000.000,00€', 'dinero en formato español')
})

test('sin coberturas legibles → NULL (no consta), NUNCA un sobre «vacias» que diría «no cubre nada»', () => {
  for (const v of [[], null, undefined, 'x', [{ estado: 'incluida' }]]) {
    assert.equal(sobreCoberturasRpa(v, AHORA), null, JSON.stringify(v))
  }
  // Ninguna línea dice si cubre o no → no constan (no una lista «leída» de puros «no consta»).
  assert.equal(sobreCoberturasRpa([{ literal: 'Asistencia', estado: null, capital: 300, limite: null, franquicia: null }, { literal: 'Lunas', estado: null }], AHORA), null)
  // Y lo que queda en la columna (default `[]` desnudo) se lee como «no constan», no como lista vacía.
  assert.equal(coberturasDeSobre([]).lista, null)
})

test('garantías: sin coberturas → null (no constan), nunca {} («leída sin garantías»)', () => {
  const v = ofertasDeRespuesta({ ofertas: [oferta({ coberturas: [] })] }, { tarificacionId: TAR, trabajoId: JOB })!
  assert.equal(garantiasRpa(v[0].oferta), null)
  const f = filaOfertaRpa(v[0])
  assert.equal(f.garantias, null)
  assert.equal(f.datosExtra.coberturasNoConstan, true)
  const c = ofertasDeRespuesta({ ofertas: [oferta()] }, { tarificacionId: TAR, trabajoId: JOB })!
  assert.deepEqual((garantiasRpa(c[0].oferta) as Record<string, { estado: unknown }>)['Daños propios'].estado, 'excluida')
})

test('respuesta guardada → ofertas revalidadas con clave tarificación:índice; una mala descarta la tarificación entera', () => {
  const v = ofertasDeRespuesta({ ofertas: [oferta({ documentoId: DOC, pdf: { indice: 3 } }), oferta({ producto: 'Auto · Todo riesgo', primaAnualEur: 900 })] }, { tarificacionId: TAR, trabajoId: JOB })
  assert.ok(v)
  assert.deepEqual(v.map((x) => x.clave), [`${TAR}:0`, `${TAR}:1`])
  assert.equal(v[0].documentoId, DOC)
  assert.equal(v[1].documentoId, null)
  assert.equal(ofertasDeRespuesta({ ofertas: [oferta(), oferta({ primaAnualEur: 0 })] }, { tarificacionId: TAR, trabajoId: JOB }), null)
  assert.equal(ofertasDeRespuesta({ ofertas: [] }, { tarificacionId: TAR, trabajoId: JOB }), null)
  assert.equal(ofertasDeRespuesta(null, { tarificacionId: TAR, trabajoId: JOB }), null)
})

test('los supuestos viajan como AVISO (y aparte en datos_extra.supuestos), nunca como dato', () => {
  const v = ofertasDeRespuesta({ ofertas: [oferta()] }, { tarificacionId: TAR, trabajoId: JOB })!
  const f = filaOfertaRpa(v[0])
  assert.deepEqual(f.datosExtra.supuestos, ['Precio con supuestos: conductor ocasional no declarado'])
  assert.equal(f.datosExtra.origen, 'rpa')
  assert.equal(claveRpaDeFila(f.datosExtra), `${TAR}:0`)
  assert.equal(claveRpaDeFila({ rpaClave: 'x' }), null, 'una oferta subida a mano no es del bot')
  const a = avisosOpcionRpa(v[0].oferta.avisos)
  assert.equal(a[0], AVISO_OPCION_RPA)
  assert.ok(a.includes('Precio con supuestos: conductor ocasional no declarado'))
  assert.ok(!a.includes('Aviso de la compañía'), 'un aviso crudo del bot no llega al texto visible')
  assert.deepEqual(f.datosExtra.avisosInternos, ['Aviso de la compañía'])
})

test('avisos al cliente: solo supuestos con su formato exacto y la lista permitida; el resto, notas internas', () => {
  const r = repartirAvisos([
    'Precio con supuestos: uso diario, garaje colectivo.',
    'precio con supuestos sin formato',
    'Compañía Dos exige la verificación del vehículo antes de contratar este producto.',
    'Vehículo según el catálogo de Compañía Dos: MARCA MODELO 1.0 GASOLINA.',
    'Versión elegida por similitud con el vehículo confirmado en Compañía Dos (CV ±10 %, CC ±5 %), no por coincidencia exacta.',
    'El portal muestra un aviso en el título del paquete (icono de advertencia; texto no leído).',
    'coberturas no leídas',
    '  ',
  ])
  assert.equal(r.cliente.length, 4)
  assert.deepEqual(r.internos, ['precio con supuestos sin formato', 'El portal muestra un aviso en el título del paquete (icono de advertencia; texto no leído).', 'coberturas no leídas'])
})

test('borrador del bot tocado por Alberto: ocultas, necesidades escritas, cualquier evento suyo; lo del propio bot no cuenta', () => {
  const bot = [{ tipo: 'preparado', origen: 'sistema', detalle: {} }, { tipo: 'necesidades', origen: 'corredor', detalle: { deducido: true } }]
  assert.equal(borradorTocado({ ocultas: 0, eventos: bot }), false)
  assert.equal(borradorTocado({ ocultas: 1, eventos: bot }), true)
  assert.equal(borradorTocado({ ocultas: 0, eventos: [...bot, { tipo: 'necesidades', origen: 'corredor', detalle: { antes: 'escrito' } }] }), true)
  assert.equal(borradorTocado({ ocultas: 0, eventos: [...bot, { tipo: 'documento_descargado', origen: 'corredor', detalle: null }] }), true)
  assert.equal(borradorTocado({ ocultas: 0, eventos: [{ tipo: 'preparado', origen: 'corredor', detalle: {} }] }), true, 'un preparado que no es del sistema, ante la duda, tocado')
})

test('sustitución bajo cerrojo: retira lo intacto, conserva lo tocado y, si hay uno MÁS NUEVO que esta ejecución, abandona', () => {
  const inicio = new Date(Date.now() - 60_000)
  const antes = new Date(inicio.getTime() - 3_600_000)
  const intacto = { id: 'a', creadoAt: antes, ocultas: 0, eventos: [{ tipo: 'preparado', origen: 'sistema', detalle: {} }] }
  const tocado = { id: 'b', creadoAt: antes, ocultas: 2, eventos: [] }
  assert.deepEqual(decidirSustitucion(inicio, [intacto, tocado]), { accion: 'crear', retirar: ['a'], conservar: ['b'] })
  assert.deepEqual(decidirSustitucion(inicio, []), { accion: 'crear', retirar: [], conservar: [] })
  const nuevo = { ...intacto, id: 'c', creadoAt: new Date(inicio.getTime() + 1) }
  assert.deepEqual(decidirSustitucion(inicio, [intacto, nuevo]), { accion: 'abandonar' })
  assert.equal(decidirSustitucion(inicio, [{ ...intacto, creadoAt: inicio }]).accion, 'crear', 'el mismo instante no es «más nuevo»')
})

test('Telegram de corte: caducada o todas descartadas, con «Sin leer»; y el de creado dice sin leer y conservados', () => {
  const base = { cliente: 'Lucía', referencia: 'OP-1', ramo: 'auto', enlace: 'https://plataforma.test/correduria/oportunidad/x' }
  const c = textoAvisoCorteRpa({ ...base, motivo: 'caducada', companias: ['Compañía Uno'], sinLeer: ['Compañía Tres'] })
  assert.match(c, /Sin presupuesto/)
  assert.match(c, /la oferta de Compañía Uno ya ha caducado/)
  assert.match(c, /Sin leer: Compañía Tres\./)
  assert.match(c, /correduria\/oportunidad\/x/)
  const d = textoAvisoCorteRpa({ ...base, motivo: 'todas_descartadas' })
  assert.match(d, /todas las ofertas del bot están descartadas/)
  assert.doesNotMatch(d, /Sin leer/)
  const t = textoAvisoPresupuestoRpa({ ...base, companias: ['Compañía Uno'], primas: [100], narrativa: 'ia', sinIa: null, sinLeer: ['Compañía Tres'], conservados: 1 })
  assert.match(t, /Sin leer: Compañía Tres \(no entran en el borrador\)/)
  assert.match(t, /otro borrador del bot que ya habías tocado: lo dejo/)
  assert.doesNotMatch(textoAvisoPresupuestoRpa({ ...base, companias: [], primas: [100], narrativa: 'ia', sinIa: null }), /Sin leer|ya habías tocado/)
})

test('disparo: solo sin trabajos de tarificar abiertos y con al menos un ok con tarificación', () => {
  const ok = { estado: 'ok', modo: 'tarificar', tarificacionId: TAR }
  assert.deepEqual(decidirDisparo([ok, { estado: 'error_definitivo', modo: null, tarificacionId: null }]), { disparar: true })
  for (const abierto of ['pendiente', 'en_curso', 'error_reintentable']) {
    assert.deepEqual(decidirDisparo([ok, { estado: abierto, modo: null, tarificacionId: null }]), { disparar: false, motivo: 'abiertos' }, abierto)
  }
  // Una exploración o un humo en curso no son tarificaciones: no frenan.
  assert.deepEqual(decidirDisparo([ok, { estado: 'en_curso', modo: 'exploracion', tarificacionId: null }]), { disparar: true })
  assert.deepEqual(decidirDisparo([{ estado: 'ok', modo: 'humo', tarificacionId: null }]), { disparar: false, motivo: 'sin_ok' })
  assert.deepEqual(decidirDisparo([{ estado: 'atascado', modo: null, tarificacionId: null }, ok]), { disparar: true })
})

test('tope de la IA: 12 llamadas o 0,50 € estimados en 24 h; contar mal = no se llama', () => {
  assert.deepEqual(decidirIaAuto({ llamadas24h: 0, eur24h: 0 }), { usar: true })
  assert.deepEqual(decidirIaAuto({ llamadas24h: MAX_LLAMADAS_IA_24H - 1, eur24h: 0.2 }), { usar: true })
  assert.equal(decidirIaAuto({ llamadas24h: MAX_LLAMADAS_IA_24H, eur24h: 0 }).usar, false)
  assert.equal(decidirIaAuto({ llamadas24h: 2, eur24h: 0.45 }).usar, true, '0,45 + 0,05 = 0,50: aún cabe')
  assert.equal(decidirIaAuto({ llamadas24h: 2, eur24h: 0.46 }).usar, false)
  for (const raro of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
    assert.equal(decidirIaAuto({ llamadas24h: raro, eur24h: 0 }).usar, false, String(raro))
    assert.equal(decidirIaAuto({ llamadas24h: 0, eur24h: raro }).usar, false, String(raro))
  }
})

test('Telegram a Alberto: nombre de pila o referencia, nº de ofertas, rango en formato español, enlace a la oportunidad', () => {
  const op = '55555555-5555-4555-8555-555555555555'
  const t = textoAvisoPresupuestoRpa({
    cliente: nombreDePila('Lucía Ejemplo Inventada'), referencia: 'OP-55555555', ramo: 'auto', companias: ['Compañía Uno', 'Compañía Dos', 'Compañía Uno'],
    primas: [392.02, 1212.65, 670.1], enlace: enlaceOportunidad(op, 'https://plataforma.test/'), narrativa: 'determinista', sinIa: 'tope de 12 resúmenes IA en 24 h alcanzado',
  })
  assert.match(t, /Cliente: Lucía · OP-55555555/)
  assert.doesNotMatch(t, /Ejemplo|Inventada/, 'sin apellidos')
  assert.match(t, /Ofertas: 3 \(Compañía Uno, Compañía Dos\)/)
  assert.match(t, /de 392,02€ a 1\.212,65€/)
  assert.match(t, /SIN resumen IA \(tope/)
  assert.match(t, /No se ha enviado NADA al cliente/)
  assert.ok(t.includes(`https://plataforma.test/correduria/oportunidad/${op}`))
  const sinNombre = textoAvisoPresupuestoRpa({ cliente: nombreDePila('  '), referencia: 'OP-1', ramo: 'auto', companias: [], primas: [], enlace: 'x', narrativa: 'ia', sinIa: null })
  assert.match(sinNombre, /Cliente: OP-1\n/)
  assert.match(sinNombre, /Primas anuales: no constan/, 'sin primas no se inventa un rango ni 0,00€')
  assert.equal(rangoPrimas([84.8]), '84,80€')
  const raro = textoAvisoPresupuestoRpa({ cliente: '<i>', referencia: 'r', ramo: 'auto', companias: [], primas: [], enlace: 'x', narrativa: 'ia', sinIa: null })
  assert.ok(raro.includes('Cliente: &lt;i&gt; · r') && !raro.includes('<i>'), 'lo variable va escapado (parse_mode HTML)')
})

test('idempotencia: mismo conjunto de ofertas sin importar el orden', () => {
  assert.equal(mismoConjunto(['a', 'b'], ['b', 'a']), true)
  assert.equal(mismoConjunto(['a', 'b'], ['a', 'b', 'c']), false)
  assert.equal(mismoConjunto(['a', 'a'], ['a', 'b']), false)
  assert.equal(mismoConjunto(['a', 'b'], ['a', 'a']), false)
  assert.equal(mismoConjunto([], []), true)
})

test('cableado: el precio RPA guarda sus coberturas, el resultado dispara el borrador en after, y el borrador nunca envía', () => {
  const lib = import.meta.dirname
  const tar = readFileSync(join(lib, 'tarificador.ts'), 'utf8')
  const ins = tar.slice(tar.indexOf('async function guardarTarificacionRpa'), tar.indexOf('async function guardarAdjunto'))
  assert.match(ins, /sobreCoberturasRpa\(o\.coberturas/)
  assert.match(ins, /referencia_vendor, avisos, coberturas\s*\)/)
  const ruta = readFileSync(join(lib, '..', 'app/api/tarificador/resultado/route.ts'), 'utf8')
  assert.match(ruta, /after\(\(\) => presupuestoTrasTrabajoRpa\(trabajoId\)/)
  const srv = readFileSync(join(lib, 'presupuesto-rpa.ts'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  assert.doesNotMatch(srv, /envio-presupuesto|avisarPresupuesto|enviadoAt:\s*(new Date|ahora)|enlaceGeneradoAt:\s*(new Date|ahora)|core-email|whatsapp/i, 'el borrador del bot no envía nada al cliente')
  assert.doesNotMatch(srv, /estado: 'revisada'|revisadaAt:\s*(ahora|new Date)/, 'el bot no revisa ofertas: eso es de Alberto')
  assert.match(srv, /estado: 'extraida', creadoPor: actor/)
  assert.match(srv, /creadoPor: ACTOR_RPA/)
  assert.match(srv, /decidirSustitucion\(ahora, vivosBot/, 'la sustitución se decide bajo el cerrojo, con la regla pura')
  assert.match(srv, /if \(decision\.accion === 'abandonar'\) return \{ tipo: 'superado'/)
  assert.match(srv, /decision\.retirar\.map/, 'solo se retira lo que la regla manda retirar')
  assert.match(srv, /textoAvisoCorteRpa\(\{ \.\.\.base, motivo: 'todas_descartadas'/)
  assert.match(srv, /textoAvisoCorteRpa\(\{ \.\.\.base, motivo: 'caducada'/)
  assert.match(srv, /cliente: nombreDePila\(c\?\.nombre\)/)
  assert.equal(ACTOR_RPA, 'tarificador-rpa')
})
