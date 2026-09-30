/**
 * Lógica pura de los mensajes de "siguiente paso" por herramienta y resultado.
 * Genera textos adaptados a lo que la herramienta acaba de mostrar, sin promesas
 * de ahorro ni superlativos de precio.
 */

/**
 * Contexto de la calculadora de bonificación.
 * Sale de `CalculadoraBonificacion` tras calcular con datos del usuario.
 */
export type ContextoBonificacion = {
  tipo: 'bonificacion'
  compensa: boolean
  costeReal: number
}

/**
 * Contexto de la calculadora de vencimientos.
 * Cuando hay al menos un seguro con fecha válida.
 */
export type ContextoVencimientos = {
  tipo: 'vencimientos'
  proximas: number
  urgentes: number
}

/**
 * Contexto de la ventana de renovación.
 * Sale de `VentanaRenovacion` cuando calcula una fecha válida.
 * Fase: 'antes' = antes de que la compañía avise; 'ventana' = dentro de la ventana;
 * 'tarde' = plazo pasado, póliza se renovará una vez más.
 */
export type ContextoVentana = {
  tipo: 'ventana'
  ramo: string
  dias: number | null
  fase: 'antes' | 'ventana' | 'tarde'
}

/**
 * Contexto de la carta de baja.
 * Cuando la carta está lista (aunque falten huecos).
 * Estado del plazo: 'sin_fecha' = no ha puesto fecha; 'en_plazo' = a tiempo;
 * 'fuera_de_plazo' = plazo pasado, se renovará una vez más; 'vencida' = fecha ya pasó.
 */
export type ContextoCarta = {
  tipo: 'carta'
  ramo: string
  plazo: 'sin_fecha' | 'en_plazo' | 'fuera_de_plazo' | 'vencida'
  dias: number | null
}

export type Contexto = ContextoBonificacion | ContextoVencimientos | ContextoVentana | ContextoCarta

/**
 * Lo que genera cada herramienta: mensaje + textos de botones.
 */
export type SiguientePaso = {
  /** El párrafo que explica por qué contactar ahora. */
  mensaje: string
  /** Texto del botón de WhatsApp */
  etiquetaWhatsapp: string
  /** Texto preescrito para el WhatsApp, incluyendo el resultado */
  whatsappTexto: string
  /** Texto del botón de llamada */
  etiquetaLlamada: string
}

/**
 * Genera el bloque de "siguiente paso" adaptado a la herramienta y resultado.
 * Los textos NO contienen promesas de ahorro ni superlativos sobre el precio.
 */
export function siguientePaso(ctx: Contexto): SiguientePaso {
  switch (ctx.tipo) {
    case 'bonificacion':
      return bonificacion(ctx)
    case 'vencimientos':
      return vencimientos(ctx)
    case 'ventana':
      return ventana(ctx)
    case 'carta':
      return carta(ctx)
  }
}

function bonificacion(ctx: ContextoBonificacion): SiguientePaso {
  const resultado = ctx.compensa ? 'la bonificación vale más que el seguro' : `el seguro te sale a ${formatEur(ctx.costeReal)} al año`
  return {
    mensaje:
      'Con estos datos, un corredor puede revisar si te compensa mantener el seguro del banco. Gratis y sin compromiso.',
    etiquetaWhatsapp: 'Enviar por WhatsApp',
    whatsappTexto: `Acabo de calcular el coste real del seguro del banco: ${resultado}. Me gustaría que alguien lo revise conmigo.`,
    etiquetaLlamada: 'Que me llame un corredor',
  }
}

function vencimientos(ctx: ContextoVencimientos): SiguientePaso {
  const plural = ctx.proximas === 1 ? 'seguro' : 'seguros'
  return {
    mensaje: `Te quedan ${ctx.proximas} ${plural} con la fecha de decisión en los próximos 90 días${ctx.urgentes > 0 ? ` (${ctx.urgentes} este mes)` : ''}. Es el momento de revisarlos. Un corredor puede ayudarte.`,
    etiquetaWhatsapp: 'Enviar por WhatsApp',
    whatsappTexto: `He calculado que tengo ${ctx.proximas} ${plural} con vencimiento próximo. Me gustaría que alguien me ayude a revisarlos.`,
    etiquetaLlamada: 'Que me llame un corredor',
  }
}

function ventana(ctx: ContextoVentana): SiguientePaso {
  const ramoNombre = ctx.ramo ? ` de ${ctx.ramo}` : ''
  const diasTexto =
    ctx.dias === null ? 'Tu ventana para decidir es' : ctx.dias <= 0 ? 'Tu ventana para decidir ya se cerró' : `Te quedan ${ctx.dias} días para decidir`

  return {
    mensaje: `${diasTexto}${ramoNombre}. Un corredor puede revisar si te compensa mantenerlo o buscar alternativa.`,
    etiquetaWhatsapp: 'Enviar por WhatsApp',
    whatsappTexto: `Acabo de calcular mi ventana para decidir sobre${ramoNombre}. Me gustaría que alguien me ayude a revisar las opciones.`,
    etiquetaLlamada: 'Que me llame un corredor',
  }
}

function carta(ctx: ContextoCarta): SiguientePaso {
  const ramoTexto = ctx.ramo ? ` de ${ctx.ramo}` : ''
  return {
    mensaje: `¿Quieres que antes de enviarla busquemos una alternativa${ramoTexto}? Un corredor puede ayudarte a explorar opciones.`,
    etiquetaWhatsapp: 'Enviar por WhatsApp',
    whatsappTexto: `Tengo preparada la carta de baja${ramoTexto}. Antes de enviarla, me gustaría revisar si hay alternativas mejores.`,
    etiquetaLlamada: 'Que me llame un corredor',
  }
}

/**
 * Formatea un número como euros españoles: `2.162,49€`.
 * Para usar en el WhatsApp, sin el símbolo.
 */
function formatEur(numero: number): string {
  return numero.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: 'always',
  })
}
