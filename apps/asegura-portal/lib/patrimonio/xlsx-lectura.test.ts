import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'

import { MAX_XML_BYTES, leerXlsx } from './xlsx-lectura.ts'

/** ZIP mínimo (sin CRC real: el lector no lo usa) con entradas deflate o stored. `declarado` miente el tamaño si se pide. */
export function zip(entradas: { nombre: string; texto?: string; bytes?: Buffer; stored?: boolean; declarado?: number; cifrada?: boolean }[]): Buffer {
  const locales: Buffer[] = []
  const centrales: Buffer[] = []
  let offset = 0
  for (const e of entradas) {
    const crudo = e.bytes ?? Buffer.from(e.texto ?? '', 'utf8')
    const datos = e.stored ? crudo : deflateRawSync(crudo)
    const nombre = Buffer.from(e.nombre, 'utf8')
    const l = Buffer.alloc(30)
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(e.cifrada ? 1 : 0, 6); l.writeUInt16LE(e.stored ? 0 : 8, 8)
    l.writeUInt32LE(datos.length, 18); l.writeUInt32LE(e.declarado ?? crudo.length, 22); l.writeUInt16LE(nombre.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(e.cifrada ? 1 : 0, 8); c.writeUInt16LE(e.stored ? 0 : 8, 10)
    c.writeUInt32LE(datos.length, 20); c.writeUInt32LE(e.declarado ?? crudo.length, 24); c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(offset, 42)
    locales.push(l, nombre, datos)
    centrales.push(c, nombre)
    offset += 30 + nombre.length + datos.length
  }
  const dir = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10)
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(offset, 16)
  return Buffer.concat([...locales, dir, fin])
}

const WB = '<workbook><sheets><sheet name="Pisos" sheetId="1" r:id="rId1"/></sheets></workbook>'
const RELS = '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'
const STYLES = '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00 &quot;€&quot;"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>'
const SST = '<sst><si><t>Piso</t></si><si><t>Inquilino</t></si><si><r><t>Ana </t></r><r><t>P&amp;érez</t></r><rPh><t>ペ</t></rPh></si><si><t>Renta</t></si><si><t>Inicio</t></si></sst>'

function libro(hoja: string, extra: { nombre: string; texto: string }[] = []) {
  return zip([
    { nombre: 'xl/workbook.xml', texto: WB },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: RELS },
    { nombre: 'xl/sharedStrings.xml', texto: SST },
    { nombre: 'xl/styles.xml', texto: STYLES },
    { nombre: 'xl/worksheets/sheet1.xml', texto: hoja },
    ...extra,
  ])
}

const HOJA = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c><c r="D1" t="s"><v>4</v></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>1º A</t></is></c><c r="B2" t="s"><v>2</v></c><c r="C2" s="2"><v>750.5</v></c><c r="D2" s="1"><v>45536</v></c></row>
<row r="4"><c r="A4" t="str"><f>A2&amp;"B"</f><v>1º B</v></c><c r="C4"><f>C2*2</f></c><c r="E4" t="b"><v>1</v></c></row>
</sheetData></worksheet>`

test('xlsx: cadenas compartidas, texto en línea, número, fecha por estilo, fila vacía en su sitio y fórmulas SIN calcular', () => {
  const r = leerXlsx(libro(HOJA))
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.filas[0], ['Piso', 'Inquilino', 'Renta', 'Inicio'])
  assert.deepEqual(r.filas[1], ['1º A', 'Ana P&érez', 750.5, '2024-09-01'])
  assert.deepEqual(r.filas[2], [], 'la fila 3 (vacía) conserva su número')
  // Fórmula con valor guardado: el valor; sin él: vacío (no se evalúa nada).
  assert.deepEqual(r.filas[3], ['1º B', null, null, null, 'sí'])
})

test('🚨 xlsx: DOCTYPE/ENTITY fuera (sin entidades externas ni «billion laughs»)', () => {
  const malo = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet><sheetData><row r="1"><c t="inlineStr"><is><t>&a;</t></is></c></row></sheetData></worksheet>'
  assert.deepEqual(leerXlsx(libro(malo)), { ok: false, motivo: 'ilegible' })
})

test('🚨 xlsx: bomba zip — el inflado se corta en el tope aunque la cabecera mienta el tamaño', () => {
  const enorme = Buffer.alloc(MAX_XML_BYTES + 1024, 0x20)
  const b = zip([
    { nombre: 'xl/workbook.xml', texto: WB },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: RELS },
    { nombre: 'xl/worksheets/sheet1.xml', bytes: enorme, declarado: 100 },
  ])
  assert.ok(b.length < 200_000, 'comprimido es pequeño')
  assert.deepEqual(leerXlsx(b), { ok: false, motivo: 'demasiado_grande' })
})

test('xlsx: más filas con datos que el tope → demasiadas_filas', () => {
  const filas = Array.from({ length: 600 }, (_, i) => `<row r="${i + 1}"><c t="inlineStr"><is><t>x${i}</t></is></c></row>`).join('')
  assert.deepEqual(leerXlsx(libro(`<worksheet><sheetData>${filas}</sheetData></worksheet>`)), { ok: false, motivo: 'demasiadas_filas' })
})

test('xlsx: cifrado, hoja fuera de xl/worksheets, vínculo externo, basura y zip sin libro → ilegible', () => {
  const cifrado = zip([{ nombre: 'xl/workbook.xml', texto: WB, cifrada: true }, { nombre: 'xl/_rels/workbook.xml.rels', texto: RELS }])
  assert.deepEqual(leerXlsx(cifrado), { ok: false, motivo: 'ilegible' })
  const fuera = zip([
    { nombre: 'xl/workbook.xml', texto: WB },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: RELS.replace('worksheets/sheet1.xml', '../../etc/passwd') },
  ])
  assert.deepEqual(leerXlsx(fuera), { ok: false, motivo: 'ilegible' })
  const externo = zip([
    { nombre: 'xl/workbook.xml', texto: WB },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: RELS.replace('/>', ' TargetMode="External"/>') },
  ])
  assert.deepEqual(leerXlsx(externo), { ok: false, motivo: 'ilegible' })
  assert.deepEqual(leerXlsx(Buffer.from('PK\x03\x04 basura')), { ok: false, motivo: 'ilegible' })
  assert.deepEqual(leerXlsx(zip([{ nombre: 'word/document.xml', texto: '<w/>' }])), { ok: false, motivo: 'ilegible' })
})

test('xlsx: una macro (vbaProject.bin) ni se abre: la hoja se lee igual', () => {
  const r = leerXlsx(libro(HOJA, [{ nombre: 'xl/vbaProject.bin', texto: '<!DOCTYPE macro>' }]))
  assert.equal(r.ok, true)
})
