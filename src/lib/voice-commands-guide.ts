/**
 * voice-commands-guide.ts
 * FUENTE DE VERDAD de todos los comandos de voz disponibles en ia.rest.
 *
 * REGLA: Cuando se implemente un nuevo tipo en BrainResult + transcribe,
 * cambiar estado 'proximo' → 'activo' aquí. Se propaga automáticamente a:
 *   - ChuleteVoz (/edge y /kds y /running)
 *   - ManualVozTab (/owner → Protocolo de Voz → Chuleta)
 *
 * Estados:
 *   activo    → funciona hoy, el camarero puede usarlo
 *   proximo   → en roadmap P1/P2, no funciona aún
 *   pendiente → planificado a largo plazo
 */

export type EstadoComando = 'activo' | 'proximo' | 'pendiente'

export interface ComandoVoz {
  id: string
  tipo: string           // tipo BrainResult o descripción interna
  titulo: string
  descripcion: string
  ejemplos: string[]
  estado: EstadoComando
  icono: string
  roles: ('camarero' | 'jefe_sala' | 'cocina' | 'running')[]
}

export interface BloqueComandos {
  id: string
  titulo: string
  color: string
  comandos: ComandoVoz[]
}

export const VOICE_COMMANDS_GUIDE: BloqueComandos[] = [
  // ── COMANDAS ──────────────────────────────────────────────────────────────
  {
    id: 'comanda',
    titulo: 'Comandas',
    color: '#D9442B',
    comandos: [
      {
        id: 'comanda-simple',
        tipo: 'comanda',
        titulo: 'Pedido básico',
        descripcion: 'Cantidad + producto + mesa',
        ejemplos: ['T3 dos cañas', 'S4 tres menús', 'B1 una caña y una tónica'],
        estado: 'activo',
        icono: '🍽️',
        roles: ['camarero'],
      },
      {
        id: 'comanda-formato',
        tipo: 'comanda',
        titulo: 'Con formato (tapa / media / ración)',
        descripcion: 'Especifica la porción del producto',
        ejemplos: ['T3 tapa de bravas', 'S2 media de jamón', 'B1 ración de croquetas'],
        estado: 'activo',
        icono: '📐',
        roles: ['camarero'],
      },
      {
        id: 'comanda-nota',
        tipo: 'comanda',
        titulo: 'Con nota especial',
        descripcion: 'Cocción, alergias o instrucciones',
        ejemplos: ['S6 entrecot nota muy hecho', 'T3 cañas nota en copa', 'S4 ensalada nota sin cebolla'],
        estado: 'activo',
        icono: '📝',
        roles: ['camarero'],
      },
      {
        id: 'comanda-vinos',
        tipo: 'comanda',
        titulo: 'Vinos de carta',
        descripcion: 'Por alias, tipo o nombre',
        ejemplos: ['T3 tinto Ribera', 'S2 blanco Albariño', 'B1 tinto Verónica'],
        estado: 'activo',
        icono: '🍷',
        roles: ['camarero'],
      },
    ],
  },

  // ── MARCHAR ───────────────────────────────────────────────────────────────
  {
    id: 'marchar',
    titulo: 'Marchar',
    color: '#3F7D44',
    comandos: [
      {
        id: 'marchar-mesa',
        tipo: 'marchar',
        titulo: 'Marchar mesa completa',
        descripcion: 'Envía todos los ítems pendientes',
        ejemplos: ['marcha T3', 'mesa S4 lista', 'pasa T3'],
        estado: 'activo',
        icono: '🚀',
        roles: ['camarero', 'running'],
      },
      {
        id: 'marchar-item',
        tipo: 'marchar',
        titulo: 'Marchar ítem concreto',
        descripcion: 'Envía solo un plato específico',
        ejemplos: ['marcha el entrecot de T3', 'pasa las croquetas S1', 'marcha croquetas y entrecot T3'],
        estado: 'activo',
        icono: '🎯',
        roles: ['camarero', 'running'],
      },
    ],
  },

  // ── CUENTA ────────────────────────────────────────────────────────────────
  {
    id: 'cobro',
    titulo: 'Cuenta y cobro',
    color: '#D9442B',
    comandos: [
      {
        id: 'cuenta',
        tipo: 'cuenta',
        titulo: 'Pedir la cuenta',
        descripcion: 'Genera ticket de cuenta',
        ejemplos: ['T3 cuenta', 'cuenta a la mesa tres', 'cobrar T3'],
        estado: 'activo',
        icono: '🧾',
        roles: ['camarero'],
      },
      {
        id: 'cobro-metodo',
        tipo: 'cobro_metodo',
        titulo: 'Indicar método de pago',
        descripcion: 'Registra cómo paga la mesa',
        ejemplos: ['T3 cuenta tarjeta', 'T5 paga con Bizum', 'S2 efectivo'],
        estado: 'proximo',
        icono: '💳',
        roles: ['camarero'],
      },
      {
        id: 'cobro-dividido',
        tipo: 'cobro_dividido',
        titulo: 'Cobro dividido',
        descripcion: 'Divide la cuenta entre N personas',
        ejemplos: ['T3 cuenta dividir 2', 'cobra S4 entre tres'],
        estado: 'proximo',
        icono: '➗',
        roles: ['camarero'],
      },
      {
        id: 'invitar-item',
        tipo: 'invitar_item',
        titulo: 'Invitar (cortesía de la casa)',
        descripcion: 'Marca ítem como invitación',
        ejemplos: ['invita las cañas de T3', 'la sobremesa de S2 va invitada'],
        estado: 'proximo',
        icono: '🎁',
        roles: ['camarero'],
      },
    ],
  },

  // ── MODIFICACIONES ────────────────────────────────────────────────────────
  {
    id: 'modificacion',
    titulo: 'Modificar comanda',
    color: '#E8A33B',
    comandos: [
      {
        id: 'anular-item',
        tipo: 'anular_item',
        titulo: 'Quitar un producto',
        descripcion: 'Elimina un ítem ya comandado',
        ejemplos: ['quita la caña de T3', 'anula la ensalada de S4', 'borra el jamón de B1'],
        estado: 'proximo',
        icono: '❌',
        roles: ['camarero'],
      },
      {
        id: 'anular-comanda',
        tipo: 'anular_comanda',
        titulo: 'Anular toda la comanda',
        descripcion: 'Cancela todos los ítems pendientes',
        ejemplos: ['anula todo de T3', 'cancela la comanda de S5'],
        estado: 'proximo',
        icono: '🗑️',
        roles: ['camarero'],
      },
    ],
  },

  // ── ALERTAS ───────────────────────────────────────────────────────────────
  {
    id: 'alertas',
    titulo: 'Alertas y alérgenos',
    color: '#E8A33B',
    comandos: [
      {
        id: 'nota-mesa',
        tipo: 'nota_mesa',
        titulo: 'Alérgeno o preferencia de mesa',
        descripcion: 'Alerta visible en KDS para toda la mesa',
        ejemplos: ['T3 celíaco sin gluten en todo', 'S4 alergia al marisco', 'B1 vegana'],
        estado: 'proximo',
        icono: '⚠️',
        roles: ['camarero'],
      },
    ],
  },

  // ── MENSAJES ──────────────────────────────────────────────────────────────
  {
    id: 'mensajes',
    titulo: 'Mensajes al equipo',
    color: '#2B6A9E',
    comandos: [
      {
        id: 'aviso-rol',
        tipo: 'aviso',
        titulo: 'Mensaje a cocina / barra / sala',
        descripcion: 'Broadcast al destino indicado',
        ejemplos: ['mensaje a cocina T3 esperando segundos', 'avisa a barra que quieren agua', 'di a sala que cambiamos turno'],
        estado: 'activo',
        icono: '📢',
        roles: ['camarero', 'jefe_sala'],
      },
      {
        id: 'aviso-nombre',
        tipo: 'aviso',
        titulo: 'Mensaje directo a persona',
        descripcion: 'Push privado al compañero por nombre',
        ejemplos: ['Pablo T3 pide la cuenta', 'María ven a terraza uno', 'David sin gluten en S4'],
        estado: 'activo',
        icono: '💬',
        roles: ['camarero', 'jefe_sala'],
      },
      {
        id: 'aviso-seccion',
        tipo: 'aviso',
        titulo: 'Mensaje a sección de cocina',
        descripcion: 'Imprime en la impresora de esa partida',
        ejemplos: ['cocina caliente S1 tiene prisa', 'barra uno T4 quiere agua fría'],
        estado: 'activo',
        icono: '🖨️',
        roles: ['camarero', 'jefe_sala'],
      },
    ],
  },

  // ── GESTIÓN ───────────────────────────────────────────────────────────────
  {
    id: 'gestion',
    titulo: 'Gestión',
    color: '#2B6A6E',
    comandos: [
      {
        id: '86',
        tipo: '86',
        titulo: 'Producto agotado (86)',
        descripcion: 'Bloquea el producto en carta para este turno',
        ejemplos: ['86 croquetas', 'agotado el bacalao', 'se acabó la paella'],
        estado: 'activo',
        icono: '🚫',
        roles: ['camarero', 'jefe_sala'],
      },
      {
        id: 'recomendacion-vino',
        tipo: 'recomendacion_vino',
        titulo: 'Recomendar vino',
        descripcion: 'VOX sugiere vino de tu carta por maridaje',
        ejemplos: ['recomienda vino para el chuletón', 'qué vino va con el pescado de T3', 'blanco fresco para T4'],
        estado: 'activo',
        icono: '🍷',
        roles: ['camarero'],
      },
      {
        id: 'consulta-mesa',
        tipo: 'consulta_mesa',
        titulo: 'Consultar qué tiene una mesa',
        descripcion: 'VOX te responde con los ítems activos',
        ejemplos: ['¿qué tiene T3?', 'qué hay pedido en S4', '¿cuántas mesas tengo abiertas?'],
        estado: 'proximo',
        icono: '🔍',
        roles: ['camarero'],
      },
    ],
  },

  // ── ASISTENTE COCINA (jefe de partida) ───────────────────────────────────
  {
    id: 'asistente-cocina',
    titulo: 'Asistente IA — Jefe de cocina',
    color: '#2B6A6E',
    comandos: [
      {
        id: 'cocina-pendientes',
        tipo: 'consulta_pendientes',
        titulo: 'Cuántos pendientes de un producto',
        descripcion: 'Pregunta cuántas unidades de un plato están esperando salir',
        ejemplos: [
          '¿Cuántos solomillos pendientes?',
          '¿Cuántas croquetas quedan por marchar?',
          '¿Cuántos menús hay en cocina?',
        ],
        estado: 'activo',
        icono: '🔢',
        roles: ['cocina', 'jefe_sala'],
      },
      {
        id: 'cocina-mesa',
        tipo: 'consulta_mesa_cocina',
        titulo: 'Qué tiene pedido una mesa',
        descripcion: 'Ver todos los ítems activos de una mesa concreta',
        ejemplos: [
          '¿Qué tiene la mesa 4?',
          '¿Qué hay pendiente en terraza 3?',
          '¿Qué le falta salir a la S2?',
        ],
        estado: 'activo',
        icono: '🍽️',
        roles: ['cocina', 'jefe_sala'],
      },
      {
        id: 'cocina-alergicos',
        tipo: 'consulta_alergicos',
        titulo: 'Alérgicos en turno o mesa',
        descripcion: 'Detecta alertas de alérgenos en las comandas activas',
        ejemplos: [
          '¿Hay alérgicos en cocina ahora?',
          '¿La mesa 4 tiene alergia a algo?',
          '¿Alguna comanda con gluten marcado?',
        ],
        estado: 'activo',
        icono: '⚠️',
        roles: ['cocina', 'jefe_sala'],
      },
      {
        id: 'cocina-tiempo',
        tipo: 'consulta_tiempo',
        titulo: 'Qué lleva más tiempo esperando',
        descripcion: 'Detecta la comanda o plato con mayor tiempo en cocina',
        ejemplos: [
          '¿Qué lleva más tiempo sin salir?',
          '¿Cuál es la mesa más antigua?',
          '¿Hay algo que lleve más de 20 minutos?',
        ],
        estado: 'activo',
        icono: '⏱️',
        roles: ['cocina', 'jefe_sala'],
      },
      {
        id: 'cocina-stock',
        tipo: 'consulta_stock_cocina',
        titulo: 'Stock bajo de un artículo',
        descripcion: 'Pregunta por el stock disponible de ingredientes o elaboraciones',
        ejemplos: [
          '¿Cuánto queda de merluza?',
          '¿Hay stock bajo de algo?',
          '¿Queda ensaladilla?',
        ],
        estado: 'activo',
        icono: '📦',
        roles: ['cocina', 'jefe_sala'],
      },
      {
        id: 'cocina-elaboraciones',
        tipo: 'consulta_elaboraciones',
        titulo: 'Elaboraciones propias — caducidad',
        descripcion: 'Consulta qué elaboraciones están activas y cuánto tiempo les queda',
        ejemplos: [
          '¿Qué elaboraciones van a caducar hoy?',
          '¿Cuánto le queda a la ensaladilla?',
          '¿Hay algo a punto de caducar?',
        ],
        estado: 'activo',
        icono: '🏷️',
        roles: ['cocina', 'jefe_sala'],
      },
      {
        id: 'cocina-partida',
        tipo: 'consulta_partida',
        titulo: 'Estado de una partida',
        descripcion: 'Resumen del estado de cocina caliente, fría o barra',
        ejemplos: [
          '¿Cómo va la cocina caliente?',
          '¿Cuánto tiene barra pendiente?',
          'Estado de cocina fría',
        ],
        estado: 'activo',
        icono: '🔥',
        roles: ['cocina', 'jefe_sala'],
      },
    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Solo comandos activos — para ChuleteVoz en /edge */
export function getComandosActivos(rol?: string): BloqueComandos[] {
  return VOICE_COMMANDS_GUIDE.map(bloque => ({
    ...bloque,
    comandos: bloque.comandos.filter(c =>
      c.estado === 'activo' && (!rol || c.roles.includes(rol as never))
    ),
  })).filter(b => b.comandos.length > 0)
}

/** Todos los comandos — para panel /owner */
export function getTodosLosComandos(): BloqueComandos[] {
  return VOICE_COMMANDS_GUIDE
}

/** Stats para el panel del owner */
export function getStatsComandos() {
  const todos = VOICE_COMMANDS_GUIDE.flatMap(b => b.comandos)
  return {
    total:     todos.length,
    activos:   todos.filter(c => c.estado === 'activo').length,
    proximos:  todos.filter(c => c.estado === 'proximo').length,
    pendientes:todos.filter(c => c.estado === 'pendiente').length,
  }
}
