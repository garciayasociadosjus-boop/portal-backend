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
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("Cliente de IA inicializado correctamente.");
} else {
    console.log("ADVERTENCIA: No se encontró la GEMINI_API_KEY. La IA estará desactivada.");
}

app.use(cors());
app.use(express.json());

async function getAllClientData() {
    console.log("Obteniendo datos frescos de ambos archivos de Drive...");
    
    const promesasDeDescarga = [];

    if (driveFileUrlFamilia) {
        promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }));
    }
    if (driveFileUrlSiniestros) {
        promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }));
    }

    if (promesasDeDescarga.length === 0) {
        throw new Error('No hay URLs de archivos de Drive configuradas.');
    }

    try {
        const respuestas = await Promise.all(promesasDeDescarga.map(p => p.catch(e => e)));
        
        let datosCombinados = [];
        respuestas.forEach(response => {
            if (response.status !== 200) {
                console.error("Error al descargar uno de los archivos, será omitido:", response.message);
                return;
            }
            let data = response.data;
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }

            const datosNormalizados = data.map(item => {
                if (item.cliente && !item.nombre) item.nombre = item.cliente;
                if (item.contra && !item.caratula) item.caratula = `Siniestro c/ ${item.contra}`;
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
            Tu tarea es reescribir CADA anotación para que sea clara, empática y profesional, en un tono activo y de compromiso, sin usar
