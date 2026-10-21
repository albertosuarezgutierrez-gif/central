// 🪤 A quién se le manda un presupuesto si el tomador no tiene correo (21/10/2026, regla de Alberto). Para verlo en rojo:
// quita 'administracion' de TIPOS_REPRESENTACION → falla «Administración»; añade 'accionista' a TIPOS_REPRESENTACION → falla «Accionista sin permiso, no»; quita la condición `ida &&` de la rama
// (b) → falla «autorización al revés, no»; o devuelve elegible sin mirar `p.correo` → falla «elegible sin correo, no».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destinatarioElegible, destinatariosPresupuesto, esRelacionDeRepresentacion, type PersonaDestino } from './destinatarios-presupuesto.ts'
import type { RelacionFila } from './relaciones.ts'

const EMPRESA = 'emp'
const empresaSinCorreo = { clienteId: EMPRESA, tipoPersona: 'juridica' as const, correo: 'sin_email' as const }
let n = 0
const fila = (a: string, b: string, tipo: string, puedeVerPolizas = false): RelacionFila => ({ id: `r${++n}`, clienteAId: a, clienteBId: b, tipo, puedeVerPolizas, observaciones: null })
const persona = (clienteId: string, correo: PersonaDestino['correo'] = 'con_email', tipoPersona: PersonaDestino['tipoPersona'] = 'fisica'): PersonaDestino => ({ clienteId, nombre: clienteId.toUpperCase(), tipoPersona, correo })

test('🪤 tomador con correo: va al tomador, nunca a un tercero', () => {
  const d = destinatariosPresupuesto({ ...empresaSinCorreo, correo: 'con_email' }, [fila(EMPRESA, 'v', 'Dueño')], [persona('v')])
  assert.deepEqual(d, { estado: 'tomador' })
  assert.equal(destinatarioElegible(d, 'v'), null)
})

test('🪤 correo del tomador ilegible: no se sabe, y tampoco se ofrecen terceros', () => {
  const d = destinatariosPresupuesto({ ...empresaSinCorreo, correo: 'no_se_sabe' }, [fila(EMPRESA, 'v', 'Dueño')], [persona('v')])
  assert.deepEqual(d, { estado: 'tomador_no_se_sabe' })
})

test('🪤 tomador dado de baja de correo: tampoco se rodea escribiendo a su dueño', () => {
  assert.deepEqual(destinatariosPresupuesto({ ...empresaSinCorreo, correo: 'baja_de_correo' }, [fila(EMPRESA, 'v', 'Dueño')], [persona('v')]), { estado: 'tomador_baja' })
})

test('🪤 «Administración» (el tipo real del CRM) es elegible; los heredados «Tomador - Contacto»… no', () => {
  const d = destinatariosPresupuesto(empresaSinCorreo, [fila(EMPRESA, 'a', 'Administración'), fila(EMPRESA, 'o', 'Tomador - Ocasional'), fila(EMPRESA, 'c', 'Tomador - Contacto'), fila('p', EMPRESA, 'Tomador - Propietario')], [persona('a'), persona('o'), persona('c'), persona('p')])
  assert.equal(d.estado, 'contactos')
  if (d.estado !== 'contactos') return
  assert.deepEqual(d.elegibles.map((e) => [e.clienteId, e.via]), [['a', 'representacion']])
  assert.deepEqual(d.noElegibles.map((e) => e.clienteId).sort(), ['c', 'o', 'p'])
})

test('🪤 empresa sin correo + Dueño con correo: elegible (y en el sentido inverso del volcado también)', () => {
  const d = destinatariosPresupuesto(empresaSinCorreo, [fila(EMPRESA, 'v', 'Dueño'), fila('v', EMPRESA, 'Empresa')], [persona('v')])
  assert.equal(d.estado, 'contactos')
  assert.deepEqual(destinatarioElegible(d, 'v'), { clienteId: 'v', nombre: 'V', relacion: 'Dueño', via: 'representacion' })
  const inv = destinatariosPresupuesto(empresaSinCorreo, [fila('v', EMPRESA, 'Dueño')], [persona('v')])
  assert.equal(destinatarioElegible(inv, 'v')?.via, 'representacion')
})

test('variantes de texto reales: Administración, administrador/a, Representante legal; no Accionista/Socio/Empleado', () => {
  for (const t of ['Dueño', 'dueño', 'Administración', 'Administrador/a', 'ADMINISTRADORA', 'Representante', 'Representante legal']) assert.ok(esRelacionDeRepresentacion(t), t)
  for (const t of ['Accionista', 'Socio/a', 'Empleado/a', 'Empresa', 'Contacto - Tomador', 'Propietario - Tomador', 'Otra', 'Apoderado']) assert.ok(!esRelacionDeRepresentacion(t), t)
})

test('🪤 Accionista sin permiso para ver pólizas: NO es elegible, y se dice por qué', () => {
  const d = destinatariosPresupuesto(empresaSinCorreo, [fila('b', EMPRESA, 'Accionista'), fila(EMPRESA, 'b', 'Propietario - Tomador')], [persona('b')])
  assert.equal(d.estado, 'nadie')
  assert.equal(destinatarioElegible(d, 'b'), null)
  assert.deepEqual(d.estado === 'nadie' && d.noElegibles.map((x) => x.motivo), ['relacion_no_habilita'])
})

test('🪤 autorización a ver pólizas: solo en la dirección tomador → persona', () => {
  const ok = destinatariosPresupuesto(empresaSinCorreo, [fila(EMPRESA, 'c', 'Contacto - Tomador', true)], [persona('c')])
  assert.equal(destinatarioElegible(ok, 'c')?.via, 'autorizacion')
  // Al revés: la PERSONA autoriza al tomador a ver las suyas. Eso no le da nada sobre el tomador.
  const alReves = destinatariosPresupuesto(empresaSinCorreo, [fila('c', EMPRESA, 'Contacto - Tomador', true)], [persona('c')])
  assert.equal(destinatarioElegible(alReves, 'c'), null)
  // Una fila «Sin vínculo» no autoriza aunque traiga el flag.
  const sinVinculo = destinatariosPresupuesto(empresaSinCorreo, [fila(EMPRESA, 'c', 'Sin vínculo', true)], [persona('c')])
  assert.equal(destinatarioElegible(sinVinculo, 'c'), null)
  // De un tomador persona física también vale (b), no (a).
  const fisica = { clienteId: EMPRESA, tipoPersona: 'fisica' as const, correo: 'sin_email' as const }
  assert.equal(destinatarioElegible(destinatariosPresupuesto(fisica, [fila(EMPRESA, 'c', 'Hijo/a', true)], [persona('c')]), 'c')?.via, 'autorizacion')
})

test('🪤 elegible por relación pero sin correo (o baja, o ilegible): NO', () => {
  for (const correo of ['sin_email', 'baja_de_correo', 'no_se_sabe'] as const) {
    const d = destinatariosPresupuesto(empresaSinCorreo, [fila(EMPRESA, 'v', 'Dueño')], [persona('v', correo)])
    assert.equal(d.estado, 'nadie', correo)
    assert.equal(destinatarioElegible(d, 'v'), null, correo)
  }
})

test('🪤 Dueño de un tomador que no consta como empresa (física o NULL): no; matriz al revés: no', () => {
  for (const tipoPersona of ['fisica', null] as const) {
    const d = destinatariosPresupuesto({ ...empresaSinCorreo, tipoPersona }, [fila(EMPRESA, 'v', 'Dueño')], [persona('v')])
    assert.equal(destinatarioElegible(d, 'v'), null)
    assert.deepEqual(d.estado === 'nadie' && d.noElegibles.map((x) => x.motivo), ['tomador_no_es_empresa'])
  }
  // Fila invertida con OTRA empresa: podría ser la matriz dueña de la filial (el tomador). La filial no recibe.
  const matriz = destinatariosPresupuesto(empresaSinCorreo, [fila('m', EMPRESA, 'Dueño')], [persona('m', 'con_email', 'juridica')])
  assert.equal(destinatarioElegible(matriz, 'm'), null)
})

test('🪤 nadie: sin relaciones, o la ficha relacionada no se pudo leer como viva', () => {
  assert.deepEqual(destinatariosPresupuesto(empresaSinCorreo, [], []), { estado: 'nadie', noElegibles: [] })
  assert.deepEqual(destinatariosPresupuesto(empresaSinCorreo, [fila(EMPRESA, 'x', 'Dueño')], []), { estado: 'nadie', noElegibles: [] })
})

test('el caso real: Dueño con correo sí, Accionista sin permiso no, y las dos fichas no se funden', () => {
  const d = destinatariosPresupuesto(
    empresaSinCorreo,
    [fila(EMPRESA, 'v', 'Dueño'), fila('v', EMPRESA, 'Empresa'), fila('b', EMPRESA, 'Accionista'), fila(EMPRESA, 'b', 'Propietario - Tomador'), fila(EMPRESA, 'b', 'Tomador - Ocasional')],
    [persona('v'), persona('b')],
  )
  assert.equal(d.estado, 'contactos')
  if (d.estado !== 'contactos') return
  assert.deepEqual(d.elegibles.map((e) => e.clienteId), ['v'])
  assert.deepEqual(d.noElegibles.map((e) => [e.clienteId, e.motivo]), [['b', 'relacion_no_habilita']])
})

// ─── Por WhatsApp (21/10/2026, idea 4): la MISMA regla de relación; el dato que cuenta es el MÓVIL ────────────────────
// Para verlo en rojo: en `motivoSinCanal` devuelve `null` para whatsapp sin mirar `movil` → falla «sin móvil, no»;
// o deja el corte por correo del tomador también para whatsapp → falla «el correo del tomador no corta».
const conMovil = (clienteId: string, movil: PersonaDestino['movil'] = 'con_movil', tipoPersona: PersonaDestino['tipoPersona'] = 'fisica'): PersonaDestino =>
  ({ clienteId, nombre: clienteId.toUpperCase(), tipoPersona, correo: 'no_se_sabe', movil })

test('🪤 WhatsApp: Dueño de una empresa con móvil → elegible, aunque no se sepa su correo', () => {
  const d = destinatariosPresupuesto(empresaSinCorreo, [fila(EMPRESA, 'v', 'Dueño')], [conMovil('v')], 'whatsapp')
  assert.equal(destinatarioElegible(d, 'v')?.via, 'representacion')
})

test('🪤 WhatsApp: sin móvil, ilegible o sin mirar → NO, y se dice por qué', () => {
  const d = destinatariosPresupuesto(empresaSinCorreo,
    [fila(EMPRESA, 's', 'Dueño'), fila(EMPRESA, 'i', 'Administración'), fila(EMPRESA, 'x', 'Representante')],
    [conMovil('s', 'sin_movil'), conMovil('i', 'no_se_sabe'), { ...persona('x'), movil: undefined }], 'whatsapp')
  assert.equal(d.estado, 'nadie')
  if (d.estado !== 'nadie') return
  assert.deepEqual(Object.fromEntries(d.noElegibles.map((e) => [e.clienteId, e.motivo])), { s: 'sin_movil', i: 'movil_no_se_sabe', x: 'movil_no_se_sabe' })
})

test('🪤 WhatsApp: la RELACIÓN es la misma regla (Accionista no; autorización al revés no; Dueño de persona física no)', () => {
  const d = destinatariosPresupuesto(empresaSinCorreo,
    [fila(EMPRESA, 'acc', 'Accionista'), fila('rev', EMPRESA, 'Socio/a', true), fila(EMPRESA, 'aut', 'Socio/a', true)],
    [conMovil('acc'), conMovil('rev'), conMovil('aut')], 'whatsapp')
  assert.deepEqual(d.estado === 'contactos' ? d.elegibles.map((e) => [e.clienteId, e.via]) : [], [['aut', 'autorizacion']])
  const fisica = destinatariosPresupuesto({ clienteId: EMPRESA, tipoPersona: 'fisica', correo: 'sin_email' }, [fila(EMPRESA, 'v', 'Dueño')], [conMovil('v')], 'whatsapp')
  assert.equal(destinatarioElegible(fisica, 'v'), null)
})

test('🪤 WhatsApp: el correo del tomador (con correo, ilegible o de baja) NO corta; por correo sí', () => {
  for (const correo of ['con_email', 'no_se_sabe', 'baja_de_correo'] as const) {
    const t = { ...empresaSinCorreo, correo }
    assert.equal(destinatarioElegible(destinatariosPresupuesto(t, [fila(EMPRESA, 'v', 'Dueño')], [conMovil('v')], 'whatsapp'), 'v')?.clienteId, 'v')
    assert.equal(destinatarioElegible(destinatariosPresupuesto(t, [fila(EMPRESA, 'v', 'Dueño')], [{ ...persona('v'), movil: 'con_movil' }]), 'v'), null)
  }
})

test('🪤 por CORREO el móvil no cuenta (sin regresión): con móvil y sin correo, no', () => {
  const d = destinatariosPresupuesto(empresaSinCorreo, [fila(EMPRESA, 'v', 'Dueño')], [{ ...persona('v', 'sin_email'), movil: 'con_movil' }])
  assert.equal(destinatarioElegible(d, 'v'), null)
})
