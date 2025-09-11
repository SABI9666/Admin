// script.js - Complete, robust frontend logic for the Admin Panel

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
    const options = {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
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

function showLoader(container) { container.innerHTML = `<div class="loader">Loading...</div>`; }

function showModal(content) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="closeModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <button class="modal-close" onclick="closeModal()">&times;</button>
                ${content}
            </div>
        </div>`;
}

function closeModal() { document.getElementById('modal-container').innerHTML = ''; }

// --- TAB NAVIGATION ---
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`.tab[onclick="showTab('${tabName}')"]`).classList.add('active');

    // Updated manual load map with correct message handling
    const manualLoadMap = {
        'estimations': { data: state.estimations, loader: loadEstimationsData },
        'jobs': { data: state.jobs, loader: () => loadGenericData('jobs') },
        'quotes': { data: state.quotes, loader: () => loadGenericData('quotes') },
        'messages': { data: state.messages, loader: loadMessagesData }, // Use dedicated message loader
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
            <div class="stat-card"><h3>${stats.totalUsers || 0}</h3><p>Total Users</p></div>
            <div class="stat-card"><h3>${stats.pendingProfileReviews || 0}</h3><p>Pending Reviews</p></div>
            <div class="stat-card"><h3>${stats.totalJobs || 0}</h3><p>Total Jobs</p></div>
            <div class="stat-card"><h3>${stats.totalQuotes || 0}</h3><p>Total Quotes</p></div>
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
        <div class="section-header"><h3>All Users (${state.users.length})</h3><button class="btn" onclick="loadUsersData()">Refresh</button></div>
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

// --- ENHANCED PROFILE REVIEW FUNCTIONS ---
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
        <div class="section-header">
            <h3>Pending Reviews (${pendingReviews.length})</h3>
            <button class="btn" onclick="loadProfileReviewsData()">Refresh</button>
        </div>
        ${pendingReviews.length === 0 ? '<p>No pending profile reviews.</p>' : `
        <div class="review-grid">
            ${pendingReviews.map(review => `
                <div class="review-card">
                    <h4>${review.user.name} (${review.user.type})</h4>
                    <p><strong>Email:</strong> ${review.user.email}</p>
                    <p><strong>Company:</strong> ${review.user.company || 'N/A'}</p>
                    <p><strong>Phone:</strong> ${review.user.phone || 'N/A'}</p>
                    <div class="actions">
                        <button class="btn btn-info" onclick="viewProfileDetails('${review._id}')">View Details</button>
                        <button class="btn btn-success" onclick="showApprovalModal('${review._id}')">Approve</button>
                        <button class="btn btn-danger" onclick="showRejectModal('${review._id}')">Reject</button>
                    </div>
                </div>
            `).join('')}
        </div>
        `}`;
}

function viewProfileDetails(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review) return;

    showModal(`
        <h3>Profile Details - ${review.user.name}</h3>
        <div class="profile-details">
            <div class="detail-section">
                <h4>Basic Information</h4>
                <p><strong>Name:</strong> ${review.user.name}</p>
                <p><strong>Email:</strong> ${review.user.email}</p>
                <p><strong>Type:</strong> ${review.user.type}</p>
                <p><strong>Phone:</strong> ${review.user.phone || 'N/A'}</p>
                <p><strong>Company:</strong> ${review.user.company || 'N/A'}</p>
                <p><strong>Address:</strong> ${review.user.address || 'N/A'}</p>
            </div>
            <div class="detail-section">
                <h4>Uploaded Files</h4>
                ${review.files.resume ? `<p><a href="${review.files.resume.url}" target="_blank">📄 Resume: ${review.files.resume.name}</a></p>` : '<p>No resume uploaded</p>'}
                ${review.files.businessLicense ? `<p><a href="${review.files.businessLicense.url}" target="_blank">📋 Business License: ${review.files.businessLicense.name}</a></p>` : '<p>No business license uploaded</p>'}
                ${review.files.insurance ? `<p><a href="${review.files.insurance.url}" target="_blank">🛡️ Insurance: ${review.files.insurance.name}</a></p>` : '<p>No insurance uploaded</p>'}
                ${review.files.certifications && review.files.certifications.length > 0 ?
                    review.files.certifications.map(cert => `<p><a href="${cert.url}" target="_blank">🎓 Certification: ${cert.name}</a></p>`).join('') :
                    '<p>No certifications uploaded</p>'}
            </div>
            ${review.reviewNotes ? `
            <div class="detail-section">
                <h4>Previous Rejection Notes</h4>
                <p class="rejection-notes">${review.reviewNotes}</p>
            </div>
            ` : ''}
        </div>
    `);
}

function showApprovalModal(reviewId) {
    showModal(`
        <h3>Approve Profile</h3>
        <p>Add any comments for the user (optional):</p>
        <textarea id="approval-comments" rows="3" placeholder="Welcome to SteelConnect! Your profile has been approved."></textarea>
        <div class="modal-actions">
            <button class="btn btn-success" onclick="approveProfile('${reviewId}')">Approve Profile</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
    `);
}

function showRejectModal(reviewId) {
    showModal(`
        <h3>Reject Profile</h3>
        <p>Provide a reason for rejection. The user will see this comment and be able to log in to resubmit.</p>
        <textarea id="rejection-reason" rows="4" placeholder="e.g., Please upload a clearer copy of your business license." required></textarea>
        <p>Additional admin comments (optional):</p>
        <textarea id="rejection-comments" rows="3" placeholder="Internal notes for admin use"></textarea>
        <div class="modal-actions">
            <button class="btn btn-danger" onclick="rejectProfile('${reviewId}')">Submit Rejection</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
    `);
}

async function approveProfile(reviewId) {
    const comments = document.getElementById('approval-comments').value;
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/approve`, 'POST', { adminComments: comments });
        showNotification(data.message, 'success');
        closeModal();
        await Promise.all([loadProfileReviewsData(), loadDashboardStats()]);
    } catch (error) {}
}

async function rejectProfile(reviewId) {
    const reason = document.getElementById('rejection-reason').value;
    const comments = document.getElementById('rejection-comments').value;
    if (!reason.trim()) return showNotification('Rejection reason is required.', 'warning');
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/reject`, 'POST', { reason, adminComments: comments });
        showNotification(data.message, 'success');
        closeModal();
        await Promise.all([loadProfileReviewsData(), loadDashboardStats()]);
    } catch (error) {}
}


// --- ENHANCED ESTIMATIONS FUNCTIONS ---
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
            <button class="btn" onclick="loadEstimationsData()">Refresh</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Project</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>Files</th>
                    <th>Result</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${state.estimations.map(est => `
                    <tr>
                        <td>
                            <strong>${est.projectName || 'N/A'}</strong>
                            ${est.projectDescription ? `<br><small>${est.projectDescription.substring(0, 50)}...</small>` : ''}
                        </td>
                        <td>
                            ${est.userName || 'N/A'}<br>
                            <small>${est.userEmail}</small>
                        </td>
                        <td><span class="status ${est.status}">${est.status}</span></td>
                        <td>
                            ${(est.uploadedFiles || []).length} file(s)
                            ${est.uploadedFiles && est.uploadedFiles.length > 0 ?
                                 `<br><button class="btn btn-sm" onclick="viewEstimationFiles('${est._id}')">View Files</button>` :
                                 ''}
                        </td>
                        <td>
                            ${est.resultFile ?
                                 `<a href="${est.resultFile.url}" target="_blank" class="btn btn-sm">Download Result</a>` :
                                 'Not uploaded'}
                        </td>
                        <td>
                            <button class="btn btn-sm" onclick="showUploadResultModal('${est._id}')">Upload/Edit Result</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteEstimation('${est._id}')">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

function viewEstimationFiles(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation || !estimation.uploadedFiles) return;

    showModal(`
        <h3>Estimation Files - ${estimation.projectName}</h3>
        <div class="files-list">
            ${estimation.uploadedFiles.map((file, index) => `
                <div class="file-item">
                    <span class="file-name">📁 ${file.name}</span>
                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-primary">Download</a>
                </div>
            `).join('')}
        </div>
        <div class="project-details">
            <h4>Project Description</h4>
            <p>${estimation.projectDescription || 'No description provided'}</p>
        </div>
    `);
}

function showUploadResultModal(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    showModal(`
        <h3>Upload Estimation Result</h3>
        <p><strong>Project:</strong> ${estimation?.projectName || 'N/A'}</p>
        <p><strong>User:</strong> ${estimation?.userName || 'N/A'}</p>
        ${estimation?.resultFile ? '<p class="warning">⚠️ This will overwrite the existing result file.</p>' : ''}
        <input type="file" id="result-file-input" accept=".pdf,.doc,.docx,.xls,.xlsx">
        <div class="modal-actions">
            <button class="btn btn-success" onclick="uploadEstimationResult('${estimationId}')">Upload File</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
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
    if (!confirm('Are you sure you want to delete this estimation request?')) return;
    try {
        const data = await apiCall(`/estimations/${estimationId}`, 'DELETE');
        showNotification(data.message, 'success');
        await loadEstimationsData();
    } catch (error) {}
}

// --- ENHANCED MESSAGES FUNCTIONS ---
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
    container.innerHTML = `
        <div class="section-header">
            <h3>All Messages (${state.messages.length})</h3>
            <button class="btn" onclick="loadMessagesData()">Refresh</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Subject</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${state.messages.map(msg => `
                    <tr class="${msg.status === 'unread' ? 'unread' : ''}">
                        <td>
                            <strong>${msg.senderName || 'N/A'}</strong><br>
                            <small>${msg.senderEmail}</small>
                        </td>
                        <td>
                            <strong>${msg.recipientName || 'N/A'}</strong><br>
                            <small>${msg.recipientEmail}</small>
                        </td>
                        <td>
                            <strong>${msg.subject || 'No Subject'}</strong><br>
                            <small>${(msg.content || '').substring(0, 50)}...</small>
                        </td>
                        <td><span class="message-type">${msg.messageType || 'general'}</span></td>
                        <td><span class="status ${msg.status}">${msg.status || 'unknown'}</span></td>
                        <td>${new Date(msg.createdAt).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-sm" onclick="viewMessage('${msg._id}')">View</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteMessage('${msg._id}')">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

async function viewMessage(messageId) {
    try {
        const { message } = await apiCall(`/messages/${messageId}`);
        showModal(`
            <h3>Message Details</h3>
            <div class="message-details">
                <div class="message-header">
                    <p><strong>From:</strong> ${message.senderName || 'N/A'} (${message.senderEmail})</p>
                    <p><strong>To:</strong> ${message.recipientName || 'N/A'} (${message.recipientEmail})</p>
                    <p><strong>Subject:</strong> ${message.subject || 'No Subject'}</p>
                    <p><strong>Date:</strong> ${new Date(message.createdAt).toLocaleString()}</p>
                    <p><strong>Type:</strong> ${message.messageType || 'general'}</p>
                    <p><strong>Status:</strong> <span class="status ${message.status}">${message.status}</span></p>
                </div>
                <div class="message-content">
                    <h4>Message Content</h4>
                    <div class="content-box">${message.content || message.message || 'No content'}</div>
                </div>
                ${message.attachments && message.attachments.length > 0 ? `
                <div class="message-attachments">
                    <h4>Attachments</h4>
                    ${message.attachments.map(att => `
                        <div class="attachment-item">
                            <a href="${att.url}" target="_blank">${att.name}</a>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                ${message.adminNotes ? `
                <div class="admin-notes">
                    <h4>Admin Notes</h4>
                    <p>${message.adminNotes}</p>
                </div>
                ` : ''}
            </div>
            <div class="message-actions">
                <button class="btn btn-primary" onclick="showReplyModal('${messageId}')">Reply</button>
                <button class="btn btn-warning" onclick="showUpdateStatusModal('${messageId}')">Update Status</button>
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load message details', 'error');
    }
}

function showReplyModal(messageId) {
    const message = state.messages.find(m => m._id === messageId);
    showModal(`
        <h3>Reply to Message</h3>
        <p><strong>To:</strong> ${message.senderName} (${message.senderEmail})</p>
        <div class="form-group">
            <label>Subject:</label>
            <input type="text" id="reply-subject" value="Re: ${message.subject || 'Your Message'}" class="form-control">
        </div>
        <div class="form-group">
            <label>Reply Content:</label>
            <textarea id="reply-content" rows="6" class="form-control" placeholder="Type your reply here..."></textarea>
        </div>
        <div class="modal-actions">
            <button class="btn btn-primary" onclick="sendReply('${messageId}')">Send Reply</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
    `);
}

function showUpdateStatusModal(messageId) {
    showModal(`
        <h3>Update Message Status</h3>
        <div class="form-group">
            <label>Status:</label>
            <select id="message-status" class="form-control">
                <option value="unread">Unread</option>
                <option value="read">Read</option>
                <option value="replied">Replied</option>
                <option value="resolved">Resolved</option>
                <option value="archived">Archived</option>
            </select>
        </div>
        <div class="form-group">
            <label>Admin Notes:</label>
            <textarea id="admin-notes" rows="3" class="form-control" placeholder="Add internal notes about this message..."></textarea>
        </div>
        <div class="modal-actions">
            <button class="btn btn-warning" onclick="updateMessageStatus('${messageId}')">Update Status</button>
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        </div>
    `);
}

async function sendReply(messageId) {
    const subject = document.getElementById('reply-subject').value;
    const content = document.getElementById('reply-content').value;

    if (!content.trim()) return showNotification('Reply content is required.', 'warning');

    try {
        const data = await apiCall(`/messages/${messageId}/reply`, 'POST', {
            replyContent: content,
            subject: subject
        });
        showNotification(data.message, 'success');
        closeModal();
        await loadMessagesData();
    } catch (error) {}
}

async function updateMessageStatus(messageId) {
    const status = document.getElementById('message-status').value;
    const adminNotes = document.getElementById('admin-notes').value;

    try {
        const data = await apiCall(`/messages/${messageId}/status`, 'PATCH', {
            status,
            adminNotes: adminNotes || undefined
        });
        showNotification(data.message, 'success');
        closeModal();
        await loadMessagesData();
    } catch (error) {}
}

async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message? This action cannot be undone.')) return;
    try {
        const data = await apiCall(`/messages/${messageId}`, 'DELETE');
        showNotification(data.message, 'success');
        await loadMessagesData();
    } catch (error) {}
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

// Updated renderGenericTab function
function renderGenericTab(type) {
    const container = document.getElementById(`${type}-tab`);
    const items = state[type];

    // Handle messages differently now that we have enhanced functionality
    if (type === 'messages') {
        renderMessagesTab();
        return;
    }

    const headers = {
        jobs: ['Job ID', 'User', 'Status'],
        quotes: ['Quote ID', 'User', 'Status']
    };

    container.innerHTML = `
        <div class="section-header">
            <h3>All ${type.charAt(0).toUpperCase() + type.slice(1)} (${items.length})</h3>
            <button class="btn" onclick="loadGenericData('${type}')">Refresh</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th>${headers[type][0]}</th>
                    <th>${headers[type][1]}</th>
                    <th>${headers[type][2]}</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${item._id.slice(-6)}</td>
                        <td>${item.userEmail || item.clientEmail || 'N/A'}</td>
                        <td>${item.status || 'N/A'}</td>
                        <td>
                            <button class="btn btn-danger" onclick="deleteGenericItem('${type}', '${item._id}')">Delete</button>
                        </td>
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


// --- SAFE ADMIN SCRIPT FUNCTIONS (Added for improved error handling) ---

// Enhanced error handling for API calls
async function safeApiCall(endpoint, method = 'GET', body = null, isFileUpload = false) {
    try {
        return await apiCall(endpoint, method, body, isFileUpload);
    } catch (error) {
        console.error('API Call Error:', error);
        showNotification('An error occurred: ' + error.message, 'error');
        throw error;
    }
}

// Safe tab switching with error handling
function safeShowTab(tabName) {
    try {
        console.log('Switching to tab:', tabName);

        // Remove active classes
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

        // Add active classes
        const tabContent = document.getElementById(`${tabName}-tab`);
        const tabButton = document.querySelector(`.tab[onclick="showTab('${tabName}')"]`);

        if (tabContent) tabContent.classList.add('active');
        if (tabButton) tabButton.classList.add('active');
        
        // Load data for specific tabs if needed
        if (tabName === 'messages' && state.messages.length === 0) {
            safeLoadMessagesData();
        }
        if (tabName === 'estimations' && state.estimations.length === 0) {
            safeLoadEstimationsData();
        }
            
    } catch (error) {
        console.error('Tab switching error:', error);
        showNotification('Error switching tabs', 'error');
    }
}

// Safe message loading
async function safeLoadMessagesData() {
    const container = document.getElementById('messages-tab');
    if (!container) return;

    try {
        showLoader(container);
        const { messages } = await safeApiCall('/messages');
        state.messages = messages || [];
        safeRenderMessagesTab();
    } catch (error) {
        container.innerHTML = `
            <p class="error">Failed to load messages: ${error.message}</p>
            <button class="btn" onclick="safeLoadMessagesData()">Retry</button>
        `;
    }
}

// Safe message rendering
function safeRenderMessagesTab() {
    const container = document.getElementById('messages-tab');
    if (!container) return;

    try {
        container.innerHTML = `
            <div class="section-header">
                <h3>All Messages (${state.messages.length})</h3>
                <button class="btn" onclick="safeLoadMessagesData()">Refresh</button>
            </div>
            ${state.messages.length === 0 ? '<p>No messages found.</p>' : `
            <table>
                <thead>
                    <tr>
                        <th>From</th>
                        <th>Subject</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.messages.map(msg => `
                        <tr>
                            <td>
                                <strong>${msg.senderName || 'N/A'}</strong><br>
                                <small>${msg.senderEmail || 'N/A'}</small>
                            </td>
                            <td>
                                <strong>${msg.subject || 'No Subject'}</strong><br>
                                <small>${(msg.content || '').substring(0, 50)}...</small>
                            </td>
                            <td>${msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : 'N/A'}</td>
                            <td>
                                <button class="btn btn-sm" onclick="safeViewMessage('${msg._id}')">View</button>
                                <button class="btn btn-danger btn-sm" onclick="safeDeleteMessage('${msg._id}')">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            `}
        `;
    } catch (error) {
        console.error('Error rendering messages:', error);
        container.innerHTML = '<p class="error">Error displaying messages</p>';
    }
}

// Safe message viewing
async function safeViewMessage(messageId) {
    try {
        const { message } = await safeApiCall(`/messages/${messageId}`);
        showModal(`
            <h3>Message Details</h3>
            <div class="message-details">
                <p><strong>From:</strong> ${message.senderName || 'N/A'} (${message.senderEmail || 'N/A'})</p>
                <p><strong>Subject:</strong> ${message.subject || 'No Subject'}</p>
                <p><strong>Date:</strong> ${message.createdAt ? new Date(message.createdAt).toLocaleString() : 'N/A'}</p>
                <div class="content-box" style="margin-top: 15px; padding: 15px; border: 1px solid #ddd; border-radius: 4px;">
                    ${message.content || message.message || 'No content'}
                </div>
            </div>
            <div style="margin-top: 20px; text-align: right;">
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        `);
    } catch (error) {
        showNotification('Failed to load message details', 'error');
    }
}

// Safe message deletion
async function safeDeleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
        await safeApiCall(`/messages/${messageId}`, 'DELETE');
        showNotification('Message deleted successfully', 'success');
        await safeLoadMessagesData();
    } catch (error) {
        // Error already handled by safeApiCall
    }
}

// Safe estimation loading
async function safeLoadEstimationsData() {
    const container = document.getElementById('estimations-tab');
    if (!container) return;

    try {
        showLoader(container);
        const { estimations } = await safeApiCall('/estimations');
        state.estimations = estimations || [];
        safeRenderEstimationsTab();
    } catch (error) {
        container.innerHTML = `
            <p class="error">Failed to load estimations: ${error.message}</p>
            <button class="btn" onclick="safeLoadEstimationsData()">Retry</button>
        `;
    }
}

// Safe estimation rendering
function safeRenderEstimationsTab() {
    const container = document.getElementById('estimations-tab');
    if (!container) return;

    try {
        container.innerHTML = `
            <div class="section-header">
                <h3>All Estimations (${state.estimations.length})</h3>
                <button class="btn" onclick="safeLoadEstimationsData()">Refresh</button>
            </div>
            ${state.estimations.length === 0 ? '<p>No estimations found.</p>' : `
            <table>
                <thead>
                    <tr>
                        <th>Project</th>
                        <th>User</th>
                        <th>Status</th>
                        <th>Files</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.estimations.map(est => `
                        <tr>
                            <td>${est.projectName || 'N/A'}</td>
                            <td>${est.userName || est.userEmail || 'N/A'}</td>
                            <td><span class="status ${est.status || 'pending'}">${est.status || 'pending'}</span></td>
                            <td>${(est.uploadedFiles || []).length} file(s)</td>
                            <td>
                                <button class="btn btn-sm" onclick="safeViewEstimationFiles('${est._id}')">View Files</button>
                                <button class="btn btn-danger btn-sm" onclick="safeDeleteEstimation('${est._id}')">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            `}
        `;
    } catch (error) {
        console.error('Error rendering estimations:', error);
        container.innerHTML = '<p class="error">Error displaying estimations</p>';
    }
}

// Safe estimation file viewing
function safeViewEstimationFiles(estimationId) {
    try {
        const estimation = state.estimations.find(e => e._id === estimationId);
        if (!estimation) {
            showNotification('Estimation not found', 'error');
            return;
        }

        const files = estimation.uploadedFiles || [];
        showModal(`
            <h3>Estimation Files - ${estimation.projectName || 'Project'}</h3>
            ${files.length === 0 ? '<p>No files uploaded</p>' : `
            <div class="files-list">
                ${files.map((file, index) => `
                    <div style="padding: 10px; border: 1px solid #ddd; margin: 5px 0; border-radius: 4px;">
                        <span>📁 ${file.name || 'Unknown file'}</span>
                        ${file.url ? `<a href="${file.url}" target="_blank" class="btn btn-sm" style="float: right;">Download</a>` : ''}
                    </div>
                `).join('')}
            </div>
            `}
            <div style="margin-top: 20px; text-align: right;">
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        `);
    } catch (error) {
        console.error('Error viewing estimation files:', error);
        showNotification('Error viewing files', 'error');
    }
}

// Safe estimation deletion
async function safeDeleteEstimation(estimationId) {
    if (!confirm('Are you sure you want to delete this estimation?')) return;

    try {
        await safeApiCall(`/estimations/${estimationId}`, 'DELETE');
        showNotification('Estimation deleted successfully', 'success');
        await safeLoadEstimationsData();
    } catch (error) {
        // Error already handled by safeApiCall
    }
}

// Override the original showTab function to use the safe version
if (typeof showTab !== 'undefined') {
    window.originalShowTab = showTab;
}
window.showTab = safeShowTab;

// Add console logging to help debug
console.log('Safe admin functions loaded successfully');
console.log('Available functions:', [
    'safeShowTab', 'safeLoadMessagesData', 'safeViewMessage',
    'safeDeleteMessage', 'safeLoadEstimationsData', 'safeViewEstimationFiles'
]);

// Test if the basic functionality works
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, testing admin panel...');

    // Test if required elements exist
    const requiredElements = ['users-tab', 'messages-tab', 'estimations-tab'];
    requiredElements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`Element ${id}:`, element ? 'Found' : 'Missing');
    });
});
