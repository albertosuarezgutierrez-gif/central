// El catálogo vive en `@central/module-seguros` desde el 23/09/2026: es la
// única fuente, y la leen también el portal del cliente y el puerto de asegura.
// Este fichero solo lo reexporta para que la web no cambie sus imports.
export {
  TELEFONOS_COMPANIAS, hrefTel, telefonosParaPublicar, whatsappLegible,
  type LineaAsistencia, type TelefonoCompania,
} from '@central/module-seguros'
