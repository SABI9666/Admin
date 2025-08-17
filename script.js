/ --- MAIN APPLICATION STATE ---
const appState = {
    currentUser: null,
    jwtToken: null,
    apiBaseUrl: 'https://your-backend-url.vercel.app/api' // Update this with your actual backend URL
};

// --- API CALL FUNCTION ---
async function apiCall(endpoint, method = 'GET', data = null, successMessage = null) {
    try {
        const url = `${appState.apiBaseUrl}${endpoint}`;
        console.log(`Making ${method} request to: ${url}`);
        
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // Add authorization header if token exists
        if (appState.jwtToken) {
            options.headers['Authorization'] = `Bearer ${appState.jwtToken}`;
        }

        // Add data for POST/PUT requests
        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
        }

        if (successMessage) {
            showNotification(successMessage, 'success');
        }

        return responseData;
    } catch (error) {
        console.error('API call failed:', error);
        showNotification(error.message || 'Network error occurred', 'error');
        throw error;
    }
}

// --- NOTIFICATION SYSTEM ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container') || createNotificationContainer();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
    `;
    document.body.appendChild(container);
    return container;
}

// --- AUTHENTICATION FUNCTIONS ---
function logout() {
    appState.currentUser = null;
    appState.jwtToken = null;
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('currentUser');
    showNotification('Logged out successfully', 'success');
}

// --- ADMIN PANEL FUNCTIONS ---
function initializeAdminPage() {
    const adminPanel = document.getElementById('admin-panel-container');
    if (!adminPanel) return;

    console.log("Admin Panel Initializing...");

    const token = localStorage.getItem('jwtToken');
    const user = localStorage.getItem('currentUser');

    if (token && user) {
        try {
            appState.jwtToken = token;
            const parsedUser = JSON.parse(user);
            
            if (parsedUser.role === 'admin') {
                appState.currentUser = parsedUser;
                setupAdminPanel();
            } else {
                showAdminLoginPrompt();
            }
        } catch (error) {
            console.error('Error parsing user data:', error);
            showAdminLoginPrompt();
        }
    } else {
        showAdminLoginPrompt();
    }
}

function showAdminLoginPrompt() {
    const loginPrompt = document.getElementById('admin-login-prompt');
    const adminPanel = document.getElementById('admin-panel-container');
    
    if (loginPrompt) loginPrompt.style.display = 'flex';
    if (adminPanel) adminPanel.style.display = 'none';
}

function setupAdminPanel() {
    const loginPrompt = document.getElementById('admin-login-prompt');
    const adminPanel = document.getElementById('admin-panel-container');
    
    if (loginPrompt) loginPrompt.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'flex';
    
    // Display user info and setup logout
    const userInfoElement = document.getElementById('admin-user-info');
    if (userInfoElement) {
        userInfoElement.innerHTML = `
            <strong>${appState.currentUser.name}</strong>
            <small>${appState.currentUser.role}</small>
        `;
    }
    
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logout();
            window.location.href = 'index.html';
        });
    }

    // Setup navigation
    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', e => {
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

    // Load the default dashboard view
    renderAdminSection('dashboard');
}

function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    if (!contentArea) return;
    
    contentArea.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

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
        const response = await apiCall('/admin/dashboard', 'GET');
        const stats = response.stats;
        
        contentArea.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <i class="fas fa-users"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalUsers || 0}</span>
                        <span class="stat-label">Total Users</span>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <i class="fas fa-comments"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalMessages || 0}</span>
                        <span class="stat-label">Total Messages</span>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <i class="fas fa-file-invoice-dollar"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalQuotes || 0}</span>
                        <span class="stat-label">Total Quotes</span>
                    </div>
                </div>
            </div>
            <div class="admin-recent-activity">
                <h3>Recent Activity</h3>
                <p>Dashboard loaded successfully. System is operational.</p>
            </div>
        `;
    } catch (error) {
        console.error('Dashboard error:', error);
        contentArea.innerHTML = '<div class="error-state">Failed to load dashboard data. Please check your connection and try again.</div>';
    }
}

async function renderAdminUsers() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/users', 'GET');
        const users = response.users || [];

        if (users.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No users found.</div>';
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
                            <tr data-user-id="${user.id}">
                                <td>${user.name || 'N/A'}</td>
                                <td>${user.email || 'N/A'}</td>
                                <td><span class="user-role-badge ${user.role || 'user'}">${user.role || 'user'}</span></td>
                                <td>
                                    <select class="status-select" onchange="handleStatusUpdate('${user.id}', this.value)">
                                        <option value="active" ${(user.status || 'active') === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                    </select>
                                </td>
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="handleUserDelete('${user.id}')">
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
        console.error('Users error:', error);
        contentArea.innerHTML = '<div class="error-state">Failed to load user data. Please check your connection and try again.</div>';
    }
}

async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/quotes', 'GET');
        const quotes = response.quotes || [];

        if (quotes.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No quotes found.</div>';
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-quotes-container">
                <h3>Quotes Management</h3>
                <div class="quotes-grid">
                    ${quotes.map(quote => `
                        <div class="quote-card" data-quote-id="${quote.id}">
                            <div class="quote-header">
                                <span class="quote-status ${quote.status || 'pending'}">${quote.status || 'pending'}</span>
                                <span class="quote-date">${new Date(quote.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div class="quote-content">
                                <p><strong>Client:</strong> ${quote.clientName || 'N/A'}</p>
                                <p><strong>Email:</strong> ${quote.clientEmail || 'N/A'}</p>
                                <p><strong>Project:</strong> ${quote.projectDescription || 'N/A'}</p>
                                <p><strong>Total:</strong> ${quote.totalCost || '0'}</p>
                            </div>
                            <div class="quote-actions">
                                ${(quote.status !== 'approved') ? `
                                    <button class="btn btn-success btn-sm" onclick="handleQuoteApprove('${quote.id}')">
                                        <i class="fas fa-check"></i> Approve
                                    </button>
                                ` : ''}
                                ${(quote.status !== 'rejected') ? `
                                    <button class="btn btn-warning btn-sm" onclick="handleQuoteReject('${quote.id}')">
                                        <i class="fas fa-times"></i> Reject
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Quotes error:', error);
        contentArea.innerHTML = '<div class="error-state">Failed to load quotes data. Please check your connection and try again.</div>';
    }
}

async function renderAdminSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/system-stats', 'GET');
        const stats = response.stats;
        
        contentArea.innerHTML = `
            <div class="system-stats-container">
                <h3>System Information</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <strong>Node.js Version:</strong> 
                        <span>${stats.nodeVersion || 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <strong>Platform:</strong> 
                        <span>${stats.platform || 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <strong>Server Uptime:</strong> 
                        <span>${stats.serverUptime ? (stats.serverUptime / 3600).toFixed(2) + ' hours' : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <strong>Memory Usage (Heap Used):</strong> 
                        <span>${stats.memoryUsage ? (stats.memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <strong>Memory Usage (Total):</strong> 
                        <span>${stats.memoryUsage ? (stats.memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <strong>Last Updated:</strong> 
                        <span>${stats.timestamp ? new Date(stats.timestamp).toLocaleString() : 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('System stats error:', error);
        contentArea.innerHTML = '<div class="error-state">Failed to load system stats. Please check your connection and try again.</div>';
    }
}

// --- ADMIN ACTION HANDLERS ---
async function handleStatusUpdate(userId, newStatus) {
    if (confirm(`Are you sure you want to change this user's status to ${newStatus}?`)) {
        try {
            await apiCall(`/admin/users/${userId}/status`, 'PUT', { status: newStatus }, `User status updated to ${newStatus}.`);
            renderAdminUsers(); // Refresh the list
        } catch (error) {
            console.error('Status update failed:', error);
            renderAdminUsers(); // Refresh to revert the select
        }
    } else {
        renderAdminUsers(); // Refresh to revert the select
    }
}

async function handleUserDelete(userId) {
    if (confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/users/${userId}`, 'DELETE', null, 'User deleted successfully.');
            renderAdminUsers(); // Refresh the list
        } catch (error) {
            console.error('User deletion failed:', error);
        }
    }
}

async function handleQuoteApprove(quoteId) {
    if (confirm('Are you sure you want to approve this quote?')) {
        try {
            await apiCall(`/admin/quotes/${quoteId}/approve`, 'PUT', null, 'Quote approved successfully.');
            renderAdminQuotes(); // Refresh the list
        } catch (error) {
            console.error('Quote approval failed:', error);
        }
    }
}

async function handleQuoteReject(quoteId) {
    const reason = prompt('Please provide a reason for rejection (optional):');
    if (confirm('Are you sure you want to reject this quote?')) {
        try {
            await apiCall(`/admin/quotes/${quoteId}/reject`, 'PUT', { reason }, 'Quote rejected successfully.');
            renderAdminQuotes(); // Refresh the list
        } catch (error) {
            console.error('Quote rejection failed:', error);
        }
    }
}

// --- INITIALIZE ADMIN PAGE ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the admin page
    if (document.getElementById('admin-panel-container')) {
        initializeAdminPage();
    }
});-
