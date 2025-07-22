const express = require('express');
const { Pool } = require('pg');
const { spawn } = require('child_process');
const http = require('http');
require('dotenv').config();

const app = express();
const port = 3000;
const server = http.createServer(app);

// PostgreSQL config
const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: 5432,
  ssl: {
    rejectUnauthorized: true
  }
});

// Middleware
app.use(express.static('public'));
app.use(express.json());



// Search endpoint (unchanged)
app.post('/search', async (req, res) => {
  try {
    const { searchTerm, showZero, sortBy } = req.body;

    if (!searchTerm) return res.json([]);

    let query = `
      SELECT 
        p.code_produit,
        p.designation_produit,
        p.design_dci AS dci,
        p.qte_stock,
        p.prix_vente_ht,
        p.qte_stock_ref,
        p.design_type,
        p.psychothrope,
        p.prix_achat_ht,
         p.reference,    
        COALESCE(SUM(l.quantite), 0) AS total_lots,
        COALESCE(s.net_sales, 0) AS total_sold,
        (
          SELECT JSON_AGG(
          json_build_object(
  'id_stock', l.id_stock,
  'lot', l.lot,
  'date_peremption', l.date_peremption,
  'is_blocked', l.is_blocked,
  'cout_achat', l.cout_achat,
  'quantite', l.quantite
) ORDER BY l.id_stock DESC
          )
          FROM stock l
          WHERE l.code_produit = p.code_produit
          ${!showZero ? 'AND l.quantite > 0' : ''}
        ) AS lots,
        (
          SELECT MIN(l2.date_peremption)
          FROM stock l2
          WHERE l2.code_produit = p.code_produit
          AND l2.date_peremption > CURRENT_DATE
          ${!showZero ? 'AND l2.quantite > 0' : ''}
        ) AS nearest_expiration
      FROM Products p
      LEFT JOIN stock l ON p.code_produit = l.code_produit
      LEFT JOIN sales s ON p.code_produit = s.code_produit
      WHERE (p.code_produit ILIKE $1 OR p.designation_produit ILIKE $1)
    `;

    const params = [`%${searchTerm}%`];

    if (!showZero) query += ` AND p.qte_stock > 0`;

    query += ` GROUP BY p.code_produit,  p.reference,  p.prix_achat_ht, p.qte_stock_ref, p.designation_produit, p.design_dci, p.qte_stock, p.prix_vente_ht, p.design_type, p.psychothrope, s.net_sales `;

    const sortOptions = {
      'designation_asc': 'p.designation_produit ASC',
      'designation_desc': 'p.designation_produit DESC',
      'quantity_asc': 'p.qte_stock ASC',
      'quantity_desc': 'p.qte_stock DESC',
      'sales_asc': 'total_sold ASC',
      'sales_desc': 'total_sold DESC'
    };

    query += ` ORDER BY ${sortOptions[sortBy] || 'p.designation_produit ASC'}`;

    const { rows } = await pool.query(query, params);

    const processedRows = rows.map(row => ({
      ...row,
      lots: row.lots || [],
      nearest_expiration: row.nearest_expiration || null
    }));

    res.json(processedRows);

  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
});

// Add this endpoint before server.listen(...)
app.post('/search-by-ref', async (req, res) => {
  try {
    const { ref } = req.body;
    if (!ref) return res.json([]);

   let query = `
  SELECT 
    p.code_produit,
    p.designation_produit,
    p.qte_stock,
    p.reference
  FROM Products p
  WHERE p.reference = $1
  ORDER BY p.qte_stock DESC
`;
const params = [ref];
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Search by ref error:', err);
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
