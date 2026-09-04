// lib/domotica/parte-latido.ts — el PARTE del latido de accesos. Decisión PURA (sin BD ni red).
//
// POR QUÉ EXISTE (04/09/2026). El detalle del latido decía «3 con ERROR» y ahí se acababa. Con eso,
// tres averías que mandan a sitios OPUESTOS se ven idénticas: una cerradura sin conexión (se arregla
// EN EL PISO), una suscripción de IoT Core caducada (platform.tuya.com) y un parámetro rechazado por
// la API (el repo). Y lo que lo hizo urgente: sin distinguirlas no se puede declarar un fallo como
// «pendiente conocido» sin taparlos todos — el silenciador se convertiría en un mute, que es
// exactamente lo que esta casa no hace.
//
// Los códigos van ORDENADOS y entre paréntesis a propósito: el conjunto de códigos ES la firma del
// fallo, y `latidos.ts` la usa como marcador literal (con su paréntesis de cierre) para decidir si el
// parte de hoy sigue siendo el fallo que ya se conocía. Un código NUEVO cambia la cadena y vuelve a
// sonar la alarma sin que nadie tenga que acordarse.

/** Saca los códigos de error de Tuya («Tuya 2001: device is offline») de los partes crudos. */
export function codigosTuya(errores: (string | undefined)[]): string[] {
  const vistos = new Set<string>()
  for (const e of errores) {
    for (const m of String(e ?? '').matchAll(/\bTuya (\d{3,10})\b/g)) vistos.add(m[1])
  }
  // Orden NUMÉRICO, no lexicográfico: con texto, '28841002' iría antes que '2001' y la firma de un
  // mismo fallo cambiaría según el orden en que llegaran los pisos. La firma tiene que ser estable.
  return [...vistos].sort((a, b) => Number(a) - Number(b))
}

/**
 * Detalle del latido. `conError` es el RECUENTO (cuántos PIN fallaron) y los códigos son la CAUSA:
 * son cosas distintas y las dos hacen falta — 3 fallos por una cerradura caída no es lo mismo que
 * 3 fallos por tres causas.
 */
export function detalleAcceso(p: {
  cerraduras: number; creados: number; borrados: number; desajustados: number
  errores: (string | undefined)[]
}): string {
  const codigos = codigosTuya(p.errores)
  const partes = [`${p.cerraduras} cerradura(s)`, `${p.creados} PIN creado(s)`, `${p.borrados} borrado(s)`]
  if (p.desajustados) partes.push(`${p.desajustados} con la ventana desactualizada`)
  if (p.errores.length) {
    // Sin códigos reconocibles NO se inventa una firma: se dice que no se han podido leer, que es
    // otra cosa que «no hay». Un parte sin firma nunca casa un pendiente conocido → sigue alertando.
    partes.push(
      codigos.length
        ? `${p.errores.length} con ERROR (Tuya ${codigos.join(', ')})`
        : `${p.errores.length} con ERROR (sin código reconocible)`,
    )
  }
  return partes.join(' · ')
}

/** Marcador estable del conjunto de códigos, para `pendienteConocido.mientras` en `latidos.ts`. */
export function firmaCodigos(codigos: string[]): string {
  return `(Tuya ${codigos.join(', ')})`
}
