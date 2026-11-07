// F6 · portal de la gestoría (bandeja y comentarios) y declaración responsable del SIF.
// Cepos vistos fallar el 07/11/2026 (ver el informe de la sesión): (1) quitar el filtro `rol !== 'gestor'` de empresasGestionadas → rojo en «solo consulta las empresas
// asignadas»; (2) hacer que un contador desconocido valga 0 → rojo en «null ≠ 0»; (3) rellenar `productorNif` con un literal por defecto → rojo en «no inventa».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bandejaGestor, empresasGestionadas, gestionaEmpresa, resumirEmpresa, validarComentario, validarRevision, CONTADORES_DESCONOCIDOS,
  declaracionResponsableSif, configSifDesdeEntorno, CONFIG_SIF_VACIA, type ContadoresPendientes, type VinculoUsuario,
} from '../src/index.ts'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const vinculos: VinculoUsuario[] = [
  { empresaId: A, razonSocial: 'Alfa SL', rol: 'gestor' }, { empresaId: B, razonSocial: 'Beta SL', rol: 'gestor' },
  { empresaId: C, razonSocial: 'Gamma SL (soy su dueño)', rol: 'dueno' }, { empresaId: A.toUpperCase(), razonSocial: 'Alfa duplicada', rol: 'gestor' },
]
const c = (a: number | null, f: number | null, v: number | null, d: number | null): ContadoresPendientes => ({ asientosSinRevisar: a, facturasAConfirmar: f, avisosSinLeer: v, declaracionesBorrador: d })

test('solo consulta las empresas asignadas como GESTOR: nunca las de dueño ni ninguna ajena (D no está entre los vínculos)', async () => {
  const pedidas: string[] = []
  const r = await bandejaGestor(vinculos, async (id) => { pedidas.push(id); return c(1, 0, 0, 0) })
  assert.deepEqual(pedidas.sort(), [A, B])
  assert.deepEqual(r.empresas.map((e) => e.empresaId).sort(), [A, B])
  assert.equal(gestionaEmpresa(vinculos, A), true)
  assert.equal(gestionaEmpresa(vinculos, A.toUpperCase()), true)
  assert.equal(gestionaEmpresa(vinculos, C), false) // es dueño, no gestor
  assert.equal(gestionaEmpresa(vinculos, D), false) // ajena
  assert.deepEqual(empresasGestionadas(vinculos).map((v) => v.razonSocial), ['Alfa SL', 'Beta SL']) // sin duplicados, gana el primero
})

test('un gestor sin asignaciones ve una bandeja vacía marcada como tal (no una de otro)', async () => {
  let llamadas = 0
  const r = await bandejaGestor([{ empresaId: C, razonSocial: 'X', rol: 'dueno' }], async () => { llamadas++; return c(9, 9, 9, 9) })
  assert.equal(llamadas, 0)
  assert.equal(r.sinAsignaciones, true)
  assert.deepEqual(r.empresas, [])
})

test('null ≠ 0: lo que no se pudo leer no suma, marca la empresa como incompleta y no se esconde; un fallo de la fuente tampoco es 0', async () => {
  const r = await bandejaGestor(vinculos, async (id) => { if (id === B) throw new Error('0006 sin aplicar'); return c(3, null, 2, 0) })
  const a = r.empresas.find((e) => e.empresaId === A)!, b = r.empresas.find((e) => e.empresaId === B)!
  assert.equal(a.total, 5); assert.equal(a.facturasAConfirmar, null); assert.equal(a.incompleto, true)
  assert.deepEqual([b.asientosSinRevisar, b.facturasAConfirmar, b.avisosSinLeer, b.declaracionesBorrador], [null, null, null, null])
  assert.equal(b.total, 0); assert.equal(b.incompleto, true)
  assert.equal(r.incompleta, true)
  assert.equal(r.totalGeneral, 5)
  assert.deepEqual(resumirEmpresa({ empresaId: A, razonSocial: 'x' }, CONTADORES_DESCONOCIDOS).incompleto, true)
  assert.equal(resumirEmpresa({ empresaId: A, razonSocial: 'x' }, c(-1, 1.5, NaN, 0)).total, 0) // basura de la fuente = desconocido, no cuenta
})

test('orden: más trabajo primero; a igual trabajo, primero la incompleta; luego por nombre', async () => {
  const mas: VinculoUsuario[] = [{ empresaId: A, razonSocial: 'Zeta', rol: 'gestor' }, { empresaId: B, razonSocial: 'Alfa', rol: 'gestor' }, { empresaId: C, razonSocial: 'Beta', rol: 'gestor' }]
  const r = await bandejaGestor(mas, async (id) => (id === A ? c(1, 1, 1, 1) : id === B ? c(0, 0, 0, 0) : c(0, 0, 0, null)))
  assert.deepEqual(r.empresas.map((e) => e.razonSocial), ['Zeta', 'Beta', 'Alfa'])
})

const ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
test('comentarios: cuelgan de EXACTAMENTE un objeto; texto limpio, no vacío y acotado', () => {
  assert.deepEqual(validarComentario({ asientoId: ID.toUpperCase(), texto: '  Falta justificante \u0007 ' }), { ok: true, valor: { objeto: { tipo: 'asiento', id: ID }, texto: 'Falta justificante' } })
  assert.deepEqual(validarComentario({ facturaId: ID, texto: 'ok' }).ok, true)
  assert.deepEqual(validarComentario({ documentoRef: 'adjunto-17.pdf', texto: 'ok' }), { ok: true, valor: { objeto: { tipo: 'documento', ref: 'adjunto-17.pdf' }, texto: 'ok' } })
  for (const malo of [{ texto: 'x' }, { asientoId: ID, facturaId: ID, texto: 'x' }, { asientoId: 'no-uuid', texto: 'x' }, { asientoId: ID, texto: '   ' }, { asientoId: ID, texto: 'x'.repeat(2001) }, { documentoRef: 'x'.repeat(301), texto: 'x' }, null, 'texto'])
    assert.equal(validarComentario(malo).ok, false, JSON.stringify(malo))
  assert.deepEqual(validarRevision({ tipo: 'asiento', id: ID }), { ok: true, valor: { tipo: 'asiento', id: ID } })
  assert.equal(validarRevision({ tipo: 'documento', id: ID }).ok, false)
  assert.equal(validarRevision({ tipo: 'asiento', id: '1' }).ok, false)
})

const hoy = new Date('2026-11-07T10:00:00Z')
test('declaración SIF: sin configuración NO inventa nada (todo «[FALTA: …]») y lista lo que falta', () => {
  const d = declaracionResponsableSif(CONFIG_SIF_VACIA, hoy)
  assert.equal(d.completa, false)
  assert.equal(d.faltan.length, 10)
  assert.ok(d.texto.includes('[FALTA: NIF del productor]'))
  assert.ok(d.texto.includes('[FALTA: razón social del productor]'))
  assert.ok(!/B\d{8}/.test(d.texto) && !/\d{8}[A-Z]/.test(d.texto)) // ningún NIF aparece de la nada
  assert.deepEqual(configSifDesdeEntorno({}), CONFIG_SIF_VACIA)
  assert.equal(configSifDesdeEntorno({ SIF_PRODUCTOR_NIF: 'zz' }).productorNif, null) // NIF mal formado = desconocido
})

test('declaración SIF: con la configuración completa toma TODOS los datos de ella y queda completa', () => {
  const cfg = configSifDesdeEntorno({
    SIF_PRODUCTOR_RAZON_SOCIAL: 'Productor de Prueba S.L.', SIF_PRODUCTOR_NIF: 'b-00000000', SIF_PRODUCTOR_DOMICILIO: 'Calle Falsa 1, 41001 Sevilla', SIF_PRODUCTOR_EMAIL: 'sif@prueba.test',
    SIF_SISTEMA_NOMBRE: 'Contabilidad de Prueba', SIF_SISTEMA_ID: 'cp', SIF_SISTEMA_VERSION: '1.2.3', SIF_SOLO_VERIFACTU: 'no', SIF_MULTIUSUARIO: 'sí', SIF_LUGAR_DECLARACION: 'Sevilla',
  })
  const d = declaracionResponsableSif(cfg, hoy)
  assert.equal(d.completa, true)
  assert.deepEqual(d.faltan, [])
  assert.ok(!d.texto.includes('[FALTA'))
  for (const v of ['Productor de Prueba S.L.', 'B00000000', 'Calle Falsa 1, 41001 Sevilla', 'sif@prueba.test', 'Contabilidad de Prueba', 'identificador CP', 'versión 1.2.3', 'En Sevilla, a 7 de noviembre de 2026', 'tanto en la modalidad VERI*FACTU como']) assert.ok(d.texto.includes(v), v)
  assert.ok(declaracionResponsableSif({ ...cfg, soloVerifactu: true }, hoy).texto.includes('solo puede utilizarse'))
})
