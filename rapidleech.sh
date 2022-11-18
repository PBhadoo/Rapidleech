#!/bin/sh
sudo apt-get -y install apache2 &&
sudo apt-get -y update && sudo apt-get -y upgrade && sudo apt -y update && sudo apt -y upgrade &&
sudo add-apt-repository -y ppa:ondrej/php &&
sudo apt-get -y update && sudo apt-get -y upgrade && sudo apt -y update && sudo apt -y upgrade && sudo apt -y install unzip &&
sudo apt install -y php8.1 &&
sudo apt install -y php8.1-common php8.1-mysql php8.1-xml php8.1-xmlrpc php8.1-curl php8.1-gd php8.1-imagick php8.1-cli php8.1-dev php8.1-imap php8.1-mbstring php8.1-opcache php8.1-soap php8.1-zip php8.1-intl &&
sudo service apache2 restart &&
php -r 'echo "\n\nYour PHP installation is working fine.\n\n\n";' &&
cd /var/www &&
sudo rm -r html &&
sudo git clone https://github.com/PBhadoo/Rapidleech html &&
cd /var/www/html &&
sudo mkdir files &&
sudo chmod 777 files &&
sudo chmod 777 configs &&
sudo chmod 777 configs/files.lst &&
sudo chmod -R 777 rar && sudo chmod -R 777 rar/* &&
sudo snap install core; sudo snap refresh core &&
sudo snap install --classic certbot &&
sudo ln -s /snap/bin/certbot /usr/bin/certbot &&
sudo certbot --apache
