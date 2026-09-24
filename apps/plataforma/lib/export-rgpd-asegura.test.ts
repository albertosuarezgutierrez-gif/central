import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { CATEGORIAS_EXPORT, FICHA_CATEGORIA, MOTIVO_TEXTO } from '@central/module-seguros'
import {
  apartadosIncompletos,
  contadorExport,
  identidadValida,
  interpretarExport,
  leerApartado,
  leerPaquete,
  nombreFicheroExport,
  type PaqueteExport,
} from './export-rgpd-asegura.ts'

/**
 * La cadena de plataforma que sirve el **derecho de acceso (art. 15 RGPD)** y
 * de **portabilidad (art. 20)**.
 *
 * 🚨 Lo que se protege aquí no es que compile: es que un paquete que NO se ha
 * podido generar entero no pueda verse igual que uno completo. Lo que sale de
 * esta pantalla se le entrega por escrito a una persona que ha ejercido un
 * derecho, con un plazo de un mes corriendo (art. 12.3), y un apartado que
 * falta sin decirlo convierte un fallo técnico en la afirmación «no tenemos ese
 * dato tuyo».
 *
 * Vive en `apps/plataforma/lib/` y no en `test/` de la raíz a propósito: la lib
 * importa VALORES de `@central/module-seguros` (para no copiar su vocabulario),
 * y ese symlink solo existe dentro de la app. El job de la raíz
 * (`node --test test/*.test.ts`) no lo resolvería.
 */

const RUTA = 'app/api/correduria/export-rgpd/route.ts'
const PANTALLA = 'app/(usuario)/correduria/ExportRgpd.tsx'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const IDENTIDAD = '4b1f0a2c-7d3e-4c5a-9b8f-0123456789ab'

/** Un paquete como el que construye `construirExport()` de asegura. */
function paqueteJson(cambios: Partial<Record<string, unknown>> = {}) {
  return {
    generadoEn: '2026-09-20T10:00:00.000Z',
    versionTextosLegales: '2026-09-v1',
    mediador: { nombre: 'Grupo ASegura', nif: 'X', claveDgsfp: 'CS-F/0170', contacto: 'a@b.c' },
    completo: true,
    apartados: CATEGORIAS_EXPORT.map((c) => ({
      categoria: c,
      titulo: FICHA_CATEGORIA[c].titulo,
      descripcion: FICHA_CATEGORIA[c].descripcion,
      origen: FICHA_CATEGORIA[c].origen,
      portable: FICHA_CATEGORIA[c].origen === 'aportado_por_ti',
      incluida: true,
      filas: [{ id: '1' }],
    })),
    informacion: { fines: [], destinatarios: [] },
    ...cambios,
  }
}

test('🚨 un fallo NUNCA se lee como un paquete', () => {
  for (const [status, json] of [
    [500, null],
    [502, { estado: 'error', motivo: 'red' }],
    [200, { estado: 'error', causa: 'credenciales' }],
    [200, {}], // 200 sin paquete: NO es «esta persona no tiene datos»
    [200, { paquete: { completo: true } }], // paquete a medias
    [401, null],
    [403, null],
    [503, null],
  ] as const) {
    const r = interpretarExport(status, json)
    assert.notEqual(r.estado, 'ok', `status ${status} se está leyendo como un paquete bueno`)
  }
})

test('un paquete de verdad SÍ es ok, y trae sus nueve apartados', () => {
  const r = interpretarExport(200, { estado: 'ok', paquete: paqueteJson() })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.paquete.apartados.length, CATEGORIAS_EXPORT.length)
})

test('🚨 un paquete al que le FALTA un apartado no se entrega como bueno', () => {
  // Un documento del art. 15 sin uno de sus apartados y uno completo se ven
  // igual en pantalla, y el que se descarga es el que se le manda a la persona.
  const corto = paqueteJson()
  corto.apartados = corto.apartados.slice(1)
  assert.equal(leerPaquete(corto), null)
  assert.equal(interpretarExport(200, { estado: 'ok', paquete: corto }).estado, 'error')
})

test('🚨 un apartado «incluido» SIN filas es ilegible, no «cero registros»', () => {
  const base = {
    categoria: 'bienes', titulo: 't', descripcion: 'd', origen: 'aportado_por_ti',
    portable: true, incluida: true,
  }
  assert.equal(leerApartado(base), null, 'un apartado incluido sin filas se está dando por bueno')
  assert.notEqual(leerApartado({ ...base, filas: [] }), null, 'una lista vacía SÍ es una respuesta')
})

test('🚨 un apartado ausente SIN motivo no pasa: «no hay» tiene que decir por qué', () => {
  const base = {
    categoria: 'bienes', titulo: 't', descripcion: 'd', origen: 'aportado_por_ti',
    portable: true, incluida: false,
  }
  assert.equal(leerApartado(base), null)
  assert.notEqual(leerApartado({ ...base, motivo: MOTIVO_TEXTO.sin_datos }), null)
})

test('🚨 una categoría que esta pantalla no conoce NO se pinta «por si acaso»', () => {
  const fila = {
    categoria: 'algo_nuevo', titulo: 't', descripcion: 'd', origen: 'aportado_por_ti',
    portable: true, incluida: true, filas: [],
  }
  assert.equal(leerApartado(fila), null)
})

test('🚨 solo `no_consultable` cuenta como hueco: «no tienes» y «no procede» son respuestas', () => {
  const json = paqueteJson({ completo: false })
  const apartados = json.apartados as Record<string, unknown>[]
  apartados[1] = { ...apartados[1], incluida: false, filas: undefined, motivo: MOTIVO_TEXTO.sin_datos }
  apartados[2] = { ...apartados[2], incluida: false, filas: undefined, motivo: MOTIVO_TEXTO.no_aplica }
  apartados[3] = { ...apartados[3], incluida: false, filas: undefined, motivo: MOTIVO_TEXTO.no_consultable }
  const p = leerPaquete(json)
  assert.notEqual(p, null)
  const huecos = apartadosIncompletos(p as PaqueteExport)
  assert.equal(huecos.length, 1, 'se están contando como huecos respuestas que sí se dieron')
  assert.equal(huecos[0].categoria, CATEGORIAS_EXPORT[3])
})

test('🚨 el contador tiene TRES desenlaces y solo el paquete entero vale 0', () => {
  // no llamar = no se ha pedido nada · `null` = se pidió y no hay paquete ·
  // número = apartados sin consultar. Un 0 en un fallo diría «nada pendiente».
  for (const r of [
    { estado: 'error', motivo: 'red' },
    { estado: 'sin_configurar' },
    { estado: 'no_encontrado' },
  ] as const) {
    assert.equal(contadorExport(r), null, `${r.estado} está reportando un número`)
  }
  const entero = leerPaquete(paqueteJson()) as PaqueteExport
  assert.equal(contadorExport({ estado: 'ok', paquete: entero }), 0)
})

test('el identificador se comprueba ANTES de llamar: un dedazo no es «no existe»', () => {
  assert.equal(identidadValida(IDENTIDAD), true)
  assert.equal(identidadValida(` ${IDENTIDAD} `), true)
  for (const malo of ['', 'jose suarez', '12345678Z', IDENTIDAD.slice(0, -1)]) {
    assert.equal(identidadValida(malo), false, `«${malo}» se está mandando al puerto`)
  }
})

test('el nombre del fichero no lleva ningún dato personal dentro', () => {
  const n = nombreFicheroExport(IDENTIDAD, '2026-09-20T10:00:00.000Z')
  assert.equal(n, `rgpd-art15-${IDENTIDAD}-2026-09-20.json`)
})

// ─── Cepos sobre el fuente ───────────────────────────────────────────────────
// Se lee SIN COMENTARIOS: los de estos ficheros explican justamente lo que se
// vigila, así que un cepo casaría dentro del comentario y seguiría verde sobre
// el código que ha quitado la línea.

test('🚨 el proxy exige sesión de la correduría y NO expone un GET', () => {
  // Un GET de esto lo dispara un prefetch, queda en el historial del navegador
  // y en los logs de acceso, y se comparte por enlace. Lo que devuelve es el
  // expediente completo de una persona.
  const src = sinComentarios(leer(RUTA))
  assert.match(src, /await exigirCorreduria\(\)/, 'el proxy no comprueba el acceso a la correduría')
  assert.match(src, /if \(!guarda\.ok\) return guarda\.respuesta/)
  assert.ok(!/export async function GET/.test(src), 'el export se puede disparar con un GET')
})

test('🚨 el `actor` lo pone el SERVIDOR desde la sesión y va el ÚLTIMO', () => {
  const src = sinComentarios(leer(RUTA))
  assert.match(
    src,
    /\{ \.\.\.\(json as Record<string, unknown>\), generadoPor: session\.email \}/,
    'el actor no va después de lo que manda el puerto: quien llama podría firmar con otro nombre',
  )
  assert.ok(!/body\??\.(actor|generadoPor)/.test(src), 'se está leyendo el actor del cuerpo de la petición')
})

test('🚨 el fichero que se descarga es el que construyó asegura, sin añadidos', () => {
  // El paquete se le entrega a un interesado: meterle dentro el correo del
  // corredor, o cualquier cosa que ponga esta app, es cambiar una prueba.
  const src = sinComentarios(leer(PANTALLA))
  assert.match(src, /JSON\.stringify\(paquete, null, 2\)/)
  assert.ok(!/JSON\.stringify\(\{[\s\S]{0,120}paquete/.test(src), 'la descarga lleva algo envolviendo al paquete')
})

test('🚨 la pantalla no deja que un fallo se lea como «esa persona no tiene datos»', () => {
  const src = sinComentarios(leer(PANTALLA))
  assert.match(src, /NO significa que no haya datos/, 'un fallo de generación se está pintando en silencio')
  assert.match(src, /INCOMPLETO/, 'un paquete incompleto no se declara al generarlo')
  assert.match(src, /No lo entregues así sin decirlo/, 'nada avisa de que ese paquete no se puede mandar tal cual')
})

test('la pantalla reporta su contador por el helper, no con un número a mano', () => {
  const src = sinComentarios(leer(PANTALLA))
  assert.match(src, /avisar\.current\?\.\(contadorExport\(r\)\)/)
  assert.match(src, /useRef\(onContador\)/, 'el callback del padre no va en una ref: relanzaría el fetch en bucle')
  // 🚨 El tercer desenlace («aún no se ha pedido nada») se expresa NO llamando
  // al padre: una sola llamada, y dentro del intento. Si apareciera otra —en el
  // montaje, por ejemplo— reportaría `null` sin que nadie haya pedido nada y la
  // pestaña pintaría un `!` de alarma nada más abrir la pantalla.
  assert.equal(src.match(/avisar\.current\?\./g)?.length, 1, 'el contador se reporta desde más de un sitio')
})
