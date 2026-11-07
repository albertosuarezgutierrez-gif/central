// Firma del contrato por el DUEÑO. Orquestación PURA (test/firma.test.ts): comprobaciones baratas primero, el código de
// firma DESPUÉS (no se gasta un código en una firma que iba a fallar), y la escritura en UNA llamada a la BD
// (`herramientas.firmar_version`, que vuelve a comprobar rol, estado, caducidad y hash: defensa en profundidad).
//
// Cepos: admin/consulta intentando firmar → 403 · hash visto ≠ guardado → 409 «el documento ha cambiado» · documento
// guardado que ya no cuadra con su hash → 409 · nombre tecleado ≠ firmante → 422 · título distinto del del contrato → 409
// · sin marcar el consentimiento → 422 · versión caducada/anulada → 409.
import { FirmaPropia, TEXTO_CONSENTIMIENTO, nombreCoincide } from '@central/core-firma'
import { certificadoHtml, firmable, puede, sha256Hex, TITULOS, esTitulo, type EstadoVersion, type Rol, type VariablesContrato } from '@central/core-herramientas'

export type VersionParaFirmar = {
  id: string; n: number; estado: EstadoVersion; caducaEn: Date; documentoHtml: string; documentoSha256: string
  destinatarioPersonaId: string; cuentaId: string; variables: VariablesContrato
}

export interface RepoFirma {
  version(versionId: string): Promise<VersionParaFirmar | null>
  rol(cuentaId: string): Promise<Rol | null>
  firmar(a: { versionId: string; nombre: string; titulo: string; ip: string; ua: string; shaVisto: string; firmadoEn: Date; evidencia: unknown; certificadoHtml: string; certificadoSha: string }): Promise<string>
}

export type EntradaFirma = { versionId: string; nombre: unknown; titulo: unknown; shaVisto: unknown; consiento: unknown; ip: string; ua: string }
export type ResultadoFirma = { ok: true; firmaId: string; certificadoSha: string; razonSocial: string; n: number } | { ok: false; status: number; error: string }

export async function prevalidar(repo: RepoFirma, persona: { id: string; email: string }, e: EntradaFirma, ahora: Date):
  Promise<{ ok: true; v: VersionParaFirmar; nombre: string; titulo: 'administrador' | 'apoderado'; sha: string } | { ok: false; status: number; error: string }> {
  const v = await repo.version(e.versionId)
  if (!v) return { ok: false, status: 404, error: 'version_no_existe' }
  if (!puede(await repo.rol(v.cuentaId), 'firmar')) return { ok: false, status: 403, error: 'solo_firma_el_dueno' }
  if (v.destinatarioPersonaId !== persona.id) return { ok: false, status: 403, error: 'version_de_otro_firmante' }
  if (!firmable(v, ahora)) return { ok: false, status: 409, error: 'version_no_firmable' }
  if (typeof e.shaVisto !== 'string' || e.shaVisto !== v.documentoSha256) return { ok: false, status: 409, error: 'documento_cambiado' }
  if ((await sha256Hex(v.documentoHtml)) !== v.documentoSha256) return { ok: false, status: 409, error: 'documento_cambiado' }
  if (e.consiento !== true) return { ok: false, status: 422, error: 'falta_consentimiento' }
  if (!esTitulo(e.titulo) || e.titulo !== v.variables.firmante.titulo) return { ok: false, status: 409, error: 'titulo_distinto' }
  const nombre = typeof e.nombre === 'string' ? e.nombre.trim() : ''
  if (!nombreCoincide(nombre, v.variables.firmante.nombre)) return { ok: false, status: 422, error: 'nombre_no_coincide' }
  return { ok: true, v, nombre, titulo: e.titulo, sha: v.documentoSha256 }
}

/** `canjear` = verificar el código de firma (se llama SOLO si todo lo demás cuadra). */
export async function firmarContrato(
  repo: RepoFirma, persona: { id: string; email: string }, e: EntradaFirma, canjear: () => Promise<{ ok: true } | { ok: false; status: number; error: string }>,
  marca: string, ahora = new Date(),
): Promise<ResultadoFirma> {
  const pre = await prevalidar(repo, persona, e, ahora)
  if (!pre.ok) return pre
  const c = await canjear()
  if (!c.ok) return c
  const { v } = pre
  const evidencia = await new FirmaPropia().firmar({
    firmante: { id: persona.id, nombre: v.variables.firmante.nombre, email: persona.email, dni: v.variables.firmante.nif },
    documento_id: v.id, bytes: new TextEncoder().encode(v.documentoHtml),
    contexto: { fecha: ahora.toISOString(), ip: e.ip, user_agent: e.ua }, metodo: 'otp_email', nombre_confirmado: pre.nombre,
  })
  if (evidencia.doc_hash !== v.documentoSha256) return { ok: false, status: 409, error: 'documento_cambiado' }
  const cert = certificadoHtml({
    numero: v.variables.contrato.numero, version: v.n, documentoSha256: v.documentoSha256, firmante: v.variables.firmante.nombre,
    nifFirmante: v.variables.firmante.nif, titulo: TITULOS[pre.titulo], email: persona.email, empresa: v.variables.empresa.razon_social,
    cif: v.variables.empresa.nif, firmadoEn: ahora, ip: e.ip, userAgent: e.ua, metodo: 'otp_email', consentimiento: TEXTO_CONSENTIMIENTO, marca,
  })
  const certificadoSha = await sha256Hex(cert)
  const firmaId = await repo.firmar({ versionId: v.id, nombre: pre.nombre, titulo: pre.titulo, ip: e.ip, ua: e.ua, shaVisto: pre.sha, firmadoEn: ahora, evidencia, certificadoHtml: cert, certificadoSha })
  return { ok: true, firmaId, certificadoSha, razonSocial: v.variables.empresa.razon_social, n: v.n }
}
