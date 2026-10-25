import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  TIPOS_PEDIR_PRECIO,
  aplicaCompararExterna,
  aplicaComunidad,
  aplicaHipoteca,
  aplicaImpagoAlquiler,
  aplicaPedirPrecio,
  esRamoComunidad,
  eurosEs,
  identidadDeConsulta,
  objetoDePeticion,
  origenPedirPrecio,
  ramoDePeticion,
  textoHistorialPedirPrecio,
  ramoDeUso,
  textoAvisoPedirPrecio,
  textoTareaPrecioPatrimonio,
  municipioDeDireccion,
  usoLegible,
  validarPedirPrecio,
} from './patrimonio-pedir-precio-reglas.ts'

const U = '11111111-1111-4111-8111-111111111111'
const I = '22222222-2222-4222-8222-222222222222'

test('el cuerpo: solo identidad, inmueble y tipo; un clienteId o titular del cuerpo se IGNORA (no se lee)', () => {
  const ok = validarPedirPrecio({ identidadId: U, inmuebleId: I, tipo: 'inmueble_sin_seguro', clienteId: 'otro', titularId: 'otro' })
  assert.deepEqual(ok, { ok: true, datos: { identidadId: U, inmuebleId: I, tipo: 'inmueble_sin_seguro' } })
  assert.deepEqual(validarPedirPrecio({ identidadId: 'x', inmuebleId: I, tipo: 'inmueble_sin_seguro' }), { ok: false, campo: 'identidadId' })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, inmuebleId: 'x', tipo: 'inmueble_sin_seguro' }), { ok: false, campo: 'inmuebleId' })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, inmuebleId: I, tipo: 'vida' }), { ok: false, campo: 'tipo' })
  assert.deepEqual(validarPedirPrecio(null), { ok: false, campo: 'identidadId' })
})

test('🚨 aplica solo si NO hay seguro en vigor ni dudas: en vigor o «no se sabe» no abren petición', () => {
  assert.equal(aplicaPedirPrecio('inmueble_sin_seguro', []), true)
  assert.equal(aplicaPedirPrecio('inmueble_sin_seguro', [false]), true)
  assert.equal(aplicaPedirPrecio('inmueble_sin_seguro', [false, true]), false)
  assert.equal(aplicaPedirPrecio('inmueble_sin_seguro', [null]), false, 'no se sabe: no se afirma «sin seguro»')
  assert.equal(aplicaPedirPrecio('seguro_no_vigente', [false]), true)
  assert.equal(aplicaPedirPrecio('seguro_no_vigente', []), false, 'sin ningún enlace no hay seguro «caducado»')
})

test('ramo por uso y textos: sin dirección ni nº de póliza; Telegram solo ids', () => {
  assert.equal(ramoDeUso('local'), 'comercio')
  assert.equal(ramoDeUso('vivienda'), 'hogar')
  assert.equal(ramoDeUso(null), 'hogar')
  const t = textoTareaPrecioPatrimonio({ tipo: 'inmueble_sin_seguro', uso: 'vivienda', municipio: '  SEVILLA ', ramo: 'hogar' })
  assert.match(t, /vivienda en SEVILLA/)
  assert.match(t, /no tiene seguro/)
  assert.doesNotMatch(t, /«/, 'la tarea no cita el alias del cliente')
  const aviso = textoAvisoPedirPrecio({ oportunidadId: 'o1', inmuebleId: 'i1' })
  assert.match(aviso, /o1/)
  assert.doesNotMatch(aviso, /Triana/)
})

test('🚨 cableado: el puente no usa lead-declarada, recalcula el nivel y la ruta exige el Bearer del puente', () => {
  const lib = readFileSync(new URL('./patrimonio-pedir-precio-portal.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(lib, /lead-declarada/)
  assert.match(lib, /puedePatrimonio\(correduriaId, d\.identidadId, inm\.cliente_id, 'pedir_precio'\)/)
  assert.match(lib, /where i\.id = \$\{d\.inmuebleId\}::uuid and i\.archivado_en is null/)
  assert.match(lib, /t\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(lib, /pg_advisory_xact_lock/)
  assert.match(lib, /'portal', 'en_negociacion'/)
  assert.doesNotMatch(lib, /clienteId\b/, 'el cliente sale del inmueble, nunca de un parámetro')
  const ruta = readFileSync(new URL('../app/api/portal/patrimonio/pedir-precio/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /puentePortalAutorizado\(req\)/)
  assert.match(ruta, /auditado\(/)
  assert.doesNotMatch(ruta, /ASEGURA_OPERADOR_SECRET|operadorAutorizado/)
})

test('GET de peticiones abiertas: solo identidadId; clienteId/inmuebleId de la query se ignoran y la ficha sale de asegura', () => {
  assert.equal(identidadDeConsulta(`https://x.test/api/portal/patrimonio/pedir-precio?identidadId=${U}&clienteId=otro&inmuebleId=${I}`), U)
  assert.equal(identidadDeConsulta('https://x.test/api/portal/patrimonio/pedir-precio?identidadId=no-es-uuid'), null)
  assert.equal(identidadDeConsulta('https://x.test/api/portal/patrimonio/pedir-precio'), null)
  assert.equal(identidadDeConsulta('no es una url'), null)
  const fuente = readFileSync(new URL('./patrimonio-pedir-precio-portal.ts', import.meta.url), 'utf8')
  const f = fuente.slice(fuente.indexOf('export async function peticionesPedirPrecioAbiertas'))
  assert.match(f, /fichasDeIdentidad\(correduriaId, identidadId\)/)
  assert.doesNotMatch(f, /clienteId\s*[:=]/)
  const ruta = readFileSync(new URL('../app/api/portal/patrimonio/pedir-precio/route.ts', import.meta.url), 'utf8')
  const get = ruta.slice(ruta.indexOf('export async function GET'), ruta.indexOf('export const POST'))
  assert.match(get, /puentePortalAutorizado\(req\)/)
  assert.doesNotMatch(get, /clienteId|searchParams/)
})

test('comunidad (25/10/2026): tipo válido en el cuerpo, ramo comunidades pase lo que pase con el uso, y texto de tarea', () => {
  assert.deepEqual(validarPedirPrecio({ identidadId: U, inmuebleId: I, tipo: 'comunidad' }), { ok: true, datos: { identidadId: U, inmuebleId: I, tipo: 'comunidad' } })
  assert.equal(ramoDePeticion('comunidad', 'vivienda'), 'comunidades')
  assert.equal(ramoDePeticion('comunidad', 'local'), 'comunidades')
  assert.equal(ramoDePeticion('inmueble_sin_seguro', 'local'), 'comercio')
  assert.equal(ramoDePeticion('seguro_no_vigente', null), 'hogar')
  const t = textoTareaPrecioPatrimonio({ tipo: 'comunidad', uso: 'vivienda', municipio: 'Sevilla', ramo: 'comunidades' })
  assert.match(t, /comunidades/)
  assert.match(t, /vivienda en Sevilla/)
  assert.doesNotMatch(t, /no tiene seguro/)
})

test('🚨 comunidad: asegura exige presidente marcado Y piso (comunidad o Catastro); null nunca aplica', () => {
  assert.equal(aplicaComunidad({ enComunidad: true, tipoCatastro: null, presidenteComunidad: true }), true)
  assert.equal(aplicaComunidad({ enComunidad: null, tipoCatastro: 'piso', presidenteComunidad: true }), true)
  assert.equal(aplicaComunidad({ enComunidad: true, tipoCatastro: 'piso', presidenteComunidad: null }), false)
  assert.equal(aplicaComunidad({ enComunidad: true, tipoCatastro: 'piso', presidenteComunidad: false }), false)
  assert.equal(aplicaComunidad({ enComunidad: false, tipoCatastro: 'unifamiliar', presidenteComunidad: true }), false)
  assert.equal(aplicaComunidad({ enComunidad: null, tipoCatastro: null, presidenteComunidad: true }), false)
})

test('comunidad: ramo de póliza de comunidad reconocido; con una en vigor o dudosa no aplica; sin ninguna sí', () => {
  assert.equal(esRamoComunidad('comunidades'), true)
  assert.equal(esRamoComunidad(' Comunidad '), true)
  assert.equal(esRamoComunidad('hogar'), false)
  assert.equal(esRamoComunidad(null), false)
  assert.equal(aplicaPedirPrecio('comunidad', []), true)
  assert.equal(aplicaPedirPrecio('comunidad', [false]), true)
  assert.equal(aplicaPedirPrecio('comunidad', [true]), false)
  assert.equal(aplicaPedirPrecio('comunidad', [null]), false)
})

// ─── Ofertas nuevas (25/10/2026): comparar_externa · impago_alquiler · hipoteca ──────────────────────────────────────

const C = '33333333-3333-4333-8333-333333333333'

test('lista cerrada de tipos: los seis, y uno desconocido se rechaza', () => {
  assert.deepEqual([...TIPOS_PEDIR_PRECIO].sort(), ['comparar_externa', 'comunidad', 'hipoteca', 'impago_alquiler', 'inmueble_sin_seguro', 'seguro_no_vigente'])
  assert.deepEqual(validarPedirPrecio({ identidadId: U, inmuebleId: I, tipo: 'cualquier_cosa' }), { ok: false, campo: 'tipo' })
})

test('comparar_externa pide la póliza DECLARADA (no un inmueble); impago exige contrato; hipoteca solo inmueble', () => {
  assert.deepEqual(validarPedirPrecio({ identidadId: U, tipo: 'comparar_externa', polizaDeclaradaId: C, inmuebleId: I }), {
    ok: true, datos: { identidadId: U, tipo: 'comparar_externa', polizaDeclaradaId: C },
  })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, tipo: 'comparar_externa', inmuebleId: I }), { ok: false, campo: 'polizaDeclaradaId' })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, tipo: 'impago_alquiler', inmuebleId: I }), { ok: false, campo: 'contratoId' })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, tipo: 'impago_alquiler', inmuebleId: I, contratoId: C }), {
    ok: true, datos: { identidadId: U, tipo: 'impago_alquiler', inmuebleId: I, contratoId: C },
  })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, tipo: 'hipoteca', inmuebleId: I, contratoId: C }), {
    ok: true, datos: { identidadId: U, tipo: 'hipoteca', inmuebleId: I },
  })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, tipo: 'hipoteca' }), { ok: false, campo: 'inmuebleId' })
})

test('origen e idempotencia por tipo: los dos antiguos conservan el origen; los nuevos llevan portal:patrimonio:<tipo>', () => {
  assert.equal(origenPedirPrecio('inmueble_sin_seguro'), 'portal:patrimonio')
  assert.equal(origenPedirPrecio('seguro_no_vigente'), 'portal:patrimonio')
  assert.equal(origenPedirPrecio('comparar_externa'), 'portal:patrimonio:comparar_externa')
  assert.equal(origenPedirPrecio('impago_alquiler'), 'portal:patrimonio:impago_alquiler')
  assert.equal(origenPedirPrecio('hipoteca'), 'portal:patrimonio:hipoteca')
  assert.deepEqual(objetoDePeticion({ identidadId: U, tipo: 'impago_alquiler', inmuebleId: I, contratoId: C }), { clave: 'contratoId', id: C })
  assert.deepEqual(objetoDePeticion({ identidadId: U, tipo: 'comparar_externa', polizaDeclaradaId: C }), { clave: 'polizaDeclaradaId', id: C })
  assert.deepEqual(objetoDePeticion({ identidadId: U, tipo: 'hipoteca', inmuebleId: I }), { clave: 'inmuebleId', id: I })
})

test('🚨 asegura re-decide cada oferta: contrato terminado, hipoteca sin confirmar y declarada no vigente NO abren nada', () => {
  assert.equal(aplicaImpagoAlquiler({ terminadoEn: null, hoy: '2026-10-25' }), true)
  assert.equal(aplicaImpagoAlquiler({ terminadoEn: '2026-12-31', hoy: '2026-10-25' }), true)
  assert.equal(aplicaImpagoAlquiler({ terminadoEn: '2026-10-24', hoy: '2026-10-25' }), false)
  assert.equal(aplicaHipoteca('si'), true)
  for (const v of ['no', 'no_se', null, '', 'sí']) assert.equal(aplicaHipoteca(v), false, String(v))
  assert.equal(aplicaCompararExterna(true), true)
  assert.equal(aplicaCompararExterna(false), false)
})

test('🚨 tarea sin alias (26/10/2026): tipo de inmueble + municipio + tipo de petición; lo que no consta, se dice', () => {
  assert.equal(usoLegible('local'), 'local')
  assert.equal(usoLegible('Vivienda'), 'vivienda')
  assert.equal(usoLegible('otro'), 'inmueble')
  assert.equal(usoLegible(null), 'inmueble')
  assert.equal(municipioDeDireccion('CL PARRA LA 12, 41003 SEVILLA (SEVILLA)'), 'SEVILLA')
  assert.equal(municipioDeDireccion('Calle Socorro 24, 41003 Sevilla'), 'Sevilla', 'importación sin provincia')
  assert.equal(municipioDeDireccion('Av. de la Paz 3, 2º B, 28001 Madrid (Madrid)'), 'Madrid')
  assert.equal(municipioDeDireccion('Calle Socorro 24'), null, 'sin CP no se adivina')
  assert.equal(municipioDeDireccion('Calle Socorro 24, Sevilla'), null, 'sin CP el tramo puede ser calle')
  assert.equal(municipioDeDireccion(null), null)
  for (const tipo of ['inmueble_sin_seguro', 'seguro_no_vigente', 'comunidad', 'impago_alquiler', 'hipoteca'] as const) {
    const t = textoTareaPrecioPatrimonio({ tipo, uso: 'local', municipio: null, ramo: 'comercio' })
    assert.match(t, /local \(municipio no consta\)/, tipo)
    assert.doesNotMatch(t, /«|»/, `${tipo}: la tarea no cita ningún alias`)
  }
  // El puente ya no lee ni pasa el alias a la tarea.
  const lib = readFileSync(new URL('./patrimonio-pedir-precio-portal.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(lib, /i\.alias|alias:/)
})

test('textos: renta en formato español o SIN cifra; Telegram solo ids', () => {
  assert.equal(eurosEs(216249), '2.162,49€')
  assert.equal(eurosEs(null), null)
  assert.equal(eurosEs(0), null)
  assert.match(textoTareaPrecioPatrimonio({ tipo: 'impago_alquiler', uso: 'vivienda', municipio: 'Sevilla', ramo: 'impago_alquiler', rentaCent: 85000 }), /\(renta 850,00€\/mes\)/)
  assert.doesNotMatch(textoTareaPrecioPatrimonio({ tipo: 'impago_alquiler', uso: 'vivienda', municipio: 'Sevilla', ramo: 'impago_alquiler', rentaCent: null }), /renta/)
  assert.match(textoTareaPrecioPatrimonio({ tipo: 'hipoteca', uso: 'vivienda', municipio: null, ramo: 'hogar' }), /hipoteca/)
  assert.match(textoTareaPrecioPatrimonio({ tipo: 'comparar_externa', uso: null, municipio: null, ramo: 'hogar', compania: 'Mapfre', vence: '2026-12-03' }), /vence el 03\/12\/2026/)
  assert.match(textoTareaPrecioPatrimonio({ tipo: 'comparar_externa', uso: null, municipio: null, ramo: 'auto', vence: null }), /sin vencimiento conocido/)
  assert.match(textoHistorialPedirPrecio('hipoteca'), /hipoteca/)
  assert.match(textoAvisoPedirPrecio({ oportunidadId: 'o1', inmuebleId: null, tipo: 'comparar_externa' }), /comparar_externa/)
})

test('🚨 cableado de las ofertas: contrato dentro del inmueble, póliza de la identidad, ficha única, origen por tipo y nada se envía al cliente', () => {
  const lib = readFileSync(new URL('./patrimonio-pedir-precio-portal.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.match(lib, /c\.inmueble_id = \$\{d\.inmuebleId\}::uuid and c\.archivado_en is null/)
  assert.match(lib, /d\.identidad_id = \$\{d\.identidadId\}::uuid/)
  assert.match(lib, /f\.clienteIds\.length !== 1/)
  assert.match(lib, /origenPedirPrecio\(a\.tipo\)/)
  assert.match(lib, /select i\.hipoteca from portal_patrimonio_inmueble/)
  assert.doesNotMatch(lib, /sendMail|enviarCorreo|whatsapp|core-email/i)
})
