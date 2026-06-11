// @central/core-fiscal — núcleo fiscal compartido (casa de marcas).
// Universal (IVA, XML) + jurisdicción España/AEAT. Diseño "conector por
// jurisdicción": otras jurisdicciones se añaden como submódulos (es/, pt/, …).

// Universal
export { calcularFiscal } from './iva'
export { escapeXml } from './xml'

// España / AEAT VeriFactu (también accesible vía '@central/core-fiscal/es')
export { calcularHuella, generarQrData, parseFechaLocalAEAT } from './es/aeat'
export type { RegistroFactura } from './es/aeat'

// Validación documental (ES): NIF/NIE/CIF e IBAN
export { validarNifCif, validarIban } from './validacion'
export type { Validacion } from './validacion'
