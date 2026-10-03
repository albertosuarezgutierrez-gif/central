import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  interpretarVistaIngesta,
  veredictoIngesta,
  hayQueEnsenar,
  tituloIngesta,
  contadorIngesta,
  senalesIngesta,
  hayPerdida,
  hayHuecos,
  sinFicheroAtascado,
} from './ingesta-pantalla.ts'
import { saludIngesta, silencioPorEntidad } from '@central/module-seguros'

/**
 * Los cepos de la pantalla de salud de la ingesta.
 *
 * Lo que vigilan NO es el reparto de bloques (eso es diseño y cambiará) sino la
 * única cosa que, si se rompe, convierte esta pantalla en peor que no tenerla:
 * que un «no se ha podido comprobar» acabe pintado como «todo va bien».
 */

/**
 * Una lectura completa y limpia: se miró TODO y no hay nada que contar.
 *
 * 🚨 «Todo» son las OCHO señales, no las cuatro de la primera versión. Hasta el
 * 20/09/2026 esta constante dejaba `crudo`, `cobertura`, `cajaNegra` y
 * `ultimoPull` sin pedir, y con ellas fuera el cepo «lectura limpia ⇒ verde»
 * pasaba sobre una lectura que NO era limpia — que es justo la confusión que
 * este fichero existe para impedir. Si mañana se añade una señal nueva, va aquí.
 */
const LIMPIA = {
  estado: 'ok',
  salud: saludIngesta({
    cuarentena: [], huerfanas: 0, rechazos: [], silencio: silencioPorEntidad([]),
    crudo: { pendientes: 0, purgaInminente: 0, masAntiguaHoras: null },
    cobertura: { rutas: 10, rutasNuncaLeidas: 0, entidadesObservadas: 3, porTipo: [] },
    cajaNegra: { capturaActiva: true, cuerpos: 0, posts: 0, horasDesdeUltimo: 2, sinCuerpo: 0 },
    ultimoPull: { horas: 3, procesados: 12 },
    parciales: [],
  }),
  huerfanasTruncadas: false,
  huerfanasSinAmbito: 0,
}

test('lectura limpia: verde, y la tarjeta de «Hoy» NO ocupa sitio', () => {
  const v = interpretarVistaIngesta(200, LIMPIA)
  assert.equal(v.estado, 'ok')
  assert.equal(veredictoIngesta(v), 'ok')
  assert.equal(hayQueEnsenar(v), false)
  assert.deepEqual(contadorIngesta(v), { n: 0, parcial: false })
})

test('🚨 ningún fallo de lectura se pinta en verde', () => {
  const rotas: Array<[number, unknown]> = [
    [401, {}],                                   // secreto rechazado
    [500, { estado: 'ok' }],                     // el puerto revienta
    [200, null],                                 // respuesta vacía
    [200, 'no soy json'],                        // HTML de error
    [200, { estado: 'error', motivo: 'red' }],   // no se pudo hablar con asegura
    [200, { estado: 'sin_configurar' }],         // falta el secreto en este proyecto
    [200, { estado: 'ok' }],                     // «ok» sin salud dentro
    [200, { estado: 'ok', salud: { estado: 'ok' } }], // salud con otra forma
  ]
  for (const [status, json] of rotas) {
    const v = interpretarVistaIngesta(status, json)
    assert.notEqual(veredictoIngesta(v), 'ok', JSON.stringify(json))
    assert.equal(veredictoIngesta(v), 'sin_comprobar', JSON.stringify(json))
    // Y se enseña: un hueco que no se pinta se lee como «no hay nada».
    assert.equal(hayQueEnsenar(v), true, JSON.stringify(json))
    // Nunca un 0: el badge tiene que decir «!», no «no hay trabajo».
    assert.equal(contadorIngesta(v), null, JSON.stringify(json))
    assert.match(tituloIngesta(v), /no se ha podido comprobar/i)
  }
})

test('🚨 una salud `sin_datos` dentro de un `ok` sigue siendo «no se ha podido mirar»', () => {
  const v = interpretarVistaIngesta(200, {
    estado: 'ok',
    salud: saludIngesta({ cuarentena: null }),
    huerfanasTruncadas: false,
    huerfanasSinAmbito: null,
  })
  assert.equal(v.estado, 'error')
  assert.equal(veredictoIngesta(v), 'sin_comprobar')
})

test('mientras carga NO hay alarma: ni veredicto, ni tarjeta, ni «!»', () => {
  assert.equal(veredictoIngesta(null), null)
  assert.equal(hayQueEnsenar(null), false)
  assert.equal(contadorIngesta(null), undefined)
})

test('🚨 lo que NO se ha podido comprobar dentro de una lectura buena tampoco es verde', () => {
  // Cuarentena vacía y cero huérfanas, pero sin haber podido mirar ni los
  // rechazos ni el silencio por compañía. Eso NO es «la ingesta está al día».
  const v = interpretarVistaIngesta(200, {
    estado: 'ok',
    salud: saludIngesta({ cuarentena: [], huerfanas: 0, rechazos: null, silencio: null }),
    huerfanasTruncadas: false,
    huerfanasSinAmbito: null,
  })
  assert.equal(v.estado, 'ok')
  assert.equal(veredictoIngesta(v), 'sin_comprobar')
  assert.equal(hayQueEnsenar(v), true)
  // Se cuentan 0 pérdidas, pero el número es un SUELO, no el total.
  assert.deepEqual(contadorIngesta(v), { n: 0, parcial: true })
})

test('la avería real del 01/09/2026: pérdida medida, con su reparto por clave', () => {
  const v = interpretarVistaIngesta(200, {
    estado: 'ok',
    salud: saludIngesta({
      cuarentena: [
        { tipo: 'SIN', entidad: 'C0468', dias: 2, clave: '8-92361' },
        { tipo: 'REC', entidad: 'C0468', dias: 60, clave: '8-92361' },
      ],
      huerfanas: 2,
      huerfanasResolubles: 1,
      huerfanasDetalle: [
        { entidad: 'C0468', entidadNombre: 'Occident', clave: '8-92361', idPolizaEntidad: '8-10.000.033-P', recibos: 2, siniestros: 0, prima: 120.5, ultimoEn: '2026-08-30', enCartera: 'ausente' },
        { entidad: 'C0468', entidadNombre: 'Occident', clave: '8-92361', idPolizaEntidad: '8-10.000.034-P', recibos: 0, siniestros: 1, prima: null, ultimoEn: '2026-08-29', enCartera: 'viva' },
      ],
      primaPerdida: 7721.71,
      rechazos: [],
      silencio: silencioPorEntidad([]),
    }),
    huerfanasTruncadas: false,
    huerfanasSinAmbito: 0,
  })
  assert.equal(veredictoIngesta(v), 'incidencia')
  assert.equal(tituloIngesta(v), 'Se están perdiendo datos de CIMA')
  assert.equal(hayQueEnsenar(v), true)
  if (v.estado !== 'ok') return
  assert.equal(hayPerdida(v.salud), true)
  const claves = senalesIngesta(v.salud).filter(s => s.tipo === 'perdida').map(s => s.clave)
  assert.deepEqual(claves.sort(), ['cuarentena', 'huerfanas'])
  // El backlog viejo se informa, pero NO cuenta como pérdida (si no, el vigía
  // grita todos los días por lo mismo y se acaba silenciando).
  assert.ok(senalesIngesta(v.salud).some(s => s.clave === 'backlog' && s.tipo === 'hueco'))
  assert.deepEqual(contadorIngesta(v), { n: 2, parcial: false })
})

test('una compañía muda manda en el titular: no se arregla igual que un fichero atascado', () => {
  const v = interpretarVistaIngesta(200, {
    estado: 'ok',
    salud: saludIngesta({
      cuarentena: [],
      huerfanas: 0,
      rechazos: [],
      silencio: silencioPorEntidad([
        { entidad: 'C0058', diasSinFichero: 74, huecoMaximo: 2, huecosObservados: 5, vivas: 64, vencidasEnSilencio: 7 },
      ]),
    }),
    huerfanasTruncadas: false,
    huerfanasSinAmbito: 0,
  })
  assert.equal(veredictoIngesta(v), 'incidencia')
  assert.match(tituloIngesta(v), /^C0058 ha\(n\) dejado de mandar/)
  if (v.estado !== 'ok') return
  assert.equal(hayHuecos(v.salud), false)
  const s = senalesIngesta(v.salud)[0]
  assert.equal(s.clave, 'silencio')
  assert.match(s.detalle, /nada atascado que reprocesar/)
})

test('saber cuántas huérfanas hay pero no CUÁLES es un estado propio, y se dice', () => {
  const v = interpretarVistaIngesta(200, {
    estado: 'ok',
    salud: saludIngesta({
      cuarentena: [], huerfanas: 17, huerfanasDetalle: null, rechazos: [], silencio: silencioPorEntidad([]),
    }),
    huerfanasTruncadas: true,
    huerfanasSinAmbito: null,
  })
  if (v.estado !== 'ok') return
  const hueco = senalesIngesta(v.salud).find(s => s.clave === 'huerfanas' && s.tipo === 'hueco')
  assert.ok(hueco, 'no se declaró que falta la lista de huérfanas')
  assert.deepEqual(contadorIngesta(v), { n: 1, parcial: true })
})

test('un campo nuevo del puerto no convierte la respuesta en ilegible', () => {
  // Hay otra sesión ampliando el puerto: rechazar la respuesta por un campo de
  // más haría que una versión NUEVA se leyera como «no se ha podido mirar».
  const v = interpretarVistaIngesta(200, {
    ...LIMPIA,
    salud: { ...LIMPIA.salud, ultimoPull: '2026-09-16T05:30:00Z' },
    señalInventada: 42,
  })
  assert.equal(v.estado, 'ok')
  assert.equal(veredictoIngesta(v), 'ok')
})

test('un recorte no declarado se asume recortado, nunca completo', () => {
  const v = interpretarVistaIngesta(200, { estado: 'ok', salud: LIMPIA.salud })
  assert.equal(v.estado, 'ok')
  if (v.estado !== 'ok') return
  assert.equal(v.huerfanasTruncadas, true)
  assert.equal(v.huerfanasSinAmbito, null)
})

// ── Señales nuevas en la pantalla (cron, crudo, caja negra, cobertura) ───────

const saludBase = {
  estado: 'ok' as const,
  total: 0, recientes: 0, porEntidad: [], porClave: [],
  huerfanas: 0, huerfanasResolubles: 0, huerfanasReparto: null,
  primaPerdida: null, rechazos: [], silencio: [], motivos: [], huecos: [],
  crudo: null, cobertura: null, cajaNegra: null, ultimoPull: null,
  parciales: null, objetosEnRevision: null, avisosImportantes: [],
}

test('🚨 el cron mudo se lee ANTES que nada: lo demás está a cero por su culpa', () => {
  const s = senalesIngesta({ ...saludBase, ultimoPull: { horas: 40, procesados: 0 } })
  assert.equal(s[0].clave, 'cron')
  assert.equal(s[0].tipo, 'perdida')
  assert.match(s[0].detalle, /no porque todo vaya bien/)
})

test('la purga inminente es la única señal con fecha límite y sale como pérdida', () => {
  const s = senalesIngesta({
    ...saludBase,
    crudo: { pendientes: 5, purgaInminente: 2, masAntiguaHoras: 2000 },
  })
  const x = s.find(v => v.clave === 'crudo')
  assert.equal(x?.tipo, 'perdida')
  assert.match(x!.titulo, /se BORRAN/)
})

test('crudo sin purga inminente NO se pinta como pérdida', () => {
  const s = senalesIngesta({
    ...saludBase,
    crudo: { pendientes: 5, purgaInminente: 0, masAntiguaHoras: 48 },
  })
  assert.equal(s.find(v => v.clave === 'crudo')?.tipo, 'hueco')
})

test('la cobertura NUNCA es pérdida: sería un rojo perpetuo', () => {
  const s = senalesIngesta({
    ...saludBase,
    cobertura: {
      rutas: 300, rutasNuncaLeidas: 120, entidadesObservadas: 3,
      porTipo: [{ tipoObjeto: 'POL', rutas: 300, nuncaLeidas: 120 }],
    },
  })
  const x = s.find(v => v.clave === 'cobertura')
  assert.equal(x?.tipo, 'hueco')
  assert.ok(!s.some(v => v.clave === 'cobertura' && v.tipo === 'perdida'))
})

test('captura puesta y sin cuerpos: se dice, no se calla ni se cuenta como sana', () => {
  const s = senalesIngesta({
    ...saludBase,
    cajaNegra: { capturaActiva: false, cuerpos: 0, posts: 0, horasDesdeUltimo: null, sinCuerpo: 0 },
  })
  const x = s.find(v => v.clave === 'caja_negra')
  assert.equal(x?.tipo, 'hueco')
  assert.match(x!.detalle, /todavía no ha pasado ninguno/)
})

test('🚨 una salud SIN los campos nuevos (asegura viejo) no revienta la pantalla', () => {
  // Plataforma y asegura se despliegan por separado. Antes de normalizar en la
  // frontera, `undefined !== null` entraba en la rama y `.purgaInminente`
  // lanzaba: pantalla en blanco en vez de panel.
  const viejo = { ...saludBase }
  delete (viejo as Record<string, unknown>).crudo
  delete (viejo as Record<string, unknown>).cobertura
  delete (viejo as Record<string, unknown>).cajaNegra
  delete (viejo as Record<string, unknown>).ultimoPull

  const v = interpretarVistaIngesta(200, { estado: 'ok', salud: viejo, huerfanasTruncadas: false })
  assert.equal(v.estado, 'ok')
  assert.equal(v.estado, 'ok')
  const salud = (v as Extract<typeof v, { estado: 'ok' }>).salud
  assert.doesNotThrow(() => senalesIngesta(salud))
  const s = senalesIngesta(salud)
  // Y además lo declara como hueco, en vez de aparentar que está comprobado.
  assert.ok(s.some(x => x.clave === 'cron' && x.tipo === 'hueco'))
  assert.ok(s.some(x => x.clave === 'cobertura' && x.tipo === 'hueco'))
})

// ── 🚨 Un hueco NO se puede quedar sin pintar (20/09/2026) ──────────────────
// `hayHuecos` enumeraba a mano TRES señales, así que una lectura sin cron, sin
// crudo, sin caja negra y sin cobertura daba veredicto `ok` → la tarjeta de
// «Hoy» NO se pintaba, aunque `senalesIngesta` sí generaba sus cuatro huecos.
// El mismo fallo que el módulo puro tenía un piso más abajo.

test('🚨 una salud SIN cron ni cobertura NO es verde: la tarjeta se pinta', () => {
  const v = interpretarVistaIngesta(200, {
    ...LIMPIA,
    salud: saludIngesta({
      cuarentena: [], huerfanas: 0, rechazos: [], silencio: silencioPorEntidad([]),
      crudo: null, cobertura: null, cajaNegra: null, ultimoPull: null, parciales: [],
    }),
  })
  assert.equal(veredictoIngesta(v), 'sin_comprobar')
  assert.equal(hayQueEnsenar(v), true)
})

test('🚨 la salud de un asegura VIEJO tampoco se pinta en verde', () => {
  // Mismo caso, pero con las claves AUSENTES en vez de a `null`: es lo que
  // llega durante una ventana de despliegue, y `normalizarSenalesNuevas` las
  // convierte en «no me lo han contado».
  const viejo = { ...saludBase }
  for (const k of ['crudo', 'cobertura', 'cajaNegra', 'ultimoPull', 'parciales', 'huecos']) {
    delete (viejo as Record<string, unknown>)[k]
  }
  const v = interpretarVistaIngesta(200, { estado: 'ok', salud: viejo, huerfanasTruncadas: false })
  assert.equal(veredictoIngesta(v), 'sin_comprobar')
})

test('🚨 un fichero confirmado con objetos sin guardar es PÉRDIDA en la pantalla', () => {
  const s = senalesIngesta({
    ...saludBase,
    parciales: [{
      fichero: 'C0468_M00171_POL_199.zip', tipo: 'POL', entidad: 'C0468', clave: 'M00171',
      declarados: 44, persistidos: 40, enRevision: 4, dias: 3,
    }],
    objetosEnRevision: 4,
  })
  const x = s.find(v => v.clave === 'parciales')
  assert.equal(x?.tipo, 'perdida')
  assert.match(x!.detalle, /no los reenvía/)
})

test('y no haber podido comprobarlo se declara como hueco, nunca como cero', () => {
  const s = senalesIngesta({ ...saludBase, parciales: null, objetosEnRevision: null })
  const x = s.find(v => v.clave === 'parciales')
  assert.equal(x?.tipo, 'hueco')
  assert.equal(x?.n, null)
})

test('🚨 la cobertura se rotula como RUTAS distintas y con cuántas compañías', () => {
  const s = senalesIngesta({
    ...saludBase,
    cobertura: {
      rutas: 563, rutasNuncaLeidas: 457, entidadesObservadas: 3,
      porTipo: [{ tipoObjeto: 'POL', rutas: 405, nuncaLeidas: 338 }],
    },
  })
  const x = s.find(v => v.clave === 'cobertura')
  assert.match(x!.titulo, /457 de 563 campos distintos/)
  assert.match(x!.detalle, /Vistos en 3 compañía\(s\)/)
})

// ── Renovaciones que no llegan (27/09/2026) ─────────────────────────────────

const mapfreRenov = { entidad: 'C0058', entidadNombre: 'Mapfre', polizas: 10, vencimientoMasAntiguo: '2026-06-05' }

test('renovaciones: con alguna, sale como PÉRDIDA con compañía, número y fecha', () => {
  const s = saludIngesta({ cuarentena: [], renovacionesSinLlegar: [mapfreRenov] })
  const r = senalesIngesta(s).filter(x => x.clave === 'renovaciones')
  assert.equal(r.length, 1)
  assert.equal(r[0].tipo, 'perdida')
  assert.equal(r[0].n, 10)
  assert.match(r[0].titulo, /Mapfre 10/)
  assert.match(r[0].detalle, /vencidas desde 05\/06/)
  assert.equal(hayPerdida(s), true)
})

test('renovaciones: `[]` NO pinta nada (la pantalla solo enseña errores)', () => {
  const s = saludIngesta({ cuarentena: [], renovacionesSinLlegar: [] })
  assert.equal(senalesIngesta(s).some(x => x.clave === 'renovaciones'), false)
})

test('renovaciones: `null` es HUECO, no «han llegado todas»', () => {
  const s = saludIngesta({ cuarentena: [], renovacionesSinLlegar: null })
  const r = senalesIngesta(s).filter(x => x.clave === 'renovaciones')
  assert.equal(r.length, 1)
  assert.equal(r[0].tipo, 'hueco')
})

test('renovaciones: si son lo ÚNICO medido, el título lo dice (no «se pierden datos»)', () => {
  const s = saludIngesta({
    cuarentena: [], renovacionesSinLlegar: [mapfreRenov],
    rechazos: [], silencio: [], crudo: { pendientes: 0, purgaInminente: 0, masAntiguaHoras: null },
    cobertura: { rutas: 0, rutasNuncaLeidas: 0, entidadesObservadas: 1, porTipo: [] },
    cajaNegra: { capturaActiva: true, cuerpos: 0, posts: 0, horasDesdeUltimo: null, sinCuerpo: 0 },
    ultimoPull: { horas: 3, procesados: 1 }, parciales: [],
  })
  const v = { estado: 'ok' as const, salud: s, huerfanasTruncadas: false, huerfanasSinAmbito: null }
  assert.equal(tituloIngesta(v), 'Hay renovaciones que no han llegado por CIMA')
})

// ── 📭 Emisiones de Codeoscopic sin aviso del webhook (28/09/2026) ───────────

const emitida = { proyecto: '40769244', aseguradora: 'Allianz', horas: 262 }

test('emisiones sin aviso: salen como PÉRDIDA con el proyecto y la compañía', () => {
  const s = saludIngesta({ cuarentena: [], emisionesSinAviso: [emitida] })
  const r = senalesIngesta(s).filter(x => x.clave === 'emisiones_sin_aviso')
  assert.equal(r.length, 1)
  assert.equal(r[0].tipo, 'perdida')
  assert.match(r[0].detalle, /40769244 \(Allianz\)/)
})

test('emisiones sin aviso: `null` es HUECO y `[]` no pinta nada', () => {
  const hueco = senalesIngesta(saludIngesta({ cuarentena: [], emisionesSinAviso: null }))
    .filter(x => x.clave === 'emisiones_sin_aviso')
  assert.equal(hueco.length, 1)
  assert.equal(hueco[0].tipo, 'hueco')
  assert.equal(
    senalesIngesta(saludIngesta({ cuarentena: [], emisionesSinAviso: [] })).some(x => x.clave === 'emisiones_sin_aviso'),
    false,
  )
})

test('emisiones sin aviso: si son lo ÚNICO medido, el título no culpa a CIMA', () => {
  const s = saludIngesta({
    cuarentena: [], emisionesSinAviso: [emitida],
    rechazos: [], silencio: [], crudo: { pendientes: 0, purgaInminente: 0, masAntiguaHoras: null },
    cobertura: { rutas: 0, rutasNuncaLeidas: 0, entidadesObservadas: 1, porTipo: [] },
    cajaNegra: { capturaActiva: true, cuerpos: 0, posts: 0, horasDesdeUltimo: null, sinCuerpo: 0 },
    ultimoPull: { horas: 3, procesados: 1 }, parciales: [],
  })
  const v = { estado: 'ok' as const, salud: s, huerfanasTruncadas: false, huerfanasSinAmbito: null }
  assert.equal(tituloIngesta(v), 'El webhook de Codeoscopic no avisa de las emisiones')
})

test('sinFicheroAtascado: solo renovaciones, solo emisiones, las dos, o algo más', () => {
  assert.equal(sinFicheroAtascado([]), null)
  assert.equal(sinFicheroAtascado([{ clave: 'renovaciones' }]), 'renovaciones')
  assert.equal(sinFicheroAtascado([{ clave: 'emisiones_sin_aviso' }]), 'emisiones')
  assert.equal(sinFicheroAtascado([{ clave: 'renovaciones' }, { clave: 'emisiones_sin_aviso' }]), 'ambas')
  // Con cualquier pérdida de CIMA de verdad, el titular vuelve a ser el de CIMA.
  assert.equal(sinFicheroAtascado([{ clave: 'emisiones_sin_aviso' }, { clave: 'cuarentena' }]), null)
})

test('🚨 el titular del Telegram usa la MISMA función que el título de la pantalla', () => {
  // Con dos criterios, pantalla y alarma dirían cosas distintas del mismo hecho.
  const ruta = readFileSync(
    join(import.meta.dirname, '..', '..', 'app', 'api', 'cron', 'correduria-ingesta', 'route.ts'), 'utf8')
  assert.match(ruta, /sinFicheroAtascado\(perdidas\)/)
  assert.match(ruta, /El webhook de Codeoscopic no avisa de las emisiones/)
})

test('cobertura: los descartados por privacidad salen aparte, no dentro de «sin leer»', () => {
  const s = senalesIngesta({
    ...saludBase,
    cobertura: { rutas: 300, rutasNuncaLeidas: 20, rutasDescartadas: 9, entidadesObservadas: 3, porTipo: [{ tipoObjeto: 'POL', rutas: 300, nuncaLeidas: 20 }] },
  })
  assert.equal(s.find(v => v.clave === 'cobertura')?.n, 20)
  const d = s.find(v => v.clave === 'cobertura_descartada')
  assert.equal(d?.n, 9)
  assert.equal(d?.tipo, 'hueco')
})

test('cobertura: sin descartadas (null o ausente) no hay fila de descartados', () => {
  for (const rutasDescartadas of [null, undefined, 0]) {
    const s = senalesIngesta({
      ...saludBase,
      cobertura: { rutas: 300, rutasNuncaLeidas: 20, rutasDescartadas, entidadesObservadas: 3, porTipo: [] },
    })
    assert.ok(!s.some(v => v.clave === 'cobertura_descartada'))
  }
})

test('duplicados vivos: solo se pinta con total > 0; 0 no pinta; null/undefined NO son 0', () => {
  const con = senalesIngesta({ ...saludBase, duplicadosVivos: { total: 30, muestra: [{ numero: 'A1', filas: 2, dgs: null }] } })
  const d = con.find(v => v.clave === 'duplicados_vivos')
  assert.equal(d?.n, 30)
  assert.equal(d?.tipo, 'hueco')
  assert.ok(!senalesIngesta({ ...saludBase, duplicadosVivos: { total: 0, muestra: [] } }).some(v => v.clave === 'duplicados_vivos'))
  assert.ok(!senalesIngesta({ ...saludBase, duplicadosVivos: undefined }).some(v => v.clave === 'duplicados_vivos'))
  const nula = senalesIngesta({ ...saludBase, duplicadosVivos: null }).find(v => v.clave === 'duplicados_vivos')
  assert.equal(nula?.n, null)
  assert.match(nula?.titulo ?? '', /Sin comprobar/)
})
