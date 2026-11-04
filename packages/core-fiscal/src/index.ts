// @central/core-fiscal — núcleo fiscal compartido (casa de marcas).
// Universal (IVA, XML) + jurisdicción España/AEAT. Diseño "conector por
// jurisdicción": otras jurisdicciones se añaden como submódulos (es/, pt/, …).

// Universal
export { calcularFiscal } from './iva.ts'
export { escapeXml } from './xml.ts'

// España / AEAT VeriFactu (también accesible vía '@central/core-fiscal/es')
export * from './es/index.ts'

// Validación documental (ES): NIF/NIE/CIF e IBAN
export { validarNifCif, validarIban } from './validacion.ts'
export type { Validacion } from './validacion.ts'
