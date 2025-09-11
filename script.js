// Minimal Working Admin Script - Replace your script.js with this
document.addEventListener('DOMContentLoaded', initializeAdminPanel);

const API_BASE_URL = 'https://steelconnect-backend.onrender.com';
const state = {
    users: [],
    profileReviews: [],
    estimations: [],
    jobs: [],
    quotes: [],
    messages: [],
};

async function initializeAdminPanel() {
    console.log('Initializing admin panel...');
    const token = getToken();
    const user = JSON.parse(localStorage.getItem('currentUser'));
    
    if (!token || !user || user.role !== 'admin') {
        console.log('Not authorized, redirecting...');
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('adminName').textContent = user.name || user.email;
    
    try {
        await loadDashboardStats();
        await loadUsersData();
        await loadProfileReviewsData();
        showTab('users');
        console.log('Admin panel initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification('Error initializing admin panel', 'error');
    }
}

function getToken() { 
    return localStorage.getItem('jwtToken'); 
}

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
    notification.style.cssText = `
        padding: 12px 20px;
        margin: 10px;
        border-radius: 4px;
        color: white;
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        ${type === 'error' ? 'background-color: #dc3545;' : ''}
        ${type === 'success' ? 'background-color: #28a745;' : ''}
        ${type === 'warning' ? 'background-color: #ffc107; color: black;' : ''}
        ${type === 'info' ? 'background-color: #17a2b8;' : ''}
    `;
    
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function showLoader(container) { 
    container.innerHTML = `<div style="text-align: center; padding: 40px;">Loading...</div>`; 
}

function showModal(content) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center;" onclick="closeModal()">
            <div style="background: white; padding: 20px; border-radius: 8px; max-width: 600px; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation()">
                <button style="float: right; background: none; border: none; font-size: 20px; cursor: pointer;" onclick="closeModal()">&times;</button>
                ${content}
            </div>
        </div>`;
}

function closeModal() { 
    document.getElementById('modal-container').innerHTML = ''; 
}

function showTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    try {
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        
        const targetTab = document.getElementById(`${tabName}-tab`);
        const targetButton = document.querySelector(`.tab[onclick="showTab('${tabName}')"]`);
        
        if (targetTab) targetTab.classList.add('active');
        if (targetButton) targetButton.classList.add('active');
        
        console.log('Tab switched successfully to:', tabName);
        
    } catch (error) {
        console.error('Error switching tabs:', error);
    }
}

async function loadDashboardStats() {
    const statsGrid = document.getElementById('statsGrid');
    try {
        const { stats } = await apiCall('/dashboard');
        statsGrid.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <h3>${stats.totalUsers || 0}</h3>
                    <p>Total Users</p>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <h3>${stats.pendingProfileReviews || 0}</h3>
                    <p>Pending Reviews</p>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <h3>${stats.totalJobs || 0}</h3>
                    <p>Total Jobs</p>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                    <h3>${stats.totalQuotes || 0}</h3>
                    <p>Total Quotes</p>
                </div>
            </div>
        `;
    } catch (error) {
        statsGrid.innerHTML = `<p style="color: red;">Failed to load dashboard stats.</p>`;
    }
}

async function loadUsersData() {
    const container = document.getElementById('users-tab');
    showLoader(container);
    try {
        const { users } = await apiCall('/users');
        state.users = users;
        renderUsersTab();
    } catch (error) {
        container.innerHTML = `<p style="color: red;">Failed to load users.</p><button onclick="loadUsersData()">Retry</button>`;
    }
}

function renderUsersTab() {
    const container = document.getElementById('users-tab');
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3>All Users (${state.users.length})</h3>
            <button onclick="loadUsersData()" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Refresh</button>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Name</th>
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Email</th>
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Role</th>
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Status</th>
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${state.users.map(user => `
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.name}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.email}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.role}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">
                            <span style="padding: 4px 8px; border-radius: 12px; font-size: 12px; ${user.isActive ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}">
                                ${user.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td style="padding: 12px; border: 1px solid #ddd;">
                            <button onclick="toggleUserStatus('${user._id}', ${!user.isActive})" 
                                    style="padding: 6px 12px; background: ${user.isActive ? '#dc3545' : '#28a745'}; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                ${user.isActive ? 'Deactivate' : 'Activate'}
                            </button>
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
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function loadProfileReviewsData() {
    const container = document.getElementById('profile-reviews-tab');
    showLoader(container);
    try {
        const { reviews } = await apiCall('/profile-reviews');
        state.profileReviews = reviews;
        renderProfileReviewsTab();
    } catch (error) {
        container.innerHTML = `<p style="color: red;">Failed to load profile reviews.</p><button onclick="loadProfileReviewsData()">Retry</button>`;
    }
}

function renderProfileReviewsTab() {
    const container = document.getElementById('profile-reviews-tab');
    const pendingReviews = state.profileReviews.filter(r => r.status === 'pending');
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3>Pending Reviews (${pendingReviews.length})</h3>
            <button onclick="loadProfileReviewsData()" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Refresh</button>
        </div>
        ${pendingReviews.length === 0 ? '<p>No pending profile reviews.</p>' : `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
            ${pendingReviews.map(review => `
                <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: #f8f9fa;">
                    <h4>${review.user.name} (${review.user.type})</h4>
                    <p>${review.user.email}</p>
                    <div style="margin-top: 15px;">
                        <button onclick="approveProfile('${review._id}')" 
                                style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                            Approve
                        </button>
                        <button onclick="showRejectModal('${review._id}')" 
                                style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Reject
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
        `}`;
}

function showRejectModal(reviewId) {
    showModal(`
        <h3>Reject Profile</h3>
        <p>Provide a reason for rejection:</p>
        <textarea id="rejection-reason" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="e.g., Please upload a clearer copy of your business license."></textarea>
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="rejectProfile('${reviewId}')" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Submit Rejection</button>
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
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function approveProfile(reviewId) {
    if (!confirm('Are you sure you want to approve this profile?')) return;
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/approve`, 'POST');
        showNotification(data.message, 'success');
        await Promise.all([loadProfileReviewsData(), loadDashboardStats()]);
    } catch (error) {
        // Error already handled by apiCall
    }
}

// Simple placeholder functions for other tabs
async function loadEstimationsData() {
    const container = document.getElementById('estimations-tab');
    container.innerHTML = '<p>Estimations functionality coming soon...</p>';
}

async function loadGenericData(type) {
    const container = document.getElementById(`${type}-tab`);
    container.innerHTML = `<p>${type.charAt(0).toUpperCase() + type.slice(1)} functionality coming soon...</p>`;
}

console.log('Admin script loaded successfully');
