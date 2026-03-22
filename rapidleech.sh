#!/bin/bash
# RapidLeech Installation Script
# Tested on Ubuntu 22.04 / 24.04 LTS
# Uses PHP 8.3 with all required extensions

set -e

echo "========================================="
echo "  RapidLeech Installer"
echo "  PHP 8.3 + Apache2 + SSL"
echo "========================================="

# Update system
sudo apt -y update && sudo apt -y upgrade

# Install Apache
sudo apt -y install apache2

# Install language pack and tools
sudo apt install -y language-pack-en-base unzip git curl wget
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

# Add PHP repository
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:ondrej/php
sudo apt -y update

# Install PHP 8.3 with required extensions only
# Note: openssl is built into PHP core, no separate package needed
# Avoided: imagick, xmlrpc, soap, imap, dev (not needed, can cause segfaults)
sudo apt install -y php8.3 \
    php8.3-common \
    php8.3-cli \
    php8.3-curl \
    php8.3-gd \
    php8.3-mbstring \
    php8.3-xml \
    php8.3-zip \
    php8.3-bcmath \
    php8.3-intl \
    php8.3-opcache \
    libapache2-mod-php8.3

# Enable Apache modules
sudo a2enmod php8.3
sudo a2enmod rewrite

# Configure PHP for RapidLeech
sudo sed -i 's/memory_limit = .*/memory_limit = 1024M/' /etc/php/8.3/apache2/php.ini
sudo sed -i 's/upload_max_filesize = .*/upload_max_filesize = 10240M/' /etc/php/8.3/apache2/php.ini
sudo sed -i 's/post_max_size = .*/post_max_size = 10240M/' /etc/php/8.3/apache2/php.ini
sudo sed -i 's/max_execution_time = .*/max_execution_time = 0/' /etc/php/8.3/apache2/php.ini
sudo sed -i 's/max_input_time = .*/max_input_time = 0/' /etc/php/8.3/apache2/php.ini

# Enable AllowOverride for .htaccess
sudo sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

# Restart Apache
sudo systemctl restart apache2

# Verify PHP
php -v
php -r 'echo "\n\nPHP installation OK.\n";'
php -r 'echo "bcmath: " . (extension_loaded("bcmath") ? "YES" : "NO") . "\n";'
php -r 'echo "curl: " . (extension_loaded("curl") ? "YES" : "NO") . "\n";'
php -r 'echo "openssl: " . (extension_loaded("openssl") ? "YES" : "NO") . "\n";'
php -r 'echo "mbstring: " . (extension_loaded("mbstring") ? "YES" : "NO") . "\n\n";'

# Clone RapidLeech
cd /var/www
sudo rm -rf html
sudo git clone https://github.com/PBhadoo/Rapidleech html
cd /var/www/html

# Set permissions
sudo chmod -R 777 files configs
sudo chmod 777 configs/files.lst 2>/dev/null || true

# Install RAR (for archive operations)
sudo rm -rf rar
sudo wget -q https://www.rarlab.com/rar/rarlinux-x64-720.tar.gz
sudo tar -xf rarlinux-x64-720.tar.gz
sudo rm -f rarlinux-x64-720.tar.gz
sudo chmod -R 777 rar
sudo chmod +x rar/rar rar/unrar 2>/dev/null

# Install yt-dlp (for video downloads from YouTube, Vimeo, TikTok, etc.)
echo "Installing yt-dlp..."
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
echo "yt-dlp version: $(yt-dlp --version)"

# Install ffmpeg (recommended for yt-dlp video+audio merging)
echo "Installing ffmpeg..."
sudo apt install -y ffmpeg
echo "ffmpeg version: $(ffmpeg -version 2>&1 | head -1)"

sudo chown -R www-data:www-data /var/www/html

echo ""
echo "========================================="
echo "  RapidLeech installed successfully!"
echo "  Visit: http://$(curl -s ifconfig.me)"
echo "========================================="
echo ""

# Optional: SSL with Let's Encrypt
read -p "Setup SSL with Let's Encrypt? (y/n): " setup_ssl
if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
    sudo snap install core 2>/dev/null; sudo snap refresh core 2>/dev/null
    sudo snap install --classic certbot
    sudo ln -sf /snap/bin/certbot /usr/bin/certbot
    sudo certbot --apache
fi
