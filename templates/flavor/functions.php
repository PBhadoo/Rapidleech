<?php
/**
 * Renders file action <select> dropdown
 */
function renderActions() {
    global $options;
    $r = '<select name="act" onchange="javascript:void(document.flist.submit());" style="min-width:200px;">';
    if ($options['disable_actions']) {
        $r .= '<option selected="selected">'.lang(328).'</option></select>';
        return $r;
    }
    $r .= '<option selected="selected">'.lang(285).'</option>';
    if (!$options['disable_upload'])    $r .= '<option value="upload">'.lang(286).'</option>';
    if (!$options['disable_ftp'])       $r .= '<option value="ftp">'.lang(287).'</option>';
    if (!$options['disable_email'])     $r .= '<option value="mail">'.lang(288).'</option>';
    if (!$options['disable_mass_email'])$r .= '<option value="boxes">'.lang(289).'</option>';
    if (!$options['disable_split'])     $r .= '<option value="split">'.lang(290).'</option>';
    if (!$options['disable_merge'])     $r .= '<option value="merge">'.lang(291).'</option>';
    if (!$options['disable_hashing'])   $r .= '<option value="crc32">'.lang(390).'</option><option value="md5">'.lang(292).'</option><option value="sha1">'.lang(393).'</option>';
    if (!$options['disable_md5_change'])$r .= '<option value="md5_change">'.lang(383).'</option>';
    if ((file_exists(CLASS_DIR."pear.php")||file_exists(CLASS_DIR."tar.php"))&&!$options['disable_tar']) $r .= '<option value="pack">'.lang(293).'</option>';
    if (file_exists(CLASS_DIR."pclzip.php")&&!$options['disable_zip']) $r .= '<option value="zip">'.lang(294).'</option>';
    if (file_exists(CLASS_DIR."unzip.php")&&!$options['disable_unzip']) $r .= '<option value="unzip">'.lang(295).'</option>';
    if (substr(PHP_OS,0,3)!="WIN"&&@file_exists(CLASS_DIR."rar.php")) {
        if (!$options['disable_rar']) $r .= '<option value="rar">'.lang(338).'</option>';
        if (!$options['disable_unrar']&&(@file_exists(ROOT_DIR.'/rar/rar')||@file_exists(ROOT_DIR.'/rar/unrar'))) $r .= '<option value="unrar">'.lang(339).'</option>';
    }
    if (!$options['disable_rename'])      $r .= '<option value="rename">'.lang(296).'</option>';
    if (!$options['disable_mass_rename']) $r .= '<option value="mrename">'.lang(297).'</option>';
    if (!$options['disable_delete'])      $r .= '<option value="delete">'.lang(298).'</option>';
    if (!$options['disable_list'])         $r .= '<option value="list">'.lang(299).'</option>';
    $r .= '</select>';
    return $r;
}
?>
