import test from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarVistaIngesta,
  veredictoIngesta,
  hayQueEnsenar,
  tituloIngesta,
  contadorIngesta,
  senalesIngesta,
  hayPerdida,
  hayHuecos,
} from './ingesta-pantalla.ts'
import { saludIngesta, silencioPorEntidad } from '@central/module-seguros'

/**
 * Los cepos de la pantalla de salud de la ingesta.
 *
 * Lo que vigilan NO es el reparto de bloques (eso es diseño y cambiará) sino la
 * única cosa que, si se rompe, convierte esta pantalla en peor que no tenerla:
 * que un «no se ha podido comprobar» acabe pintado como «todo va bien».
 */

/** Una lectura completa y limpia: se miró TODO y no hay nada que contar. */
const LIMPIA = {
  estado: 'ok',
  salud: saludIngesta({ cuarentena: [], huerfanas: 0, rechazos: [], silencio: silencioPorEntidad([]) }),
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
        { entidad: 'C0468', entidadNombre: 'Occident', clave: '8-92361', idPolizaEntidad: '8-10.745.696-P', recibos: 2, siniestros: 0, prima: 120.5, ultimoEn: '2026-08-30', enCartera: 'ausente' },
        { entidad: 'C0468', entidadNombre: 'Occident', clave: '8-92361', idPolizaEntidad: '8-10.745.700-P', recibos: 0, siniestros: 1, prima: null, ultimoEn: '2026-08-29', enCartera: 'viva' },
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
