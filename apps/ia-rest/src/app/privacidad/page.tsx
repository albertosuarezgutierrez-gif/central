export default function PrivacidadPage() {
  const SE = "'Newsreader',Georgia,serif"
  const SN = "'Inter Tight',system-ui,sans-serif"

  const s: React.CSSProperties = {
    maxWidth: 720, margin: '0 auto', padding: '72px 48px 120px',
    fontFamily: SN, background: '#14110E', minHeight: '100vh', color: '#F6F1E7'
  }

  return (
    <>
      <style>{`
        body { background: #14110E; }
        .legal-nav { position: sticky; top: 0; z-index: 10; padding: 0 48px; height: 60px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(246,241,231,0.08); background: rgba(20,17,14,.95); backdrop-filter: blur(16px); }
        .legal-nav a { text-decoration: none; }
        .logo { font-family: ${SE}; font-size: 20px; font-weight: 300; color: #F6F1E7; }
        .logo b { color: #D9442B; font-weight: 300; }
        .back { font-size: 13px; color: #6B6054; transition: color .2s; }
        .back:hover { color: #F6F1E7; }
        .doc h1 { font-family: ${SE}; font-size: clamp(32px,4vw,48px); font-weight: 300; letter-spacing: -1.5px; color: #F6F1E7; margin-bottom: 12px; }
        .doc .meta { font-size: 12px; color: #6B6054; margin-bottom: 52px; padding-bottom: 32px; border-bottom: 1px solid rgba(246,241,231,0.08); }
        .doc h2 { font-family: ${SE}; font-size: 22px; font-weight: 300; color: #F6F1E7; letter-spacing: -.5px; margin: 40px 0 14px; }
        .doc h3 { font-family: ${SN}; font-size: 14px; font-weight: 600; color: #F6F1E7; margin: 24px 0 8px; letter-spacing: .02em; text-transform: uppercase; }
        .doc p { font-size: 15px; color: #D8CDB6; line-height: 1.8; margin-bottom: 14px; font-weight: 300; }
        .doc ul { margin: 0 0 14px 20px; }
        .doc li { font-size: 15px; color: #D8CDB6; line-height: 1.8; margin-bottom: 6px; font-weight: 300; }
        .doc a { color: #D8CDB6; transition: color .2s; }
        .doc a:hover { color: #F6F1E7; }
        .doc strong { color: #F6F1E7; font-weight: 500; }
        .ia-box { background: rgba(217,68,43,.06); border: 1px solid rgba(217,68,43,.2); border-radius: 12px; padding: 20px 22px; margin: 20px 0; }
        .ia-box p { margin-bottom: 8px; }
        .ia-box p:last-child { margin-bottom: 0; }
        .tag-ia { display: inline-block; background: rgba(217,68,43,.12); border: 1px solid rgba(217,68,43,.3); color: #D9442B; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; letter-spacing: .06em; text-transform: uppercase; margin-right: 6px; vertical-align: middle; }
        @media(max-width:600px) { .legal-nav { padding: 0 20px; } .doc { padding: 56px 20px 80px !important; } }
      `}</style>
      <nav className="legal-nav">
        <a href="/" className="logo">ia<b>.</b>rest</a>
        <a href="/" className="back">← Volver</a>
      </nav>
      <div className="doc" style={s}>
        <h1>Política de privacidad</h1>
        <div className="meta">Última actualización: mayo 2026 · ia.rest · NIF 28823484E</div>

        <h2>1. Responsable del tratamiento</h2>
        <p>El responsable del tratamiento de los datos personales recogidos a través de este sitio web y del servicio ia.rest es <strong>Alberto Suárez Gutiérrez</strong>, con NIF <strong>28823484E</strong>, domicilio en Sevilla (España). Contacto: <a href="mailto:hola@iarest.es">hola@iarest.es</a>.</p>

        <h2>2. Dos roles de tratamiento</h2>
        <p>ia.rest actúa en dos capacidades distintas:</p>
        <ul>
          <li><strong>Responsable</strong> de los datos recogidos en esta web (leads, clientes B2B, cookies).</li>
          <li><strong>Encargado del tratamiento</strong> de los datos que procesan los restaurantes clientes (camareros, transacciones, voz). En ese caso, el restaurante es el responsable y ia.rest actúa bajo sus instrucciones, conforme al art. 28 RGPD.</li>
        </ul>

        <h2>3. Datos que recogemos en esta web</h2>
        <p>A través del formulario de contacto recogemos:</p>
        <ul>
          <li>Nombre y apellidos</li>
          <li>Nombre del establecimiento</li>
          <li>Correo electrónico</li>
          <li>Teléfono (opcional)</li>
          <li>Número aproximado de usuarios</li>
        </ul>
        <p>Adicionalmente, al usar la plataforma ia.rest como cliente contratado, se tratan datos de empleados del restaurante (nombre, rol, datos de acceso) y registros operativos (comandas, ventas, stock), siempre por cuenta del restaurante responsable.</p>

        <h2>4. Uso de Inteligencia Artificial</h2>
        <div className="ia-box">
          <p><span className="tag-ia">IA</span> <strong>ia.rest utiliza sistemas de inteligencia artificial</strong> para el funcionamiento del servicio, conforme al Reglamento (UE) 2024/1689 (Reglamento de IA) y al RGPD.</p>
          <p><strong>Transcripción de voz (ASR):</strong> La voz del camarero se transcribe en tiempo real mediante Groq Whisper. El audio no se almacena; únicamente se conserva el texto transcrito el tiempo necesario para procesar la comanda.</p>
          <p><strong>Estructuración de comandas (LLM):</strong> El texto transcrito se envía a modelos de lenguaje (NVIDIA NIM con meta/llama-3.3-70b-instruct, con fallback a Anthropic Claude Haiku) para identificar mesa, productos y cantidades. Ningún dato de esta fase permite identificar individualmente a personas físicas.</p>
          <p><strong>Sin identificación biométrica:</strong> La voz no se usa para identificar al empleado. El acceso siempre se realiza mediante PIN. No se almacenan huellas vocales ni perfiles biométricos.</p>
          <p><strong>Sin inferencia de emociones:</strong> El sistema no analiza ni infiere estados emocionales, edad, origen o cualquier otro atributo personal a partir de la voz.</p>
          <p><strong>Supervisión humana:</strong> Toda acción del sistema es revisada y confirmada por el usuario antes de ejecutarse. La IA propone; la persona decide.</p>
          <p><strong>Clasificación de riesgo:</strong> El sistema está clasificado como de <strong>riesgo limitado</strong> bajo el Reglamento (UE) 2024/1689, conforme al art. 50 del mismo.</p>
        </div>

        <h2>5. Finalidad del tratamiento</h2>
        <h3>Datos de la web (responsable)</h3>
        <ul>
          <li>Atender solicitudes de información y demos</li>
          <li>Gestionar la relación contractual con clientes B2B</li>
          <li>Enviar comunicaciones comerciales de ia.rest (con consentimiento)</li>
        </ul>
        <h3>Datos del servicio (encargado del restaurante)</h3>
        <ul>
          <li>Procesamiento de comandas y pedidos</li>
          <li>Gestión de turnos y fichajes del personal del restaurante</li>
          <li>Análisis de ventas y stock a nivel agregado</li>
          <li>Facturación conforme a VeriFactu (Reglamento AEAT)</li>
        </ul>

        <h2>6. Base legal</h2>
        <ul>
          <li><strong>Formulario web:</strong> consentimiento expreso (art. 6.1.a RGPD)</li>
          <li><strong>Clientes B2B:</strong> ejecución de contrato (art. 6.1.b RGPD)</li>
          <li><strong>Datos del servicio (encargado):</strong> instrucciones del responsable (restaurante), art. 28 RGPD</li>
          <li><strong>Tratamientos de empleados del restaurante:</strong> base legítima determinada por el restaurante responsable (habitualmente, ejecución de contrato laboral)</li>
        </ul>

        <h2>7. Conservación de los datos</h2>
        <ul>
          <li><strong>Leads (formulario web):</strong> 2 años desde el último contacto</li>
          <li><strong>Clientes B2B:</strong> durante la vigencia del contrato + 5 años (obligaciones fiscales y mercantiles)</li>
          <li><strong>Transcripciones de voz:</strong> 90 días desde su registro (purgadas automáticamente)</li>
          <li><strong>Comandas y transacciones:</strong> según instrucciones del restaurante responsable, mínimo 4 años (AEAT)</li>
        </ul>

        <h2>8. Destinatarios y subencargados</h2>
        <p>Los datos pueden ser accedidos por los siguientes proveedores de servicios, que actúan como subencargados del tratamiento:</p>
        <ul>
          <li><strong>Supabase Ireland Ltd.</strong> (Irlanda, UE) — base de datos y almacenamiento. Sin transferencia internacional.</li>
          <li><strong>Vercel Inc.</strong> (EE.UU.) — infraestructura de despliegue. Transferencia amparada en Decisión de Adecuación EU-EE.UU. (DPF) o Cláusulas Contractuales Estándar.</li>
          <li><strong>Groq, Inc.</strong> (EE.UU.) — transcripción de voz (ASR). Transferencia bajo SCCs. Solo procesa texto o audio en tránsito; no almacena datos.</li>
          <li><strong>NVIDIA Corporation</strong> (EE.UU.) — modelos de lenguaje (NIM API). Transferencia bajo DPF o SCCs.</li>
          <li><strong>Anthropic, PBC</strong> (EE.UU.) — modelo de lenguaje de reserva (Claude Haiku). Transferencia bajo DPF o SCCs.</li>
          <li><strong>Stripe, Inc.</strong> (EE.UU.) — procesamiento de pagos. Transferencia bajo DPF.</li>
          <li><strong>Google LLC</strong> (EE.UU.) — fuentes tipográficas (Google Fonts). Puede transmitir IP bajo SCCs.</li>
        </ul>
        <p>No cedemos datos a terceros con fines propios salvo obligación legal.</p>

        <h2>9. Transferencias internacionales</h2>
        <p>Varios proveedores están ubicados en EE.UU. Las transferencias se amparan en el <strong>Marco de Privacidad de Datos UE-EE.UU. (Data Privacy Framework)</strong>, aprobado por Decisión de Ejecución (UE) 2023/1795 y confirmado por el Tribunal General de la UE (asunto T-553/23, septiembre 2025), para los proveedores certificados. Para los no certificados, aplicamos <strong>Cláusulas Contractuales Estándar</strong> (Decisión (UE) 2021/914) junto con una evaluación de impacto de la transferencia (TIA).</p>

        <h2>10. Decisiones automatizadas</h2>
        <p>El sistema ia.rest genera sugerencias de comandas y alertas operativas de forma automatizada, pero <strong>todas las decisiones con efectos sobre personas son revisadas y confirmadas por un empleado humano</strong> antes de ejecutarse. No se adoptan decisiones automatizadas con efectos jurídicos o significativos sobre personas físicas en el sentido del art. 22 RGPD.</p>

        <h2>11. Tus derechos</h2>
        <p>Puedes ejercer en cualquier momento los siguientes derechos:</p>
        <ul>
          <li><strong>Acceso:</strong> conocer qué datos tratamos sobre ti</li>
          <li><strong>Rectificación:</strong> corregir datos inexactos</li>
          <li><strong>Supresión:</strong> solicitar el borrado cuando no sean necesarios</li>
          <li><strong>Oposición:</strong> oponerte al tratamiento basado en interés legítimo</li>
          <li><strong>Portabilidad:</strong> recibir tus datos en formato estructurado</li>
          <li><strong>Limitación:</strong> restringir el tratamiento en determinadas circunstancias</li>
          <li><strong>No ser objeto de decisiones automatizadas:</strong> solicitar intervención humana</li>
        </ul>
        <p>Dirígete a <a href="mailto:hola@iarest.es">hola@iarest.es</a> indicando tu solicitud. Responderemos en el plazo máximo de <strong>30 días</strong> (prorrogable 2 meses en casos complejos).</p>
        <p>Si consideras que el tratamiento no es conforme a la normativa, puedes reclamar ante la <strong>Agencia Española de Protección de Datos</strong> (aepd.es).</p>

        <h2>12. Seguridad</h2>
        <p>Aplicamos medidas técnicas y organizativas proporcionales al riesgo: cifrado en tránsito (TLS 1.3), cifrado en reposo (AES-256), control de acceso por roles (RBAC), autenticación por PIN con limitación de intentos, auditoría de accesos y copias de seguridad automáticas.</p>

        <h2>13. Modificaciones</h2>
        <p>Podemos actualizar esta política para adaptarla a cambios legislativos o de servicio. La fecha de última actualización aparece al inicio del documento. Los cambios sustanciales se comunicarán a los clientes activos por correo electrónico.</p>
      </div>
    </>
  )
}
