import test from 'node:test'
import assert from 'node:assert/strict'
import { planificarSync, type ContactoGoogle, type EntradaPlan, type PersonaGoogle, type Vinculo } from './google-contactos.ts'
import { accionesParaFichas, notaLeadCorreo } from './google-contactos-lead.ts'

// 🪤 Lead de correo → Google Contacts al momento (19/10/2026). El endpoint arma el MISMO plan que el cron
// y ejecuta SOLO lo de las fichas pedidas: nunca retira, actualiza ni crea contactos de OTRAS fichas.

const GRUPO = 'contactGroups/abc'
const lead = (id: string, nombre: string, tel: string | null, extra: Partial<ContactoGoogle> = {}): ContactoGoogle =>
  ({ clienteId: id, nombre, apellidos: null, telefono: tel, email: null, grupo: 'lead', nota: notaLeadCorreo('2026-10-19'), ...extra })
const cliente = (id: string, nombre: string, tel: string): ContactoGoogle => ({ clienteId: id, nombre, apellidos: 'Pérez', telefono: tel, email: null, grupo: 'cliente' })
const entrada = (e: Partial<EntradaPlan>): EntradaPlan =>
  ({ crm: [], seleccionCompleta: false, vinculos: [], fusiones: new Map(), google: [], modo: 'completo', grupoResourceName: GRUPO, ...e })
const personal = (rn: string, given: string, tel: string): PersonaGoogle =>
  ({ resourceName: rn, etag: `e-${rn}`, names: [{ givenName: given, familyName: '', displayName: given }], phoneNumbers: [{ value: tel }] })
const enEtiqueta = (rn: string, given: string, tel: string, id: string): PersonaGoogle => ({
  ...personal(rn, given, tel), externalIds: [{ value: id, type: 'asegura' }],
  memberships: [{ contactGroupMembership: { contactGroupResourceName: GRUPO } }],
})

test('nota del lead de correo: de dónde y cuándo, sin datos personales', () => {
  assert.equal(notaLeadCorreo('2026-10-19'), 'Lead por correo (hola@): 19/10/2026')
  assert.equal(notaLeadCorreo(null), 'Lead por correo (hola@)')
})

test('lead nuevo sin nada en la agenda → SOLO su alta; lo que el plan diga de otras fichas no sale', () => {
  // Otra ficha sin contacto (el cron la crearía), una vinculada que cambió (el cron la actualizaría) y un
  // vínculo que ya no está en la selección (el cron lo retiraría): nada de eso es del endpoint.
  const otra = cliente('c-otra', 'Otra', '611000001')
  const cambiada = cliente('c-camb', 'Cambiada', '611000002')
  const vinculos: Vinculo[] = [
    { clienteId: 'c-camb', resourceName: 'people/camb', etag: 'x', hashEnviado: 'viejo', origen: 'creado', estado: 'activo' },
    { clienteId: 'c-fuera', resourceName: 'people/fuera', etag: 'y', hashEnviado: 'h', origen: 'creado', estado: 'activo' },
  ]
  const google = [enEtiqueta('people/camb', '🟢 Cambiada', '611000002', 'c-camb'), enEtiqueta('people/fuera', '🟢 Fuera', '611000003', 'c-fuera')]
  const nuevo = lead('L1', 'Lucía', '622000001')
  const seleccion = [otra, cambiada, nuevo]
  const plan = planificarSync(entrada({ crm: seleccion, vinculos, google, seleccionCompleta: true }))
  // El plan entero SÍ trae trabajo de otras fichas (si no, el test no probaría nada).
  assert.ok(plan.crear.some((c) => c.clienteId === 'c-otra'))
  assert.ok(plan.actualizar.some((a) => a.clienteId === 'c-camb'))
  assert.ok(plan.retirar.some((r) => r.clienteId === 'c-fuera'))
  const a = accionesParaFichas({ plan, objetivos: ['L1'], vinculos, seleccion })
  assert.deepEqual(a.crear.map((c) => c.clienteId), ['L1'])
  assert.deepEqual(a.actualizar, [])
  assert.deepEqual(a.revisiones, [])
  assert.deepEqual(a.resultados.get('L1'), { estado: 'anadido', motivo: 'creado' })
})

test('ya en la agenda (fuera de la etiqueta) con su teléfono y su nombre → se adopta: ya_estaba, sin crear', () => {
  const nuevo = lead('L1', 'Lucía', '622000001')
  const plan = planificarSync(entrada({ crm: [nuevo], google: [personal('people/p1', 'Lucía', '+34 622 00 00 01')] }))
  const a = accionesParaFichas({ plan, objetivos: ['L1'], vinculos: [], seleccion: [nuevo] })
  assert.deepEqual(a.crear, [])
  assert.deepEqual(a.actualizar.map((x) => [x.clienteId, x.origen, x.anadirAlGrupo]), [['L1', 'adoptado', true]])
  assert.deepEqual(a.resultados.get('L1'), { estado: 'ya_estaba', motivo: 'adoptado' })
})

test('mismo teléfono con OTRO nombre (contacto personal) → cola, ni se crea ni se pisa', () => {
  const nuevo = lead('L1', 'Lucía', '622000001')
  const plan = planificarSync(entrada({ crm: [nuevo], google: [personal('people/p1', 'Mamá', '622000001')] }))
  const a = accionesParaFichas({ plan, objetivos: ['L1'], vinculos: [], seleccion: [nuevo] })
  assert.deepEqual(a.crear, [])
  assert.deepEqual(a.actualizar, [])
  assert.equal(a.revisiones.length, 1)
  assert.equal(a.revisiones[0].tipo, 'duplicado_ambiguo')
  assert.deepEqual(a.resultados.get('L1'), { estado: 'revision', motivo: 'nombre_distinto' })
})

test('número compartido con otra ficha sin titular decidido → revisión del número (la de esa ficha cuenta)', () => {
  const nuevo = lead('L1', 'Lucía', '622000001')
  const otra = lead('L2', 'Pepe', '622000001')
  const plan = planificarSync(entrada({ crm: [nuevo, otra] }))
  const a = accionesParaFichas({ plan, objetivos: ['L1'], vinculos: [], seleccion: [nuevo, otra] })
  assert.deepEqual(a.crear, [])
  assert.equal(a.revisiones[0]?.tipo, 'telefono_titular')
  assert.deepEqual(a.resultados.get('L1'), { estado: 'revision', motivo: 'telefono_titular' })
})

test('con vínculo → ya_estaba sin escribir; sacado de la etiqueta → error; fuera de la selección → error', () => {
  const nuevo = lead('L1', 'Lucía', '622000001')
  const vinculos: Vinculo[] = [
    { clienteId: 'L1', resourceName: 'people/l1', etag: null, hashEnviado: 'otro', origen: 'creado', estado: 'activo' },
    { clienteId: 'L3', resourceName: 'people/l3', etag: null, hashEnviado: 'h', origen: 'creado', estado: 'fuera_del_grupo' },
  ]
  const plan = planificarSync(entrada({ crm: [nuevo], vinculos, google: [enEtiqueta('people/l1', '🟡 Lucía', '622000001', 'L1')] }))
  assert.ok(plan.actualizar.some((x) => x.clienteId === 'L1'), 'el cron lo actualizaría: el endpoint no')
  const a = accionesParaFichas({ plan, objetivos: ['L1', 'L3', 'L9'], vinculos, seleccion: [nuevo] })
  assert.deepEqual(a.actualizar, [])
  assert.deepEqual(a.resultados.get('L1'), { estado: 'ya_estaba', motivo: 'ya_vinculado' })
  assert.deepEqual(a.resultados.get('L3'), { estado: 'error', motivo: 'sacado_del_grupo' })
  assert.deepEqual(a.resultados.get('L9'), { estado: 'error', motivo: 'fuera_de_alcance' })
})

test('dato sin descifrar → error ilegible (no se escribe un contacto a medias)', () => {
  const nuevo = lead('L1', 'Lucía', 'v1:abc')
  const plan = planificarSync(entrada({ crm: [nuevo] }))
  const a = accionesParaFichas({ plan, objetivos: ['L1'], vinculos: [], seleccion: [nuevo] })
  assert.deepEqual(a.crear, [])
  assert.deepEqual(a.resultados.get('L1'), { estado: 'error', motivo: 'ilegible' })
})
