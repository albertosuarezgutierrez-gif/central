import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MEDIADOR,
  NO_EXCLUSIVIDAD,
  CANALES_RECLAMACION,
  PUNTOS_PRECONTRACTUALES,
  VERSION_TEXTOS_LEGALES,
  FECHA_TEXTOS_LEGALES,
  lineaIdentificacion,
} from './mediador.ts'

// Estos tests no comprueban «que compile»: comprueban que no se pueda borrar en
// silencio un apartado que la Ley 16/2018 obliga a enseñar. Un pie de página al
// que le falta la clave DGSFP tiene exactamente el mismo aspecto que uno completo.

test('la clave DGSFP y el NIF salen en la linea de identificacion', () => {
  const linea = lineaIdentificacion()
  assert.ok(linea.includes(MEDIADOR.identidad.claveDgsfp), 'falta la clave DGSFP')
  assert.ok(linea.includes(MEDIADOR.identidad.nif), 'falta el NIF')
  assert.ok(linea.includes(MEDIADOR.identidad.nombre), 'falta el nombre del mediador')
})

test('estan los cuatro apartados del art. 19 LDS y ninguno vacio', () => {
  const ids = PUNTOS_PRECONTRACTUALES.map((p) => p.id)
  for (const obligatorio of ['identidad', 'independencia', 'remuneracion', 'reclamaciones']) {
    assert.ok(ids.includes(obligatorio as (typeof ids)[number]), `falta el apartado ${obligatorio}`)
  }
  for (const punto of PUNTOS_PRECONTRACTUALES) {
    assert.ok(punto.titulo.trim().length > 0, `${punto.id} sin título`)
    assert.ok(punto.cuerpo.trim().length > 40, `${punto.id} con un cuerpo demasiado corto para decir nada`)
  }
})

test('el apartado de identidad arrastra los datos canonicos, no una copia a mano', () => {
  const identidad = PUNTOS_PRECONTRACTUALES.find((p) => p.id === 'identidad')
  assert.ok(identidad)
  assert.ok(identidad.cuerpo.includes(MEDIADOR.identidad.claveDgsfp))
  assert.ok(identidad.cuerpo.includes(MEDIADOR.identidad.domicilio))
})

test('el SAC va ANTES que la DGSFP: el orden de los canales es el legal', () => {
  // Enseñarlos al revés empuja al cliente a reclamar al supervisor sin haber
  // pasado por la correduría, que es justo lo que la norma quiere evitar.
  const orden = CANALES_RECLAMACION.map((c) => c.id)
  assert.ok(orden.indexOf('sac') < orden.indexOf('dgsfp'), 'el SAC tiene que ir primero')
  assert.ok(orden.includes('aepd'), 'falta el canal de protección de datos')
})

test('todos los canales de reclamacion son alcanzables', () => {
  for (const canal of CANALES_RECLAMACION) {
    assert.match(canal.href, /^(https:\/\/|mailto:)/, `${canal.id} sin destino usable`)
    assert.ok(canal.detalle.trim().length > 0, `${canal.id} sin explicación de cuándo usarlo`)
  }
})

test('la no exclusividad menciona el umbral del 10 % en las dos direcciones', () => {
  // El art. 19.1.b pide declarar las participaciones en AMBOS sentidos. Decir
  // solo una mitad es una declaración incompleta que parece completa.
  assert.equal(NO_EXCLUSIVIDAD.split('10 %').length - 1, 2, 'el umbral tiene que declararse en los dos sentidos')
  assert.ok(/participación directa o indirecta/i.test(NO_EXCLUSIVIDAD), 'falta la participación DEL mediador')
  assert.ok(/entidad aseguradora participa/i.test(NO_EXCLUSIVIDAD), 'falta la participación EN el mediador')
  assert.ok(/no mantiene vinculación contractual exclusiva/i.test(NO_EXCLUSIVIDAD))
})

test('la version de los textos legales es sellable en un consentimiento', () => {
  // Se guarda tal cual en `portal_consentimiento.version_texto`. Sin formato
  // estable, dos consentimientos del mismo texto no se pueden comparar.
  assert.match(VERSION_TEXTOS_LEGALES, /^\d{4}-\d{2}-v\d+$/)
  assert.match(FECHA_TEXTOS_LEGALES, /^\d{4}-\d{2}-\d{2}$/)
})

test('la correduria tiene UN solo correo, y es el que sale en todos los canales', () => {
  // Alberto, 04/09/2026: «solo quiero usar un mail hola@grupoasegura.es». Dos
  // buzones para el mismo mediador reparten las quejas entre uno que se mira y
  // otro que no, y el que no se mira incumple el plazo de respuesta del SAC.
  assert.equal(MEDIADOR.identidad.email, 'hola@grupoasegura.es')

  const texto = JSON.stringify({ MEDIADOR, CANALES_RECLAMACION, PUNTOS_PRECONTRACTUALES })
  assert.ok(!texto.includes('info@grupoasegura'), 'ha vuelto el correo antiguo de la web pública')

  // Y el canal del SAC tiene que ser ESE correo, no otro cualquiera.
  const sac = CANALES_RECLAMACION.find((c) => c.id === 'sac')
  assert.ok(sac)
  assert.equal(sac.contacto, MEDIADOR.identidad.email)
  assert.equal(sac.href, `mailto:${MEDIADOR.identidad.email}`)
})

test('no se declara ninguna lista de ramos ni ningun DPO sin comprobar', () => {
  // Guardián de una omisión DELIBERADA: la inscripción por ramos en el registro
  // de la DGSFP no se ha mirado, y el DPO no está confirmado. Si alguien los
  // añade, que sea con el dato delante y borrando este test a conciencia.
  const texto = JSON.stringify({ MEDIADOR, PUNTOS_PRECONTRACTUALES, NO_EXCLUSIVIDAD })
  assert.ok(!/\bramos?\b/i.test(texto), 'se ha colado una declaración de ramos sin verificar')
  assert.ok(!/\bDPO\b|delegado de protecci/i.test(texto), 'se ha colado un DPO sin confirmar')
})
