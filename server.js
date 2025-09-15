const express = require('express');
const cors = require('cors');
const fs = require('fs').promises; // Usamos la librería 'fs' para leer archivos

const app = express();
const PORT = process.env.PORT || 3001;
const CREDENTIALS_PATH = '/etc/secrets/google-credentials.json';

app.use(cors());

// Ruta de prueba normal
app.get('/', (req, res) => {
  res.send('Servidor de diagnóstico funcionando.');
});

// Ruta SECRETA para diagnosticar el archivo de credenciales
app.get('/debug-secrets', async (req, res) => {
    try {
        // Intentamos leer el archivo que subimos a Render
        const fileContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
        // Si lo leemos, lo mostramos en pantalla
        res.setHeader('Content-Type', 'text/plain');
        res.send(`Contenido encontrado en el archivo secreto:\n\n${fileContent}`);
    } catch (error) {
        // Si hay un error al leerlo, mostramos el error
        res.status(500).send(`Error al intentar leer el archivo secreto: ${error.toString()}`);
    }
});

app.listen(PORT, () => {
  console.log(`Servidor de diagnóstico escuchando en el puerto ${PORT}`);
});
