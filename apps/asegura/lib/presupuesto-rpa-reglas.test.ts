// Cepos del presupuesto en BORRADOR tras el tarificador RPA (18/10/2026). `node --test`. Datos inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACTOR_RPA, AVISO_OPCION_RPA, MAX_LLAMADAS_IA_24H, avisosOpcionRpa, claveRpaDeFila, decidirDisparo, decidirIaAuto, enlaceOportunidad,
  filaOfertaRpa, garantiasRpa, mismoConjunto, nombreDePila, ofertasDeRespuesta, rangoPrimas, sobreCoberturasRpa, textoAvisoPresupuestoRpa,
  borradorTocado, decidirSustitucion, repartirAvisos, textoAvisoCorteRpa, traducirSupuestos, trozosSupuestos, alertasDeAvisos,
} from './presupuesto-rpa-reglas.ts'
import { sobreCoberturasDeOferta } from './ofertas-reglas.ts'
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
  assert.ok(!a.some((x) => x.startsWith('Precio con supuestos:')), 'el crudo de los supuestos no llega al cliente')
  assert.ok(a.includes('Precio calculado con algún dato más que tu corredor confirmará antes de contratar.'), 'un supuesto sin traducción se reconoce sin inventarlo')
  assert.ok(!a.includes('Aviso de la compañía'), 'un aviso crudo del bot no llega al texto visible')
  assert.deepEqual(f.datosExtra.avisosInternos, ['Precio con supuestos: conductor ocasional no declarado', 'Aviso de la compañía'])
  assert.deepEqual(f.datosExtra.alertasCorredor, [])
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
  assert.equal(r.cliente[0], 'Precio calculado con estas suposiciones: uso diario del vehículo; aparcado en garaje colectivo.')
  assert.deepEqual(r.internos, ['Precio con supuestos: uso diario, garaje colectivo.', 'precio con supuestos sin formato', 'El portal muestra un aviso en el título del paquete (icono de advertencia; texto no leído).', 'coberturas no leídas'])
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
  // 26/10/2026: el `after` primero extrae las coberturas del PDF (idempotente, nunca lanza) y DESPUÉS prepara el borrador.
  assert.match(ruta, /after\(async \(\) => \{[\s\S]*extraerCoberturasTrasTrabajo\(trabajoId\)[\s\S]*await presupuestoTrasTrabajoRpa\(trabajoId\)/)
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

// El aviso REAL de Allianz en AS-26-0015 (18/10/2026): sin datos personales.
const ALLIANZ_AS0015 = 'Precio con supuestos: vehículo/versión: el primero de la lista (supuesto, había 5), uso diario, código postal fijado por Allianz (no editable), distinto de la ficha, localidad fijada por Allianz (no editable), distinta de la ficha, tiempo como titular de un seguro: 9-10 años o más (supuesto favorable, no consta).'

test('supuestos de Allianz (AS-26-0015): frase limpia al cliente; «había N», «fijado por», «no editable», «distinto de la ficha» a notas internas', () => {
  assert.deepEqual(trozosSupuestos(ALLIANZ_AS0015), [
    'vehículo/versión: el primero de la lista (supuesto, había 5)', 'uso diario',
    'código postal fijado por Allianz (no editable), distinto de la ficha', 'localidad fijada por Allianz (no editable), distinta de la ficha',
    'tiempo como titular de un seguro: 9-10 años o más (supuesto favorable, no consta)',
  ])
  const t = traducirSupuestos(ALLIANZ_AS0015, 'Allianz')
  assert.equal(t.cliente, 'Precio calculado con estas suposiciones: la primera versión del vehículo que propone la compañía para tu matrícula; uso diario del vehículo; más de 9 años con un seguro a tu nombre; y algún dato más que tu corredor confirmará antes de contratar.')
  for (const jerga of [/había/, /fijad[oa] por/, /no editable/, /de la ficha/, /código postal/, /localidad/, /supuesto favorable/, /no consta/]) assert.doesNotMatch(t.cliente!, jerga)
  assert.deepEqual(t.internos, [ALLIANZ_AS0015], 'el crudo entero queda para Alberto')
  assert.equal(t.alertas.length, 2)
  assert.match(t.alertas[0], /^Allianz ha calculado el precio con un código postal DISTINTO/)
  assert.match(t.alertas[1], /^Allianz ha calculado el precio con una localidad DISTINTA/)
  const r = repartirAvisos([ALLIANZ_AS0015], 'Allianz')
  assert.deepEqual(r.cliente, [t.cliente])
  assert.deepEqual(r.internos, [ALLIANZ_AS0015])
})

test('supuestos de Mapfre (AS-26-0015) y alertas: sin dato distinto de la ficha no hay alerta; un fijado igual tampoco', () => {
  const m = traducirSupuestos('Precio con supuestos: vehículo/versión: el primero de la lista (supuesto, había 5).', 'Mapfre')
  assert.equal(m.cliente, 'Precio calculado con estas suposiciones: la primera versión del vehículo que propone la compañía para tu matrícula.')
  assert.deepEqual(m.alertas, [])
  assert.deepEqual(alertasDeAvisos(['Precio con supuestos: localidad: la que propone el portal para el CP, uso diario.', 'Aviso suelto'], 'Allianz'), [])
  const dinamico = alertasDeAvisos(['Precio con supuestos: partes culpables: «1» (fijado por Allianz, distinto de la ficha).'], 'Allianz')
  assert.equal(dinamico.length, 1, 'un antecedente fijado distinto de la ficha también es alerta')
  assert.equal(traducirSupuestos('Aviso sin formato').cliente, null)
  const tg = textoAvisoPresupuestoRpa({ cliente: null, referencia: 'OP-1', ramo: 'auto', companias: ['Allianz'], primas: [100], enlace: 'x', narrativa: 'ia', sinIa: null, alertas: traducirSupuestos(ALLIANZ_AS0015, 'Allianz').alertas })
  assert.match(tg, /⚠️ <b>Alerta<\/b>: Allianz ha calculado el precio con un código postal DISTINTO/)
  assert.doesNotMatch(textoAvisoPresupuestoRpa({ cliente: null, referencia: 'OP-1', ramo: 'auto', companias: [], primas: [100], enlace: 'x', narrativa: 'ia', sinIa: null }), /Alerta/)
})

test('no constan (AS-26-0015): ni el bot ni «Generar presupuesto» a mano escriben «vacias» para una oferta sin garantías leídas', () => {
  // Bot: sin coberturas → sin sobre → la columna se queda en `[]` desnudo (= «no se intentó» para todos los lectores).
  assert.equal(sobreCoberturasRpa([], AHORA), null)
  assert.equal(coberturasDeSobre([]).lista, null)
  const v = ofertasDeRespuesta({ ofertas: [oferta({ coberturas: [] })] }, { tarificacionId: TAR, trabajoId: JOB })!
  const f = filaOfertaRpa(v[0])
  assert.equal(f.garantias, null)
  assert.equal(f.datosExtra.coberturasNoConstan, true)
  // A mano (`opcionesDeOfertas`): garantías NULL o el bot dice «no constan» → sin sobre, nunca `vacias`.
  assert.equal(sobreCoberturasDeOferta('generico', null, null, new Date()), null)
  assert.equal(sobreCoberturasDeOferta('generico', {}, f.datosExtra, new Date()), null)
  assert.equal(sobreCoberturasDeOferta('generico', { x: { estado: null, capital: null, limite: null, franquicia: null, evidencia: null } } as never, null, new Date()), null, 'garantías que no afirman nada: no constan')
  assert.equal(sobreCoberturasDeOferta('comunidades', {}, null, new Date())?.estado, 'vacias', 'solo una lectura explícita sin garantías es «vacias»')
})

test('datosUsados (18/10/2026): lo que la compañía usó viaja de la respuesta del bot a datos_extra; sin él, null (no se inventa)', () => {
  const du = { codigoPostal: '00001', localidad: 'LOCALIDAD', vehiculo: { marca: 'MARCA', modelo: 'MODELO', version: null } }
  const v = ofertasDeRespuesta({ ofertas: [oferta({ datosUsados: du })] }, { tarificacionId: TAR, trabajoId: JOB })!
  assert.deepEqual(filaOfertaRpa(v[0]).datosExtra.datosUsados, du)
  const s = ofertasDeRespuesta({ ofertas: [oferta()] }, { tarificacionId: TAR, trabajoId: JOB })!
  assert.equal(filaOfertaRpa(s[0]).datosExtra.datosUsados, null)
})

// ─── F4: al enviar la propuesta de un lead, lo manual NO se retira (revisión 19/10/2026) ───────────────────────
test('propuesta de lead: solo se sustituye lo automático; lo hecho a mano nunca', async () => {
  const { sustituiblePorPropuestaLead, VIA_PROPUESTA_LEAD } = await import('./presupuesto-rpa-reglas.ts')
  const prepSistema = { tipo: 'preparado', origen: 'sistema', detalle: {} }
  const prepLead = { tipo: 'preparado', origen: 'corredor', detalle: { actor: 'agente:telegram-1', via: VIA_PROPUESTA_LEAD } }
  const prepMano = { tipo: 'preparado', origen: 'corredor', detalle: { actor: 'alberto@x.es', origen: 'ofertas' } }
  // Borrador del bot sin tocar → se retira; tocado por Alberto → se queda.
  assert.equal(sustituiblePorPropuestaLead({ creadoPor: ACTOR_RPA, ocultas: 0, eventos: [prepSistema] }), true)
  assert.equal(sustituiblePorPropuestaLead({ creadoPor: ACTOR_RPA, ocultas: 1, eventos: [prepSistema] }), false)
  assert.equal(sustituiblePorPropuestaLead({ creadoPor: ACTOR_RPA, ocultas: 0, eventos: [prepSistema, { tipo: 'necesidades', origen: 'corredor', detalle: {} }] }), false)
  // Otro 📤 de la propuesta que no salió → se retira (sin ocultas).
  assert.equal(sustituiblePorPropuestaLead({ creadoPor: 'agente:telegram-1', ocultas: 0, eventos: [prepLead] }), true)
  assert.equal(sustituiblePorPropuestaLead({ creadoPor: 'agente:telegram-1', ocultas: 2, eventos: [prepLead] }), false)
  // Hecho a mano (botón «Generar presupuesto»), con cualquier actor → NUNCA.
  assert.equal(sustituiblePorPropuestaLead({ creadoPor: 'alberto@x.es', ocultas: 0, eventos: [prepMano] }), false)
  assert.equal(sustituiblePorPropuestaLead({ creadoPor: 'agente:telegram-1', ocultas: 0, eventos: [prepMano] }), false)
  assert.equal(sustituiblePorPropuestaLead({ creadoPor: null, ocultas: 0, eventos: [] }), false)
})

test('propuesta de lead: lo de la propuesta que Alberto EDITÓ (o que pudo salir) no se retira nunca', async () => {
  const { sustituiblePorPropuestaLead, VIA_PROPUESTA_LEAD } = await import('./presupuesto-rpa-reglas.ts')
  const prepLead = { tipo: 'preparado', origen: 'corredor', detalle: { actor: 'agente:telegram-1', via: VIA_PROPUESTA_LEAD } }
  const deducidas = { tipo: 'necesidades', origen: 'corredor', detalle: { actor: 'agente:telegram-1', antes: 'vacío', deducido: true } }
  const delLead = { tipo: 'necesidades', origen: 'corredor', detalle: { actor: 'agente:telegram-1', via: 'lead_correo' } }
  const base = { creadoPor: 'agente:telegram-1', ocultas: 0 }
  // Lo que escribe el propio 📤 (y un fallo SEGURO del envío) no lo hace intocable.
  assert.equal(sustituiblePorPropuestaLead({ ...base, eventos: [prepLead, deducidas, delLead] }), true)
  assert.equal(sustituiblePorPropuestaLead({ ...base, eventos: [prepLead, delLead, { tipo: 'envio_fallido', origen: 'sistema', detalle: { motivo: 'sin_proveedor' } }] }), true)
  // Alberto lo tocó, o pudo llegar al cliente → se conserva.
  for (const e of [
    { tipo: 'necesidades', origen: 'corredor', detalle: { actor: 'alberto@x.es', antes: 'escrito' } },
    { tipo: 'envio_incierto', origen: 'sistema', detalle: { idempotencia: 'clp-1' } },
    { tipo: 'envio_fallido', origen: 'sistema', detalle: { motivo: 'rechazado' } },
    { tipo: 'enlace_generado', origen: 'corredor', detalle: {} },
    { tipo: 'pdf_descargado', origen: 'corredor', detalle: {} },
    { tipo: 'algo_nuevo', origen: 'corredor', detalle: {} },
  ]) {
    assert.equal(sustituiblePorPropuestaLead({ ...base, eventos: [prepLead, delLead, e] }), false, e.tipo)
  }
})

test('propuesta de lead: el envío pasa `via` y el presupuesto filtra los previos con la regla', () => {
  const dir = import.meta.dirname
  const prop = readFileSync(join(dir, 'propuesta-lead.ts'), 'utf8')
  assert.match(prop, /prepararPresupuestoDeOfertas\([\s\S]{0,200}via: VIA_PROPUESTA_LEAD/, 'el 📤 de la propuesta marca su vía')
  const pre = readFileSync(join(dir, 'presupuesto.ts'), 'utf8')
  const f = pre.slice(pre.indexOf('export async function prepararPresupuestoDeOfertas'))
  assert.match(f, /entrada\.via === VIA_PROPUESTA_LEAD\s*\?\s*candidatos\.filter\(\(p\) => sustituiblePorPropuestaLead\(/, 'con `via`, solo se retiran los sustituibles')
  assert.match(f, /\.\.\.\(entrada\.via \? \{ via: entrada\.via \} : \{\}\)/, 'el `preparado` deja la vía (así otro 📤 lo reconoce)')
})
