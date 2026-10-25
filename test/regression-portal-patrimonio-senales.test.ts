import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

/**
 * P15/P16 (26/10/2026) — señales de patrimonio: motor construido y APAGADO.
 *
 * 🚨 Lo que protege este fichero es una PAREJA de promesas que no se ven en la UI ni las comprueba tsc:
 *  (1) con `PATRIMONIO_SENALES_ACTIVAS` apagado NO se muestra nada nuevo, NO se escribe un consentimiento nuevo, NO cambia
 *      `VERSION_TEXTOS_LEGALES`, NO se calcula ni se lee nada de señales;
 *  (2) encendido, el motor solo calcula con `comercial_patrimonio` vigente, no envía nada a nadie y no lee nada de inquilinos.
 * Cada brazo se ha visto fallar rompiendo lo que protege (ver el informe del PR).
 */

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SQL = 'apps/asegura/prisma/sql/2026-10-26_portal_patrimonio_senal.sql'
const ADAPTADOR = 'apps/asegura/lib/patrimonio-senales.ts'
const GATE = 'apps/asegura/lib/patrimonio-senales-gate.ts'
const CRON = 'apps/asegura/app/api/cron/senales-patrimonio/route.ts'
const OPERADOR = 'apps/asegura/app/api/operador/oportunidades-patrimonio/route.ts'
const PORTAL_RUTA = 'apps/asegura-portal/app/api/consentimiento-patrimonio/route.ts'
const PORTAL_PAGINA = 'apps/asegura-portal/app/(portal)/patrimonio/page.tsx'
const PORTAL_CASILLA = 'apps/asegura-portal/app/(portal)/patrimonio/ConsentimientoPatrimonio.tsx'
const PRIVACIDAD = 'apps/asegura-portal/app/legal/privacidad/page.tsx'
const COLA = 'apps/plataforma/app/(usuario)/correduria/OportunidadesPatrimonio.tsx'

// ── SQL ────────────────────────────────────────────────────────────────────

test('el SQL de la señal: sin la palabra DROP (ni en comentarios), con REVOKE a crm_seguros y al portal, y sin GRANT', () => {
  const crudo = leer(SQL)
  assert.ok(!/drop/i.test(crudo), 'el SQL contiene la palabra DROP (ni siquiera en un comentario)')
  const sql = crudo.replace(/--.*$/gm, '')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seguros\.portal_patrimonio_senal\b/)
  assert.match(sql, /REVOKE ALL ON seguros\.portal_patrimonio_senal FROM crm_seguros/i)
  assert.match(sql, /REVOKE ALL ON seguros\.portal_patrimonio_senal FROM prisma_asegura_portal/i)
  assert.ok(!/\bGRANT\b/i.test(sql), 'la señal no se le concede a nadie: la ve solo Alberto')
})

test('el SQL: el CHECK de tipo es exactamente el catálogo del módulo', () => {
  const sql = leer(SQL).replace(/--.*$/gm, '')
  const m = sql.match(/CHECK \(tipo IN\s*\(([^)]*)\)\)/)
  assert.ok(m, 'no se encuentra el CHECK de tipo')
  const enSql = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
  const modulo = leer('packages/module-patrimonio/src/senales.ts')
  const cat = modulo.match(/TIPOS_SENAL = \[([\s\S]*?)\] as const/)
  assert.ok(cat)
  const enModulo = [...cat![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
  assert.deepEqual(enSql, enModulo)
})

test('«datos» no admite PII: el adaptador solo escribe lo que calcula el módulo puro (alias y cifras)', () => {
  const modulo = sinComentarios(leer('packages/module-patrimonio/src/senales.ts'))
  assert.doesNotMatch(modulo, /\b(inquilino|nif|email|iban|telefono|renta)\b/i)
})

// ── Interruptor ────────────────────────────────────────────────────────────

test('el interruptor no se enciende en ningún fichero versionado (apagado por defecto)', () => {
  const sospechosos: string[] = []
  const revisar = (p: string) => {
    if (!existsSync(new URL(`../${p}`, import.meta.url))) return
    if (/PATRIMONIO_SENALES_ACTIVAS\s*[=:]\s*["']?1/.test(leer(p))) sospechosos.push(p)
  }
  for (const p of ['apps/asegura/vercel.json', 'apps/asegura-portal/vercel.json', 'apps/plataforma/vercel.json', '.env.example', 'apps/asegura/.env.example', 'apps/asegura-portal/.env.example']) revisar(p)
  for (const f of readdirSync(new URL('../.github/workflows', import.meta.url))) revisar(`.github/workflows/${f}`)
  assert.deepEqual(sospechosos, [])
})

test('el motor y la cola pasan por el interruptor: apagado no se lee ni se escribe nada', () => {
  const src = sinComentarios(leer(ADAPTADOR))
  for (const fn of ['ejecutarSenalesPatrimonio', 'colaSenalesPatrimonio', 'descartarSenal']) {
    const i = src.indexOf(`export async function ${fn}`)
    assert.ok(i !== -1, `falta ${fn}`)
    const cuerpo = src.slice(i, i + 400)
    assert.match(cuerpo, /soloConInterruptor\(/, `${fn} no pasa por soloConInterruptor`)
  }
  assert.match(sinComentarios(leer(GATE)), /process\.env\.PATRIMONIO_SENALES_ACTIVAS/)
})

test('el cron y el puerto del operador no tocan la BD por su cuenta: solo llaman al adaptador', () => {
  for (const r of [CRON, OPERADOR]) {
    const src = sinComentarios(leer(r))
    assert.doesNotMatch(src, /prismaAsegura|\$queryRaw|\$executeRaw/, `${r} accede a la BD sin pasar por el interruptor`)
  }
})

test('con el interruptor apagado el gate NO ejecuta (prueba en frío, sin BD)', async () => {
  const { soloConInterruptor } = await import('../apps/asegura/lib/patrimonio-senales-gate.ts')
  let tocado = false
  const r = await soloConInterruptor(async () => { tocado = true; return 1 }, false)
  assert.deepEqual(r, { estado: 'apagado' })
  assert.equal(tocado, false)
})

test('con el interruptor apagado no se calcula aunque haya consentimiento (puro)', async () => {
  const { puedeCalcularSenales, patrimonioSenalesActivas } = await import('../packages/module-patrimonio/src/senales.ts')
  assert.equal(puedeCalcularSenales({ interruptor: patrimonioSenalesActivas(undefined), consentimientos: [true] }), false)
  assert.equal(puedeCalcularSenales({ interruptor: patrimonioSenalesActivas('0'), consentimientos: [true] }), false)
})

test('la ruta del consentimiento responde 404 ANTES de mirar sesión, cuerpo o BD cuando está apagado', () => {
  const src = sinComentarios(leer(PORTAL_RUTA))
  const interruptor = src.indexOf('senalesActivas()')
  assert.ok(interruptor !== -1, 'la ruta no mira el interruptor')
  assert.match(src.slice(interruptor, interruptor + 120), /404/)
  for (const despues of ['requireIdentidad()', 'req.json()', 'prisma.portalConsentimiento']) {
    assert.ok(src.indexOf(despues) > interruptor, `${despues} va antes del interruptor`)
  }
})

test('la página de Patrimonio solo lee y pinta la casilla con el interruptor encendido', () => {
  const src = sinComentarios(leer(PORTAL_PAGINA))
  const leerConsent = src.indexOf('consentimientoPatrimonioVigente(identidad.id)')
  assert.ok(leerConsent !== -1)
  assert.match(src.slice(Math.max(0, leerConsent - 120), leerConsent), /senalesActivas\(\)/, 'la lectura no está tras el interruptor')
  // Solo se pinta si hay un valor leído (que solo existe con el interruptor encendido).
  assert.match(src, /consentimientoPatrimonio !== undefined/)
})

test('el apartado de la política de privacidad solo se pinta con el interruptor encendido', () => {
  const src = sinComentarios(leer(PRIVACIDAD))
  assert.match(src, /senalesActivas\(\) && <ApartadoSenalesPatrimonio \/>/)
})

test('VERSION_TEXTOS_LEGALES: apagado no cambia; encendido, sí (una firma sobre el texto viejo no acredita el nuevo)', async () => {
  const m = await import('../packages/module-seguros/src/mediador.ts')
  assert.equal(m.versionTextosLegales(false), m.VERSION_TEXTOS_LEGALES)
  assert.equal(m.fechaTextosLegales(false), m.FECHA_TEXTOS_LEGALES)
  assert.notEqual(m.versionTextosLegales(true), m.VERSION_TEXTOS_LEGALES)
  assert.equal(m.VERSION_TEXTOS_LEGALES, '2026-10-v1', 'la versión base no se toca mientras el borrador no esté aprobado')
})

test('los tipos de consentimiento no cambian con el interruptor apagado', async () => {
  const c = await import('../packages/module-seguros-portal/src/consentimiento.ts')
  assert.deepEqual([...c.tiposConsentimiento(false)], [...c.TIPOS_CONSENTIMIENTO])
  assert.deepEqual([...c.tiposQueSeRegistran(false)], [...c.TIPOS_QUE_SE_REGISTRAN])
  assert.ok(!(c.TIPOS_CONSENTIMIENTO as readonly string[]).includes('comercial_patrimonio'))
  assert.ok(!(c.TIPOS_QUE_SE_REGISTRAN as readonly string[]).includes('comercial_patrimonio'))
})

// ── Casilla ────────────────────────────────────────────────────────────────

test('la casilla nunca va premarcada, usa el texto del módulo y falla cerrada', () => {
  const src = sinComentarios(leer(PORTAL_CASILLA))
  assert.match(src, /useState\(inicial === true\)/, 'la casilla puede nacer marcada sin que conste')
  assert.match(src, /TEXTO_CONSENTIMIENTO_COMERCIAL_PATRIMONIO/)
  assert.match(src, /setMarcado\(anterior\)/, 'si falla el guardado la casilla debe volver a como estaba')
  assert.ok(!/checked=\{true\}|defaultChecked/.test(src))
})

test('el consentimiento es append-only: la ruta crea filas, jamás actualiza ni borra', () => {
  const src = sinComentarios(leer(PORTAL_RUTA))
  assert.match(src, /portalConsentimiento\.create/)
  assert.doesNotMatch(src, /portalConsentimiento\.(update|upsert|delete)/)
  assert.match(src, /versionTexto: VERSION_TEXTO_COMERCIAL_PATRIMONIO/)
})

// ── Motor: no envía, no lee inquilinos ──────────────────────────────────────

test('el motor no envía nada: ni correo, ni Telegram, ni WhatsApp, ni push', () => {
  for (const f of [ADAPTADOR, GATE, CRON, OPERADOR, 'packages/module-patrimonio/src/senales.ts', COLA, 'apps/plataforma/lib/correduria/oportunidades-patrimonio.ts']) {
    const src = sinComentarios(leer(f))
    assert.doesNotMatch(src, /core-email|core-telegram|core-push|tgSend|tgAviso|enviarCorreo|sendMail|nodemailer|resend|whatsapp/i, `${f} puede enviar algo`)
  }
})

test('el motor no lee ninguna tabla de inquilino ni de importación', () => {
  const src = sinComentarios(leer(ADAPTADOR))
  assert.doesNotMatch(src, /portal_patrimonio_(inquilino|contrato_inquilino|aviso_inquilino|enlace_inquilino|importacion)/)
  // De un contrato solo se lee su id y su fin.
  const c = src.match(/from portal_patrimonio_contrato c[\s\S]{0,200}/)
  assert.ok(c)
  const consulta = src.slice(src.lastIndexOf('select c.id', src.indexOf('from portal_patrimonio_contrato c')), src.indexOf('from portal_patrimonio_contrato c'))
  assert.doesNotMatch(consulta, /renta|inquilino|nombre|nif|email/i)
})

test('el motor solo calcula para fichas con permiso y las abiertas sin permiso se retiran', () => {
  const src = sinComentarios(leer(ADAPTADOR))
  assert.match(src, /puedeCalcularSenales\(\{ interruptor: true, consentimientos \}\)/)
  assert.match(src, /planificarSenales\(\{ calculadas, existentes, permitido, hoy \}\)/)
  assert.match(src, /consentimientoVigente\(/)
  assert.match(src, /VERSION_TEXTO_COMERCIAL_PATRIMONIO/, 'un «sí» sobre otra versión del texto no consiente el nuevo')
})

test('la cola no enseña a los opuestos y dice cuando el motor está apagado', () => {
  const adapt = sinComentarios(leer(ADAPTADOR))
  assert.match(adapt, /permiso === 'opuesto'\) continue/)
  const cola = leer(COLA)
  assert.match(cola, /d\.estado === 'apagado'/)
  assert.match(cola, /APAGADO/)
  assert.match(cola, /PATRIMONIO_SENALES_ACTIVAS/)
})

test('las dos copias de «qué es el continente» (portal y asegura) coinciden', () => {
  const re = (f: string) => leer(f).match(/ES_CONTINENTE = (\/[^\n]+\/)/)?.[1]
  const portal = re('apps/asegura-portal/lib/patrimonio/capital-continente.ts')
  assert.ok(portal)
  assert.equal(re(ADAPTADOR), portal)
})

test('la cola «Patrimonio» está montada en «Hoy»', () => {
  assert.match(leer('apps/plataforma/app/(usuario)/correduria/HoyCockpit.tsx'), /<OportunidadesPatrimonio \/>/)
})
