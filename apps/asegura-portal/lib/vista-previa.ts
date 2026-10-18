// «Ver como el cliente» (vista PREVIA de un presupuesto, también un borrador sin enviar), 18/10/2026. Lo PURO: sin BD
// ni sesión. La vista previa NO es un modo nuevo: es la vista de corredor (`lib/vista-corredor.ts`) aterrizando en la
// página del presupuesto. Lo que hace que sea solo lectura ya existe: el middleware veta toda escritura de `/api/*`
// con la cookie de corredor, `presupuestoDeSesion` no sella `visto_at` y los componentes no llaman a la IA con
// `corredor`. Aquí: a dónde aterrizar y los rótulos de los botones deshabilitados.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A dónde lleva la vista de corredor al abrirse: la bóveda, o la página de UN presupuesto si el enlace trae
 * `?presupuesto=<uuid>` («Ver como el cliente», 18/10/2026). Solo un uuid exacto compone la ruta: cualquier otra cosa
 * (ruta, URL, `..`) cae en `/boveda`. PURA.
 */
export function destinoVistaCorredor(presupuesto: string | null | undefined): string {
  const p = typeof presupuesto === 'string' ? presupuesto.trim() : ''
  return UUID.test(p) ? `/boveda/presupuesto/${p.toLowerCase()}` : '/boveda'
}


/** ¿Es la vista previa de un BORRADOR (Alberto mirando algo que el cliente todavía no ha recibido)? */
export function esVistaPreviaBorrador(p: { vistaDeCorredor: boolean; enviadoAt: Date | null }): boolean {
  return p.vistaDeCorredor && p.enviadoAt === null
}

export const TEXTOS_VISTA_PREVIA = {
  banda: 'Vista previa del BORRADOR: el cliente todavía no lo ha recibido. Es lo que verá cuando se lo envíes; aquí no se acepta, no se firma y no se llama a la IA.',
  aceptar: 'Vista previa: el cliente verá aquí el botón «La quiero» para elegir esta opción y firmarla.',
} as const
