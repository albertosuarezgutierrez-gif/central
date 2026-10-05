// «Un número, un contacto» y «Enriquecer ficha» (05/10/2026). Cepos vistos en rojo antes de dejarlos.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparNumeros, camposDeCrm, MAX_DESVINCULAR_POR_PASADA, camposDeGoogle, hashCampos, lineaTambien, personaDesdeCampos, planificarSync, titularDeNumero,
  TIPO_ORG_TAMBIEN, TIPO_ID_EXTERNO,
  type ContactoGoogle, type EntradaPlan, type PersonaGoogle, type PersonaParaEscribir, type Vinculo,
} from './google-contactos.ts'
import { accionesPermitidas, efectoResolucion } from './google-contactos-revision.ts'
import { informeSimulacion } from './google-contactos-simulacion.ts'

const GRUPO = 'contactGroups/abc'
const dentro = [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }]
const entrada = (e: Partial<EntradaPlan>): EntradaPlan =>
  ({ crm: [], seleccionCompleta: true, vinculos: [], fusiones: new Map(), google: [], modo: 'completo', grupoResourceName: GRUPO, ...e })

// Berta (persona, lead) y el Instituto (empresa, cliente con siniestro) comparten el móvil de Berta.
const berta: ContactoGoogle = {
  clienteId: 'b1', nombre: 'Berta', apellidos: 'Ruiz', telefono: '600 11 22 33', email: 'berta@x.es', grupo: 'lead',
  tipoPersona: 'fisica', nota: 'Lead (póliza en otra compañía): Hogar · Mapfre',
}
const instituto: ContactoGoogle = {
  clienteId: 'i1', nombre: 'Instituto técnico superior de Informática Studium', apellidos: null, telefono: '+34600112233',
  email: 'secretaria@studium.es', grupo: 'cliente', tipoPersona: 'juridica', alerta: 'siniestro', resumen: 'Responsabilidad civil · Allianz',
  nota: 'Pólizas en vigor:\n· Responsabilidad civil · Allianz',
}

/** Lo que Google devolvería tras escribir `p` (con canonicalForm y en la etiqueta). */
function releido(p: PersonaParaEscribir, rn: string, extra: Partial<PersonaGoogle> = {}): PersonaGoogle {
  return {
    resourceName: rn, etag: `e-${rn}`, names: p.names, emailAddresses: p.emailAddresses, organizations: p.organizations,
    externalIds: p.externalIds, biographies: p.biographies, urls: p.urls, birthdays: p.birthdays,
    phoneNumbers: p.phoneNumbers.map((t) => ({ value: t.value, canonicalForm: t.value })), memberships: dentro, ...extra,
  }
}
function vinculo(clienteId: string, rn: string, hash: string, extra: Partial<Vinculo> = {}): Vinculo {
  return { clienteId, resourceName: rn, etag: `e-${rn}`, hashEnviado: hash, origen: 'creado', estado: 'activo', ...extra }
}

test('número compartido → UN contacto (la persona) con la empresa como organization y «También:» en la nota', () => {
  const plan = planificarSync(entrada({ crm: [instituto, berta] }))
  assert.equal(plan.crear.length, 1, 'un número, un contacto')
  const c = plan.crear[0]
  assert.equal(c.clienteId, 'b1', 'la principal es la persona física')
  // Emoji: 🟢 (alguna en vigor) + la alerta más urgente de TODAS las fichas del número (🚨 del Instituto).
  assert.equal(c.persona.names[0].givenName, '🟢🚨 Berta')
  assert.deepEqual(c.persona.organizations[0], { name: 'Instituto técnico superior de Informática Studium', title: 'Cliente', type: TIPO_ORG_TAMBIEN })
  assert.equal(c.persona.organizations.at(-1)?.name, 'Grupo ASegura')
  assert.match(c.persona.biographies![0].value, /También: Instituto técnico superior de Informática Studium \(cliente, Responsabilidad civil · Allianz\) · 🚨 siniestro abierto/)
  assert.equal(c.persona.emailAddresses[0].value, 'berta@x.es', 'el correo es el de la persona, no el de la empresa')
  assert.equal(plan.revisiones.filter((r) => r.tipo === 'telefono_titular').length, 0)
})

test('🪤 huella estable: el contacto combinado releído de Google no se reescribe cada hora', () => {
  const plan = planificarSync(entrada({ crm: [instituto, berta] }))
  const c = plan.crear[0]
  const g = releido(c.persona, 'people/b')
  const otra = planificarSync(entrada({ crm: [berta, instituto], vinculos: [vinculo('b1', 'people/b', c.hash)], google: [g] }))
  assert.equal(otra.actualizar.length, 0, JSON.stringify(otra.actualizar.map((a) => a.persona.names)))
  assert.equal(otra.refrescar.length, 0)
  assert.equal(otra.revisiones.length, 0)
  assert.equal(hashCampos(camposDeGoogle(g)), c.hash)
})

test('sin titular inequívoco (tipo_persona NULL) → cola «Este número es de…», sin crear; la elección guardada decide', () => {
  const a = { ...berta, tipoPersona: null }
  const b = { ...instituto, tipoPersona: null }
  const sin = planificarSync(entrada({ crm: [a, b] }))
  assert.equal(sin.crear.length, 0)
  const r = sin.revisiones.find((x) => x.tipo === 'telefono_titular')!
  assert.deepEqual(r.candidatos, ['b1', 'i1'])
  assert.ok(r.telefonoHash && !r.resourceName.includes('600112233'), 'el número nunca va en claro a la cola')
  // Alberto elige al Instituto: la elección (por índice ciego) se respeta aunque sea jurídica.
  const elegido = planificarSync(entrada({ crm: [a, b], titulares: new Map([[r.telefonoHash!, 'i1']]) }))
  assert.equal(elegido.crear.length, 1)
  assert.equal(elegido.crear[0].clienteId, 'i1')
  assert.equal(elegido.revisiones.filter((x) => x.tipo === 'telefono_titular').length, 0)
  // Una elección de una ficha que ya no comparte el número no vale: vuelve a la cola.
  const vieja = planificarSync(entrada({ crm: [a, b], titulares: new Map([[r.telefonoHash!, 'otra']]) }))
  assert.equal(vieja.crear.length, 0)
})

test('titularDeNumero: solo la ÚNICA física frente a jurídicas; NULL no decide', () => {
  assert.deepEqual(titularDeNumero([{ clienteId: 'a', tipoPersona: 'fisica' }, { clienteId: 'b', tipoPersona: 'juridica' }], null), { titular: 'a', por: 'tipo_persona' })
  assert.equal(titularDeNumero([{ clienteId: 'a', tipoPersona: 'fisica' }, { clienteId: 'b', tipoPersona: null }], null).titular, null)
  assert.equal(titularDeNumero([{ clienteId: 'a', tipoPersona: 'fisica' }, { clienteId: 'b', tipoPersona: 'fisica' }], null).titular, null)
})

test('transición: las dos fichas YA tenían contacto → la secundaria se DESVINCULA sin borrar nada de Alberto', () => {
  const cb = camposDeCrm(berta)!
  const ci = camposDeCrm(instituto)!
  const gb = releido(personaDesdeCampos(cb, 'b1'), 'people/b')
  // El del Instituto lo creó el CRM; Alberto le añadió un 2.º teléfono y texto en la nota.
  const pi = personaDesdeCampos(ci, 'i1')
  const gi = releido(pi, 'people/i', {
    phoneNumbers: [{ value: '+34600112233', canonicalForm: '+34600112233' }, { value: '954000000' }],
    biographies: [{ value: `Llamar por la mañana\n\n${pi.biographies![0].value}` }],
    urls: [...(pi.urls ?? []), { value: 'https://studium.es' }],
  })
  const plan = planificarSync(entrada({
    crm: [berta, instituto], titulares: new Map(),
    vinculos: [vinculo('b1', 'people/b', hashCampos(cb)), vinculo('i1', 'people/i', hashCampos(ci))], google: [gb, gi],
  }))
  assert.equal(plan.retirar.length, 0, '🚨 nunca se borra en Google')
  assert.equal(plan.desvincular.length, 1)
  const d = plan.desvincular[0]
  assert.equal(d.clienteId, 'i1')
  assert.equal(d.persona.names[0].givenName, 'Instituto técnico superior de Informática Studium', 'sin emoji')
  // Lo creó el CRM: NUESTRO teléfono/correo también fuera (si no, dos contactos con el número de Berta); el 2.º, de Alberto, se queda.
  assert.deepEqual(d.persona.phoneNumbers.map((t) => t.value), ['954000000'])
  assert.deepEqual(d.persona.emailAddresses, [])
  assert.deepEqual(d.persona.biographies, [{ value: 'Llamar por la mañana', contentType: 'TEXT_PLAIN' }], 'su texto sí, nuestro bloque no')
  assert.deepEqual(d.persona.urls, [{ value: 'https://studium.es' }])
  assert.deepEqual(d.persona.organizations, [])
  assert.ok(!d.persona.externalIds.some((x) => x.type === TIPO_ID_EXTERNO))
  assert.equal(plan.olvidar.length, 0)
  // La principal se reescribe UNA vez con el Instituto dentro.
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].clienteId, 'b1')
  assert.equal(plan.actualizar[0].persona.organizations[0].type, TIPO_ORG_TAMBIEN)
})

test('transición: solo la secundaria tenía contacto → la principal lo HEREDA (no se crea otro con el mismo número)', () => {
  const ci = camposDeCrm(instituto)!
  const gi = releido(personaDesdeCampos(ci, 'i1'), 'people/i')
  const plan = planificarSync(entrada({ crm: [berta, instituto], vinculos: [vinculo('i1', 'people/i', hashCampos(ci))], google: [gi] }))
  assert.equal(plan.crear.length, 0)
  assert.equal(plan.desvincular.length, 0)
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].clienteId, 'b1')
  assert.equal(plan.actualizar[0].resourceName, 'people/i')
  assert.equal(plan.actualizar[0].revinculaDe, 'i1')
  assert.equal(plan.actualizar[0].persona.names[0].givenName, '🟢🚨 Berta')
})

test('transición: secundaria sacada del grupo por Alberto o borrada → solo se olvida el vínculo, Google no se toca', () => {
  const cb = camposDeCrm(berta)!
  const ci = camposDeCrm(instituto)!
  const gb = releido(personaDesdeCampos(cb, 'b1'), 'people/b')
  const gi = releido(personaDesdeCampos(ci, 'i1'), 'people/i', { memberships: [] })
  const plan = planificarSync(entrada({
    crm: [berta, instituto], vinculos: [vinculo('b1', 'people/b', hashCampos(cb)), vinculo('i1', 'people/i', hashCampos(ci))], google: [gb, gi],
  }))
  assert.equal(plan.desvincular.length, 0)
  assert.deepEqual(plan.olvidar, ['i1'])
  assert.equal(plan.retirar.length, 0)
})

test('empresa con teléfono que NO es de ninguna persona-ficha → sigue con su propio contacto', () => {
  const sola = { ...instituto, telefono: '+34955000000' }
  const plan = planificarSync(entrada({ crm: [berta, sola] }))
  assert.equal(plan.crear.length, 2)
  assert.ok(plan.crear.every((c) => !c.persona.organizations.some((o) => o.type === TIPO_ORG_TAMBIEN)))
})

test('agruparNumeros: las compañías 🔵 y los números no E.164 no se agrupan', () => {
  const k: ContactoGoogle = { clienteId: 'compania:x', nombre: 'Mapfre', apellidos: null, telefono: '600112233', email: null, grupo: 'compania' }
  const crm = [berta, k]
  const a = agruparNumeros({ crm, campos: new Map(crm.map((c) => [c.clienteId, camposDeCrm(c)])), titulares: new Map(), hashTelefono: (t) => t, tieneVinculo: () => false })
  assert.equal(a.crm.length, 2)
  assert.equal(a.secundarias.size, 0)
})

test('«También:» lleva estado y ramo · compañía; un lead sin pólizas, solo su estado', () => {
  assert.equal(lineaTambien({ ...berta, resumen: null }), 'También: Berta Ruiz (lead)')
})

test('enriquecer: el contacto tiene un correo que la ficha NO tiene → «Añadir a la ficha»; nunca si la ficha ya tiene o es de otra ficha', () => {
  const sinMail: ContactoGoogle = { ...berta, telefono: '+34611000000', email: null, fichaSinEmail: true, tipoPersona: null }
  const cc = camposDeCrm(sinMail)!
  const g = releido(personaDesdeCampos(cc, 'b1'), 'people/b', { emailAddresses: [{ value: 'Berta.Ruiz@Gmail.com' }] })
  const v = vinculo('b1', 'people/b', hashCampos(cc))
  const plan = planificarSync(entrada({ crm: [sinMail], vinculos: [v], google: [g] }))
  const r = plan.revisiones.filter((x) => x.tipo === 'enriquecer_ficha')
  assert.equal(r.length, 1)
  assert.deepEqual(r[0].campos, ['email'])
  assert.equal(r[0].propuesta?.email, 'berta.ruiz@gmail.com')
  assert.equal(plan.actualizar.length, 0, 'proponer no pisa nada (ni en Google ni en el CRM)')
  // La ficha tiene correo (o no se sabe): nada.
  const conMail = planificarSync(entrada({ crm: [{ ...sinMail, fichaSinEmail: false }], vinculos: [v], google: [g] }))
  assert.equal(conMail.revisiones.filter((x) => x.tipo === 'enriquecer_ficha').length, 0)
  const noSeSabe = planificarSync(entrada({ crm: [{ ...sinMail, fichaSinEmail: undefined }], vinculos: [v], google: [g] }))
  assert.equal(noSeSabe.revisiones.filter((x) => x.tipo === 'enriquecer_ficha').length, 0)
  // El correo es el de OTRA ficha de la selección: no se propone.
  const otra: ContactoGoogle = { ...instituto, clienteId: 'o1', telefono: '+34955000000', email: 'berta.ruiz@gmail.com' }
  const ajeno = planificarSync(entrada({ crm: [sinMail, otra], vinculos: [v], google: [g] }))
  assert.equal(ajeno.revisiones.filter((x) => x.tipo === 'enriquecer_ficha').length, 0)
})

test('cola: «Este número es de…» y «Añadir a la ficha» con sus botones; ninguno toca Google ni vínculos', () => {
  assert.deepEqual(accionesPermitidas('telefono_titular'), ['elegir_titular', 'descartar'])
  assert.deepEqual(accionesPermitidas('enriquecer_ficha'), ['anadir_a_ficha', 'descartar'])
  const t = efectoResolucion('telefono_titular', 'elegir_titular')
  assert.ok(t.ok && t.titular && t.vinculo === 'ninguno' && !t.enriquecer)
  const e = efectoResolucion('enriquecer_ficha', 'anadir_a_ficha')
  assert.ok(e.ok && e.enriquecer && e.vinculo === 'ninguno' && !e.titular)
  assert.equal(efectoResolucion('duplicado_ambiguo', 'elegir_titular').ok, false)
})

test('transición: secundaria ADOPTADA (contacto de Alberto) → sus teléfonos y correos se quedan tal cual', () => {
  const cb = camposDeCrm(berta)!
  const ci = camposDeCrm(instituto)!
  const gb = releido(personaDesdeCampos(cb, 'b1'), 'people/b')
  const gi = releido(personaDesdeCampos(ci, 'i1'), 'people/i', { phoneNumbers: [{ value: '+34600112233', canonicalForm: '+34600112233' }, { value: '954000000' }] })
  const plan = planificarSync(entrada({
    crm: [berta, instituto],
    vinculos: [vinculo('b1', 'people/b', hashCampos(cb)), vinculo('i1', 'people/i', hashCampos(ci), { origen: 'adoptado' })], google: [gb, gi],
  }))
  assert.deepEqual(plan.desvincular[0].persona.phoneNumbers.map((t) => t.value), ['+34600112233', '954000000'])
  assert.deepEqual(plan.desvincular[0].persona.emailAddresses.map((m) => m.value), ['secretaria@studium.es'])
})

test('🪤 más de 3 fichas con el mismo número (centralita) → ni titular ni combinación: cada una como estaba + aviso informativo', () => {
  const fichas: ContactoGoogle[] = [
    { ...berta, clienteId: 'a1' },
    ...['a2', 'a3', 'a4'].map((id) => ({ ...instituto, clienteId: id })),
  ]
  const ca = camposDeCrm(fichas[1])!
  const ga = releido(personaDesdeCampos(ca, 'a2'), 'people/a2')
  const plan = planificarSync(entrada({ crm: fichas, vinculos: [vinculo('a2', 'people/a2', hashCampos(ca))], google: [ga] }))
  assert.equal(plan.crear.length, 0, 'ninguna sin contacto lo estrena')
  assert.equal(plan.desvincular.length, 0)
  assert.equal(plan.actualizar.length, 0, 'la que ya tenía contacto sigue igual (sin 3 organizations dentro)')
  const r = plan.revisiones.filter((x) => x.tipo === 'telefono_muchas_fichas')
  assert.equal(r.length, 1)
  assert.equal(r[0].candidatos?.length, 4)
  assert.equal(plan.revisiones.filter((x) => x.tipo === 'telefono_titular').length, 0)
  assert.deepEqual(accionesPermitidas('telefono_muchas_fichas'), ['descartar'])
  assert.deepEqual(plan.numerosCompartidos, { combinados: 0, enCola: 0, demasiadas: 1 })
})

test(`🪤 más de ${MAX_DESVINCULAR_POR_PASADA} desvinculaciones en una pasada → no se ejecuta NINGUNA y se avisa`, () => {
  const crm: ContactoGoogle[] = []
  const vinculos: Vinculo[] = []
  const google: PersonaGoogle[] = []
  for (let k = 0; k < MAX_DESVINCULAR_POR_PASADA + 1; k++) {
    const tel = `+3460000${String(k).padStart(4, '0')}`
    const p = { ...berta, clienteId: `p${k}`, telefono: tel, email: null }
    const q = { ...instituto, clienteId: `q${k}`, telefono: tel, email: null }
    for (const c of [p, q]) {
      const cc = camposDeCrm(c)!
      crm.push(c)
      vinculos.push(vinculo(c.clienteId, `people/${c.clienteId}`, hashCampos(cc)))
      google.push(releido(personaDesdeCampos(cc, c.clienteId), `people/${c.clienteId}`))
    }
  }
  const plan = planificarSync(entrada({ crm, vinculos, google }))
  assert.equal(plan.desvincularCalculados, MAX_DESVINCULAR_POR_PASADA + 1)
  assert.equal(plan.desvincular.length, 0)
  assert.ok(plan.avisos.some((a) => a.includes('BLOQUEADA')))
  assert.equal(plan.retirar.length, 0)
  // Con 10 sí.
  const diez = planificarSync(entrada({ crm: crm.slice(2), vinculos: vinculos.slice(2), google: google.slice(2) }))
  assert.equal(diez.desvincular.length, MAX_DESVINCULAR_POR_PASADA)
})

test('simulación: cuenta números compartidos, combinados, cola, principales reescritas y los que dejan de ser del CRM', () => {
  const cb = camposDeCrm(berta)!
  const ci = camposDeCrm(instituto)!
  const otraA = { ...berta, clienteId: 'x1', telefono: '+34677000000', tipoPersona: null }
  const otraB = { ...instituto, clienteId: 'x2', telefono: '+34677000000', tipoPersona: null }
  const inf = informeSimulacion({
    crm: [berta, instituto, otraA, otraB], seleccionCompleta: true, fusiones: new Map(), grupoResourceName: GRUPO,
    vinculos: [vinculo('b1', 'people/b', hashCampos(cb)), vinculo('i1', 'people/i', hashCampos(ci))],
    google: [releido(personaDesdeCampos(cb, 'b1'), 'people/b'), releido(personaDesdeCampos(ci, 'i1'), 'people/i')],
  }, { totalCuenta: 10 })
  assert.deepEqual(inf.compartidos, {
    numeros: 2, combinadosSolos: 1, preguntaraCola: 1, demasiadasFichas: 0, principalesReescritas: 1, dejanDeSerCrm: 1, desvinculacionBloqueada: false,
  })
  assert.ok(inf.avisos.some((a) => a.startsWith('2 números compartidos')))
})
