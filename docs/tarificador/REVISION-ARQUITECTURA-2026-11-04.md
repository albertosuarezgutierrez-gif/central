# Revisión de arquitectura del tarificador (04/11/2026)

Alcance: bot RPA (`services/tarificador-rpa`) + Avant2 (`apps/asegura/lib/codeoscopic`) + lógica común
(`packages/module-tarificacion`, `packages/module-seguros`) + cola `seguros.tarificacion_trabajos`.
Solo lectura de código y BD; no se ha cambiado nada. Sin datos personales.
Esfuerzo: S ≤ 1 sesión · M 2-3 · L > 3. «Hecho» = verificado en código o BD; «Propuesta» = opinión de diseño.

## 0. Datos medidos en BD (30 días, modo `tarificar`)

| Compañía · ramo | ok | error_definitivo | requiere_humano |
|---|---|---|---|
| Mapfre auto | 45 | 24 | 2 |
| Allianz auto | 23 | 22 | 1 |
| Generali auto | 0 | 43 | 3 |
| Allianz moto | 2 | 25 | 5 |
| Allianz comunidades | 1 | 8 | 0 |

- En total hay 79 ok frente a 128 `error_definitivo` desde el principio. La media de `intentos` es 1,00: **en la práctica no hay reintentos**.
- Los errores son casi todos de tipo `portal` (74) y `datos` (34). Los de tipo `emision` (guard) son 15.
- `error->>'codigo'` está vacío en todos: el panel no puede agrupar por causa con clave estable.

## 1. Duplicación entre RPA y Avant2 (modelo de precio y coberturas)

**Hecho: no hay un único modelo canónico. Hay uno de COMPARACIÓN y, a su alrededor, al menos 6 formas paralelas.**

| Forma | Dónde | Estado de cobertura |
|---|---|---|
| `OfertaNormalizada` (lo que manda el bot) | `packages/module-tarificacion/src/tipos.ts:152` | `'incluida'\|'excluida'\|null` |
| `OfertaNormalizada` (comparativa: el canónico de facto) | `packages/module-seguros/src/comparar-ofertas.ts:33` | `ValorGarantia.estado` = `'incluida'\|'excluida'\|null` |
| `OfertaBot` (copia a mano de la primera) | `packages/module-seguros/src/ofertas-fuentes.ts:256` | idem |
| `PrecioAvant2` | `ofertas-fuentes.ts:49` | — |
| `Cobertura` de Avant2 | `apps/asegura/lib/codeoscopic/coberturas.ts:16` | `incluida: boolean\|null` |
| `EstadoGarantia` del catálogo | `packages/module-seguros/src/catalogo-garantias.ts:18` | `'si'\|'no'\|'no_consta'` |
| `EstadoGarantia` de la comparativa (**mismo nombre, otro tipo**) | `comparar-ofertas.ts:25` | `'incluida'\|'excluida'` |
| `OfertaParaNivel` | `apps/asegura/lib/tarificacion-niveles.ts` | según la fuente |
| `PrecioCoherencia` / `PrecioParaCoherencia` | `apps/asegura/lib/tarificacion-coherencia.ts:9` / `module-seguros/src/coherencia-cotizacion.ts:15` | — |

Hay lógica duplicada que ya diverge:
- **Niveles, dos clasificadores.** `nivelCobertura()` va por la etiqueta del vendor (`module-seguros/src/comparativa-precios.ts:97`). `masBarataPorNivel()` usa categoría, modalidad, producto y coberturas, y vive en la APP (`apps/asegura/lib/tarificacion-niveles.ts:172`), no en el paquete. Además `ofertaDeBot()` escribe `nivel: null` y `firmeza: 'estimado'` fijos (`ofertas-fuentes.ts:300-302`), aunque existen `firmezaPrecioRpa` (`module-tarificacion/src/firmeza-rpa.ts`) y la clasificación por coberturas.
- **Coherencia, dos comprobadores.** Uno se ejecuta al recibir la respuesta de Avant2 (`module-seguros/src/coherencia-cotizacion.ts`). El otro se ejecuta antes del Telegram del bot (`apps/asegura/lib/tarificacion-coherencia.ts`). Ninguno aplica las reglas del otro.
- **Telegram.** El bot lo manda desde `apps/asegura/lib/presupuesto-rpa.ts` y Avant2 por su camino propio (`cotizacion_incoherente`). No hay un texto común «resumen por nivel».

**Propuesta: contrato común** (en `packages/module-seguros`, porque ya es el canónico de facto):

```ts
type EstadoCobertura = 'incluida' | 'excluida' | null          // null = no se sabe (nunca «no hay»)
type OfertaCanal = {
  canal: 'bot' | 'avant2' | 'poliza_actual' | 'pdf'
  compania: string; producto: string | null; modalidad: string | null
  prima: { anualTotal: number | null; neta: number | null; fracc: Fraccionamiento | null; recibo: number | null;
           periodo?: { importe: number; meses: number | null } }   // prima no anual: nunca entra en el orden
  garantias: Record<ClaveCanonica | string, { estado: EstadoCobertura; capital: number|null; limite: number|null; franquicia: number|null }>
  franquiciaGeneral: number | null
  nivel: Nivel                 // UNA sola función: clasificarNivel(ramo, oferta) -> {clave, fuente, reconocido}
  firmeza: 'firme' | 'condicionado' | 'estimado' | null
  coherencia: AvisoCoherencia[] // UNA sola función: comprobarCoherencia(ofertas, riesgo)
  referencia: ReferenciaOferta; avisos: string[]; validaHasta: string | null
}
```

Los adaptadores serían `ofertaDeBot`, `ofertaDeAvant2` y `ofertaDePolizaActual`, todos con salida `OfertaCanal`. El resto (comparativa, niveles, coherencia, Telegram y la pantalla `/correduria/tarificador/resumen`) leería solo `OfertaCanal`. `EstadoGarantia 'si'/'no'/'no_consta'` queda solo como forma de presentación.

- **Qué se rompe si se hace mal:** si se juntan `null` y `excluida`, la comparativa puede afirmar «no incluye» lo que no se leyó, y eso va contra la regla NULL. Además los estudios ya guardados en `presupuestos.estudio` tienen la forma vieja (opcionales ausentes = no se sabe).
- **Cómo se verifica:** un test de tabla con las mismas 10 ofertas reales redactadas (5 del bot y 5 de Avant2) que pruebe que nivel, coherencia y «más barata» no cambian. Más un cepo que falle si se vuelve a exportar dos tipos con el nombre `EstadoGarantia`.
- **Esfuerzo:** M. **Riesgo:** medio (cambia la pantalla y el Telegram, pero no hay emisión ni gasto).

> Comisiones: decisión de Alberto del 04/11, Avant2 sirve solo para tarificar y emitir. El único código que lee `brokerFee` es `apps/asegura/lib/codeoscopic/catalogo-companias.ts:229-231` y `app/api/operador/codeoscopic/catalogo/route.ts`. **Se puede quitar**; no hace falta hacer nada más con él.

## 2. Coste hoy de dar de alta una compañía y plantilla de alta

**Hecho:** el nombre `pelayo` aparece en **29 ficheros que no son tests** y `fidelidade` en 26. Esos ficheros están repartidos por guard, explorador (servicio y paquete), inventario-dom, modal-informativo, diagnostico-clic, desplegable-custom, entorno-navegador, privacidad-mediador, permisos-navegacion, grabador-marcos, navegacion-libre, adapters, reglas del explorador y estado de asegura, comparativa-ia, simulación de Codeoscopic y WhatsApp. Solo `guard.ts` tiene 60 menciones de Pelayo. Las excepciones del guard son constantes por compañía mezcladas con el guard genérico (`guard.ts:203-254` Allianz, `:467` Mapfre, `:861-882` Generali, `:1023-1049` Pelayo, `:2548-2684` Mapfre).

**Propuesta: ficha declarativa por compañía** en `packages/module-tarificacion/src/companias/<cia>.ts`. Sería un objeto `Object.freeze`, validado por un esquema puro y con su propio test:

```ts
export const PELAYO: FichaCompania = {
  id: 'pelayo', ramos: ['auto'],
  dominios: { login: ['https://mediadores.pelayo.com'], sso: ['https://acceso12.pelayo.com'], app: ['https://apps.pelayo.com'] },
  entradas: { auto: { ruta: '/portalmediador-nuevo-presupuesto', enlaceTexto: 'Nuevo presupuesto' } },  // texto EXACTO
  pasos: [{ id: 'vehicle', ruta: '/contratacion-autos/vehicle', pulsable: true }, ...],
  pantallaPrecio: { ruta: '/contratacion-autos/<precio>', lector: 'tabla-importes' },
  inicioEmision: { rutas: ['/contratacion-autos/<paso5..7>'], rotulos: ['Precio final', 'Intervinientes', 'Medios de pago', 'Contratar'] }, // TOPE
  ajaxLectura: [/* AjaxValidacionAvance exactos */],
  topes: { nuevaContratacion: 2 },
}
```

- Lo **genérico** (recorrido, explorador, pilotaje, guard) lee la ficha. Las **puertas estrechas** con código (por ejemplo, el «Confirmar» de Generali) siguen siendo funciones, pero la ficha las referencia por id. Así una compañía nueva supone 1 ficha, 1 adaptador de lectura de precio, filas de `tarificador_permisos_navegacion` y fixtures.
- `inicioEmision` es **obligatorio** y el validador rechaza una ficha sin él. Ninguna ruta de `pasos` puede coincidir con `inicioEmision` ni con `PATRON_EMISION`. Ese es el tope duro declarado.
- Las rutas que se aprenden en el pilotaje **siguen en BD** (`permisos-navegacion.ts`, que ya rechaza filas con categoría de emisión, `:138`). La ficha solo fija dominios y el tope; la BD solo puede **estrechar**.
- **Qué se rompe si se hace mal:** si se mueve una excepción y se cambia su forma (un prefijo en lugar de una ruta exacta), se ensancha el guard. **Cómo se verifica:** migrar Pelayo primero y comprobar que todos los tests del guard (`fidelidade-entrada-guard`, `pelayo-*`, `regression-tarificador-rpa`) siguen verdes **sin tocarlos**. Además, un cepo nuevo: «una ficha cuya ruta de paso coincide con `inicioEmision` → el validador lanza».
- **Esfuerzo:** L (hay que hacerla por compañía, empezando por Pelayo). **Riesgo:** alto, porque toca el guard. Revisión por `agente-architect`.

## 3. Seguridad del guard

**Hecho: no hay una única fuente de verdad del tope de emisión.** El vocabulario está en al menos 4 sitios:
1. `PATRON_EMISION` y `RE_ACCION_REAL_TRAS_PREFIJO` (`packages/module-tarificacion/src/guard-emision.ts:19`, `:478`).
2. `BLOQUEO`/`CONCEPTOS_ACCION` de `services/tarificador-rpa/src/vocabulario.ts`.
3. **≥7 regex privadas escritas a mano dentro de `guard.ts`** que ya no coinciden entre sí: `:3163`, `:3310`, `:3319`, `:3320`, `:3340`, `:6122`, `:6424`. Unas incluyen `suplement|anul` y otras no. Unas incluyen `acept`, `tarif` o `guard` y otras no.
4. Topes por compañía: `pelayo-contratacion.ts:25` + `guard.ts:1023`, `MAX_CAMBIOS_COMERCIALES_MAPFRE` y otros.

Hoy fallan del lado seguro (se combinan con `comprobarBoton` y con el filtro de red). El riesgo es otro: **una regresión que estreche una regex privada pasa desapercibida**, porque ningún test compara las listas entre sí.

`guard.ts` tiene 8.351 líneas y 365 exports, con comentarios de versión en cada bloque (71 menciones `0.3.x`). `explorador.ts` del servicio tiene 1.654 líneas y el del paquete 2.798. En un diff de 40 líneas dentro de un fichero de 8.000, quien revisa no ve qué puerta se ha relajado.

**Propuesta de partición segura** (de una en una, cada paso es un PR que solo mueve código):
1. `guard/nucleo.ts`: `instalarGuardEmision`, el filtro de red, `pulsar`, `comprobarBoton`. Es lo único que puede relajar, y lleva CODEOWNERS o etiqueta de revisión obligatoria.
2. `guard/vocabulario-emision.ts`: **una lista base** (`VERBOS_EMISION_BASE`). Cada regex local se define como `base ∪ extra`, nunca como un literal nuevo. Un test comprueba que toda regex de bloqueo del guard contiene la base.
3. `guard/puertas/<compania>.ts`: las puertas estrechas por compañía (Allianz, Mapfre, Generali, Pelayo, Fidelidade). Más adelante las alimenta la ficha del punto 2.
4. Los comentarios de versión pasan a `docs/tarificador/CHANGELOG-GUARD.md`. En el código queda solo el porqué vigente.

- **Cómo se verifica:** en cada PR, `git diff --stat` solo con movimientos (`git diff -M --color-moved`), los tests del guard intactos y en verde, y el cepo de la base visto en ROJO (quitar `anul` de una regex local tiene que fallar).
- **Esfuerzo:** M (pasos 2 y 4: S cada uno). **Riesgo:** medio. Es un movimiento mecánico, pero en la barrera.

Otras comprobaciones (según las instrucciones del revisor):
- Diagnóstico nuevo de 0.3.47 (`bloqueosRed`, `pilotaje.ts:334-337`): las líneas son método + origen + ruta sin query (`guard.ts:568-595`). Se **descartan** si la redacción las cambia o si `pareceDatoPersonalInventario` salta. Es más estricto que redactar, así que no hay fuga. **Pero no pasa por `redactarValoresInventario`.** Si alguien quita el filtro de `pilotaje.ts:335`, una ruta con un id o un NIF en un segmento se publicaría. Propuesta: pasarla también por `redactarValoresInventario` y añadir un test con un NIF en el path. S.
- Las excepciones revisadas son por origen + ruta exacta (`RutaTolerable`, `tolerarRutasApp`, `RUTA_TOLERABLE_WIZARD_AUTOS_PELAYO` con `rutasExactas`) y por texto exacto (`esTextoNuevaContratacionPelayo`). No se ha visto ninguna excepción por prefijo suelto ni por subcadena.

## 4. Fiabilidad y operación

| Tema | Hecho | Propuesta | Esf. |
|---|---|---|---|
| Reintentos | Media de `intentos` = 1,00. Existe el estado `error_reintentable`, pero casi no se usa. El 60 % termina en `error_definitivo`. | Separar el error **transitorio** (timeout, `infra`, 5xx del portal, overlay) del **determinista** (`datos`, `emision`). Solo el transitorio se reintenta, 1 vez y con espera. `error.codigo` obligatorio (hoy está vacío en el 100 %). | S-M |
| Idempotencia del bot | `pilotaje`, `humo`, `exploracion`, `vehiculo` y `emision` tienen índice único parcial «vivo». **`tarificar` no lo tiene**: el duplicado solo se detecta en código (`apps/asegura/lib/tarificador.ts:131-145`, `tarificador-duplicados.ts`), y dos pulsaciones a la vez pueden crear dos trabajos y dos Telegram. | Índice único parcial por `(correduria_id, compania, ramo, md5(riesgo_purgado))` en los estados vivos, **excepto hogar** (su purga no distingue viviendas: ver `tarificador-duplicados.ts:5-8`). Hace falta una columna `riesgo_huella` calculada al encolar. | S |
| Idempotencia de Avant2 | Bien: un solo intento, contador `codeoscopic_consumo` y el botón 💶 con confirmación. | Nada. | — |
| Caché de 24 h | No existe. | Reutilizar un `ok` del bot con la misma `riesgo_huella`, misma compañía y ramo, y `terminado_at` < 24 h. Para Avant2, reutilizar `tarificaciones` con la huella. Se marca «precio de hace X h». Para el bot es tiempo, no dinero; para Avant2 son 0,50 € por reutilización. | S |
| Panel y alarma | Ya existen `/correduria/tarificador/estado`, `tarificador-alarma-reglas.ts` (3 días sin precio / 3 errores seguidos) y el cron en `apps/asegura/vercel.json:114`. | Añadir a la alarma el porcentaje de ok de 7 días por pareja y la causa dominante (necesita `error.codigo`). | S |
| Capturas del pilotaje | Faltan `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_SUPABASE_URL` en `central-asegura`. | Es un paso de Alberto, no de código. Mientras falten, el panel debe decir «captura no disponible (configuración)» y no «sin captura». Revisar que no dé por ausente lo que no pudo subir (regla NULL). | S |
| Imagen y disco del worker | `playwright:v1.63.0-noble`, `shared-cpu-2x`/2 GB (`fly.toml:10-11`). Hay columnas `imagen_bot`/`imagen_prueba`. | Limpiar `/tmp` y las trazas al terminar cada trabajo, y comprobar el espacio libre al arrancar (un trabajo sin disco suficiente se aborta como `infra`, que es transitorio). Fijar la imagen por digest. | S |

## 5. Producto: lo que falta para el uso diario

Flujo objetivo: lead → matrícula → tarificar en paralelo (bot + Avant2 opcional) → comparativa por nivel → Telegram ✅/✏️ → emisión.

1. **Matrícula primero** (modo `vehiculo` 0.3.48): está hecho, pero sin activar. Hay que probarlo con una matrícula real y encadenar «vehículo confirmado → encolar `tarificar` en todas las compañías activas».
2. **Abanico paralelo:** una sola orden «tarificar este riesgo» que cree N trabajos de bot (uno por pareja activa) y, si Alberto pulsa 💶, el de Avant2. Todos con la misma `riesgo_huella` y el mismo `oportunidad_id`. El Telegram sale **una vez**, cuando terminan todos o se cumple un plazo (por ejemplo 20 min), con lo que haya. Ahora se manda uno por trabajo.
3. **Comparativa por nivel** sobre `OfertaCanal` (punto 1): «terceros / terceros ampliado / TR con franquicia / TR sin franquicia → la más barata de cada uno y qué le falta». `masBarataPorNivel` ya lo hace, pero solo en la app y sin que el bot aporte nivel.
4. **Telegram ✅ / ✏️**: el ✅ se apoya en `pendiente_autorizacion_emision` (24 h) de `tarificador-emision.ts`. Falta que ✏️ abra la oportunidad en `/correduria` con la oferta preseleccionada.
5. **Re-tarificación a 45 días:** `apps/asegura/lib/retarificar-cartera.ts` es **solo Avant2** (gasta 0,50 €). Falta un cron que tome la cartera en vigor (`esCarteraEnVigor`) con vencimiento a 45 días, encole trabajos de bot (gratis) con el riesgo de la póliza y avise a Alberto con la comparativa frente a la póliza actual (`ofertaDePolizaActual` ya existe). Avant2 solo con el botón. Sin contactar al cliente.

Esfuerzo total: L, por fases (abanico + Telegram único: M; cartera 45 d: M).

## 6. Deuda

- **Tests que fijan la versión:** hay 22 ficheros con `assert.equal(EXPLORADOR_VERSION, '0.3.48')` (p. ej. `test/explorador-v0324.test.ts:78`, `vehiculo.test.ts:30`). Cada versión obliga a tocar 22 tests sin valor. Propuesta: **un** test que compruebe `PATRON_VERSION_BOT` + que `bot_version` del trabajo coincide con `EXPLORADOR_VERSION`. Los ficheros `*-v0NNN.test.ts` se renombran por comportamiento (`pelayo-sso`, `generali-turismos`…). S.
- **Hay 50 ficheros de test nombrados por versión** (`generali-v0217…v0243`, `explorador-v0316…v0343`). Son difíciles de encontrar y es fácil que se dupliquen. Agruparlos por tema. S-M.
- **Hay dos `explorador.ts`** (servicio 1.654 líneas, paquete 2.798) y dos `inventario-dom.ts`. Hay que dejar claro cuál es puro (paquete) y cuál Playwright (servicio), con un test de import que lo vigile. S.
- **Hay 28 worktrees de git** (23 en `.claude/worktrees`). Podarlos (`git worktree prune` y quitar los de ramas ya mergeadas). Es un paso de la sesión, no de código. S.
- Hay que eliminar el código que lee `brokerFee` (ver el punto 1).

## 7. Prioridad (impacto / esfuerzo)

1. Una sola lista base de verbos de emisión en el guard + test de contención (punto 3.2). Esfuerzo S, cierra el riesgo más grave.
2. `error.codigo` obligatorio + reintento solo del error transitorio (punto 4). Esfuerzo S-M; hoy el 60 % termina en `error_definitivo`.
3. `riesgo_huella`: índice único para `tarificar` + caché de 24 h (punto 4). Esfuerzo S.
4. Contrato `OfertaCanal` + un solo `clasificarNivel` y un solo `comprobarCoherencia` en `module-seguros` (punto 1). Esfuerzo M.
5. Partición de `guard.ts` + ficha declarativa por compañía, empezando por Pelayo (puntos 2 y 3). Esfuerzo L.

Después: abanico paralelo con Telegram único, re-tarificación de cartera a 45 días con el bot, y limpiar los tests por versión.
