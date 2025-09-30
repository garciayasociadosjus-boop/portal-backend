require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Leemos la clave de API de OpenAI
const openAiApiKey = process.env.OPENAI_API_KEY;
const driveFileUrlFamilia = process.env.DRIVE_FILE_URL;
const driveFileUrlSiniestros = process.env.DRIVE_FILE_URL_SINIESTROS;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// Función para obtener datos de Drive (no cambia)
async function getAllClientData() {
    const promesasDeDescarga = [];
    if (driveFileUrlFamilia) promesasDeDescarga.push(axios.get(driveFileUrlFamilia, { responseType: 'json' }).catch(e => null));
    if (driveFileUrlSiniestros) promesasDeDescarga.push(axios.get(driveFileUrlSiniestros, { responseType: 'json' }).catch(e => null));
    if (promesasDeDescarga.length === 0) return [];
    try {
        const respuestas = await Promise.all(promesasDeDescarga);
        let datosCombinados = [];
        respuestas.filter(Boolean).forEach(response => {
            let data = response.data;
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return; } }
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
        throw new Error('No se pudo procesar uno de los archivos de datos.');
    }
}

async function generarCartaConIA(data) {
    if (!openAiApiKey) {
        throw new Error("Falta la OPENAI_API_KEY en las variables de entorno de Railway.");
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    const hoy = new Date();
    const fechaActualFormateada = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const montoEnLetras = new Intl.NumberFormat('es-AR').format(data.montoTotal);
    const montoEnNumeros = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(data.montoTotal);
    
    // --- LÓGICA REFINADA DEL CONDUCTOR ---
    let conductorDelHecho = `el/la titular, Sr./Sra. ${data.siniestro.cliente}`;
    if (data.siniestro.conductorNombre && data.siniestro.conductorNombre.trim() !== '' && data.siniestro.conductorNombre.trim().toUpperCase() !== data.siniestro.cliente.trim().toUpperCase()) {
        conductorDelHecho = `el/la Sr./Sra. ${data.siniestro.conductorNombre}`;
    }
    
    // --- INICIO: PROMPT ACTUALIZADO CON TU PLANTILLA DE WORD Y LÓGICA DE CONDUCTOR ---
    const promptText = `
        Eres un asistente legal experto del estudio "García & Asociados". Tu tarea es completar una carta de patrocinio con un tono formal, profesional y preciso, basándote en el modelo y los datos proporcionados.

        **FECHA DE HOY PARA LA CARTA:** ${fechaActualFormateada}

        **DATOS DEL CASO A UTILIZAR:**
        - Compañía aseguradora del tercero: ${data.destinatario}
        - Domicilio de la compañía: ${data.destinatarioDomicilio}
        - Nombre y apellido del asegurado (titular): ${data.siniestro.cliente}
        - DNI del asegurado: ${data.siniestro.dni}
        - Conductor al momento del hecho: ${conductorDelHecho}
        - Número de póliza del cliente: ${data.polizaCliente}
        - Compañía aseguradora del cliente: ${data.aseguradoraCliente}
        - Fecha completa del siniestro: ${data.fechaSiniestro}
        - Hora del siniestro: ${data.horaSiniestro}
        - Vehículo del cliente (marca, modelo, año, dominio): ${data.vehiculoCliente}
        - Descripción del lugar del siniestro: ${data.lugarSiniestro}
        - Descripción detallada de cómo ocurrió el siniestro: "${data.relato}"
        - Descripción del impacto y partes dañadas: "${data.partesDanadas}"
        - Detalle de las infracciones o conductas negligentes del tercero: "${data.infracciones}"
        - Monto en letras: ${montoEnLetras}
        - Monto en números: ${montoEnNumeros}

        **MODELO DE CARTA A COMPLETAR:**
        ---
        Lugar y fecha: Bernal, ${fechaActualFormateada}

        Destinatario: ${data.destinatario.toUpperCase()}
        Domicilio: ${data.destinatarioDomicilio}
        S/D

        I. OBJETO
        Por medio de la presente, y en mi carácter de representante legal del/la Sr./Sra. ${data.siniestro.cliente.toUpperCase()}, DNI N° ${data.siniestro.dni}, vengo en legal tiempo y forma —conforme lo dispuesto por los arts. 109, 110 y concordantes de la Ley 17.418 de Seguros, y arts. 1757, 1721, 1740 y concordantes del C.C.C.N.— a formular RECLAMO FORMAL por los daños materiales sufridos en el vehículo asegurado bajo la póliza N° ${data.polizaCliente} de ${data.aseguradoraCliente.toUpperCase()}, como consecuencia del siniestro vial que se detalla a continuación.

        II. HECHOS
        En fecha ${data.fechaSiniestro}, aproximadamente a las ${data.horaSiniestro}, el vehículo de mi representado/a, ${data.vehiculoCliente}, circulaba por ${data.lugarSiniestro}.
        [AQUÍ REDACTA UN PÁRRAFO DETALLADO USANDO la "Descripción detallada de cómo ocurrió el siniestro". Es crucial que INTEGRES DE FORMA NATURAL la información del "Conductor al momento del hecho" en este relato. Por ejemplo: "En dichas circunstancias, siendo conducido por [Conductor al momento del hecho], el vehículo fue embestido..." o "Mi representado/a, quien conducía el vehículo, fue impactado..."]
        Descripción del impacto: El impacto se produjo en las siguientes partes del vehículo de mi cliente: ${data.partesDanadas}.
        Como consecuencia directa del referido evento, el vehículo de mi representado/a sufrió daños materiales cuya reparación constituye el objeto del presente reclamo.

        III. RESPONSABILIDAD
        La responsabilidad del siniestro recae exclusivamente en el conductor del vehículo de su asegurado/a, quien:
        - ${data.infracciones}
        - Incumplió el deber de prudencia y diligencia en la conducción.
        - Causó el daño por su conducta antirreglamentaria.

        IV. DAÑOS RECLAMADOS
        Se reclama el valor total de los daños materiales sufridos por el vehículo de mi mandante, que asciende a la suma de PESOS ${montoEnLetras.toUpperCase()} ($ ${montoEnNumeros}), según se detalla en el presupuesto que se acompaña.

        V. PRUEBA DOCUMENTAL
        Se acompaña la siguiente documentación: Cédula del vehículo, DNI, Licencia de conducir, Presupuesto de reparación y Fotografías de los daños.

        VI. PETITORIO
        Por todo lo expuesto, SOLICITO:
        1. Se tenga por presentado el presente reclamo.
        2. Se proceda al pago integral de los daños reclamados en un plazo de diez (10) días.
        3. Se mantenga comunicación fluida.

        Aguardando una pronta y favorable resolución, saludo a Uds. con distinguida consideración.
        ---
        **INSTRUCCIONES FINALES:** Tu única respuesta debe ser el texto de la carta completa, desde "Lugar y fecha..." hasta la línea de saludo final. No agregues la firma. No incluyas los datos del caso, ni el modelo, ni estas instrucciones.
    `;
    // --- FIN: PROMPT ACTUALIZADO ---

    const requestBody = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          "role": "user",
          "content": promptText
        }
      ]
    };

    const headers = {
      'Authorization': `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json'
    };
    
    const response = await axios.post(url, requestBody, { headers });
    
    const cartaSinFirma = response.data.choices[0].message.content.trim();
    const firma = `
____________________________________
Dra. Camila Florencia García
T° XII F° 383 C.A.Q. – T° 140 F° 85 C.P.A.C.F.
CUIT 27-38843361-8
Zapiola 662, Bernal – Quilmes
garciayasociadosjus@gmail.com`;

    return cartaSinFirma + firma;
}


app.post('/api/generar-carta', async (req, res) => {
    try {
        const cartaGenerada = await generarCartaConIA(req.body);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(cartaGenerada);
    } catch (error) {
        console.error("Error al generar la carta con IA:", error.response ? error.response.data : error);
        res.status(500).json({ error: 'Error interno del servidor al generar la carta.', detalle: error.response ? JSON.stringify(error.response.data.error) : "Error desconocido" });
    }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`✅✅✅ Servidor OpenAI (prompt corregido) escuchando...`);
});
