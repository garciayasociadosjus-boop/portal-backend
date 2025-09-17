const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

// AHORA TENEMOS LAS DOS URLs
const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;

const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("Cliente de IA inicializado correctamente.");
} else {
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY. La IA estará desactivada.");
}

app.use(cors());
app.use(express.json());

// NUEVA FUNCIÓN MEJORADA PARA LEER Y COMBINAR AMBOS ARCHIVOS
async function getAllClientData() {
    console.log("Obteniendo datos frescos de ambos archivos de Drive...");
    
    const promesasDeDescarga = [];

    // Preparamos la descarga del primer archivo (Familia)
    if (driveFileUrlFamilia) {
        promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }));
    }

    // Preparamos la descarga del segundo archivo (Siniestros)
    if (driveFileUrlSiniestros) {
        promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }));
    }

    if (promesasDeDescarga.length === 0) {
        throw new Error('No hay URLs de archivos de Drive configuradas.');
    }

    try {
        const respuestas = await Promise.all(promesasDeDescarga.map(p => p.catch(e => e))); // Evita que una descarga fallida detenga todo
        
        let datosCombinados = [];
        respuestas.forEach(response => {
            if (response.status !== 200) { // Si hubo un error en esta descarga, lo saltamos
                console.error("Error al descargar uno de los archivos, será omitido:", response.message);
                return;
            }

            let data = response.data;
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }

            // Normalizamos los datos para que todos tengan un campo "nombre" y "caratula"
            const datosNormalizados = data.map(item => {
                if (item.cliente && !item.nombre) item.nombre = item.cliente; // Copiamos 'cliente' a 'nombre'
                if (item.contra && !item.caratula) item.caratula = `Siniestro c/ ${item.contra}`; // Creamos una carátula para siniestros
                return item;
            });

            datosCombinados = [...datosCombinados, ...datosNormalizados];
        });

        console.log(`Datos combinados cargados. Total de casos: ${datosCombinados.length}`);
        return datosCombinados;

    } catch (error) {
        console.error('Error al procesar los archivos:', error.message);
        throw new Error('No se pudo procesar uno de los archivos de datos.');
    }
}


async function traducirObservacionesConIA(observacionesArray, nombreCliente) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const historialParaIA = observacionesArray.map(obs => {
            return `FECHA: "${obs.fecha}"\nANOTACION ORIGINAL: "${obs.texto}"`;
        }).join('\n---\n');

        const prompt = `
            Sos un asistente legal para el estudio García & Asociados. El cliente se llama ${nombreCliente}.
            A continuación, te proporciono una lista de anotaciones internas de su expediente.
            Tu tarea es reescribir CADA anotación para que sea clara, empática y profesional, en un tono activo y de compromiso, sin usar jerga legal compleja pero manteniendo la precisión técnica.
            Debes devolver tu respuesta EXCLUSIVAMENTE como un array de objetos JSON válido. Cada objeto debe tener dos claves: "fecha" y "texto". Mantené la fecha original de cada anotación.
            No agregues comentarios, explicaciones, ni texto introductorio. Solo el array JSON.

            Aquí están las anotaciones:
            ---
            ${historialParaIA}
            ---
        `;

        const result = await model.generateContent(prompt);
        const textoRespuesta = result.response.text().trim();
        
        const textoJsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '');
        const observacionesTraducidas = JSON.parse(textoJsonLimpio);

        if(Array.isArray(observacionesTraducidas)) {
            return observacionesTraducidas;
        } else {
            return observacionesArray;
        }

    } catch (error) {
        console.error("Error al procesar con la IA:", error);
        return observacionesArray;
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;
    try {
        const clientsData = await getAllClientData(); // Usamos la nueva función
        if (!Array.isArray(clientsData)) throw new Error('Los datos recibidos no son una lista.');

        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));

            for (const exp of expedientesParaCliente) {
                 if (exp.observaciones && Array.isArray(exp.observaciones)) {
                    const observacionesVisibles = exp.observaciones.filter(o => o.fecha);
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
  res.send('¡Servidor funcionando con múltiples archivos y IA!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
