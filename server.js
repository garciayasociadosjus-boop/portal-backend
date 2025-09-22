const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

// --- NO CAMBIAN ---
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
app.use(express.json({ limit: '10mb' })); // Aumentamos el límite por si se envían datos extensos

// --- ESTA FUNCIÓN NO CAMBIA ---
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

// --- ESTA FUNCIÓN NO CAMBIA ---
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

// --- **NUEVA FUNCIÓN PARA GENERAR LA CARTA** ---
async function generarCartaConIA(data) {
    if (!genAI) {
        throw new Error("El cliente de IA no está inicializado.");
    }
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Función para convertir número a letras (simple, para el prompt)
    const numeroALetras = (num) => `PESOS ${new Intl.NumberFormat('es-AR').format(num)}`;
    const montoEnLetras = numeroALetras(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);

    const prompt = `
        Eres un asistente legal experto del estudio "García & Asociados", especializado en la redacción de cartas de patrocinio para reclamos de siniestros viales en Argentina. Tu tono debe ser formal, preciso y profesional.

        A continuación, te proporciono todos los datos necesarios para redactar la carta. Debes seguir ESTRICTAMENTE la estructura y el formato del modelo de ejemplo.

        **DATOS DEL CASO:**
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
        - **Relato de los hechos (versión del cliente):** "${data.relato}"
        - **Infracciones cometidas por el tercero:** "${data.infracciones}"
        - **Daños materiales en vehículo del cliente:** "${data.partesDanadas}"
        - **¿Hubo Lesiones?:** ${data.hayLesiones ? 'Sí' : 'No'}
        ${data.hayLesiones ? `- Descripción de las lesiones: "${data.lesionesDesc}"` : ''}
        - **Monto Total Reclamado:** ${montoEnLetras} (${montoEnNumeros})

        **MODELO DE CARTA A SEGUIR (USA ESTA ESTRUCTURA):**
        ---
        Lugar y fecha: [Lugar de Emisión], [Fecha actual con formato "dd de mes de aaaa"]

        Destinatario: [COMPAÑÍA ASEGURADORA DEL TERCERO]
        Domicilio: [Domicilio de la compañía]
        S/D

        I. OBJETO
        Por medio de la presente, y en mi carácter de representante legal del/la Sr./Sra. [NOMBRE Y APELLIDO DEL CLIENTE], DNI N° [DNI DEL CLIENTE], vengo en legal tiempo y forma a formular RECLAMO FORMAL por los daños y perjuicios sufridos como consecuencia del siniestro vial que se detalla a continuación.

        II. HECHOS
        En fecha [FECHA COMPLETA DEL SINIESTRO], aproximadamente a las [HORA] hs., mi representado/a circulaba a bordo de su vehículo [MARCA, MODELO, AÑO, DOMINIO DEL CLIENTE], por [DESCRIPCIÓN DEL LUGAR DEL SINIESTRO], respetando en todo momento las normas de tránsito vigentes.
        De manera imprevista y antirreglamentaria, el rodado conducido por el/la Sr./Sra. ${data.nombreTercero} embistió el vehículo de mi mandante. [AQUÍ, REDACTA UN PÁRRAFO FORMAL Y DETALLADO BASADO EN EL "Relato de los hechos" PROPORCIONADO].
        El impacto se produjo en la parte ${data.partesDanadas} del vehículo de mi cliente. ${data.hayLesiones ? 'Como resultado del impacto, mi cliente sufrió las siguientes lesiones: ' + data.lesionesDesc + '.' : ''}

        III. RESPONSABILIDAD
        La responsabilidad del siniestro recae exclusivamente en el conductor de su asegurado/a, quien incurrió en graves faltas a la Ley de Tránsito, entre ellas:
        - [UTILIZA LAS "Infracciones cometidas por el tercero" PARA LISTARLAS AQUÍ].
        - Incumplió el deber de prudencia y diligencia en la conducción.
        - Causó el daño por su conducta negligente y antirreglamentaria.

        IV. DAÑOS RECLAMADOS
        Se reclama el valor total de los daños y perjuicios sufridos por mi mandante, que asciende a la suma de ${montoEnLetras.toUpperCase()} (${montoEnNumeros}), importe que comprende tanto los daños materiales del rodado ${data.hayLesiones ? 'como la reparación integral por las lesiones padecidas.' : '.'}

        V. PETITORIO
        Por todo lo expuesto, SOLICITO:
        1. Se tenga por presentado el presente reclamo en legal tiempo y forma.
        2. Se proceda al pago integral de los daños reclamados en un plazo perentorio de diez (10) días hábiles.
        3. Se mantenga comunicación fluida durante la tramitación del expediente.

        Aguardando una pronta y favorable resolución, saludo a Uds. con distinguida consideración.


        ____________________________________
        Dra. Camila Florencia Rodríguez García
        T° XII F° 383 C.A.Q.
        CUIT 27-38843361-8
        Zapiola 662, Bernal – Quilmes
        garciayasociadosjus@gmail.com
        ---

        **INSTRUCCIONES FINALES:**
        1.  Completa el modelo con los datos proporcionados.
        2.  Calcula la fecha actual para el encabezado.
        3.  Elabora la sección "HECHOS" de forma profesional basándote en el relato del cliente.
        4.  Tu respuesta debe ser **únicamente el texto completo y final de la carta**, sin agregar "Aquí está la carta:", ni explicaciones, ni nada más. Solo el texto.
    `;
    
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
}


// --- ENDPOINTS DE LA API ---

// --- **NUEVO ENDPOINT PARA LA CARTA** ---
app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error);
        res.status(500).json({ error: 'Error interno del servidor al generar la carta.', detalle: error.toString() });
    }
});

// --- ESTE ENDPOINT NO CAMBIA ---
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
  res.send('¡Servidor funcionando con IA v13 (Generador de Cartas ACTIVO)!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
