const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrl = process.env.DRIVE_FILE_URL;
const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("Cliente de IA inicializado.");
} else {
    console.log("ADVERTENCIA: IA desactivada por falta de API Key.");
}

app.use(cors());
app.use(express.json());

async function getClientDataFromUrl() {
    if (!driveFileUrl) throw new Error('La URL del archivo de Drive no está configurada.');
    try {
        const response = await axios.get(driveFileUrl, { responseType: 'json' });
        return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (error) {
        throw new Error('No se pudo procesar el archivo de datos.');
    }
}

async function traducirObservacionesConIA(observacionesArray, nombreCliente) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray;
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const promesasDeTraduccion = observacionesArray.map(obs => {
            const prompt = `Para el expediente del cliente ${nombreCliente}, reescribí la siguiente anotación en un tono activo y de compromiso, manteniendo la precisión técnica pero con un lenguaje claro. Anotación original: "${obs.texto}"`;
            return model.generateContent(prompt)
                .then(result => ({ ...obs, texto: result.response.text().trim() }))
                .catch(err => obs);
        });
        return await Promise.all(promesasDeTraduccion);
    } catch (error) {
        console.error("Error al procesar con la IA:", error);
        return observacionesArray;
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getClientDataFromUrl();
        if (!Array.isArray(clientsData)) throw new Error('Los datos recibidos no son una lista.');

        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            for (const exp of expedientesParaCliente) {
                if (exp.observaciones && Array.isArray(exp.observaciones)) {
                    // **CORRECCIÓN: Filtramos usando solo el campo `fecha`**
                    const observacionesVisibles = exp.observaciones.filter(obs => {
                        if (!obs.fecha) return false;
                        const fechaObs = new Date(obs.fecha + 'T00:00:00');
                        return fechaObs <= hoy;
                    });

                    exp.observaciones = await traducirObservacionesConIA(observacionesVisibles, exp.nombre);
                }
            }
            res.json(expedientesParaCliente);
        } else {
            res.status(404).json({ error: 'Expediente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor.', detalle: error.toString() });
    }
});

app.get('/', (req, res) => {
  res.send('¡Servidor funcionando con IA v10 (Lógica de fecha DEFINITIVA)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
