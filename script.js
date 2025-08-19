/ === STEEL CONNECT ADMIN PANEL - PART 1 ===
// Configuration & Core Functions

const appState = { 
    currentUser: null,
    currentFilter: '',
    currentSection: 'dashboard',
    uploadProgress: 0
};
const API_BASE_URL = 'https://steelconnect-backend.onrender.com/api';

// --- CORE UTILITY FUNCTIONS ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(notification);
    setTimeout(() => { notification.remove(); }, 5000);
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
}

function showLoader(container) {
    container.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Loading...</p>
        </div>
    `;
}

async function apiCall(endpoint, method = 'GET', body = null, isFileUpload = false) {
    const token = localStorage.getItem('jwtToken');
    const options = {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
    };
    
    if (!isFileUpload) {
        options.headers['Content-Type'] = 'application/json';
    }
    
    if (body) {
        options.body = isFileUpload ? body : JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(responseData.message || `HTTP error! Status: ${response.status}`);
        return responseData;
    } catch (error) {
        const errorMessage = error.name === 'TypeError' ? 'Network error: Could not connect to server.' : error.message;
        showNotification(errorMessage, 'error');
        throw new Error(errorMessage);
    }
}

function logout() {
    localStorage.clear();
    showNotification('You have been logged out.', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 1000);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0);
}

// --- MODAL UTILITIES ---
function showModal(modalId, content) {
    const existingModal = document.getElementById('dynamic-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'dynamic-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            ${content}
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('dynamic-modal');
    if (modal) modal.remove();
}

// --- LOGIN PAGE LOGIC ---
function initializeLoginPage() {
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleAdminLogin);
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const loginButton = event.target.querySelector('button[type="submit"]');
    loginButton.disabled = true;
    loginButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

    try {
        const data = await apiCall('/auth/login/admin', 'POST', {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
        });
        if (!data.token || !data.user) throw new Error('Invalid server response.');
        
        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        showNotification('Login successful! Redirecting...', 'success');
        setTimeout(() => { window.location.href = 'admin.html'; }, 1000);
    } catch (error) {
        loginButton.disabled = false;
        loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
}

// --- ADMIN PANEL LOGIC ---
function initializeAdminPage() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        const token = localStorage.getItem('jwtToken');
        if (token && user && (user.role?.toLowerCase() === 'admin' || user.type?.toLowerCase() === 'admin')) {
            appState.currentUser = user;
            setupAdminPanel();
        } else {
            showAdminLoginPrompt("Access Denied: Admin privileges required.");
        }
    } catch {
        showAdminLoginPrompt("Invalid session. Please log in again.");
    }
}

function showAdminLoginPrompt(message) {
    hideGlobalLoader();
    const panelContainer = document.getElementById('admin-panel-container');
    const loginPrompt = document.getElementById('admin-login-prompt');
    
    if (panelContainer) panelContainer.style.display = 'none';
    if (loginPrompt) {
        loginPrompt.style.display = 'flex';
        const messageP = loginPrompt.querySelector('p');
        if (messageP && message) messageP.textContent = message;
    }
}

function setupAdminPanel() {
    hideGlobalLoader();
    const panelContainer = document.getElementById('admin-panel-container');
    const userInfo = document.getElementById('admin-user-info');
    const logoutBtn = document.getElementById('admin-logout-btn');
    
    if (panelContainer) panelContainer.style.display = 'flex';
    
    if (userInfo) {
        userInfo.innerHTML = `
            <div class="user-avatar">
                <i class="fas fa-user-shield"></i>
            </div>
            <div class="user-details">
                <strong>${appState.currentUser.name}</strong>
                <small>${appState.currentUser.role || 'Admin'}</small>
            </div>
        `;
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            appState.currentSection = link.dataset.section;
            const sectionTitle = document.getElementById('admin-section-title');
            if (sectionTitle) sectionTitle.textContent = link.textContent.trim();
            renderAdminSection(link.dataset.section);
        });
    });
    
    const dashboardLink = document.querySelector('.admin-nav-link[data-section="dashboard"]');
    if (dashboardLink) dashboardLink.click();
}

function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    if (!contentArea) return;
    
    showLoader(contentArea);
    
    const renderMap = {
        dashboard: renderAdminDashboard,
        users: renderAdminUsers,
        quotes: renderAdminQuotes,
        estimations: renderAdminEstimations,
        jobs: renderAdminJobs,
        messages: renderAdminMessages,
        subscriptions: renderAdminSubscriptions,
        analytics: renderAdminAnalytics,
        'system-stats': renderSystemStats
    };
    
    setTimeout(() => {
        if (renderMap[section]) {
            renderMap[section]();
        } else {
            renderComingSoon(section);
        }
    }, 100);
}

function renderComingSoon(section) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-tools"></i>
            <h3>Coming Soon</h3>
            <p>The ${section.replace('-', ' ')} section is currently under development.</p>
        </div>
    `;
}

// --- DASHBOARD ---
async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const data = await apiCall('/admin/dashboard');
        contentArea.innerHTML = `
            <div class="dashboard-overview">
                <div class="admin-stats-grid">
                    ${Object.entries(data.stats || {}).map(([key, value]) => `
                        <div class="admin-stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-${getStatIcon(key)}"></i>
                            </div>
                            <div class="stat-info">
                                <span class="stat-value">${formatStatValue(key, value)}</span>
                                <span class="stat-label">${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="recent-activity">
                    <h3>Recent Activity</h3>
                    <div class="activity-list">
                        ${data.recentActivity?.map(activity => `
                            <div class="activity-item">
                                <div class="activity-icon">
                                    <i class="fas fa-${getActivityIcon(activity.type)}"></i>
                                </div>
                                <div class="activity-content">
                                    <p>${activity.description}</p>
                                    <small>${formatDate(activity.timestamp)}</small>
                                </div>
                            </div>
                        `).join('') || '<p>No recent activity</p>'}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load dashboard data</h3>
                <p>Please try refreshing the page or contact support if the issue persists.</p>
                <button class="btn btn-primary" onclick="renderAdminDashboard()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function getStatIcon(key) {
    const icons = {
        totalUsers: 'users',
        totalQuotes: 'file-alt',
        totalJobs: 'briefcase',
        totalMessages: 'envelope',
        totalEstimations: 'calculator',
        activeSubscriptions: 'crown',
        pendingEstimations: 'clock',
        unreadMessages: 'envelope-open'
    };
    return icons[key] || 'chart-line';
}

function formatStatValue(key, value) {
    if (key.includes('revenue') || key.includes('Revenue')) {
        return formatCurrency(value);
    }
    return value?.toLocaleString() || '0';
}

function getActivityIcon(type) {
    const icons = {
        user: 'user-plus',
        quote: 'file-alt',
        job: 'briefcase',
        message: 'envelope',
        estimation: 'calculator'
    };
    return icons[type] || 'bell';
}
/ === STEEL CONNECT ADMIN PANEL - PART 2 ===
// Users Management & Remaining Functions

// --- USERS MANAGEMENT ---
async function renderAdminUsers() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { users } = await apiCall('/admin/users');
        if (!users || users.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No users found</h3>
                    <p>Registered users will appear here.</p>
                </div>
            `;
            return;
        }
        
        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title">
                    <h2>Users Management</h2>
                    <span class="count-badge">${users.length} users</span>
                </div>
                <div class="section-actions">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search users..." id="user-search" oninput="filterUsers(this.value)">
                    </div>
                    <select id="user-role-filter" onchange="filterUsersByRole(this.value)">
                        <option value="">All Roles</option>
                        <option value="admin">Admin</option>
                        <option value="contractor">Contractor</option>
                        <option value="client">Client</option>
                    </select>
                    <button class="btn btn-primary" onclick="exportUsers()">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                </div>
            </div>
            
            <div class="admin-table-container">
                <table class="admin-table" id="users-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => `
                            <tr data-user-id="${user._id}" data-role="${user.role}" data-name="${user.name}">
                                <td>
                                    <div class="user-info">
                                        <div class="user-avatar">
                                            ${user.avatar ? 
                                                `<img src="${user.avatar}" alt="${user.name}">` :
                                                `<i class="fas fa-user"></i>`
                                            }
                                        </div>
                                        <div class="user-details">
                                            <strong>${user.name}</strong>
                                            <small>${user.company || 'No company'}</small>
                                        </div>
                                    </div>
                                </td>
                                <td>${user.email}</td>
                                <td>
                                    <span class="role-badge ${user.role}">${user.role}</span>
                                </td>
                                <td>
                                    <span class="status-badge ${user.isActive ? 'active' : 'inactive'}">
                                        ${user.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>${formatDate(user.createdAt)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewUserDetails('${user._id}')" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning" onclick="toggleUserStatus('${user._id}', ${!user.isActive})" title="${user.isActive ? 'Deactivate' : 'Activate'}">
                                            <i class="fas fa-${user.isActive ? 'ban' : 'check'}"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="deleteUser('${user._id}')" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load users</h3>
                <button class="btn btn-primary" onclick="renderAdminUsers()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function filterUsers(searchTerm) {
    const table = document.getElementById('users-table');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const name = row.dataset.name.toLowerCase();
        const email = row.cells[1].textContent.toLowerCase();
        const shouldShow = name.includes(searchTerm.toLowerCase()) || 
                          email.includes(searchTerm.toLowerCase());
        row.style.display = shouldShow ? '' : 'none';
    });
}

function filterUsersByRole(role) {
    const table = document.getElementById('users-table');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const userRole = row.dataset.role;
        const shouldShow = !role || userRole === role;
        row.style.display = shouldShow ? '' : 'none';
    });
}

async function viewUserDetails(userId) {
    try {
        const data = await apiCall(`/admin/users/${userId}`);
        const user = data.user;
        
        showModal('user-details-modal', `
            <div class="user-details-modal">
                <h3>User Details</h3>
                <div class="user-profile">
                    <div class="profile-avatar">
                        ${user.avatar ? 
                            `<img src="${user.avatar}" alt="${user.name}">` :
                            `<i class="fas fa-user"></i>`
                        }
                    </div>
                    <div class="profile-info">
                        <h4>${user.name}</h4>
                        <p><strong>Email:</strong> ${user.email}</p>
                        <p><strong>Role:</strong> <span class="role-badge ${user.role}">${user.role}</span></p>
                        <p><strong>Company:</strong> ${user.company || 'Not specified'}</p>
                        <p><strong>Phone:</strong> ${user.phone || 'Not provided'}</p>
                        <p><strong>Status:</strong> <span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></p>
                        <p><strong>Joined:</strong> ${formatDate(user.createdAt)}</p>
                        <p><strong>Last Login:</strong> ${user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</p>
                    </div>
                </div>
                
                <div class="user-stats">
                    <h4>Activity Statistics</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-value">${user.stats?.quotesRequested || 0}</span>
                            <span class="stat-label">Quotes Requested</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${user.stats?.jobsCompleted || 0}</span>
                            <span class="stat-label">Jobs Completed</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${user.stats?.messagesSent || 0}</span>
                            <span class="stat-label">Messages Sent</span>
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load user details', 'error');
    }
}

async function toggleUserStatus(userId, newStatus) {
    try {
        await apiCall(`/admin/users/${userId}/status`, 'PATCH', { isActive: newStatus });
        showNotification(`User ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        renderAdminUsers();
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/users/${userId}`, 'DELETE');
            showNotification('User deleted successfully', 'success');
            renderAdminUsers();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

// --- EXPORT FUNCTIONS ---
async function exportUsers() {
    try {
        const data = await apiCall('/admin/export/users');
        downloadFile(data.downloadUrl, `users-export-${new Date().toISOString().split('T')[0]}.csv`);
        showNotification('Users exported successfully', 'success');
    } catch (error) {
        // Error already handled by apiCall
    }
}

function downloadFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- PLACEHOLDER FUNCTIONS FOR REMAINING SECTIONS ---
async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-file-alt"></i>
            <h3>Quotes Management</h3>
            <p>This section is under development.</p>
        </div>
    `;
}

async function renderAdminEstimations() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-calculator"></i>
            <h3>Estimations Management</h3>
            <p>This section is under development.</p>
        </div>
    `;
}

async function renderAdminJobs() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-briefcase"></i>
            <h3>Jobs Management</h3>
            <p>This section is under development.</p>
        </div>
    `;
}

async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-envelope"></i>
            <h3>Messages Management</h3>
            <p>This section is under development.</p>
        </div>
    `;
}

async function renderAdminSubscriptions() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-crown"></i>
            <h3>Subscriptions Management</h3>
            <p>This section is under development.</p>
        </div>
    `;
}

async function renderAdminAnalytics() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-chart-bar"></i>
            <h3>Analytics Dashboard</h3>
            <p>This section is under development.</p>
        </div>
    `;
}

async function renderSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-server"></i>
            <h3>System Statistics</h3>
            <p>This section is under development.</p>
        </div>
    `;
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the login page
    if (document.getElementById('admin-login-form')) {
        initializeLoginPage();
    }
    
    // Check if we're on the admin panel page
    if (document.getElementById('admin-panel-container')) {
        initializeAdminPage();
    }
    
    // Add click outside modal to close
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });
    
    // Add escape key to close modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});

// --- ERROR HANDLING ---
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global error:', { msg, url, lineNo, columnNo, error });
    showNotification('An unexpected error occurred. Please refresh the page.', 'error');
    return false;
};

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('An unexpected error occurred. Please try again.', 'error');
});

// Export functions for external use
window.SteelConnectAdmin = {
    apiCall,
    showNotification,
    formatCurrency,
    formatDate,
    logout
};
    
