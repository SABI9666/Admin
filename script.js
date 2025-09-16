// script.js - Complete Enhanced Admin Panel Logic with All Functions
// Updated to be fully compatible with the provided src/routes/admin.js backend.
// This version incorporates enhanced file management for estimations, jobs, and quotes.

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
    conversations: [], // New state for conversations
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
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`.tab[onclick="showTab('${tabName}')"]`).classList.add('active');

    // Manually trigger data load for non-core tabs if they are empty
    const manualLoadMap = {
        'estimations': { data: state.estimations, loader: loadEstimationsData },
        'jobs': { data: state.jobs, loader: () => loadGenericData('jobs') },
        'quotes': { data: state.quotes, loader: () => loadGenericData('quotes') },
        'messages': { data: state.messages, loader: loadMessagesData },
        'conversations': { data: state.conversations, loader: loadConversationsData }, // New
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
        statsGrid.innerHTML = `
            <div class="stat-card"><h3>${stats.totalUsers || 0}</h3><p>Total Users</p><button class="btn btn-sm" onclick="exportData('users')">Export</button></div>
            <div class="stat-card"><h3>${stats.pendingProfileReviews || 0}</h3><p>Pending Reviews</p><button class="btn btn-sm" onclick="showTab('profile-reviews')">Review</button></div>
            <div class="stat-card"><h3>${stats.totalJobs || 0}</h3><p>Total Jobs</p><button class="btn btn-sm" onclick="exportData('jobs')">Export</button></div>
            <div class="stat-card"><h3>${stats.totalQuotes || 0}</h3><p>Total Quotes</p><button class="btn btn-sm" onclick="exportData('quotes')">Export</button></div>
            <div class="stat-card"><h3>${stats.totalConversations || 0}</h3><p>User Conversations</p><button class="btn btn-sm" onclick="showTab('conversations')">View</button></div>
        `;
    } catch (error) {
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
function initializeRealTimeUpdates() {
    if (typeof WebSocket !== 'undefined') {
        try {
            const ws = new WebSocket(`wss://steelconnect-backend.onrender.com/admin-updates`);
            ws.onmessage = (event) => {
                const update = JSON.parse(event.data);
                switch (update.type) {
                    case 'new_message':
                        showAdvancedNotification('New message received', 'info', 0, [{ text: 'View', callback: () => showTab('messages') }]);
                        break;
                    case 'profile_review':
                        showAdvancedNotification('New profile review pending', 'warning', 0, [{ text: 'Review', callback: () => showTab('profile-reviews') }]);
                        break;
                    case 'estimation_request':
                        showAdvancedNotification('New estimation request', 'info', 0, [{ text: 'View', callback: () => showTab('estimations') }]);
                        break;
                }
            };
            ws.onclose = () => setTimeout(initializeRealTimeUpdates, 5000);
            ws.onerror = () => console.log('WebSocket connection failed.');
        } catch (error) {
            console.log('WebSocket not available.');
        }
    }
}

// --- UTILITY FUNCTIONS ---
// ** ENHANCED FUNCTION **
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






