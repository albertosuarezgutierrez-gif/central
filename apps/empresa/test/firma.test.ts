import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firmarContrato, type RepoFirma, type VersionParaFirmar } from '../lib/firma.ts'
import { MEDIADOR } from '../../../packages/legal-templates/src/encargado.ts'
import { variablesContrato, renderContrato, sha256Hex, type Rol } from '../../../packages/core-herramientas/src/index.ts'
import { PLANTILLA_ENCARGO_V1 } from '../../../packages/core-herramientas/src/plantilla-encargo-v1.ts'

const ahora = new Date()
async function version(): Promise<VersionParaFirmar> {
  const r = variablesContrato({ cuenta: { razonSocial: 'Global2 Instalaciones Técnicas, S.L.', cif: 'B05457247', domicilio: { via: 'Calle Prueba', numero: '2', cp: '41003', municipio: 'Sevilla', provincia: 'Sevilla' } },
    firmante: { nombre: 'Persona Dueña', nif: '28823484E', titulo: 'administrador', email: 'dueno@prueba.test' }, encargado: MEDIADOR, herramientas: ['contabilidad'],
    numero: 'ENC-B05457247', version: 1, plantillaVersion: 'v1', fecha: ahora })
  if (!r.ok) throw new Error(r.faltan.join())
  const html = renderContrato(PLANTILLA_ENCARGO_V1.texto, r.variables)
  return { id: '11111111-1111-4111-8111-111111111111', n: 1, estado: 'enviado', caducaEn: new Date(ahora.getTime() + 86_400_000), documentoHtml: html,
    documentoSha256: await sha256Hex(html), destinatarioPersonaId: 'p1', cuentaId: 'c1', variables: r.variables }
}
function repo(v: VersionParaFirmar, rol: Rol) {
  const firmas: unknown[] = []
  const r: RepoFirma = { async version() { return v }, async rol() { return rol }, async firmar(a) { firmas.push(a); return 'f1' } }
  return { r, firmas }
}
const persona = { id: 'p1', email: 'dueno@prueba.test' }
const entrada = (v: VersionParaFirmar) => ({ versionId: v.id, nombre: 'persona dueña', titulo: 'administrador', shaVisto: v.documentoSha256, consiento: true, ip: '1.2.3.4', ua: 'test' })

test('firma buena: código canjeado DESPUÉS de validar, evidencia con el hash exacto y certificado con hash', async () => {
  const v = await version(); const { r, firmas } = repo(v, 'dueno')
  let canjes = 0
  const x = await firmarContrato(r, persona, entrada(v), async () => { canjes++; return { ok: true } }, MEDIADOR.marca, ahora)
  assert.ok(x.ok); assert.equal(canjes, 1); assert.equal(firmas.length, 1)
  const a = firmas[0] as { evidencia: { doc_hash: string }; certificadoHtml: string; certificadoSha: string; shaVisto: string }
  assert.equal(a.evidencia.doc_hash, v.documentoSha256)
  assert.equal(a.certificadoSha, await sha256Hex(a.certificadoHtml))
  assert.ok(a.certificadoHtml.includes(v.documentoSha256))
})

for (const rol of ['admin', 'consulta'] as const) {
  test(`CEPO ${rol} intentando firmar → 403 y no se gasta el código`, async () => {
    const v = await version(); const { r, firmas } = repo(v, rol)
    let canjes = 0
    const x = await firmarContrato(r, persona, entrada(v), async () => { canjes++; return { ok: true } }, MEDIADOR.marca, ahora)
    assert.deepEqual([x.ok, !x.ok && x.status], [false, 403]); assert.equal(canjes, 0); assert.equal(firmas.length, 0)
  })
}

test('CEPO hash visto ≠ guardado → 409 «documento_cambiado»', async () => {
  const v = await version(); const { r, firmas } = repo(v, 'dueno')
  const x = await firmarContrato(r, persona, { ...entrada(v), shaVisto: '0'.repeat(64) }, async () => ({ ok: true }), MEDIADOR.marca, ahora)
  assert.deepEqual([x.ok, !x.ok && x.error], [false, 'documento_cambiado']); assert.equal(firmas.length, 0)
})

test('CEPO documento guardado alterado (no cuadra con su hash) → 409', async () => {
  const v = await version(); v.documentoHtml = v.documentoHtml.replace('Sevilla', 'Madrid')
  const x = await firmarContrato(repo(v, 'dueno').r, persona, entrada(v), async () => ({ ok: true }), MEDIADOR.marca, ahora)
  assert.deepEqual([x.ok, !x.ok && x.error], [false, 'documento_cambiado'])
})

test('nombre distinto, título distinto, sin consentimiento, caducado, otro firmante', async () => {
  const v = await version()
  const ok = async () => ({ ok: true as const })
  const f = (e: Partial<ReturnType<typeof entrada>>, vv = v, p = persona) => firmarContrato(repo(vv, 'dueno').r, p, { ...entrada(vv), ...e }, ok, MEDIADOR.marca, ahora)
  assert.equal((await f({ nombre: 'Otra Persona' }) as { error: string }).error, 'nombre_no_coincide')
  assert.equal((await f({ titulo: 'apoderado' }) as { error: string }).error, 'titulo_distinto')
  assert.equal((await f({ consiento: false }) as { error: string }).error, 'falta_consentimiento')
  assert.equal((await f({}, { ...v, caducaEn: new Date(ahora.getTime() - 1000) }) as { error: string }).error, 'version_no_firmable')
  assert.equal((await f({}, v, { id: 'p2', email: 'x@y.es' }) as { error: string }).error, 'version_de_otro_firmante')
})

test('código inválido → no se firma', async () => {
  const v = await version(); const { r, firmas } = repo(v, 'dueno')
  const x = await firmarContrato(r, persona, entrada(v), async () => ({ ok: false, status: 401, error: 'incorrecto' }), MEDIADOR.marca, ahora)
  assert.equal(x.ok, false); assert.equal(firmas.length, 0)
})
