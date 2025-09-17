const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;
const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI;
// **CORRECCIÓN: Se vuelve a agregar el control de errores al inicio**
if (geminiApiKey) {
    try {
        genAI = new GoogleGenerativeAI(geminiApiKey);
        console.log("Cliente de IA inicializado correctamente.");
    } catch (error) {
        console.error("Error al inicializar el cliente de IA. La IA estará desactivada.", error);
        genAI = null;
    }
} else {
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY en Render. La IA estará desactivada.");
}

app.use(cors());
app.use(express.json());

async function getAllClientData() {
    const promesasDeDescarga = [];
    if (driveFileUrlFamilia) promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }));
    if (driveFileUrlSiniestros) promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }));

    if (promesasDeDescarga.length === 0) throw new Error('No hay URLs de archivos de Drive configuradas.');

    try {
        const respuestas = await Promise.all(promesasDeDescarga.map(p => p.catch(e => e)));
        let datosCombinados = [];
        respuestas.forEach(response => {
            if (response.status !== 200) return;
            let data = response.data;
            if (typeof data === 'string') data = JSON.parse(data);
            
            const datosNormalizados = data.map(item => {
                if (item.cliente && !item.nombre) item.nombre = item.cliente;
                if (item.contra && !item.caratula) item.caratula = `Siniestro c/ ${item.contra}`;
                return item;
            });
            datosCombinados = [...datosCombinados, ...datosNormalizados];
        });
        return datosCombinados;
    } catch (error) {
        throw new Error('No se pudo procesar uno de los archivos de datos.');
    }
}

async function traducirObservacionesConIA(observacionesArray, nombreCliente, promptAdicional) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray;
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const promesasDeTraduccion = observacionesArray.map(obs => {
            // El prompt se construye aquí, pero la lógica de mejora la vemos después
            const prompt = `Para el expediente del cliente ${nombreCliente}, reescribí la siguiente anotación en un tono activo y de compromiso, manteniendo la precisión técnica pero con un lenguaje claro. Anotación original: "${obs.texto}"`;
            return model.generateContent(prompt).then(result => ({ ...obs, texto: result.response.text().trim() })).catch(err => obs);
        });
        return await Promise.all(promesasDeTraduccion);
    } catch (error) {
        return observacionesArray;
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getAllClientData();
        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));
            
            for (const exp of expedientesParaCliente) {
                if (exp.observaciones && Array.isArray(exp.observaciones)) {
                    const hoy = new Date();
                    hoy.setHours(0, 0, 0, 0);
                    const observacionesVisibles = exp.observaciones.filter(obs => {
                        if (!obs.fecha || obs.texto.trim().startsWith('//')) return false;
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
  res.send('¡Servidor funcionando con filtro de privacidad y a prueba de fallos!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
