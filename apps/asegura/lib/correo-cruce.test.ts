import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { claveAvisoCruce, companiaDeDgs, enCimaSegunResolucion, textoAvisoAnulacionSinCima, textoAvisoDevolucionSinRecibo, textoAvisoEmisionSinCima, textoAvisoEnlaceAmbiguo } from './correo-cruce.ts'

// F1 del agente corredor de correo (21/10/2026): avisos de cruce correo ↔ CIMA y enlace póliza ↔ oportunidad.
const HOY = new Date().toISOString().slice(0, 10)
const leer = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')

test('textos de cruce: compañía, nº y días; sin NIF ni IBAN aunque se cuelen en un campo', () => {
  const e = textoAvisoEmisionSinCima({ compania: 'occident', numeroPoliza: '540000021', numeroSolicitud: '170000021', fechaCorreo: HOY, diasHabiles: 6 })
  assert.match(e, /Occident/)
  assert.match(e, /540000021/)
  assert.match(e, /solicitud 170000021/)
  assert.match(e, /6 días hábiles; se esperan 5/)
  assert.match(e, /no se ha creado nada en la cartera/)
  assert.doesNotMatch(textoAvisoAnulacionSinCima({ compania: 'reale', numeroPoliza: 'X 12345678Z', fechaCorreo: HOY, diasHabiles: 3 }), /12345678Z/)
  assert.match(textoAvisoDevolucionSinRecibo({ codigoDgs: 'C0613', idRecibo: '880000001', numeroPoliza: null, fechaCorreo: HOY, diasHabiles: 2 }), /^↩️ Reale/)
  assert.match(textoAvisoEnlaceAmbiguo({ numeroPoliza: '61000001', ramo: 'hogar', codigoDgs: 'C0109', candidatas: 2, motivo: 'varias_oportunidades' }), /casa con 2 oportunidades abiertas.*No la he enlazado/)
  assert.equal(companiaDeDgs(null), 'la compañía')
  assert.equal(companiaDeDgs('E9999'), 'E9999')
  assert.equal(claveAvisoCruce('emision_sin_cima', 'occident:540000021'), 'emision_sin_cima:occident:540000021')
})

test('🪤 cruce: un fallo al leer la cartera NO es «CIMA no la trae» (lanza; no hay catch que devuelva vacío)', () => {
  const src = leer('correo-cruce-cima-bd.ts')
  const f = src.slice(src.indexOf('export async function cruzarCorreoConCima'))
  assert.match(f, /const candidatas = await polizasCandidatas\(db, correduriaId\)/)
  assert.doesNotMatch(f.slice(0, f.indexOf('const porId')), /polizasCandidatas\([^)]*\)\.catch/)
  // Solo `avisar` apunta: esperar / en_cima / no_se_sabe no.
  // La «Póliza emitida» declarada a mano (paso 5) decide con `diagnosticarDeclarada` (cepo en declaracion-emision.test.ts).
  assert.equal((f.match(/!== 'avisar'\) continue/g) ?? []).length, 4)
  // Lo ambiguo y lo que está en una ficha inactiva/fusionada es «no se sabe», nunca «no la trae»: las dos emisiones
  // (evento y solicitud emitida) pasan por `enCimaSegunResolucion` con la cartera Y las pólizas fuera de ella.
  assert.match(f, /const fuera = await polizasFueraDeCandidatas\(db, correduriaId\)/)
  assert.doesNotMatch(f.slice(0, f.indexOf('// 1. Emisiones')), /polizasFueraDeCandidatas\([^)]*\)\.catch/)
  assert.equal((f.match(/enCimaSegunResolucion\(\s+resolverPolizaEvento\([^)]*candidatas\),\s+resolverPolizaEvento\([^)]*fuera\)\)/g) ?? []).length, 2)
})

test('🪤 enCima: en una ficha INACTIVA o fusionada no es «CIMA no la trae» (null, no se avisa); ausente de verdad → false', () => {
  const p = { id: 'p1', clienteId: 'c1', numeroPoliza: '1', codigoDgs: 'C0468', aseguradora: null, importRef: null, eiacXmlHash: null, estado: 'EV', sustituidaAt: null }
  const no = { estado: 'sin_resolver', motivo: 'no_encontrada' } as const
  assert.equal(enCimaSegunResolucion({ estado: 'en_vigor', poliza: p }, no), true)
  assert.equal(enCimaSegunResolucion({ estado: 'no_en_vigor', poliza: p }, no), true)
  assert.equal(enCimaSegunResolucion({ estado: 'sin_resolver', motivo: 'ambigua' }, no), null)
  assert.equal(enCimaSegunResolucion(no, { estado: 'en_vigor', poliza: p }), null)
  assert.equal(enCimaSegunResolucion(no, { estado: 'no_en_vigor', poliza: p }), null)
  assert.equal(enCimaSegunResolucion(no, { estado: 'sin_resolver', motivo: 'ambigua' }), null)
  assert.equal(enCimaSegunResolucion(no, no), false)
})

test('🪤 enlace póliza↔oportunidad: lo decide la regla pura, en su PROPIO punto de guardado, y lo ambiguo solo avisa', () => {
  const src = leer('enlace-poliza-oportunidad.ts')
  assert.match(src, /decidirEnlacesPolizaOportunidad\(oportunidades, polizas, sols\)/)
  // Solo gana una oportunidad aún abierta y sin póliza ganada; la ambigua nunca toca `oportunidades`.
  assert.match(src, /where id = \$\{o\.id\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado::text = \$\{o\.estado\} and poliza_ganada_id is null/)
  const ambiguos = src.slice(src.indexOf('for (const a of d.ambiguos)'))
  assert.doesNotMatch(ambiguos, /update oportunidades/)
  assert.match(ambiguos, /insert into correo_cruce_aviso/)
  // Nunca por nombre: ni nombre ni apellidos en las consultas.
  assert.doesNotMatch(src, /c\.nombre|apellidos/)
  const ev = leer('eventos-cartera.ts')
  const d = ev.slice(ev.indexOf('export async function detectarYGuardar'))
  assert.match(d, /savepoint enlazar_oportunidad_correo`\s+let enlaces[^\n]*\n\s+let enlacesFallidos = false\s+try \{\s+enlaces = await enlazarPolizasConOportunidades\(tx, correduriaId\)/)
  assert.match(d, /rollback to savepoint enlazar_oportunidad_correo`\s+enlacesFallidos = true/)
  // Va DETRÁS del cierre por matrícula (lo que aquel ya ganó no se vuelve a mirar).
  assert.ok(d.indexOf('ganarOportunidadesEmitidas(tx, correduriaId)') < d.indexOf('enlazarPolizasConOportunidades(tx, correduriaId)'))
})

test('seguimiento de la solicitud: cada correo `solicitud` (resuelto o no) deja su hito en solicitud_compania', () => {
  const src = leer('correo-evento-bd.ts')
  const p = src.slice(src.indexOf('async function procesarSolicitud'), src.indexOf('const VENTANA_VINCULAR_DIAS'))
  assert.equal((p.match(/await anotarSolicitudCompania\(/g) ?? []).length, 2, 'sin_resolver y aplicado')
  const v = src.slice(src.indexOf('export async function vincularSolicitudesPendientes'))
  assert.match(v, /await anotarSolicitudCompania\(db, correduriaId, compania, f\.codigoDgs, item, op\.id, f\.creado, f\.id\)/)
  // Un correo más viejo no pisa el estado.
  const s = leer('solicitud-compania-bd.ts')
  assert.match(s, /case when solicitud_compania\.estado_at is null or excluded\.estado_at >= solicitud_compania\.estado_at/)
})
