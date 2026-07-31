// ¿A nombre de QUIÉN viene la factura? El agente solo miraba al emisor (proveedor, NIF,
// importe) y daba por hecho que todo lo que llega al Gmail de Alberto es gasto suyo. No lo es:
// terceros le reenvían hilos con facturas ajenas adjuntas (caso fundacional 31/07/2026: la obra
// del tejado de la Hacienda El Triunfo, facturada a "El Triunfo CB", entró en la bandeja porque
// el abogado la mandó a MAPFRE y el hilo se reenvió a Alberto).
//
// Módulo PURO (sin imports) para que sea testeable con `node --test`.
//
// 🚨 Tres estados, no dos (regla del monorepo): 'nuestro' · 'ajeno' · 'desconocido'.
// Solo se descarta con identificación POSITIVA del receptor Y no-coincidencia. Cuando no se
// sabe leer a nombre de quién está, el veredicto es 'desconocido' y la factura sigue su curso
// normal — un falso 'ajeno' tira a la basura un gasto real sin que nadie se entere, que es
// mucho más caro que el ruido que evita.

export interface Titular {
  nif?: string | null
  nombre?: string | null
}

export type VeredictoReceptor = 'nuestro' | 'ajeno' | 'desconocido'

export interface Receptor {
  cliente?: string | null
  nif_cliente?: string | null
}

export interface DictamenReceptor {
  veredicto: VeredictoReceptor
  /** A nombre de quién parece estar la factura (para el aviso). */
  receptor: string | null
  motivo?: string
}

export function normalizaNifReceptor(s?: string | null): string {
  let v = (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  // CIF/NIF español a veces con prefijo de país "ES" (p.ej. "ES A-81864498").
  if (v.length === 11 && v.startsWith('ES')) v = v.slice(2)
  return v
}

// Formas jurídicas y ruido que sobra al comparar nombres ("PUNTO Y COMA GESTION, S.L." vs
// "Punto y Coma Gestión SL" tienen que casar).
const LEGAL_RECEPTOR = /\b(s\.?l\.?u?\.?|s\.?a\.?u?\.?|s\.?c\.?p?\.?|c\.?b\.?|sociedad\s+(?:limitada|anonima)|limitada|anonima|comunidad\s+de\s+bienes)\b\.?/g

export function normalizaNombreReceptor(s?: string | null): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(LEGAL_RECEPTOR, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Nombres genéricos que las facturas ponen en el campo cliente y que no identifican a nadie
// ("Cliente Varios" en la factura de LUANSA). No sirven para dictaminar.
const NOMBRE_VACIO = /^(varios|cliente|cliente varios|particular|contado|s n|sn|na|n a|-+)$/

/**
 * Dictamina si la factura está a nombre de uno de los titulares del usuario.
 *
 * - Por NIF: es el criterio fuerte. Si el receptor trae NIF y tenemos NIFs con los que comparar,
 *   coincidencia → 'nuestro'; no-coincidencia → 'ajeno'.
 * - Por nombre: solo sirve para CONFIRMAR ('nuestro'). Sin coincidencia se queda en
 *   'desconocido', nunca en 'ajeno': el nombre del cliente se lee mal demasiado a menudo
 *   (abreviado, partido en dos líneas, con el del proveedor pegado) como para tirar un gasto.
 * - Si el NIF del receptor es el MISMO que el del proveedor, el extractor los ha confundido:
 *   'desconocido', porque el dato no dice nada fiable.
 */
export function evaluaReceptor(
  f: Receptor & { nif_proveedor?: string | null },
  titulares: Titular[],
): DictamenReceptor {
  const nifRec = normalizaNifReceptor(f.nif_cliente)
  const nombreRec = normalizaNombreReceptor(f.cliente)
  const receptor = f.cliente?.trim() || f.nif_cliente?.trim() || null

  const nifsTitulares = titulares.map((t) => normalizaNifReceptor(t.nif)).filter(Boolean)
  const nombresTitulares = titulares.map((t) => normalizaNombreReceptor(t.nombre)).filter(Boolean)

  // El extractor confundió emisor y receptor → el dato no es utilizable.
  if (nifRec && nifRec === normalizaNifReceptor(f.nif_proveedor))
    return { veredicto: 'desconocido', receptor, motivo: 'NIF de cliente igual al del proveedor' }

  // Coincidencia por nombre: confirma, nunca descarta.
  const nombreUtil = nombreRec && !NOMBRE_VACIO.test(nombreRec)
  if (nombreUtil && nombresTitulares.some((t) => t === nombreRec || t.includes(nombreRec) || nombreRec.includes(t)))
    return { veredicto: 'nuestro', receptor }

  if (nifRec && nifsTitulares.length > 0) {
    if (nifsTitulares.includes(nifRec)) return { veredicto: 'nuestro', receptor }
    return {
      veredicto: 'ajeno',
      receptor,
      motivo: `Facturada a ${receptor || nifRec}, que no es ninguno de tus titulares`,
    }
  }

  return { veredicto: 'desconocido', receptor }
}

/**
 * ¿El "NIF del proveedor" es en realidad el NUESTRO? Pasa cuando el extractor coge el NIF del
 * cliente creyendo que es el del emisor (caso IONOS 29/07/2026: guardó el NIF de Alberto como
 * CIF de IONOS). Importa porque la huella del gasto se construye con ese NIF: si es el nuestro,
 * TODOS los proveedores comparten huella — nunca aprenden regla y el dedup deja de funcionar.
 */
export function nifProveedorEsNuestro(nifProveedor: string | null | undefined, titulares: Titular[]): boolean {
  const nif = normalizaNifReceptor(nifProveedor)
  if (!nif) return false
  return titulares.map((t) => normalizaNifReceptor(t.nif)).filter(Boolean).includes(nif)
}
