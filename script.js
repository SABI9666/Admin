// script.js - Complete Enhanced Admin Panel Logic with All Functions

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
    showTab('users');
    
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
    
    // Add action buttons if provided
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
    
    // Add close button
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
    
    // Focus management
    const modalContent = modalContainer.querySelector('.modal-content');
    modalContent.focus();
    
    // Trap focus within modal
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
function validateFileUpload(file, maxSizeMB = 10, allowedTypes = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']) {
    const maxSize = maxSizeMB * 1024 * 1024;
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    if (file.size > maxSize) {
        throw new Error(`File size must be less than ${maxSizeMB}MB`);
    }
    
    if (!allowedTypes.includes(fileExtension)) {
        throw new Error(`File type .${fileExtension} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }
    
    return true;
}

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
        `;
    } catch (error) {
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
                        <td>${user.name}</td>
                        <td>${user.email}</td>
                        <td>${user.role}</td>
                        <td><span class="status ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td><button class="btn ${user.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatus('${user._id}', ${!user.isActive})">${user.isActive ? 'Deactivate' : 'Activate'}</button></td>
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
                        <button class="btn" onclick="viewProfileFiles('${review._id}')">View & Download Files</button>
                        <button class="btn btn-success" onclick="approveProfile('${review._id}')">Approve</button>
                        <button class="btn btn-danger" onclick="showRejectModal('${review._id}')">Reject</button>
                    </div>
                </div>
            `).join('')}
        </div>
        `}`;
}

function viewProfileDetails(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review) {
        showNotification('Could not find the selected profile review.', 'error');
        return;
    }

    const user = review.user;
    const documents = user.documents || [];

    const modalContent = `
        <div class="profile-review-modal">
            <div class="modal-header">
                <div class="header-content">
                    <h3><i class="fas fa-user-check"></i> Profile Review</h3>
                    <span class="status ${review.status}">${review.status}</span>
                </div>
            </div>
            
            <div class="profile-sections">
                <div class="profile-section">
                    <h4><i class="fas fa-user"></i> Personal Information</h4>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Name:</label>
                            <span>${user.name}</span>
                        </div>
                        <div class="info-item">
                            <label>Email:</label>
                            <span>${user.email}</span>
                        </div>
                        <div class="info-item">
                            <label>User Type:</label>
                            <span class="user-type ${user.type}">${user.type}</span>
                        </div>
                        <div class="info-item">
                            <label>Submitted:</label>
                            <span>${new Date(review.submittedAt).toLocaleDateString()}</span>
                        </div>
                        ${user.phone ? `
                            <div class="info-item">
                                <label>Phone:</label>
                                <span>${user.phone}</span>
                            </div>
                        ` : ''}
                        ${user.company ? `
                            <div class="info-item">
                                <label>Company:</label>
                                <span>${user.company}</span>
                            </div>
                        ` : ''}
                        ${user.address ? `
                            <div class="info-item">
                                <label>Address:</label>
                                <span>${user.address}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="profile-section">
                    <h4><i class="fas fa-file-alt"></i> Documents & Files</h4>
                    ${documents.length > 0 ? `
                        <div class="documents-grid">
                            ${documents.map(doc => `
                                <div class="document-card">
                                    <div class="doc-icon">
                                        <i class="fas ${getFileIcon(doc.type)}"></i>
                                    </div>
                                    <div class="doc-info">
                                        <h5>${doc.filename}</h5>
                                        <span class="doc-type">${doc.type}</span>
                                    </div>
                                    <div class="doc-actions">
                                        <a href="${doc.url}" target="_blank" class="btn btn-sm">
                                            <i class="fas fa-eye"></i> View
                                        </a>
                                        <a href="${doc.url}" download="${doc.filename}" class="btn btn-sm btn-primary">
                                            <i class="fas fa-download"></i> Download
                                        </a>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="bulk-download">
                            <button class="btn btn-outline" onclick="downloadAllProfileFiles('${reviewId}')">
                                <i class="fas fa-download"></i> Download All Documents
                            </button>
                        </div>
                    ` : `
                        <div class="no-documents">
                            <i class="fas fa-folder-open"></i>
                            <p>No documents have been uploaded for this profile.</p>
                        </div>
                    `}
                </div>

                ${review.reviewNotes ? `
                    <div class="profile-section">
                        <h4><i class="fas fa-comment"></i> Review Notes</h4>
                        <div class="review-notes">
                            <p>${review.reviewNotes}</p>
                        </div>
                    </div>
                ` : ''}
            </div>

            <div class="review-actions">
                <button class="btn btn-success" onclick="approveProfileWithComment('${reviewId}')">
                    <i class="fas fa-check"></i> Approve Profile
                </button>
                <button class="btn btn-danger" onclick="showRejectModal('${reviewId}')">
                    <i class="fas fa-times"></i> Reject Profile
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
            </div>
        </div>
    `;
    
    showModal(modalContent);
}

function approveProfileWithComment(reviewId) {
    const modalContent = `
        <div class="approval-modal">
            <div class="modal-header">
                <h3><i class="fas fa-check-circle"></i> Approve Profile</h3>
            </div>
            <div class="approval-form">
                <p>You are about to approve this user's profile. This will grant them full access to the platform.</p>
                <div class="form-group">
                    <label for="approval-comments"><i class="fas fa-comment"></i> Admin Comments (Optional)</label>
                    <textarea id="approval-comments" rows="3" placeholder="Add any comments for the user or internal notes..."></textarea>
                </div>
                <div class="approval-actions">
                    <button class="btn btn-success" onclick="confirmApproveProfile('${reviewId}')">
                        <i class="fas fa-check"></i> Confirm Approval
                    </button>
                    <button class="btn btn-secondary" onclick="viewProfileDetails('${reviewId}')">
                        <i class="fas fa-arrow-left"></i> Back to Profile
                    </button>
                </div>
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
        <div class="rejection-modal">
            <div class="modal-header">
                <h3><i class="fas fa-exclamation-triangle"></i> Reject Profile</h3>
            </div>
            <div class="rejection-form">
                <div class="warning-notice">
                    <i class="fas fa-info-circle"></i>
                    <p>The user will receive your feedback and can resubmit their profile after making corrections. They will maintain limited access to the platform.</p>
                </div>
                
                <div class="form-group">
                    <label for="rejection-reason"><i class="fas fa-edit"></i> Reason for Rejection *</label>
                    <textarea id="rejection-reason" rows="4" placeholder="Please provide specific reasons for rejection and guidance for improvement..." required></textarea>
                    <small class="field-help">Be specific about what needs to be corrected or improved.</small>
                </div>
                
                <div class="form-group">
                    <label for="rejection-category"><i class="fas fa-tag"></i> Category</label>
                    <select id="rejection-category">
                        <option value="documents">Missing/Invalid Documents</option>
                        <option value="information">Incomplete Information</option>
                        <option value="verification">Verification Issues</option>
                        <option value="compliance">Compliance Issues</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                
                <div class="rejection-actions">
                    <button class="btn btn-danger" onclick="confirmRejectProfile('${reviewId}')">
                        <i class="fas fa-times"></i> Confirm Rejection
                    </button>
                    <button class="btn btn-secondary" onclick="viewProfileDetails('${reviewId}')">
                        <i class="fas fa-arrow-left"></i> Back to Profile
                    </button>
                </div>
            </div>
        </div>
    `;
    
    showModal(modalContent);
}

async function confirmRejectProfile(reviewId) {
    const reason = document.getElementById('rejection-reason').value;
    const category = document.getElementById('rejection-category').value;
    
    if (!reason.trim()) {
        showNotification('Rejection reason is required.', 'warning');
        return;
    }
    
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/reject`, 'POST', { 
            reason: sanitizeInput(reason),
            category,
            adminComments: `Category: ${category}\n\nReason: ${sanitizeInput(reason)}`
        });
        showNotification(data.message, 'success');
        closeModal();
        await Promise.all([loadProfileReviewsData(), loadDashboardStats()]);
    } catch (error) {}
}

function downloadAllProfileFiles(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review || !review.user.documents) {
        showNotification('No files available for download.', 'warning');
        return;
    }

    const documents = review.user.documents;
    documents.forEach((doc, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = doc.url;
            link.download = doc.filename || `document_${index + 1}`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 500);
    });

    showNotification(`Downloading ${documents.length} files...`, 'success');
}

function viewProfileFiles(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review) {
        showNotification('Could not find the selected profile review.', 'error');
        return;
    }

    const documents = review.user.documents || [];
    
    let filesHtml = '<h4>No documents uploaded.</h4>';
    if (documents.length > 0) {
        filesHtml = `
            <h4>Uploaded Documents:</h4>
            <div class="file-actions">
                <button class="btn btn-primary" onclick="downloadAllFiles('${reviewId}')">
                    <i class="fas fa-download"></i> Download All Files
                </button>
            </div>
            <ul class="file-list">
                ${documents.map((doc, index) => `
                    <li>
                        <div class="file-item">
                            <div class="file-info">
                                <i class="fas fa-file-alt"></i> 
                                <span class="file-name">${doc.filename || `Document ${index + 1}`}</span>
                            </div>
                            <div class="file-actions-inline">
                                <a href="${doc.url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm">
                                    <i class="fas fa-eye"></i> View
                                </a>
                                <a href="${doc.url}" download="${doc.filename || `document_${index + 1}`}" class="btn btn-sm btn-success">
                                    <i class="fas fa-download"></i> Download
                                </a>
                            </div>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    const modalContent = `
        <div class="modal-body">
            <h3>Files for ${review.user.name}</h3>
            <p><strong>Email:</strong> ${review.user.email}</p>
            <p><strong>User Type:</strong> ${review.user.type}</p>
            <hr>
            ${filesHtml}
        </div>
    `;
    
    showModal(modalContent);
}

function downloadAllFiles(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review || !review.user.documents) {
        showNotification('No files available for download.', 'warning');
        return;
    }

    const documents = review.user.documents;
    documents.forEach((doc, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = doc.url;
            link.download = doc.filename || `document_${index + 1}`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 500);
    });

    showNotification(`Downloading ${documents.length} files...`, 'success');
}

async function approveProfile(reviewId) {
    if (!confirm('Are you sure you want to approve this profile?')) return;
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/approve`, 'POST');
        showNotification(data.message, 'success');
        await Promise.all([loadProfileReviewsData(), loadDashboardStats()]);
    } catch (error) {}
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
            <thead><tr><th>Project</th><th>User Details</th><th>Status</th><th>Files</th><th>Result</th><th>Actions</th></tr></thead>
            <tbody>
                ${state.estimations.map(est => `
                    <tr>
                        <td>${est.projectName || 'N/A'}</td>
                        <td>
                            ${est.user ? 
                                `<strong>${est.user.name || 'N/A'}</strong><br>
                                 <small><i class="fas fa-envelope"></i> ${est.user.email || 'N/A'}</small><br>
                                 <small><i class="fas fa-user-tag"></i> ${est.user.type || 'N/A'}</small><br>
                                 <button class="btn btn-sm btn-info" onclick="viewEstimationUserDetails('${est._id}')">View Details</button>` 
                                : 
                                `<span class="text-muted">User data unavailable</span><br>
                                 <small><i class="fas fa-envelope"></i> ${est.userEmail || 'N/A'}</small>`
                            }
                        </td>
                        <td><span class="status ${est.status}">${est.status}</span></td>
                        <td>
                            ${(est.uploadedFiles && est.uploadedFiles.length > 0) ? 
                            `<button class="btn btn-sm" onclick="showEstimationFiles('${est._id}')">View Files (${est.uploadedFiles.length})</button>` : 
                            'No files'}
                        </td>
                        <td>${est.resultFile ? `<a href="${est.resultFile.url}" target="_blank">View</a>` : 'Not uploaded'}</td>
                        <td>
                            <button class="btn btn-sm" onclick="showUploadResultModal('${est._id}')">Upload/Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteEstimation('${est._id}')">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

function viewEstimationUserDetails(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation || !estimation.user) {
        showNotification('Could not find user details for this estimation.', 'error');
        return;
    }

    const user = estimation.user;
    const modalContent = `
        <div class="modal-body">
            <h3>User Details for Estimation</h3>
            <div class="user-details">
                <h4><i class="fas fa-user"></i> ${user.name || 'N/A'}</h4>
                <p><strong><i class="fas fa-envelope"></i> Email:</strong> ${user.email || 'N/A'}</p>
                <p><strong><i class="fas fa-user-tag"></i> User Type:</strong> ${user.type || 'N/A'}</p>
                <p><strong><i class="fas fa-toggle-${user.isActive ? 'on' : 'off'}"></i> Status:</strong> 
                   <span class="status ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span>
                </p>
                <p><strong><i class="fas fa-calendar"></i> User Created:</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
                ${user.phone ? `<p><strong><i class="fas fa-phone"></i> Phone:</strong> ${user.phone}</p>` : ''}
                ${user.company ? `<p><strong><i class="fas fa-building"></i> Company:</strong> ${user.company}</p>` : ''}
            </div>
            <hr>
            <div class="estimation-details">
                <h4><i class="fas fa-calculator"></i> Estimation Details</h4>
                <p><strong>Project Name:</strong> ${estimation.projectName || 'N/A'}</p>
                <p><strong>Status:</strong> <span class="status ${estimation.status}">${estimation.status}</span></p>
                <p><strong>Submitted:</strong> ${estimation.createdAt ? new Date(estimation.createdAt).toLocaleDateString() : 'N/A'}</p>
                ${estimation.description ? `<p><strong>Description:</strong> ${estimation.description}</p>` : ''}
            </div>
            <div class="modal-actions">
                <a href="mailto:${user.email}" class="btn btn-primary">
                    <i class="fas fa-envelope"></i> Send Email
                </a>
                ${user.phone ? `<a href="tel:${user.phone}" class="btn btn-success">
                    <i class="fas fa-phone"></i> Call User
                </a>` : ''}
            </div>
        </div>
    `;
    
    showModal(modalContent);
}

function showEstimationFiles(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation) {
        showNotification('Could not find the selected estimation.', 'error');
        return;
    }

    const files = estimation.uploadedFiles || [];
    const user = estimation.user;
    
    let filesHtml = `
        <div class="no-files-message">
            <i class="fas fa-folder-open"></i>
            <h4>No Documents Available</h4>
            <p>No files have been uploaded for this estimation project.</p>
        </div>
    `;
    
    if (files.length > 0) {
        filesHtml = `
            <div class="files-summary">
                <div class="summary-stats">
                    <div class="stat-item">
                        <i class="fas fa-file"></i>
                        <span>${files.length} Files</span>
                    </div>
                    <div class="stat-item">
                        <i class="fas fa-hdd"></i>
                        <span>${formatFileSize(files.reduce((total, file) => total + (file.size || 0), 0))}</span>
                    </div>
                </div>
                <div class="bulk-actions">
                    <button class="btn btn-primary" onclick="downloadAllEstimationFiles('${estimationId}')">
                        <i class="fas fa-download"></i> Download All Files
                    </button>
                </div>
            </div>
            <div class="files-grid">
                ${files.map((file, index) => `
                    <div class="file-card">
                        <div class="file-icon">
                            <i class="fas ${getFileIcon(file.type || file.mimetype)}"></i>
                        </div>
                        <div class="file-info">
                            <h5 class="file-name" title="${file.originalname || file.name}">${truncateFileName(file.originalname || file.name, 25)}</h5>
                            <div class="file-meta">
                                <span class="file-size">${formatFileSize(file.size)}</span>
                                <span class="file-date">${new Date(file.uploadedAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div class="file-actions">
                            <a href="${file.url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline">
                                <i class="fas fa-eye"></i> View
                            </a>
                            <a href="${file.url}" download="${file.originalname || file.name}" class="btn btn-sm btn-primary">
                                <i class="fas fa-download"></i> Download
                            </a>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const modalContent = `
        <div class="estimation-files-modal">
            <div class="modal-header">
                <div class="header-content">
                    <h3><i class="fas fa-folder"></i> Project Files</h3>
                    <span class="project-name">${estimation.projectName || 'Unnamed Project'}</span>
                </div>
            </div>
            <div class="project-info">
                <div class="info-grid">
                    <div class="info-item">
                        <label><i class="fas fa-user"></i> Client:</label>
                        <span>${user ? user.name : estimation.userName || 'Unknown'}</span>
                    </div>
                    <div class="info-item">
                        <label><i class="fas fa-envelope"></i> Email:</label>
                        <span>${user ? user.email : estimation.userEmail || 'Unknown'}</span>
                    </div>
                    <div class="info-item">
                        <label><i class="fas fa-calendar"></i> Submitted:</label>
                        <span>${new Date(estimation.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div class="info-item">
                        <label><i class="fas fa-flag"></i> Status:</label>
                        <span class="status ${estimation.status}">${estimation.status}</span>
                    </div>
                </div>
                ${estimation.description ? `
                    <div class="project-description">
                        <label><i class="fas fa-align-left"></i> Description:</label>
                        <p>${estimation.description}</p>
                    </div>
                ` : ''}
            </div>
            <div class="files-section">
                <h4><i class="fas fa-paperclip"></i> Uploaded Files</h4>
                ${filesHtml}
            </div>
        </div>
    `;
    
    showModal(modalContent);
}

function downloadAllEstimationFiles(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation || !estimation.uploadedFiles) {
        showNotification('No files available for download.', 'warning');
        return;
    }

    const files = estimation.uploadedFiles;
    files.forEach((file, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = file.url;
            link.download = file.originalname || file.name || `file_${index + 1}`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 500);
    });

    showNotification(`Downloading ${files.length} files...`, 'success');
}

function showUploadResultModal(estimationId) {
    showModal(`
        <div class="modal-body">
            <h3>Upload Estimation Result</h3>
            <p>This will overwrite any existing result.</p>
            <div class="form-group">
                <label for="result-file-input">Select Result File:</label>
                <input type="file" id="result-file-input" accept=".pdf,.doc,.docx,.txt,.xlsx,.xls">
            </div>
            <div class="modal-actions">
                <button class="btn btn-success" onclick="uploadEstimationResult('${estimationId}')">Upload File</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `);
}

async function uploadEstimationResult(estimationId) {
    const fileInput = document.getElementById('result-file-input');
    if (!fileInput.files[0]) {
        showNotification('Please select a file.', 'warning');
        return;
    }
    
    try {
        validateFileUpload(fileInput.files[0], 50); // 50MB limit for result files
        
        const formData = new FormData();
        formData.append('resultFile', fileInput.files[0]);
        
        const data = await apiCall(`/estimations/${estimationId}/result`, 'POST', formData, true);
        showNotification(data.message, 'success');
        closeModal();
        await loadEstimationsData();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function deleteEstimation(estimationId) {
    if (!confirm('Are you sure you want to delete this estimation request?')) return;
    try {
        const data = await apiCall(`/estimations/${estimationId}`, 'DELETE');
        showNotification(data.message, 'success');
        await loadEstimationsData();
    } catch (error) {}
}

// --- ENHANCED MESSAGE MANAGEMENT ---
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
            <div class="header-actions">
                <button class="btn" onclick="loadMessagesData()">Refresh</button>
                <button class="btn btn-primary" onclick="exportData('messages')">Export</button>
            </div>
        </div>
        <div class="message-filters">
            <button class="btn btn-sm ${!getCurrentFilter() ? 'active' : ''}" onclick="filterMessages('')">All</button>
            <button class="btn btn-sm ${getCurrentFilter() === 'unread' ? 'active' : ''}" onclick="filterMessages('unread')">Unread</button>
            <button class="btn btn-sm ${getCurrentFilter() === 'replied' ? 'active' : ''}" onclick="filterMessages('replied')">Replied</button>
            <button class="btn btn-sm ${getCurrentFilter() === 'blocked' ? 'active' : ''}" onclick="filterMessages('blocked')">Blocked</button>
        </div>
        <table class="message-table">
            <thead>
                <tr>
                    <th>From</th>
                    <th>Subject</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${getFilteredMessages().map(message => `
                    <tr class="message-row ${message.status === 'unread' ? 'unread' : ''}">
                        <td>
                            <div class="sender-info">
                                <strong>${message.senderName || 'Unknown'}</strong>
                                <small>${message.senderEmail}</small>
                            </div>
                        </td>
                        <td class="subject-cell">${message.subject || 'No Subject'}</td>
                        <td>${new Date(message.createdAt).toLocaleDateString()}</td>
                        <td>
                            <span class="status ${message.status}">${message.status}</span>
                        </td>
                        <td class="action-buttons">
                            <button class="btn btn-sm" onclick="viewMessage('${message._id}')">
                                <i class="fas fa-eye"></i> View
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="replyToMessage('${message._id}')">
                                <i class="fas fa-reply"></i> Reply
                            </button>
                            <button class="btn btn-sm ${message.status === 'blocked' ? 'btn-success' : 'btn-warning'}" onclick="toggleBlockMessage('${message._id}', '${message.status !== 'blocked'}')">
                                <i class="fas fa-${message.status === 'blocked' ? 'unlock' : 'ban'}"></i> ${message.status === 'blocked' ? 'Unblock' : 'Block'}
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteMessage('${message._id}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function getCurrentFilter() {
    return window.currentMessageFilter || '';
}

function filterMessages(status) {
    window.currentMessageFilter = status;
    renderMessagesTab();
}

function getFilteredMessages() {
    const filter = getCurrentFilter();
    if (!filter) return state.messages;
    return state.messages.filter(msg => msg.status === filter);
}

function viewMessage(messageId) {
    const message = state.messages.find(m => m._id === messageId);
    if (!message) {
        showNotification('Message not found.', 'error');
        return;
    }

    // Mark as read if it's unread
    if (message.status === 'unread') {
        markMessageAsRead(messageId);
    }

    const modalContent = `
        <div class="message-modal">
            <div class="message-header">
                <h3><i class="fas fa-envelope"></i> Message Details</h3>
                <span class="status ${message.status}">${message.status}</span>
            </div>
            <div class="message-details">
                <div class="detail-row">
                    <label><i class="fas fa-user"></i> From:</label>
                    <span>${message.senderName || 'Unknown'} (${message.senderEmail})</span>
                </div>
                <div class="detail-row">
                    <label><i class="fas fa-envelope"></i> To:</label>
                    <span>${message.recipientName || 'Admin'} (${message.recipientEmail || 'admin@steelconnect.com'})</span>
                </div>
                <div class="detail-row">
                    <label><i class="fas fa-calendar"></i> Date:</label>
                    <span>${new Date(message.createdAt).toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <label><i class="fas fa-tag"></i> Subject:</label>
                    <span>${message.subject || 'No Subject'}</span>
                </div>
                <div class="detail-row">
                    <label><i class="fas fa-list"></i> Type:</label>
                    <span>${message.messageType || 'General'}</span>
                </div>
            </div>
            <div class="message-content">
                <h4><i class="fas fa-file-text"></i> Message Content</h4>
                <div class="content-box">${message.content || 'No content available'}</div>
            </div>
            ${message.attachments && message.attachments.length > 0 ? `
                <div class="message-attachments">
                    <h4><i class="fas fa-paperclip"></i> Attachments</h4>
                    <ul class="file-list">
                        ${message.attachments.map(attachment => `
                            <li>
                                <a href="${attachment.url}" target="_blank" rel="noopener noreferrer">
                                    <i class="fas fa-file"></i> ${attachment.filename}
                                </a>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}
            <div class="message-actions">
                <button class="btn btn-primary" onclick="replyToMessage('${messageId}')">
                    <i class="fas fa-reply"></i> Reply
                </button>
                <button class="btn btn-warning" onclick="toggleBlockMessage('${messageId}', '${message.status !== 'blocked'}')">
                    <i class="fas fa-ban"></i> ${message.status === 'blocked' ? 'Unblock Sender' : 'Block Sender'}
                </button>
                <button class="btn btn-danger" onclick="deleteMessage('${messageId}')">
                    <i class="fas fa-trash"></i> Delete Message
                </button>
            </div>
        </div>
    `;
    
    showModal(modalContent);
}

async function markMessageAsRead(messageId) {
    try {
        await apiCall(`/messages/${messageId}/read`, 'PATCH');
        // Update local state
        const message = state.messages.find(m => m._id === messageId);
        if (message && message.status === 'unread') {
            message.status = 'read';
            // Update UI if messages tab is active
            if (document.getElementById('messages-tab').classList.contains('active')) {
                renderMessagesTab();
            }
        }
    } catch (error) {
        console.error('Failed to mark message as read:', error);
    }
}

function replyToMessage(messageId) {
    const message = state.messages.find(m => m._id === messageId);
    if (!message) {
        showNotification('Message not found.', 'error');
        return;
    }

    const modalContent = `
        <div class="reply-modal">
            <div class="reply-header">
                <h3><i class="fas fa-reply"></i> Reply to Message</h3>
            </div>
            <div class="original-message">
                <h4>Original Message</h4>
                <div class="original-details">
                    <p><strong>From:</strong> ${message.senderName} (${message.senderEmail})</p>
                    <p><strong>Subject:</strong> ${message.subject}</p>
                    <p><strong>Message:</strong></p>
                    <div class="original-content">${message.content}</div>
                </div>
            </div>
            <div class="reply-form">
                <div class="form-group">
                    <label for="reply-subject"><i class="fas fa-tag"></i> Subject</label>
                    <input type="text" id="reply-subject" value="Re: ${message.subject}" class="form-input">
                </div>
                <div class="form-group">
                    <label for="reply-content"><i class="fas fa-edit"></i> Reply Message</label>
                    <textarea id="reply-content" rows="6" class="form-textarea" placeholder="Type your reply here..."></textarea>
                </div>
                <div class="reply-actions">
                    <button class="btn btn-primary" onclick="sendReply('${messageId}')">
                        <i class="fas fa-paper-plane"></i> Send Reply
                    </button>
                    <button class="btn btn-secondary" onclick="closeModal()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    showModal(modalContent);
}

async function sendReply(messageId) {
    const subject = document.getElementById('reply-subject').value;
    const content = document.getElementById('reply-content').value;
    
    if (!content.trim()) {
        showNotification('Reply content is required.', 'warning');
        return;
    }

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

async function toggleBlockMessage(messageId, block) {
    const action = block ? 'block' : 'unblock';
    if (!confirm(`Are you sure you want to ${action} this sender?`)) return;
    
    try {
        const data = await apiCall(`/messages/${messageId}/status`, 'PATCH', {
            status: block ? 'blocked' : 'unread',
            adminNotes: `Sender ${action}ed by admin`
        });
        showNotification(data.message, 'success');
        await loadMessagesData();
    } catch (error) {}
}

async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
        const data = await apiCall(`/messages/${messageId}`, 'DELETE');
        showNotification(data.message, 'success');
        await loadMessagesData();
    } catch (error) {}
}

async function bulkDeleteMessages(messageIds) {
    if (!messageIds.length) {
        showNotification('No messages selected for deletion.', 'warning');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${messageIds.length} messages?`)) {
        return;
    }
    
    try {
        const data = await apiCall('/messages/bulk-delete', 'POST', { messageIds });
        showNotification(data.message, 'success');
        await loadMessagesData();
    } catch (error) {
        showNotification('Failed to delete messages.', 'error');
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
    const headers = { jobs: ['Job ID', 'User', 'Status'], quotes: ['Quote ID', 'User', 'Status'] };
    container.innerHTML = `
        <div class="section-header">
            <h3>All ${type.charAt(0).toUpperCase() + type.slice(1)} (${items.length})</h3>
            <div class="header-actions">
                <button class="btn" onclick="loadGenericData('${type}')">Refresh</button>
                <button class="btn btn-primary" onclick="exportData('${type}')">Export</button>
            </div>
        </div>
        <table>
            <thead><tr><th>${headers[type][0]}</th><th>${headers[type][1]}</th><th>${headers[type][2]}</th><th>Actions</th></tr></thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${item._id.slice(-6)}</td>
                        <td>${item.userEmail || item.clientEmail || 'N/A'}</td>
                        <td>${item.status || 'N/A'}</td>
                        <td><button class="btn btn-sm btn-danger" onclick="deleteGenericItem('${type}', '${item._id}')">Delete</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
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
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Export failed');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${dataType}_export_${new Date().toISOString().split('T')[0]}.${format}`;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        showNotification('Export completed successfully!', 'success');
    } catch (error) {
        showNotification('Export failed. Please try again.', 'error');
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
                        showAdvancedNotification('New message received', 'info', 0, [
                            { text: 'View', callback: () => showTab('messages') }
                        ]);
                        break;
                    case 'profile_review':
                        showAdvancedNotification('New profile review pending', 'warning', 0, [
                            { text: 'Review', callback: () => showTab('profile-reviews') }
                        ]);
                        break;
                    case 'estimation_request':
                        showAdvancedNotification('New estimation request', 'info', 0, [
                            { text: 'View', callback: () => showTab('estimations') }
                        ]);
                        break;
                }
            };
            
            ws.onclose = () => {
                // Attempt to reconnect after 5 seconds
                setTimeout(initializeRealTimeUpdates, 5000);
            };
            
            ws.onerror = () => {
                console.log('WebSocket connection failed, continuing without real-time updates');
            };
        } catch (error) {
            console.log('WebSocket not available, continuing without real-time updates');
        }
    }
}

// --- UTILITY FUNCTIONS ---
function getFileIcon(mimeType) {
    if (!mimeType) return 'fa-file';
    if (mimeType.includes('pdf')) return 'fa-file-pdf';
    if (mimeType.includes('image')) return 'fa-file-image';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
    if (mimeType.includes('text')) return 'fa-file-alt';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'fa-file-archive';
    return 'fa-file';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function truncateFileName(fileName, maxLength) {
    if (!fileName || fileName.length <= maxLength) return fileName;
    const extension = fileName.split('.').pop();
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 4) + '...';
    return truncatedName + '.' + extension;
}
