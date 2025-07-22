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
      row.id_stock,
      row.code_produit,
      row.lot,
      row.date_peremption ? row.date_peremption.toISOString() : null,
      row.is_blocked,
      Number(row.quantite.toFixed(2)),
      Number(row.cout_achat.toFixed(2)),
      Number(row.val_stk.toFixed(2)),
      Number(row.shp.toFixed(2)),
      Number(row.ppa.toFixed(2)),
      Number(row.prix_vente.toFixed(2)),
      row.code_barre_lot,
      row.fact_bl_lot,
      Number(row.mt_tva_achat.toFixed(2)),
      Number(row.prix_fournisseur.toFixed(2)),
      row.actif,
      row.nom_fournisseur
    ];
  
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(values));
    return hash.digest('hex');
  }
  
  function processRow(rawRow) {
    return {
      id_stock: String(rawRow.ID_STOCK).trim(),
      code_produit: String(rawRow.CODE_PRODUIT).trim(),
      lot: String(rawRow.LOT).trim(),
      date_peremption: rawRow.DATE_PEREMPTION ? new Date(rawRow.DATE_PEREMPTION) : null,
      is_blocked: Boolean(rawRow.IS_BLOCKED),
      quantite: parseFloat(Number(rawRow.QUANTITE).toFixed(2)) || 0,
      cout_achat: parseFloat(Number(rawRow.COUT_ACHAT).toFixed(2)) || 0,
      val_stk: parseFloat(Number(rawRow.VAL_STK).toFixed(2)) || 0,
      shp: parseFloat(Number(rawRow.SHP).toFixed(2)) || 0,
      ppa: parseFloat(Number(rawRow.PPA).toFixed(2)) || 0,
      prix_vente: parseFloat(Number(rawRow.PRIX_VENTE).toFixed(2)) || 0,
      code_barre_lot: String(rawRow.CODE_BARRE_LOT).trim(),
      fact_bl_lot: String(rawRow.FACT_BL_LOT).trim(),
      mt_tva_achat: parseFloat(Number(rawRow.MT_TVA_ACHAT).toFixed(2)) || 0,
      prix_fournisseur: parseFloat(Number(rawRow.PRIX_FOURNISSEUR).toFixed(2)) || 0,
      actif: Boolean(rawRow.ACTIF),
      nom_fournisseur: String(rawRow.NOM_FOURNISSEUR).trim(),
      row_hash: '' // Will be populated later
    };
  }
  
  async function syncStock() {
    const startTime = Date.now();
    let sqlPool, pgClient;
    let totalProcessed = 0;
    let totalUpdated = 0;
    const changedRows = [];
    const updatedProducts = new Set();
  
    try {
      // Connect to both databases
      sqlPool = await sql.connect(sqlConfig);
      pgClient = new Client(pgConfig);
      await pgClient.connect();
      console.log('🔌 Connected to databases');
  
      // 1. Get existing hashes from Neon
      console.log('🔍 Fetching existing hashes fron neonDB...');
      const hashResult = await pgClient.query('SELECT id_stock, row_hash FROM stock');
      const existingHashes = new Map(hashResult.rows.map(r => [r.id_stock, r.row_hash]));
  
      // 2. Fetch and process SQL Server data
      console.log('⏬ Downloading SQL Server data...');
      const result = await sqlPool.request().query(`
        SELECT [ID_STOCK], [CODE_PRODUIT], [LOT], [DATE_PEREMPTION], [IS_BLOCKED],
               [QUANTITE], [COUT_ACHAT], [VAL_STK], [SHP], [PPA],
               [PRIX_VENTE], [CODE_BARRE_LOT], [FACT_BL_LOT], [MT_TVA_ACHAT],
               [PRIX_FOURNISSEUR], [ACTIF], [NOM_FOURNISSEUR]
        FROM [XPERTPHARM5_1867_ELOMARI].[dbo].[View_STK_STOCK_LISTE]
      `);
  
      // 3. Identify changes locally
      console.log('🔎 Comparing local copies...');
      result.recordset.forEach(rawRow => {
        totalProcessed++;
        const row = processRow(rawRow);
        row.row_hash = generateChecksum(row);
        
        const existingHash = existingHashes.get(row.id_stock);
        if (!existingHash || existingHash !== row.row_hash) {
          changedRows.push(row);
        }
      });
  
      // 4. Upload changes only
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
              $${paramCounter + 9}, $${paramCounter + 10}, $${paramCounter + 11},
              $${paramCounter + 12}, $${paramCounter + 13}, $${paramCounter + 14},
              $${paramCounter + 15}, $${paramCounter + 16}, $${paramCounter + 17}
            )`);
            paramCounter += 18;
  
            values.push(
              row.id_stock,
              row.code_produit,
              row.lot,
              row.date_peremption,
              row.is_blocked,
              row.quantite,
              row.cout_achat,
              row.val_stk,
              row.shp,
              row.ppa,
              row.prix_vente,
              row.code_barre_lot,
              row.fact_bl_lot,
              row.mt_tva_achat,
              row.prix_fournisseur,
              row.actif,
              row.nom_fournisseur,
              row.row_hash
            );
          });
  
          const query = `
            INSERT INTO stock VALUES ${placeholders.join(', ')}
            ON CONFLICT (id_stock) DO UPDATE SET
              code_produit = EXCLUDED.code_produit,
              lot = EXCLUDED.lot,
              date_peremption = EXCLUDED.date_peremption,
              is_blocked = EXCLUDED.is_blocked,
              quantite = EXCLUDED.quantite,
              cout_achat = EXCLUDED.cout_achat,
              val_stk = EXCLUDED.val_stk,
              shp = EXCLUDED.shp,
              ppa = EXCLUDED.ppa,
              prix_vente = EXCLUDED.prix_vente,
              code_barre_lot = EXCLUDED.code_barre_lot,
              fact_bl_lot = EXCLUDED.fact_bl_lot,
              mt_tva_achat = EXCLUDED.mt_tva_achat,
              prix_fournisseur = EXCLUDED.prix_fournisseur,
              actif = EXCLUDED.actif,
              nom_fournisseur = EXCLUDED.nom_fournisseur,
              row_hash = EXCLUDED.row_hash
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
      console.log(`📊 Total rows processed: ${totalProcessed}`);
      console.log(`🔄 Changed rows detected: ${changedRows.length}`);
      console.log(`✅ Successful updates: ${totalUpdated}`);
      
      if (updatedProducts.size > 0) {
        console.log(`\n📦 Updated products (${updatedProducts.size}):`);
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
  
  syncStock();