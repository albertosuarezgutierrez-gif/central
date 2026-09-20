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
  { consulta: 'seguro de responsabilidad civil para fontaneros', pagina: '/seguros/responsabilidad-civil-fontaneros', grupo: 'ramo' },

  // §2 Intención de problema — donde está el dinero y casi no hay competencia
  //
  // 🚨 Las cuatro filas de abajo con `pagina: '/blog/...'` estuvieron con `pagina: null` (o apuntando
  // a `/seguros/hogar`, que solo las cubre a medias) hasta el 20/09/2026, pese a que los artículos ya
  // llevaban publicados desde el 07 y el 15/09 (`apps/asegura-web/lib/articulos.ts`) — y `keywords.md`
  // §2 ya los daba por «cubierta». Esa `pagina: null` no era cosmética: `accionPropuesta` (regla 3 de
  // `informe.ts`) toma la PRIMERA consulta «problema» con `pagina===null` y propone «escribir la página
  // que cubra X» — con las cuatro artículos ya escritos, el informe semanal llevaba semanas proponiendo
  // reescribir contenido que ya existía. Y `urlsPropias` (`cobertura.ts`) construye la lista de URLs
  // propias a inspeccionar por la URL Inspection API a partir de este mismo campo: con `null`, esos
  // cuatro artículos NUNCA se comprobaban si Google los tenía indexados.
  { consulta: 'cómo cambiar de correduría sin cambiar de seguro', pagina: '/cambiar-de-correduria', grupo: 'problema' },
  { consulta: 'preaviso de un mes para cancelar el seguro (art. 22 LCS)', pagina: '/blog/preaviso-un-mes-no-renovar-seguro', grupo: 'problema' },
  { consulta: 'me han subido el seguro del coche en la renovación', pagina: '/blog/me-han-subido-el-seguro-en-la-renovacion', grupo: 'problema' },
  { consulta: 'qué cubre de verdad mi seguro de hogar', pagina: '/blog/que-cubre-de-verdad-el-seguro-de-hogar', grupo: 'problema' },
  { consulta: 'qué es un corredor de seguros y en qué se diferencia de un agente', pagina: '/quienes-somos', grupo: 'problema' },
  { consulta: 'cómo reclamar un siniestro que me han denegado', pagina: '/blog/siniestro-denegado-que-hacer', grupo: 'problema' },
  // 19/09/2026: el gestor de pólizas y la guía de baja (landing `/gestor-de-seguros` + artículo).
  { consulta: 'cómo dar de baja un seguro', pagina: '/blog/como-dar-de-baja-un-seguro-a-tiempo', grupo: 'problema' },
  { consulta: 'organizar mis seguros en un solo sitio', pagina: '/gestor-de-seguros', grupo: 'problema' },
]
