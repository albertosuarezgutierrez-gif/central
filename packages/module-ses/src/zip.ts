// La `<solicitud>` de SES viaja como XML comprimido en **ZIP** y codificado en base64.
//
// 🚨 ZIP, no gzip. Es la corrección más cara de este módulo: una primera versión usó `gzipSync`
// y TODAS sus peticiones habrían salido rechazadas con el código `10111`, que además se lee como
// un problema de formato genérico y manda a mirar al sitio equivocado. La guía v3.1.2 lo dice
// literal — «Este fichero XML deberá ser comprimido según el algoritmo ZIP y codificado en
// Base64»— y el propio error lo repite: «Ha de ir comprimido (zip) y codificado en Base64».
//
// Node no trae escritor de ZIP (solo deflate/gzip), así que se construye a mano el contenedor
// mínimo: una entrada, método deflate. Verificado de dos formas: abriendo la salida con `unzip`
// real, y contra el servicio de SES, que lo aceptó sin 10111 (20/08/2026).
import { deflateRawSync } from 'node:zlib'

/** CRC-32 (polinomio 0xedb88320), que el formato ZIP exige en la cabecera de cada entrada. */
export function crc32(buf: Uint8Array): number {
  let c: number
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * ZIP de UNA entrada, método deflate, sin BOM.
 *
 * La fecha va fija a 1980-01-01 a propósito: sin reloj, la salida es **reproducible** para el
 * mismo contenido. Eso importa aquí más de lo normal, porque SES rechaza como «lote duplicado»
 * un XML idéntico a uno anterior — con una fecha variable, dos envíos del mismo parte darían
 * bytes distintos y esa red de seguridad del Ministerio dejaría de saltar.
 *
 * ⚠️ SUPUESTO SIN CONFIRMAR: la guía no documenta el nombre de la entrada ni el método de
 * compresión. Se toma la combinación más conservadora (`solicitud.xml`, deflate, UTF-8 sin BOM)
 * y SES la acepta. Si algún día empieza a rechazarla, mover en este orden: deflate→store,
 * nombre de la entrada, BOM.
 */
export function zipUnaEntrada(nombre: string, contenido: string): Buffer {
  const datos = Buffer.from(contenido, 'utf8')
  const comprimido = deflateRawSync(datos)
  const nom = Buffer.from(nombre, 'ascii')
  const crc = crc32(datos)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)   // firma de cabecera local
  local.writeUInt16LE(20, 4)           // versión necesaria para extraer
  local.writeUInt16LE(0, 6)            // flags
  local.writeUInt16LE(8, 8)            // método: deflate
  local.writeUInt16LE(0, 10)           // hora (fija)
  local.writeUInt16LE(33, 12)          // fecha (1980-01-01, fija)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(comprimido.length, 18)
  local.writeUInt32LE(datos.length, 22)
  local.writeUInt16LE(nom.length, 26)
  local.writeUInt16LE(0, 28)           // sin campo extra

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0) // firma del directorio central
  central.writeUInt16LE(20, 4)         // versión que lo creó
  central.writeUInt16LE(20, 6)         // versión necesaria
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(33, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(comprimido.length, 20)
  central.writeUInt32LE(datos.length, 24)
  central.writeUInt16LE(nom.length, 28)
  central.writeUInt16LE(0, 30)         // extra
  central.writeUInt16LE(0, 32)         // comentario
  central.writeUInt16LE(0, 34)         // disco
  central.writeUInt16LE(0, 36)         // atributos internos
  central.writeUInt32LE(0, 38)         // atributos externos
  central.writeUInt32LE(0, 42)         // desplazamiento de la cabecera local

  const finCentral = Buffer.alloc(22)
  const tamCentral = central.length + nom.length
  const despCentral = local.length + nom.length + comprimido.length
  finCentral.writeUInt32LE(0x06054b50, 0)
  finCentral.writeUInt16LE(0, 4)
  finCentral.writeUInt16LE(0, 6)
  finCentral.writeUInt16LE(1, 8)       // entradas en este disco
  finCentral.writeUInt16LE(1, 10)      // entradas totales
  finCentral.writeUInt32LE(tamCentral, 12)
  finCentral.writeUInt32LE(despCentral, 16)
  finCentral.writeUInt16LE(0, 20)      // sin comentario

  return Buffer.concat([local, nom, comprimido, central, nom, finCentral])
}

/** La `<solicitud>` tal y como la espera el sobre: ZIP de una entrada, en base64. */
export function solicitudEnBase64(xml: string): string {
  return zipUnaEntrada('solicitud.xml', xml).toString('base64')
}
