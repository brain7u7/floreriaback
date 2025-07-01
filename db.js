// ==============================
// 📦 CONEXIÓN A POSTGRESQL
// ==============================

// Importamos el módulo 'Pool' desde 'pg' (postgres)
// Esto permite manejar un grupo de conexiones a la base de datos (mejor rendimiento)
const { Pool } = require('pg');

// Importamos dotenv para leer las variables de entorno desde el archivo .env
require('dotenv').config();

// Creamos una nueva instancia de Pool con los parámetros obtenidos desde .env
const pool = new Pool({
  host: process.env.DB_HOST,         // Dirección del servidor de la base de datos
  port: process.env.DB_PORT,         // Puerto usado por PostgreSQL (5432 por defecto)
  user: process.env.DB_USER,         // Usuario con permisos en la base
  password: process.env.DB_PASSWORD, // Contraseña del usuario
  database: process.env.DB_NAME      // Nombre de la base de datos a la que queremos conectar
});

// Intentamos realizar una conexión inicial para verificar si todo está bien
pool.connect()
  .then(() => console.log('✅ Conexión a PostgreSQL exitosa')) // Si todo va bien, muestra mensaje verde
  .catch(err => console.error('❌ Error en la conexión a PostgreSQL:', err)); // Si hay error, lo imprime

// Exportamos el pool para que pueda usarse en otros módulos como controladores o rutas
module.exports = pool;
