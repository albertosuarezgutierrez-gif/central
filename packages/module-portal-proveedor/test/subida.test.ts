// Validación de subidas. Cepos vistos FALLAR (05/11/2026) y restaurados:
// (1) en validarSubida no comprobar el tamaño → rojo «demasiado grande».
// (2) en tipoReal aceptar por la extensión del nombre → rojo «un .exe renombrado a .pdf».
// (3) quitar `xmlPeligroso` → rojo «XML con DOCTYPE».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanearNombre, tipoReal, validarSubida } from '../src/index.ts'

const bytes = (s: string) => new TextEncoder().encode(s)
const PDF = bytes('%PDF-1.7\n1 0 obj\n')
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const XML = bytes('<?xml version="1.0"?><Invoice><ID>1</ID></Invoice>')

test('tipos por sus bytes: pdf, png, jpg, xml', () => {
  assert.equal(tipoReal(PDF), 'pdf')
  assert.equal(tipoReal(PNG), 'png')
  assert.equal(tipoReal(JPG), 'jpg')
  assert.equal(tipoReal(XML), 'xml')
  assert.equal(tipoReal(bytes('\uFEFF  <Facturae xmlns="x"></Facturae>')), 'xml')
})
test('un .exe renombrado a .pdf', () => {
  const r = validarSubida({ nombre: 'factura.pdf', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0]) })
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.motivo, 'tipo_no_permitido')
  assert.equal(validarSubida({ nombre: 'x.pdf', bytes: bytes('hola, soy texto plano') }).ok, false)
})
test('demasiado grande (máximo configurable)', () => {
  const r = validarSubida({ nombre: 'a.pdf', bytes: new Uint8Array([...PDF, ...new Uint8Array(2000)]) }, { tipos: ['pdf'], maxBytes: 1000 })
  assert.equal(!r.ok && r.motivo, 'demasiado_grande')
  assert.equal(validarSubida({ nombre: 'a.pdf', bytes: PDF }, { tipos: ['pdf'], maxBytes: 1000 }).ok, true)
})
test('vacío y tipo fuera de la política del cliente', () => {
  assert.equal(validarSubida({ nombre: 'a', bytes: new Uint8Array() }).ok, false)
  const r = validarSubida({ nombre: 'a.png', bytes: PNG }, { tipos: ['pdf', 'xml'], maxBytes: 1e6 })
  assert.equal(!r.ok && r.motivo, 'tipo_no_permitido')
})
test('XML con DOCTYPE', () => {
  const r = validarSubida({ nombre: 'f.xml', bytes: bytes('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>') })
  assert.equal(!r.ok && r.motivo, 'xml_peligroso')
})
test('nombre saneado: sin rutas ni caracteres raros y con la extensión del tipo REAL', () => {
  assert.equal(sanearNombre('../../etc/passwd', 'pdf'), 'passwd.pdf')
  assert.equal(sanearNombre('C:\\docs\\Albarán Nº 12 (copia).PNG', 'pdf'), 'albaran-no-12-copia.pdf')
  assert.equal(sanearNombre('', 'xml'), 'documento.xml')
  assert.equal(sanearNombre('<script>.pdf', 'jpg'), 'script.jpg')
  const r = validarSubida({ nombre: 'evil.php.pdf', bytes: PNG })
  assert.ok(r.ok && r.nombre === 'evil.php.png')
})
