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

// Caché para los datos del cliente
let cachedClientData = null;
let lastFetchTime = 0;

async function getClientDataFromUrl() {
    const currentTime = Date.now();
    // CORRECCIÓN: El caché ahora dura 60 segundos (60000 ms)
    if (cachedClientData && (currentTime - lastFetchTime < 60000)) {
        console.log("Usando datos cacheados.");
        return cachedClientData;
    }

    console.log("Cache expirada o vacía. Obteniendo datos frescos de Drive...");
    if (!driveFileUrl) throw new Error('La URL del archivo de Drive no está configurada.');

    try {
        const response = await axios.get(driveFileUrl);
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);

        cachedClientData = data;
        lastFetchTime = currentTime;
        console.log(`Datos cargados y cacheados. Total de clientes: ${cachedClientData.length}`);
        return cachedClientData;
    } catch (error) {
        console.error('Error al descargar o parsear el archivo:', error.message);
        throw new Error('No se pudo procesar el archivo de datos.');
    }
}

// MEJORA: La IA ahora procesa cada línea individualmente
async function traducirObservacionesConIA(observacionesArray, nombreCliente) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray; // Devolvemos el original si no hay IA o no hay nada que traducir
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Creamos una "promesa" de traducción para cada observación
        const promesasDeTraduccion = observacionesArray.map(obs => {
            const prompt = `El cliente se llama ${nombreCliente}. Reescribí la siguiente anotación de su expediente judicial para que sea clara, empática y profesional, sin usar jerga legal compleja. La anotación es: "${obs.texto}"`;
            return model.generateContent(prompt).then(result => {
                const textoTraducido = result.response.text();
                // Devolvemos un nuevo objeto observación con el texto pulido
                return { ...obs, texto: textoTraducido };
            }).catch(error => {
                console.error("Error en una llamada individual a la IA:", error);
                return obs; // Si una falla, devolvemos la original
            });
        });

        // Esperamos a que todas las traducciones terminen
        const observacionesTraducidas = await Promise.all(promesasDeTraduccion);
        return observacionesTraducidas;

    } catch (error) {
        console.error("Error al procesar con la IA:", error);
        return observacionesArray; // Si hay un error general, devolvemos las originales
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

            for (const exp of expedientesParaCliente) {
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
  res.send('¡Servidor funcionando con IA v3 (formato individual)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
