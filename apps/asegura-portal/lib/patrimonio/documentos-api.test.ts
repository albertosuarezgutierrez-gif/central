import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { NivelPatrimonio } from '@central/module-patrimonio'

import {
  MAX_BYTES_DOCUMENTO,
  MAX_DOCUMENTOS_DIA,
  MAX_DOCUMENTOS_LISTA,
  nombreConExtension,
  nombreSeguro,
  responderBorrarDocumento,
  responderDescargaDocumento,
  responderListaDocumentos,
  responderSubidaDocumento,
  type DocumentoMeta,
  type FicheroDocumento,
  type OwnerRef,
  type PuertosDocumentos,
} from './documentos-api.ts'

const MIO = '11111111-1111-1111-1111-111111111111'
const AJENO = '33333333-3333-3333-3333-333333333333'
const INM = '44444444-4444-4444-4444-444444444444'
const INM_AJENO = '55555555-5555-5555-5555-555555555555'
const DOC = '66666666-6666-6666-6666-666666666666'
const DOC_AJENO = '77777777-7777-7777-7777-777777777777'
const PDF = Buffer.from('%PDF-1.7\nx')
const fich = (e: Partial<FicheroDocumento> = {}): FicheroDocumento => ({ nombre: 'a.pdf', mime: 'application/pdf', tamano: 100, contenido: PDF, ...e })

function puertos(niveles: [string, NivelPatrimonio][], o: { ocupadas?: number } = {}) {
  const log = { guardar: [] as unknown[], borrar: [] as unknown[], leer: [] as unknown[] }
  let ocupadas = o.ocupadas ?? 0
  const borrados = new Set<string>()
  const meta = (id: string, carpeta: string): DocumentoMeta => ({ id, carpeta, nombre: 'a.pdf', mime: 'application/pdf', tamano: 10, creadoEn: '2026-10-22T10:00:00Z' })
  const p: PuertosDocumentos = {
    accesos: async () => new Map(niveles),
    ownerDelTitular: async (c, ow: OwnerRef) => c === MIO && ow.id === INM,
    guardar: async (x) => {
      log.guardar.push(x)
      if (ocupadas >= MAX_DOCUMENTOS_DIA) return { ok: false, motivo: 'tope' }
      ocupadas++
      return { ok: true, id: DOC }
    },
    listar: async () => Array.from({ length: MAX_DOCUMENTOS_LISTA + 1 }, (_, i) => meta(`id${i}`, 'facturas')),
    leer: async (x) => {
      log.leer.push(x)
      if (x.clienteId !== MIO || x.documentoId !== DOC || borrados.has(DOC)) return null
      return { meta: meta(DOC, 'facturas'), owner: { tipo: 'inmueble', id: INM }, contenido: PDF }
    },
    borrar: async (x) => { log.borrar.push(x); borrados.add(x.documentoId); return 'ok' },
  }
  return { p, log, borrados }
}
const subir = (p: PuertosDocumentos, e: { titular?: unknown; ownerId?: unknown; carpeta?: unknown; fichero?: FicheroDocumento | null } = {}) =>
  responderSubidaDocumento(p, { titular: e.titular ?? MIO, ownerTipo: 'inmueble', ownerId: e.ownerId ?? INM, carpeta: e.carpeta ?? 'facturas', fichero: e.fichero === undefined ? fich() : e.fichero })

test('Gestión sube: 201, con sha256 y MIME real', async () => {
  const { p, log } = puertos([[MIO, 'gestion']])
  const r = await subir(p)
  assert.equal(r.status, 201)
  const g = log.guardar[0] as { sha256: string; mime: string; clienteId: string }
  assert.equal(g.mime, 'application/pdf')
  assert.match(g.sha256, /^[0-9a-f]{64}$/)
  assert.equal(g.clienteId, MIO)
})

test('titular ajeno, inmueble ajeno o inexistente, owner mal formado: la MISMA 404 y nada se escribe', async () => {
  const { p, log } = puertos([[MIO, 'total']])
  const a = await subir(p, { titular: AJENO })
  const b = await subir(p, { ownerId: INM_AJENO })
  const c = await subir(p, { ownerId: 'no-uuid' })
  const d = await responderSubidaDocumento(p, { titular: MIO, ownerTipo: 'hack', ownerId: INM, carpeta: 'facturas', fichero: fich() })
  for (const r of [a, b, c, d]) assert.deepEqual(r, { status: 404, body: { error: 'no_encontrado' } })
  assert.equal(log.guardar.length, 0)
})

test('carpeta que no es del owner: 400; sin fichero: 400', async () => {
  const { p } = puertos([[MIO, 'gestion']])
  assert.equal((await subir(p, { carpeta: 'recibos' })).status, 400)
  assert.equal((await subir(p, { fichero: null })).status, 400)
})

test('tipo por BYTES: un .pdf que es otra cosa → 415; mayor de 10 MB → 413 sin guardar', async () => {
  const { p, log } = puertos([[MIO, 'gestion']])
  assert.equal((await subir(p, { fichero: fich({ contenido: Buffer.from('MZ\x90exe') }) })).status, 415)
  assert.equal((await subir(p, { fichero: fich({ tamano: MAX_BYTES_DOCUMENTO + 1 }) })).status, 413)
  assert.equal(log.guardar.length, 0)
})

test('tope diario por identidad: 429 y el siguiente no pasa', async () => {
  const { p } = puertos([[MIO, 'gestion']], { ocupadas: MAX_DOCUMENTOS_DIA })
  assert.equal((await subir(p)).status, 429)
})

test('lista: ~50 + hayMas; titular/inmueble ajeno → 404', async () => {
  const { p } = puertos([[MIO, 'gestion']])
  const r = await responderListaDocumentos(p, { titular: MIO, ownerTipo: 'inmueble', ownerId: INM })
  assert.equal(r.status, 200)
  assert.equal((r.body.documentos as unknown[]).length, MAX_DOCUMENTOS_LISTA)
  assert.equal(r.body.hayMas, true)
  assert.equal((await responderListaDocumentos(p, { titular: MIO, ownerTipo: 'inmueble', ownerId: INM_AJENO })).status, 404)
  assert.equal((await responderListaDocumentos(p, { titular: AJENO, ownerTipo: 'inmueble', ownerId: INM })).status, 404)
})

test('descarga: documento propio 200 con MIME de la lista; ajeno, inexistente o titular ajeno → 404', async () => {
  const { p } = puertos([[MIO, 'gestion']])
  const ok = await responderDescargaDocumento(p, { titular: MIO, documento: DOC })
  assert.equal(ok.status, 200)
  assert.ok('fichero' in ok && ok.fichero.mime === 'application/pdf')
  for (const c of [{ titular: MIO, documento: DOC_AJENO }, { titular: AJENO, documento: DOC }, { titular: MIO, documento: 'x' }]) {
    assert.deepEqual(await responderDescargaDocumento(p, c), { status: 404, body: { error: 'no_encontrado' } })
  }
})

test('borrado lógico: ajeno → 404 sin tocar; propio sella; después ya no se lee ni se descarga', async () => {
  const { p, log } = puertos([[MIO, 'total']])
  assert.equal((await responderBorrarDocumento(p, { titular: MIO, documento: DOC_AJENO })).status, 404)
  assert.equal(log.borrar.length, 0)
  assert.equal((await responderBorrarDocumento(p, { titular: MIO, documento: DOC })).status, 200)
  assert.equal(log.borrar.length, 1)
  assert.equal((await responderDescargaDocumento(p, { titular: MIO, documento: DOC })).status, 404)
  assert.equal((await responderBorrarDocumento(p, { titular: MIO, documento: DOC })).status, 404)
})

test('sin nivel en el titular (no está en accesos): 404 aunque el documento exista', async () => {
  const { p, log } = puertos([])
  assert.equal((await responderBorrarDocumento(p, { titular: MIO, documento: DOC })).status, 404)
  assert.equal((await responderDescargaDocumento(p, { titular: MIO, documento: DOC })).status, 404)
  assert.equal(log.leer.length, 0)
})

test('nombreSeguro: sin ruta ni caracteres de control; largo acotado', () => {
  assert.equal(nombreSeguro('..\\..\\etc/pasa wd.pdf'), 'pasa wd.pdf')
  assert.equal(nombreSeguro('a\u0000b"c.pdf'), 'abc.pdf')
  assert.ok(nombreSeguro('x'.repeat(500)).length <= 120)
})

test('nombreSeguro: sin CR/LF (cabecera), sin marcas bidi ni sustitutos sueltos; corta por punto de código', () => {
  assert.equal(nombreSeguro('a\r\nSet-Cookie: x.pdf'), 'aSet-Cookie x.pdf')
  assert.equal(nombreSeguro('factura\u202Efdp.exe'), 'facturafdp.exe')
  assert.equal(nombreSeguro('x\u2028y\u0085z.pdf'), 'xyz.pdf')
  assert.equal(nombreSeguro('roto\ud83d.pdf'), 'roto.pdf')
  const largo = nombreSeguro('😀'.repeat(130))
  assert.equal(Array.from(largo).length, 120)
  assert.ok(!/\p{Cs}/u.test(largo), 'no parte un emoji por la mitad')
})

test('nombreConExtension: la extensión la impone el tipo REAL, no el nombre subido', () => {
  assert.equal(nombreConExtension('escritura.pdf', 'application/pdf'), 'escritura.pdf')
  assert.equal(nombreConExtension('Escritura.PDF', 'application/pdf'), 'Escritura.PDF')
  assert.equal(nombreConExtension('trampa.html', 'application/pdf'), 'trampa.html.pdf')
  assert.equal(nombreConExtension('foto.jpeg', 'image/jpeg'), 'foto.jpeg')
  assert.equal(nombreConExtension('foto.png', 'image/webp'), 'foto.png.webp')
  assert.equal(nombreConExtension('', 'image/png'), 'documento.png')
})

test('borrar no lee los bytes del fichero (solo la descarga los lee)', async () => {
  const { p, log } = puertos([[MIO, 'gestion']])
  await responderBorrarDocumento(p, { titular: MIO, documento: DOC })
  assert.equal((log.leer[0] as { conContenido?: boolean }).conContenido, false)
})
