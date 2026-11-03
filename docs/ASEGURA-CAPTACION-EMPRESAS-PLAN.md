# Plan de captación de empresas — Grupo ASegura (03/11/2026)

Insumos: `docs/ASEGURA-CAPTACION-AUDITORIA-2026-10.md`, `docs/ASEGURA-PORTAL-MODULOS.md`, búsqueda de fuentes y medición de cartera (03/11/2026, solo cifras agregadas). Las cifras de precio y volumen no verificadas van marcadas.

## 1. Resumen

1. **Lo incómodo:** la cartera en vigor (medida con `esCarteraEnVigor`) son **67 clientes, 102 pólizas y 40.792,27€ de prima**, de ellos solo **9 empresas** (5 con un solo ramo) y **0 grandes tenedores**. La cartera propia no sostiene el crecimiento: el grueso tiene que venir de fuera.
2. **Cifra verificada en BD (03/11/2026):** esos 67 clientes / 102 pólizas SON la cartera real según la regla de Alberto (`packages/module-seguros/src/cartera-viva.ts`: cliente = lo que trae/mantiene CIMA; el volcado histórico de junio/2026 son leads). **Oportunidad:** en ese volcado (`import_ref` no nulo, sin `eiac_xml_hash`) hay ~1.153 pólizas `activa`, ~830 `en_renovacion` y 31 `recibo_devuelto` que CIMA no confirma: son **ex-clientes/leads templados, la lista más caliente que existe** (ver §5, canal 1 bis).
3. Se paró el mailing en frío de ia-rest/ialimp (PR #5437). Foco 100% correduría.
4. Objetivo: empresa mediana familiar (20-250 empleados) y sociedades patrimoniales (5-50 inmuebles), Sevilla → Andalucía. Gancho: revisión gratuita de seguros + portal gratis. El negocio son las pólizas.
5. El canal legal y barato empieza por partners, LinkedIn y carta postal. El email y el teléfono en frío esperan al abogado.

## 2. A quién (ICP) y por qué no la gran empresa

| Segmento | Perfil | Quién decide | Por qué encaja |
|---|---|---|---|
| Transporte por carretera | CNAE 4941, flota, 20-250 empleados | Dueño | Flota, RC, mercancías, accidentes: muchas pólizas por cliente |
| Patrimoniales | CNAE 6820/6810/6420, 5-50 inmuebles | Dueño/administrador | Multirriesgo, RC, comunidades, alquiler; el portal ya es para este perfil |
| Empresa familiar general | 20-250 empleados | Dueño | Paquete empresa + personas + patrimonio del dueño |

**No gran empresa (>250):** tienen broker global, licitan, hay risk manager, el ciclo es de 6-18 meses, exige capacidad de colocación que no tenemos y ya tienen HRIS (el portal del empleado no les aporta).

## 3. Oferta y mensaje

**Oferta única:** «Revisión gratuita de seguros + portal gratis para tu empresa».

- El dueño ve en un sitio sus seguros personales y los de la empresa.
- Una administrativa delegada gestiona con permisos acotados.
- Flota, patrimonio y portal del empleado.
- La herramienta es el gancho: se regala. La póliza paga.

| Segmento | Mensaje (borrador) |
|---|---|
| Transporte | «¿Sabes en una pantalla qué camiones tienen seguro, cuándo vence cada uno y qué cubre? Te hacemos gratis la revisión de la flota y te damos el panel.» |
| Patrimonial | «Tus inmuebles, sus pólizas y sus vencimientos en un solo panel, y revisamos gratis si estás pagando de más o infra-asegurado.» |
| Empresa familiar | «Tus seguros personales y los de la empresa en un solo sitio, con tu administrativa gestionando lo diario. Revisión gratuita, sin compromiso.» |

Los textos son borradores: ninguna salida a terceros sin OK de Alberto para ese envío.

## 4. Fuentes de datos

| Fuente | Qué da | Coste | Notas |
|---|---|---|---|
| BORME API oficial (BOE) | Sumario diario XML/JSON: constituciones, nombramientos | Gratis | Sin CNAE ni empleados. Detalle por acto solo PDF/XML. Día sin publicación = 404 |
| librebor (api v2) | Administradores, alertas por NIF | ~24,99€/mes (Starter) o ~49,99€/mes (Growth) + créditos | **Precios no verificados.** No consta filtro por CNAE/provincia ni términos de uso para prospección |
| eInforma microbase | 500 registros por provincia/municipio: teléfono, contacto, rango de ventas y empleados, CNAE | ~30€ por 500 registros | **Verificar licencia de uso para marketing** antes de comprar |
| Axesor (bases de marketing) | Provincia/CNAE, NIF, teléfono, cargo, ventas, empleados | A presupuesto | Comparar con eInforma si la licencia de este no sirve |
| CNMV (listado SICAV) | Sociedades de inversión | Gratis | Listado paginado; SOCIMI de BME Growth sin revisar |
| RTA Andalucía | Viviendas turísticas, datos públicos | Gratis | Sin teléfono ni email; fichero descargable no confirmado |
| ROTRA (transportistas) | — | — | No hay dataset abierto: pedirlo a la Administración |

**Recomendación:** empezar con **eInforma** (CNAE 4941 y 6820, Sevilla) y enriquecer administradores con librebor/BORME. Gasto de arranque estimado: ~60-100€ (hipótesis, 2-3 compras de 500 registros + 1 mes de librebor).

## 5. Canales priorizados

| # | Canal | Volumen semanal (hipótesis) | Condición |
|---|---|---|---|
| 1 | **Partners:** gestorías, asesorías laborales, administradores de fincas (Colegio de Sevilla) | 3-5 contactos/reuniones | Ninguna: es relación B2B directa. Acordar comisión o reciprocidad por escrito |
| 1 bis | **Reactivación del volcado histórico** (ex-clientes/leads templados, ~2.000 pólizas no confirmadas por CIMA) | Piloto: empresas y multi-riesgo inmobiliarios extraídos de esa lista; carta o llamada de reactivación | Tras validar con el abogado: LSSI 21.2 cubre clientes actuales; para ex-clientes no está claro, así que **[Probable] no vale para email sin consentimiento**. Carta postal sí |
| 2 | **LinkedIn:** perfil de Alberto + página de empresa | 20-30 invitaciones personalizadas + 2 publicaciones | Sales Navigator Core 120,99€/mes (1.088,88€/año, sin IVA): opcional, tras 1 mes orgánico |
| 3 | **Carta postal personalizada** + llamada de seguimiento | 15-25 cartas | La carta, sí. La llamada **solo tras validar con el abogado** |
| 4 | **Asociaciones:** AAEF (empresa familiar), CES/CEA, asociaciones de transporte (por identificar; Fetransa no identificada) | 1 acto/contacto al mes | Presencia y charla, no lista de socios |
| 5 | **Cartera propia:** venta cruzada | Tanda única de ~16 | Borradores; Alberto aprueba cada envío |

**Cartera propia (tanda 5):** las 9 empresas (5 con un solo ramo: hay hueco claro) + los 7 clientes con ≥2 riesgos inmobiliarios. Con productos similares a los que ya tienen, el email a clientes propios es lícito (LSSI art. 21.2).

## 6. Marco legal (resumen operativo)

| Canal | Regla | Estado |
|---|---|---|
| Email comercial | LSSI art. 21: solo con consentimiento, o a clientes propios por productos similares (21.2) | Solo cartera propia |
| Llamada en frío | LGTel 11/2022 art. 66: consentimiento o interés legítimo ponderado + consultar lista Robinson. La AEPD ha sancionado con 5.000€ por llamar a números en Robinson | **Validar con abogado antes de llamar** |
| Carta, LinkedIn, partners, eventos | Canales seguros | Libres |
| Datos de administradores del BORME | Deber de informar (art. 14 RGPD) en el primer contacto | Incluir cláusula en la primera carta/mensaje |
| Datos de RRHH | **NUNCA para captar** (decisión 26/10) | Prohibido |

## 7. Requisitos previos (bloqueantes)

| Requisito | Por qué bloquea | Responsable |
|---|---|---|
| Landing `/empresas` en `asegura-web` | Destino de cartas, LinkedIn y partners; sin ella no hay a dónde enviar | Agente + revisión |
| Cuenta demo del portal con datos ficticios | Sin demo no se enseña el gancho | Agente |
| Contrato de encargo RRHH del abogado | Requisito legal del portal del empleado | Abogado |
| Consulta al abogado: llamadas y cartas B2B | Desbloquea el canal 3 | Alberto |
| Captura en CRM: `/correduria` leads con campo fuente | Sin fuente no se mide qué canal funciona | Agente |

## 8. Plan de 90 días

| Semanas | Foco | Entregables |
|---|---|---|
| 1-2 | Preparación | Landing `/empresas`, demo, campo fuente en leads, consulta al abogado, compra de 1.er lote eInforma (CNAE 4941 y 6820 Sevilla), extraer del volcado histórico las empresas y multi-riesgo inmobiliarios (piloto 1 bis), perfil LinkedIn listo |
| 3-6 | Piloto de 50 empresas (25 transporte + 25 patrimoniales) | Cartas personalizadas, 20-30 invitaciones/semana, 5 contactos con partners, tanda de venta cruzada, 1.er acto de asociación. Registro de respuesta por canal |
| 7-12 | Escalar lo que funcione | Duplicar el canal con mejor ratio reunión/contacto, recortar el resto; decidir Sales Navigator; llamadas solo si el abogado las valida; ampliar a empresa familiar general |

Regla de corte al final de la semana 6: un canal sin ninguna reunión tras ~25 contactos se pausa.

## 9. Métricas y objetivos

Todos los objetivos son **hipótesis prudentes**, sin base histórica: la correduría no tiene todavía datos de captación en frío.

| Métrica | Mes 1 | Mes 2 | Mes 3 |
|---|---|---|---|
| Contactos enviados (cartas + LinkedIn + partners) | 30 | 80 | 120 |
| Reuniones | 2 | 5 | 8 |
| Demos del portal | 1 | 3 | 5 |
| Pólizas nuevas | 0 | 2 | 5 |
| Prima nueva anual | 0€ | ~1.500€ | ~4.500€ |

Seguimiento por fuente en el CRM (el volcado reactivado y cada canal de §11 llevan su propia fuente). Mide además el coste por reunión y la tasa de aceptación de la revisión gratuita.

## 10. Decisiones pendientes de Alberto

1. **Datos:** ¿comprar el primer lote de eInforma (~30€/500) una vez confirmada la licencia de marketing?
2. **Abogado** (incluye si se puede reactivar a ex-clientes del volcado por email/llamada): ¿le encargas ya la consulta sobre llamadas/cartas B2B y el contrato de encargo RRHH?
3. **LinkedIn y cara:** ¿Sales Navigator tras 1 mes orgánico, o solo orgánico? ¿Pones cara en el vídeo (voz y rostro de Alberto) o solo pantalla del portal con voz en off?
4. **Meta Ads:** ¿presupuesto de prueba B2C de 150-300€/mes durante 4 semanas (§11), con corte por coste por lead?
5. **Partners:** ¿qué comisión o reciprocidad estás dispuesto a ofrecer a gestorías y administradores de fincas?

## 11. Redes sociales y contenido

**Lo incómodo primero.** Instagram no es el canal para vender a empresa mediana: el dueño o gerente decide por relación y reputación, y está en LinkedIn y en su gestoría. ia-rest ya probó el camino (agente que publica 2 reels/semana, guía en `docs/instagram-growth.md`) con poco feedback, y esa misma guía admite que «quizá Instagram no sea el canal nº1» para B2B. Instagram/Facebook rinden en B2C local (hogar, auto, decesos, salud, mascotas) y como prueba social y retargeting de la web.

**Qué hay hecho (por documentos, no por métricas).** ia-rest: agente de Instagram con carruseles y reels (Veo 3 Fast desde 07/2026), guías `docs/instagram-growth.md` y `docs/instagram-growth-ads-linkedin.md` (anuncios de 5-10€/día propuestos, no consta que se ejecutaran). Asegura: **ningún perfil creado ni nada publicado**; solo un borrador de LinkedIn sin publicar (`docs/ASEGURA-SEO-REDES-IDEAS.md` §M) y la prioridad GBP > LinkedIn de Alberto > Instagram solo si hay quien alimente el calendario.

**Números reales: no hay acceso (03/11/2026).** Meta Ads MCP: la única cuenta publicitaria visible (`360227521`) está en estado UNSETTLED, sin método de pago y no consultable; no devuelve cuentas de Instagram vinculadas, así que no hay alcance, interacciones ni gasto. Sí existen cuatro Páginas de Facebook administrables (Grupo ASegura, Segurazos, Iarest.es, Ia.rest), sin métricas accesibles. No se encontró la tabla de borradores de Instagram en la BD central ni se obtuvo PostHog. **«Poco feedback» de ia-rest es la impresión de Alberto, no una cifra.** Medir antes de decidir: pedir a Alberto las estadísticas nativas de Instagram (últimos 90 días: alcance, guardados, clics al enlace).

**Recomendación** (todas las cifras son hipótesis):
1. **LinkedIn, canal principal** (perfil de Alberto): 2 publicaciones/semana + un vídeo de 30-60 s del portal: «el dueño ve sus seguros y los de la empresa en una pantalla», grabado sobre la cuenta demo.
2. **Instagram, mínimo y reaprovechado:** el mismo vídeo en vertical, 1 reel/semana sin trabajo propio extra (skill `postiz` si sirve para programar). Sin cuenta nueva si no hay quien responda mensajes.
3. **Meta Ads solo como prueba B2C acotada:** 150-300€/mes, 4 semanas, formulario de clientes potenciales «revisión gratuita de tu seguro de hogar/auto en Sevilla». Métrica: coste por lead; **corte si pasa de ~25-30€/lead o no hay 5 leads reales en 4 semanas** (umbral hipótesis). Requiere arreglar antes la cuenta publicitaria (pago). Los leads de formulario son consentidos; nada de mensajes masivos.

**Calendario mínimo, 4 semanas** (cada pieza pasa por `revisarCopy` y por el OK de Alberto):

| Sem | LinkedIn (2 posts) | Vídeo / Instagram |
|---|---|---|
| 1 | Caso real anonimizado (flota que descubrió una cobertura que no tenía); presentación del portal | Vídeo demo del portal (30-60 s) en LinkedIn; mismo en reel |
| 2 | «Error típico en el seguro de flota»; obligaciones legales: RC de la empresa | Recorte 20 s del vídeo (solo flota) |
| 3 | Convenio colectivo y seguro de accidentes: qué debe tener la empresa; caso real anonimizado (patrimonial) | Reel: «3 errores de flota» |
| 4 | Demo del portal con capturas, paso a paso; balance honesto y pregunta a la audiencia | Reel B2C de hogar/auto (apoya la prueba de Meta Ads) |

**Métricas y regla de corte.** LinkedIn: invitaciones aceptadas, mensajes de respuesta, reuniones (fuente `linkedin` en el CRM). Instagram: alcance, guardados, clics a `/empresas` con UTM. Meta Ads: coste por lead, leads válidos, pólizas. Corte a las 8 semanas: LinkedIn sin ninguna reunión tras ~25 contactos cualificados se revisa; Instagram sin clics medibles se deja en piloto automático o se cierra; Meta Ads se para al superar el techo de coste por lead.
