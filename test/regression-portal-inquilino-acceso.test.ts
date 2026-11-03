// Guardián del ENLACE CON EL INQUILINO (P17, 26/10/2026). `node --test` (gate en CI vía `pnpm test:guardia`).
//
// Lo que sostiene (cada cosa tiene su brazo, y un brazo sintético que demuestra que el detector muerde):
//   1. El token NO abre sesión y el portal NO envía nada a la persona ni a terceros: ni cookie ni canal de salida (correo,
//      Telegram, WhatsApp). El único `fetch` del flujo es el puente interno a asegura de «Pedir precio» (27/10/2026,
//      `lib/inquilino/precio-puente.ts`, cepo `regression-portal-inquilino-precio`), que no escribe al inquilino ni a terceros.
//   2. El token se guarda HASHEADO y el SQL no borra, no revoca de menos al CRM y no deja reescribir el consentimiento.
//   3. AISLAMIENTO: el lado del inquilino no usa `accesosPatrimonio`, parte de los accesos de la identidad de la COOKIE y no toca
//      ninguna tabla de gastos/rentabilidad/PII/otros titulares.
//   4. El inquilino NUNCA es lead: nada fuera de su flujo lee sus tablas de acceso/consentimiento (ofertas, señales, CRM).
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const P = 'apps/asegura-portal'
const SQL = `${P}/prisma/sql/2026-10-26_portal_patrimonio_inquilino_acceso.sql`
const BD_INQUILINO = `${P}/lib/inquilino/inquilino-bd.ts`
const API_INQUILINO = `${P}/lib/inquilino/inquilino-api.ts`
const BD_PROPIETARIO = `${P}/lib/patrimonio/enlace-inquilino-bd.ts`
const API_PROPIETARIO = `${P}/lib/patrimonio/enlace-inquilino-api.ts`
const PAGINA_ENLACE = `${P}/app/inquilino/[token]/page.tsx`
const RUTA_CANJEAR = `${P}/app/api/inquilino/canjear/route.ts`

const ficheros = (): string[] =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('node_modules'))

/** Todo lo que forma el flujo del enlace (ambos lados), rutas y pantallas incluidas. */
const flujo = (): string[] =>
  ficheros().filter(
    (f) =>
      f.startsWith(`${P}/lib/inquilino/`) ||
      f.startsWith(`${P}/app/inquilino/`) ||
      f.startsWith(`${P}/app/mi-alquiler/`) ||
      f.startsWith(`${P}/app/api/inquilino/`) ||
      f === BD_PROPIETARIO ||
      f === API_PROPIETARIO ||
      f.includes('/enlace-inquilino/') ||
      f.includes('/recibos-compartidos/'),
  ).filter((f) => !/\.test\.tsx?$/.test(f))

// ─── 1. El token no abre sesión y el portal no envía nada ───────────────────────────────────────────────────
const ABRE_SESION = /\bcookies\s*\(|\bjose\b|\bSignJWT\b|\bcrearSesion\b|\bfirmarSesion\b|\bset-cookie\b|Set-Cookie/
const ENVIA = /core-email|correo-invitacion|enviarInvitacion|enviarCodigo|obtenerCanal|nodemailer|resend|\bsendMail\b|core-telegram|whatsapp|twilio/i

export function infractoresFlujo(fs: ReadonlyArray<{ f: string; src: string }>, re: RegExp): string[] {
  return fs.filter(({ src }) => re.test(src)).map(({ f }) => f)
}

test('el detector de este cepo muerde (brazos sintéticos)', () => {
  assert.deepEqual(infractoresFlujo([{ f: 'a.ts', src: "import { cookies } from 'next/headers'; cookies().set('x', 't')" }], ABRE_SESION), ['a.ts'])
  assert.deepEqual(infractoresFlujo([{ f: 'b.ts', src: "const { enviarInvitacion } = await import('./correo-invitacion')" }], ENVIA), ['b.ts'])
  assert.deepEqual(infractoresFlujo([{ f: 'c.ts', src: 'const x = 1' }], ENVIA), [])
})

test('🚨 el token NO abre sesión: ningún fichero del flujo crea ni firma una cookie', () => {
  const fs = flujo().map((f) => ({ f, src: leer(f) }))
  assert.ok(fs.some(({ f }) => f === BD_INQUILINO), 'el cepo no está viendo el flujo del inquilino')
  assert.deepEqual(infractoresFlujo(fs, ABRE_SESION), [])
})

test('🚨 el portal NO envía nada: ningún fichero del flujo importa un canal de salida', () => {
  const fs = flujo().map((f) => ({ f, src: leer(f) }))
  assert.deepEqual(infractoresFlujo(fs, ENVIA), [])
})

test('🚨 el canje exige SESIÓN (requireIdentidad) y la pantalla sin sesión no lee el contrato', () => {
  assert.match(leer(RUTA_CANJEAR), /requireIdentidad\(\)/)
  const pagina = leer(PAGINA_ENLACE)
  // Sin sesión solo se mira «¿canjeable?»: nada de vista, contrato ni propietario.
  const sinSesion = pagina.slice(pagina.indexOf('identidad === null'), pagina.indexOf('identidad === null') + 900)
  assert.doesNotMatch(sinSesion, /responderMiContrato|\.vista\(|contacto|inmueble/)
  assert.doesNotMatch(pagina, /from ['"]@\/lib\/db['"]|prisma\./, 'la página no consulta la BD por su cuenta')
})

// ─── 2. Token hasheado y SQL ────────────────────────────────────────────────────────────────────────────────
test('🚨 el token solo se guarda HASHEADO y nunca se loguea', () => {
  const bd = leer(BD_PROPIETARIO)
  assert.match(bd, /hashToken:\s*hashCanal/)
  assert.doesNotMatch(bd, /\btoken[A-Za-z]*\s*[:,]\s*token\b(?!Hash)/, 'el token en claro no entra en un create')
  for (const f of flujo()) assert.doesNotMatch(leer(f), /console\.(log|info|warn|error)\([^)]*token/i, `${f} loguea el token`)
  // El token sale UNA vez, en la respuesta del alta; ningún otro endpoint lo devuelve.
  assert.equal((leer(API_PROPIETARIO).match(/body: \{[^}]*\btoken\b/g) ?? []).length, 1, 'solo la respuesta del alta lleva el token')
})

test('🚨 SQL: aditivo, sin DROP ni DELETE, crm revocado, un uso por enlace, consentimiento append-only', () => {
  const crudo = readFileSync(join(ROOT, SQL), 'utf8')
  assert.doesNotMatch(crudo, /\bDROP\b/i, 'el MCP de Supabase se cuelga con cualquier DROP (ni en un comentario)')
  const sql = crudo.replace(/--.*$/gm, '')
  assert.match(sql, /^BEGIN;/m)
  assert.match(sql, /^COMMIT;/m)
  for (const t of ['portal_patrimonio_inquilino_acceso', 'portal_patrimonio_inquilino_consentimiento', 'portal_patrimonio_recibo_compartido']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS seguros\\.${t}\\b`))
    assert.match(sql, new RegExp(`REVOKE ALL ON seguros\\.${t} FROM crm_seguros`, 'i'))
    assert.doesNotMatch(sql, new RegExp(`GRANT[^;]*DELETE[^;]*ON seguros\\.${t}`, 'i'))
  }
  assert.match(sql, /enlace_id\s+uuid NOT NULL UNIQUE/, 'un enlace, un uso')
  // El consentimiento no se reescribe: ni UPDATE para el portal ni para prisma_seguros.
  assert.doesNotMatch(sql, /GRANT\s+UPDATE[^;]*ON seguros\.portal_patrimonio_inquilino_consentimiento/i)
  assert.match(sql, /REVOKE UPDATE, DELETE ON seguros\.portal_patrimonio_inquilino_consentimiento FROM prisma_seguros/)
  // El acceso solo admite el sello de revocación.
  assert.match(sql, /GRANT UPDATE \(revocado_en, revocado_por\)\s+ON seguros\.portal_patrimonio_inquilino_acceso/)
  // El recibo compartido ata documento + titular + inquilino por FK compuesta.
  assert.match(sql, /FOREIGN KEY \(documento_id, titular_id, inquilino_id\)/)
})

// ─── 3. Aislamiento ─────────────────────────────────────────────────────────────────────────────────────────
test('🚨 AISLAMIENTO: el lado del inquilino parte de la COOKIE, no de accesosPatrimonio, y filtra por identidadId', () => {
  const bd = leer(BD_INQUILINO)
  assert.doesNotMatch(bd, /accesosPatrimonio/, 'el inquilino no es titular: su frontera son sus accesos')
  assert.match(bd, /export function puertosInquilino\(identidadId: string/)
  assert.doesNotMatch(bd, /identidadId\s*(\?\?|\|\|)\s*['"]/)
  // Toda lectura/escritura del acceso lleva la identidad dentro del where.
  const consultasAcceso = bd.match(/portalPatrimonioInquilinoAcceso\.(findMany|findFirst|updateMany)\(\{[\s\S]*?\}\)/g) ?? []
  assert.ok(consultasAcceso.length >= 5, `solo veo ${consultasAcceso.length} consultas del acceso`)
  for (const q of consultasAcceso) assert.match(q, /identidadId/, `consulta del acceso sin identidad:\n${q}`)
  // Las lecturas de ficheros del inquilino llevan SIEMPRE el par (contrato, inquilino) del acceso, nunca un id de la request solo.
  assert.match(bd, /inquilinoId: acceso\.inquilinoId/)
  assert.match(bd, /contratoId: acceso\.contratoId/)
})

test('🚨 AISLAMIENTO: la API del inquilino resuelve el contrato con accesoParaContrato (la identidad de la cookie)', () => {
  const api = leer(API_INQUILINO)
  assert.match(api, /accesoParaContrato\(await p\.accesos\(\), p\.identidadId, contratoId\)/)
  // Ningún responder lee el contrato del cuerpo o la URL sin pasar por `acceso()`.
  assert.doesNotMatch(api, /p\.vista\(\{/)
  assert.doesNotMatch(api, /prisma|@\/lib\/db/)
})

test('🚨 el inquilino NO lee gastos, rentabilidad, titulares, otros inmuebles, otros inquilinos ni PII', () => {
  const prohibido = [
    'portalPatrimonioGasto', 'portalPatrimonioPlantillaGasto', 'portalPatrimonioDerrama', 'portalPatrimonioTitular',
    'portalPatrimonioInmueble\\b', 'portalPatrimonioInquilino\\b', 'portalPatrimonioImportacion', 'portalPatrimonioObligacion',
    'portalPatrimonioInmueblePoliza', 'portalPatrimonioAvisoInquilino', 'prisma\\.cliente', 'prisma\\.poliza', 'carteraDeIdentidad',
    'fianzaCent', 'fianzaDepositadaEn', 'nifCifrado', 'emailCifrado', 'telefonoCifrado', 'emailHash',
  ]
  const bd = leer(BD_INQUILINO)
  for (const p of prohibido) assert.doesNotMatch(bd, new RegExp(`prisma\\.${p}|\\b${p}`), `inquilino-bd lee ${p}`)
  assert.doesNotMatch(leer(API_INQUILINO), /fianza|gasto|rentabilidad|nif|telefono/i)
})

test('🚨 la subida del inquilino solo va a SU carpeta de recibos, con tope y sin DELETE', () => {
  const bd = leer(BD_INQUILINO)
  assert.match(bd, /CARPETA_JUSTIFICANTES = 'recibos'/)
  assert.match(bd, /owner: \{ tipo: 'inquilino', id: acceso\.inquilinoId \}/)
  assert.match(bd, /guardarConTope/)
  assert.doesNotMatch(bd, /\.delete(Many)?\(/)
  assert.doesNotMatch(leer(BD_PROPIETARIO), /\.delete(Many)?\(/)
})

test('🚨 el propietario: todo parte de accesosPatrimonio y solo Total (alta_baja) crea, retira o comparte', () => {
  const bd = leer(BD_PROPIETARIO)
  assert.match(bd, /accesosPatrimonio\(identidadId\)/)
  assert.match(leer(API_PROPIETARIO), /puede\(accesos\.get\(c\.clienteId\), 'alta_baja'\)/)
  // El documento a compartir se busca en el titular del contrato Y con el inquilino del documento, no el del cuerpo.
  assert.match(bd, /id: documentoId, titularId, inquilinoId, borradoEn: null/)
})

// ─── 4. El inquilino NUNCA es lead ──────────────────────────────────────────────────────────────────────────
test('🚨 NUNCA LEAD: solo el flujo del enlace toca el acceso y el consentimiento del inquilino', () => {
  const PERMITIDOS = new Set([BD_INQUILINO, BD_PROPIETARIO])
  const toca = /portalPatrimonioInquilinoAcceso|portalPatrimonioInquilinoConsentimiento|portal_patrimonio_inquilino_(acceso|consentimiento)/
  const infractores = ficheros()
    .filter((f) => !/\.test\.tsx?$/.test(f) && !PERMITIDOS.has(f) && !f.startsWith('test/'))
    .filter((f) => toca.test(leer(f)))
  assert.deepEqual(infractores, [], 'estos ficheros leen a los inquilinos fuera de su flujo (¿ofertas, señales, CRM?):\n  - ' + infractores.join('\n  - '))
})

test('🚨 NUNCA LEAD: las ofertas al inquilino pasan por UNA puerta que exige consentimiento vigente', () => {
  const api = leer(API_INQUILINO)
  assert.match(api, /puedeRecibirOfertasInquilino\(\{ acceso: a, consentimientos: a \? await p\.consentimientos\(\) : \[\] \}\)/)
  const puro = leer('packages/module-patrimonio/src/inquilino-acceso.ts')
  assert.match(puro, /estadoConsentimiento\([^)]*\)\s*===\s*'concedido'/)
  // Casilla NO premarcada: el estado inicial del cliente solo es «marcado» si ya está concedido.
  assert.match(leer(`${P}/app/mi-alquiler/[contratoId]/MiAlquiler.tsx`), /useState\(datos\.consentimiento\.estado === 'concedido'\)/)
  // El consentimiento comercial del inquilino NO se mezcla con `portal_consentimiento` (el del cliente de la bóveda).
  assert.doesNotMatch(leer(BD_INQUILINO), /portalConsentimiento\b/)
})

test('ningún lector de leads/oportunidades del patrimonio nombra inquilinos', () => {
  const sospechosos = ficheros().filter((f) => /oferta|senal|oportunidad|lead|pedir-precio/i.test(f.split('/').pop() ?? '') && !/\.test\.tsx?$/.test(f))
  assert.ok(sospechosos.length > 0, 'el cepo no ve ningún fichero de ofertas')
  const infractores = sospechosos.filter((f) => /inquilino(Acceso|Consentimiento)|puertosInquilino|lib\/inquilino/.test(leer(f)))
  assert.deepEqual(infractores, [])
})
