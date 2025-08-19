// --- CONFIGURATION & GLOBAL STATE ---
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- LOGIN PAGE LOGIC ---
function initializeLoginPage() {
    document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
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
    document.getElementById('admin-panel-container').style.display = 'none';
    const loginPrompt = document.getElementById('admin-login-prompt');
    loginPrompt.style.display = 'flex';
    if (message) loginPrompt.querySelector('p').textContent = message;
}

function setupAdminPanel() {
    hideGlobalLoader();
    document.getElementById('admin-panel-container').style.display = 'flex';
    document.getElementById('admin-user-info').innerHTML = `
        <div class="user-avatar">
            <i class="fas fa-user-shield"></i>
        </div>
        <div class="user-details">
            <strong>${appState.currentUser.name}</strong>
            <small>${appState.currentUser.role || 'Admin'}</small>
        </div>
    `;
    document.getElementById('admin-logout-btn').addEventListener('click', logout);
    
    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            appState.currentSection = link.dataset.section;
            document.getElementById('admin-section-title').textContent = link.textContent.trim();
            renderAdminSection(link.dataset.section);
        });
    });
    
    document.querySelector('.admin-nav-link[data-section="dashboard"]').click();
}

function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    showLoader(contentArea);
    
    const renderMap = {
        dashboard: renderAdminDashboard,
        users: renderAdminUsers,
        quotes: renderAdminQuotes,
        estimations: renderAdminEstimations,
        jobs: renderAdminJobs,
        messages: renderAdminMessages,
        subscriptions: renderAdminSubscriptions
    };
    
    setTimeout(() => renderMap[section](), 100);
}

// --- DASHBOARD ---
async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const data = await apiCall('/admin/dashboard');
        contentArea.innerHTML = `
            <div class="dashboard-overview">
                <div class="admin-stats-grid">
                    ${Object.entries(data.stats).map(([key, value]) => `
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
                
                <div class="dashboard-charts">
                    <div class="chart-container">
                        <h3>Growth Metrics</h3>
                        <canvas id="growthChart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>User Distribution</h3>
                        <canvas id="userChart"></canvas>
                    </div>
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
        
        // Initialize charts
        setTimeout(() => {
            initializeCharts(data.chartData);
        }, 100);
        
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
        totalRevenue: 'dollar-sign',
        activeEstimations: 'calculator',
        pendingMessages: 'envelope'
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
                    <p>Users will appear here once they register on the platform.</p>
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
                    <select id="user-type-filter" onchange="filterUsersByType(this.value)">
                        <option value="">All Types</option>
                        <option value="contractor">Contractors</option>
                        <option value="designer">Designers</option>
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
                            <th>Type</th>
                            <th>Status</th>
                            <th>Joined</th>
                            <th>Last Active</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => `
                            <tr data-user-id="${user.id || user._id}" data-user-type="${user.type}" data-user-name="${user.name}">
                                <td>
                                    <div class="user-info">
                                        <div class="user-avatar">
                                            ${user.profilePicture ? 
                                                `<img src="${user.profilePicture}" alt="${user.name}">` :
                                                `<i class="fas fa-user"></i>`
                                            }
                                        </div>
                                        <div class="user-details">
                                            <strong>${user.name}</strong>
                                            <small>${user.company || 'Individual'}</small>
                                        </div>
                                    </div>
                                </td>
                                <td>${user.email}</td>
                                <td>
                                    <span class="type-badge type-${user.type}">
                                        <i class="fas fa-${user.type === 'contractor' ? 'hard-hat' : 'paint-brush'}"></i>
                                        ${user.type || 'N/A'}
                                    </span>
                                </td>
                                <td><span class="status-badge ${user.status}">${user.status}</span></td>
                                <td>${formatDate(user.createdAt)}</td>
                                <td>${user.lastActive ? formatDate(user.lastActive) : 'Never'}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewUserDetails('${user.id || user._id}')" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning" onclick="toggleUserStatus('${user.id || user._id}', '${user.status}')" title="Toggle Status">
                                            <i class="fas fa-toggle-${user.status === 'active' ? 'on' : 'off'}"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="handleUserDelete('${user.id || user._id}')" title="Delete User">
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
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const name = row.dataset.userName.toLowerCase();
        const email = row.cells[1].textContent.toLowerCase();
        const shouldShow = name.includes(searchTerm.toLowerCase()) || 
                          email.includes(searchTerm.toLowerCase());
        row.style.display = shouldShow ? '' : 'none';
    });
}

function filterUsersByType(type) {
    const table = document.getElementById('users-table');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const userType = row.dataset.userType;
        const shouldShow = !type || userType === type;
        row.style.display = shouldShow ? '' : 'none';
    });
}

async function viewUserDetails(userId) {
    try {
        const user = await apiCall(`/admin/users/${userId}`);
        showModal('user-details-modal', `
            <div class="user-details-modal">
                <h3>User Details</h3>
                <div class="user-profile">
                    <div class="profile-header">
                        <div class="profile-avatar">
                            ${user.profilePicture ? 
                                `<img src="${user.profilePicture}" alt="${user.name}">` :
                                `<i class="fas fa-user"></i>`
                            }
                        </div>
                        <div class="profile-info">
                            <h4>${user.name}</h4>
                            <p>${user.email}</p>
                            <span class="type-badge type-${user.type}">${user.type}</span>
                        </div>
                    </div>
                    
                    <div class="profile-details">
                        <div class="detail-row">
                            <label>Company:</label>
                            <span>${user.company || 'Not specified'}</span>
                        </div>
                        <div class="detail-row">
                            <label>Phone:</label>
                            <span>${user.phone || 'Not specified'}</span>
                        </div>
                        <div class="detail-row">
                            <label>Location:</label>
                            <span>${user.location || 'Not specified'}</span>
                        </div>
                        <div class="detail-row">
                            <label>Joined:</label>
                            <span>${formatDate(user.createdAt)}</span>
                        </div>
                        <div class="detail-row">
                            <label>Last Active:</label>
                            <span>${user.lastActive ? formatDate(user.lastActive) : 'Never'}</span>
                        </div>
                        <div class="detail-row">
                            <label>Total Quotes:</label>
                            <span>${user.stats?.totalQuotes || 0}</span>
                        </div>
                        <div class="detail-row">
                            <label>Total Jobs:</label>
                            <span>${user.stats?.totalJobs || 0}</span>
                        </div>
                    </div>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load user details', 'error');
    }
}

async function toggleUserStatus(userId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
        await apiCall(`/admin/users/${userId}/status`, 'PATCH', { status: newStatus });
        showNotification(`User status updated to ${newStatus}`, 'success');
        renderAdminUsers();
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function handleUserDelete(userId) {
    if (confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/users/${userId}`, 'DELETE');
            showNotification('User deleted successfully.', 'success');
            renderAdminUsers();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function exportUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/users/export`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Users exported successfully', 'success');
    } catch (error) {
        showNotification('Failed to export users', 'error');
    }
}

// --- QUOTES MANAGEMENT ---
async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { quotes } = await apiCall('/admin/quotes');
        if (!quotes || quotes.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <h3>No quotes found</h3>
                    <p>Quotes will appear here once users request them.</p>
                </div>
            `;
            return;
        }
        
        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title">
                    <h2>Quotes Management</h2>
                    <span class="count-badge">${quotes.length} quotes</span>
                </div>
                <div class="section-actions">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search quotes..." id="quote-search" oninput="filterQuotes(this.value)">
                    </div>
                    <select id="quote-status-filter" onchange="filterQuotesByStatus(this.value)">
                        <option value="">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="completed">Completed</option>
                    </select>
                    <button class="btn btn-primary" onclick="exportQuotes()">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                </div>
            </div>
            
            <div class="admin-table-container">
                <table class="admin-table" id="quotes-table">
                    <thead>
                        <tr>
                            <th>Quote #</th>
                            <th>Client</th>
                            <th>Project</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${quotes.map(quote => `
                            <tr data-quote-id="${quote._id}" data-status="${quote.status}" data-client="${quote.clientName}">
                                <td>
                                    <strong>#${quote.quoteNumber || quote._id.slice(-6)}</strong>
                                </td>
                                <td>
                                    <div class="client-info">
                                        <strong>${quote.clientName}</strong>
                                        <small>${quote.clientEmail}</small>
                                    </div>
                                </td>
                                <td>
                                    <div class="project-info">
                                        <strong>${quote.projectTitle}</strong>
                                        <small>${quote.projectType}</small>
                                    </div>
                                </td>
                                <td>
                                    <span class="amount-display" id="amount-${quote._id}">
                                        ${formatCurrency(quote.amount)}
                                    </span>
                                    <button class="btn btn-sm btn-link" onclick="editQuoteAmount('${quote._id}', ${quote.amount})" title="Edit Amount">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                </td>
                                <td>
                                    <select class="status-select" onchange="updateQuoteStatus('${quote._id}', this.value)" data-current="${quote.status}">
                                        <option value="pending" ${quote.status === 'pending' ? 'selected' : ''}>Pending</option>
                                        <option value="approved" ${quote.status === 'approved' ? 'selected' : ''}>Approved</option>
                                        <option value="rejected" ${quote.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                                        <option value="completed" ${quote.status === 'completed' ? 'selected' : ''}>Completed</option>
                                    </select>
                                </td>
                                <td>${formatDate(quote.createdAt)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewQuoteDetails('${quote._id}')" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-success" onclick="downloadQuotePDF('${quote._id}')" title="Download PDF">
                                            <i class="fas fa-download"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="deleteQuote('${quote._id}')" title="Delete">
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
                <h3>Failed to load quotes</h3>
                <button class="btn btn-primary" onclick="renderAdminQuotes()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function filterQuotes(searchTerm) {
    const table = document.getElementById('quotes-table');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const client = row.dataset.client.toLowerCase();
        const project = row.cells[2].textContent.toLowerCase();
        const shouldShow = client.includes(searchTerm.toLowerCase()) || 
                          project.includes(searchTerm.toLowerCase());
        row.style.display = shouldShow ? '' : 'none';
    });
}

function filterQuotesByStatus(status) {
    const table = document.getElementById('quotes-table');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const quoteStatus = row.dataset.status;
        const shouldShow = !status || quoteStatus === status;
        row.style.display = shouldShow ? '' : 'none';
    });
}

async function updateQuoteStatus(quoteId, newStatus) {
    try {
        await apiCall(`/admin/quotes/${quoteId}/status`, 'PATCH', { status: newStatus });
        showNotification('Quote status updated successfully', 'success');
        // Update the row's data attribute
        const row = document.querySelector(`tr[data-quote-id="${quoteId}"]`);
        if (row) row.dataset.status = newStatus;
    } catch (error) {
        // Revert the select value
        const select = document.querySelector(`select[onchange*="${quoteId}"]`);
        if (select) select.value = select.dataset.current;
    }
}

async function editQuoteAmount(quoteId, currentAmount) {
    const newAmount = prompt('Enter new amount:', currentAmount);
    if (newAmount !== null && !isNaN(newAmount) && parseFloat(newAmount) >= 0) {
        try {
            await apiCall(`/admin/quotes/${quoteId}/amount`, 'PATCH', { amount: parseFloat(newAmount) });
            document.getElementById(`amount-${quoteId}`).textContent = formatCurrency(parseFloat(newAmount));
            showNotification('Quote amount updated successfully', 'success');
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function viewQuoteDetails(quoteId) {
    try {
        const quote = await apiCall(`/admin/quotes/${quoteId}`);
        showModal('quote-details-modal', `
            <div class="quote-details-modal">
                <h3>Quote Details - #${quote.quoteNumber || quote._id.slice(-6)}</h3>
                <div class="quote-content">
                    <div class="quote-header">
                        <div class="client-section">
                            <h4>Client Information</h4>
                            <p><strong>Name:</strong> ${quote.clientName}</p>
                            <p><strong>Email:</strong> ${quote.clientEmail}</p>
                            <p><strong>Phone:</strong> ${quote.clientPhone || 'Not provided'}</p>
                        </div>
                        <div class="project-section">
                            <h4>Project Information</h4>
                            <p><strong>Title:</strong> ${quote.projectTitle}</p>
                            <p><strong>Type:</strong> ${quote.projectType}</p>
                            <p><strong>Amount:</strong> ${formatCurrency(quote.amount)}</p>
                            <p><strong>Status:</strong> <span class="status-badge ${quote.status}">${quote.status}</span></p>
                        </div>
                    </div>
                    
                    <div class="quote-description">
                        <h4>Project Description</h4>
                        <p>${quote.description || 'No description provided'}</p>
                    </div>
                    
                    <div class="quote-metadata">
                        <p><strong>Created:</strong> ${formatDate(quote.createdAt)}</p>
                        <p><strong>Last Updated:</strong> ${formatDate(quote.updatedAt)}</p>
                    </div>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load quote details', 'error');
    }
}

async function downloadQuotePDF(quoteId) {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/quotes/${quoteId}/pdf`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        
        if (!response.ok) throw new Error('PDF download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quote_${quoteId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Quote PDF downloaded successfully', 'success');
    } catch (error) {
        showNotification('Failed to download quote PDF', 'error');
    }
}

async function deleteQuote(quoteId) {
    if (confirm('Are you sure you want to delete this quote? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/quotes/${quoteId}`, 'DELETE');
            showNotification('Quote deleted successfully', 'success');
            renderAdminQuotes();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function exportQuotes() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/quotes/export`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quotes_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Quotes exported successfully', 'success');
    } catch (error) {
        showNotification('Failed to export quotes', 'error');
    }
}

// --- ESTIMATIONS MANAGEMENT ---
async function renderAdminEstimations() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { estimations } = await apiCall('/admin/estimations');
        if (!estimations || estimations.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calculator"></i>
                    <h3>No estimations found</h3>
                    <p>Estimation requests will appear here once contractors upload project files.</p>
                </div>
            `;
            return;
        }
        
        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title">
                    <h2>Estimations Management</h2>
                    <span class="count-badge">${estimations.length} estimations</span>
                </div>
                <div class="section-actions">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search estimations..." id="estimation-search" oninput="filterEstimations(this.value)">
                    </div>
                    <select id="estimation-status-filter" onchange="filterEstimationsByStatus(this.value)">
                        <option value="">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="in-progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button class="btn btn-primary" onclick="exportEstimations()">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                </div>
            </div>
            
            <div class="admin-table-container">
                <table class="admin-table" id="estimations-table">
                    <thead>
                        <tr>
                            <th>Project Title</th>
                            <th>Contractor</th>
                            <th>Status</th>
                            <th>Files</th>
                            <th>Created</th>
                            <th>Due Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${estimations.map(est => `
                            <tr data-estimation-id="${est._id}" data-status="${est.status}" data-contractor="${est.contractorName}">
                                <td>
                                    <div class="project-info">
                                        <strong>${est.projectTitle}</strong>
                                        <small>${est.projectType || 'General'}</small>
                                    </div>
                                </td>
                                <td>
                                    <div class="contractor-info">
                                        <strong>${est.contractorName}</strong>
                                        <small>${est.contractorEmail}</small>
                                    </div>
                                </td>
                                <td>
                                    <select class="status-select" onchange="updateEstimationStatus('${est._id}', this.value)" data-current="${est.status}">
                                        <option value="pending" ${est.status === 'pending' ? 'selected' : ''}>Pending</option>
                                        <option value="in-progress" ${est.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                                        <option value="completed" ${est.status === 'completed' ? 'selected' : ''}>Completed</option>
                                        <option value="cancelled" ${est.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                    </select>
                                </td>
                                <td>
                                    <div class="file-info">
                                        <span class="file-count">${est.uploadedFiles?.length || 0} files</span>
                                        ${est.uploadedFiles?.length ? 
                                            `<button class="btn btn-sm btn-link" onclick="viewEstimationFiles('${est._id}')" title="View Files">
                                                <i class="fas fa-paperclip"></i>
                                            </button>` : ''
                                        }
                                    </div>
                                </td>
                                <td>${formatDate(est.createdAt)}</td>
                                <td>
                                    ${est.dueDate ? formatDate(est.dueDate) : 
                                        `<button class="btn btn-sm btn-outline" onclick="setEstimationDueDate('${est._id}')">
                                            <i class="fas fa-calendar-plus"></i> Set
                                        </button>`
                                    }
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewEstimationDetails('${est._id}')" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        ${est.status === 'pending' || est.status === 'in-progress' ? `
                                            <button class="btn btn-sm btn-success" onclick="uploadEstimationResult('${est._id}')" title="Upload Result">
                                                <i class="fas fa-upload"></i>
                                            </button>
                                        ` : ''}
                                        ${est.resultFile ? `
                                            <button class="btn btn-sm btn-primary" onclick="downloadEstimationResult('${est._id}')" title="Download Result">
                                                <i class="fas fa-download"></i>
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-danger" onclick="deleteEstimation('${est._id}')" title="Delete">
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
                <h3>Failed to load estimations</h3>
                <button class="btn btn-primary" onclick="renderAdminEstimations()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function filterEstimations(searchTerm) {
    const table = document.getElementById('estimations-table');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const contractor = row.dataset.contractor.toLowerCase();
        const project = row.cells[0].textContent.toLowerCase();
        const shouldShow = contractor.includes(searchTerm.toLowerCase()) || 
                          project.includes(searchTerm.toLowerCase());
        row.style.display = shouldShow ? '' : 'none';
    });
}

function filterEstimationsByStatus(status) {
    const table = document.getElementById('estimations-table');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const estimationStatus = row.dataset.status;
        const shouldShow = !status || estimationStatus === status;
        row.style.display = shouldShow ? '' : 'none';
    });
}

async function updateEstimationStatus(estimationId, newStatus) {
    try {
        await apiCall(`/admin/estimations/${estimationId}/status`, 'PATCH', { status: newStatus });
        showNotification('Estimation status updated successfully', 'success');
        // Update the row's data attribute
        const row = document.querySelector(`tr[data-estimation-id="${estimationId}"]`);
        if (row) row.dataset.status = newStatus;
    } catch (error) {
        // Revert the select value
        const select = document.querySelector(`select[onchange*="${estimationId}"]`);
        if (select) select.value = select.dataset.current;
    }
}

async function viewEstimationFiles(estimationId) {
    try {
        const estimation = await apiCall(`/admin/estimations/${estimationId}`);
        const filesHtml = estimation.uploadedFiles?.map(file => `
            <div class="file-item">
                <div class="file-icon">
                    <i class="fas fa-file-pdf"></i>
                </div>
                <div class="file-details">
                    <strong>${file.originalName}</strong>
                    <small>Uploaded: ${formatDate(file.uploadedAt)}</small>
                </div>
                <div class="file-actions">
                    <button class="btn btn-sm btn-primary" onclick="downloadEstimationFile('${estimationId}', '${file.fileName}')">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="previewEstimationFile('${file.url}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
        `).join('') || '<p>No files uploaded</p>';
        
        showModal('estimation-files-modal', `
            <div class="estimation-files-modal">
                <h3>Project Files</h3>
                <div class="files-container">
                    ${filesHtml}
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load estimation files', 'error');
    }
}

async function downloadEstimationFile(estimationId, fileName) {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/estimations/${estimationId}/files/${fileName}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        
        if (!response.ok) throw new Error('File download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('File downloaded successfully', 'success');
    } catch (error) {
        showNotification('Failed to download file', 'error');
    }
}

function previewEstimationFile(fileUrl) {
    window.open(fileUrl, '_blank');
}

async function setEstimationDueDate(estimationId) {
    const dueDate = prompt('Enter due date (YYYY-MM-DD):');
    if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        try {
            await apiCall(`/admin/estimations/${estimationId}/due-date`, 'PATCH', { dueDate });
            showNotification('Due date set successfully', 'success');
            renderAdminEstimations();
        } catch (error) {
            // Error already handled by apiCall
        }
    } else if (dueDate) {
        showNotification('Invalid date format. Please use YYYY-MM-DD', 'error');
    }
}

async function uploadEstimationResult(estimationId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Upload Estimation Result</h3>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="estimation-result-form">
                    <div class="form-group">
                        <label for="result-file">Select PDF File:</label>
                        <input type="file" id="result-file" accept=".pdf" required>
                        <small>Only PDF files are allowed</small>
                    </div>
                    <div class="form-group">
                        <label for="result-notes">Notes (optional):</label>
                        <textarea id="result-notes" placeholder="Add any notes about the estimation..."></textarea>
                    </div>
                    <div class="upload-progress" id="upload-progress" style="display: none;">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progress-fill"></div>
                        </div>
                        <span id="progress-text">0%</span>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-upload"></i> Upload Result
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    document.getElementById('estimation-result-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fileInput = document.getElementById('result-file');
        const notes = document.getElementById('result-notes').value;
        const file = fileInput.files[0];
        
        if (!file) {
            showNotification('Please select a file', 'error');
            return;
        }
        
        if (file.type !== 'application/pdf') {
            showNotification('Only PDF files are allowed', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('resultFile', file);
        formData.append('notes', notes);
        
        try {
            showUploadProgress();
            await apiCall(`/admin/estimations/${estimationId}/result`, 'POST', formData, true);
            showNotification('Estimation result uploaded successfully', 'success');
            closeModal();
            renderAdminEstimations();
        } catch (error) {
            hideUploadProgress();
        }
    });
}

function showUploadProgress() {
    document.getElementById('upload-progress').style.display = 'block';
    // Simulate progress - in real implementation, you'd track actual upload progress
    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        document.getElementById('progress-text').textContent = `${progress}%`;
        if (progress >= 100) {
            clearInterval(interval);
            hideUploadProgress();
        }
    }, 200);
}

function hideUploadProgress() {
    document.getElementById('upload-progress').style.display = 'none';
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('progress-text').textContent = '0%';
}

async function downloadEstimationResult(estimationId) {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/estimations/${estimationId}/result`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        
        if (!response.ok) throw new Error('Result download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `estimation_result_${estimationId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Estimation result downloaded successfully', 'success');
    } catch (error) {
        showNotification('Failed to download estimation result', 'error');
    }
}

async function viewEstimationDetails(estimationId) {
    try {
        const estimation = await apiCall(`/admin/estimations/${estimationId}`);
        showModal('estimation-details-modal', `
            <div class="estimation-details-modal">
                <h3>Estimation Details</h3>
                <div class="estimation-content">
                    <div class="estimation-header">
                        <div class="contractor-section">
                            <h4>Contractor Information</h4>
                            <p><strong>Name:</strong> ${estimation.contractorName}</p>
                            <p><strong>Email:</strong> ${estimation.contractorEmail}</p>
                            <p><strong>Phone:</strong> ${estimation.contractorPhone || 'Not provided'}</p>
                        </div>
                        <div class="project-section">
                            <h4>Project Information</h4>
                            <p><strong>Title:</strong> ${estimation.projectTitle}</p>
                            <p><strong>Type:</strong> ${estimation.projectType}</p>
                            <p><strong>Status:</strong> <span class="status-badge ${estimation.status}">${estimation.status}</span></p>
                            <p><strong>Due Date:</strong> ${estimation.dueDate ? formatDate(estimation.dueDate) : 'Not set'}</p>
                        </div>
                    </div>
                    
                    <div class="estimation-description">
                        <h4>Project Description</h4>
                        <p>${estimation.description || 'No description provided'}</p>
                    </div>
                    
                    <div class="estimation-files">
                        <h4>Uploaded Files</h4>
                        <p>${estimation.uploadedFiles?.length || 0} files uploaded</p>
                    </div>
                    
                    ${estimation.notes ? `
                        <div class="estimation-notes">
                            <h4>Admin Notes</h4>
                            <p>${estimation.notes}</p>
                        </div>
                    ` : ''}
                    
                    <div class="estimation-metadata">
                        <p><strong>Created:</strong> ${formatDate(estimation.createdAt)}</p>
                        <p><strong>Last Updated:</strong> ${formatDate(estimation.updatedAt)}</p>
                    </div>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load estimation details', 'error');
    }
}

async function deleteEstimation(estimationId) {
    if (confirm('Are you sure you want to delete this estimation? This will also delete all associated files.')) {
        try {
            await apiCall(`/admin/estimations/${estimationId}`, 'DELETE');
            showNotification('Estimation deleted successfully', 'success');
            renderAdminEstimations();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function exportEstimations() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/estimations/export`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `estimations_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Estimations exported successfully', 'success');
    } catch (error) {
        showNotification('Failed to export estimations', 'error');
    }
}

// --- JOBS MANAGEMENT ---
async function renderAdminJobs() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { jobs } = await apiCall('/admin/jobs');
        if (!jobs || jobs.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-briefcase"></i>
                    <h3>No jobs found</h3>
                    <p>Job postings will appear here once users create them.</p>
                </div>
            `;
            return;
        }
        
        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title">
                    <h2>Jobs Management</h2>
                    <span class="count-badge">${jobs.length} jobs</span>
                </div>
                <div class="section-actions">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search jobs..." id="job-search" oninput="filterJobs(this.value)">
                    </div>
                    <select id="job-status-filter" onchange="filterJobsByStatus(this.value)">
                        <option value="">All Status</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button class="btn btn-primary" onclick="exportJobs()">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                </div>
            </div>
            
            <div class="admin-table-container">
                <table class="admin-table" id="jobs-table">
                    <thead>
                        <tr>
                            <th>Job Title</th>
                            <th>Employer</th>
                            <th>Category</th>
                            <th>Budget</th>
                            <th>Applications</th>
                            <th>Status</th>
                            <th>Posted</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${jobs.map(job => `
                            <tr data-job-id="${job._id}" data-status="${job.status}" data-employer="${job.employerName}">
                                <td>
                                    <div class="job-info">
                                        <strong>${job.title}</strong>
                                        <small>${job.location || 'Remote'}</small>
                                    </div>
                                </td>
                                <td>
                                    <div class="employer-info">
                                        <strong>${job.employerName}</strong>
                                        <small>${job.employerEmail}</small>
                                    </div>
                                </td>
                                <td>
                                    <span class="category-badge">${job.category}</span>
                                </td>
                                <td>
                                    <div class="budget-info">
                                        ${formatCurrency(job.budgetMin)} - ${formatCurrency(job.budgetMax)}
                                        <small>${job.budgetType || 'Fixed'}</small>
                                    </div>
                                </td>
                                <td>
                                    <span class="application-count">${job.applicationCount || 0}</span>
                                    ${job.applicationCount > 0 ? `
                                        <button class="btn btn-sm btn-link" onclick="viewJobApplications('${job._id}')" title="View Applications">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    ` : ''}
                                </td>
                                <td>
                                    <select class="status-select" onchange="updateJobStatus('${job._id}', this.value)" data-current="${job.status}">
                                        <option value="active" ${job.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="paused" ${job.status === 'paused' ? 'selected' : ''}>Paused</option>
                                        <option value="completed" ${job.status === 'completed' ? 'selected' : ''}>Completed</option>
                                        <option value="cancelled" ${job.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                    </select>
                                </td>
                                <td>${formatDate(job.createdAt)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewJobDetails('${job._id}')" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning" onclick="toggleJobFeatured('${job._id}', ${job.featured || false})" title="Toggle Featured">
                                            <i class="fas fa-star${job.featured ? '' : '-o'}"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="deleteJob('${job._id}')" title="Delete">
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
                <h3>Failed to load jobs</h3>
                <button class="btn btn-primary" onclick="renderAdminJobs()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function filterJobs(searchTerm) {
    const table = document.getElementById('jobs-table');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const employer = row.dataset.employer.toLowerCase();
        const title = row.cells[0].textContent.toLowerCase();
        const shouldShow = employer.includes(searchTerm.toLowerCase()) || 
                          title.includes(searchTerm.toLowerCase());
        row.style.display = shouldShow ? '' : 'none';
    });
}

function filterJobsByStatus(status) {
    const table = document.getElementById('jobs-table');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const jobStatus = row.dataset.status;
        const shouldShow = !status || jobStatus === status;
        row.style.display = shouldShow ? '' : 'none';
    });
}

async function updateJobStatus(jobId, newStatus) {
    try {
        await apiCall(`/admin/jobs/${jobId}/status`, 'PATCH', { status: newStatus });
        showNotification('Job status updated successfully', 'success');
        // Update the row's data attribute
        const row = document.querySelector(`tr[data-job-id="${jobId}"]`);
        if (row) row.dataset.status = newStatus;
    } catch (error) {
        // Revert the select value
        const select = document.querySelector(`select[onchange*="${jobId}"]`);
        if (select) select.value = select.dataset.current;
    }
}

async function toggleJobFeatured(jobId, currentFeatured) {
    try {
        await apiCall(`/admin/jobs/${jobId}/featured`, 'PATCH', { featured: !currentFeatured });
        showNotification(`Job ${!currentFeatured ? 'featured' : 'unfeatured'} successfully`, 'success');
        renderAdminJobs();
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function viewJobApplications(jobId) {
    try {
        const applications = await apiCall(`/admin/jobs/${jobId}/applications`);
        const applicationsHtml = applications.map(app => `
            <div class="application-item">
                <div class="applicant-info">
                    <div class="applicant-avatar">
                        ${app.applicantAvatar ? 
                            `<img src="${app.applicantAvatar}" alt="${app.applicantName}">` :
                            `<i class="fas fa-user"></i>`
                        }
                    </div>
                    <div class="applicant-details">
                        <strong>${app.applicantName}</strong>
                        <small>${app.applicantEmail}</small>
                        <p class="proposal-text">${app.proposalText}</p>
                        <div class="application-meta">
                            <span>Budget: ${formatCurrency(app.proposedBudget)}</span>
                            <span>Applied: ${formatDate(app.appliedAt)}</span>
                        </div>
                    </div>
                </div>
                <div class="application-actions">
                    <button class="btn btn-sm btn-success" onclick="approveApplication('${app._id}')">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="rejectApplication('${app._id}')">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            </div>
        `).join('') || '<p>No applications yet</p>';
        
        showModal('job-applications-modal', `
            <div class="job-applications-modal">
                <h3>Job Applications</h3>
                <div class="applications-container">
                    ${applicationsHtml}
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load job applications', 'error');
    }
}

async function viewJobDetails(jobId) {
    try {
        const job = await apiCall(`/admin/jobs/${jobId}`);
        showModal('job-details-modal', `
            <div class="job-details-modal">
                <h3>Job Details</h3>
                <div class="job-content">
                    <div class="job-header">
                        <div class="employer-section">
                            <h4>Employer Information</h4>
                            <p><strong>Name:</strong> ${job.employerName}</p>
                            <p><strong>Email:</strong> ${job.employerEmail}</p>
                            <p><strong>Company:</strong> ${job.companyName || 'Not specified'}</p>
                        </div>
                        <div class="job-info-section">
                            <h4>Job Information</h4>
                            <p><strong>Title:</strong> ${job.title}</p>
                            <p><strong>Category:</strong> ${job.category}</p>
                            <p><strong>Location:</strong> ${job.location || 'Remote'}</p>
                            <p><strong>Status:</strong> <span class="status-badge ${job.status}">${job.status}</span></p>
                        </div>
                    </div>
                    
                    <div class="job-description">
                        <h4>Job Description</h4>
                        <p>${job.description || 'No description provided'}</p>
                    </div>
                    
                    <div class="job-requirements">
                        <h4>Requirements</h4>
                        <p>${job.requirements || 'No specific requirements listed'}</p>
                    </div>
                    
                    <div class="job-budget">
                        <h4>Budget Information</h4>
                        <p><strong>Range:</strong> ${formatCurrency(job.budgetMin)} - ${formatCurrency(job.budgetMax)}</p>
                        <p><strong>Type:</strong> ${job.budgetType || 'Fixed'}</p>
                    </div>
                    
                    <div class="job-metadata">
                        <p><strong>Posted:</strong> ${formatDate(job.createdAt)}</p>
                        <p><strong>Applications:</strong> ${job.applicationCount || 0}</p>
                        <p><strong>Featured:</strong> ${job.featured ? 'Yes' : 'No'}</p>
                    </div>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load job details', 'error');
    }
}

async function deleteJob(jobId) {
    if (confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/jobs/${jobId}`, 'DELETE');
            showNotification('Job deleted successfully', 'success');
            renderAdminJobs();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function exportJobs() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/jobs/export`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobs_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Jobs exported successfully', 'success');
    } catch (error) {
        showNotification('Failed to export jobs', 'error');
    }
}

// --- MESSAGES MANAGEMENT ---
async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { messages } = await apiCall('/admin/messages');
        if (!messages || messages.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-envelope"></i>
                    <h3>No messages found</h3>
                    <p>User messages and inquiries will appear here.</p>
                </div>
            `;
            return;
        }
        
        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title">
                    <h2>Messages Management</h2>
                    <span class="count-badge">${messages.length} messages</span>
                </div>
                <div class="section-actions">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search messages..." id="message-search" oninput="filterMessages(this.value)">
                    </div>
                    <select id="message-status-filter" onchange="filterMessagesByStatus(this.value)">
                        <option value="">All Status</option>
                        <option value="unread">Unread</option>
                        <option value="read">Read</option>
                        <option value="replied">Replied</option>
                        <option value="archived">Archived</option>
                    </select>
                    <button class="btn btn-primary" onclick="exportMessages()">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                </div>
            </div>
            
            <div class="messages-container">
                ${messages.map(message => `
                    <div class="message-card ${message.status}" data-message-id="${message._id}" data-sender="${message.senderName}" data-status="${message.status}">
                        <div class="message-header">
                            <div class="sender-info">
                                <div class="sender-avatar">
                                    ${message.senderAvatar ? 
                                        `<img src="${message.senderAvatar}" alt="${message.senderName}">` :
                                        `<i class="fas fa-user"></i>`
                                    }
                                </div>
                                <div class="sender-details">
                                    <strong>${message.senderName}</strong>
                                    <small>${message.senderEmail}</small>
                                </div>
                            </div>
                            <div class="message-meta">
                                <span class="message-time">${formatDate(message.createdAt)}</span>
                                <span class="message-status-badge ${message.status}">${message.status}</span>
                            </div>
                        </div>
                        
                        <div class="message-content">
                            <h4>${message.subject}</h4>
                            <p class="message-preview">${message.content.substring(0, 150)}${message.content.length > 150 ? '...' : ''}</p>
                        </div>
                        
                        <div class="message-actions">
                            <button class="btn btn-sm btn-info" onclick="viewMessageDetails('${message._id}')" title="View Full Message">
                                <i class="fas fa-eye"></i> View
                            </button>
                            ${message.status !== 'replied' ? `
                                <button class="btn btn-sm btn-primary" onclick="replyToMessage('${message._id}')" title="Reply">
                                    <i class="fas fa-reply"></i> Reply
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-warning" onclick="updateMessageStatus('${message._id}', 'archived')" title="Archive">
                                <i class="fas fa-archive"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteMessage('${message._id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        
                        ${message.thread && message.thread.length > 0 ? `
                            <div class="message-thread">
                                <button class="btn btn-link" onclick="toggleMessageThread('${message._id}')">
                                    <i class="fas fa-comments"></i> View Thread (${message.thread.length})
                                </button>
                                <div class="thread-messages" id="thread-${message._id}" style="display: none;">
                                    ${message.thread.map(reply => `
                                        <div class="thread-message">
                                            <div class="thread-header">
                                                <strong>${reply.senderName}</strong>
                                                <small>${formatDate(reply.sentAt)}</small>
                                            </div>
                                            <p>${reply.content}</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load messages</h3>
                <button class="btn btn-primary" onclick="renderAdminMessages()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function filterMessages(searchTerm) {
    const messages = document.querySelectorAll('.message-card');
    messages.forEach(message => {
        const sender = message.dataset.sender.toLowerCase();
        const subject = message.querySelector('h4').textContent.toLowerCase();
        const content = message.querySelector('.message-preview').textContent.toLowerCase();
        const shouldShow = sender.includes(searchTerm.toLowerCase()) || 
                          subject.includes(searchTerm.toLowerCase()) ||
                          content.includes(searchTerm.toLowerCase());
        message.style.display = shouldShow ? '' : 'none';
    });
}

function filterMessagesByStatus(status) {
    const messages = document.querySelectorAll('.message-card');
    messages.forEach(message => {
        const messageStatus = message.dataset.status;
        const shouldShow = !status || messageStatus === status;
        message.style.display = shouldShow ? '' : 'none';
    });
}

async function viewMessageDetails(messageId) {
    try {
        const message = await apiCall(`/admin/messages/${messageId}`);
        // Mark as read
        if (message.status === 'unread') {
            await updateMessageStatus(messageId, 'read', false);
        }
        
        showModal('message-details-modal', `
            <div class="message-details-modal">
                <div class="message-full-header">
                    <div class="sender-section">
                        <div class="sender-avatar">
                            ${message.senderAvatar ? 
                                `<img src="${message.senderAvatar}" alt="${message.senderName}">` :
                                `<i class="fas fa-user"></i>`
                            }
                        </div>
                        <div class="sender-info">
                            <h3>${message.senderName}</h3>
                            <p>${message.senderEmail}</p>
                            <small>Sent: ${formatDate(message.createdAt)}</small>
                        </div>
                    </div>
                    <div class="message-meta-section">
                        <span class="status-badge ${message.status}">${message.status}</span>
                    </div>
                </div>
                
                <div class="message-subject">
                    <h4>${message.subject}</h4>
                </div>
                
                <div class="message-full-content">
                    <p>${message.content.replace(/\n/g, '<br>')}</p>
                </div>
                
                ${message.attachments && message.attachments.length > 0 ? `
                    <div class="message-attachments">
                        <h4>Attachments</h4>
                        ${message.attachments.map(attachment => `
                            <div class="attachment-item">
                                <i class="fas fa-paperclip"></i>
                                <a href="${attachment.url}" target="_blank">${attachment.name}</a>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <div class="message-actions-full">
                    <button class="btn btn-primary" onclick="replyToMessage('${messageId}')">
                        <i class="fas fa-reply"></i> Reply
                    </button>
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load message details', 'error');
    }
}

async function replyToMessage(messageId) {
    try {
        const message = await apiCall(`/admin/messages/${messageId}`);
        showModal('reply-message-modal', `
            <div class="reply-message-modal">
                <h3>Reply to: ${message.subject}</h3>
                <form id="reply-form">
                    <div class="form-group">
                        <label>To:</label>
                        <input type="text" value="${message.senderName} <${message.senderEmail}>" readonly>
                    </div>
                    <div class="form-group">
                        <label for="reply-content">Message:</label>
                        <textarea id="reply-content" placeholder="Type your reply..." required></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-paper-plane"></i> Send Reply
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    </div>
                </form>
            </div>
        `);
        
        document.getElementById('reply-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = document.getElementById('reply-content').value;
            
            try {
                await apiCall(`/admin/messages/${messageId}/reply`, 'POST', { content });
                showNotification('Reply sent successfully', 'success');
                closeModal();
                renderAdminMessages();
            } catch (error) {
                // Error already handled by apiCall
            }
        });
    } catch (error) {
        showNotification('Failed to load message for reply', 'error');
    }
}

function toggleMessageThread(messageId) {
    const thread = document.getElementById(`thread-${messageId}`);
    const isVisible = thread.style.display !== 'none';
    thread.style.display = isVisible ? 'none' : 'block';
}

async function updateMessageStatus(messageId, newStatus, showNotif = true) {
    try {
        await apiCall(`/admin/messages/${messageId}/status`, 'PATCH', { status: newStatus });
        if (showNotif) {
            showNotification('Message status updated successfully', 'success');
            renderAdminMessages();
        }
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/messages/${messageId}`, 'DELETE');
            showNotification('Message deleted successfully', 'success');
            renderAdminMessages();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function exportMessages() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/messages/export`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `messages_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Messages exported successfully', 'success');
    } catch (error) {
        showNotification('Failed to export messages', 'error');
    }
}

// --- SUBSCRIPTIONS MANAGEMENT ---
async function renderAdminSubscriptions() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { subscriptions, plans } = await apiCall('/admin/subscriptions');
        
        contentArea.innerHTML = `
            <div class="subscriptions-management">
                <div class="admin-section-header">
                    <div class="section-title">
                        <h2>Subscriptions Management</h2>
                    </div>
                    <div class="section-actions">
                        <button class="btn btn-primary" onclick="createSubscriptionPlan()">
                            <i class="fas fa-plus"></i> Create Plan
                        </button>
                    </div>
                </div>
                
                <!-- Subscription Plans -->
                <div class="subscription-plans-section">
                    <h3>Subscription Plans</h3>
                    <div class="plans-grid">
                        ${plans?.map(plan => `
                            <div class="plan-card">
                                <div class="plan-header">
                                    <h4>${plan.name}</h4>
                                    <div class="plan-price">
                                        ${formatCurrency(plan.price)}
                                        <small>/${plan.interval}</small>
                                    </div>
                                </div>
                                <div class="plan-features">
                                    <ul>
                                        ${plan.features?.map(feature => `<li><i class="fas fa-check"></i> ${feature}</li>`).join('') || ''}
                                    </ul>
                                </div>
                                <div class="plan-stats">
                                    <small>${plan.subscriberCount || 0} subscribers</small>
                                </div>
                                <div class="plan-actions">
                                    <button class="btn btn-sm btn-info" onclick="editSubscriptionPlan('${plan._id}')">
                                        <i class="fas fa-edit"></i> Edit
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteSubscriptionPlan('${plan._id}')">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                </div>
                            </div>
                        `).join('') || '<p>No subscription plans created yet.</p>'}
                    </div>
                </div>
                
                <!-- Active Subscriptions -->
                <div class="active-subscriptions-section">
                    <h3>Active Subscriptions</h3>
                    ${subscriptions?.length ? `
                        <div class="admin-table-container">
                            <table class="admin-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Plan</th>
                                        <th>Status</th>
                                        <th>Started</th>
                                        <th>Next Billing</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${subscriptions.map(sub => `
                                        <tr>
                                            <td>
                                                <div class="user-info">
                                                    <strong>${sub.userName}</strong>
                                                    <small>${sub.userEmail}</small>
                                                </div>
                                            </td>
                                            <td>
                                                <div class="plan-info">
                                                    <strong>${sub.planName}</strong>
                                                    <small>${formatCurrency(sub.planPrice)}/${sub.planInterval}</small>
                                                </div>
                                            </td>
                                            <td><span class="status-badge ${sub.status}">${sub.status}</span></td>
                                            <td>${formatDate(sub.startDate)}</td>
                                            <td>${sub.nextBillingDate ? formatDate(sub.nextBillingDate) : 'N/A'}</td>
                                            <td>
                                                <div class="action-buttons">
                                                    <button class="btn btn-sm btn-info" onclick="viewSubscriptionDetails('${sub._id}')">
                                                        <i class="fas fa-eye"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-warning" onclick="cancelSubscription('${sub._id}')">
                                                        <i class="fas fa-ban"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<p>No active subscriptions found.</p>'}
                </div>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load subscriptions</h3>
                <button class="btn btn-primary" onclick="renderAdminSubscriptions()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function createSubscriptionPlan() {
    showModal('create-plan-modal', `
        <div class="create-plan-modal">
            <h3>Create Subscription Plan</h3>
            <form id="create-plan-form">
                <div class="form-group">
                    <label for="plan-name">Plan Name:</label>
                    <input type="text" id="plan-name" required placeholder="e.g., Premium Plan">
                </div>
                <div class="form-group">
                    <label for="plan-price">Price:</label>
                    <input type="number" id="plan-price" step="0.01" required placeholder="29.99">
                </div>
                <div class="form-group">
                    <label for="plan-interval">Billing Interval:</label>
                    <select id="plan-interval" required>
                        <option value="month">Monthly</option>
                        <option value="year">Yearly</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="plan-description">Description:</label>
                    <textarea id="plan-description" placeholder="Plan description..."></textarea>
                </div>
                <div class="form-group">
                    <label>Features:</label>
                    <div id="features-container">
                        <div class="feature-input">
                            <input type="text" placeholder="Feature 1">
                            <button type="button" class="btn btn-sm btn-danger" onclick="removeFeature(this)">
                                <i class="fas fa-minus"></i>
                            </button>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="addFeature()">
                        <i class="fas fa-plus"></i> Add Feature
                    </button>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> Create Plan
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `);
    
    document.getElementById('create-plan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const features = Array.from(document.querySelectorAll('#features-container input'))
            .map(input => input.value.trim())
            .filter(value => value);
        
        const planData = {
            name: document.getElementById('plan-name').value,
            price: parseFloat(document.getElementById('plan-price').value),
            interval: document.getElementById('plan-interval').value,
            description: document.getElementById('plan-description').value,
            features
        };
        
        try {
            await apiCall('/admin/subscription-plans', 'POST', planData);
            showNotification('Subscription plan created successfully', 'success');
            closeModal();
            renderAdminSubscriptions();
        } catch (error) {
            // Error already handled by apiCall
        }
    });
}

function addFeature() {
    const container = document.getElementById('features-container');
    const featureDiv = document.createElement('div');
    featureDiv.className = 'feature-input';
    featureDiv.innerHTML = `
        <input type="text" placeholder="New feature">
        <button type="button" class="btn btn-sm btn-danger" onclick="removeFeature(this)">
            <i class="fas fa-minus"></i>
        </button>
    `;
    container.appendChild(featureDiv);
}

function removeFeature(button) {
    button.parentElement.remove();
}

// --- MODAL FUNCTIONS ---
function showModal(id, content) {
    let modal = document.getElementById(id);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <button class="modal-close" onclick="closeModal('${id}')">&times;</button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeModal(id) {
    if (id) {
        const modal = document.getElementById(id);
        if (modal) modal.remove();
    } else {
        // Close all modals
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => modal.remove());
    }
}

// --- CHART INITIALIZATION ---
function initializeCharts(chartData) {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded');
        return;
    }
    
    // Growth Chart
    const growthCtx = document.getElementById('growthChart');
    if (growthCtx && chartData?.growth) {
        new Chart(growthCtx, {
            type: 'line',
            data: {
                labels: chartData.growth.labels,
                datasets: [
                    {
                        label: 'Users',
                        data: chartData.growth.users,
                        borderColor: '#007bff',
                        tension: 0.1
                    },
                    {
                        label: 'Quotes',
                        data: chartData.growth.quotes,
                        borderColor: '#28a745',
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    // User Distribution Chart
    const userCtx = document.getElementById('userChart');
    if (userCtx && chartData?.userDistribution) {
        new Chart(userCtx, {
            type: 'doughnut',
            data: {
                labels: ['Contractors', 'Designers'],
                datasets: [{
                    data: [
                        chartData.userDistribution.contractors,
                        chartData.userDistribution.designers
                    ],
                    backgroundColor: ['#007bff', '#28a745']
                }]
            },
            options: {
                responsive: true
            }
        });
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('admin-login-form')) {
        initializeLoginPage();
    } else if (document.getElementById('admin-panel-container')) {
        initializeAdminPage();
    }
    
    // Close modal when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal();
        }
    });
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});
