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
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
        `;
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        padding: 12px 16px;
        margin-bottom: 10px;
        border-radius: 4px;
        color: white;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        word-wrap: break-word;
        transition: opacity 0.3s ease;
        ${type === 'success' ? 'background-color: #28a745;' : ''}
        ${type === 'error' ? 'background-color: #dc3545;' : ''}
        ${type === 'info' ? 'background-color: #007bff;' : ''}
        ${type === 'warning' ? 'background-color: #ffc107; color: #212529;' : ''}
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
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
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
        // CORRECTED LINE: Made the check case-insensitive and safer against missing properties.
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
        document.getElementById('password').value = '';
    }
}
// --- ADMIN PANEL INITIALIZATION & SETUP ---
function initializeAdminPage() {
    const token = localStorage.getItem('jwtToken');
    const userJson = localStorage.getItem('currentUser');
    if (token && userJson) {
        try {
            const user = JSON.parse(userJson);
            // CORRECTED LINE: Made the check case-insensitive and safer against missing properties.
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
                sectionTitle.textContent = link.textContent.trim();
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
        case 'dashboard':
            renderAdminDashboard();
            break;
        case 'users':
            renderAdminUsers();
            break;
        case 'quotes':
            renderAdminQuotes();
            break;
        case 'messages':
            renderAdminMessages();
            break;
        case 'jobs':
            renderAdminJobs();
            break;
        case 'subscriptions':
            renderAdminSubscriptionPlans(); // Updated to show plans instead of user subscriptions
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
// --- USERS SECTION ---
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
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
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
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load user data.</div>';
    }
}
// --- QUOTES SECTION ---
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
                    <div>
                        <input type="text" placeholder="Search quotes..." class="search-input" onkeyup="filterTable(this.value, 'quotes-table')">
                        <select onchange="filterTableByStatus(this.value, 'quotes-table')" class="filter-select">
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>
                </div>
                <div style="overflow-x: auto;">
                    <table class="admin-table" id="quotes-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Details</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${quotes.map(quote => `
                                <tr data-quote-id="${quote._id}">
                                    <td>${quote.userId?.name || 'N/A'}</td>
                                    <td class="quote-details">
                                        <div title="${quote.details || ''}">${quote.details?.substring(0, 50) + (quote.details?.length > 50 ? '...' : '') || 'No details'}</div>
                                    </td>
                                    <td><input type="number" class="amount-input" value="${quote.amount || 0}" onchange="updateQuoteAmount('${quote._id}', this.value)"></td>
                                    <td>
                                        <select class="status-select" onchange="updateQuoteStatus('${quote._id}', this.value)">
                                            <option value="pending" ${quote.status === 'pending' ? 'selected' : ''}>Pending</option>
                                            <option value="approved" ${quote.status === 'approved' ? 'selected' : ''}>Approved</option>
                                            <option value="rejected" ${quote.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                                            <option value="completed" ${quote.status === 'completed' ? 'selected' : ''}>Completed</option>
                                        </select>
                                    </td>
                                    <td>${new Date(quote.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <div class="action-buttons">
                                            <button class="btn btn-info btn-sm" onclick="viewQuoteDetails('${quote._id}')"><i class="fas fa-eye"></i></button>
                                            <button class="btn btn-danger btn-sm" onclick="deleteQuote('${quote._id}')"><i class="fas fa-trash"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load quotes data.</div>';
    }
}
// --- ENHANCED MESSAGES SECTION ---
async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/messages');
        const messages = response.messages || [];
        if (messages.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No messages found.</div>';
            return;
        }
        // Deduplicate users for the filter dropdown
        const users = [...new Map(messages.filter(m => m.senderId).map(m => [m.senderId._id, m.senderId])).values()];
        contentArea.innerHTML = `
            <div class="messages-container">
                <div class="messages-header">
                    <h3>Messages Management</h3>
                    <div class="messages-controls">
                        <input type="text"
                                placeholder="Search messages..."
                                class="search-input"
                                id="message-search"
                               onkeyup="filterMessages()">
                        <select onchange="filterMessages()" class="filter-select" id="message-user-filter">
                            <option value="">All Users</option>
                            ${users.map(user => `<option value="${user._id}">${user.name}</option>`).join('')}
                        </select>
                        <button class="btn btn-secondary" onclick="refreshMessages()">
                            <i class="fas fa-refresh"></i> Refresh
                        </button>
                    </div>
                </div>
                                <div class="messages-layout">
                    <div class="messages-list-panel">
                        <div class="messages-list" id="messages-list">
                            ${messages.map((message, index) => `
                                <div class="message-item"
                                      data-message-id="${message._id}"
                                      data-user-id="${message.senderId?._id}"
                                      data-message-content="${encodeURIComponent(JSON.stringify(message))}"
                                      onclick="selectMessage(this, ${index})">
                                    <div class="message-item-header">
                                        <div class="message-sender">
                                            <i class="fas fa-user"></i>
                                            <strong>${message.senderId?.name || 'Unknown'}</strong>
                                        </div>
                                        <div class="message-date">
                                            ${new Date(message.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div class="message-preview">
                                        ${message.content?.substring(0, 100) + (message.content?.length > 100 ? '...' : '')}
                                    </div>
                                    <div class="message-meta">
                                        <span class="message-to">To: ${message.receiverId?.name || 'Admin'}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                                        <div class="message-detail-panel" id="message-detail-panel">
                        <div class="no-message-selected">
                            <i class="fas fa-comments fa-3x"></i>
                            <h4>Select a message to view details</h4>
                            <p>Choose a message from the list to read, reply, or manage it.</p>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .messages-container {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }
                .messages-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    border-bottom: 1px solid #e0e0e0;
                    background: #f8f9fa;
                }
                .messages-controls {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .messages-layout {
                    display: flex;
                    flex: 1;
                    min-height: 600px;
                }
                .messages-list-panel {
                    width: 40%;
                    border-right: 1px solid #e0e0e0;
                    background: #fff;
                }
                .messages-list {
                    height: 100%;
                    overflow-y: auto;
                }
                .message-item {
                    padding: 15px;
                    border-bottom: 1px solid #f0f0f0;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                .message-item:hover {
                    background-color: #f8f9fa;
                }
                .message-item.active {
                    background-color: #e3f2fd;
                    border-left: 4px solid #2196f3;
                }
                .message-item.hidden {
                    display: none;
                }
                .message-item-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .message-sender {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                    color: #333;
                }
                .message-date {
                    font-size: 0.85em;
                    color: #666;
                }
                .message-preview {
                    color: #555;
                    margin-bottom: 8px;
                    line-height: 1.4;
                }
                .message-meta {
                    font-size: 0.85em;
                    color: #777;
                }
                .message-detail-panel {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: #fff;
                }
                .no-message-selected {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: #999;
                    text-align: center;
                }
                .message-detail-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                .message-detail-header {
                    padding: 20px;
                    border-bottom: 1px solid #e0e0e0;
                    background: #f8f9fa;
                }
                .message-detail-body {
                    flex: 1;
                    padding: 20px;
                    overflow-y: auto;
                }
                .message-bubble {
                    max-width: 80%;
                    padding: 12px 16px;
                    border-radius: 12px;
                    margin-bottom: 15px;
                    word-wrap: break-word;
                }
                .message-bubble.received {
                    background: #f1f3f4;
                    color: #333;
                    align-self: flex-start;
                }
                .message-bubble.sent {
                    background: #2196f3;
                    color: white;
                    align-self: flex-end;
                    margin-left: auto;
                }
                .message-timestamp {
                    font-size: 0.8em;
                    opacity: 0.7;
                    margin-top: 5px;
                }
                .message-reply-form {
                    padding: 20px;
                    border-top: 1px solid #e0e0e0;
                    background: #f8f9fa;
                }
                .message-reply-form textarea {
                    width: 100%;
                    min-height: 100px;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    resize: vertical;
                    font-family: inherit;
                }
                .message-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 15px;
                }
                .message-detail-actions {
                    padding: 15px 20px;
                    background: #fff;
                    border-bottom: 1px solid #e0e0e0;
                    display: flex;
                    gap: 10px;
                }
            </style>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load messages.</div>';
    }
}
// --- ENHANCED SUBSCRIPTION PLANS SECTION ---
async function renderAdminSubscriptionPlans() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        // Use the enhanced SUBSCRIPTION_PLANS object
        const plansData = await Promise.resolve(SUBSCRIPTION_PLANS);
        let html = `
            <div class="subscription-plans-container">
                <div class="plans-header">
                    <h3>Subscription Plans Management</h3>
                    <div class="plans-actions">
                        <button class="btn btn-success" onclick="saveAllPlans()">
                            <i class="fas fa-save"></i> Save All Changes
                        </button>
                        <button class="btn btn-secondary" onclick="resetPlans()">
                            <i class="fas fa-undo"></i> Reset to Default
                        </button>
                    </div>
                </div>
        `;
        for (const userType in plansData) {
            html += `
                <div class="admin-table-container plan-group">
                    <div class="table-actions">
                        <h4>${userType} Plans</h4>
                        <span class="plan-count">${Object.keys(plansData[userType]).length} activities</span>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="admin-table subscription-plans-table" id="${userType}-plans-table">
                            <thead>
                                <tr>
                                    <th>Activity</th>
                                    <th>Subscription Type</th>
                                    <th>Amount</th>
                                    <th>Active/Inactive</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>`
            const activities = plansData[userType];
            for (const activityKey in activities) {
                const activity = activities[activityKey];
                activity.types.forEach(type => {
                    const planId = `${userType}-${activityKey}-${type}`.replace(/\s+/g, '-');
                    const currentAmount = activity.amounts ? activity.amounts[type] : 'manual entry';
                    const isActive = activity.active ? activity.active[type] : true;
                    html += `
                        <tr data-plan-id="${planId}" data-user-type="${userType}" data-activity="${activityKey}" data-type="${type}">
                            <td><strong>${activity.name}</strong></td>
                            <td>
                                <span class="subscription-type-badge ${type.replace(/\s+/g, '-').toLowerCase()}">
                                    ${type}
                                </span>
                            </td>
                            <td>
                                <input type="text"
                                        class="amount-input"
                                        value="${currentAmount}"
                                        placeholder="e.g., 50 or 5% or manual entry"
                                       onchange="updatePlanAmount('${planId}', this.value)">
                            </td>
                            <td>
                                <label class="switch">
                                    <input type="checkbox"
                                            ${isActive ? 'checked' : ''}
                                            onchange="updatePlanStatus('${planId}', this.checked)">
                                    <span class="slider round"></span>
                                </label>
                            </td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-info btn-sm" onclick="editPlanDetails('${planId}')">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="deletePlan('${planId}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
            }
            html += `
                            </tbody>
                        </table>
                        <div class="add-plan-row">
                            <button class="btn btn-primary btn-sm" onclick="addNewPlan('${userType}')">
                                <i class="fas fa-plus"></i> Add New Activity
                            </button>
                        </div>
                    </div>
                </div>`;
        }
        html += `
            </div>
            <style>
                .subscription-plans-container {
                    padding: 20px;
                }
                .plans-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .plans-actions {
                    display: flex;
                    gap: 10px;
                }
                .plan-group {
                    margin-bottom: 30px;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .plan-group .table-actions {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .plan-count {
                    background: rgba(255,255,255,0.2);
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.9em;
                }
                .subscription-plans-table {
                    margin: 0;
                }
                .subscription-type-badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.8em;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .subscription-type-badge.per-quote,
                .subscription-type-badge.per-tender,
                .subscription-type-badge.per-estimate {
                    background: #fff3cd;
                    color: #856404;
                }
                .subscription-type-badge.monthly {
                    background: #d1ecf1;
                    color: #0c5460;
                }
                .amount-input {
                    width: 100%;
                    max-width: 200px;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 0.9em;
                }
                .switch {
                    position: relative;
                    display: inline-block;
                    width: 60px;
                    height: 34px;
                }
                .switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #ccc;
                    transition: .4s;
                }
                .slider:before {
                    position: absolute;
                    content: "";
                    height: 26px;
                    width: 26px;
                    left: 4px;
                    bottom: 4px;
                    background-color: white;
                    transition: .4s;
                }
                input:checked + .slider {
                    background-color: #2196F3;
                }
                input:focus + .slider {
                    box-shadow: 0 0 1px #2196F3;
                }
                input:checked + .slider:before {
                    transform: translateX(26px);
                }
                .slider.round {
                    border-radius: 34px;
                }
                .slider.round:before {
                    border-radius: 50%;
                }
                .add-plan-row {
                    padding: 15px 20px;
                    background: #f8f9fa;
                    border-top: 1px solid #e0e0e0;
                    text-align: center;
                }
            </style>
        `;
        contentArea.innerHTML = html;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load subscription plans.</div>';
    }
}
// --- JOBS SECTION (PLACEHOLDER) ---
async function renderAdminJobs() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        // This would typically fetch from an API endpoint
        contentArea.innerHTML = `
            <div class="coming-soon">
                <i class="fas fa-briefcase fa-3x"></i>
                <h3>Jobs Management</h3>
                <p>Job management features are coming soon.</p>
                <button class="btn btn-primary" onclick="showNotification('Jobs feature will be implemented soon!', 'info')">
                    Learn More
                </button>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load jobs data.</div>';
    }
}
// --- SYSTEM STATS SECTION (PLACEHOLDER) ---
function renderAdminSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-chart-bar fa-3x"></i>
            <h3>System Statistics</h3>
            <p>Advanced system statistics and analytics are coming soon.</p>
        </div>
    `;
}
// --- ENHANCED MESSAGE HANDLING FUNCTIONS ---
function selectMessage(element, messageIndex) {
    // Remove active class from all message items
    document.querySelectorAll('.message-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    const messageData = JSON.parse(decodeURIComponent(element.dataset.messageContent));
    const detailPanel = document.getElementById('message-detail-panel');
    detailPanel.innerHTML = `
        <div class="message-detail-content">
            <div class="message-detail-header">
                <div class="message-header-info">
                    <h4>
                        <i class="fas fa-user"></i>
                        ${messageData.senderId?.name || 'Unknown User'}
                    </h4>
                    <p class="message-meta-info">
                        <span><i class="fas fa-envelope"></i> ${messageData.senderId?.email || 'N/A'}</span>
                        <span><i class="fas fa-clock"></i> ${new Date(messageData.createdAt).toLocaleString()}</span>
                    </p>
                </div>
                <div class="message-detail-actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteMessage('${messageData._id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
            <div class="message-detail-body">
                <div class="message-thread">
                    <div class="message-bubble received">
                        <p>${messageData.content}</p>
                        <div class="message-timestamp">
                            ${new Date(messageData.createdAt).toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>
            <div class="message-reply-form">
                <textarea id="reply-textarea-${messageData._id}"
                           placeholder="Type your reply here..."
                           rows="4"></textarea>
                <div class="message-actions">
                    <button class="btn btn-primary" onclick="handleSendMessage('${messageData._id}')">
                        <i class="fas fa-paper-plane"></i> Send Reply
                    </button>
                    <button class="btn btn-secondary" onclick="clearReply('${messageData._id}')">
                        <i class="fas fa-times"></i> Clear
                    </button>
                </div>
            </div>
        </div>
    `;
}
async function handleSendMessage(messageId) {
    const replyTextarea = document.getElementById(`reply-textarea-${messageId}`);
    const replyContent = replyTextarea.value.trim();
    if (!replyContent) {
        showNotification('Reply cannot be empty.', 'error');
        return;
    }
    try {
        await apiCall(`/admin/messages/reply/${messageId}`, 'POST', { content: replyContent }, 'Reply sent successfully!');
        replyTextarea.value = '';
        // Add the reply to the message thread
        const messageThread = document.querySelector('.message-thread');
        if (messageThread) {
            const replyBubble = document.createElement('div');
            replyBubble.className = 'message-bubble sent';
            replyBubble.innerHTML = `
                <p>${replyContent}</p>
                <div class="message-timestamp">
                    ${new Date().toLocaleString()}
                </div>
            `;
            messageThread.appendChild(replyBubble);
        }
    } catch (error) {
        // Error is handled by apiCall
    }
}
function clearReply(messageId) {
    const replyTextarea = document.getElementById(`reply-textarea-${messageId}`);
    if (replyTextarea) {
        replyTextarea.value = '';
    }
}
async function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/messages/${messageId}`, 'DELETE', null, 'Message deleted successfully!');
            // Remove the message from the list
            const messageItem = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageItem) {
                messageItem.remove();
            }
            // Clear the detail panel
            const detailPanel = document.getElementById('message-detail-panel');
            if (detailPanel) {
                detailPanel.innerHTML = `
                    <div class="no-message-selected">
                        <i class="fas fa-comments fa-3x"></i>
                        <h4>Select a message to view details</h4>
                        <p>Choose a message from the list to read, reply, or manage it.</p>
                    </div>
                `;
            }
        } catch (error) {
            // Error is handled by apiCall
        }
    }
}
function refreshMessages() {
    renderAdminMessages();
    showNotification('Messages refreshed!', 'success');
}
function filterMessages() {
    const searchText = document.getElementById('message-search').value.toLowerCase();
    const userId = document.getElementById('message-user-filter').value;
    const messages = document.querySelectorAll('.message-item');
    messages.forEach(message => {
        const content = message.textContent.toLowerCase();
        const msgUserId = message.dataset.userId;
        const matchesSearch = !searchText || content.includes(searchText);
        const matchesUser = !userId || msgUserId === userId;
        if (matchesSearch && matchesUser) {
            message.classList.remove('hidden');
        } else {
            message.classList.add('hidden');
        }
    });
}
// --- SUBSCRIPTION PLANS MANAGEMENT FUNCTIONS ---
function updatePlanAmount(planId, amount) {
    // Store the change in memory or prepare for API call
    console.log(`Plan ${planId} amount updated to: ${amount}`);
    // In a real implementation, you might want to debounce this and batch updates
}
function updatePlanStatus(planId, isActive) {
    console.log(`Plan ${planId} status updated to: ${isActive ? 'Active' : 'Inactive'}`);
    // In a real implementation, this would make an API call
}
function editPlanDetails(planId) {
    const row = document.querySelector(`[data-plan-id="${planId}"]`);
    if (!row) return;
    const userType = row.dataset.userType;
    const activity = row.dataset.activity;
    const type = row.dataset.type;
    const currentAmount = row.querySelector('.amount-input').value;
    const modalContent = `
        <div class="plan-edit-form">
            <div class="form-group">
                <label>User Type:</label>
                <input type="text" value="${userType}" disabled class="form-control">
            </div>
            <div class="form-group">
                <label>Activity:</label>
                <input type="text" value="${activity}" disabled class="form-control">
            </div>
            <div class="form-group">
                <label>Subscription Type:</label>
                <input type="text" value="${type}" disabled class="form-control">
            </div>
            <div class="form-group">
                <label>Amount:</label>
                <input type="text" value="${currentAmount}" id="edit-amount-${planId}" class="form-control">
                <small class="form-text text-muted">Enter amount like: 50, $100, 5%, or 'manual entry'</small>
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="savePlanEdit('${planId}')">Save Changes</button>
                <button class="btn btn-secondary" onclick="document.querySelector('.modal').remove()">Cancel</button>
            </div>
        </div>
    `;
    createModal('Edit Plan Details', modalContent);
}
function savePlanEdit(planId) {
    const newAmount = document.getElementById(`edit-amount-${planId}`).value;
    const row = document.querySelector(`[data-plan-id="${planId}"]`);
    if (row) {
        row.querySelector('.amount-input').value = newAmount;
    }
    document.querySelector('.modal').remove();
    showNotification('Plan updated successfully!', 'success');
}
function deletePlan(planId) {
    if (confirm('Are you sure you want to delete this subscription plan?')) {
        const row = document.querySelector(`[data-plan-id="${planId}"]`);
        if (row) {
            row.remove();
            showNotification('Plan deleted successfully!', 'success');
        }
    }
}
function addNewPlan(userType) {
    const modalContent = `
        <div class="add-plan-form">
            <div class="form-group">
                <label>Activity Name:</label>
                <input type="text" id="new-activity-name" class="form-control" placeholder="e.g., Submitting Quote">
            </div>
            <div class="form-group">
                <label>Subscription Type:</label>
                <select id="new-subscription-type" class="form-control">
                    <option value="MONTHLY">Monthly</option>
                    <option value="PER QUOTE">Per Quote</option>
                    <option value="PER TENDER">Per Tender</option>
                    <option value="PER ESTIMATE">Per Estimate</option>
                </select>
            </div>
            <div class="form-group">
                <label>Amount:</label>
                <input type="text" id="new-plan-amount" class="form-control" placeholder="e.g., 50, $100, 5%, or manual entry">
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="saveNewPlan('${userType}')">Add Plan</button>
                <button class="btn btn-secondary" onclick="document.querySelector('.modal').remove()">Cancel</button>
            </div>
        </div>
    `;
    createModal(`Add New Plan for ${userType}`, modalContent);
}
function saveNewPlan(userType) {
    const activityName = document.getElementById('new-activity-name').value.trim();
    const subscriptionType = document.getElementById('new-subscription-type').value;
    const amount = document.getElementById('new-plan-amount').value.trim();
    if (!activityName || !amount) {
        showNotification('Please fill in all required fields.', 'error');
        return;
    }
    // Add new row to the table
    const table = document.getElementById(`${userType}-plans-table`).querySelector('tbody');
    const planId = `${userType}-${activityName.replace(/\s+/g, '-')}-${subscriptionType}`.replace(/\s+/g, '-');
    const newRow = document.createElement('tr');
    newRow.setAttribute('data-plan-id', planId);
    newRow.setAttribute('data-user-type', userType);
    newRow.setAttribute('data-activity', activityName.replace(/\s+/g, '-'));
    newRow.setAttribute('data-type', subscriptionType);
    newRow.innerHTML = `
        <td><strong>${activityName}</strong></td>
        <td>
            <span class="subscription-type-badge ${subscriptionType.replace(/\s+/g, '-').toLowerCase()}">
                ${subscriptionType}
            </span>
        </td>
        <td>
            <input type="text"
                    class="amount-input"
                    value="${amount}"
                    placeholder="e.g., 50 or 5% or manual entry"
                   onchange="updatePlanAmount('${planId}', this.value)">
        </td>
        <td>
            <label class="switch">
                <input type="checkbox" checked onchange="updatePlanStatus('${planId}', this.checked)">
                <span class="slider round"></span>
            </label>
        </td>
        <td>
            <div class="action-buttons">
                <button class="btn btn-info btn-sm" onclick="editPlanDetails('${planId}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deletePlan('${planId}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
    table.appendChild(newRow);
    document.querySelector('.modal').remove();
    showNotification('New plan added successfully!', 'success');
}
function saveAllPlans() {
    // In a real implementation, this would collect all plan data and send to API
    showNotification('All subscription plans have been saved!', 'success');
}
function resetPlans() {
    if (confirm('Are you sure you want to reset all plans to default values? This will lose any unsaved changes.')) {
        renderAdminSubscriptionPlans();
        showNotification('Plans reset to default values.', 'info');
    }
}
// --- UTILITY FUNCTIONS FOR ACTIONS ---
function filterTable(searchValue, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(searchValue.toLowerCase()) ? '' : 'none';
    });
}
function filterTableByStatus(status, tableId) {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach(row => {
        if (!status) {
            row.style.display = '';
        } else {
            const statusSelect = row.querySelector('.status-select');
            row.style.display = (statusSelect && statusSelect.value === status) ? '' : 'none';
        }
    });
}
// --- MODAL & DETAIL VIEW FUNCTIONS ---
function createModal(title, contentHtml) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    modal.innerHTML = `
        <div class="modal-content" style="
            background: white;
            padding: 0;
            border-radius: 8px;
            max-width: 600px;
            width: 90%;
            max-height: 80%;
            overflow-y: auto;
        ">
            <div class="modal-header" style="
                padding: 20px;
                border-bottom: 1px solid #e0e0e0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h3 style="margin: 0;">${title}</h3>
                <button class="close-button" onclick="this.closest('.modal').remove()" style="
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #999;
                ">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                ${contentHtml}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}
// --- ACTION HANDLERS ---
async function handleStatusUpdate(userId, status) {
    await apiCall(`/admin/users/${userId}/status`, 'PUT', { status }, 'User status updated.');
}
async function handleUserDelete(userId) {
    if (confirm('Are you sure you want to delete this user? This cannot be undone.')) {
        await apiCall(`/admin/users/${userId}`, 'DELETE', null, 'User deleted.');
        renderAdminUsers(); // Refresh list
    }
}
async function showUserDetails(userId) {
    try {
        const response = await apiCall(`/admin/users/${userId}`);
        const user = response.user;
        const content = `
            <p><strong>Name:</strong> ${user.name || 'N/A'}</p>
            <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
            <p><strong>Type:</strong> ${user.type || 'N/A'}</p>
            <p><strong>Status:</strong> ${user.status || 'active'}</p>
            <p><strong>Created:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
        `;
        createModal('User Details', content);
    } catch (error) {
        showNotification('Failed to load user details.', 'error');
    }
}
async function updateQuoteAmount(quoteId, amount) {
    await apiCall(`/admin/quotes/${quoteId}/amount`, 'PUT', { amount }, 'Quote amount updated.');
}
async function updateQuoteStatus(quoteId, status) {
    await apiCall(`/admin/quotes/${quoteId}/status`, 'PUT', { status }, 'Quote status updated.');
}
async function deleteQuote(quoteId) {
    if (confirm('Are you sure you want to delete this quote?')) {
        await apiCall(`/admin/quotes/${quoteId}`, 'DELETE', null, 'Quote deleted.');
        renderAdminQuotes();
    }
}
async function viewQuoteDetails(quoteId) {
    try {
        const response = await apiCall(`/admin/quotes/${quoteId}`);
        const quote = response.quote;
        const content = `
            <p><strong>User:</strong> ${quote.userId?.name || 'N/A'}</p>
            <p><strong>Amount:</strong> ${quote.amount || 0}</p>
            <p><strong>Status:</strong> ${quote.status || 'pending'}</p>
            <p><strong>Created:</strong> ${new Date(quote.createdAt).toLocaleString()}</p>
            <hr><h4 style="margin-bottom: 10px;">Details</h4>
            <div class="details-box" style="
                background: #f8f9fa;
                padding: 15px;
                border-radius: 4px;
                border-left: 4px solid #007bff;
            ">${quote.details || 'No details.'}</div>
        `;
        createModal('Quote Details', content);
    } catch (error) {
        showNotification('Failed to load quote details.', 'error');
    }
}
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
    showNotification('An unexpected error occurred. Please refresh.', 'error');
});
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('A network or server error occurred. Please try again.', 'error');
});