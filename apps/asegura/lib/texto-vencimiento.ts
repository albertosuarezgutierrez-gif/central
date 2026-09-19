// El TEXTO del correo de vencimiento — PURO (sin BD, sin red, sin Prisma), a
// propósito y por el mismo motivo que `renovaciones-aviso.ts` de plataforma:
// para poder probarlo con `node --test` sin arrastrar `./asegura-db` (que
// falla al resolverse fuera de un bundler) ni el cliente Prisma generado.
//
// Vive separado de `avisos-vencimiento.ts` (que sí hace todo lo de red y BD)
// solo por esto: la lógica en sí es una decisión de negocio (qué se le dice a
// quién), no un detalle de infraestructura.
import { eur } from './dinero.ts'

function fechaEs(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A quién se dirige el correo cuando NO es el propio tomador — la persona de
 *  referencia necesita saber de qué póliza y de qué titular se habla, o el
 *  correo no tiene contexto para quien lo abre. */
export type ParaTercero = { nombreTomador: string; rol: string }

export type DatosCorreo = {
  titulo: string
  fechaAccionable: Date
  fechaEvento: Date
  aseguradora: string | null
  numeroPoliza: string | null
  primaAnual: number | null
  /** `null` = se manda como siempre, dirigido al propio tomador (incluido el
   *  caso «su propio dato colgado de la póliza»: sigue siendo él mismo). */
  paraTercero?: ParaTercero | null
}

/**
 * La fecha que se le dice al cliente es la ACCIONABLE, no la del vencimiento
 * (art. 22 LCS). Decirle «vence el 15 de marzo» le deja creer que tiene hasta el
 * 15, cuando el plazo para oponerse se le pasó 30 días antes.
 */
export function textoAviso(d: DatosCorreo): { asunto: string; texto: string; html: string } {
  const accionable = fechaEs(d.fechaAccionable)
  const vence = fechaEs(d.fechaEvento)
  const detalle = [
    d.aseguradora ? `Compañía: ${d.aseguradora}` : null,
    d.numeroPoliza ? `Nº de póliza: ${d.numeroPoliza}` : null,
    d.primaAnual !== null ? `Prima anual: ${eur(d.primaAnual)}` : null,
  ].filter((x): x is string => x !== null)

  const tercero = d.paraTercero ?? null
  const asunto = tercero
    ? `Tienes hasta el ${accionable} para decidir sobre ${d.titulo} de ${tercero.nombreTomador}`
    : `Tienes hasta el ${accionable} para decidir sobre ${d.titulo}`
  // La primera frase cambia según a quién se dirige: al tomador se le habla en
  // segunda persona («tu seguro»); a un tercero se le explica de QUIÉN es la
  // póliza y por qué le llega a él — nunca se le hace creer que es su seguro.
  const apertura = tercero
    ? `${d.titulo} de ${tercero.nombreTomador}\n\nTe escribimos como ${tercero.rol} de ${tercero.nombreTomador}, ` +
      `porque no tenemos un contacto directo suyo para este aviso.\n\n`
    : `${d.titulo}\n\n`
  const texto =
    apertura +
    `Puede${tercero ? '' : 's'} actuar hasta el ${accionable}. Es la última fecha para comunicar que no ` +
    `quiere${tercero ? '' : 's'} renovar; después la póliza se prorroga sola. El seguro vence el ${vence}.\n\n` +
    (detalle.length ? detalle.join('\n') + '\n\n' : '') +
    `Si quieres que lo revisemos juntos, responde a este correo.\n\n— Grupo ASegura`
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px">` +
    `<p style="margin:0 0 12px"><strong>${esc(d.titulo)}${tercero ? ` de ${esc(tercero.nombreTomador)}` : ''}</strong></p>` +
    (tercero
      ? `<p style="margin:0 0 12px;color:#444">Te escribimos como ${esc(tercero.rol)} de ${esc(tercero.nombreTomador)}, ` +
        `porque no tenemos un contacto directo suyo para este aviso.</p>`
      : '') +
    `<p style="margin:0 0 12px">Puede${tercero ? '' : 's'} actuar hasta el <strong>${esc(accionable)}</strong>. ` +
    `Es la última fecha para comunicar que no quiere${tercero ? '' : 's'} renovar; después la póliza se prorroga sola. ` +
    `El seguro vence el ${esc(vence)}.</p>` +
    (detalle.length
      ? `<ul style="margin:0 0 12px;padding-left:18px;color:#444">${detalle.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
      : '') +
    `<p style="margin:0;color:#666;font-size:13px">Si quieres que lo revisemos juntos, responde a este correo.</p>` +
    `</div>`
  return { asunto, texto, html }
}
