import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saludIngesta,
  detalleSalud,
  DIAS_CUARENTENA_RECIENTE,
  HORAS_RECHAZO_RECIENTE,
  decidirAvisoIngesta,
  repartirHuerfanas,
  textoHuerfanas,
  TOPE_POLIZAS_TELEGRAM,
  type PolizaHuerfana,
} from './ingesta.ts'

const f = (tipo: string, entidad: string, dias: number) => ({ tipo, entidad, dias })

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
    h('C0468', 'M00171', 'BIDP036783'),
    h('C0468', 'M00171', '549570971', { enCartera: 'viva' }),
    h('C0468', 'M00171', 'GPAHS2800735', { enCartera: 'viva', recibos: 0, siniestros: 1 }),
  ])!
  assert.equal(r.totalPedir, 1)
  assert.equal(r.totalReprocesar, 2)
  assert.deepEqual(r.pedir[0]!.polizas, ['BIDP036783'])
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
    h('C0468', 'M00171', '548325602', { recibos: 1 }),
    h('C0468', 'M00171', '548325602', { recibos: 1, siniestros: 2 }),
  ])!
  assert.equal(r.totalPedir, 1)
  assert.deepEqual(r.pedir[0]!.polizas, ['548325602'])
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
    h('C0468', 'M00171', 'BIDP036783', { entidadNombre: 'Occident' }),
    h('C0468', 'M00171', '548325602', { entidadNombre: 'Occident' }),
  ])!
  const t = textoHuerfanas(r)
  assert.match(t, /Pídele a/)
  assert.match(t, /Occident \(C0468\) \/ clave M00171/)
  assert.match(t, /BIDP036783/)
  assert.match(t, /548325602/)
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
