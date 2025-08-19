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

function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
}

async function apiCall(endpoint, method = 'GET', body = null) {
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
        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(responseData.message || `HTTP error! Status: ${response.status}`);
        }
        return responseData;
    } catch (error) {
        const errorMessage = (error.name === 'TypeError') ? 'Network error: Could not connect to server.' : error.message;
        showNotification(errorMessage, 'error');
        throw new Error(errorMessage);
    }
}

function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('currentUser');
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
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showNotification('Email and Password are required.', 'error');
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';

    try {
        const data = await apiCall('/auth/login/admin', 'POST', { email, password });
        if (!data.token || !data.user) throw new Error('Invalid response from server.');
        
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
    const token = localStorage.getItem('jwtToken');
    const userJson = localStorage.getItem('currentUser');

    if (token && userJson) {
        try {
            const user = JSON.parse(userJson);
            if (user.role?.toLowerCase() === 'admin' || user.type?.toLowerCase() === 'admin') {
                appState.currentUser = user;
                setupAdminPanel();
            } else {
                showAdminLoginPrompt("Access Denied: Admin privileges required.");
            }
        } catch (error) {
            showAdminLoginPrompt("Invalid user data. Please log in again.");
        }
    } else {
        showAdminLoginPrompt();
    }
}

function showAdminLoginPrompt(message = "You must be an administrator to view this page.") {
    hideGlobalLoader();
    document.getElementById('admin-panel-container').style.display = 'none';
    const loginPrompt = document.getElementById('admin-login-prompt');
    loginPrompt.style.display = 'flex';
    loginPrompt.querySelector('p').textContent = message;
}

function setupAdminPanel() {
    hideGlobalLoader();
    document.getElementById('admin-login-prompt').style.display = 'none';
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
    switch (section) {
        case 'dashboard': renderAdminDashboard(); break;
        case 'estimations': renderAdminEstimations(); break;
        default: 
            contentArea.innerHTML = `<div class="empty-state"><h3>${section.charAt(0).toUpperCase() + section.slice(1)}</h3><p>This section is under construction.</p></div>`;
    }
}

async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const data = await apiCall('/admin/dashboard');
        const stats = data.stats || {};
        contentArea.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card"><i class="fas fa-users"></i><div class="stat-info"><span class="stat-value">${stats.totalUsers || 0}</span><span class="stat-label">Total Users</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-file-invoice-dollar"></i><div class="stat-info"><span class="stat-value">${stats.totalQuotes || 0}</span><span class="stat-label">Total Quotes</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-comments"></i><div class="stat-info"><span class="stat-value">${stats.totalMessages || 0}</span><span class="stat-label">Total Messages</span></div></div>
                <div class="admin-stat-card"><i class="fas fa-briefcase"></i><div class="stat-info"><span class="stat-value">${stats.totalJobs || 0}</span><span class="stat-label">Total Jobs</span></div></div>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state"><p>Failed to load dashboard data.</p></div>';
    }
}

function renderAdminEstimations() {
    const contentArea = document.getElementById('admin-content-area');
    // In a real scenario, you would fetch data here.
    contentArea.innerHTML = `<div class="empty-state"><h3>Estimations</h3><p>The estimations management section is under construction.</p></div>`;
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('admin-login-form')) {
        initializeLoginPage();
    } else if (document.getElementById('admin-panel-container')) {
        initializeAdminPage();
    }
});
