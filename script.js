// script.js for the Enhanced SteelConnect Admin Panel

// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    jwtToken: null,
    currentUser: null,
};
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
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

/**
 * Hide the global loader
 */
function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

/**
 * A centralized function to handle all API requests using the Fetch API.
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
        console.log(`Making API call: ${method} ${fullUrl}`);
        const response = await fetch(fullUrl, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'An unknown server error occurred.' }));
            throw new Error(errorData.message || errorData.error || `Request failed with status ${response.status}`);
        }
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            console.log(`API call successful:`, data);
            if (successMessage) {
                showNotification(successMessage, 'success');
            }
            return data;
        } else {
             if (successMessage) {
                showNotification(successMessage, 'success');
            }
            return;
        }
    } catch (error) {
        console.error(`API Call Failed: ${method} ${fullUrl}`, error);
        showNotification(error.message, 'error');
        throw error;
    }
}

/**
 * Logs the user out by clearing credentials and redirecting.
 */
function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('currentUser');
    showNotification('You have been successfully logged out.', 'success');
    setTimeout(() => window.location.href = 'index.html', 1000);
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
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginButton = event.target.querySelector('button[type="submit"]');
    
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';

    try {
        const data = await apiCall('/auth/login/admin', 'POST', { email, password });
        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        showNotification('Login successful! Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = 'admin.html';
        }, 1000);
    } catch (error) {
        console.error('Login failed:', error);
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
    }
}

// --- ADMIN PANEL INITIALIZATION & SETUP ---
function initializeAdminPage() {
    console.log('Initializing admin page...');
    
    const token = localStorage.getItem('jwtToken');
    const userJson = localStorage.getItem('currentUser');
    
    console.log('Token exists:', !!token);
    console.log('User data exists:', !!userJson);
    
    if (token && userJson) {
        try {
            const user = JSON.parse(userJson);
            console.log('Parsed user:', user);
            
            if (user.role === 'admin' || user.type === 'admin') {
                appState.jwtToken = token;
                appState.currentUser = user;
                setupAdminPanel();
            } else {
                console.log('User is not admin:', user);
                showAdminLoginPrompt("Access Denied: You do not have admin privileges.");
            }
        } catch (error) {
            console.error('Error parsing user data:', error);
            showAdminLoginPrompt("Invalid user data found. Please log in again.");
        }
    } else {
        console.log('No valid credentials found');
        showAdminLoginPrompt();
    }
    
    hideGlobalLoader();
}

function showAdminLoginPrompt(message = null) {
    console.log('Showing admin login prompt:', message);
    hideGlobalLoader();
    document.getElementById('admin-login-prompt').style.display = 'flex';
    document.getElementById('admin-panel-container').style.display = 'none';
    if (message) {
        const messageElement = document.querySelector('.login-prompt-box p');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }
}

function setupAdminPanel() {
    console.log('Setting up admin panel...');
    hideGlobalLoader();
    
    document.getElementById('admin-login-prompt').style.display = 'none';
    document.getElementById('admin-panel-container').style.display = 'flex';
    
    document.getElementById('admin-user-info').innerHTML = `
        <strong>${appState.currentUser.name}</strong>
        <small>${appState.currentUser.role || appState.currentUser.type}</small>
    `;
    
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
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
    
    document.querySelector('.admin-nav-link[data-section="dashboard"]').classList.add('active');
    renderAdminSection('dashboard');
}

// --- DYNAMIC CONTENT RENDERING ---
function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    
    console.log('Rendering section:', section);
    
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
            renderAdminSubscriptions();
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
        console.log('Fetching dashboard stats...');
        const response = await apiCall('/admin/dashboard');
        console.log('Dashboard response:', response);
        
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
                    <i class="fas fa-file-invoice-dollar"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalQuotes}</span>
                        <span class="stat-label">Total Quotes</span>
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
                    <i class="fas fa-briefcase"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalJobs}</span>
                        <span class="stat-label">Total Jobs</span>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <i class="fas fa-crown"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.activeSubscriptions || 0}</span>
                        <span class="stat-label">Active Subscriptions</span>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <i class="fas fa-dollar-sign"></i>
                    <div class="stat-info">
                        <span class="stat-value">$${stats.totalRevenue || 0}</span>
                        <span class="stat-label">Total Revenue</span>
                    </div>
                </div>
            </div>
            <div class="admin-quick-actions">
                <h3>Quick Actions</h3>
                <div class="quick-action-buttons">
                    <button class="btn btn-primary" onclick="renderAdminSection('users')">
                        <i class="fas fa-users"></i> Manage Users
                    </button>
                    <button class="btn btn-success" onclick="renderAdminSection('subscriptions')">
                        <i class="fas fa-crown"></i> Manage Subscriptions
                    </button>
                    <button class="btn btn-info" onclick="renderAdminSection('quotes')">
                        <i class="fas fa-file-invoice-dollar"></i> Review Quotes
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Dashboard render error:', error);
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
                <div class="table-actions">
                    <button class="btn btn-primary" onclick="showAddUserModal()">
                        <i class="fas fa-plus"></i> Add User
                    </button>
                    <input type="text" placeholder="Search users..." class="search-input" onkeyup="filterTable(this.value, 'users-table')">
                </div>
                <table class="admin-table" id="users-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Subscription</th>
                            <th>Subscription Required</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => {
                            const subscriptionStatus = user.subscription ? user.subscription.status : 'inactive';
                            const subscriptionRequired = user.subscriptionRequired !== false;
                            return `
                            <tr data-user-id="${user._id || user.id}">
                                <td>${user.name}</td>
                                <td>${user.email}</td>
                                <td><span class="user-role-badge">${user.type || user.role}</span></td>
                                <td>
                                    <select class="status-select" onchange="handleStatusUpdate('${user._id || user.id}', this.value)">
                                        <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                    </select>
                                </td>
                                <td>
                                    <select class="status-select" onchange="handleSubscriptionUpdate('${user._id || user.id}', this.value)">
                                        <option value="active" ${subscriptionStatus === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="inactive" ${subscriptionStatus === 'inactive' ? 'selected' : ''}>Inactive</option>
                                    </select>
                                </td>
                                <td>
                                    <select class="status-select" onchange="handleSubscriptionRequiredUpdate('${user._id || user.id}', this.value === 'true')">
                                        <option value="true" ${subscriptionRequired ? 'selected' : ''}>Required</option>
                                        <option value="false" ${!subscriptionRequired ? 'selected' : ''}>Optional</option>
                                    </select>
                                </td>
                                <td>
                                    <button class="btn btn-info btn-sm" onclick="showUserDetails('${user._id || user.id}')">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="btn btn-warning btn-sm" onclick="showEditUserModal('${user._id || user.id}')">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="handleUserDelete('${user._id || user.id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load user data. Please try again later.</div>';
    }
}

async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/quotes');
        const quotes = response.quotes;
        if (!quotes || quotes.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No quotes found in the system.</div>';
            return;
        }
        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions">
                    <input type="text" placeholder="Search quotes..." class="search-input" onkeyup="filterTable(this.value, 'quotes-table')">
                    <select onchange="filterQuotesByStatus(this.value)" class="filter-select">
                        <option value="">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="completed">Completed</option>
                    </select>
                </div>
                <table class="admin-table" id="quotes-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Details</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Attachments</th>
                            <th>Subscription Required</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${quotes.map(quote => `
                            <tr data-quote-id="${quote._id || quote.id}">
                                <td>${quote.userId ? quote.userId.name : 'N/A'}</td>
                                <td class="quote-details">${quote.details ? quote.details.substring(0, 100) : 'N/A'}${quote.details && quote.details.length > 100 ? '...' : ''}</td>
                                <td>
                                    <input type="number" class="amount-input" value="${quote.amount || 0}" 
                                           onchange="updateQuoteAmount('${quote._id || quote.id}', this.value)" placeholder="Enter amount">
                                </td>
                                <td>
                                    <select class="status-select" onchange="updateQuoteStatus('${quote._id || quote.id}', this.value)">
                                        <option value="pending" ${quote.status === 'pending' ? 'selected' : ''}>Pending</option>
                                        <option value="approved" ${quote.status === 'approved' ? 'selected' : ''}>Approved</option>
                                        <option value="rejected" ${quote.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                                        <option value="completed" ${quote.status === 'completed' ? 'selected' : ''}>Completed</option>
                                    </select>
                                </td>
                                <td>
                                    ${quote.attachments && quote.attachments.length > 0 
                                        ? `<button class="btn btn-info btn-sm" onclick="viewAttachments('${quote._id || quote.id}')">
                                             <i class="fas fa-paperclip"></i> ${quote.attachments.length} files
                                           </button>`
                                        : '<span class="text-muted">No attachments</span>'
                                    }
                                </td>
                                <td>
                                    <select class="status-select" onchange="updateQuoteSubscriptionRequired('${quote._id || quote.id}', this.value === 'true')">
                                        <option value="false" ${!quote.subscriptionRequired ? 'selected' : ''}>No</option>
                                        <option value="true" ${quote.subscriptionRequired ? 'selected' : ''}>Yes</option>
                                    </select>
                                </td>
                                <td>${quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A'}</td>
                                <td>
                                    <button class="btn btn-info btn-sm" onclick="viewQuoteDetails('${quote._id || quote.id}')">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteQuote('${quote._id || quote.id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load quotes data.</div>';
    }
}

async function renderAdminJobs() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/jobs');
        const jobs = response.jobs;
        if (!jobs || jobs.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No jobs found in the system.</div>';
            return;
        }
        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions">
                    <button class="btn btn-primary" onclick="showAddJobModal()">
                        <i class="fas fa-plus"></i> Add Job
                    </button>
                    <input type="text" placeholder="Search jobs..." class="search-input" onkeyup="filterTable(this.value, 'jobs-table')">
                </div>
                <table class="admin-table" id="jobs-table">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Company</th>
                            <th>Location</th>
                            <th>Salary</th>
                            <th>Status</th>
                            <th>Subscription Required</th>
                            <th>Attachments</th>
                            <th>Posted</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${jobs.map(job => `
                            <tr data-job-id="${job._id || job.id}">
                                <td>${job.title || 'N/A'}</td>
                                <td>${job.company || 'N/A'}</td>
                                <td>${job.location || 'N/A'}</td>
                                <td>
                                    <input type="text" class="salary-input" value="${job.salary || ''}" 
                                           onchange="updateJobSalary('${job._id || job.id}', this.value)" placeholder="Enter salary">
                                </td>
                                <td>
                                    <select class="status-select" onchange="updateJobStatus('${job._id || job.id}', this.value)">
                                        <option value="active" ${job.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="closed" ${job.status === 'closed' ? 'selected' : ''}>Closed</option>
                                        <option value="pending" ${job.status === 'pending' ? 'selected' : ''}>Pending</option>
                                    </select>
                                </td>
                                <td>
                                    <select class="status-select" onchange="updateJobSubscriptionRequired('${job._id || job.id}', this.value === 'true')">
                                        <option value="false" ${!job.subscriptionRequired ? 'selected' : ''}>No</option>
                                        <option value="true" ${job.subscriptionRequired ? 'selected' : ''}>Yes</option>
                                    </select>
                                </td>
                                <td>
                                    ${job.attachments && job.attachments.length > 0 
                                        ? `<button class="btn btn-info btn-sm" onclick="viewJobAttachments('${job._id || job.id}')">
                                             <i class="fas fa-paperclip"></i> ${job.attachments.length} files
                                           </button>`
                                        : '<span class="text-muted">No attachments</span>'
                                    }
                                </td>
                                <td>${job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'N/A'}</td>
                                <td>
                                    <button class="btn btn-info btn-sm" onclick="viewJobDetails('${job._id || job.id}')">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="btn btn-warning btn-sm" onclick="editJob('${job._id || job.id}')">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteJob('${job._id || job.id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load jobs data.</div>';
    }
}

async function renderAdminSubscriptions() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/subscriptions');
        const subscriptions = response.subscriptions || [];
        contentArea.innerHTML = `
            <div class="subscription-management">
                <div class="subscription-stats">
                    <div class="stat-card">
                        <h3>Active Subscriptions</h3>
                        <span class="stat-number">${subscriptions.filter(s => s.status === 'active').length}</span>
                    </div>
                    <div class="stat-card">
                        <h3>Total Revenue</h3>
                        <span class="stat-number">$${subscriptions.reduce((sum, s) => sum + (s.amount || 0), 0)}</span>
                    </div>
                </div>
                <div class="admin-table-container">
                    <div class="table-actions">
                        <button class="btn btn-primary" onclick="showAddSubscriptionModal()">
                            <i class="fas fa-plus"></i> Add Manual Subscription
                        </button>
                        <input type="text" placeholder="Search subscriptions..." class="search-input" onkeyup="filterTable(this.value, 'subscriptions-table')">
                    </div>
                    <table class="admin-table" id="subscriptions-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Plan</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Payment Method</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subscriptions.map(sub => `
                                <tr>
                                    <td>${sub.user ? sub.user.name : 'N/A'}</td>
                                    <td>${sub.plan || 'Professional'}</td>
                                    <td>
                                        <input type="number" class="amount-input" value="${sub.amount || 0}" 
                                               onchange="updateSubscriptionAmount('${sub._id || sub.id}', this.value)">
                                    </td>
                                    <td>
                                        <select class="status-select" onchange="updateSubscriptionStatus('${sub._id || sub.id}', this.value)">
                                            <option value="active" ${sub.status === 'active' ? 'selected' : ''}>Active</option>
                                            <option value="inactive" ${sub.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                                            <option value="cancelled" ${sub.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                        </select>
                                    </td>
                                    <td>${sub.startDate ? new Date(sub.startDate).toLocaleDateString() : 'N/A'}</td>
                                    <td>
                                        <input type="date" class="date-input" value="${sub.endDate ? new Date(sub.endDate).toISOString().split('T')[0] : ''}" 
                                               onchange="updateSubscriptionEndDate('${sub._id || sub.id}', this.value)">
                                    </td>
                                    <td>${sub.paymentMethod || 'Manual'}</td>
                                    <td>
                                        <button class="btn btn-warning btn-sm" onclick="extendSubscription('${sub._id || sub.id}')">
                                            <i class="fas fa-clock"></i> Extend
                                        </button>
                                        <button class="btn btn-danger btn-sm" onclick="cancelSubscription('${sub._id || sub.id}')">
                                            <i class="fas fa-times"></i> Cancel
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load subscription data.</div>';
    }
}

// --- EVENT HANDLERS FOR ADMIN ACTIONS ---
async function handleStatusUpdate(userId, newStatus) {
    try {
        await apiCall(`/admin/users/${userId}/status`, 'PUT', { status: newStatus }, 'User status updated successfully.');
    } catch (error) {
        renderAdminUsers();
    }
}

async function handleSubscriptionUpdate(userId, newStatus) {
    try {
        await apiCall(`/admin/users/${userId}/subscription`, 'PUT', { status: newStatus }, 'User subscription updated successfully.');
    } catch (error) {
        renderAdminUsers();
    }
}

async function handleSubscriptionRequiredUpdate(userId, required) {
    try {
        await apiCall(`/admin/users/${userId}/subscription-required`, 'PUT', { required }, 'Subscription requirement updated successfully.');
    } catch (error) {
        renderAdminUsers();
    }
}

async function updateQuoteAmount(quoteId, amount) {
    try {
        await apiCall(`/admin/quotes/${quoteId}/amount`, 'PUT', { amount: parseFloat(amount) || 0 }, 'Quote amount updated successfully.');
    } catch (error) {
        console.error('Failed to update quote amount:', error);
    }
}

async function updateQuoteStatus(quoteId, status) {
    try {
        await apiCall(`/admin/quotes/${quoteId}/status`, 'PUT', { status }, 'Quote status updated successfully.');
    } catch (error) {
        renderAdminQuotes();
    }
}

async function updateQuoteSubscriptionRequired(quoteId, required) {
    try {
        await apiCall(`/admin/quotes/${quoteId}/subscription-required`, 'PUT', { required }, 'Quote subscription requirement updated successfully.');
    } catch (error) {
        renderAdminQuotes();
    }
}

async function viewAttachments(quoteId) {
    try {
        const response = await apiCall(`/admin/quotes/${quoteId}/attachments`);
        const attachments = response.attachments || [];
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Quote Attachments</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    ${attachments.length > 0 
                        ? attachments.map(att => `
                            <div class="attachment-item">
                                <i class="fas fa-file"></i>
                                <span>${att.name}</span>
                                <a href="${att.url}" target="_blank" class="btn btn-sm btn-primary">
                                    <i class="fas fa-download"></i> Download
                                </a>
                            </div>
                        `).join('')
                        : '<p>No attachments found.</p>'
                    }
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        showNotification('Failed to load attachments', 'error');
    }
}

async function viewJobAttachments(jobId) {
    try {
        const response = await apiCall(`/admin/jobs/${jobId}/attachments`);
        const attachments = response.attachments || [];
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Job Attachments</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    ${attachments.length > 0 
                        ? attachments.map(att => `
                            <div class="attachment-item">
                                <i class="fas fa-file"></i>
                                <span>${att.name}</span>
                                <a href="${att.url}" target="_blank" class="btn btn-sm btn-primary">
                                    <i class="fas fa-download"></i> Download
                                </a>
                            </div>
                        `).join('')
                        : '<p>No attachments found.</p>'
                    }
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        showNotification('Failed to load job attachments', 'error');
    }
}

async function updateJobSalary(jobId, salary) {
    try {
        await apiCall(`/admin/jobs/${jobId}/salary`, 'PUT', { salary }, 'Job salary updated successfully.');
    } catch (error) {
        console.error('Failed to update job salary:', error);
    }
}

async function updateJobStatus(jobId, status) {
    try {
        await apiCall(`/admin/jobs/${jobId}/status`, 'PUT', { status }, 'Job status updated successfully.');
    } catch (error) {
        renderAdminJobs();
    }
}

async function updateJobSubscriptionRequired(jobId, required) {
    try {
        await apiCall(`/admin/jobs/${jobId}/subscription-required`, 'PUT', { required }, 'Job subscription requirement updated successfully.');
    } catch (error) {
        renderAdminJobs();
    }
}

async function updateSubscriptionAmount(subscriptionId, amount) {
    try {
        await apiCall(`/admin/subscriptions/${subscriptionId}/amount`, 'PUT', { amount: parseFloat(amount) || 0 }, 'Subscription amount updated successfully.');
    } catch (error) {
        console.error('Failed to update subscription amount:', error);
    }
}

async function updateSubscriptionStatus(subscriptionId, status) {
    try {
        await apiCall(`/admin/subscriptions/${subscriptionId}/status`, 'PUT', { status }, 'Subscription status updated successfully.');
    } catch (error) {
        renderAdminSubscriptions();
    }
}

async function updateSubscriptionEndDate(subscriptionId, endDate) {
    try {
        await apiCall(`/admin/subscriptions/${subscriptionId}/end-date`, 'PUT', { endDate }, 'Subscription end date updated successfully.');
    } catch (error) {
        console.error('Failed to update subscription end date:', error);
    }
}

// Modal functions for detailed views
function showAddSubscriptionModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Add Manual Subscription</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="add-subscription-form">
                    <div class="form-group">
                        <label>User Email</label>
                        <input type="email" id="sub-user-email" required>
                    </div>
                    <div class="form-group">
                        <label>Plan</label>
                        <select id="sub-plan">
                            <option value="professional">Professional</option>
                            <option value="premium">Premium</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Amount ($)</label>
                        <input type="number" id="sub-amount" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Duration (months)</label>
                        <input type="number" id="sub-duration" value="1" min="1">
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Add Subscription</button>
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('add-subscription-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            userEmail: document.getElementById('sub-user-email').value,
            plan: document.getElementById('sub-plan').value,
            amount: parseFloat(document.getElementById('sub-amount').value),
            duration: parseInt(document.getElementById('sub-duration').value)
        };
        
        try {
            await apiCall('/admin/subscriptions', 'POST', formData, 'Subscription added successfully.');
            modal.remove();
            renderAdminSubscriptions();
        } catch (error) {
            console.error('Failed to add subscription:', error);
        }
    });
}

function viewQuoteDetails(quoteId) {
    apiCall(`/admin/quotes/${quoteId}`).then(response => {
        const quote = response.quote;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>Quote Details</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>User:</label>
                            <span>${quote.userId ? quote.userId.name : 'N/A'} (${quote.userId ? quote.userId.email : 'N/A'})</span>
                        </div>
                        <div class="detail-item">
                            <label>Status:</label>
                            <span class="quote-status ${quote.status}">${quote.status}</span>
                        </div>
                        <div class="detail-item">
                            <label>Amount:</label>
                            <span>${quote.amount || 0}</span>
                        </div>
                        <div class="detail-item">
                            <label>Created:</label>
                            <span>${new Date(quote.createdAt).toLocaleString()}</span>
                        </div>
                        <div class="detail-item full-width">
                            <label>Details:</label>
                            <p>${quote.details}</p>
                        </div>
                        ${quote.attachments && quote.attachments.length > 0 ? `
                            <div class="detail-item full-width">
                                <label>Attachments:</label>
                                <div class="attachments-list">
                                    ${quote.attachments.map(att => `
                                        <div class="attachment-item">
                                            <i class="fas fa-file"></i>
                                            <span>${att.name}</span>
                                            <a href="${att.url}" target="_blank" class="btn btn-sm btn-primary">
                                                <i class="fas fa-download"></i> Download
                                            </a>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }).catch(error => {
        showNotification('Failed to load quote details', 'error');
    });
}

function viewJobDetails(jobId) {
    apiCall(`/admin/jobs/${jobId}`).then(response => {
        const job = response.job;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>Job Details</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>Title:</label>
                            <span>${job.title}</span>
                        </div>
                        <div class="detail-item">
                            <label>Company:</label>
                            <span>${job.company}</span>
                        </div>
                        <div class="detail-item">
                            <label>Location:</label>
                            <span>${job.location}</span>
                        </div>
                        <div class="detail-item">
                            <label>Salary:</label>
                            <span>${job.salary || 'Not specified'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Status:</label>
                            <span class="quote-status ${job.status}">${job.status}</span>
                        </div>
                        <div class="detail-item">
                            <label>Posted:</label>
                            <span>${new Date(job.createdAt).toLocaleString()}</span>
                        </div>
                        <div class="detail-item full-width">
                            <label>Description:</label>
                            <p>${job.description || 'No description provided'}</p>
                        </div>
                        ${job.requirements ? `
                            <div class="detail-item full-width">
                                <label>Requirements:</label>
                                <p>${job.requirements}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }).catch(error => {
        showNotification('Failed to load job details', 'error');
    });
}

// Message management
async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/messages');
        const messages = response.messages;
        if (!messages || messages.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No messages found in the system.</div>';
            return;
        }
        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions">
                    <input type="text" placeholder="Search messages..." class="search-input" onkeyup="filterTable(this.value, 'messages-table')">
                    <select onchange="filterMessagesByType(this.value)" class="filter-select">
                        <option value="">All Types</option>
                        <option value="quote">Quote Messages</option>
                        <option value="job">Job Messages</option>
                        <option value="support">Support Messages</option>
                        <option value="general">General Messages</option>
                    </select>
                </div>
                <table class="admin-table" id="messages-table">
                    <thead>
                        <tr>
                            <th>Sender</th>
                            <th>Type</th>
                            <th>Message</th>
                            <th>Amount</th>
                            <th>Subscription Required</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${messages.map(message => `
                            <tr data-message-id="${message._id || message.id}">
                                <td>${message.senderId ? message.senderId.name : 'N/A'}</td>
                                <td>
                                    <select class="status-select" onchange="updateMessageType('${message._id || message.id}', this.value)">
                                        <option value="general" ${message.type === 'general' ? 'selected' : ''}>General</option>
                                        <option value="quote" ${message.type === 'quote' ? 'selected' : ''}>Quote</option>
                                        <option value="job" ${message.type === 'job' ? 'selected' : ''}>Job</option>
                                        <option value="support" ${message.type === 'support' ? 'selected' : ''}>Support</option>
                                    </select>
                                </td>
                                <td class="message-content">${message.content ? message.content.substring(0, 100) : 'N/A'}${message.content && message.content.length > 100 ? '...' : ''}</td>
                                <td>
                                    <input type="number" class="amount-input" value="${message.amount || 0}" 
                                           onchange="updateMessageAmount('${message._id || message.id}', this.value)" placeholder="Amount">
                                </td>
                                <td>
                                    <select class="status-select" onchange="updateMessageSubscriptionRequired('${message._id || message.id}', this.value === 'true')">
                                        <option value="false" ${!message.subscriptionRequired ? 'selected' : ''}>No</option>
                                        <option value="true" ${message.subscriptionRequired ? 'selected' : ''}>Yes</option>
                                    </select>
                                </td>
                                <td>${message.createdAt ? new Date(message.createdAt).toLocaleDateString() : 'N/A'}</td>
                                <td>
                                    <button class="btn btn-info btn-sm" onclick="viewMessageDetails('${message._id || message.id}')">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteMessage('${message._id || message.id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load messages data.</div>';
    }
}

async function updateMessageType(messageId, type) {
    try {
        await apiCall(`/admin/messages/${messageId}/type`, 'PUT', { type }, 'Message type updated successfully.');
    } catch (error) {
        renderAdminMessages();
    }
}

async function updateMessageAmount(messageId, amount) {
    try {
        await apiCall(`/admin/messages/${messageId}/amount`, 'PUT', { amount: parseFloat(amount) || 0 }, 'Message amount updated successfully.');
    } catch (error) {
        console.error('Failed to update message amount:', error);
    }
}

async function updateMessageSubscriptionRequired(messageId, required) {
    try {
        await apiCall(`/admin/messages/${messageId}/subscription-required`, 'PUT', { required }, 'Message subscription requirement updated successfully.');
    } catch (error) {
        renderAdminMessages();
    }
}

function viewMessageDetails(messageId) {
    apiCall(`/admin/messages/${messageId}`).then(response => {
        const message = response.message;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>Message Details</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>Sender:</label>
                            <span>${message.senderId ? message.senderId.name : 'N/A'} (${message.senderId ? message.senderId.email : 'N/A'})</span>
                        </div>
                        <div class="detail-item">
                            <label>Type:</label>
                            <span>${message.type || 'General'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Amount:</label>
                            <span>${message.amount || 0}</span>
                        </div>
                        <div class="detail-item">
                            <label>Subscription Required:</label>
                            <span>${message.subscriptionRequired ? 'Yes' : 'No'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Date:</label>
                            <span>${new Date(message.createdAt).toLocaleString()}</span>
                        </div>
                        <div class="detail-item full-width">
                            <label>Message Content:</label>
                            <p>${message.content}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }).catch(error => {
        showNotification('Failed to load message details', 'error');
    });
}

async function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        await apiCall(`/admin/messages/${messageId}`, 'DELETE', null, 'Message deleted successfully.')
            .then(() => renderAdminMessages())
            .catch(() => {});
    }
}

function filterMessagesByType(type) {
    const table = document.getElementById('messages-table');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        if (!type) {
            row.style.display = '';
        } else {
            const typeCell = row.querySelector('select.status-select').value;
            row.style.display = typeCell === type ? '' : 'none';
        }
    });
}

// System stats
async function renderAdminSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/system-stats');
        const stats = response.stats;
        
        contentArea.innerHTML = `
            <div class="system-stats">
                <h3>System Statistics</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <h4>Server Status</h4>
                        <span class="status-indicator online">Online</span>
                    </div>
                    <div class="stat-card">
                        <h4>Database Status</h4>
                        <span class="status-indicator online">Connected</span>
                    </div>
                    <div class="stat-card">
                        <h4>Node Version</h4>
                        <span>${stats.nodeVersion}</span>
                    </div>
                    <div class="stat-card">
                        <h4>Platform</h4>
                        <span>${stats.platform}</span>
                    </div>
                    <div class="stat-card">
                        <h4>Uptime</h4>
                        <span>${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m</span>
                    </div>
                    <div class="stat-card">
                        <h4>Environment</h4>
                        <span>${stats.environment}</span>
                    </div>
                    <div class="stat-card">
                        <h4>Memory Usage (RSS)</h4>
                        <span>${Math.round(stats.memoryUsage.rss / 1024 / 1024)} MB</span>
                    </div>
                    <div class="stat-card">
                        <h4>Memory Usage (Heap)</h4>
                        <span>${Math.round(stats.memoryUsage.heapUsed / 1024 / 1024)} MB</span>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load system statistics.</div>';
    }
}

// Utility functions
function filterTable(searchTerm, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm.toLowerCase()) ? '' : 'none';
    });
}

function filterQuotesByStatus(status) {
    const table = document.getElementById('quotes-table');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        if (!status) {
            row.style.display = '';
        } else {
            const statusCell = row.querySelector('select.status-select').value;
            row.style.display = statusCell === status ? '' : 'none';
        }
    });
}

async function handleUserDelete(userId) {
    if (confirm('WARNING: Are you sure you want to permanently delete this user? This action cannot be undone.')) {
        await apiCall(`/admin/users/${userId}`, 'DELETE', null, 'User deleted successfully.')
            .then(() => renderAdminUsers())
            .catch(() => {});
    }
}

async function deleteQuote(quoteId) {
    if (confirm('Are you sure you want to delete this quote?')) {
        await apiCall(`/admin/quotes/${quoteId}`, 'DELETE', null, 'Quote deleted successfully.')
            .then(() => renderAdminQuotes())
            .catch(() => {});
    }
}

async function deleteJob(jobId) {
    if (confirm('Are you sure you want to delete this job?')) {
        await apiCall(`/admin/jobs/${jobId}`, 'DELETE', null, 'Job deleted successfully.')
            .then(() => renderAdminJobs())
            .catch(() => {});
    }
}

async function extendSubscription(subscriptionId) {
    const months = prompt('Enter number of months to extend:');
    if (months && parseInt(months) > 0) {
        try {
            await apiCall(`/admin/subscriptions/${subscriptionId}/extend`, 'PUT', { months: parseInt(months) }, 'Subscription extended successfully.');
            renderAdminSubscriptions();
        } catch (error) {
            console.error('Failed to extend subscription:', error);
        }
    }
}

async function cancelSubscription(subscriptionId) {
    if (confirm('Are you sure you want to cancel this subscription?')) {
        try {
            await apiCall(`/admin/subscriptions/${subscriptionId}/cancel`, 'PUT', null, 'Subscription cancelled successfully.');
            renderAdminSubscriptions();
        } catch (error) {
            console.error('Failed to cancel subscription:', error);
        }
    }
}

// Placeholder functions for missing functionality
function showAddUserModal() {
    showNotification('Add user functionality coming soon!', 'info');
}

function showUserDetails(userId) {
    showNotification('User details functionality coming soon!', 'info');
}

function showEditUserModal(userId) {
    showNotification('Edit user functionality coming soon!', 'info');
}

function showAddJobModal() {
    showNotification('Add job functionality coming soon!', 'info');
}

function editJob(jobId) {
    showNotification('Edit job functionality coming soon!', 'info');
}

// --- GLOBAL INITIALIZATION TRIGGER ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    if (document.body.classList.contains('admin-body')) {
        const isAdminPage = window.location.pathname.includes('admin.html');
        const isLoginPage = !!document.getElementById('admin-login-form');

        console.log('Is admin page:', isAdminPage);
        console.log('Is login page:', isLoginPage);

        if (isAdminPage) {
            initializeAdminPage();
        } else if (isLoginPage) {
            initializeLoginPage();
        } else {
            hideGlobalLoader();
        }
    } else {
        hideGlobalLoader();
    }
});
