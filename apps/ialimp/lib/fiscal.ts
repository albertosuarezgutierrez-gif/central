// Validadores fiscales (NIF/NIE/CIF e IBAN) — centralizados en @iarest/core-fiscal.
// Se importan por el subpath `/validacion` (TS puro, sin node:crypto) para que sean
// seguros en componentes cliente. Re-export para no tocar a los consumidores.
export { validarNifCif, validarIban } from '@iarest/core-fiscal/validacion'
export type { Validacion } from '@iarest/core-fiscal/validacion'
