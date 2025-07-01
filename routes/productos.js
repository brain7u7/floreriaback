const express = require('express')
const router = express.Router()
const pool = require('../db')

// Ruta principal con filtros múltiples
router.get('/', async (req, res) => {
  try {
    let { temporada_flor, origen } = req.query
    
// ✅ Agregar nuevo producto tipo_cerveza

    // Asegurarse de que temporada_flor y origen sean arrays
    temporada_flor = Array.isArray(temporada_flor) ? temporada_flor : temporada_flor ? [temporada_flor] : []
    origen = Array.isArray(origen) ? origen : origen ? [origen] : []

    let query = 'SELECT * FROM productos WHERE 1=1'
    const params = []

    if (temporada_flor.length) {
      const placeholders = temporada_flor.map((_, i) => `$${params.length + i + 1}`).join(',')
      query += ` AND temporada_flor IN (${placeholders})`
      params.push(...temporada_flor)
    }

    if (origen.length) {
      const placeholders = origen.map((_, i) => `$${params.length + i + 1}`).join(',')
      query += ` AND origen IN (${placeholders})`
      params.push(...origen)
    }

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    console.error('Error al obtener productos filtrados:', error)
    res.status(500).json({ error: 'Error al obtener productos' })
  }
})

// 🔍 NUEVA RUTA: Búsqueda por nombre, tipo, origen o país
router.get('/buscar', async (req, res) => {
  const { q } = req.query

  if (!q) {
    return res.status(400).json({ error: 'Falta parámetro de búsqueda' })
  }

  try {
    const result = await pool.query(
      `SELECT * FROM productos 
       WHERE LOWER(nombre) LIKE $1 
          OR LOWER(temporada_flor) LIKE $1 
          OR LOWER(origen) LIKE $1 
          OR LOWER(pais) LIKE $1`,
      [`%${q.toLowerCase()}%`]
    )

    res.json(result.rows)
  } catch (err) {
    console.error('Error al buscar productos:', err)
    res.status(500).json({ error: 'Error al buscar productos' })
  }
})

// Obtener producto por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const result = await pool.query('SELECT * FROM productos WHERE id = $1', [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error al obtener producto por ID:', error)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

module.exports = router

