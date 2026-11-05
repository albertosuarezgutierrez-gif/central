// @central/module-portal-proveedor — portal del proveedor por enlace personalizado, agnóstico de sector. PURO.
// Cada vertical enchufa su BD (tablas de enlaces/documentos con RLS, función SECURITY DEFINER que resuelve el hash), su almacén de
// ficheros y su extractor IA; aquí solo vive la lógica: tokens, estados, subidas, case a tres bandas y borrador de factura.
export * from './token.ts'
export * from './estados.ts'
export * from './subida.ts'
export * from './borrador.ts'
export * from './xml.ts'
export * from './tres-bandas.ts'
