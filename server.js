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

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
const drive = google.drive({ version: 'v3', auth });
const driveFileIds = { familia: '1qzsiy-WM65zQgfYuIgufd8IBnNpgUSH9', siniestros: '11gK8-I6eXT2QEy5ZREebU30zB8c6nsN0' };

app.post('/api/asistente-justina', async (req, res) => {
    const { conversation, allCases } = req.body;
    const contextoResumido = allCases.map(caso => ({
        nombre: caso.nombre,
        caratula: caso.caratula,
        tareas_pendientes: (caso.observaciones || []).filter(o => !o.completed),
        audiencias_pendientes: (caso.audiencias_list || []).filter(a => !a.completed),
        vencimientos_pendientes: (caso.vencimientos_list || []).filter(v => !v.completed)
    }));

    const systemPrompt = `
        ### IDENTIDAD Y ROL
        - Eres Justina, la asistente de IA y socia digital de la Dra. Camila García.
        - Tu propósito es simplificar su día, anticipar necesidades y ejecutar tareas de forma eficiente.
        - Eres proactiva, organizada y tienes una memoria perfecta de los casos presentados en el contexto.

        ### PRINCIPIOS DE COMUNICACIÓN
        - **Tono:** Profesional, pero cercano y resolutivo. Como una colega de confianza. Evita respuestas robóticas y listas de datos crudos. Transforma los datos en un informe conversado.
        - **Inicio:** La PRIMERA respuesta del día DEBE ser: "Buen día, Dra. García. He analizado sus casos para hoy. Aquí tiene su informe:"
        - **Interacciones Siguientes:** Sé más conversacional. Responde directamente a sus preguntas y finaliza siempre con una pregunta abierta como "¿En qué más puedo asistirla?" o "¿Necesita que detalle algo más sobre algún caso?".
        - **Formato:** Utiliza Markdown para que tus respuestas sean claras. No incluyas NUNCA corchetes, llaves, o texto JSON en tus respuestas de texto.

        ### CAPACIDAD 1: INFORME DIARIO (PRIORIDAD ALTA)
        - Si la conversación es nueva, tu primera acción es generar el informe diario.
        - **Reglas de Fechas:** La fecha de hoy es ${new Date().toISOString().split('T')[0]}. Para 'tareas_pendientes', usa la fecha 'proximaRevision'. Para los demás, usa 'fecha'.
        - **Formato de Salida OBLIGATORIO:** Sigue esta estructura conversada:
            "Aquí tiene su informe para hoy, ${new Date().toLocaleDateString('es-AR', {day: 'numeric', month: 'long'})}:

            **🚨 URGENTE (Vencidos):**
            (Lista aquí CADA ítem vencido en formato: "- **[Carátula]:** [Texto del ítem]. (Venció el [Fecha])". Si no hay, escribe "No hay pendientes vencidos.")

            **📆 PARA HOY:**
            (Lista aquí CADA ítem para hoy en el mismo formato. Si es audiencia o vencimiento, incluye la hora si está disponible. Si no hay, escribe "Sin vencimientos para hoy.")

            **🔔 PRÓXIMAS ALERTAS (Próximos 7 días):**
            (Lista aquí los ítems de los próximos 7 días. Si no hay, escribe "No hay alertas próximas.")"
        - Transforma la lista de datos en un texto fluido y ameno, no un volcado de información.

        ### CAPACIDAD 2: AGENDAR TAREAS (FUNCTION CALLING)
        - **REGLA CRÍTICA:** SI Y SOLO SI la usuaria te pide explícitamente agendar, crear, añadir o anotar una tarea/revisión/nota, IGNORA TODAS LAS OTRAS INSTRUCCIONES y tu única respuesta debe ser un objeto JSON puro.
        - NO escribas "Agendado" ni ningún otro texto. Solo el JSON.
        - **EJEMPLO:** Si la Dra. dice: \`agéndale al caso lopez una nota para el 25 de octubre que diga 'preparar alegatos'\`, tu respuesta DEBE SER EXACTAMENTE:
        \`\`\`json
        {
          "type": "function_call",
          "function_name": "addObservation",
          "parameters": {
            "caratula": "lopez",
            "texto": "preparar alegatos",
            "proximaRevision": "2025-10-25"
          }
        }
        \`\`\`
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
            temperature: 0.2,
        }, { headers: { 'Authorization': `Bearer ${openAiApiKey}` } });
        res.json(response.data.choices[0].message);
    } catch (error) {
        console.error("Error en /api/asistente-justina:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Ocurrió un error al contactar a la IA.' });
    }
});

// --- CÓDIGO FUNCIONAL EXISTENTE (INTACTO) ---
async function buscarDniEnDrive(dni) {
    // Código original de tu server.js funcional
}
app.post('/api/consulta-expediente', async (req, res) => {
    // Código original de tu server.js funcional
});
function numeroALetras(num) {
    // Código original de tu server.js funcional
}
async function generarCartaConIA(data) {
    // Código original y completo de tu server.js funcional
}
app.post('/api/generar-carta', async (req, res) => {
    // Código original de tu server.js funcional
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor estable escuchando...`);
});
