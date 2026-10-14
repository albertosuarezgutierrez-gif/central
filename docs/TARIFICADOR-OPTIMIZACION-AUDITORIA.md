# Tarificador RPA · auditoría de optimización (14/10/2026)

Convención: **[Hecho verificado]** (leído en código/BD, con ruta) · **[Hipótesis]** · **[Recomendación]**. Los importes de coste son estimaciones salvo que se diga lo contrario. Webs de documentación de terceros no accesibles desde el entorno (DNS): precios cloud no verificados.

## 1. Resumen ejecutivo

- [Hecho verificado] El cuello de botella NO es la velocidad de ejecución (80-120 s por trabajo) sino el **ciclo de aprendizaje**: 1 tarificación ok de 18 reales. Cada fallo revela UN hueco del mapa → arreglo en código → imagen Fly nueva → relanzar.
- [Hecho verificado] La IA no interpreta pantallazos en el camino feliz: 0 llamadas LLM; no se manda imagen a ningún LLM (ver 1c).
- [Hecho verificado] La tabla `seguros.tarificacion_trabajo_pasos` está vacía: no hay línea base por paso (causa probable en 3.1).
- **Modelo objetivo (Alberto): UN BOT POR COMPAÑÍA** (Allianz, Mapfre, Occident) que conozca toda la intranet de esa compañía, con los productos como flujos finos. No es un agente autónomo que navega libre (ver 5).

**RESPUESTA a «¿modificación mínima?»**: (1) arreglar la persistencia de la traza por paso para tener línea base; (2) en todo fallo de mapa/selector, guardar `page.ariaSnapshot({mode:'ai'})` de la página y sus marcos junto a la evidencia, y que el explorador use ese mismo snapshot de texto. Sin dependencias nuevas (Playwright 1.63 ya declarado). Reduce las vueltas del ciclo (un fallo → pantalla entera mapeada) y abarata el explorador. Velocidad de ejecución: no tocar hasta tener la traza. A medio plazo, la palanca estructural es la capa de compañía (Fase 2).

### Verificaciones del PASO 1

| # | Pregunta | Resultado |
|---|---|---|
| 1a | ¿Por qué `tarificacion_trabajo_pasos` tiene 0 filas? | [Hecho] El worker sí manda `pasos` (`services/tarificador-rpa/src/runner.ts:341-343`, `meta()` en los POST de ok/error, líneas 370, 395, 416; registrador `packages/module-tarificacion/src/traza.ts:89-117`). El servidor los valida (`apps/asegura/lib/tarificador-reglas.ts:175-178`; si hay una clave no permitida o un nombre/código fuera de lista descarta la traza ENTERA y sigue). Los escribe `guardarPasos` (`apps/asegura/lib/tarificador.ts:417-419, 505-522`) solo si `hayPasos()` (`apps/asegura/lib/esquema-bd.ts:19`) = `to_regclass('seguros.tarificacion_trabajo_pasos') is not null` (cache 5 min; si la consulta falla, `false`, `esquema-opcional.ts:34-42`). Causa probable: ver 3.1. |
| 1b | ¿Playwright 1.63 tiene `ariaSnapshot({mode:'ai'})`? | **No verificable localmente.** `services/tarificador-rpa` no tiene `node_modules` (declara `playwright` 1.63.0, `package.json`). El único Playwright del entorno es `/opt/node-tools/node_modules/playwright-core` 1.56.1, que solo trae `locator.ariaSnapshot()` (`types.d.ts:12515`) y no `page.ariaSnapshot` ni `mode`. Las versiones citadas (ver 4) vienen de notas de versión, sin comprobar. Primer paso de la Fase 1: `pnpm install` en el servicio y `grep ariaSnapshot` en sus tipos. |
| 1c | ¿Qué usa el explorador y qué recibe el LLM? | [Hecho] Inventario DOM propio, no accesibilidad ni imagen: `capturarInventarioExploracion` (`services/tarificador-rpa/src/inventario-dom.ts:170`) recorre los marcos con `evaluate`, saneado (≤60 KB), con `ref` por elemento, `conValor`, `titulos`, `importes`. Al servidor viaja solo ese inventario saneado (`explorador.ts:321`); el lote devuelto se revalida contra el inventario propio (`explorador.ts:409`). Es **texto, no imagen**. Modelo por defecto `anthropic/claude-sonnet-4.5` por OpenRouter (`apps/asegura/lib/tarificador-explorador-reglas.ts:33`), salida máx. 4.000 tokens (`:38`), topes 30 llamadas · 80 acciones · 2 € · 15 min · 40 pasos (`packages/module-tarificacion/src/explorador.ts:1097`, ajustables a la baja por env `TARIFICADOR_EXPLORADOR_*`). |

## 2. Mapa de la arquitectura actual

[Hecho verificado] No hay Symfony ni ERP PHP. Flujo:

`plataforma /correduria` (Next) → proxy → `apps/asegura` (Next, Vercel) `/api/operador/tarificador/encolar` → cola Supabase `seguros.tarificacion_trabajos` (cron 5 min + lanzamiento al encolar; `max_concurrencia` por compañía; lease 6 min) → **1 máquina Fly efímera por trabajo** (`asegura-tarificador`, shared-cpu-2x 2 GB, auto_destroy) → `runner.ts` (Playwright 1.63 headless, contexto limpio, login en cada trabajo, credenciales en fly secrets `CRED_*`) → adaptador → `POST /api/tarificador/resultado`.

| Estado de adaptadores | Cuáles |
|---|---|
| Registrados (`adapters/index.ts`) | allianz/comunidades, allianz/moto (`MOTO_ACTIVO`) |
| En disco sin registrar | allianz auto, comercio, rc-pyme; mapfre/auto; occident/comunidades, occident/hogar |

El CRM de Manuel (repo asegura, Next.js, `app.grupoasegura.com`) NO tarifica y no se toca.

**Estructura actual del código por compañía** [Hecho verificado, `services/tarificador-rpa/src/adapters/`]:
- Hay carpetas por compañía (`allianz/`, `mapfre/`, `occident/`) pero **sin capa de compañía explícita**: la «intranet» vive dentro de `allianz/comunidades.ts`, que es un producto.
- `allianz/auto.ts:63` (Moto) importa `fechaEs, login, marcoCon, sesionSirve` de `./comunidades.ts`; `comercio.ts:24` y `rc-pyme.ts:18` importan `login, marcoCon, sesionSirve` de él; `mapfre/auto.ts:49` importa `fechaEs` de `../allianz/comunidades.ts` (acoplamiento entre compañías).
- La entrada ePAC vive en `allianz/entrada.ts` (`abrirNuevaAlta`), usada por los cuatro productos Allianz.
- **Población/CP: 3 implementaciones distintas** en Allianz: `comunidades.ts:566-690` (lupa `#codigoPostalAjaxLocFinderImg`, `poblacionRellena`), `comercio.ts:71,100` (campo directo `#Tom_address_town`, sin lupa) y `auto.ts:545` (`buscarPoblacion`, ventana de poblaciones de Moto, con `ErrorEleccionPoblacion`). Occident no tiene ninguna (`occident/mapa.ts` solo cita la palabra).

## 3. Diagnóstico con datos reales de BD (consultados 14/10/2026)

| Bot | Resultado | Latencia |
|---|---|---|
| Allianz Comunidades | 1 ok / 8 error (06/10) | p50 83 s |
| Allianz Moto | 0 ok / 6 error / 3 cancelado (13/10) | p50 81 s; un lease vencido de 2.326 s |
| Mapfre Auto (exploración) | 0 / 3 | — |
| Exploraciones Allianz Hogar | 6 ok / 1 error | 75-145 s |

**Causa de TODOS los fallos: mapa/selectores incompletos o rotos, no lentitud.**
- Allianz Comunidades: `getByLabel('Contraseña')` strict mode con 2 elementos; `'NUEVA ALTA'` timeout; `'Fecha Inicio'` xpath; `'Calcular'` no encontrado/deshabilitado (falta un dato exigido); `'Prima Total'` no legible.
- Allianz Moto: «modelo no está en catálogo»; `requiere_eleccion_version` (20 versiones); 4× «mapa incompleto: falta pantalla buscador de poblaciones (CP con varias poblaciones/emergente)».
- Mapfre: menú «Tarificación y Emisión Rápida» no encontrado.

### 3.1 Causa probable de la tabla de pasos vacía

- [Hecho] El SQL `apps/asegura/prisma/sql/2026-10-08_tarificador_trazas.sql` lleva en su cabecera «⚠️ NO APLICADA».
- [Hecho] El código es tolerante: sin la tabla, `hayPasos()` da `false` y se omite sin error ni aviso (`tarificador.ts:417`).
- [Hecho, BD 14/10/2026] La hipótesis «SQL no aplicado» queda REFUTADA: `to_regclass('seguros.tarificacion_trabajo_pasos')` devuelve la tabla (existe, la cabecera del SQL está desactualizada) y tiene 0 filas; 6 de los 9 trabajos de Moto sí traen `bot_version` (0.1.0/0.2.0). Quedan como causas (a) la imagen Fly desplegada es anterior a la traza (`pasos` ausente o vacío), (b) `validarTraza` rechaza la traza entera (`trazaRechazada`, nombre de paso o código fuera de lista), (c) `guardarPasos` falla y solo hace `console.warn` (`tarificador.ts:420-422`), (d) la consulta de existencia falló y quedó en cache `false` 30 s. Discriminador barato: `select count(*), count(bot_version) from seguros.tarificacion_trabajos` (si `bot_version` también está vacío, o la columna no existe, apunta al SQL no aplicado o a imagen antigua).
- [Recomendación] Fase 0: averiguar cuál de (a)-(d) es (leer logs de Vercel de `/api/tarificador/resultado` buscando el `console.warn`) y hacer que la omisión deje de ser silenciosa (aviso/contador cuando el worker manda `pasos` y la tabla no existe).

### 3.2 Tabla de diagnóstico

| Componente | Implementación actual | Problema | Evidencia | Mejora | Impacto | Riesgo |
|---|---|---|---|---|---|---|
| Ciclo de aprendizaje | Fallo → código → imagen Fly → relanzar | ~1 hueco por vuelta | 1/18 ok; 4 fallos de Moto por la misma ventana de poblaciones | Captura completa en fallo (Fase 1), capa de compañía (Fase 2) | Alto | Bajo/medio |
| Tasa de éxito | Sin métrica agregada | No se mide por compañía/ramo | Cifras sacadas a mano de BD | Métrica `tasa_ok` (Fase 0) | Alto | Bajo |
| Traza por paso | `crearTraza` + `guardarPasos` | Tabla vacía, sin línea base | 1a / 3.1 | Aplicar SQL + aviso | Alto | Bajo |
| Capa de compañía | Intranet Allianz dentro de `comunidades.ts` | Código compartido por import cruzado; Población ×3 | `auto.ts:63`, `comercio.ts:24`, `rc-pyme.ts:18`, `mapfre/auto.ts:49` | `adapters/<compania>/intranet/` (Fase 2) | Alto | Medio |
| Selectores | `getByLabel`/xpath por adaptador | Frágiles (strict mode, timeouts) | Errores de 3 | Alternativas de localizador + snapshot de accesibilidad (Fase 1-4) | Medio | Bajo |
| Ejecución con IA | 0 llamadas LLM en camino feliz | Falso supuesto «IA interpreta pantallazos»; no aplica | Formador solo si falla `campoPorEtiqueta` y `TARIFICADOR_FORMADOR_ACTIVO=1` (tope 12); elección de versión máx. 1 llamada Sonnet; explorador Sonnet 4.5 (30 llamadas/15 min/2 €); grabaciones gemini-2.5-flash ~0,006 €/pantalla | Nada que optimizar aquí aún | — | — |
| Pantallazos | Solo en fallo; sin imagen a ningún LLM | — | 1c | Mantener; añadir snapshot de texto | — | — |
| Pausas de ritmo humano | `ctx.pausa` 0,8-2,5 s + `pausaAccion` 0,3-1,2 s ≈ 9-25 s/trabajo [estimación] | Deliberadas (anti-detección) | Código del runner/adaptadores | No quitar sin decisión explícita | Medio | Alto si se quitan |
| Login y máquina por trabajo | Máquina nueva + login siempre | Sesión en memoria TTL 10 min inútil (1 trabajo/máquina) | `runner.ts` | Medir antes de tocar; coste Fly no medido | Bajo/desconocido | Medio |
| Observabilidad | Sin línea base por paso | No se sabe qué paso consume los 80-120 s | 3.1 | Fase 0 | Alto | Bajo |

## 4. Comparativa de herramientas

Datos [no verificados contra webs oficiales desde este entorno; tomados del briefing del encargo y repos GitHub: github.com/microsoft/playwright, github.com/Skyvern-AI/skyvern, github.com/browser-use/browser-use, github.com/browserbase/stagehand, github.com/web-infra-dev/midscene].

| Criterio | Playwright optimizado | Skyvern | Browser Use | Stagehand | Midscene |
|---|---|---|---|---|---|
| Licencia | Apache-2.0 | **AGPL-3.0** (modificarlo y ofrecerlo por red obliga a publicar cambios; revisión legal antes de prod). SDK TS `@skyvern/client` 1.0.56: licencia no verificada | MIT | MIT | MIT |
| Lenguaje / encaje TS | TS, ya en uso (1.64.0, 07/10/2026) | Servidor Python + SDK TS; servicio aparte | Núcleo Python | TS | TS; `PlaywrightAgent(page)` envuelve el page actual |
| «Symfony» | N/A (no existe) | N/A | N/A | N/A | N/A |
| Aprendizaje | Mapas versionados en Git + captura accesibilidad (`locator.ariaSnapshot` desde 1.49; `page.ariaSnapshot` + `mode:'ai'` con `[ref=eN]` y recorrido de iframes desde 1.59; `ariaSnapshotJSON` 1.63; `getByRef` 1.64) | Agente que aprende flujos | Bucle de agente por paso | `act/observe/extract`; caché local no verificada en v4 | Caché local YAML de localización con fallback IA |
| Velocidad | La actual | Más lenta (LLM por paso) | Más lenta (LLM por paso) | LLM en pasos nuevos | LLM visual por paso nuevo |
| Fiabilidad en formularios de seguros | Alta con mapa validado | No demostrada | Baja (agente libre) | Media, no medida | Media; visual |
| OpenRouter | Ya usado en el explorador | Soportado | No verificado | No verificado | No verificado |
| Fly | Ya desplegado | Servicio nuevo a operar | Python nuevo | Cabe en el worker actual (no verificado) | Cabe en el worker |
| Coste | Sin dependencia nueva | Servidor + LLM | LLM por paso | LLM en pasos nuevos | LLM + **pantallazo por paso** |
| Mantenimiento | Equipo actual | Otro stack | Otro stack | Dependencia nueva | Dependencia nueva |

Conclusión: [Recomendación] Playwright optimizado. Playwright MCP ya demuestra el enfoque snapshot de accesibilidad sin pantallazos, que es lo que se propone. Skyvern y Browser Use se descartan (licencia/stack/modelo de agente libre). Stagehand y Midscene solo como evaluación futura, no antes de tener línea base.

## 5. Arquitectura objetivo (mínima, sin microservicios nuevos)

- Orquestador: el actual (`apps/asegura` + cola Supabase). Motor común: `runner.ts` + `packages/module-tarificacion` (traza, registro, guard).
- **Un bot por compañía** [Recomendación]:

```
services/tarificador-rpa/src/adapters/<compania>/
  intranet/    login, sesión, navegación/menús, componentes comunes del portal:
               buscador de poblaciones, selector de versión, avisos/errores,
               «Calcular», lectura de primas, descarga de PDF
  productos/<ramo>.ts   FLUJOS FINOS: solo el mapa de campos del ramo, usando intranet/
```

Un hueco aprendido una vez (p. ej. la ventana de poblaciones que tumbó 4 trabajos de Moto) sirve a todos los ramos de esa compañía.
- **Matiz crítico:** «bot que sabe usar toda la intranet» NO es un agente autónomo que navega libre por cualquier producto. Los formularios de cada ramo siguen necesitando su **mapa explícito y validado** (fiabilidad y guardián TARIFICAR≠EMITIR). Lo genérico es la capa de compañía; lo específico, el mapa del producto.
- Supervisor IA por niveles: 1 determinista · 2 alternativas de localizador + ariaSnapshot · 3 modelo económico con ariaSnapshot (texto) · 4 modelo capaz · 5 humano (la bandeja ya existe). Visión solo como último recurso.
- Memoria: mapas en TS/Git (fuente de verdad, revisados en PR) + BD para la memoria operativa que ya existe (versiones de vehículo, formador, intervenciones). Sin BD vectorial.

## 6. Costes y latencias (estimaciones, no medidas)

| Concepto | Valor | Estado |
|---|---|---|
| Camino feliz actual | 0 € de LLM; 80-120 s | [Hecho] |
| Explorador | hasta 2,00 € por exploración (tope), Sonnet 4.5 | [Hecho: tope] |
| Grabación | ~0,006 € por pantalla (gemini-2.5-flash) | [Hecho: dato del encargo] |
| ariaSnapshot texto vs pantallazo | Texto: más barato y más rápido que una imagen por paso; cuantía sin medir | [Hipótesis] |
| Máquina Fly efímera (2 GB, 2 CPU) | Sin medir; 1 máquina por trabajo | No medido |
| Pausas humanas | 9-25 s/trabajo | [Estimación] |

## 7. Benchmark

- Piloto: **Allianz HOGAR** (6 exploraciones; comparte login y entrada ePAC con Comunidades/Moto).
- Versiones: **A** actual · **B** determinista + instrumentado (traza) · **C** híbrido con recuperación por ariaSnapshot + LLM.
- Mismas entradas autorizadas; referencia = prima que da el portal a mano.
- Métricas: tasa de éxito, prima exacta vs referencia, tiempo total y por paso, vueltas de aprendizaje hasta ok, llamadas y coste LLM, intervenciones humanas, fallos por tipo.
- Requisito: lo lanza Alberto (credenciales en fly secrets; el entorno de Claude no accede al portal).

## 8. Plan por fases (ninguna dependencia nueva en 0-3)

| Fase | Qué | Archivos | Coste / riesgo | Prueba y aceptación | Vuelta atrás |
|---|---|---|---|---|---|
| 0 | Persistencia de la traza (aplicar `2026-10-08_tarificador_trazas.sql` con OK de Alberto; aviso si falta la tabla) + métrica `tasa_ok` por compañía/ramo | `apps/asegura/lib/tarificador.ts`, `esquema-bd.ts`, bandeja | Mínimo / bajo | Tras 1 trabajo, filas en `tarificacion_trabajo_pasos`; vista de tasa | SQL: `drop table` documentado en el propio fichero |
| 1 | Captura de diagnóstico completa en fallo: `page.ariaSnapshot({mode:'ai'})` + HTML de marcos (ya existe), guardado como evidencia. Primero verificar la API en 1.63 tras `pnpm install` | `runner.ts`, evidencia en `tarificador.ts` | Bajo / bajo; fallo del snapshot nunca rompe el trabajo | Un fallo provocado trae la pantalla entera mapeada | Revert por git |
| 2 | **Extraer `allianz/intranet/`** desde `comunidades.ts` + `entrada.ts` + `auto.ts` **sin cambiar comportamiento** (login, sesión, `marcoCon`, `fechaEs`, entrada, Población/CP unificada de las 3 implementaciones, «Calcular», lectura de primas); luego replicar el patrón en `mapfre/` y `occident/` | `adapters/allianz/*`, después `mapfre/*`, `occident/*` | Sin dependencias / **medio** | Los 30 tests del servicio en verde antes y después; mismo resultado en Comunidades y Moto | Reversible por git (refactor puro, un PR por compañía) |
| 3 | El explorador genera borrador de mapa TS (a partir de ariaSnapshot) → PR revisado | `explorador.ts`, `inventario-dom.ts` | Bajo / bajo | Borrador con campos del ramo, revisado a mano | Revert |
| 4 | Explorador con ariaSnapshot en vez de/además de `inventario-dom.ts` (ahorro de tokens) | `explorador.ts` | Reduce coste / medio | Comparar coste y pasos vs inventario actual | Interruptor env |
| 5 | Nivel 3 de recuperación en tarificación: propuesta de solo lectura, valida el estado esperado, **nunca aplica en emisión**; extender a más ramos | `runner.ts`, guard | Medio / medio | Piloto Hogar (7) | Interruptor env |

Nota: el orden Fase 3/4 puede intercambiarse; la Fase 2 va antes porque cada hueco se aprende una vez por compañía.

## 9. NO hacer

- Skyvern en producción (AGPL, servicio aparte). Browser Use. Midscene/visión por paso.
- BD vectorial.
- Pool de máquinas o sesión compartida antes de medir (primero la traza).
- Quitar las pausas humanas sin decisión explícita.
- Auto-aplicar soluciones de IA a producción (siempre PR revisado).
- Un agente autónomo que navegue libre por productos sin mapa validado.
- Integración Symfony (no existe) y tocar el CRM de Manuel.
