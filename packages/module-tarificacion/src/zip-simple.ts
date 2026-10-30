// ZIP mínimo SIN comprimir (método «store»), varias entradas, UTF-8 y fecha fija (1980-01-01: mismo contenido → mismos
// bytes). Para descargar la extensión del grabador como .zip sin dependencias ni `node:*` (vale en Node y en Edge). PURA.

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 (polinomio 0xedb88320) que el formato ZIP exige por entrada. */
export function crc32Zip(b: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < b.length; i++) crc = (crc >>> 8) ^ TABLA_CRC[(crc ^ b[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

export function zipSinComprimir(entradas: { nombre: string; contenido: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const locales: Uint8Array[] = []
  const centrales: Uint8Array[] = []
  let desplazamiento = 0
  for (const e of entradas) {
    if (!e.nombre || e.nombre.startsWith('/') || e.nombre.split('/').includes('..')) throw new Error(`nombre de entrada no válido: ${e.nombre}`)
    const nombre = enc.encode(e.nombre)
    const datos = typeof e.contenido === 'string' ? enc.encode(e.contenido) : e.contenido
    const crc = crc32Zip(datos)
    const local = new Uint8Array(30 + nombre.length + datos.length)
    const vl = new DataView(local.buffer)
    vl.setUint32(0, 0x04034b50, true)
    vl.setUint16(4, 20, true) // versión necesaria
    vl.setUint16(6, 0x0800, true) // bit 11: nombre en UTF-8
    vl.setUint16(8, 0, true) // método: store
    vl.setUint16(10, 0, true) // hora 00:00
    vl.setUint16(12, 0x21, true) // fecha 1980-01-01
    vl.setUint32(14, crc, true)
    vl.setUint32(18, datos.length, true)
    vl.setUint32(22, datos.length, true)
    vl.setUint16(26, nombre.length, true)
    vl.setUint16(28, 0, true)
    local.set(nombre, 30)
    local.set(datos, 30 + nombre.length)
    const central = new Uint8Array(46 + nombre.length)
    const vc = new DataView(central.buffer)
    vc.setUint32(0, 0x02014b50, true)
    vc.setUint16(4, 20, true)
    vc.setUint16(6, 20, true)
    vc.setUint16(8, 0x0800, true)
    vc.setUint16(10, 0, true)
    vc.setUint16(12, 0, true)
    vc.setUint16(14, 0x21, true)
    vc.setUint32(16, crc, true)
    vc.setUint32(20, datos.length, true)
    vc.setUint32(24, datos.length, true)
    vc.setUint16(28, nombre.length, true)
    vc.setUint32(42, desplazamiento, true)
    central.set(nombre, 46)
    locales.push(local)
    centrales.push(central)
    desplazamiento += local.length
  }
  const tamCentral = centrales.reduce((n, c) => n + c.length, 0)
  const fin = new Uint8Array(22)
  const vf = new DataView(fin.buffer)
  vf.setUint32(0, 0x06054b50, true)
  vf.setUint16(8, entradas.length, true)
  vf.setUint16(10, entradas.length, true)
  vf.setUint32(12, tamCentral, true)
  vf.setUint32(16, desplazamiento, true)
  const out = new Uint8Array(desplazamiento + tamCentral + 22)
  let o = 0
  for (const p of [...locales, ...centrales, fin]) {
    out.set(p, o)
    o += p.length
  }
  return out
}
