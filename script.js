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

    // Manually trigger data load for non-core tabs if they are empty
    const manualLoadMap = {
        'estimations': { data: state.estimations, loader: loadEstimationsData },
        'jobs': { data: state.jobs, loader: () => loadGenericData('jobs') },
        'quotes': { data: state.quotes, loader: () => loadGenericData('quotes') },
        'messages': { data: state.messages, loader: () => loadGenericData('messages') },
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

    // Assuming documents are stored in review.user.documents from the API
    const documents = review.user.documents || [];
    
    let filesHtml = '<h4>No documents uploaded.</h4>';
    if (documents.length > 0) {
        filesHtml = `
            <h4>Uploaded Documents:</h4>
            <ul class="file-list">
                ${documents.map(doc => `
                    <li>
                        <a href="${doc.url}" target="_blank" rel="noopener noreferrer">
                            <i class="fas fa-file-alt"></i> ${doc.filename || 'View File'}
                        </a>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    const modalContent = `
        <div class="modal-body">
            <h3>Profile Details: ${review.user.name}</h3>
            <p><strong>Email:</strong> ${review.user.email}</p>
            <p><strong>User Type:</strong> ${review.user.type}</p>
            <hr>
            ${filesHtml}
        </div>
    `;
    
    showModal(modalContent);
}

function showRejectModal(reviewId) {
    showModal(`
        <div class="modal-body">
            <h3>Reject Profile</h3>
            <p>Provide a reason for rejection. The user will see this comment and be able to log in to resubmit.</p>
            <textarea id="rejection-reason" rows="4" placeholder="e.g., Please upload a clearer copy of your business license."></textarea>
            <button class="btn btn-danger" onclick="rejectProfile('${reviewId}')">Submit Rejection</button>
        </div>
    `);
}

async function rejectProfile(reviewId) {
    const reason = document.getElementById('rejection-reason').value;
    if (!reason.trim()) return showNotification('Rejection reason is required.', 'warning');
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/reject`, 'POST', { reason });
        showNotification(data.message, 'success');
        closeModal();
        await Promise.all([loadProfileReviewsData(), loadDashboardStats()]);
    } catch (error) {}
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
        <div class="section-header"><h3>All Estimations (${state.estimations.length})</h3><button class="btn" onclick="loadEstimationsData()">Refresh</button></div>
        <table>
            <thead><tr><th>Project</th><th>User</th><th>Status</th><th>Files</th><th>Result</th><th>Actions</th></tr></thead>
            <tbody>
                ${state.estimations.map(est => `
                    <tr>
                        <td>${est.projectName || 'N/A'}</td>
                        <td>
                            ${est.user ? `<strong>${est.user.name || 'N/A'}</strong><br><small>${est.user.email || ''}</small>` : est.userEmail}
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

function showEstimationFiles(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation) {
        showNotification('Could not find the selected estimation.', 'error');
        return;
    }

    const files = estimation.uploadedFiles || [];
    
    let filesHtml = '<h4>No documents uploaded for this estimation.</h4>';
    if (files.length > 0) {
        filesHtml = `
            <ul class="file-list">
                ${files.map(file => `
                    <li>
                        <a href="${file.url}" target="_blank" rel="noopener noreferrer">
                            <i class="fas fa-file-alt"></i> ${file.originalname || 'View File'}
                        </a>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    const modalContent = `
        <div class="modal-body">
            <h3>Uploaded Files for "${estimation.projectName || 'Estimation'}"</h3>
            <hr>
            ${filesHtml}
        </div>
    `;
    
    showModal(modalContent);
}

function showUploadResultModal(estimationId) {
    showModal(`
        <div class="modal-body">
            <h3>Upload Estimation Result</h3>
            <p>This will overwrite any existing result.</p>
            <input type="file" id="result-file-input">
            <button class="btn btn-success" onclick="uploadEstimationResult('${estimationId}')">Upload File</button>
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

// --- GENERIC TABLES for Jobs, Quotes, Messages ---
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
    const headers = { jobs: ['Job ID', 'User', 'Status'], quotes: ['Quote ID', 'User', 'Status'], messages: ['Message ID', 'Sender', 'Subject'] };
    container.innerHTML = `
        <div class="section-header"><h3>All ${type.charAt(0).toUpperCase() + type.slice(1)} (${items.length})</h3><button class="btn" onclick="loadGenericData('${type}')">Refresh</button></div>
        <table>
            <thead><tr><th>${headers[type][0]}</th><th>${headers[type][1]}</th><th>${headers[type][2]}</th><th>Actions</th></tr></thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${item._id.slice(-6)}</td>
                        <td>${item.userEmail || item.clientEmail || item.senderEmail || 'N/A'}</td>
                        <td>${item.status || item.subject || 'N/A'}</td>
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
