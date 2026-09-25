// Guardián del lector de relaciones entre clientes de la correduría en
// plataforma (`apps/plataforma/lib/relaciones-asegura.ts`). Puro: sin red.
//
// Lo que fija: `relaciones: null` = «no se pudo consultar» y `[]` = «se miró y
// no hay ninguna anotada» no se confunden; los dos flags de autorización son
// direccionales y se leen tal cual; `polizasVivas: null` se conserva (no es 0);
// y los estados de escritura del puerto (ok / conflicto / invalido /
// no_encontrado / sin_configurar / error) llegan cada uno con su motivo.
//
// 🚨 Desde el 03/09/2026 fija además la verdad NUEVA: la autorización dejó de
// ser un booleano (`cliente_relaciones.puede_ver_polizas`, hoy dato muerto) y
// llega como bloque `autorizacion` con CUATRO estados. Lo que no se puede
// confundir es lo de siempre, una capa más abajo: `autorizacion: null` = «no
// hay ninguna» · `pendiente` = «la hay y TODAVÍA NO VE NADA» · `vigente` = ve.
// `autorizaVer` sigue existiendo y sigue significando lo mismo (¿lo ve HOY?),
// así que es el resumen de `vigente`, no del bloque entero.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  autorizacionViva,
  explicarEstadoAutorizacion,
  explicarSentidoAcceso,
  fechaLarga,
  insigniaAcceso,
  interpretarRelaciones,
  leerAutorizacion,
  leerRelacion,
  leerRelaciones,
  textoMotivoRelaciones,
} from '../apps/plataforma/lib/relaciones-asegura.ts'

const CONYUGE = {
  idIda: 'r1', idVuelta: 'r2', relacionadoId: 'c2', tipo: 'Cónyuge/Pareja de Hecho',
  autorizaVer: true, puedeVer: false, observaciones: null,
  nombre: 'María Antonia Gutierrez Alcala', tipoCliente: 'cliente', polizasVivas: 3,
}

test('🚨 sin bloque de relaciones → null; con lista vacía → [] (son cosas distintas)', () => {
  assert.equal(leerRelaciones(undefined), null)
  assert.equal(leerRelaciones(null), null)
  assert.equal(leerRelaciones('no'), null, 'una lista que no es lista degrada a null, no a []')
  assert.equal(leerRelaciones({ relaciones: [] }), null)
  assert.deepEqual(leerRelaciones([]), [], 'lista vacía SÍ es «sin relaciones anotadas»')
})

test('los flags de autorización son direccionales y se leen tal cual', () => {
  const r = leerRelacion(CONYUGE)
  assert.ok(r)
  assert.equal(r.autorizaVer, true, 'la ficha autoriza a María Antonia')
  assert.equal(r.puedeVer, false, 'María Antonia NO ha autorizado a la ficha')
  assert.equal(r.tipo, 'Cónyuge/Pareja de Hecho')
  assert.equal(r.nombre, 'María Antonia Gutierrez Alcala')
  assert.equal(r.polizasVivas, 3)
  // Sin booleanos de verdad no hay relación legible: un `'true'` de texto se salta.
  assert.equal(leerRelacion({ ...CONYUGE, autorizaVer: 'true' }), null)
  assert.equal(leerRelacion({ ...CONYUGE, puedeVer: undefined }), null)
})

test('🚨 polizasVivas null se conserva como null, jamás como 0', () => {
  const r = leerRelacion({ ...CONYUGE, polizasVivas: null })
  assert.equal(r?.polizasVivas, null)
  const sin = leerRelacion({ ...CONYUGE, polizasVivas: undefined })
  assert.equal(sin?.polizasVivas, null, 'asegura sin contar ≠ cero pólizas')
  assert.equal(leerRelacion({ ...CONYUGE, polizasVivas: 0 })?.polizasVivas, 0, 'cero contado SÍ es un dato')
})

test('una fila rara se salta sin tumbar el bloque; idIda/idVuelta pueden faltar', () => {
  const l = leerRelaciones([CONYUGE, 'basura', { relacionadoId: 'x' }, { ...CONYUGE, relacionadoId: 'c3', idIda: null, nombre: undefined }])
  assert.ok(l)
  assert.equal(l.length, 2)
  assert.equal(l[1].idIda, null, 'el volcado a veces solo trajo la inversa')
  assert.equal(l[1].nombre, 'sin nombre')
})

test('GET/escrituras: ok / sin_configurar / no_encontrado / conflicto / invalido / error no se confunden', () => {
  const ok = interpretarRelaciones(200, { estado: 'ok', relaciones: [CONYUGE] })
  assert.equal(ok.estado, 'ok')
  if (ok.estado === 'ok') assert.equal(ok.relaciones.length, 1)

  const vacio = interpretarRelaciones(200, { estado: 'ok', relaciones: [] })
  assert.deepEqual(vacio, { estado: 'ok', relaciones: [] })

  // Un `ok` sin lista NO se lee como «sin relaciones».
  assert.deepEqual(interpretarRelaciones(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })

  assert.deepEqual(interpretarRelaciones(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarRelaciones(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarRelaciones(404, { estado: 'no_encontrado', motivo: 'no existe c9' }), { estado: 'no_encontrado', motivo: 'no existe c9' })
  assert.deepEqual(interpretarRelaciones(409, { estado: 'conflicto', motivo: 'ya están relacionados' }), { estado: 'conflicto', motivo: 'ya están relacionados' })
  assert.deepEqual(interpretarRelaciones(422, { estado: 'invalido', motivo: 'tipo desconocido' }), { estado: 'invalido', motivo: 'tipo desconocido' })
  assert.deepEqual(interpretarRelaciones(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarRelaciones(500, { estado: 'error', causa: 'password authentication failed' }), { estado: 'error', motivo: 'password authentication failed' })
  assert.deepEqual(interpretarRelaciones(502, { estado: 'error', motivo: 'red' }), { estado: 'error', motivo: 'red' })
  assert.deepEqual(interpretarRelaciones(500, null), { estado: 'error', motivo: 'HTTP 500' })
})

test('los motivos técnicos se traducen; una frase se deja tal cual', () => {
  assert.match(textoMotivoRelaciones('red'), /asegura/)
  assert.equal(textoMotivoRelaciones('ya están relacionados'), 'ya están relacionados')
})

// ─── La autorización: cuatro estados, y ninguno se colapsa ───────────────────

const VIGENTE = { estado: 'vigente', alcances: ['ver'], caducaEn: '2027-09-03T10:00:00.000Z', origen: 'corredor' }

test('🚨 sin bloque `autorizacion` → null («no hay ninguna»), y eso NO es un fallo de lectura', () => {
  // El fallo de lectura es `relaciones === null` (el bloque entero), que ya
  // fija el primer test. Aquí `null` significa exactamente «no hay autorización».
  assert.equal(leerRelacion(CONYUGE)?.autorizacion, null)
  assert.equal(leerAutorizacion(undefined), null)
  assert.equal(leerAutorizacion(null), null)
})

test('🚨 PENDIENTE se conserva como pendiente: no es «vigente» ni es «no hay»', () => {
  const a = leerAutorizacion({ ...VIGENTE, estado: 'pendiente' })
  assert.equal(a?.estado, 'pendiente', 'una anotada por el corredor y sin aceptar NO abre nada')
  assert.notEqual(a?.estado, 'vigente')
  assert.ok(a !== null, 'y tampoco puede leerse como «no hay autorización»')
  // La frase que lee Alberto tiene que decir que todavía no ve nada.
  const t = explicarEstadoAutorizacion(a, 'María', 'José')
  assert.match(t, /TODAVÍA NO VE NADA/)
  assert.match(t, /correduría/, 'y de quién salió: la anotó la correduría, no la dio el cliente')
})

test('vigente dice hasta cuándo y con qué alcance; sin autorización dice que no ve', () => {
  const a = leerAutorizacion(VIGENTE)
  assert.equal(a?.estado, 'vigente')
  assert.deepEqual(a?.alcances, ['ver'])
  assert.match(explicarEstadoAutorizacion(a, 'María', 'José'), /En vigor hasta el 3 de septiembre de 2027/)
  assert.match(explicarEstadoAutorizacion(a, 'María', 'José'), /tarjeta/, 'sin ver_economico solo ve la tarjeta')
  assert.match(
    explicarEstadoAutorizacion(leerAutorizacion({ ...VIGENTE, alcances: ['ver', 'ver_economico'] }), 'María', 'José'),
    /económico/,
  )
  assert.match(explicarEstadoAutorizacion(null, 'María', 'José'), /no hay ninguna autorización/)
})

test('caducada y revocada se dicen como lo que son: la hubo y ya no vale', () => {
  assert.match(explicarEstadoAutorizacion(leerAutorizacion({ ...VIGENTE, estado: 'caducada' }), 'María', 'José'), /caducó el/)
  assert.match(explicarEstadoAutorizacion(leerAutorizacion({ ...VIGENTE, estado: 'revocada' }), 'María', 'José'), /revocada/)
})

test('🚨 un bloque de autorización que no se entiende degrada a null (= «no ve»), nunca a un vigente inventado', () => {
  assert.equal(leerAutorizacion({ ...VIGENTE, estado: 'activa' }), null, 'un estado fuera del vocabulario no se traduce')
  assert.equal(leerAutorizacion({ ...VIGENTE, caducaEn: 'el año que viene' }), null, 'sin fecha legible no se afirma vigencia')
  assert.equal(leerAutorizacion({ ...VIGENTE, caducaEn: undefined }), null)
  // Un alcance desconocido se descarta, pero no tumba el bloque: el estado manda.
  const a = leerAutorizacion({ ...VIGENTE, alcances: ['ver', 'poderes_notariales'] })
  assert.deepEqual(a?.alcances, ['ver'])
  // Sin `origen` legible no se inventa quién la dio.
  assert.equal(leerAutorizacion({ ...VIGENTE, origen: 42 })?.origen, 'sin_informar')
})

// 🚨 Desde el 25/09/2026 las autorizaciones NO caducan: el puerto manda
// `caducaEn: null`. Ese `null` EXPLÍCITO es «no caduca» y se lee; lo que sigue
// degradando a null es lo ausente o ilegible (arriba). Y la pantalla no puede
// decir «hasta el …» ni «caduca el …» de algo que no tiene fecha.
test('🚨 `caducaEn: null` = vigente SIN fecha de fin, no un bloque roto', () => {
  const a = leerAutorizacion({ ...VIGENTE, caducaEn: null })
  assert.notEqual(a, null, 'null explícito es «no caduca», no «no tiene forma»')
  assert.equal(a?.estado, 'vigente')
  assert.equal(a?.caducaEn, null)
  const frase = explicarEstadoAutorizacion(a, 'María', 'José')
  assert.match(frase, /sin fecha de fin/)
  assert.doesNotMatch(frase, /hasta el|[Cc]aduca el|Invalid Date/)
  const pendiente = explicarEstadoAutorizacion(leerAutorizacion({ ...VIGENTE, estado: 'pendiente', caducaEn: null }), 'María', 'José')
  assert.match(pendiente, /TODAVÍA NO VE NADA/)
  assert.doesNotMatch(pendiente, /[Cc]aduca el|Invalid Date/)
})

test('«acceso total» se lee y se dice como lo que es: ve todo y actúa en nombre del titular', () => {
  const a = leerAutorizacion({ ...VIGENTE, alcances: ['total'], caducaEn: null })
  assert.deepEqual(a?.alcances, ['total'], '`total` está en el vocabulario: no se descarta')
  const frase = explicarEstadoAutorizacion(a, 'María', 'José')
  assert.match(frase, /ACCESO TOTAL/)
  assert.match(frase, /ACTÚA en nombre de José/)
})

test('`autorizaVer` es el resumen de «¿lo ve HOY?» y viaja junto al bloque, sin contradecirlo', () => {
  const r = leerRelacion({ ...CONYUGE, autorizaVer: false, autorizacion: { ...VIGENTE, estado: 'pendiente' } })
  assert.equal(r?.autorizaVer, false, 'pendiente NO abre datos')
  assert.equal(r?.autorizacion?.estado, 'pendiente', 'pero la autorización existe y la pantalla lo dice')
  const v = leerRelacion({ ...CONYUGE, autorizaVer: true, autorizacion: VIGENTE })
  assert.equal(v?.autorizaVer, true)
  assert.equal(v?.autorizacion?.estado, 'vigente')
})

test('las fechas se pintan en español legible; una ilegible se devuelve tal cual', () => {
  assert.equal(fechaLarga('2027-09-03T10:00:00.000Z'), '3 de septiembre de 2027')
  assert.equal(fechaLarga('mañana'), 'mañana')
})

// ─── Los DOS sentidos, cada uno con su estado (15/09/2026) ───────────────────
//
// 🚨 El fallo que cierra este bloque: hasta hoy del sentido de VUELTA solo
// cruzaba el puerto `puedeVer`, un booleano de «¿lo ve HOY?». Con eso, una
// autorización anotada y pendiente de aceptar era indistinguible de no haber
// ninguna — las dos pintaban «no». Alberto anotó las de Esquiansa→Juan Manuel y
// Francisca→Juan Manuel, la pantalla no cambió de aspecto, y la conclusión
// razonable fue «no se ha hecho nada». Lo que sí había cambiado (estado
// `pendiente`, esperando que él acepte en su portal) no se veía en ningún sitio.

test('🚨 `autorizacionInversa`: el sentido de vuelta trae su estado, no solo un sí/no', () => {
  const r = leerRelacion({
    ...CONYUGE,
    puedeVer: false,
    autorizacionInversa: { ...VIGENTE, estado: 'pendiente' },
  })
  assert.equal(r?.puedeVer, false, 'pendiente NO abre datos')
  assert.equal(r?.autorizacionInversa?.estado, 'pendiente', 'pero la hay, y la pantalla tiene que poder decirlo')
})

test('🚨 la clave que NO viene es `undefined` («no lo sé»), nunca `null` («no hay»)', () => {
  // Un asegura sin desplegar todavía no manda el campo. Decir «no hay
  // autorización» con eso sería inventarse una ausencia: es el mismo fallo que
  // esta tanda arregla, un escalón más abajo.
  assert.equal(leerRelacion(CONYUGE)?.autorizacionInversa, undefined)
  assert.equal(leerRelacion({ ...CONYUGE, autorizacionInversa: null })?.autorizacionInversa, null)
})

test('🚨 la insignia distingue los TRES estados, y «ve» manda sobre el resumen', () => {
  assert.deepEqual(insigniaAcceso(VIGENTE as never, true), { icono: '🔓', etiqueta: 'SÍ VE', tono: 've' })
  // El estado que no existía en pantalla: hay consentimiento y NO ve nada.
  const p = insigniaAcceso({ ...VIGENTE, estado: 'pendiente' } as never, false)
  assert.equal(p.etiqueta, 'ANOTADA · AÚN NO VE')
  assert.equal(p.tono, 'espera', 'ni el verde del «sí» ni el gris del «no»')
  assert.equal(insigniaAcceso(null, false).etiqueta, 'NO VE')
  assert.equal(insigniaAcceso({ ...VIGENTE, estado: 'revocada' } as never, false).etiqueta, 'NO VE · REVOCADA')
  assert.equal(insigniaAcceso({ ...VIGENTE, estado: 'caducada' } as never, false).etiqueta, 'NO VE · CADUCADA')
  // El hueco tiene tono propio: un «no consta» no se pinta con el gris del «no».
  assert.deepEqual(insigniaAcceso(undefined, false), { icono: '❔', etiqueta: 'NO CONSTA', tono: 'duda' })
  // Si el puerto dice que lo ve, ninguna rama puede decir «no ve».
  assert.equal(insigniaAcceso(undefined, true).etiqueta, 'SÍ VE')
  assert.equal(insigniaAcceso(null, true).etiqueta, 'SÍ VE')
})

test('🚨 con el dato ausente la frase NO afirma que no haya autorización', () => {
  const t = explicarSentidoAcceso(undefined, 'Juan Manuel', 'Esquiansa', false)
  assert.match(t, /no consta/i)
  assert.doesNotMatch(t, /no hay ninguna autorización/i)
  // Y con el dato presente manda la frase de siempre, clavada al literal: si se
  // compara contra `explicarEstadoAutorizacion` el test repite la
  // implementación y no puede ponerse rojo nunca.
  assert.equal(
    explicarSentidoAcceso(null, 'Juan Manuel', 'Esquiansa', false),
    'Juan Manuel no ve los seguros de Esquiansa: no hay ninguna autorización.',
  )
  // 🚨 `ve` manda sobre el resumen: la frase no puede desmentir a la insignia.
  assert.match(
    explicarSentidoAcceso(null, 'Juan Manuel', 'Esquiansa', true),
    /^Juan Manuel ve los seguros de Esquiansa \(aquí no consta ninguna anotada\)\.$/,
  )
  assert.match(explicarSentidoAcceso(undefined, 'Juan Manuel', 'Esquiansa', true), /ve los seguros de Esquiansa/)
})

test('«viva» es vigente o pendiente: una pendiente también se puede retirar', () => {
  assert.equal(autorizacionViva(VIGENTE as never), true)
  assert.equal(autorizacionViva({ ...VIGENTE, estado: 'pendiente' } as never), true)
  assert.equal(autorizacionViva({ ...VIGENTE, estado: 'revocada' } as never), false)
  assert.equal(autorizacionViva(null), false)
  assert.equal(autorizacionViva(undefined), false)
})
