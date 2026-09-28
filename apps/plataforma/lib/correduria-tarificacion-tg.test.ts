import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirCuerpo, desenlaceCotizacion, elegirGaraje, emparejarOpcion, huecosPendientes, leerEntrada, textoPropuesta,
  ventaCruzada, type Resuelto,
} from './correduria-tarificacion-tg.ts'

const HOY = new Date('2026-09-28T10:00:00Z')
const CID = '11111111-2222-3333-4444-555555555555'

const MODELOS = [
  { id: '10', nombre: 'IBIZA' },
  { id: '11', nombre: 'LEON' },
  { id: '12', nombre: 'LEON SPORTSTOURER' },
]

test('emparejarOpcion: elige solo sin duda; con varias devuelve candidatas', () => {
  assert.deepEqual(emparejarOpcion('ibiza', MODELOS), { estado: 'uno', opcion: MODELOS[0] })
  assert.deepEqual(emparejarOpcion('12', MODELOS), { estado: 'uno', opcion: MODELOS[2] })
  // «León» a secas es idéntico a una opción: esa, aunque otra la contenga.
  assert.deepEqual(emparejarOpcion('León', MODELOS), { estado: 'uno', opcion: MODELOS[1] })
  const v = emparejarOpcion('le', MODELOS)
  assert.equal(v.estado, 'varios')
  assert.equal(v.estado === 'varios' && v.candidatas.length, 2)
  assert.deepEqual(emparejarOpcion('golf', MODELOS), { estado: 'ninguno' })
  assert.deepEqual(emparejarOpcion('', MODELOS), { estado: 'ninguno' })
})

test('elegirGaraje: sin decirlo, vía pública DECLARADA como supuesto', () => {
  const cat = [{ id: 'G1', nombre: 'Garaje individual' }, { id: 'VP', nombre: 'Vía pública' }]
  const g = elegirGaraje(null, cat)
  assert.deepEqual(g.resultado, { estado: 'uno', opcion: cat[1] })
  assert.match(g.supuesto ?? '', /no me has dicho/)
  const dicho = elegirGaraje('garaje individual', cat)
  assert.deepEqual(dicho.resultado, { estado: 'uno', opcion: cat[0] })
  assert.equal(dicho.supuesto, null)
  assert.deepEqual(elegirGaraje(null, [{ id: 'G1', nombre: 'Garaje' }]).resultado, { estado: 'ninguno' })
})

test('leerEntrada: DNI, fechas y móvil validados; lo que no pasa se DICE', () => {
  const ok = leerEntrada({ ramo: 'moto', clienteId: CID, dni: '12345678z', fechaNacimiento: '01/02/1990', fechaCarnet: '2010-05-03', telefono: '+34 612 345 678', matricula: '1234 bcd' }, HOY)
  assert.deepEqual(ok.errores, [])
  assert.equal(ok.entrada.persona.dni, '12345678Z')
  assert.equal(ok.entrada.persona.fechaNacimiento, '1990-02-01')
  assert.equal(ok.entrada.persona.telefono, '612345678')
  assert.equal(ok.entrada.matricula, '1234BCD')

  const mal = leerEntrada({ ramo: 'barco', clienteId: 'Pepe', dni: '12345678A', fechaNacimiento: '31/02/1990', telefono: '954123456', fechaCarnet: '2030-01-01' }, HOY)
  assert.ok(mal.errores.some((e) => /ramo/.test(e)))
  assert.ok(mal.errores.some((e) => /clienteId/.test(e)))
  assert.ok(mal.errores.some((e) => /DNI: La letra/.test(e)))
  assert.ok(mal.errores.some((e) => /nacimiento/.test(e)))
  assert.ok(mal.errores.some((e) => /móvil/.test(e)))
  assert.ok(mal.errores.some((e) => /carnet/.test(e)))
  assert.equal(mal.entrada.persona.dni, undefined)
})

test('leerEntrada: el historial del seguro actual va completo o no va', () => {
  const medio = leerEntrada({ ramo: 'auto', clienteId: CID, companiaAnterior: 'Mapfre', aniosAsegurado: 5 }, HOY)
  assert.equal(medio.entrada.historial, null)
  assert.ok(medio.errores.some((e) => /seguro actual incompleto/.test(e) && /nº de la póliza actual/.test(e)))
  const entero = leerEntrada({ ramo: 'auto', clienteId: CID, companiaAnterior: 'Mapfre', polizaAnterior: '123', aniosAsegurado: 5, aniosEnCompania: 3, aniosSinSiniestros: 5 }, HOY)
  assert.deepEqual(entero.errores, [])
  assert.equal(entero.entrada.historial?.aniosEnCompania, 3)
  const nada = leerEntrada({ ramo: 'auto', clienteId: CID }, HOY)
  assert.equal(nada.entrada.historial, null)
  assert.deepEqual(nada.errores, [])
  const incoherente = leerEntrada({ ramo: 'auto', clienteId: CID, companiaAnterior: 'X', polizaAnterior: '1', aniosAsegurado: 2, aniosEnCompania: 5, aniosSinSiniestros: 1 }, HOY)
  assert.equal(incoherente.entrada.historial, null)
  assert.ok(incoherente.errores.length > 0)
})

const BASE: Resuelto = {
  ramo: 'moto', marcaId: 'M1', modeloId: 'MO1', motor: 'Gasoline', codigoVehiculo: 'V1', matricula: '1234BCD',
  fechaMatriculacion: '2020-01-01', garaje: 'VP', garajeEsSupuesto: true, estadoCivilId: 'S', municipioId: '41091',
  persona: { dni: '12345678Z' }, historial: null,
}

test('construirCuerpo: mismas claves que las pantallas; en moto también marcaId, modeloId y motor', () => {
  const m = construirCuerpo(BASE)
  assert.deepEqual(Object.keys(m.resueltos).sort(), ['codigoVehiculo', 'estadoCivilId', 'fechaMatriculacion', 'garaje', 'garajeEsSupuesto', 'marcaId', 'matricula', 'modeloId', 'motor', 'municipioId'].sort())
  assert.equal(m.resueltos.garajeEsSupuesto, true)
  // Si Alberto dijo el garaje, no se guarda como supuesto.
  assert.equal(construirCuerpo({ ...BASE, garajeEsSupuesto: false }).resueltos.garajeEsSupuesto, false)
  assert.deepEqual(m.correcciones, { dni: '12345678Z' })
  const a = construirCuerpo({ ...BASE, ramo: 'auto', historial: { companiaCodigo: 'C0058', poliza: '9', aniosAsegurado: 5, aniosEnCompania: 2, aniosSinSiniestros: 5, siniestrosUltimos5: null } })
  assert.equal('marcaId' in a.resueltos, false)
  assert.equal('motor' in a.resueltos, false)
  assert.deepEqual(a.correcciones, {
    dni: '12345678Z', aseguradoAntes: true, companiaAnteriorCodigo: 'C0058', polizaAnterior: '9', aniosAsegurado: 5, aniosEnCompania: 2, aniosSinSiniestros: 5,
  })
})

test('construirCuerpo: las claves coinciden con las de AutoNuevo.tsx y MotoNuevo.tsx (lee el FUENTE)', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const leer = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
  const auto = leer('../app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx')
  const moto = leer('../app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx')
  for (const k of ['codigoVehiculo', 'garaje', 'estadoCivilId', 'municipioId', 'matricula', 'fechaMatriculacion', 'garajeEsSupuesto']) {
    assert.match(auto, new RegExp(`resueltos: \\{[\\s\\S]*?\\b${k}\\b`), `auto: ${k}`)
    assert.match(moto, new RegExp(`\\b${k}\\b`), `moto: ${k}`)
  }
  assert.match(moto, /const version = \{ marcaId, modeloId, motor: motorId \}/)
  for (const k of ['aseguradoAntes', 'companiaAnteriorCodigo', 'polizaAnterior', 'aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros', 'siniestrosUltimos5']) {
    assert.match(auto, new RegExp(`correccionesFinal\\.${k} =`), `auto: ${k}`)
  }
})

test('huecosPendientes: lo que falta, en palabras; ficha sin revisar también bloquea', () => {
  const h = huecosPendientes(
    [
      { campo: 'marca', estado: 'ok' },
      { campo: 'version', estado: 'varios', candidatas: [{ id: '1', nombre: 'A' }, { id: '2', nombre: 'B' }] },
      { campo: 'matricula', estado: 'falta' },
      { campo: 'municipio', estado: 'no_encontrado', dicho: 'Dos Hermanas' },
    ],
    [{ campo: 'dni', motivo: 'x' }, { campo: 'fechaCarnet', motivo: 'x' }, { campo: 'codigoVehiculo', motivo: 'x' }],
    { fechaCarnet: '2010-01-01' },
  )
  assert.deepEqual(h, [
    'la versión: hay 2 opciones (A · B), dime cuál',
    'falta la matrícula',
    'no encuentro «Dos Hermanas» en el municipio donde circula',
    'falta el DNI del tomador (no está en la ficha)',
  ])
  assert.ok(huecosPendientes([], null, {}).some((l) => /no he podido revisar/.test(l)))
  assert.deepEqual(huecosPendientes([{ campo: 'marca', estado: 'ok' }], [], {}), [])
})

test('textoPropuesta: DNI enmascarado, optimistas primero y aviso de 0,50€ sin salir al cliente', () => {
  const t = textoPropuesta({
    ramo: 'auto', cliente: 'Pepe <Pérez>',
    vehiculo: { marca: 'SEAT', modelo: 'IBIZA', motor: 'Gasolina', version: '1.0 TSI' },
    matricula: '1234BCD', fechaMatriculacion: '2020-01-01', garaje: 'Vía pública', estadoCivil: 'Soltero', municipio: 'Sevilla',
    persona: { dni: '12345678Z' }, historial: null, primaActual: 400,
    supuestos: [
      { campo: 'kmAnuales', valor: 10000, porque: 'media' },
      { campo: 'aniosSinSiniestros', valor: 5, porque: 'se presume', optimista: true },
    ],
  })
  assert.ok(!t.includes('12345678Z'))
  assert.match(t, /\*\*\*\*\*678Z/)
  assert.ok(t.indexOf('puede abaratar') < t.indexOf('km al año'))
  assert.match(t, /quién conduce: solo el tomador/)
  assert.match(t, /0,50€/)
  assert.match(t, /No sale nada al cliente/)
  assert.match(t, /Pepe &lt;Pérez&gt;/)
  assert.match(t, /400,00€/)
})

test('desenlaceCotizacion: los 3 más baratos con prima; sin precios pudiendo cobrar es «incierta»', () => {
  const ok = desenlaceCotizacion({
    estado: 'ok', coste: '0,50€', restantesHoy: 8, simulado: false, avisoSimulacion: null, resumen: '', fallos: [], supuestos: [], guardado: null, projectId: '1',
    precios: [
      { compania: 'Cara', primaEur: 900 }, { compania: 'Nula', primaEur: null }, { compania: 'Barata', primaEur: 300 },
      { compania: 'Media', primaEur: 1234.5 }, { compania: 'Otra', primaEur: 500 },
    ],
  }, 400, 'https://x/ficha')
  assert.equal(ok.estado, 'hecha')
  assert.ok(ok.texto.indexOf('Barata') < ok.texto.indexOf('Otra') && ok.texto.indexOf('Otra') < ok.texto.indexOf('Cara'))
  assert.ok(!ok.texto.includes('Media'))
  assert.ok(!ok.texto.includes('Nula'))
  assert.match(ok.texto, /300,00€/)
  assert.match(ok.texto, /ahorra 100,00€/)

  const sinPrecios = desenlaceCotizacion({
    estado: 'ok', coste: '0,50€', restantesHoy: null, simulado: false, avisoSimulacion: null, resumen: '', fallos: [{}], supuestos: [], guardado: null, projectId: '1',
    precios: [{ compania: 'X', primaEur: null }],
  }, null, 'u')
  assert.equal(sinPrecios.estado, 'incierta')
  assert.doesNotMatch(sinPrecios.texto, /no se ha gastado|no se ha pedido|\(0€\)/i)

  const red = desenlaceCotizacion({ estado: 'error', motivo: 'red', mensaje: 'timeout', gastoDesconocido: true }, null, 'u')
  assert.equal(red.estado, 'incierta')
  assert.match(red.texto, /NO lo repitas/)
  assert.doesNotMatch(red.texto, /\(0€\)/)

  assert.equal(desenlaceCotizacion({ estado: 'error', motivo: 'secreto_rechazado', mensaje: 'x', gastoDesconocido: false }, null, 'u').estado, 'sin_gasto')
  assert.equal(desenlaceCotizacion({ estado: 'faltan', faltan: [{ campo: 'dni', motivo: 'falta el DNI' }] }, null, 'u').estado, 'sin_gasto')
  assert.equal(desenlaceCotizacion({ estado: 'tope', mensaje: 'tope' }, null, 'u').estado, 'sin_gasto')
  // Tras el cobro no puede lanzar por un campo raro del vendor.
  const raro = desenlaceCotizacion({
    estado: 'ok', coste: '0,50€', restantesHoy: null, simulado: false, avisoSimulacion: null, resumen: '', fallos: [], supuestos: [], guardado: null, projectId: '1',
    precios: [{ compania: 42 as unknown as string, producto: {} as unknown as string, firmeza: 7 as unknown as string, primaEur: 100 }],
  }, null, 'u')
  assert.equal(raro.estado, 'hecha')
})

test('ventaCruzada: solo para Alberto, y sin ficha no afirma nada', () => {
  assert.equal(ventaCruzada(null, 'auto'), null)
  assert.match(ventaCruzada(['auto'], 'auto') ?? '', /Solo para ti.*hogar/)
  assert.match(ventaCruzada(['hogar'], 'moto') ?? '', /coche/)
  assert.equal(ventaCruzada(['hogar', 'auto'], 'moto'), null)
})

test('los importes salen con eur() de lib/dinero.ts, no con un formateador propio (lee el FUENTE)', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const src = readFileSync(fileURLToPath(new URL('./correduria-tarificacion-tg.ts', import.meta.url)), 'utf8')
  assert.match(src, /import \{ eur \} from '\.\/dinero\.ts'/)
  assert.doesNotMatch(src, /toLocaleString|toFixed/)
})

test('botón «Pedir precio»: interruptor, tope ANTES de reclamar, un solo uso, UNA llamada y cuerpo a NULL (lee el FUENTE)', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  const ini = src.indexOf('export async function tarificarDesdeBoton(')
  assert.ok(ini > 0)
  const fn = src.slice(ini, src.indexOf('\n}\n', ini))
  const interruptor = fn.indexOf('emisionTgActiva(process.env[INTERRUPTOR_EMISION])')
  const tope = fn.indexOf('tarificacionesDeHoy()')
  const reclamo = fn.search(/SET estado = 'pidiendo'[\s\S]*?WHERE id = \$\{id\} AND estado = 'propuesta' AND caduca_at > now\(\)/)
  assert.ok(interruptor >= 0 && tope > interruptor && reclamo > tope, 'orden: interruptor → tope → reclamar')
  assert.match(fn, /hoy >= MAX_TARIFICACIONES_DIA/)
  assert.equal((fn.match(/cotizar(?:Auto|Moto)NuevaAsegura\(/g) ?? []).length, 2, 'una llamada por rama, sin reintentos')
  assert.doesNotMatch(fn, /for \(|while \(/)
  assert.match(fn, /SET estado = \$\{fin\.estado\}, cuerpo = NULL/)
  // Proponer también respeta el interruptor.
  const prop = src.slice(src.indexOf('async function proponerTarificacion('))
  assert.match(prop.slice(0, 400), /emisionTgActiva\(process\.env\[INTERRUPTOR_EMISION\]\)/)
  assert.match(src, /accion === 'tarifno'[\s\S]{0,200}cuerpo = NULL/)
})

test('webhook: «tarif» exige al titular (from.id) y corre en after() (lee el FUENTE)', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const wh = readFileSync(fileURLToPath(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)), 'utf8')
  assert.match(wh, /\(action === 'emitir'[^)]*action === 'tarif'[^)]*\) && String\(cb\.from\?\.id/)
  assert.match(wh, /if \(action === 'tarif'\) \{[\s\S]*?after\(\(\) => tarificarDesdeBoton\(arg\)\)/)
  assert.ok(wh.indexOf("action === 'tarif') && String(cb.from") < wh.indexOf('tarificarDesdeBoton(arg)'))
})

test('limpieza: la propuesta vencida pierde el cuerpo y la «pidiendo» colgada pasa a incierta con aviso (lee el FUENTE)', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const src = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
  const fn = src.slice(src.indexOf('async function limpiarTarificaciones('))
  assert.match(fn, /SET estado = 'caducada', decidida_at = now\(\), cuerpo = NULL\s+WHERE estado = 'propuesta' AND caduca_at <= now\(\)/)
  assert.match(fn, /SET estado = 'incierta', cuerpo = NULL[\s\S]*?WHERE estado = 'pidiendo' AND decidida_at < now\(\) - interval '10 minutes'/)
  assert.match(fn, /tgSend\(`⚠️ Una petición de precio se quedó sin respuesta/)
  const turno = src.slice(src.indexOf('export async function manejarCorreduriaTg('))
  assert.match(turno.slice(0, 4000), /await limpiarTarificaciones\(\)/)
  // Y el tope va también DENTRO del reclamo (dos botones a la vez no pasan del tope).
  assert.match(src, /SET estado = 'pidiendo'[\s\S]{0,200}AND caduca_at > now\(\)\s+AND \(SELECT count\(\*\) FROM correduria_asistente_tarificacion[\s\S]{0,250}\) < \$\{MAX_TARIFICACIONES_DIA\}/)
  // …y en la MISMA transacción que un candado: sin él, cada UPDATE cuenta sobre su propia foto y dos
  // pulsaciones simultáneas pasan las dos (hallazgo de Graphify, PR #3924).
  assert.match(src, /prisma\.\$transaction\(\[\s*prisma\.\$executeRaw\(Prisma\.sql`SELECT pg_advisory_xact_lock\(hashtext\('correduria_asistente_tarificacion:tope'\)\)`\),\s*prisma\.\$queryRaw<FilaTarif\[\]>\(Prisma\.sql`\s*UPDATE correduria_asistente_tarificacion SET estado = 'pidiendo'/)
})
