// admin-script.js - SteelConnect Admin Panel JavaScript
console.log('Loading admin script...');

// Global variables
const API_BASE_URL = 'https://steelconnect-backend.onrender.com';
let adminData = {
    users: [],
    reviews: [],
    estimations: [],
    messages: [],
    currentUser: null,
    token: null
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing admin panel...');
    setTimeout(initializeAdmin, 100);
});

// Initialize admin panel
function initializeAdmin() {
    try {
        console.log('Starting initialization...');
        
        // Get authentication data
        const token = localStorage.getItem('jwtToken');
        const userStr = localStorage.getItem('currentUser');
        
        console.log('Token exists:', !!token);
        console.log('User data exists:', !!userStr);
        
        // Check if authenticated
        if (!token || !userStr) {
            showError('Authentication required. Redirecting to login...');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        // Parse user data
        let user;
        try {
            user = JSON.parse(userStr);
        } catch (e) {
            showError('Invalid user data. Redirecting to login...');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        // Check if admin
        if (!user || user.role !== 'admin') {
            showError('Admin access required. Redirecting...');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        // Store globally
        adminData.currentUser = user;
        adminData.token = token;

        // Set admin name
        document.getElementById('adminName').textContent = user.name || user.email || 'Admin';
        console.log('Admin authenticated:', user.name || user.email);

        // Load initial data
        loadDashboard();
        loadUsers();
        loadProfileReviews();
        
        console.log('Initialization completed successfully');
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize admin panel: ' + error.message);
    }
}

// Utility functions
function showError(message) {
    console.error('Error:', message);
    showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
    console.log('Notification:', type, '-', message);
    
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1000;';
        document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        padding: 12px 20px;
        margin: 10px 0;
        border-radius: 4px;
        color: white;
        ${type === 'error' ? 'background: #dc3545;' : ''}
        ${type === 'success' ? 'background: #28a745;' : ''}
        ${type === 'warning' ? 'background: #ffc107; color: black;' : ''}
        ${type === 'info' ? 'background: #17a2b8;' : ''}
    `;
    notification.textContent = message;
    
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function showModal(content) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center;" onclick="closeModal()">
            <div style="background: white; padding: 25px; border-radius: 8px; max-width: 700px; max-height: 85vh; overflow-y: auto; width: 90%; position: relative;" onclick="event.stopPropagation()">
                <button style="position: absolute; top: 10px; right: 15px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666;" onclick="closeModal()">&times;</button>
                ${content}
            </div>
        </div>
    `;
}

function closeModal() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = '';
    }
}

// Tab navigation
function showTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    try {
        // Remove active classes
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active classes
        const tab = document.getElementById(tabName + '-tab');
        const button = event?.target?.closest('.tab');
        
        if (tab) tab.classList.add('active');
        if (button) button.classList.add('active');
        
        // Load data on first access
        if (tabName === 'estimations' && adminData.estimations.length === 0) {
            loadEstimations();
        }
        if (tabName === 'messages' && adminData.messages.length === 0) {
            loadMessages();
        }
        
        console.log('Tab switched successfully to:', tabName);
        
    } catch (error) {
        console.error('Error switching tabs:', error);
        showError('Error switching tabs');
    }
}

// Authentication
function logout() {
    console.log('Logging out...');
    try {
        localStorage.clear();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showError('Error during logout');
    }
}

// API communication
async function makeApiCall(endpoint, method = 'GET', body = null, isFileUpload = false) {
    try {
        console.log('API call:', method, endpoint);
        
        const options = {
            method,
            headers: {
                'Authorization': 'Bearer ' + adminData.token
            }
        };
        
        if (body) {
            if (isFileUpload) {
                options.body = body;
            } else {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(body);
            }
        }
        
        const response = await fetch(API_BASE_URL + '/api/admin' + endpoint, options);
        
        console.log('API response status:', response.status);
        
        if (response.status === 401) {
            showError('Session expired. Redirecting to login...');
            setTimeout(() => {
                localStorage.clear();
                window.location.href = 'index.html';
            }, 2000);
            return null;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('API response received');
        return data;
        
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

// Dashboard functions
async function loadDashboard() {
    try {
        console.log('Loading dashboard stats...');
        const data = await makeApiCall('/dashboard');
        
        if (data && data.success && data.stats) {
            const stats = data.stats;
            document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
            document.getElementById('pendingReviews').textContent = stats.pendingProfileReviews || 0;
            document.getElementById('totalJobs').textContent = stats.totalJobs || 0;
            document.getElementById('totalQuotes').textContent = stats.totalQuotes || 0;
            console.log('Dashboard stats loaded successfully');
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        showError('Failed to load dashboard stats');
    }
}

// User management functions
async function loadUsers() {
    const container = document.getElementById('users-tab');
    if (!container) return;
    
    try {
        console.log('Loading users...');
        container.innerHTML = '<h3>Loading users...</h3>';
        
        const data = await makeApiCall('/users');
        
        if (data && data.success && data.users) {
            adminData.users = data.users;
            displayUsers(data.users);
            console.log('Users loaded successfully:', data.users.length);
        } else {
            throw new Error('Invalid users response');
        }
        
    } catch (error) {
        console.error('Users loading error:', error);
        container.innerHTML = `
            <h3>Users</h3>
            <p style="color: red;">Failed to load users: ${error.message}</p>
            <button class="btn" onclick="loadUsers()">Retry</button>
        `;
    }
}

function displayUsers(users) {
    const container = document.getElementById('users-tab');
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3>Users (${users.length})</h3>
            <button class="btn" onclick="loadUsers()">Refresh</button>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Name</th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Email</th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Role</th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Status</th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.name || 'N/A'}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.email || 'N/A'}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.role || user.type || 'N/A'}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">
                            <span style="padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; ${user.isActive ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}">
                                ${user.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td style="padding: 12px; border: 1px solid #ddd;">
                            <button onclick="toggleUserStatus('${user._id}', ${!user.isActive})" 
                                    style="padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; color: white; background: ${user.isActive ? '#dc3545' : '#28a745'};">
                                ${user.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function toggleUserStatus(userId, newStatus) {
    if (!confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this user?`)) return;
    
    try {
        const data = await makeApiCall(`/users/${userId}/status`, 'PATCH', { isActive: newStatus });
        showNotification(data.message, 'success');
        await loadUsers();
    } catch (error) {
        showError('Failed to update user status');
    }
}

// Profile review functions
async function loadProfileReviews() {
    const container = document.getElementById('profile-reviews-tab');
    if (!container) return;
    
    try {
        console.log('Loading profile reviews...');
        container.innerHTML = '<h3>Loading profile reviews...</h3>';
        
        const data = await makeApiCall('/profile-reviews');
        
        if (data && data.success && data.reviews) {
            adminData.reviews = data.reviews;
            displayProfileReviews(data.reviews);
            console.log('Profile reviews loaded successfully:', data.reviews.length);
        } else {
            throw new Error('Invalid reviews response');
        }
        
    } catch (error) {
        console.error('Profile reviews loading error:', error);
        container.innerHTML = `
            <h3>Profile Reviews</h3>
            <p style="color: red;">Failed to load profile reviews: ${error.message}</p>
            <button class="btn" onclick="loadProfileReviews()">Retry</button>
        `;
    }
}

function displayProfileReviews(reviews) {
    const pendingReviews = reviews.filter(r => r.status === 'pending');
    const container = document.getElementById('profile-reviews-tab');
    
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3>Pending Profile Reviews (${pendingReviews.length})</h3>
            <button class="btn" onclick="loadProfileReviews()">Refresh</button>
        </div>
        ${pendingReviews.length === 0 ? '<p>No pending profile reviews.</p>' : `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
            ${pendingReviews.map(review => `
                <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: #f8f9fa;">
                    <h4>${review.user?.name || 'Unknown'} (${review.user?.type || 'Unknown'})</h4>
                    <p><strong>Email:</strong> ${review.user?.email || 'N/A'}</p>
                    <p><strong>Company:</strong> ${review.user?.company || 'N/A'}</p>
                    <div style="margin-top: 15px;">
                        <button onclick="viewProfileDetails('${review._id}')" 
                                style="padding: 8px 12px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px;">
                            View Details
                        </button>
                        <button onclick="approveProfile('${review._id}')" 
                                style="padding: 8px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px;">
                            Approve
                        </button>
                        <button onclick="showRejectModal('${review._id}')" 
                                style="padding: 8px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Reject
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
        `}
    `;
}

function viewProfileDetails(reviewId) {
    const review = adminData.reviews.find(r => r._id === reviewId);
    if (!review) {
        showError('Profile not found');
        return;
    }
    
    showModal(`
        <h3>Profile Details - ${review.user?.name || 'Unknown'}</h3>
        <div style="max-height: 60vh; overflow-y: auto;">
            <div style="background: #f8f9fa; padding: 15px; margin-bottom: 15px; border-radius: 6px; border-left: 4px solid #007bff;">
                <h4 style="margin-top: 0; color: #495057;">Basic Information</h4>
                <p><strong>Name:</strong> ${review.user?.name || 'N/A'}</p>
                <p><strong>Email:</strong> ${review.user?.email || 'N/A'}</p>
                <p><strong>Type:</strong> ${review.user?.type || 'N/A'}</p>
                <p><strong>Phone:</strong> ${review.user?.phone || 'N/A'}</p>
                <p><strong>Company:</strong> ${review.user?.company || 'N/A'}</p>
                <p><strong>Address:</strong> ${review.user?.address || 'N/A'}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff;">
                <h4 style="margin-top: 0; color: #495057;">Uploaded Files</h4>
                ${review.files?.resume ? `<p><a href="${review.files.resume.url}" target="_blank" style="color: #007bff; text-decoration: none;">📄 Resume: ${review.files.resume.name}</a></p>` : '<p>No resume uploaded</p>'}
                ${review.files?.businessLicense ? `<p><a href="${review.files.businessLicense.url}" target="_blank" style="color: #007bff; text-decoration: none;">📋 Business License: ${review.files.businessLicense.name}</a></p>` : '<p>No business license uploaded</p>'}
                ${review.files?.insurance ? `<p><a href="${review.files.insurance.url}" target="_blank" style="color: #007bff; text-decoration: none;">🛡️ Insurance: ${review.files.insurance.name}</a></p>` : '<p>No insurance uploaded</p>'}
                ${review.files?.certifications && review.files.certifications.length > 0 ? 
                    review.files.certifications.map(cert => `<p><a href="${cert.url}" target="_blank" style="color: #007bff; text-decoration: none;">🎓 Certification: ${cert.name}</a></p>`).join('') : 
                    '<p>No certifications uploaded</p>'}
            </div>
            
            ${review.reviewNotes ? `
            <div style="background: #fff3cd; padding: 15px; margin-top: 15px; border-radius: 6px; border-left: 4px solid #ffc107;">
                <h4 style="margin-top: 0; color: #856404;">Previous Rejection Notes</h4>
                <p style="color: #856404; font-style: italic;">${review.reviewNotes}</p>
            </div>
            ` : ''}
        </div>
        <div style="margin-top: 20px; text-align: right;">
            <button onclick="closeModal()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        </div>
    `);
}

function showRejectModal(reviewId) {
    showModal(`
        <h3>Reject Profile</h3>
        <p>Provide a reason for rejection. The user will see this comment and be able to log in to resubmit.</p>
        <textarea id="rejection-reason" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;" placeholder="e.g., Please upload a clearer copy of your business license." required></textarea>
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="rejectProfile('${reviewId}')" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px;">Submit Rejection</button>
            <button onclick="closeModal()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
        </div>
    `);
}

async function approveProfile(reviewId) {
    if (!confirm('Are you sure you want to approve this profile?')) return;
    
    try {
        const data = await makeApiCall(`/profile-reviews/${reviewId}/approve`, 'POST');
        showNotification(data.message, 'success');
        await Promise.all([loadProfileReviews(), loadDashboard()]);
    } catch (error) {
        showError('Failed to approve profile');
    }
}

async function rejectProfile(reviewId) {
    const reason = document.getElementById('rejection-reason').value;
    if (!reason.trim()) {
        showNotification('Rejection reason is required.', 'warning');
        return;
    }
    
    try {
        const data = await makeApiCall(`/profile-reviews/${reviewId}/reject`, 'POST', { reason });
        showNotification(data.message, 'success');
        closeModal();
        await Promise.all([loadProfileReviews(), loadDashboard()]);
    } catch (error) {
        showError('Failed to reject profile');
    }
}

// Placeholder functions for other tabs
async function loadEstimations() {
    const container = document.getElementById('estimations-tab');
    if (container) {
        container.innerHTML = '<p>Estimations functionality will be added soon...</p>';
    }
}

async function loadMessages() {
    const container = document.getElementById('messages-tab');
    if (container) {
        container.innerHTML = '<p>Messages functionality will be added soon...</p>';
    }
}

console.log('Admin script loaded successfully');
