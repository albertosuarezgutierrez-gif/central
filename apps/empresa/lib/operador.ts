// Puerto del OPERADOR (Alberto desde plataforma → /operador/empresas): vista previa, emisión + envío del contrato,
// reenvío/recordatorio. Orquestación PURA con puertos inyectados (test/operador.test.ts).
//
// Reglas que sostiene (spec §6):
//  · Vista previa (dry-run): anexo resultante = lo VIGENTE + lo pedido; si falta un dato → «Falta: …» y no se puede seguir.
//  · El clic del operador ES el OK de ESE envío: `confirmo_destinatario` debe ser el correo del dueño ACTUAL (si cambió
//    entre la vista previa y el clic → 409 y se vuelve a enseñar). La BD lo vuelve a comprobar en la misma transacción.
//  · Plantilla en borrador (marcas «pendiente de confirmar») → exige `confirmo_borrador` explícito.
//  · Sin proveedor de correo → 503 ANTES de emitir. Si el proveedor falla tras emitir: el contrato queda emitido, `envio`
//    = fallido, y el operador ve «No salió el correo · Reintentar» (otro clic = otro OK). Nunca se reintenta solo.
import {
  CATALOGO, normalizarHerramientas, variablesContrato, renderContrato, sha256Hex, marcasPendientes, caducaEn, numeroContrato,
  type Encargado, type IdHerramienta, type TituloRepresentacion, type VariablesContrato,
} from '@central/core-herramientas'
import { correoContrato, type CanalCorreo } from './canal-correo.ts'

export type DatosEmision = {
  cuenta: { id: string; cif: string; razon_social: string; via: string | null; numero: string | null; resto: string | null; cp: string | null; municipio: string | null; provincia: string | null }
  dueno: { persona_id: string; email: string; nombre: string; nif: string | null; titulo: TituloRepresentacion | null } | null
  plantilla: { id: string; version: string; estado: 'borrador' | 'revisada'; texto: string; sha256: string } | null
  siguiente: number
  vigentes: string[]
  con_ref: string[]
}

export interface RepoOperador {
  datosEmision(cuentaId: string): Promise<DatosEmision | null>
  emitirVersion(e: { cuentaId: string; herramientas: IdHerramienta[]; plantillaId: string; variables: VariablesContrato; html: string; sha: string; confirmo: string; caduca: Date; actor: string }): Promise<{ versionId: string; n: number; envioId: string }>
  reservarEnvio(versionId: string, tipo: 'contrato' | 'recordatorio', confirmo: string, actor: string): Promise<{ envioId: string; destinatario: string; razonSocial: string }>
  resolverEnvio(envioId: string, estado: 'aceptado' | 'fallido', proveedorId: string | null, error: string | null): Promise<void>
}

export type Previa =
  | { ok: true; herramientas: IdHerramienta[]; nuevas: IdHerramienta[]; destinatario: string; version: number; borrador: boolean; marcasPendientes: number; anexo: string[] }
  | { ok: false; status: 400 | 404 | 422; error: string; faltan?: string[] }

export function previsualizar(d: DatosEmision | null, pedidas: unknown, encargado: Encargado, ahora: Date): Previa & { html?: string; variables?: VariablesContrato } {
  if (!d) return { ok: false, status: 404, error: 'cuenta_no_existe' }
  const lista = normalizarHerramientas(pedidas)
  if (!lista) return { ok: false, status: 400, error: 'herramientas_invalidas' }
  if (!d.plantilla) return { ok: false, status: 422, error: 'sin_plantilla', faltan: ['plantilla del contrato publicada (migración 0002)'] }
  const vigentes = normalizarHerramientas(d.vigentes) ?? []
  const todas = normalizarHerramientas([...vigentes, ...lista])!
  const faltanRef = todas.filter((h) => !d.con_ref.includes(h)).map((h) => `${CATALOGO[h].refEtiqueta} («${CATALOGO[h].nombre}»): da de alta la empresa en la app y pega su id`)
  const r = variablesContrato({
    cuenta: { razonSocial: d.cuenta.razon_social, cif: d.cuenta.cif, domicilio: { via: d.cuenta.via, numero: d.cuenta.numero, resto: d.cuenta.resto, cp: d.cuenta.cp, municipio: d.cuenta.municipio, provincia: d.cuenta.provincia } },
    firmante: d.dueno ? { nombre: d.dueno.nombre, nif: d.dueno.nif, titulo: d.dueno.titulo, email: d.dueno.email } : null,
    encargado, herramientas: todas, numero: numeroContrato(d.cuenta.cif), version: d.siguiente, plantillaVersion: d.plantilla.version, fecha: ahora,
  })
  const faltan = [...(r.ok ? [] : r.faltan), ...faltanRef]
  if (!r.ok || faltan.length) return { ok: false, status: 422, error: 'faltan_datos', faltan }
  const html = renderContrato(d.plantilla.texto, r.variables)
  return {
    ok: true, herramientas: todas, nuevas: todas.filter((h) => !vigentes.includes(h)), destinatario: d.dueno!.email,
    version: d.siguiente, borrador: d.plantilla.estado === 'borrador', marcasPendientes: marcasPendientes(html),
    anexo: todas.map((h) => CATALOGO[h].nombre), html, variables: r.variables,
  }
}

export type ResultadoActivar =
  | { ok: true; versionId: string; n: number; correo: 'aceptado' | 'fallido'; error?: string }
  | { ok: false; status: number; error: string; faltan?: string[]; destinatario?: string }

const errorBd = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** Traduce las excepciones de las funciones SQL (por su texto) a un status HTTP. */
export function statusDeErrorBd(msg: string): { status: number; error: string } {
  for (const [clave, status] of [['destinatario_cambiado', 409], ['version_desfasada', 409], ['variables_de_otro_dueno', 409], ['sin_dueno', 422],
    ['falta_ref_externa', 422], ['version_no_firmable', 409], ['version_no_existe', 404], ['version_no_anulable', 409], ['es_el_dueno', 409],
    ['herramienta_no_contratada', 422], ['rol_invalido', 400], ['titulo_invalido', 400], ['faltan_correo_o_nombre', 400],
    ['ref_no_editable', 409], ['miembro_no_existe', 404]] as const) {
    if (msg.includes(clave)) return { status, error: clave }
  }
  return { status: 500, error: 'error_bd' }
}

export async function activar(
  repo: RepoOperador, canal: CanalCorreo | null,
  e: { cuentaId: string; herramientas: unknown; confirmoDestinatario: unknown; confirmoBorrador: unknown; actor: string; urlContrato: string },
  encargado: Encargado, ahora = new Date(),
): Promise<ResultadoActivar> {
  const d = await repo.datosEmision(e.cuentaId)
  const p = previsualizar(d, e.herramientas, encargado, ahora)
  if (!p.ok) return p
  const confirmo = typeof e.confirmoDestinatario === 'string' ? e.confirmoDestinatario.trim().toLowerCase() : ''
  if (confirmo !== p.destinatario) return { ok: false, status: 409, error: 'destinatario_cambiado', destinatario: p.destinatario }
  if (p.borrador && e.confirmoBorrador !== true) return { ok: false, status: 422, error: 'falta_confirmar_borrador' }
  if (!canal) return { ok: false, status: 503, error: 'canal_no_disponible' }
  let emitida: { versionId: string; n: number; envioId: string }
  try {
    emitida = await repo.emitirVersion({
      cuentaId: e.cuentaId, herramientas: p.herramientas, plantillaId: d!.plantilla!.id, variables: p.variables!,
      html: p.html!, sha: await sha256Hex(p.html!), confirmo, caduca: caducaEn(ahora), actor: e.actor,
    })
  } catch (err) {
    return { ok: false, ...statusDeErrorBd(errorBd(err)) }
  }
  const envio = await canal.enviar(p.destinatario, correoContrato({ razonSocial: p.variables!.empresa.razon_social, tipo: 'contrato', url: e.urlContrato }))
  await repo.resolverEnvio(emitida.envioId, envio.ok ? 'aceptado' : 'fallido', envio.ok ? envio.id : null, envio.ok ? null : envio.error)
  return { ok: true, versionId: emitida.versionId, n: emitida.n, correo: envio.ok ? 'aceptado' : 'fallido', ...(envio.ok ? {} : { error: 'envio_fallido' }) }
}

/** Reenvío del contrato que no salió o recordatorio: un clic = un envío. Jamás automático. */
export async function reenviar(
  repo: RepoOperador, canal: CanalCorreo | null,
  e: { versionId: string; tipo: 'contrato' | 'recordatorio'; confirmoDestinatario: unknown; actor: string; urlContrato: string },
): Promise<{ ok: true; correo: 'aceptado' | 'fallido' } | { ok: false; status: number; error: string }> {
  if (!canal) return { ok: false, status: 503, error: 'canal_no_disponible' }
  const confirmo = typeof e.confirmoDestinatario === 'string' ? e.confirmoDestinatario.trim().toLowerCase() : ''
  if (!confirmo) return { ok: false, status: 400, error: 'falta_confirmo_destinatario' }
  let r: { envioId: string; destinatario: string; razonSocial: string }
  try {
    r = await repo.reservarEnvio(e.versionId, e.tipo, confirmo, e.actor)
  } catch (err) {
    return { ok: false, ...statusDeErrorBd(errorBd(err)) }
  }
  const envio = await canal.enviar(r.destinatario, correoContrato({ razonSocial: r.razonSocial, tipo: e.tipo, url: e.urlContrato }))
  await repo.resolverEnvio(r.envioId, envio.ok ? 'aceptado' : 'fallido', envio.ok ? envio.id : null, envio.ok ? null : envio.error)
  return { ok: true, correo: envio.ok ? 'aceptado' : 'fallido' }
}
