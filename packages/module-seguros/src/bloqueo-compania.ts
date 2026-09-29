// Precio que la compañía deja BLOQUEADO al emitir (29/09/2026). Allianz lo avisa ya en la tarificación
// («ESTA POLIZA QUEDARÁ BLOQUEADA POR LA SIGUIENTE RAZÓN: INCENDIO-ROBO SIN DAÑOS») y aun así la moto de
// un cliente se emitió sin que nadie lo viera venir: el aviso iba entre los demás. Regla de Alberto:
// quien emite y el cliente lo ven ANTES; lo normal es emitir primero la básica (para que pueda
// circular) y pedir después la ampliación como suplemento, adjuntando la documentación.

/** El motivo del bloqueo que anuncia la compañía, `''` si lo anuncia sin motivo, `null` si no hay bloqueo. */
export function bloqueoCompania(avisos: readonly string[] | null | undefined): string | null {
  for (const a of avisos ?? []) {
    if (typeof a !== 'string' || !/BLOQUEAD[AO]/i.test(a)) continue
    const m = a.match(/BLOQUEAD[AO][^:]*:\s*([^,]+)/i)
    return m ? m[1].trim() : ''
  }
  return null
}

/** Lo que se le dice a quien emite, junto al precio y encima del botón. */
export function textoBloqueoCorredor(motivo: string): string {
  return `⛔ La compañía dejará esta póliza BLOQUEADA al emitirla${motivo ? ` (${motivo})` : ''}. `
    + 'Lo recomendable: emitir primero la modalidad básica, sin la garantía que bloquea, para que el cliente pueda circular, '
    + 'y pedir después la ampliación como suplemento adjuntando la documentación (fotos, factura…).'
}

/** Lo que ve el cliente en su comparativa. Sin promesas de precio ni de plazo. */
export function textoBloqueoCliente(): string {
  return 'Esta opción no queda activa al contratarla: la compañía la revisa antes con la documentación del vehículo (fotos, factura…). '
    + 'Si necesitas circular ya, podemos contratar primero la opción básica y ampliarla después.'
}
