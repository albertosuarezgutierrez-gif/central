# ia.rest — Material listo para ejecutar: Meta Ads + LinkedIn

> Esto es **para que lo ejecutes tú** (yo no puedo crear cuentas de anuncios ni gastar). Es lo de
> mayor retorno para un SaaS B2B: trae alcance y **leads** (demos), no solo seguidores.
> Meta = la lógica del Pixel/eventos NO está montada en el código → ver "Pendiente técnico".

---

## PARTE 1 — Meta Ads (Instagram + Facebook)

### Objetivo
Empieza por **"Clientes potenciales" (Leads)** o **"Tráfico"** a la web con demo. NO uses "Interacción"
(trae likes baratos, no clientes). Mide **coste por lead** (CPL), no seguidores.

### Presupuesto
Prueba: **5–10 €/día durante 7–10 días** (50–100 € total). Suficiente para ver qué anuncio funciona.

### Público (Audiencia)
- **Ubicación:** España (o empieza por tu provincia/ciudad para más relevancia local).
- **Edad:** 28–60.
- **Intereses/comportamientos** (combina): *Propietarios de pequeñas empresas*, *Hostelería*, *Restaurantes*,
  *Gestión de restaurantes*, *Emprendimiento*, *TPV / Punto de venta*, *Horeca*.
- **Detalle:** activa "Ampliar público" solo si el CPL es alto tras 3–4 días.
- Crea también un **público similar (Lookalike)** de quienes ya pidieron demo, cuando tengas ≥50.

### Ubicaciones
Automáticas (Advantage+), pero revisa que entren **Reels** y **Stories** (es donde mejor rinde el vídeo).

### Creatividades (usa lo que el agente ya genera)
1. **Reel de demo real** (lo más potente): 10–20 s mostrando al camarero hablando → comanda en cocina.
   Caso real = Saboga Catering. Subtítulos quemados.
2. **Reel "Antes vs ia.rest"** (el formato comparativa que ya genera el agente).
3. **Imagen "dato"** como respaldo.

### Textos del anuncio (3 variantes para test A/B)
- **A (dolor):** "¿Cuántas comandas se tuercen un viernes a tope? Con ia.rest el camarero habla y la cocina
  recibe el pedido en menos de 1 segundo. Menos errores, más mesas. Pide una demo gratis."
- **B (resultado):** "Facturar más ahora sí es ganar más. ia.rest: TPV por voz para bares y restaurantes.
  Sin papel, sin errores. Reserva tu demo."
- **C (VeriFactu, urgencia legal):** "VeriFactu ya es obligatorio. ia.rest emite tus facturas conformes
  automáticamente, mientras tomas comandas por voz. Te lo enseñamos en 15 min."
- **Título:** "TPV por voz para hostelería" · **CTA botón:** "Más información" / "Reservar".

### Destino
Una página con **demo/formulario** y el **Pixel de Meta** (ver pendiente técnico). Usa UTM:
`https://www.iarest.es/?utm_source=meta&utm_medium=cpc&utm_campaign=demo_test&utm_content=reelA`

### Cómo montarlo (rápido)
1. **Meta Business Suite** → crear **cuenta publicitaria** + página de Instagram/Facebook de ia.rest vinculadas.
2. Instalar el **Pixel de Meta** en `www.iarest.es` y crear el evento **Lead** (cuando alguien envía el formulario de demo).
3. Crear campaña → objetivo Leads/Tráfico → público de arriba → 3 anuncios (A/B/C) → 7€/día.
4. A los 4 días: pausa el peor, sube presupuesto al mejor. Mide **CPL** y nº de demos reales.

---

## PARTE 2 — LinkedIn (probablemente tu mejor canal B2B)

Los dueños/gerentes de restaurante y grupos de hostelería están en LinkedIn como decisores. Convierte mejor que IG para vender software.

### Setup (una vez)
- **Página de empresa "ia.rest"**: logo, portada con el slogan, descripción ("TPV por voz para hostelería
  española. El camarero habla, la cocina recibe en <1s"), enlace a demo con UTM.
- **Tu perfil personal** (Alberto): titular tipo "Ayudo a bares y restaurantes a facturar más con un TPV por
  voz | Fundador de ia.rest". El perfil personal genera más alcance que la página.

### Contenido (2–3 posts/semana, reutiliza lo del agente)
- **Casos y números**: "Un restaurante pierde X min/día por errores de comanda. Así lo resolvimos en Saboga."
- **Detrás de cámaras / aprendizajes** construyendo el producto (formato que funciona en LinkedIn).
- **Novedades del sector** (VeriFactu, IVA, digitalización) con tu opinión.
- **Vídeo de demo** (mismo reel, sin música, subtítulos).
- Formato: gancho en la 1ª línea, texto en párrafos cortos, 3–5 hashtags (#hosteleria #restaurantes #digitalizacion), 1 CTA.

### Crecimiento
- **15 min/día**: comenta en posts de asociaciones de hostelería, ferias (HIP, Hostelco), proveedores y dueños.
- Conecta con dueños/gerentes de tu zona (nota personalizada, sin vender en el primer mensaje).
- Cuando haya tracción, **LinkedIn Ads** con segmentación por cargo ("Owner", "Gerente") + sector "Restaurantes".

---

## PARTE 3 — Medición (qué mirar, no seguidores)
- **UTM** en TODOS los enlaces (`utm_source` = instagram | meta | linkedin) → ver origen del tráfico/leads en analytics.
- KPIs reales: **demos pedidas, coste por lead, clics a la web**. Followers = secundario.

## Pendiente técnico (si quieres que lo monte yo en código)
- **Pixel de Meta + evento Lead** en `www.iarest.es` (necesario para optimizar los anuncios por conversión).
- **UTM por defecto** en el enlace del perfil/landing.
Dímelo y lo hago en un PR.
