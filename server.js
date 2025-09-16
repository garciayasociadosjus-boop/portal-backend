const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Leemos la URL secreta de la variable de entorno
const driveFileUrl = process.env.DRIVE_FILE_URL;

app.use(cors());
app.use(express.json());

// Función para descargar y PARSEAR correctamente los datos
async function getClientDataFromUrl() {
    if (!driveFileUrl) {
        throw new Error('La URL del archivo de Drive no está configurada.');
    }
    try {
        // Hacemos la llamada para obtener el contenido
        const response = await axios.get(driveFileUrl);

        // --- ESTA ES LA CORRECCIÓN CLAVE ---
        // Nos aseguramos de que lo que recibimos, si es texto,
        // se convierta a una lista (Array) de JavaScript.
        let data = response.data;
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        // ------------------------------------

        return data;

    } catch (error) {
        console.error('Error al descargar o parsear el archivo:', error.message);
        throw new Error('No se pudo procesar el archivo de datos.');
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;

    try {
        const clientsData = await getClientDataFromUrl();

        // Verificamos que sea una lista antes de usar .find()
        if (!Array.isArray(clientsData)) {
             throw new Error('Los datos recibidos no son una lista de expedientes.');
        }

        const cliente = clientsData.find(c => String(c.dni).trim() === String(dniBuscado).trim());

        if (cliente) {
            res.json(cliente);
        } else {
            res.status(404).json({ error: 'Expediente no encontrado' });
        }
    } catch (error) {
        res.status(500).json({
            error: 'Error interno del servidor.',
            detalle: error.toString()
        });
    }
});

app.get('/', (req, res) => {
  res.send('¡Servidor funcionando con el método de enlace público v2!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
