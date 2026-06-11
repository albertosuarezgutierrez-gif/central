// Validadores fiscales (NIF/NIE/CIF e IBAN) — centralizados en @central/core-fiscal.
// Se importan por el subpath `/validacion` (TS puro, sin node:crypto) para que sean
// seguros en componentes cliente. Re-export para no tocar a los consumidores.
export { validarNifCif, validarIban } from '@central/core-fiscal/validacion'
export type { Validacion } from '@central/core-fiscal/validacion'
