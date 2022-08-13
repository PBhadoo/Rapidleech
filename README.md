### LAMP on Ubuntu - [Source](https://web.archive.org/web/20180323030918/https://howtoubuntu.org/how-to-install-lamp-on-ubuntu) [PHP](https://web.archive.org/web/20200923164429/https://www.cloudbooklet.com/upgrade-php-version-to-php-7-4-on-ubuntu/)

Build and Edited from https://github.com/Th3-822/rapidleech

````
sudo su
sudo apt-get install apache2
sudo apt-get install mysql-server
sudo add-apt-repository ppa:ondrej/php
sudo apt-get update && sudo apt-get upgrade && sudo apt update && sudo apt upgrade
sudo apt install php8.0
sudo apt install php8.0-common php8.0-mysql php8.0-xml php8.0-xmlrpc php8.0-curl php8.0-gd php8.0-imagick php8.0-cli php8.0-dev php8.0-imap php8.0-mbstring php8.0-opcache php8.0-soap php8.0-zip php8.0-intl -y
sudo service apache2 restart
php -r 'echo "\n\nYour PHP installation is working fine.\n\n\n";'
cd /var/www
sudo rm -r html
sudo git clone https://github.com/RapidleechPro/html
cd /var/www/html
sudo rm -rf rar && sudo wget https://rarlab.com/rar/rarlinux-x64-6.0.1.tar.gz && sudo tar -xvf rarlinux-x64-6.0.1.tar.gz && sudo rm -f rarlinux-x64-6.0.1.tar.gz && sudo chmod -R 777 rar && sudo chmod -R 777 rar/*
chmod 777 files
chmod 777 configs
chmod 777 configs/files.lst
````

https://certbot.eff.org/lets-encrypt/ubuntufocal-apache

Deployed at https://aws.rapidleech.gq
