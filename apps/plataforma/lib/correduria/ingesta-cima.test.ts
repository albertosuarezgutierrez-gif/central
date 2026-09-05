import test from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarIngesta,
  saludDesdeRespuesta,
  interpretarHuerfanas,
  polizasDe,
} from './ingesta-cima.ts'

const OK = {
  estado: 'ok',
  cuarentena: [
    { tipo: 'SIN', entidad: 'C0468', dias: 2 },
    { tipo: 'REC', entidad: 'C0468', dias: 60 },
  ],
  huerfanas: 19,
  primaPerdida: 7721.71,
  diasSinPersistir: { POL: 7, REC: 8, SIN: 61, CEF: null },
}

test('respuesta buena: degradada, con la prima y la compañía señaladas', () => {
  const r = interpretarIngesta(200, OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.estado, 'degradada')
  assert.equal(r.salud.total, 2)
  assert.equal(r.salud.recientes, 1)
  assert.equal(r.salud.huerfanas, 19)
  assert.equal(r.salud.primaPerdida, 7721.71)
  assert.equal(r.salud.porEntidad[0].entidad, 'C0468')
  assert.match(r.salud.motivos.join(' '), /SIN: 61 días sin guardar/)
})

test('«sin configurar» y «error» NO se confunden entre sí', () => {
  assert.deepEqual(interpretarIngesta(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarIngesta(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarIngesta(401, {}), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('🚨 una respuesta rota degrada a «no se ha podido mirar», nunca a «no hay nada atascado»', () => {
  for (const rota of [
    { estado: 'ok' },
    { estado: 'ok', cuarentena: 'muchos' },
    { estado: 'ok', cuarentena: [{ tipo: 'SIN' }] },
    null,
  ]) {
    const r = interpretarIngesta(200, rota)
    assert.equal(r.estado, 'error', JSON.stringify(rota))
    assert.equal(saludDesdeRespuesta(r).estado, 'sin_datos')
  }
})

test('cuarentena vacía sí es «comprobado que no hay»', () => {
  const r = interpretarIngesta(200, { estado: 'ok', cuarentena: [], huerfanas: 0 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.estado, 'ok')
  assert.equal(r.salud.total, 0)
})

test('un fallo de red se convierte en sin_datos, no en silencio', () => {
  assert.equal(saludDesdeRespuesta({ estado: 'error', motivo: 'red' }).estado, 'sin_datos')
  assert.equal(saludDesdeRespuesta({ estado: 'sin_configurar' }).estado, 'sin_datos')
})

test('los campos opcionales ausentes son null, no cero', () => {
  const r = interpretarIngesta(200, { estado: 'ok', cuarentena: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.huerfanas, null)
  assert.equal(r.salud.primaPerdida, null)
})

test('un puerto ANTERIOR a la clave de mediador sigue siendo legible', () => {
  // Rechazar la respuesta por un campo que la versión desplegada no manda
  // convertiría «versión vieja» en «no se ha podido mirar».
  const r = interpretarIngesta(200, {
    estado: 'ok',
    cuarentena: [{ tipo: 'REC', entidad: 'C0468', dias: 2 }],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.salud.porClave, [{ entidad: 'C0468', clave: null, n: 1 }])
  assert.equal(r.salud.huerfanasResolubles, null)
})

test('la clave de mediador viaja hasta el veredicto', () => {
  const r = interpretarIngesta(200, {
    estado: 'ok',
    cuarentena: [{ tipo: 'SIN', entidad: 'C0468', clave: '8-92361', dias: 1 }],
    huerfanas: 20,
    huerfanasResolubles: 3,
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.salud.porClave, [{ entidad: 'C0468', clave: '8-92361', n: 1 }])
  assert.equal(r.salud.huerfanasResolubles, 3)
})

test('🚨 una clave con tipo raro no se cuela como dato', () => {
  const r = interpretarIngesta(200, {
    estado: 'ok',
    cuarentena: [{ tipo: 'SIN', entidad: 'C0468', clave: 42, dias: 1 }],
  })
  assert.equal(r.estado, 'error')
})

// ── Envíos rechazados por el puerto (04/09/2026) ────────────────────────────

test('🚨 los envíos RECHAZADOS llegan hasta el veredicto y lo degradan', () => {
  const r = interpretarIngesta(200, {
    estado: 'ok',
    cuarentena: [],
    rechazos: [
      { evento: 'codeoscopic_webhook_invalid_payload', origen: 'webhook_codeoscopic', n: 23, horasDesdeUltimo: 0 },
    ],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.estado, 'degradada')
  assert.match(r.salud.motivos.join(' · '), /23 envío\(s\) RECHAZADOS/)
})

test('🚨 un puerto VIEJO que no informa `rechazos` deja null, no lista vacía', () => {
  // `central-asegura` desplegado antes de este cambio no manda el campo.
  // Leerlo como «se miró y no hay» sería inventarse una comprobación.
  const r = interpretarIngesta(200, { estado: 'ok', cuarentena: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.rechazos, null)
  assert.equal(r.salud.estado, 'ok')
})

test('🚨 una fila de rechazo ilegible degrada la lista ENTERA a «no comprobado»', () => {
  // Quedarse con las que se entienden daría un recuento más bajo que la
  // realidad, que es la forma tranquilizadora de equivocarse.
  const r = interpretarIngesta(200, {
    estado: 'ok',
    cuarentena: [],
    rechazos: [
      { evento: 'a_invalid_payload', origen: 'x', n: 3, horasDesdeUltimo: 1 },
      { evento: 'b_invalid_payload', origen: 'y', n: 'muchos', horasDesdeUltimo: 1 },
    ],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.rechazos, null)
})

test('un rechazo sin hora ni origen se acepta: son huecos declarados, no basura', () => {
  const r = interpretarIngesta(200, {
    estado: 'ok',
    cuarentena: [],
    rechazos: [{ evento: 'a_invalid_payload', origen: null, n: 2, horasDesdeUltimo: null }],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.rechazos?.length, 1)
  assert.equal(r.salud.estado, 'ok', 'sin hora no se puede afirmar que sea de ahora')
})

test('un fallo de red sigue dejando los rechazos en «no comprobado»', () => {
  assert.equal(saludDesdeRespuesta({ estado: 'error', motivo: 'red' }).rechazos, null)
})

// ── Silencio por compañía (05/09/2026) ───────────────────────────────────────

test('un puerto ANTIGUO (sin `entidades`) deja el silencio en null, no en «ninguna»', () => {
  // Es la misma regla que ya protege a `rechazos`: una versión desplegada antes
  // de que existiera el campo no puede leerse como «se miró y no hay ninguna
  // compañía callada». Eso volvería a poner el vigía en verde sobre Mapfre.
  const r = interpretarIngesta(200, { estado: 'ok', cuarentena: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.silencio, null)
})

test('una fila de entidad ilegible degrada la lista ENTERA', () => {
  // Juzgar solo a las compañías que se entienden dejaría fuera precisamente a
  // la que viene rara, que es la candidata a estar rota.
  const r = interpretarIngesta(200, {
    estado: 'ok', cuarentena: [],
    entidades: [
      { entidad: 'C0468', diasSinFichero: 6, huecoMaximo: 9, huecosObservados: 24, vivas: 19, vencidasEnSilencio: 0 },
      { entidad: 'C0058', diasSinFichero: 'setenta y cuatro' },
    ],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.silencio, null)
})

test('con los datos reales de Mapfre el veredicto llega degradado', () => {
  const r = interpretarIngesta(200, {
    estado: 'ok', cuarentena: [], rechazos: [],
    entidades: [
      { entidad: 'C0058', diasSinFichero: 74, huecoMaximo: 2, huecosObservados: 2, vivas: 64, vencidasEnSilencio: 7, vencen90d: 12 },
      { entidad: 'C0468', diasSinFichero: 6, huecoMaximo: 9, huecosObservados: 24, vivas: 19, vencidasEnSilencio: 0, vencen90d: 0 },
    ],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.estado, 'degradada')
  const mudas = (r.salud.silencio ?? []).filter(e => e.veredicto === 'silencio').map(e => e.entidad)
  assert.deepEqual(mudas, ['C0058'], 'solo Mapfre: Occident va dentro de su ritmo')
})

// ── La lista de huérfanas: `null` ≠ `[]` también en el transporte (05/09/2026) ─

const HUERFANA = {
  entidad: 'C0468',
  entidadNombre: 'Occident',
  clave: 'M00171',
  idPolizaEntidad: 'BIDP036783',
  recibos: 2,
  siniestros: 0,
  prima: 470.76,
  ultimoEn: '2026-08-18',
  enCartera: 'ausente',
}

test('el puerto de huérfanas responde bien: la lista llega entera', () => {
  const h = interpretarHuerfanas(200, {
    estado: 'ok', polizas: [HUERFANA], truncado: false, ocultasOtroAmbito: 0,
  })
  assert.equal(h.estado, 'ok')
  if (h.estado !== 'ok') return
  assert.equal(h.polizas.length, 1)
  assert.equal(h.polizas[0].idPolizaEntidad, 'BIDP036783')
  assert.equal(h.truncado, false)
  assert.equal(h.ocultasOtroAmbito, 0)
})

test('🚨 un 404 (asegura vieja, sin ese puerto) NO es «no hay huérfanas»', () => {
  const h = interpretarHuerfanas(404, null)
  assert.deepEqual(h, { estado: 'sin_datos', motivo: 'puerto_no_desplegado' })
  assert.equal(polizasDe(h), null)
})

test('🚨 error del puerto: viaja la CAUSA y NUNCA se degrada a lista vacía', () => {
  const h = interpretarHuerfanas(200, { estado: 'error', causa: 'credenciales' })
  assert.deepEqual(h, { estado: 'sin_datos', motivo: 'credenciales' })
  assert.equal(polizasDe(h), null)
})

test('una sola fila ilegible degrada la lista ENTERA, no se queda con las buenas', () => {
  const h = interpretarHuerfanas(200, {
    estado: 'ok', polizas: [HUERFANA, { ...HUERFANA, enCartera: 'quizas' }], truncado: false,
  })
  assert.equal(h.estado, 'sin_datos')
})

test('🚨 `enCartera` se EXIGE: decide si se pide o se reprocesa y no se supone', () => {
  const { enCartera: _fuera, ...sinEstado } = HUERFANA
  const h = interpretarHuerfanas(200, { estado: 'ok', polizas: [sinEstado], truncado: false })
  assert.equal(h.estado, 'sin_datos')
})

test('sin decir si recortó, se ASUME que sí (el estado conservador)', () => {
  const h = interpretarHuerfanas(200, { estado: 'ok', polizas: [HUERFANA] })
  assert.equal(h.estado === 'ok' && h.truncado, true)
  // Y un recuento de ocultas que no viene es `null`, jamás 0.
  assert.equal(h.estado === 'ok' ? h.ocultasOtroAmbito : 'x', null)
})

test('la lista llega hasta la salud, repartida por lo que hay que hacer', () => {
  const r = interpretarIngesta(
    200,
    { estado: 'ok', cuarentena: [], huerfanas: 2, huerfanasResolubles: 1 },
    {
      estado: 'ok',
      truncado: false,
      ocultasOtroAmbito: 0,
      polizas: [
        HUERFANA,
        { ...HUERFANA, idPolizaEntidad: '549570971', enCartera: 'viva' },
      ],
    } as never,
  )
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.huerfanasReparto?.totalPedir, 1)
  assert.equal(r.salud.huerfanasReparto?.totalReprocesar, 1)
  assert.match(r.salud.motivos.join(' · '), /Occident \(C0468\) \/ clave M00171/)
  assert.equal(r.huerfanasTruncadas, false)
  assert.equal(r.huerfanasSinAmbito, 0)
})

test('🚨 sin listado, la salud lo DICE en vez de callarlo', () => {
  const r = interpretarIngesta(200, { estado: 'ok', cuarentena: [], huerfanas: 20 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.salud.huerfanasReparto, null)
  assert.match(r.salud.motivos.join(' · '), /sé cuántas son, no cuáles/)
  assert.equal(r.huerfanasSinAmbito, null)
})
