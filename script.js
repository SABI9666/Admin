// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    jwtToken: null,
    currentUser: null,
};
const API_BASE_URL = 'https://steelconnect-backend.onrender.com/api';

// --- CORE UTILITY FUNCTIONS ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `<span>${message}</span><button class="notification-close" onclick="this.parentElement.remove()">&times;</button>`;
    container.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

async function apiCall(endpoint, method = 'GET', body = null, successMessage = null) {
    const token = localStorage.getItem('jwtToken');
    const fullUrl = `${API_BASE_URL}${endpoint}`;
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(fullUrl, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'An unknown server error occurred.' }));
            throw new Error(errorData.message || `Request failed with status ${response.status}`);
        }
        if (successMessage) showNotification(successMessage, 'success');
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        }
        return; 
    } catch (error) {
        showNotification(error.message, 'error');
        console.error(`API Call Failed: ${method} ${fullUrl}`, error);
        throw error;
    }
}

function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('currentUser');
    showNotification('You have been logged out.', 'success');
    setTimeout(() => window.location.href = 'login.html', 1000);
}

// --- LOGIN PAGE LOGIC ---
function initializeLoginPage() {
    document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const loginButton = event.target.querySelector('button[type="submit"]');
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';

    try {
        const data = await apiCall('/auth/login/admin', 'POST', { email, password });
        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        showNotification('Login successful! Redirecting...', 'success');
        setTimeout(() => { window.location.href = 'index.html'; }, 1000);
    } catch (error) {
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
    }
}

// --- ADMIN PANEL LOGIC ---
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
}

function showAdminLoginPrompt(message = "You must be logged in as an administrator.") {
    document.getElementById('admin-login-prompt').style.display = 'flex';
    document.getElementById('admin-panel-container').style.display = 'none';
    const messageElement = document.querySelector('.login-prompt-box p');
    if (messageElement) messageElement.textContent = message;
}

function setupAdminPanel() {
    document.getElementById('admin-login-prompt').style.display = 'none';
    document.getElementById('admin-panel-container').style.display = 'flex';

    document.getElementById('admin-user-info').innerHTML = `
        <strong>${appState.currentUser.name}</strong>
        <small>${appState.currentUser.role || appState.currentUser.type}</small>`;
    
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
    renderAdminSection('dashboard');
}

function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    switch (section) {
        case 'dashboard': renderDashboard(); break;
        case 'users': renderUsers(); break;
        case 'quotes': renderQuotes(); break;
        case 'estimations': renderAdminEstimations(); break; // Added this line
        case 'system-stats': renderSystemStats(); break;
        default: contentArea.innerHTML = '<div class="error-state">Section not found.</div>';
    }
}

// --- RENDER FUNCTIONS FOR ADMIN SECTIONS ---
async function renderDashboard() {
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
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load dashboard data.</div>';
    }
}

// New function that you provided
async function renderAdminEstimations() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const response = await apiCall('/admin/estimations');
        const estimations = response.estimations || [];

        if (estimations.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No estimations found.</div>';
            return;
        }
                
        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions">
                    <h3>Estimations Management</h3>
                    <div class="estimation-filters">
                        <input type="text" placeholder="Search estimations..." class="search-input">
                        <select class="filter-select" id="status-filter">
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="in-progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                </div>
                <div class="estimations-grid">
                    ${estimations.map(est => `
                        <div class="estimation-card" data-estimation-id="${est._id}">
                            <div class="estimation-header">
                                <h4>${est.projectTitle}</h4>
                                <span class="status-badge ${est.status}">${est.status}</span>
                            </div>
                            <div class="estimation-info">
                                <p><strong>Contractor:</strong> ${est.contractorId?.name}</p>
                                <p><strong>Submitted:</strong> ${new Date(est.createdAt).toLocaleDateString()}</p>
                                <p><strong>Files:</strong> ${est.uploadedFiles?.length || 0} uploaded</p>
                            </div>
                            <div class="estimation-actions">
                                <button class="btn btn-info btn-sm" onclick="viewEstimationDetails('${est._id}')">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                <button class="btn btn-success btn-sm" onclick="workOnEstimation('${est._id}')">
                                    <i class="fas fa-calculator"></i> Work On
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load estimations.</div>';
    }
}

function renderUsers() { const contentArea = document.getElementById('admin-content-area'); contentArea.innerHTML = `<div class="empty-state">User management feature coming soon!</div>`; }
function renderQuotes() { const contentArea = document.getElementById('admin-content-area'); contentArea.innerHTML = `<div class="empty-state">Quotes overview feature coming soon!</div>`; }
function renderSystemStats() { const contentArea = document.getElementById('admin-content-area'); contentArea.innerHTML = `<div class="empty-state">System stats feature coming soon!</div>`; }

// Placeholder functions for estimation card buttons to prevent errors
function viewEstimationDetails(estimationId) {
    showNotification(`Viewing details for estimation #${estimationId.slice(-6)}`, 'info');
    console.log("viewEstimationDetails called with ID:", estimationId);
}
function workOnEstimation(estimationId) {
    showNotification(`Working on estimation #${estimationId.slice(-6)}`, 'info');
    console.log("workOnEstimation called with ID:", estimationId);
}

// --- GLOBAL INITIALIZATION TRIGGER ---
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('admin-login-form')) {
        initializeLoginPage();
    } else if (document.getElementById('admin-panel-container')) {
        initializeAdminPage();
    }
});
