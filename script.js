

function initializeAdminPage() {
    // This function will run ONLY on admin.html
    const adminPanel = document.getElementById('admin-panel-container');
    if (!adminPanel) return; // Exit if not on the admin page

    console.log("Admin Panel Initializing...");

    // Reuse the main app's login check
    const token = localStorage.getItem('jwtToken');
    const user = localStorage.getItem('currentUser');

    if (token && user) {
        try {
            appState.jwtToken = token;
            const parsedUser = JSON.parse(user);
            
            // CRITICAL: Check if the user is an admin
            if (parsedUser.role === 'admin') {
                appState.currentUser = parsedUser;
                setupAdminPanel();
            } else {
                showAdminLoginPrompt();
            }
        } catch (error) {
            showAdminLoginPrompt();
        }
    } else {
        showAdminLoginPrompt();
    }
}

function showAdminLoginPrompt() {
    document.getElementById('admin-login-prompt').style.display = 'flex';
    document.getElementById('admin-panel-container').style.display = 'none';
}

function setupAdminPanel() {
    document.getElementById('admin-login-prompt').style.display = 'none';
    document.getElementById('admin-panel-container').style.display = 'flex';
    
    // Display user info and setup logout
    document.getElementById('admin-user-info').innerHTML = `
        <strong>${appState.currentUser.name}</strong>
        <small>${appState.currentUser.role}</small>
    `;
    document.getElementById('admin-logout-btn').addEventListener('click', () => {
        logout();
        window.location.href = 'index.html'; // Redirect after logout
    });

    // Setup navigation
    const navLinks = document.querySelectorAll('.admin-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const section = link.dataset.section;
            document.getElementById('admin-section-title').textContent = link.textContent;
            renderAdminSection(section);
        });
    });

    // Load the default dashboard view
    renderAdminSection('dashboard');
}

function renderAdminSection(section) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>'; // Loading state

    switch (section) {
        case 'dashboard':
            renderAdminDashboard();
            break;
        case 'users':
            renderAdminUsers();
            break;
        case 'quotes':
            // You can build this function using apiCall('/admin/quotes', 'GET')
            contentArea.innerHTML = "Quotes overview section is under construction.";
            break;
        case 'system-stats':
            renderAdminSystemStats();
            break;
        default:
            contentArea.innerHTML = 'Section not found.';
    }
}

async function renderAdminDashboard() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        // API CALL SAMPLE: Using your apiCall function
        const response = await apiCall('/admin/dashboard', 'GET');
        const stats = response.stats;
        
        contentArea.innerHTML = `
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <i class="fas fa-users"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalUsers}</span>
                        <span class="stat-label">Total Users</span>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <i class="fas fa-comments"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalMessages}</span>
                        <span class="stat-label">Total Messages</span>
                    </div>
                </div>
                 <div class="admin-stat-card">
                    <i class="fas fa-file-invoice-dollar"></i>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalQuotes}</span>
                        <span class="stat-label">Total Quotes</span>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load dashboard data.</div>';
    }
}

async function renderAdminUsers() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        // API CALL SAMPLE: Getting users
        const response = await apiCall('/admin/users', 'GET');
        const users = response.users;

        if (users.length === 0) {
            contentArea.innerHTML = '<div class="empty-state">No users found.</div>';
            return;
        }

        contentArea.innerHTML = `
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => `
                            <tr data-user-id="${user.id}">
                                <td>${user.name}</td>
                                <td>${user.email}</td>
                                <td><span class="user-role-badge ${user.role}">${user.role}</span></td>
                                <td>
                                    <select class="status-select" onchange="handleStatusUpdate('${user.id}', this.value)">
                                        <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                    </select>
                                </td>
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="handleUserDelete('${user.id}')">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load user data.</div>';
    }
}

async function renderAdminSystemStats() {
    const contentArea = document.getElementById('admin-content-area');
    try {
        // API CALL SAMPLE: Getting system stats
        const response = await apiCall('/admin/system-stats', 'GET');
        const stats = response.stats;
        
        contentArea.innerHTML = `
            <div class="system-stats-container">
                <h3>System Information</h3>
                <ul>
                    <li><strong>Node.js Version:</strong> ${stats.nodeVersion}</li>
                    <li><strong>Platform:</strong> ${stats.platform}</li>
                    <li><strong>Server Uptime:</strong> ${(stats.serverUptime / 3600).toFixed(2)} hours</li>
                    <li><strong>Memory Usage (Heap Used):</strong> ${(stats.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB</li>
                </ul>
            </div>
        `;
    } catch (error) {
        contentArea.innerHTML = '<div class="error-state">Failed to load system stats.</div>';
    }
}

async function handleStatusUpdate(userId, newStatus) {
    if (confirm(`Are you sure you want to change this user's status to ${newStatus}?`)) {
        // API CALL SAMPLE: Updating user status
        await apiCall(`/admin/users/${userId}/status`, 'PUT', { status: newStatus }, `User status updated to ${newStatus}.`)
            .catch(() => {}); // Errors are handled by apiCall
    }
    renderAdminUsers(); // Refresh the list
}

async function handleUserDelete(userId) {
    if (confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
        // API CALL SAMPLE: Deleting a user
        await apiCall(`/admin/users/${userId}`, 'DELETE', null, 'User deleted successfully.')
            .catch(() => {});
        renderAdminUsers(); // Refresh the list
    }
}