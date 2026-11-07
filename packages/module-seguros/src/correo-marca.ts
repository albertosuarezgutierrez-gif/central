// La marca en TODOS los correos al cliente: vive en `@central/legal-templates/correo-marca` (paquete neutro, 07/11/2026)
// para que las herramientas la usen sin importar module-seguros. Se re-exporta aquí: nadie cambia sus imports.
export { LOGO_CORREO_URL, PIE_MARCA_CORREO, conMarcaCorreo } from '../../legal-templates/src/correo-marca.ts'
