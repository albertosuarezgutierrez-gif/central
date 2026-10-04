import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saludIngesta,
  detalleSalud,
  DIAS_CUARENTENA_RECIENTE,
  HORAS_RECHAZO_RECIENTE,
  decidirAvisoIngesta,
  firmaAvisoIngesta,
  normalizarFirmaIngesta,
  decidirRespaldoPull,
  HORAS_RESPALDO_PULL,
  repartirHuerfanas,
  textoHuerfanas,
  TOPE_POLIZAS_TELEGRAM,
  DIAS_GRACIA_RENOVACION,
  textoRenovacionesSinLlegar,
  HORAS_EMISION_SIN_AVISO,
  textoEmisionesSinAviso,
  textoPolizasDuplicadas,
  cambioDuplicadasEnFirma,
  type EmisionSinAviso,
  type PolizaHuerfana,
  type FicheroParcial,
  type RenovacionSinLlegar,
} from './ingesta.ts'

const f = (tipo: string, entidad: string, dias: number) => ({ tipo, entidad, dias })

test('un campo importante sin leer se imprime SIEMPRE, aunque no haya ninguna otra avería (ok)', () => {
  const s = saludIngesta({
    cuarentena: [],
    camposImportantes: [
      { id: 'tomador_contacto', etiqueta: 'domicilio y contacto del tomador', vecesVisto: 4 },
    ],
  })
  assert.equal(s.estado, 'ok')
  assert.equal(s.avisosImportantes.length, 1)
  assert.match(detalleSalud(s), /CIMA manda y no se lee: domicilio y contacto del tomador/)
})

test('sin watchlist, no hay ningún aviso importante que imprimir', () => {
  const s = saludIngesta({ cuarentena: [] })
  assert.deepEqual(s.avisosImportantes, [])
  assert.doesNotMatch(detalleSalud(s), /CIMA manda y no se lee/)
})

test('el aviso importante NO fuerza `degradada`: es una oportunidad, no una avería', () => {
  const s = saludIngesta({
    cuarentena: [],
    camposImportantes: [{ id: 'x', etiqueta: 'x', vecesVisto: 4 }],
  })
  assert.equal(s.estado, 'ok')
})

test('el aviso importante también se ve en degradada, además de los motivos de la avería', () => {
  const s = saludIngesta({
    cuarentena: [f('SIN', 'C0468', 2)],
    camposImportantes: [{ id: 'x', etiqueta: 'x importante', vecesVisto: 4 }],
  })
  assert.equal(s.estado, 'degradada')
  assert.match(detalleSalud(s), /DEGRADADA/)
  assert.match(detalleSalud(s), /CIMA manda y no se lee: x importante/)
})

test('sin poder leer NO es «está bien»: es sin_datos y lo dice', () => {
  const s = saludIngesta({ cuarentena: null })
  assert.equal(s.estado, 'sin_datos')
  assert.match(s.motivos[0], /NO significa que vaya bien/)
  assert.match(detalleSalud(s), /no se ha podido comprobar/)
})

test('lista vacía SÍ es «comprobado que no hay»', () => {
  const s = saludIngesta({ cuarentena: [] })
  assert.equal(s.estado, 'ok')
  assert.equal(s.total, 0)
  assert.match(detalleSalud(s), /sin ficheros atascados/)
})

test('un fichero atascado ESTA semana degrada y señala a la entidad', () => {
  const s = saludIngesta({ cuarentena: [f('SIN', 'C0468', 2), f('REC', 'C0468', 5)] })
  assert.equal(s.estado, 'degradada')
  assert.equal(s.recientes, 2)
  assert.equal(s.porEntidad[0].entidad, 'C0468')
  assert.match(s.motivos[0], /C0468/)
})

test('el backlog viejo se informa pero NO despierta a nadie', () => {
  const s = saludIngesta({ cuarentena: [f('REC', 'C0468', 60), f('SIN', 'C0468', 45)] })
  assert.equal(s.estado, 'ok')
  assert.equal(s.total, 2)
  assert.equal(s.recientes, 0)
  assert.match(detalleSalud(s), /backlog antiguo/)
})

test('el caso real del 01/09: 41 en cuarentena, uno de anteayer → degradada', () => {
  const viejos = Array.from({ length: 40 }, () => f('REC', 'C0468', 50))
  const s = saludIngesta({ cuarentena: [...viejos, f('SIN', 'C0468', 2)], huerfanas: 19, primaPerdida: 7721.71 })
  assert.equal(s.estado, 'degradada')
  assert.equal(s.total, 41)
  assert.equal(s.recientes, 1)
  assert.equal(s.huerfanas, 19)
  assert.equal(s.primaPerdida, 7721.71)
  assert.match(s.motivos.join(' '), /no encuentran su póliza/)
  assert.match(s.motivos.join(' '), /40 más arrastrados/)
})

test('pólizas huérfanas degradan aunque no haya nada reciente en cuarentena', () => {
  const s = saludIngesta({ cuarentena: [], huerfanas: 3 })
  assert.equal(s.estado, 'degradada')
})

test('huérfanas a cero es distinto de huérfanas sin medir', () => {
  assert.equal(saludIngesta({ cuarentena: [], huerfanas: 0 }).huerfanas, 0)
  assert.equal(saludIngesta({ cuarentena: [] }).huerfanas, null)
  assert.equal(saludIngesta({ cuarentena: [], huerfanas: null }).huerfanas, null)
})

test('un tipo que lleva más de un mes sin guardar nada se canta', () => {
  const s = saludIngesta({ cuarentena: [f('SIN', 'C0468', 1)], diasSinPersistir: { SIN: 61, REC: 3 } })
  assert.match(s.motivos.join(' '), /SIN: 61 días sin guardar/)
  assert.doesNotMatch(s.motivos.join(' '), /REC: 3/)
})

test('«no consta» en días sin persistir no inventa una alarma', () => {
  const s = saludIngesta({ cuarentena: [], diasSinPersistir: { SIN: null } })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.motivos, [])
})

test('la ventana reciente es configurable y por defecto son 7 días', () => {
  assert.equal(DIAS_CUARENTENA_RECIENTE, 7)
  assert.equal(saludIngesta({ cuarentena: [f('REC', 'C0058', 20)] }).estado, 'ok')
  assert.equal(saludIngesta({ cuarentena: [f('REC', 'C0058', 20)] }, 30).estado, 'degradada')
})

test('el reparto por entidad ordena por volumen: dice a quién preguntar', () => {
  const s = saludIngesta({
    cuarentena: [f('REC', 'C0109', 1), f('REC', 'C0468', 1), f('SIN', 'C0468', 2), f('POL', 'C0468', 3)],
  })
  assert.deepEqual(s.porEntidad, [{ entidad: 'C0468', n: 3 }, { entidad: 'C0109', n: 1 }])
})

test('🔑 el reparto va por CLAVE DE MEDIADOR: una compañía manda por varias', () => {
  // Caso real (01/09/2026): Occident manda por `8-92361`, `M00171` y `306333`.
  // La primera tenía sus 10 SIN en cuarentena mientras la segunda iba bien.
  // Decir solo «C0468» manda a revisar una cartera que no tiene el problema.
  const s = saludIngesta({
    cuarentena: [
      { tipo: 'SIN', entidad: 'C0468', clave: '8-92361', dias: 1 },
      { tipo: 'REC', entidad: 'C0468', clave: '8-92361', dias: 2 },
      { tipo: 'SIN', entidad: 'C0468', clave: 'M00171', dias: 3 },
    ],
  })
  assert.deepEqual(s.porEntidad, [{ entidad: 'C0468', n: 3 }])
  assert.deepEqual(s.porClave, [
    { entidad: 'C0468', clave: '8-92361', n: 2 },
    { entidad: 'C0468', clave: 'M00171', n: 1 },
  ])
  assert.match(s.motivos[0], /clave 8-92361/)
})

test('🚨 una clave ausente o de cajón NO se inventa: se agrupa como «no consta»', () => {
  const s = saludIngesta({
    cuarentena: [
      { tipo: 'REC', entidad: 'C0058', dias: 1 },
      { tipo: 'REC', entidad: 'C0058', clave: '  ', dias: 1 },
      { tipo: 'REC', entidad: 'C0058', clave: 'DESCONOCIDO', dias: 1 },
    ],
  })
  assert.deepEqual(s.porClave, [{ entidad: 'C0058', clave: null, n: 3 }])
  assert.match(s.motivos[0], /clave no legible/)
})

test('🩹 las huérfanas que YA están en cartera se cuentan aparte de las que no', () => {
  // Se arreglan en casa (reprocesar) frente a pedir la carga inicial de esa
  // clave. Contarlas juntas manda a preguntar a la compañía por algo que ya
  // está en la BD.
  const s = saludIngesta({ cuarentena: [], huerfanas: 20, huerfanasResolubles: 3 })
  assert.equal(s.estado, 'degradada')
  assert.equal(s.huerfanasResolubles, 3)
  assert.match(s.motivos.join(' · '), /3 de ellas YA están en la cartera/)
  assert.match(s.motivos.join(' · '), /17 no están en la cartera/)
})

test('🚨 sin saber cuántas son resolubles NO se afirma ninguna de las dos cosas', () => {
  const s = saludIngesta({ cuarentena: [], huerfanas: 20 })
  assert.equal(s.huerfanasResolubles, null)
  assert.doesNotMatch(s.motivos.join(' · '), /YA están en la cartera|no están en la cartera/)
})

// ── Envíos RECHAZADOS: la tercera cara de la misma avería (04/09/2026) ───────

test('🚨 un envío que nos mandan y rechazamos degrada la ingesta', () => {
  // Caso real: Codeoscopic manda un webhook cada 30 min, autenticado, y lo
  // tiramos por una diferencia de forma. No deja fichero en cuarentena ni
  // huérfana, así que sin esto la ingesta salía «ok» perdiendo datos.
  const s = saludIngesta({
    cuarentena: [],
    rechazos: [
      { evento: 'codeoscopic_webhook_invalid_payload', origen: 'webhook_codeoscopic', n: 23, horasDesdeUltimo: 0 },
    ],
  })
  assert.equal(s.estado, 'degradada')
  assert.match(s.motivos.join(' · '), /23 envío\(s\) RECHAZADOS/)
  assert.match(s.motivos.join(' · '), /webhook_codeoscopic/)
})

test('un rechazo VIEJO informa pero no alarma: es historia, no avería en curso', () => {
  const s = saludIngesta({
    cuarentena: [],
    rechazos: [
      { evento: 'x_invalid_payload', origen: 'y', n: 5, horasDesdeUltimo: HORAS_RECHAZO_RECIENTE + 1 },
    ],
  })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.rechazos, [
    { evento: 'x_invalid_payload', origen: 'y', n: 5, horasDesdeUltimo: HORAS_RECHAZO_RECIENTE + 1 },
  ])
})

test('🚨 sin la hora del último rechazo NO se supone que es reciente ni que es viejo', () => {
  const s = saludIngesta({
    cuarentena: [],
    rechazos: [{ evento: 'x_invalid_payload', origen: null, n: 9, horasDesdeUltimo: null }],
  })
  // No alarma (no consta que sea de ahora) pero el dato viaja para que se vea.
  assert.equal(s.estado, 'ok')
  assert.equal(s.rechazos?.[0].n, 9)
})

test('🚨 «no se pudieron mirar los rechazos» NO es «no hay rechazos»', () => {
  const sinMirar = saludIngesta({ cuarentena: [] })
  assert.equal(sinMirar.rechazos, null, 'ausente ⇒ no comprobado, jamás []')
  assert.match(detalleSalud(sinMirar), /envíos rechazados: sin comprobar/)

  const mirado = saludIngesta({ cuarentena: [], rechazos: [] })
  assert.deepEqual(mirado.rechazos, [])
  assert.doesNotMatch(detalleSalud(mirado), /envíos rechazados: sin comprobar/)
})

// La simétrica de la anterior, en la puerta que se abrió el 05/09/2026: el
// silencio por compañía tampoco puede darse por bueno sin haberlo mirado. Se
// comprueba aquí y no en `silencio-entidad.test.ts` porque lo que se vigila es
// que el PARTE lo diga, no que el helper lo calcule.
test('🚨 «no se pudo mirar el silencio» NO es «ninguna compañía se ha callado»', () => {
  const sinMirar = saludIngesta({ cuarentena: [] })
  assert.equal(sinMirar.silencio, null, 'ausente ⇒ no comprobado, jamás []')
  assert.match(detalleSalud(sinMirar), /silencio por compañía: sin comprobar/)

  const mirado = saludIngesta({ cuarentena: [], rechazos: [], silencio: [] })
  assert.deepEqual(mirado.silencio, [])
  assert.doesNotMatch(detalleSalud(mirado), /sin comprobar/)
})

test('una compañía muda pone la ingesta en DEGRADADA aunque no haya nada atascado', () => {
  // El caso Mapfre: cuarentena vacía, cero huérfanas, cero rechazos — y aun así
  // se están perdiendo datos. Sin esta rama el vigía seguiría en verde.
  const s = saludIngesta({
    cuarentena: [],
    rechazos: [],
    silencio: [
      {
        entidad: 'C0058', diasSinFichero: 74, huecoMaximo: 2, huecosObservados: 2,
        vivas: 64, vencidasEnSilencio: 7, vencen90d: 12,
        veredicto: 'silencio', motivos: ['C0058: 74 días sin mandar nada'],
      },
    ],
  })
  assert.equal(s.estado, 'degradada')
  assert.match(detalleSalud(s), /C0058/)
})

test('la ingesta sin datos deja los rechazos en null, no en lista vacía', () => {
  const s = saludIngesta({ cuarentena: null })
  assert.equal(s.estado, 'sin_datos')
  assert.equal(s.rechazos, null)
})

// ── El recordatorio ────────────────────────────────────────────────────────
//
// Este bloque existe por una avería REAL medida el 05/09/2026: el atasco de
// siniestros de Occident llevaba 63 días abierto, el latido lo decía, y el
// Telegram no sonaba desde el 08/07 porque la firma del estado no cambiaba.
// La anti-repetición se había comido el aviso.

const HOY = new Date('2026-09-05T06:45:00Z')

test('la primera vez suena siempre, aunque no conste avería previa', () => {
  const d = decidirAvisoIngesta({ firmaAnterior: null, firmaActual: 'degradada:3:20', ultimoAvisoEn: null, hoy: HOY })
  assert.equal(d.avisar, true)
  assert.equal(d.avisar && d.motivo, 'primera')
})

test('sin fecha del último aviso se avisa: `null` es «no lo sabemos», no «hace poco»', () => {
  // Es la regla de la casa aplicada a una alarma. Un hueco en el registro no
  // puede convertirse en silencio — y aquí el silencio cuesta dos meses.
  const d = decidirAvisoIngesta({
    firmaAnterior: 'degradada:3:20 · lo que sea',
    firmaActual: 'degradada:3:20',
    ultimoAvisoEn: null,
    hoy: HOY,
  })
  assert.equal(d.avisar, true)
  assert.equal(d.avisar && d.motivo, 'primera')
})

test('si el estado cambia, suena', () => {
  const d = decidirAvisoIngesta({
    firmaAnterior: 'degradada:3:20 · lo que sea',
    firmaActual: 'degradada:4:21',
    ultimoAvisoEn: new Date('2026-09-04T06:45:00Z'),
    hoy: HOY,
  })
  assert.equal(d.avisar, true)
  assert.equal(d.avisar && d.motivo, 'cambio')
})

test('si NO cambia pero lleva una semana, suena igual — este es el cepo que faltaba', () => {
  const d = decidirAvisoIngesta({
    firmaAnterior: 'degradada:3:20 · lo que sea',
    firmaActual: 'degradada:3:20',
    ultimoAvisoEn: new Date('2026-08-29T06:45:00Z'), // 7 días
    abiertaDesde: new Date('2026-07-08T00:00:00Z'),
    hoy: HOY,
  })
  assert.equal(d.avisar, true)
  assert.equal(d.avisar && d.motivo, 'recordatorio')
  // El mensaje tiene que poder decir cuánto lleva rota: es lo que convierte
  // «otra vez esto» en «esto hay que arreglarlo hoy».
  assert.equal(d.avisar && d.diasAbierta, 59)
})

test('si no cambia y avisó ayer, se calla: silenciar la REPETICIÓN sigue estando bien', () => {
  const d = decidirAvisoIngesta({
    firmaAnterior: 'degradada:3:20 · lo que sea',
    firmaActual: 'degradada:3:20',
    ultimoAvisoEn: new Date('2026-09-04T06:45:00Z'),
    hoy: HOY,
  })
  assert.equal(d.avisar, false)
})

test('`abiertaDesde` desconocido NO se convierte en 0 días', () => {
  // Un 0 se leería como «se acaba de romper» y quitaría toda la urgencia.
  const d = decidirAvisoIngesta({
    firmaAnterior: 'degradada:3:20 · x',
    firmaActual: 'degradada:3:20',
    ultimoAvisoEn: new Date('2026-08-01T06:45:00Z'),
    hoy: HOY,
  })
  assert.equal(d.avisar, true)
  assert.equal(d.avisar && d.diasAbierta, null)
})

// ── Las huérfanas, una a una: qué pedir y a quién (05/09/2026) ──────────────
//
// El vigía decía «20 pólizas huérfanas, 3 resolubles» y no decía CUÁLES, así
// que no se le podía pedir a Occident el volcado de nada. Estos casos fijan las
// tres reglas que hacen accionable el aviso: separar pedir de reprocesar,
// agrupar por CLAVE DE MEDIADOR (no por compañía) y no colapsar `null` con `[]`.

/** Una huérfana de laboratorio. */
function h(
  entidad: string,
  clave: string | null,
  id: string,
  extra: Partial<PolizaHuerfana> = {},
): PolizaHuerfana {
  return {
    entidad,
    entidadNombre: null,
    clave,
    idPolizaEntidad: id,
    recibos: 1,
    siniestros: 0,
    prima: null,
    ultimoEn: null,
    enCartera: 'ausente',
    ...extra,
  }
}

test('🚨 no poder listarlas NO es que no haya ninguna', () => {
  assert.equal(repartirHuerfanas(null), null)
  const s = saludIngesta({ cuarentena: [], huerfanas: 20, huerfanasDetalle: null })
  assert.equal(s.huerfanasReparto, null)
  assert.match(s.motivos.join(' · '), /sé cuántas son, no cuáles/)
})

test('y una lista VACÍA sí es «se miró y no hay»', () => {
  const r = repartirHuerfanas([])
  assert.deepEqual(r, {
    pedir: [], reprocesar: [], revisarFusion: [],
    totalPedir: 0, totalReprocesar: 0, totalRevisarFusion: 0,
  })
  assert.equal(textoHuerfanas(r), '')
})

test('pedir y reprocesar son DOS acciones distintas y no se cuentan juntas', () => {
  const r = repartirHuerfanas([
    h('C0468', 'M00171', 'BIDP000029'),
    h('C0468', 'M00171', '549000025', { enCartera: 'viva' }),
    h('C0468', 'M00171', 'GPAHS2800735', { enCartera: 'viva', recibos: 0, siniestros: 1 }),
  ])!
  assert.equal(r.totalPedir, 1)
  assert.equal(r.totalReprocesar, 2)
  assert.deepEqual(r.pedir[0]!.polizas, ['BIDP000029'])
})

test('🗝️ el reparto es por CLAVE DE MEDIADOR, no por compañía', () => {
  // El caso real del 05/09: Occident manda por dos claves y el atasco no está
  // repartido igual (12 en M00171, 5 en 8-92361). «Occident: 17» mandaría a
  // revisar una cartera que en parte va bien.
  const r = repartirHuerfanas([
    ...Array.from({ length: 12 }, (_, i) => h('C0468', 'M00171', `M-${i}`)),
    ...Array.from({ length: 5 }, (_, i) => h('C0468', '8-92361', `8-${i}`)),
  ])!
  assert.equal(r.pedir.length, 2)
  assert.deepEqual(r.pedir.map(g => [g.clave, g.n]), [['M00171', 12], ['8-92361', 5]])
  assert.equal(r.totalPedir, 17)
})

test('una fila fusionada (lápida) no es «la tenemos» ni «no la tenemos»', () => {
  const r = repartirHuerfanas([h('C0468', 'M00171', 'X1', { enCartera: 'lapida' })])!
  assert.equal(r.totalPedir, 0)
  assert.equal(r.totalReprocesar, 0)
  assert.equal(r.totalRevisarFusion, 1)
  assert.match(textoHuerfanas(r), /fila fusionada/)
})

test('la misma póliza citada dos veces es UNA póliza que pedir', () => {
  const r = repartirHuerfanas([
    h('C0468', 'M00171', '548000020', { recibos: 1 }),
    h('C0468', 'M00171', '548000020', { recibos: 1, siniestros: 2 }),
  ])!
  assert.equal(r.totalPedir, 1)
  assert.deepEqual(r.pedir[0]!.polizas, ['548000020'])
})

test('una clave de cajón se trata como ausencia, no como una clave más', () => {
  const r = repartirHuerfanas([
    h('C0468', '  ', 'A'), h('C0468', 'N/A', 'B'), h('C0468', null, 'C'),
  ])!
  assert.equal(r.pedir.length, 1, 'las tres van al mismo grupo «sin clave»')
  assert.equal(r.pedir[0]!.clave, null)
  assert.match(textoHuerfanas(r), /clave no legible/)
})

test('sin número de póliza no se inventa uno: esa fila no se pide', () => {
  const r = repartirHuerfanas([h('C0468', 'M00171', '   '), h('C0468', 'M00171', 'OK1')])!
  assert.equal(r.totalPedir, 1)
  assert.deepEqual(r.pedir[0]!.polizas, ['OK1'])
})

test('«ningún recibo traía prima» sigue siendo null, nunca 0 €', () => {
  const sinPrima = repartirHuerfanas([h('C0468', 'M00171', 'A')])!
  assert.equal(sinPrima.pedir[0]!.prima, null)
  const conPrima = repartirHuerfanas([
    h('C0468', 'M00171', 'A'), h('C0468', 'M00171', 'B', { prima: 470.76 }),
  ])!
  assert.equal(conPrima.pedir[0]!.prima, 470.76)
})

test('📣 el texto dice QUÉ HACER y con qué números, no «hay 12»', () => {
  const r = repartirHuerfanas([
    h('C0468', 'M00171', 'BIDP000029', { entidadNombre: 'Occident' }),
    h('C0468', 'M00171', '548000020', { entidadNombre: 'Occident' }),
  ])!
  const t = textoHuerfanas(r)
  assert.match(t, /Pídele a/)
  assert.match(t, /Occident \(C0468\) \/ clave M00171/)
  assert.match(t, /BIDP000029/)
  assert.match(t, /548000020/)
})

test('sin nombre en companias_dgs se cita el código DGS y no se inventa marca', () => {
  const r = repartirHuerfanas([h('C0999', 'K1', 'A')])!
  const t = textoHuerfanas(r)
  assert.match(t, /C0999 \/ clave K1/)
})

test('✂️ el tope corta y dice cuántas faltan Y dónde están', () => {
  const r = repartirHuerfanas(
    Array.from({ length: 30 }, (_, i) => h('C0468', 'M00171', `P${i}`)),
  )!
  const t = textoHuerfanas(r, { tope: 20, donde: 'la pantalla X' })
  assert.match(t, /y 10 más \(en la pantalla X\)/)
  assert.equal((t.match(/P\d+/g) ?? []).length, 20)
  assert.match(t, /estas 30 póliza/, 'el TOTAL real sigue saliendo, no solo lo que cabe')
})

test('el tope es global: si el primer grupo se lo come, el segundo lo declara', () => {
  const r = repartirHuerfanas([
    ...Array.from({ length: 5 }, (_, i) => h('C0468', 'M00171', `A${i}`)),
    ...Array.from({ length: 3 }, (_, i) => h('C0109', 'K2', `B${i}`)),
  ])!
  const t = textoHuerfanas(r, { tope: 5, donde: 'el puerto' })
  assert.match(t, /A0/)
  assert.doesNotMatch(t, /B0/)
  assert.match(t, /no caben aquí: están en el puerto/)
})

test('el tope por defecto (20) cubre entero el atasco medido el 05/09 (17)', () => {
  assert.ok(TOPE_POLIZAS_TELEGRAM >= 17)
  const r = repartirHuerfanas(
    Array.from({ length: 17 }, (_, i) => h('C0468', 'M00171', `P${i}`)),
  )!
  assert.doesNotMatch(textoHuerfanas(r), /más \(en /)
})

test('los números vienen de un XML ajeno: se escapan antes de ir a HTML', () => {
  const r = repartirHuerfanas([h('C0468', 'M00171', '<b>ojo</b>')])!
  const t = textoHuerfanas(r)
  assert.match(t, /&lt;b&gt;ojo&lt;\/b&gt;/)
  assert.doesNotMatch(t, /<b>ojo/)
})

test('🚨 el texto de las reprocesables NO manda a pedírselas a la compañía', () => {
  const r = repartirHuerfanas([h('C0468', 'M00171', 'A', { enCartera: 'viva' })])!
  const t = textoHuerfanas(r)
  assert.doesNotMatch(t, /Pídele a/)
  assert.match(t, /NO se piden/)
  // Y dice dónde se arregla: el XML no está aquí, así que un botón de
  // reintento en central sería una promesa que no se puede cumplir.
  assert.match(t, /ingesta de origen/)
})

test('sin lista, el texto lo dice en vez de callarse', () => {
  assert.match(textoHuerfanas(null), /No he podido listar/)
})

test('saludIngesta cuelga el reparto y saca un motivo por CLAVE', () => {
  const s = saludIngesta({
    cuarentena: [],
    huerfanas: 3,
    huerfanasResolubles: 1,
    huerfanasDetalle: [
      h('C0468', 'M00171', 'A', { entidadNombre: 'Occident' }),
      h('C0468', '8-92361', 'B', { entidadNombre: 'Occident' }),
      h('C0468', 'M00171', 'C', { entidadNombre: 'Occident', enCartera: 'viva' }),
    ],
  })
  assert.equal(s.estado, 'degradada')
  assert.equal(s.huerfanasReparto?.totalPedir, 2)
  assert.equal(s.huerfanasReparto?.totalReprocesar, 1)
  const m = s.motivos.join(' · ')
  assert.match(m, /Occident \(C0468\) \/ clave M00171: 1 póliza\(s\) que hay que pedirle/)
  assert.match(m, /clave 8-92361: 1 póliza\(s\) que hay que pedirle/)
})

// --- Señales nuevas (crudo, cobertura, caja negra, cron mudo) ---------------
// Lo que vigilan no es que cuenten: es que NO tranquilicen. Cada una puede
// mentir en la misma dirección —salir verde porque no hay datos— que es el
// fallo que este módulo existe para impedir.

test('cron mudo: sin pull no hay nada que atascar, y eso NO es estar sano', () => {
  // Con la ingesta parada las otras cuatro señales salen a cero. Sin esta
  // comprobación el vigía diría «ok» con CIMA sin ir a buscar nada.
  const s = saludIngesta({ cuarentena: [], ultimoPull: { horas: 40, procesados: 0 } })
  assert.equal(s.estado, 'degradada')
  assert.ok(s.motivos.some(m => m.includes('sin completar')))
})

test('cron recién corrido no alarma', () => {
  const s = saludIngesta({ cuarentena: [], ultimoPull: { horas: 3, procesados: 0 } })
  assert.equal(s.estado, 'ok')
})

test('sin constancia de ninguna corrida se DICE, no se calla', () => {
  const s = saludIngesta({ cuarentena: [], ultimoPull: null })
  assert.ok(s.motivos.some(m => m.includes('No consta ninguna corrida')))
})

test('purga inminente del crudo alarma: es la ÚLTIMA copia', () => {
  // CIMA ya confirmó esos ficheros a TIREA y no los reenvía. Cuando el TTL
  // pase, la pérdida es definitiva — por eso avisa antes, no después.
  const s = saludIngesta({
    cuarentena: [],
    crudo: { pendientes: 3, purgaInminente: 2, masAntiguaHoras: 2000 },
  })
  assert.equal(s.estado, 'degradada')
  assert.ok(s.motivos.some(m => m.includes('se BORRAN')))
})

test('crudo pendiente SIN purga inminente informa pero no alarma', () => {
  const s = saludIngesta({
    cuarentena: [],
    crudo: { pendientes: 3, purgaInminente: 0, masAntiguaHoras: 48 },
  })
  assert.equal(s.estado, 'ok')
  assert.ok(s.motivos.some(m => m.includes('esperando reproceso')))
})

test('cuerpos rechazados capturados alarman: nos lo mandaron y lo tiramos', () => {
  const s = saludIngesta({
    cuarentena: [],
    cajaNegra: { capturaActiva: true, cuerpos: 4, posts: 193, horasDesdeUltimo: 1, sinCuerpo: 0 },
  })
  assert.equal(s.estado, 'degradada')
  assert.ok(s.motivos.some(m => m.includes('rechazados de Codeoscopic')))
})

test('caja negra activa SIN cuerpos todavía no alarma ni tranquiliza', () => {
  const s = saludIngesta({
    cuarentena: [],
    cajaNegra: { capturaActiva: false, cuerpos: 0, posts: 0, horasDesdeUltimo: null, sinCuerpo: 0 },
  })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.motivos, [])
})

test('cobertura NO alarma aunque haya campos sin leer: sería un rojo perpetuo', () => {
  // El EIAC trae cientos de campos y siempre habrá alguno que no leamos. Si
  // esto pusiera el vigía en rojo, estaría rojo para siempre y dejaría de
  // mirarse — que es cómo muere una alarma.
  const s = saludIngesta({
    cuarentena: [],
    cobertura: {
      rutas: 300, rutasNuncaLeidas: 120, entidadesObservadas: 3,
      porTipo: [{ tipoObjeto: 'POL', rutas: 300, nuncaLeidas: 120 }],
    },
  })
  assert.equal(s.estado, 'ok')
  assert.ok(s.motivos.some(m => m.includes('no se leen nunca')))
})

test('cobertura SIN MEDIR se declara: no equivale a «los leemos todos»', () => {
  const s = saludIngesta({ cuarentena: [], cobertura: null })
  assert.ok(s.motivos.some(m => m.includes('SIN MEDIR')))
})

test('no pedir una señal ≠ pedirla y fallar: `undefined` no inventa un hueco', () => {
  // Un llamante viejo que no conoce las señales nuevas no puede empezar a
  // gritar por algo que nunca preguntó.
  const s = saludIngesta({ cuarentena: [] })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.motivos, [])
  assert.equal(s.crudo, null)
  assert.equal(s.cobertura, null)
})

test('sin_datos deja las cuatro señales nuevas en null, no en cero', () => {
  const s = saludIngesta({ cuarentena: null })
  assert.equal(s.estado, 'sin_datos')
  assert.equal(s.crudo, null)
  assert.equal(s.cobertura, null)
  assert.equal(s.cajaNegra, null)
  assert.equal(s.ultimoPull, null)
})

// ── 🚨 Ficheros CONFIRMADOS que se dejaron objetos sin guardar ──────────────
// La sexta cara de la avería, y la única IRREVERSIBLE: CIMA confirma el fichero
// a TIREA y no lo reenvía. Ninguna de las otras señales lo ve — la cuarentena
// mira `estado <> 'confirmed'`, las huérfanas solo leen los eventos de recibo y
// siniestro (para POL no existe ese evento) y el crudo mira `reprocesado_at`,
// que en el caso real de Occident ya estaba sellado con 4 pólizas en revisión.

const parcial = (enRevision: number, extra: Partial<FicheroParcial> = {}): FicheroParcial => ({
  fichero: 'C0468_M00171_POL_199_1_20260915_20260915095138110626996.zip',
  tipo: 'POL', entidad: 'C0468', clave: 'M00171',
  declarados: 44, persistidos: 44 - enRevision, enRevision, dias: 3,
  ...extra,
})

test('🚨 un fichero CONFIRMADO con objetos en revisión DEGRADA: es pérdida irreversible', () => {
  // Caso real del 17/09/2026: polizasCount 44 · polizasPersisted 40 ·
  // polizasReview 4 · stateTo "confirmed". Antes salía `ok`.
  const s = saludIngesta({ cuarentena: [], parciales: [parcial(4)] })
  assert.equal(s.estado, 'degradada')
})

test('los objetos en revisión se SUMAN entre ficheros y tipos', () => {
  // Medido el 20/09/2026: 46 objetos en 6 ficheros, y NO son solo pólizas —
  // el mismo evento cuenta `recibosReview` (29 en un solo fichero de Occident).
  const s = saludIngesta({
    cuarentena: [],
    parciales: [
      parcial(4),
      parcial(29, { fichero: 'C0468_M00171_REC_299.zip', tipo: 'REC', declarados: 199, persistidos: 170 }),
    ],
  })
  assert.equal(s.objetosEnRevision, 33)
})

test('el motivo dice a QUÉ clave de mediador y en qué fichero, no solo cuántos', () => {
  const s = saludIngesta({ cuarentena: [], parciales: [parcial(4)] })
  const m = s.motivos.join(' · ')
  assert.match(m, /clave M00171 POL: 4 de 44 sin guardar/)
})

test('parciales `[]` es «se miró y no hay»: ni alarma ni hueco', () => {
  const s = saludIngesta({ cuarentena: [], parciales: [] })
  assert.equal(s.estado, 'ok')
  assert.equal(s.objetosEnRevision, 0)
  assert.deepEqual(s.huecos, [])
})

test('🚨 parciales `null` NO es cero: es un hueco, y con pérdida irreversible detrás', () => {
  const s = saludIngesta({ cuarentena: [], parciales: null })
  assert.equal(s.objetosEnRevision, null)
  assert.ok(s.huecos.some(h => h.includes('sin guardar')), s.huecos.join(' · '))
})

test('parciales sin pedir (`undefined`) no inventa un hueco', () => {
  // Un `apps/asegura` desplegado antes de esta señal no la manda: eso no puede
  // convertirse en un grito diario por algo que nadie preguntó.
  const s = saludIngesta({ cuarentena: [] })
  assert.deepEqual(s.huecos, [])
})

// ── 🚨 El «no he podido mirar» YA NO SE TIRA A LA BASURA ────────────────────
// Los motivos existían desde el primer día; lo que no existía era que alguien
// los leyera. `hayPerdida` no los miraba y `detalleSalud` los descartaba en la
// rama `ok`, así que una lectura sin constancia del cron decía literalmente
// «ingesta CIMA: sin ficheros atascados». Estos cepos aseveran el ESTADO y la
// FRASE, no solo que el texto se componga.

test('🚨 sin constancia del cron y lo demás limpio, el estado es PARCIAL, no ok', () => {
  const s = saludIngesta({ cuarentena: [], ultimoPull: null })
  assert.equal(s.estado, 'parcial')
})

test('🚨 y el parte NO dice «sin ficheros atascados»: dice que no se ha mirado todo', () => {
  const s = saludIngesta({ cuarentena: [], ultimoPull: null })
  const d = detalleSalud(s)
  assert.doesNotMatch(d, /sin ficheros atascados/)
  assert.match(d, /No consta ninguna corrida del cron/)
})

test('crudo sin comprobar ⇒ parcial, y lo dice el parte', () => {
  const s = saludIngesta({ cuarentena: [], crudo: null })
  assert.equal(s.estado, 'parcial')
  assert.match(detalleSalud(s), /cuarentena de crudo/)
})

test('caja negra sin comprobar ⇒ parcial, y lo dice el parte', () => {
  const s = saludIngesta({ cuarentena: [], cajaNegra: null })
  assert.equal(s.estado, 'parcial')
  assert.match(detalleSalud(s), /caja negra del webhook/)
})

test('cobertura sin medir ⇒ parcial, y lo dice el parte', () => {
  const s = saludIngesta({ cuarentena: [], cobertura: null })
  assert.equal(s.estado, 'parcial')
  assert.match(detalleSalud(s), /SIN MEDIR/)
})

test('rechazos que se PIDIERON y fallaron ⇒ parcial (antes solo una coletilla)', () => {
  const s = saludIngesta({ cuarentena: [], rechazos: null })
  assert.equal(s.estado, 'parcial')
})

test('🚨 con pérdida MEDIDA manda la pérdida, pero el hueco sigue viajando', () => {
  // Asimetría deliberada: hay que actuar, no solo mirar. Pero el recuento de
  // arriba es un SUELO, y quien avisa tiene que poder decirlo.
  const s = saludIngesta({ cuarentena: [], huerfanas: 3, crudo: null })
  assert.equal(s.estado, 'degradada')
  assert.ok(s.huecos.length > 0, 'el hueco se perdió al haber pérdida medida')
})

test('todo hueco está TAMBIÉN en motivos: no hay dos listas que mantener', () => {
  const s = saludIngesta({ cuarentena: [], crudo: null, cajaNegra: null, cobertura: null, ultimoPull: null })
  for (const h of s.huecos) assert.ok(s.motivos.includes(h), `hueco fuera de motivos: ${h}`)
})

test('sin_datos declara su hueco: no se queda con la lista vacía', () => {
  const s = saludIngesta({ cuarentena: null })
  assert.equal(s.huecos.length, 1)
})

// ── 🚨 Cobertura: RUTAS distintas, y de cuántas compañías salen ─────────────

test('🚨 el motivo de cobertura dice «campo(s) distintos» y cuántas compañías', () => {
  // Medido el 20/09/2026: 755 filas para 563 rutas, con 3 entidades. Publicar
  // filas como «campos» multiplica la cifra por el número de compañías vistas,
  // y es la pantalla sobre la que se decide qué mapear.
  const s = saludIngesta({
    cuarentena: [],
    cobertura: {
      rutas: 563, rutasNuncaLeidas: 457, entidadesObservadas: 3,
      porTipo: [{ tipoObjeto: 'POL', rutas: 405, nuncaLeidas: 338 }],
    },
  })
  assert.match(s.motivos.join(' · '), /563 campo\(s\) distintos \(vistas en 3 compañía\(s\)\) y 457 no se leen nunca/)
})

test('sin saber de cuántas compañías sale, se DICE en vez de callarlo', () => {
  const s = saludIngesta({
    cuarentena: [],
    cobertura: { rutas: 10, rutasNuncaLeidas: 4, entidadesObservadas: null, porTipo: [] },
  })
  assert.match(s.motivos.join(' · '), /no consta de cuántas compañías/)
})

// ── Firma anti-repetición: el cron parado tiene que CAMBIARLA (23/09/2026) ───
// El detalle decía «El cron de CIMA lleva 37 h sin completar» y el Telegram no
// sonó: la ingesta YA estaba degradada por otra causa (Mapfre muda), así que el
// estado no cambió, y la firma no incluía el cron. Los casos de abajo parten de
// una ingesta ya degradada a propósito: con una sana, el cron mudo cambiaría el
// estado y el test pasaría por el motivo equivocado (medido: pasaba igual con
// el tramo del cron quitado de la firma).

const degradada = (ultimoPull: { horas: number; procesados: number | null } | null) =>
  saludIngesta({ cuarentena: [f('SIN', 'C0468', 2)], ultimoPull })

test('firma: con la ingesta ya degradada, el cron que se para cambia la firma → suena', () => {
  const corre = degradada({ horas: 3, procesados: 2 })
  const mudo = degradada({ horas: 37, procesados: 0 })
  assert.equal(corre.estado, mudo.estado) // el estado NO lo delata: solo la firma puede
  assert.notEqual(firmaAvisoIngesta(corre), firmaAvisoIngesta(mudo))
  const d = decidirAvisoIngesta({
    firmaAnterior: firmaAvisoIngesta(corre),
    firmaActual: firmaAvisoIngesta(mudo),
    ultimoAvisoEn: new Date('2026-09-22T06:45:00Z'),
    hoy: new Date('2026-09-23T06:45:00Z'),
  })
  assert.equal(d.avisar, true)
})

test('firma: «no consta ninguna corrida» y «el cron corre» no dan la misma firma', () => {
  assert.notEqual(
    firmaAvisoIngesta(degradada(null)),
    firmaAvisoIngesta(degradada({ horas: 3, procesados: 2 })),
  )
})

test('firma: una firma guardada en el formato viejo (sin el cron) no hace sonar un «cambio» falso', () => {
  const hoy = firmaAvisoIngesta(degradada({ horas: 3, procesados: 2 }))
  // Lo que había en el latido antes del 23/09: sin el tramo del cron NI el de
  // renovaciones (27/09) NI el de emisiones (28/09) NI el de duplicadas (04/10),
  // o sea cinco tramos.
  const quitar = (x: string) => x.slice(0, x.lastIndexOf(':'))
  const vieja = quitar(quitar(quitar(quitar(hoy))))
  assert.equal(vieja.split(':').length, 5)
  assert.equal(normalizarFirmaIngesta(vieja), hoy)
  const d = decidirAvisoIngesta({
    firmaAnterior: normalizarFirmaIngesta(vieja),
    firmaActual: hoy,
    ultimoAvisoEn: new Date('2026-09-22T06:45:00Z'),
    hoy: new Date('2026-09-23T06:45:00Z'),
  })
  assert.equal(d.avisar, false)
  // Pero si hoy el cron está parado, la firma vieja (que decía «corre») sí suena.
  const mudo = firmaAvisoIngesta(degradada({ horas: 37, procesados: 0 }))
  assert.notEqual(normalizarFirmaIngesta(vieja), mudo)
  assert.equal(normalizarFirmaIngesta(null), null)
})

test('firma: mismo estado dos días seguidos → misma firma (no repite el aviso)', () => {
  assert.equal(
    firmaAvisoIngesta(degradada({ horas: 30, procesados: 0 })),
    firmaAvisoIngesta(degradada({ horas: 54, procesados: 0 })),
  )
})

// ── Respaldo del pull de CIMA desde plataforma (23/09/2026) ─────────────────

test('respaldo: el pull de Actions no ha corrido (37 h) → dispara', () => {
  assert.deepEqual(decidirRespaldoPull({ horas: 37, procesados: 0 }), { disparar: true, horas: 37 })
})

test('respaldo: el pull de las 05:30 ya completó (1,5 h) → NO dispara, se pisarían en TIREA', () => {
  const d = decidirRespaldoPull({ horas: 1.5, procesados: 3 })
  assert.equal(d.disparar, false)
})

test('respaldo: justo en el umbral no dispara; por encima, sí', () => {
  assert.equal(decidirRespaldoPull({ horas: HORAS_RESPALDO_PULL, procesados: 0 }).disparar, false)
  assert.equal(decidirRespaldoPull({ horas: HORAS_RESPALDO_PULL + 0.1, procesados: 0 }).disparar, true)
})

test('respaldo: sin dato del último pull NO dispara (no sé ≠ está parado)', () => {
  assert.deepEqual(decidirRespaldoPull(null), { disparar: false, motivo: 'sin_dato', horas: null })
  assert.deepEqual(decidirRespaldoPull(undefined), { disparar: false, motivo: 'sin_dato', horas: null })
  assert.deepEqual(decidirRespaldoPull({ horas: Number.NaN, procesados: null }), { disparar: false, motivo: 'sin_dato', horas: null })
})

// ── Renovaciones que no llegan (27/09/2026) ─────────────────────────────────
// Caso real: 10 pólizas de Mapfre en vigor, vencidas de junio a septiembre, sin
// POL ni recibo del periodo siguiente. Ninguna otra señal lo veía.

const mapfre: RenovacionSinLlegar = {
  entidad: 'C0058', entidadNombre: 'Mapfre', polizas: 10, vencimientoMasAntiguo: '2026-06-18',
}
const allianz: RenovacionSinLlegar = {
  entidad: 'C0109', entidadNombre: 'Allianz', polizas: 2, vencimientoMasAntiguo: '2026-08-01',
}

test('renovaciones: la gracia es de 15 días', () => {
  assert.equal(DIAS_GRACIA_RENOVACION, 15)
})

test('🚨 renovaciones sin llegar DEGRADAN aunque todo lo demás esté limpio', () => {
  const s = saludIngesta({ cuarentena: [], renovacionesSinLlegar: [mapfre] })
  assert.equal(s.estado, 'degradada')
  assert.match(detalleSalud(s), /DEGRADADA/)
  assert.match(detalleSalud(s), /Renovaciones sin llegar: Mapfre 10 póliza\(s\) \(vencidas desde 18\/06\)/)
})

test('renovaciones: el texto dice compañía, cuántas, desde cuándo y qué hacer', () => {
  assert.equal(
    textoRenovacionesSinLlegar([mapfre]),
    '⏳ Renovaciones sin llegar: Mapfre 10 póliza(s) (vencidas desde 18/06). ' +
      'Sin recibo ni póliza nueva por CIMA: reclamar a la compañía / CIMA.',
  )
})

test('renovaciones: sin nombre se cita el código DGS; sin fecha no se inventa una', () => {
  const t = textoRenovacionesSinLlegar([{ entidad: 'C0072', entidadNombre: null, polizas: 1, vencimientoMasAntiguo: null }])
  assert.match(t, /C0072 1 póliza\(s\) \(fecha de vencimiento no legible\)/)
})

test('renovaciones: se ordenan de más a menos pólizas y las de 0 no cuentan', () => {
  const s = saludIngesta({
    cuarentena: [],
    renovacionesSinLlegar: [allianz, { ...mapfre }, { entidad: 'C0613', entidadNombre: 'Reale', polizas: 0, vencimientoMasAntiguo: null }],
  })
  assert.deepEqual(s.renovacionesSinLlegar?.map(r => r.entidad), ['C0058', 'C0109'])
})

test('renovaciones `[]` = se miró y no hay: ni alarma ni hueco', () => {
  const s = saludIngesta({ cuarentena: [], renovacionesSinLlegar: [] })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.huecos, [])
  assert.deepEqual(s.renovacionesSinLlegar, [])
})

test('🚨 renovaciones `null` NO es «ninguna»: es un hueco y lo dice el parte', () => {
  const s = saludIngesta({ cuarentena: [], renovacionesSinLlegar: null })
  assert.equal(s.estado, 'parcial')
  assert.equal(s.renovacionesSinLlegar, null)
  assert.match(detalleSalud(s), /renovaciones que no han llegado/)
})

test('renovaciones sin pedir (`undefined`, puerto viejo) no inventa un hueco', () => {
  const s = saludIngesta({ cuarentena: [] })
  assert.equal(s.estado, 'ok')
  assert.equal(s.renovacionesSinLlegar, undefined)
})

test('sin_datos deja las renovaciones en null, no en lista vacía', () => {
  assert.equal(saludIngesta({ cuarentena: null }).renovacionesSinLlegar, null)
})

// La firma: sobre una ingesta YA degradada por otra causa, para que el estado no
// delate el cambio y solo la firma pueda hacerlo (mismo método que el cron).
const conRenov = (renovacionesSinLlegar: RenovacionSinLlegar[] | null | undefined) =>
  saludIngesta({ cuarentena: [f('SIN', 'C0468', 2)], ultimoPull: { horas: 3, procesados: 1 }, renovacionesSinLlegar })

const suena = (antes: string, ahora: string) =>
  decidirAvisoIngesta({
    firmaAnterior: antes,
    firmaActual: ahora,
    ultimoAvisoEn: new Date('2026-09-26T06:45:00Z'),
    hoy: new Date('2026-09-27T06:45:00Z'),
  }).avisar

test('firma: aparece una compañía con renovaciones sin llegar → suena', () => {
  assert.equal(suena(firmaAvisoIngesta(conRenov([])), firmaAvisoIngesta(conRenov([mapfre]))), true)
})

test('firma: cambia el NÚMERO de pólizas (10 → 1) → suena, y no se lo come el prefijo', () => {
  const diez = firmaAvisoIngesta(conRenov([mapfre]))
  const una = firmaAvisoIngesta(conRenov([{ ...mapfre, polizas: 1 }]))
  assert.notEqual(diez, una)
  assert.equal(suena(diez, una), true)
})

test('firma: cambia el CONJUNTO de compañías (se resuelve una) → suena', () => {
  assert.equal(
    suena(firmaAvisoIngesta(conRenov([mapfre, allianz])), firmaAvisoIngesta(conRenov([mapfre]))),
    true,
  )
})

test('firma: mismo conjunto y mismos números → misma firma (no repite)', () => {
  assert.equal(
    firmaAvisoIngesta(conRenov([mapfre, allianz])),
    firmaAvisoIngesta(conRenov([{ ...allianz }, { ...mapfre, vencimientoMasAntiguo: '2026-06-20' }])),
  )
})

test('firma: «no se pudo mirar» (null) y «ninguna» ([]) no dan la misma firma', () => {
  assert.notEqual(firmaAvisoIngesta(conRenov(null)), firmaAvisoIngesta(conRenov([])))
})

test('firma: una firma de seis tramos (antes del 27/09) se lee como «ninguna»', () => {
  const hoy = firmaAvisoIngesta(conRenov([]))
  const sinDup = hoy.slice(0, hoy.lastIndexOf(':'))
  const sinEmis = sinDup.slice(0, sinDup.lastIndexOf(':'))
  const vieja = sinEmis.slice(0, sinEmis.lastIndexOf(':'))
  assert.equal(vieja.split(':').length, 6)
  assert.equal(normalizarFirmaIngesta(vieja), hoy)
  // Y con Mapfre pendiente, el primer despliegue SÍ suena: nadie lo ha avisado nunca.
  assert.equal(suena(normalizarFirmaIngesta(vieja)!, firmaAvisoIngesta(conRenov([mapfre]))), true)
})

// ── 📭 Emisiones de Codeoscopic sin aviso de su webhook (28/09/2026) ────────
// Caso real: cuatro emitidas (17-28/09) y cero avisos, porque el receptor
// contestaba 401 a un usuario de Basic Auth distinto. Nada lo delataba.

const allianzEmitida: EmisionSinAviso = { proyecto: '40769244', aseguradora: 'Allianz', horas: 262 }
const realeEmitida: EmisionSinAviso = { proyecto: '40804066', aseguradora: 'Reale', horas: 108 }

test('🚨 una emisión sin aviso del webhook DEGRADA aunque todo lo demás esté limpio', () => {
  const s = saludIngesta({ cuarentena: [], emisionesSinAviso: [allianzEmitida] })
  assert.equal(s.estado, 'degradada')
  assert.match(detalleSalud(s), /1 emisión\(es\) de Codeoscopic sin aviso de su webhook/)
  assert.match(detalleSalud(s), /40769244 Allianz/)
})

test('emisiones: lo emitido hace menos de 24 h todavía no cuenta', () => {
  assert.equal(HORAS_EMISION_SIN_AVISO, 24)
  const s = saludIngesta({ cuarentena: [], emisionesSinAviso: [{ proyecto: '40842815', aseguradora: 'Allianz', horas: 3 }] })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.emisionesSinAviso, [])
})

test('emisiones: horas no legibles cuentan (no se supone que es reciente)', () => {
  const s = saludIngesta({ cuarentena: [], emisionesSinAviso: [{ proyecto: '1', aseguradora: null, horas: null }] })
  assert.equal(s.estado, 'degradada')
})

test('emisiones: el texto corta a 5 y dice cuántas más', () => {
  const lista = Array.from({ length: 7 }, (_, i) => ({ proyecto: String(i), aseguradora: null, horas: 30 }))
  assert.match(textoEmisionesSinAviso(lista), /y 2 más/)
})

test('emisiones `[]` = se miró y no hay: ni alarma ni hueco', () => {
  const s = saludIngesta({ cuarentena: [], emisionesSinAviso: [] })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.huecos, [])
})

test('🚨 emisiones `null` NO es «todas avisan»: es un hueco', () => {
  const s = saludIngesta({ cuarentena: [], emisionesSinAviso: null })
  assert.equal(s.estado, 'parcial')
  assert.match(detalleSalud(s), /aviso de su webhook/)
})

test('emisiones sin pedir (`undefined`, puerto viejo) no inventa un hueco', () => {
  const s = saludIngesta({ cuarentena: [] })
  assert.equal(s.estado, 'ok')
  assert.equal(s.emisionesSinAviso, undefined)
})

const conEmis = (emisionesSinAviso: EmisionSinAviso[] | null | undefined) =>
  saludIngesta({ cuarentena: [f('SIN', 'C0468', 2)], ultimoPull: { horas: 3, procesados: 1 }, emisionesSinAviso })

test('firma: aparece o se resuelve una emisión sin aviso → suena', () => {
  assert.equal(suena(firmaAvisoIngesta(conEmis([])), firmaAvisoIngesta(conEmis([allianzEmitida]))), true)
  assert.equal(
    suena(firmaAvisoIngesta(conEmis([allianzEmitida, realeEmitida])), firmaAvisoIngesta(conEmis([allianzEmitida]))),
    true,
  )
})

test('firma: mismas emisiones con otras horas → misma firma (no repite cada día)', () => {
  assert.equal(
    firmaAvisoIngesta(conEmis([allianzEmitida])),
    firmaAvisoIngesta(conEmis([{ ...allianzEmitida, horas: 300 }])),
  )
})

test('firma: «no se pudo mirar» (null) y «ninguna» ([]) no dan la misma firma', () => {
  assert.notEqual(firmaAvisoIngesta(conEmis(null)), firmaAvisoIngesta(conEmis([])))
})

test('firma: una firma de siete tramos (antes del 28/09) se lee como «ninguna»', () => {
  const hoy = firmaAvisoIngesta(conEmis([]))
  const sinDup = hoy.slice(0, hoy.lastIndexOf(':'))
  const vieja = sinDup.slice(0, sinDup.lastIndexOf(':'))
  assert.equal(vieja.split(':').length, 7)
  assert.equal(normalizarFirmaIngesta(vieja), hoy)
  assert.equal(suena(normalizarFirmaIngesta(vieja)!, firmaAvisoIngesta(conEmis([allianzEmitida]))), true)
})

test('cobertura: «descartados por privacidad» va aparte y NO es «sin leer»', () => {
  const s = saludIngesta({
    cuarentena: [],
    cobertura: { rutas: 100, rutasNuncaLeidas: 10, rutasDescartadas: 7, entidadesObservadas: 3, porTipo: [{ tipoObjeto: 'POL', rutas: 100, nuncaLeidas: 10 }] },
  })
  assert.equal(s.estado, 'ok')
  assert.ok(s.motivos.some(m => m.includes('10 no se leen nunca')))
  assert.ok(s.motivos.some(m => m.includes('7 campo(s) descartados por privacidad')))
})

test('cobertura: sin `rutasDescartadas` (columna aún sin aplicar) no inventa un descartado', () => {
  const s = saludIngesta({
    cuarentena: [],
    cobertura: { rutas: 100, rutasNuncaLeidas: 10, entidadesObservadas: 3, porTipo: [] },
  })
  assert.ok(!s.motivos.some(m => m.includes('descartados')))
})

// ── 🔁 Pólizas vivas duplicadas (04/10/2026) — INFORMATIVA ─────────────────
// Tras fusionar 13 pares de Allianz quedaban grupos con el mismo número y DGS,
// unos duplicados de verdad y otros pólizas distintas (clientes distintos). El
// vigía los cuenta sin ponerse rojo y suena cuando cambian.

const dupAllianz = { entidad: 'C0109', ref: '0ae40684-0000-0000-0000-000000000001', fichas: 2 }
const dupReale = { entidad: 'C0613', ref: '12bf4c44-0000-0000-0000-000000000002', fichas: 2 }

test('🔁 duplicadas: se informan pero NO degradan ni cuentan como hueco', () => {
  const s = saludIngesta({ cuarentena: [], polizasDuplicadas: [dupAllianz, dupReale] })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.huecos, [])
  assert.equal(s.motivos.some(m => /duplicadas/.test(m)), false)
  assert.match(detalleSalud(s), /informativo: 🔁 2 grupo\(s\) de pólizas vivas duplicadas/)
  assert.match(detalleSalud(s), /C0109 1 · C0613 1/)
})

test('duplicadas: también salen en `degradada` y en `parcial`', () => {
  const deg = saludIngesta({ cuarentena: [f('SIN', 'C0468', 2)], polizasDuplicadas: [dupAllianz] })
  assert.equal(deg.estado, 'degradada')
  assert.match(detalleSalud(deg), /informativo: 🔁 1 grupo/)
  const par = saludIngesta({ cuarentena: [], rechazos: null, polizasDuplicadas: [dupAllianz] })
  assert.equal(par.estado, 'parcial')
  assert.match(detalleSalud(par), /informativo: 🔁 1 grupo/)
})

test('🚨 duplicadas `null` NO es «ninguna»: es un hueco', () => {
  const s = saludIngesta({ cuarentena: [], polizasDuplicadas: null })
  assert.equal(s.estado, 'parcial')
  assert.match(detalleSalud(s), /pólizas vivas duplicadas/)
})

test('duplicadas `[]` = ninguna; `undefined` (puerto viejo) = no se pide', () => {
  assert.equal(saludIngesta({ cuarentena: [], polizasDuplicadas: [] }).estado, 'ok')
  const viejo = saludIngesta({ cuarentena: [] })
  assert.equal(viejo.estado, 'ok')
  assert.equal(viejo.polizasDuplicadas, undefined)
  assert.equal(textoPolizasDuplicadas([]), '')
  assert.equal(textoPolizasDuplicadas(undefined), '')
})

test('duplicadas: un «grupo» de una ficha no es un grupo', () => {
  const s = saludIngesta({ cuarentena: [], polizasDuplicadas: [{ ...dupAllianz, fichas: 1 }] })
  assert.deepEqual(s.polizasDuplicadas, [])
})

const conDup = (polizasDuplicadas: typeof dupAllianz[] | null | undefined) =>
  saludIngesta({ cuarentena: [], ultimoPull: { horas: 3, procesados: 1 }, polizasDuplicadas })

test('firma: entra, sale o se SUSTITUYE un grupo de duplicadas → suena', () => {
  assert.equal(suena(firmaAvisoIngesta(conDup([])), firmaAvisoIngesta(conDup([dupAllianz]))), true)
  assert.equal(suena(firmaAvisoIngesta(conDup([dupAllianz, dupReale])), firmaAvisoIngesta(conDup([dupAllianz]))), true)
  // Mismo recuento, otro grupo: el número no se mueve, la firma sí.
  assert.equal(suena(firmaAvisoIngesta(conDup([dupAllianz])), firmaAvisoIngesta(conDup([dupReale]))), true)
  // Y el orden de llegada no cambia nada.
  assert.equal(firmaAvisoIngesta(conDup([dupAllianz, dupReale])), firmaAvisoIngesta(conDup([dupReale, dupAllianz])))
})

test('firma: duplicadas `null` y `[]` no dan la misma firma; el tramo no rompe el recuento de tramos', () => {
  assert.notEqual(firmaAvisoIngesta(conDup(null)), firmaAvisoIngesta(conDup([])))
  assert.equal(firmaAvisoIngesta(conDup([dupAllianz, dupReale])).split(':').length, 9)
})

test('firma: una firma de ocho tramos (antes del 04/10) se lee como «ninguna duplicada»', () => {
  const hoy = firmaAvisoIngesta(conDup([]))
  const vieja = hoy.slice(0, hoy.lastIndexOf(':'))
  assert.equal(vieja.split(':').length, 8)
  assert.equal(normalizarFirmaIngesta(vieja), hoy)
  assert.equal(suena(normalizarFirmaIngesta(vieja)!, firmaAvisoIngesta(conDup([dupAllianz]))), true)
})

test('cambioDuplicadasEnFirma: solo mira el tramo de duplicadas', () => {
  const sin = firmaAvisoIngesta(conDup([]))
  const con = firmaAvisoIngesta(conDup([dupAllianz]))
  assert.equal(cambioDuplicadasEnFirma(sin, con), true)
  assert.equal(cambioDuplicadasEnFirma(con, con), false)
  // Cambia otra señal y las duplicadas no: no es cambio de duplicadas.
  const otraCosa = firmaAvisoIngesta(saludIngesta({ cuarentena: [], ultimoPull: { horas: 40, procesados: 0 }, polizasDuplicadas: [dupAllianz] }))
  assert.equal(cambioDuplicadasEnFirma(con, otraCosa), false)
  // Nunca avisado: solo si hoy hay algo que contar.
  assert.equal(cambioDuplicadasEnFirma(null, con), true)
  assert.equal(cambioDuplicadasEnFirma(null, sin), false)
})
