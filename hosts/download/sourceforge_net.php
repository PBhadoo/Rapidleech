<?php
if (!defined('RAPIDLEECH')) {
    require_once("index.html");
    exit;
}

class sourceforge_net extends DownloadClass {

    public function Download($link) {

        // Normalize link
        $link = trim($link);

        // Match SourceForge file URL
        if (!preg_match('#https?://sourceforge\.net/projects/([^/]+)/files/(.+?)/download#i', $link, $m)) {
            html_error('Invalid SourceForge link!');
        }

        $project = $m[1];
        $filepath = $m[2];

        // Build direct mirror link (modern method)
        $dlink = "https://master.dl.sourceforge.net/project/{$project}/{$filepath}?viasf=1";

        // Extract filename
        $FileName = basename($filepath);

        // Optional: try to fetch headers for better filename
        $page = $this->GetPage($dlink);
        $cookie = GetCookies($page);

        if (preg_match('/Content-Disposition:.*filename="?([^"]+)"?/i', $page, $fn)) {
            $FileName = $fn[1];
        }

        // Start download
        $this->RedirectDownload($dlink, $FileName, $cookie, 0, $link);
    }
}

/*
 * Updated for modern SourceForge (2026)
 * - Removed deprecated direct-download parsing
 * - Uses master.dl.sourceforge.net mirror system
 * - Works with new /download URLs
 */
?>