<?php
// You can do some initialization for the template here
@date_default_timezone_set(date_default_timezone_get());
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>RapidLeech - Modern File Downloader</title>
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- Main Stylesheet -->
    <link rel="stylesheet" href="templates/plugmod/styles/rl_style_pm.css">
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%238b5cf6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='45' fill='url(%23g)'/%3E%3Cpath d='M50 25 L50 60 M35 50 L50 65 L65 50' stroke='white' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
    
    <script type="text/javascript">
    /* <![CDATA[ */
    var php_js_strings = [];
    php_js_strings[87] = " <?php echo lang(87); ?>";
    php_js_strings[281] = "<?php echo lang(281); ?>";
    pic1 = new Image();
    pic1.src = "templates/plugmod/images/ajax-loading.gif";
    
    // Theme Management
    (function() {
        const savedTheme = localStorage.getItem('rl-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    })();
    
    function toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('rl-theme', newTheme);
        updateThemeIcon();
    }
    
    function updateThemeIcon() {
        const theme = document.documentElement.getAttribute('data-theme');
        const sunIcon = document.getElementById('theme-sun');
        const moonIcon = document.getElementById('theme-moon');
        if (sunIcon && moonIcon) {
            sunIcon.style.display = theme === 'dark' ? 'none' : 'inline';
            moonIcon.style.display = theme === 'dark' ? 'inline' : 'none';
        }
    }
    
    document.addEventListener('DOMContentLoaded', updateThemeIcon);
    /* ]]> */
    </script>
    <script type="text/javascript" src="classes/js.js"></script>
    <?php
    if ($GLOBALS['options']['ajax_refresh']) { echo '<script type="text/javascript" src="classes/ajax_refresh.js"></script>'.$nn; }
    if ($GLOBALS['options']['flist_sort']) { echo '<script type="text/javascript" src="classes/sorttable.js"></script>'.$nn; }
    ?>
</head>
<body>
    <div class="rl-container">
        <!-- Header -->
        <header class="rl-header">
            <a href="/" class="rl-logo">
                <svg width="40" height="40" viewBox="0 0 100 100">
                    <defs>
                        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#3b82f6"/>
                            <stop offset="100%" stop-color="#8b5cf6"/>
                        </linearGradient>
                    </defs>
                    <circle cx="50" cy="50" r="45" fill="url(#logoGrad)"/>
                    <path d="M50 25 L50 60 M35 50 L50 65 L65 50" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="rl-logo-text">RapidLeech</span>
            </a>
            <div class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
                <span id="theme-sun" class="theme-icon">☀️</span>
                <span id="theme-moon" class="theme-icon" style="display:none;">🌙</span>
                <div class="theme-toggle-track">
                    <div class="theme-toggle-thumb"></div>
                </div>
            </div>
        </header>
        
        <!-- Main Content -->
        <main>
