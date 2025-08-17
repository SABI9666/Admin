// script.js for the SteelConnect Admin Panel

// --- CONFIGURATION & GLOBAL STATE ---

const appState = {
    jwtToken: null,
    currentUser: null,
};

// The base URL for your backend API.
// This should match the URL where your server is deployed.
const API_BASE_URL = 'https://steelconnect-backend.onrender.com/api';


// --- CORE UTILITY FUNCTIONS ---

/**
 * Shows a temporary notification message on the screen.
 * @param {string} message The message to display.
 * @param {string} type The type of notification ('success', 'error', 'info').
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.error('Fatal: Notification container element not found in the DOM!');
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(notification);

    // Automatically remove the notification after 5 seconds for a clean user experience.
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300); // Allow for fade-out transition
    }, 5000);
}

/**
 * A centralized and reusable function to handle all API requests.
 * It automatically includes the authorization token and handles errors.
 * @param {string} endpoint The API endpoint (e.g., '/admin/dashboard').
 * @param {string} method The HTTP method ('GET', 'POST', 'PUT', 'DELETE').
 * @param {object|null} body The request payload for POST/PUT requests.
 * @param {string|null} successMessage A message to show upon a successful request.
 * @returns {Promise<any>} The JSON response from the server.
 */
async function apiCall(endpoint, method = 'GET', body = null, successMessage = null) {
    const token = localStorage.getItem('jwtToken');
    const fullUrl = `${API_BASE_URL}${endpoint}`;

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(fullUrl, options);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'An unknown server error occurred.' }));
            throw new Error(errorData.message || `Request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (successMessage) {
            showNotification(successMessage, 'success');
        }

        return data;
    } catch (error) {
        showNotification(error.message, 'error');
        console.error(`API Call Failed: ${method} ${fullUrl}`, error);
        throw error; // Re-throw to allow calling function to handle it
    }
}

/**
 * Logs the user out by clearing credentials and redirecting to the homepage.
 */
function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('currentUser');
    showNotification('You have been successfully logged out.', 'success');
    setTimeout(() => window.location.href = 'index.html', 1000); // Redirect after a short delay
}


// --- ADMIN PANEL INITIALIZATION & SETUP ---

/**
 * Main entry point for the admin page logic. Checks for admin credentials.
 */
function initializeAdminPage() {
    const adminPanel = document.getElementById('admin-panel-container');
    if (!adminPanel) return; // Exit if not on the admin page

    const token = localStorage.getItem('jwtToken');
    const userJson = localStorage.getItem('currentUser');

    if (token && userJson) {
        try {
            const user = JSON.parse(userJson);
            // CRITICAL SECURITY CHECK: Verify the user has the 'admin' role.
            if (user.role === 'admin') {
                appState.jwtToken = token;
                appState.currentUser = user;
                setupAdminPanel();
            } else {
                showAdminLoginPrompt("Access Denied: You do not have admin privileges.");
            }
        } catch (error) {
            showAdminLoginPrompt("Invalid user data found. Please log in again.");
        }
    } else {
        showAdminLoginPrompt();
    }
}

/**
 * Displays the login prompt and hides the admin panel.
 * @param {string|null} message An optional message to display on the prompt.
 */
function showAdminLoginPrompt(message = null) {
    document.getElementById('admin-login-prompt').style.display = 'flex';
    document.getElementById('admin-panel-container').style.display = 'none';
    if (message) {
        document.querySelector('.login-prompt-box p').textContent = message;
    }
}

/**
 * Sets up the admin panel UI, event listeners, and loads the initial dashboard view.
 */
function setupAdminPanel() {
    document.getElementById('admin-login-prompt').style.display = 'none';
    document.getElementById('admin-panel-container').style.display = 'flex';

    // Populate user info in the sidebar
    document.getElementById('admin-user-info').innerHTML = `
        <strong>${appState.currentUser.name}</strong>
        <small>${appState.currentUser.role}</small>
    `;
    document.getElementById('admin-logout-btn').addEventListener('click', logout);

    // Setup navigation links
    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const section = link.dataset.section;
            document.getElementById('admin-section-title').textContent = link.textContent.trim();
            renderAdminSection(section);
        });
    });

    // Load the default view (Dashboard)
    renderAdminSection('dashboard');
}


// --- DYNAMIC CONTENT RENDERING ---

/**
 * Renders the content for a specific admin section.
 * @param {string} section The name of the section to render.
 */
function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    switch (section) {
        case 'dashboard':
            renderAdminDashboard();
            break;
        case 'users':
            renderAdminUsers();
            break;
        case 'quotes':
            contentArea.innerHTML = '<div class="empty-state">Quotes overview section is under construction.</div>';
            break;
        case 'system-stats':
            renderAdminSystemStats();
            break;
        default:
            contentArea.innerHTML = '<div class="error-state">Section not found.</div>';
    }
}

async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/dashboard');
        const stats = response.stats;

        contentArea.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <i class="fas fa-users"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalUsers}</span>
                        <span class="stat-label">Total Users</span>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <i class="fas fa-comments"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalMessages}</span>
                        <span class="stat-label">Total Messages</span>
                    </div>
                </div>
                 <div class="admin-stat-card">
                    <i class="fas fa-file-invoice-dollar"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalQuotes}</span>
                        <span class="stat-label">Total Quotes</span>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load dashboard data. Please try again later.</div>';
    }
}

async function renderAdminUsers() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/users');
        const users = response.users;

        if (!users || users.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No users found in the system.</div>';
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => `
                            <tr data-user-id="${user._id}">
                                <td>${user.name}</td>
                                <td>${user.email}</td>
                                <td><span class="user-role-badge ${user.role}">${user.role}</span></td>
                                <td>
                                    <select class="status-select" onchange="handleStatusUpdate('${user._id}', this.value)">
                                        <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                    </select>
                                </td>
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="handleUserDelete('${user._id}')">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load user data. Please try again later.</div>';
    }
}

async function renderAdminSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/system-stats');
        const stats = response.stats;

        contentArea.innerHTML = `
            <div class="system-stats-container">
                <h3>System Information</h3>
                <ul>
                    <li><strong>Node.js Version:</strong> ${stats.nodeVersion}</li>
                    <li><strong>Platform:</strong> ${stats.platform}</li>
                    <li><strong>Server Uptime:</strong> ${(stats.serverUptime / 3600).toFixed(2)} hours</li>
                    <li><strong>Memory Usage (Heap Used):</strong> ${(stats.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB</li>
                </ul>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load system stats.</div>';
    }
}


// --- EVENT HANDLERS FOR USER ACTIONS ---

async function handleStatusUpdate(userId, newStatus) {
    if (confirm(`Are you sure you want to change this user's status to "${newStatus}"?`)) {
        await apiCall(`/admin/users/${userId}/status`, 'PUT', { status: newStatus }, 'User status updated successfully.')
            .then(() => renderAdminUsers()) // Refresh the user list on success
            .catch(() => renderAdminUsers()); // Also refresh on failure to revert dropdown
    } else {
       // If the admin cancels the confirmation, refresh to revert the visual change in the dropdown
       renderAdminUsers();
    }
}

async function handleUserDelete(userId) {
    if (confirm('WARNING: Are you sure you want to permanently delete this user? This action cannot be undone.')) {
        await apiCall(`/admin/users/${userId}`, 'DELETE', null, 'User deleted successfully.')
            .then(() => renderAdminUsers()) // Refresh the user list
            .catch(() => {}); // Error is already shown by apiCall
    }
}

// --- INITIALIZATION TRIGGER ---
// Start the admin page logic once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', initializeAdminPage);
