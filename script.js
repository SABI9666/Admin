// --- CONFIGURATION & GLOBAL STATE ---
const appState = { currentUser: null };
const API_BASE_URL = 'https://steelconnect-backend.onrender.com/api';

// --- CORE UTILITY FUNCTIONS ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `<span>${message}</span><button class="notification-close" onclick="this.parentElement.remove()">&times;</button>`;
    container.appendChild(notification);
    setTimeout(() => { notification.remove(); }, 5000);
}

function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('jwtToken');
    const options = {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    };
    if (body) options.body = JSON.stringify(body);

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

// --- LOGIN PAGE LOGIC ---
function initializeLoginPage() {
    document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const loginButton = event.target.querySelector('button[type="submit"]');
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';

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
        loginButton.textContent = 'Login';
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
    document.getElementById('admin-user-info').innerHTML = `<strong>${appState.currentUser.name}</strong><small>${appState.currentUser.role || 'Admin'}</small>`;
    document.getElementById('admin-logout-btn').addEventListener('click', logout);
    
    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.getElementById('admin-section-title').textContent = link.textContent.trim();
            renderAdminSection(link.dataset.section);
        });
    });
    
    document.querySelector('.admin-nav-link[data-section="dashboard"]').click();
}

function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    const renderMap = {
        dashboard: renderAdminDashboard,
        users: renderAdminUsers,
        quotes: renderAdminQuotes,
        estimations: renderAdminEstimations,
        jobs: renderAdminJobs,
        messages: renderAdminMessages,
        subscriptions: () => { contentArea.innerHTML = `<div class="empty-state">Subscriptions section is under construction.</div>`;}
    };
    renderMap[section]();
}

// --- DATA FETCH AND RENDER FUNCTIONS ---
async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const data = await apiCall('/admin/dashboard');
        contentArea.innerHTML = `<div class="admin-stats-grid">
            ${Object.entries(data.stats).map(([key, value]) => `
                <div class="admin-stat-card"><i></i><div class="stat-info"><span class="stat-value">${value}</span><span class="stat-label">${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span></div></div>
            `).join('')}
        </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state"><p>Failed to load dashboard data.</p></div>';
    }
}

async function renderAdminUsers() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { users } = await apiCall('/admin/users');
        if (!users || users.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No users found in Firestore.</div>';
            return;
        }
        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions"><h3>Users (from Firestore)</h3></div>
                <table class="admin-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>${users.map(user => `
                        <tr data-user-id="${user.id || user._id}">
                            <td>${user.name}</td>
                            <td>${user.email}</td>
                            <td>${user.type || 'N/A'}</td>
                            <td><span class="status-badge ${user.status}">${user.status}</span></td>
                            <td><button class="btn btn-danger btn-sm" onclick="handleUserDelete('${user.id || user._id}')"><i class="fas fa-trash"></i> Delete</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load user data.</div>';
    }
}

async function handleUserDelete(userId) {
    if (confirm('Are you sure you want to permanently delete this user?')) {
        try {
            await apiCall(`/admin/users/${userId}`, 'DELETE');
            showNotification('User deleted successfully.', 'success');
            renderAdminUsers(); // Refresh the list
        } catch (error) {
            // Notification is already handled by apiCall
        }
    }
}

async function renderAdminEstimations() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { estimations } = await apiCall('/admin/estimations');
        if (!estimations || estimations.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No estimations found in MongoDB.</div>';
            return;
        }
        contentArea.innerHTML = `
            <div class="admin-table-container">
                <div class="table-actions"><h3>Estimations (from MongoDB)</h3></div>
                <table class="admin-table">
                    <thead><tr><th>Project Title</th><th>Status</th><th>Created</th></tr></thead>
                    <tbody>${estimations.map(est => `
                        <tr>
                            <td>${est.projectTitle || 'N/A'}</td>
                            <td><span class="status-badge ${est.status}">${est.status}</span></td>
                            <td>${new Date(est.createdAt).toLocaleDateString()}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load estimations data.</div>';
    }
}

// --- Placeholders for other sections ---
async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="empty-state">Quotes section is under construction.</div>';
}
async function renderAdminJobs() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="empty-state">Jobs section is under construction.</div>';
}
async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="empty-state">Messages section is under construction.</div>';
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('admin-login-form')) {
        initializeLoginPage();
    } else if (document.getElementById('admin-panel-container')) {
        initializeAdminPage();
    }
});
