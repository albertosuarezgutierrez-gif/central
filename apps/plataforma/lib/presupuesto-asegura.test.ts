// Guardián del PRESUPUESTO al cliente, en el lado de plataforma (la pantalla
// de Alberto). `node --test`, puro: no toca red ni BD.
//
// Lo que se vigila aquí no es que la función «funcione»: es que los cuatro
// «no lo sé» de esta pantalla NO se colapsen en algo tranquilizador. Es la
// pantalla donde se decide qué precio se le pone delante a una persona.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  cuerpoPreparar,
  frasePresupuesto,
  interpretarPreparado,
  mensajeErrorPreparar,
  normalizarOcultar,
  type PresupuestoPreparado,
} from './presupuesto-asegura.ts'

// ─── Ocultar al cliente antes de preparar (28/09/2026) ───────────────────────

const U1 = '0b0f5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

test('ocultar vacío o ausente NO viaja: nada oculto', () => {
  assert.equal(normalizarOcultar(undefined), undefined)
  assert.equal(normalizarOcultar({ companias: [], precios: [] }), undefined)
  assert.deepEqual(cuerpoPreparar({ tarificacionId: 't1' }), { tarificacionId: 't1' })
  assert.deepEqual(cuerpoPreparar({ tarificacionId: 't1', ocultar: { companias: [], precios: [] } }), { tarificacionId: 't1' })
})

test('ocultar se limpia (recorte, sin duplicados, uuid en minúsculas) y viaja en el cuerpo', () => {
  const c = cuerpoPreparar({ tarificacionId: 't1', ocultar: { companias: [' Allianz ', 'Allianz'], precios: [U1.toUpperCase()] } })
  assert.deepEqual(c, { tarificacionId: 't1', ocultar: { companias: ['Allianz'], precios: [U1] } })
})

test('ocultar MAL formado es null: no se adivina (el cliente vería lo que se quiso quitar)', () => {
  assert.equal(normalizarOcultar('Allianz'), null)
  assert.equal(normalizarOcultar({ companias: 'Allianz' }), null)
  assert.equal(normalizarOcultar({ precios: ['no-es-uuid'] }), null)
  assert.equal(normalizarOcultar({ companias: [''] }), null)
  assert.equal(normalizarOcultar({ precios: [3] }), null)
})

test('todas_ocultas se explica como «lo has quitado todo», no como una avería', () => {
  assert.match(mensajeErrorPreparar({ motivo: 'todas_ocultas' }), /ocultado todas/)
  assert.doesNotMatch(mensajeErrorPreparar({ motivo: 'todas_ocultas' }), /todas_ocultas/)
  assert.equal(mensajeErrorPreparar({ motivo: 'sin_opciones', detalle: 'x' }), 'sin_opciones: x')
})

test('el 422 todas_ocultas de asegura llega como error con su motivo', () => {
  const r = interpretarPreparado(422, { estado: 'error', motivo: 'todas_ocultas' })
  assert.equal(r.estado, 'error')
  if (r.estado === 'error') assert.equal(r.motivo, 'todas_ocultas')
})

const OPCION = {
  orden: 1,
  compania: 'ALLIANZ',
  producto: 'Autos 2025',
  primaEur: 412.3,
  franquiciaEur: null,
  firmeza: 'estimado',
  papeles: ['equivalente', 'mas_barata'],
  coberturaDistinta: false,
}

const OK = {
  estado: 'ok',
  token: 'a'.repeat(64),
  presupuesto: {
    id: 'p1',
    estado: 'borrador',
    venceEl: '2026-10-06T00:00:00.000Z',
    simulado: false,
    lecturaActual: 'clasificada',
    motivoSinEquivalente: null,
    avisoEscala: null,
    opciones: [OPCION],
    preciosTotales: 12,
  },
}

test('el camino feliz devuelve el presupuesto y su enlace', () => {
  const r = interpretarPreparado(200, OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.presupuesto.opciones.length, 1)
  assert.equal(r.presupuesto.preciosTotales, 12)
  assert.equal(r.token, 'a'.repeat(64))
  // Una asegura anterior no manda `enLista`: eso es «no consta», no «no hay más».
  assert.equal(r.presupuesto.enLista, null)
})

test('enLista y ocultas viajan cuando asegura los manda', () => {
  const r = interpretarPreparado(200, { ...OK, presupuesto: { ...OK.presupuesto, enLista: 28, ocultas: 2 } })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.presupuesto.enLista, 28)
  assert.equal(r.presupuesto.ocultas, 2)
})

test('un 401 es «los secretos no coinciden», no «no hay presupuestos»', () => {
  const r = interpretarPreparado(401, null)
  assert.equal(r.estado, 'error')
  if (r.estado !== 'error') return
  assert.equal(r.motivo, 'secreto_rechazado')
})

test('una respuesta ilegible NUNCA se pinta como preparado', () => {
  for (const cuerpo of [null, 'texto', 42, [], { estado: 'vete a saber' }]) {
    const r = interpretarPreparado(200, cuerpo)
    assert.notEqual(r.estado, 'ok', `se dio por bueno ${JSON.stringify(cuerpo)}`)
  }
})

test('un «ok» SIN token es un error: un enlace que no existe no se puede enseñar', () => {
  const { token: _fuera, ...sinToken } = OK
  const r = interpretarPreparado(200, sinToken)
  assert.equal(r.estado, 'error')
})

test('REUTILIZADO: sin token vale solo si asegura dice que es uno ya preparado, con su referencia', () => {
  const { token: _fuera, ...sinToken } = OK
  const r = interpretarPreparado(200, { ...sinToken, presupuesto: { ...OK.presupuesto, reutilizado: true, referencia: 'AS-26-0042' } })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.token, null)
  assert.equal(r.presupuesto.reutilizado, true)
  assert.equal(r.presupuesto.referencia, 'AS-26-0042')
  // Una asegura anterior no manda referencia: `null`, nunca un texto inventado.
  const v = interpretarPreparado(200, OK)
  assert.equal(v.estado === 'ok' && v.presupuesto.referencia, null)
  assert.equal(v.estado === 'ok' && v.presupuesto.reutilizado, false)
})

test('la franquicia NO declarada sigue siendo null, jamás 0', () => {
  const r = interpretarPreparado(200, OK)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.presupuesto.opciones[0]!.franquiciaEur, null)
})

test('una opción sin prima se descarta, y sin ninguna es un error', () => {
  const sinPrima = {
    ...OK,
    presupuesto: { ...OK.presupuesto, opciones: [{ ...OPCION, primaEur: null }] },
  }
  const r = interpretarPreparado(200, sinPrima)
  assert.equal(r.estado, 'error')
  if (r.estado !== 'error') return
  assert.equal(r.motivo, 'sin_opciones')
})

// ─── Las frases: cada «no lo sé» dice DÓNDE está el hueco ────────────────────

function preparado(over: Partial<PresupuestoPreparado> = {}): PresupuestoPreparado {
  return { ...OK.presupuesto, opciones: [OPCION], ...over } as PresupuestoPreparado
}

test('un precio SIMULADO se declara como no enviable', () => {
  const f = frasePresupuesto(preparado({ simulado: true }))
  assert.ok(f.some((s) => /SIMULADO/.test(s) && /no se puede enviar/i.test(s)), f.join(' | '))
})

test('«no puedo compararlo» y «no sé leerlo» son frases DISTINTAS', () => {
  const deLaCompania = frasePresupuesto(
    preparado({ motivoSinEquivalente: 'actual_sin_coberturas', lecturaActual: 'sin_desglose' }),
  )
  const nuestro = frasePresupuesto(
    preparado({ motivoSinEquivalente: 'actual_sin_coberturas', lecturaActual: 'sin_clasificar' }),
  )
  // 🚨 El corazón del cepo: si alguien las funde, el cliente oye «tu compañía
  // no manda el desglose» sobre un desglose que SÍ está guardado, y nadie va a
  // mirar nunca el sitio donde de verdad falta el trabajo.
  assert.notDeepEqual(deLaCompania, nuestro)
  assert.ok(deLaCompania.some((s) => /no trae el desglose/i.test(s)), deLaCompania.join(' | '))
  assert.ok(nuestro.some((s) => /no sé traducirlas/i.test(s)), nuestro.join(' | '))
})

test('«ninguna con tu cobertura» es la TERCERA, y tampoco se funde con las otras dos', () => {
  const f = frasePresupuesto(
    preparado({ motivoSinEquivalente: 'sin_equivalente', lecturaActual: 'clasificada' }),
  )
  assert.ok(f.some((s) => /misma cobertura/i.test(s)), f.join(' | '))
  assert.ok(!f.some((s) => /desglose/i.test(s)), 'se ha colado el motivo de la compañía')
})

test('el aviso de escala se PINTA: es la advertencia que esto existe para no callar', () => {
  const f = frasePresupuesto(preparado({ avisoEscala: 'Los niveles no son comparables entre compañías.' }))
  assert.ok(f.includes('Los niveles no son comparables entre compañías.'), f.join(' | '))
})

test('«la más barata con otra cobertura» se dice, no se deja pasar', () => {
  const f = frasePresupuesto(preparado({ opciones: [{ ...OPCION, coberturaDistinta: true }] }))
  assert.ok(f.some((s) => /NO tiene la misma cobertura/i.test(s)), f.join(' | '))
})

test('sin ningún precio firme se advierte; con uno firme, esa frase no sale', () => {
  const todosEstimados = frasePresupuesto(preparado())
  assert.ok(todosEstimados.some((s) => /en firme/i.test(s)))
  const conFirme = frasePresupuesto(preparado({ opciones: [{ ...OPCION, firmeza: 'firme' }] }))
  assert.ok(!conFirme.some((s) => /en firme/i.test(s)), conFirme.join(' | '))
})

test('sin nada que advertir, no se inventa ningún aviso', () => {
  const f = frasePresupuesto(preparado({ opciones: [{ ...OPCION, firmeza: 'firme' }] }))
  assert.deepEqual(f, [])
})

test('🪤 el aviso: «enlazado» no es «enviado» y ningún fallo se pinta como salido', async () => {
  const { accionesPresupuesto, textoAviso, leerPresupuestoEnLista } = await import('./presupuesto-asegura.ts')
  assert.equal(accionesPresupuesto('enlazado').confirmarWhatsapp, true)
  assert.equal(accionesPresupuesto('enviado').confirmarWhatsapp, false)
  assert.equal(accionesPresupuesto('elegido').avisar, false)
  assert.equal(accionesPresupuesto('caducado').avisar, false)
  assert.equal(textoAviso(502, { estado: 'error', detalle: 'El proveedor rechazó el correo.' }).ok, false)
  assert.equal(textoAviso(200, { estado: 'enviado' }).ok, false, 'sin email no se afirma el destino')
  assert.equal(textoAviso(500, null).ok, false)
  assert.equal(textoAviso(200, { estado: 'enlace', whatsapp: 'https://wa.me/?text=x' }).whatsapp, 'https://wa.me/?text=x')
  assert.equal(leerPresupuestoEnLista({ id: 'a', estado: 'raro', creadoAt: 'x', venceEl: 'y' }), null)
})

test('🪤 solo un aceptado se marca emitido', async () => {
  const { accionesPresupuesto, textoAviso } = await import('./presupuesto-asegura.ts')
  assert.equal(accionesPresupuesto('aceptado').emitir, true)
  assert.equal(accionesPresupuesto('elegido').emitir, false)
  assert.equal(accionesPresupuesto('emitido').emitir, false)
  assert.equal(textoAviso(409, { estado: 'error', detalle: 'x' }).ok, false)
  assert.equal(textoAviso(200, { estado: 'emitido' }).ok, true)
})

test('🪤 datos para emitir: «no se pudo mirar» ≠ «completos», y un cifrado roto no es «falta»', async () => {
  const { fraseDatosEmision } = await import('./presupuesto-asegura.ts')
  const fila = (etiqueta: string, estado: string, aporta = 'cliente_datos') => ({ campo: 'x', etiqueta, estado, aporta })
  assert.equal(fraseDatosEmision(null).texto, 'Datos para emitir: no se han podido comprobar.')
  assert.equal(fraseDatosEmision({ datos: [fila('DNI', 'ok'), { raro: 1 }] }).texto, 'Datos para emitir: no se han podido comprobar.')
  assert.equal(fraseDatosEmision({ datos: [fila('DNI', 'ok')] }).texto, 'Datos para emitir: completos ✓')
  assert.equal(fraseDatosEmision({ datos: [] }).texto, 'Datos para emitir: no se han podido comprobar.')
  assert.equal(fraseDatosEmision({ datos: [fila('DNI', 'nuevo_estado')] }).texto, 'Datos para emitir: no se han podido comprobar.')
  const r = fraseDatosEmision({ datos: [fila('DNI / NIE', 'no_legible', 'cliente_dni'), fila('Cuenta para domiciliar el recibo', 'falta', 'corredor')] })
  assert.doesNotMatch(r.texto, /falta dni/i)
  assert.match(r.texto, /1 dato no abre/)
  assert.match(r.texto, /la pones tú al emitir/)
  assert.equal(r.alerta, true)
  assert.match(fraseDatosEmision({ datos: [fila('Dirección completa (calle, número y código postal)', 'falta')] }).texto, /falta dirección completa \(se lo pide su portal\)/)
})

test('🪤 las necesidades se leen; ausentes = null (no se puede avisar); solo editables antes de aceptar', async () => {
  const { leerPresupuestoEnLista, necesidadesEditables } = await import('./presupuesto-asegura.ts')
  const base = { id: 'a', estado: 'borrador', creadoAt: 'x', venceEl: 'y' }
  assert.equal(leerPresupuestoEnLista(base)?.necesidades, null)
  assert.equal(leerPresupuestoEnLista({ ...base, necesidades: 'Auto diario con lunas' })?.necesidades, 'Auto diario con lunas')
  assert.equal(necesidadesEditables('visto'), true)
  assert.equal(necesidadesEditables('aceptado'), false)
  assert.equal(necesidadesEditables('retirado'), false)
})

test('cotizacionIdDe: solo con la copia guardada hay de qué preparar el presupuesto', async () => {
  const { cotizacionIdDe } = await import('./presupuesto-asegura.ts')
  assert.equal(cotizacionIdDe({ estado: 'guardada', cotizacionId: 't1' }), 't1')
  assert.equal(cotizacionIdDe({ estado: 'fallo', cotizacionId: 't1' }), null)
  assert.equal(cotizacionIdDe(null), null)
  assert.equal(cotizacionIdDe(undefined), null)
})

test('leerPresupuestoEnLista: el ramo viaja, y si asegura no lo manda es null', async () => {
  const { leerPresupuestoEnLista } = await import('./presupuesto-asegura.ts')
  const base = { id: 'a', estado: 'borrador', creadoAt: 'x', venceEl: 'y' }
  assert.equal(leerPresupuestoEnLista({ ...base, ramo: 'moto' })?.ramo, 'moto')
  assert.equal(leerPresupuestoEnLista(base)?.ramo, null)
})

test('filasCoberturas: una fila por garantía con dato; sin clasificar = no consta, nunca «no»', async () => {
  const { filasCoberturas, leerPresupuestoEnLista } = await import('./presupuesto-asegura.ts')
  const p = leerPresupuestoEnLista({
    id: 'a', estado: 'borrador', creadoAt: 'x', venceEl: 'y', ramo: 'moto',
    detalle: [
      { id: 'o1', compania: 'Occident', modalidad: 'Terceros básico', primaEur: 217.57, garantias: { danos_propios: 'no', colision_animales: 'si' } },
      { id: 'o2', compania: 'Allianz', modalidad: null, primaEur: 215.88, garantias: null },
      { raro: 1 },
    ],
  })
  assert.equal(p?.detalle?.length, 2)
  const f = filasCoberturas('moto', p!.detalle!)!
  assert.deepEqual(f.find((x) => x.clave === 'danos_propios')?.estados, ['no', 'no_consta'])
  assert.deepEqual(f.find((x) => x.clave === 'colision_animales')?.estados, ['si', 'no_consta'])
  assert.equal(f.some((x) => x.clave === 'lunas'), false, 'moto no tiene lunas')
  assert.equal(f.some((x) => x.clave === 'robo'), false, 'todo «no consta» no se pinta')
  assert.equal(filasCoberturas('responsabilidad_civil', p!.detalle!), null)
  assert.equal(leerPresupuestoEnLista({ id: 'a', estado: 'borrador', creadoAt: 'x', venceEl: 'y' })?.detalle, null)
})
