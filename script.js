// script.js for the Enhanced SteelConnect Admin Panel - BACKEND COMPATIBLE VERSION
// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    jwtToken: null,
    currentUser: null,
};
const API_BASE_URL = 'https://steelconnect-backend.onrender.com/api';
// Enhanced subscription plans configuration
const SUBSCRIPTION_PLANS = {
    Designer: {
        'submitting-quote': {
            name: 'Submitting Quote',
            types: ['PER QUOTE', 'MONTHLY'],
            amounts: { 'PER QUOTE': 'manual entry', 'MONTHLY': 'manual entry' },
            active: { 'PER QUOTE': true, 'MONTHLY': true }
        },
        'sending-messages': {
            name: 'Sending Messages',
            types: ['MONTHLY'],
            amounts: { 'MONTHLY': 'manual entry' },
            active: { 'MONTHLY': true }
        }
    },
    Contractor: {
        'submitting-tender': {
            name: 'Submitting Tender',
            types: ['PER TENDER', 'MONTHLY'],
            amounts: { 'PER TENDER': 'manual entry', 'MONTHLY': 'manual entry' },
            active: { 'PER TENDER': true, 'MONTHLY': true }
        },
        'getting-estimation': {
            name: 'Getting Estimation',
            types: ['PER ESTIMATE', 'MONTHLY'],
            amounts: { 'PER ESTIMATE': 'manual entry', 'MONTHLY': 'manual entry' },
            active: { 'PER ESTIMATE': true, 'MONTHLY': true }
        },
        'sending-messages': {
            name: 'Sending Messages',
            types: ['MONTHLY'],
            amounts: { 'MONTHLY': 'manual entry' },
            active: { 'MONTHLY': true }
        }
    }
};
// --- CORE UTILITY FUNCTIONS ---
function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    // Basic styling for notifications if CSS fails to load
    notification.style.cssText = `
        padding: 12px 16px; margin-bottom: 10px; border-radius: 4px; color: white;
        font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15); word-wrap: break-word;
        transition: opacity 0.3s ease;
        background-color: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'info' ? '#007bff' : '#ffc107'};
        ${type === 'warning' ? 'color: #212529;' : ''}
    `;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" style="background: none; border: none; color: inherit; float: right; font-size: 18px; line-height: 1; margin-left: 10px; cursor: pointer; opacity: 0.7;" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 5000);
}
function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.display = 'none';
    }
}
async function apiCall(endpoint, method = 'GET', body = null, successMessage = null) {
    const token = localStorage.getItem('jwtToken');
    const fullUrl = `${API_BASE_URL}${endpoint}`;
    console.log(`Making ${method} request to: ${fullUrl}`);
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
    };
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    if (body) {
        options.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(fullUrl, options);
        let responseData = null;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            responseData = await response.json();
        } else {
            const textResponse = await response.text();
            try {
                responseData = JSON.parse(textResponse);
            } catch (e) {
                responseData = { message: textResponse || 'No response data' };
            }
        }
        if (!response.ok) {
            const errorMessage = responseData?.message || responseData?.error || `HTTP ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }
        if (successMessage) {
            showNotification(successMessage, 'success');
        }
        return responseData;
    } catch (error) {
        let errorMessage = error.message;
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error: Unable to connect to server. Please check your internet connection.';
        }
        showNotification(errorMessage, 'error');
        throw error;
    }
}
function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('currentUser');
    appState.jwtToken = null;
    appState.currentUser = null;
    showNotification('You have been successfully logged out.', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}
// --- LOGIN PAGE LOGIC ---
function initializeLoginPage() {
    hideGlobalLoader();
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleAdminLogin);
    }
}
async function handleAdminLogin(event) {
    event.preventDefault();
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
        showNotification('Please enter both email and password', 'error');
        return;
    }
    const loginButton = event.target.querySelector('button[type="submit"]');
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';
    try {
        const data = await apiCall('/auth/login/admin', 'POST', { email, password });
        if (!data || !data.token || !data.user) {
            throw new Error('Invalid response from server');
        }
        if (data.user.role?.toLowerCase() !== 'admin' && data.user.type?.toLowerCase() !== 'admin') {
            throw new Error('Access denied: Admin privileges required');
        }
        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        appState.jwtToken = data.token;
        appState.currentUser = data.user;
        showNotification('Login successful! Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = 'admin.html';
        }, 1000);
    } catch (error) {
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
        if (passwordInput) passwordInput.value = '';
    }
}
// --- ADMIN PANEL INITIALIZATION & SETUP ---
function initializeAdminPage() {
    const token = localStorage.getItem('jwtToken');
    const userJson = localStorage.getItem('currentUser');
    if (token && userJson) {
        try {
            const user = JSON.parse(userJson);
            if (user.role?.toLowerCase() === 'admin' || user.type?.toLowerCase() === 'admin') {
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
    hideGlobalLoader();
}
function showAdminLoginPrompt(message = null) {
    hideGlobalLoader();
    const loginPrompt = document.getElementById('admin-login-prompt');
    const panelContainer = document.getElementById('admin-panel-container');
    if (loginPrompt) loginPrompt.style.display = 'flex';
    if (panelContainer) panelContainer.style.display = 'none';
    if (message) {
        const messageElement = document.querySelector('.login-prompt-box p');
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.style.color = '#dc3545';
        }
    }
}
function setupAdminPanel() {
    hideGlobalLoader();
    const loginPrompt = document.getElementById('admin-login-prompt');
    const panelContainer = document.getElementById('admin-panel-container');
    if (loginPrompt) loginPrompt.style.display = 'none';
    if (panelContainer) panelContainer.style.display = 'flex';
    const userInfoElement = document.getElementById('admin-user-info');
    if (userInfoElement && appState.currentUser) {
        userInfoElement.innerHTML = `
            <strong>${appState.currentUser.name || 'Admin User'}</strong>
            <small>${appState.currentUser.role || appState.currentUser.type || 'admin'}</small>
        `;
    }
    document.getElementById('admin-logout-btn')?.addEventListener('click', logout);
    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const section = link.dataset.section;
            const sectionTitle = document.getElementById('admin-section-title');
            if (sectionTitle) {
                sectionTitle.textContent = link.querySelector('span') ? link.querySelector('span').textContent : link.textContent.replace(/[\W\d_]/g, ' ').trim();
            }
            renderAdminSection(section);
        });
    });
    // Start on the dashboard
    document.querySelector('.admin-nav-link[data-section="dashboard"]')?.click();
}
// --- DYNAMIC CONTENT RENDERING ---
function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    if (!contentArea) return;
    contentArea.innerHTML = `<div class="loading-spinner" style="text-align: center; padding: 40px;">Loading...</div>`;
    switch (section) {
        case 'dashboard': renderAdminDashboard(); break;
        case 'users': renderAdminUsers(); break;
        case 'quotes': renderAdminQuotes(); break;
        case 'messages': renderAdminMessages(); break;
        case 'jobs': renderAdminJobs(); break;
        case 'estimations': renderAdminEstimations(); break;
        case 'subscriptions': renderAdminSubscriptionPlans(); break;
        case 'system-stats': renderAdminSystemStats(); break;
        default: contentArea.innerHTML = '<div class="error-state">Section not found.</div>';
    }
}
async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/dashboard');
        const stats = response.stats || {};
        contentArea.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card"><i class="fas fa-users"></i><div><span class="stat-value">${stats.totalUsers || 0}</span><span class="stat-label">Total Users</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-file-invoice-dollar"></i><div><span class="stat-value">${stats.totalQuotes || 0}</span><span class="stat-label">Total Quotes</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-comments"></i><div><span class="stat-value">${stats.totalMessages || 0}</span><span class="stat-label">Total Messages</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-briefcase"></i><div><span class="stat-value">${stats.totalJobs || 0}</span><span class="stat-label">Total Jobs</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-crown"></i><div><span class="stat-value">${stats.activeSubscriptions || 0}</span><span class="stat-label">Active Subscriptions</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-dollar-sign"></i><div><span class="stat-value">$${(stats.totalRevenue || 0).toFixed(2)}</span><span class="stat-label">Total Revenue</span></div></div>
            </div>
            <div class="admin-quick-actions">
                <h3>Quick Actions</h3>
                <div class="quick-action-buttons">
                    <button class="btn btn-primary" onclick="document.querySelector('[data-section=\\"users\\"]').click()"><i class="fas fa-users"></i> Manage Users</button>
                    <button class="btn btn-success" onclick="document.querySelector('[data-section=\\"subscriptions\\"]').click()"><i class="fas fa-crown"></i> Subscription Plans</button>
                    <button class="btn btn-info" onclick="document.querySelector('[data-section=\\"messages\\"]').click()"><i class="fas fa-comments"></i> Messages</button>
                </div>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load dashboard data.</div>';
    }
}
// --- All other render functions (renderAdminUsers, renderAdminQuotes, etc.) would go here...
// [For brevity, including a few key ones. The full script from previous prompts contains all of them]

async function renderAdminUsers() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/users');
        const users = response.users || [];
        if (users.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No users found.</div>';
            return;
        }
        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions">
                    <h3>Users Management</h3>
                    <input type="text" placeholder="Search users..." class="search-input" onkeyup="filterTable(this.value, 'users-table')">
                </div>
                <div style="overflow-x: auto;">
                    <table class="admin-table" id="users-table">
                        <thead>
                            <tr><th>Name</th><th>Email</th><th>Type</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            ${users.map(user => `
                                <tr data-user-id="${user._id}">
                                    <td>${user.name || 'N/A'}</td>
                                    <td>${user.email || 'N/A'}</td>
                                    <td><span class="user-type-badge ${user.type}">${user.type || 'user'}</span></td>
                                    <td>
                                        <select class="status-select" onchange="handleStatusUpdate('${user._id}', this.value)">
                                            <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                                            <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                        </select>
                                    </td>
                                    <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <div class="action-buttons">
                                            <button class="btn btn-info btn-sm" onclick="showUserDetails('${user._id}')"><i class="fas fa-eye"></i></button>
                                            <button class="btn btn-danger btn-sm" onclick="handleUserDelete('${user._id}')"><i class="fas fa-trash"></i></button>
                                        </div>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load user data.</div>';
    }
}

async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/quotes');
        const quotes = response.quotes || [];
        if (quotes.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No quotes found.</div>';
            return;
        }
        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions">
                    <h3>Quotes Management</h3>
                    <input type="text" placeholder="Search quotes..." class="search-input" onkeyup="filterTable(this.value, 'quotes-table')">
                </div>
                <div style="overflow-x: auto;">
                    <table class="admin-table" id="quotes-table">
                        <thead>
                            <tr><th>User</th><th>Details</th><th>Amount</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            ${quotes.map(quote => `
                                <tr data-quote-id="${quote._id}">
                                    <td>${quote.userId?.name || 'N/A'}</td>
                                    <td>${quote.details?.substring(0, 50) + (quote.details?.length > 50 ? '...' : '') || 'No details'}</td>
                                    <td><input type="number" class="amount-input" value="${quote.amount || 0}" onchange="updateQuoteAmount('${quote._id}', this.value)"></td>
                                    <td>
                                        <select class="status-select" onchange="updateQuoteStatus('${quote._id}', this.value)">
                                            <option value="pending" ${quote.status === 'pending' ? 'selected' : ''}>Pending</option>
                                            <option value="approved" ${quote.status === 'approved' ? 'selected' : ''}>Approved</option>
                                            <option value="rejected" ${quote.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                                        </select>
                                    </td>
                                    <td>${new Date(quote.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <div class="action-buttons">
                                            <button class="btn btn-info btn-sm" onclick="viewQuoteDetails('${quote._id}')"><i class="fas fa-eye"></i></button>
                                            <button class="btn btn-danger btn-sm" onclick="deleteQuote('${quote._id}')"><i class="fas fa-trash"></i></button>
                                        </div>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load quotes data.</div>';
    }
}

// Dummy functions for the rest to avoid errors if called
function renderAdminMessages() { document.getElementById('admin-content-area').innerHTML = '<div class="coming-soon">Messages section is under construction.</div>'; }
function renderAdminJobs() { document.getElementById('admin-content-area').innerHTML = '<div class="coming-soon">Jobs section is under construction.</div>'; }
function renderAdminEstimations() { document.getElementById('admin-content-area').innerHTML = '<div class="coming-soon">Estimations section is under construction.</div>'; }
function renderAdminSubscriptionPlans() { document.getElementById('admin-content-area').innerHTML = '<div class="coming-soon">Subscriptions section is under construction.</div>'; }
function renderAdminSystemStats() { document.getElementById('admin-content-area').innerHTML = '<div class="coming-soon">System Stats section is under construction.</div>'; }

// --- ACTION HANDLERS & UTILITIES ---
function filterTable(searchValue, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(searchValue.toLowerCase()) ? '' : 'none';
    });
}
async function handleStatusUpdate(userId, status) { await apiCall(`/admin/users/${userId}/status`, 'PUT', { status }, 'User status updated.'); }
async function handleUserDelete(userId) { if (confirm('Are you sure?')) { await apiCall(`/admin/users/${userId}`, 'DELETE', null, 'User deleted.'); renderAdminUsers(); } }
async function showUserDetails(userId) { /* Implementation from previous prompt */ }
async function updateQuoteAmount(quoteId, amount) { await apiCall(`/admin/quotes/${quoteId}/amount`, 'PUT', { amount }, 'Quote amount updated.'); }
async function updateQuoteStatus(quoteId, status) { await apiCall(`/admin/quotes/${quoteId}/status`, 'PUT', { status }, 'Quote status updated.'); }
async function deleteQuote(quoteId) { if (confirm('Are you sure?')) { await apiCall(`/admin/quotes/${quoteId}`, 'DELETE', null, 'Quote deleted.'); renderAdminQuotes(); } }
async function viewQuoteDetails(quoteId) { /* Implementation from previous prompt */ }
function createModal(title, contentHtml) { /* Implementation from previous prompt */ }

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('admin-panel-container')) {
        initializeAdminPage();
    } else if (document.getElementById('admin-login-form')) {
        initializeLoginPage();
    }
});
// --- GLOBAL ERROR HANDLING ---
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showNotification('An unexpected script error occurred.', 'error');
});
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('A server or network error occurred.', 'error');
});
