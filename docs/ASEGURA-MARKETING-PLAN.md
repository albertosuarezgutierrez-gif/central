# Plan de marketing y captación — Grupo ASegura

> Correduría de seguros de Alberto (DGSFP **CS-F/0170**). Este documento es el plan de
> actuación para **empezar a captar clientes**, con el diagnóstico que lo justifica.
> Redactado el **04/09/2026**. El detalle del negocio vive en la skill `agente-correduria`
> (`references/sector.md`) y en `apps/asegura/CLAUDE.md`; aquí solo va lo comercial.
>
> **Regla de lectura:** cada cifra dice de dónde sale. Lo que no se ha medido se dice como
> «no medido», nunca como 0 (regla `NULL ≠ 0` de `CLAUDE.md`).

---

## 1. Diagnóstico: de qué tamaño es el problema

### 1.1 La cartera real (medido en BD el 03-04/09/2026)

| | Clientes | Pólizas |
|---|---|---|
| **Cartera VIVA** | **80** | **110** (de las que 42 `cancelada` → **68 vivas de verdad**) |
| Volcado histórico (= leads) | 32.520 | 28.733 |

Ramos de la cartera viva: **auto 81 · hogar 19 · RC 9 · moto 1**.
Geografía: **Sevilla 76 %** de la cartera viva (61 de 80).
Ratio: **1,4 pólizas por cliente** — una correduría sana está por encima de 2.

Definición de «viva» (fuente única, no reimplementar):
`esCarteraViva()` en `packages/module-seguros/src/cartera-viva.ts` →
`import_ref IS NULL OR eiac_xml_hash IS NOT NULL`.

### 1.2 Las tres conclusiones incómodas

**(a) El problema no es de SEO, es de escala y de superficie pública.**
68 pólizas vivas. El SEO da resultados a 6-12 meses. Elegirlo como primera acción es elegir
el canal más lento que existe para un negocio que necesita pólizas ahora. El SEO va en el
plan, pero **no primero**.

**(b) Los 32.520 leads no son una lista de marketing. Vía cerrada.**

| | |
|---|---|
| Con algún dato de contacto | **5.594 (17,2 %)** |
| Sin email ni teléfono | 26.926 (82,8 %) |
| Vencimiento entre 2014 y 2018 | 95 % |
| Material reciente (2023-24) | ~512 clientes |
| **Registros de consentimiento en toda la BD** | **`consent_logs` = 2 filas** |
| `wa_opt_in = true` | **0** |

No es que la legitimación esté «pendiente de resolver»: **no existe ningún registro de
consentimiento**. Escribir a base fría de 8-12 años sin base de legitimación acreditada es
una sanción, no un canal. **WhatsApp queda descartado de raíz** (0 opt-in, y además no hay WABA).

Uso legítimo de esa base: **inteligencia de mercado** (qué ramos y qué zonas hubo) y
**recepción pasiva** — que lleguen ellos por su pie al portal y consientan allí.

⚠️ Trampa de segmentación medida: el CP **41001 aparece en 10.933 fichas**. Es casi con
seguridad el CP del despacho usado como relleno del volcado — un «no lo sé» disfrazado de dato.
**No segmentar por código postal.** Por provincia sí es fiable en agregado.

**(c) Estás sobre-expuesto al peor ramo — y ahora está MEDIDO.**
81 de 110 pólizas son auto. Medido sobre `seguros.poliza_recibos` (recibos **cobrados**, ventana
01/09/2025-31/08/2026, por `fecha_efecto_actual`):

| Ramo | Pól. vivas | Con recibo cobrado | Prima neta | Comisión bruta | **Tasa** | **Comisión media/póliza/año** |
|---|---|---|---|---|---|---|
| auto | 81 | 21 | 8.222,52€ | 858,20€ | **10,44 %** | **40,87€** |
| hogar | 19 | 7 | 2.184,43€ | 481,20€ | **22,03 %** | **68,74€** |
| resp. civil | 9 | 4 | 1.220,81€ | 208,58€ | **17,09 %** | **52,15€** |
| moto | 1 | 0 | — | — | — | sin medición |
| **Total** | **110** | **32** | **11.627,76€** | **1.547,98€** | **13,31 %** | **48,37€** |

**Hogar dobla la tasa de auto (22 % vs 10 %) con prima parecida** (312,06€ vs 391,55€): cada
póliza de hogar renta ~69€/año frente a ~41€ de auto. Ese es el argumento para dejar de
perseguir auto — donde además la SERP la controlan comparadores (Rastreator, Acierto, Kelisto)
y aseguradoras directas, y [Seguro] no se compite con este presupuesto.

🚨 **Pero es una hipótesis razonable, NO una conclusión medida.** Tres huecos:
1. **Muestra insuficiente**: hogar descansa en **8 recibos de 7 pólizas**; RC en 4; moto en 0.
2. **Sesgo de Mapfre**: es el 64 % de la cartera y casi todo el auto, y **su último recibo
   cobrado tiene efecto 02/04/2026 — faltan ~5 meses**. El 10,44 % de auto se mide sobre un
   periodo más corto que el de hogar: **no son comparables a pelo**, y el auto está infravalorado.
3. **Compañías sin dato**, que sesgan cualquier total: Mapfre manda recibos pero **cero
   liquidaciones** (devengado, no confirmado en caja); **Reale** solo tiene un recibo `pendiente`
   con fecha centinela `0001-01-01`; **Occident** liquida con remesa **0,00€** por saldo deudor
   (compensación, **no impago**); **Generali** no tiene ni acceso CIMA ni pólizas vivas.

⚠️ **La base histórica NO puede dar muestra de hogar/salud/decesos: es un hueco, no un 0.**
`polizas` no tiene ninguna columna de comisión, y de las 28.733 pólizas históricas **solo 1**
tiene recibo asociado. Los volúmenes históricos (**hogar 5.642 · salud 4.470 · decesos 773 ·
comercio 110 · RC 72**) dicen dónde hubo negocio, pero **no a qué comisión**.

📌 Nota de fuentes: el libro `comisiones_devengo` / `comisiones_cobertura` **existe, pero en el
schema `public`** (lo crea `apps/plataforma/prisma/sql/2026-09-01_comisiones_devengo.sql` sin
cualificar), no en `seguros`, y agrega por *(compañía, periodo)* — **no por ramo**. Para elegir
ramo la fuente correcta es `seguros.poliza_recibos`, que es lo que se ha usado aquí.

### 1.3 Estado de la presencia pública (verificado 04/09/2026)

| Activo | Estado |
|---|---|
| Web pública de marketing | **NO existe** |
| Única página pública | `/seguros` en `apps/plataforma` — 1 página, 3 bullets y un formulario, bajo el dominio de plataforma |
| `app.grupoasegura.com` | Sirve el **CRM de Manuel** (proyecto Vercel `asegura`, repo `albertosuarezgutierrez-gif/asegura`, ya en la cuenta de Alberto) |
| **Apex `grupoasegura.com` y `www.`** | **Libres — no atados a ningún proyecto Vercel** |
| `grupoasegura.es` | No atado a ningún proyecto Vercel |
| sitemap · robots · JSON-LD · Open Graph | **Cero, en las tres apps** |
| Analítica | **Ninguna** (el portal declara «una sola cookie, sin analítica ni terceros») |
| Google Business Profile | No consta |

**El apex libre es la mejor noticia del diagnóstico:** la web de marketing nace en la URL
correcta sin desalojar nada y sin tocar el CRM que ingiere CIMA.

⚠️ **No verificado** (la política de red del entorno de sesión bloquea la salida a internet):
qué sirve hoy cada dominio, y **quién figura como titular en el registrador**. Que un dominio
esté verificado en Vercel prueba control del DNS, no propiedad de la cuenta del registrador.

### 1.4 Canales ya montados

| Canal | Estado |
|---|---|
| Formulario web → lead | ✅ `POST /api/publico/correduria/lead` (rate limit, honeypot, RGPD), `fuente = web` |
| Aviso Telegram del lead a Alberto | ✅ `correduria.lead-nuevo` con enlace a la ficha |
| Email transaccional (Resend) | ✅ montado, `hola@grupoasegura.es` |
| Portal del cliente | ✅ desplegado, **`portal_vinculo` = 0 filas: nadie ha entrado** |
| Aviso de vencimiento al cliente | 🔴 **apagado** (`ASEGURA_AVISOS_ACTIVOS`) |
| WhatsApp | 🔴 no existe (sin WABA) |

Contactabilidad de la cartera viva: de 79 clientes CIMA, **44 con email, 52 con teléfono,
53 con alguno, 26 con NINGUNO**. Con esos 26 no hay canal — y desde el código se ven idénticos
a uno al que sí se avisó.

---

## 2. Restricciones que condicionan el diseño, no que se parcheen después

1. **Un claim de ahorro o una comparativa es ASESORAMIENTO, no información** — y arrastra
   análisis objetivo e IPID (RDL 3/2020). La web capta y explica; **no promete ahorros ni
   compara precios**. Regla nº5 de `docs/CORREDURIA-INTRANET-IDEAS.md`.
2. **Información del mediador ANTES de que el usuario escriba su email** (art. 19 Ley 16/2018
   + art. 13 RGPD). Fuente única: `packages/module-seguros/src/mediador.ts`. No duplicar la
   clave DGSFP en ninguna plantilla.
3. **Analítica con cookies obliga a banner** en el mismo PR, con «rechazar» tan fácil como
   «aceptar», y a reescribir `/legal/cookies` (LSSI art. 22.2). → Elegir analítica **sin cookies**.
4. **Cada cotización de Avant2 cuesta 0,50 € y no es idempotente.** Ninguna campaña, vigilancia
   periódica ni botón público tarifica. Se vigila la fecha (gratis) y se tarifica una vez.
5. **Contradicción legal abierta:** la web pública publica `info@grupoasegura.es` y el portal
   `hola@grupoasegura.es`. Dos buzones de reclamación para el mismo mediador es un
   incumplimiento. **Se unifica en `hola@` antes de dar visibilidad a la marca.**
6. **Marca:** se escribe **«Grupo ASegura»** (A y S mayúsculas, el monograma del logo *es* el
   nombre). Protegido por `test/regression-nombre-comercial-asegura.test.ts`. Pero para SEO hay
   que asumir que la gente **teclea «asegura seguros sevilla»** en minúsculas: el contenido debe
   posicionar por esa forma sin romper la marca en los textos.

---

## 3. Plan de actuación

### Fase 0 — Cimientos y confianza (semana 1)

| # | Acción | Por qué |
|---|---|---|
| 0.1 | Confirmar **titular del registrador** de `grupoasegura.com` / `.es` | Vercel prueba DNS, no propiedad. Si el registrador es de Manuel, puede repuntar el DNS |
| 0.2 | **Unificar `info@` → `hola@`** en la web pública | Incumplimiento abierto (§2.5) |
| 0.3 | Verificar **dónde vive la clave `anon`** del proyecto Supabase | Ver §5 — riesgo de seguridad, y este plan da visibilidad a la marca |
| 0.4 | **Google Business Profile** (San Juan de La Palma 28, 41003 Sevilla) | La acción de mayor retorno por hora de todo el plan, y gratis |
| 0.5 | **Pedir reseña de Google a los 80 clientes actuales** | Un GBP con 0 reseñas no convierte. Es el activo local nº1 y no cuesta un euro |
| 0.6 | **Google Search Console** + analítica **sin cookies** | Sin GSC no sabes por qué consultas entras. Sin cookies no hay banner (§2.3) |

### Fase 0.5 — Elegir el ramo con un dato ✅ medido el 04/09/2026

Hecho: ver la tabla de §1.2(c). **Hogar renta ~69€/póliza/año contra ~41€ de auto**, con tasa
del 22 % frente al 10 %. **Ramo prioritario: hogar**, como hipótesis de trabajo.

🚨 **Y lo que salió de paso, que es un problema de negocio, no de marketing: falta la ingesta de
Mapfre desde el 02/04/2026** — ~5 meses sin un solo recibo cobrado de la compañía que es el 64 %
de la cartera. O CIMA dejó de traerla, o hay recibos sin conciliar. **Eso se mira antes que
cualquier campaña**: si Mapfre no está entrando, el libro de comisiones miente y con él
cualquier decisión de ramo.

Lo que cierra la decisión (y no bloquea empezar): cerrar ese hueco de Mapfre y llegar a ~20
pólizas de hogar medidas. Mientras tanto, **hogar se ataca como apuesta razonada, dicha como tal**.

📌 La **comisión media por póliza (48,37€ de media, 68,74€ en hogar)** es además el
**denominador obligatorio** de la Fase 5: con esa cifra ya se puede juzgar si unos Ads salen.

### Fase 1 — El embudo, ANTES que el tráfico (semanas 1-2)

🚨 **Esto va por delante de escribir contenido.** Hoy el formulario avisa por Telegram y ahí
se acaba: no hay compromiso de respuesta, ni seguimiento del lead, ni medición de conversión.
`lead_estado` está a `nuevo` en el **100 %** de las fichas. Meter tráfico en un embudo sin
fondo es pagar por perder leads.

1. **SLA de contacto: el mismo día.** [Probable, consenso del sector] La velocidad de respuesta
   es el factor que más pesa en la conversión de un lead de seguros.
2. **Estado del lead en el CRM** (`nuevo → contactado → presupuestado → cliente / perdido`),
   con motivo de pérdida.
3. **Medir la tasa lead → póliza.** Sin ella no se sabe si el marketing funciona.
4. **Registrar el consentimiento del formulario** en `consent_logs` con versión de texto. Hoy
   hay 2 filas en toda la base; la lista nueva se construye bien desde el primer registro.

### Fase 2 — Web propia en el apex ✅ construida el 04/09/2026

`apps/asegura-web` existe ya en el repo, lista para desplegar sobre
**`grupoasegura.com` + `www`**. `app.` se queda con el CRM, intacto.

**Cómo está montada, y por qué así:**

- **Sin base de datos.** No tiene Prisma, ni rol de BD, ni secreto de sesión. Es una web de
  marketing: lo único que sale de ella es el formulario. Si algún día necesita credenciales,
  la respuesta correcta casi siempre es mover esa función a `apps/asegura`, no traer la BD aquí.
- **El formulario reutiliza el canal que ya funciona**: `POST /api/lead` reenvía desde el
  servidor a `/api/publico/correduria/lead` de plataforma, que da de alta la ficha por el
  puerto de asegura y avisa por Telegram. Cero lógica de negocio duplicada, y sin CORS.
  🚨 El reenvío propaga la IP real del visitante (`x-forwarded-for`) **a propósito**: sin eso,
  plataforma vería la misma IP para todos y su límite de 6 intentos/hora pasaría de ser por
  persona a ser global — el séptimo lead legítimo del día se rechazaría solo.
- **Los datos del mediador NO se escriben aquí**: salen de `MEDIADOR`
  (`@central/module-seguros`), la misma fuente que el panel del corredor y el portal.
- **La identidad visual tampoco**: sale de `MARCA_ASEGURA` (`@central/brand`), cuyos hex se
  midieron del CSS de `app.grupoasegura.com`. La web pública y el CRM se parecen porque leen
  el mismo sitio, no porque alguien copiara los colores a ojo.
- **El copy tiene guardián**: `lib/ramos.test.ts` barre todas las páginas buscando claims de
  ahorro, superlativos de precio y «garantizamos». Un texto que convierta la web en
  asesoramiento (y arrastre análisis objetivo + IPID) pone el test en rojo antes de publicarse.
- **El contrato del formulario tiene guardián**: `lib/contrato-lead.test.ts` lee el fuente de
  plataforma y compara la lista de ramos. Si divergen, el visitante elegiría un ramo que
  plataforma rechaza con un 422 — un lead perdido sin que nada falle.
- **`HORARIO` está a `null` a propósito** y por eso la ficha JSON-LD omite `openingHours`: no
  se ha confirmado el horario real, y publicar uno inventado hace que alguien llame y no le
  cojan. Igual con el teléfono: ausente hasta que haya un número que alguien descuelgue.
- Añadida a la matriz de `tests.yml` y con `ignoreCommand` en su `vercel.json` (con
  `--sin-previews`), que es parte obligatoria del alta de cualquier app.

- Home + **una página por ramo**, empezando por **hogar** (§1.2c), no los seis a la vez
- **Quiénes somos con cara y nombre de Alberto** + clave DGSFP visible. Seguros es una compra de
  confianza: un corredor sin cara es un formulario más
- **«Cambiar de correduría sin cambiar de seguro»** — convierte un lead en cliente **sin
  tarificar** (0 € de Avant2, y no se compite por precio). Idea H de `CORREDURIA-INTRANET-IDEAS.md`
- `sitemap.xml`, `robots.txt`, JSON-LD `InsuranceAgency` + `LocalBusiness` (dirección, horario,
  teléfono), Open Graph
- Reutiliza el formulario que ya funciona (`/api/publico/correduria/lead`)
- Info del art. 19 LDS **antes** del formulario (§2.2)
- ⚠️ Logos de compañías solo con permiso de cada una. Sin permiso, texto.
- **Cuando exista: `301` de `/seguros` de plataforma al nuevo dominio.** Dejarla viva canibaliza
  y diluye.
- Añadir `apps/asegura-web` a la matriz de `tests.yml` y su `ignoreCommand` en `vercel.json`
  (parte del alta de cualquier app — `housesevillana` estuvo 15 días sin typecheck por saltarse esto).

### Fase 3 — Canales de coste cero (meses 1-3, en paralelo)

1. **Cross-sell a los 80.** 1,4 pólizas/cliente es bajo. Empezar por quien solo tiene auto y es
   propietario → hogar. Recordar los **26 clientes sin ningún canal de contacto**: ahí no se
   «avisa», se dice que no hay por dónde.
2. **B2B del propio grupo.** Joaquín Jaén (catering/almacén), Mariscos González, Sique Brilla,
   los restaurantes de ia.rest, la flota de transporte, los pisos de SIVRA. Todos necesitan RC,
   multirriesgo de local, flota, convenio, accidentes. **CAC = 0 €**, relación ya abierta, y es
   el nicho «empresas y flota» ya identificado como el que más interesa. Bonus: son quienes
   pueden dar las **primeras reseñas y testimonios** que alimentan la Fase 0.5.
3. **Cambio de mediador** como flujo, no solo como página.

### Fase 4 — SEO de contenido (meses 3-6)

**No** perseguir «seguro de coche barato»: esa SERP no se gana. Sí:

- **Local + ramo:** «correduría de seguros Sevilla», «seguro de comunidad de propietarios
  Sevilla», «seguro de local comercial Sevilla», «seguro de flota Sevilla»
- **Intención de problema**, donde está el dinero y casi no hay competencia: «me han subido el
  seguro del coche en la renovación», «preaviso de un mes para cancelar el seguro», «cómo
  cambiar de correduría», «qué cubre de verdad mi seguro de hogar»

Moldes reutilizables ya en el repo: `.claude/skills/seo-house-sevillana/` (metadatos, JSON-LD,
keyword research, auditoría Next.js 15 App Router) y `docs/INFORME-SEO-iarest-2026-08-01.md`.

⚠️ **Lección del agente SEO de ia-rest, que no aplicó ni un cambio:** su umbral de 30
impresiones era inalcanzable sin tráfico. **No automatizar el SEO antes de tener tráfico.**

### Fase 5 — Pago (mes 6+, y solo con dos cifras medidas)

La comisión media por póliza ya está medida (**48,37€ de media; 68,74€ en hogar**). Falta la otra
mitad: el **coste por lead del canal orgánico**. Sin las dos no se puede juzgar un Ad, y con
68,74€/año de ingreso por póliza de hogar el margen de error es estrecho. [Seguro] El CPC de seguros es de
los más caros del mercado español y la comisión de una póliza es de decenas de euros al año: el
CAC se come el margen del primer año, y puede que del segundo.

---

## 4. Criterio de éxito, ritmo y criterio de parada

🚨 **El mayor riesgo de este plan no es la competencia: es el abandono.** Compite por la atención
de Alberto con doce verticales más, y un plan de captación que se toca cada tres semanas no
produce nada.

- **Ritmo:** un bloque semanal fijo. Sin él, esto no ocurre.
- **Métrica de éxito a 6 meses:** nº de **pólizas nuevas** captadas por canal propio (no
  visitas, no impresiones, no leads: pólizas).
- **Criterio de parada:** fijar el número ahora. Si a 6 meses no se alcanza, se replantea el
  canal en vez de seguir por inercia.

**Pendiente de decidir por Alberto:** ese número, y el presupuesto de la Fase 5.
Recomendación: **0 € en publicidad los primeros 3 meses**; el dinero va a dominio y web, no a clics.

---

## 5. Hallazgo de seguridad (no es marketing, pero lo bloquea)

El advisor de Supabase avisa de que **75 tablas del schema `seguros` tienen RLS desactivado** y
quedan expuestas a los roles `anon` / `authenticated` — entre ellas las críticas `clientes`,
`polizas`, `cliente_emails` y `cliente_telefonos`. Dentro hay DNI (60 % de las fichas), fecha
de nacimiento (74 %) y ramos de salud/decesos/vida — **categoría especial del art. 9 RGPD** — de
32.600 personas.

[Probable] El riesgo se materializa **solo si la clave `anon` de ese proyecto está publicada en
algún sitio** (una app cliente, un bundle de navegador, un repo). **Eso hay que comprobarlo, no
suponerlo.**

Se anota aquí porque este plan consiste precisamente en **dar visibilidad pública a esta marca**.
No se toca ahora (activar RLS sin políticas tumba todos los accesos), pero **la comprobación de
dónde vive la clave `anon` es requisito previo al lanzamiento de la web** (acción 0.3).

---

## 6. Preguntas abiertas

1. ¿Titular del registrador de `grupoasegura.com` / `.es`?
2. ¿Número de pólizas nuevas a 6 meses que define el éxito?
3. ¿Se pide permiso a Mapfre / Allianz / Occident / Reale para usar sus logos?
4. ¿Base de legitimación y plazo de conservación de las 32.520 fichas históricas? (pregunta ya
   abierta en `CORREDURIA-INTRANET-IDEAS.md`, sigue sin respuesta)
