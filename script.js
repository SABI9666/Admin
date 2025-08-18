// script.js for the Enhanced SteelConnect Admin Panel - FIXED VERSION
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
    // Create notification container if it doesn't exist
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '10000';
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
        max-width: 300px;
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
    
    console.log(`Making ${method} request to: ${fullUrl}`); // Debug log
    
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        // Add CORS headers for cross-origin requests
        mode: 'cors',
        credentials: 'omit', // Don't send cookies
    };
    
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
        console.log('Token included in request'); // Debug log
    }
    
    if (body) {
        options.body = JSON.stringify(body);
        console.log('Request body:', body); // Debug log
    }
    
    try {
        console.log('Sending request with options:', options); // Debug log
        const response = await fetch(fullUrl, options);
        
        console.log('Response status:', response.status); // Debug log
        console.log('Response headers:', Object.fromEntries(response.headers.entries())); // Debug log
        
        // Handle different response types
        let responseData = null;
        const contentType = response.headers.get("content-type");
        
        if (contentType && contentType.includes("application/json")) {
            responseData = await response.json();
            console.log('Response data:', responseData); // Debug log
        } else {
            const textResponse = await response.text();
            console.log('Response text:', textResponse); // Debug log
            // Try to parse as JSON in case content-type header is wrong
            try {
                responseData = JSON.parse(textResponse);
            } catch (e) {
                responseData = { message: textResponse || 'No response data' };
            }
        }
        
        if (!response.ok) {
            const errorMessage = responseData?.message || responseData?.error || `HTTP ${response.status}: ${response.statusText}`;
            console.error('API Error:', errorMessage); // Debug log
            throw new Error(errorMessage);
        }
        
        if (successMessage) {
            showNotification(successMessage, 'success');
        }
        
        return responseData;
        
    } catch (error) {
        console.error(`API Call Failed: ${method} ${fullUrl}`, error);
        
        // Provide more specific error messages
        let errorMessage = error.message;
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error: Unable to connect to server. Please check your internet connection.';
        } else if (error.message.includes('CORS')) {
            errorMessage = 'Cross-origin request blocked. Please check server CORS settings.';
        }
        
        showNotification(errorMessage, 'error');
        throw error;
    }
}

/**
 * Logs the user out by clearing credentials and redirecting.
 */
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
    console.log('Initializing login page'); // Debug log
    hideGlobalLoader();
    
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        console.log('Login form found, attaching event listener'); // Debug log
        loginForm.addEventListener('submit', handleAdminLogin);
    } else {
        console.error('Login form not found in DOM'); // Debug log
    }
    
    // Add input validation
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    
    if (emailInput && passwordInput) {
        emailInput.addEventListener('input', validateEmail);
        passwordInput.addEventListener('input', validatePassword);
    }
}

function validateEmail() {
    const emailInput = document.getElementById('email');
    const email = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (email && !emailRegex.test(email)) {
        emailInput.style.borderColor = '#dc3545';
        showNotification('Please enter a valid email address', 'warning');
    } else {
        emailInput.style.borderColor = '';
    }
}

function validatePassword() {
    const passwordInput = document.getElementById('password');
    const password = passwordInput.value;
    
    if (password && password.length < 3) {
        passwordInput.style.borderColor = '#dc3545';
    } else {
        passwordInput.style.borderColor = '';
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();
    console.log('Login form submitted'); // Debug log
    
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    
    if (!emailInput || !passwordInput) {
        console.error('Email or password input not found'); // Debug log
        showNotification('Login form inputs not found', 'error');
        return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    console.log('Login attempt with email:', email); // Debug log (don't log password)
    
    // Client-side validation
    if (!email) {
        showNotification('Please enter your email address', 'error');
        emailInput.focus();
        return;
    }
    
    if (!password) {
        showNotification('Please enter your password', 'error');
        passwordInput.focus();
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Please enter a valid email address', 'error');
        emailInput.focus();
        return;
    }
    
    const loginButton = event.target.querySelector('button[type="submit"]');
    if (!loginButton) {
        console.error('Submit button not found'); // Debug log
        return;
    }
    
    // Disable button and show loading state
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';
    loginButton.style.opacity = '0.7';

    try {
        console.log('Sending login request...'); // Debug log
        const data = await apiCall('/auth/login/admin', 'POST', { email, password });
        console.log('Login response received:', data); // Debug log
        
        // Validate response structure
        if (!data) {
            throw new Error('No data received from server');
        }
        
        if (!data.token) {
            throw new Error('No authentication token received');
        }
        
        if (!data.user) {
            throw new Error('No user data received');
        }
        
        // Check if user has admin privileges
        if (data.user.role !== 'admin' && data.user.type !== 'admin') {
            throw new Error('Access denied: Admin privileges required');
        }
        
        // Store credentials
        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        // Update app state
        appState.jwtToken = data.token;
        appState.currentUser = data.user;
        
        console.log('Login successful, redirecting...'); // Debug log
        showNotification('Login successful! Redirecting...', 'success');
        
        setTimeout(() => {
            window.location.href = 'admin.html';
        }, 1000);
        
    } catch (error) {
        console.error('Login error:', error); // Debug log
        
        // Reset button state
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
        loginButton.style.opacity = '1';
        
        // Clear password field on error
        passwordInput.value = '';
        
        // Focus on email field
        emailInput.focus();
    }
}

// --- ADMIN PANEL INITIALIZATION & SETUP ---
function initializeAdminPage() {
    console.log('Initializing admin page'); // Debug log
    
    const token = localStorage.getItem('jwtToken');
    const userJson = localStorage.getItem('currentUser');
    
    console.log('Stored token exists:', !!token); // Debug log
    console.log('Stored user data exists:', !!userJson); // Debug log
    
    if (token && userJson) {
        try {
            const user = JSON.parse(userJson);
            console.log('Parsed user data:', user); // Debug log
            
            if (user.role === 'admin' || user.type === 'admin') {
                appState.jwtToken = token;
                appState.currentUser = user;
                console.log('Admin access granted, setting up panel'); // Debug log
                setupAdminPanel();
            } else {
                console.log('User does not have admin privileges'); // Debug log
                showAdminLoginPrompt("Access Denied: You do not have admin privileges.");
            }
        } catch (error) {
            console.error('Error parsing user data:', error); // Debug log
            showAdminLoginPrompt("Invalid user data found. Please log in again.");
        }
    } else {
        console.log('No valid credentials found'); // Debug log
        showAdminLoginPrompt();
    }
    
    hideGlobalLoader();
}

function showAdminLoginPrompt(message = null) {
    console.log('Showing admin login prompt:', message); // Debug log
    hideGlobalLoader();
    
    const loginPrompt = document.getElementById('admin-login-prompt');
    const panelContainer = document.getElementById('admin-panel-container');
    
    if (loginPrompt) {
        loginPrompt.style.display = 'flex';
    }
    
    if (panelContainer) {
        panelContainer.style.display = 'none';
    }
    
    if (message) {
        const messageElement = document.querySelector('.login-prompt-box p');
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.style.color = '#dc3545'; // Red color for error messages
        }
    }
}

function setupAdminPanel() {
    console.log('Setting up admin panel'); // Debug log
    hideGlobalLoader();
    
    const loginPrompt = document.getElementById('admin-login-prompt');
    const panelContainer = document.getElementById('admin-panel-container');
    
    if (loginPrompt) {
        loginPrompt.style.display = 'none';
    }
    
    if (panelContainer) {
        panelContainer.style.display = 'flex';
    } else {
        console.error('Admin panel container not found'); // Debug log
        return;
    }
    
    // Update user info
    const userInfoElement = document.getElementById('admin-user-info');
    if (userInfoElement && appState.currentUser) {
        userInfoElement.innerHTML = `
            <strong>${appState.currentUser.name || 'Admin User'}</strong>
            <small>${appState.currentUser.role || appState.currentUser.type || 'admin'}</small>
        `;
    }
    
    // Setup logout button
    const logoutButton = document.getElementById('admin-logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    
    // Setup navigation
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
    
    // Activate dashboard by default
    const dashboardLink = document.querySelector('.admin-nav-link[data-section="dashboard"]');
    if (dashboardLink) {
        dashboardLink.classList.add('active');
        renderAdminSection('dashboard');
    }
}

// --- DYNAMIC CONTENT RENDERING ---
function renderAdminSection(section) {
    console.log('Rendering admin section:', section); // Debug log
    const contentArea = document.getElementById('admin-content-area');
    
    if (!contentArea) {
        console.error('Admin content area not found'); // Debug log
        return;
    }
    
    contentArea.innerHTML = '<div class="loading-spinner" style="text-align: center; padding: 40px;"><div class="spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div><p style="margin-top: 15px;">Loading...</p></div>';
    
    // Add CSS animation for spinner
    if (!document.querySelector('#spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
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
            contentArea.innerHTML = '<div class="error-state" style="text-align: center; padding: 40px; color: #dc3545;">Section not found.</div>';
    }
}

async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        console.log('Loading dashboard data...'); // Debug log
        const response = await apiCall('/admin/dashboard');
        console.log('Dashboard data received:', response); // Debug log
        
        const stats = response.stats || {};
        contentArea.innerHTML = `
            <div class="admin-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                <div class="admin-stat-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; display: flex; align-items: center; gap: 15px;">
                    <i class="fas fa-users" style="font-size: 2rem; color: #007bff;"></i>
                    <div class="stat-info">
                        <span class="stat-value" style="display: block; font-size: 1.5rem; font-weight: bold; color: #333;">${stats.totalUsers || 0}</span>
                        <span class="stat-label" style="color: #6c757d; font-size: 0.9rem;">Total Users</span>
                    </div>
                </div>
                <div class="admin-stat-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; display: flex; align-items: center; gap: 15px;">
                    <i class="fas fa-file-invoice-dollar" style="font-size: 2rem; color: #28a745;"></i>
                    <div class="stat-info">
                        <span class="stat-value" style="display: block; font-size: 1.5rem; font-weight: bold; color: #333;">${stats.totalQuotes || 0}</span>
                        <span class="stat-label" style="color: #6c757d; font-size: 0.9rem;">Total Quotes</span>
                    </div>
                </div>
                <div class="admin-stat-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; display: flex; align-items: center; gap: 15px;">
                    <i class="fas fa-comments" style="font-size: 2rem; color: #ffc107;"></i>
                    <div class="stat-info">
                        <span class="stat-value" style="display: block; font-size: 1.5rem; font-weight: bold; color: #333;">${stats.totalMessages || 0}</span>
                        <span class="stat-label" style="color: #6c757d; font-size: 0.9rem;">Total Messages</span>
                    </div>
                </div>
                <div class="admin-stat-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; display: flex; align-items: center; gap: 15px;">
                    <i class="fas fa-briefcase" style="font-size: 2rem; color: #dc3545;"></i>
                    <div class="stat-info">
                        <span class="stat-value" style="display: block; font-size: 1.5rem; font-weight: bold; color: #333;">${stats.totalJobs || 0}</span>
                        <span class="stat-label" style="color: #6c757d; font-size: 0.9rem;">Total Jobs</span>
                    </div>
                </div>
                <div class="admin-stat-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; display: flex; align-items: center; gap: 15px;">
                    <i class="fas fa-crown" style="font-size: 2rem; color: #6f42c1;"></i>
                    <div class="stat-info">
                        <span class="stat-value" style="display: block; font-size: 1.5rem; font-weight: bold; color: #333;">${stats.activeSubscriptions || 0}</span>
                        <span class="stat-label" style="color: #6c757d; font-size: 0.9rem;">Active Subscriptions</span>
                    </div>
                </div>
                <div class="admin-stat-card" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; display: flex; align-items: center; gap: 15px;">
                    <i class="fas fa-dollar-sign" style="font-size: 2rem; color: #20c997;"></i>
                    <div class="stat-info">
                        <span class="stat-value" style="display: block; font-size: 1.5rem; font-weight: bold; color: #333;">$${stats.totalRevenue || 0}</span>
                        <span class="stat-label" style="color: #6c757d; font-size: 0.9rem;">Total Revenue</span>
                    </div>
                </div>
            </div>
            <div class="admin-quick-actions" style="background: white; padding: 25px; border-radius: 8px; border: 1px solid #dee2e6;">
                <h3 style="margin-bottom: 20px; color: #333;">Quick Actions</h3>
                <div class="quick-action-buttons" style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="renderAdminSection('users')" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-users"></i> Manage Users
                    </button>
                    <button class="btn btn-success" onclick="renderAdminSection('subscriptions')" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-crown"></i> Manage Subscriptions
                    </button>
                    <button class="btn btn-info" onclick="renderAdminSection('quotes')" style="padding: 10px 20px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-invoice-dollar"></i> Review Quotes
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Dashboard loading error:', error); // Debug log
        contentArea.innerHTML = '<div class="error-state" style="text-align: center; padding: 40px; color: #dc3545;">Failed to load dashboard data. Please try again later.</div>';
    }
}

// Placeholder functions for other sections (keeping them simple for now)
async function renderAdminUsers() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="coming-soon" style="text-align: center; padding: 40px; color: #6c757d;">User management section is being loaded...</div>';
}

async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="coming-soon" style="text-align: center; padding: 40px; color: #6c757d;">Quotes management section is being loaded...</div>';
}

async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="coming-soon" style="text-align: center; padding: 40px; color: #6c757d;">Messages section is being loaded...</div>';
}

async function renderAdminJobs() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="coming-soon" style="text-align: center; padding: 40px; color: #6c757d;">Jobs management section is being loaded...</div>';
}

function renderAdminSubscriptions() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="coming-soon" style="text-align: center; padding: 40px; color: #6c757d;">Subscription management is coming soon.</div>';
}

function renderAdminSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="coming-soon" style="text-align: center; padding: 40px; color: #6c757d;">System statistics are coming soon.</div>';
}

// --- INITIALIZATION ---
// Automatically initialize based on current page
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, current URL:', window.location.href); // Debug log
    
    // Determine which page we're on and initialize accordingly
    if (window.location.pathname.includes('admin.html') || document.getElementById('admin-panel-container')) {
        console.log('Initializing admin page'); // Debug log
        initializeAdminPage();
    } else if (document.getElementById('admin-login-form')) {
        console.log('Initializing login page'); // Debug log
        initializeLoginPage();
    } else {
        console.log('Unknown page type, checking for elements...'); // Debug log
        // Fallback - check what elements exist and initialize accordingly
        setTimeout(() => {
            if (document.getElementById('admin-panel-container')) {
                initializeAdminPage();
            } else if (document.getElementById('admin-login-form')) {
                initializeLoginPage();
            }
        }, 100);
    }
});

// Global error handler
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showNotification('An unexpected error occurred. Please refresh the page.', 'error');
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('A network error occurred. Please try again.', 'error');
});
