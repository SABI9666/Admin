/ Clean Admin Script - script.js
console.log('Script starting...');

const API_BASE_URL = 'https://steelconnect-backend.onrender.com';
const state = {
    users: [],
    profileReviews: [],
    estimations: [],
    jobs: [],
    quotes: [],
    messages: [],
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded successfully');
    
    // Check authentication
    const token = localStorage.getItem('jwtToken');
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    
    console.log('Token exists:', !!token);
    console.log('User data:', user);
    
    if (!token || !user || user.role !== 'admin') {
        console.log('Authentication failed, redirecting...');
        alert('Not authorized as admin. Redirecting to login.');
        window.location.href = 'index.html';
        return;
    }
    
    // Set admin name
    const adminNameElement = document.getElementById('adminName');
    if (adminNameElement) {
        adminNameElement.textContent = user.name || user.email || 'Admin';
        console.log('Admin name set to:', user.name || user.email);
    }
    
    // Load initial data
    loadDashboardStats();
    loadUsers();
    loadProfileReviews();
});

function showTab(tabName) {
    console.log('showTab called with:', tabName);
    
    try {
        // Remove active class from all tabs and content
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Add active class to clicked tab and corresponding content
        const clickedTab = event.target.closest('.tab');
        const targetContent = document.getElementById(tabName + '-tab');
        
        if (clickedTab) clickedTab.classList.add('active');
        if (targetContent) targetContent.classList.add('active');
        
        console.log('Tab switched to:', tabName);
        
        // Load data for specific tabs if needed
        if (tabName === 'messages' && state.messages.length === 0) {
            loadMessages();
        }
        if (tabName === 'estimations' && state.estimations.length === 0) {
            loadEstimations();
        }
        
    } catch (error) {
        console.error('Error in showTab:', error);
        alert('Error switching tabs: ' + error.message);
    }
}

function logout() {
    console.log('Logout function called');
    try {
        localStorage.clear();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error during logout:', error);
        alert('Error during logout: ' + error.message);
    }
}

function showNotification(message, type = 'info') {
    console.log('Notification:', type, message);
    
    // Create notification container if it doesn't exist
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
        ${type === 'error' ? 'background-color: #dc3545;' : ''}
        ${type === 'success' ? 'background-color: #28a745;' : ''}
        ${type === 'warning' ? 'background-color: #ffc107; color: black;' : ''}
        ${type === 'info' ? 'background-color: #17a2b8;' : ''}
    `;
    notification.textContent = message;
    
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function showModal(content) {
    // Create modal container if it doesn't exist
    let modalContainer = document.getElementById('modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'modal-container';
        document.body.appendChild(modalContainer);
    }
    
    modalContainer.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center;" onclick="closeModal()">
            <div style="background: white; padding: 20px; border-radius: 8px; max-width: 600px; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation()">
                <button style="float: right; background: none; border: none; font-size: 20px; cursor: pointer;" onclick="closeModal()">&times;</button>
                ${content}
            </div>
        </div>`;
}

function closeModal() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = '';
    }
}

async function apiCall(endpoint, method = 'GET', body = null, isFileUpload = false) {
    const token = localStorage.getItem('jwtToken');
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

async function loadDashboardStats() {
    console.log('Loading dashboard stats...');
    
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;
    
    try {
        const { stats } = await apiCall('/dashboard');
        statsGrid.innerHTML = `
            <div class="stat-card"><h3>${stats.totalUsers || 0}</h3><p>Total Users</p></div>
            <div class="stat-card"><h3>${stats.pendingProfileReviews || 0}</h3><p>Pending Reviews</p></div>
            <div class="stat-card"><h3>${stats.totalJobs || 0}</h3><p>Total Jobs</p></div>
            <div class="stat-card"><h3>${stats.totalQuotes || 0}</h3><p>Total Quotes</p></div>
        `;
    } catch (error) {
        statsGrid.innerHTML = `<p style="color: red;">Failed to load dashboard stats.</p>`;
    }
}

async function loadUsers() {
    console.log('Loading users...');
    
    const usersTab = document.getElementById('users-tab');
    if (!usersTab) return;
    
    usersTab.innerHTML = '<p>Loading users...</p>';
    
    try {
        const { users } = await apiCall('/users');
        state.users = users;
        displayUsers(users);
    } catch (error) {
        usersTab.innerHTML = `
            <h3>Users</h3>
            <p style="color: red;">Error loading users: ${error.message}</p>
            <button class="btn" onclick="loadUsers()">Retry</button>
        `;
    }
}

function displayUsers(users) {
    console.log('Displaying', users.length, 'users');
    
    const usersTab = document.getElementById('users-tab');
    usersTab.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3>Users (${users.length})</h3>
            <button class="btn" onclick="loadUsers()">Refresh</button>
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
                ${users.map(user => `
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.name || 'N/A'}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.email || 'N/A'}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">${user.role || 'N/A'}</td>
                        <td style="padding: 12px; border: 1px solid #ddd;">
                            <span style="padding: 4px 8px; border-radius: 12px; font-size: 12px; ${user.isActive ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}">
                                ${user.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td style="padding: 12px; border: 1px solid #ddd;">
                            <button onclick="toggleUserStatus('${user._id}', ${!user.isActive})" 
                                    class="btn ${user.isActive ? 'btn-danger' : 'btn-success'}" 
                                    style="background: ${user.isActive ? '#dc3545' : '#28a745'};">
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
        await loadUsers();
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function loadProfileReviews() {
    console.log('Loading profile reviews...');
    
    const reviewsTab = document.getElementById('profile-reviews-tab');
    if (!reviewsTab) return;
    
    reviewsTab.innerHTML = '<p>Loading profile reviews...</p>';
    
    try {
        const { reviews } = await apiCall('/profile-reviews');
        state.profileReviews = reviews;
        displayProfileReviews(reviews);
    } catch (error) {
        reviewsTab.innerHTML = `
            <h3>Profile Reviews</h3>
            <p style="color: red;">Error loading profile reviews: ${error.message}</p>
            <button class="btn" onclick="loadProfileReviews()">Retry</button>
        `;
    }
}

function displayProfileReviews(reviews) {
    const pendingReviews = reviews.filter(r => r.status === 'pending');
    console.log('Displaying', pendingReviews.length, 'pending reviews');
    
    const reviewsTab = document.getElementById('profile-reviews-tab');
    reviewsTab.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3>Pending Reviews (${pendingReviews.length})</h3>
            <button class="btn" onclick="loadProfileReviews()">Refresh</button>
        </div>
        ${pendingReviews.length === 0 ? '<p>No pending profile reviews.</p>' : `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
            ${pendingReviews.map(review => `
                <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: #f8f9fa;">
                    <h4>${review.user.name} (${review.user.type})</h4>
                    <p><strong>Email:</strong> ${review.user.email}</p>
                    <p><strong>Company:</strong> ${review.user.company || 'N/A'}</p>
                    <div style="margin-top: 15px;">
                        <button onclick="viewProfileDetails('${review._id}')" 
                                class="btn" 
                                style="background: #17a2b8; margin-right: 10px;">
                            View Details
                        </button>
                        <button onclick="approveProfile('${review._id}')" 
                                class="btn" 
                                style="background: #28a745; margin-right: 10px;">
                            Approve
                        </button>
                        <button onclick="showRejectModal('${review._id}')" 
                                class="btn" 
                                style="background: #dc3545;">
                            Reject
                        </button>
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
        <div style="max-height: 60vh; overflow-y: auto;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 15px;">
                <h4>Basic Information</h4>
                <p><strong>Name:</strong> ${review.user.name}</p>
                <p><strong>Email:</strong> ${review.user.email}</p>
                <p><strong>Type:</strong> ${review.user.type}</p>
                <p><strong>Phone:</strong> ${review.user.phone || 'N/A'}</p>
                <p><strong>Company:</strong> ${review.user.company || 'N/A'}</p>
                <p><strong>Address:</strong> ${review.user.address || 'N/A'}</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 4px;">
                <h4>Uploaded Files</h4>
                ${review.files?.resume ? `<p><a href="${review.files.resume.url}" target="_blank">📄 Resume: ${review.files.resume.name}</a></p>` : '<p>No resume uploaded</p>'}
                ${review.files?.businessLicense ? `<p><a href="${review.files.businessLicense.url}" target="_blank">📋 Business License: ${review.files.businessLicense.name}</a></p>` : '<p>No business license uploaded</p>'}
                ${review.files?.insurance ? `<p><a href="${review.files.insurance.url}" target="_blank">🛡️ Insurance: ${review.files.insurance.name}</a></p>` : '<p>No insurance uploaded</p>'}
            </div>
        </div>
        <div style="margin-top: 20px; text-align: right;">
            <button class="btn" onclick="closeModal()">Close</button>
        </div>
    `);
}

function showRejectModal(reviewId) {
    showModal(`
        <h3>Reject Profile</h3>
        <p>Provide a reason for rejection:</p>
        <textarea id="rejection-reason" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="e.g., Please upload a clearer copy of your business license."></textarea>
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="rejectProfile('${reviewId}')" class="btn" style="background: #dc3545;">Submit Rejection</button>
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
        await Promise.all([loadProfileReviews(), loadDashboardStats()]);
    } catch (error) {
        // Error already handled by apiCall
    }
}

async function approveProfile(reviewId) {
    if (!confirm('Are you sure you want to approve this profile?')) return;
    try {
        const data = await apiCall(`/profile-reviews/${reviewId}/approve`, 'POST');
        showNotification(data.message, 'success');
        await Promise.all([loadProfileReviews(), loadDashboardStats()]);
    } catch (error) {
        // Error already handled by apiCall
    }
}

// Placeholder functions for other tabs
async function loadEstimations() {
    const container = document.getElementById('estimations-tab');
    if (container) {
        container.innerHTML = '<p>Estimations functionality coming soon...</p>';
    }
}

async function loadMessages() {
    const container = document.getElementById('messages-tab');
    if (container) {
        container.innerHTML = '<p>Messages functionality coming soon...</p>';
    }
}

console.log('Script loaded successfully');
