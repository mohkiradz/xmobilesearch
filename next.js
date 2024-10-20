// require the dependencies just installed from above commands
const express = require('express');
const sql = require('mssql/msnodesqlv8');

const app = express();
const port = 3000;


// create a database configuration
var config = {
    server: "elomari.noip.me\\SQLXPERT2014, 49799",
    database: "XPERTPHARM5_1867_ELOMARI",
    user: 'sa',
    password: "ounmadhr",
    driver: 'tedious',
};


// API endpoint to retrieve data
app.get('/data', (req, res) => {
    const searchTerm = req.query.searchTerm || ''; // Get search term from query string, default to empty string if not provided
    // Check if the search term is provided
    if (searchTerm.trim() === '') {
        res.json([]); // Return an empty array if search term is empty
        return;
    }
    const query = `
    SELECT 
    [DESIGNATION_PRODUIT]
    ,[REFERENCE]
    ,[DESIGN_DCI]
    ,[QTE_STOCK]
    ,[DESIGN_TYPE]
    ,[PRIX_VENTE_HT]
    ,[QTE_STOCK_REF]
    ,[PRIX_ACHAT_HT]
FROM [XPERTPHARM5_1867_ELOMARI].[dbo].[View_STK_PRODUITS]
        WHERE 
             DESIGNATION_PRODUIT LIKE '%${searchTerm}%' 
        `;

    sql.connect(config)
        .then(() => {
            return new sql.Request().query(query);
        })
        .then(result => {
            res.json(result.recordset);
        })
        .catch(err => {
            console.log(err);
            res.status(500).send('Error retrieving data from the database');
        });
});

// API endpoint to retrieve search suggestions
app.get('/suggestions', (req, res) => {
    const searchTerm = req.query.searchTerm || ''; // Get search term from query string, default to empty string if not provided
    const query = `
        SELECT [DESIGNATION_PRODUIT]
        FROM [XPERTPHARM5_1867_ELOMARI].[dbo].[View_STK_PRODUITS_LOOKUP_LISTE]
        WHERE [DESIGNATION_PRODUIT] LIKE '%${searchTerm}%'
        `;
    sql.connect(config)
        .then(() => {
            return new sql.Request().query(query);
        })
        .then(result => {
            res.json(result.recordset);
        })
        .catch(err => {
            console.error('Error fetching suggestions:', err);
            res.status(500).json({ error: 'Error fetching suggestions from the database' });
        });
});

// Serve static files
app.use(express.static('public'));

// Start server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});