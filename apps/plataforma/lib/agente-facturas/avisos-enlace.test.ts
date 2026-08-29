import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'

// 🚨 GUARDIÁN (29/08/2026). El aviso de Telegram de la bandeja enlazaba a `/expenses/pendientes`
// desde el día uno y esa página NUNCA se construyó: un 404 que nadie vio, porque el enlace vive en
// una plantilla de texto y ni `tsc` ni el build comprueban que una ruta exista. Consecuencia: 32
// facturas y 35.938,20 € atascados, y todas con «Proveedor nuevo, sin regla aprendida» porque la
// regla solo nace al confirmar y no había dónde confirmar.
//
// Este test ata las tres piezas: el enlace del aviso, la página y el endpoint. Si alguien mueve
// una, salta.
const RUTA = '/expenses/pendientes'

test('el enlace del aviso de Telegram apunta a una página que EXISTE', () => {
  const avisos = readFileSync(new URL('./avisos.ts', import.meta.url), 'utf8')
  assert.ok(avisos.includes(RUTA), `avisos.ts debe enlazar ${RUTA}`)

  const pagina = new URL(`../../app/(usuario)${RUTA}/page.tsx`, import.meta.url)
  assert.ok(existsSync(pagina), `falta la página app/(usuario)${RUTA}/page.tsx`)
})

test('los endpoints que consume la página existen', () => {
  for (const f of [`../../app/api${RUTA}/route.ts`, `../../app/api${RUTA}/[id]/route.ts`]) {
    assert.ok(existsSync(new URL(f, import.meta.url)), `falta ${f}`)
  }
})

test('la bandeja tiene entrada en el panel, no solo el enlace del Telegram', () => {
  // El aviso cuenta las de ESA pasada, no la bandeja entera: sin entrada en el sidebar, lo
  // acumulado es invisible hasta que llega otra factura.
  const sidebar = readFileSync(new URL('../../app/(usuario)/UserSidebar.tsx', import.meta.url), 'utf8')
  assert.ok(sidebar.includes(RUTA), `UserSidebar.tsx debe tener una entrada a ${RUTA}`)
})

// 🚨 GUARDIÁN (29/08/2026, segunda tanda). La opción VACÍA del desplegable de piso se llamaba
// «— correduría / sin piso —», así que una fila sin propuesta —que son casi todas, porque casi
// todos los proveedores de la bandeja son nuevos— se leía como si el sistema propusiera
// correduría. Lo cazó Alberto sobre la factura de Booking de 938,25 €, que es de los pisos.
// El daño no era esa fila: al confirmar nace la REGLA que imputa sola las siguientes.
// Ni `tsc` ni el build miran lo que dice una etiqueta.
test('el valor vacío del selector de piso NO se presenta como «correduría»', () => {
  const cli = readFileSync(new URL('../../app/(usuario)/expenses/pendientes/PendientesClient.tsx', import.meta.url), 'utf8')

  const vacia = cli.match(/<option value=\{SIN_ELEGIR\}>([^<]*)</)
  assert.ok(vacia, 'la opción vacía debe usar el centinela SIN_ELEGIR')
  assert.doesNotMatch(vacia[1], /corredur/i, 'el «no lo has decidido» no puede llamarse correduría')

  // Y la correduría tiene que seguir siendo elegible, con valor PROPIO distinto del vacío.
  assert.match(cli, /<option value=\{CORREDURIA\}>/, 'la correduría necesita su propia opción')
  assert.match(cli, /const CORREDURIA = '__correduria__'/, 'centinela de correduría')
  assert.match(cli, /const SIN_ELEGIR = ''/, 'el vacío es «sin elegir»')

  // Confirmar con el piso sin elegir queda bloqueado: elegir es una decisión, no un descuido.
  assert.match(cli, /disabled=\{ocupado \|\| sinElegir\}/, 'confirmar exige haber elegido negocio')
})
