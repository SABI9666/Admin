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

// --- MODAL UTILITIES ---
function showModal(modalId, content) {
    // Remove existing modal if any
    const existingModal = document.getElementById('dynamic-modal');
    if (existingModal) existingModal.remove();
    
    // Create modal
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
        subscriptions: renderAdminSubscriptions,
        analytics: renderAdminAnalytics,
        'system-stats': renderSystemStats
    };
    
    setTimeout(() => renderMap[section] ? renderMap[section]() : renderComingSoon(section), 100);
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
// --- SUBSCRIPTION MANAGEMENT ---
async function renderAdminSubscriptions() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const [subscriptionsData, plansData] = await Promise.all([
            apiCall('/admin/subscriptions'),
            apiCall('/admin/subscription-plans')
        ]);
        
        contentArea.innerHTML = `
            <div class="subscriptions-management">
                <div class="subscription-tabs">
                    <button class="tab-button active" onclick="switchSubscriptionTab('plans')">
                        <i class="fas fa-layer-group"></i> Subscription Plans
                    </button>
                    <button class="tab-button" onclick="switchSubscriptionTab('users')">
                        <i class="fas fa-users"></i> User Subscriptions
                    </button>
                    <button class="tab-button" onclick="switchSubscriptionTab('analytics')">
                        <i class="fas fa-chart-bar"></i> Analytics
                    </button>
                </div>
                
                <!-- Subscription Plans Tab -->
                <div id="plans-tab" class="tab-content active">
                    <div class="admin-section-header">
                        <div class="section-title">
                            <h2>Subscription Plans</h2>
                            <span class="count-badge">${plansData.plans?.length || 0} plans</span>
                        </div>
                        <div class="section-actions">
                            <button class="btn btn-primary" onclick="createSubscriptionPlan()">
                                <i class="fas fa-plus"></i> Create New Plan
                            </button>
                        </div>
                    </div>
                    
                    <div class="plans-grid">
                        ${plansData.plans?.length ? plansData.plans.map(plan => `
                            <div class="plan-card">
                                <div class="plan-header">
                                    <h4>${plan.name}</h4>
                                    <div class="plan-price">
                                        ${formatCurrency(plan.price)}
                                        <small>/${plan.interval}</small>
                                    </div>
                                </div>
                                <div class="plan-body">
                                    <div class="plan-description">
                                        ${plan.description || 'No description available'}
                                    </div>
                                    <div class="plan-features">
                                        <h5>Features:</h5>
                                        <ul>
                                            ${plan.features?.map(feature => `<li><i class="fas fa-check"></i> ${feature}</li>`).join('') || '<li>No features listed</li>'}
                                        </ul>
                                    </div>
                                    <div class="plan-stats">
                                        <div class="stat-item">
                                            <i class="fas fa-users"></i>
                                            <span>${plan.subscriberCount || 0} subscribers</span>
                                        </div>
                                    </div>
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
                        `).join('') : '<div class="empty-state"><i class="fas fa-layer-group"></i><h3>No subscription plans</h3><p>Create your first subscription plan to get started.</p></div>'}
                    </div>
                </div>
                
                <!-- User Subscriptions Tab -->
                <div id="users-tab" class="tab-content">
                    <div class="admin-section-header">
                        <div class="section-title">
                            <h2>User Subscriptions</h2>
                            <span class="count-badge">${subscriptionsData.subscriptions?.length || 0} subscriptions</span>
                        </div>
                        <div class="section-actions">
                            <select id="subscription-status-filter" onchange="filterSubscriptionsByStatus(this.value)">
                                <option value="">All Status</option>
                                <option value="active">Active</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="expired">Expired</option>
                            </select>
                        </div>
                    </div>
                    
                    ${subscriptionsData.subscriptions?.length ? `
                        <div class="admin-table-container">
                            <table class="admin-table" id="subscriptions-table">
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
                                    ${subscriptionsData.subscriptions.map(sub => `
                                        <tr data-subscription-id="${sub._id}" data-status="${sub.status}">
                                            <td>
                                                <div class="user-info">
                                                    <div class="user-avatar">
                                                        <i class="fas fa-user"></i>
                                                    </div>
                                                    <div class="user-details">
                                                        <strong>${sub.userName}</strong>
                                                        <small>${sub.userEmail}</small>
                                                    </div>
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
                                                    <button class="btn btn-sm btn-info" onclick="viewSubscriptionDetails('${sub._id}')" title="View Details">
                                                        <i class="fas fa-eye"></i>
                                                    </button>
                                                    ${sub.status === 'active' ? `
                                                        <button class="btn btn-sm btn-warning" onclick="cancelSubscription('${sub._id}')" title="Cancel">
                                                            <i class="fas fa-ban"></i>
                                                        </button>
                                                    ` : ''}
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<div class="empty-state"><i class="fas fa-users"></i><h3>No subscriptions found</h3><p>User subscriptions will appear here when they subscribe to plans.</p></div>'}
                </div>
                
                <!-- Analytics Tab -->
                <div id="analytics-tab" class="tab-content">
                    <div class="subscription-analytics">
                        <h3>Subscription Analytics</h3>
                        <div class="analytics-grid">
                            <div class="analytics-card">
                                <h4>Revenue Overview</h4>
                                <div class="metrics-grid">
                                    <div class="metric">
                                        <span class="metric-value">${formatCurrency(calculateTotalRevenue(subscriptionsData.subscriptions))}</span>
                                        <span class="metric-label">Total Revenue</span>
                                    </div>
                                    <div class="metric">
                                        <span class="metric-value">${formatCurrency(calculateMonthlyRevenue(subscriptionsData.subscriptions))}</span>
                                        <span class="metric-label">Monthly Revenue</span>
                                    </div>
                                </div>
                            </div>
                            <div class="analytics-card">
                                <h4>Plan Performance</h4>
                                <div class="plan-performance">
                                    ${generatePlanPerformanceChart(plansData.plans)}
                                </div>
                            </div>
                        </div>
                    </div>
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

function switchSubscriptionTab(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab
    document.querySelector(`[onclick="switchSubscriptionTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
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

async function editSubscriptionPlan(planId) {
    try {
        const plan = await apiCall(`/admin/subscription-plans/${planId}`);
        // Implementation for editing plan - similar to create but with pre-filled data
        showNotification('Edit plan functionality to be implemented', 'info');
    } catch (error) {
        showNotification('Failed to load plan details', 'error');
    }
}

async function deleteSubscriptionPlan(planId) {
    if (confirm('Are you sure you want to delete this subscription plan? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/subscription-plans/${planId}`, 'DELETE');
            showNotification('Subscription plan deleted successfully', 'success');
            renderAdminSubscriptions();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function cancelSubscription(subscriptionId) {
    if (confirm('Are you sure you want to cancel this subscription?')) {
        try {
            await apiCall(`/admin/subscriptions/${subscriptionId}/cancel`, 'PATCH');
            showNotification('Subscription cancelled successfully', 'success');
            renderAdminSubscriptions();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function viewSubscriptionDetails(subscriptionId) {
    try {
        const data = await apiCall(`/admin/subscriptions/${subscriptionId}`);
        const subscription = data.subscription;
        
        showModal('subscription-details-modal', `
            <div class="subscription-details-modal">
                <h3>Subscription Details</h3>
                <div class="subscription-info">
                    <div class="info-section">
                        <h4>User Information</h4>
                        <p><strong>Name:</strong> ${subscription.userName}</p>
                        <p><strong>Email:</strong> ${subscription.userEmail}</p>
                    </div>
                    <div class="info-section">
                        <h4>Plan Information</h4>
                        <p><strong>Plan:</strong> ${subscription.planName}</p>
                        <p><strong>Price:</strong> ${formatCurrency(subscription.planPrice)}/${subscription.planInterval}</p>
                        <p><strong>Status:</strong> <span class="status-badge ${subscription.status}">${subscription.status}</span></p>
                    </div>
                    <div class="info-section">
                        <h4>Billing Information</h4>
                        <p><strong>Start Date:</strong> ${formatDate(subscription.startDate)}</p>
                        <p><strong>Next Billing:</strong> ${subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : 'N/A'}</p>
                        <p><strong>Total Paid:</strong> ${formatCurrency(subscription.totalPaid || 0)}</p>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load subscription details', 'error');
    }
}

function filterSubscriptionsByStatus(status) {
    const table = document.getElementById('subscriptions-table');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const subscriptionStatus = row.dataset.status;
        const shouldShow = !status || subscriptionStatus === status;
        row.style.display = shouldShow ? '' : 'none';
    });
}

function calculateTotalRevenue(subscriptions) {
    if (!subscriptions) return 0;
    return subscriptions
        .filter(sub => sub.status === 'active')
        .reduce((total, sub) => total + (sub.planPrice || 0), 0);
}

function calculateMonthlyRevenue(subscriptions) {
    if (!subscriptions) return 0;
    return subscriptions
        .filter(sub => sub.status === 'active' && sub.planInterval === 'month')
        .reduce((total, sub) => total + (sub.planPrice || 0), 0);
}

function generatePlanPerformanceChart(plans) {
    if (!plans || plans.length === 0) {
        return '<p>No plan data available</p>';
    }
    
    return plans.map(plan => `
        <div class="plan-performance-item">
            <div class="plan-name">${plan.name}</div>
            <div class="plan-subscribers">
                <div class="subscriber-bar">
                    <div class="subscriber-fill" style="width: ${(plan.subscriberCount / Math.max(...plans.map(p => p.subscriberCount))) * 100}%"></div>
                </div>
                <span class="subscriber-count">${plan.subscriberCount || 0}</span>
            </div>
        </div>
    `).join('');
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
        const data = await apiCall(`/admin/messages/${messageId}`);
        const message = data.message;
        
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
        const data = await apiCall(`/admin/messages/${messageId}`);
        const message = data.message;
        
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
        const data = await apiCall(`/admin/quotes/${quoteId}`);
        const quote = data.quote;
        
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
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load quote details', 'error');
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
// --- ENHANCED ESTIMATION MANAGEMENT ---
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
        const row = document.querySelector(`tr[data-estimation-id="${estimationId}"]`);
        if (row) row.dataset.status = newStatus;
    } catch (error) {
        const select = document.querySelector(`select[onchange*="${estimationId}"]`);
        if (select) select.value = select.dataset.current;
    }
}

async function viewEstimationDetails(estimationId) {
    try {
        const data = await apiCall(`/admin/estimations/${estimationId}`);
        const estimation = data.estimation;
        
        showModal('estimation-details-modal', `
            <div class="estimation-details-modal">
                <h3>Estimation Details</h3>
                <div class="estimation-content">
                    <div class="estimation-header">
                        <div class="contractor-section">
                            <h4>Contractor Information</h4>
                            <p><strong>Name:</strong> ${estimation.contractorName}</p>
                            <p><strong>Email:</strong> ${estimation.contractorEmail}</p>
                            <p><strong>Company:</strong> ${estimation.contractorCompany || 'Not specified'}</p>
                        </div>
                        <div class="project-section">
                            <h4>Project Information</h4>
                            <p><strong>Title:</strong> ${estimation.projectTitle}</p>
                            <p><strong>Type:</strong> ${estimation.projectType || 'General'}</p>
                            <p><strong>Status:</strong> <span class="status-badge ${estimation.status}">${estimation.status}</span></p>
                        </div>
                    </div>
                    
                    <div class="estimation-description">
                        <h4>Project Description</h4>
                        <p>${estimation.description || 'No description provided'}</p>
                    </div>
                    
                    ${estimation.uploadedFiles?.length ? `
                        <div class="estimation-files">
                            <h4>Uploaded Files</h4>
                            <div class="files-list">
                                ${estimation.uploadedFiles.map(file => `
                                    <div class="file-item">
                                        <i class="fas fa-file"></i>
                                        <span>${file.name}</span>
                                        <button class="btn btn-sm btn-link" onclick="downloadFile('${file.url}', '${file.name}')">
                                            <i class="fas fa-download"></i>
                                        </button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="estimation-metadata">
                        <p><strong>Created:</strong> ${formatDate(estimation.createdAt)}</p>
                        <p><strong>Due Date:</strong> ${estimation.dueDate ? formatDate(estimation.dueDate) : 'Not set'}</p>
                        <p><strong>Last Updated:</strong> ${formatDate(estimation.updatedAt)}</p>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load estimation details', 'error');
    }
}

async function viewEstimationFiles(estimationId) {
    try {
        const data = await apiCall(`/admin/estimations/${estimationId}/files`);
        const files = data.files;
        
        showModal('files-modal', `
            <div class="files-modal">
                <h3>Uploaded Files</h3>
                <div class="files-grid">
                    ${files.map(file => `
                        <div class="file-card">
                            <div class="file-icon">
                                <i class="fas fa-${getFileIcon(file.type)}"></i>
                            </div>
                            <div class="file-info">
                                <h4>${file.name}</h4>
                                <p>${formatFileSize(file.size)}</p>
                                <small>Uploaded: ${formatDate(file.uploadedAt)}</small>
                            </div>
                            <div class="file-actions">
                                <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.url}', '${file.name}')">
                                    <i class="fas fa-download"></i> Download
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load files', 'error');
    }
}

function getFileIcon(fileType) {
    const icons = {
        'pdf': 'file-pdf',
        'doc': 'file-word',
        'docx': 'file-word',
        'xls': 'file-excel',
        'xlsx': 'file-excel',
        'jpg': 'file-image',
        'jpeg': 'file-image',
        'png': 'file-image',
        'gif': 'file-image',
        'zip': 'file-archive',
        'rar': 'file-archive',
        'txt': 'file-alt'
    };
    return icons[fileType?.toLowerCase()] || 'file';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function setEstimationDueDate(estimationId) {
    const dueDate = prompt('Enter due date (YYYY-MM-DD):');
    if (dueDate && isValidDate(dueDate)) {
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

function isValidDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

async function uploadEstimationResult(estimationId) {
    showModal('upload-result-modal', `
        <div class="upload-result-modal">
            <h3>Upload Estimation Result</h3>
            <form id="upload-result-form">
                <div class="form-group">
                    <label for="result-file">Select Result File:</label>
                    <input type="file" id="result-file" accept=".pdf,.doc,.docx,.xls,.xlsx" required>
                </div>
                <div class="form-group">
                    <label for="result-notes">Notes (optional):</label>
                    <textarea id="result-notes" placeholder="Add any notes about the estimation result..."></textarea>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-upload"></i> Upload Result
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `);
    
    document.getElementById('upload-result-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fileInput = document.getElementById('result-file');
        const notes = document.getElementById('result-notes').value;
        
        if (!fileInput.files[0]) {
            showNotification('Please select a file', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('resultFile', fileInput.files[0]);
        formData.append('notes', notes);
        
        try {
            await apiCall(`/admin/estimations/${estimationId}/result`, 'POST', formData, true);
            showNotification('Estimation result uploaded successfully', 'success');
            closeModal();
            renderAdminEstimations();
        } catch (error) {
            // Error already handled by apiCall
        }
    });
}

async function downloadEstimationResult(estimationId) {
    try {
        const data = await apiCall(`/admin/estimations/${estimationId}/result`);
        downloadFile(data.resultFile.url, data.resultFile.name);
    } catch (error) {
        showNotification('Failed to download result file', 'error');
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

async function deleteEstimation(estimationId) {
    if (confirm('Are you sure you want to delete this estimation? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/estimations/${estimationId}`, 'DELETE');
            showNotification('Estimation deleted successfully', 'success');
            renderAdminEstimations();
        } catch (error) {
            // Error already handled by apiCall
        }
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
                    <p>Jobs will appear here once projects are initiated.</p>
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
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="on-hold">On Hold</option>
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
                            <th>Job #</th>
                            <th>Project</th>
                            <th>Client</th>
                            <th>Contractor</th>
                            <th>Value</th>
                            <th>Status</th>
                            <th>Progress</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${jobs.map(job => `
                            <tr data-job-id="${job._id}" data-status="${job.status}" data-client="${job.clientName}">
                                <td><strong>#${job.jobNumber || job._id.slice(-6)}</strong></td>
                                <td>
                                    <div class="project-info">
                                        <strong>${job.projectTitle}</strong>
                                        <small>${job.projectType}</small>
                                    </div>
                                </td>
                                <td>
                                    <div class="client-info">
                                        <strong>${job.clientName}</strong>
                                        <small>${job.clientEmail}</small>
                                    </div>
                                </td>
                                <td>
                                    <div class="contractor-info">
                                        <strong>${job.contractorName}</strong>
                                        <small>${job.contractorCompany || 'Independent'}</small>
                                    </div>
                                </td>
                                <td>${formatCurrency(job.value)}</td>
                                <td>
                                    <select class="status-select" onchange="updateJobStatus('${job._id}', this.value)" data-current="${job.status}">
                                        <option value="active" ${job.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="completed" ${job.status === 'completed' ? 'selected' : ''}>Completed</option>
                                        <option value="cancelled" ${job.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                        <option value="on-hold" ${job.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
                                    </select>
                                </td>
                                <td>
                                    <div class="progress-container">
                                        <div class="progress-bar">
                                            <div class="progress-fill" style="width: ${job.progress || 0}%"></div>
                                        </div>
                                        <span class="progress-text">${job.progress || 0}%</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewJobDetails('${job._id}')" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning" onclick="updateJobProgress('${job._id}', ${job.progress || 0})" title="Update Progress">
                                            <i class="fas fa-chart-line"></i>
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
        const client = row.dataset.client.toLowerCase();
        const project = row.cells[1].textContent.toLowerCase();
        const contractor = row.cells[3].textContent.toLowerCase();
        const shouldShow = client.includes(searchTerm.toLowerCase()) || 
                          project.includes(searchTerm.toLowerCase()) ||
                          contractor.includes(searchTerm.toLowerCase());
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
        const row = document.querySelector(`tr[data-job-id="${jobId}"]`);
        if (row) row.dataset.status = newStatus;
    } catch (error) {
        const select = document.querySelector(`select[onchange*="${jobId}"]`);
        if (select) select.value = select.dataset.current;
    }
}

async function updateJobProgress(jobId, currentProgress) {
    const newProgress = prompt('Enter progress percentage (0-100):', currentProgress);
    if (newProgress !== null && !isNaN(newProgress)) {
        const progress = Math.max(0, Math.min(100, parseInt(newProgress)));
        try {
            await apiCall(`/admin/jobs/${jobId}/progress`, 'PATCH', { progress });
            showNotification('Job progress updated successfully', 'success');
            renderAdminJobs();
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function viewJobDetails(jobId) {
    try {
        const data = await apiCall(`/admin/jobs/${jobId}`);
        const job = data.job;
        
        showModal('job-details-modal', `
            <div class="job-details-modal">
                <h3>Job Details - #${job.jobNumber || job._id.slice(-6)}</h3>
                <div class="job-content">
                    <div class="job-header">
                        <div class="client-section">
                            <h4>Client Information</h4>
                            <p><strong>Name:</strong> ${job.clientName}</p>
                            <p><strong>Email:</strong> ${job.clientEmail}</p>
                            <p><strong>Phone:</strong> ${job.clientPhone || 'Not provided'}</p>
                        </div>
                        <div class="contractor-section">
                            <h4>Contractor Information</h4>
                            <p><strong>Name:</strong> ${job.contractorName}</p>
                            <p><strong>Email:</strong> ${job.contractorEmail}</p>
                            <p><strong>Company:</strong> ${job.contractorCompany || 'Independent'}</p>
                        </div>
                    </div>
                    
                    <div class="project-section">
                        <h4>Project Information</h4>
                        <p><strong>Title:</strong> ${job.projectTitle}</p>
                        <p><strong>Type:</strong> ${job.projectType}</p>
                        <p><strong>Value:</strong> ${formatCurrency(job.value)}</p>
                        <p><strong>Status:</strong> <span class="status-badge ${job.status}">${job.status}</span></p>
                        <p><strong>Progress:</strong> ${job.progress || 0}%</p>
                    </div>
                    
                    <div class="job-description">
                        <h4>Project Description</h4>
                        <p>${job.description || 'No description provided'}</p>
                    </div>
                    
                    <div class="job-timeline">
                        <h4>Timeline</h4>
                        <p><strong>Start Date:</strong> ${job.startDate ? formatDate(job.startDate) : 'Not set'}</p>
                        <p><strong>Expected Completion:</strong> ${job.expectedCompletion ? formatDate(job.expectedCompletion) : 'Not set'}</p>
                        <p><strong>Created:</strong> ${formatDate(job.createdAt)}</p>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
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
// --- ANALYTICS ---
async function renderAdminAnalytics() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const data = await apiCall('/admin/analytics');
        
        contentArea.innerHTML = `
            <div class="analytics-dashboard">
                <div class="analytics-header">
                    <h2>Analytics Dashboard</h2>
                    <div class="date-range-selector">
                        <select id="analytics-period" onchange="updateAnalyticsPeriod(this.value)">
                            <option value="7d">Last 7 Days</option>
                            <option value="30d" selected>Last 30 Days</option>
                            <option value="90d">Last 90 Days</option>
                            <option value="1y">Last Year</option>
                        </select>
                    </div>
                </div>
                
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <h3>Revenue Overview</h3>
                        <div class="revenue-stats">
                            <div class="stat-item">
                                <span class="stat-value">${formatCurrency(data.revenue?.total || 0)}</span>
                                <span class="stat-label">Total Revenue</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${formatCurrency(data.revenue?.monthly || 0)}</span>
                                <span class="stat-label">Monthly Average</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${data.revenue?.growth || 0}%</span>
                                <span class="stat-label">Growth Rate</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="analytics-card">
                        <h3>User Activity</h3>
                        <div class="activity-stats">
                            <div class="stat-item">
                                <span class="stat-value">${data.users?.active || 0}</span>
                                <span class="stat-label">Active Users</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${data.users?.new || 0}</span>
                                <span class="stat-label">New Registrations</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${data.users?.retention || 0}%</span>
                                <span class="stat-label">Retention Rate</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="analytics-card">
                        <h3>Project Statistics</h3>
                        <div class="project-stats">
                            <div class="stat-item">
                                <span class="stat-value">${data.projects?.total || 0}</span>
                                <span class="stat-label">Total Projects</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${data.projects?.completed || 0}</span>
                                <span class="stat-label">Completed</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${data.projects?.active || 0}</span>
                                <span class="stat-label">Active</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="analytics-card full-width">
                        <h3>Performance Trends</h3>
                        <div class="chart-container">
                            <canvas id="performance-chart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Initialize chart if Chart.js is available
        if (typeof Chart !== 'undefined') {
            initializePerformanceChart(data.trends);
        }
        
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load analytics</h3>
                <button class="btn btn-primary" onclick="renderAdminAnalytics()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

function initializePerformanceChart(trendsData) {
    const ctx = document.getElementById('performance-chart');
    if (!ctx || !trendsData) return;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendsData.labels || [],
            datasets: [{
                label: 'Revenue',
                data: trendsData.revenue || [],
                borderColor: '#007bff',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                tension: 0.4
            }, {
                label: 'Projects',
                data: trendsData.projects || [],
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

async function updateAnalyticsPeriod(period) {
    try {
        const data = await apiCall(`/admin/analytics?period=${period}`);
        renderAdminAnalytics();
    } catch (error) {
        showNotification('Failed to update analytics period', 'error');
    }
}

// --- SYSTEM STATS ---
async function renderSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const data = await apiCall('/admin/system-stats');
        
        contentArea.innerHTML = `
            <div class="system-stats">
                <h2>System Statistics</h2>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>Server Performance</h3>
                        <div class="performance-metrics">
                            <div class="metric">
                                <span class="metric-label">CPU Usage</span>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: ${data.server?.cpu || 0}%"></div>
                                </div>
                                <span class="metric-value">${data.server?.cpu || 0}%</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">Memory Usage</span>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: ${data.server?.memory || 0}%"></div>
                                </div>
                                <span class="metric-value">${data.server?.memory || 0}%</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">Disk Usage</span>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: ${data.server?.disk || 0}%"></div>
                                </div>
                                <span class="metric-value">${data.server?.disk || 0}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>Database Statistics</h3>
                        <div class="db-stats">
                            <div class="db-metric">
                                <span class="db-label">Total Records</span>
                                <span class="db-value">${(data.database?.totalRecords || 0).toLocaleString()}</span>
                            </div>
                            <div class="db-metric">
                                <span class="db-label">Database Size</span>
                                <span class="db-value">${formatFileSize(data.database?.size || 0)}</span>
                            </div>
                            <div class="db-metric">
                                <span class="db-label">Active Connections</span>
                                <span class="db-value">${data.database?.connections || 0}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>API Usage</h3>
                        <div class="api-stats">
                            <div class="api-metric">
                                <span class="api-label">Requests Today</span>
                                <span class="api-value">${(data.api?.requestsToday || 0).toLocaleString()}</span>
                            </div>
                            <div class="api-metric">
                                <span class="api-label">Average Response Time</span>
                                <span class="api-value">${data.api?.avgResponseTime || 0}ms</span>
                            </div>
                            <div class="api-metric">
                                <span class="api-label">Error Rate</span>
                                <span class="api-value">${data.api?.errorRate || 0}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>System Health</h3>
                        <div class="health-indicators">
                            <div class="health-item ${data.health?.server ? 'healthy' : 'unhealthy'}">
                                <i class="fas fa-${data.health?.server ? 'check-circle' : 'exclamation-circle'}"></i>
                                <span>Server Status</span>
                            </div>
                            <div class="health-item ${data.health?.database ? 'healthy' : 'unhealthy'}">
                                <i class="fas fa-${data.health?.database ? 'check-circle' : 'exclamation-circle'}"></i>
                                <span>Database</span>
                            </div>
                            <div class="health-item ${data.health?.storage ? 'healthy' : 'unhealthy'}">
                                <i class="fas fa-${data.health?.storage ? 'check-circle' : 'exclamation-circle'}"></i>
                                <span>File Storage</span>
                            </div>
                            <div class="health-item ${data.health?.email ? 'healthy' : 'unhealthy'}">
                                <i class="fas fa-${data.health?.email ? 'check-circle' : 'exclamation-circle'}"></i>
                                <span>Email Service</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="system-actions">
                    <h3>System Actions</h3>
                    <div class="action-buttons">
                        <button class="btn btn-warning" onclick="clearCache()">
                            <i class="fas fa-trash-alt"></i> Clear Cache
                        </button>
                        <button class="btn btn-info" onclick="generateBackup()">
                            <i class="fas fa-download"></i> Generate Backup
                        </button>
                        <button class="btn btn-success" onclick="runHealthCheck()">
                            <i class="fas fa-stethoscope"></i> Run Health Check
                        </button>
                        <button class="btn btn-secondary" onclick="viewSystemLogs()">
                            <i class="fas fa-file-alt"></i> View Logs
                        </button>
                    </div>
                </div>
            </div>
        `;
        
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load system statistics</h3>
                <button class="btn btn-primary" onclick="renderSystemStats()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

async function clearCache() {
    if (confirm('Are you sure you want to clear the system cache?')) {
        try {
            await apiCall('/admin/system/clear-cache', 'POST');
            showNotification('Cache cleared successfully', 'success');
        } catch (error) {
            // Error already handled by apiCall
        }
    }
}

async function generateBackup() {
    try {
        showNotification('Backup generation started...', 'info');
        const data = await apiCall('/admin/system/backup', 'POST');
        showNotification('Backup generated successfully', 'success');
        downloadFile(data.backupUrl, `backup-${new Date().toISOString().split('T')[0]}.zip`);
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function runHealthCheck() {
    try {
        showNotification('Running health check...', 'info');
        const data = await apiCall('/admin/system/health-check', 'POST');
        showNotification('Health check completed', 'success');
        renderSystemStats(); // Refresh the stats
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function viewSystemLogs() {
    try {
        const data = await apiCall('/admin/system/logs');
        showModal('system-logs-modal', `
            <div class="system-logs-modal">
                <h3>System Logs</h3>
                <div class="logs-container">
                    <div class="logs-header">
                        <select id="log-level-filter" onchange="filterLogs(this.value)">
                            <option value="">All Levels</option>
                            <option value="error">Errors</option>
                            <option value="warning">Warnings</option>
                            <option value="info">Info</option>
                            <option value="debug">Debug</option>
                        </select>
                        <button class="btn btn-sm btn-secondary" onclick="refreshLogs()">
                            <i class="fas fa-redo"></i> Refresh
                        </button>
                    </div>
                    <div class="logs-list" id="logs-list">
                        ${data.logs?.map(log => `
                            <div class="log-entry ${log.level}" data-level="${log.level}">
                                <span class="log-timestamp">${formatDate(log.timestamp)}</span>
                                <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
                                <span class="log-message">${log.message}</span>
                            </div>
                        `).join('') || '<p>No logs available</p>'}
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load system logs', 'error');
    }
}

function filterLogs(level) {
    const logs = document.querySelectorAll('.log-entry');
    logs.forEach(log => {
        const shouldShow = !level || log.dataset.level === level;
        log.style.display = shouldShow ? '' : 'none';
    });
}

async function refreshLogs() {
    try {
        const data = await apiCall('/admin/system/logs');
        const logsList = document.getElementById('logs-list');
        logsList.innerHTML = data.logs?.map(log => `
            <div class="log-entry ${log.level}" data-level="${log.level}">
                <span class="log-timestamp">${formatDate(log.timestamp)}</span>
                <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `).join('') || '<p>No logs available</p>';
    } catch (error) {
        showNotification('Failed to refresh logs', 'error');
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

async function exportQuotes() {
    try {
        const data = await apiCall('/admin/export/quotes');
        downloadFile(data.downloadUrl, `quotes-export-${new Date().toISOString().split('T')[0]}.csv`);
        showNotification('Quotes exported successfully', 'success');
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function exportEstimations() {
    try {
        const data = await apiCall('/admin/export/estimations');
        downloadFile(data.downloadUrl, `estimations-export-${new Date().toISOString().split('T')[0]}.csv`);
        showNotification('Estimations exported successfully', 'success');
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function exportJobs() {
    try {
        const data = await apiCall('/admin/export/jobs');
        downloadFile(data.downloadUrl, `jobs-export-${new Date().toISOString().split('T')[0]}.csv`);
        showNotification('Jobs exported successfully', 'success');
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function exportMessages() {
    try {
        const data = await apiCall('/admin/export/messages');
        downloadFile(data.downloadUrl, `messages-export-${new Date().toISOString().split('T')[0]}.csv`);
        showNotification('Messages exported successfully', 'success');
    } catch (error) {
        // Error already handled by apiCall
    }
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

// --- UTILITY FUNCTIONS FOR MISSING IMPLEMENTATIONS ---
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global error:', { msg, url, lineNo, columnNo, error });
    showNotification('An unexpected error occurred. Please refresh the page.', 'error');
    return false;
};

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('An unexpected error occurred. Please try again.', 'error');
});

// Add progress tracking for file uploads
function trackUploadProgress(xhr, progressCallback) {
    xhr.upload.addEventListener('progress', function(e) {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            if (progressCallback) progressCallback(percentComplete);
        }
    });
}

// Add retry mechanism for failed API calls
async function retryApiCall(apiFunction, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiFunction();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

// Add debounce function for search inputs
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

// Update search functions to use debounce
const debouncedFilterUsers = debounce(filterUsers, 300);
const debouncedFilterQuotes = debounce(filterQuotes, 300);
const debouncedFilterEstimations = debounce(filterEstimations, 300);
const debouncedFilterJobs = debounce(filterJobs, 300);
const debouncedFilterMessages = debounce(filterMessages, 300);

// Add loading states for buttons
function setButtonLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText;
    }
}

// Add confirmation dialogs for critical actions
function confirmAction(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

// Add notification queuing system
const notificationQueue = [];
let isShowingNotification = false;

function queueNotification(message, type) {
    notificationQueue.push({ message, type });
    processNotificationQueue();
}

function processNotificationQueue() {
    if (isShowingNotification || notificationQueue.length === 0) return;
    
    isShowingNotification = true;
    const { message, type } = notificationQueue.shift();
    showNotification(message, type);
    
    setTimeout(() => {
        isShowingNotification = false;
        processNotificationQueue();
    }, 5500);
}

// Enhanced error handling
function handleApiError(error, context = '') {
    console.error(`API Error ${context}:`, error);
    
    if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        showNotification('Session expired. Please log in again.', 'error');
        setTimeout(() => logout(), 2000);
    } else if (error.message.includes('Network error')) {
        showNotification('Network connection error. Please check your internet connection.', 'error');
    } else {
        showNotification(error.message || 'An unexpected error occurred.', 'error');
    }
}

// Add auto-refresh for dashboard
let dashboardRefreshInterval;

function startDashboardAutoRefresh() {
    if (appState.currentSection === 'dashboard') {
        dashboardRefreshInterval = setInterval(() => {
            if (appState.currentSection === 'dashboard') {
                renderAdminDashboard();
            }
        }, 30000); // Refresh every 30 seconds
    }
}

function stopDashboardAutoRefresh() {
    if (dashboardRefreshInterval) {
        clearInterval(dashboardRefreshInterval);
        dashboardRefreshInterval = null;
    }
}

// Add visibility change handler to pause/resume auto-refresh
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        stopDashboardAutoRefresh();
    } else if (appState.currentSection === 'dashboard') {
        startDashboardAutoRefresh();
    }
});

// Add performance monitoring
const performanceMonitor = {
    startTime: null,
    
    start() {
        this.startTime = performance.now();
    },
    
    end(operation) {
        if (this.startTime) {
            const duration = performance.now() - this.startTime;
            console.log(`${operation} took ${duration.toFixed(2)}ms`);
            this.startTime = null;
        }
    }
};

// Add memory cleanup for large data sets
function cleanupLargeDataSets() {
    // Remove large data from memory after use
    if (window.largeDataCache) {
        delete window.largeDataCache;
    }
}

// Add beforeunload handler to warn about unsaved changes
window.addEventListener('beforeunload', function(e) {
    if (window.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Export functions for external use
window.SteelConnectAdmin = {
    apiCall,
    showNotification,
    formatCurrency,
    formatDate,
    logout,
    performanceMonitor
};
