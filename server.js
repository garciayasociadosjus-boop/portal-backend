const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- INTERRUPTOR DE SEGURIDAD ---
// Poner en 'true' solo si queremos intentar activar la IA.
const USAR_IA = false; 
// ---------------------------------

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrl = process.env.DRIVE_FILE_URL;
const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI;
if (geminiApiKey && USAR_IA) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("Cliente de IA inicializado.");
} else {
    console.log("IA desactivada por el interruptor de seguridad o falta de API Key.");
}

app.use(cors());
app.use(express.json());

async function getClientDataFromUrl() {
    if (!driveFileUrl) throw new Error('La URL del archivo de Drive no está configurada.');
    try {
        const response = await axios.get(driveFileUrl, { responseType: 'json' });
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data;
    } catch (error) {
        throw new Error('No se pudo procesar el archivo de datos.');
    }
}

async function traducirObservacionesConIA(observacionesArray, nombreCliente) {
    // Si la IA está desactivada o no hay nada que traducir, devolvemos las notas originales.
    if (!USAR_IA || !genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const promesasDeTraduccion = observacionesArray.map(obs => {
            const prompt = `Para el expediente del cliente ${nombreCliente}, reescribí esta anotación en un tono activo y de compromiso, manteniendo la precisión técnica y usando lenguaje claro: "${obs.texto}"`;
            return model.generateContent(prompt).then(result => ({ ...obs, texto: result.response.text().trim() }))
                      .catch(err => obs); // Si una falla, devuelve la original
        });
        return await Promise.all(promesasDeTraduccion);
    } catch (error) {
        console.error("Error general al procesar con la IA:", error);
        return observacionesArray; // Si hay un error, devolvemos las originales
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
                // Filtramos para ocultar actuaciones futuras
                exp.observaciones = exp.observaciones.filter(obs => {
                    const fechaObs = new Date((obs.proximaRevision || obs.fecha) + 'T00:00:00');
                    return fechaObs <= hoy;
                });

                // Pasamos las observaciones visibles a la IA (que está desactivada por ahora)
                exp.observaciones = await traducirObservacionesConIA(exp.observaciones, exp.nombre);
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
  res.send('¡Servidor funcionando en modo estable (IA desactivada)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
