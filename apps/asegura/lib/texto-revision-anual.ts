// El TEXTO del correo de revisión anual — PURO (sin BD, sin red), por el mismo
// motivo que `texto-vencimiento.ts`: qué se le dice al cliente es una decisión
// de negocio y tiene que poder probarse con `node --test`.
//
// 🚨 Lo que este correo NO dice, y no por estilo: no promete ahorro, no dice
// «mejor precio» ni «te lo mejoramos». Prometer resultado convierte una
// invitación a revisar en asesoramiento con obligación de análisis objetivo
// (RDL 3/2020) — la misma línea que vigila `lib/ramos.test.ts` en la web.
// Solo dice QUÉ vence, CUÁNDO, y que si quiere lo miramos juntos.

const ETIQUETA_TIPO: Record<string, string> = {
  auto: 'Coche',
  moto: 'Moto',
  hogar: 'Hogar',
  vida: 'Vida',
  salud: 'Salud',
  decesos: 'Decesos',
  responsabilidad_civil: 'Responsabilidad civil',
  comercio: 'Comercio',
  comunidades: 'Comunidad',
  accidentes: 'Accidentes',
  otros: 'Otro seguro',
}

export function etiquetaTipoSeguro(t: string | null): string {
  return (t && ETIQUETA_TIPO[t]) || 'Seguro'
}

function fechaEs(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type PolizaEnRevision = {
  /** `auto`, `hogar`… (el `tipo` de cartera o el `ramo` declarado). `null` = no se sabe. */
  tipo: string | null
  compania: string | null
  fechaVencimiento: Date
  /** `true` = la subió el cliente al portal (otra compañía); `false` = la lleva la casa. */
  declarada: boolean
}

export type DatosRevision = {
  nombre: string | null
  polizas: readonly PolizaEnRevision[]
}

/** Las palabras que este correo tiene PROHIBIDAS. Las vigila el test. */
export const PROHIBIDAS_REVISION = /ahorr|más barat|mejor precio|te lo mejoramos|garantiz/i

export function textoRevisionAnual(d: DatosRevision): { asunto: string; texto: string; html: string } {
  const orden = [...d.polizas].sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())
  const saludo = d.nombre ? `Hola, ${d.nombre.split(' ')[0]}.` : 'Hola.'
  const n = orden.length
  const asunto =
    n === 1
      ? `Tu seguro de ${etiquetaTipoSeguro(orden[0]!.tipo).toLowerCase()} vence el ${fechaEs(orden[0]!.fechaVencimiento)}: ¿lo revisamos?`
      : `Tienes ${n} seguros que vencen en los próximos meses: ¿los revisamos?`

  const lineas = orden.map((p) => {
    const que = `${etiquetaTipoSeguro(p.tipo)}${p.compania ? ` · ${p.compania}` : ''}`
    const quien = p.declarada ? ' (la subiste tú al portal)' : ''
    return `${que} — vence el ${fechaEs(p.fechaVencimiento)}${quien}`
  })

  const texto =
    `${saludo}\n\n` +
    `Una vez al año te escribimos con los seguros que tienes guardados en tu área de cliente y vencen pronto, ` +
    `por si quieres que los repasemos antes de que se renueven solos:\n\n` +
    lineas.map((l) => `· ${l}`).join('\n') +
    `\n\nSi quieres que miremos alguno contigo —coberturas, lo que ha cambiado en tu casa o en tu coche, o una alternativa—, ` +
    `responde a este correo y te llamamos. Si no, no hace falta que hagas nada.\n\n` +
    `Recibes este correo porque marcaste la casilla de revisión en tu área de cliente. Puedes desmarcarla ahí cuando quieras.\n\n— Grupo ASegura`

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px">` +
    `<p style="margin:0 0 12px">${esc(saludo)}</p>` +
    `<p style="margin:0 0 12px">Una vez al año te escribimos con los seguros que tienes guardados en tu área de cliente ` +
    `y vencen pronto, por si quieres que los repasemos antes de que se renueven solos:</p>` +
    `<ul style="margin:0 0 12px;padding-left:18px;color:#444">${lineas.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` +
    `<p style="margin:0 0 12px">Si quieres que miremos alguno contigo —coberturas, lo que ha cambiado en tu casa o en tu coche, ` +
    `o una alternativa—, responde a este correo y te llamamos. Si no, no hace falta que hagas nada.</p>` +
    `<p style="margin:0;color:#666;font-size:13px">Recibes este correo porque marcaste la casilla de revisión en tu área de cliente. ` +
    `Puedes desmarcarla ahí cuando quieras.</p>` +
    `<p style="margin:12px 0 0;color:#666;font-size:13px">— Grupo ASegura</p></div>`

  return { asunto, texto, html }
}
