const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Leemos la URL secreta de la variable de entorno
const driveFileUrl = process.env.DRIVE_FILE_URL;

app.use(cors());
app.use(express.json());

// Función para descargar los datos desde la URL pública
async function getClientDataFromUrl() {
    if (!driveFileUrl) {
        throw new Error('La URL del archivo de Drive no está configurada.');
    }
    try {
        const response = await axios.get(driveFileUrl);
        return response.data; // Axios ya parsea el JSON automáticamente
    } catch (error) {
        console.error('Error al descargar el archivo desde la URL:', error.message);
        throw new Error('No se pudo descargar el archivo de datos.');
    }
}

app.get('/api/expediente/:dni', async (req, res) => {
    const dniBuscado = req.params.dni;

    try {
        const clientsData = await getClientDataFromUrl();
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
  res.send('¡Servidor funcionando con el método de enlace público!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
