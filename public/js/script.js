const formatMonthYear = (dateStr) => {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${year}`;
};

const safeElement = (id) => document.getElementById(id) || null;

const getFilters = () => {
  return {
    searchTerm: safeElement('searchInput')?.value?.trim() || '',
    showZero: safeElement('showZero')?.checked || false,
    sortBy: safeElement('sortBy')?.value || 'designation_asc'
  };
};

const showLoading = () => {
  const resultsDiv = safeElement('results');
  if (resultsDiv) {
    resultsDiv.innerHTML = `
      <div class="d-flex justify-content-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `;
  }
};

const showError = (message) => {
  const resultsDiv = safeElement('results');
  if (resultsDiv) {
    resultsDiv.innerHTML = `
      <div class="alert alert-danger text-center py-4">
        <i class="fas fa-exclamation-triangle me-2"></i>
        ${message}
      </div>
    `;
  }
};

const isExpiringSoon = (date) => {
  if (!date) return false;
  const expDate = new Date(date);
  return (expDate - new Date()) < 6 * 30 * 24 * 60 * 60 * 1000;
};

const highlightActiveFilters = (filters) => {
  const searchInput = safeElement('searchInput');
  searchInput.closest('.col-lg-6')?.classList.toggle(
    'filter-active', 
    filters.searchTerm !== ''
  );
  
  const sortSelect = safeElement('sortBy');
  sortSelect.closest('.col-lg-3')?.classList.toggle(
    'filter-active',
    filters.sortBy !== 'designation_asc'
  );
  
  const showZero = safeElement('showZero');
  showZero.closest('.col-lg-3')?.classList.toggle(
    'filter-active',
    filters.showZero
  );
};

const setupLotToggle = (button, collapseEl) => {
  const updateButtonState = (isShown) => {
    const icon = button.querySelector('i');
    const text = button.querySelector('span');
    if (isShown) {
      icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
      text.textContent = 'Lots';
    } else {
      icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
      text.textContent = `Lots (${button.getAttribute('data-lots-count') || 0})`;
    }
  };

  // Initialize button state
  updateButtonState(collapseEl.classList.contains('show'));

  // Add Bootstrap collapse event listeners
  collapseEl.addEventListener('show.bs.collapse', () => updateButtonState(true));
  collapseEl.addEventListener('hide.bs.collapse', () => updateButtonState(false));

  // Click handler for manual toggle
  button.addEventListener('click', function(e) {
    e.preventDefault();
    const collapse = bootstrap.Collapse.getOrCreateInstance(collapseEl);
    collapse.toggle();
  });
};

const setupRefToggle = (button, collapseEl, product) => {
  button.addEventListener('click', async function(e) {
    e.preventDefault();
    if (collapseEl.dataset.loaded) return; // Only load once
    const ref = product.reference;
    if (!ref) {
      collapseEl.innerHTML = '<div class="text-danger">No reference found.</div>';
      return;
    }
    collapseEl.innerHTML = '<div class="text-muted">Loading...</div>';
    try {
      const response = await fetch('/search-by-ref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref })
      });
      const products = await response.json();
      // Exclude the current product
      const sameRefProducts = products.filter(p => p.code_produit !== product.code_produit);
      if (sameRefProducts.length === 0) {
        collapseEl.innerHTML = '<div class="text-muted">No other products with this reference.</div>';
      } else {
        collapseEl.innerHTML = `
  <div class="mt-2">
    ${sameRefProducts.map(p => `
      <div class="p-1 mb-3 rounded bg-light d-flex justify-content-between align-items-center">
        <div>
        <span class="text-small">${p.designation_produit}</span>
        </div>
        <div>
          <span class="icon-text"><span>📦</span> Qté: <span class="fw-bold">${p.qte_stock}</span></span>
        </div>
      </div>
    `).join('')}
  </div>
`;
      }
      collapseEl.dataset.loaded = "1";
    } catch (err) {
      collapseEl.innerHTML = '<div class="text-danger">Failed to load products.</div>';
    }
  });
};

const displayResults = (products, filters) => {
  const resultsDiv = safeElement('results');
  if (!resultsDiv) return;

  if (!products || products.length === 0) {
    resultsDiv.innerHTML = `
      <div class="alert alert-info text-center py-4">
        <i class="fas fa-info-circle me-2"></i>
        No products found matching your criteria
      </div>
    `;
    highlightActiveFilters(filters);
    return;
  }

  resultsDiv.innerHTML = '';

  products.forEach(product => {
    const hasValidExpiry = product.lots?.some(lot => 
      lot.date_peremption && new Date(lot.date_peremption) > new Date()
    );

    const nextExpiryAlert = hasValidExpiry && product.nearest_expiration ? `
      <div class="icon-text">
        <span class="${isExpiringSoon(product.nearest_expiration) ? 'fw-bold text-danger' : ''}">
          📅 Pér: ${formatMonthYear(product.nearest_expiration)}
          ${isExpiringSoon(product.nearest_expiration) ? '<i class="bi bi-exclamation-triangle-fill text-danger fs-7"></i>' : ''}
        </span>
      </div>
    ` : '';

    const productCard = document.createElement('div');
    productCard.className = 'product-card shadow-sm';
    productCard.id = `product-${product.code_produit}`;

    let ribbon = '';
    if (product.qte_stock <= 0) {
      productCard.className = 'product-card shadow-sm opacity-75';
      ribbon = `<div class="ribbon-bg">OUT OF STOCK</div>`;
    }

    const lotsId = `lots-${product.code_produit}`;
    const refId = `ref-${product.code_produit}`;
    const lotsCount = Array.isArray(product.lots) ? product.lots.length : 0;

    productCard.innerHTML = `
      ${ribbon}
      <div class="d-flex align-items-center m-1">
        <span class="me-2">💊</span>
        <span class="product-title">${product.designation_produit || 'N/A'}</span>
      </div>
      <hr class="my-2">
      <div class="row g-1">
        <div class="icon-text"><span>🧾</span>DCI: <span class="badge bg-secondary dci-ellipsis">${product.dci || 'No DCI specified'}</span></div>
        <div class="col-6">
          <div class="icon-text"><span>📦</span> Qté: <span class="text-primary fw-bold">${product.qte_stock || 0}</span></div>
          <div class="icon-text"><span>💰</span> P.Achat: <span class="text-secondary fw-bold">${product.prix_achat_ht || '-'}</span></div>
          <div class="icon-text"><span>🛒</span> Vendu(90): <span class="text-dark fw-bold"> ${product.total_sold ??  '-'}</span></div>
        </div>
        <div class="col-6">
          <div class="icon-text"><span>🏷️</span> Ref: <span class="text-warning fw-bold">${product.qte_stock_ref ?? '-'}</span></div>
          <div class="icon-text"><span>💵</span> PPA: <span class="text-success fw-bold">${product.prix_vente_ht ??  '-'}</span></div>
          ${nextExpiryAlert}
        </div>
      </div>

      <div class="d-flex gap-2 mt-2">
        <button type="button"
                class="btn btn-sm btn-warning d-flex align-items-center gap-1 show-lots-btn"
                data-product-id="${product.code_produit}"
                data-lots-count="${lotsCount}"
                data-bs-toggle="collapse"
                data-bs-target="#${lotsId}">
          <i class="fas fa-chevron-down"></i>
          <span>Show Lots (${lotsCount})</span>
        </button>
        <button type="button"
                class="btn btn-sm btn-info d-flex align-items-center gap-1 show-ref-btn"
                data-ref="${product.reference ?? ''}"
                data-bs-toggle="collapse"
                data-bs-target="#${refId}">
          <i class="fas fa-link"></i>
          <span>Ref</span>
        </button>
      </div>

      <div class="collapse mt-2" id="${lotsId}">
        ${product.lots?.length ? `
          <div class="mt-3 pt-3 border-top">
            ${product.lots
              .filter(lot => lot)
              .filter(lot => filters.showZero || lot.quantite > 0)
              .map(lot => `
                <div class="p-3 mb-2 rounded ${lot.is_blocked ? 'bg-danger bg-opacity-10' : 'bg-light'}
                    ${lot.date_peremption && isExpiringSoon(lot.date_peremption) ? 'border border-warning' : ''}">
                  <div class="d-flex justify-content-between">
                    Lot: ${lot.lot || 'N/A'}
                    ${
                      (new Date(lot.date_peremption) < new Date()) ? 
                        `<i class="bi bi-trash text-danger" title="Expired"></i>` :
                      lot.is_blocked ? 
                        `<i class="bi bi-lock text-secondary" title="Blocked"></i>` :
                      (lot.date_peremption && isExpiringSoon(lot.date_peremption)) ?
                        `<i class="bi bi-exclamation-triangle text-warning" title="Near Expiry"></i>` :
                        `<i class="bi bi-check-circle text-success" title="Active"></i>`
                    }
                  </div>
                  <div class="row small mt-2">
                    <div class="col-5 p-0 fw-bold">
                      <span class="">📅:</span> 
                      ${lot.date_peremption ? formatMonthYear(lot.date_peremption) : 'N/A'}
                      ${lot.date_peremption && isExpiringSoon(lot.date_peremption) ? '<i class="fas fa-exclamation-triangle text-warning ms-1"></i>' : ''}
                    </div>
                    <div class="col-2 p-0 fw-bold">
                      <span class="text-BOLD">📦:</span> ${lot.quantite || 0}
                    </div>
                    <div class="col-5 p-0 fw-bold">
                      <span class="text-muted">💵:</span> ${lot.cout_achat || 0} DA
                    </div>
                  </div>
                </div>
            `).join('')}
          </div>
        ` : '<p class="text-muted small mt-2">No lots available</p>'}
      </div>

      <div class="collapse mt-2" id="${refId}">
        <div class="card card-body p-2 ref-products-list">
          <div class="text-muted">Click to load products with same reference...</div>
        </div>
      </div>
    `;

    resultsDiv.appendChild(productCard);

    // Set up the toggle functionality for lots
    const lotBtn = productCard.querySelector('.show-lots-btn');
    const lotCollapse = productCard.querySelector(`#${lotsId}`);
    if (lotBtn && lotCollapse) {
      setupLotToggle(lotBtn, lotCollapse);
    }

    // Set up the toggle functionality for ref
    const refBtn = productCard.querySelector('.show-ref-btn');
    const refCollapse = productCard.querySelector(`#${refId} .ref-products-list`);
    if (refBtn && refCollapse) {
      setupRefToggle(refBtn, refCollapse, product);
    }
  });

  highlightActiveFilters(filters);
};

let activeSearchController = null;

const searchProducts = async () => {
  if (activeSearchController) {
    activeSearchController.abort();
  }

  activeSearchController = new AbortController();

  try {
    const filters = getFilters();
    showLoading();

    const response = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
      signal: activeSearchController.signal
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const products = await response.json();
    displayResults(products, filters);
  } catch (err) {
    if (err.name !== 'AbortError') {
      showError(err.message || 'Failed to fetch products');
    }
  }
};

const resetFilters = () => {
  safeElement('searchInput').value = '';
  safeElement('sortBy').value = 'designation_asc';
  safeElement('showZero').checked = false;
  searchProducts();
};

document.addEventListener('DOMContentLoaded', () => {
  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  };

  const debouncedSearch = debounce(searchProducts, 300);

  // Search input - only trigger on actual input changes
  const searchInput = safeElement('searchInput');
  if (searchInput) {
    let lastValue = searchInput.value;
    searchInput.addEventListener('input', () => {
      if (searchInput.value !== lastValue) {
        lastValue = searchInput.value;
        debouncedSearch();
      }
    });
  }

  // Sort dropdown - only trigger on change
  const sortSelect = safeElement('sortBy');
  if (sortSelect) {
    sortSelect.addEventListener('change', debouncedSearch);
  }

  // Show zero checkbox - only trigger on change
  const showZero = safeElement('showZero');
  if (showZero) {
    showZero.addEventListener('change', debouncedSearch);
  }

  document.getElementById('resetFilters')?.addEventListener('click', resetFilters);
});

