// popup.js

/**
 * Executes code after the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Get references to DOM elements
    const tabListContainer = document.getElementById('tabList');
    const closeSelectedBtn = document.getElementById('closeSelectedBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const loadingMessage = document.getElementById('loadingMessage');

    /**
     * Extracts the Second-Level Domain (SLD) from a given URL.
     * This function attempts to get the domain name just before the TLD.
     * Handles various URL formats including localhost and IP addresses.
     * @param {string} url - The URL string.
     * @returns {string} The SLD or a descriptive string for special cases (e.g., 'Local File', 'Chrome Internal').
     */
    function getSldFromUrl(url) {
        try {
            const urlObj = new URL(url);
            // Handle chrome:// and file:/// URLs
            if (urlObj.protocol === 'chrome:') {
                return 'Chrome Internal';
            }
            if (urlObj.protocol === 'file:') {
                return 'Local File';
            }

            // Handle localhost or IP addresses
            if (urlObj.hostname === 'localhost' || urlObj.hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/)) {
                return urlObj.hostname; // Return 'localhost' or the IP
            }

            const hostname = urlObj.hostname;
            const parts = hostname.split('.');
            const numParts = parts.length;

            if (numParts < 2) {
                // If there's only one part (e.g., "example"), return it as the SLD
                return hostname;
            }

            // Common TLDs that are two parts (e.g., .co.uk, .com.au)
            // This list can be expanded for more comprehensive SLD extraction
            const twoPartTlds = [
                'co.uk', 'com.au', 'net.au', 'org.au', 'asn.au',
                'gov.uk', 'ac.uk', 'org.uk', 'ltd.uk', 'plc.uk',
                'com.br', 'gov.br',
                'com.cn', 'net.cn', 'org.cn'
            ];

            // Check if the last two parts form a known two-part TLD
            if (numParts >= 2 && twoPartTlds.includes(parts.slice(-2).join('.'))) {
                if (numParts >= 3) {
                    return parts[numParts - 3] + '.' + parts[numParts - 2] + '.' + parts[numParts - 1]; // e.g., "google.co.uk" -> google.co.uk
                } else {
                    return hostname; // e.g., "co.uk"
                }
            } else {
                // For standard TLDs (e.g., .com, .org), the SLD is the part before the last.
                return parts[numParts - 2] + '.' + parts[numParts - 1]; // e.g., "google.com" -> google.com
            }

        } catch (e) {
            // Handle invalid URLs
            console.error('Invalid URL:', url, e);
            return 'Invalid URL';
        }
    }

    /**
     * Renders the grouped tabs into the popup's HTML.
     * @param {Object.<string, Array<chrome.tabs.Tab>>} groupedTabs - An object where keys are SLDs and values are arrays of tabs.
     */
    function renderTabs(groupedTabs) {
        tabListContainer.innerHTML = ''; // Clear previous content
        loadingMessage.style.display = 'none'; // Hide loading message

        if (Object.keys(groupedTabs).length === 0) {
            tabListContainer.innerHTML = '<p class="text-center text-gray-500 py-4">No open tabs found.</p>';
            closeSelectedBtn.disabled = true; // Disable button if no tabs
            selectAllBtn.disabled = true;
            return;
        }

        // Sort SLDs alphabetically for consistent display
        const sortedSlds = Object.keys(groupedTabs).sort();

        sortedSlds.forEach(sld => {
            // Create group header
            const groupHeader = document.createElement('div');
            groupHeader.className = 'group-header';
            groupHeader.innerHTML = `<span>${sld}</span>`; // Display SLD

            // Create a checkbox for "Select All" within this group
            const groupSelectAllCheckbox = document.createElement('input');
            groupSelectAllCheckbox.type = 'checkbox';
            groupSelectAllCheckbox.className = 'select-all-checkbox';
            groupSelectAllCheckbox.id = `select-all-${sld.replace(/\./g, '-')}`; // Replace dots for valid ID
            groupHeader.prepend(groupSelectAllCheckbox); // Add checkbox at the beginning

            tabListContainer.appendChild(groupHeader);

            // Add event listener for group select all checkbox
            groupSelectAllCheckbox.addEventListener('change', (event) => {
                const checkboxesInGroup = tabListContainer.querySelectorAll(`[data-sld="${sld}"]`);
                checkboxesInGroup.forEach(checkbox => {
                    checkbox.checked = event.target.checked;
                });
            });

            // Add tabs for the current SLD
            groupedTabs[sld].forEach(tab => {
                const tabItem = document.createElement('div');
                tabItem.className = 'tab-item hover:bg-indigo-50 rounded-md'; // Tailwind classes for hover effect
                tabItem.dataset.tabId = tab.id; // Store tab ID for easy access

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `tab-${tab.id}`;
                checkbox.dataset.sld = sld; // Link checkbox to its SLD group
                tabItem.appendChild(checkbox);

                const tabContent = document.createElement('label');
                tabContent.htmlFor = `tab-${tab.id}`;
                tabContent.className = 'flex-grow cursor-pointer';
                tabContent.innerHTML = `
                    <div class="tab-title">${tab.title || 'No Title'}</div>
                    <div class="tab-url">${tab.url}</div>
                `;
                tabItem.appendChild(tabContent);

                tabListContainer.appendChild(tabItem);
            });
        });
        closeSelectedBtn.disabled = false; // Enable button once tabs are rendered
        selectAllBtn.disabled = false;
    }

    /**
     * Fetches all open tabs, groups them by SLD, and then renders them.
     */
    async function loadTabs() {
        tabListContainer.innerHTML = '';
        loadingMessage.style.display = 'block';

        // Query for all tabs in the current window
        // Permissions for 'tabs' are required in manifest.json
        chrome.tabs.query({}, (tabs) => {
            const groupedTabs = {};

            tabs.forEach(tab => {
                // Skip special Chrome internal pages that cannot be closed
                if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                    return;
                }

                const sld = getSldFromUrl(tab.url);
                if (!groupedTabs[sld]) {
                    groupedTabs[sld] = [];
                }
                groupedTabs[sld].push(tab);
            });

            renderTabs(groupedTabs);
        });
    }

    /**
     * Handles the "Close Selected Tabs" button click.
     * Iterates through checked checkboxes and closes the corresponding tabs.
     */
    closeSelectedBtn.addEventListener('click', () => {
        const checkboxes = tabListContainer.querySelectorAll('input[type="checkbox"]:checked');
        const tabIdsToClose = [];

        checkboxes.forEach(checkbox => {
            // Ensure it's a tab-specific checkbox, not a group select-all
            if (checkbox.id.startsWith('tab-')) {
                const tabId = parseInt(checkbox.id.split('-')[1]);
                tabIdsToClose.push(tabId);
            }
        });

        if (tabIdsToClose.length > 0) {
            // Use chrome.tabs.remove to close tabs
            chrome.tabs.remove(tabIdsToClose, () => {
                // Reload tabs after closing to update the list
                loadTabs();
            });
        } else {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'p-2 mt-2 bg-yellow-100 text-yellow-800 rounded-md text-sm text-center';
            messageDiv.textContent = 'No tabs selected to close.';
            tabListContainer.appendChild(messageDiv);
            setTimeout(() => messageDiv.remove(), 2000); // Remove message after 2 seconds
        }
    });

    /**
     * Handles the "Select All" button click.
     * Checks/unchecks all individual tab checkboxes.
     */
    selectAllBtn.addEventListener('click', () => {
        const allCheckboxes = tabListContainer.querySelectorAll('input[type="checkbox"]');
        const allTabCheckboxes = Array.from(allCheckboxes).filter(cb => cb.id.startsWith('tab-'));

        // Determine if all are currently selected
        const areAllSelected = allTabCheckboxes.every(cb => cb.checked);

        // Toggle selection based on current state
        allTabCheckboxes.forEach(checkbox => {
            checkbox.checked = !areAllSelected;
        });

        // Also update group select-all checkboxes
        const groupCheckboxes = tabListContainer.querySelectorAll('.group-header input[type="checkbox"]');
        groupCheckboxes.forEach(groupCb => {
            groupCb.checked = !areAllSelected;
        });
    });


    // Initial load of tabs when the popup opens
    loadTabs();
});
