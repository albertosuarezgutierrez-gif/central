# Portal del cliente — «Avisos»: preferencias configurables y aviso de siniestro

**Fecha:** 06/09/2026 · **App:** `apps/asegura-portal` (+ el cron de `apps/asegura`)
**Origen:** dictado de Alberto — *«una pestaña de configuración… que los clientes puedan
configurarse su intranet y los avisos a su gusto… que se le avise cuando haya un siniestro o
cuando le vaya a vencer, inclusive que él indique el tiempo que quiere que le avise de la
renovación»*.

---

## 0. Lo que hay que saber antes de leer nada más

Todo lo de esta sección está **medido** contra la Supabase compartida el 06/09/2026.

| Hecho | Consecuencia para este diseño |
|---|---|
| **El cron de avisos de vencimiento está APAGADO** (`ASEGURA_AVISOS_ACTIVOS` sin definir) | Un panel de interruptores sobre un motor apagado es la mentira más cara del repo. Encenderlo es parte de la entrega, con su puerta (§6) |
| **El aviso de siniestro NO existe** en ninguna forma | No es «configurar»: es construir. Es la mitad del trabajo |
| `portal_obligacion.tipo` = `poliza · itv · carnet · recibo · mantenimiento · revision_gas · libre` | El portal ya modela **siete** recordatorios, no dos. Hay siete cosas que configurar el día 1 |
| `prisma_asegura_portal` tiene **SELECT sobre 13 columnas** de `clientes`, y `email_opt_out_at` **no está** | El portal no puede leer ni escribir la baja de correo de la cartera → §1.3 |
| Estados de siniestro **en uso**: solo `abierto` y `cerrado` (el enum tiene 4) | En la práctica el aviso es un correo: «se ha cerrado». `rechazado` llegará algún día y es el delicado |
| **69 siniestros ya cargados**, ninguno con sello de avisado | Sin el backfill de §3.1, el día 1 salen 69 correos sobre siniestros de 2024 |
| **5 identidades** en el portal (las 5 han entrado), **46 invitables**, **29 sin correo** | El VALOR POR DEFECTO es lo que de verdad decide. Casi nadie tocará el panel |
| El portal solo guarda un **hash con pimienta** del canal | La pantalla no puede decir a qué correo escribe |

---

## 1. El dato y la regla

### 1.1 Tabla `seguros.portal_preferencia_aviso`

| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK | |
| `identidad_id` | uuid NOT NULL → `portal_identidad` | de quién es |
| `poliza_id` | uuid **NULL** → `polizas` | `NULL` = la general; con valor = excepción de esa póliza |
| `dias_antelacion` | int **NULL** | 🚨 `NULL` = «no ha elegido», **no** cero |
| `tipos_silenciados` | `portal_obligacion_tipo[]` NOT NULL DEFAULT `'{}'` | array del **enum**: la BD rechaza un tipo inventado |
| `avisar_siniestro` | boolean **NULL** | `NULL` = usa el defecto (`true`) |
| `actualizada_en` | timestamptz NOT NULL DEFAULT now() | |

**Índice único.** En Postgres `UNIQUE(identidad_id, poliza_id)` deja meter **varias generales**,
porque `NULL ≠ NULL`. `portal_autorizacion` ya lo resolvió con `COALESCE(póliza)` en su clave: se
copia ese idioma, no se inventa otro.

**CHECKs:**
- `dias_antelacion IS NULL OR dias_antelacion BETWEEN 7 AND 120`.
- 🚨 **Una fila de excepción (`poliza_id NOT NULL`) solo puede llevar `dias_antelacion`**:
  `poliza_id IS NULL OR (tipos_silenciados = '{}' AND avisar_siniestro IS NULL)`. Sin esto, la misma
  columna significaría dos cosas según la fila y habría dos sitios donde apagar el mismo aviso — la
  clase de ambigüedad que no falla, simplemente hace lo que no esperabas. Silenciar un tipo o los
  siniestros es una decisión de la persona, no de una póliza.

**Por qué `avisar_siniestro` va aparte y NO como un valor más de `portal_obligacion_tipo`:** un
siniestro es una **novedad**, no una obligación del cliente. Meterlo ahí rompería el significado de
esa tabla — y un valor de enum no se puede quitar después.

**GRANTs:** `prisma_asegura_portal` con SELECT/INSERT/UPDATE/DELETE sobre las columnas de esta
tabla; `prisma_seguros` con SELECT (lo lee el cron). 🚨 **El GRANT va ANTES de declarar las columnas
en el schema de Prisma**: el rol lee por columnas, y declarar una sin conceder revienta TODAS las
lecturas del modelo con `42501`.

### 1.2 La regla, pura y testeada

```
antelacionEfectiva(excepcionDeLaPoliza, general, DEFECTO = 60)
  = excepcionDeLaPoliza ?? general ?? DEFECTO
```

Vive en `@central/module-seguros-portal`, sin BD y sin red.

**Por qué 60 y no 30** [Probable]: el tomador debe comunicar por escrito que **no** prorroga con un
mes de antelación (art. 22 LCS). Un aviso a 30 días le llega **en la fecha límite**, con cero holgura
para pensarlo, pedir precio y decidir. A 60 quedan ~30 días de margen para retarificar y enseñarle
algo — que es la ventana comercial de §5.

**Rango 7–120, con advertencia por debajo de 30**, no bloqueo: la pantalla dice *«a esta antelación
ya no puedes evitar que se renueve; te lo mando igual»*. Un ajuste que te deja pedir algo inútil sin
decírtelo es la misma mentira en versión amable.

### 1.3 Quién decide si sale el correo

En el cron de `apps/asegura`, que es **el único que ve las dos bajas**:

> Se envía **solo si** la preferencia no lo silencia **Y** `clientes.email_opt_out_at` está vacío
> **Y** el correo es legible.

**Cualquiera de las tres dice no → no sale**, y se cuenta como `sinCanal` en vez de restarse del
total. Decisión de Alberto: una baja nunca se reabre por haber entrado al portal (art. 21 LSSI).

⚠️ **Coste asumido:** el panel puede mostrar un aviso «pedido» a alguien que está de baja en la
cartera y no lo sabe. Se resuelve con la regla de redacción de §2, no ocultándolo.

---

## 2. La pantalla

**Se llama «Avisos», no «Configuración».** Buscado qué es configurable de verdad: los avisos y el
tema claro/oscuro, que ya existe. Los datos de contacto **no** son editables (el rol solo tiene
SELECT sobre `clientes`). Llamarla Configuración prometería un panel que no hay.

Es una **vista de la bóveda** (`/boveda?vista=avisos`), no una ruta nueva: la navegación ya deriva
la pestaña activa de la URL (`pestanasPortal()` + `vistaDeBoveda()`), y añadir una ruta suelta
duplicaría ese mecanismo.

**Contenido:**

- **Solo los tipos de aviso que le aplican**, derivados de sus obligaciones reales. A quien solo
  tiene el coche no se le enseña «revisión del gas»: un interruptor de algo que nunca va a pasar es
  ruido y sugiere un seguro que no tiene.
  ⚠️ **Y si no tiene NINGUNA obligación, la pantalla no sale vacía:** dice que todavía no hay nada
  de qué avisarle y por qué (su cartera no tiene vencimientos próximos, o su ficha aún no está
  vinculada). Una pestaña en blanco se lee como una avería.
- **La antelación general**; la excepción por póliza vive **en la ficha de esa póliza**, no en una
  lista de siete filas aquí.
- **Canal: correo, y punto.** Ni WhatsApp ni SMS — la WABA no existe. Un desplegable con opciones
  que no funcionan es peor que no tenerlo.
- **La baja total** («no quiero ningún correo»), que escribe en la preferencia del portal.

🚨 **Regla de redacción de toda la pantalla: habla de lo que has PEDIDO, no de lo que va a pasar.**
El portal no puede ver `email_opt_out_at`, así que «recibirás un aviso el 30/07» sería afirmar algo
que no sabe. Dice: *«aquí has pedido que te avise 60 días antes»*. Es la misma distinción que la
bóveda ya hace entre «no hay» y «no lo sé».

Por lo mismo, **no muestra a qué correo escribe** (solo tiene el hash): dice «al correo con el que
entras».

---

## 3. El aviso de siniestro

### 3.1 🚨 El backfill, que va primero porque es lo que hunde esto

Hay **69 siniestros cargados** y ninguno con sello. Si el cron arranca tratando `NULL` como «nunca
avisé», salen 69 correos sobre siniestros de 2024, varios ya cerrados.

**La misma migración que crea las columnas las siembra con el estado actual de cada fila.** No en un
paso posterior: entre una cosa y la otra el cron puede correr.

### 3.2 El sello y el disparador

No hay hook: CIMA escribe desde el CRM (repo `asegura`), que no se toca. Se detecta **comparando**:

- `seguros.siniestros.avisado_estado` (`estado_siniestro`, NULL) + `avisado_en` (timestamptz, NULL),
  al lado de la cosa, como `portal_obligacion.avisada_at`.
- Se avisa cuando **`estado <> avisado_estado`**.

⚠️ [Probable] **A VERIFICAR antes de aplicar la DDL:** que el UPDATE de `persist-siniestro.ts` del
CRM solo reescribe `estado`, `tipo`, `fecha_hora` y `lugar_*` — si escribiera la fila entera,
borraría el sello en cada pull. No se da por hecho: se lee ese fichero.

### 3.3 Las cuatro guardas

| Guarda | Por qué |
|---|---|
| **Solo al titular** | Un tercero autorizado no puede *ver* siniestros (`NUNCA_A_UN_TERCERO.siniestros === false`); mandarle un correo sería peor que la pantalla que se le niega. Solo identidades con `portal_vinculo` a la ficha dueña de la póliza |
| **Solo cartera viva** | `WHERE_CARTERA_VIVA` de `@central/module-seguros`. Sin esto, siniestros del volcado histórico |
| **El interruptor** | `avisar_siniestro` (§1.1) |
| **Sello inmediato** | Se escribe `avisado_estado` justo tras el envío aceptado; si el sello falla se grita, como ya hace el cron de vencimientos |

### 3.4 Qué dice el correo

**«Hay novedad en un expediente tuyo», y enlaza al portal.** Ni el estado, ni la compañía, ni el
número, ni el importe. Mismo cepo que el correo de invitación (`CAMPOS_PROHIBIDOS_EN_INVITACION`) y
por el mismo motivo: **un correo se reenvía y sobrevive en buzones compartidos**. «Tu siniestro ha
sido rechazado» no puede acabar en el correo del trabajo de nadie.

**El enlace abre SU siniestro, no una oferta** (§5).

---

## 4. Lo que NO se hace

- **No se toca `clientes` desde el portal** — ni la baja, ni los datos de contacto. §1.3 resuelve la
  doble baja sin romper el aislamiento por columnas.
- **`siniestro` no entra en `portal_obligacion_tipo`.**
- **Ni WhatsApp ni SMS** en el panel.
- **Ningún aviso de siniestro a un tercero autorizado.**
- **No se recalculan las obligaciones existentes** al cambiar una preferencia: la antelación se
  aplica al decidir el envío, no al generar la obligación (el enfoque descartado secuestraba
  `fecha_accionable`, que significa otra cosa).

---

## 5. La ventana comercial: el vencimiento, nunca el siniestro

Alberto: *«hay que hacer que el cliente entre a la intranet, ya que ahí es donde notificaremos
oferta y vender»*. De acuerdo con que el correo **traiga**; en desacuerdo con colgar la venta del
aviso de siniestro:

1. Ese correo dejaría de ser transaccional y pasaría a ser comunicación comercial (LSSI art. 21),
   que exige opt-out en cada mensaje — y choca con que el portal no pueda leer la baja.
2. Abrir un correo porque se ha movido tu siniestro y aterrizar en una oferta quema confianza, y son
   80 clientes, no 80.000.
3. [Probable] Enseñar una oferta con precio a un cliente identificado es comercialización, y arrastra
   análisis objetivo e IPID (RDL 3/2020) — más exposición que la web pública, donde ya hay un cepo
   (`lib/ramos.test.ts`) para no prometer nada.

**El escaparate cuelga del vencimiento**, que es el momento en que ofrecer revisar la póliza es
literalmente el trabajo de un corredor. Y por eso la antelación de §1.2 es una decisión comercial,
no cosmética: es el tiempo que queda para retarificar y presentar algo.

*(El escaparate en sí NO entra en esta entrega: aquí solo se fija dónde puede colgar.)*

---

## 6. Encender el cron de vencimientos — con su puerta

Es de Alberto, no del código:

1. `GET /api/cron/avisos-vencimiento?contar=1` (ensayo, no envía).
2. **Comprobar que el número sale ≤ 110** (las pólizas vivas de CIMA). Si sale de miles, el filtro de
   cartera viva no está funcionando y **no se enciende nada**.
3. Solo entonces `ASEGURA_AVISOS_ACTIVOS=1` en Vercel, y redesplegar (una variable nueva no se aplica
   hasta el Redeploy).

---

## 7. Cepos — y cada uno hay que VERLO ROJO

| # | Cepo | Qué deja pasar si falta |
|---|---|---|
| 1 | `dias_antelacion` NULL usa el defecto | un `?? 0` avisaría el mismo día del vencimiento |
| 2 | La migración siembra el sello de los 69 siniestros | 69 correos sobre siniestros de 2024 |
| 3 | Un tercero autorizado nunca recibe aviso de siniestro | se le cuenta por correo lo que se le niega en pantalla |
| 4 | El correo no nombra ni un campo de la cartera | reutiliza `CAMPOS_PROHIBIDOS_EN_INVITACION` |
| 5 | La pantalla no dice «recibirás» | afirma un envío que la baja de cartera puede impedir |
| 6 | Rango 7–120 y advertencia por debajo de 30 | se le deja pedir, en silencio, un aviso que llega tarde |
| 7 | El envío exige las TRES condiciones de §1.3 | una baja reabierta por haber entrado al portal |

**No basta con escribirlos y verlos verdes.** Se rompe a propósito lo que cada uno dice proteger, se
comprueba que se pone rojo, se restaura, y la salida del rojo va en el PR. Un brazo por aserción.
*(Regla de la casa, y hoy mismo tres cepos de otra entrega pasaron en vacío por no hacer esto.)*

---

## 8. Riesgos abiertos

- **29 de 80 clientes no tienen correo.** Para ellos ningún aviso de este diseño existe, y el panel
  tampoco: sin correo no hay código de acceso. Es teléfono, no código. La hoja con QR
  (`/api/hojas`) es el único artefacto que hoy les llega.
- **El sello dentro de `siniestros`** depende de que la ingesta del CRM no reescriba la fila entera
  (§3.2). Si resultara que sí, el sello se muda a una tabla `portal_*` propia.
- **Con 5 identidades, esto se construye para nadie todavía.** El orden que lo hace útil es:
  encender el cron → invitar a los 46 → mirar quién entra. El panel vale lo que valga esa invitación.
