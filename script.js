// --- CONFIGURATION & GLOBAL STATE ---
const appState = {
    currentUser: null,
    currentFilter: '',
    currentSection: 'dashboard',
    uploadProgress: 0,
    currentProfileReview: null
};
// Updated API base URL configuration
const API_BASE = 'https://steelconnect-backend.onrender.com/api';
const API_BASE_URL = 'https://steelconnect-backend.onrender.com'; // Kept for functions using the full URL

// --- CORE UTILITY FUNCTIONS ---
function showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(notification);
    setTimeout(() => { notification.remove(); }, duration);
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
}

function showLoader(container) {
    container.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Loading...</p>
        </div>
    `;
}

function getToken() {
    return localStorage.getItem('jwtToken');
}

// Enhanced API call with better error handling
async function apiCall(endpoint, method = 'GET', body = null, isFileUpload = false) {
    const token = getToken();
    if (!token) {
        showNotification('No authentication token found. Please log in again.', 'error');
        throw new Error('No authentication token found');
    }

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`
        },
    };

    // Adjust for file uploads vs. JSON
    if (body) {
        if (isFileUpload) {
            options.body = body; // FormData handles its own content type
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }

    console.log(`📡 API Call: ${method} ${API_BASE_URL}/api${endpoint}`);

    try {
        const response = await fetch(`${API_BASE_URL}/api${endpoint}`, options);

        let responseData;
        const contentType = response.headers.get('content-type');

        if (!response.ok) {
            // Try to parse error message from JSON response
            if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
                console.error('API Error:', response.status, responseData);
                throw new Error(responseData.message || responseData.error || `HTTP error! Status: ${response.status}`);
            } else {
                 const text = await response.text();
                 console.error('Non-JSON API Error:', response.status, text);
                 throw new Error(text || `HTTP error! Status: ${response.status}`);
            }
        }

        // Handle successful but potentially non-JSON responses (like file downloads)
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
            console.log(`✅ API Success:`, responseData);
            return responseData;
        } else {
            console.log(`✅ API Success (Non-JSON response)`);
            return response;
        }

    } catch (error) {
        console.error(`❌ API Call Failed (${endpoint}):`, error);
        showNotification(error.message, 'error');
        throw error;
    }
}

function logout() {
    localStorage.clear();
    showNotification('You have been logged out.', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 1000);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0);
}

// --- MODAL UTILITIES ---
function showModal(modalId, content) {
    const existingModal = document.getElementById('dynamic-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'dynamic-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" id="${modalId}-content">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            ${content}
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function showGenericModal(content, style = '') {
    const existingModal = document.getElementById('dynamic-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'dynamic-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="${style}">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            ${content}
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('dynamic-modal');
    if (modal) modal.remove();
}

// --- LOGIN PAGE LOGIC ---
function initializeLoginPage() {
    document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const loginButton = event.target.querySelector('button[type="submit"]');
    loginButton.disabled = true;
    loginButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

    try {
        const data = await apiCall('/auth/login/admin', 'POST', {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
        });
        if (!data.token || !data.user) throw new Error('Invalid server response.');

        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        showNotification('Login successful! Redirecting...', 'success');
        setTimeout(() => { window.location.href = 'admin.html'; }, 1000);
    } catch (error) {
        loginButton.disabled = false;
        loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
}

// --- ADMIN PANEL LOGIC ---
function initializeAdminPage() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        const token = getToken();
        if (token && user && (user.role?.toLowerCase() === 'admin' || user.type?.toLowerCase() === 'admin')) {
            appState.currentUser = user;
            setupAdminPanel();
        } else {
            showAdminLoginPrompt("Access Denied: Admin privileges required.");
        }
    } catch {
        showAdminLoginPrompt("Invalid session. Please log in again.");
    }
}

function showAdminLoginPrompt(message) {
    hideGlobalLoader();
    document.getElementById('admin-panel-container').style.display = 'none';
    const loginPrompt = document.getElementById('admin-login-prompt');
    loginPrompt.style.display = 'flex';
    if (message) loginPrompt.querySelector('p').textContent = message;
}

function setupAdminPanel() {
    hideGlobalLoader();
    document.getElementById('admin-panel-container').style.display = 'flex';
    document.getElementById('admin-user-info').innerHTML = `
        <div class="user-avatar">
            <i class="fas fa-user-shield"></i>
        </div>
        <div class="user-details">
            <strong>${appState.currentUser.name}</strong>
            <small>${appState.currentUser.role || 'Admin'}</small>
        </div>
    `;
    document.getElementById('admin-logout-btn').addEventListener('click', logout);

    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            appState.currentSection = link.dataset.section;
            document.getElementById('admin-section-title').textContent = link.textContent.trim();
            renderAdminSection(link.dataset.section);
        });
    });

    document.querySelector('.admin-nav-link[data-section="dashboard"]').click();
}

function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.id = 'admin-content-area';

    const renderMap = {
        dashboard: renderAdminDashboard,
        users: renderAdminUsers,
        'profile-reviews': renderProfileReviewsTab,
        quotes: renderAdminQuotes,
        estimations: renderAdminEstimations,
        jobs: renderAdminJobs,
        messages: renderAdminMessages,
        subscriptions: renderAdminSubscriptions,
        analytics: renderAdminAnalytics,
        'system-stats': renderSystemStats
    };

    if (!document.getElementById('profile-reviews-tab')) {
        const tabContainer = document.createElement('div');
        tabContainer.id = 'profile-reviews-tab';
        tabContainer.style.display = 'none';
        contentArea.parentNode.appendChild(tabContainer);
    }
    
    document.querySelectorAll('.admin-content-section').forEach(sec => sec.style.display = 'none');

    if (section === 'profile-reviews') {
        contentArea.style.display = 'none';
        const profileTab = document.getElementById('profile-reviews-tab');
        profileTab.style.display = 'block';
        renderProfileReviewsTab();
    } else {
        const profileTab = document.getElementById('profile-reviews-tab');
        if(profileTab) profileTab.style.display = 'none';
        contentArea.style.display = 'block';
        showLoader(contentArea);
        setTimeout(() => renderMap[section] ? renderMap[section]() : renderComingSoon(section), 100);
    }
}

function renderComingSoon(section) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `
        <div class="coming-soon">
            <i class="fas fa-tools"></i>
            <h3>Coming Soon</h3>
            <p>The ${section.replace('-', ' ')} section is currently under development.</p>
        </div>
    `;
}

// --- DASHBOARD ---
async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const data = await apiCall('/admin/dashboard');
        const { pendingProfileReviews, ...otherStats } = data.stats;

        const renderStatCard = (key, value, isClickable = false, onClickAction = '') => `
            <div class="admin-stat-card ${isClickable ? 'clickable' : ''}" ${isClickable ? `onclick="${onClickAction}"` : ''}>
                <div class="stat-icon"><i class="fas fa-${getStatIcon(key)}"></i></div>
                <div class="stat-info">
                    <span class="stat-value">${formatStatValue(key, value)}</span>
                    <span class="stat-label">${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                </div>
                ${isClickable ? '<div class="stat-go"><i class="fas fa-arrow-right"></i></div>' : ''}
            </div>
        `;

        contentArea.innerHTML = `
            <div class="dashboard-overview">
                <div class="admin-stats-grid">
                    ${pendingProfileReviews !== undefined ? renderStatCard('pendingProfileReviews', pendingProfileReviews, true, "navigateToSection('profile-reviews')") : ''}
                    ${Object.entries(otherStats).map(([key, value]) => renderStatCard(key, value)).join('')}
                </div>
                <div class="recent-activity">
                    <h3>Recent Activity</h3>
                    <div class="activity-list">
                        ${data.recentActivity?.map(activity => `
                            <div class="activity-item">
                                <div class="activity-icon"><i class="fas fa-${getActivityIcon(activity.type)}"></i></div>
                                <div class="activity-content">
                                    <p>${activity.description}</p>
                                    <small>${formatDate(activity.timestamp)}</small>
                                </div>
                            </div>
                        `).join('') || '<p>No recent activity</p>'}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load dashboard data</h3>
                <button class="btn btn-primary" onclick="renderAdminDashboard()"><i class="fas fa-redo"></i> Retry</button>
            </div>
        `;
    }
}

function getStatIcon(key) {
    const icons = {
        totalUsers: 'users',
        totalQuotes: 'file-alt',
        totalJobs: 'briefcase',
        totalMessages: 'envelope',
        totalEstimations: 'calculator',
        activeSubscriptions: 'crown',
        pendingEstimations: 'clock',
        unreadMessages: 'envelope-open',
        pendingProfileReviews: 'user-check'
    };
    return icons[key] || 'chart-line';
}

function navigateToSection(section) {
    const navLink = document.querySelector(`.admin-nav-link[data-section="${section}"]`);
    if (navLink) navLink.click();
}

function formatStatValue(key, value) {
    if (key.includes('revenue') || key.includes('Revenue')) return formatCurrency(value);
    return value?.toLocaleString() || '0';
}

function getActivityIcon(type) {
    const icons = {
        user: 'user-plus',
        quote: 'file-alt',
        job: 'briefcase',
        message: 'envelope',
        estimation: 'calculator'
    };
    return icons[type] || 'bell';
}

// --- USERS MANAGEMENT ---
async function renderAdminUsers() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { users } = await apiCall('/admin/users');
        if (!users || users.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><h3>No users found</h3><p>Registered users will appear here.</p></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title"><h2>Users Management</h2><span class="count-badge">${users.length} users</span></div>
                <div class="section-actions">
                    <div class="search-box"><i class="fas fa-search"></i><input type="text" placeholder="Search users..." id="user-search" oninput="filterUsers(this.value)"></div>
                    <select id="user-role-filter" onchange="filterUsersByRole(this.value)"><option value="">All Roles</option><option value="admin">Admin</option><option value="contractor">Contractor</option><option value="client">Client</option></select>
                    <button class="btn btn-primary" onclick="exportUsers()"><i class="fas fa-download"></i> Export CSV</button>
                </div>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="users-table">
                    <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${users.map(user => `
                            <tr data-user-id="${user._id}" data-role="${user.role}" data-name="${user.name}">
                                <td><div class="user-info"><div class="user-avatar">${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : `<i class="fas fa-user"></i>`}</div><div class="user-details"><strong>${user.name}</strong><small>${user.company || 'No company'}</small></div></div></td>
                                <td>${user.email}</td>
                                <td><span class="role-badge ${user.role}">${user.role}</span></td>
                                <td><span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
                                <td>${formatDate(user.createdAt)}</td>
                                <td><div class="action-buttons"><button class="btn btn-sm btn-info" onclick="viewUserDetails('${user._id}')" title="View Details"><i class="fas fa-eye"></i></button><button class="btn btn-sm btn-warning" onclick="toggleUserStatus('${user._id}', ${!user.isActive})" title="${user.isActive ? 'Deactivate' : 'Activate'}"><i class="fas fa-${user.isActive ? 'ban' : 'check'}"></i></button><button class="btn btn-sm btn-danger" onclick="deleteUser('${user._id}')" title="Delete"><i class="fas fa-trash"></i></button></div></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load users</h3><button class="btn btn-primary" onclick="renderAdminUsers()"><i class="fas fa-redo"></i> Retry</button></div>`;
    }
}

function filterUsers(searchTerm) {
    document.querySelectorAll('#users-table tbody tr').forEach(row => {
        const name = row.dataset.name.toLowerCase();
        const email = row.cells[1].textContent.toLowerCase();
        row.style.display = (name.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase())) ? '' : 'none';
    });
}

function filterUsersByRole(role) {
    document.querySelectorAll('#users-table tbody tr').forEach(row => {
        row.style.display = (!role || row.dataset.role === role) ? '' : 'none';
    });
}

async function viewUserDetails(userId) {
    try {
        const { user } = await apiCall(`/admin/users/${userId}`);
        showModal('user-details-modal', `
            <div class="user-details-modal">
                <h3>User Details</h3>
                <div class="user-profile">
                    <div class="profile-avatar">${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : `<i class="fas fa-user"></i>`}</div>
                    <div class="profile-info">
                        <h4>${user.name}</h4>
                        <p><strong>Email:</strong> ${user.email}</p>
                        <p><strong>Role:</strong> <span class="role-badge ${user.role}">${user.role}</span></p>
                        <p><strong>Company:</strong> ${user.company || 'Not specified'}</p>
                        <p><strong>Phone:</strong> ${user.phone || 'Not provided'}</p>
                        <p><strong>Status:</strong> <span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></p>
                        <p><strong>Joined:</strong> ${formatDate(user.createdAt)}</p>
                        <p><strong>Last Login:</strong> ${user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</p>
                    </div>
                </div>
                <div class="user-stats">
                    <h4>Activity Statistics</h4>
                    <div class="stats-grid">
                        <div class="stat-item"><span class="stat-value">${user.stats?.quotesRequested || 0}</span><span class="stat-label">Quotes Requested</span></div>
                        <div class="stat-item"><span class="stat-value">${user.stats?.jobsCompleted || 0}</span><span class="stat-label">Jobs Completed</span></div>
                        <div class="stat-item"><span class="stat-value">${user.stats?.messagesSent || 0}</span><span class="stat-label">Messages Sent</span></div>
                    </div>
                </div>
                <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>
            </div>`);
    } catch (error) { /* Handled by apiCall */ }
}

async function toggleUserStatus(userId, newStatus) {
    try {
        await apiCall(`/admin/users/${userId}/status`, 'PATCH', { isActive: newStatus });
        showNotification(`User ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        renderAdminUsers();
    } catch (error) { /* Handled by apiCall */ }
}

async function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        try {
            await apiCall(`/admin/users/${userId}`, 'DELETE');
            showNotification('User deleted successfully', 'success');
            renderAdminUsers();
        } catch (error) { /* Handled by apiCall */ }
    }
}

// --- PROFILE REVIEW MANAGEMENT ---
async function loadProfileReviews() {
    try {
        console.log('🔍 Loading profile reviews...');
        const data = await apiCall('/admin/profile-reviews', 'GET');
        const allReviews = data.reviews || data.data || (Array.isArray(data) ? data : []);
        if (!Array.isArray(allReviews)) throw new Error("API response for reviews was not an array.");
        console.log(`✅ Loaded ${allReviews.length} profile reviews`);
        return allReviews;
    } catch (error) {
        console.error('❌ Error loading profile reviews:', error);
        throw error;
    }
}

async function renderProfileReviewsTab() {
    const tab = document.getElementById('profile-reviews-tab');
    if (!tab) return;
    tab.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Loading profile reviews...</p></div>`;
    try {
        const reviews = await loadProfileReviews();
        if (reviews.length === 0) {
            tab.innerHTML = `<div class="empty-state premium-empty"><div class="empty-icon"><i class="fas fa-user-check"></i></div><h3>No Profile Reviews Found</h3><p>There are no pending or completed profile reviews in the system yet.</p><div style="margin-top: 2rem;"><button class="btn btn-primary" onclick="renderProfileReviewsTab()"><i class="fas fa-sync-alt"></i> Refresh</button></div></div>`;
            return;
        }
        const pending = reviews.filter(r => r.status === 'pending');
        const completed = reviews.filter(r => r.status !== 'pending');
        tab.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title"><h2><i class="fas fa-user-check"></i> Profile Reviews</h2><span class="count-badge">${reviews.length} total</span></div>
                <div class="section-actions"><button class="btn btn-primary" onclick="renderProfileReviewsTab()"><i class="fas fa-sync-alt"></i> Refresh</button></div>
            </div>
            ${pending.length > 0 ? `<div class="review-section"><h4 style="color: #f59e0b; margin-bottom: 1rem;"><i class="fas fa-clock"></i> Pending Reviews (${pending.length})</h4><div class="profile-reviews-grid">${pending.map(renderProfileReviewCard).join('')}</div></div>` : `<div class="review-section"><div class="empty-state" style="margin-bottom: 2rem;"><i class="fas fa-check-circle" style="color: #10b981;"></i><h4>All Caught Up!</h4><p>There are no pending profile reviews.</p></div></div>`}
            ${completed.length > 0 ? `<div class="review-section"><h4 style="color: #6b7280; margin-bottom: 1rem;"><i class="fas fa-history"></i> Recently Reviewed (${completed.length})</h4><div class="profile-reviews-grid">${completed.slice(0, 6).map(renderProfileReviewCard).join('')}</div></div>` : ''}`;
    } catch (error) {
        console.error('❌ Error rendering profile reviews:', error);
        tab.innerHTML = `<div class="error-state premium-error"><div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div><h3>Error Loading Reviews</h3><p><strong>Details:</strong> ${error.message}</p><div style="margin-top: 1.5rem;"><button class="btn btn-primary" onclick="renderProfileReviewsTab()"><i class="fas fa-redo"></i> Try Again</button></div></div>`;
    }
}

function renderProfileReviewCard(review) {
    const user = review.user || {};
    const statusClass = review.status || 'pending';
    const statusIcon = {'pending': 'fa-clock', 'approved': 'fa-check-circle', 'rejected': 'fa-times-circle'}[statusClass] || 'fa-question-circle';
    const userType = user.type || review.userType || 'user';
    const submittedDate = review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'N/A';
    const reviewedDate = review.reviewedAt ? new Date(review.reviewedAt).toLocaleDateString() : null;
    return `
        <div class="profile-review-card premium-card review-status-${statusClass}">
            <div class="review-header">
                <div class="user-info">
                    <div class="user-avatar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">${(user.name || 'U').charAt(0).toUpperCase()}</div>
                    <div class="user-details">
                        <h4>${user.name || 'Unknown User'}</h4><p>${user.email || 'No email'}</p>
                        <span class="role-badge ${userType}"><i class="fas ${userType === 'designer' ? 'fa-drafting-compass' : 'fa-building'}"></i> ${userType.charAt(0).toUpperCase() + userType.slice(1)}</span>
                    </div>
                </div>
                <div class="review-status"><span class="status-badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${statusClass.charAt(0).toUpperCase() + statusClass.slice(1)}</span></div>
            </div>
            <div class="review-meta"><span>Submitted: ${submittedDate}</span>${reviewedDate ? `<span>Reviewed: ${reviewedDate}</span>` : ''}</div>
            ${review.reviewNotes ? `<div class="review-notes"><strong>${review.status === 'rejected' ? 'Rejection Reason:' : 'Admin Notes:'}</strong><p>${review.reviewNotes}</p></div>` : ''}
            <div class="review-actions">
                <button class="btn btn-sm btn-info" onclick="viewProfileDetails('${review._id}')"><i class="fas fa-eye"></i> View Details</button>
                ${review.status === 'pending' ? `<button class="btn btn-sm btn-success" onclick="showApproveModal('${review._id}')"><i class="fas fa-check"></i> Approve</button><button class="btn btn-sm btn-danger" onclick="showRejectModal('${review._id}')"><i class="fas fa-times"></i> Reject</button>` : ''}
                ${review.status === 'rejected' ? `<button class="btn btn-sm btn-success" onclick="showApproveModal('${review._id}')"><i class="fas fa-check"></i> Re-Approve</button>`: ''}
            </div>
        </div>`;
}

async function viewProfileDetails(reviewId) {
    try {
        showNotification('Loading profile details...', 'info');
        const response = await apiCall(`/admin/profile-reviews/${reviewId}`);
        const review = response.review || response.data?.review || response.data;
        if (!review) throw new Error("Could not find review data in API response.");
        const user = review.user || {};
        const profile = review.profileData || {};
        showGenericModal(`
            <div class="modal-header premium-modal-header"><h3><i class="fas fa-user-circle"></i> Profile Review Details</h3><p class="modal-subtitle">${user.name} - ${user.type?.charAt(0).toUpperCase() + user.type?.slice(1) || 'User'}</p></div>
            <div class="profile-details-content">
                <div class="profile-section"><h4><i class="fas fa-user"></i> Basic Information</h4><p><strong>Name:</strong> ${user.name || 'N/A'}</p><p><strong>Email:</strong> ${user.email || 'N/A'}</p><p><strong>Account Type:</strong> ${user.type || 'N/A'}</p><p><strong>Status:</strong> <span class="status-badge ${review.status}">${review.status}</span></p></div>
                ${user.type === 'contractor' ? `<div class="profile-section"><h4><i class="fas fa-building"></i> Contractor Information</h4><p><strong>Company:</strong> ${profile.companyName || 'N/A'}</p><p><strong>Website:</strong> ${profile.companyWebsite ? `<a href="${profile.companyWebsite}" target="_blank">${profile.companyWebsite}</a>` : 'N/A'}</p><p><strong>Description:</strong> ${profile.description || 'N/A'}</p></div>` : ''}
                ${user.type === 'designer' ? `<div class="profile-section"><h4><i class="fas fa-drafting-compass"></i> Designer Information</h4><p><strong>Skills:</strong> ${(Array.isArray(profile.skills) ? profile.skills : (profile.skills || '').split(',')).map(s => `<span class="skill-tag">${s.trim()}</span>`).join(' ')}</p><p><strong>LinkedIn:</strong> ${profile.linkedinProfile ? `<a href="${profile.linkedinProfile}" target="_blank">${profile.linkedinProfile}</a>` : 'N/A'}</p><p><strong>Bio:</strong> ${profile.bio || 'N/A'}</p></div>` : ''}
                ${review.status !== 'pending' && review.reviewNotes ? `<div class="profile-section"><h4><i class="fas fa-comment-alt"></i> Review Notes</h4><div class="review-notes-display"><p>${review.reviewNotes}</p></div></div>` : ''}
            </div>
            <div class="modal-actions">
                ${review.status === 'pending' ? `<button class="btn btn-success" onclick="closeModal(); showApproveModal('${reviewId}')"><i class="fas fa-check"></i> Approve</button><button class="btn btn-danger" onclick="closeModal(); showRejectModal('${reviewId}')"><i class="fas fa-times"></i> Reject</button>` : ''}
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>`, 'max-width: 800px; max-height: 90vh; overflow-y: auto;');
    } catch (error) { /* Handled by apiCall */ }
}

function showApproveModal(reviewId) {
    showGenericModal(`
        <div class="modal-header premium-modal-header"><h3 style="color: #10b981;"><i class="fas fa-check-circle"></i> Approve Profile</h3><p class="modal-subtitle">Approve this user's profile and grant full platform access</p></div>
        <form id="approve-profile-form" class="premium-form">
            <div class="form-group"><label class="form-label"><i class="fas fa-comment"></i> Approval Notes (Optional)</label><textarea id="approval-notes" class="form-textarea" rows="3" placeholder="Add any notes..."></textarea></div>
            <div class="form-actions"><button type="submit" class="btn btn-success"><i class="fas fa-check"></i> Approve Profile</button><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button></div>
        </form>`, 'max-width: 500px;');
    document.getElementById('approve-profile-form').addEventListener('submit', e => { e.preventDefault(); handleProfileApproval(reviewId); });
}

function showRejectModal(reviewId) {
    showGenericModal(`
        <div class="modal-header premium-modal-header"><h3 style="color: #ef4444;"><i class="fas fa-times-circle"></i> Reject Profile</h3><p class="modal-subtitle">Reject this profile and provide feedback for improvement</p></div>
        <form id="reject-profile-form" class="premium-form">
            <div class="form-group"><label class="form-label" style="color: #dc2626;"><i class="fas fa-exclamation-triangle"></i> Rejection Reason (Required)</label><textarea id="rejection-reason" class="form-textarea" rows="4" required placeholder="Explain what needs to be updated..."></textarea></div>
            <div class="common-reasons" style="margin: 1rem 0;"><label class="form-label">Quick reasons:</label><div class="reason-buttons"><button type="button" class="btn btn-sm btn-outline" onclick="addReason('Missing professional experience')">Missing Experience</button><button type="button" class="btn btn-sm btn-outline" onclick="addReason('Portfolio files are unclear')">Missing Files</button><button type="button" class="btn btn-sm btn-outline" onclick="addReason('Incomplete contact info')">Incomplete Contact</button></div></div>
            <div class="form-actions"><button type="submit" class="btn btn-danger"><i class="fas fa-times"></i> Reject Profile</button><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button></div>
        </form>`, 'max-width: 600px;');
    document.getElementById('reject-profile-form').addEventListener('submit', e => { e.preventDefault(); handleProfileRejection(reviewId); });
}

function addReason(reason) {
    const textarea = document.getElementById('rejection-reason');
    textarea.value = textarea.value.trim() ? `${textarea.value.trim()}\n• ${reason}` : `• ${reason}`;
    textarea.focus();
}

async function handleProfileApproval(reviewId) {
    const btn = document.querySelector('#approve-profile-form button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div> Approving...';
    try {
        const notes = document.getElementById('approval-notes').value.trim();
        await apiCall(`/admin/profile-reviews/${reviewId}/approve`, 'POST', { notes: notes || 'Profile approved' });
        showNotification('Profile approved successfully!', 'success');
        closeModal();
        setTimeout(renderProfileReviewsTab, 500);
    } catch (error) { /* Handled by apiCall */ } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

async function handleProfileRejection(reviewId) {
    const reason = document.getElementById('rejection-reason').value.trim();
    if (!reason) { showNotification('Please provide a reason for rejection', 'warning'); return; }
    const btn = document.querySelector('#reject-profile-form button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div> Rejecting...';
    try {
        await apiCall(`/admin/profile-reviews/${reviewId}/reject`, 'POST', { reason });
        showNotification('Profile rejected and user notified.', 'success');
        closeModal();
        setTimeout(renderProfileReviewsTab, 500);
    } catch (error) { /* Handled by apiCall */ } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

// --- QUOTES MANAGEMENT ---
async function renderAdminQuotes() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { quotes } = await apiCall('/admin/quotes');
        if (!quotes || quotes.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-file-alt"></i><h3>No quotes found</h3><p>Quotes will appear here once users request them.</p></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title"><h2>Quotes Management</h2><span class="count-badge">${quotes.length} quotes</span></div>
                <div class="section-actions">
                    <div class="search-box"><i class="fas fa-search"></i><input type="text" placeholder="Search quotes..." oninput="filterQuotes(this.value)"></div>
                    <select onchange="filterQuotesByStatus(this.value)"><option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="completed">Completed</option></select>
                    <button class="btn btn-primary" onclick="exportQuotes()"><i class="fas fa-download"></i> Export CSV</button>
                </div>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="quotes-table">
                    <thead><tr><th>Quote #</th><th>Client</th><th>Project</th><th>Amount</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${quotes.map(q => `
                            <tr data-quote-id="${q._id}" data-status="${q.status}" data-client="${q.clientName}">
                                <td><strong>#${q.quoteNumber || q._id.slice(-6)}</strong></td>
                                <td><div><strong>${q.clientName}</strong><small>${q.clientEmail}</small></div></td>
                                <td><div><strong>${q.projectTitle}</strong><small>${q.projectType}</small></div></td>
                                <td><span id="amount-${q._id}">${formatCurrency(q.amount)}</span><button class="btn btn-sm btn-link" onclick="editQuoteAmount('${q._id}', ${q.amount})"><i class="fas fa-edit"></i></button></td>
                                <td><select class="status-select" onchange="updateQuoteStatus('${q._id}', this.value)" data-current="${q.status}">${['pending', 'approved', 'rejected', 'completed'].map(s => `<option value="${s}" ${q.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select></td>
                                <td>${formatDate(q.createdAt)}</td>
                                <td><div class="action-buttons"><button class="btn btn-sm btn-info" onclick="viewQuoteDetails('${q._id}')"><i class="fas fa-eye"></i></button><button class="btn btn-sm btn-danger" onclick="deleteQuote('${q._id}')"><i class="fas fa-trash"></i></button></div></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load quotes</h3><button class="btn btn-primary" onclick="renderAdminQuotes()"><i class="fas fa-redo"></i> Retry</button></div>`;
    }
}

function filterQuotes(searchTerm) {
    document.querySelectorAll('#quotes-table tbody tr').forEach(row => {
        const client = row.dataset.client.toLowerCase();
        const project = row.cells[2].textContent.toLowerCase();
        row.style.display = (client.includes(searchTerm.toLowerCase()) || project.includes(searchTerm.toLowerCase())) ? '' : 'none';
    });
}

function filterQuotesByStatus(status) {
    document.querySelectorAll('#quotes-table tbody tr').forEach(row => {
        row.style.display = (!status || row.dataset.status === status) ? '' : 'none';
    });
}

async function updateQuoteStatus(quoteId, newStatus) {
    try {
        await apiCall(`/admin/quotes/${quoteId}/status`, 'PATCH', { status: newStatus });
        showNotification('Quote status updated', 'success');
        document.querySelector(`tr[data-quote-id="${quoteId}"]`).dataset.status = newStatus;
    } catch (error) {
        const select = document.querySelector(`select[onchange*="${quoteId}"]`);
        if (select) select.value = select.dataset.current;
    }
}

async function editQuoteAmount(quoteId, currentAmount) {
    const newAmount = prompt('Enter new amount:', currentAmount);
    if (newAmount && !isNaN(newAmount)) {
        try {
            await apiCall(`/admin/quotes/${quoteId}/amount`, 'PATCH', { amount: parseFloat(newAmount) });
            document.getElementById(`amount-${quoteId}`).textContent = formatCurrency(parseFloat(newAmount));
            showNotification('Amount updated', 'success');
        } catch (error) { /* Handled */ }
    }
}

async function viewQuoteDetails(quoteId) {
    try {
        const { quote } = await apiCall(`/admin/quotes/${quoteId}`);
        showModal('quote-details-modal', `
            <div class="quote-details-modal">
                <h3>Quote Details - #${quote.quoteNumber || quote._id.slice(-6)}</h3>
                <div class="quote-header">
                    <div><h4>Client</h4><p>${quote.clientName}</p><p>${quote.clientEmail}</p></div>
                    <div><h4>Project</h4><p>${quote.projectTitle}</p><p><strong>Status:</strong> <span class="status-badge ${quote.status}">${quote.status}</span></p></div>
                </div>
                <div class="quote-description"><h4>Description</h4><p>${quote.description || 'N/A'}</p></div>
                <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>
            </div>`);
    } catch (error) { /* Handled */ }
}

async function deleteQuote(quoteId) {
    if (confirm('Delete this quote?')) {
        try {
            await apiCall(`/admin/quotes/${quoteId}`, 'DELETE');
            showNotification('Quote deleted', 'success');
            renderAdminQuotes();
        } catch (error) { /* Handled */ }
    }
}

// --- ENHANCED ESTIMATION MANAGEMENT ---
async function renderAdminEstimations() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { estimations } = await apiCall('/admin/estimations');
        if (!estimations || estimations.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-calculator"></i><h3>No estimations found</h3><p>Estimation requests will appear here.</p></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title"><h2>Estimations Management</h2><span class="count-badge">${estimations.length} estimations</span></div>
                <div class="section-actions">
                    <div class="search-box"><i class="fas fa-search"></i><input type="text" placeholder="Search..." oninput="filterEstimations(this.value)"></div>
                    <select onchange="filterEstimationsByStatus(this.value)"><option value="">All Status</option><option value="pending">Pending</option><option value="in-progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
                    <button class="btn btn-primary" onclick="exportEstimations()"><i class="fas fa-download"></i> Export CSV</button>
                </div>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="estimations-table">
                    <thead><tr><th>Project</th><th>Contractor</th><th>Status</th><th>Files</th><th>Created</th><th>Due Date</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${estimations.map(est => `
                            <tr data-estimation-id="${est._id}" data-status="${est.status}" data-contractor="${est.contractorName}">
                                <td><div><strong>${est.projectTitle}</strong><small>${est.projectType || 'General'}</small></div></td>
                                <td><div><strong>${est.contractorName}</strong><small>${est.contractorEmail}</small></div></td>
                                <td><select class="status-select" onchange="updateEstimationStatus('${est._id}', this.value)" data-current="${est.status}">${['pending', 'in-progress', 'completed', 'cancelled'].map(s => `<option value="${s}" ${est.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select></td>
                                <td><span class="file-count">${est.uploadedFiles?.length || 0} files</span> ${est.uploadedFiles?.length ? `<button class="btn btn-sm btn-link" onclick="viewEstimationFiles('${est._id}')"><i class="fas fa-paperclip"></i></button>` : ''}</td>
                                <td>${formatDate(est.createdAt)}</td>
                                <td>${est.dueDate ? formatDate(est.dueDate) : `<button class="btn btn-sm btn-outline" onclick="setEstimationDueDate('${est._id}')"><i class="fas fa-calendar-plus"></i> Set</button>`}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-info" onclick="viewEstimationDetails('${est._id}')" title="Details"><i class="fas fa-eye"></i></button>
                                        ${est.status !== 'completed' && est.status !== 'cancelled' ? `<button class="btn btn-sm btn-success" onclick="uploadEstimationResult('${est._id}')" title="Upload Result"><i class="fas fa-upload"></i></button>` : ''}
                                        ${est.resultFile ? `<button class="btn btn-sm btn-primary" onclick="downloadEstimationResult('${est._id}')" title="Download Result"><i class="fas fa-download"></i></button>` : ''}
                                        <button class="btn btn-sm btn-danger" onclick="deleteEstimation('${est._id}')" title="Delete"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load estimations</h3><button class="btn btn-primary" onclick="renderAdminEstimations()"><i class="fas fa-redo"></i> Retry</button></div>`;
    }
}

function filterEstimations(searchTerm) {
    document.querySelectorAll('#estimations-table tbody tr').forEach(row => {
        const contractor = row.dataset.contractor.toLowerCase();
        const project = row.cells[0].textContent.toLowerCase();
        row.style.display = (contractor.includes(searchTerm.toLowerCase()) || project.includes(searchTerm.toLowerCase())) ? '' : 'none';
    });
}

function filterEstimationsByStatus(status) {
    document.querySelectorAll('#estimations-table tbody tr').forEach(row => {
        row.style.display = (!status || row.dataset.status === status) ? '' : 'none';
    });
}

async function updateEstimationStatus(estimationId, newStatus) {
    try {
        await apiCall(`/admin/estimations/${estimationId}/status`, 'PATCH', { status: newStatus });
        showNotification('Status updated', 'success');
        document.querySelector(`tr[data-estimation-id="${estimationId}"]`).dataset.status = newStatus;
    } catch (error) {
        const select = document.querySelector(`select[onchange*="${estimationId}"]`);
        if (select) select.value = select.dataset.current;
    }
}

async function viewEstimationDetails(estimationId) {
    try {
        const { estimation } = await apiCall(`/admin/estimations/${estimationId}`);
        showModal('estimation-details-modal', `
            <div class="estimation-details-modal">
                <h3>Estimation Details</h3>
                <div>...</div> 
                <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>
            </div>`);
    } catch(e){/* handled */}
}

async function viewEstimationFiles(estimationId) {
    try {
        const { files } = await apiCall(`/admin/estimations/${estimationId}/files`);
        showModal('files-modal', `
            <div class="files-modal">
                <h3>Uploaded Files</h3>
                <div class="files-grid">${files.map(file => `...`).join('')}</div>
                <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>
            </div>`);
    } catch(e){/* handled */}
}

function getFileIcon(fileType) {
    const icons = {'pdf':'file-pdf', 'doc':'file-word', 'docx':'file-word', 'xls':'file-excel', 'xlsx':'file-excel', 'jpg':'file-image', 'png':'file-image', 'zip':'file-archive'};
    const ext = fileType?.split('.').pop().toLowerCase() || fileType;
    return icons[ext] || 'file';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function setEstimationDueDate(estimationId) {
    const dueDate = prompt('Enter due date (YYYY-MM-DD):');
    if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        try {
            await apiCall(`/admin/estimations/${estimationId}/due-date`, 'PATCH', { dueDate });
            showNotification('Due date set', 'success');
            renderAdminEstimations();
        } catch (error) { /* Handled */ }
    } else if (dueDate) {
        showNotification('Invalid date format', 'error');
    }
}

async function uploadEstimationResult(estimationId) {
    showModal('upload-result-modal', `...`); // Modal content for upload
    document.getElementById('upload-result-form').addEventListener('submit', async (e) => {
        // Form submission logic
    });
}

async function downloadEstimationResult(estimationId) {
    // Logic to trigger file download
}

async function deleteEstimation(estimationId) {
    if (confirm('Delete this estimation?')) {
        try {
            await apiCall(`/admin/estimations/${estimationId}`, 'DELETE');
            showNotification('Estimation deleted', 'success');
            renderAdminEstimations();
        } catch (error) { /* Handled */ }
    }
}

// --- JOBS MANAGEMENT ---
async function renderAdminJobs() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { jobs } = await apiCall('/admin/jobs');
        if (!jobs || jobs.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-briefcase"></i><h3>No jobs found</h3><p>Jobs will appear here once projects are initiated.</p></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title"><h2>Jobs Management</h2><span class="count-badge">${jobs.length} jobs</span></div>
                <div class="section-actions">
                    <div class="search-box"><i class="fas fa-search"></i><input type="text" placeholder="Search..." oninput="filterJobs(this.value)"></div>
                    <select onchange="filterJobsByStatus(this.value)"><option value="">All Status</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="on-hold">On Hold</option></select>
                    <button class="btn btn-primary" onclick="exportJobs()"><i class="fas fa-download"></i> Export CSV</button>
                </div>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="jobs-table">
                    <thead><tr><th>Job #</th><th>Project</th><th>Client</th><th>Contractor</th><th>Value</th><th>Status</th><th>Progress</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${jobs.map(job => `
                            <tr data-job-id="${job._id}" data-status="${job.status}" data-client="${job.clientName}">
                                <td><strong>#${job.jobNumber || job._id.slice(-6)}</strong></td>
                                <td><div><strong>${job.projectTitle}</strong><small>${job.projectType}</small></div></td>
                                <td><div><strong>${job.clientName}</strong><small>${job.clientEmail}</small></div></td>
                                <td><div><strong>${job.contractorName}</strong><small>${job.contractorCompany || 'Independent'}</small></div></td>
                                <td>${formatCurrency(job.value)}</td>
                                <td><select class="status-select" onchange="updateJobStatus('${job._id}', this.value)" data-current="${job.status}">${['active', 'completed', 'cancelled', 'on-hold'].map(s => `<option value="${s}" ${job.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select></td>
                                <td><div class="progress-container"><div class="progress-bar"><div class="progress-fill" style="width: ${job.progress || 0}%"></div></div><span class="progress-text">${job.progress || 0}%</span></div></td>
                                <td><div class="action-buttons"><button class="btn btn-sm btn-info" onclick="viewJobDetails('${job._id}')" title="Details"><i class="fas fa-eye"></i></button><button class="btn btn-sm btn-warning" onclick="updateJobProgress('${job._id}', ${job.progress || 0})" title="Update Progress"><i class="fas fa-chart-line"></i></button><button class="btn btn-sm btn-danger" onclick="deleteJob('${job._id}')" title="Delete"><i class="fas fa-trash"></i></button></div></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load jobs</h3><button class="btn btn-primary" onclick="renderAdminJobs()"><i class="fas fa-redo"></i> Retry</button></div>`;
    }
}

function filterJobs(searchTerm) {
    document.querySelectorAll('#jobs-table tbody tr').forEach(row => {
        const client = row.dataset.client.toLowerCase();
        const project = row.cells[1].textContent.toLowerCase();
        const contractor = row.cells[3].textContent.toLowerCase();
        row.style.display = (client.includes(searchTerm.toLowerCase()) || project.includes(searchTerm.toLowerCase()) || contractor.includes(searchTerm.toLowerCase())) ? '' : 'none';
    });
}

function filterJobsByStatus(status) {
    document.querySelectorAll('#jobs-table tbody tr').forEach(row => {
        row.style.display = (!status || row.dataset.status === status) ? '' : 'none';
    });
}

async function updateJobStatus(jobId, newStatus) {
    try {
        await apiCall(`/admin/jobs/${jobId}/status`, 'PATCH', { status: newStatus });
        showNotification('Job status updated', 'success');
        document.querySelector(`tr[data-job-id="${jobId}"]`).dataset.status = newStatus;
    } catch (error) {
        const select = document.querySelector(`select[onchange*="${jobId}"]`);
        if (select) select.value = select.dataset.current;
    }
}

async function updateJobProgress(jobId, currentProgress) {
    const newProgress = prompt('Enter progress percentage (0-100):', currentProgress);
    if (newProgress && !isNaN(newProgress)) {
        const progress = Math.max(0, Math.min(100, parseInt(newProgress)));
        try {
            await apiCall(`/admin/jobs/${jobId}/progress`, 'PATCH', { progress });
            showNotification('Job progress updated', 'success');
            renderAdminJobs();
        } catch (error) { /* Handled */ }
    }
}

async function viewJobDetails(jobId) {
    try {
        const { job } = await apiCall(`/admin/jobs/${jobId}`);
        showModal('job-details-modal', `...`); // Modal content for job details
    } catch (error) { /* Handled */ }
}

async function deleteJob(jobId) {
    if (confirm('Delete this job?')) {
        try {
            await apiCall(`/admin/jobs/${jobId}`, 'DELETE');
            showNotification('Job deleted', 'success');
            renderAdminJobs();
        } catch (error) { /* Handled */ }
    }
}

// --- MESSAGES MANAGEMENT ---
async function renderAdminMessages() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        const { messages } = await apiCall('/admin/messages');
        window.messagesData = messages; // Store for global access by helpers

        if (!messages || messages.length === 0) {
            contentArea.innerHTML = `<div class="empty-state"><i class="fas fa-envelope-open-text"></i><h3>No messages found</h3><p>Messages from users will appear here.</p></div>`;
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-section-header">
                <div class="section-title"><h2>Messages</h2><span class="count-badge">${messages.length} total</span></div>
                <div class="section-actions">
                    <button class="btn btn-info" onclick="markAllAsRead()"><i class="fas fa-check-double"></i> Mark All as Read</button>
                    <button class="btn btn-primary" onclick="exportMessages()"><i class="fas fa-download"></i> Export CSV</button>
                </div>
            </div>
            <div class="admin-table-container">
                <table class="admin-table" id="messages-table">
                    <thead><tr><th>Sender</th><th>Subject</th><th>Status</th><th>Received</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${messages.map(msg => `
                            <tr class="message-row ${!msg.isRead ? 'unread' : ''}" data-message-id="${msg._id}">
                                <td><div><strong>${msg.senderName}</strong><small>${msg.senderEmail}</small></div></td>
                                <td>${msg.subject}</td>
                                <td><span class="status-badge ${msg.isBlocked ? 'blocked' : (msg.status || 'read')}">${msg.isBlocked ? 'Blocked' : (msg.status || 'read')}</span></td>
                                <td>${new Date(msg.createdAt).toLocaleString()}</td>
                                <td><div class="action-buttons">
                                    <button class="btn btn-sm btn-info" onclick="viewMessageDetails('${msg._id}')"><i class="fas fa-eye"></i></button>
                                    <button class="btn btn-sm btn-primary" onclick="replyToMessage('${msg._id}')"><i class="fas fa-reply"></i></button>
                                    <button class="btn btn-sm btn-danger" onclick="deleteMessage('${msg._id}')"><i class="fas fa-trash"></i></button>
                                    <button class="btn btn-sm ${msg.isBlocked ? 'btn-success' : 'btn-warning'}" onclick="blockMessage('${msg._id}', ${!msg.isBlocked})"><i class="fas fa-shield-alt"></i></button>
                                </div></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        contentArea.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load messages</h3><button class="btn btn-primary" onclick="renderAdminMessages()"><i class="fas fa-redo"></i> Retry</button></div>`;
    }
}

async function viewMessageDetails(messageId) {
    try {
        const { message } = await apiCall(`/admin/messages/${messageId}`);
        if (!message.isRead) await updateMessageStatus(messageId, 'read', false);
        showModal('message-details-modal', `...`); // Modal for message details
    } catch (error) { /* Handled */ }
}

async function replyToMessage(messageId) {
    // Reply modal logic
}

async function updateMessageStatus(messageId, newStatus, showNotif = true) {
    try {
        await apiCall(`/admin/messages/${messageId}/status`, 'PATCH', { status: newStatus, isRead: true });
        if (showNotif) {
            showNotification('Message status updated', 'success');
            renderAdminMessages();
        }
    } catch (error) { /* Handled */ }
}

async function markAllAsRead() {
    if (confirm('Mark all unread messages as read?')) {
        // Logic to mark all as read
    }
}

async function deleteMessage(messageId) {
    if (confirm('Delete this message?')) {
        // Deletion logic
    }
}

async function blockMessage(messageId, block = true) {
    // Block/unblock logic
}

// --- SUBSCRIPTION MANAGEMENT ---
async function renderAdminSubscriptions() {
    // Placeholder for subscription rendering
    renderComingSoon('subscriptions');
}

// --- SYSTEM STATS ---
async function renderSystemStats() {
    // Placeholder for system stats rendering
    renderComingSoon('system-stats');
}

// --- EXPORT FUNCTIONS ---
async function exportData(type) {
    try {
        showNotification(`Exporting ${type}...`, 'info');
        const response = await apiCall(`/admin/export/${type}`, 'GET');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${type}-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} exported successfully`, 'success');
    } catch (error) { 
        showNotification(`Failed to export ${type}: ${error.message}`, 'error');
    }
}

function exportUsers() { exportData('users'); }
function exportQuotes() { exportData('quotes'); }
function exportEstimations() { exportData('estimations'); }
function exportJobs() { exportData('jobs'); }
function exportMessages() { exportData('messages'); }

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('admin-login-form')) initializeLoginPage();
    if (document.getElementById('admin-panel-container')) initializeAdminPage();

    document.addEventListener('click', e => {
        if (e.target.classList.contains('modal-overlay')) closeModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
});
