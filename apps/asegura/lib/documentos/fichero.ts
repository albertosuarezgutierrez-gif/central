// Qué ficheros aceptamos y por qué se rechaza uno.
//
// ─── Ya NO vive aquí: vive en `@central/module-seguros` ──────────────────────
// Este fichero tenía su propia copia de la regla (misma lista de tipos, tope de
// **12 MB**) mientras el paquete tenía otra (**10 MB**, el del CHECK
// `documentos_tamano` de `seguros.documentos`). Dos copias de «qué fichero se
// acepta» no se quedan iguales: aquí ya se habían separado, y el resultado era
// que un PDF de 11 MB pasaba la revisión de la pantalla y luego lo rechazaba la
// base de datos — un fallo que solo se ve con el fichero delante.
//
// Desde el 03/09/2026 la regla es UNA y está en el módulo puro, que es el que
// pueden importar las dos apps (el portal del cliente también sube ficheros a
// esa misma tabla). Aquí quedan solo los nombres viejos, para no tocar la
// pantalla que ya los usa.
//
// El paquete no importa nada externo (ni `node:*` ni red), así que sigue siendo
// cargable desde `node --test` y desde un componente de cliente.
export {
  revisarDocumento as revisarFichero,
  MIMES_DOCUMENTO as TIPOS_ACEPTADOS,
  MAX_BYTES_DOCUMENTO as TAMANO_MAXIMO_BYTES,
} from '@central/module-seguros'
