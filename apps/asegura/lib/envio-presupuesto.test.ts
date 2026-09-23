// Cepo del aviso del presupuesto al cliente (PR 3). Lee el FUENTE: lo que vigila es el ORDEN de las
// escrituras, y el módulo importa Prisma, que `node --test` no puede cargar sin generar el cliente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./envio-presupuesto.ts', import.meta.url), 'utf8')
const avisar = src.slice(src.indexOf('export async function avisarPresupuesto'), src.indexOf('export async function confirmarWhatsapp'))

test('🪤 sin enlace ni correo ni precio real NO se toca la fila: todas las guardas van antes de la primera escritura', () => {
  const primeraEscritura = avisar.indexOf('updateMany(')
  for (const g of [
    "if (!enlace) return error('sin_enlace'",
    "if (ficha.estado !== 'ok') return error('sin_email'",
    "if (t?.simulado !== false) return error('simulado'",
    "if (!AVISABLE.has(estado)) return error('no_enviable'",
  ]) {
    const i = avisar.indexOf(g)
    assert.ok(i > 0 && i < primeraEscritura, `${g} antes de escribir`)
  }
})

test('🪤 dos clics no mandan dos correos: el token se rota con compare-and-swap sobre el hash anterior', () => {
  assert.match(avisar, /where: \{ id: p\.id, correduriaId, tokenHash: p\.tokenHash,/)
  const cas = avisar.indexOf('if (rotado.count === 0)')
  assert.ok(cas > 0 && cas < avisar.indexOf('await mandarCorreo('), 'el segundo clic se para antes de mandar')
})

test('🪤 `enviado_at` solo se sella si el proveedor aceptó; el WhatsApp solo sella el enlace', () => {
  const fallo = avisar.indexOf("if (envio !== 'enviado')")
  const sello = avisar.indexOf('enviadoAt: ahora')
  assert.ok(fallo > 0 && sello > fallo, 'el sello va detrás del corte por fallo')
  const whatsapp = avisar.slice(avisar.indexOf("if (entrada.canal === 'whatsapp_enlace') {"), avisar.indexOf('const envio = await mandarCorreo('))
  assert.doesNotMatch(whatsapp, /enviadoAt/)
})
