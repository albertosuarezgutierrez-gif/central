export const TIPO_CLIENTE = {
  apartamentos_turisticos: { label: 'Pisos turísticos', icon: '🏨', color: '#6366f1' },
  particular:              { label: 'Casa particular',  icon: '🏡', color: '#ec4899' },
  comunidad:               { label: 'Comunidad',        icon: '🏢', color: '#0ea5e9' },
  final_obra:              { label: 'Final de obra',    icon: '🏗️', color: '#f59e0b' },
  oficinas:                { label: 'Oficinas',         icon: '💼', color: '#10b981' },
  otro:                    { label: 'Otro',             icon: '📋', color: '#64748b' },
} as const

export type TipoCliente = keyof typeof TIPO_CLIENTE
