let timerId; // Timer ID for delay before triggering suggestion search

// Function to fetch data from the server based on search term
function fetchData(searchTerm) {
    fetch('/data?searchTerm=' + encodeURIComponent(searchTerm))
        .then(response => response.json())
        .then(data => {
            const tableBody = document.querySelector('#dataTable tbody');
            tableBody.innerHTML = ''; // Clear existing rows
            data.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.DESIGNATION_PRODUIT}</td>
                    <td>${item.QTE_STOCK}</td>
                    <td>${item.REFERENCE}</td>
                    <td>${item.DESIGN_DCI}</td>                            
                    <td>${item.DESIGN_TYPE}</td>
                    <td>${item.QTE_STOCK_REF}</td>
                    <td>${item.PRIX_VENTE_HT}</td>
                    <td>${item.PRIX_ACHAT_HT}</td>
                `;
                tableBody.appendChild(row);
            });
        })
        .catch(error => console.error('Error fetching data:', error));
}

// Function to fetch suggestions based on search term
function fetchSuggestions(searchTerm) {
    fetch('/suggestions?searchTerm=' + encodeURIComponent(searchTerm))
        .then(response => response.json())
        .then(data => {
            const suggestionsDiv = document.getElementById('suggestions');
            suggestionsDiv.innerHTML = ''; // Clear existing suggestions
            data.forEach(suggestion => {
                const suggestionElement = document.createElement('div');
                suggestionElement.textContent = suggestion.DESIGNATION_PRODUIT;
                suggestionElement.classList.add('suggestion-item'); // Optional: Add styling class
                suggestionElement.addEventListener('click', () => {
                    document.getElementById('searchInput').value = suggestion.DESIGNATION_PRODUIT;
                    suggestionsDiv.innerHTML = ''; // Clear suggestions after selecting one
                });
                suggestionsDiv.appendChild(suggestionElement);
            });
        })
        .catch(error => console.error('Error fetching suggestions:', error));
}

// Event listener for search input (independent of suggestions)
document.getElementById('searchInput').addEventListener('input', function() {
    const searchText = this.value.trim();
    clearTimeout(timerId); // Clear previous timer
    if (searchText !== '') {
        // Delay suggestion search by 500ms after user stops typing
        timerId = setTimeout(() => {
            fetchSuggestions(searchText);
        }, 500);
    } else {
        document.getElementById('suggestions').innerHTML = ''; // Clear suggestions if search input is empty
    }
});

// Event listener for form submission or manual search
document.getElementById('searchForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent default form submission
    const searchText = document.getElementById('searchInput').value.trim();
    if (searchText !== '') {
        fetchData(searchText); // Fetch data based on input value
    }
    document.getElementById('suggestions').innerHTML = ''; // Clear suggestions when searching
});

// Initial data fetch when page loads (optional, can be removed if you don't want initial fetch)
fetchData('');
