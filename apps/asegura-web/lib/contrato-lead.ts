// Contrato del formulario de leads, visto desde esta app.
//
// 🚨 Es una COPIA del contrato que valida `apps/plataforma/lib/leads-web.ts`,
// que es quien manda. No se puede importar: son dos apps distintas con dos
// despliegues distintos, y esta no tiene (ni debe tener) acceso al código de
// plataforma en tiempo de ejecución.
//
// Una copia que nadie vigila se separa del original en cuanto alguien añade un
// ramo allí: el desplegable de aquí se quedaría corto y el visitante que quiere
// un seguro de decesos no encontraría su opción — sin que fallara nada. Por eso
// `contrato-lead.test.ts` LEE el fichero de plataforma y compara las dos listas.
// Si divergen, el test se pone rojo y dice cuál hay que tocar.

/** Ramos que ofrece el desplegable. Debe coincidir con `TIPOS_SEGURO_LEAD`. */
export const TIPOS_SEGURO = ['auto', 'moto', 'hogar', 'vida', 'salud', 'comunidades', 'comercio', 'otros'] as const
export type TipoSeguro = (typeof TIPOS_SEGURO)[number]

/** Etiquetas visibles. Las de plataforma son para su panel; estas, para el público. */
export const ETIQUETA_TIPO: Record<TipoSeguro, string> = {
  auto: 'Coche',
  moto: 'Moto',
  hogar: 'Hogar',
  vida: 'Vida',
  salud: 'Salud',
  comunidades: 'Comunidad de propietarios',
  comercio: 'Comercio o empresa',
  otros: 'Otro / no lo tengo claro',
}

/** Campo trampa. Un bot que lo rellene recibe «recibido» y no pasa nada más. */
export const CAMPO_HONEYPOT = 'web'

/** Tope del comentario libre, igual que en plataforma. */
export const MAX_COMENTARIO = 1000
