// script.js - Complete Enhanced Admin Panel Logic with All Functions
// Updated to be fully compatible with the provided src/routes/admin.js backend.
// This version incorporates enhanced file management, a support ticket system, and a corrected analysis portal.

// Helper: safely parse any date format (Firestore Timestamp, ISO string, Date, epoch)
function parseAdminDate(val) {
    if (!val) return null;
    let d;
    if (typeof val === 'string') {
        d = new Date(val);
    } else if (val.toDate && typeof val.toDate === 'function') {
        d = val.toDate();
    } else if (typeof val._seconds === 'number') {
        d = new Date(val._seconds * 1000);
    } else if (typeof val.seconds === 'number') {
        d = new Date(val.seconds * 1000);
    } else if (val instanceof Date) {
        d = val;
    } else if (typeof val === 'number') {
        d = new Date(val < 10000000000 ? val * 1000 : val);
    } else {
        d = new Date(String(val));
    }
    return (d && !isNaN(d.getTime())) ? d : null;
}

function formatAdminDate(val, fallback = 'N/A') {
    const d = parseAdminDate(val);
    return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : fallback;
}

document.addEventListener('DOMContentLoaded', initializeAdminPanel);

// --- INACTIVITY TIMER FOR AUTO-LOGOUT (5 MIN) ---
let adminInactivityTimer;
let adminWarningTimer;

function resetAdminInactivityTimer() {
    clearTimeout(adminInactivityTimer);
    clearTimeout(adminWarningTimer);
    // Warning at 4 minutes
    adminWarningTimer = setTimeout(() => {
        showAdminInactivityWarning();
    }, 240000);
    // Logout at 5 minutes
    adminInactivityTimer = setTimeout(() => {
        dismissAdminInactivityWarning();
        showNotification('You have been logged out due to inactivity.', 'warning');
        setTimeout(() => logout(), 1500);
    }, 300000);
}

function showAdminInactivityWarning() {
    dismissAdminInactivityWarning();
    const warning = document.createElement('div');
    warning.id = 'admin-inactivity-warning';
    warning.className = 'admin-inactivity-overlay';
    warning.innerHTML = `
        <div class="admin-inactivity-modal">
            <div class="admin-inactivity-icon"><i class="fas fa-exclamation-triangle"></i></div>
            <h3>Session Timeout Warning</h3>
            <p>You will be logged out in <strong>1 minute</strong> due to inactivity.</p>
            <p>Click anywhere or press a key to stay logged in.</p>
            <button class="btn btn-primary" onclick="dismissAdminInactivityWarning()">Stay Logged In</button>
        </div>
    `;
    document.body.appendChild(warning);
    const dismiss = () => { dismissAdminInactivityWarning(); document.removeEventListener('mousemove', dismiss); };
    setTimeout(() => document.addEventListener('mousemove', dismiss, { once: true }), 200);
}

function dismissAdminInactivityWarning() {
    const el = document.getElementById('admin-inactivity-warning');
    if (el) { el.remove(); resetAdminInactivityTimer(); }
}

function initAdminInactivityTimer() {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'wheel'];
    events.forEach(ev => window.addEventListener(ev, resetAdminInactivityTimer, { passive: true }));
    resetAdminInactivityTimer();
}

// --- CONFIGURATION & GLOBAL STATE ---
const API_BASE_URL = 'https://steelconnect-backend.onrender.com';
const state = {
    users: [],
    incompleteUsers: [],
    incompleteUsersStats: {},
    profileReviews: [],
    estimations: [],
    jobs: [],
    quotes: [],
    messages: [],
    conversations: [],
    supportMessages: [],
    communityPosts: [],
    announcements: [],
    contractorRequests: [], // For Analysis Portal
    analysisFilterStatus: 'all',
    systemAdminData: [],
    systemAdminTrash: [],
    systemAdminActiveCollection: null,
    systemAdminView: 'live', // 'live' or 'trash'
    systemAdminSelectedIds: [],
    marketingRecipients: [],
    marketingRecipientStats: {},
    marketingCampaigns: [],
    marketingSelectedIds: [],
    prospects: [],
    prospectStats: {},
    prospectCampaigns: [],
    prospectSelectedIds: [],
    chatbotReports: [],
    chatbotReportsStats: {},
    bulkEmailHistory: [],
    activityLogs: [],
    collectedEmails: [],
    collectedEmailStats: {},
    collectedEmailSelectedIds: [],
    emailCollectionEnabled: false,
    visitors: [],
    visitorStats: {},
    subscriptions: [],
    subscriptionStats: {},
    subscriptionPlans: {},
    meetings: [],
};

// --- INITIALIZATION ---
async function initializeAdminPanel() {
    const token = getToken();
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!token || !user || (user.role !== 'admin' && user.type !== 'admin')) {
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('adminName').textContent = user.name || user.email;

    // Start inactivity auto-logout timer (5 min)
    initAdminInactivityTimer();

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
    const controller = new AbortController();
    const isFormData = isFileUpload || body instanceof FormData;
    const timeout = isFormData ? 120000 : 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const options = { method, headers: { 'Authorization': `Bearer ${token}` }, signal: controller.signal };
    if (body) {
        if (isFormData) {
            options.body = body;
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin${endpoint}`, options);
        clearTimeout(timeoutId);
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
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            const msg = 'Request timed out. The file may be too large or the connection is slow. Please try again.';
            console.error(`API Call Timeout (${endpoint})`);
            showNotification(msg, 'error');
            throw new Error(msg);
        }
        console.error(`API Call Failed (${endpoint}):`, error);
        showNotification(error.message, 'error');
        throw error;
    }
}

function logout() {
    clearTimeout(adminInactivityTimer);
    clearTimeout(adminWarningTimer);
    dismissAdminInactivityWarning();
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
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Update sidebar active state
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-link[data-tab="${tabName}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Show target tab
    const tabEl = document.getElementById(`${tabName}-tab`);
    if (tabEl) tabEl.classList.add('active');

    // Update page title
    const titleMap = {
        'dashboard': { title: 'Dashboard', subtitle: 'Overview of your admin portal' },
        'users': { title: 'Users', subtitle: 'Manage all registered users' },
        'incomplete-users': { title: 'Incomplete Profiles', subtitle: 'Users who registered but haven\'t completed their profile' },
        'profile-reviews': { title: 'Profile Reviews', subtitle: 'Review pending profile submissions' },
        'meetings': { title: 'Meetings', subtitle: 'View and manage all scheduled meetings across projects' },
        'conversations': { title: 'Conversations', subtitle: 'Monitor user conversations' },
        'estimations': { title: 'Estimations', subtitle: 'Manage estimation requests' },
        'jobs': { title: 'Jobs', subtitle: 'View and manage all jobs' },
        'quotes': { title: 'Quotes', subtitle: 'View designer quotes' },
        'messages': { title: 'Messages', subtitle: 'Manage contact messages' },
        'support-messages': { title: 'Support Tickets', subtitle: 'Handle support requests' },
        'community-feed': { title: 'Community Feed', subtitle: 'Moderate community posts' },
        'announcements': { title: 'News & Updates', subtitle: 'Manage announcements, offers, and maintenance notices' },
        'analysis-portal': { title: 'Analysis Portal', subtitle: 'Business analytics management' },
        'system-admin': { title: 'System Admin', subtitle: 'Master data control — delete, restore, and manage all portal data' },
        'prospect-outreach': { title: 'Prospect Outreach', subtitle: 'Manage captured leads and send invitation emails' },
        'marketing-email': { title: 'Marketing Email', subtitle: 'Send professional marketing emails to approved users' },
        'chatbot-reports': { title: 'Chatbot Reports', subtitle: 'View chatbot conversations, email leads, and send draft replies' },
        'bulk-email': { title: 'Bulk Email Campaign', subtitle: 'Send professional emails to up to 1,000 recipients at once' },
        'email-collection': { title: 'Email Collection', subtitle: 'Intelligent discovery of contractor company emails worldwide' },
        'visitor-analytics': { title: 'Visitor Analytics', subtitle: 'Track who browses your website, how long they stay, and where they come from' },
        'activity-logs': { title: 'Activity Reports & Notifications', subtitle: 'All activities (admin + user + visitors) with real-time email & WhatsApp alerts to sabincn676@gmail.com / 9895909666' },
        'subscriptions': { title: 'Subscriptions', subtitle: 'Manage subscription plans, view client details, and control billing' },
        'whatsapp-marketing': { title: 'WhatsApp Marketing', subtitle: 'Send marketing messages to clients via WhatsApp Business API — Sender: 9895909666 (testing)' },
    };
    const info = titleMap[tabName] || { title: tabName, subtitle: '' };
    const pageTitleEl = document.getElementById('pageTitle');
    const pageSubEl = document.getElementById('pageSubtitle');
    if (pageTitleEl) pageTitleEl.textContent = info.title;
    if (pageSubEl) pageSubEl.textContent = info.subtitle;

    // Always reload dashboard stats to reflect latest data
    if (tabName === 'dashboard') {
        loadDashboardStats();
        return;
    }

    // Lazy load data
    const manualLoadMap = {
        'incomplete-users': { data: state.incompleteUsers, loader: loadIncompleteUsersData },
        'estimations': { data: state.estimations, loader: loadEstimationsData },
        'jobs': { data: state.jobs, loader: () => loadGenericData('jobs') },
        'quotes': { data: state.quotes, loader: () => loadGenericData('quotes') },
        'messages': { data: state.messages, loader: loadMessagesData },
        'conversations': { data: state.conversations, loader: loadConversationsData },
        'support-messages': { data: state.supportMessages || [], loader: loadSupportMessagesData },
        'community-feed': { data: state.communityPosts, loader: loadCommunityPostsData },
        'announcements': { data: state.announcements, loader: loadAnnouncementsData },
        'analysis-portal': { data: state.contractorRequests, loader: loadAnalysisPortalData },
        'system-admin': { data: [], loader: loadSystemAdminOverview },
        'prospect-outreach': { data: state.prospects || [], loader: loadProspectData },
        'marketing-email': { data: state.marketingRecipients || [], loader: loadMarketingEmailData },
        'chatbot-reports': { data: state.chatbotReports || [], loader: loadChatbotReportsData },
        'bulk-email': { data: [], loader: renderBulkEmailTab },
        'email-collection': { data: state.collectedEmails || [], loader: loadEmailCollectionData },
        'visitor-analytics': { data: state.visitors || [], loader: loadVisitorAnalyticsData },
        'activity-logs': { data: state.activityLogs, loader: loadActivityLogsData },
        'subscriptions': { data: state.subscriptions || [], loader: loadSubscriptionsData },
        'whatsapp-marketing': { data: state.whatsappRecipients || [], loader: loadWhatsAppMarketingData },
        'meetings': { data: state.meetings || [], loader: loadMeetingsData },
    };

    if (manualLoadMap[tabName] && manualLoadMap[tabName].data.length === 0) {
        manualLoadMap[tabName].loader();
    }

    // Always reload users and profile reviews for fresh data (new signups)
    if (tabName === 'users') loadUsersData();
    if (tabName === 'profile-reviews') loadProfileReviewsData();
}

// --- DASHBOARD ---
async function loadDashboardStats() {
    const statsGrid = document.getElementById('statsGrid');
    try {
        const { stats } = await apiCall('/dashboard');
        const analysisStats = await loadAnalysisStats(); // Fetch analysis stats
        
        const supportCount = stats.totalSupportTickets || stats.totalSupportMessages || 0;
        const criticalCount = stats.criticalSupportTickets || 0;
        
        // Update all sidebar badges with counts
        updateAdminSidebarBadges(stats);

        statsGrid.innerHTML = `
            <div class="stat-card stat-card-indigo">
                <div class="stat-icon users"><i class="fas fa-users"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.totalUsers || 0}</div>
                    <div class="stat-label">Total Users</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('users')"><i class="fas fa-arrow-right"></i> View All</button></div>
                </div>
            </div>
            <div class="stat-card stat-card-amber">
                <div class="stat-icon reviews"><i class="fas fa-user-check"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.pendingProfileReviews || 0}</div>
                    <div class="stat-label">Pending Reviews</div>
                    <div class="stat-action"><button class="btn btn-sm btn-primary" onclick="showTab('profile-reviews')"><i class="fas fa-arrow-right"></i> Review</button></div>
                </div>
            </div>
            <div class="stat-card" style="border-left:4px solid #f59e0b">
                <div class="stat-icon" style="background:rgba(245,158,11,0.1)"><i class="fas fa-user-clock" style="color:#f59e0b"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.incompleteProfileUsers || 0}</div>
                    <div class="stat-label">Incomplete Profiles</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('incomplete-users')"><i class="fas fa-arrow-right"></i> View</button></div>
                </div>
            </div>
            <div class="stat-card stat-card-blue">
                <div class="stat-icon jobs"><i class="fas fa-briefcase"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.totalJobs || 0}</div>
                    <div class="stat-label">Total Jobs</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('jobs')"><i class="fas fa-arrow-right"></i> View</button></div>
                </div>
            </div>
            <div class="stat-card stat-card-violet">
                <div class="stat-icon quotes"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.totalQuotes || 0}</div>
                    <div class="stat-label">Total Quotes</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('quotes')"><i class="fas fa-arrow-right"></i> View</button></div>
                </div>
            </div>
            <div class="stat-card stat-card-emerald">
                <div class="stat-icon conversations"><i class="fas fa-comments"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.totalConversations || 0}</div>
                    <div class="stat-label">Conversations</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('conversations')"><i class="fas fa-arrow-right"></i> View</button></div>
                </div>
            </div>
            <div class="stat-card stat-card-teal" style="border-left:4px solid #14b8a6">
                <div class="stat-icon" style="background:rgba(20,184,166,0.1)"><i class="fas fa-calculator" style="color:#14b8a6"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.pendingEstimations || 0}<small style="font-size:14px;color:#6b7280;font-weight:400"> / ${stats.totalEstimations || 0}</small></div>
                    <div class="stat-label">Pending Estimations</div>
                    ${(stats.completedEstimations || 0) > 0 ? `<small style="color:#10b981"><i class="fas fa-check-circle"></i> ${stats.completedEstimations} Completed</small>` : ''}
                    <div class="stat-action"><button class="btn btn-sm btn-primary" onclick="showTab('estimations')"><i class="fas fa-arrow-right"></i> Review</button></div>
                </div>
            </div>
            <div class="stat-card stat-card-rose">
                <div class="stat-icon support"><i class="fas fa-headset"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.pendingSupportTickets || 0}<small style="font-size:14px;color:#6b7280;font-weight:400"> / ${supportCount}</small></div>
                    <div class="stat-label">Pending Support Tickets</div>
                    ${criticalCount > 0 ? `<small class="critical-indicator"><i class="fas fa-exclamation-triangle"></i> ${criticalCount} Critical</small>` : ''}
                    <div class="stat-action"><button class="btn btn-sm btn-primary" onclick="showTab('support-messages')"><i class="fas fa-arrow-right"></i> Manage</button></div>
                </div>
            </div>
            <div class="stat-card stat-card-orange">
                <div class="stat-icon analysis"><i class="fas fa-chart-line"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${analysisStats.pending || 0}<small style="font-size:14px;color:#6b7280;font-weight:400"> / ${analysisStats.total || 0}</small></div>
                    <div class="stat-label">Pending Analysis</div>
                    <div class="stat-action"><button class="btn btn-sm btn-outline" onclick="showTab('analysis-portal')"><i class="fas fa-arrow-right"></i> View Portal</button></div>
                </div>
            </div>
            <div class="stat-card stat-card-gold">
                <div class="stat-icon community"><i class="fas fa-newspaper"></i></div>
                <div class="stat-content">
                    <div class="stat-number">${stats.pendingCommunityPosts || 0}<small style="font-size:14px;color:#6b7280;font-weight:400"> / ${stats.totalCommunityPosts || 0}</small></div>
                    <div class="stat-label">Pending Community Posts</div>
                    <div class="stat-action"><button class="btn btn-sm btn-primary" onclick="showTab('community-feed')"><i class="fas fa-arrow-right"></i> Moderate</button></div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        statsGrid.innerHTML = `<p class="error">Failed to load dashboard stats.</p>`;
    }
}


// --- ADMIN SIDEBAR BADGE UPDATER ---
function updateAdminSidebarBadges(stats) {
    const badgeMap = {
        'reviewsBadge': stats.pendingProfileReviews || 0,
        'incompleteUsersBadge': stats.incompleteProfileUsers || 0,
        'communityPendingBadge': stats.pendingCommunityPosts || 0,
        'jobsBadge': stats.totalJobs || 0,
        'quotesBadge': stats.totalQuotes || 0,
        'estimationsBadge': stats.pendingEstimations || 0,
        'supportBadge': stats.pendingSupportTickets || 0,
        'analysisBadge': stats.pendingAnalysisRequests || 0,
    };
    Object.entries(badgeMap).forEach(([id, count]) => {
        const el = document.getElementById(id);
        if (el) {
            if (count > 0) {
                el.textContent = count > 99 ? '99+' : count;
                el.style.display = 'inline-flex';
                // Pulse effect for attention-worthy counts
                if (['reviewsBadge', 'estimationsBadge', 'supportBadge', 'analysisBadge'].includes(id) && count > 0) {
                    el.classList.add('badge-pulse');
                    setTimeout(() => el.classList.remove('badge-pulse'), 2000);
                }
            } else {
                el.textContent = '';
                el.style.display = 'none';
            }
        }
    });
}

// --- USER MANAGEMENT ---
async function loadUsersData() {
    const container = document.getElementById('users-tab');
    showLoader(container);
    try {
        const { users } = await apiCall('/users');
        state.users = users;
        renderUsersTab();
        // Update sidebar badge with count of new users (registered in last 24h)
        const oneDayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const newCount = users.filter(u => u.createdAt && (now - new Date(u.createdAt).getTime()) < oneDayMs).length;
        const badge = document.getElementById('newUsersBadge');
        if (badge) badge.textContent = newCount > 0 ? newCount : '';
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load users.</p><button class="btn" onclick="loadUsersData()">Retry</button>`;
    }
}

function renderUsersTab() {
    const container = document.getElementById('users-tab');
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const newGoogleUsers = state.users.filter(u => u.authProvider === 'google' && u.createdAt && (now - new Date(u.createdAt).getTime()) < oneDayMs);
    container.innerHTML = `
        <div class="section-header">
            <h3>All Users (${state.users.length})</h3>
            <div class="header-actions">
                <button class="btn" onclick="loadUsersData()">Refresh</button>
                <button class="btn btn-primary" onclick="exportData('users')">Export Users</button>
            </div>
        </div>
        ${newGoogleUsers.length > 0 ? `
        <div style="padding:14px 18px;margin:0 0 16px 0;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;display:flex;align-items:center;gap:10px;">
            <i class="fas fa-user-plus" style="color:#2563eb;font-size:18px;"></i>
            <div>
                <strong style="color:#1e40af;">${newGoogleUsers.length} new Google sign-up${newGoogleUsers.length > 1 ? 's' : ''} in the last 24 hours</strong>
                <span style="color:#3b82f6;margin-left:8px;font-size:0.9rem;">${newGoogleUsers.map(u => u.email + ' (' + (u.role || 'N/A') + ')').join(', ')}</span>
            </div>
        </div>` : ''}
        <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Auth</th><th>Profile</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
                ${state.users.map(user => {
                    const isNew = user.createdAt && (now - new Date(user.createdAt).getTime()) < oneDayMs;
                    const newBadge = isNew ? ' <span style="background:#22c55e;color:#fff;font-size:0.65rem;padding:1px 6px;border-radius:4px;font-weight:700;vertical-align:middle;margin-left:4px;">NEW</span>' : '';
                    return `
                    <tr${isNew ? ' style="background:#f0fdf4;"' : ''}>
                        <td>${user.name || 'N/A'}${newBadge}</td>
                        <td>${user.email}</td>
                        <td>${user.role}</td>
                        <td>${user.authProvider === 'google' ? '<span class="iu-badge" style="background:#fff;border:1px solid #dadce0;color:#3c4043;font-size:0.75rem;padding:2px 8px;gap:4px;"><svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:middle;margin-right:3px;"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Google</span>' : '<span class="iu-badge" style="background:#f1f5f9;color:#64748b;font-size:0.75rem;padding:2px 8px;"><i class="fas fa-envelope" style="font-size:11px;margin-right:3px;"></i>Email</span>'}</td>
                        <td><span class="iu-badge ${user.profileStatus === 'approved' ? 'iu-badge-approved' : user.profileStatus === 'pending' ? 'iu-badge-pending' : 'iu-badge-incomplete'}" style="font-size:0.75rem;padding:2px 8px;">${(user.profileStatus || 'incomplete').charAt(0).toUpperCase() + (user.profileStatus || 'incomplete').slice(1)}</span></td>
                        <td>
                            <span class="status ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span>
                            ${user.isBlocked ? `<span class="status blocked">Blocked</span>` : ''}
                        </td>
                        <td class="action-buttons">
                            <button class="btn btn-sm ${user.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatus('${user._id}', ${!user.isActive})">${user.isActive ? 'Deactivate' : 'Activate'}</button>
                            <button class="btn btn-sm ${user.isBlocked ? 'btn-success' : 'btn-warning'}" onclick="showBlockUserModal('${user._id}', '${user.email}', ${user.isBlocked})">${user.isBlocked ? 'Unblock' : 'Block'}</button>
                            ${user.profileStatus === 'approved' || user.profileStatus === 'pending' ? `<button class="btn btn-sm" style="background:#f59e0b;color:#fff;border:none;" onclick="showRequireProfileUpdateModal('${user._id}', '${(user.name || '').replace(/'/g, "\\'")}', '${user.email}')" title="Request profile update"><i class="fas fa-user-edit"></i> Update Profile</button>` : ''}
                        </td>
                    </tr>`;
                }).join('')}
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

// --- REQUIRE PROFILE UPDATE ---
function showRequireProfileUpdateModal(userId, userName, userEmail) {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-user-edit" style="color:#f59e0b;margin-right:8px;"></i>Request Profile Update</h3>
            <p>User: <strong>${userName || userEmail}</strong></p>
            <p style="color:#64748b;font-size:0.9rem;">This will reset the user's profile status to <strong>Incomplete</strong>. Next time they log in, they will be redirected to complete their profile before accessing any features.</p>
            <div class="form-group">
                <label for="profile-update-reason">Reason (shown to user):</label>
                <textarea id="profile-update-reason" rows="3" placeholder="e.g., Please update your company details, upload latest certificates..."></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn btn-warning" style="background:#f59e0b;color:#fff;border:none;" onclick="confirmRequireProfileUpdate('${userId}')">
                    <i class="fas fa-paper-plane"></i> Require Profile Update
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

async function confirmRequireProfileUpdate(userId) {
    const reason = document.getElementById('profile-update-reason')?.value || '';
    try {
        const data = await apiCall(`/users/${userId}/require-profile-update`, 'POST', {
            reason: sanitizeInput(reason)
        });
        showNotification(data.message, 'success');
        closeModal();
        await loadUsersData();
    } catch (error) {
        showNotification('Failed to update profile status.', 'error');
    }
}

// --- INCOMPLETE PROFILE USERS ---
async function loadIncompleteUsersData() {
    const container = document.getElementById('incomplete-users-tab');
    showLoader(container);
    try {
        const { incompleteUsers, stats } = await apiCall('/incomplete-users');
        state.incompleteUsers = incompleteUsers;
        state.incompleteUsersStats = stats;
        renderIncompleteUsersTab();
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load incomplete users.</p><button class="btn" onclick="loadIncompleteUsersData()">Retry</button>`;
    }
}

function renderIncompleteUsersTab(filter = 'all', search = '') {
    const container = document.getElementById('incomplete-users-tab');
    const stats = state.incompleteUsersStats || {};
    const searchLower = search.toLowerCase();

    let filtered = state.incompleteUsers;
    if (filter === 'never-logged') filtered = filtered.filter(u => !u.lastLogin);
    else if (filter === 'logged-no-profile') filtered = filtered.filter(u => u.lastLogin);
    else if (filter === 'designer') filtered = filtered.filter(u => u.type === 'designer');
    else if (filter === 'contractor') filtered = filtered.filter(u => u.type === 'contractor');
    else if (filter === 'blocked') filtered = filtered.filter(u => u.isBlocked);
    else if (filter === 'google') filtered = filtered.filter(u => u.authProvider === 'google');

    if (searchLower) {
        filtered = filtered.filter(u =>
            (u.name || '').toLowerCase().includes(searchLower) ||
            (u.email || '').toLowerCase().includes(searchLower)
        );
    }

    container.innerHTML = `
        <div class="iu-header">
            <div class="iu-header-left">
                <div class="iu-icon-wrap"><i class="fas fa-user-clock"></i></div>
                <div>
                    <h2>Incomplete Profile Users</h2>
                    <p>Users who registered but haven't completed their profile. These users can login but have limited platform access until profile completion.</p>
                </div>
            </div>
            <div>
                <button class="btn" onclick="loadIncompleteUsersData()"><i class="fas fa-sync-alt"></i> Refresh</button>
            </div>
        </div>

        <!-- Manual Email Send Section -->
        <div class="iu-manual-email" style="display:flex;align-items:center;gap:12px;padding:16px 20px;margin:0 0 16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;flex-wrap:wrap;">
            <div style="font-size:14px;font-weight:600;color:#334155;white-space:nowrap;"><i class="fas fa-plus-circle" style="color:#2563eb;margin-right:6px;"></i>Send Invite Manually</div>
            <input type="email" id="iuManualEmail" placeholder="Enter email address..." style="flex:1;min-width:200px;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;outline:none;" />
            <select id="iuManualType" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;outline:none;">
                <option value="contractor">Contractor</option>
                <option value="designer">Designer</option>
            </select>
            <button class="btn btn-sm" onclick="iuSendManualEmail()" style="white-space:nowrap;"><i class="fas fa-paper-plane"></i> Send</button>
        </div>

        <div class="iu-stats-row">
            <div class="iu-stat-card iu-stat-total">
                <div class="iu-stat-value">${stats.total || 0}</div>
                <div class="iu-stat-label">Total Incomplete</div>
            </div>
            <div class="iu-stat-card iu-stat-never">
                <div class="iu-stat-value">${stats.neverLoggedIn || 0}</div>
                <div class="iu-stat-label">Never Logged In</div>
            </div>
            <div class="iu-stat-card iu-stat-logged">
                <div class="iu-stat-value">${stats.loggedInNoProfile || 0}</div>
                <div class="iu-stat-label">Logged In, No Profile</div>
            </div>
            <div class="iu-stat-card iu-stat-designer">
                <div class="iu-stat-value">${stats.designers || 0}</div>
                <div class="iu-stat-label">Designers</div>
            </div>
            <div class="iu-stat-card iu-stat-contractor">
                <div class="iu-stat-value">${stats.contractors || 0}</div>
                <div class="iu-stat-label">Contractors</div>
            </div>
        </div>

        <div class="iu-search-bar">
            <input type="text" placeholder="Search by name or email..." value="${search}" oninput="renderIncompleteUsersTab(document.getElementById('iuFilterSelect').value, this.value)" />
            <select id="iuFilterSelect" onchange="renderIncompleteUsersTab(this.value, document.querySelector('.iu-search-bar input').value)">
                <option value="all" ${filter === 'all' ? 'selected' : ''}>All Users</option>
                <option value="never-logged" ${filter === 'never-logged' ? 'selected' : ''}>Never Logged In</option>
                <option value="logged-no-profile" ${filter === 'logged-no-profile' ? 'selected' : ''}>Logged In, No Profile</option>
                <option value="designer" ${filter === 'designer' ? 'selected' : ''}>Designers Only</option>
                <option value="contractor" ${filter === 'contractor' ? 'selected' : ''}>Contractors Only</option>
                <option value="google" ${filter === 'google' ? 'selected' : ''}>Google Sign-In</option>
                <option value="blocked" ${filter === 'blocked' ? 'selected' : ''}>Blocked Users</option>
            </select>
        </div>

        ${filtered.length === 0 ? `
            <div class="iu-empty">
                <i class="fas fa-check-circle"></i>
                <h3>No incomplete profiles found</h3>
                <p>${filter !== 'all' ? 'Try changing the filter.' : 'All users have completed their profiles.'}</p>
            </div>
        ` : `
            <div class="iu-table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Registered</th>
                            <th>Last Login</th>
                            <th>IP Address</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(u => {
                            const initials = (u.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                            const typeClass = u.type === 'designer' ? 'designer' : u.type === 'contractor' ? 'contractor' : 'unknown';
                            const statusBadge = u.isBlocked ? 'iu-badge-blocked' : u.profileStatus === 'pending' ? 'iu-badge-pending' : 'iu-badge-incomplete';
                            const statusText = u.isBlocked ? 'Blocked' : u.profileStatus === 'pending' ? 'Pending Review' : 'Incomplete';
                            const regDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
                            const regTime = u.createdAt ? new Date(u.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
                            const lastLogin = u.lastLogin ? formatTimeAgo(u.lastLogin) : null;

                            return `<tr>
                                <td>
                                    <div class="iu-user-cell">
                                        <div class="iu-avatar ${typeClass}">${u.authProvider === 'google' && u.profilePicture ? `<img src="${u.profilePicture}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : initials}</div>
                                        <div class="iu-user-info">
                                            <span class="iu-user-name">${u.name || 'Not provided'} ${u.authProvider === 'google' ? '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:middle;margin-left:4px;" title="Google Account"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>' : ''}</span>
                                            <span class="iu-user-email">${u.email}</span>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="iu-badge iu-badge-${typeClass}">${(u.type || 'Unknown').charAt(0).toUpperCase() + (u.type || 'unknown').slice(1)}</span></td>
                                <td><span class="iu-badge ${statusBadge}"><i class="fas fa-${u.isBlocked ? 'ban' : 'clock'}"></i> ${statusText}</span></td>
                                <td>
                                    <div>${regDate}</div>
                                    <div class="iu-time-ago">${regTime}</div>
                                </td>
                                <td>
                                    ${lastLogin ? `
                                        <div class="iu-login-status"><span class="iu-login-dot active"></span> ${lastLogin}</div>
                                    ` : `
                                        <div class="iu-login-status"><span class="iu-login-dot never"></span> Never</div>
                                    `}
                                </td>
                                <td><span class="iu-ip">${u.lastLoginIP || '-'}</span></td>
                                <td>
                                    <button class="btn btn-sm btn-outline" onclick="sendReminderEmail('${u._id}', '${u.email}')" title="Send reminder email"><i class="fas fa-envelope"></i></button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div style="padding:12px 16px;font-size:0.82rem;color:var(--gray-400)">Showing ${filtered.length} of ${state.incompleteUsers.length} users</div>
        `}
    `;
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return 'Never';
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function sendReminderEmail(userId, email) {
    if (!confirm(`Send a profile completion reminder to ${email}?`)) return;
    try {
        await apiCall(`/users/${userId}/send-reminder`, 'POST', { email });
        showNotification(`Reminder sent to ${email}`, 'success');
    } catch (error) {
        showNotification('Failed to send reminder.', 'error');
    }
}

async function iuSendManualEmail() {
    const emailInput = document.getElementById('iuManualEmail');
    const typeSelect = document.getElementById('iuManualType');
    const email = emailInput?.value?.trim();
    const userType = typeSelect?.value || 'contractor';

    if (!email || !email.includes('@')) {
        showNotification('Please enter a valid email address.', 'warning');
        return;
    }
    if (!confirm(`Send profile completion invite to ${email} (${userType})?`)) return;

    try {
        await apiCall('/send-manual-invite', 'POST', { email, userType });
        showNotification(`Invite sent to ${email}`, 'success');
        emailInput.value = '';
    } catch (error) {
        showNotification('Failed to send invite email.', 'error');
    }
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
    const isDesigner = user.type === 'designer';
    const isContractor = user.type === 'contractor';

    // Build profile info rows
    let profileInfoHTML = '';

    // Common fields
    profileInfoHTML += `
        <div class="profile-detail-section">
            <h4><i class="fas fa-user"></i> Basic Information</h4>
            <div class="profile-detail-grid">
                <div class="profile-detail-item"><label>Full Name</label><span>${user.name}</span></div>
                <div class="profile-detail-item"><label>Email</label><span>${user.email}</span></div>
                <div class="profile-detail-item"><label>User Type</label><span class="profile-type-badge profile-type-${user.type}">${user.type.charAt(0).toUpperCase() + user.type.slice(1)}</span></div>
                <div class="profile-detail-item"><label>Status</label><span class="status ${review.status}">${review.status.charAt(0).toUpperCase() + review.status.slice(1)}</span></div>
                ${user.phone ? `<div class="profile-detail-item"><label>Phone</label><span>${user.phone}</span></div>` : ''}
                ${user.linkedinProfile ? `<div class="profile-detail-item"><label>LinkedIn</label><span><a href="${user.linkedinProfile}" target="_blank" style="color:#2563eb;">${user.linkedinProfile}</a></span></div>` : ''}
                ${user.submittedAt ? `<div class="profile-detail-item"><label>Submitted</label><span>${new Date(user.submittedAt).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>` : ''}
            </div>
        </div>`;

    // Designer-specific fields
    if (isDesigner) {
        profileInfoHTML += `
        <div class="profile-detail-section">
            <h4><i class="fas fa-paint-brush"></i> Designer Details</h4>
            <div class="profile-detail-grid">
                ${user.skills && user.skills.length > 0 ? `<div class="profile-detail-item profile-detail-full"><label>Skills</label><div class="profile-tags">${user.skills.map(s => `<span class="profile-tag">${s}</span>`).join('')}</div></div>` : ''}
                ${user.specializations && user.specializations.length > 0 ? `<div class="profile-detail-item profile-detail-full"><label>Specializations</label><div class="profile-tags">${user.specializations.map(s => `<span class="profile-tag profile-tag-alt">${s}</span>`).join('')}</div></div>` : ''}
                ${user.experience ? `<div class="profile-detail-item profile-detail-full"><label>Experience</label><span>${user.experience}</span></div>` : ''}
                ${user.education ? `<div class="profile-detail-item profile-detail-full"><label>Education</label><span>${user.education}</span></div>` : ''}
                ${user.bio ? `<div class="profile-detail-item profile-detail-full"><label>Professional Bio</label><span>${user.bio}</span></div>` : ''}
                ${user.hourlyRate ? `<div class="profile-detail-item"><label>Hourly Rate</label><span>$${user.hourlyRate}/hr</span></div>` : ''}
            </div>
        </div>`;
    }

    // Contractor-specific fields
    if (isContractor) {
        profileInfoHTML += `
        <div class="profile-detail-section">
            <h4><i class="fas fa-building"></i> Company Details</h4>
            <div class="profile-detail-grid">
                ${user.companyName ? `<div class="profile-detail-item"><label>Company Name</label><span>${user.companyName}</span></div>` : ''}
                ${user.businessType ? `<div class="profile-detail-item"><label>Business Type</label><span>${user.businessType}</span></div>` : ''}
                ${user.yearEstablished ? `<div class="profile-detail-item"><label>Year Established</label><span>${user.yearEstablished}</span></div>` : ''}
                ${user.companySize ? `<div class="profile-detail-item"><label>Company Size</label><span>${user.companySize} employees</span></div>` : ''}
                ${user.companyWebsite ? `<div class="profile-detail-item"><label>Website</label><span><a href="${user.companyWebsite}" target="_blank" style="color:#2563eb;">${user.companyWebsite}</a></span></div>` : ''}
                ${user.address ? `<div class="profile-detail-item profile-detail-full"><label>Address</label><span>${user.address}</span></div>` : ''}
                ${user.description ? `<div class="profile-detail-item profile-detail-full"><label>Company Description</label><span>${user.description}</span></div>` : ''}
            </div>
        </div>`;
    }

    // Documents section with preview
    let documentsHTML = '';
    if (documents.length > 0) {
        documentsHTML = `
        <div class="profile-detail-section">
            <h4><i class="fas fa-folder-open"></i> Uploaded Documents (${documents.length})</h4>
            <div class="profile-documents-grid">
                ${documents.map((doc, i) => {
                    const isPDF = (doc.filename || '').toLowerCase().endsWith('.pdf') || (doc.type === 'resume');
                    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.filename || '');
                    const safeFilename = (doc.filename || 'document').replace(/'/g, "\\'");
                    const docLabel = doc.type === 'resume' ? 'Resume' : doc.type === 'certificate' ? 'Certificate' : doc.type === 'license' ? 'Business License' : doc.type === 'insurance' ? 'Insurance' : 'Document';
                    return `
                    <div class="profile-doc-card">
                        <div class="profile-doc-header">
                            <span class="profile-doc-type-badge profile-doc-type-${doc.type}">${docLabel}</span>
                        </div>
                        <div class="profile-doc-preview" id="doc-preview-${i}">
                            ${isImage ? `<img src="${doc.url}" alt="${doc.filename}" style="max-width:100%;max-height:200px;border-radius:8px;">` :
                              isPDF ? `<iframe src="${doc.url}#toolbar=1&navpanes=0" style="width:100%;height:300px;border:none;border-radius:8px;" title="${doc.filename}"></iframe>` :
                              `<div class="profile-doc-icon"><i class="fas ${getFileIcon(doc.type, doc.filename)} fa-3x"></i><p>${doc.filename}</p></div>`}
                        </div>
                        <div class="profile-doc-info">
                            <span class="profile-doc-name" title="${doc.filename}"><i class="fas ${getFileIcon(doc.type, doc.filename)}"></i> ${doc.filename}</span>
                        </div>
                        <div class="profile-doc-actions">
                            <a href="${doc.url}" target="_blank" class="btn btn-sm"><i class="fas fa-external-link-alt"></i> Open</a>
                            <button class="btn btn-sm btn-primary" onclick="downloadFile('${doc.url}', '${safeFilename}')"><i class="fas fa-download"></i> Download</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            ${documents.length > 1 ? `<div style="text-align:center;margin-top:12px;"><button class="btn" onclick="downloadAllProfileFiles('${reviewId}')"><i class="fas fa-download"></i> Download All Files</button></div>` : ''}
        </div>`;
    } else {
        documentsHTML = `
        <div class="profile-detail-section">
            <h4><i class="fas fa-folder-open"></i> Uploaded Documents</h4>
            <p style="color:#94a3b8;text-align:center;padding:20px;">No documents uploaded.</p>
        </div>`;
    }

    const modalContent = `
        <div class="profile-review-modal-full">
            <div class="profile-review-header">
                <h3><i class="fas fa-user-check"></i> Profile Review: ${user.name}</h3>
                <span class="status ${review.status}" style="font-size:13px;padding:4px 12px;border-radius:20px;">${review.status.charAt(0).toUpperCase() + review.status.slice(1)}</span>
            </div>
            ${profileInfoHTML}
            ${documentsHTML}
            <div class="review-actions" style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
                <button class="btn btn-success" onclick="approveProfileWithComment('${reviewId}')"><i class="fas fa-check"></i> Approve</button>
                <button class="btn btn-danger" onclick="showRejectModal('${reviewId}')"><i class="fas fa-times"></i> Reject</button>
            </div>
        </div>
    `;
    showModal(modalContent);
    // Make modal wider for full profile view
    const modalEl = document.querySelector('.modal-content');
    if (modalEl) modalEl.classList.add('large');
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

async function downloadAllProfileFiles(reviewId) {
    const review = state.profileReviews.find(r => r._id === reviewId);
    if (!review || !review.user.documents || review.user.documents.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    const docs = review.user.documents;
    showNotification(`Downloading ${docs.length} file(s)...`, 'info');
    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        await downloadFileSilent(doc.url, doc.filename || `resume_${i + 1}.pdf`);
        if (i < docs.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    showNotification(`${docs.length} file(s) downloaded successfully.`, 'success');
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
            <thead>
                <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Files</th>
                    <th>AI Report</th>
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
                    const hasAI = !!(est.aiEstimate);
                    const aiStatus = est.aiStatus || (hasAI ? 'completed' : null);
                    const amountDisplay = est.estimatedAmount ? '$' + Number(est.estimatedAmount).toLocaleString() : '';
                    const confScore = est.aiEstimate?.validationReport?.confidenceScore;
                    const confLevel = est.aiEstimate?.validationReport?.confidenceLevel;
                    const passStatus = est.passStatus || {};
                    const valIssues = est.aiEstimate?.validationReport?.issues || [];
                    const critCount = valIssues.filter(i => i.severity === 'critical').length;
                    const warnCount = valIssues.filter(i => i.severity === 'warning').length;

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
                                        <i class="fas fa-file"></i>
                                        <span class="file-count">${fileCount} file${fileCount > 1 ? 's' : ''}</span>
                                        ${totalSizeMB ? `<br><small class="file-size">${totalSizeMB}</small>` : ''}
                                        <button class="btn btn-xs" onclick="showEstimationFiles('${est._id}')">View</button>
                                    </div>
                                ` : '<span class="no-files">No files</span>'}
                            </td>
                            <td>
                                ${hasAI ? `
                                    <span class="status completed" style="font-size:11px;">AI Ready</span>
                                    ${confScore ? `<span style="font-size:10px;margin-left:4px;padding:1px 6px;border-radius:8px;font-weight:700;background:${confScore >= 70 ? '#d1fae5' : confScore >= 40 ? '#fef3c7' : '#fee2e2'};color:${confScore >= 70 ? '#065f46' : confScore >= 40 ? '#92400e' : '#991b1b'}">${confScore}%</span>` : ''}
                                    ${amountDisplay ? `<br><small><strong>${amountDisplay}</strong></small>` : ''}
                                    ${critCount > 0 ? `<br><small style="color:#dc2626;font-size:10px;">${critCount} critical</small>` : ''}${warnCount > 0 ? `<small style="color:#d97706;font-size:10px;margin-left:3px;">${warnCount} warnings</small>` : ''}
                                    <br><button class="btn btn-xs" onclick="viewAIEstimate('${est._id}')"><i class="fas fa-eye"></i> View</button>
                                ` : aiStatus === 'generating' ? `
                                    <span class="status pending" style="font-size:11px;"><i class="fas fa-spinner fa-spin"></i> Generating...</span>
                                    <br><small style="color:#64748b;">${passStatus.pass5 ? 'Pass 5: Validating' : passStatus.pass4 ? 'Pass 4: Applying costs' : passStatus.pass3 ? 'Pass 3: Quantity takeoff' : passStatus.pass2 ? 'Pass 2: Extracting' : passStatus.pass1 ? 'Pass 1: Classifying' : 'AI multi-pass running'}</small>
                                ` : aiStatus === 'failed' ? `
                                    <span class="status rejected" style="font-size:11px;">AI Failed</span>
                                    ${est.aiError ? `<br><small style="color:#ef4444;" title="${est.aiError}">Error</small>` : ''}
                                    <br><button class="btn btn-xs btn-warning" onclick="confirmGenerateAI('${est._id}')"><i class="fas fa-redo"></i> Retry</button>
                                ` : `
                                    <span class="pending-result" style="font-size:11px; color:#f59e0b;"><i class="fas fa-clock"></i> Awaiting AI</span>
                                    <br><button class="btn btn-xs btn-success" onclick="confirmGenerateAI('${est._id}')" style="margin-top:4px; background:#10b981; color:#fff; font-weight:600;">
                                        <i class="fas fa-robot"></i> Generate AI Estimate
                                    </button>
                                `}
                            </td>
                            <td>
                                ${est.resultFile ? `
                                    <button class="btn btn-xs result-link" onclick="viewEstimationResult('${est._id}')">
                                        <i class="fas fa-file-alt"></i> View Result
                                    </button>
                                    <button class="btn btn-xs" onclick="downloadEstimationResult('${est._id}')" title="Download">
                                        <i class="fas fa-download"></i>
                                    </button>
                                ` : '<span class="pending-result">Pending</span>'}
                            </td>
                            <td>
                                <small>${formatAdminDate(est.createdAt)}</small>
                            </td>
                            <td class="action-buttons">
                                ${hasAI && est.status !== 'completed' ? `
                                    <button class="btn btn-sm btn-success" onclick="sendAIReport('${est._id}')">
                                        <i class="fas fa-robot"></i> Send AI Report
                                    </button>
                                ` : ''}
                                <button class="btn btn-sm" onclick="showUploadResultModal('${est._id}')">
                                    <i class="fas fa-upload"></i> Upload Manual Result
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
                <span class="files-count"><i class="fas fa-file-pdf"></i> ${files.length} PDF file${files.length !== 1 ? 's' : ''}</span>
                ${totalSize > 0 ? `<span class="files-size-badge"><i class="fas fa-database"></i> Total: ${totalSizeMB} MB</span>` : ''}
            </div>

            ${files.length > 0 ? `
                <div class="files-grid">
                    ${files.map((file, index) => {
                        const fileName = file.originalname || file.filename || file.name || `File ${index + 1}`;
                        const fileSizeBytes = file.size || 0;
                        const fileSizeMB = fileSizeBytes > 0 ? (fileSizeBytes / (1024 * 1024)).toFixed(2) : null;
                        const fileSizeKB = fileSizeBytes > 0 ? (fileSizeBytes / 1024).toFixed(1) : null;
                        const fileSizeDisplay = fileSizeMB ? (parseFloat(fileSizeMB) >= 1 ? fileSizeMB + ' MB' : fileSizeKB + ' KB') : 'Unknown size';
                        const uploadDate = formatAdminDate(file.uploadedAt, 'Unknown date');

                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas fa-file-pdf"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size-badge">${fileSizeDisplay}</span>
                                        <span class="file-date"><i class="fas fa-calendar-alt"></i> ${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <button class="btn btn-sm btn-outline" onclick="viewEstimationFile('${estimationId}', ${index})">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </button>
                                    <button class="btn btn-sm btn-primary" onclick="downloadEstimationFile('${estimationId}', ${index}, '${fileName.replace(/'/g, "\\'")}')">
                                        <i class="fas fa-download"></i> Download
                                    </button>
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

async function downloadAllEstimationFiles(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation || !estimation.uploadedFiles || estimation.uploadedFiles.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    const files = estimation.uploadedFiles;
    showNotification(`Downloading ${files.length} file(s)...`, 'info');
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = file.originalname || file.filename || `estimation_file_${i + 1}.pdf`;
        await downloadEstimationFile(estimationId, i, name);
        if (i < files.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    showNotification(`${files.length} file(s) downloaded successfully.`, 'success');
}

// Fetch a fresh signed URL from the API and open/download an estimation file
async function viewEstimationFile(estimationId, fileIndex) {
    try {
        const data = await apiCall(`/estimations/${estimationId}/download/${fileIndex}`);
        if (data.file && data.file.url) {
            window.open(data.file.url, '_blank');
        } else {
            showNotification('Could not generate file link.', 'error');
        }
    } catch (error) {
        showNotification('Failed to load file: ' + error.message, 'error');
    }
}

async function downloadEstimationFile(estimationId, fileIndex, fileName) {
    try {
        const data = await apiCall(`/estimations/${estimationId}/download/${fileIndex}`);
        if (data.file && data.file.url) {
            await downloadFileSilent(data.file.url, fileName || data.file.name || `file_${fileIndex}.pdf`);
        } else {
            showNotification('Could not generate download link.', 'error');
        }
    } catch (error) {
        showNotification('Failed to download file: ' + error.message, 'error');
    }
}

async function viewEstimationResult(estimationId) {
    try {
        showNotification('Loading result file...', 'info');
        const data = await apiCall(`/estimations/${estimationId}/result/download`);
        if (data.file && data.file.url) {
            window.open(data.file.url, '_blank');
        } else {
            showNotification('Could not generate file link.', 'error');
        }
    } catch (error) {
        showNotification('Failed to load result file: ' + error.message, 'error');
    }
}

async function downloadEstimationResult(estimationId) {
    try {
        showNotification('Preparing download...', 'info');
        const data = await apiCall(`/estimations/${estimationId}/result/download`);
        if (data.file && data.file.url) {
            await downloadFileSilent(data.file.url, data.file.name || 'estimation_result.pdf');
        } else {
            showNotification('Could not generate download link.', 'error');
        }
    } catch (error) {
        showNotification('Failed to download result: ' + error.message, 'error');
    }
}

function viewAIEstimate(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation || !estimation.aiEstimate) return showNotification('No AI estimate found.', 'error');

    const ai = estimation.aiEstimate;
    const s = ai.summary || {};
    const curr = s.currencySymbol || '$';
    const trades = ai.trades || ai.tradesSummary || [];
    const structAnalysis = ai.structuralAnalysis || {};
    const matSummary = ai.materialSummary || {};
    const matSchedule = ai.materialSchedule || {};
    const drawingExtraction = ai.drawingExtraction || {};
    const validation = ai.validationReport || {};
    const confidenceScore = validation.finalConfidenceScore || validation.confidenceScore || s.confidenceScore || 0;
    const confidenceLevel = validation.confidenceLevel || s.confidenceLevel || 'Medium';
    const confidenceFactors = validation.confidenceFactors || [];
    const benchmarkComp = validation.benchmarkComparison || {};
    const rateSourceSummary = validation.rateSourceSummary || {};
    const rateSourceBreakdown = structAnalysis.rateSourceBreakdown || {};
    const validationIssues = validation.issues || [];
    const passesCompleted = structAnalysis.passesCompleted || 0;
    const multiPassMeta = ai._multiPassMeta || {};

    let tradesHTML = '';
    trades.forEach(t => {
        // Material schedule rows
        let matRows = '';
        if (t.materialSchedule && t.materialSchedule.length > 0) {
            matRows = `<tr><td colspan="3" style="padding:8px;background:#f0f4ff;">
                <strong style="color:#6366f1;font-size:0.85rem;"><i class="fas fa-boxes"></i> Material Schedule</strong>
                <table style="width:100%;margin-top:6px;font-size:0.82rem;"><thead><tr><th>Material</th><th>Spec</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Cost</th></tr></thead><tbody>
                ${t.materialSchedule.map(m => `<tr><td><strong>${m.material}</strong></td><td>${m.specification || '-'}</td><td>${Number(m.quantity || 0).toLocaleString()}</td><td>${m.unit}</td><td>${curr}${Number(m.unitRate || 0).toLocaleString()}</td><td>${curr}${Number(m.totalCost || 0).toLocaleString()}</td></tr>`).join('')}
                </tbody></table></td></tr>`;
        }
        // Line items
        let lineRows = '';
        if (t.lineItems && t.lineItems.length > 0) {
            lineRows = t.lineItems.map(li => `<tr><td>${li.description}${li.materialDetails ? `<div style="font-size:0.75rem;color:#8b5cf6;font-style:italic;">${li.materialDetails}</div>` : ''}</td><td>${curr}${Number(li.materialCost || 0).toLocaleString()}</td><td>${curr}${Number(li.laborCost || 0).toLocaleString()}</td><td>${curr}${Number(li.lineTotal || 0).toLocaleString()}</td></tr>`).join('');
        }
        tradesHTML += `<tr style="background:#f8fafc;font-weight:600;"><td>${t.tradeName || t.name || ''} <span style="color:#94a3b8;font-weight:400;">(Div ${t.division || ''})</span></td><td>${curr}${Number(t.subtotal || t.amount || 0).toLocaleString()}</td><td>${(t.percentOfTotal || 0).toFixed(1)}%</td></tr>`;
        if (matRows) tradesHTML += matRows;
        if (lineRows) tradesHTML += `<tr><td colspan="3" style="padding:6px 8px;"><details><summary style="cursor:pointer;color:#3b82f6;font-size:0.85rem;">View ${t.lineItems.length} Line Items</summary><table style="width:100%;margin-top:6px;font-size:0.82rem;"><thead><tr><th>Description</th><th>Material</th><th>Labor</th><th>Total</th></tr></thead><tbody>${lineRows}</tbody></table></details></td></tr>`;
    });

    const breakdown = ai.costBreakdown || {};
    const assumptions = ai.assumptions || [];
    const exclusions = ai.exclusions || [];

    // Drawing Extraction section (Vision Analysis results)
    let drawingHTML = '';
    if (drawingExtraction.dimensionsFound && drawingExtraction.dimensionsFound.length > 0) {
        drawingHTML = `<h4 style="margin-bottom:8px;"><i class="fas fa-ruler-combined"></i> Drawing Analysis - Extracted Data <span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;margin-left:8px;">VISION ANALYZED</span></h4>`;
        if (structAnalysis.analysisMethod) {
            drawingHTML += `<div style="background:#ecfdf5;padding:8px 12px;border-radius:6px;font-size:0.82rem;color:#065f46;margin-bottom:10px;"><i class="fas fa-eye"></i> ${structAnalysis.analysisMethod}</div>`;
        }
        if (structAnalysis.filesAnalyzed && structAnalysis.filesAnalyzed.length > 0) {
            drawingHTML += `<div style="font-size:0.8rem;color:#6b7280;margin-bottom:8px;"><i class="fas fa-file-pdf"></i> Files analyzed: ${structAnalysis.filesAnalyzed.join(', ')}</div>`;
        }
        drawingHTML += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">`;
        if (drawingExtraction.dimensionsFound.length > 0) {
            drawingHTML += `<div style="background:#f0fdf4;padding:10px;border-radius:6px;border:1px solid #bbf7d0;grid-column:span 2;"><strong style="color:#166534;font-size:0.85rem;"><i class="fas fa-ruler"></i> Dimensions</strong><ul style="margin:4px 0;padding-left:16px;font-size:0.82rem;">${drawingExtraction.dimensionsFound.map(d => `<li>${d}</li>`).join('')}</ul></div>`;
        }
        if (drawingExtraction.memberSizesFound && drawingExtraction.memberSizesFound.length > 0) {
            drawingHTML += `<div style="background:#eff6ff;padding:10px;border-radius:6px;border:1px solid #bfdbfe;grid-column:span 2;"><strong style="color:#1e40af;font-size:0.85rem;"><i class="fas fa-columns"></i> Member Sizes</strong><ul style="margin:4px 0;padding-left:16px;font-size:0.82rem;">${drawingExtraction.memberSizesFound.map(m => `<li>${m}</li>`).join('')}</ul></div>`;
        }
        if (drawingExtraction.schedulesFound && drawingExtraction.schedulesFound.length > 0) {
            drawingHTML += `<div style="background:#fef3c7;padding:10px;border-radius:6px;border:1px solid #fde68a;grid-column:span 2;"><strong style="color:#92400e;font-size:0.85rem;"><i class="fas fa-table"></i> Schedules</strong><ul style="margin:4px 0;padding-left:16px;font-size:0.82rem;">${drawingExtraction.schedulesFound.map(s => `<li>${s}</li>`).join('')}</ul></div>`;
        }
        if (drawingExtraction.materialsNoted && drawingExtraction.materialsNoted.length > 0) {
            drawingHTML += `<div style="background:#f5f3ff;padding:10px;border-radius:6px;border:1px solid #ddd6fe;"><strong style="color:#5b21b6;font-size:0.85rem;"><i class="fas fa-flask"></i> Materials</strong><ul style="margin:4px 0;padding-left:16px;font-size:0.82rem;">${drawingExtraction.materialsNoted.map(m => `<li>${m}</li>`).join('')}</ul></div>`;
        }
        if (drawingExtraction.designLoads && drawingExtraction.designLoads.length > 0) {
            drawingHTML += `<div style="background:#fef2f2;padding:10px;border-radius:6px;border:1px solid #fecaca;"><strong style="color:#991b1b;font-size:0.85rem;"><i class="fas fa-weight-hanging"></i> Design Loads</strong><ul style="margin:4px 0;padding-left:16px;font-size:0.82rem;">${drawingExtraction.designLoads.map(l => `<li>${l}</li>`).join('')}</ul></div>`;
        }
        if (drawingExtraction.totalMembersCount) {
            const mc = drawingExtraction.totalMembersCount;
            drawingHTML += `<div style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;"><strong style="font-size:0.85rem;"><i class="fas fa-calculator"></i> Member Count</strong><p style="font-size:0.82rem;margin:4px 0;">Beams: ${mc.beams || 0} | Columns: ${mc.columns || 0} | Bracing: ${mc.bracing || 0} | Joists: ${mc.joists || 0}</p></div>`;
        }
        if (drawingExtraction.scaleUsed) {
            drawingHTML += `<div style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;"><strong style="font-size:0.85rem;"><i class="fas fa-expand-arrows-alt"></i> Scale</strong><p style="font-size:0.82rem;margin:4px 0;">${drawingExtraction.scaleUsed}</p></div>`;
        }
        drawingHTML += `</div>`;
    }

    // Structural analysis section
    let structHTML = '';
    if (structAnalysis.structuralSystem || structAnalysis.foundationType) {
        const fields = [
            { label: 'Structural System', val: structAnalysis.structuralSystem },
            { label: 'Foundation', val: structAnalysis.foundationType },
            { label: 'Primary Members', val: structAnalysis.primaryMembers },
            { label: 'Secondary Members', val: structAnalysis.secondaryMembers },
            { label: 'Connections', val: structAnalysis.connectionTypes },
            { label: 'Steel Tonnage', val: structAnalysis.steelTonnage },
            { label: 'Concrete Volume', val: structAnalysis.concreteVolume },
            { label: 'Rebar Tonnage', val: structAnalysis.rebarTonnage }
        ].filter(f => f.val);
        structHTML = `<h4><i class="fas fa-drafting-compass"></i> Structural Analysis</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
                ${fields.map(f => `<div style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;"><small style="color:#64748b;">${f.label}</small><div style="font-weight:600;color:#1e293b;font-size:0.9rem;">${f.val}</div></div>`).join('')}
            </div>
            ${structAnalysis.drawingNotes ? `<div style="background:#eff6ff;padding:10px;border-radius:6px;border-left:3px solid #3b82f6;font-size:0.85rem;color:#1e40af;margin-bottom:16px;"><i class="fas fa-file-alt"></i> <strong>Drawing Notes:</strong> ${structAnalysis.drawingNotes}</div>` : ''}`;
    }

    // Material summary section
    let matSumHTML = '';
    if (matSummary.keyMaterials && matSummary.keyMaterials.length > 0) {
        matSumHTML = `<h4><i class="fas fa-boxes"></i> Key Materials Summary</h4>
            <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
                <div style="background:#f0fdf4;padding:10px 16px;border-radius:8px;"><small>Material Cost</small><div style="font-weight:700;color:#166534;">${curr}${Number(matSummary.totalMaterialCost || 0).toLocaleString()}</div></div>
                <div style="background:#eff6ff;padding:10px 16px;border-radius:8px;"><small>Labor Cost</small><div style="font-weight:700;color:#1e40af;">${curr}${Number(matSummary.totalLaborCost || 0).toLocaleString()}</div></div>
                <div style="background:#fef3c7;padding:10px 16px;border-radius:8px;"><small>Equipment Cost</small><div style="font-weight:700;color:#92400e;">${curr}${Number(matSummary.totalEquipmentCost || 0).toLocaleString()}</div></div>
            </div>
            <table style="width:100%;margin-bottom:16px;font-size:0.85rem;"><thead><tr><th>Material</th><th>Specification</th><th>Qty</th><th>Unit</th><th>Cost</th></tr></thead><tbody>
            ${matSummary.keyMaterials.map(m => `<tr><td><strong>${m.material}</strong></td><td>${m.specification || '-'}</td><td>${Number(m.totalQuantity || 0).toLocaleString()}</td><td>${m.unit}</td><td>${curr}${Number(m.estimatedCost || 0).toLocaleString()}</td></tr>`).join('')}
            </tbody></table>`;
    }

    // Confidence score ring
    const confPct = Math.min(100, Math.max(0, confidenceScore));
    const confColor = confPct >= 70 ? '#10b981' : confPct >= 40 ? '#f59e0b' : '#ef4444';
    const confDash = (confPct / 100) * 251.2;

    // Validation issues
    const criticalIssues = validationIssues.filter(i => i.severity === 'critical');
    const warningIssues = validationIssues.filter(i => i.severity === 'warning');

    // Rate source stats
    const dbRates = rateSourceSummary.dbBacked || rateSourceBreakdown.database || 0;
    const estRates = rateSourceSummary.aiEstimated || rateSourceBreakdown.estimated || 0;
    const totalRates = dbRates + estRates;
    const dbPct = totalRates > 0 ? Math.round((dbRates / totalRates) * 100) : 0;

    // Confidence factors HTML
    let confFactorsHTML = '';
    if (confidenceFactors.length > 0) {
        confFactorsHTML = `<div style="margin-top:10px;font-size:0.82rem;">
            ${confidenceFactors.map(f => {
                const fColor = f.score >= 70 ? '#10b981' : f.score >= 40 ? '#f59e0b' : '#ef4444';
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="width:120px;color:#64748b;">${f.name}</span>
                    <div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;"><div style="height:100%;width:${f.score}%;background:${fColor};border-radius:3px;"></div></div>
                    <span style="width:32px;text-align:right;font-weight:600;color:${fColor};">${f.score}</span>
                </div>`;
            }).join('')}
        </div>`;
    }

    // Validation issues HTML for modal
    let valIssuesHTML = '';
    if (validationIssues.length > 0) {
        valIssuesHTML = `<div style="margin-top:12px;">
            <h4 style="margin-bottom:8px;"><i class="fas fa-shield-alt"></i> Validation Report
                ${criticalIssues.length > 0 ? `<span style="background:#ef4444;color:#fff;padding:1px 6px;border-radius:8px;font-size:0.7rem;margin-left:4px;">${criticalIssues.length} Critical</span>` : ''}
                ${warningIssues.length > 0 ? `<span style="background:#f59e0b;color:#fff;padding:1px 6px;border-radius:8px;font-size:0.7rem;margin-left:4px;">${warningIssues.length} Warning</span>` : ''}
            </h4>
            <div style="max-height:150px;overflow-y:auto;font-size:0.82rem;">
                ${validationIssues.slice(0, 10).map(issue => `
                    <div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-bottom:1px solid #f1f5f9;">
                        <i class="fas ${issue.severity === 'critical' ? 'fa-exclamation-circle' : issue.severity === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}" style="color:${issue.severity === 'critical' ? '#ef4444' : issue.severity === 'warning' ? '#f59e0b' : '#3b82f6'};margin-top:2px;"></i>
                        <span>${issue.message}</span>
                        ${issue.autoFixed ? '<span style="background:#10b981;color:#fff;padding:0 4px;border-radius:4px;font-size:0.7rem;margin-left:auto;white-space:nowrap;">Fixed</span>' : ''}
                    </div>`).join('')}
                ${validationIssues.length > 10 ? `<div style="color:#64748b;padding:4px 0;font-style:italic;">...and ${validationIssues.length - 10} more</div>` : ''}
            </div>
        </div>`;
    }

    // Material Schedule HTML - Complete BOQ with all trades and prices
    const steelMbrs = matSchedule.steelMembers || [];
    const concItems = matSchedule.concreteItems || [];
    const mepItms = matSchedule.mepItems || [];
    const archItms = matSchedule.architecturalItems || [];
    const roofItms = matSchedule.roofingItems || [];
    const siteItms = matSchedule.siteworkItems || [];
    const otherMats = matSchedule.otherMaterials || [];
    const stlSum = matSchedule.steelSummary || {};
    const cncSum = matSchedule.concreteSummary || {};

    // Admin helper: build a collapsible table for generic material items with labor breakdown
    function adminMatTable(items, headerBg, cols) {
        const totalMatCost = items.reduce((s,i) => s + (Number(i.materialCost) || 0), 0);
        const totalLabCost = items.reduce((s,i) => s + (Number(i.laborCost) || 0), 0);
        const totalLabHrs = items.reduce((s,i) => s + (Number(i.laborHours) || 0), 0);
        const totalCost = items.reduce((s,i) => s + (Number(i.totalCost) || 0), 0);
        const hasLabor = totalLabHrs > 0 || totalLabCost > 0;
        return `<div style="overflow-x:auto;"><table style="width:100%;font-size:0.78rem;border-collapse:collapse;">
            <thead><tr style="background:${headerBg};">${cols.map(c => `<th style="padding:4px 6px;${c.align ? 'text-align:'+c.align : 'text-align:left'}">${c.label}</th>`).join('')}<th style="text-align:right;">Material</th>${hasLabor ? '<th style="text-align:right;">Labor Hrs</th><th style="text-align:right;">Labor</th>' : ''}<th style="text-align:right;">Total</th></tr></thead>
            <tbody>${items.map(item => `<tr style="border-bottom:1px solid #f1f5f9;">${cols.map(c => `<td style="padding:3px 6px;${c.style || ''}">${c.render ? c.render(item) : (item[c.key] || '-')}</td>`).join('')}
                <td style="text-align:right;">${curr}${Number(item.materialCost || item.unitRate || 0).toLocaleString()}</td>
                ${hasLabor ? `<td style="text-align:right;color:#6b7280;">${Number(item.laborHours || 0).toLocaleString()}</td><td style="text-align:right;">${curr}${Number(item.laborCost || 0).toLocaleString()}</td>` : ''}
                <td style="text-align:right;font-weight:600;">${curr}${Number(item.totalCost || 0).toLocaleString()}</td></tr>`).join('')}</tbody>
            <tfoot><tr style="background:${headerBg};font-weight:700;"><td colspan="${cols.length}">Subtotal</td><td style="text-align:right;">${curr}${totalMatCost.toLocaleString()}</td>${hasLabor ? `<td style="text-align:right;">${totalLabHrs.toLocaleString()}</td><td style="text-align:right;">${curr}${totalLabCost.toLocaleString()}</td>` : ''}<td style="text-align:right;">${curr}${totalCost.toLocaleString()}</td></tr></tfoot>
        </table></div>`;
    }
    const adminMatCols = [{label:'Item',key:'item',style:'font-weight:600;'},{label:'Spec',key:'specification',style:'font-size:0.72rem;'},{label:'Qty',key:'quantity',align:'right',render:i=>Number(i.quantity||0).toLocaleString()},{label:'Unit',key:'unit'}];
    const adminMatColsWithCat = [{label:'Category',key:'category',style:'font-weight:600;'},...adminMatCols];

    let matSchedHTML = '';
    const hasAnyMatSched = steelMbrs.length > 0 || concItems.length > 0 || mepItms.length > 0 || archItms.length > 0 || roofItms.length > 0 || otherMats.length > 0;
    if (hasAnyMatSched) {
        const grandMatCost = matSchedule.grandTotalMaterialCost || 0;
        matSchedHTML = `<h4 style="margin-top:16px;margin-bottom:8px;"><i class="fas fa-clipboard-list"></i> Complete Material Schedule (BOQ) ${grandMatCost ? `<span style="font-size:0.85rem;color:#1e40af;font-weight:700;float:right;">${curr}${Number(grandMatCost).toLocaleString()}</span>` : ''}</h4>`;
        if (matSchedule.totalMaterialWeight) matSchedHTML += `<div style="font-size:0.75rem;color:#64748b;margin-bottom:8px;">${matSchedule.totalMaterialWeight}</div>`;

        if (steelMbrs.length > 0) {
            const stlCost = stlSum.totalSteelCost || steelMbrs.reduce((s,m) => s+(Number(m.totalCost)||0), 0);
            const stlHasLabor = steelMbrs.some(m => m.laborHours > 0 || m.laborCost > 0);
            matSchedHTML += `<details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#1e40af;font-size:0.85rem;font-weight:600;"><i class="fas fa-i-cursor"></i> Steel (${steelMbrs.length} items, ${Number(stlSum.totalSteelTons||0).toLocaleString()} tons) <span style="float:right;">${curr}${Number(stlCost).toLocaleString()}</span></summary>
            <div style="overflow-x:auto;"><table style="width:100%;font-size:0.78rem;border-collapse:collapse;">
                <thead><tr style="background:#eff6ff;"><th style="padding:4px 6px;">Mark</th><th>Section</th><th>Count</th><th>Length</th><th style="text-align:right;">Tons</th><th style="text-align:right;">Material</th>${stlHasLabor ? '<th style="text-align:right;">Labor Hrs</th><th style="text-align:right;">Labor</th><th style="text-align:right;">Equip</th>' : ''}<th style="text-align:right;">Total</th></tr></thead>
                <tbody>${steelMbrs.map(m => `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:3px 6px;font-weight:600;">${m.mark||'-'}</td><td style="color:#6366f1;font-weight:600;">${m.section||'-'}</td>
                    <td style="text-align:center;">${m.count||0}</td><td>${m.lengthEach||(m.lengthFt?m.lengthFt+"'":'-')}</td>
                    <td style="text-align:right;">${Number(m.totalWeightTons||0).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                    <td style="text-align:right;">${m.materialCost?curr+Number(m.materialCost).toLocaleString():(m.unitRate?curr+Number(m.unitRate).toLocaleString():'-')}</td>
                    ${stlHasLabor ? `<td style="text-align:right;color:#6b7280;">${Number(m.laborHours||0).toLocaleString()}</td><td style="text-align:right;">${curr}${Number(m.laborCost||0).toLocaleString()}</td><td style="text-align:right;">${m.equipmentCost?curr+Number(m.equipmentCost).toLocaleString():'-'}</td>` : ''}
                    <td style="text-align:right;font-weight:600;">${m.totalCost?curr+Number(m.totalCost).toLocaleString():'-'}</td>
                </tr>`).join('')}</tbody>
            </table></div></details>`;
        }
        if (concItems.length > 0) {
            const cncCost = cncSum.totalConcreteCost || concItems.reduce((s,c) => s+(Number(c.totalCost)||0), 0);
            const cncHasLabor = concItems.some(c => c.laborHours > 0 || c.laborCost > 0);
            matSchedHTML += `<details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#166534;font-size:0.85rem;font-weight:600;"><i class="fas fa-cube"></i> Concrete (${concItems.length} items, ${Number(cncSum.totalConcreteCY||0).toLocaleString()} CY) <span style="float:right;">${curr}${Number(cncCost).toLocaleString()}</span></summary>
            <div style="overflow-x:auto;"><table style="width:100%;font-size:0.78rem;border-collapse:collapse;">
                <thead><tr style="background:#f0fdf4;"><th style="padding:4px 6px;">Element</th><th>Dims</th><th>Count</th><th style="text-align:right;">CY</th><th style="text-align:right;">Material</th>${cncHasLabor ? '<th style="text-align:right;">Labor Hrs</th><th style="text-align:right;">Labor</th>' : ''}<th style="text-align:right;">Total</th></tr></thead>
                <tbody>${concItems.map(c => `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:3px 6px;font-weight:600;">${c.element||'-'}</td><td style="color:#059669;">${c.dimensions||'-'}</td>
                    <td style="text-align:center;">${c.count||0}</td><td style="text-align:right;">${Number(c.totalCY||0).toLocaleString(undefined,{maximumFractionDigits:1})}</td>
                    <td style="text-align:right;">${c.materialCost?curr+Number(c.materialCost).toLocaleString():(c.unitRate?curr+Number(c.unitRate).toLocaleString():'-')}</td>
                    ${cncHasLabor ? `<td style="text-align:right;color:#6b7280;">${Number(c.laborHours||0).toLocaleString()}</td><td style="text-align:right;">${curr}${Number(c.laborCost||0).toLocaleString()}</td>` : ''}
                    <td style="text-align:right;font-weight:600;">${c.totalCost?curr+Number(c.totalCost).toLocaleString():'-'}</td>
                </tr>`).join('')}</tbody>
            </table></div></details>`;
        }
        if (mepItms.length > 0) {
            const mepCost = (matSchedule.mepSummary||{}).totalMEPCost || mepItms.reduce((s,i) => s+(Number(i.totalCost)||0), 0);
            matSchedHTML += `<details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#7c3aed;font-size:0.85rem;font-weight:600;"><i class="fas fa-plug"></i> MEP (${mepItms.length} items) <span style="float:right;">${curr}${Number(mepCost).toLocaleString()}</span></summary>${adminMatTable(mepItms, '#f5f3ff', adminMatColsWithCat)}</details>`;
        }
        if (archItms.length > 0) {
            const archCost = (matSchedule.architecturalSummary||{}).totalArchitecturalCost || archItms.reduce((s,i) => s+(Number(i.totalCost)||0), 0);
            matSchedHTML += `<details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#b45309;font-size:0.85rem;font-weight:600;"><i class="fas fa-paint-roller"></i> Architectural (${archItms.length} items) <span style="float:right;">${curr}${Number(archCost).toLocaleString()}</span></summary>${adminMatTable(archItms, '#fef3c7', adminMatColsWithCat)}</details>`;
        }
        if (roofItms.length > 0) {
            matSchedHTML += `<details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#0369a1;font-size:0.85rem;font-weight:600;"><i class="fas fa-home"></i> Roofing (${roofItms.length} items) <span style="float:right;">${curr}${Number(roofItms.reduce((s,i) => s+(Number(i.totalCost)||0), 0)).toLocaleString()}</span></summary>${adminMatTable(roofItms, '#e0f2fe', adminMatCols)}</details>`;
        }
        if (siteItms.length > 0) {
            matSchedHTML += `<details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#65a30d;font-size:0.85rem;font-weight:600;"><i class="fas fa-tree"></i> Sitework (${siteItms.length} items) <span style="float:right;">${curr}${Number(siteItms.reduce((s,i) => s+(Number(i.totalCost)||0), 0)).toLocaleString()}</span></summary>${adminMatTable(siteItms, '#ecfccb', adminMatCols)}</details>`;
        }
        if (otherMats.length > 0) {
            matSchedHTML += `<details style="margin-bottom:8px;"><summary style="cursor:pointer;color:#92400e;font-size:0.85rem;font-weight:600;"><i class="fas fa-boxes"></i> Other (${otherMats.length} items) <span style="float:right;">${curr}${Number(otherMats.reduce((s,i) => s+(Number(i.totalCost)||0), 0)).toLocaleString()}</span></summary>${adminMatTable(otherMats, '#fef3c7', [{label:'Material',key:'material',style:'font-weight:600;',render:i=>i.material||i.item||'-'},{label:'Spec',key:'specification',style:'font-size:0.72rem;'},{label:'Qty',key:'quantity',align:'right',render:i=>Number(i.quantity||0).toLocaleString()},{label:'Unit',key:'unit'}])}</details>`;
        }

        // Manpower Summary
        const adminManpower = matSchedule.manpowerSummary || {};
        const adminCrew = adminManpower.crewBreakdown || [];
        if (adminManpower.totalLaborHours > 0 || adminCrew.length > 0) {
            matSchedHTML += `<div style="margin-top:12px;padding:12px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;">
                <h5 style="margin:0 0 8px;color:#7c3aed;font-size:0.85rem;"><i class="fas fa-hard-hat"></i> Manpower Summary</h5>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px;">
                    <div style="background:#fff;padding:8px;border-radius:6px;text-align:center;border:1px solid #e9d5ff;">
                        <div style="font-size:0.65rem;color:#6b7280;">Labor Hours</div>
                        <div style="font-size:0.95rem;font-weight:700;color:#7c3aed;">${Number(adminManpower.totalLaborHours||0).toLocaleString()}</div>
                    </div>
                    <div style="background:#fff;padding:8px;border-radius:6px;text-align:center;border:1px solid #e9d5ff;">
                        <div style="font-size:0.65rem;color:#6b7280;">Labor Cost</div>
                        <div style="font-size:0.95rem;font-weight:700;color:#7c3aed;">${curr}${Number(adminManpower.totalLaborCost||0).toLocaleString()}</div>
                    </div>
                    <div style="background:#fff;padding:8px;border-radius:6px;text-align:center;border:1px solid #e9d5ff;">
                        <div style="font-size:0.65rem;color:#6b7280;">Material Cost</div>
                        <div style="font-size:0.95rem;font-weight:700;color:#1e40af;">${curr}${Number(adminManpower.totalMaterialCost||0).toLocaleString()}</div>
                    </div>
                    <div style="background:#fff;padding:8px;border-radius:6px;text-align:center;border:1px solid #e9d5ff;">
                        <div style="font-size:0.65rem;color:#6b7280;">Equipment</div>
                        <div style="font-size:0.95rem;font-weight:700;color:#b45309;">${curr}${Number(adminManpower.totalEquipmentCost||0).toLocaleString()}</div>
                    </div>
                </div>
                ${adminManpower.estimatedProjectDuration ? `<div style="font-size:0.78rem;color:#475569;margin-bottom:6px;"><i class="fas fa-calendar-alt"></i> Duration: <strong>${adminManpower.estimatedProjectDuration}</strong></div>` : ''}
                ${adminCrew.length > 0 ? `<details><summary style="cursor:pointer;font-size:0.78rem;color:#7c3aed;">View Crew Breakdown (${adminCrew.length} trades)</summary>
                <table style="width:100%;font-size:0.75rem;border-collapse:collapse;margin-top:4px;">
                    <thead><tr style="background:#f5f3ff;"><th style="padding:3px 6px;text-align:left;">Trade</th><th>Crew</th><th style="text-align:center;">Head</th><th style="text-align:center;">Weeks</th><th style="text-align:right;">Hours</th><th style="text-align:right;">Cost</th></tr></thead>
                    <tbody>${adminCrew.map(c => `<tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:2px 6px;font-weight:600;">${c.trade||'-'}</td><td style="color:#6b7280;">${c.crew||'-'}</td>
                        <td style="text-align:center;">${c.headcount||0}</td><td style="text-align:center;">${c.durationWeeks||0}</td>
                        <td style="text-align:right;">${Number(c.laborHours||0).toLocaleString()}</td><td style="text-align:right;font-weight:600;">${curr}${Number(c.laborCost||0).toLocaleString()}</td>
                    </tr>`).join('')}</tbody>
                </table></details>` : ''}
            </div>`;
        }

        // BOQ Markups
        const adminMk = matSchedule.boqMarkups || {};
        if (adminMk.grandTotalWithMarkups > 0 || adminMk.subtotalDirectCost > 0) {
            const mkRows = [
                {l:'General Conditions',p:adminMk.generalConditionsPercent,a:adminMk.generalConditions},
                {l:'Overhead',p:adminMk.overheadPercent,a:adminMk.overhead},
                {l:'Profit',p:adminMk.profitPercent,a:adminMk.profit},
                {l:'Contingency',p:adminMk.contingencyPercent,a:adminMk.contingency},
                {l:'Escalation',p:adminMk.escalationPercent,a:adminMk.escalation},
            ].filter(m => m.a > 0 || m.p > 0);
            matSchedHTML += `<div style="margin-top:12px;padding:12px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;">
                <h5 style="margin:0 0 8px;color:#92400e;font-size:0.85rem;"><i class="fas fa-percentage"></i> BOQ Markups</h5>
                <div style="display:flex;justify-content:space-between;padding:6px 8px;background:#fff;border-radius:4px;font-weight:600;margin-bottom:4px;">
                    <span>Direct Cost</span><span style="color:#1e40af;">${curr}${Number(adminMk.subtotalDirectCost||0).toLocaleString()}</span>
                </div>
                ${mkRows.map(m => `<div style="display:flex;justify-content:space-between;padding:4px 8px;font-size:0.82rem;">
                    <span>${m.l} <span style="color:#94a3b8;">(${m.p||0}%)</span></span><span>${curr}${Number(m.a||0).toLocaleString()}</span>
                </div>`).join('')}
                <div style="display:flex;justify-content:space-between;padding:4px 8px;font-size:0.82rem;border-top:1px solid #fde68a;margin-top:4px;">
                    <span style="font-weight:600;">Total Markups</span><span style="font-weight:600;">${curr}${Number(adminMk.totalMarkups||0).toLocaleString()}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px;background:#92400e;color:#fff;border-radius:4px;font-weight:700;margin-top:6px;">
                    <span>Grand Total (with Markups)</span><span>${curr}${Number(adminMk.grandTotalWithMarkups||0).toLocaleString()}</span>
                </div>
            </div>`;
        }
    }

    showModal(`
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
            <h3><i class="fas fa-robot"></i> AI Estimate - ${estimation.projectTitle || estimation.projectName}</h3>
            <div style="display:grid;grid-template-columns:${confidenceScore > 0 ? '1fr 1fr auto' : '1fr 1fr'};gap:12px;margin:16px 0;align-items:center;">
                <div style="background:#f0f9ff;padding:12px;border-radius:8px;text-align:center;">
                    <small>Grand Total</small>
                    <div style="font-size:24px;font-weight:700;color:#1e40af;">${curr}${Number(s.grandTotal || s.totalEstimate || 0).toLocaleString()}</div>
                </div>
                <div style="background:#f0fdf4;padding:12px;border-radius:8px;text-align:center;">
                    <small>Cost per Unit</small>
                    <div style="font-size:24px;font-weight:700;color:#166534;">${curr}${Number(s.costPerUnit || 0).toLocaleString()}</div>
                    <small>${s.unitLabel || 'per sq ft'}</small>
                </div>
                ${confidenceScore > 0 ? `<div style="text-align:center;">
                    <svg viewBox="0 0 90 90" style="width:80px;height:80px;">
                        <circle cx="45" cy="45" r="40" fill="none" stroke="#e5e7eb" stroke-width="6"/>
                        <circle cx="45" cy="45" r="40" fill="none" stroke="${confColor}" stroke-width="6" stroke-dasharray="${confDash} 251.2" stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 45 45)"/>
                        <text x="45" y="42" text-anchor="middle" font-size="18" font-weight="700" fill="${confColor}">${confPct}</text>
                        <text x="45" y="56" text-anchor="middle" font-size="8" fill="#6b7280">${confidenceLevel}</text>
                    </svg>
                    <div style="font-size:0.7rem;color:#6b7280;">Confidence</div>
                </div>` : ''}
            </div>
            ${passesCompleted > 0 || multiPassMeta.engineVersion ? `
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;font-size:0.78rem;">
                ${passesCompleted > 0 ? `<span style="background:#eff6ff;color:#1e40af;padding:3px 10px;border-radius:12px;"><i class="fas fa-layer-group"></i> ${passesCompleted}/5 Passes</span>` : ''}
                ${multiPassMeta.totalDurationSeconds ? `<span style="background:#f0fdf4;color:#166534;padding:3px 10px;border-radius:12px;"><i class="fas fa-clock"></i> ${multiPassMeta.totalDurationSeconds}s</span>` : ''}
                ${totalRates > 0 ? `<span style="background:#f5f3ff;color:#6d28d9;padding:3px 10px;border-radius:12px;"><i class="fas fa-database"></i> ${dbPct}% DB Rates (${dbRates}/${totalRates})</span>` : ''}
                ${multiPassMeta.engineVersion ? `<span style="background:#f8fafc;color:#64748b;padding:3px 10px;border-radius:12px;">${multiPassMeta.engineVersion}</span>` : ''}
            </div>` : ''}
            ${confFactorsHTML}
            ${benchmarkComp.benchmarkLow ? `
            <div style="background:#f8fafc;padding:10px 12px;border-radius:8px;margin-bottom:12px;">
                <div style="font-size:0.82rem;font-weight:600;margin-bottom:6px;"><i class="fas fa-chart-bar"></i> Benchmark: ${curr}${Number(benchmarkComp.benchmarkLow || 0).toLocaleString()} - ${curr}${Number(benchmarkComp.benchmarkHigh || 0).toLocaleString()} ${benchmarkComp.unit ? '/' + benchmarkComp.unit : ''}</div>
                <div style="height:8px;background:#e5e7eb;border-radius:4px;position:relative;">
                    <div style="height:100%;background:linear-gradient(90deg,#fecaca 0%,#bbf7d0 30%,#bbf7d0 70%,#fecaca 100%);border-radius:4px;"></div>
                    ${benchmarkComp.costPerUnit && benchmarkComp.benchmarkHigh ? `<div style="position:absolute;top:-2px;left:${Math.min(100, Math.max(0, ((benchmarkComp.costPerUnit - benchmarkComp.benchmarkLow) / (benchmarkComp.benchmarkHigh - benchmarkComp.benchmarkLow)) * 100))}%;width:12px;height:12px;background:${benchmarkComp.status === 'within' ? '#10b981' : '#ef4444'};border-radius:50%;border:2px solid #fff;transform:translateX(-50%);"></div>` : ''}
                </div>
                <div style="font-size:0.78rem;color:${benchmarkComp.status === 'within' ? '#059669' : '#dc2626'};margin-top:4px;">${benchmarkComp.status === 'within' ? 'Within typical range' : benchmarkComp.status === 'above' ? 'Above typical range' : benchmarkComp.status === 'below' ? 'Below typical range' : ''}</div>
            </div>` : ''}
            ${valIssuesHTML}
            ${drawingHTML}
            ${structHTML}
            ${matSumHTML}
            ${matSchedHTML}
            ${trades.length > 0 ? `
                <h4>Trade Breakdown (with Material Quantities)</h4>
                <table style="width:100%;margin-bottom:16px;"><thead><tr><th>Trade</th><th>Cost</th><th>%</th></tr></thead><tbody>${tradesHTML}</tbody></table>
            ` : ''}
            ${breakdown.directCosts ? `
                <h4>Cost Summary</h4>
                <div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Direct Costs</span><span>${curr}${Number(breakdown.directCosts || 0).toLocaleString()}</span></div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>General Conditions (${breakdown.generalConditionsPercent || 0}%)</span><span>${curr}${Number(breakdown.generalConditions || 0).toLocaleString()}</span></div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Overhead (${breakdown.overheadPercent || 0}%)</span><span>${curr}${Number(breakdown.overhead || 0).toLocaleString()}</span></div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Contingency (${breakdown.contingencyPercent || 0}%)</span><span>${curr}${Number(breakdown.contingency || 0).toLocaleString()}</span></div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:700;border-top:2px solid #333;margin-top:8px;padding-top:8px;"><span>Total with Markups</span><span>${curr}${Number(breakdown.totalWithMarkups || 0).toLocaleString()}</span></div>
                </div>
            ` : ''}
            ${assumptions.length > 0 ? `<h4>Assumptions</h4><ul>${assumptions.map(a => '<li>' + a + '</li>').join('')}</ul>` : ''}
            ${exclusions.length > 0 ? `<h4>Exclusions</h4><ul>${exclusions.map(e => '<li>' + e + '</li>').join('')}</ul>` : ''}
            ${estimation.accuracyFeedback ? `
            <div style="margin-top:12px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
                <h4 style="margin:0 0 6px;color:#166534;font-size:0.85rem;"><i class="fas fa-check-circle"></i> Accuracy Feedback Recorded</h4>
                <div style="font-size:0.82rem;color:#475569;">
                    <strong>Rating:</strong> ${estimation.accuracyFeedback.rating}/5 |
                    <strong>Actual Cost:</strong> ${estimation.accuracyFeedback.actualCost ? curr + Number(estimation.accuracyFeedback.actualCost).toLocaleString() : 'Not provided'} |
                    <strong>Variance:</strong> ${estimation.accuracyFeedback.variancePercent ? estimation.accuracyFeedback.variancePercent + '%' : 'N/A'}
                    ${estimation.accuracyFeedback.notes ? `<br><strong>Notes:</strong> ${estimation.accuracyFeedback.notes}` : ''}
                </div>
            </div>` : ''}
            <div class="modal-actions" style="margin-top:16px;">
                <button class="btn btn-success" onclick="closeModal(); sendAIReport('${estimationId}')"><i class="fas fa-paper-plane"></i> Approve & Send to Contractor</button>
                <button class="btn" style="background:#8b5cf6;color:#fff;" onclick="closeModal(); showAccuracyFeedback('${estimationId}')"><i class="fas fa-chart-line"></i> Accuracy Feedback</button>
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        </div>
    `);
}

async function sendAIReport(estimationId) {
    if (!confirm('Send the AI-generated estimate report to the contractor? This will mark the estimation as completed.')) return;
    try {
        const data = await apiCall(`/estimations/${estimationId}/send-ai-report`, 'POST');
        showNotification(data.message || 'AI report sent to contractor.', 'success');
        await loadEstimationsData();
    } catch (error) {
        showNotification('Failed to send AI report: ' + error.message, 'error');
    }
}

function showAccuracyFeedback(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    if (!estimation || !estimation.aiEstimate) return showNotification('No AI estimate found.', 'error');
    const s = estimation.aiEstimate.summary || {};
    const curr = s.currencySymbol || '$';
    const grandTotal = s.grandTotal || 0;
    const existing = estimation.accuracyFeedback || {};

    showModal(`
        <div class="modal-body" style="max-width:500px;">
            <h3 style="margin-bottom:16px;"><i class="fas fa-chart-line" style="color:#8b5cf6;"></i> Accuracy Feedback</h3>
            <p style="color:#64748b;font-size:0.85rem;margin-bottom:16px;">Record actual project costs to calibrate future AI estimates.</p>
            <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px;text-align:center;">
                <small style="color:#64748b;">AI Estimated Total</small>
                <div style="font-size:22px;font-weight:700;color:#1e40af;">${curr}${Number(grandTotal).toLocaleString()}</div>
            </div>
            <div style="margin-bottom:14px;">
                <label style="font-weight:600;font-size:0.85rem;display:block;margin-bottom:4px;">Accuracy Rating</label>
                <div id="afRatingStars" style="display:flex;gap:6px;font-size:24px;cursor:pointer;">
                    ${[1,2,3,4,5].map(i => `<span onclick="setAccuracyRating(${i})" data-star="${i}" style="color:${existing.rating >= i ? '#f59e0b' : '#d1d5db'};transition:color 0.15s;"><i class="fas fa-star"></i></span>`).join('')}
                </div>
                <input type="hidden" id="afRating" value="${existing.rating || 0}">
                <small style="color:#94a3b8;">1 = Very inaccurate, 5 = Highly accurate</small>
            </div>
            <div style="margin-bottom:14px;">
                <label style="font-weight:600;font-size:0.85rem;display:block;margin-bottom:4px;">Actual Project Cost (optional)</label>
                <input type="number" id="afActualCost" value="${existing.actualCost || ''}" placeholder="Enter actual total cost" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:0.9rem;">
            </div>
            <div style="margin-bottom:14px;">
                <label style="font-weight:600;font-size:0.85rem;display:block;margin-bottom:4px;">Notes (optional)</label>
                <textarea id="afNotes" rows="3" placeholder="What was accurate? What was off? Any specific trades over/under estimated?" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem;resize:vertical;">${existing.notes || ''}</textarea>
            </div>
            <div class="modal-actions" style="display:flex;gap:10px;justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn" style="background:#8b5cf6;color:#fff;font-weight:600;" onclick="submitAccuracyFeedback('${estimationId}', ${grandTotal})"><i class="fas fa-save"></i> Save Feedback</button>
            </div>
        </div>
    `);
}

function setAccuracyRating(rating) {
    document.getElementById('afRating').value = rating;
    document.querySelectorAll('#afRatingStars span').forEach(el => {
        el.style.color = parseInt(el.dataset.star) <= rating ? '#f59e0b' : '#d1d5db';
    });
}

async function submitAccuracyFeedback(estimationId, aiTotal) {
    const rating = parseInt(document.getElementById('afRating').value) || 0;
    if (rating === 0) return showNotification('Please select an accuracy rating.', 'error');
    const actualCost = parseFloat(document.getElementById('afActualCost').value) || null;
    const notes = document.getElementById('afNotes').value.trim();
    let variancePercent = null;
    if (actualCost && aiTotal > 0) {
        variancePercent = Math.round(((actualCost - aiTotal) / aiTotal) * 10000) / 100;
    }
    try {
        await apiCall(`/estimations/${estimationId}/accuracy-feedback`, 'POST', {
            rating, actualCost, notes, variancePercent, aiTotal
        });
        showNotification('Accuracy feedback saved successfully.', 'success');
        closeModal();
        await loadEstimationsData();
    } catch (error) {
        showNotification('Failed to save feedback: ' + error.message, 'error');
    }
}

function confirmGenerateAI(estimationId) {
    const estimation = state.estimations.find(e => e._id === estimationId);
    const projectName = estimation ? (estimation.projectName || estimation.projectTitle || 'Untitled Project') : 'this estimation';
    const fileCount = estimation?.uploadedFiles?.length || 0;
    const isRetry = estimation?.aiStatus === 'failed';

    showModal(`
        <div class="modal-body" style="text-align:center; padding:30px;">
            <div style="font-size:48px; margin-bottom:16px; color:#f59e0b;">
                <i class="fas fa-robot"></i>
            </div>
            <h3 style="margin-bottom:8px;">${isRetry ? 'Retry AI Estimate?' : 'Generate AI Estimate?'}</h3>
            <p style="color:#64748b; margin-bottom:20px; font-size:14px;">
                <strong>${projectName}</strong><br>
                ${fileCount > 0 ? `<span style="color:#3b82f6;"><i class="fas fa-file"></i> ${fileCount} file${fileCount > 1 ? 's' : ''} will be analyzed</span><br>` : ''}
                <span style="color:#94a3b8; font-size:13px;">AI will analyze uploaded drawings and generate a detailed cost estimate.<br>This may take 30–60 seconds.</span>
            </p>
            <div style="display:flex; gap:12px; justify-content:center;">
                <button class="btn btn-outline" onclick="closeModal()" style="padding:10px 24px; font-size:14px;">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="btn btn-success" onclick="closeModal(); executeAIGeneration('${estimationId}')" style="padding:10px 24px; font-size:14px; background:#10b981; color:#fff; font-weight:600;">
                    <i class="fas fa-check"></i> Confirm & Generate
                </button>
            </div>
        </div>
    `);
}

async function executeAIGeneration(estimationId) {
    try {
        showNotification('AI estimate generation started. Please wait up to 60 seconds...', 'info');
        const data = await apiCall(`/estimations/${estimationId}/retry-ai`, 'POST');
        showNotification(data.message || 'AI generation started. Polling for status...', 'info');
        await loadEstimationsData();
        pollAIStatus(estimationId);
    } catch (error) {
        showNotification('Failed to start AI estimate: ' + error.message, 'error');
    }
}

async function retryAIEstimate(estimationId) {
    confirmGenerateAI(estimationId);
}

function pollAIStatus(estimationId, attempts = 0, maxAttempts = 20) {
    if (attempts >= maxAttempts) {
        showNotification('AI generation is taking longer than expected. Please refresh the page to check status.', 'warning');
        return;
    }
    // Poll every 5 seconds
    setTimeout(async () => {
        try {
            const data = await apiCall(`/estimations/${estimationId}/ai-status`);
            if (data.aiStatus === 'completed') {
                showNotification('AI estimate generated successfully!', 'success');
                await loadEstimationsData();
            } else if (data.aiStatus === 'failed') {
                showNotification('AI generation failed: ' + (data.aiError || 'Unknown error'), 'error');
                await loadEstimationsData();
            } else {
                // Still generating, poll again
                pollAIStatus(estimationId, attempts + 1, maxAttempts);
            }
        } catch (error) {
            // Network error during polling, try again
            pollAIStatus(estimationId, attempts + 1, maxAttempts);
        }
    }, 5000);
}

function showUploadResultModal(estimationId) {
    showModal(`
        <div class="modal-body">
            <h3><i class="fas fa-upload"></i> Upload Manual Result</h3>
            <p>Upload your own estimation result file. This will mark the estimation as 'completed' and notify the contractor.</p>
            <div class="form-group">
                <label for="result-file-input">Result File (PDF, Excel, Word, CSV):</label>
                <input type="file" id="result-file-input" accept=".pdf,.xls,.xlsx,.doc,.docx,.csv">
            </div>
            <div class="modal-actions">
                <button class="btn btn-success" onclick="uploadEstimationResult('${estimationId}')"><i class="fas fa-upload"></i> Upload & Send to Contractor</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    `);
}

async function uploadEstimationResult(estimationId) {
    const fileInput = document.getElementById('result-file-input');
    if (!fileInput || !fileInput.files[0]) return showNotification('Please select a file.', 'warning');
    const file = fileInput.files[0];
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
        return showNotification('File size exceeds 50MB limit. Please select a smaller file.', 'error');
    }
    const allowedExts = ['.pdf', '.xls', '.xlsx', '.doc', '.docx', '.csv'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
        return showNotification('Invalid file type. Allowed: PDF, Excel, Word, CSV.', 'error');
    }
    const uploadBtn = document.querySelector('.modal .btn-success');
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<div class="btn-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;vertical-align:middle;"></div> Uploading...';
    }
    const formData = new FormData();
    formData.append('resultFile', file);
    try {
        const data = await apiCall(`/estimations/${estimationId}/result`, 'POST', formData, true);
        showNotification(data.message || 'Result uploaded successfully', 'success');
        closeModal();
        await loadEstimationsData();
    } catch (error) {
        console.error('[UPLOAD-RESULT] Error:', error);
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload & Send to Contractor';
        }
    }
}

async function deleteEstimation(estimationId) {
    if (!confirm('Are you sure you want to permanently delete this estimation request?')) return;
    try {
        const data = await apiCall(`/estimations/${estimationId}`, 'DELETE');
        showNotification(data.message, 'success');
        await loadEstimationsData();
    } catch (error) {}
}

// --- MESSAGE MANAGEMENT ---
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
                        <td>${formatAdminDate(message.createdAt)}</td>
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
            renderMessagesTab();
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

// --- CONVERSATIONS MANAGEMENT ---
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
        renderConversationsTab();
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

// --- ENHANCED SUPPORT SYSTEM MANAGEMENT ---
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
                        <option value="all">All Status</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                    <select id="support-priority-filter" onchange="filterSupportMessages()">
                        <option value="all">All Priority</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
                <button class="btn" onclick="loadSupportMessagesData()">Refresh</button>
            </div>
        </div>
        <div class="support-messages-container">
            ${messages.length === 0 ?
                `<div class="empty-state">
                    <i class="fas fa-life-ring"></i>
                    <h3>No Support Messages</h3>
                    <p>Support requests from users will appear here.</p>
                </div>` :
                `<div class="support-messages-grid">
                    ${messages.map(msg => renderSupportMessageCard(msg)).join('')}
                </div>`
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
                        <span class="priority-badge priority-${priorityClass}">
                            <i class="fas ${getPriorityIcon(message.priority)}"></i>
                            ${message.priority}
                        </span>
                        <span class="status-badge status-${statusClass}">
                            <i class="fas ${getStatusIcon(message.ticketStatus)}"></i>
                            ${formatStatus(message.ticketStatus)}
                        </span>
                    </div>
                </div>
                <div class="support-actions-quick">
                    <div class="time-info">
                        <small>Created: ${timeAgo}</small>
                        ${message.updatedAt && message.updatedAt !== message.createdAt ?
                            `<small>Updated: ${lastUpdate}</small>` : ''}
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
                    ${message.assignedToName ?
                        `<div class="assigned-to">
                            <i class="fas fa-user-check"></i> 
                             Assigned to: <strong>${message.assignedToName}</strong>
                        </div>` :
                        `<div class="unassigned">
                            <i class="fas fa-user-times"></i> Unassigned
                        </div>`
                    }
                </div>
                <div class="message-preview">
                    <p>${truncateText(message.message, 150)}</p>
                </div>
                <div class="support-indicators">
                    ${hasAttachments ?
                        `<div class="indicator attachments">
                            <i class="fas fa-paperclip"></i>
                            ${message.attachments.length} file${message.attachments.length > 1 ? 's' : ''}
                        </div>` : ''
                    }
                    ${responseCount > 0 ?
                        `<div class="indicator responses">
                            <i class="fas fa-comments"></i>
                            ${responseCount} response${responseCount > 1 ? 's' : ''}
                        </div>` :
                        `<div class="indicator no-responses">
                            <i class="fas fa-comment-slash"></i>
                            No responses yet
                        </div>`
                    }
                </div>
            </div>
            <div class="support-card-actions">
                <button class="btn btn-sm btn-primary" onclick="viewSupportTicketDetails('${message.ticketId}')">
                    <i class="fas fa-eye"></i> View Details
                </button>
                <button class="btn btn-sm btn-success" onclick="respondToSupportTicket('${message.ticketId}')">
                    <i class="fas fa-reply"></i> Respond
                </button>
                <button class="btn btn-sm btn-outline" onclick="updateSupportTicketStatus('${message.ticketId}')">
                    <i class="fas fa-edit"></i> Update Status
                </button>
                <button class="btn btn-sm btn-warning" onclick="assignSupportTicket('${message.ticketId}')">
                    <i class="fas fa-user-plus"></i> Assign
                </button>
            </div>
        </div>
    `;
}

async function viewSupportTicketDetails(ticketId) {
    try {
        showModal('<div class="loader">Loading ticket details...</div>');
        const { ticket } = await apiCall(`/support-messages/${ticketId}`);
        const modalContent = `
            <div class="support-ticket-modal">
                <div class="modal-header support-modal-header">
                    <h3><i class="fas fa-ticket-alt"></i> Support Ticket Details</h3>
                    <div class="ticket-meta-header">
                        <span class="ticket-id">ID: ${ticket.ticketId}</span>
                        <span class="priority-badge priority-${ticket.priority.toLowerCase()}">
                            <i class="fas ${getPriorityIcon(ticket.priority)}"></i>
                            ${ticket.priority} Priority
                        </span>
                        <span class="status-badge status-${ticket.ticketStatus}">
                            <i class="fas ${getStatusIcon(ticket.ticketStatus)}"></i>
                            ${formatStatus(ticket.ticketStatus)}
                        </span>
                    </div>
                </div>
                <div class="ticket-details-content">
                    <div class="ticket-info-grid">
                        <div class="info-section">
                            <h4><i class="fas fa-user"></i> User Information</h4>
                            <div class="info-grid">
                                <div><label>Name:</label><span>${ticket.senderName}</span></div>
                                <div><label>Email:</label><span>${ticket.senderEmail}</span></div>
                                <div><label>Type:</label><span class="user-type ${ticket.userType}">${ticket.userType}</span></div>
                            </div>
                        </div>
                        <div class="info-section">
                            <h4><i class="fas fa-info-circle"></i> Ticket Information</h4>
                            <div class="info-grid">
                                <div><label>Subject:</label><span>${ticket.subject}</span></div>
                                <div><label>Created:</label><span>${formatAdminTimestamp(ticket.createdAt)}</span></div>
                                <div><label>Updated:</label><span>${formatAdminTimestamp(ticket.updatedAt)}</span></div>
                                ${ticket.assignedToName ? `<div><label>Assigned to:</label><span>${ticket.assignedToName}</span></div>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="ticket-message-section">
                        <h4><i class="fas fa-comment"></i> Original Message</h4>
                        <div class="ticket-message-content">
                            <p>${ticket.message}</p>
                        </div>
                    </div>
                    ${ticket.attachments && ticket.attachments.length > 0 ? `
                        <div class="ticket-attachments-section">
                            <h4><i class="fas fa-paperclip"></i> User Attachments (${ticket.attachments.length})</h4>
                            <div class="attachments-list">
                                ${ticket.attachments.map((attachment, index) => `
                                    <div class="attachment-item">
                                        <div class="attachment-info">
                                            <i class="fas ${getAttachmentIcon(attachment)}"></i>
                                            <div class="attachment-details">
                                                <span class="attachment-name">${attachment.originalName || attachment.filename || `Attachment ${index + 1}`}</span>
                                                <span class="attachment-meta">${attachment.size ? formatFileSize(attachment.size) : 'Unknown size'}</span>
                                            </div>
                                        </div>
                                        <div class="attachment-actions">
                                            <a href="${attachment.url}" target="_blank" class="btn btn-xs btn-outline">
                                                <i class="fas fa-external-link-alt"></i> View
                                            </a>
                                            <a href="${attachment.url}" download="${attachment.originalName || attachment.filename}" class="btn btn-xs btn-primary">
                                                <i class="fas fa-download"></i> Download
                                            </a>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="bulk-actions">
                                <button class="btn btn-outline btn-sm" onclick="downloadAllSupportAttachments('${ticketId}')">
                                    <i class="fas fa-download"></i> Download All Attachments
                                </button>
                            </div>
                        </div>
                    ` : ''}
                    ${ticket.responses && ticket.responses.length > 0 ? `
                        <div class="ticket-responses-section">
                            <h4><i class="fas fa-comments"></i> Conversation History (${ticket.responses.length})</h4>
                            <div class="responses-list">
                                ${ticket.responses.map(response => `
                                    <div class="response-item ${response.responderType}">
                                        <div class="response-header">
                                            <div class="responder-info">
                                                <strong>${response.responderName}</strong>
                                                <span class="responder-type ${response.responderType}">
                                                    <i class="fas ${response.responderType === 'admin' ? 'fa-user-shield' : 'fa-user'}"></i>
                                                    ${response.responderType === 'admin' ? 'Support Team' : 'User'}
                                                </span>
                                            </div>
                                            <span class="response-time">${formatAdminTimestamp(response.createdAt)}</span>
                                        </div>
                                        <div class="response-content">
                                            <p>${response.message}</p>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${ticket.internalNotes && ticket.internalNotes.length > 0 ? `
                        <div class="internal-notes-section">
                            <h4><i class="fas fa-sticky-note"></i> Internal Notes (Admin Only)</h4>
                            <div class="internal-notes-list">
                                ${ticket.internalNotes.map(note => `
                                    <div class="internal-note">
                                        <div class="note-header">
                                            <strong>${note.adminName}</strong>
                                            <span class="note-time">${formatAdminTimestamp(note.createdAt)}</span>
                                        </div>
                                        <div class="note-content">
                                            <p>${note.note}</p>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="ticket-actions-footer">
                    <button class="btn btn-success" onclick="closeModal(); respondToSupportTicket('${ticketId}')">
                        <i class="fas fa-reply"></i> Respond to User
                    </button>
                    <button class="btn btn-primary" onclick="closeModal(); updateSupportTicketStatus('${ticketId}')">
                        <i class="fas fa-edit"></i> Update Status
                    </button>
                    <button class="btn btn-warning" onclick="closeModal(); assignSupportTicket('${ticketId}')">
                        <i class="fas fa-user-plus"></i> Assign
                    </button>
                    <button class="btn btn-outline" onclick="closeModal(); addInternalNote('${ticketId}')">
                        <i class="fas fa-sticky-note"></i> Add Internal Note
                    </button>
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `;
        showModal(modalContent);
    } catch (error) {
        closeModal();
        showNotification('Failed to load ticket details.', 'error');
    }
}

async function downloadAllSupportAttachments(ticketId) {
    try {
        const { ticket } = await apiCall(`/support-messages/${ticketId}`);
        const attachments = ticket.attachments || [];
        
        if (attachments.length === 0) {
            showNotification('No attachments to download.', 'warning');
            return;
        }
        
        showNotification(`Downloading ${attachments.length} files...`, 'info');
        
        attachments.forEach((attachment, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = attachment.url;
                link.download = attachment.originalName || attachment.filename || `support_file_${index + 1}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 500);
        });
    } catch (error) {
        showNotification('Failed to download attachments.', 'error');
    }
}

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
                    <label for="new-status">Update Status:</label>
                    <select id="new-status">
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="open">Keep Open</option>
                        <option value="closed">Close Ticket</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitSupportResponse('${ticketId}')">
                        <i class="fas fa-paper-plane"></i> Send Response
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

async function submitSupportResponse(ticketId) {
    const adminResponse = document.getElementById('admin-response').value.trim();
    const internalNote = document.getElementById('internal-note').value.trim();
    const newStatus = document.getElementById('new-status').value;
    
    if (!adminResponse) {
        showNotification('Response message is required.', 'warning');
        return;
    }
    
    try {
        const submitBtn = document.querySelector('#support-response-form .btn-primary');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        
        await apiCall(`/support-messages/${ticketId}/respond`, 'POST', {
            adminResponse: adminResponse,
            internalNote: internalNote,
            status: newStatus
        });
        
        showNotification('Response sent successfully! User has been notified.', 'success');
        closeModal();
        
        await loadSupportMessagesData();
        await loadDashboardStats();
        
    } catch (error) {
        console.error('Error submitting support response:', error);
        showNotification('Failed to send response. Please try again.', 'error');
        const submitBtn = document.querySelector('#support-response-form .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Response';
        }
    }
}


function updateSupportTicketStatus(ticketId) {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-edit"></i> Update Ticket Status</h3>
            <p>Ticket ID: <strong>${ticketId}</strong></p>
            <form id="status-update-form">
                <div class="form-group">
                    <label for="ticket-status">New Status:</label>
                    <select id="ticket-status" required>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="status-note">Note (Optional):</label>
                    <textarea id="status-note" rows="3" placeholder="Reason for status change..."></textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="notify-user"> Notify user of status change
                    </label>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitStatusUpdate('${ticketId}')">
                        <i class="fas fa-save"></i> Update Status
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

async function submitStatusUpdate(ticketId) {
    const newStatus = document.getElementById('ticket-status').value;
    const note = document.getElementById('status-note').value.trim();
    const notifyUser = document.getElementById('notify-user').checked;
    
    try {
        const submitBtn = document.querySelector('#status-update-form .btn-primary');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        
        await apiCall(`/support-messages/${ticketId}/status`, 'PATCH', {
            status: newStatus,
            internalNote: note,
            notifyUser: notifyUser
        });
        
        showNotification(`Ticket status updated to ${formatStatus(newStatus)}!`, 'success');
        closeModal();
        
        await loadSupportMessagesData();
        await loadDashboardStats();
        
    } catch (error) {
        console.error('Error updating status:', error);
        showNotification('Failed to update status. Please try again.', 'error');
        const submitBtn = document.querySelector('#status-update-form .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Status';
        }
    }
}


function assignSupportTicket(ticketId) {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-user-plus"></i> Assign Ticket</h3>
            <p>Ticket ID: <strong>${ticketId}</strong></p>
            <form id="assign-ticket-form">
                <div class="form-group">
                    <label for="assignee-name">Assign to Admin:</label>
                    <input type="text" id="assignee-name" placeholder="Enter admin name" required>
                    <small>Enter the name of the admin to assign this ticket to.</small>
                </div>
                <div class="form-group">
                    <label for="assign-note">Assignment Note (Optional):</label>
                    <textarea id="assign-note" rows="3" placeholder="Why are you assigning this ticket?"></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitTicketAssignment('${ticketId}')">
                        <i class="fas fa-user-check"></i> Assign Ticket
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

async function submitTicketAssignment(ticketId) {
    const assigneeName = document.getElementById('assignee-name').value.trim();
    const assignNote = document.getElementById('assign-note').value.trim();
    
    if (!assigneeName) {
        showNotification('Assignee name is required.', 'warning');
        return;
    }
    
    try {
        const submitBtn = document.querySelector('#assign-ticket-form .btn-primary');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="btn-spinner"></div> Assigning...';
        
        const assigneeId = 'admin_' + assigneeName.toLowerCase().replace(/\s+/g, '_');
        
        await apiCall(`/support-messages/${ticketId}/assign`, 'POST', {
            assignToId: assigneeId,
            assignToName: assigneeName,
            note: assignNote
        });
        
        showNotification(`Ticket assigned to ${assigneeName} successfully!`, 'success');
        closeModal();
        loadSupportMessagesData();
        
    } catch (error) {
        showNotification('Failed to assign ticket. Please try again.', 'error');
        const submitBtn = document.querySelector('#assign-ticket-form .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-user-check"></i> Assign Ticket';
        }
    }
}

function addInternalNote(ticketId) {
    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-sticky-note"></i> Add Internal Note</h3>
            <p>Ticket ID: <strong>${ticketId}</strong></p>
            <form id="internal-note-form">
                <div class="form-group">
                    <label for="internal-note-text">Internal Note:</label>
                    <textarea id="internal-note-text" rows="4" placeholder="Add admin-only note..." required></textarea>
                    <small>This note will only be visible to admin staff.</small>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" onclick="submitInternalNote('${ticketId}')">
                        <i class="fas fa-save"></i> Save Note
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        </div>
    `;
    showModal(modalContent);
}

async function submitInternalNote(ticketId) {
    const noteText = document.getElementById('internal-note-text').value.trim();
    
    if (!noteText) {
        showNotification('Note text is required.', 'warning');
        return;
    }
    
    try {
        const submitBtn = document.querySelector('#internal-note-form .btn-primary');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        await apiCall(`/support-messages/${ticketId}/internal-note`, 'POST', {
            note: noteText
        });
        
        showNotification('Internal note added successfully!', 'success');
        closeModal();
        
        await loadSupportMessagesData();
        
    } catch (error) {
        console.error('Error adding internal note:', error);
        showNotification('Failed to add internal note. Please try again.', 'error');
        const submitBtn = document.querySelector('#internal-note-form .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Note';
        }
    }
}


async function filterSupportMessages() {
    const statusFilter = document.getElementById('support-status-filter').value;
    const priorityFilter = document.getElementById('support-priority-filter').value;
    const container = document.getElementById('support-messages-tab');
    showLoader(container);
    
    try {
        const queryParams = new URLSearchParams();
        if (statusFilter !== 'all') queryParams.set('status', statusFilter);
        if (priorityFilter !== 'all') queryParams.set('priority', priorityFilter);
        
        const endpoint = `/support-messages?${queryParams.toString()}`;
        const { messages, stats } = await apiCall(endpoint);
        state.supportMessages = messages;
        renderSupportMessagesTab(messages, stats);
    } catch (error) {
        showNotification('Failed to filter support messages.', 'error');
        loadSupportMessagesData();
    }
}

function getAttachmentIcon(attachment) {
    const fileName = attachment.originalName || attachment.filename || '';
    const ext = fileName.toLowerCase().split('.').pop();
    
    const iconMap = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'txt': 'fa-file-alt',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image'
    };
    
    return iconMap[ext] || 'fa-file';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatAdminTimestamp(date) {
    try {
        if (!date) return 'Unknown time';
        
        let dateObj;
        
        if (typeof date === 'string') {
            dateObj = new Date(date);
        } else if (date instanceof Date) {
            dateObj = date;
        } else if (date && typeof date === 'object') {
            if (date.seconds) {
                dateObj = new Date(date.seconds * 1000);
            } else if (date._seconds) {
                dateObj = new Date(date._seconds * 1000);
            } else {
                return 'Invalid date';
            }
        } else {
            return 'Invalid date';
        }
        
        if (isNaN(dateObj.getTime())) {
            console.warn('Invalid date object:', date);
            return 'Invalid date';
        }
        
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        
        return dateObj.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('Admin timestamp formatting error:', error, 'Input:', date);
        return 'Invalid date';
    }
}

function getPriorityIcon(priority) {
    const icons = {
        'Critical': 'fa-exclamation-triangle',
        'High': 'fa-arrow-up',
        'Medium': 'fa-minus',
        'Low': 'fa-arrow-down'
    };
    return icons[priority] || 'fa-minus';
}

function getStatusIcon(status) {
    const icons = {
        'open': 'fa-envelope-open',
        'in_progress': 'fa-cog fa-spin',
        'resolved': 'fa-check-circle',
        'closed': 'fa-times-circle'
    };
    return icons[status] || 'fa-envelope';
}

function formatStatus(status) {
    const formatted = {
        'open': 'Open',
        'in_progress': 'In Progress',
        'resolved': 'Resolved',
        'closed': 'Closed'
    };
    return formatted[status] || 'Unknown';
}

function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
}

function getTimeAgo(dateString) {
    if (!dateString) return 'some time ago';
    
    let date;
    try {
        if (typeof dateString === 'string') {
            date = new Date(dateString);
        } else if (dateString instanceof Date) {
            date = dateString;
        } else if (dateString && typeof dateString === 'object') {
            if (dateString.seconds) {
                date = new Date(dateString.seconds * 1000);
            } else if (dateString._seconds) {
                date = new Date(dateString._seconds * 1000);
            } else {
                return 'some time ago';
            }
        } else {
            return 'some time ago';
        }
        
        if (isNaN(date.getTime())) {
            console.warn('Invalid date in getTimeAgo:', dateString);
            return 'some time ago';
        }
        
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
        if (seconds < 2592000) return Math.floor(seconds / 86400) + ' days ago';
        if (seconds < 31536000) return Math.floor(seconds / 2592000) + ' months ago';
        
        return Math.floor(seconds / 31536000) + ' years ago';
    } catch (error) {
        console.error('Error in getTimeAgo:', error, 'Input:', dateString);
        return 'some time ago';
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
                        <th>Completion</th>
                        <th>Status</th>
                        <th>Files</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(job => {
                        const completionPct = job.status === 'completed' ? 100 : (job.completionPercentage || 0);
                        const hasPending = job.completionUpdate && job.completionUpdate.status === 'pending';
                        return `
                        <tr>
                            <td>
                                <div class="job-title-cell">
                                    <strong>${job.title || 'Untitled Job'}</strong>
                                    ${job.deadline ? `<br><small>Deadline: ${formatAdminDate(job.deadline)}</small>` : ''}
                                </div>
                            </td>
                            <td>
                                <div class="client-info">
                                    ${job.posterName || 'N/A'}<br>
                                    <small>${job.posterEmail || 'N/A'}</small>
                                </div>
                            </td>
                            <td><span class="budget-amount">${job.budget || 'N/A'}</span></td>
                            <td>
                                <div class="completion-cell">
                                    <div class="completion-bar-mini">
                                        <div class="completion-bar-fill" style="width: ${completionPct}%; background: ${completionPct >= 75 ? '#10b981' : completionPct >= 40 ? '#f59e0b' : '#3b82f6'}"></div>
                                    </div>
                                    <span class="completion-pct-text">${completionPct}%</span>
                                    ${hasPending ? `<span class="completion-pending-badge" title="Pending: ${job.completionUpdate.percentage}%">⏳</span>` : ''}
                                </div>
                            </td>
                            <td><span class="status ${job.status || 'unknown'}">${job.status || 'Unknown'}</span></td>
                            <td>
                                ${getJobFilesCell(job)}
                            </td>
                            <td class="action-buttons">
                                <button class="btn btn-sm" onclick="viewJobDetails('${job._id}')">View Details</button>
                                <button class="btn btn-sm btn-danger" onclick="confirmDeleteJob('${job._id}')">Delete</button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    } else if (type === 'quotes') {
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
                                    ${quote.createdAt ? `<br><small>Submitted: ${formatAdminDate(quote.createdAt)}</small>` : ''}
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

function getJobFilesCell(job) {
    const attachments = job.attachments || [];
    const attachment = job.attachment; 

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

    const totalSize = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    const modalContent = `
        <div class="modal-body">
            <h3><i class="fas fa-folder-open"></i> Project Files - ${job.title}</h3>
            <div class="job-info-summary">
                <p><strong>Client:</strong> ${job.posterName || 'N/A'}</p>
                <p><strong>Budget:</strong> ${job.budget || 'N/A'}</p>
                <p><strong>Status:</strong> <span class="status ${job.status}">${job.status}</span></p>
            </div>
            ${allFiles.length > 0 ? `
                <div class="files-summary-header">
                    <span class="files-count"><i class="fas fa-paperclip"></i> ${allFiles.length} file${allFiles.length !== 1 ? 's' : ''}</span>
                    ${totalSize > 0 ? `<span class="files-size-badge"><i class="fas fa-database"></i> Total: ${totalSizeMB} MB</span>` : ''}
                </div>
                <div class="files-grid">
                    ${allFiles.map((file, index) => {
                        const fileName = file.originalname || file.filename || file.name || `Attachment ${index + 1}`;
                        const fileSizeBytes = file.size || 0;
                        const fileSizeMB = fileSizeBytes > 0 ? (fileSizeBytes / (1024 * 1024)).toFixed(2) : null;
                        const fileSizeKB = fileSizeBytes > 0 ? (fileSizeBytes / 1024).toFixed(1) : null;
                        const fileSizeDisplay = fileSizeMB ? (parseFloat(fileSizeMB) >= 1 ? fileSizeMB + ' MB' : fileSizeKB + ' KB') : 'Unknown size';
                        const uploadDate = formatAdminDate(file.uploadedAt, 'Unknown date');
                        const fileIcon = getFileIconByName(fileName);

                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas ${fileIcon}"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size-badge">${fileSizeDisplay}</span>
                                        <span class="file-date"><i class="fas fa-calendar-alt"></i> ${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </a>
                                    <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.url}', '${fileName.replace(/'/g, "\\'")}')">
                                        <i class="fas fa-download"></i> Download
                                    </button>
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
                        <div><label>Completion:</label><span style="font-weight:700;color:${(job.status === 'completed' ? 100 : (job.completionPercentage || 0)) >= 75 ? '#10b981' : '#f59e0b'}">${job.status === 'completed' ? 100 : (job.completionPercentage || 0)}%</span></div>
                        ${job.completionDetails ? `<div><label>Completion Details:</label><span>${job.completionDetails}</span></div>` : ''}
                        ${job.completionUpdate && job.completionUpdate.status === 'pending' ? `<div><label>Pending Update:</label><span style="color:#d97706;font-weight:600">${job.completionUpdate.percentage}% - ${job.completionUpdate.details} (by ${job.completionUpdate.submittedByName})</span></div>` : ''}
                        ${job.deadline ? `<div><label>Deadline:</label><span>${formatAdminDate(job.deadline)}</span></div>` : ''}
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
                            ${(() => {
                                const allJobFiles = [...attachments];
                                if (legacyAttachment) allJobFiles.push({ size: null });
                                const jobTotalSize = allJobFiles.reduce((sum, f) => sum + (f.size || 0), 0);
                                return jobTotalSize > 0 ? `<p class="files-size-info"><i class="fas fa-database"></i> Total size: <strong>${(jobTotalSize / (1024 * 1024)).toFixed(2)} MB</strong></p>` : '';
                            })()}
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

async function downloadAllJobFiles(jobId) {
    const job = state.jobs.find(j => j._id === jobId);
    if (!job) return showNotification('Job not found.', 'error');

    const attachments = job.attachments || [];
    const legacyAttachment = job.attachment;
    let allFiles = [...attachments];
    if (legacyAttachment) {
        allFiles.push({ url: legacyAttachment, name: 'project_attachment.pdf' });
    }
    if (allFiles.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    showNotification(`Downloading ${allFiles.length} file(s)...`, 'info');
    for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        const name = file.originalname || file.filename || file.name || `job_file_${i + 1}.pdf`;
        await downloadFileSilent(file.url, name);
        if (i < allFiles.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    showNotification(`${allFiles.length} file(s) downloaded successfully.`, 'success');
}

function confirmDeleteJob(jobId) {
    if (confirm('Are you sure you want to delete this job? This will also delete all associated quotes and files. This action cannot be undone.')) {
        deleteGenericItem('jobs', jobId);
        closeModal();
    }
}

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

function viewQuoteFiles(quoteId) {
    const quote = state.quotes.find(q => q._id === quoteId);
    if (!quote) return showNotification('Quote not found.', 'error');
    const attachments = quote.attachments || [];
    const totalSize = attachments.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
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
                <div class="files-summary-header">
                    <span class="files-count"><i class="fas fa-paperclip"></i> ${attachments.length} file${attachments.length !== 1 ? 's' : ''}</span>
                    ${totalSize > 0 ? `<span class="files-size-badge"><i class="fas fa-database"></i> Total: ${totalSizeMB} MB</span>` : ''}
                </div>
                <div class="files-grid">
                    ${attachments.map((file, index) => {
                        const fileName = file.name || file.originalname || `Attachment ${index + 1}`;
                        const fileSizeBytes = file.size || 0;
                        const fileSizeMB = fileSizeBytes > 0 ? (fileSizeBytes / (1024 * 1024)).toFixed(2) : null;
                        const fileSizeKB = fileSizeBytes > 0 ? (fileSizeBytes / 1024).toFixed(1) : null;
                        const fileSizeDisplay = fileSizeMB ? (parseFloat(fileSizeMB) >= 1 ? fileSizeMB + ' MB' : fileSizeKB + ' KB') : 'Unknown size';
                        const uploadDate = formatAdminDate(file.uploadedAt, 'Unknown date');
                        const fileIcon = getQuoteFileIcon(fileName);

                        return `
                            <div class="file-item-card">
                                <div class="file-icon">
                                    <i class="fas ${fileIcon}"></i>
                                </div>
                                <div class="file-details">
                                    <h4 class="file-name" title="${fileName}">${fileName}</h4>
                                    <div class="file-meta">
                                        <span class="file-size-badge">${fileSizeDisplay}</span>
                                        <span class="file-date"><i class="fas fa-calendar-alt"></i> ${uploadDate}</span>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="${file.url}" target="_blank" class="btn btn-sm btn-outline">
                                        <i class="fas fa-external-link-alt"></i> View
                                    </a>
                                    <button class="btn btn-sm btn-primary" onclick="downloadFile('${file.url}', '${fileName.replace(/'/g, "\\'")}')">
                                        <i class="fas fa-download"></i> Download
                                    </button>
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
                        <div><label>Submitted:</label><span>${formatAdminDate(quote.createdAt)}</span></div>
                        ${quote.approvedAt ? `<div><label>Approved:</label><span>${formatAdminDate(quote.approvedAt)}</span></div>` : ''}
                        ${quote.rejectedAt ? `<div><label>Rejected:</label><span>${formatAdminDate(quote.rejectedAt)}</span></div>` : ''}
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
                            ${(() => {
                                const quoteTotalSize = attachments.reduce((sum, f) => sum + (f.size || 0), 0);
                                return quoteTotalSize > 0 ? `<p class="files-size-info"><i class="fas fa-database"></i> Total size: <strong>${(quoteTotalSize / (1024 * 1024)).toFixed(2)} MB</strong></p>` : '';
                            })()}
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

async function downloadAllQuoteFiles(quoteId) {
    const quote = state.quotes.find(q => q._id === quoteId);
    if (!quote) return showNotification('Quote not found.', 'error');
    const attachments = quote.attachments || [];
    if (attachments.length === 0) {
        return showNotification('No files to download.', 'warning');
    }
    showNotification(`Downloading ${attachments.length} file(s)...`, 'info');
    for (let i = 0; i < attachments.length; i++) {
        const file = attachments[i];
        const name = file.name || file.originalname || `quote_file_${i + 1}`;
        const url = file.url || file.downloadURL;
        await downloadFileSilent(url, name);
        if (i < attachments.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    showNotification(`${attachments.length} file(s) downloaded successfully.`, 'success');
}

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

function getFileIconByName(fileName) {
    if (!fileName) return 'fa-file';
    const ext = fileName.toLowerCase().split('.').pop();
    const iconMap = {
        'pdf': 'fa-file-pdf', 'doc': 'fa-file-word', 'docx': 'fa-file-word',
        'xls': 'fa-file-excel', 'xlsx': 'fa-file-excel', 'txt': 'fa-file-alt',
        'jpg': 'fa-file-image', 'jpeg': 'fa-file-image', 'png': 'fa-file-image',
        'dwg': 'fa-drafting-compass', 'zip': 'fa-file-archive'
    };
    return iconMap[ext] || 'fa-file';
}

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
let _pollingInitialized = false;
let _wsRetryCount = 0;
const WS_MAX_RETRIES = 5;
const WS_BASE_DELAY = 5000;

function initializeRealTimeUpdates() {
    if (!_pollingInitialized) {
        _pollingInitialized = true;
        setInterval(async () => {
            try {
                const activeEl = document.querySelector('.tab-content.active');
                if (!activeEl) return;
                const currentActiveTab = activeEl.id;

                if (currentActiveTab === 'support-messages-tab') {
                    loadSupportMessagesData();
                } else if (currentActiveTab === 'dashboard-tab') {
                    loadDashboardStats();
                } else if (currentActiveTab === 'users-tab') {
                    loadUsersData();
                } else if (currentActiveTab === 'incomplete-users-tab') {
                    loadIncompleteUsersData();
                }
            } catch (error) {
                console.log('Error in real-time updates:', error);
            }
        }, 30000);
    }

    connectWebSocket();
}

function connectWebSocket() {
    // WebSocket server not implemented on backend - using polling for real-time updates instead
    console.log('Using polling for real-time updates.');
}


// --- CROSS-ORIGIN FILE DOWNLOAD HELPER ---
function sanitizeDownloadUrl(url) {
    try {
        const parsed = new URL(url);
        // Firebase Storage URLs encode the full object path after /o/ — do NOT re-encode
        if (parsed.hostname.includes('firebasestorage.googleapis.com') ||
            parsed.hostname.includes('storage.googleapis.com')) {
            return url; // Already properly encoded by Firebase SDK
        }
        parsed.pathname = parsed.pathname.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
        return parsed.toString();
    } catch {
        return encodeURI(url);
    }
}

async function downloadFile(url, filename) {
    const safeUrl = sanitizeDownloadUrl(url);
    try {
        showNotification(`Downloading ${filename}...`, 'info');
        // Try fetch with CORS first
        const response = await fetch(safeUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.warn(`Blob download failed for ${filename}, trying no-cors then window.open:`, error);
        // Try with the original URL (un-sanitized) in case sanitization broke it
        try {
            const response2 = await fetch(url, { mode: 'cors' });
            if (!response2.ok) throw new Error(`HTTP ${response2.status}`);
            const blob = await response2.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error2) {
            console.warn(`Retried original URL failed for ${filename}, opening in new tab:`, error2);
            window.open(url, '_blank');
        }
    }
}

async function downloadFileSilent(url, filename) {
    const safeUrl = sanitizeDownloadUrl(url);
    try {
        const response = await fetch(safeUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.warn(`Blob download failed for ${filename}, retrying with original URL:`, error);
        try {
            const response2 = await fetch(url, { mode: 'cors' });
            if (!response2.ok) throw new Error(`HTTP ${response2.status}`);
            const blob = await response2.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error2) {
            console.warn(`Retried original URL failed for ${filename}, opening in new tab:`, error2);
            window.open(url, '_blank');
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


// === ANALYSIS PORTAL - SMART DASHBOARD MANAGEMENT ===
// State for dashboards
if (!state.dashboards) state.dashboards = [];
if (!state.dashboardFilter) state.dashboardFilter = 'all';
let adminDashboardCharts = {};

async function loadAnalysisPortalData() {
    const container = document.getElementById('analysis-portal-tab');
    showLoader(container);
    try {
        const [reqRes, dbRes] = await Promise.all([
            apiCall('/business-analytics/requests', 'GET'),
            apiCall('/dashboards', 'GET')
        ]);
        state.contractorRequests = reqRes.requests || [];
        state.dashboards = dbRes.dashboards || [];
        renderAnalysisPortalTab();
    } catch (error) {
        console.error('Error loading analysis portal:', error);
        container.innerHTML = `<p class="error">Failed to load analysis data.</p><button class="btn" onclick="loadAnalysisPortalData()">Retry</button>`;
    }
}

function renderAnalysisPortalTab() {
    const container = document.getElementById('analysis-portal-tab');
    const dashboards = state.dashboards || [];
    const requests = state.contractorRequests || [];
    const filtered = state.dashboardFilter === 'all' ? dashboards :
        dashboards.filter(d => d.status === state.dashboardFilter);

    const pendingCount = dashboards.filter(d => d.status === 'pending').length;
    const approvedCount = dashboards.filter(d => d.status === 'approved').length;
    const rejectedCount = dashboards.filter(d => d.status === 'rejected').length;

    container.innerHTML = `
        <div class="ap-header">
            <div class="ap-header-left">
                <div class="ap-header-icon"><i class="fas fa-chart-bar"></i></div>
                <div>
                    <h3>Analytics Dashboard Manager</h3>
                    <p>Upload Google Sheets, auto-generate dashboards, and approve for clients</p>
                </div>
            </div>
            <div class="ap-header-actions">
                <button class="btn btn-primary ap-upload-btn" onclick="showUploadSheetModal()">
                    <i class="fas fa-cloud-upload-alt"></i> Upload Sheet
                </button>
                <button class="btn ap-refresh-btn" onclick="loadAnalysisPortalData()"><i class="fas fa-sync-alt"></i></button>
            </div>
        </div>

        <div class="ap-stats-row">
            <div class="ap-stat-card">
                <div class="ap-stat-icon" style="background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(99,102,241,.05));color:#6366f1"><i class="fas fa-chart-bar"></i></div>
                <div class="ap-stat-info">
                    <div class="ap-stat-num">${dashboards.length}</div>
                    <div class="ap-stat-label">Total Dashboards</div>
                </div>
            </div>
            <div class="ap-stat-card">
                <div class="ap-stat-icon" style="background:linear-gradient(135deg,rgba(245,158,11,.15),rgba(245,158,11,.05));color:#f59e0b"><i class="fas fa-clock"></i></div>
                <div class="ap-stat-info">
                    <div class="ap-stat-num">${pendingCount}</div>
                    <div class="ap-stat-label">Pending Approval</div>
                </div>
                ${pendingCount > 0 ? '<div class="ap-stat-alert"></div>' : ''}
            </div>
            <div class="ap-stat-card">
                <div class="ap-stat-icon" style="background:linear-gradient(135deg,rgba(16,185,129,.15),rgba(16,185,129,.05));color:#10b981"><i class="fas fa-check-circle"></i></div>
                <div class="ap-stat-info">
                    <div class="ap-stat-num">${approvedCount}</div>
                    <div class="ap-stat-label">Live for Clients</div>
                </div>
            </div>
            <div class="ap-stat-card">
                <div class="ap-stat-icon" style="background:linear-gradient(135deg,rgba(236,72,153,.15),rgba(236,72,153,.05));color:#ec4899"><i class="fas fa-inbox"></i></div>
                <div class="ap-stat-info">
                    <div class="ap-stat-num">${requests.length}</div>
                    <div class="ap-stat-label">Client Requests</div>
                </div>
            </div>
        </div>

        <div class="ap-filter-bar">
            <div class="ap-filter-tabs">
                <button class="ap-filter-tab ${state.dashboardFilter === 'all' ? 'active' : ''}" onclick="filterDashboards('all')">
                    <i class="fas fa-layer-group"></i> All <span class="ap-tab-count">${dashboards.length}</span>
                </button>
                <button class="ap-filter-tab ${state.dashboardFilter === 'pending' ? 'active' : ''}" onclick="filterDashboards('pending')">
                    <i class="fas fa-clock"></i> Pending <span class="ap-tab-count warning">${pendingCount}</span>
                </button>
                <button class="ap-filter-tab ${state.dashboardFilter === 'approved' ? 'active' : ''}" onclick="filterDashboards('approved')">
                    <i class="fas fa-check-circle"></i> Approved <span class="ap-tab-count success">${approvedCount}</span>
                </button>
            </div>
        </div>

        <div class="ap-dashboards-grid">
            ${filtered.length === 0 ? `
                <div class="ap-empty-state">
                    <div class="ap-empty-icon"><i class="fas fa-chart-area"></i></div>
                    <h4>No dashboards found</h4>
                    <p>Upload a Google Sheet or Excel file to auto-generate a dashboard with charts and KPIs.</p>
                    <button class="btn btn-primary" onclick="showUploadSheetModal()"><i class="fas fa-cloud-upload-alt"></i> Upload Sheet</button>
                </div>
            ` :
            filtered.map(db => `
                <div class="ap-db-card ${db.status === 'pending' ? 'ap-db-pending' : db.status === 'approved' ? 'ap-db-approved' : 'ap-db-rejected'}">
                    <div class="ap-db-status-strip" style="background:${db.status === 'approved' ? '#10b981' : db.status === 'rejected' ? '#ef4444' : '#f59e0b'}"></div>
                    <div class="ap-db-card-content">
                        <div class="ap-db-card-head">
                            <div class="ap-db-icon-wrap">
                                <i class="fas fa-chart-pie"></i>
                            </div>
                            <div class="ap-db-info">
                                <h4>${db.title || 'Untitled Dashboard'}</h4>
                                <span class="ap-db-contractor"><i class="fas fa-user"></i> ${db.contractorName || db.contractorEmail}</span>
                            </div>
                            <span class="ap-status-badge ap-status-${db.status}">
                                <i class="fas fa-${db.status === 'approved' ? 'check-circle' : db.status === 'rejected' ? 'times-circle' : 'hourglass-half'}"></i>
                                ${db.status.charAt(0).toUpperCase() + db.status.slice(1)}
                            </span>
                        </div>
                        <div class="ap-db-meta-row">
                            <div class="ap-db-meta-item"><i class="fas fa-file-excel"></i><span>${db.fileName || 'No file'}</span></div>
                            <div class="ap-db-meta-item"><i class="fas fa-chart-bar"></i><span>${db.chartCount || 0} charts</span></div>
                            <div class="ap-db-meta-item"><i class="fas fa-sync-alt"></i><span>${db.frequency || 'daily'}</span></div>
                            <div class="ap-db-meta-item"><i class="fas fa-calendar-alt"></i><span>${formatAdminDate(db.createdAt)}</span></div>
                            ${db.googleSheetUrl ? `<div class="ap-db-meta-item"><a href="${db.googleSheetUrl}" target="_blank" rel="noopener" style="color:${db.linkType === 'sharepoint' ? '#0078d4' : '#34a853'};font-weight:600;display:flex;align-items:center;gap:4px;text-decoration:none"><i class="${db.linkType === 'sharepoint' ? 'fas fa-cloud' : 'fab fa-google-drive'}"></i> ${db.linkType === 'sharepoint' ? 'SharePoint' : db.linkType === 'google' ? 'Google Sheet' : 'Linked Sheet'}</a></div>` : ''}
                            ${db.syncInterval && db.syncInterval !== 'manual' ? `<div class="ap-db-meta-item" style="color:#6366f1"><i class="fas fa-sync"></i><span>Auto: ${db.syncInterval}</span></div>` : ''}
                        </div>
                        ${db.manualDashboardUrl ? `<div class="ap-db-manual-link"><i class="fas fa-external-link-alt"></i> Manual: <a href="${db.manualDashboardUrl}" target="_blank" rel="noopener">${db.manualDashboardUrl.length > 50 ? db.manualDashboardUrl.substring(0, 50) + '...' : db.manualDashboardUrl}</a></div>` : ''}
                        <div class="ap-db-actions-row">
                            <button class="ap-action-btn ap-btn-preview" onclick="previewDashboard('${db._id}')">
                                <i class="fas fa-eye"></i> ${db.status === 'pending' ? 'Review & Approve' : 'Preview'}
                            </button>
                            ${db.status === 'pending' ? `
                                <button class="ap-action-btn ap-btn-reject" onclick="rejectDashboard('${db._id}')">
                                    <i class="fas fa-times"></i> Reject
                                </button>
                            ` : ''}
                            <button class="ap-action-btn ap-btn-delete" onclick="deleteDashboard('${db._id}')">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>

        ${requests.length > 0 ? `
        <div class="ap-section-divider">
            <div class="ap-section-title"><i class="fas fa-inbox"></i> Client Analysis Requests</div>
            <span class="ap-section-count">${requests.length} request${requests.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="ap-requests-table-wrap">
            <table class="ap-requests-table">
                <thead><tr>
                    <th>Contractor</th><th>Data Type</th><th>Frequency</th><th>Google Sheet</th><th>Status</th><th>Date</th><th>Actions</th>
                </tr></thead>
                <tbody>
                    ${requests.map(r => `<tr>
                        <td>
                            <div class="ap-contractor-cell">
                                <div class="ap-contractor-avatar">${(r.contractorName || 'U').charAt(0).toUpperCase()}</div>
                                <div><strong>${r.contractorName || 'Unknown'}</strong><br><small style="color:#64748b">${r.contractorEmail}</small></div>
                            </div>
                        </td>
                        <td><span class="ap-type-badge">${r.dataType}</span></td>
                        <td><span style="font-weight:600;color:#475569">${r.frequency}</span></td>
                        <td><a href="${r.googleSheetUrl}" target="_blank" class="ap-sheet-link"><i class="fas fa-external-link-alt"></i> Open Sheet</a></td>
                        <td><span class="ap-status-badge ap-status-${r.status}">${r.status}</span></td>
                        <td><small style="color:#64748b">${formatAdminDate(r.createdAt)}</small></td>
                        <td><button class="ap-action-btn ap-btn-delete" onclick="deleteAnalysisRequest('${r._id}')" title="Delete"><i class="fas fa-trash-alt"></i></button></td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>` : ''}
    `;
}

function filterDashboards(status) {
    state.dashboardFilter = status;
    renderAnalysisPortalTab();
}

// Upload Sheet Modal - Premium design, auto-populates contractor from dropdown
async function showUploadSheetModal() {
    // Fetch contractors list for auto-populate
    let contractors = [];
    try {
        const res = await apiCall('/users?role=contractor', 'GET');
        contractors = (res.users || res.data || []).filter(u => u.email);
    } catch (e) { console.warn('Could not fetch contractors list:', e); }

    const contractorOptions = contractors.map(c =>
        `<option value="${c.email}" data-name="${c.name || c.displayName || ''}">${c.name || c.displayName || c.email} (${c.email})</option>`
    ).join('');

    const modalContent = `
        <div class="modal-body" style="max-width:700px;padding:0">
            <div class="adm-upload-header">
                <div class="adm-upload-header-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <div>
                    <h3>Upload Data for Contractor</h3>
                    <p>Select a contractor and upload data to auto-generate a dashboard for them</p>
                </div>
            </div>
            <div class="adm-upload-form-body">
                <div class="adm-upload-field">
                    <label><i class="fas fa-user-circle"></i> Select Contractor *</label>
                    ${contractors.length > 0 ? `
                        <select id="sheet-contractor-select" class="adm-upload-input" onchange="adminAutoFillContractor()">
                            <option value="">-- Select Contractor --</option>
                            ${contractorOptions}
                        </select>
                    ` : `
                        <div class="adm-upload-row" style="margin-bottom:0">
                            <div class="adm-upload-field" style="margin-bottom:0"><input type="email" id="sheet-contractor-email" class="adm-upload-input" placeholder="contractor@email.com" required></div>
                            <div class="adm-upload-field" style="margin-bottom:0"><input type="text" id="sheet-contractor-name" class="adm-upload-input" placeholder="Contractor Name"></div>
                        </div>
                    `}
                    <input type="hidden" id="sheet-contractor-email-hidden" value="">
                    <input type="hidden" id="sheet-contractor-name-hidden" value="">
                </div>
                <div class="adm-upload-row">
                    <div class="adm-upload-field">
                        <label><i class="fas fa-heading"></i> Dashboard Title *</label>
                        <input type="text" id="sheet-dash-title" class="adm-upload-input" placeholder="e.g., Monthly Production Report" required>
                    </div>
                    <div class="adm-upload-field">
                        <label><i class="fas fa-sync-alt"></i> Frequency</label>
                        <select id="sheet-frequency" class="adm-upload-input">
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly" selected>Monthly</option>
                            <option value="quarterly">Quarterly</option>
                        </select>
                    </div>
                </div>
                <div class="adm-upload-field">
                    <label><i class="fas fa-file-alt"></i> Description</label>
                    <input type="text" id="sheet-description" class="adm-upload-input" placeholder="Brief description of the dashboard data...">
                </div>
                <div class="adm-upload-field">
                    <label><i class="fas fa-link" style="color:#6366f1"></i> Sheet Link <span style="font-weight:400;color:#94a3b8">(Google Sheets, SharePoint, or OneDrive)</span></label>
                    <div class="adm-gsheet-wrap">
                        <span class="adm-gsheet-prefix"><i class="fas fa-cloud"></i></span>
                        <input type="url" id="sheet-google-url" class="adm-upload-input adm-gsheet-input" placeholder="Paste Google Sheet, SharePoint, or OneDrive link...">
                    </div>
                    <small style="color:#94a3b8;font-size:.75rem;margin-top:4px;display:block"><i class="fas fa-info-circle"></i> Supports Google Sheets, SharePoint (.xlsx), and OneDrive. File must be shared publicly.</small>
                </div>
                <div class="adm-upload-field">
                    <label><i class="fas fa-sync-alt" style="color:#6366f1"></i> Auto-Sync Interval</label>
                    <select id="sheet-sync-interval" class="adm-upload-input">
                        <option value="daily" selected>Daily</option>
                        <option value="hourly">Hourly</option>
                        <option value="realtime">Every 5 min (Realtime)</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="manual">Manual only</option>
                    </select>
                </div>
                <div class="adm-upload-divider"><span>and / or</span></div>
                <div class="adm-upload-field">
                    <label><i class="fas fa-cloud-upload-alt"></i> Spreadsheet File <span style="font-weight:400;color:#94a3b8">(for auto-generation)</span></label>
                    <div class="adm-file-drop" id="adm-file-drop" onclick="document.getElementById('sheet-file-input').click()">
                        <input type="file" id="sheet-file-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="adminHandleFileSelect(this)">
                        <div id="adm-file-drop-content">
                            <i class="fas fa-cloud-upload-alt"></i>
                            <span>Click to browse or drag & drop</span>
                            <small>Supported: .xlsx, .xls, .csv (Max 50MB)</small>
                        </div>
                    </div>
                </div>
                <div class="adm-upload-actions">
                    <button class="adm-upload-submit" onclick="uploadSheetFile()" id="sheet-upload-btn">
                        <i class="fas fa-rocket"></i> Upload & Generate Dashboard
                    </button>
                    <button class="adm-upload-cancel" onclick="closeModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    showModal(modalContent);

    // Drag & drop
    setTimeout(() => {
        const dz = document.getElementById('adm-file-drop');
        if (!dz) return;
        ['dragover','dragenter'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('dragover'); }));
        ['dragleave','drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('dragover'); }));
        dz.addEventListener('drop', ev => {
            const fi = document.getElementById('sheet-file-input');
            if (ev.dataTransfer.files.length > 0) { fi.files = ev.dataTransfer.files; adminHandleFileSelect(fi); }
        });
    }, 200);
}

function adminAutoFillContractor() {
    const select = document.getElementById('sheet-contractor-select');
    if (!select) return;
    const email = select.value;
    const name = select.selectedOptions[0]?.dataset?.name || '';
    document.getElementById('sheet-contractor-email-hidden').value = email;
    document.getElementById('sheet-contractor-name-hidden').value = name;
}

function adminHandleFileSelect(input) {
    const content = document.getElementById('adm-file-drop-content');
    if (input.files && input.files[0]) {
        const f = input.files[0];
        const size = f.size > 1024*1024 ? (f.size/(1024*1024)).toFixed(1)+' MB' : (f.size/1024).toFixed(0)+' KB';
        content.innerHTML = `<i class="fas fa-file-excel" style="color:#10b981;font-size:1.5rem"></i><span style="font-weight:700;color:#1e293b">${f.name}</span><small style="color:#64748b">${size}</small>`;
        document.getElementById('adm-file-drop').classList.add('has-file');
    }
}

async function uploadSheetFile() {
    const title = document.getElementById('sheet-dash-title').value.trim();
    // Get contractor from dropdown or hidden fields
    const emailHidden = document.getElementById('sheet-contractor-email-hidden');
    const emailDirect = document.getElementById('sheet-contractor-email');
    const nameHidden = document.getElementById('sheet-contractor-name-hidden');
    const nameDirect = document.getElementById('sheet-contractor-name');
    const email = (emailHidden && emailHidden.value.trim()) || (emailDirect && emailDirect.value.trim()) || '';
    const name = (nameHidden && nameHidden.value.trim()) || (nameDirect && nameDirect.value.trim()) || '';
    const freq = document.getElementById('sheet-frequency').value;
    const desc = document.getElementById('sheet-description').value.trim();
    const fileInput = document.getElementById('sheet-file-input');
    const googleUrlInput = document.getElementById('sheet-google-url');
    const btn = document.getElementById('sheet-upload-btn');

    const hasFile = fileInput && fileInput.files && fileInput.files[0];
    const hasLink = googleUrlInput && googleUrlInput.value.trim();

    if (!title || !email) {
        showNotification('Please fill in the title and select a contractor', 'error');
        return;
    }
    if (!hasFile && !hasLink) {
        showNotification('Please upload a file or provide a sheet link (Google Sheets, SharePoint, or OneDrive)', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div> Processing...';

    try {
        const syncIntervalInput = document.getElementById('sheet-sync-interval');
        const syncInterval = syncIntervalInput ? syncIntervalInput.value : 'daily';

        const formData = new FormData();
        if (hasFile) formData.append('spreadsheet', fileInput.files[0]);
        if (hasLink) formData.append('googleSheetUrl', googleUrlInput.value.trim());
        formData.append('title', title);
        formData.append('contractorEmail', email);
        formData.append('contractorName', name);
        formData.append('frequency', freq);
        formData.append('description', desc);
        if (hasLink) formData.append('syncInterval', syncInterval);

        const response = await apiCall('/dashboards/upload', 'POST', formData);
        showNotification(`Dashboard created! ${response.charts?.length || 0} chart(s) auto-generated.`, 'success');
        closeModal();
        await loadAnalysisPortalData();
    } catch (error) {
        console.error('Sheet upload error:', error);
        showNotification('Failed to upload and process the data', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-rocket"></i> Upload & Generate Dashboard';
    }
}

// Preview Dashboard - Premium modal with auto-generated charts + approve/manual link options
async function previewDashboard(dashboardId) {
    try {
        showNotification('Loading dashboard preview...', 'info');
        const response = await apiCall(`/dashboards/${dashboardId}`, 'GET');
        const db = response.dashboard;
        if (!db) { showNotification('Dashboard not found', 'error'); return; }

        // For link-based dashboards with no stored charts, fetch live data from the sheet
        if (db.googleSheetUrl && (!db.charts || db.charts.length === 0)) {
            try {
                showNotification('Fetching live data from linked sheet...', 'info');
                const liveData = await apiCall(`/dashboards/${dashboardId}/live-data`, 'GET');
                if (liveData.charts && liveData.charts.length > 0) {
                    db.charts = liveData.charts;
                    db.predictiveAnalysis = liveData.predictiveAnalysis || db.predictiveAnalysis;
                    db.sheetNames = liveData.sheetNames || db.sheetNames;
                }
            } catch (liveErr) {
                console.error('[ADMIN] Live data fetch failed:', liveErr.message || liveErr);
            }
        }

        const hasCharts = db.charts && db.charts.length > 0;
        const hasManualLink = db.manualDashboardUrl && db.manualDashboardUrl.trim();

        // Build KPI HTML
        const allKpis = [];
        (db.charts || []).forEach(c => { if (c.kpis) allKpis.push(...c.kpis); });
        const kpisHTML = allKpis.slice(0, 8).map((kpi, i) => {
            const trendUp = (kpi.trend || 0) >= 0;
            const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#22c55e'];
            const c = colors[i % colors.length];
            return `<div class="adm-preview-kpi" style="border-left:3px solid ${c}">
                <div class="adm-preview-kpi-val">${formatKpiVal(kpi.total)}</div>
                <div class="adm-preview-kpi-label">${kpi.label || ''}</div>
                <div class="adm-preview-kpi-stats">
                    <span>Avg: ${formatKpiVal(kpi.avg)}</span>
                    ${kpi.median !== undefined ? `<span>Med: ${formatKpiVal(kpi.median)}</span>` : ''}
                    <span>Max: ${formatKpiVal(kpi.max)}</span>
                    <span>Min: ${formatKpiVal(kpi.min)}</span>
                </div>
                <div class="adm-preview-kpi-trend ${trendUp ? 'up' : 'down'}"><i class="fas fa-arrow-${trendUp ? 'up' : 'down'}"></i> ${Math.abs(kpi.trend || 0)}%</div>
                ${kpi.growthRate !== undefined ? `<div style="font-size:11px;color:${kpi.growthRate >= 0 ? '#10b981' : '#ef4444'};margin-top:4px"><i class="fas fa-chart-line"></i> Growth: ${kpi.growthRate >= 0 ? '+' : ''}${kpi.growthRate.toFixed(1)}%${kpi.peakLabel ? ' · Peak: ' + kpi.peakLabel : ''}</div>` : ''}
            </div>`;
        }).join('');

        const chartsHTML = (db.charts || []).map((chart, idx) =>
            `<div class="adm-preview-chart-card">
                <div class="adm-chart-card-head">
                    <h4><i class="fas fa-chart-${chart.chartType === 'bar' ? 'bar' : chart.chartType === 'doughnut' ? 'pie' : 'line'}"></i> ${chart.customTitle || chart.sheetName || 'Chart'}</h4>
                    <span class="adm-chart-meta">${chart.chartType || 'bar'} &middot; ${chart.rowCount || 0} rows &middot; ${(chart.dataColumns || []).length} metrics</span>
                </div>
                <div style="height:300px;position:relative;padding:12px"><canvas id="adm-preview-chart-${idx}"></canvas></div>
            </div>`
        ).join('');

        // Sheet link badge (Google Sheets / SharePoint / OneDrive)
        const linkIcon = db.linkType === 'sharepoint' ? 'fa-cloud' : db.linkType === 'google' ? 'fab fa-google-drive' : 'fa-link';
        const linkLabel = db.linkType === 'sharepoint' ? 'SharePoint' : db.linkType === 'google' ? 'Google Sheet' : 'Linked Sheet';
        const sheetBadge = db.googleSheetUrl ? `<a href="${db.googleSheetUrl}" target="_blank" rel="noopener" class="adm-preview-sheet-link"><i class="${linkIcon.startsWith('fab') ? linkIcon : 'fas ' + linkIcon}"></i> View ${linkLabel}</a>` : '';

        // Manual link badge (if already set)
        const manualBadge = hasManualLink ? `<div class="adm-preview-manual-badge"><i class="fas fa-external-link-alt"></i> Manual Dashboard: <a href="${db.manualDashboardUrl}" target="_blank" rel="noopener">${db.manualDashboardUrl}</a></div>` : '';

        // Build predictive analysis HTML for preview
        // Data structure from generatePredictiveAnalysis:
        //   insights: [{type, icon, text}]
        //   forecasts: [{sheet, column, regression:{slope,intercept,rSquared}, values, forecastLabels}]
        //   anomalies: [{sheet, column, anomalies:[{index,label,value,zScore,type,deviation}]}]
        //   correlations: {columns, matrix, insights:[{col1,col2,correlation,strength,direction}]}
        //   seasonality: {period, strength, label} (single object)
        //   movingAverages: {'sheet:col': {ma3, ma5, original, totalPoints}}
        const pa = db.predictiveAnalysis;
        let predictiveHTML = '';
        if (pa) {
            // Insights — field is "text" (not title/message)
            const insightsHTML = (pa.insights || []).slice(0, 8).map(ins => {
                const typeColors = { positive: '#10b981', warning: '#f59e0b', info: '#6366f1', negative: '#ef4444' };
                const typeIcons = { positive: 'arrow-up', warning: 'exclamation-triangle', info: 'lightbulb', negative: 'arrow-down' };
                const c = typeColors[ins.type] || '#6366f1';
                const ic = typeIcons[ins.type] || (ins.icon || 'info-circle');
                const insText = ins.text || ins.message || ins.title || '';
                return `<div style="background:${c}10;border:1px solid ${c}30;border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start">
                    <i class="fas fa-${ic}" style="color:${c};margin-top:2px;font-size:14px"></i>
                    <div style="color:#1e293b;font-size:13px;line-height:1.5">${insText}</div>
                </div>`;
            }).join('');

            // Forecasts — fields: sheet, column, regression.rSquared, values (predicted), forecastLabels
            const forecastsHTML = (pa.forecasts || []).slice(0, 6).map(f => {
                const reg = f.regression || {};
                const isUp = (reg.slope || 0) > 0;
                const predVals = (f.values || f.predictedValues || []);
                const rSq = reg.rSquared || f.rSquared || 0;
                const metricName = f.column || f.metric || 'Metric';
                const sheetLabel = f.sheet ? `<span style="font-size:10px;color:#94a3b8;display:block;margin-top:4px">${f.sheet}</span>` : '';
                return `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:14px;min-width:200px;flex:1">
                    <div style="font-size:12px;color:#64748b;margin-bottom:6px;font-weight:600">${metricName}</div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                        <span style="font-size:18px;font-weight:700;color:#0f172a">${predVals.length > 0 ? formatKpiVal(predVals[predVals.length - 1]) : 'N/A'}</span>
                        <i class="fas fa-arrow-${isUp ? 'up' : 'down'}" style="color:${isUp ? '#10b981' : '#ef4444'};font-size:14px"></i>
                        <span style="font-size:11px;color:${isUp ? '#10b981' : '#ef4444'};font-weight:600">${isUp ? 'Upward' : 'Downward'} trend</span>
                    </div>
                    ${predVals.length > 0 ? `<div style="font-size:11px;color:#64748b">Forecast (${predVals.length} periods): <strong style="color:${isUp ? '#10b981' : '#ef4444'}">${predVals.map(v => formatKpiVal(v)).join(', ')}</strong></div>` : ''}
                    <div style="font-size:11px;color:#94a3b8;margin-top:4px">R² = ${rSq.toFixed(3)} &middot; Slope: ${(reg.slope || 0).toFixed(2)}</div>
                    ${sheetLabel}
                </div>`;
            }).join('');

            // Anomalies — nested: [{sheet, column, anomalies:[{index,label,value,zScore,type,deviation}]}]
            const flatAnomalies = [];
            (pa.anomalies || []).forEach(group => {
                const col = group.column || group.metric || '';
                const sheet = group.sheet || '';
                (group.anomalies || []).forEach(a => {
                    flatAnomalies.push({ ...a, metric: col, sheet });
                });
                // Support flat anomaly objects too (from stored lightweight data)
                if (!group.anomalies && group.type) flatAnomalies.push(group);
            });
            const anomaliesHTML = flatAnomalies.slice(0, 6).map(a => {
                const isHigh = a.type === 'high';
                return `<div style="background:${isHigh ? '#fef2f210' : '#eff6ff10'};border:1px solid ${isHigh ? '#fecaca' : '#bfdbfe'};border-radius:8px;padding:10px 12px">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                        <span style="background:${isHigh ? '#ef4444' : '#3b82f6'};color:white;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600">${isHigh ? 'HIGH' : 'LOW'}</span>
                        <span style="font-weight:600;font-size:12px;color:#1e293b">${a.metric || ''}</span>
                    </div>
                    <div style="font-size:12px;color:#475569">${a.label || ''}: <strong>${formatKpiVal(a.value)}</strong>${a.zScore != null ? ` (z-score: ${a.zScore.toFixed(2)})` : ''}${a.deviation != null ? ` · ${a.deviation.toFixed(1)}σ deviation` : ''}</div>
                </div>`;
            }).join('');

            // Correlations — insights: [{col1, col2, correlation, strength, direction}]
            let correlationsHTML = '';
            if (pa.correlations && pa.correlations.insights && pa.correlations.insights.length > 0) {
                correlationsHTML = pa.correlations.insights.slice(0, 4).map(ci => {
                    const corrVal = ci.correlation != null ? ci.correlation : (ci.value || 0);
                    const absCorr = Math.abs(corrVal);
                    const color = absCorr > 0.7 ? '#10b981' : absCorr > 0.4 ? '#f59e0b' : '#94a3b8';
                    const c1 = ci.col1 || (ci.pair ? ci.pair[0] : '?');
                    const c2 = ci.col2 || (ci.pair ? ci.pair[1] : '?');
                    const strengthLabel = ci.strength ? `${ci.strength} ${ci.direction || ''}` : (ci.label || '');
                    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f8fafc;border-radius:8px">
                        <div style="width:40px;height:40px;border-radius:50%;background:${color}15;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:${color}">${corrVal.toFixed(2)}</div>
                        <div><div style="font-size:12px;font-weight:600;color:#1e293b">${c1} ↔ ${c2}</div><div style="font-size:11px;color:#64748b">${strengthLabel}</div></div>
                    </div>`;
                }).join('');
            }

            // Seasonality — single object {period, strength, label} not array
            let seasonHTML = '';
            if (pa.seasonality) {
                const s = Array.isArray(pa.seasonality) ? pa.seasonality : [pa.seasonality];
                seasonHTML = `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px">${s.map(item => `<span style="background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600"><i class="fas fa-wave-square"></i> ${item.label || 'Seasonal'} pattern (period: ${item.period || '?'}, strength: ${((item.strength || 0) * 100).toFixed(0)}%)</span>`).join('')}</div>`;
            }

            predictiveHTML = `
                <div style="margin:0 24px 24px;padding:20px;background:linear-gradient(135deg,#f8fafc,#eef2ff);border:1px solid #e0e7ff;border-radius:14px">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
                        <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center"><i class="fas fa-brain" style="color:white;font-size:14px"></i></div>
                        <div><h4 style="margin:0;font-size:15px;color:#1e293b">Predictive Analysis</h4><p style="margin:0;font-size:11px;color:#64748b">AI-powered insights from your data</p></div>
                    </div>
                    ${insightsHTML ? `<div style="margin-bottom:16px"><div style="font-weight:600;font-size:13px;color:#334155;margin-bottom:8px"><i class="fas fa-lightbulb" style="color:#f59e0b"></i> Key Insights</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px">${insightsHTML}</div></div>` : ''}
                    ${forecastsHTML ? `<div style="margin-bottom:16px"><div style="font-weight:600;font-size:13px;color:#334155;margin-bottom:8px"><i class="fas fa-chart-line" style="color:#6366f1"></i> Forecasts</div><div style="display:flex;flex-wrap:wrap;gap:10px">${forecastsHTML}</div></div>` : ''}
                    ${correlationsHTML ? `<div style="margin-bottom:16px"><div style="font-weight:600;font-size:13px;color:#334155;margin-bottom:8px"><i class="fas fa-project-diagram" style="color:#8b5cf6"></i> Correlations</div><div style="display:grid;gap:6px">${correlationsHTML}</div></div>` : ''}
                    ${anomaliesHTML ? `<div style="margin-bottom:12px"><div style="font-weight:600;font-size:13px;color:#334155;margin-bottom:8px"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i> Anomalies Detected</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px">${anomaliesHTML}</div></div>` : ''}
                    ${seasonHTML}
                </div>`;
        }

        const modalContent = `
            <div class="modal-body" style="max-width:960px;padding:0">
                <div class="adm-preview-header">
                    <div class="adm-preview-header-left">
                        <div class="adm-preview-icon"><i class="fas fa-chart-bar"></i></div>
                        <div>
                            <h3>${db.title || 'Dashboard Preview'}</h3>
                            <p>${db.description || 'Auto-generated dashboard'}</p>
                        </div>
                    </div>
                    <span class="ap-status-badge ap-status-${db.status}">
                        <i class="fas fa-${db.status === 'approved' ? 'check-circle' : db.status === 'rejected' ? 'times-circle' : 'hourglass-half'}"></i>
                        ${db.status.charAt(0).toUpperCase() + db.status.slice(1)}
                    </span>
                </div>
                <div class="adm-preview-info-bar">
                    <div class="adm-preview-info-item"><i class="fas fa-user"></i> <strong>${db.contractorName || 'Unknown'}</strong> <span>${db.contractorEmail || ''}</span></div>
                    <div class="adm-preview-info-item"><i class="fas fa-sync-alt"></i> ${db.frequency || 'monthly'}</div>
                    <div class="adm-preview-info-item"><i class="fas fa-chart-pie"></i> ${(db.charts || []).length || db.totalChartsGenerated || 0} charts</div>
                    <div class="adm-preview-info-item"><i class="fas fa-file-excel"></i> ${db.fileName || 'No file'}</div>
                    ${sheetBadge}
                    ${db.syncInterval && db.syncInterval !== 'manual' ? `<div class="adm-preview-info-item" style="color:#6366f1"><i class="fas fa-sync"></i> Auto-sync: ${db.syncInterval}</div>` : ''}
                    ${db.lastSyncedAt ? `<div class="adm-preview-info-item" style="color:#64748b"><i class="fas fa-clock"></i> Last synced: ${new Date(db.lastSyncedAt).toLocaleString()}</div>` : ''}
                    ${db.googleSheetUrl ? `<button onclick="adminSyncDashboard('${db._id}')" id="adm-sync-btn-${db._id}" style="background:#6366f1;color:white;border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:.75rem;display:flex;align-items:center;gap:5px"><i class="fas fa-sync-alt"></i> Sync Now</button>` : ''}
                </div>
                ${manualBadge}
                <div class="adm-preview-body">
                    ${hasCharts ? `
                        ${kpisHTML ? `<div class="adm-preview-kpi-grid">${kpisHTML}</div>` : ''}
                        <div class="adm-preview-charts">${chartsHTML}</div>
                    ` : `
                        <div class="adm-preview-no-charts">
                            <i class="fas fa-info-circle"></i>
                            <p>No auto-generated charts. ${db.googleSheetUrl ? 'Contractor submitted a Google Sheet link for manual processing.' : 'Add a manual dashboard link below.'}</p>
                        </div>
                    `}
                </div>
                ${predictiveHTML}
                ${db.status === 'pending' ? `
                <div class="adm-preview-actions-panel">
                    <div class="adm-preview-actions-title"><i class="fas fa-gavel"></i> Approve / Reject Dashboard</div>
                    <div class="adm-approve-options">
                        <div class="adm-approve-option">
                            <button class="adm-approve-btn adm-btn-approve-auto" onclick="approveDashboard('${db._id}')">
                                <i class="fas fa-magic"></i> ${hasCharts ? 'Approve Auto-Generated Dashboard' : 'Approve Dashboard'}
                            </button>
                            <small>${hasCharts ? 'Client will see the ' + (db.charts || []).length + ' auto-generated chart(s) above' : 'Dashboard will be approved. Add a manual link below if needed.'}</small>
                        </div>
                        <div class="adm-approve-divider"><span>OR ADD CUSTOM LINK</span></div>
                        <div class="adm-approve-option">
                            <div class="adm-manual-link-group">
                                <label><i class="fas fa-link"></i> Approve with Custom Dashboard URL</label>
                                <div class="adm-manual-input-row">
                                    <input type="url" id="adm-manual-url-${db._id}" class="adm-manual-input" placeholder="https://your-dashboard-url.vercel.app/..." value="${db.manualDashboardUrl || ''}">
                                    <button class="adm-approve-btn adm-btn-approve-manual" onclick="approveWithManualLink('${db._id}')">
                                        <i class="fas fa-check-circle"></i> Approve with Link
                                    </button>
                                </div>
                                <small>Client will view this custom URL instead of auto-generated charts</small>
                            </div>
                        </div>
                    </div>
                    <div class="adm-reject-row">
                        <button class="adm-approve-btn adm-btn-reject" onclick="rejectDashboard('${db._id}');closeModal()">
                            <i class="fas fa-times"></i> Reject Dashboard
                        </button>
                    </div>
                </div>
                ` : `
                <div class="adm-preview-actions-panel" style="text-align:center;padding:20px 28px">
                    <span class="ap-status-badge ap-status-${db.status}" style="font-size:.85rem;padding:8px 20px;margin-right:12px">
                        <i class="fas fa-${db.status === 'approved' ? 'check-circle' : 'times-circle'}"></i>
                        ${db.status === 'approved' ? 'Approved' : 'Rejected'}
                    </span>
                    <button class="btn btn-secondary" onclick="closeModal()" style="min-width:160px">Close Preview</button>
                </div>
                `}
            </div>
        `;
        showModal(modalContent);

        // Render charts after modal opens
        setTimeout(() => {
            (db.charts || []).forEach((chart, idx) => {
                const ctx = document.getElementById(`adm-preview-chart-${idx}`);
                if (!ctx || typeof Chart === 'undefined') return;
                const isCirc = ['doughnut','pie','polarArea'].includes(chart.chartType);
                const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#22c55e'];
                const datasets = (chart.datasets || []).map((ds, di) => {
                    const dsData = ds.data || [];
                    if (isCirc) return { label: ds.label || '', data: dsData, backgroundColor: dsData.map((_, i) => colors[i % colors.length] + 'DD'), hoverBackgroundColor: dsData.map((_, i) => colors[i % colors.length]), borderWidth: 3, borderColor: '#fff', hoverOffset: 8 };
                    return { label: ds.label || '', data: dsData, borderColor: colors[di % colors.length],
                        backgroundColor: chart.chartType === 'bar' ? colors[di % colors.length] + 'CC' : colors[di % colors.length] + '15',
                        borderWidth: 3, tension: 0.4, fill: chart.chartType === 'line', borderRadius: chart.chartType === 'bar' ? 8 : 0, pointRadius: chart.chartType === 'line' ? 4 : 0, pointHoverRadius: 7, barPercentage: 0.7 };
                });
                if (adminDashboardCharts[idx]) adminDashboardCharts[idx].destroy();
                adminDashboardCharts[idx] = new Chart(ctx, {
                    type: chart.chartType || 'bar',
                    data: { labels: chart.labels || [], datasets },
                    options: { responsive: true, maintainAspectRatio: false,
                        animation: { duration: 800, easing: 'easeOutQuart' },
                        plugins: { legend: { position: isCirc ? 'right' : 'top', labels: { usePointStyle: true, padding: 16, font: { weight: '600' } } },
                            tooltip: { backgroundColor: 'rgba(15,23,42,.95)', titleFont: { size: 13, weight: '700' }, bodyFont: { size: 12 }, padding: 14, cornerRadius: 10 } },
                        ...(!isCirc ? { scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { size: 11 }, callback: v => formatKpiVal(v) } } } } : {})
                    }
                });
            });
        }, 300);
    } catch (error) {
        console.error('Preview error:', error);
        showNotification('Failed to load dashboard preview', 'error');
    }
}

function formatKpiVal(val) {
    if (val === null || val === undefined) return '0';
    const num = parseFloat(val);
    if (isNaN(num)) return String(val);
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + 'K';
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toFixed(2);
}

async function adminSyncDashboard(id) {
    const btn = document.getElementById(`adm-sync-btn-${id}`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Syncing...'; }
    try {
        const result = await apiCall(`/dashboards/${id}/sync`, 'POST');
        showNotification(result.dataChanged
            ? 'Dashboard synced! Charts updated with latest data.'
            : 'Sync complete — no changes detected.',
            result.dataChanged ? 'success' : 'info'
        );
        if (result.dataChanged) {
            closeModal();
            await loadAnalysisPortalData();
        }
    } catch (error) {
        showNotification('Failed to sync: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync Now'; }
    }
}

async function approveDashboard(id) {
    if (!confirm('Approve this auto-generated dashboard? The client will be able to view the charts immediately.')) return;
    try {
        await apiCall(`/dashboards/${id}/approve`, 'POST', {});
        showNotification('Dashboard approved with auto-generated charts! Client can now view it.', 'success');
        closeModal();
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to approve dashboard', 'error');
    }
}

async function approveWithManualLink(id) {
    const input = document.getElementById(`adm-manual-url-${id}`);
    const url = input ? input.value.trim() : '';
    if (!url) {
        showNotification('Please enter a dashboard URL', 'error');
        if (input) input.focus();
        return;
    }
    if (!url.startsWith('http')) {
        showNotification('Please enter a valid URL starting with http:// or https://', 'error');
        return;
    }
    if (!confirm('Approve with manual link? The client will view this URL instead of the auto-generated dashboard.')) return;
    try {
        await apiCall(`/dashboards/${id}/approve`, 'POST', { manualDashboardUrl: url });
        showNotification('Dashboard approved with manual link! Client will see the custom URL.', 'success');
        closeModal();
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to approve dashboard', 'error');
    }
}

async function rejectDashboard(id) {
    const reason = prompt('Enter rejection reason (optional):');
    try {
        await apiCall(`/dashboards/${id}/reject`, 'POST', { reason: reason || '' });
        showNotification('Dashboard rejected', 'info');
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to reject dashboard', 'error');
    }
}

async function deleteDashboard(id) {
    if (!confirm('Delete this dashboard permanently?')) return;
    try {
        await apiCall(`/dashboards/${id}`, 'DELETE');
        showNotification('Dashboard deleted', 'success');
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to delete dashboard', 'error');
    }
}

async function deleteAnalysisRequest(requestId) {
    if (!confirm('Delete this analysis request?')) return;
    try {
        await apiCall(`/business-analytics/request/${requestId}`, 'DELETE');
        showNotification('Request deleted', 'success');
        await loadAnalysisPortalData();
    } catch (error) {
        showNotification('Failed to delete request', 'error');
    }
}

function filterAnalysisRequests(status) {
    state.analysisFilterStatus = status;
    renderAnalysisPortalTab();
}

// === ANALYSIS STATS FOR DASHBOARD ===
async function loadAnalysisStats() {
    try {
        const response = await apiCall('/business-analytics/stats', 'GET');
        return response.stats || { total: 0, pending: 0, completed: 0 };
    } catch (error) {
        console.error('Failed to load analysis stats:', error);
        return { total: 0, pending: 0, completed: 0 };
    }
}

// ==========================================
// SYSTEM ADMIN - MASTER DATA CONTROL
// ==========================================
const SA_COLLECTION_ICONS = {
    users: 'fa-users', jobs: 'fa-briefcase', quotes: 'fa-file-invoice-dollar',
    estimations: 'fa-calculator', messages: 'fa-envelope', conversations: 'fa-comments',
    support_tickets: 'fa-headset', analysis_requests: 'fa-chart-line', notifications: 'fa-bell'
};
const SA_COLLECTION_COLORS = {
    users: '#3b82f6', jobs: '#10b981', quotes: '#f59e0b',
    estimations: '#8b5cf6', messages: '#ec4899', conversations: '#06b6d4',
    support_tickets: '#ef4444', analysis_requests: '#14b8a6', notifications: '#6366f1'
};

// Invalidate cached state for a System Admin collection key so other tabs reload fresh data
function invalidateStateForCollection(collectionKey) {
    const stateKeyMap = {
        users: 'users',
        jobs: 'jobs',
        quotes: 'quotes',
        estimations: 'estimations',
        messages: 'messages',
        conversations: 'conversations',
        support_tickets: 'supportMessages',
        analysis_requests: 'contractorRequests',
        notifications: null
    };
    const stateKey = stateKeyMap[collectionKey];
    if (stateKey && state[stateKey]) {
        state[stateKey] = [];
    }
    // Also clear profile reviews if users are affected
    if (collectionKey === 'users') {
        state.profileReviews = [];
    }
}

async function loadSystemAdminOverview() {
    const container = document.getElementById('system-admin-tab');
    showLoader(container);
    try {
        const response = await apiCall('/system-admin/overview');
        renderSystemAdminTab(response.data);
    } catch (error) {
        container.innerHTML = `<div class="sa-error"><p>Failed to load System Admin data.</p><button class="btn" onclick="loadSystemAdminOverview()">Retry</button></div>`;
    }
}

function renderSystemAdminTab(overview) {
    const container = document.getElementById('system-admin-tab');
    const cards = Object.entries(overview).map(([key, info]) => {
        const icon = SA_COLLECTION_ICONS[key] || 'fa-database';
        const color = SA_COLLECTION_COLORS[key] || '#64748b';
        return `<div class="sa-collection-card" onclick="loadSystemAdminCollection('${key}')" style="--sa-color:${color}">
            <div class="sa-card-icon"><i class="fas ${icon}"></i></div>
            <div class="sa-card-info">
                <h4>${info.label}</h4>
                <div class="sa-card-counts">
                    <span class="sa-count-live"><i class="fas fa-circle"></i> ${info.total} active</span>
                    ${info.held > 0 ? `<span class="sa-count-held"><i class="fas fa-snowflake"></i> ${info.held} on hold</span>` : ''}
                    <span class="sa-count-trash"><i class="fas fa-trash"></i> ${info.deleted} in trash</span>
                </div>
            </div>
            <i class="fas fa-chevron-right sa-card-arrow"></i>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="sa-header">
            <div class="sa-header-left">
                <div class="sa-shield"><i class="fas fa-skull-crossbones"></i></div>
                <div>
                    <h2>System Admin Control Center</h2>
                    <p>Full access to delete, restore, and manage all portal data. Deleted items are moved to trash and can be retrieved.</p>
                </div>
            </div>
            <div class="sa-header-actions">
                <button class="btn" onclick="loadSystemAdminOverview()"><i class="fas fa-sync-alt"></i> Refresh</button>
                <button class="btn btn-danger-outline" onclick="viewSystemTrash()"><i class="fas fa-trash-restore"></i> View Trash</button>
            </div>
        </div>
        <div class="sa-overview-grid">${cards}</div>
        <div id="sa-detail-section"></div>`;
}

async function loadSystemAdminCollection(collectionKey) {
    state.systemAdminActiveCollection = collectionKey;
    state.systemAdminView = 'live';
    state.systemAdminSelectedIds = [];
    const detail = document.getElementById('sa-detail-section');
    if (!detail) return;
    detail.innerHTML = `<div class="sa-loading"><div class="spinner"></div> Loading data...</div>`;
    detail.scrollIntoView({ behavior: 'smooth' });
    try {
        const response = await apiCall(`/system-admin/data/${collectionKey}?limit=200`);
        state.systemAdminData = response.data || [];
        renderSystemAdminDetail(collectionKey, response.collection, response.total);
    } catch (error) {
        detail.innerHTML = `<div class="sa-error"><p>Failed to load data.</p></div>`;
    }
}

function renderSystemAdminDetail(key, label, total) {
    const detail = document.getElementById('sa-detail-section');
    const items = state.systemAdminData;
    const color = SA_COLLECTION_COLORS[key] || '#64748b';
    const icon = SA_COLLECTION_ICONS[key] || 'fa-database';

    const rows = items.map(item => {
        const displayFields = getItemDisplayFields(key, item);
        return `<tr id="sa-row-${item._id}" class="${item._held ? 'sa-row-held' : ''}">
            <td><input type="checkbox" class="sa-check" data-id="${item._id}" onchange="toggleSASelect('${item._id}')"></td>
            <td><code class="sa-id">${(item._id || '').substring(0, 10)}...</code></td>
            ${displayFields.map(f => `<td>${f}</td>`).join('')}
            <td class="sa-actions">
                <button class="btn btn-sm" onclick="viewSAItemDetail('${key}', '${item._id}')" title="View Details"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm ${item._held ? 'btn-held-active' : 'btn-hold'}" onclick="${item._held ? `unholdSAItem('${key}','${item._id}')` : `holdSAItem('${key}','${item._id}')`}" title="${item._held ? 'Release Hold' : 'Hold/Freeze'}"><i class="fas fa-snowflake"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteSAItem('${key}', '${item._id}')" title="Move to Trash"><i class="fas fa-trash"></i></button>
                <button class="btn btn-sm btn-perma-delete" onclick="permanentDeleteLiveSAItem('${key}', '${item._id}')" title="Permanent Delete"><i class="fas fa-skull-crossbones"></i></button>
            </td>
        </tr>`;
    }).join('');

    const headers = getItemHeaders(key);

    detail.innerHTML = `
        <div class="sa-detail-header" style="border-left:4px solid ${color}">
            <div class="sa-detail-title">
                <i class="fas ${icon}" style="color:${color}"></i>
                <h3>${label} <span class="sa-total-badge">${total} total</span></h3>
            </div>
            <div class="sa-detail-actions">
                <input type="text" class="sa-search-input" placeholder="Search..." oninput="searchSACollection('${key}', this.value)">
                <button class="btn btn-danger btn-sm" id="sa-bulk-delete-btn" style="display:none" onclick="bulkDeleteSA('${key}')"><i class="fas fa-trash"></i> Delete Selected (<span id="sa-bulk-count">0</span>)</button>
                <button class="btn btn-sm" onclick="loadSystemAdminCollection('${key}')"><i class="fas fa-sync-alt"></i></button>
            </div>
        </div>
        <div class="sa-table-wrapper">
            <table class="sa-table">
                <thead><tr><th><input type="checkbox" onchange="toggleSASelectAll(this)"></th><th>ID</th>${headers.map(h => `<th>${h}</th>`).join('')}<th>Actions</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="99" class="sa-empty">No items found</td></tr>'}</tbody>
            </table>
        </div>`;
}

function getItemHeaders(key) {
    const map = {
        users: ['Name', 'Email', 'Type', 'Status'],
        jobs: ['Title', 'Client', 'Budget', 'Status'],
        quotes: ['Designer', 'Job', 'Amount', 'Status'],
        estimations: ['Title', 'Contractor', 'Status', 'Files'],
        messages: ['From', 'Subject', 'Date', 'Status'],
        conversations: ['Participants', 'Job', 'Messages', 'Updated'],
        support_tickets: ['Subject', 'User', 'Priority', 'Status'],
        analysis_requests: ['Contractor', 'Type', 'Status', 'Date'],
        notifications: ['User', 'Type', 'Message', 'Read']
    };
    return map[key] || ['Field 1', 'Field 2', 'Field 3', 'Field 4'];
}

function getItemDisplayFields(key, item) {
    const safeStr = (v, max = 30) => v ? String(v).substring(0, max) : '<span class="sa-na">N/A</span>';
    const statusBadge = (s) => `<span class="status ${s || 'unknown'}">${s || 'N/A'}</span>`;
    const dateStr = (d) => formatAdminDate(d);
    const heldBadge = item._held ? ' <span class="sa-held-badge"><i class="fas fa-snowflake"></i> HELD</span>' : '';

    const map = {
        users: [safeStr(item.name) + heldBadge, safeStr(item.email, 25), statusBadge(item.type), statusBadge(item.profileStatus || (item.canAccess === false ? 'blocked' : 'active'))],
        jobs: [safeStr(item.title, 35) + heldBadge, safeStr(item.posterName), safeStr(item.budget), statusBadge(item.status)],
        quotes: [safeStr(item.designerName) + heldBadge, safeStr(item.jobTitle, 25), `$${item.quoteAmount || 0}`, statusBadge(item.status)],
        estimations: [safeStr(item.projectTitle, 30) + heldBadge, safeStr(item.contractorName), statusBadge(item.status), `${(item.uploadedFiles || []).length} files`],
        messages: [safeStr(item.name || item.email) + heldBadge, safeStr(item.subject, 30), dateStr(item.createdAt), statusBadge(item.status || (item.read ? 'read' : 'unread'))],
        conversations: [safeStr((item.participants || []).join(', '), 30) + heldBadge, safeStr(item.jobTitle, 20), `${item.messageCount || '?'}`, dateStr(item.updatedAt || item.lastMessageAt)],
        support_tickets: [safeStr(item.subject, 30) + heldBadge, safeStr(item.userName || item.userEmail), statusBadge(item.priority), statusBadge(item.status)],
        analysis_requests: [safeStr(item.contractorName) + heldBadge, safeStr(item.dataType), statusBadge(item.status), dateStr(item.createdAt)],
        notifications: [safeStr(item.userId, 15) + heldBadge, safeStr(item.type), safeStr(item.message, 30), item.read ? 'Yes' : 'No']
    };
    return map[key] || [safeStr(item._id) + heldBadge, '', '', ''];
}

function toggleSASelect(docId) {
    const idx = state.systemAdminSelectedIds.indexOf(docId);
    if (idx > -1) state.systemAdminSelectedIds.splice(idx, 1);
    else state.systemAdminSelectedIds.push(docId);
    const bulkBtn = document.getElementById('sa-bulk-delete-btn');
    const bulkCount = document.getElementById('sa-bulk-count');
    if (bulkBtn) bulkBtn.style.display = state.systemAdminSelectedIds.length > 0 ? 'inline-flex' : 'none';
    if (bulkCount) bulkCount.textContent = state.systemAdminSelectedIds.length;
}

function toggleSASelectAll(checkbox) {
    const checks = document.querySelectorAll('.sa-check');
    state.systemAdminSelectedIds = [];
    checks.forEach(c => {
        c.checked = checkbox.checked;
        if (checkbox.checked) state.systemAdminSelectedIds.push(c.dataset.id);
    });
    const bulkBtn = document.getElementById('sa-bulk-delete-btn');
    const bulkCount = document.getElementById('sa-bulk-count');
    if (bulkBtn) bulkBtn.style.display = state.systemAdminSelectedIds.length > 0 ? 'inline-flex' : 'none';
    if (bulkCount) bulkCount.textContent = state.systemAdminSelectedIds.length;
}

async function searchSACollection(key, query) {
    if (!query || query.length < 2) {
        if (!query) loadSystemAdminCollection(key);
        return;
    }
    try {
        const response = await apiCall(`/system-admin/data/${key}?search=${encodeURIComponent(query)}&limit=100`);
        state.systemAdminData = response.data || [];
        renderSystemAdminDetail(key, response.collection, response.total);
    } catch (e) { /* ignore search errors */ }
}

function viewSAItemDetail(key, docId) {
    const item = state.systemAdminData.find(i => i._id === docId) || state.systemAdminTrash.find(i => i._id === docId);
    if (!item) return;
    const entries = Object.entries(item).filter(([k]) => !k.startsWith('_')).map(([k, v]) => {
        let displayVal = v;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            if (v._seconds) displayVal = new Date(v._seconds * 1000).toLocaleString();
            else if (v.seconds) displayVal = new Date(v.seconds * 1000).toLocaleString();
            else if (v.url) displayVal = `<a href="${v.url}" target="_blank">View File</a> (${v.filename || 'file'})`;
            else displayVal = `<pre>${JSON.stringify(v, null, 2).substring(0, 300)}</pre>`;
        } else if (Array.isArray(v)) {
            displayVal = v.length > 0 ? `<span class="sa-array-badge">${v.length} item(s)</span> <details><summary>View</summary><pre>${JSON.stringify(v, null, 2).substring(0, 500)}</pre></details>` : '<em>Empty</em>';
        } else if (typeof v === 'string' && v.length > 100) {
            displayVal = `<details><summary>${v.substring(0, 80)}...</summary><p>${v}</p></details>`;
        }
        return `<tr><td class="sa-detail-key">${k}</td><td class="sa-detail-val">${displayVal ?? '<em>null</em>'}</td></tr>`;
    }).join('');

    const isTrash = !!item._deletedAt;
    const isHeld = !!item._held;
    let actionBtns;
    if (isTrash) {
        actionBtns = `<button class="btn btn-primary" onclick="restoreSAItem('${docId}');closeModal()"><i class="fas fa-undo"></i> Restore</button><button class="btn btn-danger" onclick="permanentDeleteSAItem('${docId}');closeModal()"><i class="fas fa-fire"></i> Permanent Delete</button>`;
    } else {
        actionBtns = `<button class="btn ${isHeld ? 'btn-held-active' : 'btn-hold'}" onclick="${isHeld ? `unholdSAItem('${key}','${docId}');closeModal()` : `holdSAItem('${key}','${docId}');closeModal()`}"><i class="fas fa-snowflake"></i> ${isHeld ? 'Release Hold' : 'Hold/Freeze'}</button>` +
            `<button class="btn btn-danger" onclick="deleteSAItem('${key}', '${docId}');closeModal()"><i class="fas fa-trash"></i> Move to Trash</button>` +
            `<button class="btn btn-perma-delete" onclick="closeModal();permanentDeleteLiveSAItem('${key}', '${docId}')"><i class="fas fa-skull-crossbones"></i> Permanent Delete</button>`;
    }

    showModal(`
        <div class="sa-modal-detail">
            <h3><i class="fas ${SA_COLLECTION_ICONS[key] || 'fa-database'}"></i> ${isTrash ? 'Trash Item' : 'Item'} Details</h3>
            <p class="sa-modal-id">ID: <code>${docId}</code></p>
            ${isTrash ? `<p class="sa-trash-info"><i class="fas fa-trash"></i> Deleted on ${item._deletedAt} by ${item._deletedBy || 'Unknown'}</p>` : ''}
            ${isHeld ? `<p class="sa-held-info"><i class="fas fa-snowflake"></i> ON HOLD — Frozen on ${item._heldAt || 'N/A'} by ${item._heldBy || 'Unknown'}</p>` : ''}
            <div class="sa-detail-table-wrap"><table class="sa-detail-table">${entries}</table></div>
            <div class="sa-modal-actions">${actionBtns}<button class="btn" onclick="closeModal()">Close</button></div>
        </div>`);
}

async function deleteSAItem(key, docId) {
    if (!confirm('Are you sure you want to delete this item? It will be moved to trash and can be restored later.')) return;
    try {
        await apiCall(`/system-admin/data/${key}/${docId}`, 'DELETE');
        showNotification('Item deleted and moved to trash.', 'success');
        const row = document.getElementById(`sa-row-${docId}`);
        if (row) row.remove();
        state.systemAdminData = state.systemAdminData.filter(i => i._id !== docId);
        invalidateStateForCollection(key);
    } catch (error) {
        showNotification('Failed to delete item.', 'error');
    }
}

async function bulkDeleteSA(key) {
    const count = state.systemAdminSelectedIds.length;
    if (!confirm(`Are you sure you want to delete ${count} item(s)? They will be moved to trash.`)) return;
    try {
        await apiCall(`/system-admin/bulk-delete/${key}`, 'POST', { docIds: state.systemAdminSelectedIds });
        showNotification(`${count} item(s) deleted.`, 'success');
        state.systemAdminSelectedIds = [];
        invalidateStateForCollection(key);
        loadSystemAdminCollection(key);
    } catch (error) {
        showNotification('Bulk delete failed.', 'error');
    }
}

async function viewSystemTrash(collectionKey) {
    state.systemAdminView = 'trash';
    const detail = document.getElementById('sa-detail-section');
    if (!detail) return;
    detail.innerHTML = `<div class="sa-loading"><div class="spinner"></div> Loading trash...</div>`;
    detail.scrollIntoView({ behavior: 'smooth' });
    try {
        const url = collectionKey ? `/system-admin/trash?collectionKey=${collectionKey}` : '/system-admin/trash';
        const response = await apiCall(url);
        state.systemAdminTrash = response.data || [];
        renderTrashView(collectionKey);
    } catch (error) {
        detail.innerHTML = `<div class="sa-error"><p>Failed to load trash.</p></div>`;
    }
}

function renderTrashView(filterKey) {
    const detail = document.getElementById('sa-detail-section');
    const items = state.systemAdminTrash;

    const rows = items.map(item => {
        const key = item._collectionKey || 'unknown';
        const icon = SA_COLLECTION_ICONS[key] || 'fa-file';
        const color = SA_COLLECTION_COLORS[key] || '#64748b';
        const label = item._collection || key;
        const title = item.title || item.name || item.subject || item.projectTitle || item.designerName || item.contractorName || item._originalId || item._id;
        return `<tr>
            <td><span class="sa-trash-type" style="color:${color}"><i class="fas ${icon}"></i> ${label}</span></td>
            <td><strong>${String(title).substring(0, 40)}</strong><br><code class="sa-id">${(item._originalId || item._id || '').substring(0, 12)}</code></td>
            <td>${item._deletedAt ? new Date(item._deletedAt).toLocaleString() : 'N/A'}</td>
            <td>${item._deletedBy || 'N/A'}</td>
            <td class="sa-actions">
                <button class="btn btn-sm btn-primary" onclick="restoreSAItem('${item._id}')"><i class="fas fa-undo"></i> Restore</button>
                <button class="btn btn-sm" onclick="viewSAItemDetail('${key}', '${item._id}')"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm btn-danger" onclick="permanentDeleteSAItem('${item._id}')"><i class="fas fa-fire"></i></button>
            </td>
        </tr>`;
    }).join('');

    detail.innerHTML = `
        <div class="sa-detail-header sa-trash-header">
            <div class="sa-detail-title">
                <i class="fas fa-trash-restore" style="color:#ef4444"></i>
                <h3>Trash <span class="sa-total-badge">${items.length} item(s)</span></h3>
            </div>
            <div class="sa-detail-actions">
                <select class="sa-filter-select" onchange="viewSystemTrash(this.value || undefined)">
                    <option value="">All Collections</option>
                    <option value="users" ${filterKey === 'users' ? 'selected' : ''}>Users</option>
                    <option value="jobs" ${filterKey === 'jobs' ? 'selected' : ''}>Projects</option>
                    <option value="quotes" ${filterKey === 'quotes' ? 'selected' : ''}>Quotes</option>
                    <option value="estimations" ${filterKey === 'estimations' ? 'selected' : ''}>Estimations</option>
                    <option value="messages" ${filterKey === 'messages' ? 'selected' : ''}>Messages</option>
                    <option value="conversations" ${filterKey === 'conversations' ? 'selected' : ''}>Conversations</option>
                    <option value="support_tickets" ${filterKey === 'support_tickets' ? 'selected' : ''}>Support Tickets</option>
                    <option value="analysis_requests" ${filterKey === 'analysis_requests' ? 'selected' : ''}>Analysis Requests</option>
                </select>
                ${items.length > 0 ? `<button class="btn btn-danger btn-sm" onclick="emptyTrash('${filterKey || ''}')"><i class="fas fa-fire"></i> Empty Trash</button>` : ''}
                <button class="btn btn-sm" onclick="loadSystemAdminOverview()"><i class="fas fa-arrow-left"></i> Back</button>
            </div>
        </div>
        <div class="sa-table-wrapper">
            <table class="sa-table">
                <thead><tr><th>Collection</th><th>Item</th><th>Deleted At</th><th>Deleted By</th><th>Actions</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" class="sa-empty">Trash is empty</td></tr>'}</tbody>
            </table>
        </div>`;
}

async function restoreSAItem(docId) {
    if (!confirm('Restore this item back to its original collection?')) return;
    try {
        // Find the collection key for invalidation
        const trashItem = state.systemAdminTrash.find(i => i._id === docId);
        await apiCall(`/system-admin/restore/${docId}`, 'POST');
        showNotification('Item restored successfully!', 'success');
        state.systemAdminTrash = state.systemAdminTrash.filter(i => i._id !== docId);
        // Invalidate the restored collection so other tabs reflect the change
        if (trashItem && trashItem._collectionKey) {
            invalidateStateForCollection(trashItem._collectionKey);
        }
        if (state.systemAdminView === 'trash') renderTrashView();
        else loadSystemAdminOverview();
    } catch (error) {
        showNotification('Failed to restore item.', 'error');
    }
}

async function permanentDeleteSAItem(docId) {
    if (!confirm('PERMANENTLY delete this item? This action CANNOT be undone. All associated files will also be deleted.')) return;
    try {
        await apiCall(`/system-admin/trash/${docId}`, 'DELETE');
        showNotification('Item permanently deleted.', 'success');
        state.systemAdminTrash = state.systemAdminTrash.filter(i => i._id !== docId);
        if (state.systemAdminView === 'trash') renderTrashView();
    } catch (error) {
        showNotification('Failed to permanently delete.', 'error');
    }
}

// Hold/Freeze an item
async function holdSAItem(key, docId) {
    if (!confirm('Hold/Freeze this item? It will be frozen and marked as on hold.')) return;
    try {
        await apiCall(`/system-admin/hold/${key}/${docId}`, 'POST');
        showNotification('Item frozen successfully!', 'success');
        // Update local state
        const item = state.systemAdminData.find(i => i._id === docId);
        if (item) {
            item._held = true;
            item._heldAt = new Date().toISOString();
        }
        invalidateStateForCollection(key);
        // Re-render current view
        if (state.systemAdminView === 'overview') loadSystemAdminOverview();
        else loadSystemAdminCollection(key);
    } catch (error) {
        showNotification('Failed to hold/freeze item.', 'error');
    }
}

// Unhold/Unfreeze an item
async function unholdSAItem(key, docId) {
    if (!confirm('Release hold on this item? It will be unfrozen and back to normal.')) return;
    try {
        await apiCall(`/system-admin/unhold/${key}/${docId}`, 'POST');
        showNotification('Item released from hold!', 'success');
        // Update local state
        const item = state.systemAdminData.find(i => i._id === docId);
        if (item) {
            delete item._held;
            delete item._heldAt;
            delete item._heldBy;
        }
        invalidateStateForCollection(key);
        // Re-render current view
        if (state.systemAdminView === 'overview') loadSystemAdminOverview();
        else loadSystemAdminCollection(key);
    } catch (error) {
        showNotification('Failed to release hold.', 'error');
    }
}

// Permanent Delete from live data - requires password 9666
async function permanentDeleteLiveSAItem(key, docId) {
    showModal(`
        <div class="sa-modal-detail">
            <h3 style="color: #dc2626;"><i class="fas fa-skull-crossbones"></i> Permanent Delete</h3>
            <p style="color: #b91c1c; margin: 12px 0;">This will <strong>permanently destroy</strong> this item and all associated files. This action <strong>CANNOT</strong> be undone.</p>
            <div style="margin: 16px 0;">
                <label style="display: block; font-size: 0.85rem; color: #6b7280; margin-bottom: 6px;">Enter System Admin Password to confirm:</label>
                <input type="password" id="perma-delete-password" placeholder="Enter password..."
                    style="width: 100%; padding: 10px 14px; background: #f9fafb; border: 1px solid #d1d5db; border-radius: 8px; color: #1f2937; font-size: 0.95rem;"
                    onkeydown="if(event.key==='Enter')confirmPermanentDelete('${key}','${docId}')" autofocus />
            </div>
            <div class="sa-modal-actions">
                <button class="btn" onclick="closeModal()">Cancel</button>
                <button class="btn btn-perma-delete" onclick="confirmPermanentDelete('${key}','${docId}')">
                    <i class="fas fa-skull-crossbones"></i> Permanently Destroy
                </button>
            </div>
        </div>
    `);
    setTimeout(() => { const inp = document.getElementById('perma-delete-password'); if (inp) inp.focus(); }, 100);
}

async function confirmPermanentDelete(key, docId) {
    const passwordInput = document.getElementById('perma-delete-password');
    const password = passwordInput ? passwordInput.value : '';
    if (!password) {
        showNotification('Password is required for permanent delete.', 'error');
        return;
    }
    try {
        await apiCall(`/system-admin/permanent-delete/${key}/${docId}`, 'POST', { password });
        closeModal();
        showNotification('Item permanently destroyed!', 'success');
        state.systemAdminData = state.systemAdminData.filter(i => i._id !== docId);
        invalidateStateForCollection(key);
        if (state.systemAdminView === 'overview') loadSystemAdminOverview();
        else loadSystemAdminCollection(key);
    } catch (error) {
        showNotification(error.message || 'Failed to permanently delete. Check password.', 'error');
    }
}

async function emptyTrash(collectionKey) {
    const msg = collectionKey ? `Empty ALL trash items for this collection?` : 'Empty ALL trash items across ALL collections?';
    if (!confirm(msg + ' This CANNOT be undone.')) return;
    try {
        const url = collectionKey ? `/system-admin/trash-empty?collectionKey=${collectionKey}` : '/system-admin/trash-empty';
        const response = await apiCall(url, 'DELETE');
        showNotification(response.message, 'success');
        viewSystemTrash(collectionKey || undefined);
    } catch (error) {
        showNotification('Failed to empty trash.', 'error');
    }
}

function closeModal() {
    const modal = document.getElementById('modal-container');
    if (modal) modal.innerHTML = '';
}

// --- COMMUNITY FEED MODERATION ---

async function loadCommunityPostsData() {
    const container = document.getElementById('community-feed-tab');
    showLoader(container);
    try {
        const response = await apiCall('/community-posts');
        state.communityPosts = response.posts || [];
        renderCommunityFeedTab();

        // Update sidebar badge
        const pendingCount = state.communityPosts.filter(p => p.status === 'pending').length;
        const badge = document.getElementById('communityPendingBadge');
        if (badge) badge.textContent = pendingCount > 0 ? pendingCount : '';
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load community posts.</p>
            <button class="btn" onclick="loadCommunityPostsData()">Retry</button>`;
    }
}

function renderCommunityFeedTab() {
    const container = document.getElementById('community-feed-tab');
    const pending = state.communityPosts.filter(p => p.status === 'pending');
    const approved = state.communityPosts.filter(p => p.status === 'approved');
    const rejected = state.communityPosts.filter(p => p.status === 'rejected');

    container.innerHTML = `
        <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
            <h3 style="margin:0;">Community Feed Moderation</h3>
            <button class="btn btn-sm" onclick="loadCommunityPostsData()"><i class="fas fa-sync"></i> Refresh</button>
        </div>

        <div style="display:flex;gap:0.75rem;margin-bottom:1.5rem;flex-wrap:wrap;">
            <span class="status-badge" style="background:#fef3c7;color:#92400e;padding:6px 14px;border-radius:20px;font-weight:600;">${pending.length} Pending</span>
            <span class="status-badge" style="background:#d1fae5;color:#065f46;padding:6px 14px;border-radius:20px;font-weight:600;">${approved.length} Approved</span>
            <span class="status-badge" style="background:#fee2e2;color:#991b1b;padding:6px 14px;border-radius:20px;font-weight:600;">${rejected.length} Rejected</span>
        </div>

        <h4 style="margin-bottom:1rem;color:#1e293b;">Pending Review (${pending.length})</h4>
        ${pending.length === 0 ? '<p style="color:#64748b;">No posts pending review.</p>' : `
        <div class="profile-reviews-grid" style="margin-bottom:2rem;">
            ${pending.map(post => renderCommunityPostCard(post)).join('')}
        </div>`}

        <h4 style="margin-top:2rem;margin-bottom:1rem;color:#1e293b;">Approved Posts (${approved.length})</h4>
        ${approved.length === 0 ? '<p style="color:#64748b;">No approved posts.</p>' : `
        <div class="profile-reviews-grid" style="margin-bottom:2rem;">
            ${approved.slice(0, 20).map(post => renderCommunityPostCard(post)).join('')}
        </div>`}

        <h4 style="margin-top:2rem;margin-bottom:1rem;color:#1e293b;">Rejected Posts (${rejected.length})</h4>
        ${rejected.length === 0 ? '<p style="color:#64748b;">No rejected posts.</p>' : `
        <div class="profile-reviews-grid">
            ${rejected.slice(0, 10).map(post => renderCommunityPostCard(post)).join('')}
        </div>`}
    `;
}

function renderCommunityPostCard(post) {
    const statusColors = {
        pending: { bg: '#fef3c7', color: '#92400e' },
        approved: { bg: '#d1fae5', color: '#065f46' },
        rejected: { bg: '#fee2e2', color: '#991b1b' }
    };
    const sc = statusColors[post.status] || statusColors.pending;
    const contentPreview = sanitizeInput((post.content || '').substring(0, 200));
    const imageCount = (post.images || []).length;
    const commentCount = (post.comments || []).length;
    const authorTypeBadge = post.authorType === 'designer'
        ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">Designer</span>'
        : '<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">Contractor</span>';

    return `
        <div class="review-card" style="padding:1.25rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
                <div>
                    <h4 style="margin:0 0 4px 0;font-size:15px;">${sanitizeInput(post.authorName || 'Unknown')} ${authorTypeBadge}</h4>
                    <small style="color:#64748b;">${post.authorEmail || ''}</small>
                </div>
                <span style="background:${sc.bg};color:${sc.color};padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;text-transform:uppercase;">${post.status}</span>
            </div>
            <p style="color:#334155;margin:0.5rem 0;line-height:1.5;white-space:pre-wrap;">${contentPreview}${post.content && post.content.length > 200 ? '...' : ''}</p>
            ${imageCount > 0 ? `<p style="color:#64748b;font-size:13px;"><i class="fas fa-images"></i> ${imageCount} image(s)</p>` : ''}
            <p style="color:#64748b;font-size:13px;margin:4px 0;">
                <i class="fas fa-heart"></i> ${post.likes || 0} likes &nbsp;
                <i class="fas fa-comment"></i> ${commentCount} comments
            </p>
            <small style="color:#94a3b8;">Posted: ${new Date(post.createdAt).toLocaleString()}</small>
            ${post.adminReviewedBy ? `<br><small style="color:#94a3b8;">Reviewed by: ${post.adminReviewedBy}</small>` : ''}
            <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;">
                <button class="btn btn-sm btn-outline" onclick="viewCommunityPostDetail('${post._id}')"><i class="fas fa-eye"></i> View</button>
                ${post.status === 'pending' ? `
                    <button class="btn btn-sm btn-success" onclick="approveCommunityPost('${post._id}')"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn btn-sm btn-danger" onclick="rejectCommunityPost('${post._id}')"><i class="fas fa-times"></i> Reject</button>
                ` : ''}
                <button class="btn btn-sm btn-danger" onclick="deleteCommunityPostAdmin('${post._id}')"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>`;
}

function viewCommunityPostDetail(postId) {
    const post = state.communityPosts.find(p => p._id === postId);
    if (!post) return showNotification('Post not found.', 'error');

    const imagesHTML = (post.images || []).map(img => {
        const src = typeof img === 'object' ? (img.url || '') : img;
        return `<img src="${src}" style="max-width:200px;margin:4px;border-radius:8px;cursor:pointer;" alt="Post image" onclick="window.open('${src}','_blank')">`;
    }).join('');

    const commentsHTML = (post.comments || []).map(c =>
        `<div style="padding:10px;border-left:3px solid #e2e8f0;margin:6px 0;background:#f8fafc;border-radius:0 8px 8px 0;">
            <strong>${sanitizeInput(c.authorName || 'Unknown')}</strong>
            <span style="background:${c.authorType === 'designer' ? '#dbeafe' : '#e0e7ff'};color:${c.authorType === 'designer' ? '#1e40af' : '#3730a3'};padding:2px 6px;border-radius:8px;font-size:11px;margin-left:4px;">${c.authorType || 'user'}</span>
            <span style="color:#94a3b8;font-size:12px;margin-left:8px;">${new Date(c.createdAt).toLocaleString()}</span>
            <p style="margin:4px 0 0 0;color:#334155;">${sanitizeInput(c.text || '')}</p>
        </div>`
    ).join('');

    const sc = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' };

    const modalContent = `
        <div style="max-width:700px;">
            <h3 style="margin-bottom:1rem;"><i class="fas fa-newspaper"></i> Community Post Detail</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
                <div><label style="color:#64748b;font-size:13px;">Author</label><p style="margin:2px 0;font-weight:600;">${sanitizeInput(post.authorName || 'Unknown')}</p></div>
                <div><label style="color:#64748b;font-size:13px;">Type</label><p style="margin:2px 0;">${post.authorType || 'unknown'}</p></div>
                <div><label style="color:#64748b;font-size:13px;">Status</label><p style="margin:2px 0;"><span style="color:${sc[post.status] || '#64748b'};font-weight:600;text-transform:uppercase;">${post.status}</span></p></div>
                <div><label style="color:#64748b;font-size:13px;">Posted</label><p style="margin:2px 0;">${new Date(post.createdAt).toLocaleString()}</p></div>
                <div><label style="color:#64748b;font-size:13px;">Likes</label><p style="margin:2px 0;">${post.likes || 0}</p></div>
                <div><label style="color:#64748b;font-size:13px;">Comments</label><p style="margin:2px 0;">${(post.comments || []).length}</p></div>
            </div>
            <h4 style="margin:1rem 0 0.5rem;">Content</h4>
            <div style="background:#f8fafc;padding:12px;border-radius:8px;white-space:pre-wrap;color:#334155;line-height:1.6;">${sanitizeInput(post.content || '')}</div>
            ${imagesHTML ? `<h4 style="margin:1rem 0 0.5rem;">Images</h4><div style="display:flex;flex-wrap:wrap;">${imagesHTML}</div>` : ''}
            ${commentsHTML ? `<h4 style="margin:1rem 0 0.5rem;">Comments (${post.comments.length})</h4>${commentsHTML}` : '<p style="color:#94a3b8;margin-top:1rem;">No comments.</p>'}
            ${post.adminComments ? `<h4 style="margin:1rem 0 0.5rem;">Admin Comments</h4><div style="background:#fef3c7;padding:10px;border-radius:8px;">${sanitizeInput(post.adminComments)}</div>` : ''}
            <div style="display:flex;gap:0.5rem;margin-top:1.5rem;justify-content:flex-end;">
                ${post.status === 'pending' ? `
                    <button class="btn btn-success" onclick="approveCommunityPost('${postId}')"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn btn-danger" onclick="rejectCommunityPost('${postId}')"><i class="fas fa-times"></i> Reject</button>
                ` : ''}
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        </div>`;
    showModal(modalContent);
}

function approveCommunityPost(postId) {
    const modalContent = `
        <div style="max-width:500px;">
            <h3 style="margin-bottom:1rem;"><i class="fas fa-check-circle" style="color:#10b981;"></i> Approve Community Post</h3>
            <p style="color:#64748b;">This post will be visible in the community feed for all users.</p>
            <div class="form-group" style="margin:1rem 0;">
                <label class="form-label">Admin Comments (Optional)</label>
                <textarea id="community-approval-comments" class="form-input" rows="3" placeholder="e.g., Great content!" style="width:100%;"></textarea>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
                <button class="btn btn-success" onclick="confirmApproveCommunityPost('${postId}')"><i class="fas fa-check"></i> Confirm Approval</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>`;
    showModal(modalContent);
}

async function confirmApproveCommunityPost(postId) {
    const commentsEl = document.getElementById('community-approval-comments');
    const comments = commentsEl ? commentsEl.value : '';
    try {
        const data = await apiCall(`/community-posts/${postId}/approve`, 'POST', {
            adminComments: sanitizeInput(comments)
        });
        showNotification(data.message || 'Post approved!', 'success');
        closeModal();
        await loadCommunityPostsData();
    } catch (error) {
        showNotification('Failed to approve post.', 'error');
    }
}

function rejectCommunityPost(postId) {
    const modalContent = `
        <div style="max-width:500px;">
            <h3 style="margin-bottom:1rem;"><i class="fas fa-times-circle" style="color:#ef4444;"></i> Reject Community Post</h3>
            <p style="color:#ef4444;font-size:14px;"><i class="fas fa-info-circle"></i> The author will be notified with your feedback.</p>
            <div class="form-group" style="margin:1rem 0;">
                <label class="form-label">Reason for Rejection *</label>
                <textarea id="community-rejection-reason" class="form-input" rows="4" placeholder="Please provide specific reasons for rejection..." required style="width:100%;"></textarea>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
                <button class="btn btn-danger" onclick="confirmRejectCommunityPost('${postId}')"><i class="fas fa-times"></i> Confirm Rejection</button>
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        </div>`;
    showModal(modalContent);
}

async function confirmRejectCommunityPost(postId) {
    const reasonEl = document.getElementById('community-rejection-reason');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    if (!reason) {
        showNotification('Rejection reason is required.', 'warning');
        return;
    }
    try {
        const data = await apiCall(`/community-posts/${postId}/reject`, 'POST', {
            reason: sanitizeInput(reason)
        });
        showNotification(data.message || 'Post rejected.', 'success');
        closeModal();
        await loadCommunityPostsData();
    } catch (error) {
        showNotification('Failed to reject post.', 'error');
    }
}

async function deleteCommunityPostAdmin(postId) {
    if (!confirm('Are you sure you want to delete this community post? It will be moved to trash.')) return;
    try {
        const data = await apiCall(`/community-posts/${postId}`, 'DELETE');
        showNotification(data.message || 'Post deleted.', 'success');
        await loadCommunityPostsData();
    } catch (error) {
        showNotification('Failed to delete post.', 'error');
    }
}

// ==========================================
// NEWS & ANNOUNCEMENTS MANAGEMENT
// ==========================================

async function loadAnnouncementsData() {
    const container = document.getElementById('announcements-tab');
    showLoader(container);
    try {
        const response = await apiCall('/announcements');
        state.announcements = response.data || [];
        renderAnnouncementsTab();
    } catch (error) {
        console.error('Error loading announcements:', error);
        container.innerHTML = '<p class="error">Failed to load announcements.</p>';
    }
}

function renderAnnouncementsTab() {
    const container = document.getElementById('announcements-tab');
    const announcements = state.announcements;

    const typeIcons = {
        offer: { icon: 'fa-tags', color: '#10b981', label: 'Offer' },
        maintenance: { icon: 'fa-tools', color: '#f59e0b', label: 'Maintenance' },
        update: { icon: 'fa-sync-alt', color: '#3b82f6', label: 'Update' },
        general: { icon: 'fa-info-circle', color: '#6366f1', label: 'General' },
        alert: { icon: 'fa-exclamation-triangle', color: '#ef4444', label: 'Alert' }
    };

    const statusColors = {
        active: '#10b981',
        inactive: '#94a3b8',
        expired: '#ef4444'
    };

    let html = `
        <div class="announcements-header">
            <div class="announcements-header-left">
                <h3><i class="fas fa-bullhorn"></i> News & Announcements</h3>
                <p>Create and manage announcements visible on the portal dashboard</p>
            </div>
            <button class="btn btn-primary" onclick="showCreateAnnouncementModal()">
                <i class="fas fa-plus"></i> Create Announcement
            </button>
        </div>

        <div class="announcements-stats-row">
            <div class="ann-stat-card ann-stat-total">
                <div class="ann-stat-icon"><i class="fas fa-newspaper"></i></div>
                <div class="ann-stat-data">
                    <span class="ann-stat-number">${announcements.length}</span>
                    <span class="ann-stat-label">Total</span>
                </div>
            </div>
            <div class="ann-stat-card ann-stat-active">
                <div class="ann-stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="ann-stat-data">
                    <span class="ann-stat-number">${announcements.filter(a => a.status === 'active').length}</span>
                    <span class="ann-stat-label">Active</span>
                </div>
            </div>
            <div class="ann-stat-card ann-stat-offers">
                <div class="ann-stat-icon"><i class="fas fa-tags"></i></div>
                <div class="ann-stat-data">
                    <span class="ann-stat-number">${announcements.filter(a => a.type === 'offer').length}</span>
                    <span class="ann-stat-label">Offers</span>
                </div>
            </div>
            <div class="ann-stat-card ann-stat-maintenance">
                <div class="ann-stat-icon"><i class="fas fa-tools"></i></div>
                <div class="ann-stat-data">
                    <span class="ann-stat-number">${announcements.filter(a => a.type === 'maintenance').length}</span>
                    <span class="ann-stat-label">Maintenance</span>
                </div>
            </div>
        </div>`;

    if (announcements.length === 0) {
        html += `
            <div class="announcements-empty">
                <i class="fas fa-bullhorn"></i>
                <h4>No Announcements Yet</h4>
                <p>Create your first announcement to keep users informed about offers, maintenance, and updates.</p>
                <button class="btn btn-primary" onclick="showCreateAnnouncementModal()"><i class="fas fa-plus"></i> Create First Announcement</button>
            </div>`;
    } else {
        html += '<div class="announcements-list">';
        announcements.forEach(ann => {
            const typeInfo = typeIcons[ann.type] || typeIcons.general;
            const statusColor = statusColors[ann.status] || statusColors.inactive;
            const createdDate = formatAdminDate(ann.createdAt);
            const expiresDate = ann.expiresAt ? formatAdminDate(ann.expiresAt) : 'Never';
            const priorityBadge = ann.priority === 'high' ? '<span class="ann-priority-high">HIGH</span>' : ann.priority === 'urgent' ? '<span class="ann-priority-urgent">URGENT</span>' : '';

            html += `
                <div class="announcement-card">
                    <div class="ann-card-left">
                        <div class="ann-type-badge" style="background: ${typeInfo.color}15; color: ${typeInfo.color}; border-color: ${typeInfo.color}30">
                            <i class="fas ${typeInfo.icon}"></i>
                            <span>${typeInfo.label}</span>
                        </div>
                        <div class="ann-card-content">
                            <h4>${sanitizeInput(ann.title)} ${priorityBadge}</h4>
                            <p>${sanitizeInput(ann.content).substring(0, 150)}${ann.content.length > 150 ? '...' : ''}</p>
                            <div class="ann-card-meta">
                                <span><i class="fas fa-user"></i> ${ann.createdByName || 'Admin'}</span>
                                <span><i class="fas fa-calendar"></i> ${createdDate}</span>
                                <span><i class="fas fa-clock"></i> Expires: ${expiresDate}</span>
                                <span><i class="fas fa-users"></i> ${ann.targetAudience === 'all' ? 'Everyone' : ann.targetAudience === 'contractor' ? 'Contractors' : 'Designers'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="ann-card-right">
                        <span class="ann-status-badge" style="background: ${statusColor}15; color: ${statusColor}; border-color: ${statusColor}30">${ann.status}</span>
                        <div class="ann-card-actions">
                            <button class="btn btn-sm btn-outline" onclick="editAnnouncement('${ann.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm ${ann.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="toggleAnnouncementStatus('${ann.id}', '${ann.status}')" title="${ann.status === 'active' ? 'Deactivate' : 'Activate'}">
                                <i class="fas ${ann.status === 'active' ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement('${ann.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>`;
        });
        html += '</div>';
    }

    container.innerHTML = html;
}

function showCreateAnnouncementModal(editData = null) {
    const isEdit = !!editData;
    const modal = document.getElementById('modal-container');
    modal.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content modal-lg" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3><i class="fas fa-bullhorn"></i> ${isEdit ? 'Edit' : 'Create'} Announcement</h3>
                    <button class="modal-close" onclick="document.getElementById('modal-container').innerHTML=''">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="announcement-form" onsubmit="handleAnnouncementSubmit(event, ${isEdit ? `'${editData.id}'` : 'null'})">
                        <div class="form-row">
                            <div class="form-group" style="flex:2">
                                <label class="form-label"><i class="fas fa-heading"></i> Title *</label>
                                <input type="text" class="form-input" id="ann-title" value="${isEdit ? sanitizeInput(editData.title) : ''}" placeholder="e.g., Summer Discount - 20% Off All Services" required maxlength="200">
                            </div>
                            <div class="form-group" style="flex:1">
                                <label class="form-label"><i class="fas fa-tag"></i> Type *</label>
                                <select class="form-input" id="ann-type" required>
                                    <option value="">Select type...</option>
                                    <option value="offer" ${isEdit && editData.type === 'offer' ? 'selected' : ''}>Offer / Promotion</option>
                                    <option value="maintenance" ${isEdit && editData.type === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                                    <option value="update" ${isEdit && editData.type === 'update' ? 'selected' : ''}>Platform Update</option>
                                    <option value="general" ${isEdit && editData.type === 'general' ? 'selected' : ''}>General News</option>
                                    <option value="alert" ${isEdit && editData.type === 'alert' ? 'selected' : ''}>Important Alert</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-align-left"></i> Content *</label>
                            <textarea class="form-input" id="ann-content" rows="5" placeholder="Write the announcement details here..." required maxlength="2000">${isEdit ? sanitizeInput(editData.content) : ''}</textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-exclamation-circle"></i> Priority</label>
                                <select class="form-input" id="ann-priority">
                                    <option value="normal" ${isEdit && editData.priority === 'normal' ? 'selected' : ''}>Normal</option>
                                    <option value="high" ${isEdit && editData.priority === 'high' ? 'selected' : ''}>High</option>
                                    <option value="urgent" ${isEdit && editData.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-users"></i> Target Audience</label>
                                <select class="form-input" id="ann-audience">
                                    <option value="all" ${isEdit && editData.targetAudience === 'all' ? 'selected' : ''}>Everyone</option>
                                    <option value="contractor" ${isEdit && editData.targetAudience === 'contractor' ? 'selected' : ''}>Contractors Only</option>
                                    <option value="designer" ${isEdit && editData.targetAudience === 'designer' ? 'selected' : ''}>Designers Only</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-calendar-times"></i> Expires At</label>
                                <input type="datetime-local" class="form-input" id="ann-expires" value="${isEdit && editData.expiresAt ? new Date(editData.expiresAt).toISOString().slice(0, 16) : ''}">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline" onclick="document.getElementById('modal-container').innerHTML=''">Cancel</button>
                            <button type="submit" class="btn btn-primary"><i class="fas ${isEdit ? 'fa-save' : 'fa-paper-plane'}"></i> ${isEdit ? 'Update' : 'Publish'} Announcement</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;
}

async function handleAnnouncementSubmit(event, editId) {
    event.preventDefault();
    const title = document.getElementById('ann-title').value.trim();
    const content = document.getElementById('ann-content').value.trim();
    const type = document.getElementById('ann-type').value;
    const priority = document.getElementById('ann-priority').value;
    const targetAudience = document.getElementById('ann-audience').value;
    const expiresAt = document.getElementById('ann-expires').value ? new Date(document.getElementById('ann-expires').value).toISOString() : null;

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="btn-spinner"></div> Publishing...';
    btn.disabled = true;

    try {
        const body = { title, content, type, priority, targetAudience, expiresAt };

        if (editId) {
            await apiCall(`/announcements/${editId}`, 'PUT', body);
            showNotification('Announcement updated successfully!', 'success');
        } else {
            await apiCall('/announcements', 'POST', body);
            showNotification('Announcement published successfully!', 'success');
        }

        document.getElementById('modal-container').innerHTML = '';
        state.announcements = [];
        loadAnnouncementsData();
    } catch (error) {
        showNotification('Failed to save announcement.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function editAnnouncement(id) {
    const ann = state.announcements.find(a => a.id === id);
    if (ann) showCreateAnnouncementModal(ann);
}

async function toggleAnnouncementStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
        await apiCall(`/announcements/${id}`, 'PUT', { status: newStatus });
        showNotification(`Announcement ${newStatus === 'active' ? 'activated' : 'deactivated'}.`, 'success');
        state.announcements = [];
        loadAnnouncementsData();
    } catch (error) {
        showNotification('Failed to update status.', 'error');
    }
}

async function deleteAnnouncement(id) {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
        await apiCall(`/announcements/${id}`, 'DELETE');
        showNotification('Announcement deleted.', 'success');
        state.announcements = [];
        loadAnnouncementsData();
    } catch (error) {
        showNotification('Failed to delete announcement.', 'error');
    }
}

// =============================================
// MARKETING EMAIL SECTION
// =============================================

const ME_TEMPLATES = {
    'update-contractor': {
        name: 'Update (Contractor)',
        icon: 'fa-rocket',
        subject: 'SteelConnect platform update for you',
        body: `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 16px 0;">Platform Update</h2>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Hi {{name}},</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">We have a couple of updates on SteelConnect that are relevant to you as a contractor:</p>
<p style="font-size:15px;color:#334155;margin:0 0 8px 0;line-height:1.7;"><strong>AI-Powered Cost Estimation</strong> — Get accurate cost estimates for your steel construction projects in minutes, right from your dashboard.</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;"><strong>Project Management</strong> — Post projects, receive competitive quotes from verified designers, and manage everything from one place.</p>
<p style="margin:24px 0 0 0;"><a href="https://steelconnectapp.com" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Go to Dashboard</a></p>
<p style="font-size:14px;color:#64748b;margin-top:16px;">If you have any questions, just reply to this email.</p>`
    },
    'update-designer': {
        name: 'Update (Designer)',
        icon: 'fa-rocket',
        subject: 'SteelConnect platform update for you',
        body: `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 16px 0;">Platform Update</h2>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Hi {{name}},</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">We have a couple of updates on SteelConnect that are relevant to you as a designer:</p>
<p style="font-size:15px;color:#334155;margin:0 0 8px 0;line-height:1.7;"><strong>More Projects Available</strong> — Contractors are posting new steel construction projects regularly. Browse and submit your quotes to win work.</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;"><strong>Enhanced Profile</strong> — Your profile is now more visible to contractors looking for qualified engineers and designers.</p>
<p style="margin:24px 0 0 0;"><a href="https://steelconnectapp.com" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Go to Dashboard</a></p>
<p style="font-size:14px;color:#64748b;margin-top:16px;">If you have any questions, just reply to this email.</p>`
    },
    'welcome-contractor': {
        name: 'Welcome (Contractor)',
        icon: 'fa-hand-wave',
        subject: 'Quick update from SteelConnect',
        body: `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 16px 0;">We wanted to check in</h2>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Hi {{name}},</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">It has been a while since you last visited SteelConnect. Since your last visit, we have improved our AI cost estimation tool and several new designers have joined the platform.</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">You can post your project requirements and start receiving quotes from verified structural engineers and designers.</p>
<p style="margin:24px 0 0 0;"><a href="https://steelconnectapp.com" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Go to Dashboard</a></p>
<p style="font-size:14px;color:#64748b;margin-top:16px;">If you need help with anything, just reply to this email.</p>`
    },
    'welcome-designer': {
        name: 'Welcome (Designer)',
        icon: 'fa-hand-wave',
        subject: 'Quick update from SteelConnect',
        body: `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 16px 0;">We wanted to check in</h2>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Hi {{name}},</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">It has been a while since you last visited SteelConnect. Since your last visit, new construction projects have been posted by contractors looking for qualified designers like you.</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Log in to browse available projects, submit quotes, and connect with clients directly through the platform.</p>
<p style="margin:24px 0 0 0;"><a href="https://steelconnectapp.com" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Go to Dashboard</a></p>
<p style="font-size:14px;color:#64748b;margin-top:16px;">If you need help with anything, just reply to this email.</p>`
    },
    'opportunity-contractor': {
        name: 'Opportunity (Contractor)',
        icon: 'fa-briefcase',
        subject: 'New designers available on SteelConnect',
        body: `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 16px 0;">New designers joined the platform</h2>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Hi {{name}},</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">New structural engineers and designers have joined SteelConnect recently. If you have upcoming steel construction projects, now is a good time to post them and get competitive quotes.</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">You can also use our AI estimation tool to get an instant cost estimate before posting your project.</p>
<p style="margin:24px 0 0 0;"><a href="https://steelconnectapp.com" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Post a Project</a></p>
<p style="font-size:14px;color:#64748b;margin-top:16px;">If you have any questions, just reply to this email.</p>`
    },
    'opportunity-designer': {
        name: 'Opportunity (Designer)',
        icon: 'fa-briefcase',
        subject: 'New projects available on SteelConnect',
        body: `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 16px 0;">New projects posted</h2>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Hi {{name}},</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">New steel construction projects have been posted on SteelConnect by contractors looking for qualified designers. You can review the project details and submit your quotes directly from your dashboard.</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Log in to view the available projects and respond before the deadlines.</p>
<p style="margin:24px 0 0 0;"><a href="https://steelconnectapp.com" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View Projects</a></p>
<p style="font-size:14px;color:#64748b;margin-top:16px;">If you have any questions, just reply to this email.</p>`
    },
    'custom': {
        name: 'Custom Email',
        icon: 'fa-pen-fancy',
        subject: '',
        body: ''
    }
};

async function loadMarketingEmailData() {
    const container = document.getElementById('marketing-email-tab');
    showLoader(container);
    try {
        const [recipientData, campaignData] = await Promise.all([
            apiCall('/marketing/recipients'),
            apiCall('/marketing/campaigns').catch(() => ({ campaigns: [] }))
        ]);
        state.marketingRecipients = recipientData.recipients || [];
        state.marketingRecipientStats = recipientData.stats || {};
        state.marketingCampaigns = campaignData.campaigns || [];
        state.marketingSelectedIds = [];
        renderMarketingEmailTab();
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load marketing data.</p><button class="btn" onclick="loadMarketingEmailData()">Retry</button>`;
    }
}

function renderMarketingEmailTab(filter = 'all', search = '') {
    const container = document.getElementById('marketing-email-tab');
    const stats = state.marketingRecipientStats || {};
    const searchLower = search.toLowerCase();

    let filtered = state.marketingRecipients.filter(u => !u.isBlocked);
    if (filter === 'designer') filtered = filtered.filter(u => u.type === 'designer');
    else if (filter === 'contractor') filtered = filtered.filter(u => u.type === 'contractor');

    if (searchLower) {
        filtered = filtered.filter(u =>
            (u.name || '').toLowerCase().includes(searchLower) ||
            (u.email || '').toLowerCase().includes(searchLower) ||
            (u.companyName || '').toLowerCase().includes(searchLower)
        );
    }

    const selectedCount = state.marketingSelectedIds.length;
    const allFilteredIds = filtered.map(u => u._id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => state.marketingSelectedIds.includes(id));

    container.innerHTML = `
        <div class="me-layout">
            <!-- LEFT: Recipients Panel -->
            <div class="me-recipients-panel">
                <div class="me-header">
                    <div class="me-header-left">
                        <div class="me-icon-wrap"><i class="fas fa-paper-plane"></i></div>
                        <div>
                            <h2>Marketing Email</h2>
                            <p>Send professional emails to approved platform users</p>
                        </div>
                    </div>
                    <button class="btn btn-sm" onclick="loadMarketingEmailData()"><i class="fas fa-sync-alt"></i> Refresh</button>
                </div>

                <div class="me-stats-row">
                    <div class="me-stat-card me-stat-total">
                        <div class="me-stat-icon"><i class="fas fa-users"></i></div>
                        <div>
                            <div class="me-stat-value">${stats.total || 0}</div>
                            <div class="me-stat-label">Total Recipients</div>
                        </div>
                    </div>
                    <div class="me-stat-card me-stat-designer">
                        <div class="me-stat-icon"><i class="fas fa-drafting-compass"></i></div>
                        <div>
                            <div class="me-stat-value">${stats.designers || 0}</div>
                            <div class="me-stat-label">Designers</div>
                        </div>
                    </div>
                    <div class="me-stat-card me-stat-contractor">
                        <div class="me-stat-icon"><i class="fas fa-hard-hat"></i></div>
                        <div>
                            <div class="me-stat-value">${stats.contractors || 0}</div>
                            <div class="me-stat-label">Contractors</div>
                        </div>
                    </div>
                    <div class="me-stat-card me-stat-selected">
                        <div class="me-stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div>
                            <div class="me-stat-value" id="meSelectedCount">${selectedCount}</div>
                            <div class="me-stat-label">Selected</div>
                        </div>
                    </div>
                </div>

                <div class="me-toolbar">
                    <div class="me-search-bar">
                        <i class="fas fa-search"></i>
                        <input type="text" id="meSearchInput" placeholder="Search by name, email, or company..." value="${search}" oninput="renderMarketingEmailTab(document.getElementById('meFilterSelect').value, this.value)" />
                    </div>
                    <select id="meFilterSelect" onchange="renderMarketingEmailTab(this.value, document.getElementById('meSearchInput').value)">
                        <option value="all" ${filter === 'all' ? 'selected' : ''}>All Users</option>
                        <option value="designer" ${filter === 'designer' ? 'selected' : ''}>Designers Only</option>
                        <option value="contractor" ${filter === 'contractor' ? 'selected' : ''}>Contractors Only</option>
                    </select>
                    <button class="btn btn-sm ${allSelected ? 'btn-primary' : 'btn-outline'}" onclick="meToggleSelectAll()">
                        <i class="fas ${allSelected ? 'fa-check-square' : 'fa-square'}"></i> ${allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                ${filtered.length === 0 ? `
                    <div class="me-empty">
                        <i class="fas fa-inbox"></i>
                        <h3>No recipients found</h3>
                        <p>No approved users match your search criteria.</p>
                    </div>
                ` : `
                    <div class="me-recipients-list">
                        ${filtered.map(u => {
                            const initials = (u.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                            const typeClass = u.type === 'designer' ? 'designer' : 'contractor';
                            const isSelected = state.marketingSelectedIds.includes(u._id);
                            return `
                                <div class="me-recipient-card ${isSelected ? 'selected' : ''}" onclick="meToggleRecipient('${u._id}')">
                                    <div class="me-recipient-check">
                                        <i class="fas ${isSelected ? 'fa-check-square' : 'fa-square'}"></i>
                                    </div>
                                    <div class="me-recipient-avatar ${typeClass}">${initials}</div>
                                    <div class="me-recipient-info">
                                        <div class="me-recipient-name">${u.name || 'User'}</div>
                                        <div class="me-recipient-email">${u.email}</div>
                                        ${u.companyName ? `<div class="me-recipient-company"><i class="fas fa-building"></i> ${u.companyName}</div>` : ''}
                                    </div>
                                    <div class="me-recipient-type">
                                        <span class="me-type-badge ${typeClass}">${u.type === 'designer' ? 'Designer' : 'Contractor'}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>

            <!-- RIGHT: Email Composer Panel -->
            <div class="me-composer-panel">
                <div class="me-composer-header">
                    <h3><i class="fas fa-envelope-open-text"></i> Compose Email</h3>
                    <span class="me-selected-badge" id="meComposerBadge">${selectedCount} recipient${selectedCount !== 1 ? 's' : ''} selected</span>
                </div>

                <div class="me-templates-section">
                    <label class="me-label">Choose a Template</label>
                    <div class="me-template-grid">
                        ${Object.entries(ME_TEMPLATES).map(([key, tpl]) => `
                            <div class="me-template-card" onclick="meSelectTemplate('${key}')">
                                <div class="me-template-icon"><i class="fas ${tpl.icon}"></i></div>
                                <div class="me-template-name">${tpl.name}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="me-form-group">
                    <label class="me-label">Subject Line</label>
                    <input type="text" id="meSubjectInput" class="me-input" placeholder="Enter email subject..." />
                </div>

                <div class="me-form-group">
                    <label class="me-label">Email Body <span class="me-hint">Use {{name}}, {{email}}, {{type}}, {{company}} for personalization</span></label>
                    <textarea id="meBodyInput" class="me-textarea" rows="12" placeholder="Write your email content here... HTML is supported."></textarea>
                </div>

                <div class="me-preview-toggle">
                    <button class="btn btn-sm btn-outline" onclick="meTogglePreview()"><i class="fas fa-eye"></i> Preview Email</button>
                </div>
                <div id="mePreviewBox" class="me-preview-box" style="display:none;"></div>

                <div class="me-send-section">
                    <button class="btn btn-lg me-send-btn" onclick="meSendMarketingEmail()" id="meSendBtn">
                        <i class="fas fa-paper-plane"></i> Send to ${selectedCount} Recipient${selectedCount !== 1 ? 's' : ''}
                    </button>
                    <p class="me-send-note"><i class="fas fa-info-circle"></i> Emails will be sent in batches with personalization applied automatically.</p>
                </div>

                <!-- Campaign History -->
                ${state.marketingCampaigns.length > 0 ? `
                    <div class="me-history-section">
                        <h4><i class="fas fa-history"></i> Recent Campaigns</h4>
                        <div class="me-history-list">
                            ${state.marketingCampaigns.slice(0, 5).map(c => `
                                <div class="me-history-card">
                                    <div class="me-history-info">
                                        <div class="me-history-subject">${c.subject || 'No subject'}</div>
                                        <div class="me-history-meta">
                                            <span><i class="fas fa-users"></i> ${c.totalRecipients || 0} recipients</span>
                                            <span><i class="fas fa-check"></i> ${c.sent || 0} delivered</span>
                                            ${c.failed > 0 ? `<span class="me-history-fail"><i class="fas fa-times"></i> ${c.failed} failed</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="me-history-date">${formatAdminDate(c.sentAt)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function meToggleRecipient(userId) {
    const idx = state.marketingSelectedIds.indexOf(userId);
    if (idx === -1) {
        state.marketingSelectedIds.push(userId);
    } else {
        state.marketingSelectedIds.splice(idx, 1);
    }
    meUpdateSelectionUI();
}

function meToggleSelectAll() {
    const filter = document.getElementById('meFilterSelect')?.value || 'all';
    const search = document.getElementById('meSearchInput')?.value || '';
    const searchLower = search.toLowerCase();

    let filtered = state.marketingRecipients.filter(u => !u.isBlocked);
    if (filter === 'designer') filtered = filtered.filter(u => u.type === 'designer');
    else if (filter === 'contractor') filtered = filtered.filter(u => u.type === 'contractor');
    if (searchLower) {
        filtered = filtered.filter(u =>
            (u.name || '').toLowerCase().includes(searchLower) ||
            (u.email || '').toLowerCase().includes(searchLower) ||
            (u.companyName || '').toLowerCase().includes(searchLower)
        );
    }

    const allFilteredIds = filtered.map(u => u._id);
    const allSelected = allFilteredIds.every(id => state.marketingSelectedIds.includes(id));

    if (allSelected) {
        state.marketingSelectedIds = state.marketingSelectedIds.filter(id => !allFilteredIds.includes(id));
    } else {
        const newIds = allFilteredIds.filter(id => !state.marketingSelectedIds.includes(id));
        state.marketingSelectedIds.push(...newIds);
    }
    meUpdateSelectionUI();
}

function meUpdateSelectionUI() {
    const count = state.marketingSelectedIds.length;

    // Update all recipient cards
    document.querySelectorAll('.me-recipient-card').forEach(card => {
        const userId = card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        if (userId) {
            const isSelected = state.marketingSelectedIds.includes(userId);
            card.classList.toggle('selected', isSelected);
            const icon = card.querySelector('.me-recipient-check i');
            if (icon) {
                icon.className = isSelected ? 'fas fa-check-square' : 'fas fa-square';
            }
        }
    });

    // Update counts
    const countEl = document.getElementById('meSelectedCount');
    if (countEl) countEl.textContent = count;

    const badgeEl = document.getElementById('meComposerBadge');
    if (badgeEl) badgeEl.textContent = `${count} recipient${count !== 1 ? 's' : ''} selected`;

    const sendBtn = document.getElementById('meSendBtn');
    if (sendBtn) sendBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Send to ${count} Recipient${count !== 1 ? 's' : ''}`;

    // Update select all button
    const filter = document.getElementById('meFilterSelect')?.value || 'all';
    const search = document.getElementById('meSearchInput')?.value || '';
    const searchLower = search.toLowerCase();
    let filtered = state.marketingRecipients.filter(u => !u.isBlocked);
    if (filter === 'designer') filtered = filtered.filter(u => u.type === 'designer');
    else if (filter === 'contractor') filtered = filtered.filter(u => u.type === 'contractor');
    if (searchLower) {
        filtered = filtered.filter(u =>
            (u.name || '').toLowerCase().includes(searchLower) ||
            (u.email || '').toLowerCase().includes(searchLower) ||
            (u.companyName || '').toLowerCase().includes(searchLower)
        );
    }
    const allFilteredIds = filtered.map(u => u._id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => state.marketingSelectedIds.includes(id));
    const selectAllBtn = document.querySelector('.me-toolbar .btn-sm:last-child');
    if (selectAllBtn) {
        selectAllBtn.className = `btn btn-sm ${allSelected ? 'btn-primary' : 'btn-outline'}`;
        selectAllBtn.innerHTML = `<i class="fas ${allSelected ? 'fa-check-square' : 'fa-square'}"></i> ${allSelected ? 'Deselect All' : 'Select All'}`;
    }
}

function meSelectTemplate(key) {
    const tpl = ME_TEMPLATES[key];
    if (!tpl) return;

    // Highlight the selected template card
    document.querySelectorAll('.me-template-card').forEach(c => c.classList.remove('active'));
    const cards = document.querySelectorAll('.me-template-card');
    const keys = Object.keys(ME_TEMPLATES);
    const idx = keys.indexOf(key);
    if (idx >= 0 && cards[idx]) cards[idx].classList.add('active');

    const subjectInput = document.getElementById('meSubjectInput');
    const bodyInput = document.getElementById('meBodyInput');
    if (subjectInput) subjectInput.value = tpl.subject;
    if (bodyInput) bodyInput.value = tpl.body;

    // Hide preview if open
    const previewBox = document.getElementById('mePreviewBox');
    if (previewBox) previewBox.style.display = 'none';
}

function meTogglePreview() {
    const previewBox = document.getElementById('mePreviewBox');
    if (!previewBox) return;

    if (previewBox.style.display === 'none') {
        const body = document.getElementById('meBodyInput')?.value || '';
        const subject = document.getElementById('meSubjectInput')?.value || '';
        // Replace placeholders with sample data
        const previewHtml = body
            .replace(/\{\{name\}\}/g, 'John Doe')
            .replace(/\{\{email\}\}/g, 'john@example.com')
            .replace(/\{\{type\}\}/g, 'Contractor')
            .replace(/\{\{company\}\}/g, 'Doe Construction Ltd.');
        previewBox.innerHTML = `
            <div class="me-preview-header">
                <strong>Subject:</strong> ${subject || '(No subject)'}
            </div>
            <div class="me-preview-body">${previewHtml || '<p style="color:#999;">No content to preview</p>'}</div>
        `;
        previewBox.style.display = 'block';
    } else {
        previewBox.style.display = 'none';
    }
}

async function meSendMarketingEmail() {
    const selectedIds = state.marketingSelectedIds;
    if (selectedIds.length === 0) {
        showNotification('Please select at least one recipient.', 'warning');
        return;
    }

    const subject = document.getElementById('meSubjectInput')?.value?.trim();
    const body = document.getElementById('meBodyInput')?.value?.trim();

    if (!subject) {
        showNotification('Please enter an email subject.', 'warning');
        return;
    }
    if (!body) {
        showNotification('Please enter email content.', 'warning');
        return;
    }

    const selectedRecipients = state.marketingRecipients.filter(u => selectedIds.includes(u._id));

    if (!confirm(`Send marketing email to ${selectedRecipients.length} recipient${selectedRecipients.length !== 1 ? 's' : ''}?\n\nSubject: ${subject}`)) {
        return;
    }

    const sendBtn = document.getElementById('meSendBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sending...`;
    }

    try {
        const result = await apiCall('/marketing/send', 'POST', {
            recipientIds: selectedIds,
            subject,
            emailBody: body
        });

        const successCount = result.results?.sent || 0;
        const failCount = result.results?.failed || 0;

        if (failCount === 0) {
            showNotification(`Marketing email sent successfully to ${successCount} recipient${successCount !== 1 ? 's' : ''}!`, 'success');
        } else {
            showNotification(`Sent to ${successCount}, failed for ${failCount} recipient${failCount !== 1 ? 's' : ''}.`, 'warning');
        }

        // Clear selections and reload
        state.marketingSelectedIds = [];
        state.marketingCampaigns = [];
        loadMarketingEmailData();

    } catch (error) {
        showNotification('Failed to send marketing emails. Please try again.', 'error');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Send`;
        }
    }
}

// ============================================================
// PROSPECT OUTREACH
// ============================================================

async function loadProspectData() {
    const container = document.getElementById('prospect-outreach-tab');
    if (!container) return;
    showLoader(container);
    try {
        const [prospectRes, campaignRes] = await Promise.all([
            apiCall('/prospects'),
            apiCall('/prospects/campaigns').catch(() => ({ campaigns: [] })),
        ]);
        state.prospects = prospectRes.prospects || [];
        state.prospectStats = prospectRes.stats || {};
        state.prospectCampaigns = campaignRes.campaigns || [];
        state.prospectSelectedIds = [];

        // Update badge
        const badge = document.getElementById('prospectBadge');
        if (badge) badge.textContent = state.prospectStats.pending || '';

        renderProspectOutreachTab();
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><h3>Error loading prospects</h3><p>${error.message}</p></div>`;
    }
}

function renderProspectOutreachTab() {
    const container = document.getElementById('prospect-outreach-tab');
    if (!container) return;
    const stats = state.prospectStats;
    const prospects = state.prospects;

    container.innerHTML = `
        <div class="po-layout">
            <!-- Stats Row -->
            <div class="po-stats-row">
                <div class="po-stat-card">
                    <div class="po-stat-icon" style="background:#eff6ff; color:#2563eb;"><i class="fas fa-users"></i></div>
                    <div class="po-stat-info">
                        <span class="po-stat-num">${stats.total || 0}</span>
                        <span class="po-stat-label">Total Prospects</span>
                    </div>
                </div>
                <div class="po-stat-card">
                    <div class="po-stat-icon" style="background:#fef3c7; color:#d97706;"><i class="fas fa-clock"></i></div>
                    <div class="po-stat-info">
                        <span class="po-stat-num">${stats.pending || 0}</span>
                        <span class="po-stat-label">Pending Invite</span>
                    </div>
                </div>
                <div class="po-stat-card">
                    <div class="po-stat-icon" style="background:#f0fdf4; color:#16a34a;"><i class="fas fa-paper-plane"></i></div>
                    <div class="po-stat-info">
                        <span class="po-stat-num">${stats.invited || 0}</span>
                        <span class="po-stat-label">Invited</span>
                    </div>
                </div>
            </div>

            <!-- Main Section -->
            <div class="po-main">
                <!-- Prospect List -->
                <div class="po-panel">
                    <div class="po-panel-header">
                        <h3><i class="fas fa-list"></i> Captured Emails</h3>
                        <div class="po-actions">
                            <label class="po-select-all">
                                <input type="checkbox" id="poSelectAll" onchange="poToggleSelectAll()">
                                <span>Select All</span>
                            </label>
                            <button class="btn btn-sm btn-primary" onclick="poSendInvites()" id="poSendBtn" disabled>
                                <i class="fas fa-paper-plane"></i> Send Invite (<span id="poSelectedCount">0</span>)
                            </button>
                        </div>
                    </div>
                    <div class="po-list" id="poList">
                        ${prospects.length === 0 ? `
                            <div class="empty-state" style="padding:40px 20px;">
                                <i class="fas fa-bullseye" style="font-size:32px; color:#94a3b8; margin-bottom:12px;"></i>
                                <h3>No prospects yet</h3>
                                <p>Prospects will appear here once visitors enter their email on your landing page.</p>
                            </div>
                        ` : prospects.map(p => `
                            <div class="po-item ${p.inviteSent ? 'po-item-invited' : ''}" data-id="${p._id}">
                                <label class="po-checkbox">
                                    <input type="checkbox" value="${p._id}" onchange="poToggleProspect('${p._id}')">
                                </label>
                                <div class="po-item-info">
                                    <span class="po-item-email">${p.email}</span>
                                    <span class="po-item-meta">
                                        <span style="background:${p.source === 'content-gate' ? '#fef2f2' : p.source === 'mini-estimator' ? '#f5f3ff' : p.source === 'video-gate' ? '#fdf4ff' : p.source === 'popup' ? '#eff6ff' : p.source === 'scroll-bar' ? '#fef3c7' : '#f0fdf4'};color:${p.source === 'content-gate' ? '#dc2626' : p.source === 'mini-estimator' ? '#7c3aed' : p.source === 'video-gate' ? '#c026d3' : p.source === 'popup' ? '#2563eb' : p.source === 'scroll-bar' ? '#d97706' : '#16a34a'};padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;">${p.source || 'inline'}</span>
                                        ${p.scrollDepth ? `<span style="color:#94a3b8;font-size:0.7rem;" title="Page scroll depth at capture">${p.scrollDepth}% scrolled</span>` : ''}
                                        &middot; ${new Date(p.capturedAt).toLocaleDateString()}
                                        ${p.inviteSent ? ' &middot; <span style="color:#16a34a;font-weight:600;">Invited' + (p.inviteCount > 1 ? ' (' + p.inviteCount + 'x)' : '') + '</span>' : ''}
                                    </span>
                                    ${p.estimateData ? `<span class="po-item-meta" style="margin-top:2px;">
                                        <i class="fas fa-calculator" style="color:#7c3aed;font-size:0.7rem;"></i>
                                        <span style="font-size:0.7rem;color:#475569;">${p.estimateData.projectType} &middot; ${Number(p.estimateData.area || 0).toLocaleString()} ${p.estimateData.unit === 'sqm' ? 'sq m' : 'sq ft'} &middot; ${p.estimateData.region}</span>
                                    </span>` : ''}
                                </div>
                                <button class="po-delete-btn" onclick="poDeleteProspect('${p._id}')" title="Remove">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Campaign History -->
                ${state.prospectCampaigns.length > 0 ? `
                <div class="po-panel">
                    <div class="po-panel-header">
                        <h3><i class="fas fa-history"></i> Outreach History</h3>
                    </div>
                    <div class="po-campaigns">
                        ${state.prospectCampaigns.slice(0, 8).map(c => `
                            <div class="po-campaign-item">
                                <div class="po-campaign-info">
                                    <span class="po-campaign-subject">${c.subject}</span>
                                    <span class="po-campaign-meta">${new Date(c.sentAt).toLocaleDateString()} &middot; by ${c.sentBy}</span>
                                </div>
                                <div class="po-campaign-stats">
                                    <span class="po-campaign-sent">${c.sent} sent</span>
                                    ${c.failed > 0 ? `<span class="po-campaign-fail">${c.failed} failed</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

function poToggleProspect(id) {
    const idx = state.prospectSelectedIds.indexOf(id);
    if (idx >= 0) state.prospectSelectedIds.splice(idx, 1);
    else state.prospectSelectedIds.push(id);
    poUpdateUI();
}

function poToggleSelectAll() {
    const allCheckbox = document.getElementById('poSelectAll');
    if (allCheckbox.checked) {
        state.prospectSelectedIds = state.prospects.map(p => p._id);
    } else {
        state.prospectSelectedIds = [];
    }
    // Sync checkboxes
    document.querySelectorAll('#poList input[type="checkbox"]').forEach(cb => {
        cb.checked = state.prospectSelectedIds.includes(cb.value);
    });
    poUpdateUI();
}

function poUpdateUI() {
    const count = state.prospectSelectedIds.length;
    const countEl = document.getElementById('poSelectedCount');
    const btn = document.getElementById('poSendBtn');
    if (countEl) countEl.textContent = count;
    if (btn) btn.disabled = count === 0;
}

async function poSendInvites() {
    if (state.prospectSelectedIds.length === 0) return;
    const btn = document.getElementById('poSendBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

    try {
        const result = await apiCall('/prospects/send-invite', 'POST', {
            prospectIds: state.prospectSelectedIds,
        });
        const sent = result.results?.sent || 0;
        const failed = result.results?.failed || 0;
        if (failed === 0) {
            showNotification(`Invitation sent to ${sent} prospect${sent !== 1 ? 's' : ''}!`, 'success');
        } else {
            showNotification(`Sent ${sent}, failed ${failed}.`, 'warning');
        }
        state.prospectSelectedIds = [];
        state.prospects = [];
        loadProspectData();
    } catch (error) {
        showNotification('Failed to send invitations.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Invite (<span id="poSelectedCount">0</span>)'; }
    }
}

async function poDeleteProspect(id) {
    if (!confirm('Remove this prospect?')) return;
    try {
        await apiCall(`/prospects/${id}`, 'DELETE');
        showNotification('Prospect removed.', 'success');
        state.prospects = [];
        loadProspectData();
    } catch (error) {
        showNotification('Failed to remove prospect.', 'error');
    }
}

// ================================================================
// CHATBOT REPORTS - View conversations, emails, draft replies
// ================================================================

async function loadChatbotReportsData() {
    const container = document.getElementById('chatbot-reports-tab');
    showLoader(container);
    try {
        const data = await apiCall('/chatbot/reports');
        state.chatbotReports = data.reports || [];
        state.chatbotReportsStats = data.stats || { total: 0, withEmail: 0, today: 0 };
        // Update sidebar badge
        const badge = document.getElementById('chatbotReportsBadge');
        if (badge && state.chatbotReportsStats.withEmail > 0) {
            badge.textContent = state.chatbotReportsStats.withEmail;
            badge.style.display = 'inline-flex';
        }
        renderChatbotReportsTab();
    } catch (error) {
        container.innerHTML = `<p class="error">Failed to load chatbot reports.</p><button class="btn" onclick="loadChatbotReportsData()">Retry</button>`;
    }
}

function renderChatbotReportsTab(filterType = 'all', searchTerm = '') {
    const container = document.getElementById('chatbot-reports-tab');
    const stats = state.chatbotReportsStats;
    const searchLower = searchTerm.toLowerCase();

    let reports = [...state.chatbotReports];
    if (filterType === 'with-email') reports = reports.filter(r => r.email);
    if (filterType === 'no-email') reports = reports.filter(r => !r.email);
    if (filterType === 'replied') reports = reports.filter(r => r.replied);
    if (filterType === 'unreplied') reports = reports.filter(r => r.email && !r.replied);
    if (searchLower) {
        reports = reports.filter(r =>
            (r.email || '').toLowerCase().includes(searchLower) ||
            (r.messages || []).some(m => (m.text || '').toLowerCase().includes(searchLower))
        );
    }

    container.innerHTML = `
        <div class="cr-layout">
            <!-- Stats Bar -->
            <div class="me-stats-row" style="margin-bottom:20px;">
                <div class="me-stat-card">
                    <div class="me-stat-icon" style="background:rgba(99,102,241,0.1);color:#6366f1;"><i class="fas fa-comments"></i></div>
                    <div class="me-stat-info"><div class="me-stat-value">${stats.total || 0}</div><div class="me-stat-label">Total Chats</div></div>
                </div>
                <div class="me-stat-card">
                    <div class="me-stat-icon" style="background:rgba(16,185,129,0.1);color:#10b981;"><i class="fas fa-envelope"></i></div>
                    <div class="me-stat-info"><div class="me-stat-value">${stats.withEmail || 0}</div><div class="me-stat-label">With Email</div></div>
                </div>
                <div class="me-stat-card">
                    <div class="me-stat-icon" style="background:rgba(245,158,11,0.1);color:#f59e0b;"><i class="fas fa-clock"></i></div>
                    <div class="me-stat-info"><div class="me-stat-value">${stats.today || 0}</div><div class="me-stat-label">Today</div></div>
                </div>
                <div class="me-stat-card">
                    <div class="me-stat-icon" style="background:rgba(239,68,68,0.1);color:#ef4444;"><i class="fas fa-reply"></i></div>
                    <div class="me-stat-info"><div class="me-stat-value">${stats.unreplied || 0}</div><div class="me-stat-label">Unreplied</div></div>
                </div>
            </div>

            <!-- Toolbar -->
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">
                <div style="flex:1;min-width:200px;">
                    <input type="text" placeholder="Search by email or message..." value="${searchTerm}" onkeyup="renderChatbotReportsTab(document.getElementById('crFilterSelect').value, this.value)"
                        style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;font-family:inherit;" />
                </div>
                <select id="crFilterSelect" onchange="renderChatbotReportsTab(this.value, '')" style="padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:inherit;background:#fff;cursor:pointer;">
                    <option value="all" ${filterType === 'all' ? 'selected' : ''}>All Conversations</option>
                    <option value="with-email" ${filterType === 'with-email' ? 'selected' : ''}>With Email</option>
                    <option value="no-email" ${filterType === 'no-email' ? 'selected' : ''}>Without Email</option>
                    <option value="unreplied" ${filterType === 'unreplied' ? 'selected' : ''}>Unreplied</option>
                    <option value="replied" ${filterType === 'replied' ? 'selected' : ''}>Replied</option>
                </select>
                <button class="btn" onclick="state.chatbotReports=[];loadChatbotReportsData()" style="padding:10px 16px;border-radius:10px;font-size:13px;">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>

            <!-- Reports List -->
            <div class="cr-list">
                ${reports.length === 0 ? `
                    <div style="text-align:center;padding:60px 20px;color:#64748b;">
                        <i class="fas fa-robot" style="font-size:48px;opacity:0.3;margin-bottom:16px;display:block;"></i>
                        <h3 style="font-size:18px;font-weight:600;color:#475569;margin:0 0 8px;">No chatbot conversations yet</h3>
                        <p style="font-size:14px;">Conversations from the landing page chatbot will appear here.</p>
                    </div>
                ` : reports.map((r, idx) => `
                    <div class="cr-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:16px;transition:all 0.2s;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:44px;height:44px;border-radius:12px;background:${r.email ? 'linear-gradient(135deg,#4338ca,#6366f1)' : 'linear-gradient(135deg,#94a3b8,#64748b)'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;">
                                    <i class="fas ${r.email ? 'fa-user' : 'fa-user-secret'}"></i>
                                </div>
                                <div>
                                    <div style="font-weight:700;font-size:14px;color:#0f172a;">${r.email ? sanitizeInput(r.email) : 'Anonymous Visitor'}</div>
                                    <div style="font-size:12px;color:#64748b;margin-top:2px;">
                                        <i class="fas fa-clock" style="margin-right:4px;"></i>${formatAdminDate(r.capturedAt || r.createdAt)}
                                        ${r.source ? ` &middot; <span style="color:#6366f1;font-weight:500;">${sanitizeInput(r.source)}</span>` : ''}
                                        &middot; ${(r.messages || []).length} messages
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex;gap:8px;">
                                ${r.email && !r.replied ? `<button class="btn" onclick="crShowDraftReply('${sanitizeInput(r.email)}', ${idx})" style="padding:8px 14px;border-radius:8px;font-size:12px;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;border:none;cursor:pointer;">
                                    <i class="fas fa-reply"></i> Draft Reply
                                </button>` : ''}
                                ${r.replied ? `<span style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2);"><i class="fas fa-check"></i> Replied</span>` : ''}
                            </div>
                        </div>
                        <div class="cr-messages" style="background:#f8fafc;border-radius:12px;padding:14px;max-height:200px;overflow-y:auto;">
                            ${(r.messages || []).map(m => `
                                <div style="margin-bottom:8px;display:flex;gap:8px;align-items:flex-start;">
                                    <span style="width:22px;height:22px;border-radius:50%;background:${m.role === 'user' ? '#e0e7ff' : '#f1f5f9'};display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;color:${m.role === 'user' ? '#4338ca' : '#64748b'};">
                                        <i class="fas ${m.role === 'user' ? 'fa-user' : 'fa-robot'}"></i>
                                    </span>
                                    <div style="font-size:12.5px;color:#334155;line-height:1.5;">${sanitizeInput(m.text || '').substring(0, 300)}${(m.text || '').length > 300 ? '...' : ''}</div>
                                </div>
                            `).join('')}
                            ${(r.messages || []).length === 0 ? '<p style="font-size:12px;color:#94a3b8;text-align:center;margin:8px 0;">No messages recorded</p>' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Draft Reply Modal for Chatbot Reports
function crShowDraftReply(email, reportIdx) {
    const report = state.chatbotReports[reportIdx];
    const lastUserMsg = [...(report.messages || [])].reverse().find(m => m.role === 'user');
    const context = lastUserMsg ? lastUserMsg.text : '';

    const draftBody = `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 16px 0;">Thank You for Your Interest in SteelConnect</h2>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Hi there,</p>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">Thank you for reaching out through our chat assistant! We noticed you were asking about our platform and wanted to provide you with some additional information.</p>
<p style="font-size:15px;color:#334155;margin:0 0 8px 0;line-height:1.7;"><strong>What SteelConnect Offers:</strong></p>
<ul style="font-size:14px;color:#334155;line-height:1.8;padding-left:20px;margin:0 0 14px 0;">
<li><strong>AI-Powered Cost Estimation</strong> — Upload PDF drawings and get instant, detailed cost breakdowns</li>
<li><strong>Global Marketplace</strong> — Connect with 2,500+ verified structural engineers across 50+ countries</li>
<li><strong>Business Analytics</strong> — Real-time dashboards, predictive forecasting, and KPI tracking</li>
<li><strong>Secure Collaboration</strong> — End-to-end encrypted messaging and file sharing</li>
<li><strong>Project Management</strong> — Track milestones, deliverables, and payments in one place</li>
</ul>
<p style="font-size:15px;color:#334155;margin:0 0 14px 0;line-height:1.7;">We'd love to give you a personalized walkthrough. Simply click the button below to get started with a free account:</p>
<p style="margin:24px 0 0 0;"><a href="https://steelconnectapp.com" style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6366f1);color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Get Started Free →</a></p>
<p style="font-size:13px;color:#64748b;margin-top:20px;">If you have any questions, simply reply to this email. Our team is available 24/7.</p>
<p style="font-size:13px;color:#64748b;">Best regards,<br><strong>The SteelConnect Team</strong></p>`;

    const modalContent = `
        <div style="max-width:700px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#4338ca,#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;">
                    <i class="fas fa-reply"></i>
                </div>
                <div>
                    <h3 style="font-size:18px;font-weight:700;color:#0f172a;margin:0;">Draft Reply</h3>
                    <p style="font-size:13px;color:#64748b;margin:2px 0 0;">Sending to: <strong style="color:#4338ca;">${sanitizeInput(email)}</strong></p>
                </div>
            </div>

            ${context ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:16px;">
                <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Their last question:</div>
                <p style="font-size:13px;color:#334155;margin:0;font-style:italic;">"${sanitizeInput(context).substring(0, 200)}"</p>
            </div>` : ''}

            <div style="margin-bottom:12px;">
                <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px;">Subject</label>
                <input type="text" id="crReplySubject" value="Welcome to SteelConnect — Here's What We Can Do For You"
                    style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;font-family:inherit;box-sizing:border-box;" />
            </div>

            <div style="margin-bottom:16px;">
                <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px;">Email Body (HTML)</label>
                <textarea id="crReplyBody" rows="14" style="width:100%;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;font-family:monospace;outline:none;resize:vertical;line-height:1.5;box-sizing:border-box;">${draftBody}</textarea>
            </div>

            <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button onclick="closeModal()" class="btn" style="padding:10px 20px;border-radius:10px;font-size:13px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;">Cancel</button>
                <button onclick="crSendReply('${sanitizeInput(email)}', ${reportIdx})" class="btn" id="crSendReplyBtn" style="padding:10px 24px;border-radius:10px;font-size:13px;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;border:none;cursor:pointer;">
                    <i class="fas fa-paper-plane"></i> Send Reply
                </button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

async function crSendReply(email, reportIdx) {
    const subject = document.getElementById('crReplySubject')?.value?.trim();
    const body = document.getElementById('crReplyBody')?.value?.trim();
    if (!subject || !body) {
        showNotification('Subject and body are required.', 'error');
        return;
    }
    const btn = document.getElementById('crSendReplyBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

    try {
        await apiCall('/chatbot/reply', 'POST', { email, subject, body, reportIndex: reportIdx });
        showNotification('Reply sent successfully!', 'success');
        // Mark as replied locally
        if (state.chatbotReports[reportIdx]) {
            state.chatbotReports[reportIdx].replied = true;
        }
        closeModal();
        renderChatbotReportsTab();
    } catch (error) {
        showNotification('Failed to send reply: ' + (error.message || 'Unknown error'), 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reply'; }
    }
}

// ================================================================
// BULK EMAIL CAMPAIGN - Send to 1000 emails via BCC
// ================================================================

// INBOX-OPTIMIZED TEMPLATE
// Key rules to land in inbox (not promotions):
// 1. NO images, gradients, background colors, or heavy CSS
// 2. Looks like a personal email from a real person
// 3. Conversational tone, not marketing speak
// 4. Only ONE link (the login/site link)
// 5. High text-to-HTML ratio
// 6. No "Get Started Free", "Transform", "Unlock" — use natural language
// 7. Short paragraphs, like writing to a colleague
const BULK_EMAIL_TEMPLATE = `<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Good afternoon,</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 16px;">My name is Smith and I am the Director of Business Development at SteelConnectApp. I am reaching out to introduce our platform, which we developed specifically for construction industry professionals worldwide.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 16px;">SteelConnectApp is an AI-powered construction management platform that streamlines how contractors, structural engineers, and steel designers collaborate on projects. We serve professionals across the USA, United Kingdom, Australia, GCC countries, Asia, and Europe — over 50 countries and growing.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 16px;">I wanted to highlight a few capabilities that our clients have found particularly valuable:</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 8px;"><strong>AI-Powered Cost Estimation</strong> — Our proprietary AI engine analyzes PDF construction drawings and delivers comprehensive cost breakdowns within minutes. The output includes trade-by-trade estimates covering structural steel, concrete, MEP systems, and finishes, along with a procurement-ready Bill of Quantities. To date, we have processed over 12,000 estimates with a verified accuracy rate above 95%.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 8px;"><strong>Vetted Professional Network</strong> — Our marketplace includes over 2,500 PE-licensed structural engineers, detailers, and certified designers across the USA, UK, Australia, GCC, Asia, and Europe. Every professional undergoes credential verification, license checks, and insurance validation before being approved on the platform.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 8px;"><strong>Integrated Project Management</strong> — Manage your entire project lifecycle from a single dashboard. Post project requirements, receive competitive bids, communicate through encrypted channels, share documents securely, and track milestones and deliverables in real time.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 8px;"><strong>Business Intelligence Suite</strong> — Our analytics dashboard provides real-time revenue tracking, project performance metrics, regional market benchmarks, and AI-driven forecasting to support data-informed decision making.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 16px;"><strong>Enterprise-Grade Security</strong> — The platform is SOC 2 compliant with end-to-end encryption, built-in NDA management, and escrow-protected payments to ensure your data and transactions are fully secure.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 16px;">We have supported over 850 projects across commercial, industrial, residential, healthcare, and infrastructure sectors. Registration is complimentary and does not require a credit card.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 16px;">I would be happy to arrange a brief call or provide a personalized demonstration. In the meantime, you are welcome to explore the platform at <a href="https://steelconnectapp.com" style="color:#2563eb;">steelconnectapp.com</a></p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Please do not hesitate to reply to this email with any questions. I look forward to hearing from you.</p>

<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 4px;">Respectfully,</p>
<p style="font-size:15px;color:#1a1a1a;line-height:1.75;margin:0 0 0;"><strong>Smith</strong></p>
<p style="font-size:13px;color:#555555;line-height:1.5;margin:0;">Director of Business Development</p>
<p style="font-size:13px;color:#555555;line-height:1.5;margin:0;">SteelConnectApp</p>
<p style="font-size:13px;color:#555555;line-height:1.5;margin:0;">support@steelconnectapp.com</p>`;

function renderBulkEmailTab() {
    const container = document.getElementById('bulk-email-tab');
    container.innerHTML = `
        <div class="be-layout" style="max-width:960px;">
            <!-- Info Banner -->
            <div style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);border:1px solid #c7d2fe;border-radius:16px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;gap:16px;">
                <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#4338ca,#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;flex-shrink:0;">
                    <i class="fas fa-envelope-open-text"></i>
                </div>
                <div>
                    <h3 style="font-size:16px;font-weight:700;color:#312e81;margin:0 0 4px;">Bulk Email Campaign</h3>
                    <p style="font-size:13px;color:#4338ca;margin:0;">Send professional emails to up to 1,000 recipients. All emails are sent as BCC — no recipient can see other email addresses.</p>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
                <!-- LEFT: Email Input -->
                <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;">
                    <h4 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 4px;"><i class="fas fa-users" style="color:#6366f1;margin-right:8px;"></i>Recipients</h4>
                    <p style="font-size:12px;color:#64748b;margin:0 0 16px;">Paste email addresses below — one per line, comma-separated, or space-separated. Max 1,000.</p>

                    <textarea id="beEmailList" rows="12" placeholder="john@example.com&#10;sarah@company.co&#10;mike@builder.net&#10;&#10;Or paste comma-separated:&#10;john@example.com, sarah@company.co, mike@builder.net"
                        style="width:100%;padding:14px;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;font-family:'Courier New',monospace;outline:none;resize:vertical;line-height:1.6;box-sizing:border-box;transition:border-color 0.2s;"
                        onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e2e8f0'" oninput="beUpdateCount()"></textarea>

                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span id="beEmailCount" style="font-size:13px;font-weight:600;color:#475569;">0 emails</span>
                            <span id="beEmailStatus" style="font-size:11px;color:#94a3b8;"></span>
                        </div>
                        <div style="display:flex;gap:8px;">
                            <button onclick="beValidateEmails()" style="padding:8px 14px;border-radius:8px;font-size:12px;font-weight:500;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;cursor:pointer;">
                                <i class="fas fa-check-double"></i> Validate
                            </button>
                            <button onclick="beClearEmails()" style="padding:8px 14px;border-radius:8px;font-size:12px;font-weight:500;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;cursor:pointer;">
                                <i class="fas fa-trash-alt"></i> Clear
                            </button>
                        </div>
                    </div>
                    <div id="beValidationResult" style="margin-top:12px;display:none;"></div>
                </div>

                <!-- RIGHT: Compose -->
                <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;">
                    <h4 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 16px;"><i class="fas fa-pen-fancy" style="color:#6366f1;margin-right:8px;"></i>Compose Email</h4>

                    <div style="margin-bottom:14px;">
                        <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:6px;">Subject Line</label>
                        <input type="text" id="beSubject" value="Introduction — SteelConnect AI Construction Platform"
                            style="width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;font-family:inherit;box-sizing:border-box;"
                            onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e2e8f0'" />
                    </div>

                    <div style="margin-bottom:14px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <label style="font-size:12px;font-weight:600;color:#475569;">Email Body (HTML)</label>
                            <button onclick="beTogglePreview()" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;cursor:pointer;">
                                <i class="fas fa-eye"></i> Preview
                            </button>
                        </div>
                        <textarea id="beBody" rows="10" style="width:100%;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:11.5px;font-family:'Courier New',monospace;outline:none;resize:vertical;line-height:1.4;box-sizing:border-box;"
                            onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e2e8f0'">${BULK_EMAIL_TEMPLATE.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                    </div>

                    <div id="bePreviewArea" style="display:none;margin-bottom:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;max-height:300px;overflow-y:auto;"></div>

                    <div style="display:flex;gap:8px;align-items:center;padding:12px 16px;background:#fffbeb;border:1px solid #fef3c7;border-radius:10px;margin-bottom:10px;">
                        <i class="fas fa-shield-alt" style="color:#d97706;"></i>
                        <span style="font-size:12px;color:#92400e;">All emails sent as BCC — recipients cannot see each other's email addresses.</span>
                    </div>
                    <div style="padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:16px;font-size:11px;color:#166534;line-height:1.6;">
                        <strong><i class="fas fa-inbox"></i> Inbox delivery tips:</strong> Emails are sent from a personal name, with minimal HTML, to maximize inbox placement. Avoid adding images, heavy formatting, or promotional words like "FREE", "BUY NOW" in the subject line. Keep it conversational.
                    </div>

                    <button onclick="beSendCampaign()" id="beSendBtn" class="btn" style="width:100%;padding:14px;border-radius:12px;font-size:14px;font-weight:600;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                        <i class="fas fa-paper-plane"></i> Send Bulk Email
                    </button>
                </div>
            </div>

            <!-- Campaign History -->
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin-top:24px;">
                <h4 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 16px;"><i class="fas fa-history" style="color:#6366f1;margin-right:8px;"></i>Campaign History</h4>
                <div id="beCampaignHistory" style="color:#64748b;font-size:13px;">
                    <p style="text-align:center;padding:20px;"><i class="fas fa-inbox" style="font-size:24px;opacity:0.3;display:block;margin-bottom:8px;"></i>No campaigns sent yet.</p>
                </div>
            </div>
        </div>
    `;
    beLoadHistory();
}

// Parse email list from textarea
function beParseEmails() {
    const raw = (document.getElementById('beEmailList')?.value || '').trim();
    if (!raw) return [];
    // Split by newline, comma, semicolon, space, or tab
    const parts = raw.split(/[\n,;\s\t]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return [...new Set(parts.filter(e => emailRegex.test(e)))];
}

function beUpdateCount() {
    const emails = beParseEmails();
    const countEl = document.getElementById('beEmailCount');
    const statusEl = document.getElementById('beEmailStatus');
    if (countEl) countEl.textContent = `${emails.length} valid email${emails.length !== 1 ? 's' : ''}`;
    if (statusEl) {
        if (emails.length > 1000) {
            statusEl.textContent = '⚠ Max 1,000 allowed';
            statusEl.style.color = '#ef4444';
        } else if (emails.length > 0) {
            statusEl.textContent = '✓ Ready';
            statusEl.style.color = '#10b981';
        } else {
            statusEl.textContent = '';
        }
    }
}

function beValidateEmails() {
    const raw = (document.getElementById('beEmailList')?.value || '').trim();
    const parts = raw.split(/[\n,;\s\t]+/).map(e => e.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = [];
    const invalid = [];
    const seen = new Set();
    let duplicates = 0;

    parts.forEach(e => {
        const lower = e.toLowerCase();
        if (seen.has(lower)) { duplicates++; return; }
        seen.add(lower);
        if (emailRegex.test(lower)) valid.push(lower);
        else invalid.push(e);
    });

    const resultEl = document.getElementById('beValidationResult');
    if (resultEl) {
        resultEl.style.display = '';
        resultEl.innerHTML = `
            <div style="padding:12px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;font-size:12px;">
                <div style="color:#16a34a;font-weight:600;margin-bottom:4px;"><i class="fas fa-check-circle"></i> ${valid.length} valid emails</div>
                ${duplicates > 0 ? `<div style="color:#d97706;margin-top:4px;"><i class="fas fa-clone"></i> ${duplicates} duplicates removed</div>` : ''}
                ${invalid.length > 0 ? `<div style="color:#dc2626;margin-top:4px;"><i class="fas fa-times-circle"></i> ${invalid.length} invalid: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '...' : ''}</div>` : ''}
            </div>
        `;
    }
    // Replace textarea with cleaned list
    if (valid.length > 0) {
        document.getElementById('beEmailList').value = valid.join('\n');
        beUpdateCount();
    }
}

function beClearEmails() {
    const el = document.getElementById('beEmailList');
    if (el) el.value = '';
    beUpdateCount();
    const resultEl = document.getElementById('beValidationResult');
    if (resultEl) resultEl.style.display = 'none';
}

function beTogglePreview() {
    const preview = document.getElementById('bePreviewArea');
    const body = document.getElementById('beBody');
    if (!preview || !body) return;
    if (preview.style.display === 'none') {
        // Decode HTML entities from textarea
        const tempEl = document.createElement('textarea');
        tempEl.innerHTML = body.value;
        preview.innerHTML = tempEl.value;
        preview.style.display = '';
    } else {
        preview.style.display = 'none';
    }
}

async function beSendCampaign() {
    const emails = beParseEmails();
    const subject = (document.getElementById('beSubject')?.value || '').trim();
    const bodyEl = document.getElementById('beBody');
    // Decode HTML entities
    const tempEl = document.createElement('textarea');
    tempEl.innerHTML = bodyEl?.value || '';
    const body = tempEl.value.trim();

    if (emails.length === 0) {
        showNotification('Please paste at least one email address.', 'error');
        return;
    }
    if (emails.length > 1000) {
        showNotification('Maximum 1,000 emails allowed per campaign.', 'error');
        return;
    }
    if (!subject) {
        showNotification('Subject line is required.', 'error');
        return;
    }
    if (!body) {
        showNotification('Email body is required.', 'error');
        return;
    }

    if (!confirm(`Send this email to ${emails.length} recipient${emails.length !== 1 ? 's' : ''} via BCC?\n\nSubject: ${subject}\n\nNo recipient will see other email addresses.`)) return;

    const btn = document.getElementById('beSendBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending... This may take a moment'; }

    try {
        const result = await apiCall('/bulk-email/send', 'POST', {
            emails: emails,
            subject: subject,
            body: body
        });
        showNotification(`Campaign sent! ${result.sent || emails.length} delivered, ${result.failed || 0} failed.`, 'success');
        beLoadHistory();
    } catch (error) {
        showNotification('Failed to send campaign: ' + (error.message || 'Unknown error'), 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Bulk Email'; }
}

async function beLoadHistory() {
    const historyEl = document.getElementById('beCampaignHistory');
    if (!historyEl) return;
    try {
        const data = await apiCall('/bulk-email/campaigns');
        const campaigns = data.campaigns || [];
        state.bulkEmailHistory = campaigns;
        if (campaigns.length === 0) {
            historyEl.innerHTML = '<p style="text-align:center;padding:20px;color:#94a3b8;"><i class="fas fa-inbox" style="font-size:24px;opacity:0.3;display:block;margin-bottom:8px;"></i>No campaigns sent yet.</p>';
            return;
        }
        historyEl.innerHTML = campaigns.map(c => `
            <div style="display:flex;align-items:center;gap:16px;padding:14px 16px;border:1px solid #f1f5f9;border-radius:10px;margin-bottom:8px;">
                <div style="width:40px;height:40px;border-radius:10px;background:${c.failed > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'};display:flex;align-items:center;justify-content:center;color:${c.failed > 0 ? '#f59e0b' : '#10b981'};flex-shrink:0;">
                    <i class="fas ${c.failed > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>
                </div>
                <div style="flex:1;">
                    <div style="font-size:13px;font-weight:600;color:#0f172a;">${sanitizeInput(c.subject || 'No subject')}</div>
                    <div style="font-size:11px;color:#64748b;margin-top:3px;">${formatAdminDate(c.sentAt)} &middot; ${c.sent || 0} sent, ${c.failed || 0} failed &middot; ${c.totalRecipients || 0} recipients</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        historyEl.innerHTML = '<p style="text-align:center;padding:20px;color:#94a3b8;">Could not load campaign history.</p>';
    }
}

// --- OPERATIONS PORTAL TOGGLE ---
let opsPortalEnabled = false;

async function loadOperationsPortalStatus() {
    try {
        const data = await apiCall('/operations-portal/status');
        if (data.success) {
            opsPortalEnabled = data.enabled;
            updateOpsPortalUI(data.enabled);
        }
    } catch (error) {
        console.warn('Could not load operations portal status:', error);
    }
}

function updateOpsPortalUI(enabled) {
    const toggle = document.getElementById('opsPortalToggle');
    const statusContainer = document.getElementById('opsPortalStatus');
    const link = document.getElementById('opsPortalLink');
    
    if (toggle) toggle.checked = enabled;
    
    if (statusContainer) {
        const dot = statusContainer.querySelector('.ops-status-dot');
        const text = statusContainer.querySelector('.ops-status-text');
        if (dot) {
            dot.className = 'ops-status-dot ' + (enabled ? 'ops-status-on' : 'ops-status-off');
        }
        if (text) {
            text.textContent = enabled ? 'Online' : 'Offline';
        }
    }
    
    if (link) {
        if (enabled) {
            link.classList.remove('ops-disabled');
        } else {
            link.classList.add('ops-disabled');
        }
    }
}

async function toggleOperationsPortal(enabled) {
    try {
        const data = await apiCall('/operations-portal/toggle', 'POST', { enabled });
        if (data.success) {
            opsPortalEnabled = data.enabled;
            updateOpsPortalUI(data.enabled);
            showNotification(
                `Operations Portal ${data.enabled ? 'enabled' : 'disabled'} successfully`,
                data.enabled ? 'success' : 'warning'
            );
        } else {
            // Revert toggle
            updateOpsPortalUI(!enabled);
            showNotification('Failed to toggle operations portal', 'error');
        }
    } catch (error) {
        updateOpsPortalUI(!enabled);
        showNotification('Error toggling operations portal: ' + error.message, 'error');
    }
}

function openOperationsPortal(event) {
    event.preventDefault();
    if (!opsPortalEnabled) {
        showNotification('Operations Portal is currently disabled. Turn it on first.', 'warning');
        return;
    }
    // Open the operations portal in a new tab
    // The operations portal URL - adjust to your deployment
    const opsUrl = window.location.origin.replace('admin', 'steelconnect-operations') 
        || 'https://steelconnect-operations.vercel.app';
    window.open(opsUrl, '_blank');
}

// Load operations portal status on init
const _origInitAdmin = initializeAdminPanel;
initializeAdminPanel = async function() {
    await _origInitAdmin();
    loadOperationsPortalStatus();
};

// ═══════════════════════════════════════════════════════════════════════════════
// ██  WHATSAPP MARKETING TAB
// ═══════════════════════════════════════════════════════════════════════════════

let waRecipients = [];
let waSelectedRecipients = [];
let waCampaigns = [];
let waApiStatus = null;

async function loadWhatsAppMarketingData() {
    const container = document.getElementById('whatsapp-marketing-tab');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading WhatsApp Marketing...</div>';

    try {
        // Fetch status, recipients, and campaigns in parallel
        const [statusRes, recipientsRes, campaignsRes] = await Promise.allSettled([
            apiCall('/whatsapp/status'),
            apiCall('/whatsapp/recipients'),
            apiCall('/whatsapp/campaigns')
        ]);

        waApiStatus = statusRes.status === 'fulfilled' ? statusRes.value : null;
        if (recipientsRes.status === 'fulfilled' && recipientsRes.value.success) {
            waRecipients = recipientsRes.value.recipients || [];
            state.whatsappRecipients = waRecipients;
        }
        if (campaignsRes.status === 'fulfilled' && campaignsRes.value.success) {
            waCampaigns = campaignsRes.value.campaigns || [];
        }
        waSelectedRecipients = [];
        renderWhatsAppMarketingTab();
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error: ' + error.message + '</p></div>';
    }
}

function renderWhatsAppMarketingTab() {
    const container = document.getElementById('whatsapp-marketing-tab');
    if (!container) return;

    const configured = waApiStatus && waApiStatus.configured;
    const withPhone = waRecipients.filter(r => r.hasPhone);

    let html = '';

    // ── API Status Banner ──
    if (configured) {
        html += `<div style="padding:14px 18px; background:#ecfdf5; border:1px solid #86efac; border-radius:10px; margin-bottom:20px; display:flex; align-items:center; gap:12px; justify-content:space-between; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:12px;">
                <i class="fab fa-whatsapp" style="color:#25d366; font-size:22px;"></i>
                <div style="font-size:13px; color:#065f46; line-height:1.6;">
                    <strong>WhatsApp Cloud API Connected</strong> — Sender: <strong>${waApiStatus.senderNumber || '9895909666'}</strong> (testing — will change to Dubai number).
                    Phone ID: ${waApiStatus.phoneNumberId || 'N/A'}
                </div>
            </div>
            <button onclick="waTestConnection()" style="padding:8px 16px; background:#25d366; color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; white-space:nowrap;">
                <i class="fab fa-whatsapp"></i> Test Connection
            </button>
        </div>
        <div id="waTestResult" style="display:none; margin-bottom:16px;"></div>`;
    } else {
        html += `<div style="padding:16px 20px; background:#fef2f2; border:1px solid #fca5a5; border-radius:10px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
                <i class="fab fa-whatsapp" style="color:#dc2626; font-size:22px;"></i>
                <strong style="color:#991b1b; font-size:15px;">WhatsApp API Not Configured</strong>
            </div>
            <div style="font-size:13px; color:#7f1d1d; line-height:1.8;">
                To enable WhatsApp Marketing, set these environment variables on your backend server:<br>
                <code style="background:#fef2f2; padding:2px 6px; border-radius:4px; border:1px solid #fca5a5;">WHATSAPP_PHONE_NUMBER_ID</code> — Your WhatsApp Business phone number ID<br>
                <code style="background:#fef2f2; padding:2px 6px; border-radius:4px; border:1px solid #fca5a5;">WHATSAPP_ACCESS_TOKEN</code> — Permanent access token from Meta Business<br><br>
                <strong>How to get these:</strong><br>
                1. Go to <a href="https://developers.facebook.com" target="_blank" style="color:#2563eb;">developers.facebook.com</a> → Create App → WhatsApp<br>
                2. Add your phone number (9895909666 for testing)<br>
                3. Get Phone Number ID + Access Token from API Setup page<br>
                4. Add them to your Render.com environment variables
            </div>
        </div>`;
    }

    // ── Quick Send Section ──
    html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px;">
        <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 16px 0;"><i class="fab fa-whatsapp" style="color:#25d366; margin-right:8px;"></i>Quick Send</h3>
            <div style="margin-bottom:12px;">
                <label style="font-size:13px; color:#64748b; font-weight:500; display:block; margin-bottom:4px;">Phone Number (with country code)</label>
                <input type="text" id="waQuickPhone" placeholder="e.g. 919895909666" style="width:100%; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
                <label style="font-size:13px; color:#64748b; font-weight:500; display:block; margin-bottom:4px;">Message</label>
                <textarea id="waQuickMessage" rows="4" placeholder="Type your WhatsApp message..." style="width:100%; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; resize:vertical; box-sizing:border-box;"></textarea>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <button onclick="waInsertLink('waQuickMessage')" style="padding:6px 12px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px;">
                    <i class="fas fa-link"></i> Insert Website Link
                </button>
                <button onclick="waInsertCustomLink('waQuickMessage')" style="padding:6px 12px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px;">
                    <i class="fas fa-external-link-alt"></i> Insert Custom Link
                </button>
            </div>
            <button onclick="waSendQuick()" style="padding:10px 20px; background:#25d366; color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; display:flex; align-items:center; gap:8px;" ${!configured ? 'disabled title="Configure WhatsApp API first"' : ''}>
                <i class="fab fa-whatsapp"></i> Send Message
            </button>
        </div>

        <!-- Stats -->
        <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
            <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 16px 0;">Summary</h3>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div style="padding:14px; background:#f0fdf4; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:800; color:#059669;">${withPhone.length}</div>
                    <div style="font-size:11px; color:#64748b;">With Phone</div>
                </div>
                <div style="padding:14px; background:#fef2f2; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:800; color:#dc2626;">${waRecipients.length - withPhone.length}</div>
                    <div style="font-size:11px; color:#64748b;">No Phone</div>
                </div>
                <div style="padding:14px; background:#f0f9ff; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:800; color:#0369a1;">${waRecipients.length}</div>
                    <div style="font-size:11px; color:#64748b;">Total Users</div>
                </div>
                <div style="padding:14px; background:#f5f3ff; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:800; color:#7c3aed;">${waCampaigns.length}</div>
                    <div style="font-size:11px; color:#64748b;">Campaigns Sent</div>
                </div>
            </div>
        </div>
    </div>`;

    // ── Bulk Campaign Section ──
    html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px;">
        <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 16px 0;"><i class="fas fa-bullhorn" style="color:#25d366; margin-right:8px;"></i>Bulk WhatsApp Campaign</h3>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
            <div>
                <label style="font-size:13px; color:#64748b; font-weight:500; display:block; margin-bottom:4px;">Campaign Name</label>
                <input type="text" id="waCampaignName" placeholder="e.g. February Promo" style="width:100%; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:13px; color:#64748b; font-weight:500; display:block; margin-bottom:4px;">Filter by Type</label>
                <select id="waTypeFilter" onchange="waFilterRecipients()" style="width:100%; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; box-sizing:border-box;">
                    <option value="all">All Users with Phone</option>
                    <option value="contractor">Contractors Only</option>
                    <option value="designer">Designers Only</option>
                    <option value="prospect">Prospects Only</option>
                </select>
            </div>
        </div>

        <div style="margin-bottom:12px;">
            <label style="font-size:13px; color:#64748b; font-weight:500; display:block; margin-bottom:4px;">Quick Templates</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button onclick="waUseTemplate('welcome')" style="padding:6px 12px; background:#ecfdf5; border:1px solid #86efac; border-radius:6px; cursor:pointer; font-size:12px; color:#065f46;">Welcome</button>
                <button onclick="waUseTemplate('promo')" style="padding:6px 12px; background:#eff6ff; border:1px solid #93c5fd; border-radius:6px; cursor:pointer; font-size:12px; color:#1e40af;">Promotion</button>
                <button onclick="waUseTemplate('update')" style="padding:6px 12px; background:#fef3c7; border:1px solid #fcd34d; border-radius:6px; cursor:pointer; font-size:12px; color:#92400e;">Platform Update</button>
                <button onclick="waUseTemplate('opportunity')" style="padding:6px 12px; background:#f3e8ff; border:1px solid #c084fc; border-radius:6px; cursor:pointer; font-size:12px; color:#6b21a8;">New Opportunity</button>
                <button onclick="waUseTemplate('follow_up')" style="padding:6px 12px; background:#fce7f3; border:1px solid #f9a8d4; border-radius:6px; cursor:pointer; font-size:12px; color:#9d174d;">Follow Up</button>
            </div>
        </div>

        <div style="margin-bottom:16px;">
            <label style="font-size:13px; color:#64748b; font-weight:500; display:block; margin-bottom:4px;">Message Template <span style="color:#94a3b8;">(Use {{name}} for personalization)</span></label>
            <textarea id="waBulkMessage" rows="6" placeholder="Hello {{name}}, we have exciting updates at SteelConnect..." style="width:100%; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; resize:vertical; box-sizing:border-box;"></textarea>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px;">
                <div style="display:flex; gap:8px;">
                    <button onclick="waInsertLink('waBulkMessage')" style="padding:5px 10px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:11px; display:flex; align-items:center; gap:4px;">
                        <i class="fas fa-link"></i> Website Link
                    </button>
                    <button onclick="waInsertCustomLink('waBulkMessage')" style="padding:5px 10px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:11px; display:flex; align-items:center; gap:4px;">
                        <i class="fas fa-external-link-alt"></i> Custom Link
                    </button>
                    <button onclick="waInsertText('waBulkMessage', '{{name}}')" style="padding:5px 10px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:11px;">+ Name</button>
                </div>
                <div style="font-size:12px; color:#94a3b8;">Characters: <span id="waCharCount">0</span> / 4096</div>
            </div>
        </div>

        <!-- Recipients Table -->
        <div style="margin-bottom:16px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:14px; font-weight:600; color:#334155;">Recipients (<span id="waSelectedCount">0</span> selected)</span>
                <div style="display:flex; gap:8px;">
                    <button onclick="waSelectAll()" style="padding:6px 12px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:12px;">Select All</button>
                    <button onclick="waDeselectAll()" style="padding:6px 12px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:12px;">Deselect All</button>
                </div>
            </div>
            <div id="waRecipientsTable" style="max-height:300px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;"></div>
        </div>

        <button onclick="waSendBulk()" style="padding:12px 24px; background:#25d366; color:white; border:none; border-radius:8px; cursor:pointer; font-size:15px; font-weight:700; display:flex; align-items:center; gap:8px;" ${!configured ? 'disabled title="Configure WhatsApp API first"' : ''}>
            <i class="fab fa-whatsapp"></i> Send WhatsApp Campaign
        </button>
    </div>`;

    // ── Campaign History ──
    if (waCampaigns.length > 0) {
        html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px;">
            <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 16px 0;"><i class="fas fa-history" style="margin-right:8px;"></i>Campaign History</h3>
            <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:10px 14px; text-align:left; font-weight:600; color:#475569;">Campaign</th>
                        <th style="padding:10px 14px; text-align:left; font-weight:600; color:#475569;">Recipients</th>
                        <th style="padding:10px 14px; text-align:left; font-weight:600; color:#475569;">Sent</th>
                        <th style="padding:10px 14px; text-align:left; font-weight:600; color:#475569;">Failed</th>
                        <th style="padding:10px 14px; text-align:left; font-weight:600; color:#475569;">Sender</th>
                        <th style="padding:10px 14px; text-align:left; font-weight:600; color:#475569;">Date</th>
                    </tr>
                </thead>
                <tbody>`;

        waCampaigns.forEach(c => {
            const date = c.createdAt ? new Date(c.createdAt).toLocaleString() : '—';
            html += `<tr style="border-top:1px solid #f1f5f9;">
                <td style="padding:10px 14px; font-weight:500; color:#1e293b;">${c.name || 'Unnamed'}</td>
                <td style="padding:10px 14px; color:#64748b;">${c.totalRecipients}</td>
                <td style="padding:10px 14px;"><span style="color:#059669; font-weight:600;">${c.sent}</span></td>
                <td style="padding:10px 14px;"><span style="color:#dc2626; font-weight:600;">${c.failed}</span></td>
                <td style="padding:10px 14px; color:#64748b;">${c.sentBy || 'admin'}</td>
                <td style="padding:10px 14px; color:#64748b; white-space:nowrap;">${date}</td>
            </tr>`;
        });
        html += `</tbody></table></div></div>`;
    }

    container.innerHTML = html;

    // Render recipients table
    waFilterRecipients();

    // Character counter
    const msgInput = document.getElementById('waBulkMessage');
    if (msgInput) {
        msgInput.addEventListener('input', () => {
            const countEl = document.getElementById('waCharCount');
            if (countEl) countEl.textContent = msgInput.value.length;
        });
    }
}

function waFilterRecipients() {
    const typeFilter = document.getElementById('waTypeFilter')?.value || 'all';
    const tableEl = document.getElementById('waRecipientsTable');
    if (!tableEl) return;

    const filtered = waRecipients.filter(r => {
        if (!r.hasPhone) return false;
        if (typeFilter === 'all') return true;
        return r.type === typeFilter;
    });

    waSelectedRecipients = filtered.map(r => ({ phone: r.phone, name: r.name }));

    let html = `<table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
            <tr style="background:#f8fafc; position:sticky; top:0;">
                <th style="padding:8px 12px; text-align:left; width:40px;"><input type="checkbox" checked onchange="waToggleAll(this.checked)"></th>
                <th style="padding:8px 12px; text-align:left; font-weight:600; color:#475569;">Name</th>
                <th style="padding:8px 12px; text-align:left; font-weight:600; color:#475569;">Phone</th>
                <th style="padding:8px 12px; text-align:left; font-weight:600; color:#475569;">Type</th>
                <th style="padding:8px 12px; text-align:left; font-weight:600; color:#475569;">Email</th>
            </tr>
        </thead>
        <tbody>`;

    if (filtered.length === 0) {
        html += `<tr><td colspan="5" style="padding:20px; text-align:center; color:#94a3b8;">No recipients with phone numbers found</td></tr>`;
    } else {
        filtered.forEach((r, i) => {
            const typeBadge = r.type === 'contractor' ? '#3b82f6' : r.type === 'designer' ? '#8b5cf6' : '#f59e0b';
            html += `<tr style="border-top:1px solid #f1f5f9;">
                <td style="padding:8px 12px;"><input type="checkbox" checked class="wa-recipient-cb" data-index="${i}" data-phone="${r.phone}" data-name="${r.name || ''}" onchange="waUpdateSelected()"></td>
                <td style="padding:8px 12px; font-weight:500; color:#1e293b;">${r.name || '—'}</td>
                <td style="padding:8px 12px; color:#334155; font-family:monospace;">${r.phone}</td>
                <td style="padding:8px 12px;"><span style="padding:2px 8px; border-radius:6px; background:${typeBadge}20; color:${typeBadge}; font-size:11px; font-weight:600;">${r.type}</span></td>
                <td style="padding:8px 12px; color:#64748b;">${r.email || '—'}</td>
            </tr>`;
        });
    }

    html += `</tbody></table>`;
    tableEl.innerHTML = html;
    waUpdateSelected();
}

function waToggleAll(checked) {
    document.querySelectorAll('.wa-recipient-cb').forEach(cb => { cb.checked = checked; });
    waUpdateSelected();
}

function waSelectAll() {
    document.querySelectorAll('.wa-recipient-cb').forEach(cb => { cb.checked = true; });
    waUpdateSelected();
}

function waDeselectAll() {
    document.querySelectorAll('.wa-recipient-cb').forEach(cb => { cb.checked = false; });
    waUpdateSelected();
}

function waUpdateSelected() {
    waSelectedRecipients = [];
    document.querySelectorAll('.wa-recipient-cb:checked').forEach(cb => {
        waSelectedRecipients.push({ phone: cb.dataset.phone, name: cb.dataset.name || '' });
    });
    const countEl = document.getElementById('waSelectedCount');
    if (countEl) countEl.textContent = waSelectedRecipients.length;
}

async function waSendQuick() {
    const phone = document.getElementById('waQuickPhone')?.value?.trim();
    const message = document.getElementById('waQuickMessage')?.value?.trim();

    if (!phone) { showNotification('Enter a phone number', 'error'); return; }
    if (!message) { showNotification('Enter a message', 'error'); return; }

    try {
        showNotification('Sending WhatsApp message...', 'info');
        const response = await apiCall('/whatsapp/send-single', 'POST', { phone, message });
        if (response.success) {
            showNotification('WhatsApp message sent successfully!', 'success');
            document.getElementById('waQuickMessage').value = '';
        } else {
            showNotification('Failed: ' + (response.message || response.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function waSendBulk() {
    const campaignName = document.getElementById('waCampaignName')?.value?.trim() || '';
    const message = document.getElementById('waBulkMessage')?.value?.trim();

    if (!message) { showNotification('Enter a message template', 'error'); return; }
    if (waSelectedRecipients.length === 0) { showNotification('Select at least one recipient', 'error'); return; }

    if (!confirm(`Send WhatsApp message to ${waSelectedRecipients.length} recipient(s)?`)) return;

    try {
        showNotification(`Sending to ${waSelectedRecipients.length} recipients... This may take a while.`, 'info');
        const response = await apiCall('/whatsapp/send', 'POST', {
            recipients: waSelectedRecipients,
            message,
            campaignName
        });

        if (response.success) {
            showNotification(`Campaign sent! ${response.sent} delivered, ${response.failed} failed.`, 'success');
            // Reload to show updated campaigns
            loadWhatsAppMarketingData();
        } else {
            showNotification('Failed: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

const WA_WEBSITE_URL = 'https://steelconnectapp.com';

const WA_TEMPLATES = {
    welcome: `Hello {{name}},

Welcome to *SteelConnect* — the professional platform connecting contractors with skilled steel designers.

We're excited to have you on board! Start exploring projects and connect with industry professionals today.

Visit us: ${WA_WEBSITE_URL}

Best regards,
SteelConnect Team`,

    promo: `Hi {{name}},

We have an exclusive offer for you at *SteelConnect*!

For a limited time, get access to premium features and connect with top steel construction professionals.

Check it out now: ${WA_WEBSITE_URL}

Don't miss out!
SteelConnect Team`,

    update: `Hi {{name}},

We've just launched exciting new features on *SteelConnect*:

- Improved project matching
- Faster estimation tools
- Enhanced communication

Log in to see what's new: ${WA_WEBSITE_URL}

SteelConnect Team`,

    opportunity: `Hi {{name}},

New opportunities are available on *SteelConnect*!

Contractors are posting new steel construction projects and looking for skilled professionals like you.

Browse available projects: ${WA_WEBSITE_URL}

Best regards,
SteelConnect Team`,

    follow_up: `Hi {{name}},

We noticed you haven't been active on *SteelConnect* recently.

There are new projects and professionals waiting for you. Don't miss out on great opportunities!

Come back and explore: ${WA_WEBSITE_URL}

We'd love to have you back!
SteelConnect Team`
};

function waInsertLink(textareaId) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const linkText = `\n\nVisit us: ${WA_WEBSITE_URL}`;
    textarea.value = text.substring(0, start) + linkText + text.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + linkText.length;
    if (textareaId === 'waBulkMessage') {
        const countEl = document.getElementById('waCharCount');
        if (countEl) countEl.textContent = textarea.value.length;
    }
}

function waInsertCustomLink(textareaId) {
    const url = prompt('Enter the URL to insert:', 'https://');
    if (!url || url === 'https://') return;
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const linkText = `\n${url}`;
    textarea.value = text.substring(0, start) + linkText + text.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + linkText.length;
    if (textareaId === 'waBulkMessage') {
        const countEl = document.getElementById('waCharCount');
        if (countEl) countEl.textContent = textarea.value.length;
    }
}

function waInsertText(textareaId, text) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    textarea.value = val.substring(0, start) + text + val.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    if (textareaId === 'waBulkMessage') {
        const countEl = document.getElementById('waCharCount');
        if (countEl) countEl.textContent = textarea.value.length;
    }
}

function waUseTemplate(templateKey) {
    const template = WA_TEMPLATES[templateKey];
    if (!template) return;
    const textarea = document.getElementById('waBulkMessage');
    if (!textarea) return;
    textarea.value = template;
    const countEl = document.getElementById('waCharCount');
    if (countEl) countEl.textContent = textarea.value.length;
}

async function waTestConnection() {
    const resultDiv = document.getElementById('waTestResult');
    if (!resultDiv) return;
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="padding:14px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; font-size:13px; color:#0369a1;"><i class="fas fa-spinner fa-spin"></i> Testing WhatsApp connection... sending test to 919895909666...</div>';

    try {
        const response = await apiCall('/whatsapp/test', 'POST', { phone: '919895909666' });

        let html = `<div style="padding:16px; background:white; border:1px solid #e2e8f0; border-radius:10px;">
            <h4 style="font-size:15px; margin:0 0 12px 0; color:#0f172a;">WhatsApp Test Results</h4>
            <p style="font-size:13px; color:#64748b; margin:0 0 12px 0;">Phone: <strong>${response.testPhone}</strong> | Phone Number ID: <strong>${response.phoneNumberId}</strong></p>`;

        // Text message result
        const text = response.textMessage;
        html += `<div style="padding:10px 14px; margin-bottom:8px; border-radius:6px; background:${text?.sent ? '#ecfdf5' : '#fef2f2'}; border:1px solid ${text?.sent ? '#86efac' : '#fca5a5'};">
            <strong style="color:${text?.sent ? '#059669' : '#dc2626'};">Text Message: ${text?.sent ? 'SENT' : 'FAILED'}</strong>
            <span style="font-size:12px; color:#64748b;"> (HTTP ${text?.httpStatus})</span>
            ${text?.messageId ? `<br><span style="font-size:12px; color:#059669;">Message ID: ${text.messageId}</span>` : ''}
            ${text?.error ? `<br><span style="font-size:12px; color:#dc2626;">Error: ${text.error.message || JSON.stringify(text.error)}</span>` : ''}
        </div>`;

        // Template message result
        const tmpl = response.templateMessage;
        html += `<div style="padding:10px 14px; margin-bottom:8px; border-radius:6px; background:${tmpl?.sent ? '#ecfdf5' : '#fef2f2'}; border:1px solid ${tmpl?.sent ? '#86efac' : '#fca5a5'};">
            <strong style="color:${tmpl?.sent ? '#059669' : '#dc2626'};">Template Message (hello_world): ${tmpl?.sent ? 'SENT' : 'FAILED'}</strong>
            <span style="font-size:12px; color:#64748b;"> (HTTP ${tmpl?.httpStatus})</span>
            ${tmpl?.messageId ? `<br><span style="font-size:12px; color:#059669;">Message ID: ${tmpl.messageId}</span>` : ''}
            ${tmpl?.error ? `<br><span style="font-size:12px; color:#dc2626;">Error: ${tmpl.error.message || JSON.stringify(tmpl.error)}</span>` : ''}
        </div>`;

        if (!text?.sent && !tmpl?.sent) {
            html += `<div style="padding:10px 14px; background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; font-size:13px; color:#92400e;">
                <strong>Troubleshooting:</strong><br>
                1. Make sure your phone number 9895909666 is added to WhatsApp Business account<br>
                2. The access token may have expired — regenerate on Meta Developer Portal<br>
                3. For first-time messages, you MUST first send "hello" from 9895909666 to your WhatsApp Business number<br>
                4. Check that the phone number ID matches the number registered in Meta Business
            </div>`;
        }

        html += `</div>`;
        resultDiv.innerHTML = html;
    } catch (error) {
        resultDiv.innerHTML = `<div style="padding:14px; background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; font-size:13px; color:#991b1b;">Error: ${error.message}</div>`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  ADMIN ACTIVITY LOGS TAB
// ═══════════════════════════════════════════════════════════════════════════════

const ACTIVITY_CATEGORY_COLORS = {
    // Admin activity categories
    'User Management':    { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    'Profile Review':     { bg: '#dcfce7', text: '#166534', border: '#86efac' },
    'Estimation':         { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    'Support':            { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
    'Marketing':          { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
    'Community':          { bg: '#f3e8ff', text: '#6b21a8', border: '#c084fc' },
    'Announcements':      { bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' },
    'Business Analytics': { bg: '#fff7ed', text: '#9a3412', border: '#fdba74' },
    'System Admin':       { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
    'Operations Portal':  { bg: '#f0f9ff', text: '#075985', border: '#7dd3fc' },
    'Dashboard':          { bg: '#f5f3ff', text: '#5b21b6', border: '#a78bfa' },
    'Bulk Email':         { bg: '#fdf4ff', text: '#86198f', border: '#e879f9' },
    'Messaging':          { bg: '#f0fdfa', text: '#134e4a', border: '#5eead4' },
    'Chatbot':            { bg: '#fffbeb', text: '#78350f', border: '#fbbf24' },
    'Jobs':               { bg: '#f1f5f9', text: '#334155', border: '#94a3b8' },
    'Quotes':             { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' },
    // User activity categories
    'User Registration':  { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' },
    'User Login':         { bg: '#d1fae5', text: '#065f46', border: '#34d399' },
    'Profile Completion': { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
    'Job Posting':        { bg: '#e0e7ff', text: '#3730a3', border: '#818cf8' },
    'Quote Submission':   { bg: '#fce7f3', text: '#9d174d', border: '#f472b6' },
    'Estimation Request': { bg: '#fff7ed', text: '#9a3412', border: '#fb923c' },
    'User Message':       { bg: '#f0fdfa', text: '#134e4a', border: '#2dd4bf' },
    'Visitor Activity':   { bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' },
};

let activityLogsHoursFilter = 24;

async function loadActivityLogsData() {
    const container = document.getElementById('activity-logs-tab');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading comprehensive activity report...</div>';

    try {
        // Fetch comprehensive report (admin + user activities + visitor stats)
        const response = await apiCall(`/comprehensive-activity-report?hours=${activityLogsHoursFilter}`);
        if (response.success) {
            state.activityLogs = response.adminActivities || [];
            state.userActivityLogs = response.userActivities || [];
            state.visitorStats = response.visitorStats || null;
            renderActivityLogsTab();
        } else {
            // Fallback to old endpoint
            const fallback = await apiCall(`/activity-logs?hours=${activityLogsHoursFilter}`);
            if (fallback.success) {
                state.activityLogs = fallback.data || [];
                state.userActivityLogs = [];
                state.visitorStats = null;
                renderActivityLogsTab();
            } else {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load activity logs</p></div>';
            }
        }
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error: ' + error.message + '</p></div>';
    }
}

function renderActivityLogsTab() {
    const container = document.getElementById('activity-logs-tab');
    if (!container) return;

    const adminLogs = state.activityLogs || [];
    const userLogs = state.userActivityLogs || [];
    const visitorStats = state.visitorStats || null;
    const totalActivities = adminLogs.length + userLogs.length;

    // Build combined category summary
    const catSummary = {};
    adminLogs.forEach(l => { catSummary[l.category || 'Other'] = (catSummary[l.category || 'Other'] || 0) + 1; });
    userLogs.forEach(l => { catSummary[l.category || 'Other'] = (catSummary[l.category || 'Other'] || 0) + 1; });
    const sortedCats = Object.entries(catSummary).sort((a, b) => b[1] - a[1]);

    let html = `
    <!-- Controls Bar -->
    <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:14px; color:#64748b; font-weight:500;">Period:</label>
            <select id="activityHoursFilter" onchange="changeActivityLogsPeriod(this.value)" style="padding:8px 14px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; background:#fff; cursor:pointer;">
                <option value="1" ${activityLogsHoursFilter === 1 ? 'selected' : ''}>Last 1 Hour</option>
                <option value="3" ${activityLogsHoursFilter === 3 ? 'selected' : ''}>Last 3 Hours</option>
                <option value="6" ${activityLogsHoursFilter === 6 ? 'selected' : ''}>Last 6 Hours</option>
                <option value="12" ${activityLogsHoursFilter === 12 ? 'selected' : ''}>Last 12 Hours</option>
                <option value="24" ${activityLogsHoursFilter === 24 ? 'selected' : ''}>Last 24 Hours</option>
            </select>
        </div>
        <button onclick="loadActivityLogsData()" style="padding:8px 16px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:6px;">
            <i class="fas fa-sync-alt"></i> Refresh
        </button>
        <button onclick="sendActivityReportNow()" style="padding:8px 16px; background:#2563eb; color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:6px;">
            <i class="fas fa-paper-plane"></i> Send Report Now
        </button>
        <button onclick="downloadActivityReport()" style="padding:8px 16px; background:#059669; color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:6px;">
            <i class="fas fa-file-pdf"></i> Download PDF
        </button>
    </div>

    <!-- Info Banner -->
    <div style="padding:14px 18px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; margin-bottom:20px; display:flex; align-items:center; gap:12px;">
        <i class="fas fa-bell" style="color:#0284c7; font-size:18px;"></i>
        <div style="font-size:13px; color:#0369a1; line-height:1.6;">
            <strong>Real-time notifications</strong> are sent to <strong>sabincn676@gmail.com</strong> &amp; <strong>9895909666</strong> (WhatsApp) for every activity.
            All activities (admin actions, user registrations, logins, job posts, quotes, estimations, visitor sessions) are tracked with visitor analytics included.
        </div>
    </div>

    <!-- Summary Stats -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:14px; margin-bottom:24px;">
        <div style="padding:18px; background:white; border:1px solid #e2e8f0; border-radius:12px; text-align:center;">
            <div style="font-size:26px; font-weight:800; color:#1e293b;">${totalActivities}</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">Total Activities</div>
        </div>
        <div style="padding:18px; background:white; border:1px solid #e2e8f0; border-radius:12px; text-align:center;">
            <div style="font-size:26px; font-weight:800; color:#7c3aed;">${adminLogs.length}</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">Admin Actions</div>
        </div>
        <div style="padding:18px; background:white; border:1px solid #e2e8f0; border-radius:12px; text-align:center;">
            <div style="font-size:26px; font-weight:800; color:#059669;">${userLogs.length}</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">User Activities</div>
        </div>
        <div style="padding:18px; background:white; border:1px solid #e2e8f0; border-radius:12px; text-align:center;">
            <div style="font-size:26px; font-weight:800; color:#0369a1;">${visitorStats ? visitorStats.todayTotal : 0}</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">Visitors Today</div>
        </div>
        <div style="padding:18px; background:white; border:1px solid #e2e8f0; border-radius:12px; text-align:center;">
            <div style="font-size:26px; font-weight:800; color:#ea580c;">${visitorStats ? visitorStats.activeNow : 0}</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">Active Now</div>
        </div>
        <div style="padding:18px; background:white; border:1px solid #e2e8f0; border-radius:12px; text-align:center;">
            <div style="font-size:26px; font-weight:800; color:#2563eb;">${sortedCats.length}</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">Categories</div>
        </div>
    </div>`;

    // ── Visitor Analytics Section ──
    if (visitorStats && visitorStats.todayTotal > 0) {
        const avgMin = Math.floor((visitorStats.avgTimeSeconds || 0) / 60);
        const avgSec = (visitorStats.avgTimeSeconds || 0) % 60;
        html += `<div style="background:white; border:1px solid #bae6fd; border-radius:12px; padding:20px; margin-bottom:24px;">
            <h3 style="font-size:16px; font-weight:700; color:#0c4a6e; margin:0 0 16px 0;"><i class="fas fa-chart-line" style="margin-right:8px;"></i>Visitor Analytics Summary</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin-bottom:16px;">
                <div style="padding:12px; background:#f0f9ff; border-radius:8px; text-align:center;">
                    <div style="font-size:20px; font-weight:800; color:#0369a1;">${visitorStats.todayTotal}</div>
                    <div style="font-size:11px; color:#64748b;">Today</div>
                </div>
                <div style="padding:12px; background:#ecfdf5; border-radius:8px; text-align:center;">
                    <div style="font-size:20px; font-weight:800; color:#059669;">${visitorStats.activeNow}</div>
                    <div style="font-size:11px; color:#64748b;">Active Now</div>
                </div>
                <div style="padding:12px; background:#f5f3ff; border-radius:8px; text-align:center;">
                    <div style="font-size:20px; font-weight:800; color:#7c3aed;">${visitorStats.last24hTotal}</div>
                    <div style="font-size:11px; color:#64748b;">Last 24h</div>
                </div>
                <div style="padding:12px; background:#fff7ed; border-radius:8px; text-align:center;">
                    <div style="font-size:20px; font-weight:800; color:#ea580c;">${avgMin}m ${avgSec}s</div>
                    <div style="font-size:11px; color:#64748b;">Avg Time</div>
                </div>
                <div style="padding:12px; background:#fdf4ff; border-radius:8px; text-align:center;">
                    <div style="font-size:20px; font-weight:800; color:#a21caf;">${visitorStats.identifiedVisitors}</div>
                    <div style="font-size:11px; color:#64748b;">Identified</div>
                </div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:13px; color:#334155;">
                <span><strong>Devices:</strong> Desktop: ${visitorStats.devices?.Desktop || 0} | Mobile: ${visitorStats.devices?.Mobile || 0} | Tablet: ${visitorStats.devices?.Tablet || 0}</span>
            </div>`;

        if (visitorStats.topCountries && visitorStats.topCountries.length > 0) {
            html += `<div style="margin-top:10px; font-size:13px;"><strong>Top Countries:</strong> ${visitorStats.topCountries.map(([c, n]) => `<span style="display:inline-block; padding:2px 8px; margin:2px; background:#ecfdf5; color:#065f46; border-radius:10px; font-size:11px;">${c}: ${n}</span>`).join('')}</div>`;
        }

        if (visitorStats.recentVisitors && visitorStats.recentVisitors.length > 0) {
            html += `<h4 style="font-size:14px; font-weight:600; color:#334155; margin:14px 0 8px 0;">Recent Visitors</h4>
            <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <tr style="background:#f1f5f9;">
                    <th style="padding:6px 10px; text-align:left; font-weight:600; color:#475569;">Visitor</th>
                    <th style="padding:6px 10px; text-align:left; font-weight:600; color:#475569;">Location</th>
                    <th style="padding:6px 10px; text-align:left; font-weight:600; color:#475569;">Device</th>
                    <th style="padding:6px 10px; text-align:left; font-weight:600; color:#475569;">Duration</th>
                    <th style="padding:6px 10px; text-align:left; font-weight:600; color:#475569;">Pages</th>
                </tr>`;
            visitorStats.recentVisitors.forEach(v => {
                const mins = Math.floor(v.timeSpent / 60);
                html += `<tr style="border-top:1px solid #f1f5f9;">
                    <td style="padding:6px 10px; color:#334155;">${v.email}</td>
                    <td style="padding:6px 10px; color:#64748b;">${v.country}${v.city ? ', ' + v.city : ''}</td>
                    <td style="padding:6px 10px; color:#64748b;">${v.device} / ${v.browser}</td>
                    <td style="padding:6px 10px; color:#64748b;">${mins}m</td>
                    <td style="padding:6px 10px; color:#64748b;">${v.pages}</td>
                </tr>`;
            });
            html += `</table></div>`;
        }
        html += `</div>`;
    }

    // Category Breakdown
    if (sortedCats.length > 0) {
        html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px;">
            <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 16px 0;">Activity Breakdown (All)</h3>`;
        sortedCats.forEach(([cat, count]) => {
            const colors = ACTIVITY_CATEGORY_COLORS[cat] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
            const pct = totalActivities > 0 ? Math.round((count / totalActivities) * 100) : 0;
            html += `<div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
                <span style="display:inline-block; min-width:160px; padding:4px 12px; border-radius:20px; background:${colors.bg}; color:${colors.text}; font-size:12px; font-weight:600; text-align:center; border:1px solid ${colors.border};">${cat}</span>
                <div style="flex:1; height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:${colors.border}; border-radius:4px; transition:width 0.3s;"></div>
                </div>
                <span style="min-width:40px; text-align:right; font-size:14px; font-weight:700; color:#1e293b;">${count}</span>
            </div>`;
        });
        html += `</div>`;
    }

    // ── User Activities Section ──
    if (userLogs.length > 0) {
        const userGrouped = {};
        userLogs.forEach(l => {
            const cat = l.category || 'Other';
            if (!userGrouped[cat]) userGrouped[cat] = [];
            userGrouped[cat].push(l);
        });

        html += `<h3 style="font-size:17px; font-weight:700; color:#059669; margin:24px 0 16px 0;"><i class="fas fa-users" style="margin-right:8px;"></i>User Activities (${userLogs.length})</h3>`;

        const sortedUserGroups = Object.entries(userGrouped).sort((a, b) => b[1].length - a[1].length);
        for (const [category, items] of sortedUserGroups) {
            const colors = ACTIVITY_CATEGORY_COLORS[category] || { bg: '#ecfdf5', text: '#065f46', border: '#34d399' };
            html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:16px; overflow:hidden;">
                <div style="padding:14px 20px; background:${colors.bg}; border-bottom:2px solid ${colors.border}; display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:15px; font-weight:700; color:${colors.text};">${category}</span>
                    <span style="background:${colors.border}; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:700;">${items.length}</span>
                </div>
                <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8fafc;">
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Time</th>
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">User</th>
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Type</th>
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Action</th>
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Details</th>
                        </tr>
                    </thead>
                    <tbody>`;

            items.forEach(item => {
                const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '—';
                const user = item.userEmail ? item.userEmail.split('@')[0] : (item.userName || 'unknown');
                const userType = item.userType || '—';
                const action = item.action || '—';
                const desc = item.description || '—';
                html += `<tr style="border-top:1px solid #f1f5f9;">
                    <td style="padding:10px 16px; font-size:13px; color:#64748b; white-space:nowrap;">${time}</td>
                    <td style="padding:10px 16px; font-size:13px; color:#334155; font-weight:500;">${user}</td>
                    <td style="padding:10px 16px;"><span style="padding:2px 8px; border-radius:6px; background:#f0fdf4; color:#065f46; font-size:11px; font-weight:600;">${userType}</span></td>
                    <td style="padding:10px 16px;">
                        <span style="display:inline-block; padding:3px 10px; border-radius:6px; background:${colors.bg}; color:${colors.text}; font-size:12px; font-weight:600;">${action}</span>
                    </td>
                    <td style="padding:10px 16px; font-size:13px; color:#475569; max-width:400px; word-break:break-word;">${desc}</td>
                </tr>`;
            });
            html += `</tbody></table></div></div>`;
        }
    }

    // ── Admin Activities Section ──
    if (adminLogs.length > 0) {
        const grouped = {};
        adminLogs.forEach(l => {
            const cat = l.category || 'Other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(l);
        });

        html += `<h3 style="font-size:17px; font-weight:700; color:#7c3aed; margin:24px 0 16px 0;"><i class="fas fa-shield-alt" style="margin-right:8px;"></i>Admin Activities (${adminLogs.length})</h3>`;

        const sortedGroups = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
        for (const [category, items] of sortedGroups) {
            const colors = ACTIVITY_CATEGORY_COLORS[category] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
            html += `<div style="background:white; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:16px; overflow:hidden;">
                <div style="padding:14px 20px; background:${colors.bg}; border-bottom:2px solid ${colors.border}; display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:15px; font-weight:700; color:${colors.text};">${category}</span>
                    <span style="background:${colors.border}; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:700;">${items.length}</span>
                </div>
                <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8fafc;">
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Time</th>
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Admin</th>
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Action</th>
                            <th style="padding:10px 16px; text-align:left; font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Details</th>
                        </tr>
                    </thead>
                    <tbody>`;

            items.forEach(item => {
                const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '—';
                const adminName = item.adminEmail ? item.adminEmail.split('@')[0] : 'system';
                const action = item.action || '—';
                const desc = item.description || '—';
                html += `<tr style="border-top:1px solid #f1f5f9;">
                    <td style="padding:10px 16px; font-size:13px; color:#64748b; white-space:nowrap;">${time}</td>
                    <td style="padding:10px 16px; font-size:13px; color:#334155; font-weight:500;">${adminName}</td>
                    <td style="padding:10px 16px;">
                        <span style="display:inline-block; padding:3px 10px; border-radius:6px; background:${colors.bg}; color:${colors.text}; font-size:12px; font-weight:600;">${action}</span>
                    </td>
                    <td style="padding:10px 16px; font-size:13px; color:#475569; max-width:400px; word-break:break-word;">${desc}</td>
                </tr>`;
            });
            html += `</tbody></table></div></div>`;
        }
    }

    // No activities at all
    if (totalActivities === 0) {
        html += `<div style="text-align:center; padding:60px 20px; background:white; border:1px solid #e2e8f0; border-radius:12px;">
            <i class="fas fa-clipboard-check" style="font-size:48px; color:#cbd5e1; margin-bottom:16px;"></i>
            <p style="font-size:16px; color:#64748b;">No activities recorded in this period.</p>
        </div>`;
    }

    container.innerHTML = html;
}

function changeActivityLogsPeriod(hours) {
    activityLogsHoursFilter = parseInt(hours);
    state.activityLogs = []; // Force reload
    loadActivityLogsData();
}

async function sendActivityReportNow() {
    try {
        showNotification('Sending activity report...', 'info');
        const response = await apiCall('/activity-report/send-now', 'POST');
        if (response.success) {
            showNotification('Activity report sent to sabincn676@gmail.com', 'success');
        } else {
            showNotification('Failed to send report: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error sending report: ' + error.message, 'error');
    }
}

async function downloadActivityReport() {
    try {
        showNotification('Generating PDF...', 'info');
        const token = getToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/activity-report/download?hours=${activityLogsHoursFilter}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Download failed');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SteelConnect_Admin_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('PDF downloaded successfully', 'success');
    } catch (error) {
        showNotification('Error downloading report: ' + error.message, 'error');
    }
}

// ================================================================
// EMAIL COLLECTION — Advanced Country/Region/Trade Search
// ================================================================

// Dropdown data (synced from backend on load)
let ecMetadata = { countries: [], regions: {}, trades: [] };

async function loadEmailCollectionData() {
    const container = document.getElementById('email-collection-tab');
    if (!container) return;
    showLoader(container);
    try {
        const [statusRes, emailsRes, metaRes] = await Promise.all([
            apiCall('/email-collection/status'),
            apiCall('/email-collection/emails'),
            apiCall('/email-collection/metadata'),
        ]);
        state.emailCollectionEnabled = statusRes.enabled || false;
        state.collectedEmails = emailsRes.emails || [];
        state.collectedEmailStats = statusRes.regionCounts || {};
        state.collectedEmailSelectedIds = [];
        ecMetadata = metaRes || { countries: [], regions: {}, trades: [] };
        const badge = document.getElementById('emailCollectionBadge');
        if (badge) badge.textContent = emailsRes.total > 0 ? emailsRes.total : '';
        renderEmailCollectionTab();
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><h3>Error loading email collection</h3><p>${error.message}</p></div>`;
    }
}

function renderEmailCollectionTab() {
    const container = document.getElementById('email-collection-tab');
    if (!container) return;
    const emails = state.collectedEmails;
    const stats = state.collectedEmailStats;
    const totalEmails = emails.length;
    const usedCount = emails.filter(e => e.used).length;
    const newCount = emails.filter(e => !e.used).length;
    const countries = ecMetadata.countries || [];
    const trades = ecMetadata.trades || [];

    container.innerHTML = `
        <div class="ec-layout">
            <!-- Header -->
            <div class="ec-banner">
                <div class="ec-banner-icon"><i class="fas fa-globe-americas"></i></div>
                <div class="ec-banner-info">
                    <h3>Email Collection & Discovery</h3>
                    <p>Search CEO, Owner & Manager emails by Country, Region, and Trade. Select and copy emails instantly.</p>
                </div>
                <div class="ec-toggle-area">
                    <label class="ec-master-toggle">
                        <input type="checkbox" id="ecToggle" ${state.emailCollectionEnabled ? 'checked' : ''} onchange="ecToggleCollection(this.checked)">
                        <span class="ec-toggle-slider"></span>
                    </label>
                    <span class="ec-toggle-label" id="ecToggleLabel">${state.emailCollectionEnabled ? 'Active' : 'Inactive'}</span>
                </div>
            </div>

            <!-- Stats -->
            <div class="ec-stats-row">
                <div class="ec-stat-card">
                    <div class="ec-stat-icon" style="background:#eff6ff;color:#2563eb;"><i class="fas fa-envelope"></i></div>
                    <div class="ec-stat-info"><span class="ec-stat-num">${totalEmails}</span><span class="ec-stat-label">Total Collected</span></div>
                </div>
                <div class="ec-stat-card">
                    <div class="ec-stat-icon" style="background:#f0fdf4;color:#16a34a;"><i class="fas fa-check-circle"></i></div>
                    <div class="ec-stat-info"><span class="ec-stat-num">${newCount}</span><span class="ec-stat-label">Available</span></div>
                </div>
                <div class="ec-stat-card">
                    <div class="ec-stat-icon" style="background:#fef3c7;color:#d97706;"><i class="fas fa-history"></i></div>
                    <div class="ec-stat-info"><span class="ec-stat-num">${usedCount}</span><span class="ec-stat-label">Used</span></div>
                </div>
                <div class="ec-stat-card">
                    <div class="ec-stat-icon" style="background:#faf5ff;color:#7c3aed;"><i class="fas fa-globe"></i></div>
                    <div class="ec-stat-info"><span class="ec-stat-num">${Object.keys(stats).length}</span><span class="ec-stat-label">Countries</span></div>
                </div>
            </div>

            <!-- ADVANCED SEARCH: Country → Region → Trade → Count -->
            <div class="ec-adv-search-card">
                <h4><i class="fas fa-search-location" style="color:#6366f1;margin-right:8px;"></i>Advanced Email Search</h4>
                <p class="ec-adv-desc">Select Country, Region, Trade and number of emails needed. Focused on CEO / Owner / Manager contacts.</p>
                <div class="ec-adv-grid">
                    <div class="ec-adv-field">
                        <label>Country</label>
                        <select id="ecCountrySelect" onchange="ecOnCountryChange()">
                            <option value="">-- Select Country --</option>
                            ${countries.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="ec-adv-field">
                        <label>Region / State</label>
                        <select id="ecRegionSelect" disabled>
                            <option value="All Regions">All Regions</option>
                        </select>
                    </div>
                    <div class="ec-adv-field">
                        <label>Trade / Industry</label>
                        <select id="ecTradeSelect">
                            <option value="All Trades">All Trades</option>
                            ${trades.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="ec-adv-field">
                        <label>Number of Emails</label>
                        <input type="number" id="ecCountInput" placeholder="e.g. 50" min="1" max="1000" value="100">
                    </div>
                </div>
                <div class="ec-adv-actions">
                    <button onclick="ecAdvancedSearch()" class="ec-search-btn" id="ecAdvSearchBtn">
                        <i class="fas fa-search"></i> Search Emails
                    </button>
                    <button onclick="ecSyncAll()" class="ec-sync-all-btn" id="ecSyncAllBtn">
                        <i class="fas fa-cloud-download-alt"></i> Load All ${ecMetadata.totalAvailable || 2695} Emails
                    </button>
                    <div id="ecAdvSearchResult" style="display:none;"></div>
                </div>
            </div>

            <!-- Quick Region Search (legacy) -->
            <div class="ec-search-section">
                <div class="ec-search-card">
                    <h4><i class="fas fa-bolt" style="color:#f59e0b;margin-right:8px;"></i>Quick Search</h4>
                    <div class="ec-search-row">
                        <input type="text" id="ecRegionInput" placeholder="Type any country or region..."
                            style="flex:1;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;font-family:inherit;"
                            onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e2e8f0'"
                            onkeydown="if(event.key==='Enter')ecSearchRegion()">
                        <button onclick="ecSearchRegion()" class="ec-search-btn" id="ecSearchBtn">
                            <i class="fas fa-search"></i> Search
                        </button>
                    </div>
                    <div id="ecSearchResult" style="margin-top:12px;display:none;"></div>
                </div>
                <div class="ec-search-card">
                    <h4><i class="fas fa-chart-pie" style="color:#6366f1;margin-right:8px;"></i>Country Breakdown</h4>
                    <div class="ec-region-breakdown">
                        ${Object.keys(stats).length > 0 ? Object.entries(stats).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([region, count]) => `
                            <div class="ec-region-bar-item">
                                <div class="ec-region-bar-label"><span>${region}</span><span style="font-weight:600;">${count}</span></div>
                                <div class="ec-region-bar-track"><div class="ec-region-bar-fill" style="width:${Math.round((count / totalEmails) * 100)}%;"></div></div>
                            </div>
                        `).join('') : '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">No data yet. Use search above.</p>'}
                    </div>
                </div>
            </div>

            <!-- Action Bar -->
            <div class="ec-action-bar">
                <div class="ec-action-left">
                    <label class="ec-select-all-label">
                        <input type="checkbox" id="ecSelectAll" onchange="ecToggleSelectAll()">
                        <span>Select All</span>
                    </label>
                    <span class="ec-selected-count" id="ecSelectedCount">0 selected</span>
                </div>
                <div class="ec-action-right">
                    <button onclick="ecCopySelected()" class="ec-action-btn ec-btn-copy" id="ecCopyBtn" disabled>
                        <i class="fas fa-copy"></i> Copy Emails
                    </button>
                    <button onclick="ecCopyAllEmails()" class="ec-action-btn ec-btn-copy" ${totalEmails === 0 ? 'disabled' : ''}>
                        <i class="fas fa-clipboard-list"></i> Copy All (${totalEmails})
                    </button>
                    <button onclick="ecMarkSelectedUsed()" class="ec-action-btn ec-btn-used" id="ecMarkUsedBtn" disabled>
                        <i class="fas fa-check"></i> Mark Used
                    </button>
                    <button onclick="ecDeleteSelected()" class="ec-action-btn ec-btn-delete" id="ecDeleteSelectedBtn" disabled>
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                    <button onclick="ecDeleteUsed()" class="ec-action-btn ec-btn-delete-used" ${usedCount === 0 ? 'disabled' : ''}>
                        <i class="fas fa-broom"></i> Clear Used (${usedCount})
                    </button>
                </div>
            </div>

            <!-- Email List -->
            <div class="ec-email-list" id="ecEmailList">
                ${emails.length === 0 ? `
                    <div class="empty-state" style="padding:60px 20px;">
                        <i class="fas fa-globe-americas" style="font-size:40px;color:#94a3b8;margin-bottom:16px;"></i>
                        <h3>No Emails Collected Yet</h3>
                        <p>Use the Advanced Search above to find CEO/Owner/Manager emails by country, region, and trade.</p>
                    </div>
                ` : emails.map(e => `
                    <div class="ec-email-item ${e.used ? 'ec-email-used' : ''}" data-id="${e.id}">
                        <label class="ec-checkbox">
                            <input type="checkbox" value="${e.id}" onchange="ecToggleEmail('${e.id}')" ${state.collectedEmailSelectedIds.includes(e.id) ? 'checked' : ''}>
                        </label>
                        <div class="ec-email-info">
                            <div class="ec-email-primary">
                                <span class="ec-email-addr">${sanitizeInput(e.email)}</span>
                                <span class="ec-email-company">${sanitizeInput(e.company || '')}</span>
                            </div>
                            <div class="ec-email-meta">
                                ${e.contactRole ? `<span class="ec-role-tag ec-role-${(e.contactRole||'').toLowerCase()}">${e.contactRole}</span>` : ''}
                                ${e.contactName ? `<span class="ec-contact-name">${sanitizeInput(e.contactName)}</span>` : ''}
                                <span class="ec-country-tag"><i class="fas fa-map-marker-alt"></i> ${e.country || ''}${e.state ? ', ' + e.state : ''}</span>
                                <span class="ec-industry-tag">${e.industry || ''}</span>
                                ${e.used ? '<span class="ec-used-badge"><i class="fas fa-check"></i> Used</span>' : ''}
                            </div>
                        </div>
                        <button class="ec-copy-single" onclick="ecCopySingle('${sanitizeInput(e.email)}')" title="Copy email">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="ec-delete-single" onclick="ecDeleteSingle('${e.id}')" title="Delete">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Country dropdown change → populate regions
function ecOnCountryChange() {
    const country = document.getElementById('ecCountrySelect').value;
    const regionSelect = document.getElementById('ecRegionSelect');
    if (!country) {
        regionSelect.innerHTML = '<option value="All Regions">All Regions</option>';
        regionSelect.disabled = true;
        return;
    }
    const regions = ecMetadata.regions[country] || [];
    regionSelect.innerHTML = '<option value="All Regions">All Regions</option>' +
        regions.map(r => `<option value="${r}">${r}</option>`).join('');
    regionSelect.disabled = false;
}

// Advanced search
async function ecAdvancedSearch() {
    const country = document.getElementById('ecCountrySelect').value;
    if (!country) { showNotification('Please select a country', 'error'); return; }
    const region = document.getElementById('ecRegionSelect').value;
    const trade = document.getElementById('ecTradeSelect').value;
    const count = document.getElementById('ecCountInput').value || 100;
    const btn = document.getElementById('ecAdvSearchBtn');
    const resultEl = document.getElementById('ecAdvSearchResult');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...'; }
    try {
        const result = await apiCall('/email-collection/advanced-search', 'POST', { country, region, trade, count: parseInt(count) });
        if (resultEl) {
            resultEl.style.display = '';
            resultEl.innerHTML = `<div style="padding:12px;border-radius:10px;background:${result.total > 0 ? '#f0fdf4' : '#eff6ff'};border:1px solid ${result.total > 0 ? '#bbf7d0' : '#bfdbfe'};font-size:12px;margin-top:12px;">
                <div style="color:${result.total > 0 ? '#16a34a' : '#2563eb'};font-weight:600;"><i class="fas ${result.total > 0 ? 'fa-check-circle' : 'fa-info-circle'}"></i> ${result.message}</div>
                ${result.total > 0 ? `<div style="color:#64748b;margin-top:4px;">Total: ${result.total} | New: ${result.newAdded} | Already existed: ${result.alreadyExisted}</div>` : ''}
            </div>`;
        }
        if (result.newAdded > 0 || result.total > 0) {
            showNotification(`Found ${result.total} emails (${result.newAdded} new added)`, 'success');
            state.collectedEmails = [];
            loadEmailCollectionData();
        }
    } catch (error) {
        showNotification('Search failed: ' + error.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Search Emails'; }
}

async function ecToggleCollection(enabled) {
    const label = document.getElementById('ecToggleLabel');
    if (label) label.textContent = 'Updating...';
    try {
        const result = await apiCall('/email-collection/toggle', 'POST', { enabled });
        state.emailCollectionEnabled = result.enabled;
        if (label) label.textContent = result.enabled ? 'Active' : 'Inactive';
        showNotification(result.message, 'success');
        state.collectedEmails = [];
        loadEmailCollectionData();
    } catch (error) {
        if (label) label.textContent = !enabled ? 'Active' : 'Inactive';
        const toggle = document.getElementById('ecToggle');
        if (toggle) toggle.checked = !enabled;
        showNotification('Failed to toggle', 'error');
    }
}

async function ecSearchRegion() {
    const input = document.getElementById('ecRegionInput');
    const region = (input?.value || '').trim();
    if (!region) { showNotification('Please enter a region or country', 'error'); return; }
    const btn = document.getElementById('ecSearchBtn');
    const resultEl = document.getElementById('ecSearchResult');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...'; }
    try {
        const result = await apiCall('/email-collection/search', 'POST', { region });
        if (resultEl) {
            resultEl.style.display = '';
            resultEl.innerHTML = `<div style="padding:12px;border-radius:10px;background:${result.added > 0 ? '#f0fdf4' : '#eff6ff'};border:1px solid ${result.added > 0 ? '#bbf7d0' : '#bfdbfe'};font-size:12px;">
                <div style="color:${result.added > 0 ? '#16a34a' : '#2563eb'};font-weight:600;"><i class="fas ${result.added > 0 ? 'fa-check-circle' : 'fa-info-circle'}"></i> ${result.message}</div>
            </div>`;
        }
        if (result.added > 0) { state.collectedEmails = []; loadEmailCollectionData(); }
    } catch (error) { showNotification('Search failed: ' + error.message, 'error'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Search'; }
}

function ecToggleEmail(id) {
    const idx = state.collectedEmailSelectedIds.indexOf(id);
    if (idx >= 0) state.collectedEmailSelectedIds.splice(idx, 1);
    else state.collectedEmailSelectedIds.push(id);
    ecUpdateActionUI();
}

function ecToggleSelectAll() {
    const allCb = document.getElementById('ecSelectAll');
    if (allCb.checked) {
        state.collectedEmailSelectedIds = state.collectedEmails.map(e => e.id);
    } else {
        state.collectedEmailSelectedIds = [];
    }
    document.querySelectorAll('#ecEmailList input[type="checkbox"]').forEach(cb => {
        cb.checked = state.collectedEmailSelectedIds.includes(cb.value);
    });
    ecUpdateActionUI();
}

function ecUpdateActionUI() {
    const count = state.collectedEmailSelectedIds.length;
    const el = document.getElementById('ecSelectedCount');
    const copyBtn = document.getElementById('ecCopyBtn');
    const markBtn = document.getElementById('ecMarkUsedBtn');
    const delBtn = document.getElementById('ecDeleteSelectedBtn');
    if (el) el.textContent = `${count} selected`;
    if (copyBtn) copyBtn.disabled = count === 0;
    if (markBtn) markBtn.disabled = count === 0;
    if (delBtn) delBtn.disabled = count === 0;
}

function ecCopySelected() {
    const selected = state.collectedEmails.filter(e => state.collectedEmailSelectedIds.includes(e.id)).map(e => e.email);
    if (selected.length === 0) { showNotification('No emails selected', 'error'); return; }
    ecCopyToClipboard(selected.join('\n'), `${selected.length} email(s) copied!`);
}

function ecCopyAllEmails() {
    const all = state.collectedEmails.map(e => e.email);
    if (all.length === 0) { showNotification('No emails to copy', 'error'); return; }
    ecCopyToClipboard(all.join('\n'), `All ${all.length} email(s) copied!`);
}

function ecCopySingle(email) {
    ecCopyToClipboard(email, `Copied: ${email}`);
}

function ecCopyToClipboard(text, msg) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification(msg, 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showNotification(msg, 'success');
    });
}

async function ecMarkSelectedUsed() {
    if (state.collectedEmailSelectedIds.length === 0) return;
    if (!confirm(`Mark ${state.collectedEmailSelectedIds.length} email(s) as used?`)) return;
    try {
        await apiCall('/email-collection/mark-used', 'POST', { ids: state.collectedEmailSelectedIds });
        showNotification(`${state.collectedEmailSelectedIds.length} emails marked as used`, 'success');
        state.collectedEmailSelectedIds = [];
        state.collectedEmails = [];
        loadEmailCollectionData();
    } catch (error) { showNotification('Failed to mark as used', 'error'); }
}

async function ecDeleteSelected() {
    if (state.collectedEmailSelectedIds.length === 0) return;
    if (!confirm(`Delete ${state.collectedEmailSelectedIds.length} email(s)?`)) return;
    try {
        await apiCall('/email-collection/delete-bulk', 'POST', { ids: state.collectedEmailSelectedIds });
        showNotification(`${state.collectedEmailSelectedIds.length} emails deleted`, 'success');
        state.collectedEmailSelectedIds = [];
        state.collectedEmails = [];
        loadEmailCollectionData();
    } catch (error) { showNotification('Failed to delete', 'error'); }
}

async function ecDeleteUsed() {
    const usedCount = state.collectedEmails.filter(e => e.used).length;
    if (usedCount === 0) { showNotification('No used emails', 'info'); return; }
    if (!confirm(`Delete all ${usedCount} used emails?`)) return;
    try {
        await apiCall('/email-collection/delete-bulk', 'POST', { deleteUsed: true });
        showNotification(`${usedCount} used emails deleted`, 'success');
        state.collectedEmailSelectedIds = [];
        state.collectedEmails = [];
        loadEmailCollectionData();
    } catch (error) { showNotification('Failed to delete', 'error'); }
}

async function ecDeleteSingle(id) {
    if (!confirm('Delete this email?')) return;
    try {
        await apiCall(`/email-collection/emails/${id}`, 'DELETE');
        showNotification('Email deleted', 'success');
        state.collectedEmails = [];
        loadEmailCollectionData();
    } catch (error) { showNotification('Failed to delete', 'error'); }
}

// Load ALL 2695 emails from database into Firestore at once
async function ecSyncAll() {
    if (!confirm('Load all 2695 emails from the database? This will add any missing entries.')) return;
    const btn = document.getElementById('ecSyncAllBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading all emails...'; }
    try {
        const result = await apiCall('/email-collection/sync-all', 'POST', {});
        showNotification(result.message, 'success');
        state.collectedEmails = [];
        loadEmailCollectionData();
    } catch (error) {
        showNotification('Failed to sync: ' + error.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Load All Emails'; }
}

// =====================================================
// VISITOR ANALYTICS — Professional Dashboard
// =====================================================
let visitorFilterDays = 30;
let visitorAutoRefresh = null;
let vaTrendChart = null;
let vaHourlyChart = null;

async function loadVisitorAnalyticsData() {
    const container = document.getElementById('visitor-analytics-tab');
    if (!container) return;
    showLoader(container);
    try {
        const result = await apiCall(`/visitors?days=${visitorFilterDays}&limit=500`);
        state.visitors = result.visitors || [];
        state.visitorStats = result.stats || {};
        const badge = document.getElementById('visitorLiveBadge');
        if (badge) badge.textContent = result.stats?.activeNow > 0 ? result.stats.activeNow + ' live' : '';
        renderVisitorAnalyticsTab();
        // Auto-refresh every 60 seconds
        if (visitorAutoRefresh) clearInterval(visitorAutoRefresh);
        visitorAutoRefresh = setInterval(async () => {
            try {
                const r = await apiCall(`/visitors?days=${visitorFilterDays}&limit=500`);
                state.visitors = r.visitors || [];
                state.visitorStats = r.stats || {};
                const b = document.getElementById('visitorLiveBadge');
                if (b) b.textContent = r.stats?.activeNow > 0 ? r.stats.activeNow + ' live' : '';
                renderVisitorAnalyticsTab();
            } catch(e) {}
        }, 60000);
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><h3>Error loading visitor data</h3><p>${error.message}</p></div>`;
    }
}

function formatDuration(seconds) {
    if (!seconds || seconds < 1) return '0s';
    if (seconds < 60) return seconds + 's';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return m + 'm ' + s + 's';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
}

// Convert country code to flag emoji (e.g., "US" -> flag)
function countryFlag(code) {
    if (!code || code.length !== 2) return '';
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function renderVisitorAnalyticsTab() {
    const container = document.getElementById('visitor-analytics-tab');
    if (!container) return;
    if (vaTrendChart) { vaTrendChart.destroy(); vaTrendChart = null; }
    if (vaHourlyChart) { vaHourlyChart.destroy(); vaHourlyChart = null; }
    const s = state.visitorStats;
    const visitors = state.visitors;
    const now = new Date();
    const total = s.totalVisitors || 1;
    const countriesData = s.countries || [];
    const citiesData = s.cities || [];
    const devices = s.devices || {};
    const browsers = s.browsers || {};
    const osSystems = s.osSystems || {};
    const devTotal = Object.values(devices).reduce((a,b) => a+b, 0) || 1;

    function pct(n) { return Math.round((n / devTotal) * 100); }
    function bar(label, count, color, icon) {
        const p = pct(count);
        return `<div class="vb-row"><div class="vb-lbl">${icon ? '<i class="fas '+icon+'"></i> ' : ''}${label}</div><div class="vb-track"><div class="vb-fill" style="width:${p}%;background:${color}"></div></div><div class="vb-val">${count} (${p}%)</div></div>`;
    }

    const recentVisitors = visitors.slice(0, 100);
    const tableRows = recentVisitors.map((v, i) => {
        const isLive = v.isActive && (now - new Date(v.lastActiveAt)) < 300000;
        const loc = v.location;
        const flag = loc?.countryCode ? countryFlag(loc.countryCode) : '';
        const locHtml = loc?.country
            ? `<div class="vt-loc"><span class="vt-flag">${flag}</span><div><strong>${loc.city || loc.country}</strong><br><small>${loc.city ? loc.country : ''}${loc.region ? ', '+loc.region : ''}</small></div></div>`
            : '<span class="vt-muted">Pending...</span>';
        const email = v.userEmail || v.contactEmail || '';
        const name = v.userName || '';
        const company = v.company || '';
        const src = v.userEmail ? 'login' : (v.contactSource || '');
        const srcCls = src === 'login' ? 'vt-src-blue' : src === 'chatbot' ? 'vt-src-amber' : src === 'prospect' ? 'vt-src-purple' : '';
        const srcLbl = src === 'login' ? 'User' : src === 'chatbot' ? 'Chat' : src === 'prospect' ? 'Lead' : '';
        const avatarHtml = v.gravatarUrl ? `<img class="vt-avatar" src="${v.gravatarUrl}" onerror="this.style.display='none'" />` : '';
        const contactHtml = email
            ? `<div class="vt-contact">${avatarHtml || '<i class="fas fa-user-check vt-c-ok"></i>'}<div><strong>${name || (email.length > 28 ? email.substring(0,28)+'...' : email)}</strong>${name ? '<br><small>'+email+'</small>' : ''}${company ? '<br><small class="vt-company"><i class="fas fa-building"></i> '+company+'</small>' : ''}</div>${srcLbl ? '<span class="vt-src '+srcCls+'">'+srcLbl+'</span>' : ''}${v.linkedinSearchUrl ? '<a href="'+v.linkedinSearchUrl+'" target="_blank" class="vt-li" title="Search LinkedIn" onclick="event.stopPropagation()"><i class="fab fa-linkedin"></i></a>' : ''}</div>`
            : `<div class="vt-contact-anon"><i class="fas fa-user-secret"></i><div><span>Anonymous</span>${company ? '<br><small class="vt-company"><i class="fas fa-building"></i> '+company+'</small>' : ''}</div></div>`;
        const devIcon = v.deviceType === 'Mobile' ? 'fa-mobile-alt' : v.deviceType === 'Tablet' ? 'fa-tablet-alt' : 'fa-desktop';
        const pgCount = (v.pagesViewed || []).length;
        // Detail
        const ld = loc ? [loc.city, loc.region, loc.country].filter(Boolean).join(', ') + (loc.timezone ? ' ('+loc.timezone+')' : '') : 'N/A';
        const isp = loc?.isp || loc?.org || 'N/A';
        const pgs = (v.pagesViewed || []).map(p => `<span class="vd-pg">${p.page}</span>`).join('');
        const mapUrl = (loc?.lat && loc?.lon) ? `https://www.google.com/maps?q=${loc.lat},${loc.lon}` : '';
        return `<tr class="vt-main${isLive ? ' vt-live-row' : ''}" onclick="vaToggleDetail('vd${i}')">
            <td>${isLive ? '<span class="vt-live"><span class="vt-dot"></span>Live</span>' : '<span class="vt-left">Left</span>'}</td>
            <td>${locHtml}</td>
            <td>${contactHtml}</td>
            <td><div class="vt-dev"><i class="fas ${devIcon}"></i><div>${v.browser}<br><small>${v.os}</small></div></div></td>
            <td class="vt-center">${pgCount}</td>
            <td class="vt-center"><strong>${formatDuration(v.totalTimeSeconds)}</strong></td>
            <td>${getTimeAgo(new Date(v.startedAt))}</td>
        </tr>
        <tr class="vt-detail" id="vd${i}" style="display:none"><td colspan="7"><div class="vd-box">
            <div class="vd-header">${v.gravatarUrl ? '<img class="vd-avatar" src="'+v.gravatarUrl+'" onerror="this.style.display=\'none\'" />' : ''}${name ? '<div class="vd-name">'+name+'</div>' : ''}${company ? '<div class="vd-company"><i class="fas fa-building"></i> '+company+'</div>' : ''}</div>
            <div class="vd-grid">
                <div><span class="vd-l">IP Address</span><span class="vd-v">${v.ip||'N/A'}</span></div>
                <div><span class="vd-l">Full Location</span><span class="vd-v">${ld}</span></div>
                <div><span class="vd-l">Company / ISP</span><span class="vd-v">${company || isp}</span></div>
                <div><span class="vd-l">Device</span><span class="vd-v">${v.deviceType} - ${v.browser} on ${v.os}</span></div>
                <div><span class="vd-l">Screen</span><span class="vd-v">${v.screenResolution||'N/A'}</span></div>
                <div><span class="vd-l">Language</span><span class="vd-v">${v.language||'N/A'}</span></div>
                <div><span class="vd-l">Referrer</span><span class="vd-v">${v.referrer||'Direct'}</span></div>
                <div><span class="vd-l">Landing Page</span><span class="vd-v">${v.landingPage||'/'}</span></div>
                <div><span class="vd-l">Session Start</span><span class="vd-v">${new Date(v.startedAt).toLocaleString()}</span></div>
                <div><span class="vd-l">Last Active</span><span class="vd-v">${new Date(v.lastActiveAt).toLocaleString()}</span></div>
                ${name ? '<div><span class="vd-l">Name</span><span class="vd-v"><strong>'+name+'</strong></span></div>' : ''}
                ${email ? '<div><span class="vd-l">Email</span><span class="vd-v"><a href="mailto:'+email+'">'+email+'</a></span></div>' : ''}
            </div>
            <div class="vd-pgs"><span class="vd-l">Pages Visited (${pgCount})</span><div class="vd-pg-list">${pgs||'<span class="vt-muted">None</span>'}</div></div>
            <div class="vd-actions">
                ${mapUrl ? '<a href="'+mapUrl+'" target="_blank" class="vd-map"><i class="fas fa-map-marked-alt"></i> Google Maps</a>' : ''}
                ${v.linkedinSearchUrl ? '<a href="'+v.linkedinSearchUrl+'" target="_blank" class="vd-linkedin"><i class="fab fa-linkedin"></i> Find on LinkedIn</a>' : ''}
                ${email ? '<a href="mailto:'+email+'" class="vd-email"><i class="fas fa-envelope"></i> Send Email</a>' : ''}
            </div>
        </div></td></tr>`;
    }).join('');

    container.innerHTML = `<div class="va-dash">
        <div class="va-top">
            <div><h3 class="va-title"><i class="fas fa-chart-pie"></i> Visitor Analytics</h3><p class="va-sub">Real-time tracking &mdash; auto-refreshes every 60s</p></div>
            <div class="va-actions">
                <select class="va-sel" onchange="vaChangeDays(this.value)">
                    <option value="1" ${visitorFilterDays===1?'selected':''}>Today</option>
                    <option value="7" ${visitorFilterDays===7?'selected':''}>7 Days</option>
                    <option value="30" ${visitorFilterDays===30?'selected':''}>30 Days</option>
                    <option value="90" ${visitorFilterDays===90?'selected':''}>90 Days</option>
                </select>
                <button onclick="loadVisitorAnalyticsData()" class="va-btn-ref"><i class="fas fa-sync-alt"></i></button>
                <button onclick="vaExportCSV()" class="va-btn-exp"><i class="fas fa-download"></i> CSV</button>
            </div>
        </div>
        <div class="va-kpis">
            <div class="va-kpi kpi-blue"><div class="va-kpi-ic"><i class="fas fa-users"></i></div><div class="va-kpi-num">${s.totalVisitors||0}</div><div class="va-kpi-lbl">Total Visitors</div></div>
            <div class="va-kpi kpi-green"><div class="va-kpi-ic"><i class="fas fa-calendar-day"></i></div><div class="va-kpi-num">${s.todayVisitors||0}</div><div class="va-kpi-lbl">Today</div></div>
            <div class="va-kpi kpi-red"><div class="va-kpi-ic"><i class="fas fa-broadcast-tower"></i></div><div class="va-kpi-num">${s.activeNow||0}</div><div class="va-kpi-lbl">Live Now</div></div>
            <div class="va-kpi kpi-purple"><div class="va-kpi-ic"><i class="fas fa-clock"></i></div><div class="va-kpi-num">${formatDuration(s.avgTimeSeconds||0)}</div><div class="va-kpi-lbl">Avg. Time</div></div>
            <div class="va-kpi kpi-cyan"><div class="va-kpi-ic"><i class="fas fa-globe-americas"></i></div><div class="va-kpi-num">${s.uniqueCountries||0}</div><div class="va-kpi-lbl">Countries</div></div>
            <div class="va-kpi kpi-orange"><div class="va-kpi-ic"><i class="fas fa-address-book"></i></div><div class="va-kpi-num">${s.identifiedVisitors||0}</div><div class="va-kpi-lbl">Identified</div></div>
        </div>
        <div class="va-g2">
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-chart-area"></i> Daily Trend</h4></div><div style="height:200px"><canvas id="vaChartTrend"></canvas></div></div>
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-clock"></i> Peak Hours</h4></div><div style="height:200px"><canvas id="vaChartHourly"></canvas></div></div>
        </div>
        <div class="va-g2">
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-globe-americas"></i> Top Countries</h4></div><div class="va-scroll-list">${countriesData.map(([k,c]) => {
                const pts = k.split('|'); const nm = pts[0]; const cd = pts[1]||''; const fl = countryFlag(cd); const p = Math.round((c/total)*100);
                return `<div class="vc-row"><span class="vc-flag">${fl}</span><span class="vc-name">${nm}</span><div class="vc-bar"><div class="vc-fill" style="width:${Math.max(p,4)}%"></div></div><span class="vc-num">${c}</span></div>`;
            }).join('') || '<div class="va-empty">No location data yet</div>'}</div></div>
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-city"></i> Top Cities</h4></div><div class="va-scroll-list">${citiesData.map(([city,c]) => {
                return `<div class="vc-row"><i class="fas fa-map-marker-alt" style="color:#f59e0b"></i><span class="vc-name">${city}</span><span class="vc-num">${c}</span></div>`;
            }).join('') || '<div class="va-empty">No city data yet</div>'}</div></div>
        </div>
        <div class="va-g3">
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-laptop"></i> Devices</h4></div><div class="vb-list">${Object.entries(devices).filter(([,c])=>c>0).map(([d,c]) => bar(d,c,d==='Desktop'?'#6366f1':d==='Mobile'?'#8b5cf6':'#a78bfa',d==='Mobile'?'fa-mobile-alt':d==='Tablet'?'fa-tablet-alt':'fa-desktop')).join('')}</div></div>
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-globe"></i> Browsers</h4></div><div class="vb-list">${Object.entries(browsers).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([b,c]) => bar(b,c,'#8b5cf6','')).join('')}</div></div>
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-server"></i> OS</h4></div><div class="vb-list">${Object.entries(osSystems).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([o,c]) => bar(o,c,'#ec4899','')).join('')}</div></div>
        </div>
        <div class="va-g2">
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-external-link-alt"></i> Traffic Sources</h4></div><div class="va-scroll-list">${(s.referrers||[]).map(([r,c]) => `<div class="vr-row"><span class="vr-name" title="${r}">${r.length>45?r.substring(0,45)+'...':r}</span><span class="vr-cnt">${c}</span></div>`).join('') || '<div class="va-empty">No data</div>'}</div></div>
            <div class="va-pnl"><div class="va-pnl-h"><h4><i class="fas fa-file-alt"></i> Top Pages</h4></div><div class="va-scroll-list">${(s.topPages||[]).map(([p,c]) => `<div class="vr-row"><span class="vr-name" title="${p}">${p.length>40?'...'+p.substring(p.length-40):p}</span><span class="vr-cnt">${c}</span></div>`).join('') || '<div class="va-empty">No data</div>'}</div></div>
        </div>
        <div class="va-pnl va-full">
            <div class="va-pnl-h va-pnl-h-tbl"><h4><i class="fas fa-users"></i> All Visitors <span class="va-badge-count">${recentVisitors.length}</span></h4><div><span class="va-hint">Click row for details</span><button onclick="vaClearOldData()" class="va-btn-del"><i class="fas fa-trash-alt"></i> Clear Old</button></div></div>
            <div class="vt-wrap"><table class="vt"><thead><tr>
                <th width="80">Status</th><th width="190">Location</th><th>Contact / Identity</th><th width="150">Device</th><th width="50">Pgs</th><th width="70">Time</th><th width="80">When</th>
            </tr></thead><tbody>${tableRows || '<tr><td colspan="7" class="vt-empty"><i class="fas fa-satellite-dish" style="font-size:24px;margin-bottom:8px;color:#cbd5e1"></i><br>No visitors yet<br><small>Data appears after someone visits your website</small></td></tr>'}</tbody></table></div>
        </div>
    </div>`;
    renderVisitorCharts(s);
}

function vaToggleDetail(id) { const r = document.getElementById(id); if (r) r.style.display = r.style.display === 'none' ? 'table-row' : 'none'; }

function renderVisitorCharts(s) {
    const dd = s.dailyTrend || [];
    const tc = document.getElementById('vaChartTrend');
    if (tc && dd.length > 0) {
        vaTrendChart = new Chart(tc, { type:'line', data:{ labels:dd.map(d=>{const dt=new Date(d[0]);return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});}), datasets:[{label:'Visitors',data:dd.map(d=>d[1]),borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,0.08)',borderWidth:2.5,fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:'#6366f1',pointBorderColor:'#fff',pointBorderWidth:2,pointHoverRadius:7}] }, options:{ responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1e293b',padding:12,cornerRadius:8}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,color:'#94a3b8'},grid:{borderDash:[3,3],color:'rgba(0,0,0,0.05)'}},x:{ticks:{color:'#94a3b8'},grid:{display:false}}} } });
    }
    const hd = s.hourlyDistribution || {};
    const hc = document.getElementById('vaChartHourly');
    if (hc) {
        const hrs = Array.from({length:24},(_,i)=>i);
        const mx = Math.max(...hrs.map(h=>hd[h]||0),1);
        vaHourlyChart = new Chart(hc, { type:'bar', data:{ labels:hrs.map(h=>h.toString().padStart(2,'0')+':00'), datasets:[{label:'Visitors',data:hrs.map(h=>hd[h]||0),backgroundColor:hrs.map(h=>`rgba(139,92,246,${Math.max(0.15,(hd[h]||0)/mx)})`),borderRadius:5,borderSkipped:false}] }, options:{ responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1e293b',padding:12,cornerRadius:8}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,color:'#94a3b8'},grid:{borderDash:[3,3],color:'rgba(0,0,0,0.05)'}},x:{ticks:{color:'#94a3b8',font:{size:9},maxRotation:0},grid:{display:false}}} } });
    }
}

function vaChangeDays(d) { visitorFilterDays = parseInt(d); state.visitors = []; loadVisitorAnalyticsData(); }

async function vaClearOldData() {
    const d = prompt('Delete records older than how many days?', '30');
    if (!d) return;
    if (!confirm('Delete all visitor records older than ' + d + ' days?')) return;
    try { const r = await apiCall('/visitors/clear', 'DELETE', { olderThanDays: parseInt(d) }); showNotification(r.message || 'Deleted ' + r.deleted, 'success'); state.visitors = []; loadVisitorAnalyticsData(); }
    catch (e) { showNotification('Error: ' + e.message, 'error'); }
}

function vaExportCSV() {
    const v = state.visitors || [];
    if (!v.length) return showNotification('No data to export', 'warning');
    const rows = [['Status','Country','City','Region','IP','Email','Name','Company','Device','Browser','OS','Pages','Time(s)','Referrer','Started','Source','LinkedIn']];
    v.forEach(x => { const l = x.location||{}; rows.push([x.isActive?'Active':'Left',l.country||'',l.city||'',l.region||'',x.ip||'',x.userEmail||x.contactEmail||'',x.userName||'',x.company||l.org||l.isp||'',x.deviceType,x.browser,x.os,(x.pagesViewed||[]).length,x.totalTimeSeconds||0,x.referrer||'Direct',x.startedAt||'',x.userEmail?'login':(x.contactSource||'anon'),x.linkedinSearchUrl||'']); });
    const csv = rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
    const b = new Blob([csv],{type:'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'visitors-'+new Date().toISOString().split('T')[0]+'.csv'; a.click();
    showNotification('Exported '+v.length+' visitors', 'success');
}

function getTimeAgo(date) {
    const now = new Date(); const ms = now - date; const sec = Math.floor(ms/1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec/60); if (min < 60) return min + 'm ago';
    const hr = Math.floor(min/60); if (hr < 24) return hr + 'h ago';
    const dy = Math.floor(hr/24); if (dy < 7) return dy + 'd ago';
    return formatAdminDate(date);
}

// ============================================================
// SUBSCRIPTIONS MANAGEMENT
// ============================================================

const SUBSCRIPTION_API_BASE = API_BASE_URL.replace('/api/admin', '').replace(/\/$/, '');

async function subscriptionApiCall(endpoint, method = 'GET', body = null) {
    const token = getToken();
    if (!token) { showNotification('Authentication error. Please log in again.', 'error'); logout(); throw new Error('No token'); }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const options = { method, headers: { 'Authorization': `Bearer ${token}` }, signal: controller.signal };
    if (body) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    try {
        const response = await fetch(`${SUBSCRIPTION_API_BASE}/api/subscriptions${endpoint}`, options);
        clearTimeout(timeoutId);
        if (response.status === 401) { logout(); throw new Error('Session expired'); }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Request failed');
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') throw new Error('Request timed out');
        throw error;
    }
}

async function loadSubscriptionsData() {
    const container = document.getElementById('subscriptions-tab');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading subscriptions...</div>';

    try {
        const [subsResponse, plansResponse, planSettingsResponse] = await Promise.all([
            subscriptionApiCall('/admin/all'),
            subscriptionApiCall('/admin/plans'),
            subscriptionApiCall('/plan-settings').catch(() => ({ planSettings: {} })),
        ]);

        state.subscriptions = subsResponse.subscriptions || [];
        state.subscriptionStats = subsResponse.stats || {};
        state.subscriptionPlans = plansResponse.plans || {};
        state.planSettings = planSettingsResponse.planSettings || {};

        renderSubscriptionsTab();

        // Update sidebar badge
        const badge = document.getElementById('subscriptionsBadge');
        if (badge) {
            const activeCount = state.subscriptionStats.active || 0;
            badge.textContent = activeCount > 0 ? activeCount : '';
            badge.style.display = activeCount > 0 ? 'inline-block' : 'none';
        }
    } catch (error) {
        container.innerHTML = `
            <div style="text-align:center; padding:60px 20px;">
                <i class="fas fa-exclamation-circle" style="font-size:48px; color:#dc2626; margin-bottom:16px;"></i>
                <h3 style="color:#1f2937; margin-bottom:8px;">Failed to Load Subscriptions</h3>
                <p style="color:#6b7280; margin-bottom:20px;">${error.message}</p>
                <button class="btn btn-primary" onclick="loadSubscriptionsData()">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
            </div>`;
    }
}

function renderSubscriptionsTab() {
    const container = document.getElementById('subscriptions-tab');
    if (!container) return;
    const stats = state.subscriptionStats;
    const plans = state.subscriptionPlans;
    const subs = state.subscriptions;

    container.innerHTML = `
        <!-- Stats Cards -->
        <div class="sub-stats-grid">
            <div class="sub-stat-card sub-stat-total">
                <div class="sub-stat-icon"><i class="fas fa-users"></i></div>
                <div class="sub-stat-info">
                    <span class="sub-stat-number">${stats.total || 0}</span>
                    <span class="sub-stat-label">Total Subscriptions</span>
                </div>
            </div>
            <div class="sub-stat-card sub-stat-active">
                <div class="sub-stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="sub-stat-info">
                    <span class="sub-stat-number">${stats.active || 0}</span>
                    <span class="sub-stat-label">Active</span>
                </div>
            </div>
            <div class="sub-stat-card sub-stat-free">
                <div class="sub-stat-icon"><i class="fas fa-gift"></i></div>
                <div class="sub-stat-info">
                    <span class="sub-stat-number">${stats.freeOverride || 0}</span>
                    <span class="sub-stat-label">Free Overrides</span>
                </div>
            </div>
            <div class="sub-stat-card" style="border-left:4px solid #b45309;">
                <div class="sub-stat-icon" style="background:#fef3c7; color:#b45309;"><i class="fas fa-pause-circle"></i></div>
                <div class="sub-stat-info">
                    <span class="sub-stat-number">${stats.stopped || 0}</span>
                    <span class="sub-stat-label">Stopped</span>
                </div>
            </div>
            <div class="sub-stat-card sub-stat-revenue">
                <div class="sub-stat-icon"><i class="fas fa-dollar-sign"></i></div>
                <div class="sub-stat-info">
                    <span class="sub-stat-number">$${stats.totalRevenue || 0}</span>
                    <span class="sub-stat-label">Total Revenue</span>
                </div>
            </div>
            <div class="sub-stat-card sub-stat-contractor">
                <div class="sub-stat-icon"><i class="fas fa-hard-hat"></i></div>
                <div class="sub-stat-info">
                    <span class="sub-stat-number">${stats.contractorProCount || 0}</span>
                    <span class="sub-stat-label">Contractor Pro</span>
                </div>
            </div>
            <div class="sub-stat-card" style="border-left:4px solid #7c3aed;">
                <div class="sub-stat-icon" style="background:#f5f3ff; color:#7c3aed;"><i class="fas fa-brain"></i></div>
                <div class="sub-stat-info">
                    <span class="sub-stat-number">${stats.aiAnalysisCount || 0}</span>
                    <span class="sub-stat-label">AI Analysis Plans</span>
                </div>
            </div>
            <div class="sub-stat-card sub-stat-invoices">
                <div class="sub-stat-icon"><i class="fas fa-file-invoice"></i></div>
                <div class="sub-stat-info">
                    <span class="sub-stat-number">${stats.totalInvoices || 0}</span>
                    <span class="sub-stat-label">Invoices Generated</span>
                </div>
            </div>
        </div>

        <!-- Plan Cards Section -->
        <div class="sub-section">
            <div class="sub-section-header">
                <h3><i class="fas fa-layer-group"></i> Subscription Plans</h3>
                <p class="sub-section-desc">Designer Portal, Contractor Pro &amp; AI Analysis Plan definitions</p>
            </div>
            <div class="sub-plans-grid">
                ${renderPlanCards(plans)}
            </div>
        </div>

        <!-- Stripe Configuration Notice -->
        <div class="sub-stripe-notice">
            <div class="sub-stripe-notice-icon"><i class="fas fa-info-circle"></i></div>
            <div class="sub-stripe-notice-content">
                <strong>Stripe Payment Integration</strong>
                <p>Stripe checkout is ready to be connected. Add your Stripe API keys in the server environment variables (<code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>) to enable live payments.</p>
            </div>
        </div>

        <!-- Subscriber Management -->
        <div class="sub-section">
            <div class="sub-section-header">
                <h3><i class="fas fa-users-cog"></i> Subscribed Clients</h3>
                <div class="sub-section-actions">
                    <select id="subFilterStatus" onchange="filterSubscriptions()" class="sub-filter-select">
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="stopped">Stopped</option>
                        <option value="free_override">Free Override</option>
                        <option value="pending">Pending</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                    </select>
                    <select id="subFilterPlan" onchange="filterSubscriptions()" class="sub-filter-select">
                        <option value="all">All Plans</option>
                        <option value="designer_free">Designer Free</option>
                        <option value="designer_5">Designer Basic ($5)</option>
                        <option value="designer_10">Designer Standard ($10)</option>
                        <option value="designer_15">Designer Plus ($15)</option>
                        <option value="designer_30">Designer Premium ($30)</option>
                        <option value="contractor_pro">Contractor Pro ($49)</option>
                        <option value="contractor_ai_estimation">AI Estimation ($0.40/MB)</option>
                        <option value="contractor_ai_analysis">AI Analysis ($0.08/MB)</option>
                        <option value="ai_analysis_daily_weekly">AI Analysis Daily/Weekly ($5)</option>
                        <option value="ai_analysis_monthly">AI Analysis Monthly ($10)</option>
                        <option value="ai_analysis_premium">AI Analysis Premium ($49)</option>
                        <option value="ai_analysis_pro">AI Analysis Pro ($99)</option>
                    </select>
                    <button class="btn btn-sm" onclick="viewAllInvoices()" style="background:#ede9fe; color:#6d28d9; border:1px solid #c4b5fd;">
                        <i class="fas fa-file-invoice"></i> All Invoices
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="showCreateSubscriptionModal()">
                        <i class="fas fa-plus"></i> Add Subscription
                    </button>
                    <button class="btn btn-sm" onclick="loadSubscriptionsData()" style="background:#f1f5f9; border:1px solid #e2e8f0;">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            </div>
            <div id="subscriptionsTableContainer">
                ${renderSubscriptionsTable(subs)}
            </div>
        </div>
    `;
}

function renderPlanCards(plans) {
    const planOrder = ['designer_free', 'designer_5', 'designer_10', 'designer_15', 'designer_30', 'contractor_pro', 'contractor_ai_estimation', 'contractor_ai_analysis', 'ai_analysis_daily_weekly', 'ai_analysis_monthly', 'ai_analysis_premium', 'ai_analysis_pro'];
    const planColors = {
        designer_free: { bg: '#f0fdf4', border: '#86efac', icon: '#16a34a', gradient: 'linear-gradient(135deg, #16a34a, #22c55e)' },
        designer_5: { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', gradient: 'linear-gradient(135deg, #2563eb, #3b82f6)' },
        designer_10: { bg: '#f5f3ff', border: '#c4b5fd', icon: '#7c3aed', gradient: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' },
        designer_15: { bg: '#fdf4ff', border: '#f0abfc', icon: '#a855f7', gradient: 'linear-gradient(135deg, #a855f7, #c084fc)' },
        designer_30: { bg: '#fef2f2', border: '#fca5a5', icon: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #f43f5e)' },
        contractor_pro: { bg: '#fff7ed', border: '#fdba74', icon: '#ea580c', gradient: 'linear-gradient(135deg, #ea580c, #f97316)' },
        contractor_ai_estimation: { bg: '#f0fdfa', border: '#5eead4', icon: '#0d9488', gradient: 'linear-gradient(135deg, #0d9488, #14b8a6)' },
        contractor_ai_analysis: { bg: '#f5f3ff', border: '#c4b5fd', icon: '#7c3aed', gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)' },
        ai_analysis_daily_weekly: { bg: '#ecfeff', border: '#67e8f9', icon: '#0891b2', gradient: 'linear-gradient(135deg, #0891b2, #06b6d4)' },
        ai_analysis_monthly: { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', gradient: 'linear-gradient(135deg, #2563eb, #3b82f6)' },
        ai_analysis_premium: { bg: '#f5f3ff', border: '#c4b5fd', icon: '#7c3aed', gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)' },
        ai_analysis_pro: { bg: '#fef2f2', border: '#fca5a5', icon: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #f43f5e)' },
    };

    return planOrder.map(key => {
        const plan = plans[key];
        if (!plan) return '';
        const color = planColors[key] || planColors.designer_free;
        const breakdownStats = state.subscriptionStats.planBreakdown || {};
        const count = breakdownStats[key] || 0;

        const isContractorPro = key === 'contractor_pro';
        const isContractorPayPerUse = key === 'contractor_ai_estimation' || key === 'contractor_ai_analysis';
        const isAiAnalysis = key.startsWith('ai_analysis_');
        let priceDisplay;
        if (isContractorPayPerUse) {
            priceDisplay = plan.aiEstimationRate ? `$${plan.aiEstimationRate}/MB` : `$${plan.aiAnalysisRate}/MB`;
        } else {
            priceDisplay = plan.price === 0 ? 'Free' : `$${plan.price}/${plan.billingCycle === 'weekly' ? 'wk' : 'mo'}`;
        }

        let detailsHtml = '';
        if (isContractorPayPerUse) {
            const rate = plan.aiEstimationRate || plan.aiAnalysisRate;
            const rateLabel = plan.aiEstimationRate ? 'AI Estimation Rate' : 'AI Analysis Rate';
            detailsHtml = `
                <div class="sub-plan-rates">
                    <div class="sub-rate-item">
                        <span class="sub-rate-label">${rateLabel}</span>
                        <span class="sub-rate-value">$${rate}/MB</span>
                    </div>
                </div>`;
        } else if (isContractorPro) {
            detailsHtml = '';
        } else if (isAiAnalysis) {
            detailsHtml = `
                <div class="sub-plan-rates">
                    <div class="sub-rate-item">
                        <span class="sub-rate-label">Free Analyses</span>
                        <span class="sub-rate-value">${plan.aiAnalysisQuota || 0}/period</span>
                    </div>
                    ${plan.storageAllowedMB ? `
                    <div class="sub-rate-item">
                        <span class="sub-rate-label">Max AI Estimation</span>
                        <span class="sub-rate-value">${(plan.storageAllowedMB / 1024).toFixed(0)} GB</span>
                    </div>` : ''}
                </div>`;
        } else {
            detailsHtml = `
                <div class="sub-plan-quota">
                    <span class="sub-quota-label">Quotes Allowed</span>
                    <span class="sub-quota-value">${plan.quotesAllowed || 'Unlimited'}</span>
                </div>`;
        }

        const planSetting = (state.planSettings || {})[key];
        const isEnabled = planSetting ? planSetting.enabled !== false : true;

        return `
            <div class="sub-plan-card" style="border-color:${isEnabled ? color.border : '#d1d5db'}; background:${isEnabled ? color.bg : '#f9fafb'}; ${!isEnabled ? 'opacity:0.7;' : ''}">
                ${!isEnabled ? '<div style="position:absolute; top:8px; right:8px; background:#fef3c7; color:#b45309; font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; text-transform:uppercase; z-index:1;">STOPPED</div>' : ''}
                <div class="sub-plan-header" style="background:${isEnabled ? color.gradient : 'linear-gradient(135deg, #9ca3af, #6b7280)'};">
                    <div class="sub-plan-price">${priceDisplay}</div>
                    <div class="sub-plan-name">${plan.label}</div>
                </div>
                <div class="sub-plan-body">
                    <div class="sub-plan-desc">${plan.description}</div>
                    <ul class="sub-plan-features">
                        ${plan.features.map(f => `<li><i class="fas fa-check" style="color:${color.icon};"></i> ${f}</li>`).join('')}
                    </ul>
                    <div class="sub-plan-subscribers">
                        <i class="fas fa-users" style="color:${color.icon};"></i>
                        <span>${count} active subscriber${count !== 1 ? 's' : ''}</span>
                    </div>
                    ${detailsHtml}
                    ${!isEnabled && planSetting?.stoppedBy ? `<div style="font-size:11px; color:#9ca3af; margin-top:6px;"><i class="fas fa-info-circle"></i> Stopped by ${planSetting.stoppedBy}</div>` : ''}
                    <div style="margin-top:12px; padding-top:12px; border-top:1px solid ${isEnabled ? '#e5e7eb' : '#d1d5db'};">
                        ${isEnabled ? `
                            <button class="btn btn-sm" onclick="togglePlan('${key}', false)" style="width:100%; background:#fef3c7; color:#b45309; border:1px solid #fbbf24; font-weight:700; padding:8px 12px; font-size:13px; border-radius:8px; cursor:pointer;">
                                <i class="fas fa-pause-circle"></i> Stop This Plan
                            </button>
                        ` : `
                            <button class="btn btn-sm" onclick="togglePlan('${key}', true)" style="width:100%; background:#ecfdf5; color:#059669; border:1px solid #6ee7b7; font-weight:700; padding:8px 12px; font-size:13px; border-radius:8px; cursor:pointer;">
                                <i class="fas fa-play-circle"></i> Activate This Plan
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderSubscriptionsTable(subs) {
    if (!subs || subs.length === 0) {
        return `
            <div style="text-align:center; padding:40px 20px; color:#6b7280;">
                <i class="fas fa-inbox" style="font-size:40px; margin-bottom:12px; color:#d1d5db;"></i>
                <p>No subscriptions found</p>
            </div>`;
    }

    const statusColors = {
        active: { bg: '#ecfdf5', color: '#059669', label: 'Active' },
        free_override: { bg: '#eff6ff', color: '#2563eb', label: 'Free' },
        stopped: { bg: '#fef3c7', color: '#b45309', label: 'Stopped' },
        pending: { bg: '#fffbeb', color: '#d97706', label: 'Pending' },
        cancelled: { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' },
        expired: { bg: '#f3f4f6', color: '#6b7280', label: 'Expired' },
    };

    const planLabels = {
        designer_free: 'Designer Free',
        designer_5: 'Designer $5',
        designer_10: 'Designer $10',
        designer_15: 'Designer Plus $15',
        designer_30: 'Designer Premium $30',
        contractor_pro: 'Contractor Pro',
        contractor_ai_estimation: 'AI Estimation $0.40/MB',
        contractor_ai_analysis: 'AI Analysis $0.08/MB',
        ai_analysis_daily_weekly: 'AI Daily/Weekly $5',
        ai_analysis_monthly: 'AI Monthly $10',
        ai_analysis_premium: 'AI Premium $49',
        ai_analysis_pro: 'AI Pro $99',
    };

    return `
        <div class="sub-table-wrapper">
            <table class="sub-table">
                <thead>
                    <tr>
                        <th>Client</th>
                        <th>Plan</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Invoice</th>
                        <th>Start Date</th>
                        <th>Payment</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${subs.map(sub => {
                        const st = statusColors[sub.status] || statusColors.pending;
                        const name = sub.userData?.name || sub.userName || 'Unknown';
                        const email = sub.userEmail || '';
                        const company = sub.userData?.company || '';
                        const planLabel = planLabels[sub.plan] || sub.planLabel || sub.plan;
                        const isFreeOverride = sub.status === 'free_override';
                        const isActive = sub.status === 'active' || sub.status === 'free_override';
                        const inv = sub.latestInvoice;

                        return `
                            <tr>
                                <td>
                                    <div class="sub-client-info">
                                        <div class="sub-client-avatar" style="background:${st.bg}; color:${st.color};">
                                            ${name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div class="sub-client-name">${name}</div>
                                            <div class="sub-client-email">${email}</div>
                                            ${company ? `<div class="sub-client-company">${company}</div>` : ''}
                                        </div>
                                    </div>
                                </td>
                                <td><span class="sub-plan-badge">${planLabel}</span></td>
                                <td><strong>${sub.amount === 0 ? 'Free' : '$' + sub.amount}</strong></td>
                                <td>
                                    <span class="sub-status-badge" style="background:${st.bg}; color:${st.color};">
                                        ${st.label}
                                    </span>
                                </td>
                                <td>
                                    ${inv ? `
                                        <div class="sub-invoice-cell">
                                            <span class="sub-invoice-num">${inv.invoiceNumber}</span>
                                            <div class="sub-invoice-actions">
                                                ${inv.pdfUrl ? `<a href="${inv.pdfUrl}" target="_blank" class="sub-inv-btn" title="Download PDF"><i class="fas fa-file-pdf"></i></a>` : ''}
                                                <button class="sub-inv-btn" onclick="viewSubscriptionInvoices('${sub._id}')" title="View all invoices"><i class="fas fa-receipt"></i></button>
                                            </div>
                                        </div>
                                    ` : `<span style="color:#9ca3af; font-size:12px;">No invoice</span>`}
                                </td>
                                <td>${formatAdminDate(sub.startDate)}</td>
                                <td>
                                    <span style="text-transform:capitalize; font-size:13px;">${sub.paymentMethod}</span>
                                </td>
                                <td>
                                    <div class="sub-actions" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                                        ${sub.status === 'active' ? `
                                            <button class="btn btn-xs" onclick="setSubscriptionStatus('${sub._id}', 'stopped')" title="Stop this subscription" style="background:#fef3c7; color:#b45309; border:1px solid #fbbf24; font-weight:600; padding:4px 10px; font-size:11px;">
                                                <i class="fas fa-pause"></i> Stop
                                            </button>
                                            <button class="btn btn-xs" onclick="setSubscriptionStatus('${sub._id}', 'free_override')" title="Make free" style="background:#eff6ff; color:#2563eb; border:1px solid #93c5fd; font-weight:600; padding:4px 10px; font-size:11px;">
                                                <i class="fas fa-gift"></i> Free
                                            </button>
                                        ` : ''}
                                        ${sub.status === 'stopped' ? `
                                            <button class="btn btn-xs" onclick="setSubscriptionStatus('${sub._id}', 'active')" title="Activate this subscription" style="background:#ecfdf5; color:#059669; border:1px solid #6ee7b7; font-weight:600; padding:4px 10px; font-size:11px;">
                                                <i class="fas fa-play"></i> Activate
                                            </button>
                                            <button class="btn btn-xs" onclick="setSubscriptionStatus('${sub._id}', 'free_override')" title="Make free" style="background:#eff6ff; color:#2563eb; border:1px solid #93c5fd; font-weight:600; padding:4px 10px; font-size:11px;">
                                                <i class="fas fa-gift"></i> Free
                                            </button>
                                        ` : ''}
                                        ${sub.status === 'free_override' ? `
                                            <button class="btn btn-xs" onclick="setSubscriptionStatus('${sub._id}', 'active')" title="Set to paid active" style="background:#ecfdf5; color:#059669; border:1px solid #6ee7b7; font-weight:600; padding:4px 10px; font-size:11px;">
                                                <i class="fas fa-play"></i> Activate
                                            </button>
                                            <button class="btn btn-xs" onclick="setSubscriptionStatus('${sub._id}', 'stopped')" title="Stop this subscription" style="background:#fef3c7; color:#b45309; border:1px solid #fbbf24; font-weight:600; padding:4px 10px; font-size:11px;">
                                                <i class="fas fa-pause"></i> Stop
                                            </button>
                                        ` : ''}
                                        ${isActive || sub.status === 'stopped' ? `
                                            <button class="btn btn-xs btn-danger" onclick="cancelSubscription('${sub._id}')" title="Cancel subscription permanently" style="padding:4px 10px; font-size:11px;">
                                                <i class="fas fa-ban"></i> Cancel
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-xs" onclick="viewSubscriptionDetails('${sub._id}')" title="View details" style="background:#f1f5f9; border:1px solid #e2e8f0; padding:4px 8px; font-size:11px;">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function filterSubscriptions() {
    const statusFilter = document.getElementById('subFilterStatus')?.value || 'all';
    const planFilter = document.getElementById('subFilterPlan')?.value || 'all';

    let filtered = state.subscriptions || [];
    if (statusFilter !== 'all') {
        filtered = filtered.filter(s => s.status === statusFilter);
    }
    if (planFilter !== 'all') {
        filtered = filtered.filter(s => s.plan === planFilter);
    }

    const tableContainer = document.getElementById('subscriptionsTableContainer');
    if (tableContainer) {
        tableContainer.innerHTML = renderSubscriptionsTable(filtered);
    }
}

async function togglePlan(planId, enable) {
    const action = enable ? 'ACTIVATE' : 'STOP';
    const planLabel = state.subscriptionPlans[planId]?.label || planId;
    const msg = enable
        ? `Activate "${planLabel}"? All stopped subscriptions on this plan will be reactivated.`
        : `Stop "${planLabel}"? All active subscriptions on this plan will be stopped immediately.`;

    if (!confirm(msg)) return;

    try {
        const result = await subscriptionApiCall('/admin/toggle-plan', 'POST', {
            planId,
            enabled: enable,
        });

        showNotification(result.message || `Plan ${action === 'STOP' ? 'stopped' : 'activated'}`, 'success');
        loadSubscriptionsData();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

async function toggleFreeService(subscriptionId, grantFree) {
    try {
        const action = grantFree ? 'grant free service to' : 'revoke free service from';
        if (!confirm(`Are you sure you want to ${action} this subscriber?`)) {
            loadSubscriptionsData();
            return;
        }

        const result = await subscriptionApiCall('/admin/toggle-free', 'POST', {
            subscriptionId,
            grantFree,
        });

        showNotification(result.message || 'Subscription updated', 'success');
        loadSubscriptionsData();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
        loadSubscriptionsData();
    }
}

async function setSubscriptionStatus(subscriptionId, newStatus) {
    const labels = { active: 'Activate', stopped: 'Stop', free_override: 'make Free' };
    if (!confirm(`Are you sure you want to ${labels[newStatus] || newStatus} this subscription?`)) {
        loadSubscriptionsData();
        return;
    }

    try {
        const result = await subscriptionApiCall('/admin/set-status', 'POST', {
            subscriptionId,
            newStatus,
        });

        showNotification(result.message || 'Subscription status updated', 'success');
        loadSubscriptionsData();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
        loadSubscriptionsData();
    }
}

async function cancelSubscription(subscriptionId) {
    const reason = prompt('Enter cancellation reason (optional):');
    if (reason === null) return; // User pressed cancel

    try {
        const result = await subscriptionApiCall('/admin/cancel', 'POST', {
            subscriptionId,
            reason: reason || 'Cancelled by admin',
        });

        showNotification(result.message || 'Subscription cancelled', 'success');
        loadSubscriptionsData();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

function viewSubscriptionDetails(subscriptionId) {
    const sub = state.subscriptions.find(s => s._id === subscriptionId);
    if (!sub) return showNotification('Subscription not found', 'error');

    const statusColors = {
        active: '#059669', free_override: '#2563eb', stopped: '#b45309',
        pending: '#d97706', cancelled: '#dc2626', expired: '#6b7280',
    };
    const stColor = statusColors[sub.status] || '#6b7280';

    const modalHtml = `
        <div class="modal-overlay" onclick="this.remove()">
            <div class="modal-content sub-detail-modal" onclick="event.stopPropagation()" style="max-width:560px;">
                <div class="modal-header" style="background:linear-gradient(135deg, #4f46e5, #7c3aed); color:white; padding:20px 24px; border-radius:12px 12px 0 0;">
                    <h3 style="margin:0; font-size:18px;"><i class="fas fa-receipt"></i> Subscription Details</h3>
                    <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,0.2); border:none; color:white; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding:24px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                        <div class="sub-detail-field">
                            <label>Client Name</label>
                            <span>${sub.userData?.name || sub.userName || 'N/A'}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>Email</label>
                            <span>${sub.userEmail || 'N/A'}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>User Type</label>
                            <span style="text-transform:capitalize;">${sub.userType || 'N/A'}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>Plan</label>
                            <span>${sub.planLabel || sub.plan}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>Amount</label>
                            <span>${sub.amount === 0 ? 'Free' : '$' + sub.amount + '/mo'}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>Status</label>
                            <span style="color:${stColor}; font-weight:600; text-transform:capitalize;">${sub.status.replace('_', ' ')}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>Start Date</label>
                            <span>${formatAdminDate(sub.startDate)}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>End Date</label>
                            <span>${formatAdminDate(sub.endDate)}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>Payment Method</label>
                            <span style="text-transform:capitalize;">${sub.paymentMethod}</span>
                        </div>
                        <div class="sub-detail-field">
                            <label>Free Override</label>
                            <span>${sub.freeOverride ? 'Yes (by ' + (sub.freeOverrideBy || 'admin') + ')' : 'No'}</span>
                        </div>
                        ${sub.quotesAllowed !== null && sub.quotesAllowed !== undefined ? `
                            <div class="sub-detail-field">
                                <label>Quotes Used</label>
                                <span>${sub.quotesUsed || 0} / ${sub.quotesAllowed}</span>
                            </div>
                        ` : ''}
                        ${sub.aiEstimationRate ? `
                            <div class="sub-detail-field">
                                <label>AI Estimation Rate</label>
                                <span>$${sub.aiEstimationRate}/MB</span>
                            </div>
                        ` : ''}
                        ${sub.aiAnalysisRate ? `
                            <div class="sub-detail-field">
                                <label>AI Analysis Rate</label>
                                <span>$${sub.aiAnalysisRate}/MB</span>
                            </div>
                        ` : ''}
                        ${sub.stripeCustomerId ? `
                            <div class="sub-detail-field">
                                <label>Stripe Customer</label>
                                <span style="font-family:monospace; font-size:12px;">${sub.stripeCustomerId}</span>
                            </div>
                        ` : ''}
                        ${sub.statusChangedBy ? `
                            <div class="sub-detail-field" style="grid-column:span 2;">
                                <label>Status Changed By</label>
                                <span>${sub.statusChangedBy} on ${formatAdminDate(sub.statusChangedAt)}</span>
                            </div>
                        ` : ''}
                        ${sub.cancelledAt ? `
                            <div class="sub-detail-field" style="grid-column:span 2;">
                                <label>Cancelled</label>
                                <span>${formatAdminDate(sub.cancelledAt)} — ${sub.cancelReason || 'No reason'}</span>
                            </div>
                        ` : ''}
                        <div class="sub-detail-field">
                            <label>Created</label>
                            <span>${formatAdminDate(sub.createdAt)}</span>
                        </div>
                        ${sub.userData?.company ? `
                            <div class="sub-detail-field">
                                <label>Company</label>
                                <span>${sub.userData.company}</span>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Subscription Control Actions -->
                    ${sub.status !== 'cancelled' && sub.status !== 'expired' ? `
                    <div style="margin-top:20px; padding-top:20px; border-top:1px solid #e5e7eb;">
                        <label style="display:block; font-weight:700; font-size:13px; color:#374151; margin-bottom:10px;"><i class="fas fa-sliders-h"></i> Subscription Control</label>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                            ${sub.status !== 'active' ? `
                                <button class="btn btn-sm" onclick="closeModal(); setSubscriptionStatus('${sub._id}', 'active')" style="background:#ecfdf5; color:#059669; border:1px solid #6ee7b7; font-weight:600;">
                                    <i class="fas fa-play-circle"></i> Activate
                                </button>
                            ` : ''}
                            ${sub.status !== 'stopped' ? `
                                <button class="btn btn-sm" onclick="closeModal(); setSubscriptionStatus('${sub._id}', 'stopped')" style="background:#fef3c7; color:#b45309; border:1px solid #fbbf24; font-weight:600;">
                                    <i class="fas fa-pause-circle"></i> Stop
                                </button>
                            ` : ''}
                            ${sub.status !== 'free_override' ? `
                                <button class="btn btn-sm" onclick="closeModal(); setSubscriptionStatus('${sub._id}', 'free_override')" style="background:#eff6ff; color:#2563eb; border:1px solid #93c5fd; font-weight:600;">
                                    <i class="fas fa-gift"></i> Make Free
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-danger" onclick="closeModal(); cancelSubscription('${sub._id}')" style="font-weight:600;">
                                <i class="fas fa-ban"></i> Cancel Permanently
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHtml;
}

function showCreateSubscriptionModal() {
    const modalHtml = `
        <div class="modal-overlay" onclick="this.remove()">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-width:480px;">
                <div class="modal-header" style="background:linear-gradient(135deg, #4f46e5, #7c3aed); color:white; padding:20px 24px; border-radius:12px 12px 0 0;">
                    <h3 style="margin:0; font-size:18px;"><i class="fas fa-plus-circle"></i> Create Subscription</h3>
                    <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,0.2); border:none; color:white; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding:24px;">
                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:14px; color:#374151;">User Email</label>
                        <input type="email" id="newSubEmail" placeholder="user@example.com" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:14px; color:#374151;">Plan</label>
                        <select id="newSubPlan" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; box-sizing:border-box;">
                            <option value="">Select a plan...</option>
                            <option value="designer_free">Designer Free (1 quote)</option>
                            <option value="designer_5">Designer Basic - $5/mo (5 quotes)</option>
                            <option value="designer_10">Designer Standard - $10/mo (10 quotes)</option>
                            <option value="designer_15">Designer Plus - $15/mo (20 quotes)</option>
                            <option value="designer_30">Designer Premium - $30/mo (Unlimited quotes)</option>
                            <option value="contractor_pro">Contractor Pro - $49/mo</option>
                            <option value="contractor_ai_estimation">AI Estimation - $0.40/MB (Pay Per Use)</option>
                            <option value="contractor_ai_analysis">AI Analysis - $0.08/MB (Pay Per Use)</option>
                            <option value="ai_analysis_daily_weekly">AI Analysis Daily/Weekly - $5/wk</option>
                            <option value="ai_analysis_monthly">AI Analysis Monthly - $10/mo</option>
                            <option value="ai_analysis_premium">AI Analysis Premium - $49/mo (100GB max estimation + 1 analysis)</option>
                            <option value="ai_analysis_pro">AI Analysis Pro - $99/mo (500GB max estimation + 3 analyses)</option>
                        </select>
                    </div>
                    <div style="margin-bottom:20px;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:14px; color:#374151;">
                            <input type="checkbox" id="newSubFree" style="width:18px; height:18px;">
                            <span>Grant as <strong>free service</strong> (no payment required)</span>
                        </label>
                    </div>
                    <div style="display:flex; gap:12px; justify-content:flex-end;">
                        <button class="btn" onclick="this.closest('.modal-overlay').remove()" style="background:#f1f5f9; border:1px solid #e2e8f0;">Cancel</button>
                        <button class="btn btn-primary" onclick="createManualSubscription()">
                            <i class="fas fa-check"></i> Create Subscription
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = modalHtml;
}

async function createManualSubscription() {
    const email = document.getElementById('newSubEmail')?.value?.trim();
    const planId = document.getElementById('newSubPlan')?.value;
    const isFree = document.getElementById('newSubFree')?.checked || false;

    if (!email) return showNotification('Please enter a user email', 'warning');
    if (!planId) return showNotification('Please select a plan', 'warning');

    try {
        const result = await subscriptionApiCall('/admin/create-manual', 'POST', {
            userEmail: email,
            planId,
            isFree,
        });

        showNotification(result.message || 'Subscription created', 'success');
        document.querySelector('.modal-overlay')?.remove();
        loadSubscriptionsData();
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

// ============================================================
// INVOICE MANAGEMENT (Admin)
// ============================================================

async function viewAllInvoices() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="this.remove()">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-width:800px;">
                <div class="modal-header" style="background:linear-gradient(135deg, #6d28d9, #8b5cf6); color:white; padding:20px 24px; border-radius:12px 12px 0 0;">
                    <h3 style="margin:0; font-size:18px;"><i class="fas fa-file-invoice"></i> All Invoices</h3>
                    <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,0.2); border:none; color:white; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="allInvoicesContent" style="padding:24px;">
                    <div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:24px; color:#6366f1;"></i><p style="color:#6b7280; margin-top:8px;">Loading invoices...</p></div>
                </div>
            </div>
        </div>
    `;

    try {
        const result = await subscriptionApiCall('/admin/invoices');
        const invoices = result.invoices || [];
        renderInvoicesList('allInvoicesContent', invoices);
    } catch (error) {
        document.getElementById('allInvoicesContent').innerHTML = `<p style="color:#dc2626; text-align:center;">Error: ${error.message}</p>`;
    }
}

async function viewSubscriptionInvoices(subscriptionId) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div class="modal-overlay" onclick="this.remove()">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-width:800px;">
                <div class="modal-header" style="background:linear-gradient(135deg, #6d28d9, #8b5cf6); color:white; padding:20px 24px; border-radius:12px 12px 0 0;">
                    <h3 style="margin:0; font-size:18px;"><i class="fas fa-receipt"></i> Subscription Invoices</h3>
                    <button onclick="this.closest('.modal-overlay').remove()" style="background:rgba(255,255,255,0.2); border:none; color:white; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="subInvoicesContent" style="padding:24px;">
                    <div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:24px; color:#6366f1;"></i><p style="color:#6b7280; margin-top:8px;">Loading invoices...</p></div>
                </div>
            </div>
        </div>
    `;

    try {
        const result = await subscriptionApiCall(`/admin/invoices/${subscriptionId}`);
        const invoices = result.invoices || [];
        renderInvoicesList('subInvoicesContent', invoices);
    } catch (error) {
        document.getElementById('subInvoicesContent').innerHTML = `<p style="color:#dc2626; text-align:center;">Error: ${error.message}</p>`;
    }
}

function renderInvoicesList(containerId, invoices) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (invoices.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#6b7280;">
                <i class="fas fa-inbox" style="font-size:36px; color:#d1d5db; margin-bottom:10px;"></i>
                <p>No invoices found</p>
            </div>`;
        return;
    }

    const invoiceStatusColors = {
        paid: { bg: '#ecfdf5', color: '#059669' },
        free: { bg: '#eff6ff', color: '#2563eb' },
        pending: { bg: '#fffbeb', color: '#d97706' },
        failed: { bg: '#fef2f2', color: '#dc2626' },
        refunded: { bg: '#f3f4f6', color: '#6b7280' },
    };

    container.innerHTML = `
        <div class="sub-table-wrapper">
            <table class="sub-table" style="font-size:13px;">
                <thead>
                    <tr>
                        <th>Invoice #</th>
                        <th>Customer</th>
                        <th>Plan</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Issued</th>
                        <th>Email Sent</th>
                        <th>PDF</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoices.map(inv => {
                        const stc = invoiceStatusColors[inv.status] || invoiceStatusColors.pending;
                        return `
                            <tr>
                                <td><strong style="font-family:monospace; font-size:12px;">${inv.invoiceNumber}</strong></td>
                                <td>
                                    <div style="font-weight:600; font-size:13px;">${inv.customerName}</div>
                                    <div style="font-size:11px; color:#6b7280;">${inv.customerEmail}</div>
                                </td>
                                <td><span class="sub-plan-badge" style="font-size:11px;">${inv.planLabel}</span></td>
                                <td><strong>${inv.total === 0 ? 'Free' : '$' + inv.total.toFixed(2)}</strong></td>
                                <td>
                                    <span class="sub-status-badge" style="background:${stc.bg}; color:${stc.color}; font-size:11px;">
                                        ${inv.status.toUpperCase()}
                                    </span>
                                </td>
                                <td>${formatAdminDate(inv.issuedAt)}</td>
                                <td>
                                    <div style="display:flex; gap:6px; align-items:center;">
                                        <span title="Customer" style="font-size:12px;">${inv.emailSentToCustomer ? '<i class="fas fa-check-circle" style="color:#059669;"></i>' : '<i class="fas fa-times-circle" style="color:#dc2626;"></i>'}</span>
                                        <span title="Admin" style="font-size:12px;">${inv.emailSentToAdmin ? '<i class="fas fa-check-circle" style="color:#059669;"></i>' : '<i class="fas fa-times-circle" style="color:#dc2626;"></i>'}</span>
                                    </div>
                                </td>
                                <td>
                                    ${inv.pdfUrl ? `
                                        <a href="${inv.pdfUrl}" target="_blank" class="sub-inv-btn" title="Download PDF" style="color:#2563eb;">
                                            <i class="fas fa-download"></i>
                                        </a>
                                    ` : `
                                        <button class="sub-inv-btn" onclick="regenerateInvoicePDF('${inv._id}')" title="Generate PDF" style="color:#d97706;">
                                            <i class="fas fa-redo"></i>
                                        </button>
                                    `}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function regenerateInvoicePDF(invoiceId) {
    try {
        showNotification('Regenerating invoice PDF...', 'info');
        const result = await subscriptionApiCall(`/admin/invoices/${invoiceId}/regenerate`, 'POST');
        showNotification('Invoice PDF regenerated successfully', 'success');

        // Refresh the invoices modal if open
        const allContent = document.getElementById('allInvoicesContent');
        if (allContent) viewAllInvoices();
        const subContent = document.getElementById('subInvoicesContent');
        if (subContent) {
            const subId = result.invoice?.subscriptionId;
            if (subId) viewSubscriptionInvoices(subId);
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

// ============================================
// MEETINGS MANAGEMENT
// ============================================
let meetingsFilter = 'all';

async function loadMeetingsData() {
    const container = document.getElementById('meetings-tab');
    showLoader(container);
    try {
        const response = await apiCall('/meetings');
        state.meetings = response.data || response.meetings || [];
        renderMeetingsTab();
    } catch (error) {
        container.innerHTML = `<div class="error-state"><p>Failed to load meetings data.</p><button class="btn btn-primary" onclick="loadMeetingsData()">Retry</button></div>`;
    }
}

function renderMeetingsTab() {
    const container = document.getElementById('meetings-tab');
    const meetings = state.meetings || [];

    const totalMeetings = meetings.length;
    const upcoming = meetings.filter(m => m.status === 'scheduled' && new Date(m.meetingDateTime) >= new Date()).length;
    const completed = meetings.filter(m => m.status === 'completed' || (m.status === 'scheduled' && new Date(m.meetingDateTime) < new Date())).length;
    const cancelled = meetings.filter(m => m.status === 'cancelled').length;

    let filtered = meetings;
    if (meetingsFilter === 'upcoming') filtered = meetings.filter(m => m.status === 'scheduled' && new Date(m.meetingDateTime) >= new Date());
    else if (meetingsFilter === 'past') filtered = meetings.filter(m => m.status === 'completed' || (m.status === 'scheduled' && new Date(m.meetingDateTime) < new Date()));
    else if (meetingsFilter === 'cancelled') filtered = meetings.filter(m => m.status === 'cancelled');

    filtered.sort((a, b) => new Date(b.meetingDateTime) - new Date(a.meetingDateTime));

    container.innerHTML = `
        <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
            <div class="stat-card stat-card-blue" style="cursor:pointer" onclick="filterMeetingsAdmin('all')">
                <div class="stat-icon" style="background:rgba(59,130,246,0.1)"><i class="fas fa-calendar-check" style="color:#3b82f6"></i></div>
                <div class="stat-content"><div class="stat-number">${totalMeetings}</div><div class="stat-label">Total Meetings</div></div>
            </div>
            <div class="stat-card" style="border-left:4px solid #10b981;cursor:pointer" onclick="filterMeetingsAdmin('upcoming')">
                <div class="stat-icon" style="background:rgba(16,185,129,0.1)"><i class="fas fa-clock" style="color:#10b981"></i></div>
                <div class="stat-content"><div class="stat-number">${upcoming}</div><div class="stat-label">Upcoming</div></div>
            </div>
            <div class="stat-card" style="border-left:4px solid #6366f1;cursor:pointer" onclick="filterMeetingsAdmin('past')">
                <div class="stat-icon" style="background:rgba(99,102,241,0.1)"><i class="fas fa-history" style="color:#6366f1"></i></div>
                <div class="stat-content"><div class="stat-number">${completed}</div><div class="stat-label">Completed</div></div>
            </div>
            <div class="stat-card" style="border-left:4px solid #ef4444;cursor:pointer" onclick="filterMeetingsAdmin('cancelled')">
                <div class="stat-icon" style="background:rgba(239,68,68,0.1)"><i class="fas fa-times-circle" style="color:#ef4444"></i></div>
                <div class="stat-content"><div class="stat-number">${cancelled}</div><div class="stat-label">Cancelled</div></div>
            </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
            <div style="display:flex; gap:8px;">
                <button class="btn btn-sm ${meetingsFilter === 'all' ? 'btn-primary' : 'btn-outline'}" onclick="filterMeetingsAdmin('all')">All</button>
                <button class="btn btn-sm ${meetingsFilter === 'upcoming' ? 'btn-primary' : 'btn-outline'}" onclick="filterMeetingsAdmin('upcoming')">Upcoming</button>
                <button class="btn btn-sm ${meetingsFilter === 'past' ? 'btn-primary' : 'btn-outline'}" onclick="filterMeetingsAdmin('past')">Past</button>
                <button class="btn btn-sm ${meetingsFilter === 'cancelled' ? 'btn-primary' : 'btn-outline'}" onclick="filterMeetingsAdmin('cancelled')">Cancelled</button>
            </div>
            <button class="btn btn-sm btn-outline" onclick="loadMeetingsData()" style="margin-left:auto;"><i class="fas fa-sync-alt"></i> Refresh</button>
        </div>

        ${filtered.length === 0 ? `
            <div class="empty-state" style="text-align:center; padding:60px 20px;">
                <i class="fas fa-calendar-day" style="font-size:48px; color:#cbd5e1; margin-bottom:16px;"></i>
                <h3 style="color:#64748b;">No Meetings Found</h3>
                <p style="color:#94a3b8;">No meetings match the current filter.</p>
            </div>
        ` : `
            <div class="table-container" style="overflow-x:auto;">
                <table class="data-table" style="width:100%;">
                    <thead>
                        <tr>
                            <th>Meeting</th>
                            <th>Date & Time</th>
                            <th>Duration</th>
                            <th>Organizer</th>
                            <th>Project</th>
                            <th>Attendees</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(m => {
                            const mDate = new Date(m.meetingDateTime);
                            const isPast = mDate < new Date();
                            const dateStr = mDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            const timeStr = mDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                            const acceptedCount = (m.attendees || []).filter(a => a.status === 'accepted').length;
                            const totalAtt = (m.attendees || []).length;
                            const statusClass = m.status === 'cancelled' ? 'color:#ef4444' : isPast ? 'color:#6366f1' : 'color:#10b981';
                            const statusLabel = m.status === 'cancelled' ? 'Cancelled' : isPast ? 'Completed' : 'Upcoming';
                            const statusIcon = m.status === 'cancelled' ? 'fa-times-circle' : isPast ? 'fa-check-circle' : 'fa-clock';

                            const meetingTypeLabels = {
                                'project_discussion': 'Discussion',
                                'design_review': 'Design Review',
                                'progress_update': 'Progress Update',
                                'kickoff': 'Kickoff',
                                'final_review': 'Final Review',
                                'other': 'Other'
                            };

                            return `<tr>
                                <td>
                                    <div style="font-weight:600;color:#1e293b;">${sanitizeInput(m.title)}</div>
                                    <small style="color:#94a3b8;">${meetingTypeLabels[m.meetingType] || m.meetingType || 'Meeting'}</small>
                                </td>
                                <td>
                                    <div style="font-weight:500;">${dateStr}</div>
                                    <small style="color:#64748b;">${timeStr}</small>
                                </td>
                                <td>${m.duration || 30} min</td>
                                <td>
                                    <div style="font-weight:500;">${sanitizeInput(m.organizerName || 'Unknown')}</div>
                                    <small style="color:#94a3b8;">${m.organizerType || ''}</small>
                                </td>
                                <td>${m.jobTitle ? sanitizeInput(m.jobTitle) : '<span style="color:#94a3b8;">—</span>'}</td>
                                <td>
                                    <span style="font-weight:500;">${acceptedCount}/${totalAtt}</span>
                                    <small style="color:#64748b;"> accepted</small>
                                </td>
                                <td><span style="${statusClass}; font-weight:600;"><i class="fas ${statusIcon}"></i> ${statusLabel}</span></td>
                                <td><button class="btn btn-sm btn-outline" onclick="viewMeetingDetails('${m.id}')"><i class="fas fa-eye"></i></button></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `}
    `;
}

function filterMeetingsAdmin(filter) {
    meetingsFilter = filter;
    renderMeetingsTab();
}

function viewMeetingDetails(meetingId) {
    const meeting = state.meetings.find(m => m.id === meetingId);
    if (!meeting) return;

    const mDate = new Date(meeting.meetingDateTime);
    const endDate = new Date(meeting.endDateTime);
    const dateStr = mDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const timeStr = mDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const endTimeStr = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const isPast = mDate < new Date();

    const meetingTypeLabels = {
        'project_discussion': 'Project Discussion',
        'design_review': 'Design Review',
        'progress_update': 'Progress Update',
        'kickoff': 'Project Kickoff',
        'final_review': 'Final Review',
        'other': 'Other'
    };

    const attendeesHTML = (meeting.attendees || []).map(a => {
        const statusColor = a.status === 'accepted' ? '#10b981' : a.status === 'declined' ? '#ef4444' : '#f59e0b';
        const statusIcon = a.status === 'accepted' ? 'fa-check-circle' : a.status === 'declined' ? 'fa-times-circle' : 'fa-clock';
        return `<div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border-radius:8px; margin-bottom:8px;">
            <div>
                <strong>${sanitizeInput(a.name)}</strong>
                <span style="color:#94a3b8; margin-left:8px; font-size:13px;">${sanitizeInput(a.email || '')}</span>
                <span style="display:inline-block; background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:4px; font-size:11px; margin-left:8px;">${a.type || 'user'}</span>
            </div>
            <span style="color:${statusColor}; font-weight:600; font-size:13px;"><i class="fas ${statusIcon}"></i> ${a.status}</span>
        </div>`;
    }).join('');

    const content = `
        <div style="padding:28px;">
            <div style="display:flex; align-items:center; gap:14px; margin-bottom:24px;">
                <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#6366f1);display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-calendar-check" style="color:#fff;font-size:20px;"></i>
                </div>
                <div>
                    <h3 style="margin:0;color:#1e293b;font-size:20px;">${sanitizeInput(meeting.title)}</h3>
                    <p style="margin:4px 0 0;color:#64748b;font-size:14px;">${meetingTypeLabels[meeting.meetingType] || 'Meeting'}</p>
                </div>
                <span style="margin-left:auto; padding:6px 14px; border-radius:20px; font-weight:600; font-size:13px; background:${meeting.status === 'cancelled' ? '#fef2f2; color:#ef4444' : isPast ? '#f0f0ff; color:#6366f1' : '#f0fdf4; color:#10b981'}">
                    ${meeting.status === 'cancelled' ? 'Cancelled' : isPast ? 'Completed' : 'Upcoming'}
                </span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px;">
                <div style="background:#f8fafc; padding:14px 18px; border-radius:10px;">
                    <div style="font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Date & Time</div>
                    <div style="font-weight:600; color:#1e293b;">${dateStr}</div>
                    <div style="color:#64748b;">${timeStr} — ${endTimeStr} (${meeting.duration} min)</div>
                </div>
                <div style="background:#f8fafc; padding:14px 18px; border-radius:10px;">
                    <div style="font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Location</div>
                    <div style="font-weight:600; color:#1e293b;">${sanitizeInput(meeting.location || 'Online')}</div>
                </div>
                <div style="background:#f8fafc; padding:14px 18px; border-radius:10px;">
                    <div style="font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Organizer</div>
                    <div style="font-weight:600; color:#1e293b;">${sanitizeInput(meeting.organizerName)}</div>
                    <div style="color:#64748b; font-size:13px;">${sanitizeInput(meeting.organizerEmail || '')}</div>
                </div>
                <div style="background:#f8fafc; padding:14px 18px; border-radius:10px;">
                    <div style="font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Project</div>
                    <div style="font-weight:600; color:#1e293b;">${meeting.jobTitle ? sanitizeInput(meeting.jobTitle) : 'No project linked'}</div>
                </div>
            </div>

            ${meeting.agenda ? `
            <div style="margin-bottom:20px;">
                <h4 style="margin:0 0 8px; color:#1e293b;"><i class="fas fa-list-ul" style="color:#6366f1; margin-right:6px;"></i> Agenda</h4>
                <div style="background:#f8fafc; padding:14px 18px; border-radius:10px; color:#334155; line-height:1.7; white-space:pre-wrap;">${sanitizeInput(meeting.agenda)}</div>
            </div>` : ''}

            ${meeting.description ? `
            <div style="margin-bottom:20px;">
                <h4 style="margin:0 0 8px; color:#1e293b;"><i class="fas fa-sticky-note" style="color:#f59e0b; margin-right:6px;"></i> Notes</h4>
                <div style="background:#f8fafc; padding:14px 18px; border-radius:10px; color:#334155;">${sanitizeInput(meeting.description)}</div>
            </div>` : ''}

            <div style="margin-bottom:20px;">
                <h4 style="margin:0 0 12px; color:#1e293b;"><i class="fas fa-users" style="color:#3b82f6; margin-right:6px;"></i> Attendees (${(meeting.attendees || []).length})</h4>
                ${attendeesHTML || '<p style="color:#94a3b8;">No attendees</p>'}
            </div>

            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9;">
                <small style="color:#94a3b8; margin-right:auto;">Created: ${formatAdminDate(meeting.createdAt)}</small>
                <button class="btn btn-outline" onclick="closeModal()">Close</button>
            </div>
        </div>`;

    showModal(content);
}
