// Cepo de la cola de aprobaciones (pieza 2-c). Lee el FUENTE: lo que vigila es el ORDEN de las
// escrituras en SQL crudo, donde ni tsc ni el build miran, e importar arrastraría Prisma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./aprobaciones.ts', import.meta.url), 'utf8')
const detector = readFileSync(new URL('./eventos-cartera.ts', import.meta.url), 'utf8')

test('un solo sitio envía correo, y solo tras reclamar la fila (pendiente → enviando)', () => {
  assert.equal(src.match(/sendMail\(/g)?.length, 1)
  const reclamo = src.indexOf("set estado = 'enviando'")
  const envio = src.indexOf('await enviarCorreo(')
  assert.ok(reclamo > 0 && envio > reclamo, 'reclamar ANTES de mandar: un doble clic no manda dos correos')
  assert.match(src, /where id = \$\{id\}::uuid and estado = 'pendiente' and caduca_at >= now\(\)/)
})

test('el envío solo existe detrás de la decisión «aprobar» y el destinatario sale de la ficha', () => {
  const rechazar = src.indexOf("if (d.decision === 'rechazar')")
  assert.ok(rechazar > 0 && rechazar < src.indexOf('await enviarCorreo('))
  assert.match(src, /const ficha = await estadoEmailDeFicha\(correduriaId, a\.clienteId\)/)
  assert.match(src, /const destino = ficha\.email/)
})

test('antes de decidir se retira lo obsoleto: no se manda «no consta pagado» de un recibo ya cobrado', () => {
  const decidir = src.slice(src.indexOf('export async function decidirAprobacion'))
  const retira = decidir.indexOf('await retirarObsoletas(correduriaId)')
  assert.ok(retira > 0 && retira < decidir.indexOf("set estado = 'enviando'"))
  assert.match(src, /r\.situacion::text is distinct from 'devuelto'/)
})

test('un corte esperando al proveedor NO se da por «no enviado»: se queda a medias', () => {
  const incierto = src.indexOf('if (!envio.ok && envio.incierto)')
  assert.ok(incierto > 0 && incierto < src.indexOf("const final = envio.ok ? 'ejecutada' : 'fallida'"))
  // Cerrar a mano solo lo que lleva >10 min a medias, nunca un envío en curso.
  assert.match(src, /estado = 'enviando' and decidida_at < now\(\) - interval '10 minutes'`\n    if \(n === 0\)/)
})

test('el detector propone el aviso de recibo devuelto en su transacción, con punto de guardado', () => {
  assert.match(detector, /savepoint aprobacion`[\s\S]*proponerReciboDevuelto\(tx,[\s\S]*rollback to savepoint aprobacion/)
  assert.ok(detector.indexOf('proponerReciboDevuelto(tx,') < detector.indexOf('insert into cartera_foto'))
})
