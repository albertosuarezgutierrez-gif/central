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
  explicarEstadoAutorizacion,
  fechaLarga,
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
