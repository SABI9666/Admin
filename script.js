// script.js - CORRECTED VERSION with proper support system integration
// This version includes corrected timestamp functions, reliable dashboard stats,
// and enhanced real-time polling for the support ticket system.

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

    // Auto-fetch core data on startup
    await loadDashboardStats();
    await loadUsersData();
    await loadProfileReviewsData();

    // Set the default tab view
    showTab('dashboard');

    // Initialize real-time updates (WebSocket and Polling)
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

// --- CORRECTED & ROBUST TIMESTAMP FUNCTIONS ---
function formatAdminTimestamp(date) {
    try {
        if (!date) return 'Unknown time';
        let dateObj;
        if (typeof date === 'string') {
            dateObj = new Date(date);
        } else if (date instanceof Date) {
            dateObj = date;
        } else if (date && typeof date === 'object' && date.seconds) {
            dateObj = new Date(date.seconds * 1000);
        } else {
            return 'Invalid date';
        }
        if (isNaN(dateObj.getTime())) return 'Invalid date';
        return dateObj.toLocaleDateString() + ' at ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error('Admin timestamp formatting error:', error);
        return 'Invalid date';
    }
}

function getTimeAgo(dateString) {
    if (!dateString) return 'some time ago';
    let date;
    try {
        if (typeof dateString === 'string') {
            date = new Date(dateString);
        } else if (dateString instanceof Date) {
            date = dateString;
        } else if (dateString && typeof dateString === 'object' && dateString.seconds) {
            date = new Date(dateString.seconds * 1000);
        } else {
            return 'some time ago';
        }
        if (isNaN(date.getTime())) return 'some time ago';
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`;
        if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
        return `${Math.floor(seconds / 31536000)} years ago`;
    } catch (error) {
        console.error('Error in getTimeAgo:', error);
        return 'some time ago';
    }
}

// --- TAB NAVIGATION ---
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`.tab[onclick="showTab('${tabName}')"]`).classList.add('active');
    const manualLoadMap = {
        'estimations': { data: state.estimations, loader: loadEstimationsData },
        'jobs': { data: state.jobs, loader: () => loadGenericData('jobs') },
        'quotes': { data: state.quotes, loader: () => loadGenericData('quotes') },
        'messages': { data: state.messages, loader: loadMessagesData },
        'conversations': { data: state.conversations, loader: loadConversationsData },
        'support-messages': { data: state.supportMessages || [], loader: loadSupportMessagesData },
    };
    if (manualLoadMap[tabName] && manualLoadMap[tabName].data.length === 0) {
        manualLoadMap[tabName].loader();
    }
}

// --- DASHBOARD (CORRECTED) ---
async function loadDashboardStats() {
    const statsGrid = document.getElementById('statsGrid');
    try {
        const { stats } = await apiCall('/dashboard');
        // CORRECTED: Handle different possible keys for support tickets
        const supportCount = stats.totalSupportTickets || stats.totalSupportMessages || 0;
        const criticalCount = stats.criticalSupportTickets || 0;
        statsGrid.innerHTML = `
            <div class="stat-card"><h3>${stats.totalUsers || 0}</h3><p>Total Users</p><button class="btn btn-sm" onclick="exportData('users')">Export</button></div>
            <div class="stat-card"><h3>${stats.pendingProfileReviews || 0}</h3><p>Pending Reviews</p><button class="btn btn-sm" onclick="showTab('profile-reviews')">Review</button></div>
            <div class="stat-card"><h3>${stats.totalJobs || 0}</h3><p>Total Jobs</p><button class="btn btn-sm" onclick="exportData('jobs')">Export</button></div>
            <div class="stat-card"><h3>${stats.totalQuotes || 0}</h3><p>Total Quotes</p><button class="btn btn-sm" onclick="exportData('quotes')">Export</button></div>
            <div class="stat-card"><h3>${stats.totalConversations || 0}</h3><p>User Conversations</p><button class="btn btn-sm" onclick="showTab('conversations')">View</button></div>
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
// (No changes requested, keeping existing functions)
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
function renderProfileReviewsTab() { /* ... function unchanged ... */ }
function viewProfileDetails(reviewId) { /* ... function unchanged ... */ }
function approveProfileWithComment(reviewId) { /* ... function unchanged ... */ }
async function confirmApproveProfile(reviewId) { /* ... function unchanged ... */ }
function showRejectModal(reviewId) { /* ... function unchanged ... */ }
async function confirmRejectProfile(reviewId) { /* ... function unchanged ... */ }
function downloadAllProfileFiles(reviewId) { /* ... function unchanged ... */ }


// --- SUPPORT SYSTEM MANAGEMENT (ENHANCED) ---
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
                        <option value="all">All Status</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                    </select>
                    <select id="support-priority-filter" onchange="filterSupportMessages()">
                        <option value="all">All Priority</option><option value="Critical">Critical</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
                    </select>
                </div>
                <button class="btn" onclick="loadSupportMessagesData()">Refresh</button>
            </div>
        </div>
        <div class="support-messages-container">
            ${messages.length === 0 ?
                `<div class="empty-state"><i class="fas fa-life-ring"></i><h3>No Support Messages</h3><p>Support requests from users will appear here.</p></div>` :
                `<div class="support-messages-grid">${messages.map(msg => renderSupportMessageCard(msg)).join('')}</div>`
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
                        <span class="priority-badge priority-${priorityClass}"><i class="fas ${getPriorityIcon(message.priority)}"></i> ${message.priority}</span>
                        <span class="status-badge status-${statusClass}"><i class="fas ${getStatusIcon(message.ticketStatus)}"></i> ${formatStatus(message.ticketStatus)}</span>
                    </div>
                </div>
                <div class="support-actions-quick">
                    <div class="time-info">
                        <small>Created: ${timeAgo}</small>
                        ${message.updatedAt && message.updatedAt !== message.createdAt ? `<small>Updated: ${lastUpdate}</small>` : ''}
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
                    ${message.assignedToName ? `<div class="assigned-to"><i class="fas fa-user-check"></i> Assigned to: <strong>${message.assignedToName}</strong></div>` : `<div class="unassigned"><i class="fas fa-user-times"></i> Unassigned</div>`}
                </div>
                <div class="message-preview"><p>${truncateText(message.message, 150)}</p></div>
                <div class="support-indicators">
                    ${hasAttachments ? `<div class="indicator attachments"><i class="fas fa-paperclip"></i> ${message.attachments.length} file${message.attachments.length > 1 ? 's' : ''}</div>` : ''}
                    ${responseCount > 0 ? `<div class="indicator responses"><i class="fas fa-comments"></i> ${responseCount} response${responseCount > 1 ? 's' : ''}</div>` : `<div class="indicator no-responses"><i class="fas fa-comment-slash"></i> No responses yet</div>`}
                </div>
            </div>
            <div class="support-card-actions">
                <button class="btn btn-sm btn-primary" onclick="viewSupportTicketDetails('${message.ticketId}')"><i class="fas fa-eye"></i> View Details</button>
                <button class="btn btn-sm btn-success" onclick="respondToSupportTicket('${message.ticketId}')"><i class="fas fa-reply"></i> Respond</button>
                <button class="btn btn-sm btn-outline" onclick="updateSupportTicketStatus('${message.ticketId}')"><i class="fas fa-edit"></i> Update Status</button>
                <button class="btn btn-sm btn-warning" onclick="assignSupportTicket('${message.ticketId}')"><i class="fas fa-user-plus"></i> Assign</button>
            </div>
        </div>
    `;
}

async function viewSupportTicketDetails(ticketId) { /* ... function unchanged ... */ }
async function downloadAllSupportAttachments(ticketId) { /* ... function unchanged ... */ }

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
                    <label for="new-status">Update Status After Responding:</label>
                    <select id="new-status">
                        <option value="in_progress">Mark as In Progress</option>
                        <option value="resolved">Mark as Resolved</option>
                        <option value="open">Keep as Open</option>
                        <option value="closed">Close Ticket</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitSupportResponse('${ticketId}')"><i class="fas fa-paper-plane"></i> Send Response</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

// CORRECTED: Support response submission
async function submitSupportResponse(ticketId) {
    const adminResponse = document.getElementById('admin-response').value.trim();
    const internalNote = document.getElementById('internal-note').value.trim();
    const newStatus = document.getElementById('new-status').value;
    if (!adminResponse) {
        return showNotification('Response message is required.', 'warning');
    }
    const submitBtn = document.querySelector('#support-response-form .btn-primary');
    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        await apiCall(`/support-messages/${ticketId}/respond`, 'POST', { adminResponse, internalNote, status: newStatus });
        showNotification('Response sent successfully! User has been notified.', 'success');
        closeModal();
        await Promise.all([loadSupportMessagesData(), loadDashboardStats()]);
    } catch (error) {
        showNotification('Failed to send response. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Response';
        }
    }
}

function updateSupportTicketStatus(ticketId) { /* ... function unchanged ... */ }

// CORRECTED: Status update submission
async function submitStatusUpdate(ticketId) {
    const newStatus = document.getElementById('ticket-status').value;
    const note = document.getElementById('status-note').value.trim();
    const notifyUser = document.getElementById('notify-user').checked;
    const submitBtn = document.querySelector('#status-update-form .btn-primary');
    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        await apiCall(`/support-messages/${ticketId}/status`, 'PATCH', { status: newStatus, internalNote: note, notifyUser });
        showNotification(`Ticket status updated to ${formatStatus(newStatus)}!`, 'success');
        closeModal();
        await Promise.all([loadSupportMessagesData(), loadDashboardStats()]);
    } catch (error) {
        showNotification('Failed to update status. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Status';
        }
    }
}

function assignSupportTicket(ticketId) { /* ... function unchanged ... */ }
async function submitTicketAssignment(ticketId) { /* ... function unchanged ... */ }
function addInternalNote(ticketId) { /* ... function unchanged ... */ }

// CORRECTED: Internal note submission
async function submitInternalNote(ticketId) {
    const noteText = document.getElementById('internal-note-text').value.trim();
    if (!noteText) {
        return showNotification('Note text is required.', 'warning');
    }
    const submitBtn = document.querySelector('#internal-note-form .btn-primary');
    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        await apiCall(`/support-messages/${ticketId}/internal-note`, 'POST', { note: noteText });
        showNotification('Internal note added successfully!', 'success');
        closeModal();
        await loadSupportMessagesData(); // Refresh list to reflect update time
    } catch (error) {
        showNotification('Failed to add internal note. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Note';
        }
    }
}

async function filterSupportMessages() { /* ... function unchanged ... */ }

// Utility functions for support system
function getAttachmentIcon(attachment) { /* ... function unchanged ... */ }
function formatFileSize(bytes) { /* ... function unchanged ... */ }
function getPriorityIcon(priority) { /* ... function unchanged ... */ }
function getStatusIcon(status) { /* ... function unchanged ... */ }
function formatStatus(status) { /* ... function unchanged ... */ }
function truncateText(text, maxLength) { /* ... function unchanged ... */ }

// --- ALL OTHER SECTIONS (Estimations, Jobs, Quotes, Messages, etc.) ---
// No changes were requested for these sections, so their existing functions are preserved.
// ... All remaining functions from the original script go here ...
// e.g., loadEstimationsData, renderEstimationsTab, loadGenericData, etc.

// --- ENHANCED REAL-TIME UPDATES & POLLING ---
function initializeRealTimeUpdates() {
    // Start reliable polling for support ticket updates
    setInterval(async () => {
        try {
            if (!getToken()) return; // Stop polling if logged out
            const activeTabId = document.querySelector('.tab-content.active')?.id;
            if (activeTabId === 'support-messages-tab') {
                await loadSupportMessagesData(); // Refresh support list if active
            }
            if (activeTabId === 'dashboard-tab') {
                await loadDashboardStats(); // Refresh dashboard stats
            }
        } catch (error) {
            console.log('Periodic update poll failed:', error);
        }
    }, 20000); // Poll every 20 seconds

    // WebSocket for instant notifications (if available)
    if (typeof WebSocket !== 'undefined') {
        try {
            const ws = new WebSocket(`wss://steelconnect-backend.onrender.com/admin-updates`);
            ws.onmessage = (event) => {
                const update = JSON.parse(event.data);
                switch (update.type) {
                    case 'new_support_ticket':
                        showAdvancedNotification('New support ticket received!', 'warning', 0, [{ text: 'View', callback: () => showTab('support-messages') }]);
                        loadDashboardStats();
                        break;
                    case 'support_response':
                        showAdvancedNotification('Support ticket has a new reply', 'info', 6000);
                        if (document.getElementById('support-messages-tab').classList.contains('active')) {
                            loadSupportMessagesData();
                        }
                        break;
                    case 'new_message':
                        showAdvancedNotification('New message received', 'info', 0, [{ text: 'View', callback: () => showTab('messages') }]);
                        break;
                    case 'profile_review':
                        showAdvancedNotification('New profile review pending', 'warning', 0, [{ text: 'Review', callback: () => showTab('profile-reviews') }]);
                        break;
                    // Add other real-time events as needed
                }
            };
            ws.onclose = () => setTimeout(initializeRealTimeUpdates, 10000); // Attempt to reconnect
            ws.onerror = () => console.log('WebSocket connection failed.');
        } catch (error) {
            console.log('WebSocket not available.');
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












