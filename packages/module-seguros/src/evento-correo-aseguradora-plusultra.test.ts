import test from 'node:test'
import assert from 'node:assert/strict'
import { leerCorreoEventoAseguradora, type EventoSiniestro } from './evento-correo-aseguradora.ts'

// F0 (21/10/2026): la plantilla «[Tramitador] Siniestro <ramo> - <nº> - <asegurado>» llega desde TRES dominios del grupo
// (comunicacionesoccident.com, plusultra.es —2023-2024— y catalanaoccidente.com), con y sin el prefijo «Tramitador».
// El inventario del 21/10/2026 contó 34 hilos de plusultra/catalana que el lector no leía. Cuerpo saneado: nº de
// siniestro y contrato inventados; la nota es la de un tramitador real sin nombres.
const NOTA = 'Buenos días, solicitamos traten de averiguar si la comunidad de nuestro asegurado cuenta con seguro comunitario para poder iniciar una reclamación por concurrencia en caso de existir.'
const enlace = (n: string) => `https://webapp.plusultra.es/SSO/webapp/IntranetWebApp/servVA?NA=SIN.cmen.smgn&TIPO=7&TRANDEST=saca&NUMSINI=${n}`

const base = (remitente: string, asunto: string, cuerpoTexto: string) => ({ remitente, asunto, cuerpoTexto, fecha: new Date().toISOString() })

function siniestro(c: Parameters<typeof leerCorreoEventoAseguradora>[0]): EventoSiniestro {
  const e = leerCorreoEventoAseguradora(c)
  assert.ok(e, `debe reconocerse: ${c.remitente} · ${c.asunto}`)
  assert.equal(e.tipo, 'siniestro')
  return e as EventoSiniestro
}

test('Plus Ultra (noreply@plusultra.es) «Tramitador Siniestro Hogar - N - …» → siniestro, misma lectura que comunicacionesoccident', () => {
  const cuerpo = `Contrato: M00000\n\n${NOTA}\n\n${enlace('31000001')}`
  const pu = siniestro(base('noreply@plusultra.es', 'Tramitador Siniestro Hogar - 31000001 - ASEGURADO INVENTADO', cuerpo))
  const co = siniestro(base('noreply@comunicacionesoccident.com', 'Tramitador Siniestro Hogar - 31000001 - ASEGURADO INVENTADO', cuerpo))
  assert.equal(pu.compania, 'occident')
  assert.deepEqual(pu.siniestros, co.siniestros)
  const [s] = pu.siniestros
  assert.equal(s.numeroSiniestro, '31000001')
  assert.equal(s.ramo, 'Hogar')
  assert.equal(s.numeroPoliza, null) // el tramitador no la da: no es «sin póliza»
  assert.equal(s.accion, 'Nota del tramitador (ver el correo)')
  assert.equal(pu.ilegibles, 0)
  // La nota libre (de una persona) no sale.
  assert.doesNotMatch(JSON.stringify(pu), /comunidad|asegurado/i)
})

test('catalanaoccidente.com y el asunto SIN «Tramitador» también; contrato y nota en el MISMO párrafo', () => {
  const e = siniestro(base('noreply@catalanaoccidente.com', 'Siniestro Autos - 42000001 - ASEGURADO INVENTADO', `Contrato: M00000 ${NOTA} ${enlace('42000001')}`))
  assert.equal(e.siniestros[0].numeroSiniestro, '42000001')
  assert.equal(e.siniestros[0].ramo, 'Autos')
  assert.equal(e.ilegibles, 0)
  const pago = siniestro(base('noreply@plusultra.es', 'Siniestro Hogar - 31000002 - X', 'Contrato: M00000\n\nLe informamos de que el importe de la indemnización queda en disposición del asegurado.'))
  assert.equal(pago.siniestros[0].accion, 'Pago o propuesta de pago')
})

test('Tramitador: solo contrato y enlace (sin nota) → reconocido, acción null e ilegible', () => {
  const e = siniestro(base('noreply@plusultra.es', 'Tramitador Siniestro Hogar - 31000003 - X', `Contrato: M00000\n\n${enlace('31000003')}`))
  assert.equal(e.siniestros[0].accion, null)
  assert.equal(e.ilegibles, 1)
})

test('negativos: otro dominio, reenvío, asunto sin guiones; el «Siniestro Diversos N» de occidentinforma sigue su lector', () => {
  assert.equal(leerCorreoEventoAseguradora(base('alguien@gmail.com', 'Tramitador Siniestro Hogar - 31000001 - X', NOTA)), null)
  assert.equal(leerCorreoEventoAseguradora(base('noreply@plusultra.es', 'RV: Tramitador Siniestro Hogar - 31000001 - X', NOTA)), null)
  assert.equal(leerCorreoEventoAseguradora(base('noreply@plusultra.es', 'CORRESPONDENCIA DEL SINIESTRO 31000001', NOTA)), null)
  assert.equal(leerCorreoEventoAseguradora(base('noreply@plusultra.es', 'Siniestro Hogar 31000001 ASEGURADO', NOTA)), null)
  // Un dominio parecido no cuela.
  assert.equal(leerCorreoEventoAseguradora(base('noreply@plusultra.es.evil.com', 'Tramitador Siniestro Hogar - 31000001 - X', NOTA)), null)
})
