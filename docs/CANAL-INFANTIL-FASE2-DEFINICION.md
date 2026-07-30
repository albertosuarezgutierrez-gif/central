# 🐌 Canal infantil — Fase 2: definición de la IP y del sandbox (SIN código)

> **Fase 2 del experimento (solo definición, aprobada por Alberto el 30/07/2026).**
> Se apoya en `docs/ESTUDIO-YOUTUBE-INFANTIL.md` (viabilidad/legal) y
> `docs/ESTUDIO-DEMANDA-PADRES.md` (demanda/mercados). Aquí NO hay código: es la biblia
> del personaje, las reglas de la marca, el pipeline descrito y el plan del sandbox.
> La implementación (Remotion, render, canales) será Fase 3, previa aprobación.

---

## 1. Posicionamiento (la promesa al padre/madre)

**"Dibujos tranquilos, hechos con cuidado, en castellano."**

- **Calma por diseño**: ritmo lento medible (ver reglas §3), sin gritos, sin sobresaltos.
  Es la demanda nº 2 del estudio y la crítica nº 1 a Cocomelon/La Granja de Zenón.
- **Cuidado humano, IA como herramienta**: guion, dirección, diseño y voz humanos y
  documentados; la IA acelera producción (ilustración base, música), nunca decide. Etiquetado
  honesto: "Animación hecha con dirección humana; algunas herramientas de IA en producción".
  NUNCA vender "sin IA".
- **Castellano peninsular** como mercado de validación e identidad; **sin diálogo** en la
  animación para que el mismo vídeo sirva en italiano/alemán/neerlandés (los tableros
  económicos del estudio) cambiando solo audio y metadatos.
- Público: **1-4 años** (preescolar temprano), con el padre como decisor y prescriptor.

## 2. El personaje (propuesta principal + alternativas)

### Propuesta principal: un CARACOL pequeño
La lentitud no es una limitación del personaje: **es su identidad y la de la marca**. Un
caracol es calmo por naturaleza — el posicionamiento entero encarnado en el protagonista.

- **Diseño**: formas redondas y simples — cuerpo blandito + concha en espiral. Clave de
  producción: **sin extremidades ni boca articulada** → animación vectorial trivial
  (deslizarse, estirarse, asomar/esconder los cuernitos), imposible que se vea "rara".
- **Firma visual**: al avanzar deja un **rastro suave que brilla un momento y se apaga**
  (estela nacarada). Reconocible, hipnótico-tranquilo, y barato de animar.
- **Personalidad**: curioso, paciente, nunca tiene prisa; cuando algo le sorprende, se
  esconde en la concha y vuelve a asomar despacio (gag recurrente, enseña gestión de la
  emoción sin palabras).
- **Mundo**: un jardín mediterráneo — luz cálida, macetas, azulejos, un limonero, la lluvia
  fina. Identidad española **sutil** (viaja bien a Italia/DACH sin localismos).
- **Secundarios (máximo 2)**: una **mariquita** rápida e impulsiva (el contraste que hace
  visible la calma del caracol) y una **luna/búho** que abre los vídeos de dormir.
- **Diferenciación de IPs existentes**: nada de carreras ni velocidad (Turbo de DreamWorks
  es un caracol RÁPIDO — el nuestro es exactamente lo contrario), diseño propio desde
  bocetos, sin parecidos con Gary (Bob Esponja: caracol-gato con ojos de tallo caricato).
  Chequeo de similitud antes de fijar el diseño final (regla PI de la Fase 1).
- **Nombre**: debe pronunciarse igual de bien en ES/IT/DE/NL. Candidatos (elige Alberto):
  **Lolo**, **Nilo**, **Momo**. Antes de fijarlo: búsqueda rápida de colisiones (YouTube,
  EUIPO/OEPM, apps infantiles) — hay personajes infantiles con nombres parecidos y conviene
  el que esté más libre.

### Alternativas (si el caracol no convence)
- **Una nubecita** que viaja y cambia de forma (dibuja el mundo con su lluvia fina). Igual de
  animable; menos "cuerpo" con el que empatizar.
- **Un lirón** (dormouse): nativo del nicho "dormir/rutinas"; más difícil de animar bien
  (extremidades) y más cerca de IPs existentes de ratoncitos.

## 3. Reglas de la marca "calma" (medibles, se auditan en cada vídeo)

| Regla | Valor | Por qué |
|---|---|---|
| Cambios de plano | **≤ 6 por minuto** | La competencia hiperestimulante hace 25-39 (Ser Padres); este es el diferencial medible |
| Tempo musical | 60–80 bpm, acústico (guitarra, marimba, cajita de música) | Territorio nana/calma |
| Paleta | Tonos tierra y pastel, sin saturados puros, transiciones de color lentas | Anti-slop visual |
| Sonido | Sin gritos, sin efectos estridentes, volumen normalizado suave | Queja nº 1 de los padres |
| Final de cada vídeo | El personaje se despide y "se aquieta" (se mete en la concha, cae la tarde) | Facilita la transición a apagar la pantalla — el dolor real del padre |
| Duración | Piezas de 2-3 min; compilaciones de 30-60 min después | El formato donde se concentran las vistas |
| Diálogo | Ninguno en la animación; voz solo en piezas de lenguaje (re-grabable por idioma) | Multi-mercado a coste marginal ~0 |

## 4. Registro de autoría humana (obligatorio desde el día 1)

Sin esto la IP es indefendible (TRLPI: autor = persona natural; ver Fase 1 §4).

- Carpeta **`docs/ip-canal-infantil/`** en el repo (privado) con: esta biblia y sus
  versiones, bocetos/iteraciones del diseño (incluidos los prompts y los descartes, con
  fecha), decisiones de dirección (por qué se eligió X), guiones de cada vídeo firmados por
  Alberto, y letras de las canciones.
- Cada vídeo del sandbox lleva su **ficha de dirección** (media página: guion, decisiones,
  qué hizo la herramienta y qué decidió el humano). Es a la vez la defensa frente a
  "inauthentic content" de YouTube y la prueba de autoría.
- Cuando el personaje esté validado (fin del sandbox): valorar **registro de marca**
  (nombre + diseño) en OEPM/EUIPO — la marca no exige autoría humana y es la protección
  más robusta.

## 5. Pipeline de producción (descrito; se construye en Fase 3)

| Paso | Herramienta | Humano decide | Coste |
|---|---|---|---|
| Diseño personaje/fondos (una vez) | Firefly (MCP Adobe ya conectado) → retoque → **vectorizado** (asset SVG definitivo) | Dirección de arte, selección, iteración | ~0€ |
| Animación | **Remotion** (React→vídeo): plantillas paramétricas (deslizar, asomar, parallax, estela) con la regla ≤6 cortes/min como parámetro | Guion y timing de cada pieza | 0€ |
| Música | Suno Pro (licencia comercial) sobre letras propias; revisar titularidad por canción | Letra, melodía elegida entre variantes, descarte | 10 US$/mes |
| Voz (piezas de lenguaje) | **Voz humana real grabada** (castellano peninsular auténtico = la prueba del posicionamiento); ElevenLabs solo para dubs IT/DE si hace falta | Todo | 0–22 US$/mes |
| Render/montaje | Remotion + FFmpeg; salida por idioma (misma animación, audio/títulos distintos) | Control de calidad final | 0€ |
| Gen-vídeo (Kling/Veo) | Solo planos puntuales de fondo si algo lo pide; nunca el personaje | — | ~0-10€/mes |

**Presupuesto recurrente total: 10–40€/mes.** Sin inversión inicial.

## 6. El sandbox: 10 vídeos, 2 canales (ES + IT)

Mezcla de los huecos validados (calma / canciones tranquilas / lenguaje temprano / sílabas):

| # | Pieza | Tipo | Hueco |
|---|---|---|---|
| 1 | El caracol conoce el jardín (presentación, sin voz) | Calma | D2 |
| 2 | La lluvia fina (el jardín bajo la lluvia, sonido de agua suave) | Calma | D2 |
| 3 | Canción de la concha ("mi casa la llevo conmigo") | Canción tranquila | D2+D7 |
| 4 | Los colores del jardín (voz humana nombrando colores, ritmo Ms Rachel) | Lenguaje temprano | Hueco claro §3 |
| 5 | Canción de buenas noches (con la luna; final que "se apaga") | Dormir-calma | D2 |
| 6 | La mariquita tiene prisa (contraste: la calma gana) | Calma-narrativa | D2 |
| 7 | Uno, dos, tres caracoles (contar 1-5, voz humana) | Lenguaje temprano | Hueco claro |
| 8 | MA-ME-MI-MO-MU con el caracol (sílabas, método español) | Sílabas | D8 (test) |
| 9 | Canción del limonero | Canción tranquila | D7 |
| 10 | Un día entero en el jardín (compilación 1-9 remontada, 25-30 min) | Compilación | Formato §3 |

- **Cadencia**: 2 vídeos/semana (~5 semanas de publicación). Cada pieza corta genera 1-2
  **Shorts** (fragmentos) como descubrimiento.
- **Canales**: uno en castellano y uno en italiano desde el día 1 (misma animación; en las
  piezas de voz, audio regrabado). Alemán/neerlandés solo si el formato valida.
- **Metadatos obligatorios por vídeo**: "made for kids" ✅, etiqueta "contenido con
  herramientas de IA bajo dirección humana" en la descripción ✅, toggle "altered content"
  solo si hay voz sintética ✅ (checklist legal Fase 1 §4).

## 7. Métricas y criterio de corte (6 meses desde el primer vídeo)

- **Pasar la revisión del YPP** en al menos un mercado (o al menos no ser rechazado por
  "inauthentic content" — si eso pasa, corte inmediato y post-mortem).
- **Retención media > 40%** en las piezas de 2-3 min (audiencia preescolar rota mucho; 40%
  es exigente pero es el listón de "esto engancha").
- **Señal de mercado**: ¿ES o IT tira más? Decide dónde se dobla la apuesta.
- **Señal de formato**: ¿calma, canciones, lenguaje o sílabas? El mejor define la temporada 2.
- Si nada de lo anterior a los 6 meses → **parar** o pivotar al plan B B2B (vídeos
  personalizados para guarderías/editoriales con el mismo motor). Pérdida máxima acumulada
  del experimento: < 250€.

## 8. Qué NO es esta fase / qué queda para Fase 3 (con aprobación)

- **Fase 3a (código)**: plantillas Remotion + pipeline de render multi-idioma.
- **Fase 3b (assets)**: diseño definitivo del personaje con `adobe-diseno`/`marca-cliente`
  (chequeo de similitud incluido), primeras canciones con Suno, grabación de voz.
- **Fase 3c (datos)**: script YouTube Data API para afinar títulos/keywords por mercado y
  el feedback loop de métricas en BD (estilo `pricing-agente`).
- Alta de canales, identidad visual de canal (banner, miniaturas — plantilla fija, misma
  composición siempre: personaje + fondo + 2-3 palabras).

## Decisiones que quedan en manos de Alberto
1. **¿Caracol sí o no?** (o nube/lirón). 2. **Nombre** (Lolo / Nilo / Momo u otro, tras el
chequeo de colisiones). 3. **Quién pone la voz humana** de las piezas de lenguaje.
