// script.js - Complete Enhanced Admin Panel Logic with All Functions
// Updated to be fully compatible with the provided src/routes/admin.js backend.
// This version incorporates enhanced file management, a support ticket system, and a corrected analysis portal.

// Helper: safely parse any date format (Firestore Timestamp, ISO string, Date, epoch)
function parseAdminDate(val) {
    if (!val) return null;
    let d;
    if (typeof val === 'string') {
        d = new Date(val);
    } else if (val.toDate && typeof val.toDate === 'function') {
        d = val.toDate();
    } else if (typeof val._seconds === 'number') {
        d = new Date(val._seconds * 1000);
    } else if (typeof val.seconds === 'number') {
        d = new Date(val.seconds * 1000);
    } else if (val instanceof Date) {
        d = val;
    } else if (typeof val === 'number') {
        d = new Date(val < 10000000000 ? val * 1000 : val);
    } else {
        d = new Date(String(val));
    }
    return (d && !isNaN(d.getTime())) ? d : null;
}

function formatAdminDate(val, fallback = 'N/A') {
    const d = parseAdminDate(val);
    return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : fallback;
}

document.addEventListener('DOMContentLoaded', initializeAdminPanel);

// --- INACTIVITY TIMER FOR AUTO-LOGOUT (5 MIN) ---
let adminInactivityTimer;
let adminWarningTimer;

function resetAdminInactivityTimer() {
    clearTimeout(adminInactivityTimer);
    clearTimeout(adminWarningTimer);
    // Warning at 4 minutes
    adminWarningTimer = setTimeout(() => {
        showAdminInactivityWarning();
    }, 240000);
    // Logout at 5 minutes
    adminInactivityTimer = setTimeout(() => {
        dismissAdminInactivityWarning();
        showNotification('You have been logged out due to inactivity.', 'warning');
        setTimeout(() => logout(), 1500);
    }, 300000);
}

function showAdminInactivityWarning() {
    dismissAdminInactivityWarning();
    const warning = document.createElement('div');
    warning.id = 'admin-inactivity-warning';
    warning.className = 'admin-inactivity-overlay';
    warning.innerHTML = `
        <div class="admin-inactivity-modal">
            <div class="admin-inactivity-icon"><i class="fas fa-exclamation-triangle"></i></div>
            <h3>Session Timeout Warning</h3>
            <p>You will be logged out in <strong>1 minute</strong> due to inactivity.</p>
            <p>Click anywhere or press a key to stay logged in.</p>
            <button class="btn btn-primary" onclick="dismissAdminInactivityWarning()">Stay Logged In</button>
        </div>
    `;
    document.body.appendChild(warning);
    const dismiss = () => { dismissAdminInactivityWarning(); document.removeEventListener('mousemove', dismiss); };
    setTimeout(() => document.addEventListener('mousemove', dismiss, { once: true }), 200);
}

function dismissAdminInactivityWarning() {
    const el = document.getElementById('admin-inactivity-warning');
    if (el) { el.remove(); resetAdminInactivityTimer(); }
}

function initAdminInactivityTimer() {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'wheel'];
    events.forEach(ev => window.addEventListener(ev, resetAdminInactivityTimer, { passive: true }));
    resetAdminInactivityTimer();
}

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
    communityPosts: [],
    contractorRequests: [], // For Analysis Portal
    analysisFilterStatus: 'all',
    systemAdminData: [],
    systemAdminTrash: [],
    systemAdminActiveCollection: null,
    systemAdminView: 'live', // 'live' or 'trash'
    systemAdminSelectedIds: [],
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

    // Start inactivity auto-logout timer (5 min)
    initAdminInactivityTimer();

    // Auto-fetch core data on startup for a faster experience
    await loadDashboardStats();
    await loadUsersData();
    await loadProfileReviewsData();

    // Set the default tab view
    showTab('dashboard'); // Default to dashboard

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
    clearTimeout(adminInactivityTimer);
    clearTimeout(adminWarningTimer);
    dismissAdminInactivityWarning();
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
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Update sidebar active state
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-link[data-tab="${tabName}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Show target tab
    const tabEl = document.getElementById(`${tabName}-tab`);
    if (tabEl) tabEl.classList.add('active');

    // Update page title
    const titleMap = {
        'dashboard': { title: 'Dashboard', subtitle: 'Overview of your admin portal' },
        'users': { title: 'Users', subtitle: 'Manage all registered users' },
        'profile-reviews': { title: 'Profile Reviews', subtitle: 'Review pending profile submissions' },
        'conversations': { title: 'Conversations', subtitle: 'Monitor user conversations' },
        'estimations': { title: 'Estimations', subtitle: 'Manage estimation requests' },
        'jobs': { title: 'Jobs', subtitle: 'View and manage all jobs' },
        'quotes': { title: 'Quotes', subtitle: 'View designer quotes' },
        'messages': { title: 'Messages', subtitle: 'Manage contact messages' },
        'support-messages': { title: 'Support Tickets', subtitle: 'Handle support requests' },
        'community-feed': { title: 'Community Feed', subtitle: 'Moderate community posts' },
        'analysis-portal': { title: 'Analysis Portal', subtitle: 'Business analytics management' },
        'system-admin': { title: 'System Admin', subtitle: 'Master data control — delete, restore, and manage all portal data' },
    };
    const info = titleMap[tabName] || { title: tabName, subtitle: '' };
    const pageTitleEl = document.getElementById('pageTitle');
    const pageSubEl = document.getElementById('pageSubtitle');
    if (pageTitleEl) pageTitleEl.textContent = info.title;
    if (pageSubEl) pageSubEl.textContent = info.subtitle;

    // Always reload dashboard stats to reflect latest data
    if (tabName === 'dashboard') {
        loadDashboardStats();
        return;
    }

    // Lazy load data
    const manualLoadMap = {
        'estimations': { data: state.estimations, loader: loadEstimationsData },
        'jobs': { data: state.jobs, loader: () => loadGenericData('jobs') },
        'quotes': { data: state.quotes, loader: () => loadGenericData('quotes') },
        'messages': { data: state.messages, loader: loadMessagesData },
        'conversations': { data: state.conversations, loader: loadConversationsData },
        'support-messages': { data: state.supportMessages || [], loader: loadSupportMessagesData },
        'community-feed': { data: state.communityPosts, loader: loadCommunityPostsData },
        'analysis-portal': { data: state.contractorRequests, loader: loadAnalysisPortalData },
        'system-admin': { data: [], loader: loadSystemAdminOverview },
    };

    if (manualLoadMap[tabName] && manualLoadMap[tabName].data.length === 0) {
        manualLoadMap[tabName].loader();
    }
}

// --- DASHBOARD ---
async function loadDashboardStats() {
    const statsGrid = document.getElementById('statsGrid');
    try {
        const { stats } = await apiCall('/dashboard');
        const analysisStats = await loadAnalysisStats(); // Fetch analysis stats
        
        const supportCount = stats.totalSupportTickets || stats.totalSupportMessages || 0;
        const criticalCount = stats.criticalSupportTickets || 0;
        
        // Update review badge in sidebar
        const reviewsBadge = document.getElementById('reviewsBadge');
        if (reviewsBadge && stats.pendingProfileReviews > 0) {
            reviewsBadge.textContent = stats.pendingProfileReviews;
        }

        // Update community feed badge in sidebar
        const communityBadge = document.getElementById('communityPendingBadge');
        if (communityBadge) {
            communityBadge.textContent = (stats.pendingCommunityPosts || 0) > 0 ? stats.pendingCommunityPosts : '';
        }

        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon users"><i class="fas fa-users"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.totalUsers || 0}</div>
                    <div class="stat-label">Total Users</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('users')">View All</button></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon reviews"><i class="fas fa-user-check"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.pendingProfileReviews || 0}</div>
                    <div class="stat-label">Pending Reviews</div>
                    <div class="stat-action"><button class="btn btn-sm btn-primary" onclick="showTab('profile-reviews')">Review</button></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon jobs"><i class="fas fa-briefcase"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.totalJobs || 0}</div>
                    <div class="stat-label">Total Jobs</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('jobs')">View</button></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon quotes"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.totalQuotes || 0}</div>
                    <div class="stat-label">Total Quotes</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('quotes')">View</button></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon conversations"><i class="fas fa-comments"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.totalConversations || 0}</div>
                    <div class="stat-label">Conversations</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('conversations')">View</button></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon support"><i class="fas fa-headset"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${supportCount}</div>
                    <div class="stat-label">Support Tickets</div>
                    ${criticalCount > 0 ? `<small class="critical-indicator"><i class="fas fa-exclamation-triangle"></i> ${criticalCount} Critical</small>` : ''}
                    <div class="stat-action"><button class="btn btn-sm btn-primary" onclick="showTab('support-messages')">Manage</button></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon analysis"><i class="fas fa-chart-line"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${analysisStats.pending || 0}<small style="font-size:14px;color:#6b7280;font-weight:400"> / ${analysisStats.total || 0}</small></div>
                    <div class="stat-label">Pending Analysis</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('analysis-portal')">View Portal</button></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon community"><i class="fas fa-newspaper"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.pendingCommunityPosts || 0}<small style="font-size:14px;color:#6b7280;font-weight:400"> / ${stats.totalCommunityPosts || 0}</small></div>
                    <div class="stat-label">Pending Community Posts</div>
                    <div class="stat-action"><button class="btn btn-sm btn-primary" onclick="showTab('community-feed')">Moderate</button></div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        statsGrid.innerHTML = `<p class="error">Failed to load dashboard stats.</p>`;
    }
}


// --- USER MANAGEMENT ---
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
        await loadUsersData(); 
        if (document.getElementById('messages-tab').classList.contains('active')) {
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
                            <button class="btn btn-sm btn-primary" onclick="downloadFile('${doc.url}', '${(doc.filename || 'resume.pdf').replace(/'/g, "\\'")}')"><i class="fas fa-download"></i> Download</button>
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

async function downloadAllProfileFiles(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review || !review.user.documents || review.user.documents.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    const docs = review.user.documents;
    showNotification(`Downloading ${docs.length} file(s)...`, 'info');
    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        await downloadFileSilent(doc.url, doc.filename || `resume_${i + 1}.pdf`);
        if (i < docs.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    showNotification(`${docs.length} file(s) downloaded successfully.`, 'success');
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

function renderEstimationsTab() {
    const container = document.getElementById('estimations-tab');
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
                                <small>${formatAdminDate(est.createdAt)}</small>
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
                <span class="files-count"><i class="fas fa-file-pdf"></i> ${files.length} PDF file${files.length !== 1 ? 's' : ''}</span>
                ${totalSize > 0 ? `<span class="files-size-badge"><i class="fas fa-database"></i> Total: ${totalSizeMB} MB</span>` : ''}
            </div>

            ${files.length > 0 ? `
                <div class="files-grid">
                    ${files.map((file, index) => {
                        const fileName = file.originalname || file.filename || file.name || `File ${index + 1}`;
                        const fileSizeBytes = file.size || 0;
                        const fileSizeMB = fileSizeBytes > 0 ? (fileSizeBytes / (1024 * 1024)).toFixed(2) : null;
                        const fileSizeKB = fileSizeBytes > 0 ? (fileSizeBytes / 1024).toFixed(1) : null;
                        const fileSizeDisplay = fileSizeMB ? (parseFloat(fileSizeMB) >= 1 ? fileSizeMB + ' MB' : fileSizeKB + ' KB') : 'Unknown size';
                        const uploadDate = formatAdminDate(file.uploadedAt, 'Unknown date');

                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas fa-file-pdf"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size-badge">${fileSizeDisplay}</span>
                                        <span class="file-date"><i class="fas fa-calendar-alt"></i> ${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </a>
                                    <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.url}', '${fileName.replace(/'/g, "\\'")}')">
                                        <i class="fas fa-download"></i> Download
                                    </button>
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

async function downloadAllEstimationFiles(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation || !estimation.uploadedFiles || estimation.uploadedFiles.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    const files = estimation.uploadedFiles;
    showNotification(`Downloading ${files.length} file(s)...`, 'info');
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = file.originalname || file.filename || `estimation_file_${i + 1}.pdf`;
        await downloadFileSilent(file.url, name);
        if (i < files.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    showNotification(`${files.length} file(s) downloaded successfully.`, 'success');
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

// --- MESSAGE MANAGEMENT ---
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
                        <td>${formatAdminDate(message.createdAt)}</td>
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
            renderMessagesTab();
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

// --- CONVERSATIONS MANAGEMENT ---
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
        renderConversationsTab();
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

function renderSupportMessagesTab(messages, stats) {
    const container = document.getElementById('support-messages-tab');
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
        loadSupportMessagesData();
    }
}

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

function formatAdminTimestamp(date) {
    try {
        if (!date) return 'Unknown time';
        
        let dateObj;
        
        if (typeof date === 'string') {
            dateObj = new Date(date);
        } else if (date instanceof Date) {
            dateObj = date;
        } else if (date && typeof date === 'object') {
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
        
        if (isNaN(dateObj.getTime())) {
            console.warn('Invalid date object:', date);
            return 'Invalid date';
        }
        
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

function getTimeAgo(dateString) {
    if (!dateString) return 'some time ago';
    
    let date;
    try {
        if (typeof dateString === 'string') {
            date = new Date(dateString);
        } else if (dateString instanceof Date) {
            date = dateString;
        } else if (dateString && typeof dateString === 'object') {
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


// --- GENERIC TABLES for Jobs, Quotes ---
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

function renderGenericTab(type) {
    const container = document.getElementById(`${type}-tab`);
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
                                    ${job.deadline ? `<br><small>Deadline: ${formatAdminDate(job.deadline)}</small>` : ''}
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
                                    ${quote.createdAt ? `<br><small>Submitted: ${formatAdminDate(quote.createdAt)}</small>` : ''}
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

function getJobFilesCell(job) {
    const attachments = job.attachments || [];
    const attachment = job.attachment; 

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

    const totalSize = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-folder-open"></i> Project Files - ${job.title}</h3>
            <div class="job-info-summary">
                <p><strong>Client:</strong> ${job.posterName || 'N/A'}</p>
                <p><strong>Budget:</strong> ${job.budget || 'N/A'}</p>
                <p><strong>Status:</strong> <span class="status ${job.status}">${job.status}</span></p>
            </div>
            ${allFiles.length > 0 ? `
                <div class="files-summary-header">
                    <span class="files-count"><i class="fas fa-paperclip"></i> ${allFiles.length} file${allFiles.length !== 1 ? 's' : ''}</span>
                    ${totalSize > 0 ? `<span class="files-size-badge"><i class="fas fa-database"></i> Total: ${totalSizeMB} MB</span>` : ''}
                </div>
                <div class="files-grid">
                    ${allFiles.map((file, index) => {
                        const fileName = file.originalname || file.filename || file.name || `Attachment ${index + 1}`;
                        const fileSizeBytes = file.size || 0;
                        const fileSizeMB = fileSizeBytes > 0 ? (fileSizeBytes / (1024 * 1024)).toFixed(2) : null;
                        const fileSizeKB = fileSizeBytes > 0 ? (fileSizeBytes / 1024).toFixed(1) : null;
                        const fileSizeDisplay = fileSizeMB ? (parseFloat(fileSizeMB) >= 1 ? fileSizeMB + ' MB' : fileSizeKB + ' KB') : 'Unknown size';
                        const uploadDate = formatAdminDate(file.uploadedAt, 'Unknown date');
                        const fileIcon = getFileIconByName(fileName);

                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas ${fileIcon}"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size-badge">${fileSizeDisplay}</span>
                                        <span class="file-date"><i class="fas fa-calendar-alt"></i> ${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </a>
                                    <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.url}', '${fileName.replace(/'/g, "\\'")}')">
                                        <i class="fas fa-download"></i> Download
                                    </button>
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
                        ${job.deadline ? `<div><label>Deadline:</label><span>${formatAdminDate(job.deadline)}</span></div>` : ''}
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
                            ${(() => {
                                const allJobFiles = [...attachments];
                                if (legacyAttachment) allJobFiles.push({ size: null });
                                const jobTotalSize = allJobFiles.reduce((sum, f) => sum + (f.size || 0), 0);
                                return jobTotalSize > 0 ? `<p class="files-size-info"><i class="fas fa-database"></i> Total size: <strong>${(jobTotalSize / (1024 * 1024)).toFixed(2)} MB</strong></p>` : '';
                            })()}
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

async function downloadAllJobFiles(jobId) {
    const job = state.jobs.find(j => j._id === jobId);
    if (!job) return showNotification('Job not found.', 'error');

    const attachments = job.attachments || [];
    const legacyAttachment = job.attachment;
    let allFiles = [...attachments];
    if (legacyAttachment) {
        allFiles.push({ url: legacyAttachment, name: 'project_attachment.pdf' });
    }
    if (allFiles.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    showNotification(`Downloading ${allFiles.length} file(s)...`, 'info');
    for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        const name = file.originalname || file.filename || file.name || `job_file_${i + 1}.pdf`;
        await downloadFileSilent(file.url, name);
        if (i < allFiles.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    showNotification(`${allFiles.length} file(s) downloaded successfully.`, 'success');
}

function confirmDeleteJob(jobId) {
    if (confirm('Are you sure you want to delete this job? This will also delete all associated quotes and files. This action cannot be undone.')) {
        deleteGenericItem('jobs', jobId);
        closeModal();
    }
}

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

function viewQuoteFiles(quoteId) {
    const quote = state.quotes.find(q => q._id === quoteId);
    if (!quote) return showNotification('Quote not found.', 'error');
    const attachments = quote.attachments || [];
    const totalSize = attachments.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
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
                <div class="files-summary-header">
                    <span class="files-count"><i class="fas fa-paperclip"></i> ${attachments.length} file${attachments.length !== 1 ? 's' : ''}</span>
                    ${totalSize > 0 ? `<span class="files-size-badge"><i class="fas fa-database"></i> Total: ${totalSizeMB} MB</span>` : ''}
                </div>
                <div class="files-grid">
                    ${attachments.map((file, index) => {
                        const fileName = file.name || file.originalname || `Attachment ${index + 1}`;
                        const fileSizeBytes = file.size || 0;
                        const fileSizeMB = fileSizeBytes > 0 ? (fileSizeBytes / (1024 * 1024)).toFixed(2) : null;
                        const fileSizeKB = fileSizeBytes > 0 ? (fileSizeBytes / 1024).toFixed(1) : null;
                        const fileSizeDisplay = fileSizeMB ? (parseFloat(fileSizeMB) >= 1 ? fileSizeMB + ' MB' : fileSizeKB + ' KB') : 'Unknown size';
                        const uploadDate = formatAdminDate(file.uploadedAt, 'Unknown date');
                        const fileIcon = getQuoteFileIcon(fileName);

                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas ${fileIcon}"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size-badge">${fileSizeDisplay}</span>
                                        <span class="file-date"><i class="fas fa-calendar-alt"></i> ${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </a>
                                    <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.url}', '${fileName.replace(/'/g, "\\'")}')">
                                        <i class="fas fa-download"></i> Download
                                    </button>
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
                        <div><label>Submitted:</label><span>${formatAdminDate(quote.createdAt)}</span></div>
                        ${quote.approvedAt ? `<div><label>Approved:</label><span>${formatAdminDate(quote.approvedAt)}</span></div>` : ''}
                        ${quote.rejectedAt ? `<div><label>Rejected:</label><span>${formatAdminDate(quote.rejectedAt)}</span></div>` : ''}
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
                            ${(() => {
                                const quoteTotalSize = attachments.reduce((sum, f) => sum + (f.size || 0), 0);
                                return quoteTotalSize > 0 ? `<p class="files-size-info"><i class="fas fa-database"></i> Total size: <strong>${(quoteTotalSize / (1024 * 1024)).toFixed(2)} MB</strong></p>` : '';
                            })()}
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

async function downloadAllQuoteFiles(quoteId) {
    const quote = state.quotes.find(q => q._id === quoteId);
    if (!quote) return showNotification('Quote not found.', 'error');
    const attachments = quote.attachments || [];
    if (attachments.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    showNotification(`Downloading ${attachments.length} file(s)...`, 'info');
    for (let i = 0; i < attachments.length; i++) {
        const file = attachments[i];
        const name = file.name || file.originalname || `quote_file_${i + 1}`;
        const url = file.url || file.downloadURL;
        await downloadFileSilent(url, name);
        if (i < attachments.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    showNotification(`${attachments.length} file(s) downloaded successfully.`, 'success');
}

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

function getFileIconByName(fileName) {
    if (!fileName) return 'fa-file';
    const ext = fileName.toLowerCase().split('.').pop();
    const iconMap = {
        'pdf': 'fa-file-pdf', 'doc': 'fa-file-word', 'docx': 'fa-file-word',
        'xls': 'fa-file-excel', 'xlsx': 'fa-file-excel', 'txt': 'fa-file-alt',
        'jpg': 'fa-file-image', 'jpeg': 'fa-file-image', 'png': 'fa-file-image',
        'dwg': 'fa-drafting-compass', 'zip': 'fa-file-archive'
    };
    return iconMap[ext] || 'fa-file';
}

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
let _pollingInitialized = false;
let _wsRetryCount = 0;
const WS_MAX_RETRIES = 5;
const WS_BASE_DELAY = 5000;

function initializeRealTimeUpdates() {
    if (!_pollingInitialized) {
        _pollingInitialized = true;
        setInterval(async () => {
            try {
                const currentActiveTab = document.querySelector('.tab-content.active').id;

                if (currentActiveTab === 'support-messages-tab') {
                    loadSupportMessagesData();
                } else if (currentActiveTab === 'dashboard-tab') {
                    loadDashboardStats();
                }
            } catch (error) {
                console.log('Error in real-time updates:', error);
            }
        }, 30000);
    }

    connectWebSocket();
}

function connectWebSocket() {
    if (typeof WebSocket === 'undefined') return;

    try {
        const ws = new WebSocket(`wss://steelconnect-backend.onrender.com/admin-updates`);
        const wsTimeout = setTimeout(() => { try { ws.close(); } catch(e) {} }, 10000); // 10s connection timeout

        ws.onopen = () => {
            clearTimeout(wsTimeout);
            console.log('WebSocket connected.');
            _wsRetryCount = 0;
        };

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
                        if (document.getElementById('support-messages-tab').classList.contains('active')) {
                            loadSupportMessagesData();
                        }
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
            if (_wsRetryCount < WS_MAX_RETRIES) {
                const delay = WS_BASE_DELAY * Math.pow(2, _wsRetryCount);
                _wsRetryCount++;
                console.log(`WebSocket closed. Reconnecting in ${delay / 1000}s (attempt ${_wsRetryCount}/${WS_MAX_RETRIES})...`);
                setTimeout(connectWebSocket, delay);
            } else {
                console.log('WebSocket reconnection limit reached. Using polling only.');
            }
        };

        ws.onerror = (error) => {
            console.log('WebSocket connection failed:', error);
        };

    } catch (error) {
        console.log('WebSocket not available:', error);
    }
}


// --- CROSS-ORIGIN FILE DOWNLOAD HELPER ---
function sanitizeDownloadUrl(url) {
    try {
        const parsed = new URL(url);
        // Firebase Storage URLs encode the full object path after /o/ — do NOT re-encode
        if (parsed.hostname.includes('firebasestorage.googleapis.com') ||
            parsed.hostname.includes('storage.googleapis.com')) {
            return url; // Already properly encoded by Firebase SDK
        }
        parsed.pathname = parsed.pathname.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
        return parsed.toString();
    } catch {
        return encodeURI(url);
    }
}

async function downloadFile(url, filename) {
    const safeUrl = sanitizeDownloadUrl(url);
    try {
        showNotification(`Downloading ${filename}...`, 'info');
        // Try fetch with CORS first
        const response = await fetch(safeUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.warn(`Blob download failed for ${filename}, trying no-cors then window.open:`, error);
        // Try with the original URL (un-sanitized) in case sanitization broke it
        try {
            const response2 = await fetch(url, { mode: 'cors' });
            if (!response2.ok) throw new Error(`HTTP ${response2.status}`);
            const blob = await response2.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error2) {
            console.warn(`Retried original URL failed for ${filename}, opening in new tab:`, error2);
            window.open(url, '_blank');
        }
    }
}

async function downloadFileSilent(url, filename) {
    const safeUrl = sanitizeDownloadUrl(url);
    try {
        const response = await fetch(safeUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.warn(`Blob download failed for ${filename}, retrying with original URL:`, error);
        try {
            const response2 = await fetch(url, { mode: 'cors' });
            if (!response2.ok) throw new Error(`HTTP ${response2.status}`);
            const blob = await response2.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error2) {
            console.warn(`Retried original URL failed for ${filename}, opening in new tab:`, error2);
            window.open(url, '_blank');
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


// === ANALYSIS PORTAL - SMART DASHBOARD MANAGEMENT ===
// State for dashboards
if (!state.dashboards) state.dashboards = [];
if (!state.dashboardFilter) state.dashboardFilter = 'all';
let adminDashboardCharts = {};

async function loadAnalysisPortalData() {
    const container = document.getElementById('analysis-portal-tab');
    showLoader(container);
    try {
        const [reqRes, dbRes] = await Promise.all([
            apiCall('/business-analytics/requests', 'GET'),
            apiCall('/dashboards', 'GET')
        ]);
        state.contractorRequests = reqRes.requests || [];
        state.dashboards = dbRes.dashboards || [];
        renderAnalysisPortalTab();
    } catch (error) {
        console.error('Error loading analysis portal:', error);
        container.innerHTML = `<p class="error">Failed to load analysis data.</p><button class="btn" onclick="loadAnalysisPortalData()">Retry</button>`;
    }
}

function renderAnalysisPortalTab() {
    const container = document.getElementById('analysis-portal-tab');
    const dashboards = state.dashboards || [];
    const requests = state.contractorRequests || [];
    const filtered = state.dashboardFilter === 'all' ? dashboards :
        dashboards.filter(d => d.status === state.dashboardFilter);

    const pendingCount = dashboards.filter(d => d.status === 'pending').length;
    const approvedCount = dashboards.filter(d => d.status === 'approved').length;

    container.innerHTML = `
        <div class="section-header">
            <h3><i class="fas fa-chart-line"></i> Analytics Dashboard Manager</h3>
            <div class="header-actions">
                <button class="btn btn-primary" onclick="showUploadSheetModal()">
                    <i class="fas fa-file-excel"></i> Upload Google Sheet
                </button>
                <button class="btn" onclick="loadAnalysisPortalData()"><i class="fas fa-sync-alt"></i> Refresh</button>
            </div>
        </div>

        <div class="adm-stats-row">
            <div class="adm-stat-card"><div class="adm-stat-icon" style="background:rgba(99,102,241,.1);color:#6366f1"><i class="fas fa-chart-bar"></i></div>
                <div><div class="adm-stat-num">${dashboards.length}</div><div class="adm-stat-label">Total Dashboards</div></div></div>
            <div class="adm-stat-card"><div class="adm-stat-icon" style="background:rgba(245,158,11,.1);color:#f59e0b"><i class="fas fa-clock"></i></div>
                <div><div class="adm-stat-num">${pendingCount}</div><div class="adm-stat-label">Pending Approval</div></div></div>
            <div class="adm-stat-card"><div class="adm-stat-icon" style="background:rgba(16,185,129,.1);color:#10b981"><i class="fas fa-check-circle"></i></div>
                <div><div class="adm-stat-num">${approvedCount}</div><div class="adm-stat-label">Live Dashboards</div></div></div>
            <div class="adm-stat-card"><div class="adm-stat-icon" style="background:rgba(236,72,153,.1);color:#ec4899"><i class="fas fa-users"></i></div>
                <div><div class="adm-stat-num">${requests.length}</div><div class="adm-stat-label">Analysis Requests</div></div></div>
        </div>

        <div class="adm-filter-row">
            <button class="adm-filter-btn ${state.dashboardFilter === 'all' ? 'active' : ''}" onclick="filterDashboards('all')">All</button>
            <button class="adm-filter-btn ${state.dashboardFilter === 'pending' ? 'active' : ''}" onclick="filterDashboards('pending')">Pending</button>
            <button class="adm-filter-btn ${state.dashboardFilter === 'approved' ? 'active' : ''}" onclick="filterDashboards('approved')">Approved</button>
        </div>

        <div class="adm-dashboards-grid">
            ${filtered.length === 0 ? '<div class="no-data" style="grid-column:1/-1;text-align:center;padding:40px"><i class="fas fa-chart-area" style="font-size:2rem;color:#cbd5e1;margin-bottom:12px;display:block"></i>No dashboards found. Upload a Google Sheet to auto-generate one.</div>' :
            filtered.map(db => `
                <div class="adm-db-card">
                    <div class="adm-db-card-head">
                        <div class="adm-db-icon"><i class="fas fa-chart-pie"></i></div>
                        <div class="adm-db-info">
                            <h4>${db.title || 'Untitled Dashboard'}</h4>
                            <span class="adm-db-for">${db.contractorName || db.contractorEmail}</span>
                        </div>
                        <span class="status-badge ${db.status}">
                            <i class="fas fa-${db.status === 'approved' ? 'check-circle' : db.status === 'rejected' ? 'times-circle' : 'clock'}"></i>
                            ${db.status.charAt(0).toUpperCase() + db.status.slice(1)}
                        </span>
                    </div>
                    <div class="adm-db-meta">
                        <span><i class="fas fa-file-excel"></i> ${db.fileName || 'N/A'}</span>
                        <span><i class="fas fa-table"></i> ${db.chartCount || 0} chart(s)</span>
                        <span><i class="fas fa-clock"></i> ${db.frequency || 'daily'}</span>
                        <span><i class="fas fa-calendar"></i> ${formatAdminDate(db.createdAt)}</span>
                    </div>
                    <div class="adm-db-actions">
                        <button class="btn btn-sm btn-outline" onclick="previewDashboard('${db._id}')">
                            <i class="fas fa-eye"></i> Preview
                        </button>
                        ${db.status === 'pending' ? `
                            <button class="btn btn-sm btn-primary" onclick="approveDashboard('${db._id}')">
                                <i class="fas fa-check"></i> Approve
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="rejectDashboard('${db._id}')">
                                <i class="fas fa-times"></i> Reject
                            </button>
                        ` : ''}
                        <button class="btn btn-sm btn-danger" onclick="deleteDashboard('${db._id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>

        ${requests.length > 0 ? `
        <div class="section-header" style="margin-top:32px">
            <h3><i class="fas fa-inbox"></i> Contractor Analysis Requests</h3>
        </div>
        <table class="data-table">
            <thead><tr><th>Contractor</th><th>Data Type</th><th>Frequency</th><th>Google Sheet</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
                ${requests.map(r => `<tr>
                    <td><strong>${r.contractorName}</strong><br><small>${r.contractorEmail}</small></td>
                    <td><span class="badge">${r.dataType}</span></td>
                    <td>${r.frequency}</td>
                    <td><a href="${r.googleSheetUrl}" target="_blank" class="sheet-link"><i class="fas fa-external-link-alt"></i> View</a></td>
                    <td><span class="status-badge ${r.status}">${r.status}</span></td>
                    <td><small>${formatAdminDate(r.createdAt)}</small></td>
                    <td><button class="btn btn-sm btn-danger" onclick="deleteAnalysisRequest('${r._id}')"><i class="fas fa-trash"></i></button></td>
                </tr>`).join('')}
            </tbody>
        </table>` : ''}
    `;
}

function filterDashboards(status) {
    state.dashboardFilter = status;
    renderAnalysisPortalTab();
}

// Upload Sheet Modal
function showUploadSheetModal() {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-file-excel" style="color:#10b981"></i> Upload Google Sheet / Excel File</h3>
            <p style="color:#64748b;margin-bottom:20px">Upload a .xlsx, .xls, or .csv file. The system will automatically parse the data and generate a dashboard with charts.</p>
            <div class="form-group">
                <label>Dashboard Title *</label>
                <input type="text" id="sheet-dash-title" class="form-input" placeholder="e.g., Monthly Production Report" required>
            </div>
            <div class="form-group">
                <label>Contractor Email *</label>
                <input type="email" id="sheet-contractor-email" class="form-input" placeholder="contractor@email.com" required>
            </div>
            <div class="form-group">
                <label>Contractor Name</label>
                <input type="text" id="sheet-contractor-name" class="form-input" placeholder="John Doe">
            </div>
            <div class="form-group">
                <label>Frequency</label>
                <select id="sheet-frequency" class="form-input">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly" selected>Monthly</option>
                </select>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="sheet-description" class="form-textarea" rows="2" placeholder="Brief description of this dashboard..."></textarea>
            </div>
            <div class="form-group">
                <label>Select Spreadsheet File *</label>
                <input type="file" id="sheet-file-input" class="form-input" accept=".xlsx,.xls,.csv" required>
                <small style="color:#94a3b8">Supported: .xlsx, .xls, .csv (Max 50MB)</small>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="uploadSheetFile()" id="sheet-upload-btn">
                    <i class="fas fa-cloud-upload-alt"></i> Upload & Generate Dashboard
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

async function uploadSheetFile() {
    const title = document.getElementById('sheet-dash-title').value.trim();
    const email = document.getElementById('sheet-contractor-email').value.trim();
    const name = document.getElementById('sheet-contractor-name').value.trim();
    const freq = document.getElementById('sheet-frequency').value;
    const desc = document.getElementById('sheet-description').value.trim();
    const fileInput = document.getElementById('sheet-file-input');
    const btn = document.getElementById('sheet-upload-btn');

    if (!title || !email || !fileInput.files[0]) {
        showNotification('Please fill in all required fields and select a file', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div> Processing...';

    try {
        const formData = new FormData();
        formData.append('spreadsheet', fileInput.files[0]);
        formData.append('title', title);
        formData.append('contractorEmail', email);
        formData.append('contractorName', name);
        formData.append('frequency', freq);
        formData.append('description', desc);

        const response = await apiCall('/dashboards/upload', 'POST', formData);
        showNotification(`Dashboard auto-generated! ${response.charts?.length || 0} chart(s) created.`, 'success');
        closeModal();
        await loadAnalysisPortalData();
    } catch (error) {
        console.error('Sheet upload error:', error);
        showNotification('Failed to upload and process the spreadsheet', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload & Generate Dashboard';
    }
}

// Preview Dashboard
async function previewDashboard(dashboardId) {
    try {
        showNotification('Loading dashboard preview...', 'info');
        const response = await apiCall(`/dashboards/${dashboardId}`, 'GET');
        const db = response.dashboard;
        if (!db) { showNotification('Dashboard not found', 'error'); return; }

        // Build KPI HTML
        const allKpis = [];
        (db.charts || []).forEach(c => { if (c.kpis) allKpis.push(...c.kpis); });
        const kpisHTML = allKpis.slice(0, 6).map(kpi => {
            const trendUp = kpi.trend >= 0;
            return `<div class="adm-preview-kpi">
                <div class="adm-preview-kpi-val">${formatKpiVal(kpi.total)}</div>
                <div class="adm-preview-kpi-label">${kpi.label}</div>
                <div class="adm-preview-kpi-trend ${trendUp ? 'up' : 'down'}"><i class="fas fa-arrow-${trendUp ? 'up' : 'down'}"></i> ${Math.abs(kpi.trend)}%</div>
            </div>`;
        }).join('');

        const chartsHTML = (db.charts || []).map((chart, idx) =>
            `<div class="adm-preview-chart-card">
                <h4>${chart.customTitle || chart.sheetName} <small>(${chart.chartType}, ${chart.rowCount} rows)</small></h4>
                <div style="height:280px;position:relative"><canvas id="adm-preview-chart-${idx}"></canvas></div>
            </div>`
        ).join('');

        const modalContent = `
            <div class="modal-body" style="max-width:900px">
                <div class="adm-preview-head">
                    <h3><i class="fas fa-chart-bar" style="color:#6366f1"></i> ${db.title}</h3>
                    <span class="status-badge ${db.status}">${db.status}</span>
                </div>
                <p style="color:#64748b">${db.description || ''} | For: <strong>${db.contractorName || db.contractorEmail}</strong> | Frequency: ${db.frequency}</p>
                ${kpisHTML ? `<div class="adm-preview-kpi-grid">${kpisHTML}</div>` : ''}
                <div class="adm-preview-charts">${chartsHTML}</div>
                <div class="modal-actions" style="margin-top:20px">
                    ${db.status === 'pending' ? `
                        <button class="btn btn-primary" onclick="approveDashboard('${db._id}');closeModal()"><i class="fas fa-check"></i> Approve for Client</button>
                        <button class="btn btn-danger" onclick="rejectDashboard('${db._id}');closeModal()"><i class="fas fa-times"></i> Reject</button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `;
        showModal(modalContent);

        // Render charts after modal opens
        setTimeout(() => {
            (db.charts || []).forEach((chart, idx) => {
                const ctx = document.getElementById(`adm-preview-chart-${idx}`);
                if (!ctx || typeof Chart === 'undefined') return;
                const isCirc = ['doughnut','pie','polarArea'].includes(chart.chartType);
                const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#22c55e'];
                const datasets = chart.datasets.map((ds, di) => {
                    if (isCirc) return { label: ds.label, data: ds.data, backgroundColor: ds.data.map((_, i) => colors[i % colors.length]), borderWidth: 2, borderColor: '#fff' };
                    return { label: ds.label, data: ds.data, borderColor: colors[di % colors.length],
                        backgroundColor: chart.chartType === 'bar' ? colors[di % colors.length] + 'CC' : colors[di % colors.length] + '15',
                        borderWidth: 3, tension: 0.4, fill: chart.chartType === 'line', borderRadius: chart.chartType === 'bar' ? 6 : 0 };
                });
                if (adminDashboardCharts[idx]) adminDashboardCharts[idx].destroy();
                adminDashboardCharts[idx] = new Chart(ctx, {
                    type: chart.chartType,
                    data: { labels: chart.labels, datasets },
                    options: { responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'top', labels: { usePointStyle: true } } },
                        ...(!isCirc ? { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' } } } } : {})
                    }
                });
            });
        }, 300);
    } catch (error) {
        console.error('Preview error:', error);
        showNotification('Failed to load dashboard preview', 'error');
    }
}

function formatKpiVal(val) {
    if (val === null || val === undefined) return '0';
    const num = parseFloat(val);
    if (isNaN(num)) return String(val);
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + 'K';
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toFixed(2);
}

async function approveDashboard(id) {
    if (!confirm('Approve this dashboard? The client will be able to view it immediately.')) return;
    try {
        await apiCall(`/dashboards/${id}/approve`, 'POST', {});
        showNotification('Dashboard approved! Client can now view it.', 'success');
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to approve dashboard', 'error');
    }
}

async function rejectDashboard(id) {
    const reason = prompt('Enter rejection reason (optional):');
    try {
        await apiCall(`/dashboards/${id}/reject`, 'POST', { reason: reason || '' });
        showNotification('Dashboard rejected', 'info');
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to reject dashboard', 'error');
    }
}

async function deleteDashboard(id) {
    if (!confirm('Delete this dashboard permanently?')) return;
    try {
        await apiCall(`/dashboards/${id}`, 'DELETE');
        showNotification('Dashboard deleted', 'success');
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to delete dashboard', 'error');
    }
}

async function deleteAnalysisRequest(requestId) {
    if (!confirm('Delete this analysis request?')) return;
    try {
        await apiCall(`/business-analytics/request/${requestId}`, 'DELETE');
        showNotification('Request deleted', 'success');
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to delete request', 'error');
    }
}

function filterAnalysisRequests(status) {
    state.analysisFilterStatus = status;
    renderAnalysisPortalTab();
}

// === ANALYSIS STATS FOR DASHBOARD ===
async function loadAnalysisStats() {
    try {
        const response = await apiCall('/business-analytics/stats', 'GET');
        return response.stats || { total: 0, pending: 0, completed: 0 };
    } catch (error) {
        console.error('Failed to load analysis stats:', error);
        return { total: 0, pending: 0, completed: 0 };
    }
}

// ==========================================
// SYSTEM ADMIN - MASTER DATA CONTROL
// ==========================================
const SA_COLLECTION_ICONS = {
    users: 'fa-users', jobs: 'fa-briefcase', quotes: 'fa-file-invoice-dollar',
    estimations: 'fa-calculator', messages: 'fa-envelope', conversations: 'fa-comments',
    support_tickets: 'fa-headset', analysis_requests: 'fa-chart-line', notifications: 'fa-bell'
};
const SA_COLLECTION_COLORS = {
    users: '#3b82f6', jobs: '#10b981', quotes: '#f59e0b',
    estimations: '#8b5cf6', messages: '#ec4899', conversations: '#06b6d4',
    support_tickets: '#ef4444', analysis_requests: '#14b8a6', notifications: '#6366f1'
};

// Invalidate cached state for a System Admin collection key so other tabs reload fresh data
function invalidateStateForCollection(collectionKey) {
    const stateKeyMap = {
        users: 'users',
        jobs: 'jobs',
        quotes: 'quotes',
        estimations: 'estimations',
        messages: 'messages',
        conversations: 'conversations',
        support_tickets: 'supportMessages',
        analysis_requests: 'contractorRequests',
        notifications: null
    };
    const stateKey = stateKeyMap[collectionKey];
    if (stateKey && state[stateKey]) {
        state[stateKey] = [];
    }
    // Also clear profile reviews if users are affected
    if (collectionKey === 'users') {
        state.profileReviews = [];
    }
}

async function loadSystemAdminOverview() {
    const container = document.getElementById('system-admin-tab');
    showLoader(container);
    try {
        const response = await apiCall('/system-admin/overview');
        renderSystemAdminTab(response.data);
    } catch (error) {
        container.innerHTML = `<div class="sa-error"><p>Failed to load System Admin data.</p><button class="btn" onclick="loadSystemAdminOverview()">Retry</button></div>`;
    }
}

function renderSystemAdminTab(overview) {
    const container = document.getElementById('system-admin-tab');
    const cards = Object.entries(overview).map(([key, info]) => {
        const icon = SA_COLLECTION_ICONS[key] || 'fa-database';
        const color = SA_COLLECTION_COLORS[key] || '#64748b';
        return `<div class="sa-collection-card" onclick="loadSystemAdminCollection('${key}')" style="--sa-color:${color}">
            <div class="sa-card-icon"><i class="fas ${icon}"></i></div>
            <div class="sa-card-info">
                <h4>${info.label}</h4>
                <div class="sa-card-counts">
                    <span class="sa-count-live"><i class="fas fa-circle"></i> ${info.total} active</span>
                    ${info.held > 0 ? `<span class="sa-count-held"><i class="fas fa-snowflake"></i> ${info.held} on hold</span>` : ''}
                    <span class="sa-count-trash"><i class="fas fa-trash"></i> ${info.deleted} in trash</span>
                </div>
            </div>
            <i class="fas fa-chevron-right sa-card-arrow"></i>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="sa-header">
            <div class="sa-header-left">
                <div class="sa-shield"><i class="fas fa-skull-crossbones"></i></div>
                <div>
                    <h2>System Admin Control Center</h2>
                    <p>Full access to delete, restore, and manage all portal data. Deleted items are moved to trash and can be retrieved.</p>
                </div>
            </div>
            <div class="sa-header-actions">
                <button class="btn" onclick="loadSystemAdminOverview()"><i class="fas fa-sync-alt"></i> Refresh</button>
                <button class="btn btn-danger-outline" onclick="viewSystemTrash()"><i class="fas fa-trash-restore"></i> View Trash</button>
            </div>
        </div>
        <div class="sa-overview-grid">${cards}</div>
        <div id="sa-detail-section"></div>`;
}

async function loadSystemAdminCollection(collectionKey) {
    state.systemAdminActiveCollection = collectionKey;
    state.systemAdminView = 'live';
    state.systemAdminSelectedIds = [];
    const detail = document.getElementById('sa-detail-section');
    if (!detail) return;
    detail.innerHTML = `<div class="sa-loading"><div class="spinner"></div> Loading data...</div>`;
    detail.scrollIntoView({ behavior: 'smooth' });
    try {
        const response = await apiCall(`/system-admin/data/${collectionKey}?limit=200`);
        state.systemAdminData = response.data || [];
        renderSystemAdminDetail(collectionKey, response.collection, response.total);
    } catch (error) {
        detail.innerHTML = `<div class="sa-error"><p>Failed to load data.</p></div>`;
    }
}

function renderSystemAdminDetail(key, label, total) {
    const detail = document.getElementById('sa-detail-section');
    const items = state.systemAdminData;
    const color = SA_COLLECTION_COLORS[key] || '#64748b';
    const icon = SA_COLLECTION_ICONS[key] || 'fa-database';

    const rows = items.map(item => {
        const displayFields = getItemDisplayFields(key, item);
        return `<tr id="sa-row-${item._id}" class="${item._held ? 'sa-row-held' : ''}">
            <td><input type="checkbox" class="sa-check" data-id="${item._id}" onchange="toggleSASelect('${item._id}')"></td>
            <td><code class="sa-id">${(item._id || '').substring(0, 10)}...</code></td>
            ${displayFields.map(f => `<td>${f}</td>`).join('')}
            <td class="sa-actions">
                <button class="btn btn-sm" onclick="viewSAItemDetail('${key}', '${item._id}')" title="View Details"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm ${item._held ? 'btn-held-active' : 'btn-hold'}" onclick="${item._held ? `unholdSAItem('${key}','${item._id}')` : `holdSAItem('${key}','${item._id}')`}" title="${item._held ? 'Release Hold' : 'Hold/Freeze'}"><i class="fas fa-snowflake"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteSAItem('${key}', '${item._id}')" title="Move to Trash"><i class="fas fa-trash"></i></button>
                <button class="btn btn-sm btn-perma-delete" onclick="permanentDeleteLiveSAItem('${key}', '${item._id}')" title="Permanent Delete"><i class="fas fa-skull-crossbones"></i></button>
            </td>
        </tr>`;
    }).join('');

    const headers = getItemHeaders(key);

    detail.innerHTML = `
        <div class="sa-detail-header" style="border-left:4px solid ${color}">
            <div class="sa-detail-title">
                <i class="fas ${icon}" style="color:${color}"></i>
                <h3>${label} <span class="sa-total-badge">${total} total</span></h3>
            </div>
            <div class="sa-detail-actions">
                <input type="text" class="sa-search-input" placeholder="Search..." oninput="searchSACollection('${key}', this.value)">
                <button class="btn btn-danger btn-sm" id="sa-bulk-delete-btn" style="display:none" onclick="bulkDeleteSA('${key}')"><i class="fas fa-trash"></i> Delete Selected (<span id="sa-bulk-count">0</span>)</button>
                <button class="btn btn-sm" onclick="loadSystemAdminCollection('${key}')"><i class="fas fa-sync-alt"></i></button>
            </div>
        </div>
        <div class="sa-table-wrapper">
            <table class="sa-table">
                <thead><tr><th><input type="checkbox" onchange="toggleSASelectAll(this)"></th><th>ID</th>${headers.map(h => `<th>${h}</th>`).join('')}<th>Actions</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="99" class="sa-empty">No items found</td></tr>'}</tbody>
            </table>
        </div>`;
}

function getItemHeaders(key) {
    const map = {
        users: ['Name', 'Email', 'Type', 'Status'],
        jobs: ['Title', 'Client', 'Budget', 'Status'],
        quotes: ['Designer', 'Job', 'Amount', 'Status'],
        estimations: ['Title', 'Contractor', 'Status', 'Files'],
        messages: ['From', 'Subject', 'Date', 'Status'],
        conversations: ['Participants', 'Job', 'Messages', 'Updated'],
        support_tickets: ['Subject', 'User', 'Priority', 'Status'],
        analysis_requests: ['Contractor', 'Type', 'Status', 'Date'],
        notifications: ['User', 'Type', 'Message', 'Read']
    };
    return map[key] || ['Field 1', 'Field 2', 'Field 3', 'Field 4'];
}

function getItemDisplayFields(key, item) {
    const safeStr = (v, max = 30) => v ? String(v).substring(0, max) : '<span class="sa-na">N/A</span>';
    const statusBadge = (s) => `<span class="status ${s || 'unknown'}">${s || 'N/A'}</span>`;
    const dateStr = (d) => formatAdminDate(d);
    const heldBadge = item._held ? ' <span class="sa-held-badge"><i class="fas fa-snowflake"></i> HELD</span>' : '';

    const map = {
        users: [safeStr(item.name) + heldBadge, safeStr(item.email, 25), statusBadge(item.type), statusBadge(item.profileStatus || (item.canAccess === false ? 'blocked' : 'active'))],
        jobs: [safeStr(item.title, 35) + heldBadge, safeStr(item.posterName), safeStr(item.budget), statusBadge(item.status)],
        quotes: [safeStr(item.designerName) + heldBadge, safeStr(item.jobTitle, 25), `$${item.quoteAmount || 0}`, statusBadge(item.status)],
        estimations: [safeStr(item.projectTitle, 30) + heldBadge, safeStr(item.contractorName), statusBadge(item.status), `${(item.uploadedFiles || []).length} files`],
        messages: [safeStr(item.name || item.email) + heldBadge, safeStr(item.subject, 30), dateStr(item.createdAt), statusBadge(item.status || (item.read ? 'read' : 'unread'))],
        conversations: [safeStr((item.participants || []).join(', '), 30) + heldBadge, safeStr(item.jobTitle, 20), `${item.messageCount || '?'}`, dateStr(item.updatedAt || item.lastMessageAt)],
        support_tickets: [safeStr(item.subject, 30) + heldBadge, safeStr(item.userName || item.userEmail), statusBadge(item.priority), statusBadge(item.status)],
        analysis_requests: [safeStr(item.contractorName) + heldBadge, safeStr(item.dataType), statusBadge(item.status), dateStr(item.createdAt)],
        notifications: [safeStr(item.userId, 15) + heldBadge, safeStr(item.type), safeStr(item.message, 30), item.read ? 'Yes' : 'No']
    };
    return map[key] || [safeStr(item._id) + heldBadge, '', '', ''];
}

function toggleSASelect(docId) {
    const idx = state.systemAdminSelectedIds.indexOf(docId);
    if (idx > -1) state.systemAdminSelectedIds.splice(idx, 1);
    else state.systemAdminSelectedIds.push(docId);
    const bulkBtn = document.getElementById('sa-bulk-delete-btn');
    const bulkCount = document.getElementById('sa-bulk-count');
    if (bulkBtn) bulkBtn.style.display = state.systemAdminSelectedIds.length > 0 ? 'inline-flex' : 'none';
    if (bulkCount) bulkCount.textContent = state.systemAdminSelectedIds.length;
}

function toggleSASelectAll(checkbox) {
    const checks = document.querySelectorAll('.sa-check');
    state.systemAdminSelectedIds = [];
    checks.forEach(c => {
        c.checked = checkbox.checked;
        if (checkbox.checked) state.systemAdminSelectedIds.push(c.dataset.id);
    });
    const bulkBtn = document.getElementById('sa-bulk-delete-btn');
    const bulkCount = document.getElementById('sa-bulk-count');
    if (bulkBtn) bulkBtn.style.display = state.systemAdminSelectedIds.length > 0 ? 'inline-flex' : 'none';
    if (bulkCount) bulkCount.textContent = state.systemAdminSelectedIds.length;
}

async function searchSACollection(key, query) {
    if (!query || query.length < 2) {
        if (!query) loadSystemAdminCollection(key);
        return;
    }
    try {
        const response = await apiCall(`/system-admin/data/${key}?search=${encodeURIComponent(query)}&limit=100`);
        state.systemAdminData = response.data || [];
        renderSystemAdminDetail(key, response.collection, response.total);
    } catch (e) { /* ignore search errors */ }
}

function viewSAItemDetail(key, docId) {
    const item = state.systemAdminData.find(i => i._id === docId) || state.systemAdminTrash.find(i => i._id === docId);
    if (!item) return;
    const entries = Object.entries(item).filter(([k]) => !k.startsWith('_')).map(([k, v]) => {
        let displayVal = v;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            if (v._seconds) displayVal = new Date(v._seconds * 1000).toLocaleString();
            else if (v.seconds) displayVal = new Date(v.seconds * 1000).toLocaleString();
            else if (v.url) displayVal = `<a href="${v.url}" target="_blank">View File</a> (${v.filename || 'file'})`;
            else displayVal = `<pre>${JSON.stringify(v, null, 2).substring(0, 300)}</pre>`;
        } else if (Array.isArray(v)) {
            displayVal = v.length > 0 ? `<span class="sa-array-badge">${v.length} item(s)</span> <details><summary>View</summary><pre>${JSON.stringify(v, null, 2).substring(0, 500)}</pre></details>` : '<em>Empty</em>';
        } else if (typeof v === 'string' && v.length > 100) {
            displayVal = `<details><summary>${v.substring(0, 80)}...</summary><p>${v}</p></details>`;
        }
        return `<tr><td class="sa-detail-key">${k}</td><td class="sa-detail-val">${displayVal ?? '<em>null</em>'}</td></tr>`;
    }).join('');

    const isTrash = !!item._deletedAt;
    const isHeld = !!item._held;
    let actionBtns;
    if (isTrash) {
        actionBtns = `<button class="btn btn-primary" onclick="restoreSAItem('${docId}');closeModal()"><i class="fas fa-undo"></i> Restore</button><button class="btn btn-danger" onclick="permanentDeleteSAItem('${docId}');closeModal()"><i class="fas fa-fire"></i> Permanent Delete</button>`;
    } else {
        actionBtns = `<button class="btn ${isHeld ? 'btn-held-active' : 'btn-hold'}" onclick="${isHeld ? `unholdSAItem('${key}','${docId}');closeModal()` : `holdSAItem('${key}','${docId}');closeModal()`}"><i class="fas fa-snowflake"></i> ${isHeld ? 'Release Hold' : 'Hold/Freeze'}</button>` +
            `<button class="btn btn-danger" onclick="deleteSAItem('${key}', '${docId}');closeModal()"><i class="fas fa-trash"></i> Move to Trash</button>` +
            `<button class="btn btn-perma-delete" onclick="closeModal();permanentDeleteLiveSAItem('${key}', '${docId}')"><i class="fas fa-skull-crossbones"></i> Permanent Delete</button>`;
    }

    showModal(`
        <div class="sa-modal-detail">
            <h3><i class="fas ${SA_COLLECTION_ICONS[key] || 'fa-database'}"></i> ${isTrash ? 'Trash Item' : 'Item'} Details</h3>
            <p class="sa-modal-id">ID: <code>${docId}</code></p>
            ${isTrash ? `<p class="sa-trash-info"><i class="fas fa-trash"></i> Deleted on ${item._deletedAt} by ${item._deletedBy || 'Unknown'}</p>` : ''}
            ${isHeld ? `<p class="sa-held-info"><i class="fas fa-snowflake"></i> ON HOLD — Frozen on ${item._heldAt || 'N/A'} by ${item._heldBy || 'Unknown'}</p>` : ''}
            <div class="sa-detail-table-wrap"><table class="sa-detail-table">${entries}</table></div>
            <div class="sa-modal-actions">${actionBtns}<button class="btn" onclick="closeModal()">Close</button></div>
        </div>`);
}

async function deleteSAItem(key, docId) {
    if (!confirm('Are you sure you want to delete this item? It will be moved to trash and can be restored later.')) return;
    try {
        await apiCall(`/system-admin/data/${key}/${docId}`, 'DELETE');
        showNotification('Item deleted and moved to trash.', 'success');
        const row = document.getElementById(`sa-row-${docId}`);
        if (row) row.remove();
        state.systemAdminData = state.systemAdminData.filter(i => i._id !== docId);
        invalidateStateForCollection(key);
    } catch (error) {
        showNotification('Failed to delete item.', 'error');
    }
}

async function bulkDeleteSA(key) {
    const count = state.systemAdminSelectedIds.length;
    if (!confirm(`Are you sure you want to delete ${count} item(s)? They will be moved to trash.`)) return;
    try {
        await apiCall(`/system-admin/bulk-delete/${key}`, 'POST', { docIds: state.systemAdminSelectedIds });
        showNotification(`${count} item(s) deleted.`, 'success');
        state.systemAdminSelectedIds = [];
        invalidateStateForCollection(key);
        loadSystemAdminCollection(key);
    } catch (error) {
        showNotification('Bulk delete failed.', 'error');
    }
}

async function viewSystemTrash(collectionKey) {
    state.systemAdminView = 'trash';
    const detail = document.getElementById('sa-detail-section');
    if (!detail) return;
    detail.innerHTML = `<div class="sa-loading"><div class="spinner"></div> Loading trash...</div>`;
    detail.scrollIntoView({ behavior: 'smooth' });
    try {
        const url = collectionKey ? `/system-admin/trash?collectionKey=${collectionKey}` : '/system-admin/trash';
        const response = await apiCall(url);
        state.systemAdminTrash = response.data || [];
        renderTrashView(collectionKey);
    } catch (error) {
        detail.innerHTML = `<div class="sa-error"><p>Failed to load trash.</p></div>`;
    }
}

function renderTrashView(filterKey) {
    const detail = document.getElementById('sa-detail-section');
    const items = state.systemAdminTrash;

    const rows = items.map(item => {
        const key = item._collectionKey || 'unknown';
        const icon = SA_COLLECTION_ICONS[key] || 'fa-file';
        const color = SA_COLLECTION_COLORS[key] || '#64748b';
        const label = item._collection || key;
        const title = item.title || item.name || item.subject || item.projectTitle || item.designerName || item.contractorName || item._originalId || item._id;
        return `<tr>
            <td><span class="sa-trash-type" style="color:${color}"><i class="fas ${icon}"></i> ${label}</span></td>
            <td><strong>${String(title).substring(0, 40)}</strong><br><code class="sa-id">${(item._originalId || item._id || '').substring(0, 12)}</code></td>
            <td>${item._deletedAt ? new Date(item._deletedAt).toLocaleString() : 'N/A'}</td>
            <td>${item._deletedBy || 'N/A'}</td>
            <td class="sa-actions">
                <button class="btn btn-sm btn-primary" onclick="restoreSAItem('${item._id}')"><i class="fas fa-undo"></i> Restore</button>
                <button class="btn btn-sm" onclick="viewSAItemDetail('${key}', '${item._id}')"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm btn-danger" onclick="permanentDeleteSAItem('${item._id}')"><i class="fas fa-fire"></i></button>
            </td>
        </tr>`;
    }).join('');

    detail.innerHTML = `
        <div class="sa-detail-header sa-trash-header">
            <div class="sa-detail-title">
                <i class="fas fa-trash-restore" style="color:#ef4444"></i>
                <h3>Trash <span class="sa-total-badge">${items.length} item(s)</span></h3>
            </div>
            <div class="sa-detail-actions">
                <select class="sa-filter-select" onchange="viewSystemTrash(this.value || undefined)">
                    <option value="">All Collections</option>
                    <option value="users" ${filterKey === 'users' ? 'selected' : ''}>Users</option>
                    <option value="jobs" ${filterKey === 'jobs' ? 'selected' : ''}>Projects</option>
                    <option value="quotes" ${filterKey === 'quotes' ? 'selected' : ''}>Quotes</option>
                    <option value="estimations" ${filterKey === 'estimations' ? 'selected' : ''}>Estimations</option>
                    <option value="messages" ${filterKey === 'messages' ? 'selected' : ''}>Messages</option>
                    <option value="conversations" ${filterKey === 'conversations' ? 'selected' : ''}>Conversations</option>
                    <option value="support_tickets" ${filterKey === 'support_tickets' ? 'selected' : ''}>Support Tickets</option>
                    <option value="analysis_requests" ${filterKey === 'analysis_requests' ? 'selected' : ''}>Analysis Requests</option>
                </select>
                ${items.length > 0 ? `<button class="btn btn-danger btn-sm" onclick="emptyTrash('${filterKey || ''}')"><i class="fas fa-fire"></i> Empty Trash</button>` : ''}
                <button class="btn btn-sm" onclick="loadSystemAdminOverview()"><i class="fas fa-arrow-left"></i> Back</button>
            </div>
        </div>
        <div class="sa-table-wrapper">
            <table class="sa-table">
                <thead><tr><th>Collection</th><th>Item</th><th>Deleted At</th><th>Deleted By</th><th>Actions</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" class="sa-empty">Trash is empty</td></tr>'}</tbody>
            </table>
        </div>`;
}

async function restoreSAItem(docId) {
    if (!confirm('Restore this item back to its original collection?')) return;
    try {
        // Find the collection key for invalidation
        const trashItem = state.systemAdminTrash.find(i => i._id === docId);
        await apiCall(`/system-admin/restore/${docId}`, 'POST');
        showNotification('Item restored successfully!', 'success');
        state.systemAdminTrash = state.systemAdminTrash.filter(i => i._id !== docId);
        // Invalidate the restored collection so other tabs reflect the change
        if (trashItem && trashItem._collectionKey) {
            invalidateStateForCollection(trashItem._collectionKey);
        }
        if (state.systemAdminView === 'trash') renderTrashView();
        else loadSystemAdminOverview();
    } catch (error) {
        showNotification('Failed to restore item.', 'error');
    }
}

async function permanentDeleteSAItem(docId) {
    if (!confirm('PERMANENTLY delete this item? This action CANNOT be undone. All associated files will also be deleted.')) return;
    try {
        await apiCall(`/system-admin/trash/${docId}`, 'DELETE');
        showNotification('Item permanently deleted.', 'success');
        state.systemAdminTrash = state.systemAdminTrash.filter(i => i._id !== docId);
        if (state.systemAdminView === 'trash') renderTrashView();
    } catch (error) {
        showNotification('Failed to permanently delete.', 'error');
    }
}

// Hold/Freeze an item
async function holdSAItem(key, docId) {
    if (!confirm('Hold/Freeze this item? It will be frozen and marked as on hold.')) return;
    try {
        await apiCall(`/system-admin/hold/${key}/${docId}`, 'POST');
        showNotification('Item frozen successfully!', 'success');
        // Update local state
        const item = state.systemAdminData.find(i => i._id === docId);
        if (item) {
            item._held = true;
            item._heldAt = new Date().toISOString();
        }
        invalidateStateForCollection(key);
        // Re-render current view
        if (state.systemAdminView === 'overview') loadSystemAdminOverview();
        else loadSystemAdminCollection(key);
    } catch (error) {
        showNotification('Failed to hold/freeze item.', 'error');
    }
}

// Unhold/Unfreeze an item
async function unholdSAItem(key, docId) {
    if (!confirm('Release hold on this item? It will be unfrozen and back to normal.')) return;
    try {
        await apiCall(`/system-admin/unhold/${key}/${docId}`, 'POST');
        showNotification('Item released from hold!', 'success');
        // Update local state
        const item = state.systemAdminData.find(i => i._id === docId);
        if (item) {
            delete item._held;
            delete item._heldAt;
            delete item._heldBy;
        }
        invalidateStateForCollection(key);
        // Re-render current view
        if (state.systemAdminView === 'overview') loadSystemAdminOverview();
        else loadSystemAdminCollection(key);
    } catch (error) {
        showNotification('Failed to release hold.', 'error');
    }
}

// Permanent Delete from live data - requires password 9666
async function permanentDeleteLiveSAItem(key, docId) {
    showModal(`
        <div class="sa-modal-detail">
            <h3 style="color: #dc2626;"><i class="fas fa-skull-crossbones"></i> Permanent Delete</h3>
            <p style="color: #b91c1c; margin: 12px 0;">This will <strong>permanently destroy</strong> this item and all associated files. This action <strong>CANNOT</strong> be undone.</p>
            <div style="margin: 16px 0;">
                <label style="display: block; font-size: 0.85rem; color: #6b7280; margin-bottom: 6px;">Enter System Admin Password to confirm:</label>
                <input type="password" id="perma-delete-password" placeholder="Enter password..."
                    style="width: 100%; padding: 10px 14px; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 8px; color: #1f2937; font-size: 0.95rem;"
                    onkeydown="if(event.key==='Enter')confirmPermanentDelete('${key}','${docId}')" autofocus />
            </div>
            <div class="sa-modal-actions">
                <button class="btn" onclick="closeModal()">Cancel</button>
                <button class="btn btn-perma-delete" onclick="confirmPermanentDelete('${key}','${docId}')">
                    <i class="fas fa-skull-crossbones"></i> Permanently Destroy
                </button>
            </div>
        </div>
    `);
    setTimeout(() => { const inp = document.getElementById('perma-delete-password'); if (inp) inp.focus(); }, 100);
}

async function confirmPermanentDelete(key, docId) {
    const passwordInput = document.getElementById('perma-delete-password');
    const password = passwordInput ? passwordInput.value : '';
    if (!password) {
        showNotification('Password is required for permanent delete.', 'error');
        return;
    }
    try {
        await apiCall(`/system-admin/permanent-delete/${key}/${docId}`, 'POST', { password });
        closeModal();
        showNotification('Item permanently destroyed!', 'success');
        state.systemAdminData = state.systemAdminData.filter(i => i._id !== docId);
        invalidateStateForCollection(key);
        if (state.systemAdminView === 'overview') loadSystemAdminOverview();
        else loadSystemAdminCollection(key);
    } catch (error) {
        showNotification(error.message || 'Failed to permanently delete. Check password.', 'error');
    }
}

async function emptyTrash(collectionKey) {
    const msg = collectionKey ? `Empty ALL trash items for this collection?` : 'Empty ALL trash items across ALL collections?';
    if (!confirm(msg + ' This CANNOT be undone.')) return;
    try {
        const url = collectionKey ? `/system-admin/trash-empty?collectionKey=${collectionKey}` : '/system-admin/trash-empty';
        const response = await apiCall(url, 'DELETE');
        showNotification(response.message, 'success');
        viewSystemTrash(collectionKey || undefined);
    } catch (error) {
        showNotification('Failed to empty trash.', 'error');
    }
}

function closeModal() {
    const modal = document.getElementById('modal-container');
    if (modal) modal.innerHTML = '';
}

// --- COMMUNITY FEED MODERATION ---

async function loadCommunityPostsData() {
    const container = document.getElementById('community-feed-tab');
    showLoader(container);
    try {
        const response = await apiCall('/community-posts');
        state.communityPosts = response.posts || [];
        renderCommunityFeedTab();

        // Update sidebar badge
        const pendingCount = state.communityPosts.filter(p => p.status === 'pending').length;
        const badge = document.getElementById('communityPendingBadge');
        if (badge) badge.textContent = pendingCount > 0 ? pendingCount : '';
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load community posts.</p>
            <button class="btn" onclick="loadCommunityPostsData()">Retry</button>`;
    }
}

function renderCommunityFeedTab() {
    const container = document.getElementById('community-feed-tab');
    const pending = state.communityPosts.filter(p => p.status === 'pending');
    const approved = state.communityPosts.filter(p => p.status === 'approved');
    const rejected = state.communityPosts.filter(p => p.status === 'rejected');

    container.innerHTML = `
        <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
            <h3 style="margin:0;">Community Feed Moderation</h3>
            <button class="btn btn-sm" onclick="loadCommunityPostsData()"><i class="fas fa-sync"></i> Refresh</button>
        </div>

        <div style="display:flex;gap:0.75rem;margin-bottom:1.5rem;flex-wrap:wrap;">
            <span class="status-badge" style="background:#fef3c7;color:#92400e;padding:6px 14px;border-radius:20px;font-weight:600;">${pending.length} Pending</span>
            <span class="status-badge" style="background:#d1fae5;color:#065f46;padding:6px 14px;border-radius:20px;font-weight:600;">${approved.length} Approved</span>
            <span class="status-badge" style="background:#fee2e2;color:#991b1b;padding:6px 14px;border-radius:20px;font-weight:600;">${rejected.length} Rejected</span>
        </div>

        <h4 style="margin-bottom:1rem;color:#1e293b;">Pending Review (${pending.length})</h4>
        ${pending.length === 0 ? '<p style="color:#64748b;">No posts pending review.</p>' : `
        <div class="profile-reviews-grid" style="margin-bottom:2rem;">
            ${pending.map(post => renderCommunityPostCard(post)).join('')}
        </div>`}

        <h4 style="margin-top:2rem;margin-bottom:1rem;color:#1e293b;">Approved Posts (${approved.length})</h4>
        ${approved.length === 0 ? '<p style="color:#64748b;">No approved posts.</p>' : `
        <div class="profile-reviews-grid" style="margin-bottom:2rem;">
            ${approved.slice(0, 20).map(post => renderCommunityPostCard(post)).join('')}
        </div>`}

        <h4 style="margin-top:2rem;margin-bottom:1rem;color:#1e293b;">Rejected Posts (${rejected.length})</h4>
        ${rejected.length === 0 ? '<p style="color:#64748b;">No rejected posts.</p>' : `
        <div class="profile-reviews-grid">
            ${rejected.slice(0, 10).map(post => renderCommunityPostCard(post)).join('')}
        </div>`}
    `;
}

function renderCommunityPostCard(post) {
    const statusColors = {
        pending: { bg: '#fef3c7', color: '#92400e' },
        approved: { bg: '#d1fae5', color: '#065f46' },
        rejected: { bg: '#fee2e2', color: '#991b1b' }
    };
    const sc = statusColors[post.status] || statusColors.pending;
    const contentPreview = sanitizeInput((post.content || '').substring(0, 200));
    const imageCount = (post.images || []).length;
    const commentCount = (post.comments || []).length;
    const authorTypeBadge = post.authorType === 'designer'
        ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">Designer</span>'
        : '<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">Contractor</span>';

    return `
        <div class="review-card" style="padding:1.25rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
                <div>
                    <h4 style="margin:0 0 4px 0;font-size:15px;">${sanitizeInput(post.authorName || 'Unknown')} ${authorTypeBadge}</h4>
                    <small style="color:#64748b;">${post.authorEmail || ''}</small>
                </div>
                <span style="background:${sc.bg};color:${sc.color};padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;text-transform:uppercase;">${post.status}</span>
            </div>
            <p style="color:#334155;margin:0.5rem 0;line-height:1.5;white-space:pre-wrap;">${contentPreview}${post.content && post.content.length > 200 ? '...' : ''}</p>
            ${imageCount > 0 ? `<p style="color:#64748b;font-size:13px;"><i class="fas fa-images"></i> ${imageCount} image(s)</p>` : ''}
            <p style="color:#64748b;font-size:13px;margin:4px 0;">
                <i class="fas fa-heart"></i> ${post.likes || 0} likes &nbsp;
                <i class="fas fa-comment"></i> ${commentCount} comments
            </p>
            <small style="color:#94a3b8;">Posted: ${new Date(post.createdAt).toLocaleString()}</small>
            ${post.adminReviewedBy ? `<br><small style="color:#94a3b8;">Reviewed by: ${post.adminReviewedBy}</small>` : ''}
            <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">
                <button class="btn btn-sm btn-outline" onclick="viewCommunityPostDetail('${post._id}')"><i class="fas fa-eye"></i> View</button>
                ${post.status === 'pending' ? `
                    <button class="btn btn-sm btn-success" onclick="approveCommunityPost('${post._id}')"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn btn-sm btn-danger" onclick="rejectCommunityPost('${post._id}')"><i class="fas fa-times"></i> Reject</button>
                ` : ''}
                <button class="btn btn-sm btn-danger" onclick="deleteCommunityPostAdmin('${post._id}')"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>`;
}

function viewCommunityPostDetail(postId) {
    const post = state.communityPosts.find(p => p._id === postId);
    if (!post) return showNotification('Post not found.', 'error');

    const imagesHTML = (post.images || []).map(img => {
        const src = typeof img === 'object' ? (img.url || '') : img;
        return `<img src="${src}" style="max-width:200px;margin:4px;border-radius:8px;cursor:pointer;" alt="Post image" onclick="window.open('${src}','_blank')">`;
    }).join('');

    const commentsHTML = (post.comments || []).map(c =>
        `<div style="padding:10px;border-left:3px solid #e2e8f0;margin:6px 0;background:#f8fafc;border-radius:0 8px 8px 0;">
            <strong>${sanitizeInput(c.authorName || 'Unknown')}</strong>
            <span style="background:${c.authorType === 'designer' ? '#dbeafe' : '#e0e7ff'};color:${c.authorType === 'designer' ? '#1e40af' : '#3730a3'};padding:2px 6px;border-radius:8px;font-size:11px;margin-left:4px;">${c.authorType || 'user'}</span>
            <span style="color:#94a3b8;font-size:12px;margin-left:8px;">${new Date(c.createdAt).toLocaleString()}</span>
            <p style="margin:4px 0 0 0;color:#334155;">${sanitizeInput(c.text || '')}</p>
        </div>`
    ).join('');

    const sc = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' };

    const modalContent = `
        <div style="max-width:700px;">
            <h3 style="margin-bottom:1rem;"><i class="fas fa-newspaper"></i> Community Post Detail</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
                <div><label style="color:#64748b;font-size:13px;">Author</label><p style="margin:2px 0;font-weight:600;">${sanitizeInput(post.authorName || 'Unknown')}</p></div>
                <div><label style="color:#64748b;font-size:13px;">Type</label><p style="margin:2px 0;">${post.authorType || 'unknown'}</p></div>
                <div><label style="color:#64748b;font-size:13px;">Status</label><p style="margin:2px 0;"><span style="color:${sc[post.status] || '#64748b'};font-weight:600;text-transform:uppercase;">${post.status}</span></p></div>
                <div><label style="color:#64748b;font-size:13px;">Posted</label><p style="margin:2px 0;">${new Date(post.createdAt).toLocaleString()}</p></div>
                <div><label style="color:#64748b;font-size:13px;">Likes</label><p style="margin:2px 0;">${post.likes || 0}</p></div>
                <div><label style="color:#64748b;font-size:13px;">Comments</label><p style="margin:2px 0;">${(post.comments || []).length}</p></div>
            </div>
            <h4 style="margin:1rem 0 0.5rem;">Content</h4>
            <div style="background:#f8fafc;padding:12px;border-radius:8px;white-space:pre-wrap;color:#334155;line-height:1.6;">${sanitizeInput(post.content || '')}</div>
            ${imagesHTML ? `<h4 style="margin:1rem 0 0.5rem;">Images</h4><div style="display:flex;flex-wrap:wrap;">${imagesHTML}</div>` : ''}
            ${commentsHTML ? `<h4 style="margin:1rem 0 0.5rem;">Comments (${post.comments.length})</h4>${commentsHTML}` : '<p style="color:#94a3b8;margin-top:1rem;">No comments.</p>'}
            ${post.adminComments ? `<h4 style="margin:1rem 0 0.5rem;">Admin Comments</h4><div style="background:#fef3c7;padding:10px;border-radius:8px;">${sanitizeInput(post.adminComments)}</div>` : ''}
            <div style="display:flex;gap:0.5rem;margin-top:1.5rem;justify-content:flex-end;">
                ${post.status === 'pending' ? `
                    <button class="btn btn-success" onclick="approveCommunityPost('${postId}')"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn btn-danger" onclick="rejectCommunityPost('${postId}')"><i class="fas fa-times"></i> Reject</button>
                ` : ''}
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        </div>`;
    showModal(modalContent);
}

function approveCommunityPost(postId) {
    const modalContent = `
        <div style="max-width:500px;">
            <h3 style="margin-bottom:1rem;"><i class="fas fa-check-circle" style="color:#10b981;"></i> Approve Community Post</h3>
            <p style="color:#64748b;">This post will be visible in the community feed for all users.</p>
            <div class="form-group" style="margin:1rem 0;">
                <label class="form-label">Admin Comments (Optional)</label>
                <textarea id="community-approval-comments" class="form-input" rows="3" placeholder="e.g., Great content!" style="width:100%;"></textarea>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
                <button class="btn btn-success" onclick="confirmApproveCommunityPost('${postId}')"><i class="fas fa-check"></i> Confirm Approval</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>`;
    showModal(modalContent);
}

async function confirmApproveCommunityPost(postId) {
    const commentsEl = document.getElementById('community-approval-comments');
    const comments = commentsEl ? commentsEl.value : '';
    try {
        const data = await apiCall(`/community-posts/${postId}/approve`, 'POST', {
            adminComments: sanitizeInput(comments)
        });
        showNotification(data.message || 'Post approved!', 'success');
        closeModal();
        await loadCommunityPostsData();
    } catch (error) {
        showNotification('Failed to approve post.', 'error');
    }
}

function rejectCommunityPost(postId) {
    const modalContent = `
        <div style="max-width:500px;">
            <h3 style="margin-bottom:1rem;"><i class="fas fa-times-circle" style="color:#ef4444;"></i> Reject Community Post</h3>
            <p style="color:#ef4444;font-size:14px;"><i class="fas fa-info-circle"></i> The author will be notified with your feedback.</p>
            <div class="form-group" style="margin:1rem 0;">
                <label class="form-label">Reason for Rejection *</label>
                <textarea id="community-rejection-reason" class="form-input" rows="4" placeholder="Please provide specific reasons for rejection..." required style="width:100%;"></textarea>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
                <button class="btn btn-danger" onclick="confirmRejectCommunityPost('${postId}')"><i class="fas fa-times"></i> Confirm Rejection</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>`;
    showModal(modalContent);
}

async function confirmRejectCommunityPost(postId) {
    const reasonEl = document.getElementById('community-rejection-reason');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    if (!reason) {
        showNotification('Rejection reason is required.', 'warning');
        return;
    }
    try {
        const data = await apiCall(`/community-posts/${postId}/reject`, 'POST', {
            reason: sanitizeInput(reason)
        });
        showNotification(data.message || 'Post rejected.', 'success');
        closeModal();
        await loadCommunityPostsData();
    } catch (error) {
        showNotification('Failed to reject post.', 'error');
    }
}

async function deleteCommunityPostAdmin(postId) {
    if (!confirm('Are you sure you want to delete this community post? It will be moved to trash.')) return;
    try {
        const data = await apiCall(`/community-posts/${postId}`, 'DELETE');
        showNotification(data.message || 'Post deleted.', 'success');
        await loadCommunityPostsData();
    } catch (error) {
        showNotification('Failed to delete post.', 'error');
    }
}
