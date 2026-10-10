import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guardián de la REFERENCIA propia del presupuesto (AS-26-0042, 30/09/2026, dictado de Alberto).
//
// Dos cosas que ni `tsc` ni el build cazan, porque son de CONTENIDO:
//   1. El PDF va al cliente y NO puede llevar el nº de proyecto de Avant2/Codeoscopic ni la
//      referencia de la oferta del vendor: el cliente cita NUESTRA referencia y con ella se rescata
//      el documento en el buscador. Un id del vendor en el PDF es un número que cambia al
//      re-tarificar y que nadie de la correduría puede buscar.
//   2. El conjunto de opciones que VA EN EL DOCUMENTO se persiste (`oculta_at` en cada opción
//      congelada, con su `precio_id`). Sin eso la BD no sabe qué se envió, el PDF enseñaría lo que el
//      corredor quitó y la reutilización («mismo conjunto → misma referencia») no tiene qué comparar.
// Se lee el FUENTE (sin importar módulos con Prisma: este job corre sin `prisma generate`).

const RAIZ = join(import.meta.dirname, '..')
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8')
/** Sin comentarios: lo que cuenta es el código, no lo que se explica. */
const codigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const PDF = 'apps/asegura/lib/presupuesto-pdf.ts'
const PDF_DATOS = 'apps/asegura/lib/presupuesto-pdf-datos.ts'
const PREPARAR = 'apps/asegura/lib/presupuesto.ts'
const REFERENCIA = 'apps/asegura/lib/presupuesto-referencia.ts'

// Los nombres con que el repo guarda los ids del vendor.
const IDS_VENDOR = /project_?id|projectId|referenciaVendor|referencia_vendor|idPrecio|id_precio|accepted_offer|codeoscopic/i

test('el PDF ni lee ni pinta ningún id de Avant2/Codeoscopic', () => {
  assert.doesNotMatch(codigo(leer(PDF)), IDS_VENDOR, `${PDF} nombra un id del vendor`)
  assert.doesNotMatch(codigo(leer(PDF_DATOS)), IDS_VENDOR, `${PDF_DATOS} lee un id del vendor`)
})

test('el PDF lleva NUESTRA referencia en la cabecera y la frase para que el cliente la cite', () => {
  const pdf = codigo(leer(PDF))
  assert.match(pdf, /referencia: string \| null/, 'DatosPdfPresupuesto trae la referencia')
  assert.match(pdf, /`Referencia \$\{referencia\}`/, 'la cabecera dice «Referencia AS-…»')
  assert.match(pdf, /cita la referencia/, 'la frase que le pide citarla')
  assert.match(pdf, /linea\(ref\.cabecera/, 'la referencia se PINTA en la cabecera')
  assert.match(pdf, /parrafo\(ref\.cita/, 'la frase se PINTA')
  assert.match(codigo(leer(PDF_DATOS)), /referencia: p\.referencia/, 'los datos del PDF leen la referencia propia')
})

test('el PDF solo enseña lo que va en el documento (oculta_at IS NULL)', () => {
  assert.match(codigo(leer(PDF_DATOS)), /opciones: \{ where: \{ ocultaAt: null \}/)
})

test('al preparar se PERSISTE qué opción va en el documento y de qué precio sale', () => {
  const src = codigo(leer(PREPARAR))
  const crear = src.slice(src.indexOf('tx.presupuesto.create('), src.indexOf("return { tipo: 'creado' as const, creado }"))
  assert.ok(crear.length > 100, 'no se encuentra el create del presupuesto dentro del cerrojo')
  assert.match(crear, /ocultaAt: o\.oculta \? creadoAt : null/, 'cada opción congelada guarda si está fuera del documento')
  assert.match(crear, /precioId: o\.precioId/, 'cada opción guarda su precio_id (sin él no se compara el conjunto)')
})

test('preparar lo mismo REUTILIZA (misma referencia) en vez de crear otro, bajo cerrojo', () => {
  const src = codigo(leer(PREPARAR))
  assert.match(src, /elegirReutilizable\(/, 'la decisión es la regla pura de module-seguros')
  assert.match(src, /pg_advisory_xact_lock/, 'lookup + insert bajo cerrojo por tarificación')
  const tx = src.slice(src.indexOf('db.$transaction(async (tx)'), src.indexOf('tx.presupuesto.create('))
  assert.match(tx, /buscarReutilizable\(tx,/, 'dentro del cerrojo se vuelve a mirar antes de insertar')
})

test('buscar por referencia: solo esta correduría y solo lo que iba en el documento', () => {
  const src = codigo(leer(REFERENCIA))
  const buscar = src.slice(src.indexOf('export async function buscarPresupuestoPorReferencia'), src.indexOf('export type ResultadoDescarga'))
  assert.match(buscar, /where: \{ correduriaId, referencia \}/)
  assert.match(buscar, /where: \{ ocultaAt: null \}/)
  assert.doesNotMatch(buscar, IDS_VENDOR)
})
