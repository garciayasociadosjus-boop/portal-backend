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


// --- ENDPOINT UNIFICADO PARA JUSTINA IA (CON PROMPT MEJORADO) ---
app.post('/api/asistente-justina', async (req, res) => {
    const { conversation, allCases } = req.body;

    const contextoResumido = allCases.map(caso => ({
        nombre: caso.nombre,
        caratula: caso.caratula,
        expediente: caso.expediente,
        estado: caso.estado,
        // Renombramos para que la IA entienda mejor
        tareas_pendientes: (caso.observaciones || []).filter(o => !o.completed),
        audiencias_pendientes: (caso.audiencias_list || []).filter(a => !a.completed),
        vencimientos_pendientes: (caso.vencimientos_list || []).filter(v => !v.completed)
    }));

    // ===== INICIO DE LA MODIFICACIÓN DEL PROMPT =====
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
    // ===== FIN DE LA MODIFICACIÓN DEL PROMPT =====

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: `Contexto de casos resumidos: ${JSON.stringify(contextoResumido)}` },
        ...conversation
    ];

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: messages,
            temperature: 0.3, // Bajamos la temperatura para respuestas más predecibles y estructuradas
        }, {
            headers: { 'Authorization': `Bearer ${openAiApiKey}` }
        });

        res.json(response.data.choices[0].message);
    } catch (error) {
        console.error("Error en /api/asistente-justina:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Ocurrió un error al contactar a la IA.' });
    }
});


// --- El resto del código se mantiene exactamente igual ---
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'], });
const drive = google.drive({ version: 'v3', auth });
const driveFileIds = { familia: '1qzsiy-WM65zQgfYuIgufd8IBnNpgUSH9', siniestros: '11gK8-I6eXT2QEy5ZREebU30zB8c6nsN0' };
async function buscarDniEnDrive(dni) { let todasLasNotasPublicas = []; for (const key in driveFileIds) { const fileId = driveFileIds[key]; try { const fileContent = await drive.files.get({ fileId: fileId, alt: 'media' }); const data = fileContent.data; let expedientes = []; if (key === 'familia' && Array.isArray(data)) { expedientes = data.filter(cliente => cliente.dni && cliente.dni.toString().trim() === dni.toString().trim()); } else if (key === 'siniestros' && Array.isArray(data)) { expedientes = data.filter(siniestro => siniestro.dni && siniestro.dni.toString().trim() === dni.toString().trim()); } if (expedientes.length > 0) { expedientes.forEach(exp => { const titulo = `--- Expediente: ${exp.caratula || exp.numeroReclamo || 'General'} ---\n`; const notas = (exp.observaciones || []).filter(obs => obs.texto && obs.texto.trim() !== '').map(obs => `- (Fecha de revisión: ${obs.proximaRevision || 'N/A'}): ${obs.texto}`).join('\n'); if (notas) { todasLasNotasPublicas.push(titulo + notas); } }); } } catch (error) { console.error(`Error al leer el archivo ${key} (${fileId}) de Drive:`, error.message); } } return todasLasNotasPublicas.join('\n\n'); }
app.post('/api/consulta-expediente', async (req, res) => { const { dni } = req.body; if (!dni) { return res.status(400).json({ error: 'El DNI es requerido.' }); } try { const notasPublicas = await buscarDniEnDrive(dni); if (!notasPublicas || notasPublicas.trim() === '') { return res.send("No se encontró información pública para el DNI proporcionado o no hay actuaciones para mostrar. Si cree que es un error, por favor póngase en contacto con el estudio."); } const prompt = `Eres un asistente legal...`; const response = await axios.post('https://api.openai.com/v1/chat/completions', { model: "gpt-3.5-turbo", messages: [{"role": "user", "content": prompt}], temperature: 0.5, }, { headers: { 'Authorization': `Bearer ${openAiApiKey}` } }); res.send(response.data.choices[0].message.content); } catch (error) { console.error("Error en /api/consulta-expediente:", error); res.status(500).json({ error: 'Ocurrió un error al procesar su solicitud.' }); } });
function numeroALetras(num) { /*...código original...*/ }
async function generarCartaConIA(data) { /*...código original...*/ }
app.post('/api/generar-carta', async (req, res) => { /*...código original...*/ });

app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor escuchando con el nuevo asistente Justina IA...`);
});
