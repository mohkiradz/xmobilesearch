// sync-all.js
const sql = require('mssql/msnodesqlv8');
require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');

// Shared Configuration
const dbConfig = {
  sql: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    driver: 'tedious'
  },
  pg: {
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    port: 5432,
    ssl: true
  }
};

// Shared Utilities
function generateChecksum(values) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(values));
  return hash.digest('hex');
}

// Stock Sync Implementation
async function syncStock() {
  const startTime = Date.now();
  let sqlPool, pgClient;
  let totalProcessed = 0;
  let totalUpdated = 0;
  const changedRows = [];
  const updatedItems = new Set();

  try {
    console.log('\n=== Starting Stock Sync ===');
    
    // Connect to databases
    sqlPool = await sql.connect(dbConfig.sql);
    pgClient = new Client(dbConfig.pg);
    await pgClient.connect();

    // 1. Get existing hashes from Neon
    const hashResult = await pgClient.query('SELECT id_stock, row_hash FROM stock');
    const existingHashes = new Map(hashResult.rows.map(r => [r.id_stock, r.row_hash]));

    // 2. Fetch SQL Server data
    const result = await sqlPool.request().query(`
      SELECT [ID_STOCK], [CODE_PRODUIT], [LOT], [DATE_PEREMPTION], [IS_BLOCKED],
             [QUANTITE], [COUT_ACHAT], [VAL_STK], [SHP], [PPA],
             [PRIX_VENTE], [CODE_BARRE_LOT], [FACT_BL_LOT], [MT_TVA_ACHAT],
             [PRIX_FOURNISSEUR], [ACTIF], [NOM_FOURNISSEUR]
      FROM [XPERTPHARM5_1867_ELOMARI].[dbo].[View_STK_STOCK_LISTE]`);

    // 3. Process and compare data
    result.recordset.forEach(rawRow => {
      totalProcessed++;
      const processedRow = {
        id_stock: String(rawRow.ID_STOCK).trim(),
        code_produit: String(rawRow.CODE_PRODUIT).trim(),
        lot: String(rawRow.LOT).trim(),
        date_peremption: rawRow.DATE_PEREMPTION ? new Date(rawRow.DATE_PEREMPTION) : null,
        is_blocked: Boolean(rawRow.IS_BLOCKED),
        quantite: parseFloat(rawRow.QUANTITE) || 0,
        cout_achat: parseFloat(rawRow.COUT_ACHAT) || 0,
        val_stk: parseFloat(rawRow.VAL_STK) || 0,
        shp: parseFloat(rawRow.SHP) || 0,
        ppa: parseFloat(rawRow.PPA) || 0,
        prix_vente: parseFloat(rawRow.PRIX_VENTE) || 0,
        code_barre_lot: String(rawRow.CODE_BARRE_LOT).trim(),
        fact_bl_lot: String(rawRow.FACT_BL_LOT).trim(),
        mt_tva_achat: parseFloat(rawRow.MT_TVA_ACHAT) || 0,
        prix_fournisseur: parseFloat(rawRow.PRIX_FOURNISSEUR) || 0,
        actif: Boolean(rawRow.ACTIF),
        nom_fournisseur: String(rawRow.NOM_FOURNISSEUR).trim()
      };
      
      // Generate checksum
      const checksumValues = [
        processedRow.id_stock,
        processedRow.code_produit,
        processedRow.lot,
        processedRow.date_peremption?.toISOString(),
        processedRow.is_blocked,
        Number(processedRow.quantite.toFixed(2)),
        // ... include all other fields ...
      ];
      processedRow.row_hash = generateChecksum(checksumValues);

      if (!existingHashes.has(processedRow.id_stock) || existingHashes.get(processedRow.id_stock) !== processedRow.row_hash) {
        changedRows.push(processedRow);
      }
    });

    // 4. Upload changes
    if (changedRows.length > 0) {
      await pgClient.query('BEGIN');
      const batchSize = 100;
      
      for (let i = 0; i < changedRows.length; i += batchSize) {
        const batch = changedRows.slice(i, i + batchSize);
        // ... [Insert batch upload logic from previous stock implementation] ...
      }
      
      await pgClient.query('COMMIT');
    }

    console.log(`\n✅ Stock Sync Complete: ${totalProcessed} processed, ${changedRows.length} updates`);
    
  } catch (err) {
    await pgClient?.query('ROLLBACK');
    console.error('❌ Stock Sync Failed:', err);
  } finally {
    await sqlPool?.close();
    await pgClient?.end();
    console.log(`⏱  Stock Sync Duration: ${((Date.now() - startTime)/1000).toFixed(2)}s`);
  }
}

// Products Sync Implementation
async function syncProducts() {
  const startTime = Date.now();
  let sqlPool, pgClient;
  let totalProcessed = 0;
  let totalUpdated = 0;
  const changedRows = [];
  const updatedProducts = new Set();

  try {
    console.log('\n=== Starting Products Sync ===');
    
    // Connect to databases
    sqlPool = await sql.connect(dbConfig.sql);
    pgClient = new Client(dbConfig.pg);
    await pgClient.connect();

    // 1. Get existing hashes
    const hashResult = await pgClient.query('SELECT code_produit, row_hash FROM products');
    const existingHashes = new Map(hashResult.rows.map(r => [r.code_produit, r.row_hash]));

    // 2. Fetch SQL Server data
    const result = await sqlPool.request().query(`
      SELECT [CODE_PRODUIT], [DESIGNATION_PRODUIT], [PSYCHOTHROPE], [REFERENCE],
             [DESIGN_DCI], [QTE_STOCK], [PRIX_VENTE_HT], [QTE_STOCK_REF],
             [PRIX_ACHAT_HT], [DESIGN_TYPE]
      FROM [dbo].[View_STK_PRODUITS]`);

    // 3. Process and compare data
    result.recordset.forEach(rawRow => {
      totalProcessed++;
      const processedRow = {
        code_produit: String(rawRow.CODE_PRODUIT || '').trim(),
        designation: String(rawRow.DESIGNATION_PRODUIT || '').trim(),
        psychothrope: Math.min(9, Math.max(0, parseInt(rawRow.PSYCHOTHROPE) || 0)),
        reference: String(rawRow.REFERENCE || '').trim(),
        dci: String(rawRow.DESIGN_DCI || '').trim(),
        stock: parseFloat(rawRow.QTE_STOCK) || 0,
        prix_vente: parseFloat(rawRow.PRIX_VENTE_HT) || 0,
        stock_ref: parseFloat(rawRow.QTE_STOCK_REF) || 0,
        prix_achat: parseFloat(rawRow.PRIX_ACHAT_HT) || 0,
        type: String(rawRow.DESIGN_TYPE || '').trim()
      };
      
      // Generate checksum
      const checksumValues = [
        processedRow.code_produit,
        processedRow.designation,
        processedRow.psychothrope,
        processedRow.reference,
        processedRow.dci,
        Number(processedRow.stock.toFixed(2)),
        Number(processedRow.prix_vente.toFixed(2)),
        Number(processedRow.stock_ref.toFixed(2)),
        Number(processedRow.prix_achat.toFixed(2)),
        processedRow.type
      ];
      processedRow.row_hash = generateChecksum(checksumValues);

      if (!existingHashes.has(processedRow.code_produit) || existingHashes.get(processedRow.code_produit) !== processedRow.row_hash) {
        changedRows.push(processedRow);
      }
    });

    // 4. Upload changes
    if (changedRows.length > 0) {
      await pgClient.query('BEGIN');
      const batchSize = 100;
      
      for (let i = 0; i < changedRows.length; i += batchSize) {
        const batch = changedRows.slice(i, i + batchSize);
        // ... [Insert batch upload logic from previous products implementation] ...
      }
      
      await pgClient.query('COMMIT');
    }

    console.log(`\n✅ Products Sync Complete: ${totalProcessed} processed, ${changedRows.length} updates`);
    
  } catch (err) {
    await pgClient?.query('ROLLBACK');
    console.error('❌ Products Sync Failed:', err);
  } finally {
    await sqlPool?.close();
    await pgClient?.end();
    console.log(`⏱  Products Sync Duration: ${((Date.now() - startTime)/1000).toFixed(2)}s`);
  }
}

// Main Controller
async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--stock')) {
      await syncStock();
    } else if (args.includes('--products')) {
      await syncProducts();
    } else {
      await syncStock();
      await syncProducts();
    }
    console.log('\n🌈 All operations completed successfully');
  } catch (err) {
    console.error('\n🔥 Critical Error:', err);
    process.exit(1);
  }
}

// Run the application
main();