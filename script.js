<script>
console.log('Inline script starting...');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready');
    
    const token = localStorage.getItem('jwtToken');
    const user = localStorage.getItem('currentUser');
    
    if (!token || !user) {
        alert('Authentication required');
        window.location.href = 'index.html';
        return;
    }
    
    const userData = JSON.parse(user);
    if (userData.role !== 'admin') {
        alert('Admin access required');
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('adminName').textContent = userData.name || userData.email;
    document.getElementById('users-tab').innerHTML = '<h3>Admin panel loaded!</h3>';
});

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.closest('.tab').classList.add('active');
}
</script>
