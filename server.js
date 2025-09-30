require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Leemos la nueva clave de API de OpenAI
const openAiApiKey = process.env.OPENAI_API_KEY;
const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Función para obtener datos de Drive (no cambia)
async function getAllClientData() {
    // ... tu código existente está bien ...
}

async function generarCartaConIA(data) {
    if (!openAiApiKey) {
        throw new Error("Falta la OPENAI_API_KEY en las variables de entorno de Railway.");
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const montoEnLetras = new Intl.NumberFormat('es-AR').format(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);
    
    // El prompt es el mismo, solo cambia la forma en que se lo enviamos a la IA
    const promptText = `
        Eres un asistente legal experto del estudio "García & Asociados", especializado en la redacción de cartas de patrocinio para reclamos de siniestros viales en Argentina. Tu tono debe ser formal, preciso y profesional.
        Usa la fecha de hoy que te proporciono para el encabezado.
        Redacta la carta completando el siguiente modelo con los datos proporcionados. Expande el relato de los hechos de forma profesional.

        **FECHA DE HOY PARA LA CARTA:** ${fechaActualFormateada}
        **DATOS DEL CASO A UTILIZAR:**
        - Lugar de Emisión: ${data.lugarEmision}
        - Destinatario (Aseguradora del Tercero): ${data.destinatario.toUpperCase()}
        - Domicilio del Destinatario: ${data.destinatarioDomicilio}
        - Cliente del Estudio (Tu mandante): ${data.siniestro.cliente.toUpperCase()}
        // ... (el resto de los datos del prompt no cambian) ...
        - Monto Total Reclamado: PESOS ${montoEnLetras} (${montoEnNumeros})

        **MODELO DE CARTA A COMPLETAR:**
        ---
        // ... (el resto del modelo de la carta no cambia) ...
        ____________________________________
        Dra. Camila Florencia Rodríguez García
        T° XII F° 383 C.A.Q.
        CUIT 27-38843361-8
        Zapiola 662, Bernal – Quilmes
        garciayasociadosjus@gmail.com
        ---
    `;

    // El formato de la petición a OpenAI es diferente
    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          "role": "user",
          "content": promptText
        }
      ]
    };

    const headers = {
      'Authorization': `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json'
    };
    
    const response = await axios.post(url, requestBody, { headers });
    
    // La forma de obtener la respuesta también cambia
    return response.data.choices[0].message.content.trim();
}


app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error.response ? error.response.data : error);
        res.status(500).json({ error: 'Error interno del servidor al generar la carta.', detalle: error.response ? JSON.stringify(error.response.data.error) : "Error desconocido" });
    }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor OpenAI escuchando...`);
});
