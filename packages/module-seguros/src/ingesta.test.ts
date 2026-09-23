import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saludIngesta,
  detalleSalud,
  DIAS_CUARENTENA_RECIENTE,
  HORAS_RECHAZO_RECIENTE,
  decidirAvisoIngesta,
  firmaAvisoIngesta,
  decidirRespaldoPull,
  HORAS_RESPALDO_PULL,
  repartirHuerfanas,
  textoHuerfanas,
  TOPE_POLIZAS_TELEGRAM,
  type PolizaHuerfana,
  type FicheroParcial,
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
