// Cepos del canal de la compañía. Lee `canal-compania.ts` antes: aquí solo se
// comprueba que sus cuatro prohibiciones sigan en pie dentro de tres meses.
//
// Los que de verdad importan y no se ven a simple vista:
//   · un WhatsApp NO se convierte en un teléfono al que llamar
//   · «no lo hemos verificado» NO se convierte en «esta compañía no tiene»
//   · un horario que falta NO se rellena con «24 h»
//   · la asistencia NO hereda el horario del canal de dar parte

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TEXTO_SIN_CANAL,
  canalDeCompania,
  canalesDeLasPolizas,
  enlaceWhatsapp,
  viasDeCompania,
  type FilaCompania,
} from './canal-compania.ts'

const VACIA: FilaCompania = {
  nombreComun: 'Occident',
  telefonoSiniestros: null,
  telefonoAsistencia: null,
  whatsappSiniestros: null,
  horarioSiniestros: null,
  verificadoEn: null,
}

// Las cuatro de la cartera viva, medidas el 05/09/2026.
const OCCIDENT: FilaCompania = {
  ...VACIA,
  whatsappSiniestros: '+34917838383',
  horarioSiniestros: '9h a 21h, de lunes a viernes',
  verificadoEn: '2026-09-05',
}
const MAPFRE: FilaCompania = {
  nombreComun: 'Mapfre',
  telefonoSiniestros: '900 122 122',
  telefonoAsistencia: '900 122 122',
  whatsappSiniestros: null,
  horarioSiniestros: null,
  verificadoEn: '2026-09-05',
}

test('un WhatsApp NUNCA sale como un teléfono al que llamar', () => {
  const vias = viasDeCompania(OCCIDENT)
  assert.equal(vias.length, 1)
  assert.equal(
    vias[0].tipo,
    'whatsapp',
    'Occident hoy solo tiene canal de WhatsApp. Colapsarlo en «telefono» haría que la pantalla ' +
      'dijera «llama a este número» de una línea que puede no atender voz — y quien lo descubre es ' +
      'el que acaba de tener un golpe.',
  )
  // Y no se cuela por la puerta de atrás: NINGUNA vía de tipo teléfono existe.
  assert.equal(vias.filter((v) => v.tipo === 'telefono').length, 0)
})

test('el enlace de WhatsApp exige E.164, y si no, la vía NO existe', () => {
  assert.equal(enlaceWhatsapp('+34917838383'), 'https://wa.me/34917838383')
  // El caso real: alguien pega el número «tal y como se ve» en el perfil.
  for (const malo of ['+34 917 83 83 83', '917838383', '', '  ', 'wa.me/34917838383', null]) {
    assert.equal(
      enlaceWhatsapp(malo as string | null),
      null,
      `«${String(malo)}» no puede producir enlace: uno mal construido NO falla, abre WhatsApp con ` +
        'un número que no existe, y eso solo se descubre el día que hace falta.',
    )
  }
  // Un valor malo en la columna no produce una vía rota: produce ninguna vía.
  assert.deepEqual(viasDeCompania({ ...VACIA, whatsappSiniestros: '+34 917 83 83 83' }), [])
})

test('«no lo hemos verificado» NO es «esta compañía no tiene»', () => {
  const c = canalDeCompania('Occident', [VACIA])
  assert.equal(c.sinDatos, true)
  assert.deepEqual(c.vias, [])
  assert.match(
    TEXTO_SIN_CANAL,
    /[Pp]ídenoslo/,
    'El texto de la ausencia tiene que mandar a pedirlo, no dejar un hueco que se lee como «no hay».',
  )
  assert.doesNotMatch(
    TEXTO_SIN_CANAL,
    /no tiene|no dispone|carece/i,
    'Afirmar que la compañía no tiene teléfono es convertir un «no lo sé» en un hecho.',
  )
})

test('una póliza que no cruza con ninguna compañía degrada a «pídenoslo», nunca a otra compañía', () => {
  // El caso real: una póliza APORTADA cuyo nombre lo leyó una IA de un PDF.
  const c = canalDeCompania('MAPFRE ESPAÑA S.A.', [MAPFRE, OCCIDENT])
  assert.equal(
    c.sinDatos,
    true,
    'Sin coincidencia exacta no se adivina: una coincidencia aproximada acertaría casi siempre y ' +
      'alguna vez enseñaría el teléfono de urgencias de OTRA compañía.',
  )
  assert.deepEqual(c.vias, [])
  assert.equal(canalDeCompania(null, [MAPFRE]).sinDatos, true)
  assert.equal(canalDeCompania('   ', [MAPFRE]).sinDatos, true)
  // Lo que SÍ tolera: caja y espacios de sobra, que no cambian de compañía.
  assert.equal(canalDeCompania('  mapfre ', [MAPFRE]).vias.length, 2)
})

test('un horario que falta se queda a null: NADIE lo rellena con «24 h»', () => {
  const vias = viasDeCompania(MAPFRE)
  for (const v of vias) {
    assert.equal(
      v.horario,
      null,
      'Mapfre no tiene horario verificado. Inferir «24 h» de un horario ausente es la promesa que ' +
        'se rompe un sábado por la noche.',
    )
  }
  // Y ni el tipo ni el texto de salida pueden llevar esa palabra escondida.
  assert.equal(JSON.stringify(vias).includes('24'), false)
})

test('la asistencia NO hereda el horario del canal de dar parte', () => {
  const fila: FilaCompania = {
    ...MAPFRE,
    horarioSiniestros: '9h a 21h, de lunes a viernes',
  }
  const asistencia = viasDeCompania(fila).find((v) => v.tipo === 'telefono' && v.uso === 'asistencia')
  assert.ok(asistencia)
  assert.equal(
    asistencia.horario,
    null,
    'La grúa puede tener otro horario que el de tramitación. Copiarle el del parte es inventarse el ' +
      'dato justo de la vía que se usa a la hora en la que el otro no atiende.',
  )
  const parte = viasDeCompania(fila).find((v) => v.tipo === 'telefono' && v.uso === 'siniestros')
  assert.equal(parte?.horario, '9h a 21h, de lunes a viernes')
})

test('dar parte y asistencia son usos DISTINTOS y no se colapsan', () => {
  // Mapfre publica el MISMO número para las dos cosas. Deduplicarlo «porque es
  // el mismo» borraría que una de las dos es la grúa, que es la que hace falta
  // en el arcén.
  const vias = viasDeCompania(MAPFRE)
  assert.equal(vias.length, 2)
  assert.deepEqual(
    vias.map((v) => (v.tipo === 'telefono' ? v.uso : v.tipo)),
    ['siniestros', 'asistencia'],
  )
})

test('la fecha de verificación viaja, y sin vías NO se enseña', () => {
  assert.equal(canalDeCompania('Occident', [OCCIDENT]).verificadoEn, '2026-09-05')
  assert.equal(
    canalDeCompania('Occident', [{ ...VACIA, verificadoEn: '2026-09-05' }]).verificadoEn,
    null,
    'Sin ninguna vía, esa fecha es «cuándo comprobamos que no teníamos nada» — en pantalla se ' +
      'leería como «verificado».',
  )
})

test('el orden es FIJO: dar parte, WhatsApp, asistencia', () => {
  // No es un ranking. Ordenar por «el que atiende siempre» exigiría saber cuál
  // atiende siempre, que es justo el dato que no tenemos.
  const todo: FilaCompania = {
    ...MAPFRE,
    whatsappSiniestros: '+34917838383',
  }
  assert.deepEqual(
    viasDeCompania(todo).map((v) => (v.tipo === 'telefono' ? `telefono:${v.uso}` : v.tipo)),
    ['telefono:siniestros', 'whatsapp', 'telefono:asistencia'],
  )
})

test('el camino urgente NO esconde a una compañía por no tener número', () => {
  const conDatos = canalDeCompania('Occident', [OCCIDENT])
  const sinDatos = canalDeCompania('Allianz', [{ ...VACIA, nombreComun: 'Allianz' }])
  const lista = canalesDeLasPolizas([conDatos, sinDatos, conDatos])

  assert.equal(lista.length, 2, 'Se colapsan las repetidas: dos pólizas de Occident no son dos bloques.')
  assert.ok(
    lista.some((c) => c.nombre === 'Allianz' && c.sinDatos),
    'Filtrar las que no tienen número las hace desaparecer de la pantalla, y eso se lee como «con esa ' +
      'no hay nada que hacer». Lo cierto es que no lo hemos verificado, y eso es lo que hay que decir.',
  )
})

test('una póliza sin compañía identificada NO genera un «pídenoslo» de nadie', () => {
  // El caso real: una póliza aportada cuyo PDF no dejó leer la compañía.
  const anonima = canalDeCompania(null, [MAPFRE])
  assert.deepEqual(canalesDeLasPolizas([anonima]), [], 'Sin nombre no hay a quién pedirle nada: es ruido.')
})
