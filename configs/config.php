<?php
if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit;
}

$options = array (
  'secretkey' => 'Evp1dftLD0Gm6bXgjtkd+dFSgNTHr7j6qy1JHgtGSJIC4I7ZwsSkJ3pG',
  'download_dir' => 'files/',
  'download_dir_is_changeable' => false,
  'delete_delay' => 84600.0,
  'rename_prefix' => '',
  'rename_suffix' => '',
  'rename_underscore' => true,
  'bw_save' => false,
  'file_size_limit' => 102400,
  'auto_download_disable' => false,
  'auto_upload_disable' => false,
  'notes_disable' => false,
  'upload_html_disable' => false,
  'myuploads_disable' => false,
  'login' => false,
  'users' => 
  array (
    'transload' => 'transload',
  ),
  'template_used' => 'flavor',
  'default_language' => 'en',
  'show_all' => true,
  'server_info' => true,
  'ajax_refresh' => true,
  'new_window' => false,
  'new_window_js' => true,
  'flist_sort' => true,
  'flist_h_fixed' => false,
  'disable_actions' => false,
  'disable_deleting' => false,
  'disable_delete' => true,
  'disable_rename' => false,
  'disable_mass_rename' => true,
  'disable_mass_email' => true,
  'disable_email' => true,
  'disable_ftp' => true,
  'disable_upload' => true,
  'disable_merge' => false,
  'disable_split' => false,
  'disable_archive_compression' => false,
  'disable_tar' => false,
  'disable_zip' => false,
  'disable_unzip' => false,
  'disable_rar' => false,
  'disable_unrar' => false,
  'disable_hashing' => false,
  'disable_md5_change' => false,
  'disable_list' => false,
  'use_curl' => true,
  'redir' => true,
  'no_cache' => true,
  'ref_check' => true,
  '2gb_fix' => true,
  'forbidden_filetypes' => 
  array (
    // Server-side scripts
    '.htaccess', '.htpasswd', '.php', '.php3', '.php4', '.php5', '.phtml',
    '.asp', '.aspx', '.cgi', '.bin',
    // Executables
    '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.vbe',
    '.js', '.jse', '.wsf', '.wsh', '.ps1', '.psm1', '.sh', '.bash',
    '.dll', '.sys', '.drv', '.ocx',
    // Images (block fake large files disguised as images)
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.tiff', '.tif',
    '.svg', '.webp', '.heic', '.heif',
  ),
  'forbidden_filetypes_block' => true,
  'rename_these_filetypes_to' => '.xxx',
  'check_these_before_unzipping' => true,
  'require_content_length' => true,
  'fgc' => 0,
  'parallel_download' => true,
  'parallel_chunks' => 8,
  'admin_user' => 'admin',
  'admin_pass' => 'admin',
); 

require_once('site_checker.php');
require_once('accounts.php');

$secretkey =& $options['secretkey'];
?>
