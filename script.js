// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    currentUser: null,
    currentFilter: '',
    currentSection: 'dashboard',
    uploadProgress: 0
};
const API_BASE_URL = 'https://steelconnect-backend.onrender.com'; // NOTE: Base URL for API calls

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

function getToken() {
    return localStorage.getItem('jwtToken');
}

async function apiCall(endpoint, method = 'GET', body = null, isFileUpload = false) {
    const token = getToken();
    const options = {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
    };

    if (body && !isFileUpload) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    } else if (body && isFileUpload) {
        options.body = body;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, options);
        if (response.headers.get('Content-Type')?.includes('json')) {
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData.message || `HTTP error! Status: ${response.status}`);
            return responseData;
        }
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response; // Return raw response for file streams, etc.
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
        const token = getToken();
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
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

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
        // Make messages data globally available for this section for simplicity of filtering
        window.messagesData = messages || [];

        if (messages.length === 0) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>No messages found</h3>
                    <p>User messages will appear here.</p>
                    <button class="btn btn-primary" onclick="renderAdminMessages()">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            `;
            return;
        }

        const unreadCount = messages.filter(m => (!m.isRead || m.status === 'unread') && !m.isBlocked).length;
        const blockedCount = messages.filter(m => m.isBlocked).length;

        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title">
                    <h2>Messages Management</h2>
                    <span class="count-badge">${messages.length} total</span>
                    ${unreadCount > 0 ? `<span class="count-badge unread">${unreadCount} unread</span>` : ''}
                    ${blockedCount > 0 ? `<span class="count-badge blocked">${blockedCount} blocked</span>` : ''}
                </div>
                <div class="section-actions">
                     <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search messages..." id="message-search" oninput="filterMessagesByTerm(this.value)">
                    </div>
                    <select id="message-status-filter" onchange="filterMessagesByStatus(this.value)">
                        <option value="">All Messages</option>
                        <option value="unread">Unread Only</option>
                        <option value="read">Read Only</option>
                        <option value="blocked">Blocked Only</option>
                        <option value="replied">Replied</option>
                    </select>
                    ${unreadCount > 0 ? `
                        <button class="btn btn-success" onclick="markAllAsRead()">
                            <i class="fas fa-check-double"></i> Mark All Read
                        </button>
                    ` : ''}
                </div>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="messages-table">
                    <thead>
                        <tr>
                            <th>From</th>
                            <th>Subject</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${messages.map(message => {
                            const messageId = message._id || message.id;
                            const isUnread = !message.isRead || message.status === 'unread';
                            const isBlocked = message.isBlocked;
                            let rowClass = '';

                            if (isBlocked) {
                                rowClass = 'blocked-row';
                            } else if (isUnread) {
                                rowClass = 'unread-row';
                            }

                            return `
                                <tr class="${rowClass}" data-message-id="${messageId}"
                                    data-status="${isBlocked ? 'blocked' : (message.status || (isRead ? 'read' : 'unread'))}"
                                    data-sender-name="${message.senderName || ''}"
                                    data-sender-email="${message.senderEmail || ''}"
                                    data-subject="${message.subject || ''}">
                                    <td>
                                        <div class="user-info">
                                            <strong>${message.senderName || 'Anonymous'}</strong>
                                            <small>${message.senderEmail || 'No email'}</small>
                                            ${isBlocked ? '<span class="status-badge blocked">BLOCKED</span>' : ''}
                                        </div>
                                    </td>
                                    <td>
                                        <span class="${isUnread && !isBlocked ? 'font-weight-bold' : ''}">
                                            ${message.subject || 'No subject'}
                                        </span>
                                    </td>
                                    <td><span class="type-badge ${message.type || 'general'}">${(message.type || 'general').toUpperCase()}</span></td>
                                    <td>
                                        <span class="status-badge ${isBlocked ? 'blocked' : (message.status || (message.isRead ? 'read' : 'unread'))}">
                                            ${isBlocked ? 'Blocked' : (message.status || (message.isRead ? 'Read' : 'Unread'))}
                                        </span>
                                    </td>
                                    <td>${message.createdAt ? formatDate(message.createdAt) : 'N/A'}</td>
                                    <td>
                                        <div class="action-buttons">
                                            <button class="btn btn-sm btn-info" onclick="viewMessageDetails('${messageId}')" title="View Message"><i class="fas fa-eye"></i></button>
                                            ${!isBlocked ? `
                                                <button class="btn btn-sm btn-primary" onclick="replyToMessage('${messageId}')" title="Reply"><i class="fas fa-reply"></i></button>
                                                ${isUnread ? `<button class="btn btn-sm btn-success" onclick="markAsRead('${messageId}')" title="Mark as Read"><i class="fas fa-check"></i></button>` : ''}
                                                <button class="btn btn-sm btn-warning" onclick="blockMessage('${messageId}', true)" title="Block Message"><i class="fas fa-ban"></i></button>
                                            ` : `
                                                <button class="btn btn-sm btn-success" onclick="blockMessage('${messageId}', false)" title="Unblock Message"><i class="fas fa-check-circle"></i></button>
                                            `}
                                            <button class="btn btn-sm btn-secondary" onclick="blockUserMessages('${message.senderEmail || message.email}', ${!isBlocked})" title="${isBlocked ? 'Unblock User' : 'Block User from Messaging'}"><i class="fas fa-user-${isBlocked ? 'check' : 'ban'}"></i></button>
                                            <button class="btn btn-sm btn-danger" onclick="deleteMessage('${messageId}')" title="Delete"><i class="fas fa-trash"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
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

function filterMessagesByTerm(searchTerm) {
    const table = document.getElementById('messages-table');
    const rows = table.querySelectorAll('tbody tr');
    const term = searchTerm.toLowerCase();

    rows.forEach(row => {
        const senderName = row.dataset.senderName.toLowerCase();
        const senderEmail = row.dataset.senderEmail.toLowerCase();
        const subject = row.dataset.subject.toLowerCase();
        const shouldShow = senderName.includes(term) || senderEmail.includes(term) || subject.includes(term);
        row.style.display = shouldShow ? '' : 'none';
    });
}

function filterMessagesByStatus(filterValue) {
    const rows = document.querySelectorAll('#messages-table tbody tr');
    rows.forEach(row => {
        const message = window.messagesData.find(m => m._id === row.dataset.messageId);
        if (!message) return;

        let shouldShow = true;
        if (filterValue) {
            switch (filterValue) {
                case 'unread':
                    shouldShow = (!message.isRead || message.status === 'unread') && !message.isBlocked;
                    break;
                case 'read':
                    shouldShow = message.isRead && message.status !== 'unread' && !message.isBlocked;
                    break;
                case 'blocked':
                    shouldShow = message.isBlocked;
                    break;
                case 'replied':
                    shouldShow = message.status === 'replied';
                    break;
            }
        }
        row.style.display = shouldShow ? '' : 'none';
    });
}

async function viewMessageDetails(messageId) {
    try {
        const data = await apiCall(`/admin/messages/${messageId}`);
        const message = data.message;

        if (message.status === 'unread') {
            await updateMessageStatus(messageId, 'read', false);
        }

        let blockingInfo = '';
        if (message.isBlocked) {
            blockingInfo = `
                <div class="blocking-info">
                    <h4>Blocking Information</h4>
                    <p><strong>Blocked At:</strong> ${message.blockedAt ? new Date(message.blockedAt).toLocaleString() : 'N/A'}</p>
                    <p><strong>Reason:</strong> ${message.blockReason || 'No reason provided'}</p>
                </div>
            `;
        }

        showModal('message-details-modal', `
            <div class="message-details-modal">
                <h3>Message Details</h3>
                <div class="message-full-header">
                    <div class="sender-info">
                         <strong>From:</strong> ${message.senderName} &lt;${message.senderEmail}&gt;
                         <p><small>Sent: ${new Date(message.createdAt).toLocaleString()}</small></p>
                    </div>
                    <span class="status-badge ${message.isBlocked ? 'blocked' : message.status}">
                        ${message.isBlocked ? 'Blocked' : message.status}
                    </span>
                </div>
                <div class="message-subject"><h4>${message.subject}</h4></div>
                <div class="message-full-content"><p>${message.content.replace(/\n/g, '<br>')}</p></div>
                ${blockingInfo}
                <div class="modal-actions">
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
        const { message } = await apiCall(`/admin/messages/${messageId}`);
        
        if (message.isBlocked) {
            showNotification('Cannot reply to a blocked message.', 'error');
            return;
        }
        
        showModal('reply-message-modal', `
            <div class="reply-message-modal">
                <h3>Reply to: ${message.subject}</h3>
                <form id="reply-form">
                    <div class="form-group"><input type="text" value="To: ${message.senderName} <${message.senderEmail}>" readonly></div>
                    <div class="form-group"><textarea id="reply-content" placeholder="Type your reply..." required></textarea></div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Send Reply</button>
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
            } catch (error) { /* Handled by apiCall */ }
        });
    } catch (error) {
        showNotification('Failed to load message for reply', 'error');
    }
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

async function markAsRead(messageId) {
    try {
        showNotification('Marking message as read...', 'info');
        await apiCall(`/admin/messages/${messageId}/status`, 'PATCH', { status: 'read', isRead: true });
        renderAdminMessages();
        showNotification('Message marked as read', 'success');
    } catch (error) {
        showNotification(`Failed to mark message as read: ${error.message}`, 'error');
    }
}


async function markAllAsRead() {
    if (!confirm('Mark all unread messages as read?')) return;
    
    const unreadMessages = window.messagesData.filter(m => (!m.isRead || m.status === 'unread') && !m.isBlocked);
    if (unreadMessages.length === 0) {
        showNotification('No unread messages to mark', 'info');
        return;
    }

    try {
        showNotification(`Marking ${unreadMessages.length} messages as read...`, 'info');
        const promises = unreadMessages.map(message =>
            apiCall(`/admin/messages/${message._id}/status`, 'PATCH', { status: 'read', isRead: true })
        );
        await Promise.all(promises);
        renderAdminMessages();
        showNotification(`${unreadMessages.length} messages marked as read`, 'success');
    } catch (error) {
        showNotification(`Failed to mark all messages as read: ${error.message}`, 'error');
    }
}


async function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/messages/${messageId}`, 'DELETE');
            showNotification('Message deleted successfully', 'success');
            renderAdminMessages();
        } catch (error) { /* Handled by apiCall */ }
    }
}

async function blockMessage(messageId, block = true) {
    const action = block ? 'block' : 'unblock';
    const reason = block ? prompt(`Enter reason for blocking this message:`) : '';

    if (block && reason === null) return; // User cancelled prompt

    try {
        showNotification(`${block ? 'Blocking' : 'Unblocking'} message...`, 'info');
        await apiCall(`/admin/messages/${messageId}/block`, 'PATCH', { block, reason });
        showNotification(`Message ${action}ed successfully`, 'success');
        renderAdminMessages();
    } catch (error) {
        showNotification(`Failed to ${action} message: ${error.message}`, 'error');
    }
}

async function blockUserMessages(userEmail, block = true) {
    const action = block ? 'block' : 'unblock';
    const confirmMessage = block ?
        `Block user "${userEmail}" from sending messages? This will also block all their existing messages.` :
        `Unblock user "${userEmail}"? This will restore their ability to send messages.`;

    if (!confirm(confirmMessage)) return;

    const reason = block ? prompt(`Enter reason for blocking this user:`) : '';
    if (block && reason === null) return; // User cancelled prompt

    try {
        showNotification(`${block ? 'Blocking' : 'Unblocking'} user messages...`, 'info');
        await apiCall(`/admin/users/block-messages`, 'PATCH', { email: userEmail, block, reason });
        showNotification(`User ${action}ed successfully`, 'success');
        renderAdminMessages();
    } catch (error) {
        showNotification(`Failed to ${action} user: ${error.message}`, 'error');
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
        const row = document.querySelector(`tr[data-quote-id="${quoteId}"]`);
        if (row) row.dataset.status = newStatus;
    } catch (error) {
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
                                        <button class="btn btn-sm btn-info" onclick="viewEstimationDetails('${est._id}')" title="View Details"><i class="fas fa-eye"></i></button>
                                        ${est.status === 'pending' || est.status === 'in-progress' ? `
                                            <button class="btn btn-sm btn-success" onclick="uploadEstimationResult('${est._id}')" title="Upload Result"><i class="fas fa-upload"></i></button>
                                        ` : ''}
                                        ${est.resultFile ? `
                                            <button class="btn btn-sm btn-primary" onclick="downloadEstimationResult('${est._id}')" title="Download Result"><i class="fas fa-download"></i></button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-danger" onclick="deleteEstimation('${est._id}')" title="Delete"><i class="fas fa-trash"></i></button>
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
                                        <a href="${file.url}" target="_blank" class="btn btn-sm btn-link" download><i class="fas fa-download"></i></a>
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
                     ${estimation.uploadedFiles?.length ? `<button class="btn btn-primary" onclick="downloadAllEstimationFiles('${estimationId}')"><i class="fas fa-download"></i> Download All Files</button>` : ''}
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
                            <div class="file-icon"><i class="fas fa-${getFileIcon(file.type)}"></i></div>
                            <div class="file-info">
                                <h4>${file.name}</h4>
                                <p>${formatFileSize(file.size)}</p>
                                <small>Uploaded: ${formatDate(file.uploadedAt)}</small>
                            </div>
                            <div class="file-actions">
                                <a href="${file.url}" target="_blank" download class="btn btn-sm btn-primary"><i class="fas fa-download"></i> Download</a>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="downloadAllEstimationFiles('${estimationId}')"><i class="fas fa-download"></i> Download All</button>
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load files', 'error');
    }
}


function getFileIcon(fileType) {
    const icons = { 'pdf': 'file-pdf', 'doc': 'file-word', 'docx': 'file-word', 'xls': 'file-excel', 'xlsx': 'file-excel', 'jpg': 'file-image', 'jpeg': 'file-image', 'png': 'file-image', 'gif': 'file-image', 'zip': 'file-archive', 'rar': 'file-archive', 'txt': 'file-alt' };
    return icons[fileType?.split('.').pop().toLowerCase()] || 'file';
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
    if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        try {
            await apiCall(`/admin/estimations/${estimationId}/due-date`, 'PATCH', { dueDate });
            showNotification('Due date set successfully', 'success');
            renderAdminEstimations();
        } catch (error) { /* Handled by apiCall */ }
    } else if (dueDate) {
        showNotification('Invalid date format. Please use YYYY-MM-DD', 'error');
    }
}

async function uploadEstimationResult(estimationId) {
    showModal('upload-result-modal', `
        <div class="upload-result-modal">
            <h3>Upload Estimation Result</h3>
            <form id="upload-result-form">
                <div class="form-group"><input type="file" id="result-file" accept=".pdf,.doc,.docx,.xls,.xlsx" required></div>
                <div class="form-group"><textarea id="result-notes" placeholder="Add any notes..."></textarea></div>
                <div class="form-actions"><button type="submit" class="btn btn-primary"><i class="fas fa-upload"></i> Upload</button></div>
            </form>
        </div>
    `);

    document.getElementById('upload-result-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('result-file');
        if (!fileInput.files[0]) {
            showNotification('Please select a file', 'error');
            return;
        }
        const formData = new FormData();
        formData.append('resultFile', fileInput.files[0]);
        formData.append('notes', document.getElementById('result-notes').value);

        try {
            await apiCall(`/admin/estimations/${estimationId}/result`, 'POST', formData, true);
            showNotification('Estimation result uploaded successfully', 'success');
            closeModal();
            renderAdminEstimations();
        } catch (error) { /* Handled by apiCall */ }
    });
}

async function downloadAllEstimationFiles(estimationId) {
    try {
        showNotification('Preparing file download...', 'info');
        const { files } = await apiCall(`/admin/estimations/${estimationId}/files`);
        if (!files || files.length === 0) {
            showNotification('No files found for this estimation', 'warning');
            return;
        }

        let downloadedCount = 0, failedCount = 0;
        const token = getToken();

        for (const file of files) {
            try {
                const downloadUrl = `/api/admin/estimations/files/download/${file._id}`;
                if (token) {
                    window.open(`${API_BASE_URL}${downloadUrl}?token=${token}`, '_blank');
                } else {
                    const link = document.createElement('a');
                    link.href = `${API_BASE_URL}${downloadUrl}`;
                    link.download = file.name || 'estimation_file';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
                downloadedCount++;
                await new Promise(resolve => setTimeout(resolve, 800)); // Delay to prevent pop-up blockers
            } catch (fileError) {
                console.error(`Failed to download file ${file.name}:`, fileError);
                failedCount++;
            }
        }
        showNotification(`Downloaded ${downloadedCount} files successfully${failedCount > 0 ? ` (${failedCount} failed)` : ''}`, 'success');
    } catch (error) {
        showNotification(`Failed to download files: ${error.message}`, 'error');
    }
}

async function downloadEstimationResult(estimationId) {
    try {
        showNotification('Downloading estimation result...', 'info');
        const token = getToken();
        const downloadUrl = `/api/admin/estimations/${estimationId}/result/download`;
        if (token) {
            window.open(`${API_BASE_URL}${downloadUrl}?token=${token}`, '_blank');
        } else {
            const link = document.createElement('a');
            link.href = `${API_BASE_URL}${downloadUrl}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        showNotification('Estimation result download started', 'success');
    } catch (error) {
        showNotification(`Failed to download result: ${error.message}`, 'error');
    }
}

async function deleteEstimation(estimationId) {
    if (confirm('Are you sure you want to delete this estimation? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/estimations/${estimationId}`, 'DELETE');
            showNotification('Estimation deleted successfully', 'success');
            renderAdminEstimations();
        } catch (error) { /* Handled by apiCall */ }
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
                            <div class="stat-item"><span class="stat-value">${formatCurrency(data.revenue?.total || 0)}</span><span class="stat-label">Total Revenue</span></div>
                            <div class="stat-item"><span class="stat-value">${formatCurrency(data.revenue?.monthly || 0)}</span><span class="stat-label">Monthly Average</span></div>
                            <div class="stat-item"><span class="stat-value">${data.revenue?.growth || 0}%</span><span class="stat-label">Growth Rate</span></div>
                        </div>
                    </div>

                    <div class="analytics-card">
                        <h3>User Activity</h3>
                        <div class="activity-stats">
                            <div class="stat-item"><span class="stat-value">${data.users?.active || 0}</span><span class="stat-label">Active Users</span></div>
                            <div class="stat-item"><span class="stat-value">${data.users?.new || 0}</span><span class="stat-label">New Registrations</span></div>
                            <div class="stat-item"><span class="stat-value">${data.users?.retention || 0}%</span><span class="stat-label">Retention Rate</span></div>
                        </div>
                    </div>

                    <div class="analytics-card">
                        <h3>Project Statistics</h3>
                        <div class="project-stats">
                            <div class="stat-item"><span class="stat-value">${data.projects?.total || 0}</span><span class="stat-label">Total Projects</span></div>
                            <div class="stat-item"><span class="stat-value">${data.projects?.completed || 0}</span><span class="stat-label">Completed</span></div>
                            <div class="stat-item"><span class="stat-value">${data.projects?.active || 0}</span><span class="stat-label">Active</span></div>
                        </div>
                    </div>

                    <div class="analytics-card full-width">
                        <h3>Performance Trends</h3>
                        <div class="chart-container"><canvas id="performance-chart"></canvas></div>
                    </div>
                </div>
            </div>
        `;

        if (typeof Chart !== 'undefined') {
            initializePerformanceChart(data.trends);
        }

    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load analytics</h3>
                <button class="btn btn-primary" onclick="renderAdminAnalytics()"><i class="fas fa-redo"></i> Retry</button>
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
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

async function updateAnalyticsPeriod(period) {
    try {
        await apiCall(`/admin/analytics?period=${period}`);
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
                            <div class="metric"><span class="metric-label">CPU Usage</span><div class="metric-bar"><div class="metric-fill" style="width: ${data.server?.cpu || 0}%"></div></div><span class="metric-value">${data.server?.cpu || 0}%</span></div>
                            <div class="metric"><span class="metric-label">Memory Usage</span><div class="metric-bar"><div class="metric-fill" style="width: ${data.server?.memory || 0}%"></div></div><span class="metric-value">${data.server?.memory || 0}%</span></div>
                            <div class="metric"><span class="metric-label">Disk Usage</span><div class="metric-bar"><div class="metric-fill" style="width: ${data.server?.disk || 0}%"></div></div><span class="metric-value">${data.server?.disk || 0}%</span></div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <h3>Database Statistics</h3>
                        <div class="db-stats">
                            <div class="db-metric"><span class="db-label">Total Records</span><span class="db-value">${(data.database?.totalRecords || 0).toLocaleString()}</span></div>
                            <div class="db-metric"><span class="db-label">Database Size</span><span class="db-value">${formatFileSize(data.database?.size || 0)}</span></div>
                            <div class="db-metric"><span class="db-label">Active Connections</span><span class="db-value">${data.database?.connections || 0}</span></div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <h3>API Usage</h3>
                        <div class="api-stats">
                            <div class="api-metric"><span class="api-label">Requests Today</span><span class="api-value">${(data.api?.requestsToday || 0).toLocaleString()}</span></div>
                            <div class="api-metric"><span class="api-label">Average Response Time</span><span class="api-value">${data.api?.avgResponseTime || 0}ms</span></div>
                            <div class="api-metric"><span class="api-label">Error Rate</span><span class="api-value">${data.api?.errorRate || 0}%</span></div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <h3>System Health</h3>
                        <div class="health-indicators">
                            <div class="health-item ${data.health?.server ? 'healthy' : 'unhealthy'}"><i class="fas fa-${data.health?.server ? 'check-circle' : 'exclamation-circle'}"></i><span>Server Status</span></div>
                            <div class="health-item ${data.health?.database ? 'healthy' : 'unhealthy'}"><i class="fas fa-${data.health?.database ? 'check-circle' : 'exclamation-circle'}"></i><span>Database</span></div>
                            <div class="health-item ${data.health?.storage ? 'healthy' : 'unhealthy'}"><i class="fas fa-${data.health?.storage ? 'check-circle' : 'exclamation-circle'}"></i><span>File Storage</span></div>
                            <div class="health-item ${data.health?.email ? 'healthy' : 'unhealthy'}"><i class="fas fa-${data.health?.email ? 'check-circle' : 'exclamation-circle'}"></i><span>Email Service</span></div>
                        </div>
                    </div>
                </div>
                <div class="system-actions">
                    <h3>System Actions</h3>
                    <div class="action-buttons">
                        <button class="btn btn-warning" onclick="clearCache()"><i class="fas fa-trash-alt"></i> Clear Cache</button>
                        <button class="btn btn-info" onclick="generateBackup()"><i class="fas fa-download"></i> Generate Backup</button>
                        <button class="btn btn-success" onclick="runHealthCheck()"><i class="fas fa-stethoscope"></i> Run Health Check</button>
                        <button class="btn btn-secondary" onclick="viewSystemLogs()"><i class="fas fa-file-alt"></i> View Logs</button>
                    </div>
                </div>
            </div>
        `;

    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load system statistics</h3>
                <button class="btn btn-primary" onclick="renderSystemStats()"><i class="fas fa-redo"></i> Retry</button>
            </div>
        `;
    }
}

async function clearCache() {
    if (confirm('Are you sure you want to clear the system cache?')) {
        try {
            await apiCall('/admin/system/clear-cache', 'POST');
            showNotification('Cache cleared successfully', 'success');
        } catch (error) { /* Handled by apiCall */ }
    }
}

async function generateBackup() {
    try {
        showNotification('Backup generation started...', 'info');
        const data = await apiCall('/admin/system/backup', 'POST');
        showNotification('Backup generated successfully', 'success');
        downloadFile(data.backupUrl, `backup-${new Date().toISOString().split('T')[0]}.zip`);
    } catch (error) { /* Handled by apiCall */ }
}

async function runHealthCheck() {
    try {
        showNotification('Running health check...', 'info');
        await apiCall('/admin/system/health-check', 'POST');
        showNotification('Health check completed', 'success');
        renderSystemStats();
    } catch (error) { /* Handled by apiCall */ }
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
                            <option value="">All Levels</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option><option value="debug">Debug</option>
                        </select>
                        <button class="btn btn-sm btn-secondary" onclick="refreshLogs()"><i class="fas fa-redo"></i> Refresh</button>
                    </div>
                    <div class="logs-list" id="logs-list">
                        ${data.logs?.map(log => `<div class="log-entry ${log.level}" data-level="${log.level}"><span class="log-timestamp">${formatDate(log.timestamp)}</span><span class="log-level ${log.level}">${log.level.toUpperCase()}</span><span class="log-message">${log.message}</span></div>`).join('') || '<p>No logs available</p>'}
                    </div>
                </div>
                <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load system logs', 'error');
    }
}

function filterLogs(level) {
    document.querySelectorAll('.log-entry').forEach(log => {
        log.style.display = (!level || log.dataset.level === level) ? '' : 'none';
    });
}

async function refreshLogs() {
    try {
        const data = await apiCall('/admin/system/logs');
        document.getElementById('logs-list').innerHTML = data.logs?.map(log => `<div class="log-entry ${log.level}" data-level="${log.level}"><span class="log-timestamp">${formatDate(log.timestamp)}</span><span class="log-level ${log.level}">${log.level.toUpperCase()}</span><span class="log-message">${log.message}</span></div>`).join('') || '<p>No logs available</p>';
    } catch (error) {
        showNotification('Failed to refresh logs', 'error');
    }
}

// --- EXPORT FUNCTIONS ---
async function exportData(type) {
    try {
        const data = await apiCall(`/admin/export/${type}`);
        downloadFile(data.downloadUrl, `${type}-export-${new Date().toISOString().split('T')[0]}.csv`);
        showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} exported successfully`, 'success');
    } catch (error) { /* Handled by apiCall */ }
}

function exportUsers() { exportData('users'); }
function exportQuotes() { exportData('quotes'); }
function exportEstimations() { exportData('estimations'); }
function exportJobs() { exportData('jobs'); }
function exportMessages() { exportData('messages'); }


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('admin-login-form')) initializeLoginPage();
    if (document.getElementById('admin-panel-container')) initializeAdminPage();

    document.addEventListener('click', e => {
        if (e.target.classList.contains('modal-overlay')) closeModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
});

// --- NEW/UPDATED USER PORTAL FUNCTIONS ---

async function checkProfileAndRoute() {
    const container = document.getElementById('app-container');
    container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Loading your dashboard...</p></div>`;
    try {
        const response = await apiCall('/profile/status', 'GET');
        const { profileStatus, canAccess, rejectionReason } = response.data;
        // Update global state
        appState.currentUser.profileStatus = profileStatus;
        appState.currentUser.canAccess = canAccess;
        // Always show the full app interface
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.style.display = 'flex';
        // Set up sidebar user info
        document.getElementById('sidebarUserName').textContent = appState.currentUser.name;
        document.getElementById('sidebarUserType').textContent = appState.currentUser.type;
        document.getElementById('sidebarUserAvatar').textContent = (appState.currentUser.name || "A").charAt(0).toUpperCase();
        buildSidebarNav();
        // Show dashboard regardless of profile status
        renderAppSection('dashboard');
        // Load user data based on type
        if (appState.currentUser.type === 'designer') loadUserQuotes();
        if (appState.currentUser.type === 'contractor') loadUserEstimations();
        // Initialize notifications and activity timer
        initializeEnhancedNotifications();
        resetInactivityTimer();
        // Show profile status notification if needed
        if (profileStatus === 'incomplete') {
            showNotification('Complete your profile in Settings to unlock all features.', 'info', 8000);
        } else if (profileStatus === 'pending') {
            showNotification('Your profile is under review. You\'ll get full access once approved.', 'info', 8000);
        } else if (profileStatus === 'rejected') {
            showNotification('Please update your profile in Settings - some changes are needed.', 'warning', 10000);
        }
        console.log('User portal loaded successfully');
    } catch (error) {
        showNotification('Could not verify your profile status. Please try again.', 'error');
        container.innerHTML = `<div class="error-state"><h2>Error</h2><p>Could not load your dashboard. Please try logging in again.</p><button class="btn btn-primary" onclick="logout()">Logout</button></div>`;
    }
}

function renderAppSection(sectionId) {
    const container = document.getElementById('app-container');
    document.querySelectorAll('.sidebar-nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.section === sectionId);
    });
    const userRole = appState.currentUser.type;
    const profileStatus = appState.currentUser.profileStatus;
    const isApproved = profileStatus === 'approved';
    // Check if feature requires approval
    const restrictedSections = ['post-job', 'jobs', 'my-quotes', 'approved-jobs', 'estimation-tool', 'my-estimations', 'messages'];
    const isRestricted = restrictedSections.includes(sectionId);
    if (isRestricted && !isApproved) {
        container.innerHTML = getRestrictedAccessTemplate(sectionId, profileStatus);
        return;
    }
    // Handle settings section (always accessible)
    if (sectionId === 'settings') {
        container.innerHTML = getSettingsTemplate(appState.currentUser);
        return;
    }
    // Regular section rendering for approved users or dashboard
    if (sectionId === 'dashboard') {
        container.innerHTML = getDashboardTemplate(appState.currentUser);
        renderRecentActivityWidgets();
    } else if (sectionId === 'jobs') {
        const title = userRole === 'designer' ? 'Available Projects' : 'My Posted Projects';
        const subtitle = userRole === 'designer' ? 'Browse and submit quotes for engineering projects' : 'Manage your project listings and review quotes';
        container.innerHTML = `
            ${userRole === 'contractor' ? '<div id="dynamic-feature-header" class="dynamic-feature-header"></div>' : ''}
            <div class="section-header modern-header">
                <div class="header-content"><h2><i class="fas ${userRole === 'designer' ? 'fa-search' : 'fa-tasks'}"></i> ${title}</h2><p class="header-subtitle">${subtitle}</p></div>
            </div>
            <div id="jobs-list" class="jobs-grid"></div>
            <div id="load-more-container" class="load-more-section"></div>`;
        if (userRole === 'contractor') updateDynamicHeader();
        fetchAndRenderJobs();
    } else if (sectionId === 'post-job') {
        container.innerHTML = getPostJobTemplate();
        document.getElementById('post-job-form').addEventListener('submit', handlePostJob);
    } else if (sectionId === 'my-quotes') {
        fetchAndRenderMyQuotes();
    } else if (sectionId === 'approved-jobs') {
        fetchAndRenderApprovedJobs();
    } else if (sectionId === 'messages') {
        fetchAndRenderConversations();
    } else if (sectionId === 'estimation-tool') {
        container.innerHTML = getEstimationToolTemplate();
        setupEstimationToolEventListeners();
    } else if (sectionId === 'my-estimations') {
        fetchAndRenderMyEstimations();
    }
}

function getRestrictedAccessTemplate(sectionId, profileStatus) {
    const sectionNames = {
        'post-job': 'Post Projects',
        'jobs': 'Browse Projects',
        'my-quotes': 'My Quotes',
        'approved-jobs': 'Approved Projects',
        'estimation-tool': 'AI Estimation',
        'my-estimations': 'My Estimations',
        'messages': 'Messages'
    };
    const sectionName = sectionNames[sectionId] || 'This Feature';
    let statusMessage = '';
    let actionButton = '';
    let statusIcon = 'fa-lock';
    let statusColor = '#f59e0b';
    if (profileStatus === 'incomplete') {
        statusMessage = 'Complete your profile to unlock this feature.';
        actionButton = `<button class="btn btn-primary" onclick="renderProfileCompletionView()">Complete Profile</button>`;
        statusIcon = 'fa-user-edit';
    } else if (profileStatus === 'pending') {
        statusMessage = 'Your profile is under review. This feature will be available once approved.';
        statusIcon = 'fa-clock';
        statusColor = '#0ea5e9';
    } else if (profileStatus === 'rejected') {
        statusMessage = 'Please update your profile to access this feature.';
        actionButton = `<button class="btn btn-primary" onclick="renderProfileCompletionView()">Update Profile</button>`;
        statusIcon = 'fa-exclamation-triangle';
        statusColor = '#ef4444';
    }
    return `
        <div class="restricted-access-container" style="max-width: 600px; margin: 4rem auto; text-align: center; background: white; padding: 3rem; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
            <div class="restricted-icon" style="font-size: 4rem; margin-bottom: 1.5rem; color: ${statusColor};">
                <i class="fas ${statusIcon}"></i>
            </div>
            <h2 style="font-size: 2rem; margin-bottom: 1rem;">${sectionName} - Access Restricted</h2>
            <p style="color: var(--text-gray); margin-bottom: 2rem; font-size: 1.1rem;">${statusMessage}</p>
            ${actionButton}
            <div style="margin-top: 2rem; padding: 1rem; background: #f8fafc; border-radius: 8px;">
                <p style="font-size: 0.9rem; color: var(--text-gray); margin: 0;">
                    <i class="fas fa-info-circle"></i> All features will be unlocked once your profile is approved by our admin team.
                </p>
            </div>
        </div>
    `;
}

function getSettingsTemplate(user) {
    const profileStatus = user.profileStatus || 'incomplete';
    const canAccess = user.canAccess !== false;
    let profileSection = '';
    if (profileStatus === 'incomplete') {
        profileSection = `
            <div class="settings-card" style="border-left: 4px solid #f59e0b;">
                <h3><i class="fas fa-user-edit"></i> Complete Your Profile</h3>
                <div style="background: #fef3c7; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <p style="margin: 0; color: #92400e;"><strong>Action Required:</strong> Your profile is incomplete. Complete it to unlock all platform features.</p>
                </div>
                <button class="btn btn-primary" onclick="renderProfileCompletionView()">
                    <i class="fas fa-edit"></i> Complete Profile Now
                </button>
            </div>`;
    } else if (profileStatus === 'pending') {
        profileSection = `
            <div class="settings-card" style="border-left: 4px solid #0ea5e9;">
                <h3><i class="fas fa-clock"></i> Profile Under Review</h3>
                <div style="background: #e0f2fe; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <p style="margin: 0; color: #075985;"><strong>Status:</strong> Your profile has been submitted and is currently under review by our admin team.</p>
                </div>
                <p>Review typically takes 24-48 hours. You'll receive an email once approved.</p>
            </div>`;
    } else if (profileStatus === 'rejected') {
        profileSection = `
            <div class="settings-card" style="border-left: 4px solid #ef4444;">
                <h3><i class="fas fa-exclamation-triangle"></i> Profile Needs Update</h3>
                <div style="background: #fee2e2; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <p style="margin: 0; color: #991b1b;"><strong>Action Required:</strong> Your profile needs some updates before it can be approved.</p>
                    ${user.rejectionReason ? `<p style="margin: 0.5rem 0 0 0; color: #991b1b;"><strong>Reason:</strong> ${user.rejectionReason}</p>` : ''}
                </div>
                <button class="btn btn-primary" onclick="renderProfileCompletionView()">
                    <i class="fas fa-edit"></i> Update Profile
                </button>
            </div>`;
    } else if (profileStatus === 'approved') {
        profileSection = `
            <div class="settings-card" style="border-left: 4px solid #10b981;">
                <h3><i class="fas fa-check-circle"></i> Profile Approved</h3>
                <div style="background: #d1fae5; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <p style="margin: 0; color: #065f46;"><strong>Status:</strong> Your profile is approved and you have full access to all platform features.</p>
                </div>
                <button class="btn btn-outline" onclick="renderProfileCompletionView()">
                    <i class="fas fa-edit"></i> Update Profile Information
                </button>
            </div>`;
    }
    return `
        <div class="section-header modern-header">
            <div class="header-content">
                <h2><i class="fas fa-cog"></i> Settings</h2>
                <p class="header-subtitle">Manage your account, profile, and subscription details</p>
            </div>
        </div>
        <div class="settings-container">
            ${profileSection}
            <div class="settings-card">
                <h3><i class="fas fa-user-edit"></i> Personal Information</h3>
                <form class="premium-form" onsubmit="event.preventDefault(); showNotification('Profile updated successfully!', 'success');">
                    <div class="form-group">
                        <label class="form-label">Full Name</label>
                        <input type="text" class="form-input" value="${user.name}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email Address</label>
                        <input type="email" class="form-input" value="${user.email}" disabled>
                        <small class="form-help">Email cannot be changed.</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Account Type</label>
                        <input type="text" class="form-input" value="${user.type.charAt(0).toUpperCase() + user.type.slice(1)}" disabled>
                        <small class="form-help">Account type cannot be changed.</small>
                    </div>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </form>
            </div>
            <div class="settings-card">
                <h3><i class="fas fa-shield-alt"></i> Security</h3>
                <form class="premium-form" onsubmit="event.preventDefault(); showNotification('Password functionality not implemented.', 'info');">
                    <div class="form-group">
                        <label class="form-label">Current Password</label>
                        <input type="password" class="form-input">
                    </div>
                    <div class="form-group">
                        <label class="form-label">New Password</label>
                        <input type="password" class="form-input">
                    </div>
                    <button type="submit" class="btn btn-primary">Change Password</button>
                </form>
            </div>
            <div class="settings-card subscription-card">
                <h3><i class="fas fa-gem"></i> Subscription & Billing</h3>
                <p>You are currently on the <strong>Pro Plan</strong>. This gives you access to unlimited projects and AI estimations.</p>
                <div class="subscription-plans">
                    <div class="plan-card">
                        <h4>Basic</h4>
                        <p class="price">Free</p>
                        <ul>
                            <li><i class="fas fa-check"></i> 3 Projects / month</li>
                            <li><i class="fas fa-times"></i> AI Estimations</li>
                            <li><i class="fas fa-check"></i> Standard Support</li>
                        </ul>
                        <button class="btn btn-outline" disabled>Current Plan</button>
                    </div>
                    <div class="plan-card active">
                        <h4>Pro</h4>
                        <p class="price">$49<span>/mo</span></p>
                        <ul>
                            <li><i class="fas fa-check"></i> Unlimited Projects</li>
                            <li><i class="fas fa-check"></i> AI Estimations</li>
                            <li><i class="fas fa-check"></i> Priority Support</li>
                        </ul>
                        <button class="btn btn-success" onclick="showNotification('You are on the best plan!', 'info')">Your Plan</button>
                    </div>
                    <div class="plan-card">
                        <h4>Enterprise</h4>
                        <p class="price">Contact Us</p>
                        <ul>
                            <li><i class="fas fa-check"></i> Team Accounts</li>
                            <li><i class="fas fa-check"></i> Advanced Analytics</li>
                            <li><i class="fas fa-check"></i> Dedicated Support</li>
                        </ul>
                        <button class="btn btn-primary" onclick="showNotification('Contacting sales...', 'info')">Get a Quote</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getDashboardTemplate(user) {
    const isContractor = user.type === 'contractor';
    const name = user.name.split(' ')[0];
    const profileStatus = user.profileStatus || 'incomplete';
    const isApproved = profileStatus === 'approved';
    // Profile status card based on current status
    let profileStatusCard = '';
    if (profileStatus === 'incomplete') {
        profileStatusCard = `
            <div class="dashboard-profile-status-card">
                <h3><i class="fas fa-exclamation-triangle"></i> Complete Your Profile</h3>
                <p>Your profile is incomplete. Complete it now to unlock all platform features and get access to ${isContractor ? 'posting projects and AI estimation tools' : 'browsing projects and submitting quotes'}.</p>
                <button class="btn btn-primary" onclick="renderProfileCompletionView()">
                    <i class="fas fa-user-edit"></i> Complete Profile Now
                </button>
            </div>`;
    } else if (profileStatus === 'pending') {
        profileStatusCard = `
            <div class="dashboard-profile-status-card" style="background: linear-gradient(135deg, #dbeafe 0%, #e0f2fe 100%); border-color: #3b82f6;">
                <h3 style="color: #1e40af;"><i class="fas fa-clock"></i> Profile Under Review</h3>
                <p style="color: #1e40af;">Your profile has been submitted and is currently under review by our admin team. You'll receive an email notification once approved. Review typically takes 24-48 hours.</p>
                <div style="background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                    <p style="margin: 0; color: #1e40af; font-size: 0.9rem;"><i class="fas fa-info-circle"></i> You have limited access until approval. All features will be unlocked once approved.</p>
                </div>
            </div>`;
    } else if (profileStatus === 'rejected') {
        profileStatusCard = `
            <div class="dashboard-profile-status-card" style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-color: #ef4444;">
                <h3 style="color: #dc2626;"><i class="fas fa-times-circle"></i> Profile Needs Update</h3>
                <p style="color: #dc2626;">Your profile needs some updates before it can be approved. Please review the feedback and update your profile.</p>
                ${user.rejectionReason ? `<div style="background: rgba(239, 68, 68, 0.1); padding: 1rem; border-radius: 8px; margin: 1rem 0;"><p style="margin: 0; color: #dc2626; font-size: 0.9rem;"><strong>Reason:</strong> ${user.rejectionReason}</p></div>` : ''}
                <button class="btn btn-primary" onclick="renderProfileCompletionView()">
                    <i class="fas fa-edit"></i> Update Profile Now
                </button>
            </div>`;
    } else if (profileStatus === 'approved') {
        profileStatusCard = `
            <div class="dashboard-profile-status-card" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-color: #10b981;">
                <h3 style="color: #059669;"><i class="fas fa-check-circle"></i> Profile Approved</h3>
                <p style="color: #059669;">Your profile is approved and you have full access to all platform features. Start exploring and connecting with professionals!</p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    ${isContractor ? `
                        <button class="btn btn-outline" onclick="renderAppSection('post-job')" style="border-color: #059669; color: #059669;">
                            <i class="fas fa-plus"></i> Post First Project
                        </button>
                        <button class="btn btn-outline" onclick="renderAppSection('estimation-tool')" style="border-color: #059669; color: #059669;">
                            <i class="fas fa-calculator"></i> Try AI Estimation
                        </button>
                    ` : `
                        <button class="btn btn-outline" onclick="renderAppSection('jobs')" style="border-color: #059669; color: #059669;">
                            <i class="fas fa-search"></i> Browse Projects
                        </button>
                        <button class="btn btn-outline" onclick="renderAppSection('my-quotes')" style="border-color: #059669; color: #059669;">
                            <i class="fas fa-file-invoice-dollar"></i> View My Quotes
                        </button>
                    `}
                </div>
            </div>`;
    }
    const contractorQuickActions = `
        <div class="quick-action-card ${!isApproved ? 'restricted-card' : ''}" onclick="${isApproved ? 'renderAppSection(\'post-job\')' : 'showRestrictedFeature(\'post-job\')'}">
            <i class="fas fa-plus-circle card-icon"></i>
            <h3>Create New Project</h3>
            <p>Post a new listing for designers to quote on.</p>
            ${!isApproved ? '<div class="restriction-overlay"><i class="fas fa-lock"></i></div>' : ''}
        </div>
        <div class="quick-action-card ${!isApproved ? 'restricted-card' : ''}" onclick="${isApproved ? 'renderAppSection(\'jobs\')' : 'showRestrictedFeature(\'jobs\')'}">
            <i class="fas fa-tasks card-icon"></i>
            <h3>My Projects</h3>
            <p>View and manage all your active projects.</p>
            ${!isApproved ? '<div class="restriction-overlay"><i class="fas fa-lock"></i></div>' : ''}
        </div>
        <div class="quick-action-card ${!isApproved ? 'restricted-card' : ''}" onclick="${isApproved ? 'renderAppSection(\'estimation-tool\')' : 'showRestrictedFeature(\'estimation-tool\')'}">
            <i class="fas fa-calculator card-icon"></i>
            <h3>AI Estimation</h3>
            <p>Get instant cost estimates for your drawings.</p>
            ${!isApproved ? '<div class="restriction-overlay"><i class="fas fa-lock"></i></div>' : ''}
        </div>
        <div class="quick-action-card ${!isApproved ? 'restricted-card' : ''}" onclick="${isApproved ? 'renderAppSection(\'approved-jobs\')' : 'showRestrictedFeature(\'approved-jobs\')'}">
            <i class="fas fa-check-circle card-icon"></i>
            <h3>Approved Projects</h3>
            <p>Track progress and communicate on assigned work.</p>
            ${!isApproved ? '<div class="restriction-overlay"><i class="fas fa-lock"></i></div>' : ''}
        </div>`;
    const contractorWidgets = `
        <div class="widget-card">
            <h3><i class="fas fa-history"></i> Recent Projects</h3>
            <div id="recent-projects-widget" class="widget-content">
                ${!isApproved ? '<p class="widget-empty-text">Complete your profile to start posting projects.</p>' : ''}
            </div>
        </div>`;
    const designerQuickActions = `
        <div class="quick-action-card ${!isApproved ? 'restricted-card' : ''}" onclick="${isApproved ? 'renderAppSection(\'jobs\')' : 'showRestrictedFeature(\'jobs\')'}">
            <i class="fas fa-search card-icon"></i>
            <h3>Browse Projects</h3>
            <p>Find new opportunities and submit quotes.</p>
            ${!isApproved ? '<div class="restriction-overlay"><i class="fas fa-lock"></i></div>' : ''}
        </div>
        <div class="quick-action-card ${!isApproved ? 'restricted-card' : ''}" onclick="${isApproved ? 'renderAppSection(\'my-quotes\')' : 'showRestrictedFeature(\'my-quotes\')'}">
            <i class="fas fa-file-invoice-dollar card-icon"></i>
            <h3>My Quotes</h3>
            <p>Track the status of your submitted quotes.</p>
            ${!isApproved ? '<div class="restriction-overlay"><i class="fas fa-lock"></i></div>' : ''}
        </div>
        <div class="quick-action-card" onclick="showNotification('Feature coming soon!', 'info')">
            <i class="fas fa-upload card-icon"></i>
            <h3>Submit Work</h3>
            <p>Upload deliverables for your assigned projects.</p>
        </div>
        <div class="quick-action-card ${!isApproved ? 'restricted-card' : ''}" onclick="${isApproved ? 'renderAppSection(\'messages\')' : 'showRestrictedFeature(\'messages\')'}">
            <i class="fas fa-comments card-icon"></i>
            <h3>Messages</h3>
            <p>Communicate with clients about projects.</p>
            ${!isApproved ? '<div class="restriction-overlay"><i class="fas fa-lock"></i></div>' : ''}
        </div>`;
    const designerWidgets = `
        <div class="widget-card">
            <h3><i class="fas fa-history"></i> Recent Quotes</h3>
            <div id="recent-quotes-widget" class="widget-content">
                ${!isApproved ? '<p class="widget-empty-text">Complete your profile to start submitting quotes.</p>' : ''}
            </div>
        </div>`;
    // Calculate profile completion percentage
    let completionPercentage = 0;
    if (profileStatus === 'incomplete') completionPercentage = 25;
    else if (profileStatus === 'pending') completionPercentage = 75;
    else if (profileStatus === 'rejected') completionPercentage = 50;
    else if (profileStatus === 'approved') completionPercentage = 100;
    return `
        <div class="dashboard-container">
            <div class="dashboard-hero">
                <div>
                    <h2>Welcome back, ${name} 👋</h2>
                    <p>You are logged in to your <strong>${isContractor ? 'Contractor' : 'Designer'} Portal</strong>. ${isApproved ? 'All features are available.' : 'Complete your profile to unlock all features.'}</p>
                </div>
                <div class="subscription-badge">
                    <i class="fas fa-star"></i> Pro Plan
                </div>
            </div>
            ${profileStatusCard}
            <h3 class="dashboard-section-title">Quick Actions</h3>
            <div class="dashboard-grid">
                ${isContractor ? contractorQuickActions : designerQuickActions}
            </div>
            <div class="dashboard-columns">
                ${isContractor ? contractorWidgets : designerWidgets}
                <div class="widget-card">
                    <h3><i class="fas fa-user-circle"></i> Your Profile</h3>
                    <div class="widget-content">
                        <p>Profile Status: <strong style="color: ${profileStatus === 'approved' ? '#10b981' : profileStatus === 'pending' ? '#3b82f6' : '#f59e0b'}">${profileStatus.charAt(0).toUpperCase() + profileStatus.slice(1)}</strong></p>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${completionPercentage}%;"></div>
                        </div>
                        <p class="progress-label">${completionPercentage}% Complete</p>
                        ${profileStatus !== 'approved' ? `
                            <button class="btn btn-primary" onclick="${profileStatus === 'incomplete' || profileStatus === 'rejected' ? 'renderProfileCompletionView()' : 'renderAppSection(\'settings\')'}">
                                <i class="fas fa-edit"></i> ${profileStatus === 'incomplete' || profileStatus === 'rejected' ? 'Complete Profile' : 'View Profile Status'}
                            </button>
                        ` : `
                            <button class="btn btn-outline" onclick="renderAppSection('settings')">
                                <i class="fas fa-edit"></i> Update Profile
                            </button>
                        `}
                        <hr class="widget-divider">
                        <p>Upgrade your plan for advanced features.</p>
                        <button class="btn btn-primary" onclick="renderAppSection('settings')">
                           <i class="fas fa-arrow-up"></i> Upgrade Subscription
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
}

function showRestrictedFeature(featureName) {
    const profileStatus = appState.currentUser.profileStatus;
    let message = '';
    if (profileStatus === 'incomplete') {
        message = 'Complete your profile to access this feature.';
    } else if (profileStatus === 'pending') {
        message = 'This feature will be available once your profile is approved.';
    } else if (profileStatus === 'rejected') {
        message = 'Please update your profile to access this feature.';
    }
    showNotification(message, 'warning', 6000);
}
