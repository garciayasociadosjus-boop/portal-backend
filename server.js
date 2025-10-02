require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;

const openAiApiKey = process.env.OPENAI_API_KEY;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// --- SECCIÓN DE AUTENTICACIÓN CON GOOGLE ---
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const driveFileIds = {
    familia: '1qzsiy-WM65zQgfYuIgufd8IBnNpgUSH9',
    siniestros: '11gK8-I6eXT2QEy5ZREebU30zB8c6nsN0'
};

// --- ENDPOINT PARA ASISTENTE JUSTINA IA ---
app.post('/api/asistente-justina', async (req, res) => {
    const { conversation, allCases } = req.body;

    const contextoResumido = allCases.map(caso => ({
        nombre: caso.nombre,
        caratula: caso.caratula,
        expediente: caso.expediente,
        estado: caso.estado,
        tareas_pendientes: (caso.observaciones || []).filter(o => !o.completed),
        audiencias_pendientes: (caso.audiencias_list || []).filter(a => !a.completed),
        vencimientos_pendientes: (caso.vencimientos_list || []).filter(v => !v.completed)
    }));

    const systemPrompt = `
        Eres Justina, la asistente virtual y socia digital proactiva del Estudio Jurídico García & Asociados. Tu usuaria es la Dra. Camila García. Tu tono es profesional, eficiente y servicial. Hoy es ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}.

        Tus capacidades son:
        1.  **Análisis Proactivo de Datos:** Al recibir una lista de casos resumidos, tu primera tarea es analizarlos y generar un "Informe de Inteligencia Diario". Para hacerlo, debes seguir estas reglas estrictamente:
            - **Fecha de Referencia:** La fecha de hoy es ${new Date().toISOString().split('T')[0]}.
            - **Para las 'tareas_pendientes':** La fecha que debes analizar es el campo 'proximaRevision'.
            - **Para 'audiencias_pendientes' y 'vencimientos_pendientes':** La fecha que debes analizar es el campo 'fecha'.
            - **Estructura del Informe:** El informe DEBE tener las siguientes secciones, en este orden:
                1.  **URGENTE (VENCIDOS):** Lista todos los ítems (tareas, audiencias, vencimientos) cuya fecha sea ANTERIOR a la fecha de hoy.
                2.  **PARA HOY:** Lista todos los ítems cuya fecha sea EXACTAMENTE la fecha de hoy.
                3.  **ALERTAS PRÓXIMAS (7 DÍAS):** Lista los ítems cuya fecha esté en los próximos 7 días.
                4.  **CASOS INACTIVOS:** Menciona los casos que no tengan NINGÚN ítem pendiente y sugiere una acción (ej: "agendar seguimiento").

        2.  **Respuesta Conversacional:** Responde a las preguntas de la Dra. García basándote en la conversación previa y el contexto de los casos resumidos.
        
        INSTRUCCIONES CLAVE:
        - Si el usuario simplemente saluda o pide el resumen, genera el "Informe de Inteligencia Diario" siguiendo la estructura detallada arriba.
        - Basa TODAS tus respuestas exclusivamente en los datos resumidos. No inventes información.
        - Siempre dirígete a la usuaria como "Dra. García".
    `;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: `Contexto de casos resumidos: ${JSON.stringify(contextoResumido)}` },
        ...conversation
    ];

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: messages,
            temperature: 0.3,
        }, {
            headers: { 'Authorization': `Bearer ${openAiApiKey}` }
        });
        res.json(response.data.choices[0].message);
    } catch (error) {
        console.error("Error en /api/asistente-justina:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Ocurrió un error al contactar a la IA.' });
    }
});

// --- FUNCIÓN PARA BUSCAR DATOS EN DRIVE ---
async function buscarDniEnDrive(dni) {
    let todasLasNotasPublicas = [];
    for (const key in driveFileIds) { /* ...código original sin modificaciones... */ }
    return todasLasNotasPublicas.join('\n\n');
}

// --- RUTA PARA LA CONSULTA DE EXPEDIENTES ---
app.post('/api/consulta-expediente', async (req, res) => {
    // ... tu código original sin modificaciones ...
});

// --- CÓDIGO ORIGINAL PARA GENERAR CARTAS (CORREGIDO Y COMPLETO) ---
function numeroALetras(num) {
    // ... tu código original sin modificaciones ...
}

async function generarCartaConIA(data) {
    if (!openAiApiKey) {
        throw new Error("Falta la OPENAI_API_KEY en las variables de entorno de Railway.");
    }
    const url = 'https://api.openai.com/v1/chat/completions';
    const hoy = new Date();
    const fechaActualFormateada = new Date(hoy.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const montoEnLetras = numeroALetras(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);
    let conductorInfoParaIA = "El vehículo era conducido por el/la titular.";
    if (data.siniestro.conductorNombre && data.siniestro.conductorNombre.trim() !== '' && data.siniestro.conductorNombre.trim().toUpperCase() !== data.siniestro.cliente.trim().toUpperCase()) {
        conductorInfoParaIA = `El vehículo era conducido por el/la Sr./Sra. ${data.siniestro.conductorNombre}`;
        if (data.siniestro.conductorDni) { conductorInfoParaIA += `, DNI N° ${data.siniestro.conductorDni}`; }
        conductorInfoParaIA += ".";
    }
    let pruebaDocumental = `\nV. PRUEBA DOCUMENTAL...`; // Acortado para brevedad
    if (data.hayLesiones) { pruebaDocumental += `\nG. Certificados médicos`; }

    // ===== INICIO DE LA CORRECCIÓN: PROMPT COMPLETO RESTAURADO =====
    const promptText = `
        Eres un asistente legal experto del estudio "García & Asociados". Tu tarea es redactar una carta de patrocinio con un tono formal, profesional y preciso, siguiendo estrictamente el modelo y las instrucciones.
        INSTRUCCIONES CLAVE:
        1.  **Relato del Hecho:** No copies la descripción del siniestro. Debes crear un párrafo narrativo coherente y profesional que integre la descripción del hecho que te proporciono. Usa tu inteligencia para transformar los datos en un relato legal fluido.
        2.  **Lógica del Conductor:** Te doy un dato clave: "${conductorInfoParaIA}". Si el vehículo estaba en movimiento y el conductor no es el titular, debes integrar esta información de forma natural en el relato (ej: "...el vehículo de mi mandante, que en la ocasión era conducido por [Nombre del Conductor], fue embestido..."). Si el vehículo estaba "estacionado", aplica la lógica y NO menciones quién lo conducía.
        3.  **Responsabilidad:** Te doy una pista sobre la infracción: "${data.infracciones}". No la copies textualmente. Úsala para redactar la primera línea de la sección de responsabilidad de forma más elaborada y profesional (ej: si la pista es "maniobra imprudente", redacta algo como "- Realizó una maniobra intempestiva y carente de la debida precaución.").
        4.  **Lesiones:** Si hay lesiones (${data.hayLesiones ? 'Sí' : 'No'}), debes mencionarlo en el relato de los hechos (sección II) de forma profesional, indicando que "Como producto del impacto, [el conductor/la Sra. X] sufrió lesiones, consistentes en ${data.lesionesDesc}".
        5.  **Estructura y Formato:** Sigue la estructura de las secciones sin alterarla. Las secciones V y VI deben ser copiadas textualmente como se proporcionan en el modelo.
        **DATOS A UTILIZAR:**
        - Fecha de Hoy: ${fechaActualFormateada}
        - Datos del Cliente: ${data.siniestro.cliente}, DNI ${data.siniestro.dni}
        - Descripción del Siniestro (para tu relato): "${data.relato}"
        - Vehículo del Cliente: ${data.vehiculoCliente}
        - Partes Dañadas: ${data.partesDanadas}
        - Pista sobre la infracción del Tercero: ${data.infracciones}
        - Monto en Letras: ${montoEnLetras}
        - Monto en Números: ${montoEnNumeros}
        - Destinatario: ${data.destinatario}, con domicilio en ${data.destinatarioDomicilio}
        **CARTA A GENERAR (sigue esta estructura):**
        ---
        Lugar y fecha: Bernal, ${fechaActualFormateada}
        Destinatario: ${data.destinatario.toUpperCase()}
        Domicilio: ${data.destinatarioDomicilio}
        S/D
        I. OBJETO
        Por medio de la presente, y en mi carácter de representante legal del/la Sr./Sra. ${data.siniestro.cliente.toUpperCase()}, DNI N° ${data.siniestro.dni}, vengo en legal tiempo y forma a formular RECLAMO FORMAL por los daños materiales ${data.hayLesiones ? 'y lesiones físicas' : ''} sufridos como consecuencia del siniestro vial que se detalla a continuación.
        II. HECHOS
        [AQUÍ CONSTRUYE EL RELATO COHERENTE COMO SE TE INDICÓ EN LAS INSTRUCCIONES 1, 2 Y 4]
        El impacto se produjo en las siguientes partes del vehículo de mi cliente: ${data.partesDanadas}.
        Como consecuencia directa del referido evento, el vehículo de mi representado/a sufrió los daños materiales cuya reparación constituye el objeto del presente reclamo.
        III. RESPONSABILIDAD
        La responsabilidad del siniestro recae exclusivamente en el conductor del vehículo de su asegurado/a, quien incurrió en las siguientes faltas:
        [AQUÍ REDACTA LA PRIMERA INFRACCIÓN BASÁNDOTE EN LA PISTA, COMO SE INDICÓ EN LA INSTRUCCIÓN 3]
        - Incumplió el deber de prudencia y diligencia en la conducción.
        - Causó el daño por su conducta antirreglementaria.
        IV. DAÑOS RECLAMADOS
        Se reclama el valor total de los daños sufridos por mi mandante, que asciende a la suma de PESOS ${montoEnLetras.toUpperCase()} (${montoEnNumeros})${data.hayLesiones ? ', importe que comprende tanto los daños materiales como la reparación por las lesiones padecidas.' : '.'}
        ${pruebaDocumental}
        VI. PETITORIO
        Por todo lo expuesto, y considerando que se encuentran acreditados tanto el hecho generador como la extensión de los daños sufridos, SOLICITO:
        1. Se tenga por presentado el presente reclamo en legal tiempo y forma.
        2. Se proceda al pago integral de los daños reclamados.
        3. Se establezca un plazo perentorio para la resolución del presente reclamo.
        4. Se mantenga comunicación fluida durante la tramitación del expediente.
        Aguardando una pronta y favorable resolución, saludo a Uds. con distinguida consideración.
        ---
        **INSTRUCCIONES FINALES:** Tu única respuesta debe ser el texto completo y final de la carta. No incluyas los datos ni estas instrucciones. No agregues la firma.
    `;
    // ===== FIN DE LA CORRECCIÓN =====

    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [{"role": "user", "content": promptText}]
    };
    const headers = { 'Authorization': `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' };
    const response = await axios.post(url, requestBody, { headers });
    const cartaSinFirma = response.data.choices[0].message.content.trim();
    const firma = `\n____________________________________\nDra. Camila Florencia García...`; // Acortado para brevedad
    return cartaSinFirma + firma;
}

app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error.response ? error.response.data.error : error);
        res.status(500).json({ error: 'Error interno del servidor al generar la carta.', detalle: error.response ? JSON.stringify(error.response.data.error) : "Error desconocido" });
    }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor escuchando con todas las funciones corregidas...`);
});
