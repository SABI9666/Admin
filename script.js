// script.js for the Enhanced SteelConnect Admin Panel
// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    jwtToken: null,
    currentUser: null,
};

const API_BASE_URL = 'https://steelconnect-backend.onrender.com/api';

// New Subscription plans configuration based on user type and activity, matching the screenshot logic
const SUBSCRIPTION_PLANS = {
    Designer: {
        'submitting-quote': { name: 'Submitting Quote', types: ['PER QUOTE', 'MONTHLY'] },
        'sending-messages': { name: 'Sending Messages', types: ['MONTHLY'] }
    },
    Contractor: {
        'submitting-tender': { name: 'Submitting Tender', types: ['PER TENDER', 'MONTHLY'] },
        'getting-estimation': { name: 'Getting Estimation', types: ['PER ESTIMATE', 'MONTHLY'] },
        'sending-messages': { name: 'Sending Messages', types: ['MONTHLY'] }
    }
};

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
        const response = await fetch(fullUrl, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'An unknown server error occurred.' }));
            throw new Error(errorData.message || errorData.error || `Request failed with status ${response.status}`);
        }
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
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
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
    }
}

// --- ADMIN PANEL INITIALIZATION & SETUP ---
function initializeAdminPage() {
    const token = localStorage.getItem('jwtToken');
    const userJson = localStorage.getItem('currentUser');
    
    if (token && userJson) {
        try {
            const user = JSON.parse(userJson);
            if (user.role === 'admin' || user.type === 'admin') {
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
    hideGlobalLoader();
    document.getElementById('admin-login-prompt').style.display = 'none';
    document.getElementById('admin-panel-container').style.display = 'flex';
    
    document.getElementById('admin-user-info').innerHTML = `
        <strong>${appState.currentUser.name}</strong>
        <small>${appState.currentUser.role || appState.currentUser.type}</small>
    `;
    
    document.getElementById('admin-logout-btn').addEventListener('click', logout);
    
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
        const response = await apiCall('/admin/dashboard');
        const stats = response.stats;
        contentArea.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card"><i class="fas fa-users"></i><div class="stat-info"><span class="stat-value">${stats.totalUsers}</span><span class="stat-label">Total Users</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-file-invoice-dollar"></i><div class="stat-info"><span class="stat-value">${stats.totalQuotes}</span><span class="stat-label">Total Quotes</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-comments"></i><div class="stat-info"><span class="stat-value">${stats.totalMessages}</span><span class="stat-label">Total Messages</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-briefcase"></i><div class="stat-info"><span class="stat-value">${stats.totalJobs}</span><span class="stat-label">Total Jobs</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-crown"></i><div class="stat-info"><span class="stat-value">${stats.activeSubscriptions || 0}</span><span class="stat-label">Active Subscriptions</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-dollar-sign"></i><div class="stat-info"><span class="stat-value">$${stats.totalRevenue || 0}</span><span class="stat-label">Total Revenue</span></div></div>
            </div>
            <div class="admin-quick-actions">
                <h3>Quick Actions</h3>
                <div class="quick-action-buttons">
                    <button class="btn btn-primary" onclick="renderAdminSection('users')"><i class="fas fa-users"></i> Manage Users</button>
                    <button class="btn btn-success" onclick="renderAdminSection('subscriptions')"><i class="fas fa-crown"></i> Manage Subscriptions</button>
                    <button class="btn btn-info" onclick="renderAdminSection('quotes')"><i class="fas fa-file-invoice-dollar"></i> Review Quotes</button>
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
                <div class="table-actions">
                    <button class="btn btn-primary" onclick="showAddUserModal()"><i class="fas fa-plus"></i> Add User</button>
                    <input type="text" placeholder="Search users..." class="search-input" onkeyup="filterTable(this.value, 'users-table')">
                </div>
                <table class="admin-table" id="users-table">
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
                                    <button class="btn btn-info btn-sm" onclick="showUserDetails('${user._id || user.id}')"><i class="fas fa-eye"></i></button>
                                    <button class="btn btn-warning btn-sm" onclick="showEditUserModal('${user._id || user.id}')"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-danger btn-sm" onclick="handleUserDelete('${user._id || user.id}')"><i class="fas fa-trash"></i></button>
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
                            <th>User</th><th>Details</th><th>Amount</th><th>Status</th><th>Attachments</th><th>Created</th><th>Actions</th>
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
                                <td>${quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A'}</td>
                                <td>
                                    <button class="btn btn-info btn-sm" onclick="viewQuoteDetails('${quote._id || quote.id}')"><i class="fas fa-eye"></i></button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteQuote('${quote._id || quote.id}')"><i class="fas fa-trash"></i></button>
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
                    <button class="btn btn-primary" onclick="showAddJobModal()"><i class="fas fa-plus"></i> Add Job</button>
                    <input type="text" placeholder="Search jobs..." class="search-input" onkeyup="filterTable(this.value, 'jobs-table')">
                </div>
                <table class="admin-table" id="jobs-table">
                    <thead>
                        <tr>
                            <th>Title</th><th>Company</th><th>Location</th><th>Salary</th><th>Status</th><th>Attachments</th><th>Posted</th><th>Actions</th>
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
                                    ${job.attachments && job.attachments.length > 0 
                                        ? `<button class="btn btn-info btn-sm" onclick="viewJobAttachments('${job._id || job.id}')">
                                             <i class="fas fa-paperclip"></i> ${job.attachments.length} files
                                           </button>`
                                        : '<span class="text-muted">No attachments</span>'
                                    }
                                </td>
                                <td>${job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'N/A'}</td>
                                <td>
                                    <button class="btn btn-info btn-sm" onclick="viewJobDetails('${job._id || job.id}')"><i class="fas fa-eye"></i></button>
                                    <button class="btn btn-warning btn-sm" onclick="editJob('${job._id || job.id}')"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteJob('${job._id || job.id}')"><i class="fas fa-trash"></i></button>
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

// --- NEW ENHANCED MESSAGES SECTION ---
async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/messages');
        const messages = response.messages;
        if (!messages || messages.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No messages found in the system.</div>';
            return;
        }

        const users = [...new Map(messages.map(m => [m.senderId?._id, m.senderId])).values()];

        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions">
                    <div class="search-filter-row">
                        <input type="text" placeholder="Search messages..." class="search-input" onkeyup="filterMessages(this.value)">
                        <select onchange="filterMessages()" class="filter-select" id="message-type-filter">
                            <option value="">All Types</option>
                            <option value="quote">Quote</option>
                            <option value="job">Job</option>
                            <option value="support">Support</option>
                            <option value="general">General</option>
                        </select>
                        <select onchange="filterMessages()" class="filter-select" id="message-user-filter">
                            <option value="">All Users</option>
                            ${users.map(user => user ? `<option value="${user._id}">${user.name}</option>` : '').join('')}
                        </select>
                    </div>
                </div>
                <div class="messages-view">
                    <div class="messages-list" id="messages-list">
                        ${messages.map((message) => `
                            <div class="message-item" data-message-id="${message._id || message.id}" data-message-type="${message.type || 'general'}" data-user-id="${message.senderId?._id || 'unknown'}" data-message-content="${encodeURIComponent(JSON.stringify(message))}" onclick="selectMessage(this)">
                                <div class="message-header">
                                    <div class="sender-info">
                                        <strong>${message.senderId ? message.senderId.name : 'Unknown User'}</strong>
                                        <span class="message-type-badge ${message.type || 'general'}">${message.type || 'General'}</span>
                                    </div>
                                    <div class="message-meta">
                                        <span class="message-date">${message.createdAt ? new Date(message.createdAt).toLocaleDateString() : 'N/A'}</span>
                                        ${message.unread ? '<span class="unread-indicator">●</span>' : ''}
                                    </div>
                                </div>
                                <div class="message-preview">
                                    ${message.content ? message.content.substring(0, 100) + (message.content.length > 100 ? '...' : '') : 'No content'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="message-detail" id="message-detail">
                        <div class="no-message-selected">Select a message to view details</div>
                    </div>
                </div>
            </div>
            <style>
                .messages-view { display: flex; height: 70vh; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
                .messages-list { width: 40%; border-right: 1px solid #ddd; overflow-y: auto; background: #f8f9fa; }
                .message-item { display: block; padding: 15px; border-bottom: 1px solid #eee; cursor: pointer; transition: background-color 0.2s; }
                .message-item:hover { background-color: #e9ecef; }
                .message-item.active { background-color: #007bff; color: white; }
                .message-item.active .message-type-badge { background-color: rgba(255,255,255,0.2); color: white; }
                .message-item.active .message-date, .message-item.active .message-preview { color: #f0f0f0; }
                .message-item.hidden { display: none; }
                .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
                .sender-info { display: flex; align-items: center; gap: 8px; }
                .message-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6c757d; }
                .message-date {}
                .unread-indicator { color: #007bff; font-size: 14px; line-height: 1; }
                .message-preview { font-size: 14px; color: #495057; line-height: 1.4; }
                .message-type-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; text-transform: capitalize; background-color: #e9ecef; color: #495057; }
                .message-type-badge.quote { background-color: #d1ecf1; color: #0c5460; }
                .message-type-badge.job { background-color: #d4edda; color: #155724; }
                .message-type-badge.support { background-color: #f8d7da; color: #721c24; }
                .message-type-badge.general { background-color: #e2e3e5; color: #383d41; }
                .message-detail { width: 60%; padding: 20px; display: flex; flex-direction: column; overflow-y: auto; }
                .no-message-selected { margin: auto; text-align: center; color: #6c757d; font-size: 16px; }
                .message-detail-header { padding-bottom: 15px; margin-bottom: 15px; border-bottom: 1px solid #eee; }
                .message-detail-header h4 { margin: 0 0 5px 0; }
                .message-detail-meta { font-size: 13px; color: #6c757d; }
                .message-detail-meta span { margin-right: 15px; }
                .message-detail-body { flex-grow: 1; line-height: 1.6; white-space: pre-wrap; font-size: 15px; }
                .message-reply-form { margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px; }
                .message-reply-form textarea { width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; resize: vertical; margin-bottom: 10px; }
                .message-reply-form .btn-container { text-align: right; }
                .search-filter-row { display: flex; gap: 15px; margin-bottom: 15px; }
                .search-filter-row .search-input { flex-grow: 1; }
            </style>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load messages. Please try again later.</div>';
    }
}

function selectMessage(element) {
    // Highlight active item in the list
    document.querySelectorAll('.message-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    // Remove unread indicator if present
    const unreadIndicator = element.querySelector('.unread-indicator');
    if (unreadIndicator) {
        unreadIndicator.remove();
    }

    const messageData = JSON.parse(decodeURIComponent(element.dataset.messageContent));
    const detailView = document.getElementById('message-detail');

    detailView.innerHTML = `
        <div class="message-detail-header">
            <h4>Conversation with ${messageData.senderId ? messageData.senderId.name : 'Unknown'}</h4>
            <div class="message-detail-meta">
                <span><i class="fas fa-calendar-alt"></i> ${new Date(messageData.createdAt).toLocaleString()}</span>
                <span><i class="fas fa-tag"></i> Type: ${messageData.type || 'General'}</span>
            </div>
        </div>
        <div class="message-detail-body">
            <p>${messageData.content || 'No content available.'}</p>
        </div>
        <div class="message-reply-form">
            <textarea id="reply-textarea" placeholder="Type your reply here..."></textarea>
            <div class="btn-container">
                <button class="btn btn-primary" onclick="handleSendMessage('${messageData._id}')">
                    <i class="fas fa-paper-plane"></i> Send Reply
                </button>
            </div>
        </div>
    `;
    // In a real app, you would also mark the message as read via an API call
    // apiCall(`/admin/messages/${messageData._id}/read`, 'PUT');
}

async function handleSendMessage(messageId) {
    const replyContent = document.getElementById('reply-textarea').value;
    if (!replyContent.trim()) {
        showNotification('Reply cannot be empty.', 'error');
        return;
    }

    try {
        await apiCall(`/admin/messages/reply/${messageId}`, 'POST', { content: replyContent }, 'Reply sent successfully!');
        // Optionally, re-render the messages or update the UI to show the reply
        document.getElementById('reply-textarea').value = '';
    } catch (error) {
        // Error notification is handled by apiCall
    }
}

function filterMessages() {
    const searchText = document.querySelector('.search-input').value.toLowerCase();
    const messageType = document.getElementById('message-type-filter').value;
    const userId = document.getElementById('message-user-filter').value;
    const messages = document.querySelectorAll('.message-item');

    messages.forEach(message => {
        const content = message.textContent.toLowerCase();
        const type = message.dataset.messageType;
        const msgUserId = message.dataset.userId;

        const matchesSearch = content.includes(searchText);
        const matchesType = !messageType || type === messageType;
        const matchesUser = !userId || msgUserId === userId;

        if (matchesSearch && matchesType && matchesUser) {
            message.classList.remove('hidden');
        } else {
            message.classList.add('hidden');
        }
    });
}


// --- PLACEHOLDER FUNCTIONS FOR OTHER SECTIONS ---
function renderAdminSubscriptions() {
    document.getElementById('admin-content-area').innerHTML = '<div class="coming-soon">Subscription management is coming soon.</div>';
}

function renderAdminSystemStats() {
    document.getElementById('admin-content-area').innerHTML = '<div class="coming-soon">System statistics are coming soon.</div>';
}
