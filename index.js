const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express() // 👈 Primero creamos la instancia de Express

const PORT = process.env.PORT

// Middlewares
// Reemplaza con tu dominio real de Netlify al final
app.use(cors({
  origin: ['https://tu-sitio.netlify.app'],
  credentials: true
}))
app.use(express.json())

// Rutas
const userRoutes = require('./routes/users')
app.use('/api/users', userRoutes)
const ordenRoutes = require('./routes/ordenes')
app.use('/api/ordenes', ordenRoutes)
const adminRoutes = require('./routes/admin')
app.use('/api/admin', adminRoutes)
const productosRoutes = require('./routes/productos')
app.use('/api/productos', productosRoutes)
app.get('/', (req, res) => {
  res.send('API de la Florería funcionando ✅')
})
// Manejo de errores
app.use((err, req, res, next) => {
  console.error('❌ Error en el servidor:', err)
  res.status(500).json({ error: 'Error interno del servidor' })
})


// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`)
})

