// lib/seo-correduria/consultas.ts — las consultas que vigila el cron SEO de la correduría.
//
// FUENTE ÚNICA: `.claude/skills/seo-asegura/references/keywords.md` (§1 ramo, §2 intención de
// problema). El texto de `consulta` es IDÉNTICO a la primera celda de cada fila de esas dos
// tablas: `consultas.test.ts` lee ese fichero y compara los conjuntos, así que si la skill añade
// o cambia una consulta y aquí no se refleja (o al revés), el test se pone rojo.
//
// `pagina` = la ruta que la tabla cita como cobertura, o null cuando dice «—» / «sin página».
// «parcialmente /seguros/hogar» y «parcial» con ruta → esa ruta (existe una página que la cubre
// aunque no del todo; para el SERP lo que importa es que hay URL propia que puede posicionar).

export type Consulta = { consulta: string; pagina: string | null; grupo: 'ramo' | 'problema' }

export const CONSULTAS: Consulta[] = [
  // §1 Ramo — comercial, competencia media-alta
  { consulta: 'correduría de seguros', pagina: '/', grupo: 'ramo' },
  { consulta: 'seguro de hogar', pagina: '/seguros/hogar', grupo: 'ramo' },
  { consulta: 'seguro de comunidad de propietarios', pagina: '/seguros/comunidades', grupo: 'ramo' },
  { consulta: 'seguro de local comercial', pagina: '/seguros/comercio', grupo: 'ramo' },
  { consulta: 'seguro de coche', pagina: '/seguros/auto', grupo: 'ramo' },
  { consulta: 'seguro de vida / salud', pagina: '/seguros/vida-y-salud', grupo: 'ramo' },
  { consulta: 'seguro de responsabilidad civil', pagina: '/seguros/responsabilidad-civil', grupo: 'ramo' },
  { consulta: 'seguro de flota', pagina: '/seguros/flota', grupo: 'ramo' },

  // §2 Intención de problema — donde está el dinero y casi no hay competencia
  { consulta: 'cómo cambiar de correduría sin cambiar de seguro', pagina: '/cambiar-de-correduria', grupo: 'problema' },
  { consulta: 'preaviso de un mes para cancelar el seguro (art. 22 LCS)', pagina: null, grupo: 'problema' },
  { consulta: 'me han subido el seguro del coche en la renovación', pagina: null, grupo: 'problema' },
  { consulta: 'qué cubre de verdad mi seguro de hogar', pagina: '/seguros/hogar', grupo: 'problema' },
  { consulta: 'qué es un corredor de seguros y en qué se diferencia de un agente', pagina: '/quienes-somos', grupo: 'problema' },
  { consulta: 'cómo reclamar un siniestro que me han denegado', pagina: null, grupo: 'problema' },
]
