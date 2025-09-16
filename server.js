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
    console.log("Cliente de IA inicializado correctamente.");
} else {
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY. La función de IA estará desactivada.");
}

app.use(cors());
app.use(express.json());

// La función ahora siempre busca los datos en Drive (sin caché).
async function getClientDataFromUrl() {
    console.log("Obteniendo datos frescos de Drive...");
    if (!driveFileUrl) throw new Error('La URL del archivo de Drive no está configurada.');

    try {
        const response = await axios.get(driveFileUrl);
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data;
    } catch (error) {
        console.error('Error al descargar o parsear el archivo:', error.message);
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
            const prompt = `Sos un asistente legal para el estudio García & Asociados. El cliente se llama ${nombreCliente}. Reescribí la siguiente anotación de su expediente judicial de forma directa, en un tono activo, de compromiso y profesional, manteniendo la precisión técnica pero usando un lenguaje claro para alguien sin conocimientos legales. NO ofrezcas opciones ni des explicaciones sobre tu redacción, solo entrega el texto final. La anotación es: "${obs.texto}"`;

            return model.generateContent(prompt).then(result => {
                return { ...obs, texto: result.response.text().trim() };
            }).catch(error => {
                console.error("Error en una llamada individual a la IA:", error);
                return obs; // Si una falla, devolvemos la original.
            });
        });

        return await Promise.all(promesasDeTraduccion);

    } catch (error) {
        console.error("Error al procesar con la IA:", error);
        return observacionesArray; // Si hay un error general, devolvemos las originales.
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
                // **MEJORA: Filtramos las observaciones para ocultar las futuras**
                const observacionesVisibles = exp.observaciones.filter(obs => {
                    const fechaObs = new Date((obs.proximaRevision || obs.fecha) + 'T00:00:00');
                    return fechaObs <= hoy;
                });

                // Solo pasamos las visibles a la IA
                exp.observaciones = await traducirObservacionesConIA(observacionesVisibles, exp.nombre);
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
  res.send('¡Servidor funcionando con IA v5 (Final)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
