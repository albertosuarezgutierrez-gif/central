// Cepo del correo tras emitir. Mismo criterio que la invitación al portal: la dirección la tecleó
// alguien, así que el correo no nombra NADA de la cartera. La función ni siquiera recibe esos datos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { CAMPOS_PROHIBIDOS_EN_INVITACION } from '@central/module-seguros-portal'

import { cuerpoCorreoEmision, cuerpoCorreoPoliza } from './correo-emision.ts'

const aplanar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ENLACE = 'https://clientes.grupoasegura.es/boveda'

const RESUMEN = { compania: 'Allianz', cobertura: 'Terceros Ampliado', fechaEfecto: '26/09/2026', prima: '432,82€' }
// Alberto (26/09/2026) quiere compañía, cobertura, fecha y prima en el correo de emisión. El RESTO de la
// lista de la invitación sigue prohibido: número de póliza, matrícula, IBAN, DNI…
const PERMITIDOS_EN_EMISION = new Set(['compania', 'aseguradora', 'prima'])
const PROHIBIDOS_EN_EMISION = CAMPOS_PROHIBIDOS_EN_INVITACION.filter((c) => !PERMITIDOS_EN_EMISION.has(c))

test('lleva el resumen pedido y nada más de la cartera, con baja y sin ella, con póliza y sin ella', () => {
  for (const [conBaja, conPoliza] of [[true, true], [true, false], [false, true], [false, false]] as const) {
    const c = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja, conPoliza, resumen: RESUMEN })
    for (const v of Object.values(RESUMEN)) {
      assert.ok(c.html.includes(v), `falta en el html: ${v}`)
      assert.ok(c.texto.includes(v), `falta en el texto: ${v}`)
    }
    const todo = aplanar([c.asunto, c.texto, c.html].join('\n'))
    const colados = PROHIBIDOS_EN_EMISION.filter((campo) => todo.includes(aplanar(campo)))
    assert.deepEqual(colados, [], `campos de la cartera en el correo: ${colados.join(', ')}`)
  }
  const p = cuerpoCorreoPoliza({ nombre: 'Pablo', enlace: ENLACE })
  const todo = aplanar([p.asunto, p.texto, p.html].join('\n'))
  assert.deepEqual(CAMPOS_PROHIBIDOS_EN_INVITACION.filter((c) => todo.includes(aplanar(c))), [])
})

test('🪤 sin resumen, o con un dato que no sabemos, no se pinta la fila ni se inventa', () => {
  const sin = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja: false, conPoliza: false, resumen: null })
  assert.doesNotMatch(sin.texto, /TU SEGURO|Prima anual|Compañía/)
  assert.match(sin.texto, /en vigor desde la fecha de efecto que acordamos/)
  const parcial = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja: false, conPoliza: false, resumen: { ...RESUMEN, prima: null, fechaEfecto: null } })
  assert.doesNotMatch(parcial.texto, /Prima anual|Fecha de efecto|0,00/)
  assert.match(parcial.texto, /Compañía: Allianz/)
})

test('🪤 no promete en el portal un PDF que aún no hay: con póliza dice que va adjunta; sin ella, que se enviará', () => {
  const con = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja: false, conPoliza: true, resumen: null })
  const sin = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja: false, conPoliza: false, resumen: null })
  assert.match(con.texto, /Te adjuntamos la póliza/)
  assert.match(sin.texto, /Te enviaremos la póliza original en cuanto nos la entreguen/)
  assert.doesNotMatch(sin.texto, /en tu área de clientes lo tienes todo/i)
})

test('🪤 el PDF va adjunto cuando lo hay, y el cron solo escribe a quien ya recibió la emisión, una vez por póliza', () => {
  const tras = readFileSync(new URL('./tras-emision.ts', import.meta.url), 'utf8')
  assert.match(tras, /conPoliza: pdf !== null/)
  assert.match(tras, /\.\.\.\(pdf \? \{ adjuntos: \[\{ nombre: pdf\.nombre, contenido: pdf\.contenido, tipo: 'application\/pdf' \}\] \} : \{\}\)/)
  const cron = readFileSync(new URL('./poliza-pdf.ts', import.meta.url), 'utf8')
  // POR PÓLIZA, no por cliente: con dos emisiones del mismo cliente una no tapa ni autoriza a la otra.
  assert.match(cron, /exists \(select 1 from correo_envio e where e\.poliza_id = p\.id and e\.tipo = 'emision' and e\.estado = 'enviado'\)/)
  assert.match(cron, /not exists \(select 1 from correo_envio e where e\.poliza_id = p\.id\s+and e\.tipo in \(\$\{TIPO_CORREO_POLIZA\}, \$\{TIPO_CORREO_EMISION_CON_POLIZA\}\)/)
  assert.doesNotMatch(cron, /e\.cliente_id = p\.cliente_id/)
  // Y los dos envíos que cuentan dejan la póliza apuntada; sin ella el cron no los ve y reenviaría.
  assert.match(tras, /polizaId: opciones\.prueba \? null : e\.polizaId/)
  assert.match(cron, /clienteId: f\.clienteId, polizaId: f\.polizaId, tipo: TIPO_CORREO_POLIZA/)
  const seg = readFileSync(new URL('./correo-seguimiento.ts', import.meta.url), 'utf8')
  assert.match(seg, /\$\{e\.polizaId \?\? null\}::uuid/)
  // La documentación original de la compañía la ve el cliente en su portal.
  const arch = readFileSync(new URL('./codeoscopic/archivar-documento.ts', import.meta.url), 'utf8')
  assert.match(arch, /visiblePorCliente: true/)
})

test('la firma de la baja sale SOLO si hay baja abierta, y el botón lleva al portal', () => {
  const con = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja: true, conPoliza: false, resumen: null })
  const sin = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja: false, conPoliza: false, resumen: null })
  assert.match(con.texto, /firma la baja de tu seguro anterior/i)
  assert.doesNotMatch(sin.texto, /baja/i)
  assert.match(con.html, new RegExp(`href="${ENLACE}"`))
  assert.match(sin.html, new RegExp(`href="${ENLACE}"`))
})

test('sin nombre saluda sin inventárselo, y un enlace no https no se envía', () => {
  assert.match(cuerpoCorreoEmision({ nombre: null, enlace: ENLACE, conBaja: false, conPoliza: false, resumen: null }).texto, /^Hola:/)
  assert.match(cuerpoCorreoEmision({ nombre: 'Ana<b>', enlace: ENLACE, conBaja: false, conPoliza: false, resumen: null }).html, /Ana&lt;b&gt;/)
  assert.throws(() => cuerpoCorreoEmision({ nombre: 'x', enlace: 'http://a.es', conBaja: false, conPoliza: false, resumen: null }))
})

test('🪤 la firma de la función solo admite el resumen pedido: ni número, ni matrícula, ni IBAN, ni DNI', () => {
  const src = readFileSync(new URL('./correo-emision.ts', import.meta.url), 'utf8')
  const tipo = src.slice(src.indexOf('export type DatosCorreoEmision'), src.indexOf('export type CuerpoCorreoEmision'))
  for (const campo of ['numero', 'matricula', 'iban', 'dni', 'referencia']) {
    assert.doesNotMatch(tipo, new RegExp(`\\b${campo}`, 'i'), campo)
  }
})

test('🪤 tras emitir: solo con acuñado OK, y el correo de prueba no cuenta como enviado al cliente', () => {
  const ruta = readFileSync(new URL('../app/api/operador/codeoscopic/emitir/route.ts', import.meta.url), 'utf8')
  assert.equal(ruta.match(/await trasEmisionConTope\(/g)?.length, 2, 'los dos caminos que acuñan')
  assert.match(ruta, /acunadoAc\.ok \? await trasEmisionConTope\(/)
  assert.match(ruta, /acunado\.ok \? await trasEmisionConTope\(/)
  const tras = readFileSync(new URL('./tras-emision.ts', import.meta.url), 'utf8')
  assert.match(tras, /clienteId: opciones\.prueba \? null : e\.clienteId/)
  assert.match(tras, /if \(!opciones\.prueba && !correoEmisionActivo\(\)\) return/)
  // La baja se mira en la póliza SUSTITUIDA, no en cualquiera.
  assert.match(tras, /where poliza_id = \$\{e\.polizaOrigenId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado <> 'desistida'/)
  // Solo se le escribe si su correo le lleva a SU ficha del portal, y a ESE correo.
  assert.match(tras, /if \(f\.estado === 'ambiguo' \|\| f\.estado === 'resuelve_a_otra'\) return \{ baja, correo: 'no_resuelve' \}/)
  assert.match(tras, /destino = f\.emailInvitacion/)
  // Un corte con el proveedor es «no se sabe», no «rechazado».
  assert.match(tras, /if \(r\.resultado === 'rechazado' && CORTE\.test\(r\.motivo \?\? ''\)\) return \{ baja, correo: 'incierto' \}/)
})

test('🪤 la firma del portal dispara el envío a la compañía SOLO cuando quedó firmada, y un fallo no la estropea', () => {
  const ruta = readFileSync(new URL('../app/api/portal/anulacion/route.ts', import.meta.url), 'utf8')
  const i = ruta.indexOf("if (r.estado === 'firmada') {")
  assert.ok(i > 0 && ruta.indexOf('enviarAnulacionTrasFirma(correduria.id, anulacionId)') > i)
  // Después de contestar (`after`): el puente del portal corta a los pocos segundos.
  assert.match(ruta.slice(i, i + 1200), /after\(async \(\) => \{\s*try \{[\s\S]*\} catch \(e\) \{/)
})

test('🪤 la PÓLIZA que sube el corredor a una póliza la ve el cliente; ningún otro tipo', () => {
  const src = readFileSync(new URL('../app/api/operador/documentos/route.ts', import.meta.url), 'utf8')
  assert.match(src, /visiblePorCliente: tipo === 'poliza' && polizaId !== null/)
})
