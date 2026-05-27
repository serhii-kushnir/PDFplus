// theme.js
function initTheme() {
    const savedTheme = localStorage.getItem('pdf_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-sun"></i> Тема';
        // для старої кнопки, якщо залишилась десь (для сумісності)
        const oldToggle = document.querySelector('.theme-toggle');
        if (oldToggle) oldToggle.innerHTML = '<i class="fas fa-sun"></i> Тема';
    } else {
        document.body.classList.remove('dark');
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-moon"></i> Тема';
        const oldToggle = document.querySelector('.theme-toggle');
        if (oldToggle) oldToggle.innerHTML = '<i class="fas fa-moon"></i> Тема';
    }
}

function setupThemeToggle() {
    const toggleBtn = document.getElementById('themeToggle');
    if (!toggleBtn) return;
    toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        if (document.body.classList.contains('dark')) {
            localStorage.setItem('pdf_theme', 'dark');
            toggleBtn.innerHTML = '<i class="fas fa-sun"></i> Тема';
            const oldToggle = document.querySelector('.theme-toggle');
            if (oldToggle) oldToggle.innerHTML = '<i class="fas fa-sun"></i> Тема';
        } else {
            localStorage.setItem('pdf_theme', 'light');
            toggleBtn.innerHTML = '<i class="fas fa-moon"></i> Тема';
            const oldToggle = document.querySelector('.theme-toggle');
            if (oldToggle) oldToggle.innerHTML = '<i class="fas fa-moon"></i> Тема';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupThemeToggle();
});