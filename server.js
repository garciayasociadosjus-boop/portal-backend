require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const { DiscussServiceClient } = require("@google-ai/generativelanguage");

// --- Configuración con Cuenta de Servicio ---
const MODEL_NAME = "models/chat-bison-001";
let discussServiceClient;

try {
    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
        throw new Error("La variable de entorno GOOGLE_CREDENTIALS_JSON no fue encontrada.");
    }
    
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

    const auth = new GoogleAuth({
        credentials,
        scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });
    
    discussServiceClient = new DiscussServiceClient({ auth });
    console.log("✅ Cliente de IA (Cuenta de Servicio) inicializado correctamente.");

} catch (error) {
    console.error("🔴 ERROR: No se pudo inicializar el cliente de IA con la Cuenta de Servicio.", error);
}

const app = express();
const PORT = process.env.PORT || 3001;

const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;

app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '10mb' }));

async function getAllClientData() {
    const promesasDeDescarga = [];
    if (driveFileUrlFamilia) promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }).catch(e => null));
    if (driveFileUrlSiniestros) promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }).catch(e => null));

    if (promesasDeDescarga.length === 0) {
        console.log("No hay URLs de Drive configuradas en las variables de entorno.");
        return [];
    }
    try {
        const respuestas = await Promise.all(promesasDeDescarga);
        let datosCombinados = [];
        respuestas.filter(Boolean).forEach(response => {
            let data = response.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (parseError) { console.error("Error al parsear JSON:", parseError); return; }
            }
            if (!Array.isArray(data)) return;

            const datosNormalizados = data.map(item => {
                if (item.cliente && !item.nombre) item.nombre = item.cliente;
                if (item.contra && !item.caratula) item.caratula = `Siniestro c/ ${item.contra}`;
                return item;
            });
            datosCombinados = [...datosCombinados, ...datosNormalizados];
        });
        return datosCombinados;
    } catch (error) {
        console.error("Error procesando los archivos de datos:", error);
        throw new Error('No se pudo procesar uno de los archivos de datos.');
    }
}


async function generarCartaConIA(data) {
    if (!discussServiceClient) {
        throw new Error("El cliente de IA no está configurado. Revisa las credenciales de la cuenta de servicio.");
    }

    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const montoEnLetras = new Intl.NumberFormat('es-AR').format(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);
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
        - DNI del Cliente: ${data.siniestro.dni}
        - N° de Póliza del Cliente: ${data.polizaCliente}
        - Aseguradora del Cliente: ${data.aseguradoraCliente.toUpperCase()}
        - Fecha del Siniestro: ${data.fechaSiniestro}
        - Hora del Siniestro: ${data.horaSiniestro}
        - Lugar del Siniestro: ${data.lugarSiniestro}
        - Vehículo del Cliente: ${data.vehiculoCliente.toUpperCase()}
        - Nombre del Tercero (conductor responsable): ${data.nombreTercero}
        - DNI del Tercero: ${data.dniTercero || 'No informado'}
        - Relato de los hechos (versión del cliente): "${data.relato}"
        - Infracciones cometidas por el tercero: "${data.infracciones}"
        - Daños materiales en vehículo del cliente: "${data.partesDanadas}"
        - ¿Hubo Lesiones?: ${data.hayLesiones ? 'Sí' : 'No'}
        - Descripción de las lesiones: "${data.hayLesiones ? data.lesionesDesc : 'No aplica'}"
        - Monto Total Reclamado: PES
