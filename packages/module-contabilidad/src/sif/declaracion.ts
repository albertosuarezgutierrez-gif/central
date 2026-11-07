// Declaración responsable del productor del Sistema Informático de Facturación (SIF), RD 1007/2023 y Orden HAC/1177/2024. PURO.
//
// 🚨 NO INVENTA DATOS DEL PRODUCTOR. Todo sale de la configuración que se le pasa; un dato ausente es `null` y la declaración queda INCOMPLETA
// (`completa: false`, con la lista `faltan`), con marcas «[FALTA: …]» en el texto en vez de un valor supuesto. Tampoco decide por el productor si el
// sistema es VERI*FACTU: ese dato también viene de la configuración.
// ⚠ Contenido de la plantilla por CONTRASTAR con el art. 15 de la Orden HAC/1177/2024 por quien firme; el texto es una plantilla de trabajo, no asesoramiento.
// ⚠ El productor asume lo que declara: esta plantilla NO comprueba que el sistema cumpla (registro de facturación, huella, QR…); eso es responsabilidad del productor.
export type ConfiguracionSif = {
  productorRazonSocial: string | null
  productorNif: string | null
  productorDomicilio: string | null
  productorEmail: string | null
  sistemaNombre: string | null
  /** Identificador del sistema (código de 2 caracteres que el productor asigna). */
  sistemaId: string | null
  sistemaVersion: string | null
  /** true = solo VERI*FACTU; false = también modalidad no verificable; null = sin decidir. */
  soloVerifactu: boolean | null
  multiusuario: boolean | null
  lugar: string | null
}
export const CONFIG_SIF_VACIA: ConfiguracionSif = {
  productorRazonSocial: null, productorNif: null, productorDomicilio: null, productorEmail: null, sistemaNombre: null, sistemaId: null,
  sistemaVersion: null, soloVerifactu: null, multiusuario: null, lugar: null,
}
const ETIQUETAS: Record<keyof ConfiguracionSif, string> = {
  productorRazonSocial: 'razón social del productor', productorNif: 'NIF del productor', productorDomicilio: 'domicilio del productor', productorEmail: 'correo de contacto del productor',
  sistemaNombre: 'nombre del sistema informático', sistemaId: 'identificador del sistema (2 caracteres)', sistemaVersion: 'versión del sistema',
  soloVerifactu: 'si el sistema solo puede funcionar como VERI*FACTU', multiusuario: 'si el sistema es multiusuario', lugar: 'lugar de la declaración',
}
const NIF_RE = /^[A-Z0-9]{8,12}$/
const limpio = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const siNo = (v: unknown): boolean | null => {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : v
  if (t === true || t === 'si' || t === 'sí' || t === 'true' || t === '1') return true
  if (t === false || t === 'no' || t === 'false' || t === '0') return false
  return null
}

/** Lee la configuración de variables de entorno NO secretas (`SIF_*`). Lo que no esté, queda `null`. */
export function configSifDesdeEntorno(env: Readonly<Record<string, string | undefined>>): ConfiguracionSif {
  const nif = limpio(env.SIF_PRODUCTOR_NIF, 20)?.toUpperCase().replace(/[\s.\-]/g, '') ?? null
  const id = limpio(env.SIF_SISTEMA_ID, 2)
  return {
    productorRazonSocial: limpio(env.SIF_PRODUCTOR_RAZON_SOCIAL, 200), productorNif: nif && NIF_RE.test(nif) ? nif : null, productorDomicilio: limpio(env.SIF_PRODUCTOR_DOMICILIO, 300),
    productorEmail: limpio(env.SIF_PRODUCTOR_EMAIL, 200), sistemaNombre: limpio(env.SIF_SISTEMA_NOMBRE, 120), sistemaId: id && /^[A-Z0-9]{2}$/i.test(id) ? id.toUpperCase() : null,
    sistemaVersion: limpio(env.SIF_SISTEMA_VERSION, 60), soloVerifactu: siNo(env.SIF_SOLO_VERIFACTU), multiusuario: siNo(env.SIF_MULTIUSUARIO), lugar: limpio(env.SIF_LUGAR_DECLARACION, 100),
  }
}

export type DeclaracionSif = { completa: boolean; faltan: string[]; texto: string; titulo: string }

const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const fechaLarga = (d: Date) => `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`

export function declaracionResponsableSif(c: ConfiguracionSif, hoy: Date): DeclaracionSif {
  const faltan = (Object.keys(ETIQUETAS) as (keyof ConfiguracionSif)[]).filter((k) => c[k] === null || c[k] === undefined || c[k] === '').map((k) => ETIQUETAS[k])
  const f = (k: keyof ConfiguracionSif) => (c[k] === null || c[k] === undefined || c[k] === '' ? `[FALTA: ${ETIQUETAS[k]}]` : String(c[k]))
  const modalidad = c.soloVerifactu === null ? '[FALTA: si el sistema solo puede funcionar como VERI*FACTU]'
    : c.soloVerifactu ? 'solo puede utilizarse como sistema que remite voluntariamente los registros de facturación a la AEAT (VERI*FACTU)' : 'puede utilizarse tanto en la modalidad VERI*FACTU como en la modalidad sin remisión (no verificable)'
  const usuarios = c.multiusuario === null ? '[FALTA: si el sistema es multiusuario]' : c.multiusuario ? 'permite la utilización por varios usuarios' : 'no permite la utilización por varios usuarios'
  const texto = [
    'DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN',
    '',
    `${f('productorRazonSocial')}, con NIF ${f('productorNif')} y domicilio en ${f('productorDomicilio')} (contacto: ${f('productorEmail')}), en calidad de PRODUCTOR del sistema informático de facturación que se describe, declara bajo su responsabilidad:`,
    '',
    `1. Sistema: «${f('sistemaNombre')}», identificador ${f('sistemaId')}, versión ${f('sistemaVersion')}.`,
    `2. El sistema ${modalidad}, y ${usuarios}.`,
    '3. Que el sistema informático de facturación cumple lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, General Tributaria, en el Real Decreto 1007/2023, de 5 de diciembre, y en la Orden HAC/1177/2024, de 17 de octubre, y que garantiza la integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad de los registros de facturación.',
    '4. Que pondrá esta declaración a disposición de los usuarios del sistema y de la Administración tributaria cuando le sea requerida.',
    '',
    `En ${f('lugar')}, a ${fechaLarga(hoy)}.`,
    '',
    'Firma del productor: ______________________',
  ].join('\n')
  return { completa: faltan.length === 0, faltan, texto, titulo: 'Declaración responsable del sistema informático de facturación' }
}
