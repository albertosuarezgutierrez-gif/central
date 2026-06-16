// Plantillas legales versionadas (RR.HH., casa de marcas). Render PURO a HTML autocontenido.
// Sin dependencias: lo consume cualquier vertical (rrhh hoy) que persista/firme el documento.

export type DatosPlantilla = {
  empresa: string
  trabajador: string
  dni?: string | null
  /** Fecha legible ya formateada (p. ej. "16/06/2026"). */
  fecha: string
}

export type Plantilla = {
  id: string
  titulo: string
  /** Versión de la plantilla. Subir versión al cambiar la ley → permite re-emitir/re-firmar. */
  version: string
  /** Carpeta destino sugerida en el expediente. */
  carpeta: string
  /** Devuelve un documento HTML completo y autocontenido. */
  render: (d: DatosPlantilla) => string
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Envoltura HTML común: cabecera con datos, cuerpo, línea de firma y pie con versión + aviso. */
function documento(meta: { titulo: string; version: string }, d: DatosPlantilla, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(meta.titulo)}</title>` +
    `<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1a1a1a;line-height:1.55}` +
    `h1{font-size:20px}h2{font-size:15px;margin-top:22px}.meta{color:#555;font-size:13px}ul{padding-left:18px}` +
    `.firma{margin-top:46px;border-top:1px solid #ccc;padding-top:12px;font-size:13px}.pie{margin-top:30px;color:#888;font-size:11px}</style>` +
    `</head><body>` +
    `<h1>${esc(meta.titulo)}</h1>` +
    `<p class="meta">Empresa: <strong>${esc(d.empresa)}</strong> · Trabajador/a: <strong>${esc(d.trabajador)}</strong>` +
    `${d.dni ? ` (DNI ${esc(d.dni)})` : ''} · Fecha: ${esc(d.fecha)}</p>` +
    cuerpo +
    `<div class="firma">Firmado por ${esc(d.trabajador)} — ${esc(d.empresa)}. La firma electrónica avanzada ` +
    `(Reglamento eIDAS, art. 26) vincula la identidad del firmante con el contenido del documento.</div>` +
    `<p class="pie">Plantilla «${esc(meta.titulo)}» · versión ${esc(meta.version)}. Documento generado como base; ` +
    `revísalo con tu asesoría legal antes de su uso definitivo.</p>` +
    `</body></html>`
}

export const PLANTILLAS: Plantilla[] = [
  {
    id: 'info_datos',
    titulo: 'Información de protección de datos al trabajador',
    version: '2026-06',
    carpeta: 'datos_personales',
    render: d => documento({ titulo: 'Información de protección de datos al trabajador', version: '2026-06' }, d, [
      `<p>En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), se informa a ${esc(d.trabajador)} de lo siguiente:</p>`,
      `<h2>Responsable del tratamiento</h2><p>${esc(d.empresa)}.</p>`,
      `<h2>Finalidad</h2><p>Gestión de la relación laboral: contrato, nóminas, expediente, prevención de riesgos, formación y obligaciones legales derivadas.</p>`,
      `<h2>Legitimación</h2><p>Ejecución del contrato de trabajo y cumplimiento de obligaciones legales del empleador.</p>`,
      `<h2>Conservación</h2><p>Durante la relación laboral y los plazos legales de prescripción aplicables tras su finalización.</p>`,
      `<h2>Destinatarios</h2><p>Administraciones públicas competentes (Seguridad Social, AEAT), entidad gestora de nóminas y proveedores necesarios para la gestión.</p>`,
      `<h2>Derechos</h2><p>Acceso, rectificación, supresión, oposición, limitación y portabilidad, dirigiéndose al responsable, así como reclamar ante la AEPD.</p>`,
      `<p>El trabajador declara haber sido informado de lo anterior.</p>`,
    ].join('')),
  },
  {
    id: 'confidencialidad',
    titulo: 'Acuerdo de confidencialidad',
    version: '2026-06',
    carpeta: 'contratos',
    render: d => documento({ titulo: 'Acuerdo de confidencialidad', version: '2026-06' }, d, [
      `<p>${esc(d.trabajador)} se compromete frente a ${esc(d.empresa)} a:</p>`,
      `<ul>`,
      `<li>Mantener la confidencialidad de toda información a la que acceda con ocasión de su puesto (datos de clientes, proveedores, procesos, datos personales y secretos empresariales).</li>`,
      `<li>No divulgar, copiar ni utilizar dicha información para fines ajenos a sus funciones.</li>`,
      `<li>Tratar los datos personales conforme al RGPD y a las instrucciones del responsable.</li>`,
      `<li>Mantener este deber tras la finalización de la relación laboral.</li>`,
      `</ul>`,
      `<p>El incumplimiento podrá dar lugar a responsabilidad disciplinaria, civil o penal según proceda.</p>`,
    ].join('')),
  },
  {
    id: 'codigo_conducta',
    titulo: 'Código de conducta',
    version: '2026-06',
    carpeta: 'contratos',
    render: d => documento({ titulo: 'Código de conducta', version: '2026-06' }, d, [
      `<p>${esc(d.trabajador)} declara conocer y aceptar el código de conducta de ${esc(d.empresa)}:</p>`,
      `<ul>`,
      `<li>Actuar con honestidad, respeto e igualdad de trato, sin discriminación ni acoso.</li>`,
      `<li>Cumplir la normativa de seguridad y salud en el trabajo (PRL) y el uso correcto de los equipos.</li>`,
      `<li>Evitar conflictos de interés y el uso indebido de recursos de la empresa.</li>`,
      `<li>Proteger la información y los datos personales conforme a la normativa vigente.</li>`,
      `<li>Comunicar de buena fe las irregularidades por los canales habilitados (Ley 2/2023).</li>`,
      `</ul>`,
      `<p>El trabajador se compromete a cumplir lo aquí establecido.</p>`,
    ].join('')),
  },
]

export const getPlantilla = (id: string): Plantilla | undefined => PLANTILLAS.find(p => p.id === id)

/** Resumen (sin la función render) para listar en una UI. */
export const listarPlantillas = (): { id: string; titulo: string; version: string }[] =>
  PLANTILLAS.map(({ id, titulo, version }) => ({ id, titulo, version }))
