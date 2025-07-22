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

async function syncVenteDetail() {
  const startTime = Date.now();
  let sqlPool, pgClient;

  try {
    // Connect to SQL Server
    sqlPool = await sql.connect(sqlConfig);
    console.log('Connected to SQL Server');

    // Fetch vente detail data
    console.log('Fetching vente detail data from SQL Server...');
    const result = await sqlPool.request().query(`
      SELECT 
        p.[NUM_VENTE],
        p.[NOM_TIERS],
        p.[CODE_TIERS],
        p.[CODE_VENTE],
        t.[TITRE],
        p.[ID_STOCK],
        p.[CODE_PRODUIT],
        p.[QUANTITE],
        p.[REMISE],
        p.[CREATED_ON],
        p.[CREATED_BY]
      FROM [XPERTPHARM5_1867_ELOMARI].[dbo].[View_VTE_VENTE_DETAIL] p
      INNER JOIN TITRE_VENTE t ON t.TYPE = p.TYPE_VENTE AND t.CODE = p.TYPE_VALIDATION
      WHERE DATEDIFF(day, p.[CREATED_ON], GETDATE()) BETWEEN 0 AND 90
    `);

    // Connect to Neon PostgreSQL
    pgClient = new Client(pgConfig);
    await pgClient.connect();
    console.log('Connected to Neon PostgreSQL');

    // Create vente_detail table
    console.log('Creating vente_detail table...');
    await pgClient.query('DROP TABLE IF EXISTS vente_detail');
    await pgClient.query(`
      CREATE TABLE vente_detail (
        num_vente        VARCHAR(255),
        nom_tiers        TEXT,
        code_tiers       VARCHAR(255),
        code_vente       VARCHAR(255),
        titre            TEXT,
        id_stock         VARCHAR(255),
        code_produit     VARCHAR(255),
        quantite         NUMERIC,
        remise           NUMERIC,
        created_on       TIMESTAMP,
        created_by       VARCHAR(255)
      )
    `);

    // Process data
    console.log('Processing vente detail rows...');
    const rows = result.recordset.map(row => ({
      num_vente: String(row.NUM_VENTE || '').trim(),
      nom_tiers: String(row.NOM_TIERS || '').trim(),
      code_tiers: String(row.CODE_TIERS || '').trim(),
      code_vente: String(row.CODE_VENTE || '').trim(),
      titre: String(row.TITRE || '').trim(),
      id_stock: String(row.ID_STOCK || '').trim(),
      code_produit: String(row.CODE_PRODUIT || '').trim(),
      quantite: parseFloat(row.QUANTITE) || 0,
      remise: parseFloat(row.REMISE) || 0,
      created_on: row.CREATED_ON,
      created_by: String(row.CREATED_BY || '').trim()
    }));

    // Batch insert
    const batchSize = 100;
    let inserted = 0;

    while (inserted < rows.length) {
      const batch = rows.slice(inserted, inserted + batchSize);
      const values = [];
      const placeholders = [];

      batch.forEach((row, index) => {
        const base = index * 11;
        placeholders.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11})`);
        values.push(
          row.num_vente, row.nom_tiers, row.code_tiers, row.code_vente, row.titre,
          row.id_stock, row.code_produit, row.quantite, row.remise, row.created_on, row.created_by
        );
      });

      await pgClient.query(
        `INSERT INTO vente_detail (
          num_vente, nom_tiers, code_tiers, code_vente, titre, id_stock, code_produit, quantite, remise, created_on, created_by
        ) VALUES ${placeholders.join(',')}`,
        values
      );

      inserted += batch.length;
      console.log(`Inserted ${inserted}/${rows.length} vente detail rows`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Vente detail sync completed in ${duration} seconds`);
    process.exit(0);

  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`Vente detail sync failed after ${duration} seconds:`, err);
    process.exit(1);
  } finally {
    if (sql.connected) await sql.close();
    if (pgClient) await pgClient.end();
  }
}

syncVenteDetail();