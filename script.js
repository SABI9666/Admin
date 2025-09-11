console.log('Script file is loading...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready');
    
    // Test basic authentication
    const token = localStorage.getItem('jwtToken');
    const user = localStorage.getItem('currentUser');
    
    console.log('Token exists:', !!token);
    console.log('User exists:', !!user);
    
    if (!token || !user) {
        alert('No authentication found - redirecting to login');
        window.location.href = 'index.html';
        return;
    }
    
    try {
        const userData = JSON.parse(user);
        console.log('User data:', userData);
        
        if (userData.role !== 'admin') {
            alert('Not an admin user');
            window.location.href = 'index.html';
            return;
        }
        
        // Set admin name
        document.getElementById('adminName').textContent = userData.name || userData.email;
        
        // Simple test content
        document.getElementById('users-tab').innerHTML = '<h3>Users tab loaded successfully!</h3>';
        document.getElementById('profile-reviews-tab').innerHTML = '<h3>Reviews tab loaded successfully!</h3>';
        
        console.log('Basic setup completed');
        
    } catch (e) {
        console.error('Error parsing user data:', e);
        alert('Invalid user data');
    }
});

function logout() {
    console.log('Logout clicked');
    localStorage.clear();
    window.location.href = 'index.html';
}

function showTab(tabName) {
    console.log('Tab clicked:', tabName);
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    // Show selected tab
    const content = document.getElementById(tabName + '-tab');
    const button = event.target.closest('.tab');
    
    if (content) content.classList.add('active');
    if (button) button.classList.add('active');
}

console.log('Minimal script loaded');
