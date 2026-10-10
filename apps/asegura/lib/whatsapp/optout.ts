// PURO. RGPD: una conversación o ficha con opt-out de WhatsApp NO va a la IA (ni se reclama ni se analiza).
export function excluidaPorOptOut(c: { opt_out_conv?: boolean | null }, cliente: { optOut: boolean } | null): boolean {
  return c.opt_out_conv === true || cliente?.optOut === true
}

