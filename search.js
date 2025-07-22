import React, { useState } from 'react';
import './Search.css';

function ProductSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Search failed:', error);
    }
    setLoading(false);
  };

  return (
    <div className="search-container">
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search products..."
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="results">
        {results.map(({ product, lots }) => (
          <div key={product.code_produit} className="product-card">
            <h3>{product.designation_produit}</h3>
            <div className="product-info">
              <span>Code: {product.code_produit}</span>
              <span>Stock: {product.qte_stock}</span>
            </div>

            <div className="lots-section">
              <h4>Lots:</h4>
              {lots.map((lot) => (
                <div key={lot.id_stock} className="lot-card">
                  <div className="lot-header">
                    <span>Lot: {lot.lot}</span>
                    <span>Exp: {new Date(lot.date_peremption).toLocaleDateString()}</span>
                    <span>Qty: {lot.quantite}</span>
                  </div>

                  <div className="sales-section">
                    <h5>Sales History:</h5>
                    {lot.sales.length > 0 ? (
                      lot.sales.map((sale) => (
                        <div key={sale.num_vente} className="sale-item">
                          <span>{new Date(sale.date_vente).toLocaleDateString()}</span>
                          <span>Qty: {sale.quantite}</span>
                          <span>Total: €{sale.mt_ttc}</span>
                        </div>
                      ))
                    ) : (
                      <div className="no-sales">No sales recorded</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}