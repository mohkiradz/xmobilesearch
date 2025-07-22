// sync-achats.js
const sql = require('mssql/msnodesqlv8');
require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');

// Configuration
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

function generateChecksum(values) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(values));
  return hash.digest('hex');
}

async function syncAchats() {
  const startTime = Date.now();
  let sqlPool, pgClient;
  let totalProcessed = 0;
  let totalUpdated = 0;
  const changedRows = [];
  const updatedDocs = new Set();

  try {
    console.log('\n=== Starting Achats Sync ===');
    
    // Connect to databases
    sqlPool = await sql.connect(dbConfig.sql);
    pgClient = new Client(dbConfig.pg);
    await pgClient.connect();

    // 1. Ensure table structure
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS achats (
        code_doc VARCHAR(255) PRIMARY KEY,
        id_stock VARCHAR(255),
        code_produit VARCHAR(255),
        lot VARCHAR(255),
        date_peremption TIMESTAMP WITH TIME ZONE,
        quantite NUMERIC(15,2),
        qte_bonus NUMERIC(15,2),
        prix_unitaire NUMERIC(15,2),
        ppa NUMERIC(15,2),
        shp NUMERIC(15,2),
        prix_vente NUMERIC(15,2),
        cout_achat NUMERIC(15,2),
        taux_marge NUMERIC(15,2),
        prix_ttc NUMERIC(15,2),
        mt_ht NUMERIC(15,2),
        mt_tva NUMERIC(15,2),
        mt_ttc NUMERIC(15,2),
        mt_vente NUMERIC(15,2),
        code_barre_lot VARCHAR(255),
        created_on TIMESTAMP WITH TIME ZONE,
        created_by VARCHAR(255),
        ach_psychothrope INTEGER,
        num_doc VARCHAR(255),
        date_doc TIMESTAMP WITH TIME ZONE,
        code_tiers VARCHAR(255),
        ref_tiers VARCHAR(255),
        type_doc VARCHAR(255),
        tiers_nomc VARCHAR(255),
        designation_produit TEXT,
        qte_stock NUMERIC(15,2),
        type_produit VARCHAR(255),
        mt_achat NUMERIC(15,2),
        psychothrope INTEGER,
        designation_dci TEXT,
        reference VARCHAR(255),
        titre_document VARCHAR(255),
        row_hash VARCHAR(64)
      )`);

    // 2. Get existing hashes
    const hashResult = await pgClient.query('SELECT code_doc, row_hash FROM achats');
    const existingHashes = new Map(hashResult.rows.map(r => [r.code_doc, r.row_hash]));

    // 3. Fetch and process SQL Server data
    const result = await sqlPool.request().query(`
      SELECT [CODE_DOC],[ID_STOCK],[CODE_PRODUIT],[LOT],[DATE_PEREMPTION],
             [QUANTITE],[QTE_BONUS],[PRIX_UNITAIRE],[PPA],[SHP],
             [PRIX_VENTE],[COUT_ACHAT],[TAUX_MARGE],[PRIX_TTC],[MT_HT],
             [MT_TVA],[MT_TTC],[MT_VENTE],[CODE_BARRE_LOT],[CREATED_ON],
             [CREATED_BY],[ACH_PSYCHOTHROPE],[NUM_DOC],[DATE_DOC],[CODE_TIERS],
             [REF_TIERS],[TYPE_DOC],[TIERS_NOMC],[DESIGNATION_PRODUIT],[QTE_STOCK],
             [TYPE_PRODUIT],[MT_ACHAT],[PSYCHOTHROPE],[DESIGNATION_DCI],[REFERENCE],
             [TITRE_DOCUMENT]
      FROM [XPERTPHARM5_1867_ELOMARI].[dbo].[View_ACH_DOCUMENT_DETAIL_LIST]`);

    // 4. Process and compare data
    result.recordset.forEach(rawRow => {
      totalProcessed++;
      const processedRow = {
        code_doc: String(rawRow.CODE_DOC).trim(),
        id_stock: String(rawRow.ID_STOCK).trim(),
        code_produit: String(rawRow.CODE_PRODUIT).trim(),
        lot: String(rawRow.LOT).trim(),
        date_peremption: rawRow.DATE_PEREMPTION ? new Date(rawRow.DATE_PEREMPTION) : null,
        quantite: parseFloat(rawRow.QUANTITE) || 0,
        qte_bonus: parseFloat(rawRow.QTE_BONUS) || 0,
        prix_unitaire: parseFloat(rawRow.PRIX_UNITAIRE) || 0,
        ppa: parseFloat(rawRow.PPA) || 0,
        shp: parseFloat(rawRow.SHP) || 0,
        prix_vente: parseFloat(rawRow.PRIX_VENTE) || 0,
        cout_achat: parseFloat(rawRow.COUT_ACHAT) || 0,
        taux_marge: parseFloat(rawRow.TAUX_MARGE) || 0,
        prix_ttc: parseFloat(rawRow.PRIX_TTC) || 0,
        mt_ht: parseFloat(rawRow.MT_HT) || 0,
        mt_tva: parseFloat(rawRow.MT_TVA) || 0,
        mt_ttc: parseFloat(rawRow.MT_TTC) || 0,
        mt_vente: parseFloat(rawRow.MT_VENTE) || 0,
        code_barre_lot: String(rawRow.CODE_BARRE_LOT).trim(),
        created_on: new Date(rawRow.CREATED_ON),
        created_by: String(rawRow.CREATED_BY).trim(),
        ach_psychothrope: Math.min(9, Math.max(0, parseInt(rawRow.ACH_PSYCHOTHROPE) || 0)),
        num_doc: String(rawRow.NUM_DOC).trim(),
        date_doc: new Date(rawRow.DATE_DOC),
        code_tiers: String(rawRow.CODE_TIERS).trim(),
        ref_tiers: String(rawRow.REF_TIERS).trim(),
        type_doc: String(rawRow.TYPE_DOC).trim(),
        tiers_nomc: String(rawRow.TIERS_NOMC).trim(),
        designation_produit: String(rawRow.DESIGNATION_PRODUIT).trim(),
        qte_stock: parseFloat(rawRow.QTE_STOCK) || 0,
        type_produit: String(rawRow.TYPE_PRODUIT).trim(),
        mt_achat: parseFloat(rawRow.MT_ACHAT) || 0,
        psychothrope: Math.min(9, Math.max(0, parseInt(rawRow.PSYCHOTHROPE) || 0)),
        designation_dci: String(rawRow.DESIGNATION_DCI).trim(),
        reference: String(rawRow.REFERENCE).trim(),
        titre_document: String(rawRow.TITRE_DOCUMENT).trim()
      };

      // Generate checksum
      const checksumValues = [
        processedRow.code_doc,
        processedRow.id_stock,
        processedRow.code_produit,
        processedRow.lot,
        processedRow.date_peremption?.toISOString(),
        Number(processedRow.quantite.toFixed(2)),
        Number(processedRow.qte_bonus.toFixed(2)),
        Number(processedRow.prix_unitaire.toFixed(2)),
        Number(processedRow.ppa.toFixed(2)),
        Number(processedRow.shp.toFixed(2)),
        Number(processedRow.prix_vente.toFixed(2)),
        Number(processedRow.cout_achat.toFixed(2)),
        Number(processedRow.taux_marge.toFixed(2)),
        Number(processedRow.prix_ttc.toFixed(2)),
        Number(processedRow.mt_ht.toFixed(2)),
        Number(processedRow.mt_tva.toFixed(2)),
        Number(processedRow.mt_ttc.toFixed(2)),
        Number(processedRow.mt_vente.toFixed(2)),
        processedRow.code_barre_lot,
        processedRow.created_on.toISOString(),
        processedRow.created_by,
        processedRow.ach_psychothrope,
        processedRow.num_doc,
        processedRow.date_doc.toISOString(),
        processedRow.code_tiers,
        processedRow.ref_tiers,
        processedRow.type_doc,
        processedRow.tiers_nomc,
        processedRow.designation_produit,
        Number(processedRow.qte_stock.toFixed(2)),
        processedRow.type_produit,
        Number(processedRow.mt_achat.toFixed(2)),
        processedRow.psychothrope,
        processedRow.designation_dci,
        processedRow.reference,
        processedRow.titre_document
      ];
      
      processedRow.row_hash = generateChecksum(checksumValues);

      if (!existingHashes.has(processedRow.code_doc) || 
          existingHashes.get(processedRow.code_doc) !== processedRow.row_hash) {
        changedRows.push(processedRow);
      }
    });

    // 5. Upload changes
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
            ${Array.from({length: 35}, (_, i) => `$${paramCounter + i}`).join(', ')}
          )`);
          paramCounter += 35;

          values.push(
            row.code_doc,
            row.id_stock,
            row.code_produit,
            row.lot,
            row.date_peremption,
            row.quantite,
            row.qte_bonus,
            row.prix_unitaire,
            row.ppa,
            row.shp,
            row.prix_vente,
            row.cout_achat,
            row.taux_marge,
            row.prix_ttc,
            row.mt_ht,
            row.mt_tva,
            row.mt_ttc,
            row.mt_vente,
            row.code_barre_lot,
            row.created_on,
            row.created_by,
            row.ach_psychothrope,
            row.num_doc,
            row.date_doc,
            row.code_tiers,
            row.ref_tiers,
            row.type_doc,
            row.tiers_nomc,
            row.designation_produit,
            row.qte_stock,
            row.type_produit,
            row.mt_achat,
            row.psychothrope,
            row.designation_dci,
            row.reference,
            row.titre_document,
            row.row_hash
          );
        });

        const query = `
          INSERT INTO achats (
            code_doc, id_stock, code_produit, lot, date_peremption,
            quantite, qte_bonus, prix_unitaire, ppa, shp,
            prix_vente, cout_achat, taux_marge, prix_ttc, mt_ht,
            mt_tva, mt_ttc, mt_vente, code_barre_lot, created_on,
            created_by, ach_psychothrope, num_doc, date_doc, code_tiers,
            ref_tiers, type_doc, tiers_nomc, designation_produit, qte_stock,
            type_produit, mt_achat, psychothrope, designation_dci, reference,
            titre_document, row_hash
          ) VALUES ${placeholders.join(', ')}
          ON CONFLICT (code_doc) DO UPDATE SET
            id_stock = EXCLUDED.id_stock,
            code_produit = EXCLUDED.code_produit,
            lot = EXCLUDED.lot,
            date_peremption = EXCLUDED.date_peremption,
            quantite = EXCLUDED.quantite,
            qte_bonus = EXCLUDED.qte_bonus,
            prix_unitaire = EXCLUDED.prix_unitaire,
            ppa = EXCLUDED.ppa,
            shp = EXCLUDED.shp,
            prix_vente = EXCLUDED.prix_vente,
            cout_achat = EXCLUDED.cout_achat,
            taux_marge = EXCLUDED.taux_marge,
            prix_ttc = EXCLUDED.prix_ttc,
            mt_ht = EXCLUDED.mt_ht,
            mt_tva = EXCLUDED.mt_tva,
            mt_ttc = EXCLUDED.mt_ttc,
            mt_vente = EXCLUDED.mt_vente,
            code_barre_lot = EXCLUDED.code_barre_lot,
            created_on = EXCLUDED.created_on,
            created_by = EXCLUDED.created_by,
            ach_psychothrope = EXCLUDED.ach_psychothrope,
            num_doc = EXCLUDED.num_doc,
            date_doc = EXCLUDED.date_doc,
            code_tiers = EXCLUDED.code_tiers,
            ref_tiers = EXCLUDED.ref_tiers,
            type_doc = EXCLUDED.type_doc,
            tiers_nomc = EXCLUDED.tiers_nomc,
            designation_produit = EXCLUDED.designation_produit,
            qte_stock = EXCLUDED.qte_stock,
            type_produit = EXCLUDED.type_produit,
            mt_achat = EXCLUDED.mt_achat,
            psychothrope = EXCLUDED.psychothrope,
            designation_dci = EXCLUDED.designation_dci,
            reference = EXCLUDED.reference,
            titre_document = EXCLUDED.titre_document,
            row_hash = EXCLUDED.row_hash
          WHERE achats.row_hash IS DISTINCT FROM EXCLUDED.row_hash
          RETURNING code_doc;
        `;

        const result = await pgClient.query(query, values);
        result.rows.forEach(r => updatedDocs.add(r.code_doc));
        totalUpdated += result.rows.length;
        console.log(`⬆️  Uploaded batch ${Math.ceil((i + 1)/batchSize)}/${Math.ceil(changedRows.length/batchSize)}`);
      }

      await pgClient.query('COMMIT');
    }

    // Final report
    const duration = ((Date.now() - startTime)/1000).toFixed(2);
    console.log('\n═════════════════════ Sync Report ════════════════════');
    console.log(`📊 Total processed: ${totalProcessed}`);
    console.log(`🔄 Changes detected: ${changedRows.length}`);
    console.log(`✅ Successful updates: ${totalUpdated}`);
    
    if (updatedDocs.size > 0) {
      console.log(`\n📦 Updated documents (${updatedDocs.size}):`);
      console.log(Array.from(updatedDocs).join(', '));
    }
    
    console.log(`\n⏱  Duration: ${duration}s`);
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

// Run as standalone or part of main script
if (require.main === module) {
  syncAchats();
}

module.exports = syncAchats;