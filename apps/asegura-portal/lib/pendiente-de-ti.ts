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
  /**
   * Patrimonio (24/10/2026, P13). Ausente = esta superficie no lo consulta. `null` = no se ha podido comprobar (va a
   * `sinComprobar`, nunca «nada pendiente»). `sinRevisar` = inmuebles sin mirar si tienen seguro; `sinFecha` = vencimientos
   * de los que no sabemos cuándo tocan.
   */
  patrimonio?: {
    vencidas: number
    porVencer: number
    sinFecha: number
    sinRevisar: number | null
    /**
     * «¿Esto lo cubre tu seguro?» (25/10/2026): reparaciones confirmadas sin descartar, por desenlace. Ausente = esta
     * superficie no lo consulta; `null` = no se pudo leer (va a `sinComprobar`, nunca «nada que mirar»).
     */
    reparaciones?: { cubre: number; sinSeguro: number; sinComprobar: number } | null
  } | null
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

  // 5. Patrimonio: lo vencido, lo que se acerca, lo que no tiene fecha y los inmuebles sin revisar.
  if (e.patrimonio === null) sinComprobar.push('tu patrimonio')
  else if (e.patrimonio !== undefined) {
    const p = e.patrimonio
    if (p.vencidas > 0) {
      items.push({
        clave: 'patrimonio:vencidas',
        titulo: p.vencidas === 1 ? 'Tienes un vencimiento pasado en tu patrimonio' : `Tienes ${p.vencidas} vencimientos pasados en tu patrimonio`,
        detalle: 'Míralos en el calendario.',
        href: '/patrimonio/calendario',
        urgente: true,
      })
    }
    if (p.porVencer > 0) {
      items.push({
        clave: 'patrimonio:por_vencer',
        titulo: p.porVencer === 1 ? 'Se acerca un vencimiento de tu patrimonio' : `Se acercan ${p.porVencer} vencimientos de tu patrimonio`,
        detalle: null,
        href: '/patrimonio/calendario',
        urgente: false,
      })
    }
    if (p.sinFecha > 0) {
      items.push({
        clave: 'patrimonio:sin_fecha',
        titulo: p.sinFecha === 1 ? 'Dinos cuándo te toca una revisión de tu patrimonio' : `Dinos cuándo te tocan ${p.sinFecha} revisiones de tu patrimonio`,
        detalle: 'No sabemos la fecha, así que no podemos avisarte.',
        href: '/patrimonio/calendario',
        urgente: false,
      })
    }
    if (p.sinRevisar === null) sinComprobar.push('los seguros de tus inmuebles')
    else if (p.sinRevisar > 0) {
      items.push({
        clave: 'patrimonio:sin_revisar',
        titulo: p.sinRevisar === 1 ? 'Revisa si tu inmueble tiene seguro' : `Revisa si tus ${p.sinRevisar} inmuebles tienen seguro`,
        detalle: 'Enlaza el seguro que tengan o dinos que no tienen.',
        href: '/patrimonio',
        urgente: false,
      })
    }
    if (p.reparaciones === null) sinComprobar.push('si tu seguro cubre alguna reparación de tus inmuebles')
    else if (p.reparaciones !== undefined) {
      const { cubre, sinSeguro } = p.reparaciones
      if (cubre > 0) {
        items.push({
          clave: 'patrimonio:reparaciones_cubre',
          titulo: cubre === 1 ? 'Puede que tu seguro cubra una reparación' : `Puede que tu seguro cubra ${cubre} reparaciones`,
          detalle: 'Es un aviso, no una garantía. Si quieres, puedes dar parte desde ahí.',
          href: '/patrimonio/gastos#cubre-seguro',
          urgente: false,
        })
      }
      if (sinSeguro > 0) {
        items.push({
          clave: 'patrimonio:reparaciones_sin_seguro',
          titulo: sinSeguro === 1 ? 'Has pagado una reparación en una vivienda sin seguro de hogar visible' : `Has pagado ${sinSeguro} reparaciones en viviendas sin seguro de hogar visible`,
          detalle: 'No vemos seguro de hogar en esa vivienda. Enlázalo en la ficha del inmueble si lo tienes.',
          href: '/patrimonio/gastos#cubre-seguro',
          urgente: false,
        })
      }
    }
  }

  return { items, sinComprobar }
}
