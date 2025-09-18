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
    const promesasDeDescarga = [];
    if (driveFileUrlFamilia) promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }));
    if (driveFileUrlSiniestros) promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }));

    if (promesasDeDescarga.length === 0) throw new Error('No hay URLs de archivos de Drive configuradas.');

    try {
        const respuestas = await Promise.all(promesasDeDescarga.map(p => p.catch(e => e)));
        let datosCombinados = [];
        respuestas.forEach(response => {
            if (response.status !== 200) {
                console.error("Error al descargar uno de los archivos, será omitido:", response.message);
                return;
            }
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

async function traducirObservacionesConIA(observacionesArray, nombreCliente) {
    if (!genAI || !observacionesArray || observacionesArray.length === 0) {
        return observacionesArray;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const historialParaIA = observacionesArray.map(obs => {
            return `FECHA: "${obs.fecha}"\nANOTACION ORIGINAL: "${obs.texto}"`;
        }).join('\n---\n');

        // **PROMPT CORREGIDO SOLO CON EL GLOSARIO ACTUALIZADO**
        const prompt = `
            Sos un asistente legal para el estudio García & Asociados. El cliente se llama ${nombreCliente}.
            Tu tarea es reescribir CADA una de las siguientes anotaciones de su expediente para que sean claras, empáticas y profesionales, usando un lenguaje sencillo pero manteniendo la precisión técnica.

            Para entender el contexto, utiliza el siguiente glosario de términos jurídicos:
            --- GLOSARIO ---
            - SCBA: Significa 'Suprema Corte de Justicia de la Provincia de Buenos Aires'. Es el portal que se utiliza para enviar escritos y recibir notificaciones.
            - MEV: Significa 'Mesa de Entradas Virtual'. Es la plataforma donde se hace el seguimiento del expediente.
            - Expediente a despacho: Significa que el juez o un funcionario está trabajando activamente en el caso para emitir una resolución.
            - Oficio: Es una comunicación oficial escrita que se envía para solicitar información.
            - Proveído: Es la respuesta o decisión del juez a un pedido realizado.
            - Mediación: Es una reunión con un mediador para intentar llegar a un acuerdo antes de un juicio.
            - Acta de audiencia: Documento que registra lo sucedido en una audiencia.
            - Apercibimiento: Advertencia del juez sobre las consecuencias de no cumplir una orden.
            - Carta documento: Notificación postal con valor probatorio.
            - Cédula de notificación: Documento oficial para comunicar resoluciones judiciales.
            - Contestación de demanda: Escrito donde la parte demandada responde a la acusación.
            - Embargo: Medida para inmovilizar bienes y asegurar el pago de una deuda.
            - Homologación: Acto por el cual un juez da validez de sentencia a un acuerdo privado.
            --- FIN GLOSARIO ---

            A continuación, las anotaciones a procesar:
            ---
            ${historialParaIA}
            ---

            Debes devolver tu respuesta EXCLUSIVAMENTE como un array de objetos JSON válido. Cada objeto debe tener dos claves: "fecha" y "texto". Mantené la fecha original de cada anotación. No agregues comentarios, explicaciones, ni texto introductorio. Solo el array JSON.
        `;

        const result = await model.generateContent(prompt);
        const textoRespuesta = result.response.text().trim();
        
        const textoJsonLimpio = textoRespuesta.replace(/```json/g, '').replace(/```/g, '');
        const observacionesTraducidas = JSON.parse(textoJsonLimpio);

        if(Array.isArray(observacionesTraducidas) && observacionesTraducidas.length === observacionesArray.length) {
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
        const clientsData = await getAllClientData();
        if (!Array.isArray(clientsData)) throw new Error('Los datos recibidos no son una lista.');

        const expedientesEncontrados = clientsData.filter(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (expedientesEncontrados.length > 0) {
            const expedientesParaCliente = JSON.parse(JSON.stringify(expedientesEncontrados));
            
            for (const exp of expedientesParaCliente) {
                 if (exp.observaciones && Array.isArray(exp.observaciones)) {
                    const observacionesVisibles = exp.observaciones.filter(o => o.fecha && !o.texto.trim().startsWith('//'));
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
  res.send('¡Servidor funcionando con IA v12 (Glosario Corregido)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
