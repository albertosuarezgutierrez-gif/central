/**
 * Minimización de lo que sale a la IA (RGPD art. 5.1.c) al identificar a qué empleado pertenece una página de
 * nómina/documento. Para emparejar con la lista de NOMBRES solo hacen falta los nombres: se quitan IBAN, NSS,
 * DNI/NIE, correos y CUALQUIER cifra (importes, fechas, CCC, teléfonos). La verificación por DNI de
 * `distribuir-documentos` se hace en código con el texto ORIGINAL, que nunca sale.
 */
const IBAN = /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){2,7}(?:[ -]?[A-Z0-9]{1,4})?\b/gi
const DNI_NIE = /\b[XYZ]?[\s.-]?\d{1,2}[.\s]?\d{3}[.\s]?\d{3}[\s-]?[A-Z]\b/gi
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const CIFRAS = /\d[\d.,/:\s-]*\d|\d/g

export function textoMinimoParaIA(texto: string, max = 2000): string {
  return texto
    .replace(IBAN, '[IBAN]')
    .replace(EMAIL, '[EMAIL]')
    .replace(DNI_NIE, '[DOC]')
    .replace(CIFRAS, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}
