const express = require('express')
const router = express.Router()
const pool = require('../db')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer') 


// ✅ REGISTRO DE USUARIO
router.post('/register', async (req, res) => {
  const { nombre, apellido, fecha_nacimiento, email, password } = req.body

  try {
    const existe = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email])
    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado' })
    }

    const hash = await bcrypt.hash(password, 10)

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, apellido, fecha_nacimiento, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, email, rol`,
      [nombre, apellido, fecha_nacimiento, email, hash, 'cliente']
    )

    // 📧 ENVÍO DE CORREO DE BIENVENIDA
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })

    await transporter.sendMail({
      from: `"Floristería" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '¡Bienvenido a nuestra florería!',
      text: `Hola ${nombre}, gracias por registrarte. ¡Esperamos que disfrutes tu experiencia comprando flores! 🌸💐`
    })

    res.status(201).json({ success: true, user: result.rows[0] })
  } catch (error) {
    console.error('Error al registrar usuario:', error)
    res.status(500).json({ error: 'Error del servidor al registrar' })
  }
})

// ✅ INICIO DE SESIÓN
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan datos' })
  }

  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email])

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Correo no registrado' })
    }

    const usuario = result.rows[0]
    const passwordOk = await bcrypt.compare(password, usuario.password_hash)

    if (!passwordOk) {
      return res.status(401).json({ error: 'Contraseña incorrecta' })
    }

    res.json({
      success: true,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        afiliado: usuario.afiliado || false,
        codigo_afiliado: usuario.codigo_afiliado || null
      }
    })
  } catch (err) {
    console.error('Error en login:', err)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

// ✅ AFILIAR USUARIO
router.post('/afiliar', async (req, res) => {
  const { id } = req.body

  if (!id) {
    return res.status(400).json({ error: 'Falta el ID del usuario' })
  }

  try {
    // Verificar si ya es afiliado
    const check = await pool.query('SELECT afiliado FROM usuarios WHERE id = $1', [id])
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    if (check.rows[0].afiliado) {
      return res.status(400).json({ error: 'El usuario ya está afiliado' })
    }

    const codigo = `AFI-${id}-${Date.now()}`

    const result = await pool.query(
      `UPDATE usuarios
       SET afiliado = true,
           codigo_afiliado = $1
       WHERE id = $2
       RETURNING id, nombre, email, rol, afiliado, codigo_afiliado`,
      [codigo, id]
    )

    res.json({ success: true, usuario: result.rows[0] })
  } catch (err) {
    console.error('Error al afiliar usuario:', err)
    res.status(500).json({ error: 'Error del servidor al afiliar' })
  }
})

// ✅ Obtener ganancias del afiliado
router.get('/referidos/:id', async (req, res) => {
  const afiliadoId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT r.producto_id, p.nombre, r.monto, r.fecha
       FROM referidos r
       JOIN productos p ON r.producto_id = p.id
       WHERE r.afiliado_id = $1
       ORDER BY r.fecha DESC`,
      [afiliadoId]
    );

    const total = result.rows.reduce((sum, row) => sum + parseFloat(row.monto), 0);

    res.json({
      totalGanado: total.toFixed(2),
      historial: result.rows
    });
  } catch (err) {
    console.error('Error al obtener ganancias del afiliado:', err);
    res.status(500).json({ error: 'Error al obtener datos del afiliado' });
  }
});

// ✅ Realizar retiro de ganancias
router.post('/retirar', async (req, res) => {
  const { afiliado_id, clabe } = req.body

  if (!afiliado_id || !clabe || clabe.length !== 18) {
    return res.status(400).json({ error: 'Datos inválidos' })
  }

  try {
    // Calcular el total de ganancias actuales
    const result = await pool.query(
      'SELECT SUM(monto) AS total FROM referidos WHERE afiliado_id = $1',
      [afiliado_id]
    )

    const total = parseFloat(result.rows[0].total || 0)
    if (total === 0) return res.status(400).json({ error: 'No hay ganancias para retirar' })

    // Guardar en historial de retiros
    await pool.query(
      `INSERT INTO retiros (afiliado_id, monto, clabe, fecha)
       VALUES ($1, $2, $3, NOW())`,
      [afiliado_id, total, clabe]
    )

    // Eliminar los registros actuales de referidos
    await pool.query(
      'DELETE FROM referidos WHERE afiliado_id = $1',
      [afiliado_id]
    )

    res.json({ success: true, monto: total })
  } catch (err) {
    console.error('Error al procesar el retiro:', err)
    res.status(500).json({ error: 'Error al procesar el retiro' })
  }
})

// ✅ Obtener historial de retiros
router.get('/retiros/:id', async (req, res) => {
  const afiliado_id = req.params.id

  try {
    const result = await pool.query(
      `SELECT monto, clabe, fecha
       FROM retiros
       WHERE afiliado_id = $1
       ORDER BY fecha DESC`,
      [afiliado_id]
    )

    res.json({ retiros: result.rows })
  } catch (error) {
    console.error('Error al obtener historial de retiros:', error)
    res.status(500).json({ error: 'No se pudo obtener el historial de movimientos' })
  }
})

module.exports = router
