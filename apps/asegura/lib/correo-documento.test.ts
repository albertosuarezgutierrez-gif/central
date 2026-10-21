import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidirAsignacion, elegirDestinoDocumento, notaAsignacionEvento, notaDocumentoCorreo, validarAsignacionEvento, validarDocumentoCorreo } from './correo-documento.ts'

// F1 del agente corredor de correo (21/10/2026): adjuntos PDF de correos de compañía → `seguros.documentos`.
// Fixtures inventados (sin nombres reales, NIF de ejemplo con formato válido pero inventado).

const PDF = Buffer.from('%PDF-1.4\n% inventado\n1 0 obj << >> endobj\n%%EOF\n', 'latin1')
const b64 = (b: Buffer) => b.toString('base64')
const UUID1 = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'

test('validarDocumentoCorreo: un PDF de verdad pasa; el mime lo decide el servidor, no quien llama', () => {
  const v = validarDocumentoCorreo({ mensajeId: '<m1@allianz.es>', nombre: 'Relacion.pdf', mime: 'application/octet-stream', base64: b64(PDF) })
  assert.ok(v.ok)
  if (!v.ok) return
  assert.equal(v.valor.mime, 'application/pdf')
  assert.equal(v.valor.contenido.length, PDF.length)
})

test('validarDocumentoCorreo: sin Message-ID, no PDF, «.pdf» que no lo es, vacío o >10 MB → rechazo (nada se guarda)', () => {
  assert.equal(validarDocumentoCorreo({ nombre: 'a.pdf', mime: 'application/pdf', base64: b64(PDF) }).ok, false)
  assert.equal(validarDocumentoCorreo({ mensajeId: '<m>', nombre: 'foto.jpg', mime: 'image/jpeg', base64: b64(PDF) }).ok, false)
  assert.equal(validarDocumentoCorreo({ mensajeId: '<m>', nombre: 'falso.pdf', mime: 'application/pdf', base64: b64(Buffer.from('<html>no</html>')) }).ok, false)
  assert.equal(validarDocumentoCorreo({ mensajeId: '<m>', nombre: 'a.pdf', mime: 'application/pdf', base64: '' }).ok, false)
  const grande = Buffer.alloc(10 * 1024 * 1024 + 10, 0x20)
  PDF.copy(grande)
  assert.equal(validarDocumentoCorreo({ mensajeId: '<m>', nombre: 'a.pdf', mime: 'application/pdf', base64: b64(grande) }).ok, false)
})

test('elegirDestinoDocumento: una póliza resuelta → esa póliza y su cliente', () => {
  const d = elegirDestinoDocumento([{ estado: 'aplicado', clienteId: 'c1', polizaId: 'p1', siniestroId: null }])
  assert.deepEqual(d, { asignado: true, clienteId: 'c1', polizaId: 'p1', siniestroId: null, motivo: 'la póliza del aviso' })
  // Ya en CIMA también es un desenlace confirmado.
  assert.equal(elegirDestinoDocumento([{ estado: 'duplicado_cima', clienteId: 'c1', polizaId: 'p1', siniestroId: 's1' }]).asignado, true)
})

test('elegirDestinoDocumento: varias pólizas del MISMO cliente → su ficha, sin elegir póliza', () => {
  const d = elegirDestinoDocumento([
    { estado: 'aplicado', clienteId: 'c1', polizaId: 'p1', siniestroId: null },
    { estado: 'aplicado', clienteId: 'c1', polizaId: 'p2', siniestroId: null },
  ])
  assert.ok(d.asignado)
  if (!d.asignado) return
  assert.equal(d.clienteId, 'c1')
  assert.equal(d.polizaId, null)
})

test('🪤 elegirDestinoDocumento: dos clientes, parte sin resolver, nada resuelto o sin eventos → SIN asignar (nunca se adivina)', () => {
  assert.equal(elegirDestinoDocumento([
    { estado: 'aplicado', clienteId: 'c1', polizaId: 'p1', siniestroId: null },
    { estado: 'aplicado', clienteId: 'c2', polizaId: 'p2', siniestroId: null },
  ]).asignado, false)
  assert.equal(elegirDestinoDocumento([
    { estado: 'aplicado', clienteId: 'c1', polizaId: 'p1', siniestroId: null },
    { estado: 'sin_resolver', clienteId: null, polizaId: null, siniestroId: null },
  ]).asignado, false)
  assert.equal(elegirDestinoDocumento([{ estado: 'sin_resolver', clienteId: null, polizaId: null, siniestroId: null }]).asignado, false)
  assert.equal(elegirDestinoDocumento([{ estado: 'procesando', clienteId: 'c1', polizaId: 'p1', siniestroId: null }]).asignado, false)
  assert.equal(elegirDestinoDocumento([]).asignado, false)
})

const SRC_BD = readFileSync(join(import.meta.dirname, 'correo-documento-bd.ts'), 'utf8')
const SQL = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '2026-10-21_correo_agente_f1.sql'), 'utf8')

test('🪤 el documento NUNCA se asocia por nombre del tomador: el destino sale de lo resuelto para ese Message-ID', () => {
  // Ni la tabla de clientes ni sus nombres aparecen en la decisión del destino.
  const guardar = SRC_BD.slice(SRC_BD.indexOf('export async function guardarDocumentoCorreo'), SRC_BD.indexOf('export type DocumentoSinAsignar'))
  assert.doesNotMatch(guardar, /\b(nombre|apellidos)\b\s*(ilike|=|like)/i)
  assert.doesNotMatch(guardar, /from clientes/i)
  assert.match(guardar, /elegirDestinoDocumento\(eventos\)/)
  assert.match(SRC_BD, /where correduria_id = \$\{correduriaId\}::uuid and mensaje_id = \$\{mensajeId\}/)
  // La misma guarda que una subida a mano: el destino es de ESTA correduría.
  assert.match(guardar, /resolverDestino\(correduriaId, elegido\)/)
})

test('🪤 mismo PDF dos veces → 1 fila: índice único sha256 + póliza en el SQL y ON CONFLICT con esa misma expresión', () => {
  assert.match(SQL, /CREATE UNIQUE INDEX IF NOT EXISTS documentos_correo_unico\s+ON seguros\.documentos \(correduria_id, sha256, coalesce\(poliza_id, '00000000-0000-0000-0000-000000000000'::uuid\)\)\s+WHERE subido_por = 'correo' AND sha256 IS NOT NULL/)
  assert.match(SRC_BD, /on conflict \(correduria_id, sha256, coalesce\(poliza_id, '00000000-0000-0000-0000-000000000000'::uuid\)\)\s+where subido_por = 'correo' and sha256 is not null\s+do nothing/)
  // Antes de insertar: si ya está ese fichero (con ese destino, o en cualquier sitio si no hay destino) → repetido.
  assert.match(SRC_BD, /estado: 'repetido'/)
})

test('el SQL deja un documento de correo sin colgar de nada SOLO con subido_por=correo y su Message-ID', () => {
  assert.match(SQL, /OR \(subido_por = 'correo' AND mensaje_id IS NOT NULL\)/)
  assert.match(SQL, /CHECK \(subido_por IN \('corredor', 'cliente', 'agente', 'correo'\)\)/)
})

test('asignar a mano: solo sin resolver; una solicitud exige oportunidad ABIERTA del MISMO cliente', () => {
  const v = validarAsignacionEvento({ id: UUID1, clienteId: UUID2 })
  assert.ok(v.ok)
  assert.equal(validarAsignacionEvento({ id: 'x', clienteId: UUID2 }).ok, false)
  assert.equal(validarAsignacionEvento({ id: UUID1 }).ok, false)
  assert.deepEqual(decidirAsignacion(null, { oportunidadId: null }, null, 'c1'), { ok: false, status: 404, motivo: 'ese aviso no existe en esta correduría' })
  assert.equal(decidirAsignacion({ tipo: 'emision', estado: 'aplicado' }, { oportunidadId: null }, null, 'c1').ok, false)
  assert.deepEqual(decidirAsignacion({ tipo: 'emision', estado: 'sin_resolver' }, { oportunidadId: null }, null, 'c1'), { ok: true, via: 'ficha' })
  assert.equal(decidirAsignacion({ tipo: 'solicitud', estado: 'sin_resolver' }, { oportunidadId: null }, null, 'c1').ok, false)
  assert.equal(decidirAsignacion({ tipo: 'solicitud', estado: 'sin_resolver' }, { oportunidadId: 'o1' }, { clienteId: 'otro', abierta: true }, 'c1').ok, false)
  assert.equal(decidirAsignacion({ tipo: 'solicitud', estado: 'sin_resolver' }, { oportunidadId: 'o1' }, { clienteId: 'c1', abierta: false }, 'c1').ok, false)
  assert.deepEqual(decidirAsignacion({ tipo: 'solicitud', estado: 'sin_resolver' }, { oportunidadId: 'o1' }, { clienteId: 'c1', abierta: true }, 'c1'), { ok: true, via: 'solicitud' })
})

test('las notas de la ficha no llevan NIF ni IBAN (el nombre del fichero o el resumen pueden traerlos)', () => {
  const n = notaDocumentoCorreo('Allianz', 'Poliza 12345678Z ES9121000418450200051332.pdf', false)
  assert.doesNotMatch(n, /12345678Z|ES91/)
  const a = notaAsignacionEvento({ tipo: 'emision', compania: 'Allianz', clave: '999', numeroPoliza: '999', resumen: 'tomador 12345678Z' }, 'alberto')
  assert.doesNotMatch(a, /12345678Z/)
})
