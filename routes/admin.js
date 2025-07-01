// 📄 routes/admin.js
const express = require('express')
const router = express.Router()
const pool = require('../db')
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const nodemailer = require('nodemailer')

// ✅ Middleware para verificar admin
function verificarAdmin(req, res, next) {
  const { rol } = req.headers
  if (rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado: solo para administradores' })
  }
  next()
}

// ✅ Obtener todos los productos
router.get('/productos', verificarAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id DESC')
    res.json(result.rows)
  } catch (err) {
    console.error('Error al obtener productos:', err)
    res.status(500).json({ error: 'Error al obtener productos' })
  }
})

// ✅ Agregar nuevo producto
router.post('/productos', verificarAdmin, async (req, res) => {
  const { nombre, descripcion, precio, imagen, temporada_flor, origen, pais } = req.body

  if (!nombre || !precio || !temporada_flor || !origen || !pais) {
    return res.status(400).json({ error: 'Faltan datos requeridos' })
  }

  try {
    const result = await pool.query(
      `INSERT INTO productos (nombre, descripcion, precio, imagen, temporada_flor, origen, pais)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [nombre, descripcion, precio, imagen, temporada_flor, origen, pais]
    )
    res.status(201).json({ id: result.rows[0].id })
  } catch (error) {
    console.error('Error al agregar producto:', error)
    res.status(500).json({ error: 'Error al guardar el producto' })
  }
})

// ✅ Editar producto por ID
router.put('/productos/:id', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id)
  const { nombre, descripcion, precio, imagen, temporada_flor, origen, pais } = req.body

  if (!nombre || !precio || !temporada_flor || !origen || !pais) {
    return res.status(400).json({ error: 'Faltan datos requeridos' })
  }

  try {
    const result = await pool.query(`
      UPDATE productos
      SET nombre = $1,
          descripcion = $2,
          precio = $3,
          imagen = $4,
          temporada_flor = $5,
          origen = $6,
          pais = $7
      WHERE id = $8
      RETURNING *`,
      [nombre, descripcion, precio, imagen, temporada_flor, origen, pais, id]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' })
    }

    res.json({ success: true, producto: result.rows[0] })
  } catch (err) {
    console.error('Error al actualizar producto:', err)
    res.status(500).json({ error: 'Error al actualizar producto' })
  }
})

// ✅ Eliminar producto por ID
router.delete('/productos/:id', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id)
  try {
    const result = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING *', [id])
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' })
    }
    res.json({ success: true })
  } catch (err) {
    console.error('Error al eliminar producto:', err)
    res.status(500).json({ error: 'Error al eliminar producto' })
  }
})

// ✅ Obtener órdenes pendientes
router.get('/ordenes', verificarAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.id, o.fecha, o.total,
             u.nombre || ' ' || u.apellido AS cliente,
             json_agg(json_build_object(
               'producto', od.nombre,
               'cantidad', od.cantidad,
               'precio', od.precio
             )) AS productos
      FROM ordenes o
      JOIN usuarios u ON o.usuario_id = u.id
      JOIN orden_detalle od ON od.orden_id = o.id
      GROUP BY o.id, u.nombre, u.apellido, o.fecha, o.total
      ORDER BY o.fecha DESC
    `)
    res.json(result.rows)
  } catch (error) {
    console.error('Error al obtener pedidos:', error)
    res.status(500).json({ error: 'Error al obtener pedidos' })
  }
})

// ✅ Mover pedido a entregados
router.post('/ordenes/entregar/:id', verificarAdmin, async (req, res) => {
  const ordenId = parseInt(req.params.id)

  try {
    // 1. Traer los datos de la orden
    const result = await pool.query(`
      SELECT o.id, o.usuario_id, o.fecha, o.total,
             u.nombre || ' ' || u.apellido AS cliente,
             u.correo,
             json_agg(json_build_object('producto', od.nombre, 'cantidad', od.cantidad, 'precio', od.precio)) AS productos
      FROM ordenes o
      JOIN usuarios u ON o.usuario_id = u.id
      JOIN orden_detalle od ON od.orden_id = o.id
      WHERE o.id = $1
      GROUP BY o.id, u.nombre, u.apellido, u.correo, o.fecha, o.total
    `, [ordenId])

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const orden = result.rows[0]

    // 2. Guardar en tabla pedidos_entregados
    await pool.query(`
      INSERT INTO pedidos_entregados (orden_id, usuario_id, cliente, fecha, total, productos)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      orden.id,
      orden.usuario_id,
      orden.cliente,
      orden.fecha,
      orden.total,
      JSON.stringify(orden.productos)
    ])

    await pool.query('DELETE FROM orden_detalle WHERE orden_id = $1', [ordenId])
    await pool.query('DELETE FROM ordenes WHERE id = $1', [ordenId])

    // 3. Generar PDF temporal
    const pdfPath = path.join(__dirname, `../temp/Comprobante-${orden.id}.pdf`)
    const doc = new PDFDocument()
    doc.pipe(fs.createWriteStream(pdfPath))

    doc.fontSize(18).text('Comprobante de Compra', { align: 'center' })
    doc.moveDown()
    doc.fontSize(12).text(`Pedido: #${orden.id}`)
    doc.text(`Cliente: ${orden.cliente}`)
    doc.text(`Fecha: ${new Date(orden.fecha).toLocaleString()}`)
    doc.moveDown()
    doc.text('Productos:')
    orden.productos.forEach(p => {
      doc.text(`- ${p.producto} x${p.cantidad} – $${p.precio.toFixed(2)}`)
    })
    doc.moveDown()
    doc.text(`Total: $${orden.total.toFixed(2)}`, { align: 'right' })
    doc.end()

    // 4. Esperar a que se termine de escribir el PDF y luego enviar por correo
    doc.on('finish', async () => {
      // Configuración de Nodemailer
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        }
      })

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: orden.correo,
        subject: `Comprobante de Pedido #${orden.id}`,
        text: `Hola ${orden.cliente}, gracias por tu compra. Adjuntamos tu comprobante en PDF.`,
        attachments: [
          {
            filename: `Comprobante-${orden.id}.pdf`,
            path: pdfPath
          }
        ]
      }

      try {
        await transporter.sendMail(mailOptions)
        fs.unlinkSync(pdfPath)  // eliminar el archivo temporal
        res.json({ success: true, mensaje: 'Pedido entregado y correo enviado.' })
      } catch (error) {
        console.error('Error al enviar el correo:', error)
        res.status(500).json({ error: 'Pedido entregado, pero falló el envío de correo.' })
      }
    })

  } catch (err) {
    console.error('Error al entregar pedido:', err)
    res.status(500).json({ error: 'Error al entregar pedido' })
  }
})

// ✅ Obtener pedidos entregados
router.get('/ordenes/entregadas', verificarAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pedidos_entregados ORDER BY fecha DESC')
    res.json(result.rows)
  } catch (err) {
    console.error('Error al obtener entregados:', err)
    res.status(500).json({ error: 'Error al obtener entregados' })
  }
})

// ✅ Eliminar pedido entregado
router.delete('/ordenes/entregadas/:id', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id)
  try {
    await pool.query('DELETE FROM pedidos_entregados WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('Error al eliminar entrega:', err)
    res.status(500).json({ error: 'Error al eliminar entrega' })
  }
})

router.get('/comprobante/:id', async (req, res) => {
  const ordenId = parseInt(req.params.id)

  try {
    const result = await pool.query(`
      SELECT o.id, o.usuario_id, o.fecha, o.total,
             u.nombre || ' ' || u.apellido AS cliente,
             json_agg(json_build_object('producto', od.nombre, 'cantidad', od.cantidad, 'precio', od.precio)) AS productos
      FROM pedidos_entregados o
      JOIN usuarios u ON o.usuario_id = u.id
      JOIN json_to_recordset(o.productos) AS od(nombre text, cantidad int, precio numeric)
      WHERE o.id = $1
      GROUP BY o.id, u.nombre, u.apellido, o.fecha, o.total
    `, [ordenId])

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Comprobante no encontrado' })
    }

    const orden = result.rows[0]

    const PDFDocument = require('pdfkit')
    const doc = new PDFDocument()

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Comprobante-${orden.id}.pdf"`)

    doc.pipe(res)

    doc.fontSize(18).text('Comprobante de Compra', { align: 'center' })
    doc.moveDown()
    doc.fontSize(12).text(`Pedido: #${orden.id}`)
    doc.text(`Cliente: ${orden.cliente}`)
    doc.text(`Fecha: ${new Date(orden.fecha).toLocaleString()}`)
    doc.moveDown()
    doc.text('Productos:')
    orden.productos.forEach(p => {
      doc.text(`- ${p.producto} x${p.cantidad} – $${p.precio.toFixed(2)}`)
    })
    doc.moveDown()
    doc.text(`Total: $${orden.total.toFixed(2)}`, { align: 'right' })

    doc.end()

  } catch (err) {
    console.error('Error al generar comprobante:', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/ordenes/exportar-pdf', verificarAdmin, async (req, res) => {
  try {
    const { desde, hasta, email } = req.query

    let query = 'SELECT * FROM pedidos_entregados'
    const params = []

    if (desde && hasta) {
      query += ' WHERE fecha BETWEEN $1 AND $2'
      params.push(desde, hasta)
    }

    query += ' ORDER BY fecha DESC'

    const result = await pool.query(query, params)
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay pedidos en ese rango' })
    }

    const filename = `Resumen_Pedidos_${Date.now()}.pdf`
    const filePath = path.join(__dirname, '../exports', filename)

    const doc = new PDFDocument()
    const writeStream = fs.createWriteStream(filePath)
    doc.pipe(writeStream)

    doc.fontSize(18).text('Resumen de Pedidos Entregados', { align: 'center' })
    doc.moveDown()

    result.rows.forEach(pedido => {
      doc
        .fontSize(12)
        .text(`Orden ID: ${pedido.orden_id}`)
        .text(`Cliente: ${pedido.cliente}`)
        .text(`Fecha: ${new Date(pedido.fecha).toLocaleString()}`)
        .text(`Total: $${pedido.total.toFixed(2)}`)

      const productos = JSON.parse(pedido.productos)
      productos.forEach(p => {
        doc.text(` - ${p.producto} x${p.cantidad} – $${p.precio.toFixed(2)}`)
      })

      doc.moveDown()
    })

    doc.end()

    writeStream.on('finish', async () => {
      console.log('PDF guardado en:', filePath)

      if (!email) {
        return res.status(200).json({ success: true, message: 'PDF generado y guardado', file: filename })
      }

      // 📧 Configura el transportador
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      })

      // 📤 Enviar correo con adjunto
      await transporter.sendMail({
        from: `"Floristería" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Resumen de pedidos entregados',
        text: 'Adjunto encontrarás el resumen de pedidos entregados en PDF.',
        attachments: [
          {
            filename,
            path: filePath
          }
        ]
      })

      res.status(200).json({ success: true, message: 'PDF enviado por correo y guardado', file: filename })
    })

  } catch (error) {
    console.error('Error al exportar PDF:', error)
    res.status(500).json({ error: 'Error al generar o enviar PDF' })
  }
})
module.exports = router
