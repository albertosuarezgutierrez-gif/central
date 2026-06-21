// Genera los goldens base64 a partir de la salida ACTUAL de los generadores.
// Ejecutar una sola vez tras la migración verbatim; revisar el diff de impresión
// (ver Step 5) antes de commitear los goldens.
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  generarEscPos, generarTextoPlano, generarTicketCuenta,
} from '../src/renderers/thermal.ts'
import { FIXTURES, withFrozenClock } from './fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, 'fixtures')
mkdirSync(dir, { recursive: true })

const out = (name: string, data: Buffer | string) => {
  const b64 = Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data, 'utf8').toString('base64')
  writeFileSync(join(dir, `${name}.b64`), b64)
}

withFrozenClock(() => {
  out('escpos-comanda', generarEscPos(FIXTURES.comanda))
  out('texto-comanda', generarTextoPlano(FIXTURES.comanda))
  out('ticket-cuenta', generarTicketCuenta(FIXTURES.ticketCuenta))
})
console.log('Goldens generados en', dir)
