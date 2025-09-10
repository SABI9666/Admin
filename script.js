// script.js - CORRECTED
// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    currentUser: null,
    currentFilter: '',
    currentSection: 'dashboard',
    uploadProgress: 0,
    currentProfileReview: null
};
// CORRECTED: Use the full base URL for all API calls
const API_BASE_URL = 'https://steelconnect-backend.onrender.com';

// --- CORE UTILITY FUNCTIONS ---
function showNotification(message, type = 'info', duration = 5000) {
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
    setTimeout(() => { notification.remove(); }, duration);
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

// Enhanced API call with better error handling
async function apiCall(endpoint, method = 'GET', body = null, isFileUpload = false) {
    const token = getToken();
    if (!token) {
        showNotification('No authentication token found. Please log in again.', 'error');
        throw new Error('No authentication token found');
    }

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`
        },
    };

    if (body) {
        if (isFileUpload) {
            options.body = body;
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, options);
        const responseData = await response.json().catch(() => null);

        if (!response.ok) {
            const errorMessage = responseData?.message || responseData?.error || `HTTP error! Status: ${response.status}`;
            throw new Error(errorMessage);
        }
        
        return responseData;
    } catch (error) {
        console.error(`API Call Failed (${endpoint}):`, error);
        showNotification(error.message, 'error');
        throw error;
    }
}

function logout() {
    localStorage.clear();
    showNotification('You have been logged out.', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 1000);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
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
        <div class="modal-content" id="${modalId}-content">
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
    const profileReviewsTab = document.getElementById('profile-reviews-tab');

    // Hide both containers initially
    contentArea.style.display = 'none';
    profileReviewsTab.style.display = 'none';

    const renderMap = {
        dashboard: renderEnhancedDashboard,
        users: renderEnhancedUsersTab,
        'profile-reviews': renderProfileReviewsTab,
        quotes: renderAdminQuotes,
        estimations: renderAdminEstimations,
        jobs: renderAdminJobs,
        messages: renderAdminMessages,
        subscriptions: renderAdminSubscriptions,
        analytics: renderAdminAnalytics,
        'system-stats': renderSystemStats
    };

    const targetContainer = section === 'profile-reviews' ? profileReviewsTab : contentArea;
    targetContainer.style.display = 'block';
    showLoader(targetContainer);
    
    setTimeout(() => {
        if (renderMap[section]) {
            renderMap[section]();
        } else {
            renderComingSoon(section);
        }
    }, 100);
}

// ... All other rendering functions (Dashboard, Users, Profile Reviews, Messages, etc.) remain here ...
// They are mostly correct and call the right /admin/* endpoints.

// --- ENHANCED ESTIMATION MANAGEMENT (CORRECTED API CALLS) ---
async function renderAdminEstimations() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        // CORRECTED: The endpoint now correctly points to the estimation routes.
        const { estimations } = await apiCall('/estimations');
        if (!estimations || estimations.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-calculator"></i><h3>No estimations found</h3></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header">
                <h2>Estimations Management</h2> <span class="count-badge">${estimations.length}</span>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="estimations-table">
                    <thead>
                        <tr><th>Project Title</th><th>Contractor</th><th>Status</th><th>Files</th><th>Created</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        ${estimations.map(est => `
                            <tr data-estimation-id="${est._id || est.id}">
                                <td>${est.projectTitle}</td>
                                <td>${est.contractorName}<br><small>${est.contractorEmail}</small></td>
                                <td>
                                    <select class="status-select" onchange="updateEstimationStatus('${est._id || est.id}', this.value)">
                                        <option value="pending" ${est.status === 'pending' ? 'selected' : ''}>Pending</option>
                                        <option value="in-progress" ${est.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                                        <option value="completed" ${est.status === 'completed' ? 'selected' : ''}>Completed</option>
                                        <option value="cancelled" ${est.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                    </select>
                                </td>
                                <td>${est.uploadedFiles?.length || 0} files</td>
                                <td>${formatDate(est.createdAt)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewEstimationFiles('${est._id || est.id}')"><i class="fas fa-paperclip"></i></button>
                                        ${est.resultFile ? `
                                            <a href="${API_BASE_URL}/api/estimations/${est._id || est.id}/result/download?token=${getToken()}" target="_blank" class="btn btn-sm btn-primary"><i class="fas fa-download"></i> Result</a>
                                        ` : `
                                            <button class="btn btn-sm btn-success" onclick="uploadEstimationResult('${est._id || est.id}')"><i class="fas fa-upload"></i> Result</button>
                                        `}
                                        <button class="btn btn-sm btn-danger" onclick="deleteEstimation('${est._id || est.id}')"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><h3>Failed to load estimations.</h3></div>`;
    }
}

async function updateEstimationStatus(estimationId, newStatus) {
    try {
        // CORRECTED: Endpoint path
        await apiCall(`/estimations/${estimationId}/status`, 'PUT', { status: newStatus });
        showNotification('Estimation status updated.', 'success');
    } catch (error) {
        renderAdminEstimations(); // Refresh to show original state on failure
    }
}

async function viewEstimationFiles(estimationId) {
    try {
        // CORRECTED: Endpoint path
        const { files } = await apiCall(`/estimations/${estimationId}/files`);
        // Logic to show files in a modal
        let filesHtml = files.map(file => `<li><a href="${file.url}" target="_blank">${file.name}</a></li>`).join('');
        showModal('files-modal', `<h3>Uploaded Files</h3><ul>${filesHtml}</ul>`);
    } catch (error) {
        showNotification('Could not load files.', 'error');
    }
}

function uploadEstimationResult(estimationId) {
    showModal('upload-result-modal', `
        <h3>Upload Estimation Result</h3>
        <form id="upload-result-form">
            <input type="file" id="result-file" required>
            <button type="submit" class="btn btn-primary">Upload</button>
        </form>
    `);

    document.getElementById('upload-result-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('result-file');
        const formData = new FormData();
        formData.append('resultFile', fileInput.files[0]);

        try {
            // CORRECTED: Endpoint path
            await apiCall(`/estimations/${estimationId}/result`, 'POST', formData, true);
            showNotification('Result uploaded successfully.', 'success');
            closeModal();
            renderAdminEstimations();
        } catch (error) { /* Error handled by apiCall */ }
    });
}

async function deleteEstimation(estimationId) {
    if (confirm('Are you sure you want to delete this estimation?')) {
        try {
            // CORRECTED: Endpoint path
            await apiCall(`/estimations/${estimationId}`, 'DELETE');
            showNotification('Estimation deleted.', 'success');
            renderAdminEstimations();
        } catch (error) { /* Error handled by apiCall */ }
    }
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('admin-login-form')) {
        initializeLoginPage();
    }
    if (document.getElementById('admin-panel-container')) {
        initializeAdminPage();
    }

    document.addEventListener('click', e => {
        if (e.target.classList.contains('modal-overlay')) closeModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
});
// NOTE: Make sure to include all other render functions (`renderEnhancedDashboard`, `renderEnhancedUsersTab`, etc.) from your original script.js file here. They were omitted for brevity but are required for the other tabs to work.
