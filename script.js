console.log('Script starting...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Test if elements exist
    const adminName = document.getElementById('adminName');
    if (adminName) {
        adminName.textContent = 'Test Admin';
        console.log('Admin name set successfully');
    } else {
        console.log('Admin name element not found');
    }
});

function logout() {
    console.log('Logout clicked');
    localStorage.clear();
    window.location.href = 'index.html';
}

function showTab(tabName) {
    console.log('Tab clicked:', tabName);
    alert('Tab ' + tabName + ' clicked - this means JavaScript is working');
}

console.log('Script loaded');
