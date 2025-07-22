// sync_sales.js
const sql = require('mssql/msnodesqlv8');
require('dotenv').config();
const { Client } = require('pg');

// SQL Server Configuration
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  driver: 'tedious',
};

// Neon PostgreSQL Configuration
const pgConfig = {
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: 5432,
  ssl: true,
};

async function syncSalesData() {
  const startTime = Date.now();
  let sqlPool, pgClient;

  try {
    // Connect to SQL Server
    sqlPool = await sql.connect(sqlConfig);
    console.log('Connected to SQL Server');

    // Fetch summarized sales data
    console.log('Fetching summarized sales data from SQL Server...');
    const result = await sqlPool.request().query(`
      SELECT 
        p.CODE_PRODUIT,
        p.DESIGNATION_PRODUIT,
        SUM(CASE WHEN [TYPE_VENTE] != 'RC' THEN [QUANTITE] ELSE 0 END) - 
        SUM(CASE WHEN [TYPE_VENTE] = 'VI' THEN [QUANTITE] ELSE 0 END) AS net_sales
      FROM 
        View_VTE_VENTE_DETAIL p
      JOIN 
        View_STK_PRODUITS s ON p.CODE_PRODUIT = s.CODE_PRODUIT
      WHERE 
        DATEDIFF(day, [CREATED_ON], GETDATE()) BETWEEN 0 AND 90
      GROUP BY 
        p.CODE_PRODUIT, p.DESIGNATION_PRODUIT
    `);

    // Connect to Neon PostgreSQL
    pgClient = new Client(pgConfig);
    await pgClient.connect();
    console.log('Connected to Neon PostgreSQL');

    // Create sales table
    console.log('Creating sales table...');
    await pgClient.query('DROP TABLE IF EXISTS sales');
    await pgClient.query(`
      CREATE TABLE sales (
        code_produit        VARCHAR(255),
        designation_produit TEXT,
        net_sales           NUMERIC
      )
    `);

    // Process data
    console.log('Processing product sales summaries...');
    const rows = result.recordset.map(row => ({
      code_produit: String(row.CODE_PRODUIT || '').trim(),
      designation_produit: String(row.DESIGNATION_PRODUIT || '').trim(),
      net_sales: parseFloat(row.net_sales) || 0
    }));

    // Batch insert
    const batchSize = 100;
    let inserted = 0;

    while (inserted < rows.length) {
      const batch = rows.slice(inserted, inserted + batchSize);
      const values = [];
      const placeholders = [];

      batch.forEach((row, index) => {
        placeholders.push(`($${1 + (index * 3)}, $${2 + (index * 3)}, $${3 + (index * 3)})`);
        values.push(row.code_produit, row.designation_produit, row.net_sales);
      });

      await pgClient.query(
        `INSERT INTO sales (code_produit, designation_produit, net_sales) VALUES ${placeholders.join(',')}`,
        values
      );

      inserted += batch.length;
      console.log(`Inserted ${inserted}/${rows.length} product sales summaries`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Sales summary sync completed in ${duration} seconds`);
    process.exit(0);

  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`Sales sync failed after ${duration} seconds:`, err);
    process.exit(1);
  } finally {
    if (sql.connected) await sql.close();
    if (pgClient) await pgClient.end();
  }
}

syncSalesData();
