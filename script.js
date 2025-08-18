// script.js for the Enhanced SteelConnect Admin Panel - BACKEND COMPATIBLE VERSION

// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    jwtToken: null,
    currentUser: null,
};

const API_BASE_URL = 'https://steelconnect-backend.onrender.com/api';

// This configuration can now be managed from the "Subscription Plans" section
// It serves as a fallback or initial structure.
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

        if (data.user.role !== 'admin' && data.user.type !== 'admin') {
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
            renderAdminSubscriptions();
            break;
        case 'subscription-plans':
            renderAdminSubscriptionPlans();
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
                    <button class="btn btn-success" onclick="document.querySelector('[data-section=\\"subscriptions\\"]').click()"><i class="fas fa-crown"></i> User Subscriptions</button>
                    <button class="btn btn-info" onclick="document.querySelector('[data-section=\\"subscription-plans\\"]').click()"><i class="fas fa-cogs"></i> Subscription Plans</button>
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

// --- MESSAGES SECTION ---
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
            <div class="admin-table-container">
                <div class="table-actions">
                     <h3>Messages Management</h3>
                     <div class="search-filter-row">
                        <input type="text" placeholder="Search messages..." class="search-input" onkeyup="filterMessages()">
                        <select onchange="filterMessages()" class="filter-select" id="message-user-filter">
                            <option value="">All Users</option>
                            ${users.map(user => `<option value="${user._id}">${user.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="messages-view">
                    <div class="messages-list" id="messages-list">
                        ${messages.map((message) => `
                            <div class="message-item" 
                                 data-message-id="${message._id}" 
                                 data-user-id="${message.senderId?._id}" 
                                 data-message-content="${encodeURIComponent(JSON.stringify(message))}" 
                                 onclick="selectMessage(this)">
                                <div class="message-header">
                                    <strong class="sender-name">${message.senderId?.name || 'Unknown'} to ${message.receiverId?.name || 'Admin'}</strong>
                                    <span class="message-date">${new Date(message.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div class="message-preview">${message.content?.substring(0, 100) + (message.content?.length > 100 ? '...' : '')}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="message-detail" id="message-detail">
                        <div class="no-message-selected">Select a message to view details</div>
                    </div>
                </div>
            </div>
            <style>
                .message-item.hidden { display: none; }
            </style>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load messages.</div>';
    }
}

// --- SUBSCRIPTIONS SECTION (USER SUBSCRIPTIONS) ---
async function renderAdminSubscriptions() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/subscriptions');
        const subscriptions = response.subscriptions || [];
        if (subscriptions.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No active user subscriptions found.</div>';
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions">
                    <h3>User Subscriptions Management</h3>
                    <input type="text" placeholder="Search subscriptions..." class="search-input" onkeyup="filterTable(this.value, 'subscriptions-table')">
                </div>
                <div style="overflow-x: auto;">
                    <table class="admin-table" id="subscriptions-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Plan</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subscriptions.map(sub => `
                                <tr data-subscription-id="${sub._id}">
                                    <td>${sub.user?.name || 'N/A'}</td>
                                    <td>${sub.plan || 'N/A'}</td>
                                    <td><input type="number" class="amount-input" value="${sub.amount || 0}" onchange="updateSubscriptionAmount('${sub._id}', this.value)"></td>
                                    <td>
                                        <select class="status-select" onchange="updateSubscriptionStatus('${sub._id}', this.value)">
                                            <option value="active" ${sub.status === 'active' ? 'selected' : ''}>Active</option>
                                            <option value="cancelled" ${sub.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                            <option value="expired" ${sub.status === 'expired' ? 'selected' : ''}>Expired</option>
                                        </select>
                                    </td>
                                    <td>${new Date(sub.startDate).toLocaleDateString()}</td>
                                    <td>${new Date(sub.endDate).toLocaleDateString()}</td>
                                    <td>
                                        <div class="action-buttons">
                                            <button class="btn btn-warning btn-sm" onclick="extendSubscription('${sub._id}')">Extend</button>
                                            <button class="btn btn-danger btn-sm" onclick="cancelSubscription('${sub._id}')">Cancel</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load subscriptions data.</div>';
    }
}

// --- NEW: SUBSCRIPTION PLANS SECTION ---
async function renderAdminSubscriptionPlans() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        // In a real app, you'd fetch this from an API, e.g., await apiCall('/admin/subscription-plans');
        // For this example, we'll use the hardcoded SUBSCRIPTION_PLANS object.
        const plansData = await Promise.resolve(SUBSCRIPTION_PLANS); // Simulating API call

        let html = '<div class="subscription-plans-container">';

        for (const userType in plansData) {
            html += `
                <div class="admin-table-container plan-group">
                    <div class="table-actions">
                        <h3>${userType} Plans</h3>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="admin-table" id="${userType}-plans-table">
                            <thead>
                                <tr>
                                    <th>Activity</th>
                                    <th>Subscription Type</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>`;
            
            const activities = plansData[userType];
            for (const activityKey in activities) {
                const activity = activities[activityKey];
                activity.types.forEach(type => {
                    // Unique ID for each plan row
                    const planId = `${userType}-${activityKey}-${type}`.replace(/\s+/g, '-');
                    html += `
                        <tr data-plan-id="${planId}">
                            <td>${activity.name}</td>
                            <td>${type}</td>
                            <td><input type="text" class="amount-input" value="manual entry" placeholder="e.g., 50 or 5%"></td>
                            <td>
                                <label class="switch">
                                  <input type="checkbox" checked>
                                  <span class="slider round"></span>
                                </label>
                            </td>
                        </tr>
                    `;
                });
            }

            html += `</tbody></table></div></div>`;
        }

        html += '</div>';
        contentArea.innerHTML = html;

    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load subscription plans.</div>';
    }
}


function renderAdminSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="coming-soon">System statistics are coming soon.</div>';
}

// --- MESSAGE HANDLING FUNCTIONS ---
function selectMessage(element) {
    document.querySelectorAll('.message-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const messageData = JSON.parse(decodeURIComponent(element.dataset.messageContent));
    const detailView = document.getElementById('message-detail');
    
    // Simulate fetching the whole conversation thread
    const conversationHtml = `
        <div class="message-bubble received">
            <p>${messageData.content}</p>
            <span class="timestamp">${new Date(messageData.createdAt).toLocaleString()}</span>
        </div>
    `;

    detailView.innerHTML = `
        <div class="message-detail-header">
            <h4>Conversation with ${messageData.senderId?.name || 'Unknown'}</h4>
        </div>
        <div class="message-detail-body">${conversationHtml}</div>
        <div class="message-reply-form">
            <textarea id="reply-textarea" placeholder="Type your reply here..."></textarea>
            <button class="btn btn-primary" onclick="handleSendMessage('${messageData._id}')">
                <i class="fas fa-paper-plane"></i> Send Reply
            </button>
        </div>
    `;
}

async function handleSendMessage(messageId) {
    const replyContent = document.getElementById('reply-textarea').value;
    if (!replyContent.trim()) {
        showNotification('Reply cannot be empty.', 'error');
        return;
    }
    try {
        // The API should handle associating this reply with the correct conversation/user
        await apiCall(`/admin/messages/reply/${messageId}`, 'POST', { content: replyContent }, 'Reply sent successfully!');
        document.getElementById('reply-textarea').value = '';
        // Optionally, refresh the message view to show the new reply
    } catch (error) {
       // Error is handled by apiCall
    }
}

function filterMessages() {
    const searchText = document.querySelector('.search-input').value.toLowerCase();
    const userId = document.getElementById('message-user-filter').value;
    const messages = document.querySelectorAll('.message-item');

    messages.forEach(message => {
        const content = message.textContent.toLowerCase();
        const msgUserId = message.dataset.userId;
        
        const matchesSearch = content.includes(searchText);
        const matchesUser = !userId || msgUserId === userId;

        if (matchesSearch && matchesUser) {
            message.classList.remove('hidden');
        } else {
            message.classList.add('hidden');
        }
    });
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
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="close-button" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">${contentHtml}</div>
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
            <p><strong>Amount:</strong> $${quote.amount || 0}</p>
            <p><strong>Status:</strong> ${quote.status || 'pending'}</p>
            <p><strong>Created:</strong> ${new Date(quote.createdAt).toLocaleString()}</p>
            <hr><h4 style="margin-bottom: 10px;">Details</h4>
            <div class="details-box">${quote.details || 'No details.'}</div>
        `;
        createModal('Quote Details', content);
    } catch (error) {
        showNotification('Failed to load quote details.', 'error');
    }
}

async function updateSubscriptionAmount(subId, amount) {
    await apiCall(`/admin/subscriptions/${subId}/amount`, 'PUT', { amount }, 'Subscription amount updated.');
}

async function updateSubscriptionStatus(subId, status) {
    await apiCall(`/admin/subscriptions/${subId}/status`, 'PUT', { status }, 'Subscription status updated.');
}

async function extendSubscription(subId) {
    const months = prompt('Enter number of months to extend:', '1');
    if (months && !isNaN(months) && parseInt(months) > 0) {
        await apiCall(`/admin/subscriptions/${subId}/extend`, 'PUT', { months: parseInt(months) }, 'Subscription extended.');
        renderAdminSubscriptions();
    }
}

async function cancelSubscription(subId) {
    if (confirm('Are you sure you want to cancel this subscription?')) {
        await apiCall(`/admin/subscriptions/${subId}/cancel`, 'PUT', null, 'Subscription cancelled.');
        renderAdminSubscriptions();
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
