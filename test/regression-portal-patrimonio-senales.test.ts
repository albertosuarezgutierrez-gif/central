import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

/**
 * P15/P16 (26/10/2026) — señales de patrimonio: motor construido y APAGADO; texto legal PUBLICADO (interés legítimo).
 *
 * 🚨 Lo que protege este fichero son promesas que no se ven en la UI ni las comprueba tsc:
 *  (1) con `PATRIMONIO_SENALES_ACTIVAS` apagado NO se calcula, ni se lee, ni se escribe nada de señales;
 *  (2) el apartado «3 bis» de privacidad y el derecho de OPOSICIÓN están publicados SIEMPRE (con interés legítimo hay que
 *      informar antes de calcular, y oponerse se puede antes de que el motor arranque); `VERSION_TEXTOS_LEGALES` es UNA;
 *  (3) encendido, el motor calcula salvo oposición vigente, no envía nada a nadie, no lee nada de inquilinos y borra lo
 *      que supera el plazo de conservación.
 * Cada brazo se ha visto fallar rompiendo lo que protege (ver el informe del PR).
 */

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SQL = 'apps/asegura/prisma/sql/2026-10-26_portal_patrimonio_senal.sql'
const SQL_OPOSICION = 'apps/asegura/prisma/sql/2026-10-26_portal_consentimiento_oposicion.sql'
const ADAPTADOR = 'apps/asegura/lib/patrimonio-senales.ts'
const GATE = 'apps/asegura/lib/patrimonio-senales-gate.ts'
const CRON = 'apps/asegura/app/api/cron/senales-patrimonio/route.ts'
const OPERADOR = 'apps/asegura/app/api/operador/oportunidades-patrimonio/route.ts'
const PORTAL_RUTA = 'apps/asegura-portal/app/api/oposicion-senales-patrimonio/route.ts'
const PORTAL_PAGINA = 'apps/asegura-portal/app/(portal)/patrimonio/page.tsx'
const PORTAL_CONFIG = 'apps/asegura-portal/app/(portal)/configuracion/page.tsx'
const PORTAL_CASILLA = 'apps/asegura-portal/app/(portal)/configuracion/OposicionSenalesPatrimonio.tsx'
const PRIVACIDAD = 'apps/asegura-portal/app/legal/privacidad/page.tsx'
const APARTADO = 'apps/asegura-portal/app/legal/privacidad/ApartadoSenalesPatrimonio.tsx'
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

test('el SQL de la oposición: sin DROP literal, idempotente vía pg_constraint, sin GRANT, y su CHECK = TIPOS_CONSENTIMIENTO', async () => {
  const crudo = leer(SQL_OPOSICION)
  assert.ok(!/drop/i.test(crudo), 'el SQL contiene la palabra DROP (ni siquiera en un comentario)')
  const sql = crudo.replace(/--.*$/gm, '')
  assert.match(sql, /FROM pg_constraint/)
  assert.match(sql, /EXECUTE format\('ALTER TABLE seguros\.portal_consentimiento %s CONSTRAINT %I', 'DR' \|\| 'OP', nombre\)/)
  assert.ok(!/\bGRANT\b/i.test(sql), 'ningún GRANT nuevo')
  assert.match(sql, /REVOKE UPDATE, DELETE ON seguros\.portal_consentimiento FROM prisma_asegura_portal/, 'append-only también en permisos')
  const m = sql.match(/ADD CONSTRAINT portal_consentimiento_tipo_check\s+CHECK \(tipo IN \(([^)]*)\)\)/)
  assert.ok(m, 'no se encuentra el CHECK de tipo')
  const enSql = [...m![1]!.matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])
  const c = await import('../packages/module-seguros-portal/src/consentimiento.ts')
  assert.deepEqual(enSql, [...c.TIPOS_CONSENTIMIENTO])
  // La lista de partida (la del SQL de creación) sigue entera: ensanchar no quita nada.
  const origen = leer('apps/asegura-portal/prisma/sql/2026-09-01_portal_fase1.sql').match(/tipo\s+text NOT NULL CHECK \(tipo IN \(([^)]*)\)\)/)
  assert.ok(origen)
  for (const t of [...origen![1]!.matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])) assert.ok(enSql.includes(t), `se pierde ${t}`)
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

test('con el interruptor apagado no se calcula aunque nadie se haya opuesto (puro)', async () => {
  const { puedeCalcularSenales, patrimonioSenalesActivas } = await import('../packages/module-patrimonio/src/senales.ts')
  assert.equal(puedeCalcularSenales({ interruptor: patrimonioSenalesActivas(undefined), oposiciones: [] }), false)
  assert.equal(puedeCalcularSenales({ interruptor: patrimonioSenalesActivas('0'), oposiciones: [null] }), false)
})

// ── Información y oposición (publicadas siempre) ─────────────────────────────

test('la ruta de la oposición NO depende del interruptor y responde 404 (nunca 403) sin sesión o en vista de corredor', () => {
  const src = sinComentarios(leer(PORTAL_RUTA))
  assert.doesNotMatch(src, /senalesActivas|PATRIMONIO_SENALES_ACTIVAS/, 'oponerse tiene que poder hacerse con el motor apagado')
  assert.match(src, /if \(!identidad \|\| identidad\.corredor\) return NextResponse\.json\(\{ error: 'no_encontrado' \}, \{ status: 404 \}\)/)
  assert.doesNotMatch(src, /status: 403/)
  const guarda = src.indexOf('identidad.corredor')
  for (const despues of ['req.json()', 'prisma.portalConsentimiento']) assert.ok(src.indexOf(despues) > guarda, `${despues} va antes de la guarda`)
  assert.doesNotMatch(src, /\.tipo\b/, 'el tipo no puede venir del cuerpo')
})

test('«Patrimonio» informa ANTES de calcular y ofrece oponerse; «Configuración» también, siempre', () => {
  const pag = sinComentarios(leer(PORTAL_PAGINA))
  assert.match(pag, /oposicionSenalesVigente\(identidad\.id\)/)
  assert.doesNotMatch(pag, /senalesActivas/, 'informar no depende del interruptor')
  assert.match(pag, /<OposicionSenalesPatrimonio inicial=\{oposicion\} conAviso \/>/)
  const conf = sinComentarios(leer(PORTAL_CONFIG))
  assert.match(conf, /<OposicionSenalesPatrimonio inicial=\{oposicion\} \/>/)
})

test('el apartado «3 bis» de la política de privacidad se publica SIEMPRE, con la variante de interés legítimo', () => {
  const src = sinComentarios(leer(PRIVACIDAD))
  assert.match(src, /^\s*<ApartadoSenalesPatrimonio \/>/m)
  assert.doesNotMatch(src, /senalesActivas/)
  const ap = sinComentarios(leer(APARTADO))
  assert.match(ap, /art\. 6\.1\.f RGPD/)
  assert.match(ap, /oponerte en cualquier momento/)
  assert.match(ap, /180 días/)
  assert.match(ap, /24 meses/)
  assert.doesNotMatch(ap, /6\.1\.a|solo si la marcas/i, 'quedan restos de la variante de consentimiento')
})

test('VERSION_TEXTOS_LEGALES es UNA constante y sube con el apartado publicado', async () => {
  const m = (await import('../packages/module-seguros/src/mediador.ts')) as Record<string, unknown>
  assert.equal(m.VERSION_TEXTOS_LEGALES, '2026-10-v2')
  assert.equal(m.FECHA_TEXTOS_LEGALES, '2026-10-26')
  for (const fuera of ['VERSION_TEXTOS_LEGALES_PATRIMONIO', 'FECHA_TEXTOS_LEGALES_PATRIMONIO', 'versionTextosLegales', 'fechaTextosLegales']) {
    assert.equal(m[fuera], undefined, `${fuera}: no puede haber una segunda versión de los textos`)
  }
})

test('los tipos: entra la oposición y NO el consentimiento previo (variante descartada)', async () => {
  const c = await import('../packages/module-seguros-portal/src/consentimiento.ts')
  assert.ok((c.TIPOS_CONSENTIMIENTO as readonly string[]).includes('oposicion_senales_patrimonio'))
  assert.ok((c.TIPOS_QUE_SE_REGISTRAN as readonly string[]).includes('oposicion_senales_patrimonio'))
  assert.ok(!(c.TIPOS_CONSENTIMIENTO as readonly string[]).includes('comercial_patrimonio'))
})

// ── Casilla de oposición ───────────────────────────────────────────────────

test('la casilla «No quiero…» solo nace marcada si consta la oposición, usa el texto del módulo y falla cerrada', () => {
  const src = sinComentarios(leer(PORTAL_CASILLA))
  assert.match(src, /useState\(inicial === true\)/, 'la oposición puede nacer marcada sin que conste')
  assert.match(src, /TEXTO_OPOSICION_SENALES/)
  assert.match(src, /setOpuesto\(anterior\)/, 'si falla el guardado la casilla debe volver a como estaba')
  assert.ok(!/checked=\{true\}|defaultChecked/.test(src))
})

test('la oposición es append-only: la ruta crea filas, jamás actualiza ni borra; y el portal no toca consentimientos viejos', () => {
  const src = sinComentarios(leer(PORTAL_RUTA))
  assert.match(src, /portalConsentimiento\.create/)
  assert.doesNotMatch(src, /portalConsentimiento\.(update|upsert|delete)/)
  assert.match(src, /tipo: TIPO_OPOSICION_SENALES/)
  assert.match(src, /versionTexto: VERSION_TEXTO_OPOSICION_SENALES/)
  // Ningún fichero del portal actualiza ni borra `portal_consentimiento` (el SQL le quita UPDATE/DELETE al rol).
  const malos: string[] = []
  const recorrer = (dir: string) => {
    for (const e of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) recorrer(p)
      else if (/\.(ts|tsx)$/.test(e.name) && /portalConsentimiento\.(update|updateMany|upsert|delete|deleteMany)\b/.test(leer(p))) malos.push(p)
    }
  }
  recorrer('apps/asegura-portal/app')
  recorrer('apps/asegura-portal/lib')
  assert.deepEqual(malos, [])
})

// ── Motor: no envía, no lee inquilinos, retiene lo justo ─────────────────────

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

test('el motor calcula salvo oposición vigente y retira las abiertas de quien se opone', () => {
  const src = sinComentarios(leer(ADAPTADOR))
  assert.match(src, /puedeCalcularSenales\(\{ interruptor: true, oposiciones, suprimida: fichaSuprimida\(/)
  assert.match(src, /planificarSenales\(\{ calculadas, existentes, permitido, hoy \}\)/)
  assert.match(src, /oposicionVigente\(/)
  assert.match(src, /tipo: TIPO_OPOSICION_SENALES/)
  assert.doesNotMatch(src, /comercial_patrimonio|COMERCIAL_PATRIMONIO/, 'restos de la variante de consentimiento previo')
})

test('retención: el cron (tras el interruptor) borra lo caducado con el corte del módulo puro, y nada más borra señales', () => {
  const src = sinComentarios(leer(ADAPTADOR))
  const ejecutar = src.slice(src.indexOf('export async function ejecutarSenalesPatrimonio'), src.indexOf('async function purgarSenalesCaducadas'))
  assert.match(ejecutar, /resumen\.purgadas = await purgarSenalesCaducadas\(correduria\.id, hoy, ensayo\)/)
  const purga = src.slice(src.indexOf('async function purgarSenalesCaducadas'), src.indexOf('export async function colaSenalesPatrimonio'))
  assert.match(purga, /corteRetencionSenales\(hoy\)/)
  assert.match(purga, /if \(ensayo\)/, 'el ensayo no borra')
  assert.equal((src.match(/delete from portal_patrimonio_senal/g) ?? []).length, 1, 'solo la purga borra señales')
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

test('la cola «Patrimonio» está montada en la campana (antes en «Hoy»; desde el 26/10/2026 es aviso puntual)', () => {
  assert.match(leer('apps/plataforma/app/(usuario)/correduria/CampanaAvisos.tsx'), /<OportunidadesPatrimonio \/>/)
})
