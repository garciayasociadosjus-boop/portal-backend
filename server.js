const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Habilita CORS para que tu web se pueda conectar
app.use(express.json()); // Permite al servidor entender peticiones con JSON

// Ruta de prueba para verificar que el servidor está vivo
app.get('/', (req, res) => {
  res.send('¡El servidor del portal de clientes está funcionando correctamente!');
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
