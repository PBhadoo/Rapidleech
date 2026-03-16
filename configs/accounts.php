<?php
if (!defined('RAPIDLEECH')) { require_once("index.html"); exit; }
$premium_acc = array();

###############################################################################
# PREMIUM ACCOUNTS CONFIGURATION
#
# To add a premium account:
# 1. Remove the '//' from the beginning of the line
# 2. Replace 'your username' and 'your password' with your actual credentials
# 3. The key name uses underscores instead of dots (e.g., mega_co_nz for mega.co.nz)
#
# When a premium account is configured, it will be used automatically when
# downloading from that service. You can also enter credentials per-download
# in the Settings tab by checking "Use Premium Account".
###############################################################################

### File Hosting Services ###
//$premium_acc["mega_co_nz"] = array('user' => 'your email', 'pass' => 'your password');
//$premium_acc["1fichier_com"] = array('user' => 'your email', 'pass' => 'your password');
//$premium_acc["4shared_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["alfafile_net"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["ex-load_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["fileboom_me"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["filefactory_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["filejoker_net"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["fshare_vn"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["furk_net"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["gigapeta_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["hitfile_net"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["keep2share_cc"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["kumpulbagi_id"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["mediafire_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["nitroflare_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["rapidgator_net"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["sendspace_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["solidfiles_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["turbobit_net"] = array('user' => 'your username', 'pass' => 'your password');

### Video Services ###
//$premium_acc["dailymotion_com"] = array('user' => 'your username', 'pass' => 'your password');
//$premium_acc["youtube_com"] = array('user' => 'your username', 'pass' => 'your password');

### Premium Cookie Configuration (use this OR user/pass, not both) ###
# Some services work better with cookies. Get them from your browser after logging in.
//$premium_acc["filefactory_com"] = array('cookie' => 'your premium cookie string');
//$premium_acc["nitroflare_com"] = array('cookie' => 'your premium cookie string');

### Proxy Configuration (per-host) ###
# You can set a proxy for specific hosts. Use -1 to disable proxy for that host.
//$premium_acc["rapidgator_net"]["proxy"] = "ip:port";
//$premium_acc["rapidgator_net"]["pauth"] = "username:password";

?>
