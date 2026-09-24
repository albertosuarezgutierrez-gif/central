// La composición de los avisos de la campana, sin BD.
//
// Cada test rompe UNA regla de `avisosDe` / `textoGlobo`: se escribieron viendo
// cada uno en rojo antes de dejarlo en verde (regla del `CLAUDE.md` de la raíz:
// un cepo no está terminado hasta que se le ha visto fallar).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DIAS_VENTANA_AVISO } from './obligacion.ts'

import { avisosDe, HREF_POR_TIPO, textoGlobo, type AutorizacionParaAviso, type ObligacionParaAviso } from './avisos.ts'

const HOY = new Date('2026-09-08T10:00:00Z')
const dias = (n: number) => new Date(HOY.getTime() + n * 86_400_000)

const auto = (x: Partial<AutorizacionParaAviso> & { id: string }): AutorizacionParaAviso => ({
  estado: 'pendiente',
  otorganteNombre: 'María del Carmen Martínez Ayala',
  autorizadoNombre: 'Gabriel Durán Martínez',
  ...x,
})
const obl = (x: Partial<ObligacionParaAviso> & { id: string }): ObligacionParaAviso => ({
  titulo: 'Seguro de auto · Reale',
  fechaAccionable: dias(3),
  ...x,
})
const vacias = { otorgadas: [], recibidas: [] }

test('una autorización RECIBIDA pendiente es un aviso que lleva a «Quién me ve», nunca a una acción', () => {
  const r = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [auto({ id: 'a1' })] }, obligaciones: [], peticiones: [], datos: [], carnets: [], hoy: HOY })
  assert.equal(r.avisos.length, 1)
  const a = r.avisos[0]!
  assert.equal(a.tipo, 'autorizacion_pendiente')
  assert.equal(a.id, 'a1')
  assert.match(a.titulo, /María del Carmen Martínez Ayala te ha dado acceso/)
  assert.equal(a.href, '/autorizaciones')
  assert.equal(r.globo, '1')
})

test('solo cuentan las PENDIENTES: una vigente, caducada o revocada no es un aviso', () => {
  const recibidas = [auto({ id: 'v', estado: 'vigente' }), auto({ id: 'c', estado: 'caducada' }), auto({ id: 'r', estado: 'revocada' })]
  const r = avisosDe({ autorizaciones: { otorgadas: [], recibidas }, obligaciones: [], peticiones: [], datos: [], carnets: [], hoy: HOY })
  assert.deepEqual(r.avisos, [])
  assert.equal(r.globo, null, 'todo leído y nada pendiente = sin globo, no «0»')
})

test('una autorización que YO di y no han aceptado es el aviso espejo, y sin nombre no se inventa uno', () => {
  const otorgadas = [auto({ id: 'o1' }), auto({ id: 'o2', autorizadoNombre: null })]
  const r = avisosDe({ autorizaciones: { otorgadas, recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], hoy: HOY })
  assert.equal(r.avisos.length, 2)
  assert.equal(r.avisos[0]!.tipo, 'autorizacion_sin_aceptar')
  assert.match(r.avisos[0]!.titulo, /^Gabriel Durán Martínez aún no ha aceptado/)
  assert.match(r.avisos[1]!.titulo, /^La persona invitada aún no ha aceptado/)
  assert.equal(r.avisos[1]!.href, HREF_POR_TIPO.autorizacion_sin_aceptar)
})

test('las obligaciones entran solo en la VENTANA del módulo (0..7 días antes de la fecha accionable)', () => {
  const obligaciones = [
    obl({ id: 'hoy', fechaAccionable: dias(0) }),
    obl({ id: 'borde', fechaAccionable: dias(DIAS_VENTANA_AVISO) }),
    obl({ id: 'fuera', fechaAccionable: dias(DIAS_VENTANA_AVISO + 1) }),
    obl({ id: 'pasada', fechaAccionable: dias(-1) }),
  ]
  const r = avisosDe({ autorizaciones: vacias, obligaciones, peticiones: [], datos: [], carnets: [], hoy: HOY })
  assert.deepEqual(
    r.avisos.map((a) => a.id),
    ['hoy', 'borde'],
  )
  assert.equal(r.avisos[0]!.tipo, 'obligacion_en_ventana')
  assert.equal(r.avisos[0]!.href, '/boveda', 'lleva a la bóveda, que ya no tiene un calendario con ancla propia')
  assert.match(r.avisos[0]!.detalle, /hasta el 8 de septiembre/, 'la fecha que se enseña es la ACCIONABLE, no la del vencimiento')
})

test('una fuente ilegible NO colapsa a «sin avisos»: se declara y el globo lleva «+»', () => {
  const r = avisosDe({ autorizaciones: null, obligaciones: [obl({ id: 'o' })], peticiones: [], datos: [], carnets: [], hoy: HOY })
  assert.deepEqual(r.fuentesIlegibles, ['autorizaciones'])
  assert.equal(r.avisos.length, 1, 'la fuente que SÍ se leyó se sirve igual')
  assert.equal(r.globo, '1+')

  const cero = avisosDe({ autorizaciones: vacias, obligaciones: null, peticiones: [], datos: [], carnets: [], hoy: HOY })
  assert.deepEqual(cero.fuentesIlegibles, ['obligaciones'])
  assert.equal(cero.globo, '0+', 'cero leídos con una fuente sin leer NO es «nada pendiente»')
})

test('ninguna fuente legible = «!»: no se sabe nada y se dice', () => {
  const r = avisosDe({ autorizaciones: null, obligaciones: null, peticiones: null, datos: null, carnets: null, firmas: null, hoy: HOY })
  assert.deepEqual(r.avisos, [])
  assert.deepEqual(r.fuentesIlegibles, ['peticiones', 'autorizaciones', 'obligaciones', 'datos', 'carnets', 'firmas'])
  assert.equal(r.globo, '!')
})

test('textoGlobo: los tres desenlaces, y ninguno es «0»', () => {
  assert.equal(textoGlobo(0, 0, 4), null)
  assert.equal(textoGlobo(3, 0, 4), '3')
  assert.equal(textoGlobo(3, 1, 4), '3+')
  assert.equal(textoGlobo(0, 1, 4), '0+')
  assert.equal(textoGlobo(0, 4, 4), '!')
  assert.equal(textoGlobo(5, 4, 4), '!', 'con todo ilegible no puede haber avisos; si los hay, algo cuenta mal')
})

test('todo ilegible manda sobre el «+» aunque haya avisos de relleno', () => {
  // `textoGlobo` decide por el número de fuentes, no por si la lista viene
  // vacía: así un `[]` de consuelo aguas arriba no convierte «!» en «0+».
  assert.equal(textoGlobo(0, 4, 4), '!')
})

test('cada tipo tiene destino, y es una pantalla del portal', () => {
  for (const [tipo, href] of Object.entries(HREF_POR_TIPO)) {
    assert.match(href, /^\/(autorizaciones|boveda)/, `${tipo} lleva a ${href}, que no es una pantalla del portal`)
    assert.ok(!/\/api\//.test(href), `${tipo} apunta a una API: la campana enlaza pantallas, no ejecuta acciones`)
  }
})

test('una petición de acceso PENDIENTE produce un aviso que sale primero', () => {
  const r = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [{ id: 'p1', estado: 'pendiente', solicitanteNombre: 'Juan García' }], datos: [], carnets: [], hoy: HOY })
  assert.equal(r.avisos.length, 1)
  const p = r.avisos[0]!
  assert.equal(p.tipo, 'peticion_recibida')
  assert.equal(p.id, 'p1')
  assert.match(p.titulo, /Juan García te ha pedido acceso/)
  assert.equal(p.href, '/autorizaciones')
  assert.equal(r.globo, '1')
})

test('peticiones: null mete «peticiones» en fuentesIlegibles y el globo lleva «+»', () => {
  const r = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: null, datos: [], carnets: [], hoy: HOY })
  assert.deepEqual(r.fuentesIlegibles, ['peticiones'])
  assert.equal(r.globo, '0+')
})

test('un reparo de los datos de contacto avisa, y dice DÓNDE se corrige', () => {
  const r = avisosDe({
    autorizaciones: vacias,
    obligaciones: [],
    peticiones: [],
    datos: [{ tipo: 'cp_invalido', texto: 'El código postal guardado («0812») no es un código postal español de 5 dígitos.' }],
    carnets: [],
    hoy: HOY,
  })
  assert.equal(r.avisos.length, 1)
  const a = r.avisos[0]!
  assert.equal(a.tipo, 'datos_por_revisar')
  assert.equal(a.id, 'cp_invalido', 'el id es el TIPO de reparo: es la clave con la que el correo sella lo ya enviado')
  assert.match(a.detalle, /0812/, 'dice qué dato no cuadra, no solo que hay algo mal')
  assert.match(a.detalle, /Mis datos/, 'y dónde se corrige: sin eso, el cliente tiene que escribirnos para saberlo')
  assert.equal(a.href, '/boveda?vista=datos')
  assert.equal(r.globo, '1')
})

test('datos: null se declara ilegible — «tus datos están bien» no se afirma sin mirarlos', () => {
  const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: null, carnets: [], hoy: HOY })
  assert.deepEqual(r.fuentesIlegibles, ['datos'])
  assert.equal(r.globo, '0+')
})

const fecha = (n: number) => dias(n).toISOString().slice(0, 10)

test('un carné entra solo en su ventana (60 días), no en los 7 de las obligaciones', () => {
  const carnets = [
    { id: 'c1', tipo: 'B', fechaCaducidad: fecha(0) },
    { id: 'c2', tipo: 'B', fechaCaducidad: fecha(60) },
    { id: 'c3', tipo: 'C', fechaCaducidad: fecha(61) },
  ]
  const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: [], carnets, hoy: HOY })
  assert.deepEqual(r.avisos.map((a) => a.id), ['c1', 'c2'])
  assert.equal(r.avisos[0]!.tipo, 'carnet_en_ventana')
  assert.equal(r.avisos[0]!.href, '/boveda')
  assert.match(r.avisos[0]!.titulo, /\(B\) caduca pronto/)
})

test('🚨 un carné YA CADUCADO avisa: antes el aviso desaparecía justo al caducar', () => {
  // El hueco que tapa esto: `entraEnVentanaCarnet` exige futuro, así que el
  // sistema se callaba el día que empieza el problema.
  const carnets = [{ id: 'c4', tipo: 'B', fechaCaducidad: fecha(-1) }]
  const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: [], carnets, hoy: HOY })
  assert.equal(r.avisos.length, 1)
  assert.equal(r.avisos[0]!.tipo, 'carnet_caducado')
  // Lleva a «Recordatorios», que es donde el carné se ve; «Mis datos» no lo
  // pinta, así que ahí el enlace mandaría a buscar algo que no está.
  assert.equal(r.avisos[0]!.href, '/boveda?vista=recordatorios')
})

test('🚨 el aviso de caducado NO acusa: dice lo que nos consta y ofrece corregirlo', () => {
  const carnets = [{ id: 'c4', tipo: 'B', fechaCaducidad: fecha(-30) }]
  const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: [], carnets, hoy: HOY })
  const a = r.avisos[0]!
  assert.match(a.titulo, /[Nn]os consta/)
  assert.match(a.detalle, /[Ss]i ya lo has renovado/)
  // La fecha que tenemos puede estar vieja: no se afirma como un hecho sobre
  // la CONDUCTA de la persona. («carné de conducir» es el nombre del
  // documento, no una acusación — por eso el cepo busca la frase, no la
  // palabra suelta: la primera versión de este test se disparaba con el propio
  // nombre del carné.)
  const texto = `${a.titulo} ${a.detalle}`
  for (const acusacion of [/conduces sin/i, /est[áa]s conduciendo/i, /no puedes conducir/i]) {
    assert.ok(!acusacion.test(texto), `el aviso acusa: ${acusacion}`)
  }
})

test('🚨 un carné caducado hace AÑOS deja de afirmarse: el dato ya no se sabe', () => {
  const carnets = [
    { id: 'reciente', tipo: 'B', fechaCaducidad: fecha(-730) },
    { id: 'viejo', tipo: 'B', fechaCaducidad: fecha(-731) },
  ]
  const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: [], carnets, hoy: HOY })
  assert.deepEqual(r.avisos.map((a) => a.id), ['reciente'])
})

test('🚨 un carné no puede salir a la vez como «caduca pronto» y «ya caducó»', () => {
  for (const n of [-731, -730, -1, 0, 1, 60, 61]) {
    const carnets = [{ id: 'c', tipo: 'B', fechaCaducidad: fecha(n) }]
    const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: [], carnets, hoy: HOY })
    assert.ok(r.avisos.length <= 1, `día ${n}: ${r.avisos.length} avisos del mismo carné`)
  }
})

test('carnets: null se declara ilegible, igual que las demás fuentes', () => {
  const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: [], carnets: null, hoy: HOY })
  assert.deepEqual(r.fuentesIlegibles, ['carnets'])
  assert.equal(r.globo, '0+')
})

test('🚨 una fecha de carné malformada se SALTA: no puede tumbar toda la campana', () => {
  // El puente solo comprueba que `fechaCaducidad` sea una cadena. Formatear la
  // fecha antes de validarla convertía una basura en `RangeError: Invalid time
  // value`, que sube por `avisosDe()` entera: la campana devuelve 500 en vez de
  // degradar a `n+`, y la pasada del emisor de intranet se aborta para TODOS
  // los clientes por el carné de uno.
  for (const malformada of ['', '   ', 'no es una fecha', '2026-13-45', '0000-00-00']) {
    const carnets = [{ id: 'malo', tipo: 'B', fechaCaducidad: malformada }]
    const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: [], carnets, hoy: HOY })
    assert.deepEqual(r.avisos, [], `«${malformada}» no se saltó`)
    // Y no se declara ilegible: la fuente SÍ se leyó; lo que no vale es ese carné.
    assert.deepEqual(r.fuentesIlegibles, [])
  }
})

test('una fecha malformada no impide avisar del carné BUENO del mismo cliente', () => {
  const carnets = [
    { id: 'malo', tipo: 'B', fechaCaducidad: 'no es una fecha' },
    { id: 'bueno', tipo: 'C', fechaCaducidad: fecha(10) },
  ]
  const r = avisosDe({ autorizaciones: vacias, obligaciones: [], peticiones: [], datos: [], carnets, hoy: HOY })
  assert.deepEqual(r.avisos.map((a) => a.id), ['bueno'])
})

test('🚨 solo el recordatorio RECURRENTE lleva la fecha del ciclo en su id', () => {
  // Las dos mitades importan, y por motivos opuestos:
  //  · con ciclo, sin la fecha el sello de `portal_aviso_enviado` lo deja mudo
  //    para siempre después del primer aviso (misma fila, misma clave);
  //  · sin ciclo, CON la fecha se manda un SEGUNDO correo de la misma
  //    renovación en cuanto CIMA corrija el vencimiento, porque
  //    `sincronizarObligacionesDeIdentidad()` reescribe `fechaAccionable` en
  //    cada carga de la bóveda y la clave cambiaría con ella.
  const base = { titulo: 'x', fechaAccionable: dias(0) }
  const r = avisosDe({
    autorizaciones: vacias,
    obligaciones: [
      { ...base, id: 'una-vez' },
      { ...base, id: 'una-vez-explicita', repiteCadaMeses: null },
      { ...base, id: 'recurrente', repiteCadaMeses: 12 },
    ],
    peticiones: [],
    datos: [],
    carnets: [],
    hoy: HOY,
  })
  const ids = r.avisos.map((a) => a.id)
  assert.equal(ids[0], 'una-vez')
  assert.equal(ids[1], 'una-vez-explicita')
  assert.match(ids[2]!, /^recurrente:\d{4}-\d{2}-\d{2}$/)
})

test('🚨 una anulación que espera SU firma sale en la campana: sin firma no se pide la baja y la vieja se renueva', () => {
  const r = avisosDe({ autorizaciones: null, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [{ id: 'a1', compania: 'Mapfre' }], hoy: HOY })
  assert.deepEqual(r.avisos.map((a) => [a.tipo, a.id, a.href]), [['anulacion_por_firmar', 'a1', '/boveda']])
  assert.match(r.avisos[0]!.titulo, /Mapfre/)
  // Ilegible ≠ «no tienes nada que firmar».
  assert.ok(avisosDe({ autorizaciones: null, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: null, hoy: HOY }).fuentesIlegibles.includes('firmas'))
})

test('🎂 la felicitación de hoy sale en la campana y lleva a la bóveda', () => {
  const r = avisosDe({ autorizaciones: null, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], felicitaciones: [{ id: 'f1' }], hoy: HOY })
  const f = r.avisos.find((a) => a.tipo === 'felicitacion')
  assert.ok(f)
  assert.equal(f.href, '/boveda')
  assert.match(f.titulo, /Feliz cumpleaños/)
})

test('felicitaciones ilegibles se declaran; ausentes (el emisor de correo) no cuentan como fuente', () => {
  const ilegible = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], felicitaciones: null, hoy: HOY })
  assert.deepEqual(ilegible.fuentesIlegibles, ['felicitaciones'])
  assert.equal(ilegible.globo, '0+')
  const todas = avisosDe({ autorizaciones: null, obligaciones: null, peticiones: null, datos: null, carnets: null, firmas: null, felicitaciones: null, hoy: HOY })
  assert.equal(todas.globo, '!')
})
