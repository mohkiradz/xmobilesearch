// sync.js
const sql = require('mssql/msnodesqlv8');
require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');

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
  ssl: true
};


function generateChecksum(row) {
  const values = [
    row.code,
    row.designation,
    row.psychothrope,
    row.reference,
    row.dci,
    Number(row.stock.toFixed(2)),
    Number(row.prixVente.toFixed(2)),
    Number(row.stockRef.toFixed(2)),
    Number(row.prixAchat.toFixed(2)),
    row.type
  ];
  
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(values));
  return hash.digest('hex');
}

async function syncData() {
  const startTime = Date.now(); // FIX: Add this line at function start
  let sqlPool, pgClient;
  let totalProcessed = 0;
  let totalUpdated = 0;
  const changedRows = [];
  const updatedProducts = new Set();

  try {
    // Connect to databases
    sqlPool = await sql.connect(sqlConfig);
    pgClient = new Client(pgConfig);
    await pgClient.connect();
    console.log('🔌 Connected to both databases');

    // 1. Ensure table structure with checksum column
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS products (
        code_produit         VARCHAR(255) PRIMARY KEY,
        designation_produit  TEXT,
        psychothrope         INTEGER,
        reference            VARCHAR(255),
        design_dci           TEXT,
        qte_stock            NUMERIC,
        prix_vente_ht        NUMERIC,
        qte_stock_ref        NUMERIC,
        prix_achat_ht        NUMERIC,
        design_type          VARCHAR(255),
        row_hash             VARCHAR(64)
      )`
    );

    // 2. Get existing hashes from Neon
    console.log('🔍 Fetching existing hashes...');
    const hashResult = await pgClient.query('SELECT code_produit, row_hash FROM products');
    const existingHashes = new Map(hashResult.rows.map(r => [r.code_produit, r.row_hash]));

    // 3. Fetch and process SQL Server data
    console.log('⏬ Downloading SQL Server data...');
    const result = await sqlPool.request().query(`
      SELECT [CODE_PRODUIT],
             [DESIGNATION_PRODUIT],
             [PSYCHOTHROPE],
             [REFERENCE],
             [DESIGN_DCI],
             [QTE_STOCK],
             [PRIX_VENTE_HT],
             [QTE_STOCK_REF],
             [PRIX_ACHAT_HT],
             [DESIGN_TYPE]
      FROM [dbo].[View_STK_PRODUITS]`);

    // 4. Identify changes locally
    console.log('🔎 Comparing local copies...');
    result.recordset.forEach(rawRow => {
      totalProcessed++;
      const row = {
        code: String(rawRow.CODE_PRODUIT || '').trim(),
        designation: String(rawRow.DESIGNATION_PRODUIT || '').trim(),
        psychothrope: Math.min(9, Math.max(0, parseInt(rawRow.PSYCHOTHROPE) || 0)),
        reference: String(rawRow.REFERENCE || '').trim(),
        dci: String(rawRow.DESIGN_DCI || '').trim(),
        stock: parseFloat(rawRow.QTE_STOCK) || 0,
        prixVente: parseFloat(rawRow.PRIX_VENTE_HT) || 0,
        stockRef: parseFloat(rawRow.QTE_STOCK_REF) || 0,
        prixAchat: parseFloat(rawRow.PRIX_ACHAT_HT) || 0,
        type: String(rawRow.DESIGN_TYPE || '').trim()
      };
      
      row.row_hash = generateChecksum(row);
      const existingHash = existingHashes.get(row.code);
      
      if (!existingHash || existingHash !== row.row_hash) {
        changedRows.push(row);
      }
    });

    // 5. Upload changes only
    console.log(`📦 Found ${changedRows.length} changes out of ${totalProcessed} rows`);
    
    if (changedRows.length > 0) {
      await pgClient.query('BEGIN');
      const batchSize = 100;
      
      for (let i = 0; i < changedRows.length; i += batchSize) {
        const batch = changedRows.slice(i, i + batchSize);
        const values = [];
        const placeholders = [];
        let paramCounter = 1;

        batch.forEach(row => {
          placeholders.push(`(
            $${paramCounter}, $${paramCounter + 1}, $${paramCounter + 2},
            $${paramCounter + 3}, $${paramCounter + 4}, $${paramCounter + 5},
            $${paramCounter + 6}, $${paramCounter + 7}, $${paramCounter + 8},
            $${paramCounter + 9}, $${paramCounter + 10}
          )`);
          paramCounter += 11;

          values.push(
            row.code,
            row.designation,
            row.psychothrope,
            row.reference,
            row.dci,
            row.stock,
            row.prixVente,
            row.stockRef,
            row.prixAchat,
            row.type,
            row.row_hash
          );
        });

        const query = `
          INSERT INTO products VALUES ${placeholders.join(', ')}
          ON CONFLICT (code_produit) DO UPDATE SET
            designation_produit = EXCLUDED.designation_produit,
            psychothrope = EXCLUDED.psychothrope,
            reference = EXCLUDED.reference,
            design_dci = EXCLUDED.design_dci,
            qte_stock = EXCLUDED.qte_stock,
            prix_vente_ht = EXCLUDED.prix_vente_ht,
            qte_stock_ref = EXCLUDED.qte_stock_ref,
            prix_achat_ht = EXCLUDED.prix_achat_ht,
            design_type = EXCLUDED.design_type,
            row_hash = EXCLUDED.row_hash
          WHERE products.row_hash IS DISTINCT FROM EXCLUDED.row_hash
          RETURNING code_produit;
        `;

        const result = await pgClient.query(query, values);
        result.rows.forEach(r => updatedProducts.add(r.code_produit));
        totalUpdated += result.rows.length;
        console.log(`⬆️  Uploaded batch ${Math.ceil((i + 1)/batchSize)}/${Math.ceil(changedRows.length/batchSize)}`);
      }

      await pgClient.query('COMMIT');
    }

    // Final report
    const duration = ((Date.now() - startTime)/1000).toFixed(2);
    console.log('\n═════════════════════ Sync Report ════════════════════');
    console.log(`📊 Total products processed: ${totalProcessed}`);
    console.log(`🔄 Changed products detected: ${changedRows.length}`);
    console.log(`✅ Successful updates: ${totalUpdated}`);
    
    if (updatedProducts.size > 0) {
      console.log(`\n📦 Updated product codes (${updatedProducts.size}):`);
      console.log(Array.from(updatedProducts).join(', '));
    }
    
    console.log(`\n⏱  Total duration: ${duration}s`);
    console.log('══════════════════════════════════════════════════════');

  } catch (err) {
    await pgClient?.query('ROLLBACK');
    console.error('\n❌ Sync failed:', err);
    process.exit(1);
  } finally {
    await sqlPool?.close();
    await pgClient?.end();
  }
}

syncData();