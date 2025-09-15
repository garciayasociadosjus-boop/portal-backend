const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// La única ruta que existe
app.get('/', (req, res) => {
  res.send('¡Hola! Soy la versión de prueba súper simple. ¡Estoy funcionando!');
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor de prueba escuchando en el puerto ${PORT}`);
});
