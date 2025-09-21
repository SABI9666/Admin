// script.js - Complete Enhanced Admin Panel Logic with All Functions
// Updated to be fully compatible with the provided src/routes/admin.js backend.
// This version incorporates enhanced file management for estimations, jobs, quotes, and a new support ticket system.

document.addEventListener('DOMContentLoaded', initializeAdminPanel);

// --- CONFIGURATION & GLOBAL STATE ---
const API_BASE_URL = 'https://steelconnect-backend.onrender.com';
const state = {
    users: [],
    profileReviews: [],
    estimations: [],
    jobs: [],
    quotes: [],
    messages: [],
    conversations: [],
    supportMessages: [],
};

// --- INITIALIZATION ---
async function initializeAdminPanel() {
    const token = getToken();
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!token || !user || user.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('adminName').textContent = user.name || user.email;

    // Inject additional CSS for better visual feedback
    const additionalCSS = `<style>.critical-indicator { color: #ff4444; font-weight: bold; }.support-stat-card { border-left: 4px solid #007bff; }.support-stat-card:has(.critical-indicator) { border-left-color: #ff4444; }.fa-spinner.fa-spin { animation: spin 1s linear infinite; } @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }.notification-actions { margin-top: 10px; }.notification-actions .btn { margin-right: 5px; }.invalid-date { color: #888; font-style: italic; }.tab.active { background-color: #007bff; color: white; }.tab-content { display: none; }.tab-content.active { display: block; }.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; padding: 20px; }.stat-card { background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; transition: transform 0.2s; }.stat-card:hover { transform: translateY(-5px); }.stat-card h3 { font-size: 2.5em; margin: 0; color: #333; }.stat-card p { color: #777; margin: 5px 0 15px; }.stat-card .btn { padding: 5px 15px; font-size: 0.9em; }.support-stat-card { border-left: 4px solid #007bff; }.support-stat-card:has(.critical-indicator) { border-left-color: #ff4444; } table { width: 100%; border-collapse: collapse; margin-top: 20px; }.review-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }.review-card { border: 1px solid #ccc; padding: 15px; border-radius: 8px; }.review-card h4 { margin-top: 0; }</style>`;
    document.head.insertAdjacentHTML('beforeend', additionalCSS);

    // Auto-fetch core data on startup for a faster experience
    await loadDashboardStats();
    await loadUsersData();
    await loadProfileReviewsData();

    // Set the default tab view
    showTab('users'); // Set default to 'users' to avoid initial error

    // Initialize real-time updates if available
    initializeRealTimeUpdates();
}

// --- API & UTILITY FUNCTIONS ---
function getToken() { return localStorage.getItem('jwtToken'); }

async function apiCall(endpoint, method = 'GET', body = null, isFileUpload = false) {
    const token = getToken();
    if (!token) {
        showNotification('Authentication error. Please log in again.', 'error');
        logout();
        throw new Error('No token');
    }
    const options = { method, headers: { 'Authorization': `Bearer ${token}` } };
    if (body) {
        if (isFileUpload) {
            options.body = body;
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin${endpoint}`, options);
        if (response.status === 401) {
             logout();
             throw new Error('Session expired. Please log in again.');
        }
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.message || 'An API error occurred.');
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
    window.location.href = 'index.html';
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function showAdvancedNotification(message, type = 'info', duration = 5000, actions = []) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    notification.appendChild(messageSpan);
    
    if (actions.length > 0) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'notification-actions';
        
        actions.forEach(action => {
            const button = document.createElement('button');
            button.textContent = action.text;
            button.className = `btn btn-sm ${action.class || ''}`;
            button.onclick = action.callback;
            actionsDiv.appendChild(button);
        });
        
        notification.appendChild(actionsDiv);
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'notification-close';
    closeBtn.onclick = () => notification.remove();
    notification.appendChild(closeBtn);
    
    container.appendChild(notification);
    
    if (duration > 0) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }
}

function showLoader(container) { container.innerHTML = `<div class="loader">Loading...</div>`; }

function showModal(content) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal()" role="dialog" aria-modal="true">
            <div class="modal-content" onclick="event.stopPropagation()" tabindex="-1">
                <button class="modal-close" onclick="closeModal()" aria-label="Close modal">&times;</button>
                ${content}
            </div>
        </div>`;
    
    const modalContent = modalContainer.querySelector('.modal-content');
    modalContent.focus();
    
    modalContainer.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
        
        if (e.key === 'Tab') {
            const focusableElements = modalContent.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            
            if (e.shiftKey && document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    });
}

function closeModal() { document.getElementById('modal-container').innerHTML = ''; }

// --- INPUT VALIDATION & SANITIZATION ---
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- TAB NAVIGATION ---
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

    const tabContent = document.getElementById(`${tabName}-tab`);
    if (tabContent) {
        tabContent.classList.add('active');
    }
    const tabButton = document.querySelector(`.tab[onclick="showTab('${tabName}')"]`);
    if (tabButton) {
        tabButton.classList.add('active');
    }

    // Manual load map for tabs
    const manualLoadMap = {
        'users': { data: state.users, loader: loadUsersData },
        'profile-reviews': { data: state.profileReviews, loader: loadProfileReviewsData },
        'estimations': { data: state.estimations, loader: loadEstimationsData },
        'jobs': { data: state.jobs, loader: () => loadGenericData('jobs') },
        'quotes': { data: state.quotes, loader: () => loadGenericData('quotes') },
        'messages': { data: state.messages, loader: loadMessagesData },
        'conversations': { data: state.conversations, loader: loadConversationsData },
        'support-messages': { data: state.supportMessages || [], loader: loadSupportMessagesData },
        'analytics-management': { data: [], loader: loadContractorAnalysisData }
    };

    if (manualLoadMap[tabName]) {
        if (manualLoadMap[tabName].data.length === 0) {
            manualLoadMap[tabName].loader();
        }
    } else if (tabName === 'dashboard') {
        renderDashboardTab();
    }
}

// --- DASHBOARD ---
function renderDashboardTab() {
    const container = document.getElementById('dashboard-tab');
    if (!container) return; // Exit if dashboard tab isn't in HTML
    container.innerHTML = `
        <div class="section-header">
            <h3>Dashboard Overview</h3>
            <button class="btn" onclick="loadDashboardStats()">Refresh Stats</button>
        </div>
        <div id="statsGrid" class="stats-grid"></div>
    `;
    loadDashboardStats();
}

async function loadDashboardStats() {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;
    try {
        const { stats } = await apiCall('/dashboard');
        
        const supportCount = stats.totalSupportTickets || stats.totalSupportMessages || 0;
        const criticalCount = stats.criticalSupportTickets || 0;
        
        statsGrid.innerHTML = `
            <div class="stat-card">
                <h3>${stats.totalUsers || 0}</h3>
                <p>Total Users</p>
                <button class="btn btn-sm" onclick="exportData('users')">Export</button>
            </div>
            <div class="stat-card">
                <h3>${stats.pendingProfileReviews || 0}</h3>
                <p>Pending Reviews</p>
                <button class="btn btn-sm" onclick="showTab('profile-reviews')">Review</button>
            </div>
            <div class="stat-card">
                <h3>${stats.totalJobs || 0}</h3>
                <p>Total Jobs</p>
                <button class="btn btn-sm" onclick="exportData('jobs')">Export</button>
            </div>
            <div class="stat-card">
                <h3>${stats.totalQuotes || 0}</h3>
                <p>Total Quotes</p>
                <button class="btn btn-sm" onclick="exportData('quotes')">Export</button>
            </div>
            <div class="stat-card">
                <h3>${stats.totalConversations || 0}</h3>
                <p>User Conversations</p>
                <button class="btn btn-sm" onclick="showTab('conversations')">View</button>
            </div>
            <div class="stat-card support-stat-card">
                <h3>${supportCount}</h3>
                <p>Support Tickets</p>
                ${criticalCount > 0 ? `<small class="critical-indicator">${criticalCount} Critical</small>` : ''}
                <button class="btn btn-sm btn-support" onclick="showTab('support-messages')">Manage</button>
            </div>
        `;
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        statsGrid.innerHTML = `<p class="error">Failed to load dashboard stats.</p>`;
    }
}


// --- USER MANAGEMENT (UPDATED) ---
async function loadUsersData() {
    const container = document.getElementById('users-tab');
    showLoader(container);
    try {
        const { users } = await apiCall('/users');
        state.users = users;
        renderUsersTab();
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load users.</p><button class="btn" onclick="loadUsersData()">Retry</button>`;
    }
}

function renderUsersTab() {
    const container = document.getElementById('users-tab');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header">
            <h3>All Users (${state.users.length})</h3>
            <div class="header-actions">
                <button class="btn" onclick="loadUsersData()">Refresh</button>
                <button class="btn btn-primary" onclick="exportData('users')">Export Users</button>
            </div>
        </div>
        <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
                ${state.users.map(user => `
                    <tr>
                        <td>${user.name || 'N/A'}</td>
                        <td>${user.email}</td>
                        <td>${user.role}</td>
                        <td>
                            <span class="status ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span>
                            ${user.isBlocked ? `<span class="status blocked">Blocked</span>` : ''}
                        </td>
                        <td class="action-buttons">
                            <button class="btn btn-sm ${user.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatus('${user._id}', ${!user.isActive})">${user.isActive ? 'Deactivate' : 'Activate'}</button>
                            <button class="btn btn-sm ${user.isBlocked ? 'btn-success' : 'btn-warning'}" onclick="showBlockUserModal('${user._id}', '${user.email}', ${user.isBlocked})">${user.isBlocked ? 'Unblock' : 'Block'}</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

async function toggleUserStatus(userId, newStatus) {
    if (!confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this user?`)) return;
    try {
        const data = await apiCall(`/users/${userId}/status`, 'PATCH', { isActive: newStatus });
        showNotification(data.message, 'success');
        await loadUsersData();
    } catch (error) {}
}

function showBlockUserModal(userId, userEmail, isCurrentlyBlocked) {
    const modalContent = `
        <div class="modal-body">
            <h3>${isCurrentlyBlocked ? 'Unblock' : 'Block'} User</h3>
            <p>User: <strong>${userEmail}</strong></p>
            ${isCurrentlyBlocked ?
            `<p>Unblocking this user will allow them to send messages and interact normally.</p>` :
            `<div class="form-group">
                <label for="block-reason">Reason for Blocking (Optional):</label>
                <textarea id="block-reason" rows="3" placeholder="e.g., Spamming, abusive behavior..."></textarea>
             </div>
             <p class="warning-notice">Blocking will prevent this user from sending any new messages.</p>`
            }
            <div class="modal-actions">
                <button class="btn ${isCurrentlyBlocked ? 'btn-success' : 'btn-danger'}" onclick="confirmBlockUser('${userEmail}', ${!isCurrentlyBlocked})">
                    ${isCurrentlyBlocked ? 'Confirm Unblock' : 'Confirm Block'}
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

async function confirmBlockUser(email, block) {
    const reason = document.getElementById('block-reason')?.value || '';
    try {
        const data = await apiCall('/users/block-user', 'POST', {
            email: email,
            blocked: block,
            reason: sanitizeInput(reason)
        });
        showNotification(data.message, 'success');
        closeModal();
        await loadUsersData(); // Refresh user list to show new status
        // Also refresh messages if that tab is active, as sender status might change
        if (document.getElementById('messages-tab')?.classList.contains('active')) {
            await loadMessagesData();
        }
    } catch (error) {}
}

// --- PROFILE REVIEWS ---
async function loadProfileReviewsData() {
    const container = document.getElementById('profile-reviews-tab');
    showLoader(container);
    try {
        const { reviews } = await apiCall('/profile-reviews');
        state.profileReviews = reviews;
        renderProfileReviewsTab();
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load profile reviews.</p><button class="btn" onclick="loadProfileReviewsData()">Retry</button>`;
    }
}

function renderProfileReviewsTab() {
    const container = document.getElementById('profile-reviews-tab');
    if (!container) return;
    const pendingReviews = state.profileReviews.filter(r => r.status === 'pending');
    container.innerHTML = `
        <div class="section-header"><h3>Pending Reviews (${pendingReviews.length})</h3><button class="btn" onclick="loadProfileReviewsData()">Refresh</button></div>
        ${pendingReviews.length === 0 ? '<p>No pending profile reviews.</p>' : `
        <div class="review-grid">
            ${pendingReviews.map(review => `
                <div class="review-card">
                    <h4>${review.user.name} (${review.user.type})</h4>
                    <p>${review.user.email}</p>
                    <div class="actions">
                        <button class="btn" onclick="viewProfileDetails('${review._id}')">View Details</button>
                        <button class="btn btn-success" onclick="approveProfileWithComment('${review._id}')">Approve</button>
                        <button class="btn btn-danger" onclick="showRejectModal('${review._id}')">Reject</button>
                    </div>
                </div>
            `).join('')}
        </div>
        `}`;
}

function viewProfileDetails(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review) return showNotification('Could not find review.', 'error');
    const user = review.user;
    const documents = user.documents || [];
    const modalContent = `
        <div class="profile-review-modal">
            <h3><i class="fas fa-user-check"></i> Profile Review: ${user.name}</h3>
            <div class="info-grid">
                <div><label>Email:</label><span>${user.email}</span></div>
                <div><label>Type:</label><span>${user.type}</span></div>
                <div><label>Status:</label><span class="status ${review.status}">${review.status}</span></div>
                ${user.phone ? `<div><label>Phone:</label><span>${user.phone}</span></div>` : ''}
                ${user.company ? `<div><label>Company:</label><span>${user.company}</span></div>` : ''}
            </div>
            <h4><i class="fas fa-file-alt"></i> Documents</h4>
            ${documents.length > 0 ? `
                <ul class="file-list">
                    ${documents.map(doc => `
                        <li>
                            <i class="fas ${getFileIcon(doc.type, doc.filename)}"></i> ${doc.filename}
                            <a href="${doc.url}" target="_blank" class="btn btn-sm">View</a>
                            <a href="${doc.url}" download="${doc.filename}" class="btn btn-sm btn-primary">Download</a>
                        </li>
                    `).join('')}
                </ul>
                <button class="btn" onclick="downloadAllProfileFiles('${reviewId}')">Download All</button>
            ` : `<p>No documents uploaded.</p>`}
             <div class="review-actions">
                <button class="btn btn-success" onclick="approveProfileWithComment('${reviewId}')"><i class="fas fa-check"></i> Approve</button>
                <button class="btn btn-danger" onclick="showRejectModal('${reviewId}')"><i class="fas fa-times"></i> Reject</button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

function approveProfileWithComment(reviewId) {
    const modalContent = `
        <div class="modal-body">
            <h3>Approve Profile</h3>
            <p>You can add optional comments for the user or for internal records.</p>
            <div class="form-group">
                <label for="approval-comments">Admin Comments (Optional)</label>
                <textarea id="approval-comments" rows="3" placeholder="e.g., All documents verified."></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn btn-success" onclick="confirmApproveProfile('${reviewId}')">Confirm Approval</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

async function confirmApproveProfile(reviewId) {
    const comments = document.getElementById('approval-comments').value;
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/approve`, 'POST', {
            adminComments: sanitizeInput(comments)
        });
        showNotification(data.message, 'success');
        closeModal();
        await Promise.all([loadProfileReviewsData(), loadDashboardStats()]);
    } catch (error) {}
}

function showRejectModal(reviewId) {
    const modalContent = `
        <div class="modal-body">
            <h3>Reject Profile</h3>
            <p class="warning-notice">The user will receive your feedback and can resubmit their profile.</p>
            <div class="form-group">
                <label for="rejection-reason">Reason for Rejection *</label>
                <textarea id="rejection-reason" rows="4" placeholder="Please provide specific reasons..." required></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn btn-danger" onclick="confirmRejectProfile('${reviewId}')">Confirm Rejection</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

async function confirmRejectProfile(reviewId) {
    const reason = document.getElementById('rejection-reason').value;
    if (!reason.trim()) return showNotification('Rejection reason is required.', 'warning');
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/reject`, 'POST', {
            reason: sanitizeInput(reason)
        });
        showNotification(data.message, 'success');
        closeModal();
        await Promise.all([loadProfileReviewsData(), loadDashboardStats()]);
    } catch (error) {}
}

function downloadAllProfileFiles(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review || !review.user.documents) return showNotification('No files to download.', 'warning');
    review.user.documents.forEach((doc, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = doc.url;
            link.download = doc.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 300);
    });
    showNotification(`Downloading ${review.user.documents.length} files...`, 'info');
}

// --- ESTIMATIONS ---
async function loadEstimationsData() {
    const container = document.getElementById('estimations-tab');
    showLoader(container);
    try {
        const { estimations } = await apiCall('/estimations');
        state.estimations = estimations;
        renderEstimationsTab();
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load estimations.</p><button class="btn" onclick="loadEstimationsData()">Retry</button>`;
    }
}

// ** ENHANCED FUNCTION **
function renderEstimationsTab() {
    const container = document.getElementById('estimations-tab');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header">
            <h3>All Estimations (${state.estimations.length})</h3>
            <div class="header-actions">
                <button class="btn" onclick="loadEstimationsData()">Refresh</button>
                <button class="btn btn-primary" onclick="exportData('estimations')">Export</button>
            </div>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Files</th>
                    <th>Result</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${state.estimations.map(est => {
                    const fileCount = est.uploadedFiles ? est.uploadedFiles.length : 0;
                    const totalSize = est.uploadedFiles ?
                        est.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0;
                    const totalSizeMB = totalSize > 0 ? (totalSize / (1024 * 1024)).toFixed(1) + 'MB' : '';

                    return `
                        <tr>
                            <td>
                                <div class="project-cell">
                                    <strong>${est.projectName || est.projectTitle || 'Untitled Project'}</strong>
                                    ${est.description ? `<br><small class="project-desc">${est.description.substring(0, 60)}${est.description.length > 60 ? '...' : ''}</small>` : ''}
                                </div>
                            </td>
                            <td>
                                <div class="client-info">
                                    ${est.contractorName || 'N/A'}<br>
                                    <small>${est.contractorEmail || est.userEmail || 'N/A'}</small>
                                </div>
                            </td>
                            <td><span class="status ${est.status}">${est.status}</span></td>
                            <td>
                                ${fileCount > 0 ? `
                                    <div class="files-summary">
                                        <i class="fas fa-file-pdf"></i>
                                        <span class="file-count">${fileCount} PDF${fileCount > 1 ? 's' : ''}</span>
                                        ${totalSizeMB ? `<br><small class="file-size">${totalSizeMB}</small>` : ''}
                                        <button class="btn btn-xs" onclick="showEstimationFiles('${est._id}')">View</button>
                                    </div>
                                ` : '<span class="no-files">No files</span>'}
                            </td>
                            <td>
                                ${est.resultFile ? `
                                    <a href="${est.resultFile.url}" target="_blank" class="result-link">
                                        <i class="fas fa-file-alt"></i> View Result
                                    </a>
                                ` : '<span class="pending-result">Pending</span>'}
                            </td>
                            <td>
                                <small>${new Date(est.createdAt).toLocaleDateString()}</small>
                            </td>
                            <td class="action-buttons">
                                <button class="btn btn-sm" onclick="showUploadResultModal('${est._id}')">
                                    <i class="fas fa-upload"></i> Upload Result
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteEstimation('${est._id}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>`;
}

// ** ENHANCED FUNCTION **
function showEstimationFiles(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation) return showNotification('Estimation not found.', 'error');

    const files = estimation.uploadedFiles || [];
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-folder-open"></i> Project Files - ${estimation.projectName || estimation.projectTitle}</h3>
            <div class="files-summary-header">
                <span class="files-count">${files.length} PDF files</span>
                ${totalSize > 0 ? `<span class="files-size">Total: ${totalSizeMB}MB</span>` : ''}
            </div>
            
            ${files.length > 0 ? `
                <div class="files-grid">
                    ${files.map((file, index) => {
                        const fileName = file.originalname || file.filename || file.name || `File ${index + 1}`;
                        const fileSize = file.size ? (file.size / (1024 * 1024)).toFixed(2) + 'MB' : 'Unknown size';
                        const uploadDate = file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'Unknown date';

                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas fa-file-pdf"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size">${fileSize}</span>
                                        <span class="file-date">${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </a>
                                    <a href="${file.url}" download="${fileName}" class="btn btn-sm btn-primary">
                                        <i class="fas fa-download"></i> Download
                                    </a>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="bulk-actions">
                    <button class="btn btn-outline" onclick="downloadAllEstimationFiles('${estimationId}')">
                        <i class="fas fa-download"></i> Download All Files
                    </button>
                </div>
            ` : `
                <div class="empty-state">
                    <i class="fas fa-file-pdf"></i>
                    <p>No files found for this estimation.</p>
                </div>
            `}
        </div>
    `;
    showModal(modalContent);
}

// ** NEW FUNCTION **
function downloadAllEstimationFiles(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation || !estimation.uploadedFiles) {
        return showNotification('No files to download.', 'warning');
    }

    const files = estimation.uploadedFiles;
    showNotification(`Downloading ${files.length} files...`, 'info');

    files.forEach((file, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = file.url;
            link.download = file.originalname || file.filename || `estimation_file_${index + 1}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 500); // Stagger downloads to avoid browser blocking
    });
}

function showUploadResultModal(estimationId) {
    showModal(`
        <div class="modal-body">
            <h3>Upload Estimation Result</h3>
            <p>This will mark the estimation as 'completed' and notify the user.</p>
            <div class="form-group">
                <label for="result-file-input">Result File (PDF, Excel, etc.):</label>
                <input type="file" id="result-file-input">
            </div>
            <div class="modal-actions">
                <button class="btn btn-success" onclick="uploadEstimationResult('${estimationId}')">Upload & Complete</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `);
}

async function uploadEstimationResult(estimationId) {
    const fileInput = document.getElementById('result-file-input');
    if (!fileInput.files[0]) return showNotification('Please select a file.', 'warning');
    const formData = new FormData();
    formData.append('resultFile', fileInput.files[0]);
    try {
        const data = await apiCall(`/estimations/${estimationId}/result`, 'POST', formData, true);
        showNotification(data.message, 'success');
        closeModal();
        await loadEstimationsData();
    } catch (error) {}
}

async function deleteEstimation(estimationId) {
    if (!confirm('Are you sure you want to permanently delete this estimation request?')) return;
    try {
        const data = await apiCall(`/estimations/${estimationId}`, 'DELETE');
        showNotification(data.message, 'success');
        await loadEstimationsData();
    } catch (error) {}
}

// --- MESSAGE MANAGEMENT (UPDATED) ---
async function loadMessagesData() {
    const container = document.getElementById('messages-tab');
    showLoader(container);
    try {
        const { messages } = await apiCall('/messages');
        state.messages = messages;
        renderMessagesTab();
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load messages.</p><button class="btn" onclick="loadMessagesData()">Retry</button>`;
    }
}

function renderMessagesTab() {
    const container = document.getElementById('messages-tab');
    if (!container) return;
    const messages = state.messages;
    container.innerHTML = `
        <div class="section-header">
            <h3>All Messages (${messages.length})</h3>
            <div class="header-actions"><button class="btn" onclick="loadMessagesData()">Refresh</button><button class="btn btn-primary" onclick="exportData('messages')">Export</button></div>
        </div>
        <table>
            <thead><tr><th>From</th><th>Subject</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
                ${messages.map(message => `
                    <tr class="${message.status === 'unread' ? 'unread' : ''}">
                        <td>${message.senderName}<br><small>${message.senderEmail}</small></td>
                        <td>${message.subject}</td>
                        <td>${new Date(message.createdAt).toLocaleDateString()}</td>
                        <td>
                            <span class="status ${message.senderBlocked ? 'blocked' : message.status}">
                                ${message.senderBlocked ? 'Blocked' : message.status}
                            </span>
                        </td>
                        <td class="action-buttons">
                            <button class="btn btn-sm" onclick="viewMessage('${message._id}')"><i class="fas fa-eye"></i> View</button>
                            <button class="btn btn-sm btn-primary" onclick="replyToMessage('${message._id}')"><i class="fas fa-reply"></i> Reply</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteMessage('${message._id}')"><i class="fas fa-trash"></i> Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function viewMessage(messageId) {
    const message = state.messages.find(m => m._id === messageId);
    if (!message) return showNotification('Message not found.', 'error');

    if (message.status === 'unread') {
        markMessageAsRead(messageId);
    }

    const modalContent = `
        <div class="message-modal">
            <h3><i class="fas fa-envelope-open-text"></i> ${message.subject}</h3>
            <div class="message-details">
                <p><strong>From:</strong> ${message.senderName} (${message.senderEmail})</p>
                <p><strong>Date:</strong> ${new Date(message.createdAt).toLocaleString()}</p>
            </div>
            <div class="message-content">${message.content}</div>
            <div class="message-actions">
                <button class="btn btn-primary" onclick="replyToMessage('${message._id}')"><i class="fas fa-reply"></i> Reply to ${message.senderName}</button>
                <button class="btn ${message.senderBlocked ? 'btn-success' : 'btn-warning'}" onclick="showBlockUserModal(null, '${message.senderEmail}', ${message.senderBlocked})">
                    <i class="fas ${message.senderBlocked ? 'fa-unlock' : 'fa-ban'}"></i> ${message.senderBlocked ? 'Unblock Sender' : 'Block Sender'}
                </button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

async function markMessageAsRead(messageId) {
    try {
        await apiCall(`/messages/${messageId}/read`, 'PATCH');
        const message = state.messages.find(m => m._id === messageId);
        if (message) {
            message.status = 'read';
            renderMessagesTab(); // Re-render to remove 'unread' style
        }
    } catch (error) {
        console.error('Failed to mark message as read:', error);
    }
}

function replyToMessage(messageId) {
    const message = state.messages.find(m => m._id === messageId);
    if (!message) return showNotification('Message not found.', 'error');

    const modalContent = `
        <div class="modal-body">
            <h3>Reply to ${message.senderName}</h3>
            <div class="form-group">
                <label for="reply-subject">Subject:</label>
                <input type="text" id="reply-subject" value="Re: ${message.subject}">
            </div>
            <div class="form-group">
                <label for="reply-content">Message:</label>
                <textarea id="reply-content" rows="6" placeholder="Your reply..."></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="sendReply('${messageId}')">Send Reply</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

async function sendReply(messageId) {
    const subject = document.getElementById('reply-subject').value;
    const content = document.getElementById('reply-content').value;
    if (!content.trim()) return showNotification('Reply content cannot be empty.', 'warning');

    try {
        const data = await apiCall(`/messages/${messageId}/reply`, 'POST', {
            subject: sanitizeInput(subject),
            replyContent: sanitizeInput(content)
        });
        showNotification(data.message, 'success');
        closeModal();
        await loadMessagesData();
    } catch (error) {}
}

async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message? This cannot be undone.')) return;
    try {
        const data = await apiCall(`/messages/${messageId}`, 'DELETE');
        showNotification(data.message, 'success');
        await loadMessagesData();
    } catch (error) {}
}

// --- NEW: CONVERSATIONS MANAGEMENT ---
async function loadConversationsData() {
    const container = document.getElementById('conversations-tab');
    showLoader(container);
    try {
        const { conversations } = await apiCall('/conversations');
        state.conversations = conversations;
        renderConversationsTab();
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load conversations.</p><button class="btn" onclick="loadConversationsData()">Retry</button>`;
    }
}

function renderConversationsTab() {
    const container = document.getElementById('conversations-tab');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header">
            <h3>User Conversations (${state.conversations.length})</h3>
            <div class="header-actions">
                <input type="search" id="conversation-search" placeholder="Search by name or email..." oninput="searchConversationsDebounced()">
                <button class="btn" onclick="loadConversationsData()">Refresh</button>
            </div>
        </div>
        <div id="conversations-table-container">
            ${renderConversationsTable(state.conversations)}
        </div>
    `;
}

function renderConversationsTable(conversations) {
    if (conversations.length === 0) return '<p>No conversations found.</p>';
    return `
        <table>
            <thead><tr><th>Participants</th><th>Last Message</th><th>Total Messages</th><th>Updated At</th><th>Actions</th></tr></thead>
            <tbody>
                ${conversations.map(conv => `
                    <tr>
                        <td>${conv.participantNames}</td>
                        <td>${conv.lastMessage.substring(0, 50)}...</td>
                        <td>${conv.messageCount}</td>
                        <td>${new Date(conv.updatedAt).toLocaleString()}</td>
                        <td><button class="btn btn-sm" onclick="viewConversationMessages('${conv._id}')">View Messages</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

const searchConversationsDebounced = debounce(() => {
    const query = document.getElementById('conversation-search').value;
    if (query.length > 2) {
        searchConversations(query);
    } else if (query.length === 0) {
        renderConversationsTab(); // Reset to full list
    }
}, 500);

async function searchConversations(query) {
    const container = document.getElementById('conversations-table-container');
    container.innerHTML = `<div class="loader">Searching...</div>`;
    try {
        const { conversations } = await apiCall('/conversations/search', 'POST', { query });
        container.innerHTML = renderConversationsTable(conversations);
    } catch (error) {
        container.innerHTML = `<p class="error">Search failed.</p>`;
    }
}

async function viewConversationMessages(conversationId) {
    showModal('<div class="loader">Loading messages...</div>');
    try {
        const { conversation, messages } = await apiCall(`/conversations/${conversationId}/messages`);
        const modalContent = `
            <div class="conversation-modal">
                <h3>Conversation between ${conversation.participants.map(p => p.name).join(' and ')}</h3>
                <div class="message-list">
                    ${messages.map(msg => `
                        <div class="message-bubble ${msg.senderType === 'admin' ? 'admin' : 'user'}">
                            <strong>${msg.senderName}:</strong>
                            <p>${msg.text}</p>
                            <small>${new Date(msg.createdAt).toLocaleString()}</small>
                        </div>
                    `).join('')}
                    ${messages.length === 0 ? '<p>No messages in this conversation yet.</p>' : ''}
                </div>
            </div>
        `;
        showModal(modalContent);
    } catch (error) {
        closeModal();
    }
}

// --- ENHANCED SUPPORT SYSTEM MANAGEMENT ---
async function loadSupportMessagesData() {
    const container = document.getElementById('support-messages-tab');
    showLoader(container);
    try {
        const { messages, stats } = await apiCall('/support-messages');
        state.supportMessages = messages;
        renderSupportMessagesTab(messages, stats);
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load support messages.</p><button class="btn" onclick="loadSupportMessagesData()">Retry</button>`;
    }
}

// CORRECTED SUPPORT MESSAGES RENDERING
function renderSupportMessagesTab(messages, stats) {
    const container = document.getElementById('support-messages-tab');
    if (!container) return;
    container.innerHTML = `
        <div class="section-header support-header">
            <div class="header-content">
                <h3><i class="fas fa-life-ring"></i> Support Messages (${messages.length})</h3>
                <div class="support-stats-summary">
                    <span class="stat-item open">Open: ${stats.open || 0}</span>
                    <span class="stat-item progress">In Progress: ${stats.in_progress || 0}</span>
                    <span class="stat-item resolved">Resolved: ${stats.resolved || 0}</span>
                    <span class="stat-item critical">Critical: ${stats.critical || 0}</span>
                </div>
            </div>
            <div class="header-actions">
                <div class="support-filters">
                    <select id="support-status-filter" onchange="filterSupportMessages()">
                        <option value="all">All Status</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                    <select id="support-priority-filter" onchange="filterSupportMessages()">
                        <option value="all">All Priority</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
                <button class="btn" onclick="loadSupportMessagesData()">Refresh</button>
            </div>
        </div>
        <div class="support-messages-container">
            ${messages.length === 0 ?
                `<div class="empty-state">
                    <i class="fas fa-life-ring"></i>
                    <h3>No Support Messages</h3>
                    <p>Support requests from users will appear here.</p>
                </div>` :
                `<div class="support-messages-grid">
                    ${messages.map(msg => renderSupportMessageCard(msg)).join('')}
                </div>`
            }
        </div>
    `;
}


function renderSupportMessageCard(message) {
    const priorityClass = message.priority ? message.priority.toLowerCase() : 'medium';
    const statusClass = message.ticketStatus || 'open';
    const hasAttachments = message.attachments && message.attachments.length > 0;
    const responseCount = message.responses ? message.responses.length : 0;
    const timeAgo = getTimeAgo(message.createdAt);
    const lastUpdate = message.updatedAt ? getTimeAgo(message.updatedAt) : timeAgo;
    
    return `
        <div class="support-message-card ${priorityClass}-priority ${statusClass}-status" data-ticket-id="${message.ticketId}">
            <div class="support-card-header">
                <div class="support-title-section">
                    <h4 class="support-title">${message.subject || 'No Subject'}</h4>
                    <div class="support-meta">
                        <span class="ticket-id">Ticket: ${message.ticketId}</span>
                        <span class="priority-badge priority-${priorityClass}">
                            <i class="fas ${getPriorityIcon(message.priority)}"></i>
                            ${message.priority}
                        </span>
                        <span class="status-badge status-${statusClass}">
                            <i class="fas ${getStatusIcon(message.ticketStatus)}"></i>
                            ${formatStatus(message.ticketStatus)}
                        </span>
                    </div>
                </div>
                <div class="support-actions-quick">
                    <div class="time-info">
                        <small>Created: ${timeAgo}</small>
                        ${message.updatedAt && message.updatedAt !== message.createdAt ?
                            `<small>Updated: ${lastUpdate}</small>` : ''}
                    </div>
                </div>
            </div>
            <div class="support-card-body">
                <div class="user-info">
                    <div class="user-details">
                        <strong>${message.senderName}</strong>
                        <span class="user-type ${message.userType}">${message.userType}</span>
                        <span class="user-email">${message.senderEmail}</span>
                    </div>
                    ${message.assignedToName ?
                        `<div class="assigned-to">
                            <i class="fas fa-user-check"></i> 
                             Assigned to: <strong>${message.assignedToName}</strong>
                        </div>` :
                        `<div class="unassigned">
                            <i class="fas fa-user-times"></i> Unassigned
                        </div>`
                    }
                </div>
                <div class="message-preview">
                    <p>${truncateText(message.message, 150)}</p>
                </div>
                <div class="support-indicators">
                    ${hasAttachments ?
                        `<div class="indicator attachments">
                            <i class="fas fa-paperclip"></i>
                            ${message.attachments.length} file${message.attachments.length > 1 ? 's' : ''}
                        </div>` : ''
                    }
                    ${responseCount > 0 ?
                        `<div class="indicator responses">
                            <i class="fas fa-comments"></i>
                            ${responseCount} response${responseCount > 1 ? 's' : ''}
                        </div>` :
                        `<div class="indicator no-responses">
                            <i class="fas fa-comment-slash"></i>
                            No responses yet
                        </div>`
                    }
                </div>
            </div>
            <div class="support-card-actions">
                <button class="btn btn-sm btn-primary" onclick="viewSupportTicketDetails('${message.ticketId}')">
                    <i class="fas fa-eye"></i> View Details
                </button>
                <button class="btn btn-sm btn-success" onclick="respondToSupportTicket('${message.ticketId}')">
                    <i class="fas fa-reply"></i> Respond
                </button>
                <button class="btn btn-sm btn-outline" onclick="updateSupportTicketStatus('${message.ticketId}')">
                    <i class="fas fa-edit"></i> Update Status
                </button>
                <button class="btn btn-sm btn-warning" onclick="assignSupportTicket('${message.ticketId}')">
                    <i class="fas fa-user-plus"></i> Assign
                </button>
            </div>
        </div>
    `;
}

async function viewSupportTicketDetails(ticketId) {
    try {
        showModal('<div class="loader">Loading ticket details...</div>');
        const { ticket } = await apiCall(`/support-messages/${ticketId}`);
        const modalContent = `
            <div class="support-ticket-modal">
                <div class="modal-header support-modal-header">
                    <h3><i class="fas fa-ticket-alt"></i> Support Ticket Details</h3>
                    <div class="ticket-meta-header">
                        <span class="ticket-id">ID: ${ticket.ticketId}</span>
                        <span class="priority-badge priority-${ticket.priority.toLowerCase()}">
                            <i class="fas ${getPriorityIcon(ticket.priority)}"></i>
                            ${ticket.priority} Priority
                        </span>
                        <span class="status-badge status-${ticket.ticketStatus}">
                            <i class="fas ${getStatusIcon(ticket.ticketStatus)}"></i>
                            ${formatStatus(ticket.ticketStatus)}
                        </span>
                    </div>
                </div>
                <div class="ticket-details-content">
                    <div class="ticket-info-grid">
                        <div class="info-section">
                            <h4><i class="fas fa-user"></i> User Information</h4>
                            <div class="info-grid">
                                <div><label>Name:</label><span>${ticket.senderName}</span></div>
                                <div><label>Email:</label><span>${ticket.senderEmail}</span></div>
                                <div><label>Type:</label><span class="user-type ${ticket.userType}">${ticket.userType}</span></div>
                            </div>
                        </div>
                        <div class="info-section">
                            <h4><i class="fas fa-info-circle"></i> Ticket Information</h4>
                            <div class="info-grid">
                                <div><label>Subject:</label><span>${ticket.subject}</span></div>
                                <div><label>Created:</label><span>${formatAdminTimestamp(ticket.createdAt)}</span></div>
                                <div><label>Updated:</label><span>${formatAdminTimestamp(ticket.updatedAt)}</span></div>
                                ${ticket.assignedToName ? `<div><label>Assigned to:</label><span>${ticket.assignedToName}</span></div>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="ticket-message-section">
                        <h4><i class="fas fa-comment"></i> Original Message</h4>
                        <div class="ticket-message-content">
                            <p>${ticket.message}</p>
                        </div>
                    </div>
                    ${ticket.attachments && ticket.attachments.length > 0 ? `
                        <div class="ticket-attachments-section">
                            <h4><i class="fas fa-paperclip"></i> User Attachments (${ticket.attachments.length})</h4>
                            <div class="attachments-list">
                                ${ticket.attachments.map((attachment, index) => `
                                    <div class="attachment-item">
                                        <div class="attachment-info">
                                            <i class="fas ${getAttachmentIcon(attachment)}"></i>
                                            <div class="attachment-details">
                                                <span class="attachment-name">${attachment.originalName || attachment.filename || `Attachment ${index + 1}`}</span>
                                                <span class="attachment-meta">${attachment.size ? formatFileSize(attachment.size) : 'Unknown size'}</span>
                                            </div>
                                        </div>
                                        <div class="attachment-actions">
                                            <a href="${attachment.url}" target="_blank" class="btn btn-xs btn-outline">
                                                <i class="fas fa-external-link-alt"></i> View
                                            </a>
                                            <a href="${attachment.url}" download="${attachment.originalName || attachment.filename}" class="btn btn-xs btn-primary">
                                                <i class="fas fa-download"></i> Download
                                            </a>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="bulk-actions">
                                <button class="btn btn-outline btn-sm" onclick="downloadAllSupportAttachments('${ticketId}')">
                                    <i class="fas fa-download"></i> Download All Attachments
                                </button>
                            </div>
                        </div>
                    ` : ''}
                    ${ticket.responses && ticket.responses.length > 0 ? `
                        <div class="ticket-responses-section">
                            <h4><i class="fas fa-comments"></i> Conversation History (${ticket.responses.length})</h4>
                            <div class="responses-list">
                                ${ticket.responses.map(response => `
                                    <div class="response-item ${response.responderType}">
                                        <div class="response-header">
                                            <div class="responder-info">
                                                <strong>${response.responderName}</strong>
                                                <span class="responder-type ${response.responderType}">
                                                    <i class="fas ${response.responderType === 'admin' ? 'fa-user-shield' : 'fa-user'}"></i>
                                                    ${response.responderType === 'admin' ? 'Support Team' : 'User'}
                                                </span>
                                            </div>
                                            <span class="response-time">${formatAdminTimestamp(response.createdAt)}</span>
                                        </div>
                                        <div class="response-content">
                                            <p>${response.message}</p>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${ticket.internalNotes && ticket.internalNotes.length > 0 ? `
                        <div class="internal-notes-section">
                            <h4><i class="fas fa-sticky-note"></i> Internal Notes (Admin Only)</h4>
                            <div class="internal-notes-list">
                                ${ticket.internalNotes.map(note => `
                                    <div class="internal-note">
                                        <div class="note-header">
                                            <strong>${note.adminName}</strong>
                                            <span class="note-time">${formatAdminTimestamp(note.createdAt)}</span>
                                        </div>
                                        <div class="note-content">
                                            <p>${note.note}</p>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="ticket-actions-footer">
                    <button class="btn btn-success" onclick="closeModal(); respondToSupportTicket('${ticketId}')">
                        <i class="fas fa-reply"></i> Respond to User
                    </button>
                    <button class="btn btn-primary" onclick="closeModal(); updateSupportTicketStatus('${ticketId}')">
                        <i class="fas fa-edit"></i> Update Status
                    </button>
                    <button class="btn btn-warning" onclick="closeModal(); assignSupportTicket('${ticketId}')">
                        <i class="fas fa-user-plus"></i> Assign
                    </button>
                    <button class="btn btn-outline" onclick="closeModal(); addInternalNote('${ticketId}')">
                        <i class="fas fa-sticky-note"></i> Add Internal Note
                    </button>
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `;
        showModal(modalContent);
    } catch (error) {
        closeModal();
        showNotification('Failed to load ticket details.', 'error');
    }
}

async function downloadAllSupportAttachments(ticketId) {
    try {
        const { ticket } = await apiCall(`/support-messages/${ticketId}`);
        const attachments = ticket.attachments || [];
        
        if (attachments.length === 0) {
            showNotification('No attachments to download.', 'warning');
            return;
        }
        
        showNotification(`Downloading ${attachments.length} files...`, 'info');
        
        attachments.forEach((attachment, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = attachment.url;
                link.download = attachment.originalName || attachment.filename || `support_file_${index + 1}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 500);
        });
    } catch (error) {
        showNotification('Failed to download attachments.', 'error');
    }
}

function respondToSupportTicket(ticketId) {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-reply"></i> Respond to Support Ticket</h3>
            <p>Ticket ID: <strong>${ticketId}</strong></p>
            <form id="support-response-form">
                <div class="form-group">
                    <label for="admin-response">Response Message:</label>
                    <textarea id="admin-response" rows="6" placeholder="Your response to the user..." required></textarea>
                    <small>This message will be sent to the user and added to their ticket history.</small>
                </div>
                <div class="form-group">
                    <label for="internal-note">Internal Note (Optional):</label>
                    <textarea id="internal-note" rows="3" placeholder="Admin-only notes..."></textarea>
                    <small>Internal notes are only visible to admin staff.</small>
                </div>
                <div class="form-group">
                    <label for="new-status">Update Status:</label>
                    <select id="new-status">
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="open">Keep Open</option>
                        <option value="closed">Close Ticket</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitSupportResponse('${ticketId}')">
                        <i class="fas fa-paper-plane"></i> Send Response
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

// CORRECTED SUPPORT RESPONSE SUBMISSION
async function submitSupportResponse(ticketId) {
    const adminResponse = document.getElementById('admin-response').value.trim();
    const internalNote = document.getElementById('internal-note').value.trim();
    const newStatus = document.getElementById('new-status').value;
    
    if (!adminResponse) {
        showNotification('Response message is required.', 'warning');
        return;
    }
    
    try {
        const submitBtn = document.querySelector('#support-response-form .btn-primary');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        
        await apiCall(`/support-messages/${ticketId}/respond`, 'POST', {
            adminResponse: adminResponse,
            internalNote: internalNote,
            status: newStatus
        });
        
        showNotification('Response sent successfully! User has been notified.', 'success');
        closeModal();
        
        // Refresh the support messages list and dashboard stats
        await loadSupportMessagesData();
        await loadDashboardStats();
        
    } catch (error) {
        console.error('Error submitting support response:', error);
        showNotification('Failed to send response. Please try again.', 'error');
        const submitBtn = document.querySelector('#support-response-form .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Response';
        }
    }
}


function updateSupportTicketStatus(ticketId) {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-edit"></i> Update Ticket Status</h3>
            <p>Ticket ID: <strong>${ticketId}</strong></p>
            <form id="status-update-form">
                <div class="form-group">
                    <label for="ticket-status">New Status:</label>
                    <select id="ticket-status" required>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="status-note">Note (Optional):</label>
                    <textarea id="status-note" rows="3" placeholder="Reason for status change..."></textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="notify-user"> Notify user of status change
                    </label>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitStatusUpdate('${ticketId}')">
                        <i class="fas fa-save"></i> Update Status
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

// CORRECTED STATUS UPDATE SUBMISSION
async function submitStatusUpdate(ticketId) {
    const newStatus = document.getElementById('ticket-status').value;
    const note = document.getElementById('status-note').value.trim();
    const notifyUser = document.getElementById('notify-user').checked;
    
    try {
        const submitBtn = document.querySelector('#status-update-form .btn-primary');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        
        await apiCall(`/support-messages/${ticketId}/status`, 'PATCH', {
            status: newStatus,
            internalNote: note,
            notifyUser: notifyUser
        });
        
        showNotification(`Ticket status updated to ${formatStatus(newStatus)}!`, 'success');
        closeModal();
        
        await loadSupportMessagesData();
        await loadDashboardStats();
        
    } catch (error) {
        console.error('Error updating status:', error);
        showNotification('Failed to update status. Please try again.', 'error');
        const submitBtn = document.querySelector('#status-update-form .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Status';
        }
    }
}


function assignSupportTicket(ticketId) {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-user-plus"></i> Assign Ticket</h3>
            <p>Ticket ID: <strong>${ticketId}</strong></p>
            <form id="assign-ticket-form">
                <div class="form-group">
                    <label for="assignee-name">Assign to Admin:</label>
                    <input type="text" id="assignee-name" placeholder="Enter admin name" required>
                    <small>Enter the name of the admin to assign this ticket to.</small>
                </div>
                <div class="form-group">
                    <label for="assign-note">Assignment Note (Optional):</label>
                    <textarea id="assign-note" rows="3" placeholder="Why are you assigning this ticket?"></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitTicketAssignment('${ticketId}')">
                        <i class="fas fa-user-check"></i> Assign Ticket
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

async function submitTicketAssignment(ticketId) {
    const assigneeName = document.getElementById('assignee-name').value.trim();
    const assignNote = document.getElementById('assign-note').value.trim();
    
    if (!assigneeName) {
        showNotification('Assignee name is required.', 'warning');
        return;
    }
    
    try {
        const submitBtn = document.querySelector('#assign-ticket-form .btn-primary');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="btn-spinner"></div> Assigning...';
        
        const assigneeId = 'admin_' + assigneeName.toLowerCase().replace(/\s+/g, '_');
        
        await apiCall(`/support-messages/${ticketId}/assign`, 'POST', {
            assignToId: assigneeId,
            assignToName: assigneeName,
            note: assignNote
        });
        
        showNotification(`Ticket assigned to ${assigneeName} successfully!`, 'success');
        closeModal();
        loadSupportMessagesData();
        
    } catch (error) {
        showNotification('Failed to assign ticket. Please try again.', 'error');
        const submitBtn = document.querySelector('#assign-ticket-form .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-user-check"></i> Assign Ticket';
        }
    }
}

function addInternalNote(ticketId) {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-sticky-note"></i> Add Internal Note</h3>
            <p>Ticket ID: <strong>${ticketId}</strong></p>
            <form id="internal-note-form">
                <div class="form-group">
                    <label for="internal-note-text">Internal Note:</label>
                    <textarea id="internal-note-text" rows="4" placeholder="Add admin-only note..." required></textarea>
                    <small>This note will only be visible to admin staff.</small>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitInternalNote('${ticketId}')">
                        <i class="fas fa-save"></i> Save Note
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

// CORRECTED INTERNAL NOTE SUBMISSION
async function submitInternalNote(ticketId) {
    const noteText = document.getElementById('internal-note-text').value.trim();
    
    if (!noteText) {
        showNotification('Note text is required.', 'warning');
        return;
    }
    
    try {
        const submitBtn = document.querySelector('#internal-note-form .btn-primary');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        await apiCall(`/support-messages/${ticketId}/internal-note`, 'POST', {
            note: noteText
        });
        
        showNotification('Internal note added successfully!', 'success');
        closeModal();
        
        // Refresh the support messages list to show updated ticket info implicitly
        await loadSupportMessagesData();
        
    } catch (error) {
        console.error('Error adding internal note:', error);
        showNotification('Failed to add internal note. Please try again.', 'error');
        const submitBtn = document.querySelector('#internal-note-form .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Note';
        }
    }
}


async function filterSupportMessages() {
    const statusFilter = document.getElementById('support-status-filter').value;
    const priorityFilter = document.getElementById('support-priority-filter').value;
    const container = document.getElementById('support-messages-tab');
    showLoader(container);
    
    try {
        const queryParams = new URLSearchParams();
        if (statusFilter !== 'all') queryParams.set('status', statusFilter);
        if (priorityFilter !== 'all') queryParams.set('priority', priorityFilter);
        
        const endpoint = `/support-messages?${queryParams.toString()}`;
        const { messages, stats } = await apiCall(endpoint);
        state.supportMessages = messages;
        renderSupportMessagesTab(messages, stats);
    } catch (error) {
        showNotification('Failed to filter support messages.', 'error');
        loadSupportMessagesData(); // Fallback to reload all
    }
}

// Utility functions for support system
function getAttachmentIcon(attachment) {
    const fileName = attachment.originalName || attachment.filename || '';
    const ext = fileName.toLowerCase().split('.').pop();
    
    const iconMap = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'txt': 'fa-file-alt',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image'
    };
    
    return iconMap[ext] || 'fa-file';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// CORRECTED TIMESTAMP FORMATTING FUNCTION
function formatAdminTimestamp(date) {
    try {
        if (!date) return 'Unknown time';
        
        let dateObj;
        
        // Handle different date formats
        if (typeof date === 'string') {
            // Handle ISO string dates
            dateObj = new Date(date);
        } else if (date instanceof Date) {
            dateObj = date;
        } else if (date && typeof date === 'object') {
            // Handle Firestore timestamps
            if (date.seconds) {
                dateObj = new Date(date.seconds * 1000);
            } else if (date._seconds) {
                dateObj = new Date(date._seconds * 1000);
            } else {
                return 'Invalid date';
            }
        } else {
            return 'Invalid date';
        }
        
        // Validate the date
        if (isNaN(dateObj.getTime())) {
            console.warn('Invalid date object:', date);
            return 'Invalid date';
        }
        
        // Format the date
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        
        return dateObj.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('Admin timestamp formatting error:', error, 'Input:', date);
        return 'Invalid date';
    }
}


// Enhanced utility functions (UPDATE EXISTING ONES)
function getPriorityIcon(priority) {
    const icons = {
        'Critical': 'fa-exclamation-triangle',
        'High': 'fa-arrow-up',
        'Medium': 'fa-minus',
        'Low': 'fa-arrow-down'
    };
    return icons[priority] || 'fa-minus';
}

function getStatusIcon(status) {
    const icons = {
        'open': 'fa-envelope-open',
        'in_progress': 'fa-cog fa-spin',
        'resolved': 'fa-check-circle',
        'closed': 'fa-times-circle'
    };
    return icons[status] || 'fa-envelope';
}

function formatStatus(status) {
    const formatted = {
        'open': 'Open',
        'in_progress': 'In Progress',
        'resolved': 'Resolved',
        'closed': 'Closed'
    };
    return formatted[status] || 'Unknown';
}

function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
}

// CORRECTED TIME AGO FUNCTION
function getTimeAgo(dateString) {
    if (!dateString) return 'some time ago';
    
    let date;
    try {
        // Handle different date formats
        if (typeof dateString === 'string') {
            date = new Date(dateString);
        } else if (dateString instanceof Date) {
            date = dateString;
        } else if (dateString && typeof dateString === 'object') {
            // Handle Firestore timestamps
            if (dateString.seconds) {
                date = new Date(dateString.seconds * 1000);
            } else if (dateString._seconds) {
                date = new Date(dateString._seconds * 1000);
            } else {
                return 'some time ago';
            }
        } else {
            return 'some time ago';
        }
        
        if (isNaN(date.getTime())) {
            console.warn('Invalid date in getTimeAgo:', dateString);
            return 'some time ago';
        }
        
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
        if (seconds < 2592000) return Math.floor(seconds / 86400) + ' days ago';
        if (seconds < 31536000) return Math.floor(seconds / 2592000) + ' months ago';
        
        return Math.floor(seconds / 31536000) + ' years ago';
    } catch (error) {
        console.error('Error in getTimeAgo:', error, 'Input:', dateString);
        return 'some time ago';
    }
}


// --- GENERIC TABLES for Jobs, Quotes (ENHANCED for JOBS & QUOTES) ---
async function loadGenericData(type) {
    const container = document.getElementById(`${type}-tab`);
    showLoader(container);
    try {
        const data = await apiCall(`/${type}`);
        state[type] = data[type];
        renderGenericTab(type);
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load ${type}.</p><button class="btn" onclick="loadGenericData('${type}')">Retry</button>`;
    }
}

// ** UPDATED/ENHANCED FUNCTION **
function renderGenericTab(type) {
    const container = document.getElementById(`${type}-tab`);
    if (!container) return;
    const items = state[type];

    if (type === 'jobs') {
        container.innerHTML = `
            <div class="section-header">
                <h3>All Jobs (${items.length})</h3>
                <div class="header-actions">
                    <button class="btn" onclick="loadGenericData('jobs')">Refresh</button>
                    <button class="btn btn-primary" onclick="exportData('jobs')">Export</button>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Client</th>
                        <th>Budget</th>
                        <th>Status</th>
                        <th>Files</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(job => `
                        <tr>
                            <td>
                                <div class="job-title-cell">
                                    <strong>${job.title || 'Untitled Job'}</strong>
                                    ${job.deadline ? `<br><small>Deadline: ${new Date(job.deadline).toLocaleDateString()}</small>` : ''}
                                </div>
                            </td>
                            <td>
                                <div class="client-info">
                                    ${job.posterName || 'N/A'}<br>
                                    <small>${job.posterEmail || 'N/A'}</small>
                                </div>
                            </td>
                            <td><span class="budget-amount">${job.budget || 'N/A'}</span></td>
                            <td><span class="status ${job.status || 'unknown'}">${job.status || 'Unknown'}</span></td>
                            <td>
                                ${getJobFilesCell(job)}
                            </td>
                            <td class="action-buttons">
                                <button class="btn btn-sm" onclick="viewJobDetails('${job._id}')">View Details</button>
                                <button class="btn btn-sm btn-danger" onclick="confirmDeleteJob('${job._id}')">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    } else if (type === 'quotes') {
        // ** ENHANCED ** - Updated quotes rendering with file support
        container.innerHTML = `
            <div class="section-header">
                <h3>All Quotes (${items.length})</h3>
                <div class="header-actions">
                    <button class="btn" onclick="loadGenericData('quotes')">Refresh</button>
                    <button class="btn btn-primary" onclick="exportData('quotes')">Export</button>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Quote Info</th>
                        <th>Designer</th>
                        <th>Job</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Files</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(quote => `
                        <tr>
                            <td>
                                <div class="quote-info-cell">
                                    <strong>Quote #${quote._id.slice(-6)}</strong>
                                    ${quote.timeline ? `<br><small>Timeline: ${quote.timeline} days</small>` : ''}
                                    ${quote.createdAt ? `<br><small>Submitted: ${new Date(quote.createdAt).toLocaleDateString()}</small>` : ''}
                                </div>
                            </td>
                            <td>
                                <div class="designer-info">
                                    ${quote.designerName || 'N/A'}<br>
                                    <small>${quote.userEmail || 'N/A'}</small>
                                </div>
                            </td>
                            <td>
                                <div class="job-info">
                                    <strong>${quote.jobTitle || 'Unknown Job'}</strong>
                                    ${quote.job ? `<br><small>Client: ${quote.job.posterName || 'N/A'}</small>` : ''}
                                </div>
                            </td>
                            <td>
                                <span class="quote-amount">$${quote.quoteAmount || 'N/A'}</span>
                            </td>
                            <td>
                                <span class="status ${quote.status || 'unknown'}">${quote.status || 'Unknown'}</span>
                            </td>
                            <td>
                                ${getQuoteFilesCell(quote)}
                            </td>
                            <td class="action-buttons">
                                <button class="btn btn-sm" onclick="viewQuoteDetails('${quote._id}')">View Details</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteGenericItem('quotes', '${quote._id}')">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
    }
}

// ** NEW HELPER FUNCTIONS FOR JOBS **
function getJobFilesCell(job) {
    const attachments = job.attachments || [];
    const attachment = job.attachment; // Legacy single attachment

    let totalFiles = 0;
    if (attachments.length > 0) totalFiles += attachments.length;
    if (attachment) totalFiles += 1;

    if (totalFiles === 0) {
        return '<span class="no-files">No files</span>';
    }

    return `
        <div class="files-summary">
            <i class="fas fa-file-pdf"></i>
            <span class="file-count">${totalFiles} file${totalFiles > 1 ? 's' : ''}</span>
            <button class="btn btn-xs" onclick="viewJobFiles('${job._id}')">View</button>
        </div>
    `;
}

function viewJobFiles(jobId) {
    const job = state.jobs.find(j => j._id === jobId);
    if (!job) return showNotification('Job not found.', 'error');

    const attachments = job.attachments || [];
    const legacyAttachment = job.attachment;

    let allFiles = [...attachments];
    if (legacyAttachment) {
        allFiles.push({
            url: legacyAttachment,
            name: 'Project Attachment',
            size: null,
            uploadedAt: job.createdAt
        });
    }

    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-folder-open"></i> Project Files - ${job.title}</h3>
            <div class="job-info-summary">
                <p><strong>Client:</strong> ${job.posterName || 'N/A'}</p>
                <p><strong>Budget:</strong> ${job.budget || 'N/A'}</p>
                <p><strong>Status:</strong> <span class="status ${job.status}">${job.status}</span></p>
            </div>
            ${allFiles.length > 0 ? `
                <div class="files-grid">
                    ${allFiles.map((file, index) => {
                        const fileName = file.originalname || file.filename || file.name || `Attachment ${index + 1}`;
                        const fileSize = file.size ? (file.size / (1024 * 1024)).toFixed(2) + 'MB' : 'Unknown size';
                        const uploadDate = file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'Unknown date';
                        
                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas fa-file-pdf"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size">${fileSize}</span>
                                        <span class="file-date">${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </a>
                                    <a href="${file.url}" download="${fileName}" class="btn btn-sm btn-primary">
                                        <i class="fas fa-download"></i> Download
                                    </a>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="bulk-actions">
                    <button class="btn btn-outline" onclick="downloadAllJobFiles('${jobId}')">
                        <i class="fas fa-download"></i> Download All Files
                    </button>
                </div>
            ` : `
                <div class="empty-state">
                    <i class="fas fa-file-pdf"></i>
                    <p>No files attached to this project.</p>
                </div>
            `}
        </div>
    `;
    showModal(modalContent);
}

function viewJobDetails(jobId) {
    const job = state.jobs.find(j => j._id === jobId);
    if (!job) return showNotification('Job not found.', 'error');

    const attachments = job.attachments || [];
    const legacyAttachment = job.attachment;
    const totalFiles = attachments.length + (legacyAttachment ? 1 : 0);

    const modalContent = `
        <div class="job-details-modal">
            <h3><i class="fas fa-briefcase"></i> Job Details</h3>
            <div class="job-details-grid">
                <div class="detail-section">
                    <h4>Basic Information</h4>
                    <div class="info-grid">
                        <div><label>Title:</label><span>${job.title || 'N/A'}</span></div>
                        <div><label>Client:</label><span>${job.posterName || 'N/A'}</span></div>
                        <div><label>Email:</label><span>${job.posterEmail || 'N/A'}</span></div>
                        <div><label>Budget:</label><span>${job.budget || 'N/A'}</span></div>
                        <div><label>Status:</label><span class="status ${job.status}">${job.status}</span></div>
                        ${job.deadline ? `<div><label>Deadline:</label><span>${new Date(job.deadline).toLocaleDateString()}</span></div>` : ''}
                        ${job.skills ? `<div><label>Skills:</label><span>${job.skills}</span></div>` : ''}
                    </div>
                </div>
                                
                <div class="detail-section">
                    <h4>Description</h4>
                    <p class="job-description">${job.description || 'No description provided.'}</p>
                </div>
                                
                ${job.link ? `
                    <div class="detail-section">
                        <h4>Project Link</h4>
                        <a href="${job.link}" target="_blank" class="external-link">
                            <i class="fas fa-external-link-alt"></i> ${job.link}
                        </a>
                    </div>
                ` : ''}
                                
                <div class="detail-section">
                    <h4>Attachments (${totalFiles})</h4>
                    ${totalFiles > 0 ? `
                        <div class="attachments-summary">
                            <p>${totalFiles} file(s) attached to this project.</p>
                            <button class="btn btn-outline" onclick="viewJobFiles('${jobId}')">
                                <i class="fas fa-folder-open"></i> View All Files
                            </button>
                        </div>
                    ` : `
                        <p class="no-attachments">No files attached to this project.</p>
                    `}
                </div>
                                
                ${job.quotesCount ? `
                    <div class="detail-section">
                        <h4>Quotes Received</h4>
                        <p>${job.quotesCount} quote(s) submitted for this project.</p>
                    </div>
                ` : ''}
            </div>
                        
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                <button class="btn btn-danger" onclick="confirmDeleteJob('${jobId}')">
                    <i class="fas fa-trash"></i> Delete Job
                </button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

function downloadAllJobFiles(jobId) {
    const job = state.jobs.find(j => j._id === jobId);
    if (!job) return showNotification('Job not found.', 'error');

    const attachments = job.attachments || [];
    const legacyAttachment = job.attachment;

    let allFiles = [...attachments];
    if (legacyAttachment) {
        allFiles.push({
            url: legacyAttachment,
            name: 'project_attachment.pdf'
        });
    }

    if (allFiles.length === 0) {
        return showNotification('No files to download.', 'warning');
    }

    showNotification(`Downloading ${allFiles.length} files...`, 'info');

    allFiles.forEach((file, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = file.url;
            link.download = file.originalname || file.filename || file.name || `job_file_${index + 1}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 500);
    });
}

function confirmDeleteJob(jobId) {
    if (confirm('Are you sure you want to delete this job? This will also delete all associated quotes and files. This action cannot be undone.')) {
        deleteGenericItem('jobs', jobId);
        closeModal();
    }
}

// ** NEW HELPER FUNCTIONS FOR QUOTE FILES **
function getQuoteFilesCell(quote) {
    const attachments = quote.attachments || [];
    if (attachments.length === 0) {
        return '<span class="no-files">No files</span>';
    }
    return `
        <div class="files-summary">
            <i class="fas fa-file-pdf"></i>
            <span class="file-count">${attachments.length} file${attachments.length > 1 ? 's' : ''}</span>
            <button class="btn btn-xs" onclick="viewQuoteFiles('${quote._id}')">View</button>
        </div>
    `;
}

// ** NEW FUNCTION ** - View quote files modal
function viewQuoteFiles(quoteId) {
    const quote = state.quotes.find(q => q._id === quoteId);
    if (!quote) return showNotification('Quote not found.', 'error');
    const attachments = quote.attachments || [];
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-folder-open"></i> Quote Attachments</h3>
            <div class="quote-info-summary">
                <p><strong>Quote for:</strong> ${quote.jobTitle || 'Unknown Job'}</p>
                <p><strong>Designer:</strong> ${quote.designerName || 'N/A'}</p>
                <p><strong>Amount:</strong> $${quote.quoteAmount || 'N/A'}</p>
                <p><strong>Status:</strong> <span class="status ${quote.status}">${quote.status}</span></p>
            </div>
            ${attachments.length > 0 ? `
                <div class="files-grid">
                    ${attachments.map((file, index) => {
                        const fileName = file.name || file.originalname || `Attachment ${index + 1}`;
                        const fileSize = file.size ? (file.size / (1024 * 1024)).toFixed(2) + 'MB' : 'Unknown size';
                        const uploadDate = file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'Unknown date';
                        const fileIcon = getQuoteFileIcon(fileName);
                        
                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas ${fileIcon}"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size">${fileSize}</span>
                                        <span class="file-date">${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </a>
                                    <a href="${file.url}" download="${fileName}" class="btn btn-sm btn-primary">
                                        <i class="fas fa-download"></i> Download
                                    </a>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="bulk-actions">
                    <button class="btn btn-outline" onclick="downloadAllQuoteFiles('${quoteId}')">
                        <i class="fas fa-download"></i> Download All Files
                    </button>
                </div>
            ` : `
                <div class="empty-state">
                    <i class="fas fa-file-pdf"></i>
                    <p>No files attached to this quote.</p>
                </div>
            `}
        </div>
    `;
    showModal(modalContent);
}

// ** NEW FUNCTION ** - View quote details with all information
function viewQuoteDetails(quoteId) {
    const quote = state.quotes.find(q => q._id === quoteId);
    if (!quote) return showNotification('Quote not found.', 'error');
    const attachments = quote.attachments || [];
    const modalContent = `
        <div class="quote-details-modal">
            <h3><i class="fas fa-file-invoice-dollar"></i> Quote Details</h3>
            <div class="quote-details-grid">
                <div class="detail-section">
                    <h4>Quote Information</h4>
                    <div class="info-grid">
                        <div><label>Quote ID:</label><span>${quote._id.slice(-6)}</span></div>
                        <div><label>Amount:</label><span>$${quote.quoteAmount || 'N/A'}</span></div>
                        <div><label>Timeline:</label><span>${quote.timeline || 'N/A'} days</span></div>
                        <div><label>Status:</label><span class="status ${quote.status}">${quote.status}</span></div>
                        <div><label>Submitted:</label><span>${quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A'}</span></div>
                        ${quote.approvedAt ? `<div><label>Approved:</label><span>${new Date(quote.approvedAt).toLocaleDateString()}</span></div>` : ''}
                        ${quote.rejectedAt ? `<div><label>Rejected:</label><span>${new Date(quote.rejectedAt).toLocaleDateString()}</span></div>` : ''}
                    </div>
                </div>
                                
                <div class="detail-section">
                    <h4>Designer Information</h4>
                    <div class="info-grid">
                        <div><label>Name:</label><span>${quote.designerName || 'N/A'}</span></div>
                        <div><label>Email:</label><span>${quote.userEmail || 'N/A'}</span></div>
                        ${quote.designer ? `
                            ${quote.designer.phone ? `<div><label>Phone:</label><span>${quote.designer.phone}</span></div>` : ''}
                            ${quote.designer.company ? `<div><label>Company:</label><span>${quote.designer.company}</span></div>` : ''}
                        ` : ''}
                    </div>
                </div>
                                
                <div class="detail-section">
                    <h4>Job Information</h4>
                    <div class="info-grid">
                        <div><label>Job Title:</label><span>${quote.jobTitle || 'N/A'}</span></div>
                        ${quote.job ? `
                            <div><label>Job Budget:</label><span>${quote.job.budget || 'N/A'}</span></div>
                            <div><label>Client:</label><span>${quote.job.posterName || 'N/A'}</span></div>
                            <div><label>Job Status:</label><span class="status ${quote.job.status}">${quote.job.status}</span></div>
                        ` : ''}
                    </div>
                </div>
                                
                <div class="detail-section">
                    <h4>Description</h4>
                    <p class="quote-description">${quote.description || 'No description provided.'}</p>
                </div>
                                
                <div class="detail-section">
                    <h4>Attachments (${attachments.length})</h4>
                    ${attachments.length > 0 ? `
                        <div class="attachments-summary">
                            <p>${attachments.length} file(s) attached to this quote.</p>
                            <button class="btn btn-outline" onclick="viewQuoteFiles('${quoteId}')">
                                <i class="fas fa-folder-open"></i> View All Files
                            </button>
                        </div>
                    ` : `
                        <p class="no-attachments">No files attached to this quote.</p>
                    `}
                </div>
            </div>
                        
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                <button class="btn btn-danger" onclick="confirmDeleteQuote('${quoteId}')">
                    <i class="fas fa-trash"></i> Delete Quote
                </button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

// ** NEW FUNCTION ** - Download all quote files
function downloadAllQuoteFiles(quoteId) {
    const quote = state.quotes.find(q => q._id === quoteId);
    if (!quote) return showNotification('Quote not found.', 'error');
    const attachments = quote.attachments || [];
    if (attachments.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    showNotification(`Downloading ${attachments.length} files...`, 'info');
    attachments.forEach((file, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = file.url || file.downloadURL;
            link.download = file.name || file.originalname || `quote_file_${index + 1}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 500);
    });
}

// ** NEW FUNCTION ** - Get appropriate icon for quote files
function getQuoteFileIcon(fileName) {
    if (!fileName) return 'fa-file';
    const ext = fileName.toLowerCase().split('.').pop();
    const iconMap = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'xls': 'fa-file-excel',
        'xlsx': 'fa-file-excel',
        'txt': 'fa-file-alt',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'dwg': 'fa-drafting-compass'
    };
    return iconMap[ext] || 'fa-file';
}

// ** NEW FUNCTION ** - Confirm quote deletion
function confirmDeleteQuote(quoteId) {
    if (confirm('Are you sure you want to delete this quote? This action cannot be undone.')) {
        deleteGenericItem('quotes', quoteId);
        closeModal();
    }
}


async function deleteGenericItem(type, id) {
    if (!confirm(`Are you sure you want to delete this ${type.slice(0, -1)}?`)) return;
    try {
        const data = await apiCall(`/${type}/${id}`, 'DELETE');
        showNotification(data.message, 'success');
        await loadGenericData(type);
    } catch (error) {}
}

// --- EXPORT FUNCTIONALITY ---
// Note: The backend may need an /export route for this to work.
async function exportData(dataType, format = 'csv') {
    try {
        showNotification('Preparing export...', 'info');
        const response = await fetch(`${API_BASE_URL}/api/admin/export/${dataType}?format=${format}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error('Export failed. Endpoint may be missing on the backend.');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${dataType}_export_${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showNotification('Export completed successfully!', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// --- REAL-TIME UPDATES ---
// ENHANCED NOTIFICATION HANDLING FOR REAL-TIME UPDATES
function initializeRealTimeUpdates() {
    // Check for new notifications periodically
    setInterval(async () => {
        try {
            const currentActiveTab = document.querySelector('.tab-content.active')?.id;
            
            // Refresh active tab data periodically
            if (currentActiveTab === 'support-messages-tab') {
                // Refresh support messages every 30 seconds if on that tab
                loadSupportMessagesData();
            } else if (currentActiveTab === 'dashboard-tab') {
                // Refresh dashboard stats every minute
                loadDashboardStats();
            }
        } catch (error) {
            console.log('Error in real-time updates:', error);
        }
    }, 30000); // Check every 30 seconds
    
    // WebSocket connection (if available)
    if (typeof WebSocket !== 'undefined') {
        try {
            const ws = new WebSocket(`wss://steelconnect-backend.onrender.com/admin-updates`);
            
            ws.onmessage = (event) => {
                try {
                    const update = JSON.parse(event.data);
                    switch (update.type) {
                        case 'new_support_ticket':
                            showAdvancedNotification(
                                'New support ticket received',
                                 'info',
                                 5000,
                                 [{ text: 'View', callback: () => showTab('support-messages') }]
                            );
                            // Refresh support data if on support tab
                            if (document.getElementById('support-messages-tab')?.classList.contains('active')) {
                                loadSupportMessagesData();
                            }
                            // Always refresh dashboard
                            loadDashboardStats();
                            break;
                        case 'support_response':
                            showAdvancedNotification(
                                'Support ticket updated',
                                 'success',
                                 3000
                            );
                            break;
                        case 'new_message':
                            showAdvancedNotification(
                                'New message received',
                                 'info',
                                 0,
                                 [{ text: 'View', callback: () => showTab('messages') }]
                            );
                            break;
                        case 'profile_review':
                            showAdvancedNotification(
                                'New profile review pending',
                                 'warning',
                                 0,
                                 [{ text: 'Review', callback: () => showTab('profile-reviews') }]
                            );
                            break;
                        case 'estimation_request':
                            showAdvancedNotification(
                                'New estimation request',
                                 'info',
                                 0,
                                 [{ text: 'View', callback: () => showTab('estimations') }]
                            );
                            break;
                    }
                } catch (parseError) {
                    console.log('Error parsing WebSocket message:', parseError);
                }
            };
            
            ws.onclose = () => {
                console.log('WebSocket connection closed, attempting to reconnect...');
                setTimeout(initializeRealTimeUpdates, 5000);
            };
            
            ws.onerror = (error) => {
                console.log('WebSocket connection failed:', error);
            };
            
        } catch (error) {
            console.log('WebSocket not available:', error);
        }
    }
}


// --- SHARED UTILITY FUNCTIONS ---
function getFileIcon(mimeType, fileName) {
    if (!mimeType && fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        if (extension === 'pdf') return 'fa-file-pdf';
    }
    if (mimeType && mimeType.includes('pdf')) return 'fa-file-pdf';
    if (mimeType && mimeType.includes('image')) return 'fa-file-image';
    if (mimeType && (mimeType.includes('word') || mimeType.includes('document'))) return 'fa-file-word';
    if (mimeType && (mimeType.includes('excel') || mimeType.includes('spreadsheet'))) return 'fa-file-excel';
    return 'fa-file';
}

// Add to admin.js - Admin Panel Updates for Analysis Management
// Add Analysis Management to Admin Dashboard
function renderAnalysisManagement() {
    const container = document.getElementById('analytics-management-tab');
    if (!container) return;
    
    container.innerHTML = `
        <div class="analysis-management-section">
            <div class="section-header">
                <h3><i class="fas fa-chart-line"></i> Analysis Portal Management</h3>
                <button class="btn btn-primary" onclick="showAddReportModal()">
                    <i class="fas fa-plus"></i> Add Report URL
                </button>
            </div>
            
            <div id="contractor-analysis-list" class="analysis-list">
                <div class="loading-spinner">Loading contractor analysis configurations...</div>
            </div>
        </div>
    `;
    
    loadContractorAnalysisData();
}

// Load contractor analysis configurations
async function loadContractorAnalysisData() {
    const container = document.getElementById('contractor-analysis-list');
    if (!container) return;
    
    try {
        const response = await apiCall('/analysis/contractors', 'GET');
        
        if (response.success && response.contractors) {
            const contractors = response.contractors;
            
            if (contractors.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-chart-area"></i>
                        <h3>No Analysis Configurations</h3>
                        <p>Contractors haven't set up analysis portals yet</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = `
                <table class="analysis-table">
                    <thead>
                        <tr>
                            <th>Contractor</th>
                            <th>Data Type</th>
                            <th>Frequency</th>
                            <th>Google Sheet</th>
                            <th>Vercel Report</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${contractors.map(contractor => `
                            <tr>
                                <td>
                                    <div class="contractor-info">
                                        <strong>${contractor.name}</strong>
                                        <small>${contractor.email}</small>
                                    </div>
                                </td>
                                <td><span class="badge">${contractor.dataType || 'Not Set'}</span></td>
                                <td><span class="badge">${contractor.frequency || 'Not Set'}</span></td>
                                <td>
                                    ${contractor.sheetUrl ?
                                         `<a href="${contractor.sheetUrl}" target="_blank" class="sheet-link">
                                            <i class="fas fa-table"></i> View Sheet
                                        </a>` :
                                         '<span class="text-muted">Not Connected</span>'
                                    }
                                </td>
                                <td>
                                    ${contractor.vercelUrl ?
                                         `<span class="status-active"><i class="fas fa-check"></i> Active</span>` :
                                         '<span class="status-inactive">Not Set</span>'
                                    }
                                </td>
                                <td class="action-buttons">
                                    <button class="btn btn-sm btn-primary" onclick="uploadVercelReport('${contractor.id}')">
                                        <i class="fas fa-upload"></i> Upload Report
                                    </button>
                                    ${contractor.vercelUrl ?
                                         `<button class="btn btn-sm btn-outline" onclick="viewReport('${contractor.vercelUrl}')">
                                            <i class="fas fa-eye"></i> View
                                        </button>` : ''
                                    }
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    } catch (error) {
        console.error('Error loading contractor analysis data:', error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Data</h3>
                <button class="btn btn-primary" onclick="loadContractorAnalysisData()">Try Again</button>
            </div>
        `;
    }
}

// Upload Vercel Report Modal
function uploadVercelReport(contractorId) {
    const modalContent = `
        <div class="modal-header">
            <h3><i class="fas fa-upload"></i> Upload Vercel Analytics Report</h3>
        </div>
        <form id="upload-report-form" class="upload-report-form">
            <input type="hidden" name="contractorId" value="${contractorId}">
            
            <div class="form-group">
                <label class="form-label">
                    <i class="fas fa-link"></i> Vercel HTML Report URL
                </label>
                <input type="url"
                        class="form-input"
                        name="vercelUrl"
                        placeholder="https://your-app.vercel.app/report.html"
                        required>
                <small class="form-help">Enter the public URL of the Vercel-hosted HTML analytics report</small>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    <i class="fas fa-sticky-note"></i> Notes (Optional)
                </label>
                <textarea class="form-textarea"
                           name="notes"
                           rows="3"
                           placeholder="Any additional notes about this report..."></textarea>
            </div>
            
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> Save Report URL
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    Cancel
                </button>
            </div>
        </form>
    `;
    
    showModal(modalContent);
    
    document.getElementById('upload-report-form').addEventListener('submit', handleReportUpload);
}

// Handle report upload
async function handleReportUpload(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;
    
    try {
        const formData = {
            contractorId: form.contractorId.value,
            vercelUrl: form.vercelUrl.value,
            notes: form.notes.value
        };
        
        const response = await apiCall('/analysis/upload-report', 'POST', formData);
        
        if (response.success) {
            showNotification('Vercel report URL saved successfully!', 'success');
            closeModal();
            loadContractorAnalysisData();
        }
    } catch (error) {
        showNotification('Failed to save report URL', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// View report in new window
function viewReport(url) {
    window.open(url, '_blank');
}

// --- NEW/UPDATED FUNCTIONS & STYLES ---

// Add a new function to show the "Add Report URL" modal
function showAddReportModal() {
    // This is the same as the uploadVercelReport modal but without a specific contractorId
    const modalContent = `
        <div class="modal-header">
            <h3><i class="fas fa-plus"></i> Add New Vercel Analytics Report</h3>
        </div>
        <form id="add-report-form" class="upload-report-form">
            <div class="form-group">
                <label class="form-label">
                    <i class="fas fa-user"></i> Contractor ID or Email
                </label>
                <input type="text"
                       class="form-input"
                       name="contractorIdentifier"
                       placeholder="Enter contractor ID or email"
                       required>
                <small class="form-help">The ID or email of the contractor to associate this report with.</small>
            </div>
            <div class="form-group">
                <label class="form-label">
                    <i class="fas fa-link"></i> Vercel HTML Report URL
                </label>
                <input type="url"
                       class="form-input"
                       name="vercelUrl"
                       placeholder="https://your-app.vercel.app/report.html"
                       required>
                <small class="form-help">The public URL of the Vercel-hosted HTML report.</small>
            </div>
            <div class="form-group">
                <label class="form-label">
                    <i class="fas fa-sticky-note"></i> Notes (Optional)
                </label>
                <textarea class="form-textarea"
                          name="notes"
                          rows="3"
                          placeholder="Any additional notes about this report..."></textarea>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> Add Report
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">
                    Cancel
                </button>
            </div>
        </form>
    `;
    showModal(modalContent);

    document.getElementById('add-report-form').addEventListener('submit', handleAddReport);
}

async function handleAddReport(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    submitBtn.disabled = true;

    try {
        const formData = {
            contractorIdentifier: form.contractorIdentifier.value,
            vercelUrl: form.vercelUrl.value,
            notes: form.notes.value
        };

        const response = await apiCall('/analysis/add-report', 'POST', formData);

        if (response.success) {
            showNotification('New report added successfully!', 'success');
            closeModal();
            loadContractorAnalysisData();
        }
    } catch (error) {
        showNotification('Failed to add report. Make sure the contractor ID/email is correct.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}
