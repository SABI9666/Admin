// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    currentUser: null,
    currentFilter: '',
    currentSection: 'dashboard',
    uploadProgress: 0,
    currentProfileReview: null
};
// Updated API base URL configuration
const API_BASE = 'https://steelconnect-backend.onrender.com/api';
const API_BASE_URL = 'https://steelconnect-backend.onrender.com'; // Kept for functions using the full URL

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
            options.body = body; // FormData handles its own content type
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, options);

        let responseData;
        const contentType = response.headers.get('content-type');

        if (!response.ok) {
            if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
                throw new Error(responseData.message || responseData.error || `HTTP error! Status: ${response.status}`);
            } else {
                 const text = await response.text();
                 throw new Error(text || `HTTP error! Status: ${response.status}`);
            }
        }

        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
            return responseData;
        } else {
             return response;
        }

    } catch (error) {
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

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

function showGenericModal(content, style = '') {
     const existingModal = document.getElementById('dynamic-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'dynamic-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="${style}">
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
    const renderMap = {
        dashboard: renderAdminDashboard,
        users: renderAdminUsers,
        'profile-reviews': renderProfileReviewsTab,
        quotes: renderAdminQuotes,
        estimations: renderAdminEstimations,
        jobs: renderAdminJobs,
        messages: renderAdminMessages,
        subscriptions: renderAdminSubscriptions,
        analytics: renderAdminAnalytics,
        'system-stats': renderSystemStats
    };

    showLoader(contentArea);
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
                                <div class="activity-icon"><i class="fas fa-${getActivityIcon(activity.type)}"></i></div>
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
        contentArea.innerHTML = `<div class="error-state"><h3>Failed to load dashboard data</h3></div>`;
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
    if (key.toLowerCase().includes('revenue')) return formatCurrency(value);
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
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><h3>No users found</h3></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header">
                <h2>Users Management <span class="count-badge">${users.length}</span></h2>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="users-table">
                    <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${users.map(user => `
                            <tr>
                                <td>${user.name}</td>
                                <td>${user.email}</td>
                                <td><span class="role-badge ${user.role}">${user.role}</span></td>
                                <td><span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
                                <td>${formatDate(user.createdAt)}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewUserDetails('${user._id}')"><i class="fas fa-eye"></i></button>
                                        <button class="btn btn-sm btn-warning" onclick="toggleUserStatus('${user._id}', ${!user.isActive})"><i class="fas fa-${user.isActive ? 'ban' : 'check'}"></i></button>
                                        <button class="btn btn-sm btn-danger" onclick="deleteUser('${user._id}')"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><h3>Failed to load users</h3></div>`;
    }
}

async function viewUserDetails(userId) { /* Implementation in previous responses */ }
async function toggleUserStatus(userId, newStatus) { /* Implementation in previous responses */ }
async function deleteUser(userId) { /* Implementation in previous responses */ }

// --- PROFILE REVIEWS ---
async function renderProfileReviewsTab() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { data: reviews } = await apiCall('/admin/profile-reviews');
        if (!reviews || reviews.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-user-check"></i><h3>No profile reviews found</h3></div>`;
            return;
        }

        const pending = reviews.filter(r => r.status === 'pending');
        const completed = reviews.filter(r => r.status !== 'pending');

        contentArea.innerHTML = `
            <div class="admin-section-header"><h2>Profile Reviews <span class="count-badge">${reviews.length}</span></h2></div>
            ${pending.length > 0 ? `
                <div class="review-section">
                    <h4>Pending Reviews (${pending.length})</h4>
                    <div class="profile-reviews-grid">${pending.map(renderProfileReviewCard).join('')}</div>
                </div>` : ''}
            ${completed.length > 0 ? `
                <div class="review-section">
                    <h4>Completed Reviews (${completed.length})</h4>
                    <div class="profile-reviews-grid">${completed.map(renderProfileReviewCard).join('')}</div>
                </div>` : ''}
        `;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><h3>Failed to load profile reviews</h3></div>`;
    }
}

function renderProfileReviewCard(review) {
    const user = review.user || {};
    const isPending = review.status === 'pending';
    return `
        <div class="profile-review-card review-status-${review.status}">
            <div class="review-header"><h4>${user.name || 'Unknown'}</h4><span class="status-badge ${review.status}">${review.status}</span></div>
            <p>${user.email}</p>
            <div class="review-actions">
                <button class="btn btn-sm btn-info" onclick="viewProfileDetails('${review._id}')"><i class="fas fa-eye"></i> View</button>
                ${isPending ? `
                    <button class="btn btn-sm btn-success" onclick="handleProfileApproval('${review._id}')"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn btn-sm btn-danger" onclick="handleProfileRejection('${review._id}')"><i class="fas fa-times"></i> Reject</button>
                ` : ''}
            </div>
        </div>
    `;
}

async function viewProfileDetails(reviewId) { /* Implementation in previous responses */ }
async function handleProfileApproval(reviewId) { /* Implementation in previous responses */ }
async function handleProfileRejection(reviewId) { /* Implementation in previous responses */ }

// --- QUOTES MANAGEMENT ---
async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `<h2>Quotes Management</h2><p>This section is under development.</p>`;
}

// --- JOBS MANAGEMENT ---
async function renderAdminJobs() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `<h2>Jobs Management</h2><p>This section is under development.</p>`;
}

// --- SUBSCRIPTIONS MANAGEMENT ---
async function renderAdminSubscriptions() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `<h2>Subscriptions Management</h2><p>This section is under development.</p>`;
}

// --- ANALYTICS ---
async function renderAdminAnalytics() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `<h2>Analytics</h2><p>This section is under development.</p>`;
}

// --- SYSTEM STATS ---
async function renderSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `<h2>System Stats</h2><p>This section is under development.</p>`;
}

// --- MESSAGES MANAGEMENT ---
async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { messages } = await apiCall('/admin/messages');
        window.messagesData = messages || [];

        if (!messages || messages.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>No messages found</h3></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header"><h2>Messages Management <span class="count-badge">${messages.length}</span></h2></div>
            <div class="admin-table-container">
                <table class="admin-table" id="messages-table">
                    <thead><tr><th>From</th><th>Subject</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                    <tbody>${messages.map(renderMessageRow).join('')}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><h3>Failed to load messages</h3></div>`;
    }
}

function renderMessageRow(message) {
    const isUnread = !message.isRead && !message.isBlocked;
    const rowClass = message.isBlocked ? 'blocked-row' : (isUnread ? 'unread-row' : '');
    return `
        <tr class="${rowClass}" data-message-id="${message._id}">
            <td><strong>${message.senderName}</strong><br><small>${message.senderEmail}</small></td>
            <td>${message.subject}</td>
            <td><span class="status-badge ${message.status}">${message.status}</span></td>
            <td>${formatDate(message.createdAt)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-info" onclick="viewMessageDetails('${message._id}')"><i class="fas fa-eye"></i></button>
                    ${!message.isBlocked ? `<button class="btn btn-sm btn-primary" onclick="replyToMessage('${message._id}')"><i class="fas fa-reply"></i></button>` : ''}
                    ${!message.isBlocked ? `<button class="btn btn-sm btn-warning" onclick="blockMessage('${message._id}', true)"><i class="fas fa-ban"></i></button>` : `<button class="btn btn-sm btn-success" onclick="blockMessage('${message._id}', false)"><i class="fas fa-check-circle"></i></button>`}
                    <button class="btn btn-sm btn-danger" onclick="deleteMessage('${message._id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `;
}

async function viewMessageDetails(messageId) {
    try {
        const { message } = await apiCall(`/admin/messages/${messageId}`);
        if (!message.isRead) {
            await apiCall(`/admin/messages/${messageId}/status`, 'PATCH', { status: 'read', isRead: true });
        }
        showModal('message-details', `<h3>${message.subject}</h3><p>From: ${message.senderName}</p><hr><p>${message.content.replace(/\n/g, '<br>')}</p>`);
        renderAdminMessages();
    } catch (error) { /* Handled by apiCall */ }
}

async function replyToMessage(messageId) {
    const replyContent = prompt("Enter your reply:");
    if (!replyContent) return;
    try {
        await apiCall(`/admin/messages/${messageId}/reply`, 'POST', { content: replyContent });
        showNotification('Reply sent!', 'success');
        renderAdminMessages();
    } catch (error) { /* Handled by apiCall */ }
}

async function blockMessage(messageId, block) {
    const reason = block ? prompt("Reason for blocking:") : '';
    if (block && reason === null) return;
    try {
        await apiCall(`/admin/messages/${messageId}/block`, 'PATCH', { block, reason });
        showNotification(`Message ${block ? 'blocked' : 'unblocked'}.`, 'success');
        renderAdminMessages();
    } catch (error) { /* Handled by apiCall */ }
}

async function deleteMessage(messageId) {
    if (!confirm("Delete this message permanently?")) return;
    try {
        await apiCall(`/admin/messages/${messageId}`, 'DELETE');
        showNotification('Message deleted.', 'success');
        renderAdminMessages();
    } catch (error) { /* Handled by apiCall */ }
}

// --- ESTIMATIONS MANAGEMENT ---
async function renderAdminEstimations() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { estimations } = await apiCall('/admin/estimations');
        if (!estimations || estimations.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-calculator"></i><h3>No estimations found</h3></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header"><h2>Estimations Management <span class="count-badge">${estimations.length}</span></h2></div>
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead><tr><th>Project</th><th>Contractor</th><th>Files</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>${estimations.map(renderEstimationRow).join('')}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><h3>Failed to load estimations</h3></div>`;
    }
}

function renderEstimationRow(estimation) {
    return `
        <tr>
            <td><strong>${estimation.projectTitle}</strong></td>
            <td>${estimation.contractorName}</td>
            <td>
                ${estimation.uploadedFiles?.length || 0} files
                ${estimation.uploadedFiles?.length > 0 ? `
                    <button class="btn btn-sm btn-link" onclick="downloadAllEstimationFiles('${estimation._id}')"><i class="fas fa-download"></i></button>` : ''}
            </td>
            <td><span class="status-badge ${estimation.status}">${estimation.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-success" onclick="showUploadResultModal('${estimation._id}')"><i class="fas fa-upload"></i></button>
                    ${estimation.resultFile ? `
                        <button class="btn btn-sm btn-primary" onclick="downloadEstimationResult('${estimation._id}')"><i class="fas fa-file-download"></i></button>` : ''}
                </div>
            </td>
        </tr>
    `;
}

async function downloadAllEstimationFiles(estimationId) {
    try {
        showNotification('Preparing download...', 'info');
        const response = await apiCall(`/admin/estimations/${estimationId}/download-all`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `estimation-${estimationId}-files.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        showNotification('Download failed.', 'error');
    }
}

function showUploadResultModal(estimationId) {
    showModal('upload-result', `
        <h3>Upload Estimation Result</h3>
        <form id="upload-result-form">
            <div class="form-group"><input type="file" id="result-file" required></div>
            <div class="form-group"><textarea id="result-notes" placeholder="Notes (Optional)"></textarea></div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Upload</button></div>
        </form>
    `);

    document.getElementById('upload-result-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('result-file');
        if (!fileInput.files[0]) return;
        const formData = new FormData();
        formData.append('resultFile', fileInput.files[0]);
        formData.append('notes', document.getElementById('result-notes').value);

        try {
            await apiCall(`/admin/estimations/${estimationId}/result`, 'POST', formData, true);
            showNotification('Result uploaded!', 'success');
            closeModal();
            renderAdminEstimations();
        } catch (error) { /* Handled by apiCall */ }
    });
}

async function downloadEstimationResult(estimationId) {
    try {
        const response = await apiCall(`/admin/estimations/${estimationId}/result/download`);
        const blob = await response.blob();
        const contentDisposition = response.headers.get('content-disposition');
        let filename = `result-${estimationId}`;
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="(.+)"/);
            if (match) filename = match[1];
        }
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        showNotification('Download failed.', 'error');
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
