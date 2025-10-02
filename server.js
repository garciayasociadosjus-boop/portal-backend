require('dotenv').config();
const express = 'express';
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;

const openAiApiKey = process.env.OPENAI_API_KEY;

app.use(cors({ origin: '*' }));
// AJUSTE: Aumentamos el límite para poder enviar la lista completa de casos a la IA
app.use(express.json({ limit: '10mb' })); 


// --- SECCIÓN DE AUTENTICACIÓN CON GOOGLE (Sin cambios) ---
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


// --- INICIO: NUEVO ENDPOINT PARA ASISTENTE JUSTINA IA ("PISO 3") ---
app.post('/api/asistente-justina', async (req, res) => {
    const { conversation, allCases } = req.body;

    const systemPrompt = `
        Eres Justina, la asistente virtual y socia digital proactiva del Estudio Jurídico García & Asociados. Tu usuaria es la Dra. Camila García. Tu tono es profesional, eficiente y servicial.

        Tus capacidades son:
        1.  **Análisis Proactivo de Datos:** Al recibir una lista de casos ("allCases"), tu primera tarea es analizarlos y generar un "Informe de Inteligencia Diario". Debes identificar:
            - Tareas o vencimientos con fecha de hoy.
            - Tareas o vencimientos VENCIDOS.
            - Alertas de plazos críticos (ej: vencimientos importantes en los próximos 7 días).
            - Casos sin actividad reciente (ej: sin tareas nuevas en los últimos 30 días) y sugerir una acción.
            - Patrones o sugerencias estratégicas si detectas algo relevante.
        2.  **Respuesta Conversacional:** Responde a las preguntas de la Dra. García basándote en la conversación previa ("conversation") y el contexto de todos los casos ("allCases").
        3.  **Redacción de Borradores:** Si se te pide "prepara un borrador de escrito para...", genera un texto legal simple y formal basado en la petición.
        4.  **Generación de Resúmenes:** Si se te pide "resume el caso X", extrae las últimas actuaciones y puntos clave de ese caso.
        
        INSTRUCCIONES CLAVE:
        - Sé concisa y ve al grano. Usa listas (bullets) para ser más clara.
        - Si el usuario simplemente saluda o pide el resumen, genera el "Informe de Inteligencia Diario".
        - Basa TODAS tus respuestas exclusivamente en los datos de "allCases" que te proporciona el usuario. No inventes información.
        - Siempre dirígete a la usuaria como "Dra. García".
    `;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: `Contexto de casos (clientsData): ${JSON.stringify(allCases)}` },
        ...conversation
    ];

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4-turbo", // Modelo potente para tareas de análisis. Puedes cambiarlo a "gpt-3.5-turbo" si prefieres.
            messages: messages,
            temperature: 0.5,
        }, {
            headers: { 'Authorization': `Bearer ${openAiApiKey}` }
        });

        res.json(response.data.choices[0].message);
    } catch (error) {
        console.error("Error en /api/asistente-justina:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Ocurrió un error al contactar a la IA.' });
    }
});
// --- FIN: NUEVO ENDPOINT PARA ASISTENTE JUSTINA IA ---


// --- FUNCIÓN PARA BUSCAR DATOS EN DRIVE (Sin cambios) ---
async function buscarDniEnDrive(dni) {
    // ... tu código original sin modificaciones ...
    let todasLasNotasPublicas = [];
    for (const key in driveFileIds) {
        const fileId = driveFileIds[key];
        try {
            const fileContent = await drive.files.get({ fileId: fileId, alt: 'media' });
            const data = fileContent.data;
            let expedientes = [];
            if (key === 'familia' && Array.isArray(data)) { expedientes = data.filter(cliente => cliente.dni && cliente.dni.toString().trim() === dni.toString().trim()); }
            else if (key === 'siniestros' && Array.isArray(data)) { expedientes = data.filter(siniestro => siniestro.dni && siniestro.dni.toString().trim() === dni.toString().trim()); }
            if (expedientes.length > 0) { expedientes.forEach(exp => { const titulo = `--- Expediente: ${exp.caratula || exp.numeroReclamo || 'General'} ---\n`; const notas = (exp.observaciones || []).filter(obs => obs.texto && obs.texto.trim() !== '').map(obs => `- (Fecha de revisión: ${obs.proximaRevision || 'N/A'}): ${obs.texto}`).join('\n'); if (notas) { todasLasNotasPublicas.push(titulo + notas); } }); }
        } catch (error) { console.error(`Error al leer el archivo ${key} (${fileId}) de Drive:`, error.message); }
    }
    return todasLasNotasPublicas.join('\n\n');
}


// --- RUTA PARA LA CONSULTA DE EXPEDIENTES (Sin cambios) ---
app.post('/api/consulta-expediente', async (req, res) => {
    // ... tu código original sin modificaciones ...
    const { dni } = req.body;
    if (!dni) { return res.status(400).json({ error: 'El DNI es requerido.' }); }
    try {
        const notasPublicas = await buscarDniEnDrive(dni);
        if (!notasPublicas || notasPublicas.trim() === '') { return res.send("No se encontró información..."); }
        const prompt = `Eres un asistente legal...`; // Prompt acortado para brevedad
        const response = await axios.post('https://api.openai.com/v1/chat/completions', { model: "gpt-3.5-turbo", messages: [{"role": "user", "content": prompt}], temperature: 0.5, }, { headers: { 'Authorization': `Bearer ${openAiApiKey}` } });
        res.send(response.data.choices[0].message.content);
    } catch (error) { console.error("Error en /api/consulta-expediente:", error); res.status(500).json({ error: 'Ocurrió un error al procesar su solicitud.' }); }
});


// --- CÓDIGO ORIGINAL PARA GENERAR CARTAS (Sin cambios) ---
function numeroALetras(num) {
    // ... tu código original sin modificaciones ...
}
async function generarCartaConIA(data) {
    // ... tu código original sin modificaciones ...
}
app.post('/api/generar-carta', async (req, res) => {
    // ... tu código original sin modificaciones ...
});


app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor escuchando con el nuevo asistente Justina IA...`);
});
