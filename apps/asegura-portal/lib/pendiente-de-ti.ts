/**
 * «Pendiente de ti» (ASegura OS §Q.4): una sola lista, arriba de «Mis seguros», con lo que la
 * correduría necesita del cliente. PURO: la página lee y esto decide qué se dice y en qué orden.
 *
 * Sustituye al «te mando un correo y espero»: hasta hoy un presupuesto solo se abría desde el enlace
 * del correo, y un recibo devuelto vivía dentro de la cartera plegada.
 *
 * 🚨 Tres estados por fuente, no dos: `null` = no se ha podido comprobar. Ese hueco se DECLARA en
 * `sinComprobar` y nunca se lee como «no tienes nada pendiente».
 */

export type ItemPendiente = {
  clave: string
  titulo: string
  detalle: string | null
  href: string
  urgente: boolean
}

export type PresupuestoPendiente = {
  id: string
  ramo: string
  venceEl: Date
  aceptado: boolean
  /** Datos que le faltan para contratar. `null` = no se ha podido comprobar; solo aplica si `aceptado`. */
  faltan: number | null
}

export type EntradaPendientes = {
  recibosDevueltos: { polizaId: string; etiqueta: string; n: number }[]
  /** Anulaciones esperando su firma. `null` = no se pudo leer. */
  anulaciones: number | null
  presupuestos: PresupuestoPendiente[] | null
  /** `true` = hay que confirmar el contacto; `false` = vigente; `null` = no se pudo comprobar. */
  contactoPorConfirmar: boolean | null
}

export type PendientesDeTi = { items: ItemPendiente[]; sinComprobar: string[] }

function fecha(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' })
}

export function pendientesDeTi(e: EntradaPendientes, ramo: (r: string) => string): PendientesDeTi {
  const items: ItemPendiente[] = []
  const sinComprobar: string[] = []

  // 1. Un recibo devuelto puede dejarle sin cobertura (art. 15 LCS): lo primero.
  for (const r of e.recibosDevueltos) {
    if (r.n <= 0) continue
    items.push({
      clave: `recibo:${r.polizaId}`,
      titulo: r.n === 1 ? `Tienes un recibo devuelto: ${r.etiqueta}` : `Tienes ${r.n} recibos devueltos: ${r.etiqueta}`,
      detalle: 'Si no se paga, la cobertura se suspende al mes del recibo. Mira cómo pagarlo en la póliza.',
      href: `/boveda/poliza/${r.polizaId}`,
      urgente: true,
    })
  }

  // 2. Su firma, que tiene fecha.
  if (e.anulaciones === null) sinComprobar.push('las cartas pendientes de tu firma')
  else if (e.anulaciones > 0) {
    items.push({
      clave: 'anulacion',
      titulo: e.anulaciones === 1 ? 'Firma la carta de anulación' : `Firma ${e.anulaciones} cartas de anulación`,
      detalle: 'Sin tu firma no podemos mandarla a la compañía.',
      href: '#firma-titulo',
      urgente: true,
    })
  }

  // 3. Presupuestos: primero los aceptados a los que les falta algo para contratar, luego los por elegir.
  if (e.presupuestos === null) sinComprobar.push('tus presupuestos')
  else {
    for (const p of e.presupuestos.filter((x) => x.aceptado)) {
      if (p.faltan === null) {
        items.push({
          clave: `datos:${p.id}`,
          titulo: `Comprueba si te falta algún dato para contratar ${ramo(p.ramo)}`,
          detalle: 'No hemos podido comprobarlo desde aquí.',
          href: `/boveda/presupuesto/${p.id}`,
          urgente: false,
        })
      } else if (p.faltan > 0) {
        items.push({
          clave: `datos:${p.id}`,
          titulo:
            p.faltan === 1
              ? `Te falta un dato para contratar ${ramo(p.ramo)}`
              : `Te faltan ${p.faltan} datos para contratar ${ramo(p.ramo)}`,
          detalle: 'Aceptaste el presupuesto: con esto lo podemos emitir.',
          href: `/boveda/presupuesto/${p.id}`,
          urgente: false,
        })
      }
    }
    const porElegir = e.presupuestos.filter((x) => !x.aceptado).sort((a, b) => a.venceEl.getTime() - b.venceEl.getTime())
    for (const p of porElegir) {
      items.push({
        clave: `presupuesto:${p.id}`,
        titulo: `Revisa tu presupuesto de ${ramo(p.ramo)}`,
        detalle: `Válido hasta el ${fecha(p.venceEl)}.`,
        href: `/boveda/presupuesto/${p.id}`,
        urgente: false,
      })
    }
  }

  // 4. El contacto: sin él no le llega ni el aviso de un recibo.
  if (e.contactoPorConfirmar === null) sinComprobar.push('tus datos de contacto')
  else if (e.contactoPorConfirmar) {
    items.push({
      clave: 'contacto',
      titulo: 'Confirma tu teléfono y tu correo',
      detalle: 'Es por donde te avisamos de renovaciones, recibos y siniestros.',
      href: '#aviso-contacto-titulo',
      urgente: false,
    })
  }

  return { items, sinComprobar }
}
