// Cepos de la PURGA del riesgo al cerrar un trabajo del tarificador (13/10/2026). `node --test`.
//   1. Un trabajo CERRADO no conserva ningún dato personal (BD falsa: se mira lo que se ESCRIBE).
//   2. Un trabajo en `requiere_humano` / `error_reintentable` conserva el riesgo ENTERO (no se escribe nada).
//   3. Cableado: cada sitio que cierra un trabajo llama a la purga, y DESPUÉS de lo que lee el riesgo.
//   4. Encolar sin un dato obligatorio falla con 4xx y dice qué falta (nunca se encola vacío), también desde un riesgo purgado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIAS_RETENCION_RECORRIDO, purgarRecorridosCaducados, purgarRiesgoTrabajos, type DbPurga } from './tarificador-purga.ts'
import { validarEntradaRamo } from './tarificador-reglas.ts'
import { riesgoPrevioRenovacion } from './tarificador-ops-reglas.ts'
import { primeroReutilizable } from './tarificador-lectura-reglas.ts'
import { decidirAccionBandeja, riesgoSinDatosPersonales } from '@central/module-tarificacion'

const APP = join(import.meta.dirname, '..')
const leer = (r: string) => readFileSync(join(APP, r), 'utf8')
function trozo(fichero: string, desde: string, hasta?: string): string {
  const s = leer(fichero)
  const i = s.indexOf(desde)
  assert.ok(i >= 0, `${fichero}: no está «${desde}»`)
  const j = hasta ? s.indexOf(hasta, i + desde.length) : -1
  return s.slice(i, j > i ? j : undefined)
}

const MOTO = {
  ramo: 'moto', matricula: '1234BCD', codigoPostal: '41003', poblacion: 'Sevilla',
  conductor: { fechaNacimiento: '1980-05-01', fechaCarne: '2000-06-01', sexo: 'mujer' },
  tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0, garajeNoche: true,
  tomador: { tipo: 'fisica', nombre: 'Juana', apellido1: 'Pérez', apellido2: null, razonSocial: null, documentoIdentidad: '12345678Z', fechaNacimiento: '1980-05-01', codigoPostal: '41003', poblacion: 'Sevilla', direccion: 'Calle Falsa 1', telefono: '600111222', email: 'juana@example.com' },
  seleccionVehiculo: { marca: 'BMW', modelo: 'F 800', clase: 4, cilindradaCc: 798, descripcion: 'BMW F 800 S' },
}
const PERSONALES = ['1234BCD', '1980-05-01', '2000-06-01', '12345678Z', '600111222', 'juana@example.com', 'Calle Falsa 1', 'Juana', 'matricula', 'conductor', 'tomador']

/** BD falsa: devuelve `filas` al SELECT y guarda lo que se escribiría en cada UPDATE. */
function bdFalsa(filas: Record<string, unknown>[]) {
  const escrito: { riesgo: unknown; id: unknown; estado: unknown }[] = []
  const db = {
    $queryRaw: async () => filas,
    $executeRaw: async (_s: TemplateStringsArray, riesgo: string, id: unknown, estado: unknown) => {
      escrito.push({ riesgo: JSON.parse(riesgo), id, estado })
      return 1
    },
  } as unknown as DbPurga
  return { db, escrito }
}
const fila = (estado: string, extra: Record<string, unknown> = {}) => ({ id: 't1', estado, modo: null, compania: 'allianz', ramo: 'moto', riesgo: MOTO, terminado_at: new Date(), ahora: new Date(), emisiones: null, origen_id: null, ...extra })

// ─── 1 · CEPO: trabajo cerrado sin datos personales ──────────────────────────
for (const estado of ['ok', 'error_definitivo', 'cancelado', 'emitido']) {
  test(`CEPO purga · ${estado}: lo que se escribe no lleva ningún dato personal`, async () => {
    const { db, escrito } = bdFalsa([fila(estado)])
    assert.equal(await purgarRiesgoTrabajos(db, ['t1']), 1)
    assert.equal(escrito.length, 1)
    const texto = JSON.stringify(escrito[0].riesgo)
    for (const p of PERSONALES) assert.ok(!texto.includes(p), `${estado}: queda «${p}» en el riesgo`)
    // El UPDATE va atado al estado leído (si otro lo movió, no se toca).
    assert.equal(escrito[0].estado, estado)
    assert.deepEqual(escrito[0].riesgo, riesgoSinDatosPersonales(MOTO, 'moto'))
  })
}

// ─── 2 · CEPO: lo que espera un reintento conserva el riesgo ─────────────────
for (const estado of ['requiere_humano', 'error_reintentable', 'pendiente', 'en_curso']) {
  test(`CEPO conserva · ${estado}: no se escribe nada`, async () => {
    const { db, escrito } = bdFalsa([fila(estado)])
    assert.equal(await purgarRiesgoTrabajos(db, ['t1']), 0)
    assert.equal(escrito.length, 0)
  })
}

test('origen de emisión (Allianz Comunidades ok) no se purga; sin ids no se consulta nada', async () => {
  const { db, escrito } = bdFalsa([fila('ok', { ramo: 'comunidades', riesgo: { ramo: 'comunidades', documentoIdentidad: 'H12345678', direccion: { codigoPostal: '41003' } } })])
  assert.equal(await purgarRiesgoTrabajos(db, ['t1']), 0)
  assert.equal(escrito.length, 0)
  let consultas = 0
  const vacia = { $queryRaw: async () => { consultas++; return [] }, $executeRaw: async () => 0 } as unknown as DbPurga
  assert.equal(await purgarRiesgoTrabajos(vacia, [null, undefined, '']), 0)
  assert.equal(consultas, 0)
})

// ─── 2b · Origen de emisión: se libera al cerrarse su emisión o a los 30 días ─
const COMUNIDAD = { ramo: 'comunidades', documentoIdentidad: 'H12345678', direccion: { via: 'Calle Socorro', codigoPostal: '41003' }, m2Construidos: 900 }
test('origen de emisión: al cerrarse SU emisión, purgar la emisión purga también el origen', async () => {
  const filasPorLlamada = [
    [fila('emitido', { id: 'e1', modo: 'emision', ramo: 'comunidades', riesgo: COMUNIDAD, origen_id: 'o1' })],
    [fila('ok', { id: 'o1', ramo: 'comunidades', riesgo: COMUNIDAD, emisiones: ['emitido'] })],
  ]
  const escrito: { id: unknown; riesgo: unknown }[] = []
  const db = {
    $queryRaw: async () => filasPorLlamada.shift() ?? [],
    $executeRaw: async (_s: TemplateStringsArray, riesgo: string, id: unknown) => { escrito.push({ id, riesgo: JSON.parse(riesgo) }); return 1 },
  } as unknown as DbPurga
  assert.equal(await purgarRiesgoTrabajos(db, ['e1']), 2)
  assert.deepEqual(escrito.map((e) => e.id), ['e1', 'o1'])
  for (const e of escrito) assert.ok(!JSON.stringify(e.riesgo).includes('H12345678') && !JSON.stringify(e.riesgo).includes('Socorro'))
})
test('CEPO origen: una emisión RECHAZADA/CADUCADA (cancelado) purga su copia pero NO el origen (sigue en plazo)', async () => {
  const filasPorLlamada = [
    [fila('cancelado', { id: 'e1', modo: 'emision', ramo: 'comunidades', riesgo: COMUNIDAD, origen_id: 'o1' })],
    [fila('ok', { id: 'o1', ramo: 'comunidades', riesgo: COMUNIDAD, emisiones: ['cancelado'], terminado_at: new Date(Date.now() - 2 * 86_400_000) })],
  ]
  const escrito: unknown[] = []
  const db = {
    $queryRaw: async () => filasPorLlamada.shift() ?? [],
    $executeRaw: async (_s: TemplateStringsArray, _r: string, id: unknown) => { escrito.push(id); return 1 },
  } as unknown as DbPurga
  assert.equal(await purgarRiesgoTrabajos(db, ['e1']), 1)
  assert.deepEqual(escrito, ['e1'])
})
test('CEPO origen: solicitarEmision acepta de nuevo un origen cuya emisión se rechazó (dentro del plazo)', () => {
  // La regla es la misma función pura; aquí se fija que la ruta la usa y que el texto dice «ya se emitió o 30 días».
  const t = trozo('lib/tarificador-emision.ts', 'export async function solicitarEmision', 'const pre = precondicionesEmision')
  assert.match(t, /ya se emitió o pasaron 30 días desde la tarificación/)
  assert.doesNotMatch(leer('lib/tarificador-emision.ts'), /su emisión se cerró/)
})
test('origen de emisión: sin emisión, se conserva dentro de los 30 días y se purga después', async () => {
  const dentro = bdFalsa([fila('ok', { ramo: 'comunidades', riesgo: COMUNIDAD, terminado_at: new Date(Date.now() - 29 * 86_400_000) })])
  assert.equal(await purgarRiesgoTrabajos(dentro.db, ['t1']), 0)
  const fuera = bdFalsa([fila('ok', { ramo: 'comunidades', riesgo: COMUNIDAD, terminado_at: new Date(Date.now() - 31 * 86_400_000) })])
  assert.equal(await purgarRiesgoTrabajos(fuera.db, ['t1']), 1)
  assert.ok(!JSON.stringify(fuera.escrito[0].riesgo).includes('H12345678'))
})
test('origen de emisión: con una emisión ABIERTA no se toca', async () => {
  const { db, escrito } = bdFalsa([fila('ok', { ramo: 'comunidades', riesgo: COMUNIDAD, terminado_at: new Date(0), emisiones: ['pendiente_autorizacion_emision'] })])
  assert.equal(await purgarRiesgoTrabajos(db, ['t1']), 0)
  assert.equal(escrito.length, 0)
})
test('solicitarEmision rechaza un origen ya liberado (nunca emite con un riesgo a medias)', () => {
  const t = trozo('lib/tarificador-emision.ts', 'export async function solicitarEmision', 'const pre = precondicionesEmision')
  assert.match(t, /if \(origenEmisionLiberado\(\{ terminadoAt: t\.terminado_at, ahora: t\.ahora, emisiones: t\.emisiones \?\? \[\] \}\)\) \{\s*return rechazo\(409, 'origen_purgado/)
})
test('tarificaciones.peticion (canal rpa) se escribe YA recortada, nunca con el riesgo entero', () => {
  const t = trozo('lib/tarificador.ts', 'async function guardarTarificacionRpa', 'async function guardarAdjunto')
  assert.match(t, /\$\{JSON\.stringify\(riesgoSinDatosPersonales\(rg, t\.ramo\)\)\}::jsonb/)
  assert.doesNotMatch(t, /\$\{JSON\.stringify\(rg\)\}/)
})

// ─── 3 · Cableado: cada cierre purga, y después de leer ──────────────────────
// Un brazo por sitio: quitar la llamada de uno solo lo pone en rojo.
const CIERRES: [string, string, string, string | undefined][] = [
  ['resultado ok (tarificación)', 'lib/tarificador.ts', 'const tarificacionId = await guardarTarificacionRpa', 'return { res: { estado: \'registrado\' as const, estadoTrabajo: \'ok\', tarificacionId }'],
  ['resultado explorado', 'lib/tarificador.ts', "if (r.tipo === 'explorado') {", "if (r.tipo === 'error') {"],
  ['fallo (error_definitivo)', 'lib/tarificador.ts', 'async function marcarFallo(', '// ─── Barrido'],
  ['barrido: cancela pendientes sin integración', 'lib/tarificador.ts', "set estado = 'cancelado', terminado_at = now(), updated_at = now(),\n        error = jsonb_build_object('tipo', 'datos'", 'const companias = await prisma'],
  ['bandeja: cancelar', 'lib/tarificador-bandeja.ts', "set estado = 'cancelado', lease_hasta = null", 'return { estado: \'aplicado\' as const'],
  ['emisión: resultado (emitido)', 'lib/tarificador-emision.ts', 'set estado = ${d.estado}, error = ${err}::jsonb', "return { estado: 'registrado' as const, estadoTrabajo: d.estado }"],
  ['emisión: rechazada por Telegram', 'lib/tarificador-emision.ts', "mensaje: 'Emisión rechazada por Telegram'", "return { estado: 'cancelado' as const"],
  ['emisión: caducadas', 'lib/tarificador-emision.ts', 'export async function caducarEmisiones', undefined],
  // Generali en espera del vehículo de Allianz/Mapfre que ya no puede llegar (18/10/2026): `cancelado` y purgado.
  ['barrido: cancela Generali sin vehículo confirmado', 'lib/tarificador.ts', 'async function resolverEsperasVehiculo(', undefined],
]
for (const [nombre, fichero, desde, hasta] of CIERRES) {
  test(`cableado · ${nombre} llama a purgarRiesgoTrabajos`, () => {
    assert.match(trozo(fichero, desde, hasta), /purgarRiesgoTrabajos\(/)
  })
}

test('cableado · en el ok, la purga va DESPUÉS de guardar la tarificación y de cerrar la fila', () => {
  const t = trozo('lib/tarificador.ts', 'export async function registrarResultado', 'async function guardarTarificacionRpa')
  const guardar = t.indexOf('await guardarTarificacionRpa(')
  const cerrar = t.indexOf("set estado = 'ok', tarificacion_id")
  const purga = t.indexOf('await purgarRiesgoTrabajos(tx, [t.id])', cerrar)
  assert.ok(guardar > 0 && cerrar > guardar && purga > cerrar, 'orden: guardar tarificación → cerrar → purgar')
  // El aprendizaje de versión usa la copia en memoria del trabajo, no relee la fila (ya purgada).
  assert.match(t, /memoriaTrasExito\(interno\.traza\.t\)/)
})

test('cableado · el barrido tiene el respaldo de purga', () => {
  assert.match(trozo('lib/tarificador.ts', 'export async function barrerTarificadorRpa'), /purgarRiesgosCerrados\(prisma, correduriaId\)/)
})

test('cableado · todo UPDATE que pone un estado de cierre está en un sitio vigilado', () => {
  // Si alguien añade otro `set estado = 'cancelado'|'ok'|'error_definitivo'|'emitido'`, este número cambia y obliga a
  // añadirlo a CIERRES (y a purgar allí).
  const cuenta = (f: string) => (leer(f).match(/set estado = '(ok|cancelado|error_definitivo|emitido)'/g) ?? []).length
  // El `ok`/`cancelado` de la prueba de humo (15/10/2026) va en un UPDATE con `case` (riesgo VACÍO: nada que purgar) y no suma.
  assert.equal(cuenta('lib/tarificador.ts'), 5)
  assert.equal(cuenta('lib/tarificador-bandeja.ts'), 1)
  assert.equal(cuenta('lib/tarificador-emision.ts'), 3)
  for (const f of ['lib/tarificador-eleccion.ts', 'lib/tarificador-explorador.ts', 'lib/tarificador-exploraciones.ts', 'lib/tarificador-verificacion.ts', 'lib/tarificador-formador.ts', 'lib/tarificador-ops.ts']) {
    assert.equal(cuenta(f), 0, `${f} cierra trabajos: añádelo a CIERRES y purga`)
  }
})

// ─── 4 · Encolar: un dato que falta → 4xx con «qué falta», nunca vacío ───────
test('encolar · moto sin matrícula ni conductor → no válido y dice qué falta', () => {
  const v = validarEntradaRamo('moto', { ramo: 'moto', codigoPostal: '41003' })
  assert.equal(v.ok, false)
  if (!v.ok) {
    assert.ok(v.errores?.some((e) => e.startsWith('matricula: obligatoria')))
    assert.ok(v.errores?.some((e) => e.startsWith('conductor: obligatorio')))
  }
})
test('encolar · comunidades sin CP ni metros → no válido y dice qué falta', () => {
  const v = validarEntradaRamo('comunidades', { ramo: 'comunidades' })
  assert.equal(v.ok, false)
  if (!v.ok) {
    assert.ok(v.errores?.some((e) => e.includes('codigoPostal')))
    assert.ok(v.errores?.some((e) => e.includes('m2Construidos') && e.includes('obligatorio')))
  }
})
test('encolar · un riesgo de moto PURGADO no se puede volver a encolar («Probar tarificación» da 422 con lo que falta)', () => {
  const v = validarEntradaRamo('moto', riesgoSinDatosPersonales(MOTO, 'moto'))
  assert.equal(v.ok, false)
  if (!v.ok) assert.ok(v.errores?.some((e) => e.startsWith('matricula: obligatoria')))
  assert.match(trozo('app/api/operador/tarificador/probar/route.ts', 'const valida = validarEntradaRamo'), /riesgo_previo_invalido', errores: valida\.errores \?\? \[\] \}, \{ status: 422 \}/)
})
test('encolar · la ruta de asegura valida ANTES de encolar y responde 400 con los errores', () => {
  const t = trozo('app/api/operador/tarificador/encolar/route.ts', 'const valida = validarEntradaRamo', 'const actor =')
  assert.match(t, /if \(!valida\.ok\) return NextResponse\.json\(\{ estado: 'error', mensaje: valida\.mensaje, \.\.\.\(valida\.errores \? \{ errores: valida\.errores \} : \{\}\) \}, \{ status: 400 \}\)/)
  assert.ok(leer('app/api/operador/tarificador/encolar/route.ts').indexOf('encolarTrabajo({') > leer('app/api/operador/tarificador/encolar/route.ts').indexOf('if (!valida.ok)'))
})

test('bandeja · un error_definitivo (riesgo purgado) ya no se reintenta; requiere_humano sí', () => {
  assert.equal(decidirAccionBandeja('reintentar', 'error_definitivo', 'portal').ok, false)
  assert.equal(decidirAccionBandeja('reintentar', 'requiere_humano', 'captcha').ok, true)
  assert.equal(decidirAccionBandeja('cancelar', 'error_definitivo', 'portal').ok, true)
})

// ─── 5 · CEPO plantillas: un riesgo ya PURGADO no se reutiliza ───────────────
const COM_LLENO = { ramo: 'comunidades', direccion: { via: 'Calle Socorro', numero: '24', codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla' }, documentoIdentidad: 'H12345678', m2Construidos: 900, anioConstruccion: 1975, tipoVivienda: 'Viviendas Pisos en Alto', uso: 'Habitual', plantas: 5, numEdificios: 1, numViviendasYLocales: 20, listaPropietarios: '> 50%', capitalContinente: 900000, numViviendas: null, numLocales: null, m2: null, ascensor: null, capitalContenido: null, fechaEfecto: null }
const COM_PURGADO = riesgoSinDatosPersonales(COM_LLENO, 'comunidades')
test('CEPO plantillas · renovación: salta el previo purgado y usa el anterior que aún tiene el CIF', () => {
  const r = riesgoPrevioRenovacion([
    { polizaId: 'p1', estado: 'cancelado', riesgo: COM_PURGADO, creadoEn: '2026-09-01' },
    { polizaId: 'p1', estado: 'requiere_humano', riesgo: COM_LLENO, creadoEn: '2026-08-01' },
  ], 'p1', 1, '2027-01-15', new Date('2026-12-01'))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.riesgo.documentoIdentidad, 'H12345678')
})
test('CEPO plantillas · renovación: si solo hay purgados → faltan con origen_purgado (nunca renueva a medias)', () => {
  const r = riesgoPrevioRenovacion([{ polizaId: 'p1', estado: 'ok', riesgo: COM_PURGADO, creadoEn: '2026-09-01' }], 'p1', 1, '2027-01-15', new Date('2026-12-01'))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.faltan[0], /^origen_purgado:/)
})
test('CEPO plantillas · precarga / «Probar»: el primero NO purgado; solo purgados → soloPurgados', () => {
  const a = primeroReutilizable([{ estado: 'ok', ramo: 'comunidades', riesgo: COM_PURGADO, id: 'x' }, { estado: 'error_reintentable', ramo: 'comunidades', riesgo: COM_LLENO, id: 'y' }])
  assert.equal(a.fila?.id, 'y')
  const b = primeroReutilizable([{ estado: 'cancelado', ramo: 'moto', riesgo: riesgoSinDatosPersonales(MOTO, 'moto') }])
  assert.deepEqual(b, { fila: null, soloPurgados: true })
  assert.deepEqual(primeroReutilizable([]), { fila: null, soloPurgados: false })
})
const PLANTILLAS: [string, string, string, string | undefined, RegExp][] = [
  ['renovaciones', 'lib/tarificador-ops.ts', 'async function leerRenovaciones', 'const sinRiesgo', /riesgoPrevioRenovacion\(delCliente,/],
  ['precarga previoCliente', 'lib/tarificador-oportunidad.ts', 'let previoCliente', 'return {', /proyectarUltimoRiesgo\(primeroReutilizable\(us\)\.fila\)/],
  ['modal último riesgo', 'lib/tarificador-lectura.ts', 'export async function leerUltimoRiesgo', 'type FilaTrabajo', /primeroReutilizable\(f\)\.fila/],
  ['«Probar» (lectura)', 'lib/tarificador-lectura.ts', 'export async function leerRiesgoParaReencolar', undefined, /primeroReutilizable\(f\)/],
  ['«Probar» (ruta)', 'app/api/operador/tarificador/probar/route.ts', 'const leido =', 'const valida', /if \(leido\.soloPurgados\) return NextResponse\.json\(\{ estado: 'rechazado', motivo: 'origen_purgado'/],
  ['explorador con datos reales', 'lib/tarificador-explorador.ts', 'if (e.trabajoOrigenId) {', 'clienteId = f.cliente_id', /if \(riesgoYaPurgado\(f\)\) return \{ estado: 'rechazado', status: 409, motivo: `\$\{MOTIVO_ORIGEN_PURGADO\}/],
]
for (const [nombre, fichero, desde, hasta, re] of PLANTILLAS) {
  test(`CEPO plantillas · cableado: ${nombre} no reutiliza un riesgo purgado`, () => assert.match(trozo(fichero, desde, hasta), re))
}

// ─── 5 · El recorrido SOBREVIVE al cierre (el inventario cae) y caduca en el barrido (15/10/2026) ─────
// Regresión del trabajo 50cc150d (Mapfre 0.7.2): `error_definitivo` → la purga del riesgo, en el MISMO commit, quitaba
// `error.recorrido` y `error.inventarioDom`, justo el diagnóstico del fallo. El recorrido es estructura ya saneada: se queda
// `DIAS_RETENCION_RECORRIDO` días y luego lo quita el barrido. El inventario cae al cierre.
test('CEPO purga: al cerrar, el UPDATE borra inventarioDom y CONSERVA recorrido', async () => {
  const sqls: string[] = []
  const db = {
    $queryRaw: async () => [fila('error_definitivo')],
    $executeRaw: async (s: TemplateStringsArray) => { sqls.push(s.join('?')); return 1 },
  } as unknown as DbPurga
  assert.equal(await purgarRiesgoTrabajos(db, ['t1']), 1)
  assert.equal(sqls.length, 1)
  assert.match(sqls[0], /set riesgo = \?::jsonb/)
  assert.match(sqls[0], /error - 'inventarioDom'/, 'el cierre ya no borra inventarioDom (puede llevar nombres)')
  assert.ok(!/'recorrido'/.test(sqls[0]), 'el cierre vuelve a borrar el recorrido (se pierde el diagnóstico del fallo)')
})

test('CEPO caducidad: el barrido quita recorrido e inventario SOLO de trabajos cerrados hace más de DIAS_RETENCION_RECORRIDO', async () => {
  const llamadas: { sql: string; vals: unknown[] }[] = []
  const db = {
    $queryRaw: async () => [],
    $executeRaw: async (s: TemplateStringsArray, ...vals: unknown[]) => { llamadas.push({ sql: s.join('?'), vals }); return 2 },
  } as unknown as DbPurga
  assert.equal(await purgarRecorridosCaducados(db, 'c1'), 2)
  assert.equal(llamadas.length, 1)
  const { sql, vals } = llamadas[0]
  assert.match(sql, /set error = t\.error - 'recorrido' - 'inventarioDom'/)
  assert.match(sql, /x\.estado = any\(\?::text\[\]\)/)
  assert.match(sql, /x\.terminado_at < now\(\) - \?::int \* interval '1 day'/)
  assert.ok(vals.includes(DIAS_RETENCION_RECORRIDO) && DIAS_RETENCION_RECORRIDO >= 7, 'la retención es la constante (y no menos de una semana)')
  assert.ok(Array.isArray(vals[1]) && !(vals[1] as string[]).includes('atascado') && (vals[1] as string[]).includes('error_definitivo'), 'solo estados cerrados')
  assert.match(trozo('lib/tarificador.ts', 'export async function barrerTarificadorRpa', 'const companias'), /purgarRecorridosCaducados\(prisma, correduriaId\)/)
})

test('CEPO lectura: el panel del tarificador NO trae error.recorrido ni error.inventarioDom de 5000 filas', () => {
  const t = trozo('lib/tarificador-ops.ts', 'export async function leerPanelTarificador', 'const metricas = calcularMetricas')
  assert.match(t, /t\.error - 'recorrido' - 'inventarioDom'/)
  assert.ok(!/terminado_at, error\n/.test(t), 'vuelve a seleccionar el jsonb error entero')
})

test('CEPO: al registrar un fallo, el recorrido se re-sanea con los valores del riesgo del trabajo ya leído', () => {
  const t = trozo('lib/tarificador.ts', "if (r.tipo === 'error') {", 'const docs: string[]')
  assert.match(t, /sanearRecorrido\(r\.error\.recorrido, undefined, valoresSensiblesDeRiesgo\(t\.riesgo\)\)/)
  assert.ok(t.indexOf('sanearRecorrido') < t.indexOf('marcarFallo('), 'el re-saneado tiene que ir ANTES de guardar el fallo')
})
