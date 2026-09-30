// Por dónde se comunica una BAJA a cada compañía (30/09/2026). PURO: sin BD, sin red.
//
// Allianz (C0109) NO tramita las bajas por correo: TODAS se solicitan en su extranet de mediadores, el
// PUE («Punto único de entrada»), y contesta en su intranet, no por correo. Decisión de Alberto: no se
// automatiza el PUE con un robot (baja irreversible, condiciones de uso, credenciales/MFA, volumen
// bajo); la intranet lo prepara y avisa, y él la tramita a mano. Ver `docs/ALLIANZ-PUE.md`.
// El resto de compañías siguen por correo (buzón de `compania_contactos`).

export const CODIGO_DGS_ALLIANZ = 'C0109'
export const URL_PUE_ALLIANZ = 'https://e-pacallianz.com/ngx-osn-ui-service/initial-selection'
export const OPERATIVA_PUE_BAJA = 'Anulación a vencimiento - Póliza Individual NO Vida'

export type CanalBaja = 'pue_allianz' | 'correo'

/** Sin código (NULL) NO es Allianz: cae a correo, que es lo que ya pasaba y pide buzón elegido a mano. */
export function canalBajaCompania(codigoDgs: string | null): CanalBaja {
  return codigoDgs !== null && codigoDgs.trim().toUpperCase() === CODIGO_DGS_ALLIANZ ? 'pue_allianz' : 'correo'
}

export const MOTIVO_NO_CORREO_ALLIANZ = 'Allianz se tramita en el PUE, no por correo'

/** Un dato de la ficha: `valor === null` es «no consta, míralo en la ficha», nunca un dato inventado. */
export type CampoPue = { etiqueta: string; valor: string | null }

export type FichaPue = { url: string; campos: CampoPue[]; texto: string }

const limpio = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Lo que Alberto tiene que teclear/pegar en el PUE para dar de baja una póliza de Allianz. */
export function fichaPueAllianz(d: {
  numeroPoliza: string | null; tomador: string | null; fechaEfectoBaja: string | null; motivo: string | null
}): FichaPue {
  const fecha = limpio(d.fechaEfectoBaja)
  const [a, m, dia] = fecha && /^\d{4}-\d{2}-\d{2}/.test(fecha) ? fecha.slice(0, 10).split('-') : []
  const campos: CampoPue[] = [
    { etiqueta: 'Operativa', valor: OPERATIVA_PUE_BAJA },
    { etiqueta: 'Buscar por', valor: 'Referencia = Póliza' },
    { etiqueta: 'Nº de póliza', valor: limpio(d.numeroPoliza) },
    { etiqueta: 'Aplicación', valor: '0' },
    { etiqueta: 'Tomador', valor: limpio(d.tomador) },
    { etiqueta: 'Fecha de efecto de la baja', valor: a ? `${dia}/${m}/${a}` : fecha },
    { etiqueta: 'Motivo', valor: limpio(d.motivo) },
  ]
  const texto = campos.map((c) => `${c.etiqueta}: ${c.valor ?? 'no consta, míralo en la ficha'}`).join('\n')
  return { url: URL_PUE_ALLIANZ, campos, texto }
}
