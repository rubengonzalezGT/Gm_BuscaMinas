import express from 'express';
import cors from 'cors';
import rutaIA from './rutas/ia.ruta';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Servidor de IA Buscaminas funcionando');
});

app.use('/ia', rutaIA);

app.listen(3000, () => {
  console.log('Servidor corriendo en puerto 3000');
});