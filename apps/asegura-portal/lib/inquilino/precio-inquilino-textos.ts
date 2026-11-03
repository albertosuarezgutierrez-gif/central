// Constantes de «El inquilino pide precio» sin dependencias: las importa también la pantalla (cliente) sin arrastrar
// `@central/module-seguros`. La lógica vive en `precio-inquilino.ts`.
export const QUE_PIDE_INQUILINO = ['contenido', 'rc', 'ambos'] as const
export type QuePideInquilino = (typeof QUE_PIDE_INQUILINO)[number]
export const CANALES_INQUILINO = ['correo', 'telefono'] as const
export type CanalInquilino = (typeof CANALES_INQUILINO)[number]

export const ETIQUETA_QUE_PIDE: Record<QuePideInquilino, string> = {
  ambos: 'Mis cosas y mi responsabilidad civil',
  contenido: 'Solo mis cosas (contenido)',
  rc: 'Solo mi responsabilidad civil como inquilino',
}

export const MAX_NOMBRE_INQUILINO = 80
