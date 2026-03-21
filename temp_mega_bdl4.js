/* Bundle Includes:
 *   js/transfers/download2.js
 *   js/transfers/upload2.js
 *   js/transfers/downloader.js
 *   js/transfers/reader.js
 *   js/transfers/wsu.js
 *   js/utils/factory/file-list.js
 *   js/utils/factory/pbkdf2.js
 *   js/utils/factory/mkdir.js
 *   js/utils/factory/safe-name.js
 *   js/utils/factory/safe-path.js
 *   js/ui/transfer/js/ui/components/breadcrumbs.js
 *   js/ui/transfer/js/ui/components/loader.js
 *   js/ui/transfer/js/ui/components/simpletip.js
 *   js/ui/transfer/js/ui/components/toast.js
 *   js/ui/transfer/js/ui/theme.js
 *   js/ui/transfer/js/ui/pages/page.js
 *   js/ui/transfer/js/ui/pages/pageheader.js
 *   js/ui/transfer/js/ui/pages/dashboard.js
 *   js/ui/transfer/js/ui/pages/fm.js
 *   js/ui/transfer/js/ui/dialogs/lang-dialog.js
 *   js/ui/transfer/js/ui/dialogs/login-dialog.js
 *   js/ui/transfer/js/ui/dialogs/msg-dialog.js
 *   js/ui/transfer/js/ui/dialogs/nav-dialog.js
 *   js/ui/transfer/js/keyboard.js
 *   js/ui/transfer/js/sort.js
 *   js/ui/imagesViewer.js
 *   js/ui/megaZoomPan.js
 *   js/ui/transfer/js/ui/subpages/compare.js
 *   js/ui/transfer/js/ui/subpages/contact.js
 *   js/ui/transfer/js/ui/subpages/error.js
 *   js/ui/transfer/js/ui/subpages/faq.js
 *   js/ui/transfer/js/ui/subpages/features.js
 *   js/ui/transfer/js/ui/subpages/privacy.js
 *   js/ui/transfer/js/ui/subpages/terms.js
 */

/* ***************** BEGIN MEGA LIMITED CODE REVIEW LICENCE *****************
 *
 * Copyright (c) 2016 by Mega Limited, Auckland, New Zealand
 * All rights reserved.
 *
 * This licence grants you the rights, and only the rights, set out below,
 * to access and review Mega's code. If you take advantage of these rights,
 * you accept this licence. If you do not accept the licence,
 * do not access the code.
 *
 * Words used in the Mega Limited Terms of Service [https://mega.nz/terms]
 * have the same meaning in this licence. Where there is any inconsistency
 * between this licence and those Terms of Service, these terms prevail.
 *
 * 1. This licence does not grant you any rights to use Mega's name, logo,
 *    or trademarks and you must not in any way indicate you are authorised
 *    to speak on behalf of Mega.
 *
 * 2. If you issue proceedings in any jurisdiction against Mega because you
 *    consider Mega has infringed copyright or any patent right in respect
 *    of the code (including any joinder or counterclaim), your licence to
 *    the code is automatically terminated.
 *
 * 3. THE CODE IS MADE AVAILABLE "AS-IS" AND WITHOUT ANY EXPRESS OF IMPLIED
 *    GUARANTEES AS TO FITNESS, MERCHANTABILITY, NON-INFRINGEMENT OR OTHERWISE.
 *    IT IS NOT BEING PROVIDED IN TRADE BUT ON A VOLUNTARY BASIS ON OUR PART
 *    AND YOURS AND IS NOT MADE AVAILABE FOR CONSUMER USE OR ANY OTHER USE
 *    OUTSIDE THE TERMS OF THIS LICENCE. ANYONE ACCESSING THE CODE SHOULD HAVE
 *    THE REQUISITE EXPERTISE TO SECURE THEIR OWN SYSTEM AND DEVICES AND TO
 *    ACCESS AND USE THE CODE FOR REVIEW PURPOSES. YOU BEAR THE RISK OF
 *    ACCESSING AND USING IT. IN PARTICULAR, MEGA BEARS NO LIABILITY FOR ANY
 *    INTERFERENCE WITH OR ADVERSE EFFECT ON YOUR SYSTEM OR DEVICES AS A
 *    RESULT OF YOUR ACCESSING AND USING THE CODE.
 *
 * Read the full and most up-to-date version at:
 *    https://github.com/meganz/webclient/blob/master/LICENCE.md
 *
 * ***************** END MEGA LIMITED CODE REVIEW LICENCE ***************** */

var dlmanager = {
    // Keep in track real active downloads.
    // ETA (in seconds) to consider a download finished, used to speed up chunks.
    // Despite the fact that the DownloadQueue has a limitted size,
    // to speed up things for tiny downloads each download is able to
    // report to the scheduler that they are done when it may not be necessarily
    // true (but they are for instance close to their finish)
    dlDoneThreshold: 3,
    // How many queue IO we want before pausing the XHR fetching,
    // useful when we have internet faster than our IO
    ioThrottleLimit: 6,
    isOverQuota : false,
    ioThrottlePaused: false,
    fetchingFile: false,
    dlLastQuotaWarning: 0,
    dlRetryInterval: 1000,
    dlMaxChunkSize: 16 * 1048576,
    dlResumeThreshold: 0x200000,
    fsExpiryThreshold: 172800,
    isDownloading: false,
    dlZipID: 0,
    gotHSTS: false,
    resumeInfoTag: 'dlrv2!',
    resumeInfoCache: Object.create(null),
    logger: MegaLogger.getLogger('dlmanager'),

    /**
     * Set user flags for the limitation dialogs.
     * @alias dlmanager.lmtUserFlags
     */
    setUserFlags: function() {
        this.lmtUserFlags = 0;

        // Possible flag values:
        // 01 = this.LMT_ISREGISTERED
        // 02 = this.LMT_ISPRO
        // 03 = this.LMT_ISREGISTERED | this.LMT_ISPRO
        // 04 = this.LMT_HASACHIEVEMENTS
        // 05 = this.LMT_ISREGISTERED | this.LMT_HASACHIEVEMENTS
        // 07 = this.LMT_ISREGISTERED | this.LMT_ISPRO | this.LMT_HASACHIEVEMENTS
        // 09 = this.LMT_ISREGISTERED | this.LMT_PRO3
        // 13 = this.LMT_ISREGISTERED | this.LMT_PRO3 | this.LMT_HASACHIEVEMENTS

        if (u_type) {
            this.lmtUserFlags |= this.LMT_ISREGISTERED;

            if (Object(u_attr).p) {
                this.lmtUserFlags |= this.LMT_ISPRO;

                if (u_attr.p === 3) {
                    this.lmtUserFlags |= this.LMT_PRO3;
                }
            }
        }

        if (mega.achievem) {
            mega.achievem.enabled()
                .done(function() {
                    dlmanager.lmtUserFlags |= dlmanager.LMT_HASACHIEVEMENTS;
                });
        }
    },

    getResumeInfo: function(dl, callback) {
        'use strict';

        if (!dl) {
            return MegaPromise.reject(EINCOMPLETE);
        }

        if (typeof dl === 'string') {
            dl = {ph: dl, hasResumeSupport: true};
        }
        var promise;
        var tag = this.getResumeInfoTag(dl);

        if (d) {
            this.logger.debug('getResumeInfo', tag, dl);
        }

        if (this.resumeInfoCache[tag]) {
            this.resumeInfoCache[tag].tag = tag;
            promise = MegaPromise.resolve(this.resumeInfoCache[tag]);
        }
        else if (!dl.hasResumeSupport) {
            promise = MegaPromise.resolve(false);
        }
        else {
            promise = M.getPersistentData(tag, true);
        }

        if (typeof callback === 'function') {
            promise.then(callback).catch(callback.bind(null, false));
        }

        return promise;
    },

    remResumeInfo: function(dl) {
        'use strict';

        if (!dl) {
            return MegaPromise.reject(EINCOMPLETE);
        }

        if (typeof dl === 'string') {
            dl = {ph: dl};
        }

        if (d) {
            this.logger.debug('remResumeInfo', this.getResumeInfoTag(dl), dl);
        }

        return M.delPersistentData(this.getResumeInfoTag(dl));
    },

    setResumeInfo: function(dl, byteOffset) {
        'use strict';

        if (!dl || !dl.resumeInfo || !dl.hasResumeSupport) {
            return MegaPromise.reject(EINCOMPLETE);
        }

        dl.resumeInfo.macs = dl.macs;
        dl.resumeInfo.byteOffset = byteOffset;

        if (d) {
            this.logger.debug('setResumeInfo', this.getResumeInfoTag(dl), dl.resumeInfo, dl);
        }

        return M.setPersistentData(this.getResumeInfoTag(dl), dl.resumeInfo, true);
    },

    // @private
    getResumeInfoTag: function(dl) {
        'use strict';

        return this.resumeInfoTag + (dl.ph ? dl.ph : u_handle + dl.id);
    },

    /**
     * Check whether a downloaded file can be viewed within the browser through a blob/data URI in mobile.
     * @param {Object|String} n An ufs-node or filename
     * @returns {Boolean}
     */
    openInBrowser: function(n) {
        'use strict';

        // These browsers do not support opening blob.
        if (ua.details.brand === 'FxiOS'
            || ua.details.brand === 'CriOS'
            || ua.details.browser === 'Opera'
            || ua.details.browser === 'MiuiBrowser'
            || ua.details.browser === 'SamsungBrowser') {

            return false;
        }

        var exts = ["pdf", "txt", "png", "gif", "jpg", "jpeg"];

        if (ua.details.engine === 'Gecko') {
            exts.push('mp4', 'm4a', 'mp3', 'webm', 'ogg');
        }

        if (is_ios) {
            exts.push("doc", "docx", "ods", "odt", "ppt", "pptx", "rtf", "xls", "xlsx");
        }

        return localStorage.openAllInBrowser || exts.indexOf(fileext(n.n || n.name || n)) !== -1;
    },

    /**
     * Check whether the browser does support saving downloaded data to disk
     * @param {Object|String} n An ufs-node or filename
     * @returns {Number} 1: yes, 0: no, -1: can be viewed in a blob:
     */
    canSaveToDisk: function(n) {
        'use strict';

        if (dlMethod === MemoryIO && !MemoryIO.canSaveToDisk) {
            // if cannot be saved to disk, check whether at least we can open it within the browser.
            return this.openInBrowser(n) ? -1 : 0;
        }

        return 1;
    },

    /**
     * For a resumable download, check the filesize on disk
     * @param {String} handle Node handle
     * @param {String} filename The filename..
     * @returns {MegaPromise}
     */
    getFileSizeOnDisk: promisify(function(resolve, reject, handle, filename) {
        'use strict';

        if (dlMethod === FileSystemAPI) {
            M.getFileEntryMetadata('mega/' + handle)
                .then(function(metadata) {
                    resolve(metadata.size);
                }).catch(reject);
        }
        else {
            reject(EACCESS);
        }
    }),

    /**
     * Initialize download
     * @param {ClassFile} file The class file instance
     * @param {Object} gres The API reply to the `g` request
     * @param {Object} resumeInfo Resumable info, if any
     * @returns {Promise}
     */
    initDownload: function(file, gres, resumeInfo) {
        'use strict';

        if (!(file instanceof ClassFile)) {
            return Promise.reject(EARGS);
        }
        if (!file.dl || !Object(file.dl.io).setCredentials) {
            return Promise.reject(EACCESS);
        }
        if (!gres || typeof gres !== 'object' || file.dl.size !== gres.s) {
            return Promise.reject(EFAILED);
        }
        if (file.dl.cancelled) {
            return Promise.reject(EEXPIRED);
        }
        const {dl} = file;
        const {promise} = mega;

        var dl_urls = [];
        var dl_chunks = [];
        var dl_chunksizes = {};
        var dl_filesize = dl.size;
        var byteOffset = resumeInfo.byteOffset || 0;

        var p = 0;
        var pp = 0;
        for (var i = 1; i <= 8 && p < dl_filesize - i * 131072; i++) {
            dl_chunksizes[p] = i * 131072;
            dl_chunks.push(p);
            pp = p;
            p += dl_chunksizes[p];
        }

        var chunksize = dl_filesize / dlQueue._limit / 2;
        if (chunksize > dlmanager.dlMaxChunkSize) {
            chunksize = dlmanager.dlMaxChunkSize;
        }
        else if (chunksize <= 1048576) {
            chunksize = 1048576;
        }
        else {
            chunksize = 1048576 * Math.floor(chunksize / 1048576);
        }

        /**
        var reserved = dl_filesize - (chunksize * (dlQueue._limit - 1));
        while (p < dl_filesize) {
            dl_chunksizes[p] = p > reserved ? 1048576 : chunksize;
            dl_chunks.push(p);
            pp = p;
            p += dl_chunksizes[p];
        }
        /**/
        while (p < dl_filesize) {
            var length = Math.floor((dl_filesize - p) / 1048576 + 1) * 1048576;
            if (length > chunksize) {
                length = chunksize;
            }
            dl_chunksizes[p] = length;
            dl_chunks.push(p);
            pp = p;
            p += length;
        }
        /**/

        if (!(dl_chunksizes[pp] = dl_filesize - pp)) {
            delete dl_chunksizes[pp];
            delete dl_chunks[dl_chunks.length - 1];
        }

        for (var j = dl_chunks.length; j--;) {
            if (dl_chunks[j] !== undefined) {
                var offset = dl_chunks[j];

                dl_urls.push({
                    url: gres.g + '/' + offset + '-' + (offset + dl_chunksizes[offset] - 1),
                    size: dl_chunksizes[offset],
                    offset: offset
                });
            }
        }

        if (resumeInfo && typeof resumeInfo !== 'object') {
            dlmanager.logger.warn('Invalid resumeInfo entry.', resumeInfo, file);
            resumeInfo = false;
        }

        dl.url = gres.g;
        dl.urls = dl_urls;
        dl.macs = resumeInfo.macs || dl.macs || Object.create(null);
        dl.resumeInfo = resumeInfo || Object.create(null);
        dl.byteOffset = dl.resumeInfo.byteOffset = byteOffset;

        var result = {
            chunks: dl_chunks,
            offsets: dl_chunksizes
        };

        var startDownload = function() {
            try {
                dl.io.setCredentials(dl.url, dl.size, dl.n, dl_chunks, dl_chunksizes, resumeInfo);
                promise.resolve(result);
            }
            catch (ex) {
                setTransferStatus(dl, ex);
                promise.reject(ex);
            }
        };

        if (resumeInfo.entry) {
            delete dlmanager.resumeInfoCache[resumeInfo.tag];

            M.readFileEntry(resumeInfo.entry)
                .then(function(ab) {
                    if (ab instanceof ArrayBuffer && ab.byteLength === dl.byteOffset) {
                        dl.pzBufferStateChange = ab;
                    }
                    else {
                        console.warn('Invalid pzBufferStateChange...', ab, dl.byteOffset);
                    }
                })
                .always(function() {
                    onIdle(startDownload);
                    resumeInfo.entry.remove(function() {});
                    delete resumeInfo.entry;
                });
        }
        else {
            startDownload();
        }

        return promise;
    },

    /**
     * Browser query on maximum downloadable file size
     * @returns {MegaPromise}
     */
    getMaximumDownloadSize: function() {
        'use strict';

        var promise = new MegaPromise();

        var max = function() {
            promise.resolve(Math.pow(2, is_mobile ? 32 : 53));
        };

        if (dlMethod === FileSystemAPI) {
            var success = function(used, remaining) {
                if (remaining < 1) {
                    // either the user hasn't granted persistent quota or
                    // we're in Incognito..let FileSystemAPI deal with it
                    max();
                }
                else {
                    promise.resolve(Math.max(remaining, MemoryIO.fileSizeLimit));
                }
            };

            if (navigator.webkitPersistentStorage) {
                navigator.webkitPersistentStorage.queryUsageAndQuota(success, max);
            }
            else if (window.webkitStorageInfo) {
                window.webkitStorageInfo.queryUsageAndQuota(1, success, max);
            }
            else {
                // Hmm...
                promise.resolve(-1);
            }
        }
        else if (dlMethod === MemoryIO) {
            promise.resolve(MemoryIO.fileSizeLimit);
        }
        else {
            max();
        }

        return promise;
    },

    newUrl: function DM_newUrl(dl, callback) {
        var gid = dl.dl_id || dl.ph;

        if (callback) {
            if (!this._newUrlQueue) {
                this._newUrlQueue = {};
            }

            if (this._newUrlQueue.hasOwnProperty(gid)) {
                this._newUrlQueue[gid].push(callback);
                return;
            }
            this._newUrlQueue[gid] = [callback];
        }
        if (d) {
            dlmanager.logger.info("Retrieving New URLs for", gid);
        }
        const {dlQueue} = window;

        dlQueue.pause();
        delete dl.dlTicketData;
        dlmanager.dlGetUrl(dl, function(error, res, o) {
            if (error) {
                return later(this.newUrl.bind(this, dl));
            }
            dl.url = res.g;

            var changed = 0;
            for (var i = 0; i < dlQueue._queue.length; i++) {
                const e = dlQueue._queue[i][0];

                if (e.dl === dl) {
                    e.url = `${res.g}/${String(e.url).replace(/.+\//, '')}`;
                    changed++;
                }
            }
            if (Object(this._newUrlQueue).hasOwnProperty(gid)) {
                this._newUrlQueue[gid]
                    .forEach(function(callback) {
                        callback(res.g, res);
                    });
                delete this._newUrlQueue[gid];
            }
            dlmanager.logger.info("Resuming, got new URL for %s", gid, res.g, changed, res);
            dlQueue.resume();
        }.bind(this));
    },

    uChangePort: function DM_uChangePort(url, port) {
        if (!this.gotHSTS && String(url).substr(0,5) === 'http:') {
            var uri = document.createElement('a');
            uri.href = url;

            if (port) {
                url = url.replace(uri.host, uri.hostname + ':' + port);
            }
            else if (uri.host !== uri.hostname) {
                url = url.replace(uri.host, uri.hostname);
            }
        }

        return url;
    },

    checkHSTS: function(xhr) {
        if (!use_ssl && !this.gotHSTS) {
            try {
                if (String(xhr.responseURL).substr(0, 6) === 'https:') {
                    this.gotHSTS = true;
                }
            }
            catch (ex) {
                if (d) {
                    this.logger.error(ex);
                }
            }
        }
    },

    cleanupUI: function DM_cleanupUI(gid) {
        if (typeof gid === 'object') {
            gid = this.getGID(gid);
        }

        var l = dl_queue.length;
        while (l--) {
            var dl = dl_queue[l];

            if (gid === this.getGID(dl)) {
                if (d) {
                    dlmanager.logger.info('cleanupUI', gid, dl.n, dl.zipname);
                }

                if (dl.io instanceof MemoryIO) {
                    dl.io.abort();
                }
                // oDestroy(dl.io);
                dl_queue[l] = Object.freeze({});
            }
        }
    },

    getGID: function DM_GetGID(dl) {
        return dl.zipid ? 'zip_' + dl.zipid : 'dl_' + (dl.dl_id || dl.ph);
    },

    dlGetUrl: function DM_dlGetUrl(dl, callback) {
        'use strict';

        if (dl.byteOffset && dl.byteOffset === dl.size) {
            // Completed download.
            return callback(false, {s: dl.size, g: dl.url || 'https://localhost.save-file.mega.nz/dl/1234'});
        }

        const ctx = {
            object: dl,
            next: callback,
            dl_key: dl.key
        };

        if (typeof dl.dlTicketData === 'object') {

            return this.dlGetUrlDone(dl.dlTicketData, ctx);
        }
        this.preFetchDownloadTickets(dl.pos);

        return megaUtilsGFSFetch.getTicketData(dl)
            .then((res) => {

                this.dlGetUrlDone(res, ctx);

                return res;
            })
            .catch((ex) => {
                this.logger.error('Failed to retrieve download ticket.', ex, [dl]);
                callback(ex);
            });
    },

    preFetchDownloadTickets(index, limit, queue, space, ridge) {
        'use strict';

        index = index || 0;
        limit = limit || 7;
        queue = queue || dl_queue;
        space = space || 96 * 1024;
        ridge = ridge || limit << 3;

        if (d) {
            this.logger.info('prefetching download tickets...', index, limit, ridge, space, [queue]);
        }

        let c = 0;
        for (let i = index; queue[i]; ++i) {
            const dl = queue[i].dl || queue[i];

            if (!('dlTicketData' in dl) && dl.byteOffset !== dl.size) {

                ++c;
                megaUtilsGFSFetch.getTicketData(dl).catch(dump);

                if (!--ridge || dl.size > space && !--limit) {
                    break;
                }
            }
        }

        if (d) {
            this.logger.info('...queued %d download tickets.', c);
        }
    },

    _clearGp: function() {
        'use strict';
        for (const k in GlobalProgress) {
            if (k[0] !== 'u') {
                let chunk;
                const w = GlobalProgress[k].working;
                while ((chunk = w.pop())) {
                    let result = chunk.isCancelled();
                    if (!result) {
                        this.logger.error('Download chunk %s(%s) should have been cancelled itself.', k, chunk);
                    }
                }
            }
        }
    },

    abortAll: function DM_abort_all() {
        'use strict';
        const dlQueue = window.dlQueue;
        const abort = tryCatch(dl => {
            if (typeof dl.io.abort === "function") {
                if (d) {
                    dlmanager.logger.info('IO.abort', dl);
                }
                dl.io.abort("User cancelled");
            }
        }, ex => {
            dlmanager.logger.error(ex);
        });

        const destroy = function(task) {
            task = task[0];
            if (task instanceof ClassChunk && !task.isCancelled() && task.destroy) {
                task.destroy();
            }
        };

        for (let k = dl_queue.length; k--;) {
            const dl = dl_queue[k];
            if (dl.id) {
                if (!dl.cancelled) {
                    if (dl.hasResumeSupport) {
                        dlmanager.remResumeInfo(dl).dump();
                    }
                    abort(dl);
                }
                dl.cancelled = true;
                if (dl.zipid && Zips[dl.zipid]) {
                    Zips[dl.zipid].cancelled = true;
                }
                if (dl.io && typeof dl.io.begin === 'function') {
                    /* Canceled while Initializing? Let's free up stuff
                     * and notify the scheduler for the running task
                     */
                    dl.io.begin();
                }
                if (dl.io instanceof MemoryIO) {
                    dl.io.abort();
                }
                dl_queue[k] = Object.freeze({});
            }
        }

        dlQueue._queue.forEach(destroy);
        Object.values(dlQueue._qpaused).forEach(destroy);

        this._clearGp();
        dlQueue._qpaused = {};
    },

    abort: function DM_abort(gid, keepUI) {

        if (gid === null || Array.isArray(gid)) {
            this._multiAbort = 1;

            if (gid) {
                gid.forEach(function(dl) {
                    dlmanager.abort(dl, keepUI);
                });
            }
            else {
                dlmanager.abortAll();
            }

            delete this._multiAbort;
            Soon(M.resetUploadDownload);
        }
        else {
            if (typeof gid === 'object') {
                gid = this.getGID(gid);
            }
            else if (!gid || gid[0] === 'u') {
                return;
            }

            var found = 0;
            var l = dl_queue.length;
            while (l--) {
                var dl = dl_queue[l];

                if (gid === this.getGID(dl)) {
                    if (!dl.cancelled) {
                        if (dl.hasResumeSupport) {
                            dlmanager.remResumeInfo(dl).dump();
                        }

                        try {
                            if (dl.io && typeof dl.io.abort === "function") {
                                if (d) {
                                    dlmanager.logger.info('IO.abort', gid, dl);
                                }
                                dl.io.abort("User cancelled");
                            }
                        }
                        catch (e) {
                            dlmanager.logger.error(e);
                        }
                    }
                    dl.cancelled = true;
                    if (dl.zipid && Zips[dl.zipid]) {
                        Zips[dl.zipid].cancelled = true;
                    }
                    if (dl.io && typeof dl.io.begin === 'function') {
                        /* Canceled while Initializing? Let's free up stuff
                         * and notify the scheduler for the running task
                         */
                        dl.io.begin();
                    }
                    found++;
                }
            }

            if (!found) {
                this.logger.warn('Download %s was not found in dl_queue', gid);
            }
            else if (found > 1 && gid[0] !== 'z') {
                this.logger.error('Too many matches looking for %s in dl_queue (!?)', gid);
            }

            if (!keepUI) {
                this.cleanupUI(gid);
            }

            /* We rely on `dl.cancelled` to let chunks destroy himself.
             * However, if the dl is paused we might end up with the
             + ClassFile.destroy uncalled, which will be leaking.
             */
            var foreach;
            if (dlQueue._qpaused[gid]) {
                foreach = function(task) {
                    task = task[0];
                    return task instanceof ClassChunk && task.isCancelled() || task.destroy();
                };
            }
            dlQueue.filter(gid, foreach);

            /* Active chunks might are stuck waiting reply,
             * which won't get destroyed itself right away.
             */
            if (GlobalProgress[gid]) {
                var chunk;
                var w = GlobalProgress[gid].working;
                while ((chunk = w.pop())) {
                    var result = chunk.isCancelled();
                    this.logger.assert(result, 'Download chunk %s(%s) should have been cancelled itself.', gid, chunk);
                }
            }

            if (!this._multiAbort) {
                Soon(M.resetUploadDownload);
            }
        }
    },

    dlGetUrlDone: function DM_dlGetUrlDone(res, ctx) {
        'use strict';
        let error = res.e;
        const dl = ctx.object;

        if (!res.e) {
            const key = [
                ctx.dl_key[0] ^ ctx.dl_key[4],
                ctx.dl_key[1] ^ ctx.dl_key[5],
                ctx.dl_key[2] ^ ctx.dl_key[6],
                ctx.dl_key[3] ^ ctx.dl_key[7]
            ];
            const attr = dec_attr(base64_to_ab(res.at), key);

            if (typeof attr === 'object' && typeof attr.n === 'string') {
                const minSize = 1e3;

                if (d) {
                    console.assert(res.s > minSize || !ctx.object.preview, 'What are we previewing?');
                }

                if (page !== 'download'
                    && (
                        !res.fa
                        || !String(res.fa).includes(':0*')
                        || !String(res.fa).includes(':1*')
                        || ctx.object.preview === -1
                    )
                    && res.s > minSize
                    && M.shouldCreateThumbnail(dl.h)
                    && !sessionStorage.gOOMtrap) {

                    const image = is_image(attr.n);
                    const audio = !image && is_audio(attr.n);
                    const video = !audio && is_video(attr.n);
                    const limit = 96 * 1048576;

                    if (res.s < limit && (image || audio) || video) {
                        if (d) {
                            this.logger.warn(
                                '[%s] Missing thumb/prev, will try to generate...', attr.n, [res], [attr]
                            );
                        }

                        tryCatch(() => {
                            Object.defineProperty(ctx.object, 'misThumbData', {
                                writable: true,
                                value: new ArrayBuffer(Math.min(res.s, limit))
                            });
                        }, () => {
                            sessionStorage.gOOMtrap = 1;
                        })();
                    }
                }

                // dlmanager.onNolongerOverquota();
                return ctx.next(false, res, attr, ctx.object);
            }
        }
        error = error < 0 && parseInt(error) || EKEY;

        dlmanager.dlReportStatus(dl, error);

        ctx.next(error || new Error("failed"));
    },

    onNolongerOverquota: function() {
        'use strict';

        dlmanager.isOverQuota = false;
        dlmanager.isOverFreeQuota = false;
        $('.limited-bandwidth-dialog button.js-close, .limited-bandwidth-dialog .fm-dialog-close').trigger('click');
    },

    dlQueuePushBack: function DM_dlQueuePushBack(aTask) {
        var isValidTask = aTask && (aTask.onQueueDone || aTask instanceof ClassFile);

        dlmanager.logger.debug('dlQueuePushBack', isValidTask, aTask);

        if (ASSERT(isValidTask, 'dlQueuePushBack: Invalid aTask...')) {
            dlQueue.pushFirst(aTask);

            if (dlmanager.ioThrottlePaused) {
                delay('dlQueuePushBack', dlQueue.resume.bind(dlQueue), 40);
            }
        }
    },

    logDecryptionError: function(dl, skipped) {
        'use strict';

        if (dl && Array.isArray(dl.url)) {
            // Decryption error from direct CloudRAID download

            var str = "";
            if (dl.cloudRaidSettings) {
                str += "f:" + dl.cloudRaidSettings.onFails;
                str += " t:" + dl.cloudRaidSettings.timeouts;
                str += " sg:" + dl.cloudRaidSettings.startglitches;
                str += " tmf:" + dl.cloudRaidSettings.toomanyfails;
            }

            eventlog(99720, JSON.stringify([3, dl && dl.id, str, skipped ? 1 : 0]));
        }
        else if (String(dl && dl.url).length > 256) {
            // Decryption error from proxied CloudRAID download

            eventlog(99706, JSON.stringify([2, dl && dl.id, skipped ? 1 : 0]));
        }
        else {
            eventlog(99711, JSON.stringify([2, dl && dl.id, skipped ? 1 : 0]));
        }
    },

    dlReportStatus: function DM_reportstatus(dl, code) {
        this.logger.warn('dlReportStatus', code, this.getGID(dl), dl);

        if (dl) {
            dl.lasterror = code;
            dl.onDownloadError(dl, code);
        }

        var eekey = code === EKEY;
        if (eekey || code === EACCESS || code === ETOOMANY || code === ENOENT) {
            // TODO: Check if other codes should raise abort()

            later(() => {
                dlmanager.abort(dl, eekey);
            });

            if (M.chat) {
                window.toaster.main.hideAll().then(() => {
                    showToast('download', eekey ? l[24] : l[20228]);
                });
            }
            else if (code === ETOOMANY) {

                // If `g` request return ETOOMANY, it means the user who originally owned the file is suspended.
                showToast('download', l[20822]);
            }
        }

        if (code === EBLOCKED) {
            showToast('download', l[20705]);
        }

        if (eekey) {
            this.logDecryptionError(dl);
        }

        if (code === ETEMPUNAVAIL) {
            eventlog(99698, true);
        }
    },

    dlClearActiveTransfer: tryCatch(function DM_dlClearActiveTransfer(dl_id) {
        'use strict';

        if (is_mobile) {
            return;
        }
        var data = JSON.parse(localStorage.aTransfers || '{}');
        if (data[dl_id]) {
            delete data[dl_id];
            if (!$.len(data)) {
                delete localStorage.aTransfers;
            }
            else {
                localStorage.aTransfers = JSON.stringify(data);
            }
        }
    }),

    dlSetActiveTransfer: tryCatch(function DM_dlSetActiveTransfer(dl_id) {
        'use strict';

        if (is_mobile) {
            return;
        }
        var data = JSON.parse(localStorage.aTransfers || '{}');
        data[dl_id] = Date.now();
        localStorage.aTransfers = JSON.stringify(data);
    }),

    isTrasferActive: function DM_isTrasferActive(dl_id) {
        var date = null;

        if (localStorage.aTransfers) {
            var data = JSON.parse(localStorage.aTransfers);

            date = data[dl_id];
        }

        if (typeof dlpage_ph === 'string' && dlpage_ph === dl_id) {
            date = Date.now();
        }

        return date;
    },

    failureFunction: function DM_failureFunction(task, args) {
        var code = args[1].responseStatus || 0;
        var dl = task.task.download;

        if (d) {
            dlmanager.logger.error('Fai1ure',
                dl.zipname || dl.n, code, task.task.chunk_id, task.task.offset, task.onQueueDone.name);
        }

        if (code === 509) {
            if (!dl.log509 && Object(u_attr).p) {
                dl.log509 = 1;
                api_req({ a: 'log', e: 99614, m: 'PRO user got 509' });
            }
            this.showOverQuotaDialog(task);
            dlmanager.dlReportStatus(dl, EOVERQUOTA);
            return 1;
        }

        /* update UI */
        dlmanager.dlReportStatus(dl, EAGAIN);

        if (code === 403 || code === 404) {
            dlmanager.newUrl(dl, function(rg) {
                if (!task.url) {
                    return;
                }
                task.url = rg + "/" + task.url.replace(/.+\//, '');
                dlmanager.dlQueuePushBack(task);
            });
        }
        else {
            /* check for network error  */
            dl.dl_failed = true;
            task.altport = !task.altport;
            api_reportfailure(hostname(dl.url), ulmanager.networkErrorCheck);
            dlmanager.dlQueuePushBack(task);
        }

        return 2;
    },

    getDownloadByHandle: function DM_IdToFile(handle) {
        var dl = null;
        if (handle) {
            for (var i in dl_queue) {
                if (dl_queue.hasOwnProperty(i)) {
                    var dlh = dl_queue[i].ph || dl_queue[i].id;
                    if (dlh === handle) {
                        dl = dl_queue[i];
                        break;
                    }
                }
            }
        }
        return dl;
    },

    throttleByIO: function DM_throttleByIO(writer) {
        writer.on('queue', function() {
            if (writer._queue.length >= dlmanager.ioThrottleLimit && !dlQueue.isPaused()) {
                writer.logger.info("IO_THROTTLE: pause XHR");
                dlQueue.pause();
                dlmanager.ioThrottlePaused = true;

                if (page === 'download') {
                    $('.download.status-txt').text(l[8579]);
                }
            }
        });

        writer.on('working', function() {
            if (writer._queue.length < dlmanager.ioThrottleLimit && dlmanager.ioThrottlePaused) {
                writer.logger.info("IO_THROTTLE: resume XHR");
                dlQueue.resume();
                dlmanager.ioThrottlePaused = false;

                if (page === 'download') {
                    $('.download.status-txt').text(l[258]);
                }
            }
        });
    },

    checkLostChunks: function DM_checkLostChunks(file) {
        'use strict';
        var dl_key = file.key;

        if (!this.verifyIntegrity(file)) {
            return false;
        }

        if (file.misThumbData) {
            var options = {
                onPreviewRetry: file.preview === -1
            };
            if (!file.zipid) {
                options.raw = is_rawimage(file.n) || mThumbHandler.has(file.n);
            }
            createnodethumbnail(
                file.id,
                new sjcl.cipher.aes([
                    dl_key[0] ^ dl_key[4],
                    dl_key[1] ^ dl_key[5],
                    dl_key[2] ^ dl_key[6],
                    dl_key[3] ^ dl_key[7]
                ]),
                ++ulmanager.ulFaId,
                file.misThumbData,
                options
            );
            file.misThumbData = false;
        }

        return true;
    },

    /** compute final MAC from block MACs, allow for EOF chunk race gaps */
    verifyIntegrity: function(dl) {
        'use strict';
        const match = (mac) => dl.key[6] === (mac[0] ^ mac[1]) && dl.key[7] === (mac[2] ^ mac[3]);
        const macs = Object.keys(dl.macs).map(Number).sort((a, b) => a - b).map(v => dl.macs[v]);
        const aes = new sjcl.cipher.aes([
            dl.key[0] ^ dl.key[4], dl.key[1] ^ dl.key[5], dl.key[2] ^ dl.key[6], dl.key[3] ^ dl.key[7]
        ]);

        let mac = condenseMacs(macs, aes);

        // normal case, correct file, correct mac
        if (match(mac)) {
            return true;
        }

        // up to two connections lost the race, up to 32MB (ie chunks) each
        const end = macs.length;
        const max = Math.min(32 * 2, end);
        const gap = (macs, gapStart, gapEnd) => {
            let mac = [0, 0, 0, 0];

            for (let i = 0; i < macs.length; ++i) {
                if (i < gapStart || i >= gapEnd) {
                    let mblk = macs[i];

                    for (let j = 0; j < mblk.length; j += 4) {
                        mac[0] ^= mblk[j];
                        mac[1] ^= mblk[j + 1];
                        mac[2] ^= mblk[j + 2];
                        mac[3] ^= mblk[j + 3];

                        mac = aes.encrypt(mac);
                    }
                }
            }
            return mac;
        };

        // most likely - a single connection gap (possibly two combined)
        for (let countBack = 1; countBack <= max; ++countBack) {
            const start1 = end - countBack;

            for (let len1 = 1; len1 <= 64 && start1 + len1 <= end; ++len1) {
                mac = gap(macs, start1, start1 + len1);

                if (match(mac)) {
                    if (d) {
                        this.logger.warn(dl.owner + ' Resolved MAC Gap %d-%d/%d', start1, start1 + len1, end);
                    }
                    eventlog(99739);
                    return true;
                }
            }
        }

        return false;
    },

    dlWriter: function DM_dl_writer(dl, is_ready) {
        'use strict';

        function finish_write(task, done) {
            task.data = undefined;
            done();

            if (typeof task.callback === "function") {
                task.callback();
            }
            if (dl.ready) {
                // tell the download scheduler we're done.
                dl.ready();
            }
        }

        function safeWrite(data, offset, callback) {
            var abort = function swa(ex) {
                console.error(ex);
                dlFatalError(dl, ex);
            };

            try {
                dl.io.write(data, offset, tryCatch(callback, abort));
            }
            catch (ex) {
                abort(ex);
            }
        }

        dl.writer = new MegaQueue(function dlIOWriterStub(task, done) {
            if (!task.data.byteLength || dl.cancelled) {
                if (d) {
                    dl.writer.logger.error(dl.cancelled ? "download cancelled" : "writing empty chunk");
                }
                return finish_write(task, done);
            }
            var logger = dl.writer && dl.writer.logger || dlmanager.logger;

            var abLen = task.data.byteLength;
            var ready = function _onWriterReady() {
                if (dl.cancelled || oIsFrozen(dl.writer)) {
                    if (d) {
                        logger.debug('Download canceled while writing to disk...', dl.cancelled, [dl]);
                    }
                    return;
                }
                dl.writer.pos += abLen;

                if (dl.misThumbData && task.offset + abLen <= dl.misThumbData.byteLength) {
                    new Uint8Array(
                        dl.misThumbData,
                        task.offset,
                        abLen
                    ).set(task.data);
                }

                if (dlmanager.dlResumeThreshold > dl.size) {

                    return finish_write(task, done);
                }

                dlmanager.setResumeInfo(dl, dl.writer.pos)
                    .always(function() {
                        finish_write(task, done);
                    });
            };

            var writeTaskChunk = function() {
                safeWrite(task.data, task.offset, ready);
            };

            if (dl.pzBufferStateChange) {
                safeWrite(dl.pzBufferStateChange, 0, writeTaskChunk);
                delete dl.pzBufferStateChange;
            }
            else {
                writeTaskChunk();
            }

        }, 1, 'download-writer');

        dlmanager.throttleByIO(dl.writer);

        dl.writer.pos = 0;

        dl.writer.validateTask = function(t) {
            var r = (!is_ready || is_ready()) && t.offset === dl.writer.pos;
            // if (d) this.logger.info('validateTask', r, t.offset, dl.writer.pos, t, dl, dl.writer);
            return r;
        };
    },

    mGetXR: function DM_getxr() {
        'use strict';

        return Object.assign(Object.create(null), {
            update: function(b) {
                var ts = Date.now();
                if (b < 0) {
                    this.tb = Object.create(null);
                    this.st = 0;
                    return 0;
                }
                if (b) {
                    this.tb[ts] = this.tb[ts] ? this.tb[ts] + b : b;
                }
                b = 0;
                for (var t in this.tb) {
                    if (t < ts - this.window) {
                        delete this.tb[t];
                    }
                    else {
                        b += this.tb[t];
                    }
                }
                if (!b) {
                    this.st = 0;
                    return 0;
                }
                else if (!this.st) {
                    this.st = ts;
                }

                if (!(ts -= this.st)) {
                    return 0;
                }

                if (ts > this.window) {
                    ts = this.window;
                }

                return b / ts;
            },

            st: 0,
            window: 60000,
            tb: Object.create(null)
        });
    },

    _quotaPushBack: {},
    _dlQuotaListener: [],

    _onQuotaRetry: function DM_onQuotaRetry(getNewUrl, sid) {
        delay.cancel('overquota:retry');
        this.setUserFlags();

        var ids = dlmanager.getCurrentDownloads();
        // $('.limited-bandwidth-dialog button.js-close').trigger('click');

        if (d) {
            this.logger.debug('_onQuotaRetry', getNewUrl, ids, this._dlQuotaListener.length, this._dlQuotaListener);
        }

        if (this.onOverquotaWithAchievements) {
            closeDialog();
            topmenuUI();

            dlmanager._achievementsListDialog();
            delete this.onOverquotaWithAchievements;
            return;
        }

        if (this.isOverFreeQuota) {
            closeDialog();
            topmenuUI();

            if (sid) {
                this.isOverFreeQuota = sid;
            }
        }

        if (page === 'download') {
            var $dtb = $('.download.download-page', '.fmholder');
            $dtb.removeClass('stream-overquota overquota');
        }
        else if (ids.length) {
            if (is_mobile) {
                mega.ui.sheet.hide();
                mobile.downloadOverlay.downloadTransfer.resetTransfer();
            }
            else {
                resetOverQuotaTransfers(ids);
            }
        }

        for (var i = 0; i < this._dlQuotaListener.length; ++i) {
            if (typeof this._dlQuotaListener[i] === "function") {
                this._dlQuotaListener[i]();
            }
        }
        this._dlQuotaListener = [];

        var tasks = [];

        for (var gid in this._quotaPushBack) {
            if (this._quotaPushBack.hasOwnProperty(gid)
                    && this._quotaPushBack[gid].onQueueDone) {

                tasks.push(this._quotaPushBack[gid]);
            }
        }
        this._quotaPushBack = {};

        this.logger.debug('_onQuotaRetry', tasks.length, tasks);

        if (getNewUrl && tasks.length) {
            var len = tasks.length;

            tasks.forEach(function(task) {
                var dl = task.task.download;

                dlmanager.newUrl(dl, function(rg) {
                    if (task.url) {
                        task.url = rg + "/" + task.url.replace(/.+\//, '');
                        dlmanager.dlQueuePushBack(task);
                    }

                    if (!--len) {
                        ids.forEach(fm_tfsresume);
                    }
                });
            });
        }
        else {
            tasks.forEach(this.dlQueuePushBack);
            ids.forEach(fm_tfsresume);
        }
    },

    _achievementsListDialog: function($dialog) {
        'use strict';

        if (d) {
            this.logger.info('_achievementsListDialog', this.onOverquotaWithAchievements, $dialog);
        }

        mega.achievem.achievementsListDialog(function() {
            dlmanager._onOverquotaDispatchRetry($dialog);
        });
    },

    _onOverquotaDispatchRetry: function($dialog) {
        'use strict';

        this.setUserFlags();

        if (d) {
            this.logger.info('_onOverquotaDispatchRetry', this.lmtUserFlags, $dialog);
        }

        if (this.onLimitedBandwidth) {
            // pre-warning dialog
            this.onLimitedBandwidth();
        }
        else {
            // from overquota dialog
            this._onQuotaRetry(true);
        }

        if ($dialog) {
            // update transfers buttons on the download page...
            this._overquotaClickListeners($dialog);
        }
    },

    _onOverQuotaAttemptRetry: function(sid) {
        'use strict';

        if (!this.onOverquotaWithAchievements) {
            if (this.isOverQuota) {
                delay.cancel('overquota:uqft');

                if (this.isOverFreeQuota) {
                    this._onQuotaRetry(true, sid);
                }
                else {
                    this.uqFastTrack = !Object(u_attr).p;
                    delay('overquota:uqft', this._overquotaInfo.bind(this), 900);
                }
            }

            if (typeof this.onLimitedBandwidth === 'function') {
                this.onLimitedBandwidth();
            }
        }
    },

    _overquotaInfo: function() {
        'use strict';

        const onQuotaInfo = (res) => {
            const $dialog = $('.limited-bandwidth-dialog', 'body');

            let timeLeft = 3600;
            if (u_type > 2 && u_attr.p) {
                timeLeft = (res.suntil || 0) - unixtime();
                timeLeft = timeLeft > 0 ? timeLeft : 0;
            }
            else if (Object(res.tah).length) {

                let add = 1;
                // let size = 0;

                timeLeft = 3600 - ((res.bt | 0) % 3600);

                for (let i = 0; i < res.tah.length; i++) {
                    // size += res.tah[i];

                    if (res.tah[i]) {
                        add = 0;
                    }
                    else if (add) {
                        timeLeft += 3600;
                    }
                }
            }

            clearInterval(this._overQuotaTimeLeftTick);
            if (timeLeft < 3600 * 24) {
                delay('overquota:retry', () => this._onQuotaRetry(), timeLeft * 1000);
            }

            this._overquotaClickListeners($dialog);
            let lastCheck = Date.now();

            if ($dialog.is(':visible')) {
                const $countdown = $('.countdown', $dialog).removeClass('hidden');
                const tick = () => {
                    const curTime = Date.now();
                    if (lastCheck + 1000 < curTime) {
                        // Convert ms to s and remove difference from remaining
                        timeLeft -= Math.floor((curTime - lastCheck) / 1000);
                        if (timeLeft < 3600 * 24) {
                            delay('overquota:retry', () => this._onQuotaRetry(), timeLeft * 1000);
                        }
                    }
                    lastCheck = curTime;
                    const time = secondsToTimeLong(timeLeft--);

                    if (time) {
                        $countdown.safeHTML(time);
                        $countdown.removeClass('hidden');
                    }
                    else {
                        $countdown.text('');
                        $countdown.addClass('hidden');

                        clearInterval(dlmanager._overQuotaTimeLeftTick);
                    }
                };

                tick();
                this._overQuotaTimeLeftTick = setInterval(tick, 1000);
            }
        };

        api.req({a: 'uq', xfer: 1, pro: 1}, {cache: -10}).then(({result: res}) => {
            delay('overquotainfo:reply.success', () => {
                if (typeof res === "number") {
                    // Error, just keep retrying
                    onIdle(() => this._overquotaInfo());
                    return;
                }

                // XXX: replaced uqFastTrack usage by directly checking for pro flag ...
                if (this.onOverQuotaProClicked && u_type) {
                    // The user loged/registered in another tab, poll the uq command every
                    // 30 seconds until we find a pro status and then retry with fresh download

                    const proStatus = res.mxfer;
                    this.logger.debug('overquota:proStatus', proStatus);

                    delay('overquota:uqft', () => this._overquotaInfo(), 30000);
                }

                onQuotaInfo(res);
            });
        }).catch((ex) => {
            if (d) {
                dlmanager.logger.warn('_overquotaInfo', ex);
            }

            delay('overquotainfo:reply.error', () => this._overquotaInfo(), 2e3);
        });
    },

    _overquotaClickListeners($dialog, flags, preWarning) {
        'use strict';

        var self = this;
        var unbindEvents = function() {
            $(window).unbind('resize.overQuotaDialog');
            $('.fm-dialog-overlay', 'body').unbind('click.closeOverQuotaDialog').unbind('click.oqDialogEvents');
        };
        var closeDialog = function() {
            if ($.dialog === 'download-pre-warning') {
                $.dialog = 'was-pre-warning';
            }
            unbindEvents();
            window.closeDialog();
        };
        var open = function(url) {
            if (is_mobile) {
                location.href = url;
                return false;
            }
            window.open.apply(window, arguments);
        };
        var onclick = function onProClicked() {
            if (preWarning) {
                api_req({a: 'log', e: 99643, m: 'on overquota pre-warning upgrade/pro-plans clicked'});
            }
            else {
                self.onOverQuotaProClicked = true;
                delay('overquota:uqft', self._overquotaInfo.bind(self), 30000);
                api_req({a: 'log', e: 99640, m: 'on overquota pro-plans clicked'});
            }

            if ($(this).hasClass('plan-button')) {
                const planNum = $(this).closest('.plan').data('payment');
                if (planNum === pro.ACCOUNT_LEVEL_BUSINESS) {
                    open(getAppBaseUrl() + '#registerb');
                    eventlog(501041, true);
                }
                else {
                    const events = {
                        4: 501150,
                        1: 501151,
                        2: 501152,
                        3: 501153,
                    };
                    eventlog(events[planNum]);
                    sessionStorage.fromOverquotaPeriod = $(this).parent().data('period') || pro.proplan.period;
                    open(getAppBaseUrl() + '#propay_' + planNum);
                }
            }
            else {
                if (flags & dlmanager.LMT_PRO3) {
                    // Scroll to flexi section of pro page
                    sessionStorage.mScrollTo = 'flexi';
                }
                else if ($dialog.hasClass('pro-mini')) {
                    // Use the same flag to indicate the exclusive offer tab should be opened
                    // to prevent the browser extension from breaking
                    sessionStorage.mScrollTo = 'exc';
                }

                open(getAppBaseUrl() + '#pro');
            }

            return false;
        };

        flags = flags !== undefined ? flags : this.lmtUserFlags;

        if (preWarning) {
            localStorage.seenQuotaPreWarn = Date.now();

            $('.msg-overquota', $dialog).addClass('hidden');
            $('.msg-prewarning', $dialog).removeClass('hidden');
            $('.dialog-action', $dialog)
                .text(flags & dlmanager.LMT_PRO3 ? l[6826] : l[17091])
                .rebind('click', this.onLimitedBandwidth.bind(this));

            $('button.positive.upgrade', $dialog).text(l[433]);
        }
        else {
            $('.msg-overquota', $dialog).removeClass('hidden');
            $('.msg-prewarning', $dialog).addClass('hidden');

            $('button.positive.upgrade', $dialog).text(l.upgrade_now);

            $('.dialog-action', $dialog)
                .text(flags & this.LMT_PRO3 ? l.ok_button : l.wait_for_free_tq_btn_text);

            $('.video-theatre-mode:visible').addClass('paused');

            if (page === 'download') {
                setTransferStatus(0, l[17]);
            }
        }

        $('button.js-close, .fm-dialog-close, .dialog-action', $dialog).add($('.fm-dialog-overlay'))
            .rebind('click.closeOverQuotaDialog', () => {

                closeDialog();
            });

        $('button.positive.upgrade, .plan-button', $dialog).rebind('click', onclick);

        if (flags & this.LMT_ISPRO) {
            $dialog.addClass(flags & this.LMT_PRO3 ? 'pro3' : 'pro');
        }
        else if (!(flags & this.LMT_ISREGISTERED)) {
            if (preWarning && !u_wasloggedin()) {
                eventlog(99646); // on pre-warning not-logged-in
            }

            var $pan = $('.not-logged.no-achievements', $dialog);

            if ($pan.length && !$pan.hasClass('flag-pcset')) {
                $pan.addClass('flag-pcset');

                api.req({a: 'efqb'}).then(({result: val}) => {
                    if (val) {
                        $pan.text(String($pan.text()).replace('10%', `${val | 0}%`));
                    }
                });
            }
        }

        if (flags & this.LMT_HASACHIEVEMENTS) {
            $dialog.addClass('achievements');
            localStorage.gotOverquotaWithAchievements = 1;
        }
    },

    _setOverQuotaState: function DM_setOverQuotaState(dlTask) {
        this.isOverQuota = true;
        localStorage.seenOverQuotaDialog = Date.now();
        this.logger.debug('_setOverQuotaState', dlTask);

        if (typeof dlTask === "function") {
            this._dlQuotaListener.push(dlTask);
        }
        else if (dlTask) {
            this._quotaPushBack[dlTask.gid] = dlTask;
        }

        this.getCurrentDownloads()
            .forEach(function(gid) {
                fm_tfspause(gid, true);
            });
    },

    showOverQuotaRegisterDialog: function DM_freeQuotaDialog(dlTask) {

        this._setOverQuotaState(dlTask);

        // did we get a sid from another tab? (watchdog:setsid)
        if (typeof this.isOverFreeQuota === 'string') {
            // Yup, delay a retry...
            return delay('overfreequota:retry', this._onQuotaRetry.bind(this, true), 1200);
        }
        this.isOverFreeQuota = true;

        if (localStorage.awaitingConfirmationAccount) {
            var accountData = JSON.parse(localStorage.awaitingConfirmationAccount);
            this.logger.debug('showOverQuotaRegisterDialog: awaitingConfirmationAccount!');
            return mega.ui.sendSignupLinkDialog(accountData);
        }

        api_req({a: 'log', e: 99613, m: 'on overquota register dialog shown'});

        mega.ui.showRegisterDialog({
            title: l[17],
            body: '<p>' + l[8834] + '</p><p>' + l[8833] + '</p><h2>' + l[1095] + '</h2>',
            showLogin: true,

            onAccountCreated: function(gotLoggedIn, accountData) {
                if (gotLoggedIn) {
                    // dlmanager._onQuotaRetry(true);
                    dlmanager._onOverquotaDispatchRetry();

                    api_req({a: 'log', e: 99649, m: 'on overquota logged-in through register dialog.'});
                }
                else {
                    security.register.cacheRegistrationData(accountData);
                    mega.ui.sendSignupLinkDialog(accountData);

                    api_req({a: 'log', e: 99650, m: 'on overquota account created.'});
                }
            }
        });
    },

    updateOBQDialogBlurb($dialog, miniPlanId, isStreaming) {
        'use strict';

        const flags = this.lmtUserFlags;
        const planName = miniPlanId ? pro.getProPlanName(miniPlanId) : '';

        if ($dialog.hasClass('uploads')) {
            $('.transfer-overquota-txt', $dialog).text(miniPlanId ? l.upgrade_resume_uploading : l[19136]);
        }
        else if ($dialog.hasClass('exceeded')) {
            const $overQuotaMsg = $('p.msg-overquota', $dialog).empty();
            let type = isStreaming ? 'stream_media' : 'dl';

            if (flags & dlmanager.LMT_ISPRO) {
                if (miniPlanId && (miniPlanId === u_attr.p) && !isStreaming) {
                    $overQuotaMsg.safeAppend(l.dl_tq_exceeded_more_mini.replace('%1', planName));
                }
                else {
                    const plan = flags & dlmanager.LMT_PRO3 ? 'pro3' : 'pro';
                    $overQuotaMsg.safeAppend(l[`${type}_tq_exceeded_${plan}`]);
                }
            }
            else {
                const level = miniPlanId ? 'mini' : 'free';
                type = isStreaming ? 'streaming' : 'dl';

                let string = l[`${type}_tq_exc_${level}_desktop`];
                if (level === 'mini') {
                    string = string.replace('%2', planName);
                }

                $overQuotaMsg.safeAppend(string);
            }
        }
        else {
            const level = miniPlanId ? 'mini' : 'free';

            let string = l[`dl_limited_tq_${level}`];
            if (miniPlanId) {
                string = string.replace('%1', planName);
            }

            $('p.msg-prewarning', $dialog).empty().safeAppend(string);
        }
    },

    prepareOBQDialogPlans($dialog, lowestPlanIsMini, miniPlanId) {
        'use strict';

        const $pricingBoxTemplate = $('.plan.template', $dialog);

        if (lowestPlanIsMini) {
            const $monthlyCard = $pricingBoxTemplate.clone(true).appendTo($pricingBoxTemplate.parent());
            $monthlyCard
                .removeClass('template')
                .addClass(`pro${miniPlanId} duration1`)
                .toggleClass('starter', miniPlanId === pro.ACCOUNT_LEVEL_STARTER)
                .attr('data-payment', miniPlanId)
                .attr('data-period', 1);
        }
        else {
            const planIds = pro.sortPlansByStorage(
                Array.from(pro.filter.simple.obqDialog).filter(p => pro.getPlanObj(p))
            );

            for (let i = 0; i < planIds.length; i++) {
                const id = planIds[i];
                const $newNode = $pricingBoxTemplate.clone(true).appendTo($pricingBoxTemplate.parent());
                $newNode.removeClass('template').addClass(`pro${id}`).attr('data-payment', id);
            }

            $('.pricing-page.radio-buttons', $dialog).removeClass('hidden');
            pro.proplan.initPlanPeriodControls($dialog);
        }
        $pricingBoxTemplate.remove();
        var $pricingBoxes = $('.plan', $dialog);

        // Set yearly prices by default if not showing mini plan cards
        const preSelectedPeriod = lowestPlanIsMini ? 0 : ((sessionStorage.getItem('pro.period') | 0) || 12);
        const planType = lowestPlanIsMini ? 'miniPlans' : 'core';
        pro.proplan.updateEachPriceBlock("D", $pricingBoxes, $dialog, preSelectedPeriod, planType);
    },

    async getRequiredStorageQuota() {
        'use strict';

        const res = M.account || M.storageQuotaCache || false;

        return typeof res.mstrg === 'number' ? res : M.getStorageQuota();
    },

    async setPlanPrices($dialog, ignoreStorageReq) {
        'use strict';

        var $scrollBlock = $('.scrollable', $dialog);

        // Set scroll to top
        $scrollBlock.scrollTop(0);

        await M.require('businessAcc_js');
        const business = new BusinessAccount();

        const awaitItems = [
            !ignoreStorageReq && this.getRequiredStorageQuota(),
            business.getBusinessPlanInfo(false),
            pro.loadMembershipPlans()
        ];

        // Load the membership plans, and the required storage quota if needed
        const [storageObj, businessPlanInfo] = await Promise.all(awaitItems);

        pro.businessPlanData = businessPlanInfo;
        pro.planObjects.createBusinessPlanObject(businessPlanInfo);

        const slideshowPreview = slideshowid && is_video(M.getNodeByHandle(slideshowid));
        const isStreaming = !dlmanager.isDownloading && (dlmanager.isStreaming || slideshowPreview);

        const requiredQuota = storageObj.mstrg || 0;

        const freeOrLowerTier = !Object(self.u_attr).p ||
            [
                pro.ACCOUNT_LEVEL_STARTER,
                pro.ACCOUNT_LEVEL_BASIC,
                pro.ACCOUNT_LEVEL_ESSENTIAL
            ].includes(u_attr.p);

        const lowestRequiredMiniPlan = freeOrLowerTier
            && pro.filter.lowestRequired(requiredQuota, 'miniPlans', ignoreStorageReq);
        const lowestPlanIsMini = !!lowestRequiredMiniPlan;

        let miniPlanId;
        if (lowestPlanIsMini) {
            $dialog.addClass('pro-mini');

            if (isStreaming) {
                $dialog.addClass('no-cards');
            }
            miniPlanId = lowestPlanIsMini ? lowestRequiredMiniPlan[pro.UTQA_RES_INDEX_ACCOUNTLEVEL] : '';
        }

        // Update the blurb text of the dialog
        dlmanager.updateOBQDialogBlurb($dialog, miniPlanId, isStreaming);

        // Render the plan details if required
        if (!$dialog.hasClass('no-cards')) {
            dlmanager.prepareOBQDialogPlans($dialog, lowestPlanIsMini, miniPlanId);
        }

        if (dlmanager.isOverQuota) {
            dlmanager._overquotaInfo();
        }

        if (!is_mobile) {

            // Check if touch device
            var is_touch = function() {
                return 'ontouchstart' in window || 'onmsgesturechange' in window;
            };

            // Initialise scrolling
            if (!is_touch()) {
                if ($scrollBlock.is('.ps')) {
                    Ps.update($scrollBlock[0]);
                }
                else {
                    Ps.initialize($scrollBlock[0]);
                }
            }
        }
    },

    showLimitedBandwidthDialog: function(res, callback, flags) {
        'use strict';

        var $dialog = $('.limited-bandwidth-dialog');

        loadingDialog.hide();
        this.onLimitedBandwidth = function() {
            if (callback) {
                $dialog.removeClass('exceeded achievements pro3 pro pro-mini no-cards uploads');
                $('.dialog-action, button.js-close, .fm-dialog-close', $dialog).off('click');
                $('button.positive.upgrade, .pricing-page.plan', $dialog).off('click');

                if ($.dialog === 'download-pre-warning') {
                    $.dialog = false;
                }
                closeDialog();
                Soon(callback);
                callback = $dialog = undefined;

                if (is_mobile) {
                    tryCatch(() => mobile.overBandwidthQuota.closeSheet())();
                }
            }
            delete this.onLimitedBandwidth;
            return false;
        };

        flags = flags !== undefined ? flags : this.lmtUserFlags;

        if (d) {
            // as per ticket 6446
            // /* 01 */ flags = this.LMT_ISREGISTERED | this.LMT_HASACHIEVEMENTS;
            // /* 02 */ flags = this.LMT_HASACHIEVEMENTS;
            // /* 03 */ flags = 0;
            // /* 04 */ flags = this.LMT_ISREGISTERED;

            this.lmtUserFlags = flags;
        }

        if (is_mobile) {
            mobile.overBandwidthQuota.show(false);
            return;
        }

        $dialog.removeClass('exceeded achievements pro3 pro pro-mini no-cards uploads');

        // Load the membership plans, then show the dialog
        dlmanager.setPlanPrices($dialog, true).then(() => {
            M.safeShowDialog('download-pre-warning', () => {
                eventlog(99617);// overquota pre-warning shown.

                uiCheckboxes($dialog, 'ignoreLimitedBandwidth');
                dlmanager._overquotaClickListeners($dialog, flags, res || true);

                $('.fm-dialog-overlay', 'body').rebind('click.oqDialogEvents', () => {
                    eventlog(501156);
                });
                $('.dialog-action', $dialog).rebind('click.oqDialogEvents', () => {
                    eventlog(501155);
                });

                return $dialog;
            });
        });
    },

    showOverQuotaDialog: function DM_quotaDialog(dlTask, flags) {
        'use strict';

        flags = flags !== undefined ? flags : this.lmtUserFlags;

        if (d) {
            // as per ticket 6446
            // /* 05 */ flags = this.LMT_ISREGISTERED | this.LMT_HASACHIEVEMENTS;
            // /* 06 */ flags = this.LMT_HASACHIEVEMENTS;
            // /* 07 */ flags = 0;
            // /* 08 */ flags = this.LMT_ISREGISTERED;
            // /* 09 */ flags = this.LMT_ISREGISTERED | this.LMT_ISPRO | this.LMT_HASACHIEVEMENTS;
            // /* 10 */ flags = this.LMT_ISREGISTERED | this.LMT_ISPRO;

            this.lmtUserFlags = flags;
        }

        if (this.efq && !(flags & this.LMT_ISREGISTERED)) {
            return this.showOverQuotaRegisterDialog(dlTask);
        }
        loadingDialog.hide();

        var $dialog = $('.limited-bandwidth-dialog');

        $(document).fullScreen(false);
        this._setOverQuotaState(dlTask);

        if (is_mobile) {
            mobile.overBandwidthQuota.show(true);
            return;
        }

        if ($dialog.is(':visible') && !$dialog.hasClass('uploads')) {
            this.logger.info('showOverQuotaDialog', 'visible already.');
            return;
        }

        if ($('.achievements-list-dialog').is(':visible')) {
            this.logger.info('showOverQuotaDialog', 'Achievements dialog visible.');
            return;
        }

        $dialog.removeClass('achievements pro3 pro pro-mini no-cards uploads').addClass('exceeded');

        // Load the membership plans, then show the dialog
        dlmanager.setPlanPrices($dialog, true).then(() => {
            M.safeShowDialog('download-overquota', () => {
                $('.header-before-icon.exceeded', $dialog).text(l[17]);

                dlmanager._overquotaClickListeners($dialog, flags);

                $('.fm-dialog-overlay').rebind('click.dloverq', () => {
                    dlmanager.doCloseModal('dloverq', $dialog);
                    eventlog(501149);
                    return false;
                });

                $dialog
                    .rebind('dialog-closed', dlmanager.doCloseModal.bind(dlmanager, 'dloverq', $dialog));

                $('button.js-close, .fm-dialog-close', $dialog)
                    .rebind('click.quota', () => {
                        dlmanager.doCloseModal('dloverq', $dialog);
                        eventlog(501149);
                        return false;
                    });

                $('.dialog-action', $dialog)
                    .rebind('click.quota', () => {
                        dlmanager.doCloseModal('dloverq', $dialog);
                        eventlog(501154);
                        return false;
                    });

                if (window.pfcol) {
                    eventlog(99956);
                }
                eventlog(99648);

                return $dialog;
            });
        });
    },

    doCloseModal(overlayEvent, $dialog) {
        'use strict';

        if (!$('span.countdown').is(':visible')) {
            clearInterval(dlmanager._overQuotaTimeLeftTick);
        }
        $('.fm-dialog-overlay').off(`click.${overlayEvent}`);
        $dialog.off('dialog-closed');
        $('button.js-close, .fm-dialog-close', $dialog).off('click.quota');
        closeDialog();

        return false;
    },

    showNothingToDownloadDialog: function DM_noDownloadDialog(callback) {
        'use strict';

        loadingDialog.hide();
        msgDialog('warningb', '', l.empty_download_dlg_title, l.empty_download_dlg_text, callback);
    },

    getCurrentDownloads: function() {
        return array.unique(dl_queue.filter(isQueueActive).map(dlmanager.getGID));
    },

    getCurrentDownloadsSize: function(sri) {
        var size = 0;

        if (typeof dl_queue === 'undefined') {
            return size;
        }

        dl_queue
            .filter(isQueueActive)
            .map(function(dl) {
                size += dl.size;

                if (sri) {
                    // Subtract resume info

                    if (dl.byteOffset) {
                        size -= dl.byteOffset;
                    }
                }
            });

        return size;
    },

    getQBQData: function() {
        'use strict';

        var q = {p: [], n: [], s: 0};

        dl_queue
            .filter(isQueueActive)
            .map(function(dl) {
                if (!dl.loaded || dl.size - dl.loaded) {
                    if (dl.ph) {
                        q.p.push(dl.ph);
                    }
                    else {
                        q.n.push(dl.id);
                    }

                    if (dl.loaded) {
                        q.s += dl.loaded;
                    }
                }
            });

        return q;
    },

    /**
     * Check whether MEGAsync is running.
     *
     * @param {String}  minVersion      The min MEGAsync version required.
     * @param {Boolean} getVersionInfo  Do not reject the promise if the min version is not
     *                                  meet, instead resolve it providing an ERANGE result.
     * @return {MegaPromise}
     */
    isMEGAsyncRunning: function(minVersion, getVersionInfo) {
        var timeout = 400;
        var logger = this.logger;
        var promise = new MegaPromise();

        var resolve = function() {
            if (promise) {
                loadingDialog.hide();
                logger.debug('isMEGAsyncRunning: YUP', arguments);

                promise.resolve.apply(promise, arguments);
                promise = undefined;
            }
        };
        var reject = function(e) {
            if (promise) {
                loadingDialog.hide();
                logger.debug('isMEGAsyncRunning: NOPE', e);

                promise.reject.apply(promise, arguments);
                promise = undefined;
            }
        };
        var loader = function() {
            if (typeof megasync === 'undefined') {
                return reject(EACCESS);
            }
            megasync.isInstalled(function(err, is) {
                if (err || !is) {
                    reject(err || ENOENT);
                }
                else {
                    var verNotMeet = false;

                    // if a min version is required, check for it
                    if (minVersion) {
                        var runningVersion = M.vtol(is.v);

                        if (typeof minVersion !== 'number'
                                || parseInt(minVersion) !== minVersion) {

                            minVersion = M.vtol(minVersion);
                        }

                        if (runningVersion < minVersion) {
                            if (!getVersionInfo) {
                                return reject(ERANGE);
                            }

                            verNotMeet = ERANGE;
                        }
                    }

                    var syncData = clone(is);
                    syncData.verNotMeet = verNotMeet;

                    resolve(megasync, syncData);
                }
            });
        };

        loadingDialog.show();
        logger.debug('isMEGAsyncRunning: checking...');

        if (typeof megasync === 'undefined') {
            timeout = 4000;
            M.require('megasync_js').always(loader);
        }
        else {
            onIdle(loader);
        }

        setTimeout(reject, timeout);

        return promise;
    },

    setBrowserWarningClasses: function(selector, $container, message) {
        'use strict';

        var uad = ua.details || false;
        var $elm = $(selector, $container);

        if (message) {
            $elm.addClass('default-warning');
        }
        else if (String(uad.browser).startsWith('Edg')) {
            $elm.addClass('edge');
        }
        else if (window.safari) {
            $elm.addClass('safari');
        }
        else if (window.opr) {
            $elm.addClass('opera');
        }
        else if (mega.chrome) {
            $elm.addClass('chrome');
        }
        else if (uad.engine === 'Gecko') {
            $elm.addClass('ff');
        }
        else if (uad.engine === 'Trident') {
            $elm.addClass('ie');
        }

        var setText = function(locale, $elm) {
            var text = uad.browser ? String(locale).replace('%1', uad.browser) : l[16883];

            if (message) {
                text = l[1676] + ': ' + message + '<br/>' + l[16870] + ' %2';
            }

            if (mega.chrome) {
                if (window.Incognito) {
                    text = text.replace('%2', '(' + l[16869] + ')');
                }
                else if (message) {
                    text = text.replace('%2', '');
                }
                else if (is_extension) {
                    text = l[17792];
                }
                else {
                    text = l[17793];

                    onIdle(function() {
                        $('.freeupdiskspace').rebind('click', function() {
                            var $dialog = $('.megasync-overlay');
                            $('.megasync-close, button.js-close, .fm-dialog-close', $dialog).click();

                            msgDialog('warningb', l[882], l[7157], 0, async(yes) => {
                                if (yes) {
                                    loadingDialog.show();
                                    await Promise.allSettled([eventlog(99682), M.clearFileSystemStorage()]);
                                    location.reload(true);
                                }
                            });
                            return false;
                        });
                    });
                }
            }
            else {
                text = text.replace('%2', '(' + l[16868] + ')');
            }

            $elm.find('span.txt').safeHTML(text);
        };

        $('.mega-button', $elm).rebind('click', function() {
            if (typeof megasync === 'undefined') {
                console.error('Failed to load megasync.js');
            }
            else {
                if (typeof dlpage_ph === 'string') {
                    megasync.download(dlpage_ph, dlpage_key);
                }
                else {
                    window.open(
                        megasync.getMegaSyncUrl() || 'https://mega.io/desktop',
                        '_blank',
                        'noopener,noreferrer'
                    );
                }
            }
        });

        $('button.js-close, .fm-dialog-close', $elm).rebind('click', function() {
            $elm.removeClass('visible');
        });

        if ($container && $elm) {
            setText(l[16866], $elm);
            $container.addClass('warning');
        }
        else {
            setText(l[16865], $elm.addClass('visible'));
        }
    },

    // MEGAsync dialog If filesize is too big for downloading through browser
    showMEGASyncOverlay(onSizeExceed, dlStateError, initialSlide, event) {
        'use strict';

        //M.require('megasync_js').dump();

        var $overlay = $('.megasync-overlay');
        var $body = $('body');

        var hideOverlay = function() {
            $body.off('keyup.msd');
            $overlay.addClass('hidden');
            $body.removeClass('overlayed');
            $overlay.hide();
            return false;
        };

        $overlay.addClass('msd-dialog').removeClass('hidden downloading');
        $body.addClass('overlayed');
        $overlay.show();

        var $slides = $overlay.find('.megasync-slide');

        let $currentSlide = initialSlide ?
            $slides.filter(`.megasync-slide.slide${initialSlide}`) :
            $slides.filter('.megasync-slide:not(.hidden)').first();

        if (!$currentSlide.length) {
            $currentSlide = $slides.filter('.megasync-slide:not(.hidden)').first();
        }

        var $sliderControl = $('button.megasync-slider', $overlay);
        var $sliderPrevButton = $sliderControl.filter('.prev');
        var $sliderNextButton = $sliderControl.filter('.next');

        $slides.removeClass('prev current next');
        $currentSlide.addClass('current');

        const $prevSlide = $currentSlide.prev().not('.hidden');
        if ($prevSlide.length) {
            $prevSlide.addClass('prev');
            $sliderPrevButton.removeClass('disabled');
        }
        else {
            $sliderPrevButton.addClass('disabled');
        }

        const $nextSlide = $currentSlide.next().not('.hidden');
        if ($nextSlide.length) {
            $nextSlide.addClass('next');
            $sliderNextButton.removeClass('disabled');
        }
        else {
            $sliderNextButton.addClass('disabled');
        }

        $sliderControl.rebind('click', function() {
            var $this = $(this);
            var $currentSlide = $overlay.find('.megasync-slide.current');
            var $prevSlide = $currentSlide.prev().not('.hidden');
            var $nextSlide = $currentSlide.next().not('.hidden');

            if ($this.hasClass('disabled')) {
                return false;
            }

            if ($this.hasClass('prev') && $prevSlide.length) {
                $slides.removeClass('prev current next');
                $prevSlide.addClass('current');
                $currentSlide.addClass('next');
                $sliderNextButton.removeClass('disabled');

                if ($prevSlide.prev().not('.hidden').length) {
                    $prevSlide.prev().addClass('prev');
                    $sliderPrevButton.removeClass('disabled');
                }
                else {
                    $sliderPrevButton.addClass('disabled');
                }
            }
            else if ($nextSlide.length) {
                $slides.removeClass('prev current next');
                $nextSlide.addClass('current');
                $currentSlide.addClass('prev');
                $sliderPrevButton.removeClass('disabled');

                if ($nextSlide.next().not('.hidden').length) {
                    $nextSlide.next().addClass('next');
                    $sliderNextButton.removeClass('disabled');
                }
                else {
                    $sliderNextButton.addClass('disabled');
                }
            }
        });

        if (onSizeExceed) {
            dlmanager.setBrowserWarningClasses('.megasync-bottom-warning', $overlay, dlStateError);
        }

        $('button.download-megasync', $overlay).rebind('click', function() {
            if (event) {
                eventlog(event);
            }

            if (typeof megasync === 'undefined') {
                console.error('Failed to load megasync.js');
            }
            else if (typeof dlpage_ph === 'string' && megasync.getUserOS() !== 'linux') {
                megasync.download(dlpage_ph, dlpage_key);
            }
            else {
                window.open(
                    megasync.getMegaSyncUrl() || 'https://mega.io/desktop',
                    '_blank',
                    'noopener,noreferrer'
                );
                hideOverlay();
            }

            return false;
        });

        $('.megasync-info-txt a', $overlay).rebind('click', function() {
            hideOverlay();
            loadSubPage('pro');
        });

        $('.megasync-close, button.js-close, .fm-dialog-close', $overlay).rebind('click', hideOverlay);

        $body.rebind('keyup.msd', function(e) {
            if (e.keyCode === 27) {
                hideOverlay();
            }
        });

        $('a.clickurl', $overlay).rebind('click', function() {
            open(this.href);
            return false;
        });
    }
};

/** @name dlmanager.LMT_ISPRO */
/** @name dlmanager.LMT_ISREGISTERED */
/** @name dlmanager.LMT_HASACHIEVEMENTS */
/** @name dlmanager.LMT_PRO3 */
makeEnum(['ISREGISTERED', 'ISPRO', 'HASACHIEVEMENTS', 'PRO3'], 'LMT_', dlmanager);

var dlQueue = new TransferQueue(function _downloader(task, done) {
    if (!task.dl) {
        dlQueue.logger.info('Skipping frozen task ' + task);
        return done();
    }
    return task.run(done);
}, 4, 'downloader');

// chunk scheduler
dlQueue.validateTask = function(pzTask) {
    var r = pzTask instanceof ClassChunk || pzTask instanceof ClassEmptyChunk;

    if (!r && pzTask instanceof ClassFile && !dlmanager.fetchingFile) {
        var j = this._queue.length;
        while (j--) {
            if (this._queue[j][0] instanceof ClassChunk) {
                break;
            }
        }

        if ((r = (j === -1)) && $.len(this._qpaused)) {
            // fm_tfsorderupd(); check commit history if we ever want to bring this back (with a good revamp in place)

            // About to start a new download, check if a previously paused dl was resumed.
            var p1 = M.t[pzTask.gid];
            for (var i = 0; i < p1; ++i) {
                var gid = M.t[i];
                if (this._qpaused[gid] && this.dispatch(gid)) {
                    return -0xBEEF;
                }
            }
        }
    }
    return r;
};

/**
 *  DownloadQueue
 *
 *  Array extension to override push, so we can easily
 *  kick up the download (or queue it) without modifying the
 *  caller codes
 */
function DownloadQueue() {}
inherits(DownloadQueue, Array);

DownloadQueue.prototype.push = function() {
    var pos = Array.prototype.push.apply(this, arguments);
    var id = pos - 1;
    var dl = this[id];
    var dl_id = dl.ph || dl.id;
    var dl_key = dl.key;
    var dlIO;

    if (!self.dlMethod) {
        onIdle(() => dlFatalError(dl, l[9065]));
        return pos;
    }

    if (dl.zipid) {
        if (!Zips[dl.zipid]) {
            Zips[dl.zipid] = new ZipWriter(dl.zipid, dl);
        }
        dlIO = Zips[dl.zipid].addEntryFile(dl);
    }
    else {
        if (dl.preview || Math.min(MemoryIO.fileSizeLimit, 90 * 1048576) > dl.size) {
            dlIO = new MemoryIO(dl_id, dl);
        }
        else {
            dlIO = new dlMethod(dl_id, dl);
        }
    }

    dl.aes = new sjcl.cipher.aes([
        dl_key[0] ^ dl_key[4],
        dl_key[1] ^ dl_key[5],
        dl_key[2] ^ dl_key[6],
        dl_key[3] ^ dl_key[7]
    ]);
    dl.nonce = JSON.stringify([
        dl_key[0] ^ dl_key[4],
        dl_key[1] ^ dl_key[5],
        dl_key[2] ^ dl_key[6],
        dl_key[3] ^ dl_key[7], dl_key[4], dl_key[5]
    ]);

    dl.pos = id; // download position in the queue
    dl.dl_id = dl_id; // download id
    dl.io = dlIO;
    // Use IO object to keep in track of progress
    // and speed
    dl.io.progress = 0;
    dl.io.size = dl.size;
    dl.decrypter = 0;
    dl.n = M.getSafeName(dl.n);

    if (!dl.zipid) {
        dlmanager.dlWriter(dl);
    }
    else {
        dl.writer = dlIO;
    }
    Object.defineProperty(dl, 'hasResumeSupport', {value: dl.io.hasResumeSupport});

    dl.macs = Object.create(null);

    dlQueue.push(new ClassFile(dl));

    return pos;
};

mBroadcaster.once('startMega', () => {
    'use strict';

    api.observe('setsid', (sid) => {
        delay('overquota:retry', () => dlmanager._onOverQuotaAttemptRetry(sid));
    });
});

/* ***************** BEGIN MEGA LIMITED CODE REVIEW LICENCE *****************
 *
 * Copyright (c) 2025 by Mega Limited, Auckland, New Zealand
 * All rights reserved.
 *
 * This licence grants you the rights, and only the rights, set out below,
 * to access and review Mega's code. If you take advantage of these rights,
 * you accept this licence. If you do not accept the licence,
 * do not access the code.
 *
 * Words used in the Mega Limited Terms of Service [https://mega.nz/terms]
 * have the same meaning in this licence. Where there is any inconsistency
 * between this licence and those Terms of Service, these terms prevail.
 *
 * 1. This licence does not grant you any rights to use Mega's name, logo,
 *    or trademarks and you must not in any way indicate you are authorised
 *    to speak on behalf of Mega.
 *
 * 2. If you issue proceedings in any jurisdiction against Mega because you
 *    consider Mega has infringed copyright or any patent right in respect
 *    of the code (including any joinder or counterclaim), your licence to
 *    the code is automatically terminated.
 *
 * 3. THE CODE IS MADE AVAILABLE "AS-IS" AND WITHOUT ANY EXPRESS OF IMPLIED
 *    GUARANTEES AS TO FITNESS, MERCHANTABILITY, NON-INFRINGEMENT OR OTHERWISE.
 *    IT IS NOT BEING PROVIDED IN TRADE BUT ON A VOLUNTARY BASIS ON OUR PART
 *    AND YOURS AND IS NOT MADE AVAILABE FOR CONSUMER USE OR ANY OTHER USE
 *    OUTSIDE THE TERMS OF THIS LICENCE. ANYONE ACCESSING THE CODE SHOULD HAVE
 *    THE REQUISITE EXPERTISE TO SECURE THEIR OWN SYSTEM AND DEVICES AND TO
 *    ACCESS AND USE THE CODE FOR REVIEW PURPOSES. YOU BEAR THE RISK OF
 *    ACCESSING AND USING IT. IN PARTICULAR, MEGA BEARS NO LIABILITY FOR ANY
 *    INTERFERENCE WITH OR ADVERSE EFFECT ON YOUR SYSTEM OR DEVICES AS A
 *    RESULT OF YOUR ACCESSING AND USING THE CODE.
 *
 * Read the full and most up-to-date version at:
 *    https://github.com/meganz/webclient/blob/master/LICENCE.md
 *
 * ***************** END MEGA LIMITED CODE REVIEW LICENCE ***************** */

/* eslint-disable no-use-before-define */
var uldl_hold = false;

var ulmanager = {
    ulFaId: 0,
    ulXferPut: null,
    ulDefConcurrency: 8,
    ulIDToNode: Object.create(null),
    ulEventData: Object.create(null),
    isUploading: false,
    ulSetupQueue: false,
    ulCompletingPhase: Object.create(null),
    ulOverStorageQuota: false,
    ulOverStorageQueue: [],
    ulFinalizeQueue: [],
    logger: MegaLogger.getLogger('ulmanager'),

    // Errors megad might return while uploading
    ulErrorMap: Object.freeze({
        "EAGAIN":    -3,
        "EFAILED":   -4,
        "ENOTFOUND": -5,
        "ETOOMANY":  -6,
        "ERANGE":    -7,
        "EEXPIRED":  -8,
        "EKEY":     -14
    }),

    ulStrError: function UM_ulStrError(code) {
        code = parseInt(code);
        var keys = Object.keys(this.ulErrorMap);
        var values = obj_values(this.ulErrorMap);
        return keys[values.indexOf(code)] || code;
    },

    ulHideOverStorageQuotaDialog: function() {
        'use strict';

        $(window).unbind('resize.overQuotaDialog');
        $('.fm-dialog-overlay', 'body').unbind('click.closeOverQuotaDialog');
        window.closeDialog();
    },

    ulShowOverStorageQuotaDialog: function(aFileUpload) {
        'use strict';

        var $dialog = $('.limited-bandwidth-dialog');

        ulQueue.pause();
        this.ulOverStorageQuota = true;

        // clear completed uploads and set over quota for the rest.
        if ($.removeTransferItems) {
            $.removeTransferItems();
        }
        for (var kk = 0; kk < ul_queue.length; kk++) {
            onUploadError(ul_queue[kk], l[1010], l[1010], null, true);
        }

        // Store the entry whose upload ticket failed to resume it later
        if (aFileUpload) {
            this.ulOverStorageQueue.push(aFileUpload);
        }

        // Inform user that upload file request is not available anymore
        if (is_megadrop) {
            mBroadcaster.sendMessage('FileRequest:overquota');
            return; // Disable quota dialog
        }

        if (is_mobile) {
            mobile.overStorageQuota.show();
            return;
        }

        M.safeShowDialog('upload-overquota', () => {
            // Hide loading dialog as from new text file
            loadingDialog.phide();

            $dialog.removeClass('achievements pro3 pro pro-mini no-cards').addClass('uploads exceeded');
            $('.header-before-icon.exceeded', $dialog).text(l[19135]);
            $('.pricing-page.plan .plan-button', $dialog).rebind('click', function() {
                eventlog(99700, true);
                const planNum = $(this).closest('.plan').data('payment');
                if (planNum === pro.ACCOUNT_LEVEL_BUSINESS) {
                    eventlog(501042);
                    open(getAppBaseUrl() + '#registerb');
                }
                else {
                    const events = {
                        4: 501143,
                        1: 501144,
                        2: 501145,
                        3: 501146,
                    };
                    eventlog(events[planNum]);
                    sessionStorage.fromOverquotaPeriod = $(this).parent().data('period') || pro.proplan.period;
                    open(getAppBaseUrl() + '#propay_' + planNum);
                }
                return false;
            });

            $('button.js-close, .fm-dialog-close', $dialog).add($('.fm-dialog-overlay'))
                .rebind('click.closeOverQuotaDialog', () => {

                    ulmanager.ulHideOverStorageQuotaDialog();
                    eventlog(501140);
                });

            // Load the membership plans
            dlmanager.setPlanPrices($dialog);

            eventlog(99699, true);
            return $dialog;
        });
    },

    ulShowBusAdminVerifyDialog(upload) {
        'use strict';
        if (is_mobile) {
            onIdle(() => msgDialog('error', '', api_strerror(ESUBUSERKEYMISSING), l.err_sub_user_key_miss_txt));
        }
        else {
            M.require('businessAcc_js', 'businessAccUI_js').done(() => {
                const businessUI = new BusinessAccountUI();
                businessUI.showVerifyDialog();
            });
        }
        if (upload) {
            onUploadError(upload, api_strerror(ESUBUSERKEYMISSING));
        }
    },

    ulResumeOverStorageQuotaState: function() {
        'use strict';

        if ($('.mega-dialog.limited-bandwidth-dialog').is(':visible')) {

            ulmanager.ulHideOverStorageQuotaDialog();
        }

        ulQueue.resume();
        this.ulOverStorageQuota = false;
        if (ul_queue.length) {
            mega.wsuploadmgr.run();
        }

        if (!this.ulOverStorageQueue.length) {
            if (d) {
                ulmanager.logger.info('ulResumeOverStorageQuotaState: Nothing to resume.');
            }
        }
        else {
            // clear completed uploads and remove over quota state for the rest.
            if ($.removeTransferItems) {
                $.removeTransferItems();
            }
            $("tr[id^='ul_']").removeClass('transfer-error').find('.transfer-status').text(l[7227]);

            this.ulOverStorageQueue.forEach(function(aFileUpload) {
                var ul = aFileUpload.ul;

                if (d) {
                    ulmanager.logger.info('Attempting to resume ' + aFileUpload, [ul], aFileUpload);
                }

                if (ul) {
                    ul.uReqFired = null;
                    ulmanager.ulStart(aFileUpload);
                }
                else if (oIsFrozen(aFileUpload)) {
                    console.warn('Frozen upload while resuming...', aFileUpload);
                }
                else {
                    // re-fire the putnodes api request for which we got the -17
                    console.assert(Object(aFileUpload[0]).a === 'p', 'check this...');
                    ulmanager.ulComplete(...aFileUpload);
                }
            });
        }

        this.ulOverStorageQueue = [];
    },

    getGID: function UM_GetGID(ul) {
        return 'ul_' + (ul && ul.id);
    },

    getEventDataByHandle: function(h) {
        'use strict';

        for (var id in this.ulEventData) {
            if (this.ulEventData[id].h === h) {
                return this.ulEventData[id];
            }
        }

        return false;
    },

    getUploadByID: function(id) {
        'use strict';

        var queue = ul_queue.filter(isQueueActive);
        for (var i = queue.length; i--;) {
            var q = queue[i];

            if (q.id === id || this.getGID(q) === id) {
                return q;
            }
        }

        return false;
    },

    isUploadActive: function(id) {
        'use strict';
        var gid = typeof id === 'object' ? this.getGID(id) : id;
        return document.getElementById(gid) || this.getUploadByID(gid).starttime > 0;
    },

    /**
     * Wait for an upload to finish.
     * @param {Number} aUploadID The unique upload identifier.
     * @return {MegaPromise}
     */
    onUploadFinished: function(aUploadID) {
        'use strict';
        return new Promise((resolve, reject) => {
            var _ev1;
            var _ev2;
            var _ev3;
            if (typeof aUploadID !== 'number' || aUploadID < 8001) {
                return reject(EARGS);
            }
            var queue = ul_queue.filter(isQueueActive);
            var i = queue.length;

            while (i--) {
                if (queue[i].id === aUploadID) {
                    break;
                }
            }

            if (i < 0) {
                // there is no such upload in the queue
                return reject(ENOENT);
            }

            var done = function(id, result) {
                if (id === aUploadID) {
                    mBroadcaster.removeListener(_ev1);
                    mBroadcaster.removeListener(_ev2);
                    mBroadcaster.removeListener(_ev3);

                    // result will be either the node handle for the new uploaded file or an error
                    resolve(result);
                }
            };

            _ev1 = mBroadcaster.addListener('upload:error', done);
            _ev2 = mBroadcaster.addListener('upload:abort', done);
            _ev3 = mBroadcaster.addListener('upload:completion', done);
        });
    },

    /**
     * Hold up an upload until another have finished, i.e. because we have to upload it as a version
     * @param {File} aFile The upload file instance
     * @param {Number} aUploadID The upload ID to wait to finish.
     * @param {Boolean} [aVersion] Whether we're actually creating a version.
     */
    holdUntilUploadFinished: function(aFile, aUploadID, aVersion) {
        'use strict';
        var promise = new MegaPromise();
        var logger = d && new MegaLogger('ulhold[' + aUploadID + '>' + aFile.id + ']', null, this.logger);

        if (d) {
            logger.debug('Waiting for upload %d to finish...', aUploadID, [aFile]);
        }

        this.onUploadFinished(aUploadID).always((h) => {
            if (d) {
                logger.debug('Upload %s finished...', aUploadID, h);
            }

            if (aVersion) {
                if (!M.getNodeByHandle(h)) {
                    var n = fileconflict.getNodeByName(aFile.target, aFile.name);
                    h = n && n.h;

                    if (d) {
                        logger.debug('Seek node gave %s', h, M.getNodeByHandle(h));
                    }
                }

                if (h) {
                    aFile._replaces = h;
                }
            }

            if (d) {
                logger.debug('Starting upload %s...', aFile.id, aFile._replaces, [aFile]);
            }
            ul_queue.push(aFile);
            promise.resolve(aFile, h);
        });

        return promise;
    },

    abortAll: function() {
        'use strict';
        const ulQueue = window.ulQueue;
        const fileUploadInstances = [];

        const destroy = function(task) {
            if ((task = task && task[0] || task || !1).destroy) {
                task.destroy(-0xbeef);
            }
        };

        const abort = (ul, gid, idx) => {
            if (d) {
                ulmanager.logger.info('Aborting ' + gid, ul.name);
            }
            ul.abort = true;
            fileUploadInstances.push([ul.owner, idx]);

            const gp = GlobalProgress[gid];
            if (gp && !gp.paused) {
                gp.paused = true;

                let chunk;
                while ((chunk = gp.working.pop())) {
                    chunk.abort();
                    if (array.remove(ulQueue._pending, chunk, 1)) {
                        console.assert(--ulQueue._running > -1, 'Queue inconsistency on pause[abort]');
                    }
                }
            }
        };

        ulQueue.pause();

        for (let i = ul_queue.length; i--;) {
            const ul = ul_queue[i];
            if (ul.id) {
                const gid = 'ul_' + ul.id;

                if (ulmanager.ulCompletingPhase[gid]) {
                    if (d) {
                        ulmanager.logger.debug('Not aborting %s, it is completing...', gid, ul);
                    }
                }
                else {
                    abort(ul, gid, i);
                }
            }
        }

        ulQueue._queue.forEach(destroy);
        Object.values(ulQueue._qpaused).forEach(destroy);

        for (let i = fileUploadInstances.length; i--;) {
            const [ul, idx] = fileUploadInstances[i];

            if (ul) {
                if (ul.file) {
                    mBroadcaster.sendMessage('upload:abort', ul.file.id, -0xDEADBEEF);
                }
                ul.destroy(-0xbeef);
            }
            ul_queue[idx] = Object.freeze({});
        }

        ulQueue._queue = [];
        ulQueue._qpaused = {};
        ulQueue.resume();
    },

    abort: function UM_abort(gid) {
        'use strict';

        if (gid === null || Array.isArray(gid)) {
            this._multiAbort = 1;

            if (gid) {
                gid.forEach(this.abort.bind(this));
            }
            else {
                this.ulSetupQueue = false;
                M.tfsdomqueue = Object.create(null);
                this.abortAll();
            }

            delete this._multiAbort;
            Soon(M.resetUploadDownload);
        }
        else {
            if (typeof gid === 'object') {
                gid = this.getGID(gid);
            }
            else if (gid[0] !== 'u') {
                return;
            }

            var l = ul_queue.length;
            var FUs = [];
            while (l--) {
                var ul = ul_queue[l];

                if (gid === this.getGID(ul)) {
                    if (ulmanager.ulCompletingPhase[gid]) {
                        if (d) {
                            ulmanager.logger.debug('Not aborting %s, it is completing...', gid, ul);
                        }
                        continue;
                    }
                    if (d) {
                        ulmanager.logger.info('Aborting ' + gid, ul.name);
                    }

                    ul.abort = true;
                    FUs.push([ul.owner, l]);
                }
            }

            ulQueue.pause(gid);
            ulQueue.filter(gid);
            FUs.map(function(o) {
                var ul = o[0];
                var idx = o[1];

                if (ul) {
                    if (ul.file) {
                        mBroadcaster.sendMessage('upload:abort', ul.file.id, -0xDEADBEEF);
                    }
                    ul.destroy();
                }
                ul_queue[idx] = Object.freeze({});
            });
            if (!this._multiAbort) {
                Soon(M.resetUploadDownload);
            }
        }
    },

    restart: function UM_restart(file, reason, xhr) {
        // Upload failed - restarting...
        onUploadError(file, l[20917], reason, xhr);

        // reschedule
        ulQueue.poke(file);
    },

    retry: function UM_retry(file, chunk, reason, xhr) {
        var start = chunk.start;
        var end = chunk.end;
        var cid = String(chunk);
        var altport = !chunk.altport;
        var suffix = chunk.suffix;
        var bytes = suffix && chunk.bytes;

        file.ul_failed = true;
        api_reportfailure(hostname(file.posturl), ulmanager.networkErrorCheck);

        // reschedule

        ulQueue.pause(); // Hmm..
        if (!file.__umRetries) {
            file.__umRetries = 1;
        }
        if (!file.__umRetryTimer) {
            file.__umRetryTimer = {};
        }
        var tid = ++file.__umRetries;
        file.__umRetryTimer[tid] = setTimeout(function() {
            // Could become frozen {} after this timeout.
            if (!file.id) {
                return;
            }

            var q = file.__umRetryTimer || {};
            delete q[tid];

            if (reason.indexOf('IO failed') === -1) {
                tid = --file.__umRetries;
            }

            if (tid < 34) {
                var newTask = new ChunkUpload(file, start, end, altport);
                if (suffix) {
                    newTask.suffix = suffix;
                    newTask.bytes = bytes;
                }
                ulQueue.pushFirst(newTask);
            }
            else {
                if (d) {
                    ulmanager.logger.error('Too many retries for ' + cid);
                }
                var fileName = htmlentities(file.name);
                var errorstr = reason.match(/"([^"]+)"/);

                if (errorstr) {
                    errorstr = errorstr.pop();
                }
                else {
                    errorstr = reason.substr(0, 50) + '...';
                }
                if (!file.ulSilent) {
                    $('#ul_' + file.id + ' .transfer-status').text(errorstr);
                }
                msgDialog('warninga', l[1309], l[1498] + ': ' + fileName, reason);
                ulmanager.abort(file);
            }
            if (!$.len(q)) {
                delete file.__umRetryTimer;
                ulQueue.resume();
            }
        }, 950 + Math.floor(Math.random() * 2e3));

        // "Upload failed - retrying"
        onUploadError(file, l[20918],
            reason.substr(0, 2) === 'IO' ? 'IO Failed' : reason,
            xhr);

        chunk.done(); /* release worker */
    },

    isReady: function UM_isReady(Task) /* unused */ {
        return !Task.file.paused || Task.__retry;
    },

    /**
     *  Check if the network is up!
     *
     *  This function is called when an error happen at the upload
     *  stage *and* it is anything *but* network issue.
     */
    networkErrorCheck: function UM_network_error_check() {
        var i = 0;
        var ul = {
            error: 0,
            retries: 0
        };
        var dl = {
            error: 0,
            retries: 0
        }

        for (i = 0; i < dl_queue.length; i++) {
            if (dl_queue[i] && dl_queue[i].dl_failed) {
                if (d) {
                    dlmanager.logger.info('Failed download:',
                        dl_queue[i].zipname || dl_queue[i].n,
                        'Retries: ' + dl_queue[i].retries, dl_queue[i].zipid);
                }
                dl.retries += dl_queue[i].retries;
                if (dl_queue[i].retries++ === 5) {
                    /**
                     *  The user has internet yet the download keeps failing
                     *  we request the server a new download url but unlike in upload
                     *  this is fine because we resume the download
                     */
                    dlmanager.newUrl(dl_queue[i]);
                    dl.retries = 0;
                }
                dl.error++;
            }
        }

        for (i = 0; i < ul_queue.length; i++) {
            if (ul_queue[i] && ul_queue[i].ul_failed) {
                ul.retries += ul_queue[i].retries;
                if (ul_queue[i].retries++ === 10) {
                    /**
                     *  Worst case ever. The client has internet *but*
                     *  this upload keeps failing in the last 10 minutes.
                     *
                     *  We request a new upload URL to the server, and the upload
                     *  starts from scratch
                     */
                    if (d) {
                        ulmanager.logger.error("restarting because it failed", ul_queue[i].retries, 'times', ul);
                    }
                    ulmanager.restart(ul_queue[i], 'peer-err');
                    ul_queue[i].retries = 0;
                }
                ul.error++;
            }
        }

        /**
         *  Check for error on upload and downloads
         *
         *  If we have many errors (average of 3 errors)
         *  we try to shrink the number of connections to the
         *  server to see if that fixes the problem
         */
        $([ul, dl]).each(function(i, k) {
                var ratio = k.retries / k.error;
                if (ratio > 0 && ratio % 8 === 0) {
                    // if we're failing in average for the 3rd time,
                    // lets shrink our upload queue size
                    if (d) {
                        var mng = (k === ul ? ulmanager : dlmanager);
                        mng.logger.warn(' --- SHRINKING --- ');
                    }
                    var queue = (k === ul ? ulQueue : dlQueue);
                    queue.shrink();
                }
            });
    },

    ulFinalize: function UM_ul_finalize(file, target) {
        if (d) {
            ulmanager.logger.info(file.name, "ul_finalize", file.target, target);
        }
        if (file.repair) {
            file.target = target = M.RubbishID;
        }
        target = target || file.target || M.RootID;

        ASSERT(file.filekey, "*** filekey is missing ***");

        var n = {
            name: file.name,
            hash: file.hash,
            k: file.filekey
        };

        if (d) {
            // if it's set but undefined, the file-conflict dialog failed to properly locate a file/node...
            console.assert(file._replaces || !("_replaces" in file), 'Unexpected file versioning state...');
        }

        if (file._replaces) {
            const r = M.getNodeByHandle(file._replaces);

            if (r.fav) {
                n.fav = r.fav;
            }
            if (r.sen) {
                n.sen = r.sen;
            }
            if (r.lbl) {
                n.lbl = r.lbl;
            }
            if (r.des) {
                n.des = r.des;
            }
            if (r.tags) {
                n.tags = r.tags;
            }
        }

        var req_type = 'p';
        var dir = target;

        // Put to public upload folder
        if (is_megadrop) {
            req_type = 'pp';
            target = mega.fileRequestUpload.getUploadPageOwnerHandle();
            dir = mega.fileRequestUpload.getUploadPagePuHandle();
        }
        else if (file.xput) {
            req_type = 'xp';
        }

        var req = {
            v: 3,
            a: req_type,
            t: dir,
            n: [{
                t: 0,
                h: file.response,
                a: ab_to_base64(crypto_makeattr(n)),
                k: req_type === 'xp' ? a32_to_base64(file.filekey) : target.length === 11
                    ? base64urlencode(encryptto(target, a32_to_str(file.filekey)))
                    : a32_to_base64(encrypt_key(u_k_aes, file.filekey))
            }],
            i: requesti
        };

        M.setPitag(req, 'U', file);

        var ctx = {
            file: file,
            target: target,
            size: file.size,
            faid: file.faid,
            ul_queue_num: file.pos,
        };

        if (file._replaces) {
            req.n[0].ov = file._replaces;
        }
        if (file.faid) {
            req.n[0].fa = api_getfa(file.faid);
        }
        if (file.ddfa) {
            // fa from deduplication
            req.n[0].fa = file.ddfa;
        }

        if (req.t === M.InboxID && self.vw) {
            req.vw = 1;
        }

        queueMicrotask(() => {
            for (var k in M.tfsdomqueue) {
                if (k[0] === 'u') {
                    addToTransferTable(k, M.tfsdomqueue[k], 1);
                    delete M.tfsdomqueue[k];
                    break;
                }
            }
        });

        if (d) {
            ulmanager.logger.info("Enqueueing put-nodes for '%s' into %s; %s", file.name, target, file.owner, req);
            console.assert(file.owner && file.owner.gid, 'No assoc owner..');
        }

        if (file.owner) {
            this.ulCompletingPhase[file.owner.gid] = Date.now();
        }

        if (this.ulFinalizeQueue.push([n, req, ctx]) > ulQueue.maxActiveTransfers || ulQueue.isFinalising()) {
            this.ulCompletePending();
        }
        else {
            delay('ul.finalize:dsp', () => this.ulCompletePending(), 4e3);
        }
    },

    // FIXME: do we have by-fingerprint deduplication for identical files in batch uploads
    //        upload only once, complete to all target locations?
    ulStart: function UM_ul_start(File) {
        'use strict';

        if (!File.file) {
            return false;
        }

        return ulmanager.ulUpload(File);
    },

    ulUpload: function UM_ul_upload(File) {
        var i;
        var file = File.file;

        if (file.repair) {
            var ul_key = file.repair;

            file.ul_key = [
                ul_key[0] ^ ul_key[4],
                ul_key[1] ^ ul_key[5],
                ul_key[2] ^ ul_key[6],
                ul_key[3] ^ ul_key[7],
                ul_key[4],
                ul_key[5]
            ];
        }
        else if (!file.ul_key) {
            file.ul_key = Array(6);
            // generate ul_key and nonce
            for (i = 6; i--;) {
                file.ul_key[i] = rand(0x100000000);
            }
        }

        file.ul_lastProgressUpdate = 0;
        file.ul_macs = Object.create(null);
        file.ul_keyNonce = JSON.stringify(file.ul_key);
        file.ul_aes = new sjcl.cipher.aes([
            file.ul_key[0], file.ul_key[1], file.ul_key[2], file.ul_key[3]
        ]);

        if (!file.faid && !window.omitthumb) {
            var img = is_image(file.name);
            var vid = is_video(file.name);

            if (img || vid) {
                file.faid = ++ulmanager.ulFaId;

                createthumbnail(
                    file,
                    file.ul_aes,
                    file.faid,
                    null, null,
                    {raw: img !== 1 && img, isVideo: vid}
                ).catch(nop);

                var uled = ulmanager.ulEventData[file.id];
                if (uled) {
                    if (vid) {
                        if (d) {
                            console.debug('Increasing expected file attributes for the chat to be aware...');
                            console.assert(uled.efa === 1, 'Check this...');
                        }
                        uled.efa += 2;
                    }
                    uled.faid = file.faid;
                }
            }
        }

        if (!file.ulSilent) {
            M.ulstart(file);
        }
        if (file.done_starting) {
            file.done_starting();
        }

        mega.wsuploadmgr.upload(file);
    },

    ulComplete(payload, ctx) {
        'use strict';
        api.screq(payload)
            .catch(echo)
            .then((res) => {
                const result = Number(res.result || res) | 0;
                if (result < 0) {
                    res = freeze({...res, payload, result});
                }

                ulmanager.ulCompletePending2(res, ctx);
            })
            .catch(reportError);
    },

    ulCompletePending: function() {
        'use strict';
        const self = this;
        delay.cancel('ul.finalize:dsp');

        // Ensure no -3s atm..
        api.req({a: 'ping'}).always(function dsp() {
            // @todo per target folder rather!
            if ($.getExportLinkInProgress) {
                if (d) {
                    self.logger.debug('Holding upload(s) until link-export completed...');
                }
                mBroadcaster.once('export-link:completed', () => onIdle(dsp));
                return;
            }

            const q = self.ulFinalizeQueue;
            self.ulFinalizeQueue = [];

            for (let i = q.length; i--;) {
                const [n, req, ctx] = q[i];

                if (req.a === 'xp') {
                    if (!ulmanager.ulXferPut) {
                        ulmanager.ulXferPut = Object.create(null);
                    }
                    if (!ulmanager.ulXferPut[req.t]) {
                        ulmanager.ulXferPut[req.t] = [[], []];
                    }
                    ulmanager.ulXferPut[req.t][0].push(ctx);
                    ulmanager.ulXferPut[req.t][1].push(...req.n);
                    continue;
                }

                const sn = M.getShareNodesSync(req.t, null, true);
                if (sn.length) {
                    req.cr = crypto_makecr([n], sn, false);
                    req.cr[1][0] = req.n[0].h;
                }

                ulmanager.ulComplete(req, ctx);
            }

            if (ulmanager.ulXferPut) {
                const options = {channel: 7, apipath: 'https://bt7.api.mega.co.nz/'};

                api.yield(options.channel)
                    .then(() => {
                        const payload = [];
                        const {ulXferPut} = ulmanager;

                        for (const t in ulXferPut) {
                            payload.push({a: 'xp', v: 3, t, n: [...ulXferPut[t][1]]});
                        }
                        ulmanager.ulXferPut = null;

                        return api.req(payload, options)
                            .then(({responses}) => {
                                let idx = 0;
                                console.assert(payload.length === responses.length, `Invalid xp-response(s)`);
                                for (const t in ulXferPut) {
                                    const {f} = responses[idx++];
                                    const ctx = ulXferPut[t][0];

                                    console.assert(f.length === ctx.length, 'xp-ctx mismatch.');
                                    for (let i = f.length; i--;) {
                                        const n = f[i];
                                        if (window.is_transferit) {
                                            T.core.populate([n], ctx[i].file.xput);
                                        }
                                        ulmanager.ulCompletePending2({st: -1, result: 1, handle: n.h}, ctx[i]);
                                    }
                                }

                                // @todo improve error handling..
                            });
                    })
                    .catch(tell);
            }
        });
    },

    ulCompletePending2: function UM_ul_completepending2(res, ctx) {
        'use strict';

        if (d) {
            ulmanager.logger.info("ul_completepending2", res, ctx);
        }
        const ulid = 'ul_' + ctx.file.id;

        if (typeof res === 'object' && 'st' in res) {
            const h = res.handle;

            console.assert(res.result !== 0 || String(ctx.target).length === 11, 'unexpected upload completion reply.');

            if (ctx.faid && h) {
                // @todo should we fire 'pp' in v2 mode for this to work?..
                api_attachfileattr(h, ctx.faid);
            }

            if (ul_queue[ctx.ul_queue_num]) {
                ulmanager.ulIDToNode[ulmanager.getGID(ul_queue[ctx.ul_queue_num])] = h || ctx.target;
                M.ulcomplete(ul_queue[ctx.ul_queue_num], h || false, ctx.faid);
            }
            else if (d) {
                ulmanager.logger.warn('Unknown upload on #%s, %s', ctx.ul_queue_num, ctx.file.owner, [ctx.file]);
            }

            if (MediaInfoLib.isFileSupported(h)) {
                const n = M.getNodeByHandle(h);
                var file = ctx.file;
                var done = function() {
                    // get thumb/prev created if it wasn't already, eg. an mp4 renamed as avi/mov/etc
                    if (is_video(n) === 1 && String(n.fa).indexOf(':0*') < 0 && !Object(file).__getVTNPid) {
                        var aes = new sjcl.cipher.aes([
                            n.k[0] ^ n.k[4], n.k[1] ^ n.k[5], n.k[2] ^ n.k[6], n.k[3] ^ n.k[7]
                        ]);
                        createnodethumbnail(n.h, aes, n.h, null, {isVideo: true}, null, file);
                    }
                };

                if (String(n.fa).indexOf(':8*') < 0 && file.size > 16) {
                    MediaAttribute(n).parse(file).then(done).catch(function(ex) {
                        if (d) {
                            console.warn('MediaAttribute', ex);
                        }
                        mBroadcaster.sendMessage('fa:error', h, ex, 0, 1);
                    });
                }
                else {
                    done();
                }
            }

            if (ctx.file.owner) {
                ctx.file.ul_failed = false;
                ctx.file.retries = 0;
            }
        }
        else {
            let inShareOQ = false;
            const {payload, result} = res;

            res = result;
            if (res === EOVERQUOTA && payload.a === 'p') {
                if (sharer(ctx.target)) {
                    inShareOQ = true;
                }
                else {
                    return ulmanager.ulShowOverStorageQuotaDialog([payload, ctx]);
                }
            }
            var ul = ul_queue[ctx.ul_queue_num];

            if (!ul && res === EACCESS) {
                ulmanager.logger.warn('This upload was already aborted, resorting to context...', ctx.file);
                ul = ctx.file;
            }

            M.ulerror(ul, inShareOQ ? ESHAREROVERQUOTA : res);

            if (res !== EOVERQUOTA && res !== EGOINGOVERQUOTA) {
                console.warn(`Unexpected upload completion server response (${res} @ ${hostname(ctx.file.posturl)})`);
            }
        }
        delete ulmanager.ulCompletingPhase[ulid];

        if (ctx.file.owner) {
            ctx.file.owner.destroy();
        }
        else if (!oIsFrozen(ctx.file)) {
            oDestroy(ctx.file);
        }
    },

    ulDeDuplicate: function UM_ul_deduplicate(File, identical, mNode) {
        var n;
        var uq = File.ul;

        const skipIdentical = (fmconfig.ul_skipIdentical | 0) || File.file.chatid;
        if (identical && skipIdentical) {
            // If attaching to chat apply apps behaviour and use the existing node.
            n = identical;
        }
        else if ((!M.h[uq.hash] || !M.h[uq.hash].size) && !identical) {
            return ulmanager.ulStart(File);
        }
        else if (M.h[uq.hash]) {
            if (!(n = mNode)) {
                const [h] = M.h[uq.hash];
                n = M.getNodeByHandle(h);
            }

            if (!identical && n && uq.size !== n.s) {
                if (d) {
                    ulmanager.logger.warn('fingerprint clash!', n.h, [n], File);
                }
                eventlog(99749, JSON.stringify([1, parseInt(uq.size), parseInt(n.s)]));
                return ulmanager.ulStart(File);
            }
            if (skipIdentical) {
                identical = n;
            }
        }
        if (!n) {
            return ulmanager.ulStart(File);
        }
        if (d) {
            ulmanager.logger.info('[%s] deduplicating file %s', n.h, File.file.name, n);
        }
        api_req({
            a: 'g',
            g: 1,
            ssl: use_ssl,
            n: n.h
        }, {
            uq: uq,
            n: n,
            skipfile: skipIdentical && identical,
            callback: function(res, ctx) {
                if (d) {
                    ulmanager.logger.info('[%s] deduplication result:', ctx.n.h, res.e, res, ctx.skipfile);
                }
                if (oIsFrozen(File)) {
                    ulmanager.logger.warn('Upload aborted on deduplication...', File);
                }
                else if (res.e === ETEMPUNAVAIL && ctx.skipfile) {
                    ctx.uq.repair = ctx.n.k;
                    ulmanager.ulStart(File);
                }
                else if (typeof res === 'number' || res.e) {
                    ulmanager.ulStart(File);
                }
                else if (ctx.skipfile) {
                    if (!(uq.skipfile = !File.file.chatid)) {
                        const eventData = ulmanager.ulEventData[File.file.id];
                        if (eventData) {
                            if (d) {
                                ulmanager.logger.info('[%s] Cleaning efa on deduplication ' +
                                    'for the chat to be aware...', ctx.n.h, eventData.efa);
                            }
                            eventData.efa = 0;
                        }
                    }
                    ulmanager.ulIDToNode[ulmanager.getGID(uq)] = ctx.n.h;
                    M.ulcomplete(uq, ctx.n.h);
                    File.file.ul_failed = false;
                    File.file.retries = 0;
                    File.file.done_starting();
                }
                else {
                    File.file.filekey = ctx.n.k;
                    File.file.response = ctx.n.h;
                    File.file.ddfa = ctx.n.fa;
                    File.file.path = ctx.uq.path;
                    File.file.name = ctx.uq.name;

                    var eventData = ulmanager.ulEventData[File.file.id];
                    if (eventData) {
                        var efa = ctx.n.fa ? String(ctx.n.fa).split('/').length : 0;

                        if (eventData.efa !== efa) {
                            if (d) {
                                ulmanager.logger.info('[%s] Fixing up efa on deduplication ' +
                                    'for the chat to be aware... (%s != %s)', ctx.n.h, eventData.efa, efa);
                            }
                            eventData.efa = efa;
                        }
                    }

                    // File.file.done_starting();
                    ulmanager.ulFinalize(File.file);
                }
            }
        });
    },

    ulIdentical: function UM_ul_Identical(file) {
        return M.getChildren(file.target, (n) => {
            if (file.size === n.s
                && file.name === n.name
                && file.hash === n.hash) {

                return n;
            }
        });
    },

    /**
     * Initialize upload on fingerprint creation.
     *
     * @param {Object}  aFileUpload  FileUpload instance
     * @param {Object}  aFile        File API interface instance
     * @param {Boolean} [aForce]     Ignore locking queue.
     */
    ulSetup: function ulSetup(aFileUpload, aFile, aForce) {
        'use strict';

        var dequeue = function ulSetupDQ() {
            if (ulmanager.ulSetupQueue.length) {
                var upload = ulmanager.ulSetupQueue.shift();
                onIdle(ulmanager.ulSetup.bind(ulmanager, upload, upload.file, true));
            }
            else {
                ulmanager.ulSetupQueue = false;
            }
        };

        if (!aFileUpload || !aFile || aFileUpload.file !== aFile || !aFile.hash) {
            if (d) {
                console.warn('Invalid upload instance, cancelled?', oIsFrozen(aFileUpload), aFileUpload, aFile);
            }
            return onIdle(dequeue);
        }

        if (!aForce) {
            if (this.ulSetupQueue) {
                return this.ulSetupQueue.push(aFileUpload);
            }
            this.ulSetupQueue = [];
        }

        var hashNode;
        var startUpload = function _startUpload() {
            onIdle(dequeue);

            var identical = ulmanager.ulIdentical(aFile);
            ulmanager.logger.info(aFile.name, "fingerprint", aFile.hash, M.h[aFile.hash], identical);

            if (M.h[aFile.hash] && M.h[aFile.hash].size || identical) {
                ulmanager.ulDeDuplicate(aFileUpload, identical, hashNode);
            }
            else {
                ulmanager.ulStart(aFileUpload);
            }
        };

        if (is_megadrop) {
            return startUpload();
        }

        var promises = [];

        if (!M.getChildren(aFile.target)) {
            promises.push(dbfetch.get(aFile.target));
        }

        const [h] = M.h[aFile.hash] || [];
        if (!M.getNodeByHandle(h)) {
            promises.push(dbfetch.hash(aFile.hash).then(node => (hashNode = node)));
        }

        if (promises.length) {
            Promise.allSettled(promises).then(startUpload);
        }
        else {
            startUpload();
        }
    },

    /**
     * Abort and Clear items in upload list those are targeting a deleted folder.
     * This is triggered by `d` action packet.
     *
     * @param {String|Array} handles  handle(s) of deleted node(s)
     */
    ulClearTargetDeleted: function(handles) {
        'use strict';

        if (!ul_queue.length) {
            return false;
        }
        if (!Array.isArray(handles)) {
            handles = [handles];
        }

        var toAbort = [];
        for (var i = ul_queue.length; i--;) {
            var ul = isQueueActive(ul_queue[i]) && ul_queue[i] || false;

            if (ul && handles.indexOf(ul.target) !== -1) {
                var gid = ulmanager.getGID(ul);
                toAbort.push(gid);
                $('.transfer-status', $('#' + gid).addClass('transfer-error')).text(l[20634]);
                tfsheadupdate({e: gid});
                mega.tpw.errorDownloadUpload(mega.tpw.UPLOAD, ul, l[20634]);
            }
        }

        if (toAbort.length) {
            eventlog(99726);
            ulmanager.abort(toAbort);
        }
    }
};


class UploadQueue extends Array {
    push(...args) {
        if (!self.u_k_aes && !self.is_transferit) {
            if (!self.mkwarn) {
                self.mkwarn = 1;
                tell(l[8853]);
            }
            return;
        }
        const pos = super.push(...args) - 1;
        const file = this[pos];

        file.pos = pos;
        ulQueue.poke(file);

        return pos + 1;
    }
}

function ChunkUpload(file, start, end, altport) {
    console.error('@deprecated');
}

function FileUpload(file) {
    this.file = file;
    this.ul = file;
    this.gid = 'ul_' + this.ul.id;
    this[this.gid] = !0;
    GlobalProgress[this.gid] = {
        working: []
    };
}

FileUpload.prototype.toString = function() {
    return "[FileUpload " + this.gid + "]";
};

FileUpload.prototype.destroy = function(mul) {
    'use strict';

    if (d) {
        ulmanager.logger[this.file ? 'group' : 'warn'](`Destroying ${this} (%s)`, this.file && this.file.name || 'n/a');
    }
    if (!this.file) {
        return;
    }

    if (!GlobalProgress[this.gid]) {
        // xxx: if !this.file wasn't meet, this should not be reached...
        ulmanager.logger.warn(`Unexpected state; Weak GP-record for ${this}`, [this]);
    }

    ASSERT(this.file.owner === this, 'Invalid FileUpload Owner...');
    window.ulQueue.poke(this.file, mul === -0xbeef ? mul : 0xdead);
    if (this.file.done_starting) {
        this.file.done_starting();
    }
    delete GlobalProgress[this.gid];

    if (this.file.wsfu) {
        this.file.wsfu.destroy();
    }
    if (d) {
        const tr = document.getElementById(ulmanager.getGID(this.file));
        ulmanager.logger.debug(`${this} DOM State: ${tr ? tr.classList.value : 'INVALID'}`);
        queueMicrotask(() => ulmanager.logger.groupEnd());
    }
    oDestroy(this.file);
    oDestroy(this);
};

FileUpload.prototype.run = function(done) {
    var file = this.file;
    var self = this;

    file.abort = false; /* fix in case it restarts from scratch */
    file.ul_failed = false;
    file.retries = 0;
    file.xr = dlmanager.mGetXR();
    file.ul_lastreason = file.ul_lastreason || 0;

    if (!(file.ulSilent || file.xput)) {
        const domNode = document.getElementById(`ul_${file.id}`);

        if (ulmanager.ulStartingPhase || !domNode) {
            done();
            ASSERT(0, "This shouldn't happen");
            return ulQueue.pushFirst(this);
        }
        domNode.classList.add('transfer-initiliazing');

        const transferStatus = domNode.querySelector('.transfer-status');
        if (transferStatus) {
            transferStatus.textContent = l[1042];
        }
    }

    if (!GlobalProgress[this.gid].started) {
        GlobalProgress[this.gid].started = true;
    }

    if (d) {
        ulmanager.logger.group(`Starting upload ${this} (%s)`, file.name);
    }

    var started = false;
    file.done_starting = function() {
        if (started) {
            return;
        }
        started = true;
        ulmanager.ulStartingPhase = false;
        delete file.done_starting;

        if (d) {
            queueMicrotask(() => ulmanager.logger.groupEnd());
        }
        file = self = false;
        done();
    };

    getFingerprint(file).then(function(result) {
        if (!(file && self.file)) {
            ulmanager.logger.info('Fingerprint generation finished, but the upload was canceled meanwhile...');
        }
        else if (file.hash === result.hash) {
            // Retrying.
            setTimeout(ulmanager.ulStart.bind(ulmanager, self), 950 + Math.floor(Math.random() * 4e3));
        }
        else {
            file.ts = result.ts;
            file.hash = result.hash;
            ulmanager.ulSetup(self, file);
        }
    }).catch(function(ex) {
        // TODO: Improve further what error message we do show to the user.
        var error = ex.name !== 'Error' && ex.name || ex;

        eventlog(99727, JSON.stringify([1, String(error)]));

        if (error === 0x8052000e) {
            // File is locked
            error = l[7399];
        }
        else if (error === 'SecurityError') {
            // "Access denied"
            error = l[1667];
        }
        else {
            // "Read error"
            error = l[1677];
        }

        if (d) {
            ulmanager.logger.error('FINGERPRINT ERROR ("%s")', error, file.name, file.size, ex.message, [ex]);
        }

        if (file && self.file) {
            onUploadError(file, error);

            if (page.substr(0, 11) === 'filerequest') {
                mBroadcaster.sendMessage('upload:error', file.id, error);
                return;
            }

            var that = self;
            ulmanager.abort(file);
            that.destroy();
        }
    });
};

function isQueueActive(q) {
    return typeof q.id !== 'undefined';
}

var ulQueue = new TransferQueue(function _workerUploader(task, done) {
    if (d && d > 1) {
        ulQueue.logger.info('worker_uploader', task, done);
    }
    task.run(done);
}, 2, 'uploader');

ulQueue.poke = function(file, meth) {
    'use strict';
    let quick = false;
    if (meth === -0xbeef) {
        quick = true;
        meth = 0xdead;
    }
    if (file.owner) {
        var gid = ulmanager.getGID(file);

        file.retries = 0;
        file.sent = 0;
        file.progress = Object.create(null);
        file.posturl = "";
        file.uReqFired = null;
        file.abort = true;

        if (!quick) {
            ulQueue.pause(gid);
            ulQueue.filter(gid);
        }

        if (file.__umRetryTimer) {
            var t = file.__umRetryTimer;
            for (var i in t) {
                if (t.hasOwnProperty(i)) {
                    clearTimeout(t[i]);
                }
            }

            if (!quick) {
                ulQueue.resume();
            }
        }
        if (file.wsfu) {
            file.wsfu.destroy();
            file.wsfu = null;
        }
        if (!meth) {
            meth = 'pushFirst';
        }

        delete file.__umRetries;
        delete file.__umRetryTimer;
    }

    if (meth !== 0xdead) {
        if (!meth && file.ulSilent && file.size === 0) {
            meth = 'pushFirst';
        }

        file.sent = 0;
        file.progress = Object.create(null);
        file.owner = new FileUpload(file);
        ulQueue[meth || 'push'](file.owner);
    }
};

ulQueue.validateTask = function(pzTask) {
    'use strict';

    return pzTask instanceof FileUpload
        && (pzTask.file.xput || pzTask.file.ulSilent || document.getElementById(`ul_${pzTask.file.id}`));
};

ulQueue.canExpand = function(max) {
    max = max || this.maxActiveTransfers;
    return !is_mobile && this._running < max;
};

// If on mobile, there's only 1 upload at a time and the desktop calculation below fails
Object.defineProperty(ulQueue, 'maxActiveTransfers', {
    // eslint-disable-next-line strict
    get: self.is_mobile ? () => 1 : self.is_transferit ? () => ulmanager.ulDefConcurrency << 2
        : function() {
            return Math.min(Math.floor(M.getTransferTableLengths().size / 1.6), 36);
        }
});

mBroadcaster.once('startMega', function _setupEncrypter() {
    'use strict';
    var encrypter = CreateWorkers('encrypter.js', function(context, e, done) {
        const {macs} = context;

        // target byteOffset as defined at CreateWorkers()
        var offset = e.target.byteOffset;// || context.start;

        if (typeof e.data === 'string') {
            if (e.data[0] === '[') {
                macs[offset] = JSON.parse(e.data);
            }
            else {
                encrypter.logger.info('WORKER:', e.data);
            }
        }
        else {
            context.bytes = new Uint8Array(e.data.buffer || e.data);
            done();
        }
    });

    ulmanager.logger.options.levelColors = {
        'ERROR': '#fe1111',
        'DEBUG': '#0000ff',
        'WARN':  '#C25700',
        'INFO':  '#44829D',
        'LOG':   '#000044'
    };
    Object.defineProperty(window, 'Encrypter', { value: encrypter });
});

var ul_queue = new UploadQueue();

/* ***************** BEGIN MEGA LIMITED CODE REVIEW LICENCE *****************
 *
 * Copyright (c) 2016 by Mega Limited, Auckland, New Zealand
 * All rights reserved.
 *
 * This licence grants you the rights, and only the rights, set out below,
 * to access and review Mega's code. If you take advantage of these rights,
 * you accept this licence. If you do not accept the licence,
 * do not access the code.
 *
 * Words used in the Mega Limited Terms of Service [https://mega.nz/terms]
 * have the same meaning in this licence. Where there is any inconsistency
 * between this licence and those Terms of Service, these terms prevail.
 *
 * 1. This licence does not grant you any rights to use Mega's name, logo,
 *    or trademarks and you must not in any way indicate you are authorised
 *    to speak on behalf of Mega.
 *
 * 2. If you issue proceedings in any jurisdiction against Mega because you
 *    consider Mega has infringed copyright or any patent right in respect
 *    of the code (including any joinder or counterclaim), your licence to
 *    the code is automatically terminated.
 *
 * 3. THE CODE IS MADE AVAILABLE "AS-IS" AND WITHOUT ANY EXPRESS OF IMPLIED
 *    GUARANTEES AS TO FITNESS, MERCHANTABILITY, NON-INFRINGEMENT OR OTHERWISE.
 *    IT IS NOT BEING PROVIDED IN TRADE BUT ON A VOLUNTARY BASIS ON OUR PART
 *    AND YOURS AND IS NOT MADE AVAILABE FOR CONSUMER USE OR ANY OTHER USE
 *    OUTSIDE THE TERMS OF THIS LICENCE. ANYONE ACCESSING THE CODE SHOULD HAVE
 *    THE REQUISITE EXPERTISE TO SECURE THEIR OWN SYSTEM AND DEVICES AND TO
 *    ACCESS AND USE THE CODE FOR REVIEW PURPOSES. YOU BEAR THE RISK OF
 *    ACCESSING AND USING IT. IN PARTICULAR, MEGA BEARS NO LIABILITY FOR ANY
 *    INTERFERENCE WITH OR ADVERSE EFFECT ON YOUR SYSTEM OR DEVICES AS A
 *    RESULT OF YOUR ACCESSING AND USING THE CODE.
 *
 * Read the full and most up-to-date version at:
 *    https://github.com/meganz/webclient/blob/master/LICENCE.md
 *
 * ***************** END MEGA LIMITED CODE REVIEW LICENCE ***************** */

// Keep a record of active transfers.
var GlobalProgress = Object.create(null);
var gfsttfbhosts = Object.create(null);
var __ccXID = 0;

if (localStorage.aTransfers) {
    onIdle(function() {
        'use strict';
        var data = {};
        var now = Date.now();
        try {
            data = JSON.parse(localStorage.aTransfers);
        }
        catch (e) {}
        for (var r in data) {
            // Let's assume there was a system/browser crash...
            if ((now - data[r]) > 86400000) {
                delete data[r];
            }
        }
        if (!$.len(data)) {
            delete localStorage.aTransfers;
        }
        else {
            localStorage.aTransfers = JSON.stringify(data);
        }
    });
}

function ClassChunk(task) {
    this.task = task;
    this.dl = task.download;
    this.url = task.url;
    this.size = task.size;
    this.io = task.download.io;
    this.done = false;
    this.avg = [0, 0];
    this.gid = task.file.gid;
    this.xid = this.gid + "_" + (++__ccXID);
    this.failed = false;
    this.altport = false;
    // this.backoff  = 1936+Math.floor(Math.random()*2e3);
    this.lastPing = Date.now();
    this.lastUpdate = Date.now();
    this.Progress = GlobalProgress[this.gid];
    this.Progress.dl_xr = this.Progress.dl_xr || dlmanager.mGetXR(); // global download progress
    this.Progress.speed = this.Progress.speed || 1;
    this.Progress.size = this.Progress.size || (this.dl.zipid ? Zips[this.dl.zipid].size : this.io.size);
    this.Progress.dl_lastprogress = this.Progress.dl_lastprogress || 0;
    this.Progress.dl_prevprogress = this.Progress.dl_prevprogress || this.dl.byteOffset || 0;
    this.Progress.data[this.xid] = [0, task.size];
    this[this.gid] = !0;
}

ClassChunk.prototype.toString = function() {
    return "[ClassChunk " + this.xid + "]";
};

ClassChunk.prototype.abort = function() {
    if (this.oet) {
        clearTimeout(this.oet);
    }
    if (this.xhr) {
        if (d) {
            dlmanager.logger.log(this + " ttfb@%s: %sms", this.xhr._host, this.xhr._ttfb);
        }
        if (!(gfsttfbhosts[this.xhr._host] > 5000) && this.xhr._ttfb > 5000) {
            api_req({a: 'log', e: 99671, m: 'ttfb:' + this.xhr._ttfb + '@' + this.xhr._host});
        }
        gfsttfbhosts[this.xhr._host] = this.xhr._ttfb;
        this.xhr.abort(this.xhr.ABORT_CLEANUP);
    }
    if (this.Progress) {
        array.remove(this.Progress.working, this, 1);
    }
    delete this.xhr;
};

// destroy
ClassChunk.prototype.destroy = function() {
    if (d) {
        dlmanager.logger.info('Destroying ' + this);
    }
    this.abort();
    oDestroy(this);
};

// shouldIReportDone
ClassChunk.prototype.shouldIReportDone = function(report_done) {
    var pbx = this.Progress.data[this.xid];
    if (!pbx) {
        return;
    }

    if (!report_done) {
        report_done = !this.done && dlQueue.canExpand()
            && (pbx[1] - pbx[0]) / this.Progress.speed <= dlmanager.dlDoneThreshold;
    }

    if (report_done) {
        if (d) {
            dlmanager.logger.info(this + ' reporting done() earlier to start another download.');
        }
        this.done = true;
        dlQueue.expand();
        dlmanager.preFetchDownloadTickets(this.dl.pos);
    }

    return report_done;
};

// updateProgress
ClassChunk.prototype.updateProgress = function(force) {
    if (uldl_hold) {
        // do not update the UI
        return false;
    }

    // var r = this.shouldIReportDone(force === 2);
    var r = force !== 2 ? this.shouldIReportDone() : 0x7f;
    if (this.Progress.dl_lastprogress + 200 > Date.now() && !force) {
        // too soon
        return false;
    }

    var _data = this.Progress.data;
    var _progress = this.Progress.done;
    for (var i in _data) {
        if (_data.hasOwnProperty(i)) {
            _progress += _data[i][0];
        }
    }

    if (this.dl.byteOffset) {
        _progress += this.dl.byteOffset;
    }

    this.dl.onDownloadProgress(
            this.dl.dl_id,
            Math.min(99, Math.floor(_progress / this.Progress.size * 100)),
            _progress, // global progress
            this.Progress.size, // total download size
            this.Progress.speed = this.Progress.dl_xr.update(_progress - this.Progress.dl_prevprogress), // speed
            this.dl.pos, // this download position
            force && force !== 2
        );

    this.Progress.dl_prevprogress = _progress;
    this.Progress.dl_lastprogress = Date.now();

    if (force !== 2 && dlmanager.isOverQuota) {
        dlmanager.onNolongerOverquota();
    }

    return r;
};

// isCancelled
ClassChunk.prototype.isCancelled = function() {
    if (!this.dl) {
        return true;
    }
    var is_cancelled = this.dl.cancelled;
    if (!is_cancelled) {
        if (typeof (this.dl.pos) !== 'number') {
            this.dl.pos = dlmanager.getDownloadByHandle(this.dl.id).pos;
        }
        is_cancelled = !dl_queue[this.dl.pos] || !dl_queue[this.dl.pos].n;
    }
    if (is_cancelled) {
        if (d) {
            dlmanager.logger.info(this + " aborting itself because download was canceled.", this.task.chunk_id);
        }
        this.dl.cancelled = true;
        this.finish_download();
        this.task.file.destroy();
        this.destroy();
    }
    return is_cancelled;
};

// finish_download
ClassChunk.prototype.finish_download = function() {
    if (d) {
        ASSERT(this.xhr || !this.dl || this.dl.cancelled, "Don't call me twice!");
    }
    if (this.xhr) {
        this.abort();
        this.task_done.apply(this, arguments);
    }
};

ClassChunk.prototype.onXHRprogress = function(xhrEvent) {
    if (!this.Progress.data[this.xid] || this.isCancelled()) {
        return;
    }
    // if (args[0].loaded) this.Progress.data[this.xid][0] = args[0].loaded;
    // this.updateProgress(!!args[0].zSaaDc ? 0x9a : 0);
    this.Progress.data[this.xid][0] = xhrEvent.loaded;
    this.updateProgress();
};

ClassChunk.prototype.onXHRerror = function(args, xhr) {
    if (d) {
        dlmanager.logger.error('ClassChunk.onXHRerror', this.task && this.task.chunk_id, args, xhr, this);
    }
    if (this.isCancelled() || !this.Progress.data[this.xid]) {
        return console.warn('This chunk should have been destroyed before reaching onerror...');
    }

    this.Progress.data[this.xid][0] = 0; /* reset progress */
    this.updateProgress(2);

    var chunk = this;
    var status = xhr.readyState > 1 && xhr.status;

    this.oet = setTimeout(function() {
        chunk.finish_download(false, {responseStatus: status});
        chunk = undefined;
    }, status === 509 || (3950 + Math.floor(Math.random() * 2e3)));
};

ClassChunk.prototype.onXHRready = function(xhrEvent) {
    var r;
    if (this.isCancelled()) {
        return;
    }
    var xhr = xhrEvent.target;
    try {
        r = xhr.response || {};
        xhr.response = false;
    }
    catch (e) {}
    if (r && r.byteLength === this.size) {
        this.Progress.done += r.byteLength;
        delete this.Progress.data[this.xid];
        this.updateProgress(true);
        if (navigator.appName !== 'Opera') {
            this.io.dl_bytesreceived += r.byteLength;
        }
        this.dl.decrypter++;
        Decrypter.push([
            [this.dl, this.task.offset],
            this.dl.nonce,
            this.task.offset / 16,
            new Uint8Array(r)
        ]);
        this.dl.retries = 0;
        this.finish_download();
        this.destroy();
    }
    else if (!this.dl.cancelled) {
        if (d) {
            dlmanager.logger.error("HTTP FAILED",
                this.dl.n, xhr.status, "am i done? " + this.done, r && r.byteLength, this.size);
        }
        if (dlMethod === MemoryIO) {
            try {
                r = new Uint8Array(0x1000000);
            }
            catch (e) {
                // We're running out of memory..
                dlmanager.logger.error('Uh, oh...', e);
                dlFatalError(this.dl, e);
            }
        }
        return Object(this.xhr).ABORT_EINTERNAL;
    }
};

ClassChunk.prototype.run = function(task_done) {
    if (this.isCancelled()) {
        return;
    }

    if (this.size < 100 * 1024 && dlQueue.expand()) {
        /**
         *  It is an small chunk and we *should* finish soon if everything goes
         *  fine. We release our slot so another chunk can start now. It is useful
         *  to speed up tiny downloads on a ZIP file
         */
        this.done = true;
    }

    this.task_done = task_done;
    if (!this.io.dl_bytesreceived) {
        this.io.dl_bytesreceived = 0;
    }

    this.Progress.working.push(this);

    // HACK: In case of 509s, construct the url from the dl object which must be up-to-date
    this.url = this.dl.url +  "/" + this.url.replace(/.+\//, '');

    /* let the fun begin! */
    this.url = dlmanager.uChangePort(this.url, this.altport ? 8080 : 0);
    if (d) {
        dlmanager.logger.info(this + " Fetching ", this.url);
    }
    this.xhr = getTransferXHR(this);
    this.xhr._murl = this.url;
    this.xhr._host = String(this.url).match(/\/\/(\w+)\./);
    if (this.xhr._host) {
        this.xhr._host = this.xhr._host[1];
    }

    this.xhr.open('POST', this.url, true);
    this.xhr.responseType = 'arraybuffer';
    this.xhr.send();

    if (Object(this.xhr.constructor).name === 'HSBHttpRequest') {
        skipcheck = true;
    }
};

// ClassFile
function ClassEmptyChunk(dl) {
    this.task = {
        zipid: dl.zipid,
        id: dl.id
    };
    this.dl = dl;
}

ClassEmptyChunk.prototype.run = function(task_done) {
    if (this.dl.zipid) {
        this.dl.writer.push({
            data: new Uint8Array(0),
            offset: 0
        });
        Soon(task_done);
    }
    else {
        this.dl.io.write(new Uint8Array(0), 0, function() {
            task_done();
            this.dl.ready();
            oDestroy(this);
        }.bind(this));
    }
}

function ClassFile(dl) {
    this.task = dl;
    this.dl = dl;
    this.gid = dlmanager.getGID(dl);
    if (!dl.zipid || !GlobalProgress[this.gid]) {
        GlobalProgress[this.gid] = {
            data: {},
            done: 0,
            working: []
        };
        dlmanager.dlSetActiveTransfer(dl.zipid || dl.dl_id);
    }
    this[this.gid] = !0;
    this.dl.owner = this;
}

ClassFile.prototype.toString = function() {
    if (d && d > 1) {
        return "[ClassFile " + this.gid + "/" + (this.dl ? (this.dl.zipname || this.dl.n) : '') + "]";
    }
    return "[ClassFile " + this.gid + "]";
};

ClassFile.prototype.abortTimers = function() {
    if (this.dl) {
        if (this.dl.retry_t) {
            this.dl.retry_t.abort();
            delete this.dl.retry_t;
        }
    }
};

ClassFile.prototype.destroy = function() {
    if (d) {
        dlmanager.logger.info('Destroying ' + this,
            this.dl ? (this.dl.cancelled ? 'cancelled' : 'finished') : 'expunged');
    }
    if (!this.dl) {
        return;
    }

    this.abortTimers();

    if (this.dl.cancelled) {
        if (this.dl.zipid && Zips[this.dl.zipid]) {
            Zips[this.dl.zipid].destroy(0xbadf);
        }
    }
    else {
        var skipMacIntegrityCheck = typeof skipcheck !== 'undefined' && skipcheck;
        var macIntegritySuccess = this.emptyFile || dlmanager.checkLostChunks(this.dl);

        if (skipMacIntegrityCheck && !macIntegritySuccess) {
            console.warn('MAC Integrity failed, but ignoring...', this.dl);
            dlmanager.logDecryptionError(this.dl, true);
        }

        if (!macIntegritySuccess && !skipMacIntegrityCheck) {
            dlmanager.dlReportStatus(this.dl, EKEY);

            if (Zips[this.dl.zipid]) {
                Zips[this.dl.zipid].destroy(EKEY);
            }
        }
        else if (this.dl.zipid) {
            Zips[this.dl.zipid].done(this);
        }
        else {
            mBroadcaster.sendMessage('trk:event', 'download', 'completed');

            this.dl.onDownloadProgress(
                this.dl.dl_id, 100,
                this.dl.size,
                this.dl.size, 0,
                this.dl.pos
            );

            this.dl.onBeforeDownloadComplete(this.dl);
            if (!this.dl.preview) {
                this.dl.io.download(this.dl.zipname || this.dl.n, this.dl.p || '');
            }
            this.dl.onDownloadComplete(this.dl);
            dlmanager.cleanupUI(this.dl, true);
        }
    }

    if (!this.dl.zipid) {
        delete GlobalProgress[this.gid];
    }
    dlmanager.dlClearActiveTransfer(this.dl.zipid || this.dl.dl_id);

    this.dl.ready = function onDeadEnd() {
        if (d) {
            dlmanager.logger.warn('We reached a dead end..');
        }
    };

    this.dl.writer.destroy();
    oDestroy(this);
}

ClassFile.prototype.run = function(task_done) {
    var cancelled = oIsFrozen(this) || !this.dl || this.dl.cancelled;

    if (cancelled || !this.gid || !GlobalProgress[this.gid]) {
        if (dlmanager.fetchingFile) {
            dlmanager.fetchingFile = 0;
        }
        if (!cancelled) {
            dlmanager.logger.warn('Invalid %s state.', this, this);
        }
        return task_done();
    }

    dlmanager.fetchingFile = 1; /* Block the fetchingFile state */
    this.dl.retries = 0; /* set the retries flag */

    // dlmanager.logger.info("dl_key " + this.dl.key);
    if (!GlobalProgress[this.gid].started) {
        GlobalProgress[this.gid].started = true;
        this.dl.onDownloadStart(this.dl);
        if (!this.dl.zipid) {
            mBroadcaster.sendMessage('trk:event', 'download', 'started');
        }
    }

    this.dl.ready = function() {
        if (d) {
            this.dl.writer.logger.info(this + ' readyState',
                this.chunkFinished, this.dl.writer.isEmpty(), this.dl.decrypter);
        }
        if (this.chunkFinished && this.dl.decrypter === 0 && this.dl.writer.isEmpty()) {
            this.destroy();
        }
    }.bind(this);

    this.dl.io.begin = function(newName, resumeOffset) {
        /* jshint -W074 */
        var tasks = [];

        if (!this.dl || this.dl.cancelled) {
            if (d) {
                dlmanager.logger.info(this + ' cancelled while initializing.');
            }
        }
        else if (!GlobalProgress[this.gid]) {
            if (d) {
                dlmanager.logger.info(this + ' has no associated progress instance, cancelled while initializing?');
            }
        }
        else {

            if (newName) {
                newName = M.getSafeName(newName);

                if (this.dl.zipid) {
                    this.dl.zipname = newName;
                }
                else {
                    this.dl.n = newName;
                }

                $('#' + dlmanager.getGID(this.dl) + ' .tranfer-filetype-txt').text(newName);
            }

            if (this.dl.pzBufferStateChange) {
                api_req({a: 'log', e: 99654, m: 'download resume from method switchover'});

                resumeOffset = this.dl.pzBufferStateChange.byteLength;
            }

            if (this.dl.byteOffset && resumeOffset !== this.dl.byteOffset) {
                if (d) {
                    dlmanager.logger.info(this + ' cannot resume at offset %s, %s given',
                        this.dl.byteOffset, resumeOffset);
                }

                this.dl.macs = this.dl.resumeInfo.macs = Object.create(null);
                this.dl.byteOffset = this.dl.resumeInfo.byteOffset = 0;

                api_req({a: 'log', e: 99651, m: 'download resume attempt failed'});
            }
            else if (resumeOffset) {
                this.dl.urls = this.dl.urls.filter(function(u) {
                    return u.offset >= resumeOffset;
                });

                this.dl.writer.pos = resumeOffset;

                if (this.dl.urls.length) {
                    api_req({a: 'log', e: 99652, m: 'download resume'});
                }
                else {
                    api_req({a: 'log', e: 99653, m: 'download resume for completed file'});
                }
            }

            if (d) {
                dlmanager.logger.info(this + ' Adding %d tasks...', this.dl.urls.length);
            }

            for (var i = this.dl.urls.length; i--;) {
                var url = this.dl.urls[i];

                tasks.push(new ClassChunk({
                    url: url.url,
                    size: url.size,
                    offset: url.offset,
                    download: this.dl,
                    chunk_id: i,
                    zipid: this.dl.zipid,
                    id: this.dl.id,
                    file: this
                }));
            }

            if ((this.emptyFile = (tasks.length === 0)) && this.dl.zipid) {
                tasks.push(new ClassEmptyChunk(this.dl));
            }

            if (tasks.length > 0) {
                dlQueue.pushAll(tasks,
                    function onChunkFinished() {
                        this.chunkFinished = true;
                    }.bind(this), dlmanager.failureFunction.bind(dlmanager));
            }
        }

        if (task_done) {
            dlmanager.fetchingFile = 0;
            task_done();

            if (this.dl) {
                delete this.dl.urls;
                delete this.dl.io.begin;
            }
            task_done = null;
        }

        if (tasks.length === 0) {
            // force file download
            this.destroy();
        }
    }.bind(this);

    dlmanager.dlGetUrl(this.dl, (error, res) => {
        var cancelOnInit = function(force) {
            if (!this.dl || this.dl.cancelled || force) {
                if (d) {
                    dlmanager.logger.error('Knock, knock..', this.dl);
                }
                if (this.dl) {
                    /* Remove leaked items from dlQueue & dl_queue */
                    dlmanager.abort(this.dl);
                    this.destroy(); // XXX: should be expunged already
                }
                return true;
            }
            return false;
        }.bind(this);

        var onError = function(error) {
            if (error && task_done) {
                // release worker
                dlmanager.fetchingFile = 0;
                Soon(task_done);
                task_done = null;
            }
            return error;
        };

        if (cancelOnInit()) {
            error = true;
        }
        else if (error) {
            var fatal = (error === EBLOCKED || error === ETOOMANY);

            this.dlGetUrlErrors = (this.dlGetUrlErrors | 0) + 1;

            if (this.dl.zipid && (fatal || this.dlGetUrlErrors > 20)) {
                // Prevent stuck ZIP downloads if there are repetitive errors for some of the files
                // TODO: show notification to the user about empty files in the zip?
                console.error('Too many errors for "' + this.dl.n + '", saving as 0-bytes...');

                if (error === EBLOCKED) {
                    Zips[this.dl.zipid].eblocked++;
                }

                try {
                    this.dl.size = 0;
                    this.dl.urls = [];
                    return this.dl.io.setCredentials("", 0, this.dl.n);
                }
                catch (e) {
                    setTransferStatus(this.dl, e, true);
                }
            }
            else if (fatal) {
                if (this.dl) {
                    dlmanager.dlReportStatus(this.dl, error);
                }
                cancelOnInit(true);
            }
            else {
                var onGetUrlError = function onGetUrlError() {
                    if (!cancelOnInit()) {
                        this.dl.retry_t = null;
                        dlmanager.logger.info(this + ' Retrying dlGetUrl for ' + this.dl.n);
                        dlmanager.dlQueuePushBack(this);
                    }
                }.bind(this);

                if (error === EOVERQUOTA) {
                    dlmanager.logger.warn(this + ' Got EOVERQUOTA, holding...');
                    dlmanager.showOverQuotaDialog(onGetUrlError);
                    this.dlGetUrlErrors = 0;
                }
                else {
                    dlmanager.dlRetryInterval *= 1.2;
                    if (dlmanager.dlRetryInterval > 2e5) {
                        dlmanager.dlRetryInterval = 2e5;
                    }
                    (this.dl.retry_t = tSleep(dlmanager.dlRetryInterval / 1e3)).then(onGetUrlError).catch(dump);
                    dlmanager.logger.warn(this + ' Retry to fetch url in %dms, error:%s',
                                            dlmanager.dlRetryInterval, error);
                }
            }
        }
        else {
            const init = (resumeInfo) => {
                dlmanager.initDownload(this, res, resumeInfo)
                    .then((info) => {
                        if (!onError(cancelOnInit()) && d > 1) {
                            dlmanager.logger.debug('initDownload succeed', info, resumeInfo);
                        }
                    })
                    .catch((ex) => {
                        if (ex === EEXPIRED) {
                            // already aborted.
                            return;
                        }
                        if (d) {
                            dlmanager.logger.error('initDownload error', ex);
                        }
                        dlFatalError(this.dl, escapeHTML(l[5945]).replace('{0}', ex));
                        cancelOnInit(true);
                        onError(ex);
                    });
            };

            if (dlmanager.dlResumeThreshold > res.s) {

                init(false);
            }
            else {
                dlmanager.getResumeInfo(this.dl, init);
            }
        }

        if (error) {
            onError(error);
        }

    });
};

/* ***************** BEGIN MEGA LIMITED CODE REVIEW LICENCE *****************
 *
 * Copyright (c) 2025 by Mega Limited, Auckland, New Zealand
 * All rights reserved.
 *
 * This licence grants you the rights, and only the rights, set out below,
 * to access and review Mega's code. If you take advantage of these rights,
 * you accept this licence. If you do not accept the licence,
 * do not access the code.
 *
 * Words used in the Mega Limited Terms of Service [https://mega.nz/terms]
 * have the same meaning in this licence. Where there is any inconsistency
 * between this licence and those Terms of Service, these terms prevail.
 *
 * 1. This licence does not grant you any rights to use Mega's name, logo,
 *    or trademarks and you must not in any way indicate you are authorised
 *    to speak on behalf of Mega.
 *
 * 2. If you issue proceedings in any jurisdiction against Mega because you
 *    consider Mega has infringed copyright or any patent right in respect
 *    of the code (including any joinder or counterclaim), your licence to
 *    the code is automatically terminated.
 *
 * 3. THE CODE IS MADE AVAILABLE "AS-IS" AND WITHOUT ANY EXPRESS OF IMPLIED
 *    GUARANTEES AS TO FITNESS, MERCHANTABILITY, NON-INFRINGEMENT OR OTHERWISE.
 *    IT IS NOT BEING PROVIDED IN TRADE BUT ON A VOLUNTARY BASIS ON OUR PART
 *    AND YOURS AND IS NOT MADE AVAILABE FOR CONSUMER USE OR ANY OTHER USE
 *    OUTSIDE THE TERMS OF THIS LICENCE. ANYONE ACCESSING THE CODE SHOULD HAVE
 *    THE REQUISITE EXPERTISE TO SECURE THEIR OWN SYSTEM AND DEVICES AND TO
 *    ACCESS AND USE THE CODE FOR REVIEW PURPOSES. YOU BEAR THE RISK OF
 *    ACCESSING AND USING IT. IN PARTICULAR, MEGA BEARS NO LIABILITY FOR ANY
 *    INTERFERENCE WITH OR ADVERSE EFFECT ON YOUR SYSTEM OR DEVICES AS A
 *    RESULT OF YOUR ACCESSING AND USING THE CODE.
 *
 * Read the full and most up-to-date version at:
 *    https://github.com/meganz/webclient/blob/master/LICENCE.md
 *
 * ***************** END MEGA LIMITED CODE REVIEW LICENCE ***************** */

/**
 * FileReader wrapper maintaining a pipeline of encrypted chunks.
 * @param {File} file The file instance
 * @constructor
 */
class FileUploadReader {
    constructor(file) {
        this.file = file;
        this.readpos = 0;
        this.cache = new Map();
        this.reread = new Map();
        this.debug = self.d > -1;
        this.verbose = this.debug && !self.is_livesite;
        this.name = `FUR(${file.name.slice(this.verbose ? -56 : -4)}.${file.size})`;
        this.logger = new MegaLogger(this.name, false, self.ulmanager && ulmanager.logger);
    }

    // return chunk from cache and delete it
    getChunk(pos) {
        const chunk = this.cache.get(pos);
        this.cache.delete(pos);
        return chunk;
    }

    // queue specific chunk for (prioritised) reading
    readChunk(pos) {
        this.reread.set(pos, true);
        this.readahead(0);
    }

    haveChunk(pos) {
        return this.cache.has(pos);
    }

    // read chunks into the cache
    // returns the maximum total number of chunks held _after_ the readahead completes
    readahead(cachelimit) {
        const {cache, reread, file = false, debug, logger} = this;
        var readpos, len;

        // don't read from aborted files
        if (!file.wsfu) {
            return cache.size;
        }

        // prioritise re-reading old chunks to be resent over reading new chunks
        if (reread.size) {
            readpos = reread.keys().next().value;
            reread.delete(readpos);

            len = FileUploadReader.chunkmap[readpos] || 0x100000;
            if (readpos + len > file.size) {
                len = file.size - readpos;
            }

            if (debug) {
                logger.log(`readahead(): re-reading old chunk ${readpos} ${len}`);
            }
        }
        else {
            // otherwise, proceed with the readahead logic
            // don't read past EOF, don't exceed cachelimit
            readpos = this.readpos;

            if (readpos >= file.size || cache.size >= cachelimit) {
                return cache.size;
            }

            if (debug) {
                logger.log(`readahead(): ${cache.size} chunks in the cache, limit: ${cachelimit}`);
            }

            // after the first eight individual chunks, we read in 8 MB increments
            len = Math.min(file.size - readpos, FileUploadReader.chunkmap[readpos] || 8 * 0x100000);

            this.readpos += len;
        }

        this._read(readpos, len)
            .then((chunk) => {
                if (!file.wsfu) {
                    // aborted
                    return;
                }
                assert('byteLength' in chunk);
                if (len > 0x100000) {
                    // split
                    let chunksize = len & 0xfffff || 0x100000;

                    for (let i = len; (i -= chunksize) >= 0; chunksize = 0x100000) {
                        cache.set(readpos + i, new Uint8Array(chunk.buffer, i, chunksize));
                        file.ul_macs[readpos + i] = file.ul_macs[readpos].slice(i >> 18, (i >> 18) + 4);
                    }
                }
                else {
                    cache.set(readpos, chunk);
                }

                return this.readahead(cachelimit);
            })
            .catch((ex) => {
                logger.error(`Read at ${readpos} failed`, ex, file.wsfu);
                if (file.wsfu) {
                    this.error = ex;
                }
            });

        // anticipate the arrival of the pending read
        return cache.size + (len > 0x100000 ? 8 : 1);
    }

    advanceHead() {
        let eof = false;
        const pos = this.headpos || 0;

        if (pos < this.file.size) {
            // advance headpos by one chunk
            this.headpos = pos + (FileUploadReader.chunkmap[pos] || 1048576);
        }

        if (this.headpos > this.file.size || !this.file.size) {
            this.headpos = this.file.size;
            eof = true; // eof is set by a short final chunk, so we don't need an extra empty chunk
        }

        let len = FileUploadReader.chunkmap[pos] || 1048576;

        if (pos + len > this.file.size) {
            len = this.file.size - pos;
        }

        if (!len) {
            // an extra (empty) chunk sets the file size if the file ends on a chunk boundary
            eof = true;
        }

        return {pos, len, eof};
    }

    // @private Get an encrypted chunk from disk
    async _read(offset, length) {
        const data = await this._getArrayBuffer(offset, length);

        return this._encrypt(offset, data);
    }

    // @private
    _encrypt(offset, data) {
        return new Promise((resolve) => {
            if (!this.file) {
                throw EBLOCKED;
            }
            const ctx = {
                start: offset,
                macs: this.file.ul_macs
            };
            Encrypter.push([ctx, this.file.ul_keyNonce, ctx.start / 16, data], () => resolve(ctx.bytes));
        });
    }

    // @private
    _getArrayBuffer(offset, length) {

        return this.file.slice(offset, offset + length).arrayBuffer();
    }

    destroy() {
        if (this.file) {
            this.file = null;
            this.cache.clear();
            oDestroy(this);
        }
    }
}

/** @property FileUploadReader.chunkmap */
lazy(FileUploadReader, 'chunkmap', () => {
    'use strict';
    // pre-compute sizes of the first file chunks
    const res = Object.create(null);

    for (let p = 0, dp = 0; dp < 1048576; p += dp) {
        dp += 131072;
        res[p] = dp;
    }
    return res;
});

/* ***************** BEGIN MEGA LIMITED CODE REVIEW LICENCE *****************
 *
 * Copyright (c) 2025 by Mega Limited, Auckland, New Zealand
 * All rights reserved.
 *
 * This licence grants you the rights, and only the rights, set out below,
 * to access and review Mega's code. If you take advantage of these rights,
 * you accept this licence. If you do not accept the licence,
 * do not access the code.
 *
 * Words used in the Mega Limited Terms of Service [https://mega.nz/terms]
 * have the same meaning in this licence. Where there is any inconsistency
 * between this licence and those Terms of Service, these terms prevail.
 *
 * 1. This licence does not grant you any rights to use Mega's name, logo,
 *    or trademarks and you must not in any way indicate you are authorised
 *    to speak on behalf of Mega.
 *
 * 2. If you issue proceedings in any jurisdiction against Mega because you
 *    consider Mega has infringed copyright or any patent right in respect
 *    of the code (including any joinder or counterclaim), your licence to
 *    the code is automatically terminated.
 *
 * 3. THE CODE IS MADE AVAILABLE "AS-IS" AND WITHOUT ANY EXPRESS OF IMPLIED
 *    GUARANTEES AS TO FITNESS, MERCHANTABILITY, NON-INFRINGEMENT OR OTHERWISE.
 *    IT IS NOT BEING PROVIDED IN TRADE BUT ON A VOLUNTARY BASIS ON OUR PART
 *    AND YOURS AND IS NOT MADE AVAILABE FOR CONSUMER USE OR ANY OTHER USE
 *    OUTSIDE THE TERMS OF THIS LICENCE. ANYONE ACCESSING THE CODE SHOULD HAVE
 *    THE REQUISITE EXPERTISE TO SECURE THEIR OWN SYSTEM AND DEVICES AND TO
 *    ACCESS AND USE THE CODE FOR REVIEW PURPOSES. YOU BEAR THE RISK OF
 *    ACCESSING AND USING IT. IN PARTICULAR, MEGA BEARS NO LIABILITY FOR ANY
 *    INTERFERENCE WITH OR ADVERSE EFFECT ON YOUR SYSTEM OR DEVICES AS A
 *    RESULT OF YOUR ACCESSING AND USING THE CODE.
 *
 * Read the full and most up-to-date version at:
 *    https://github.com/meganz/webclient/blob/master/LICENCE.md
 *
 * ***************** END MEGA LIMITED CODE REVIEW LICENCE ***************** */

// WebSocket uploading v0.95
//
// FIXME: add logic to give up on/retry uploads that are too slow or run into too many connection/CRC failures

/** @property mega.wsuploadmgr */
lazy(mega, 'wsuploadmgr', () => {
    'use strict';

    const crc32b = (() => {
        /**
         * Fast CRC32 in JavaScript
         * 101arrowz (https://github.com/101arrowz)
         * License: MIT
         */
        const crct = new Int32Array(4096);

        for (let i = 0; i < 256; ++i) {
            let c = i;
            let k = 9;
            while (--k) {
                c = (c & 1 && -306674912) ^ c >>> 1;
            }
            crct[i] = c;
        }

        for (let i = 0; i < 256; ++i) {
            let lv = crct[i];
            for (let j = 256; j < 4096; j += 256) {
                lv = crct[i | j] = lv >>> 8 ^ crct[lv & 255];
            }
        }

        const crcts = [];

        for (let i = 0; i < 16;) {
            crcts[i] = crct.subarray(i << 8, ++i << 8);
        }

        const [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16] = crcts;

        return (d, c) => {
            c = ~c;
            d = new Uint8Array(d);
            let i = 0;
            const max = d.length - 16;
            while (i < max) {
                c =
                    t16[d[i++] ^ c & 255] ^
                    t15[d[i++] ^ c >> 8 & 255] ^
                    t14[d[i++] ^ c >> 16 & 255] ^
                    t13[d[i++] ^ c >>> 24] ^
                    t12[d[i++]] ^
                    t11[d[i++]] ^
                    t10[d[i++]] ^
                    t9[d[i++]] ^
                    t8[d[i++]] ^
                    t7[d[i++]] ^
                    t6[d[i++]] ^
                    t5[d[i++]] ^
                    t4[d[i++]] ^
                    t3[d[i++]] ^
                    t2[d[i++]] ^
                    t1[d[i++]];
            }
            for (; i < d.length; ++i) {
                c = t1[c & 255 ^ d[i]] ^ c >>> 8;
            }

            // results are unsigned!
            return (c ^ 0xFFFFFFFF) >>> 0;
        };
    })();

    const logger = new MegaLogger('WSU', false, self.ulmanager && ulmanager.logger);

    // manages a pool of WebSocket connections to a fixed URL
    class WsPool {
        constructor(wspmgr, host, uri, setupws) {
            this.wspmgr = wspmgr;

            this.host = host;
            this.setupws = setupws;
            this.url = `wss://${host}/${uri}`;

            // pools need to be refreshed every 24 hours (wallclock time)
            this.timestamp = Date.now();

            // we keep a single standby connection per url open for faster upload starts
            this.conn = [new WebSocket(this.url)];

            // one connection per pool open while idle
            this.numconn = 1;

            this.chunksinflight = 0;

            this.files = Object.create(null);   // the files in this pool
            this.logger = new MegaLogger(`WsPool(${makeUUID().slice(-16)})`, false, logger);

            setupws(this.conn[0], this);
        }

        // gracefully close a connection
        dispose(idx) {
            const [ws] = this.conn.splice(idx, 1);
            if (self.d) {
                this.logger.warn(`disposing connection at #${idx}...`, ws);
            }
            if (ws) {
                ws.cleanclose();
            }
        }

        // close all connections
        purge() {
            for (let i = this.conn.length; i--;) {
                this.dispose(i);
            }
            if (self.d) {
                this.logger.warn('pool purged.', [this]);
            }
            oDestroy(this);
        }

        // close idle excess connections
        closexconn() {
            if (this.conn.length > this.numconn) {
                for (let i = this.conn.length; i--;) {

                    if (!this.conn[i].bufferedAmount
                     && !this.conn[i].chunksonthewire.length) {

                        this.dispose(i);
                    }

                    if (this.conn.length <= this.numconn) {
                        break;
                    }
                }
            }
        }

        // returns connection with the lowest suitable bufferedAmount, false if none available
        getmostidlews() {
            // FIXME: ramp up connection count as configured
            let lowest = -1;

            // create missing connections
            if (this.conn.length < this.numconn) {
                const ws = new WebSocket(this.url);
                this.setupws(ws, this);
                this.conn.push(ws);
            }
            this.closexconn();

            for (let i = this.conn.length; i--;) {

                if (this.conn[i].readyState === WebSocket.OPEN) {
                    if (lowest < 0 || this.conn[i].bufferedAmount < this.conn[lowest].bufferedAmount) {
                        lowest = i;
                    }
                }
            }

            if (lowest >= 0) {
                return this.conn[lowest];
            }

            return false;
        }

        // closes all timed out connections
        enforcetimeouts() {
            for (let i = this.conn.length; i--;) {
                const ws = this.conn[i];

                if (ws.reconnectat ? this.wspmgr.wsumgr.seconds > ws.reconnectat : ws.readyState === ws.CLOSED) {
                    // re-establish a failed/timed out connection
                    ws.cleanclose();
                    this.conn[i] = new WebSocket(this.url);
                    this.setupws(this.conn[i], this);
                }
            }
        }

        filethroughputs() {
            // we update the throughputs for all files being uploaded
            const onthewire = Object.create(null);
            let stop = false;

            for (let i = this.conn.length; i--;) {
                // extract chunksonthewire that are no longer covered by bufferedAmount
                let buffered = this.conn[i].bufferedAmount;

                for (let j = this.conn[i].chunksonthewire.length; j--;) {
                    const c = this.conn[i].chunksonthewire[j];

                    buffered -= c[1] + 20;     // subtract chunk and header length
                    if (buffered < 0) {
                        // part of this chunk and all previous chunks are no longer buffered
                        // and can be added to the server-confirmed amount as having left the local machine
                        onthewire[c[2]] = (onthewire[c[2]] || 0) - buffered;

                        while (j--) {
                            const c = this.conn[i].chunksonthewire[j];
                            onthewire[c[2]] = (onthewire[c[2]] || 0) + c[1];
                        }

                        break;
                    }
                }
            }

            // update throughputs for files with bytes on the wire
            for (const fileno in onthewire) {
                if (this.files[fileno]) {
                    this.files[fileno].showthroughput(onthewire[fileno]);
                }
            }

            // update throughputs for other active files
            for (const fileno in this.files) {
                if (onthewire[fileno] === undefined) {
                    const f = this.files[fileno];

                    if (!f || f.abort) {
                        stop = true;
                        delete this.files[fileno];
                    }
                    else if (f.reader.readpos) {
                        this.files[fileno].showthroughput(0);
                    }
                }
            }

            return stop;
        }

        // returns [position, size, fileno] of next chunk, or false if we're done
        nextchunk() {
            if (ulQueue.isPaused()) {
                if (self.d > 1) {
                    this.logger.warn("All transfers paused.");
                }
                return false;
            }

            // do we have any failed chunks to resend available in the cache?
            while (this.toresend && this.toresend.length) {
                const [pos, len, fileno] = this.toresend[0];
                const ul = this.files[fileno];

                // if the file upload has been cancelled, skip
                if (!ul || ul.done || ul.abort) {
                    if (self.d) {
                        this.logger.info(`Not resending chunk (file #${fileno} ${pos} ${len}) - done/aborted`);
                    }
                    this.toresend.splice(0, 1);
                    continue;
                }

                // if the chunk isn't available yet, proceed with fresh chunks until it is
                if (pos < ul.reader.file.size && !ul.reader.haveChunk(pos)) {
                    if (self.d) {
                        this.logger.info(`Not resending chunk (file #${fileno} ${pos} ${len}) - waiting for reader`);
                    }
                    break;
                }

                if (self.d) {
                    this.logger.info(`Resending chunk (file #${fileno} ${pos} ${len})`);
                }

                this.toresend.splice(0, 1);
                return [pos, len, fileno];
            }

            let fileno, ulfile;
            let cachelimit = this.chunksinflight + 40;

            // find a file with unsent chunks
            for (fileno in this.files) {
                if (!this.files[fileno].abort) {
                    const ul = this.files[fileno];
                    const {reader, eofset} = ul;
                    const {file, headpos, error} = reader;

                    if (ulQueue.isPaused(file.owner.gid)) {
                        continue;
                    }

                    if (error) {
                        // @todo report
                        continue;
                    }

                    // upload confirmation lost? retrigger.
                    if (ul.havelastchunkconfirmation && this.wspmgr.wsumgr.seconds - ul.havelastchunkconfirmation > 3) {
                        this.logger.info(`Missing upload confirmation for file #${fileno} - retriggering`);
                        ul.havelastchunkconfirmation = this.wspmgr.wsumgr.seconds;
                        return [file.size, 0, fileno];
                    }

                    if (cachelimit > 0) {
                        cachelimit -= reader.readahead(cachelimit);
                    }

                    if (!('headpos' in reader) || headpos < file.size || !eofset) {
                        ulfile = ul;
                        fileno = Number(fileno);
                        break;
                    }
                }
            }

            if (!ulfile) {
                // nothing to send
                return false;
            }

            const {pos, len, eof} = ulfile.reader.advanceHead();
            if (eof) {
                ulfile.eofset = true;

                if (!len) {
                    // the server will confirm the empty size-setting chunk
                    ulfile.needsizeconfirmation = true;
                }
            }

            return [pos, len, fileno];
        }

        retrychunk(chunk, reread) {
            const fu = this.files[chunk[2]];

            if (!fu || fu.done || fu.abort) {
                if (self.d) {
                    this.logger.debug(`Not retrying chunk ${JSON.stringify(chunk)} (done/aborted)`);
                }
            }
            else {
                if (self.d) {
                    this.logger.debug(`Going to retry chunk ${JSON.stringify(chunk)}`);
                }

                if (reread && fu.reader.file && chunk[0] < fu.reader.file.size) {
                    fu.reader.readChunk(chunk[0]);
                }

                if (!this.toresend) {
                    this.toresend = [];
                }

                this.toresend.push(chunk);
            }
        }

        sendchunkdata(ws, fileno, pos, chunkdata) {
            /**
             * Header:
             * - fileno (32 bit LE)
             * + pos (64 bit LE)
             * + length (32 bit LE)
             * + CRC32b (32 bit LE) over the first 16 bytes of the header
             * + the chunk data
             */
            const header = new ArrayBuffer(20);
            const view = new DataView(header);
            view.setUint32(0, fileno, true);
            view.setBigUint64(4, BigInt(pos), true);
            view.setUint32(12, chunkdata.byteLength, true);
            view.setUint32(16, crc32b(chunkdata, crc32b(new Uint8Array(header, 0, 16))), true);
            ws.send(header);
            ws.send(chunkdata);
        }

        // send one chunk from the WsPool to the given WebSocket
        // returns true if something was sent, false otherwise
        sendchunk(ws) {
            // if connection is up and buffer is not too full, we send another chunk
            if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1500000) {
                const chunk = this.nextchunk();

                if (chunk) {
                    // chunk is [chunkpos, len, fileno]
                    // (we need to tell the reader about how many chunks we have in flight across all
                    // connections so that it can adapt to our link's bandwidth-delay product)
                    const buf = chunk[1] ? this.files[chunk[2]].reader.getChunk(chunk[0]) : new ArrayBuffer(0);

                    if (buf && buf.byteLength === chunk[1]) {
                        this.sendchunkdata(ws, chunk[2], chunk[0], buf);

                        // mark the sent chunk as in flight on this connection/file
                        this.chunksinflight++;

                        // (for accurate throughput metering)
                        return ws.chunksonthewire.push(chunk);
                    }

                    if (self.d) {
                        if (buf) {
                            const at = `${chunk[0]}: ${buf.byteLength} != ${chunk[1]}`;
                            this.logger.error(`GetChunk for file #${chunk[2]} failed at ${at}`, buf);
                        }
                        else {
                            this.logger.log(`No chunk at ${chunk[0]} file #${chunk[2]}`);
                        }
                    }

                    this.retrychunk(chunk, false);
                }
            }

            return false;
        }

        // fills the buffers of all connections of the pool
        sendchunks(round) {
            let tooslow = false;

            this.enforcetimeouts();

            for (; ;) {
                const ws = this.getmostidlews();

                if (ws === false) {
                    // all filled up
                    break;
                }
                else {
                    // do not overfill send buffers
                    if (ws.bufferedAmount > 1500000) {
                        break;
                    }

                    // did the socket buffer run empty?
                    if (ws.lastround !== undefined && !ws.bufferedAmount && (round - ws.lastround & 0xffffffff) === 1) {
                        tooslow = true;
                    }

                    // ws is the WebSocket that shall receive the next chunk
                    if (!this.sendchunk(ws)) {
                        break;
                    }

                    // WebSocket buffer full? tag it with round to see if it ran empty in one interval
                    if (ws.bufferedAmount > 1500000) {
                        ws.lastround = round;
                    }
                }
            }

            if (this.filethroughputs()) {

                this.wspmgr.wsumgr.stop();
            }

            // if any buffer ran empty, we need to increase invocation frequency
            return tooslow;
        }
    }

    // obtains size classes and related upload URLs from the API
    // creates a WsPool for each
    // setupws attaches message handlers etc. to the websocket
    class WsPoolMgr {
        constructor(wsumgr, setupws) {
            this.wsumgr = wsumgr;
            this.pools = [];
            this.maxulsize = [];
            this.setupws = setupws;
            this.unassigned = [];
            this.logger = new MegaLogger(`WsPoolMgr(${makeUUID().slice(-16)})`, false, logger);
        }

        // number of parallel upload connections
        get numconn() {
            // we keep one connection per pool open and ramp it up when a file is queued
            return self.fmconfig && fmconfig.ul_maxSlots || ulmanager.ulDefConcurrency;
        }

        // number of ongoing file uploads
        get files() {
            let res = 0;
            for (let i = this.pools.length; i--;) {
                res += Object.keys(this.pools[i].files).length;
            }
            return res;
        }

        // create new WsPools for each size class based on the API response layout:
        // maxulsize[] is ordered ascending and contains the maximum file size allowed into the pool with the same index
        // pools[maxulsize.length] is the active pool for all higher file sizes
        // Beyond that, index are pools that are drying up
        // (they may still have transfers on them, but they are not getting new ones)
        async refreshpools() {
            // response format is [[host, uri, sizelimit], ..., [host, uri, sizelimit], [host uri]]
            const {result: u} = await api.req({a: 'usc'}, 7);

            // we construct replacement pools/maxulsize arrays,
            // recycling non-expired existing ones pointing to the same host and having the same size class
            const pools = [];
            const maxulsize = [];
            const oldestvalid = Date.now() - 24 * 3600 * 1000;

            // set number of concurrent FileUpload instances
            ulQueue.setSize(Math.max(2, u.length | 0));

            // store API size class allocation and corresponding upload URLs
            for (let i = 0; i < u.length; i++) {
                let found = false;

                // locate matching fresh WsPool
                for (let j = this.pools.length; j--;) {

                    if (this.pools[j].host === u[i][0]
                        && this.maxulsize[j] === u[i][2]
                        && this.pools[j].timestamp >= oldestvalid) {

                        // non-expired match found: maintain
                        found = true;

                        pools.push(this.pools[j]);
                        this.pools.splice(j, 1);

                        if (this.maxulsize[j]) {
                            maxulsize.push(this.maxulsize[j]);
                            this.maxulsize.splice(j, 1);
                        }
                        break;
                    }
                }

                if (!found) {
                    // not found, we'll create a fresh one
                    pools.push(new WsPool(this, u[i][0], u[i][1], this.setupws));
                    if (u[i][2]) {
                        maxulsize.push(u[i][2]);
                    }
                }
            }

            // the obsolete pools are kept alive as they might have active transfers on them
            for (let i = 0; i < this.pools.length; i++) {
                pools.push(this.pools[i]);
            }

            this.pools = pools;
            this.maxulsize = maxulsize;

            // now assign pending uploads
            if (this.pools.length) {
                for (let i = this.unassigned.length; i--;) {
                    this.assignfile(this.unassigned[i]);
                }
                this.unassigned = [];
            }

            // and send data/close orphaned pools
            this.pumpdata();
        }

        assignfile(fu) {
            const {reader: {file}, fileno} = fu;

            // if .wsfu is deleted, the upload is considered aborted by FileUploadReader
            file.wsfu = fu;

            if (this.pools.length) {
                let i = 0;
                while (i < this.maxulsize.length && file.size >= this.maxulsize[i]) {
                    ++i;
                }
                // add file to pool
                // ramp up connections, FIXME: set timer to downramp after no upload inactivity
                this.pools[i].numconn = this.numconn;
                this.pools[i].files[fileno] = fu;
                this.pools[i].sendchunks(0);

                if (self.d) {
                    this.logger.info(`fileno#${fileno} assigned to ${file.owner}`, [fu]);
                }
            }
            else {
                if (self.d) {
                    this.logger.warn(`We don't have any usc response yet, queueing #${fileno}...`, [fu]);
                }
                this.unassigned.push(fu);
            }
        }

        pumpdata(wmgr) {
            // delete empty inactive pools (which start at index this.maxulsize.length + 1)
            for (let i = this.pools.length; --i > this.maxulsize.length;) {
                if (!this.pools[i].chunksinflight && !Object.keys(this.pools[i].files).length) {
                    if (self.d) {
                        this.logger.log(`Closing idle pool ${i}`);
                    }
                    this.pools[i].purge();
                    this.pools.splice(i, 1);
                }
            }

            // we tag each WebSocket that got fresh data with an identifier
            // so that we can detect it ran empty since the last invocation,
            // which means that we need to increase the pumping frequency
            this.round = this.round + 1 & 0xffffffff;

            let tooslow = false;

            for (let i = this.pools.length; i--;) {
                if (this.pools[i].sendchunks(this.round)) {
                    tooslow = true;
                }
            }

            return tooslow;
        }
    }

    class WsFileUpload {
        constructor(file, fileno) {
            this.abort = false;
            this.fileno = fileno;
            this.bytesuploaded = 0;
            this.needsizeconfirmation = false;
            this.havelastchunkconfirmation = 0;
            this.reader = new FileUploadReader(file);

            // start the Speedometer the first activity
            lazy(this, 'speedometer', () => Speedometer(0));
        }

        showthroughput(bytesinflight) {
            if (!this.abort && this.reader.file.owner) {
                const {reader: {file}, bytesuploaded, speedometer} = this;

                if (!file.ulSilent) {
                    const b = bytesuploaded + bytesinflight;
                    const p = GlobalProgress[file.owner.gid].speed = speedometer.progress(b);

                    M.ulprogress(file, Math.floor(b / file.size * 100), b, file.size, p);
                }
            }
        }

        destroy() {
            if (this.reader) {
                delete this.abort;
                this.reader.destroy();
                Object.defineProperty(this, 'abort', {value: true});
                oDestroy(this);
            }
        }
    }

    class WsUploadMgr {
        constructor() {
            this.fileno = 0;
            this.seconds = 0;
            this.refreshing = false;
            this.logger = new MegaLogger(`WsUploadMgr(${makeUUID().slice(-16)})`, false, logger);

            this.poolmgr = new WsPoolMgr(this, (ws, pool) => {
                // configure the freshly created WebSocket
                ws.binaryType = 'arraybuffer';
                ws.pool = pool;
                // chronological record of the unacknowledged chunks in transit (for accurate transfer speed)
                ws.chunksonthewire = [];

                // run the datapump if a connection is established/closed
                function openhandler() {
                    if (self.d) {
                        this.pool.wspmgr.wsumgr.logger.log(`Connected to ${this.url}`);
                    }
                    this.pool.sendchunk(ws);      // immediately send a chunk to the new connection
                    this.pool.sendchunks();       // and fill the whole pool's buffers
                }

                function errorhandler(ev) {
                    this.pool.wspmgr.wsumgr.logger.error(`Connection error for ${this.url}`, ev);
                    this.reconnectat = this.pool.wspmgr.wsumgr.seconds + 5; // reconnect after 5 seconds
		}

                function closehandler(ev) {
                    // ignore the closure of sockets on oDestroy()'d pools
                    if (!this.pool.wspmgr) return;

                    if (self.d) {
                        const {wasClean, code, reason} = ev;
                        this.pool.wspmgr.wsumgr.logger.info(`Disconnected from ${this.url}`, wasClean, code, reason, [ev]);
                    }

                    // if the connection dropped unexpectedly, we return the in-flight chunks to the pool
                    this.pool.chunksinflight -= this.chunksonthewire.length;

                    // we must resend all unacknowledged in-flight chunks
                    for (let i = 0; i < this.chunksonthewire.length; i++) {
                        this.pool.retrychunk(this.chunksonthewire[i], true);
                    }

                    this.pool.sendchunk(ws);       // re-enqueue inflight chunks
                }

                // process a server message
                function messagehandler({data}) {
                    const view = new DataView(data);

                    // parse and action the message from the upload server
                    if (view.byteLength < 9) {
                        if (self.d) {
                            this.pool.wspmgr.wsumgr.logger.error(`Invalid server message length ${view.byteLength}`);
                        }
                    }
                    else {
                        const crc = view.getUint32(data.byteLength - 4, true);

                        if (crc === crc32b(new Uint8Array(data, 0, view.byteLength - 4))) {

                            return this.pool.wspmgr.wsumgr.process(this, data, view);
                        }

                        if (self.d) {
                            this.pool.wspmgr.wsumgr.logger.error(`CRC failed, byteLength=${view.byteLength} ${crc}`);
                        }
                    }

                    this.close();
                }

                ws.addEventListener('open', openhandler);
                ws.addEventListener('message', messagehandler);
                ws.addEventListener('close', closehandler);
                ws.addEventListener('error', errorhandler);

                // delete listeners (except closehandler - we need it to run)
                ws.cleanclose = function() {
                    this.removeEventListener('open', openhandler);
                    this.removeEventListener('message', messagehandler);
                    this.removeEventListener('error', errorhandler);
                    this.close();
                };
            });
        }

        process(ws, data, view) {
            let chunk;
            const type = view.getInt8(12);
            const fileno = view.getUint32(0, true);
            const chunkpos = Number(view.getBigUint64(4, true));
            const fu = ws.pool.files[fileno] || {abort: -1};

            if (type > 0 && type < 4 || type === 7) {
                // server confirmation received: this chunk is no longer in flight (ul confirmation follows separately)
                chunk = this.flush(ws, fileno, chunkpos);

                if (!fu.reader) {
                    this.logger.warn(`No upload associated with file #${fileno}`);
                    delete ws.pool.files[fileno];
                    return this.stop();
                }
            }

            if (type < 0) {
                this.logger.error(`File #${fileno} failed at ${chunkpos} (${type})`);

                if (!fu.abort && !fu.done) {
                    this.uploadfailed(fu, type);
                }
                return;
            }

            switch (type) {
                case 1: // non-final chunk ingested by server
                case 7: // server has received the final chunk
                    this.finalise(chunk, type, fu);
                    break;

                case 2:
                    // chunk already on server (could happen after a reconnect/retry)
                    break;

                case 3:
                    // CRC failed (unlikely on SSL, but very possible on TCP)
                    this.logger.error(`Chunk CRC FAILED on ${ws.url}`);
                    ws.pool.retrychunk(chunk, true);
                    break;

                case 4:
                    // upload completed
                    delete ws.pool.files[fileno];
                    if (!fu.abort) {
                        fu.done = true;
                        this.uploadcomplete(fu, new Uint8Array(data, 14, view.getUint8(13)));
                    }
                    break;

                case 5:
                    // server in distress - refresh pool target URLs from API
                    this.logger.warn(`Server ${ws.pool.url} shedding connections`);

                    queueMicrotask(() => {
                        if (!this.refreshing) {
                            this.refreshing = true;

                            this.poolmgr.refreshpools()
                                .catch(dump)
                                .finally(() => {
                                    this.refreshing = false;
                                });
                        }
                    });
                    return;

                case 6:
                    // server requests a break
                    // FIXME: implement
                    this.logger.warn(`Server ${ws.pool.url} requests pause of ${chunkpos} ms`);
                    break;

                default:
                    // ignore unknown messages for compatibility with future protocol features
                    this.logger.warn(`Unknown response from server ${type}`);
            }

            // if we have chunks in flight, expect the next response in at most 10 seconds
            if (ws.chunksonthewire.length) {
                ws.reconnectat = this.seconds + 10;
            } else {
                ws.reconnectat = 0;
            }
        }

        finalise(chunk, type, fu) {
            if (!fu.abort && chunk) {

                // empty chunk only allowed to confirm size
                if (chunk[1]) {
                    fu.bytesuploaded += chunk[1];
                }
                else {
                    if (!fu.needsizeconfirmation) {
                        this.logger.warn('Unexpected file size confirmation (file #${chunk[2]}); starting over!', [fu]);
                        this.uploadfailed(fu, -2);
                        return;
                    }
                    fu.needsizeconfirmation = false;
                }

                if (type === 7) {
                    if (fu.reader.readpos < fu.reader.file.size) {
                        this.logger.warn('Premature end-of-file ack (file #${chunk[2]}); starting over...', [fu]);
                        this.uploadfailed(fu, -13);
                        return;
                    }
                    if (fu.havelastchunkconfirmation) {
                        this.logger.warn('Duplicate end-of-file ack (file #${chunk[2]}); starting over...', [fu]);
                        this.uploadfailed(fu, -12);
                        return;
                    }
                    fu.havelastchunkconfirmation = this.seconds;
                }

                if (fu.bytesuploaded >= fu.reader.file.size
                    && !fu.needsizeconfirmation && !fu.havelastchunkconfirmation) {

                    // the file has been fully uploaded, but
                    // the server is telling us that it thinks it will send more confirmations
                    // this means that the server has lost its state
                    if (self.d) {
                        this.logger.warn(`Server has lost the plot (file #${chunk[2]}); starting over...`, [fu]);
                    }
                    this.uploadfailed(fu, -8);
                }
            }
        }

        flush(ws, fileno, offset) {
            let chunk = null;

            // remove from chunksonthewire - most likely located at the beginning
            for (let i = 0; i < ws.chunksonthewire.length; i++) {
                if (ws.chunksonthewire[i][0] === offset && ws.chunksonthewire[i][2] === fileno) {
                    chunk = ws.chunksonthewire.splice(i, 1)[0];
                    assert(ws.pool.chunksinflight-- > 0);
                    break;
                }
            }

            if (!chunk) {
                this.logger.error(`Server confirmed chunk not in flight: File #${fileno}@${offset}`);
            }

            return chunk;
        }

        // this loop is responsible for maintaining the (standby) connections and pumping data during transfers
        // since WebSocket doesn't have an onbufferempty(), we need
        // to busy-loop with adaptive frequency to keep the data flowing)
       async run(val = 500) {

            if (!this.poolmgr.pools.length) {
                this.poolmgr.refreshpools()
                    .catch((ex) => {
                        M.uscex(ex);
                        this.running = null;
                        this.logger.error(ex);
                    });
            }
            const pid = this.running = ++mIncID;

            while (1) {
                await sleep(val / 1e3);
                this.seconds += val / 1e3;

                if (pid !== this.running) {
                    break;
                }
                if (this.poolmgr.pumpdata(this)) {
                    // (40 ms and 2 MB WebSocket buffers should be fast enough?)
                    val = val * 0.75 + 10;
                }
            }

            return pid;
        }

        stop() {
            if (this.running && !this.poolmgr.files) {
                if (self.d) {
                    this.logger.info('Entered idle state.');
                }
                this.running = false;

                // maintain one stand-by connection per pool
                for (let i = this.poolmgr.pools.length; i--; ) {
                    this.poolmgr.pools[i].numconn = 1;
                    this.poolmgr.pools[i].closexconn();
                }
            }
        }

        uploadfailed(fu, reason) {
            const {reader: {file}, fileno} = fu;

            this.logger.error(`File #${fileno} failed to upload`, reason, [fu]);

            reason = ulmanager.ulStrError(reason) || reason;

            fu.destroy();
            ulmanager.restart(file, reason);
        }

        uploadcomplete(fu, response) {

            if (!response.byteLength || response.byteLength === 36) {
                const {reader: {file}} = fu;
                const {ul_key, ul_macs, owner: {gid} = false, xput} = file;

                if (!gid || ulmanager.ulCompletingPhase[gid]) {
                    this.logger.error(`[${gid}] how we got here?`, this, fu, response);
                    return;
                }

                if (self.u_k_aes || xput) {
                    const t = Object.keys(ul_macs)
                        .map(Number)
                        .sort((a, b) => a - b);

                    for (let i = 0; i < t.length; i++) {
                        t[i] = ul_macs[t[i]];
                    }
                    const u8 = new Uint8Array(response);
                    const mac = condenseMacs(t, ul_key);

                    file.filekey = [
                        ul_key[0] ^ ul_key[4],
                        ul_key[1] ^ ul_key[5],
                        ul_key[2] ^ mac[0] ^ mac[1],
                        ul_key[3] ^ mac[2] ^ mac[3],
                        ul_key[4],
                        ul_key[5],
                        mac[0] ^ mac[1],
                        mac[2] ^ mac[3]
                    ];
                    file.response = u8[35] === 1 ? ab_to_base64(response) : ab_to_str(response);

                    this.stop();
                    return ulmanager.ulFinalize(file);
                }
            }
            else if (self.d) {
                this.logger.error(`Invalid upload response received`, response);
            }

            return this.uploadfailed(fu, ab_to_str(response));
        }

        // enqueue upload and start sending data
        upload(file) {
            this.run().catch(reportError);

            this.fileno++;
            this.poolmgr.assignfile(new WsFileUpload(file, this.fileno));
        }
    }

    return new WsUploadMgr();
});

factory.define('file-list', () => {
    'use strict';

    const reportError = (ex) => {

        if (ex && ex.name !== 'NotFoundError') {

            self.reportError(ex);
        }
        else if (self.d) {

            console.warn(ex);
        }
    };

    const pushFile = (data, file, path) => {
        if (file) {
            if ((path = String(path || file.webkitRelativePath || file.path || '')).includes(file.name)) {
                const p = path.split(/[/\\]/);
                const i = p.length - 1;
                if (p[i] === file.name) {
                    p.splice(i, 1);
                }
                path = `${p.join('/')}`;
            }
            if (file.path !== path) {
                Object.defineProperty(file, 'path', {
                    value: path,
                    writable: true,
                    configurable: true
                });
            }
            data.files.push(file);
        }
    };

    const addFiles = (data, files) => {
        if (Symbol.iterator in files) {
            files = [...files];
        }
        for (let i = files.length; i--;) {
            pushFile(data, files[i]);
            data.paths[files[i].path] = -1;
        }
    };

    const getFile = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));
    const getEntries = (reader) => new Promise((resolve, reject) => reader.readEntries(resolve, reject));

    const traverse = async(data, entry, path = "", symlink = null) => {

        if (entry.isFile) {
            pushFile(data, await getFile(entry).catch(reportError) || symlink && symlink.getAsFile(), path);
        }
        else if (entry.isDirectory) {
            const p = [];
            const reader = entry.createReader();

            path = `${path + entry.name}/`;
            data.paths[path] = 0;

            while (1) {
                const entries = await getEntries(reader).catch(reportError);
                if (!(entries && entries.length)) {
                    break;
                }
                data.paths[path] += entries.length;

                for (let i = entries.length; i--;) {
                    p.push(traverse(data, entries[i], path));
                }
            }
            return Promise.all(p);
        }
    };

    return freeze({
        getFile,
        getEntries,
        async getFileList(event, flt = echo) {
            const data = {files: [], paths: Object.create(null)};
            const {dataTransfer: {files, items = !1} = false} = event || !1;

            if (items.length && items[0].webkitGetAsEntry) {
                const p = [];

                for (let i = items.length; i--;) {
                    const entry = tryCatch(() => items[i].webkitGetAsEntry())();
                    if (entry) {
                        p.push(traverse(data, entry, '', entry.isFile && items[i]).catch(reportError));
                    }
                }
                await Promise.all(p);

                data.empty = Object.keys(data.paths).filter((p) => data.paths[p] < 1);
            }
            else if (files || event) {
                addFiles(data, files || event.files || event.target && event.target.files || event);
            }
            const res = data.files.filter(flt);

            res.sort((a, b) => a.size < b.size ? -1 : 1);

            return Object.defineProperties(res, {
                paths: {
                    value: data.paths
                },
                empty: {
                    value: data.empty || []
                }
            });
        }
    });
});

factory.define('pbkdf2', () => {
    'use strict';
    const te = new TextEncoder('utf-8');
    const TypedArray = Object.getPrototypeOf(Uint16Array);

    const assert = (expr, message = 'unexpected data type or length.') => {
        if (!expr) {
            throw new TypeError(message);
        }
    };

    return freeze({
        async sha256(payload, salt, iterations = 1e5) {
            const algo = {
                salt,
                iterations,
                name: 'PBKDF2',
                hash: 'SHA-256'
            };
            if (typeof payload === 'string') {
                payload = te.encode(payload.trim());
            }
            assert(salt instanceof TypedArray && salt.byteLength > 15);
            assert(payload instanceof TypedArray && payload.byteLength);

            const key = await crypto.subtle.importKey('raw', payload, algo.name, false, ['deriveBits']);

            return crypto.subtle.deriveBits(algo, key, 256);
        }
    });
});

factory.define('mkdir', () => {
    'use strict';
    const kind = Symbol('~\\:<p*>');
    const {getSafePath} = factory.require('safe-path');

    const SAFEPATH_SEP = '\u241c\u2063\u2d70';
    const SAFEPATH_SOP = 0x100001 | ~~(Math.random() * 0xffff);

    // paths walker to create hierarchy
    const traverse = (paths, s) => {
        const p = paths.shift();

        if (p) {
            s = traverse(paths, s[p] = s[p] || Object.create(null));
        }
        return s;
    };

    const walk = (paths) => {
        const res = Object.create(null);

        if (paths instanceof FileList) {
            paths = [...paths].map((o) => o.path);
        }
        if (!Array.isArray(paths)) {
            paths = typeof paths === 'object' ? Object.keys(paths) : [paths];
        }

        // create folder hierarchy
        for (let i = paths.length; i--;) {
            const value = paths[i];
            const path = String(value).codePointAt(0) === SAFEPATH_SOP
                ? value.slice(2).split(SAFEPATH_SEP)
                : getSafePath(value);

            Object.defineProperty(traverse(path, res), kind, {value});
        }

        return res;
    };

    return freeze({
        kind,
        walk,
        SAFEPATH_SEP,
        SAFEPATH_SOP: String.fromCodePoint(SAFEPATH_SOP),

        async mkdir(target, paths, stub) {
            const {promise, resolve, reject} = Promise.withResolvers();

            if (!Array.isArray(paths)
                && Symbol.iterator in paths) {

                paths = [...paths];
            }
            if (Array.isArray(paths)) {
                const tmp = Object.create(null);
                for (let i = paths.length; i--;) {
                    const p = paths[i];
                    const t = p && p.path || typeof p === 'string' && p;
                    if (t) {
                        tmp[t] = null;
                    }
                }
                paths = tmp;
            }
            let folders = Object.keys(paths);
            const tree = walk(folders);

            folders = folders.length;
            (function _mkdir(s, t) {
                Object.keys(s).forEach((name) => {
                    stub(t, name)
                        .then((h) => {
                            const c = s[name]; // children for the just created folder
                            if (c[kind]) {
                                console.assert(paths[c[kind]] === null);

                                // record the created folder node handle
                                paths[c[kind]] = h;
                                folders--;
                            }
                            queueMicrotask(_mkdir.bind(null, c, h));
                        })
                        .catch(reject);
                });
                return !folders && resolve(paths);
            })(tree, target);

            return promise;
        }
    });
});

factory.define('safe-name', () => {
    'use strict';

    return freeze({
        getSafeName(name) {
            // http://msdn.microsoft.com/en-us/library/aa365247(VS.85)
            name = `${name}`.replace(/["*/:<>?\\|]+/g, '.');

            if (name.length > 240) {
                name = `${name.slice(0, 240)}.${name.split('.').pop()}`;
            }
            name = name.replace(/[\t\n\v\f\r\u200E\u200F\u202E]+/g, ' ');

            let end = name.lastIndexOf('.');
            end = ~end && end || name.length;
            if (/^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(name.slice(0, end))) {
                name = `!${name}`;
            }
            return name;
        }
    });
});

factory.define('safe-path', () => {
    'use strict';
    const {getSafeName} = factory.require('safe-name');

    return freeze({
        getSafePath(path, file) {
            const res = `${path || ''}`.split(/[/\\]+/).map(getSafeName).filter(String);
            if (file) {
                res.push(getSafeName(file));
            }
            return res;
        }
    });
});

/** @property T.ui.breadcrumbs */
lazy(T.ui, 'breadcrumbs', () => {
    'use strict';

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };

    const ce = (n, t, a) => mCreateElement(n, a, t);

    return freeze({
        data: {
            cn: null, // Breadcrumbs container
            fs: 14, // Breadcrumb font-size
            itn: null // Breadcrumbs Item container
        },

        init(h, wrap) {

            if (!wrap || !M.d[h]) {
                return false;
            }

            wrap.textContent = '';

            this.data.cn = ce('nav', wrap, {
                'aria-label': 'Breadcrumbs',
                class: 'it-breadcrumbs'
            });

            this.data.itn = ce('ol', this.data.cn, { class: 'items-body' });

            this.data.fs = parseFloat(window.getComputedStyle(this.data.itn, null)
                .getPropertyValue('font-size'));

            this.render(h);

            // @todo: improve
            window.onresize = () => {
                this.render(h);
            };
        },

        render(h) {
            const items = M.getPath(h);
            const extraItems = [];
            const maxPathLength = this.data.cn.offsetWidth / (this.data.fs / 1.5);
            let currentPathLength = 0;

            this.data.itn.textContent = '';

            for (var i = 0; i < items.length - 1; i++) {
                const n = M.d[items[i]];

                if (!n) {
                    continue;
                }

                const {name} = n;
                currentPathLength += name.length;

                if (i !== 0 && currentPathLength > maxPathLength) {
                    extraItems.push(n);
                }
                else {
                    this.renderItem(n);
                }
            }

            // @todo: improve
            this.renderDropdownItems(extraItems);
            this.renderItem(M.d[items[items.length - 1]], true);
        },

        renderItem(n, icon) {
            const item = ce('li', undefined, { class: 'item' });
            const dn = ce('a', item, { href: '' });

            dn.addEventListener('click', (e) => this.bindItemClick(e, n));

            // Render first link node (item only)
            if (icon) {
                ce('i', dn, { class: 'sprite-it-x16-mono icon-link'});
            }
            else {
                ce('i', dn, { class: 'sprite-it-x16-mono icon-arrow-small-right'});
                ce('span', dn).textContent = n.name || '';
            }

            this.data.itn.prepend(item);
        },

        renderDropdownItems(items) {
            if (!items.length) {
                return false;
            }

            const item = ce('li', this.dropdown, { class: 'item' });
            const dropdown = ce('div', item, { class: 'it-dropdown-body js-dropdown' });
            const dn = ce('a', item, { class: 'js-select-button', href: '' });

            ce('i', dn, { class: 'sprite-it-x16-mono icon-arrow-small-right' });
            ce('span', dn).textContent = '...';

            this.data.itn.prepend(item);

            // Render extra items
            for (var i = 0; i < items.length; i++) {
                const n = items[i];
                const btn = ce('button', dropdown, { class: 'js-option it-radio-label btn-type' });

                ce('span', btn, { class: 'name' }).textContent = n.name || '';
                btn.addEventListener('click', (e) => this.bindItemClick(e, n));
            }

            // Init dropdown
            T.ui.dropdown.init(item);
        },

        bindItemClick(e, n) {
            stop(e);

            if (!n) {
                return false;
            }

            T.ui.viewFilesLayout.init(n.xh, n.h).catch(tell);
        }
    });
});

/** @property T.ui.loader */
lazy(T.ui, 'loader', () => {
    'use strict';

    const ce = (n, t, a) => mCreateElement(n, a, t);

    return freeze({
        data: Object.create(null),

        // @todo: T.ui.overlay
        init() {
            const cn = document.querySelector('body > .global-overlay-container')
                || ce('div', 'body', { class: 'global-overlay-container' });

            this.data.overlay = cn.querySelector('.it-overlay')
                || ce('div', cn, { class: 'it-overlay hidden' });

            this.data.spinner = cn.querySelector('.it-loading-spinner')
                || ce('div', cn, { class: 'it-loading-spinner' });
        },

        hide() {
            if (!this.data.overlay) {
                return false;
            }

            this.data.overlay.classList.add('hidden');
            this.data.spinner.classList.add('hidden');
        },

        show() {
            if (!this.data.overlay || !this.data.overlay.closest('body')) {
                this.init();
            }

            this.data.overlay.classList.remove('hidden');
            this.data.spinner.classList.remove('hidden');
        }
    });
});

(function($) {
    'use strict';

    /**
     * Super simple, performance-wise and minimal tooltip utility.
     * This "tooltip tool" saves on DOM nodes and event handlers, since it:
     * 1) Uses delegates, so 1 event handler for unlimited amount of dynamically added tooltips in the UI. #performance
     * 2) Does not require extra DOM elements (e.g. total # of DOM elements < low = performance improvement)
     * 3) Its clever enough to reposition tooltips properly, w/o adding extra dependencies (except for jQuery UI, which
     * we already have), e.g. better then CSS :hover + .tooltip { display: block; }
     * 4) It supports dynamic content updates, based on the current state of the control -- for example, when
     * interacting with given control, the tooltip content may automatically re-render, e.g. `Mute` -> `Unmute`.
     * 5) Its minimal. < 200 lines of code.
     *
     * Note: Uses jQuery UI's position() to position the tooltip on top or bottom, if out of viewport. By default -
     * would, try to position below the target element.
     */

    /**
     * How to use:
     * 1) Add "simpletip" class name to any element in the DOM
     * 2) To set the content of the tooltip, pass an attribute w/ the text named `data-simpletip`
     * Example:
     * ```<a href="#" class="simpletip" data-simpletip="Hello world!">Mouse over me</a>```
     * or setting optional classname `simpletip-tc` on the element without data attribute to simply using text contents
     * ```<a href="#" class="simpletip simpletip-tc">Mouse over me</a>```
     *
     * Optionally, you can control:
     * A) The wrapper in which the tooltip should try to fit in (and position on top/bottom, depending on whether there
     * is enough space) by passing a selector that matches a parent of the element in attribute named
     * `data-simpletipwrapper`
     * Example:
     * ```<a href="#" class="simpletip" data-simpletip="Hey!" data-simpletipwrapper="#call-block">Mouse over me</a>```
     *
     * B) Change the default position to be "above" (top) of the element, instead of bottom/below by passing attribute
     * `data-simpletipposition="top"`
     * Example:
     * ```<a href="#" class="simpletip" data-simpletip="Hey! Show on top, if I fit"
     *      data-simpletipposition="top">Mouse over me</a>```
     * The tooltip can also be placed to the "left", "right", or can detect the direction using "start" and "end".
     *
     * C) Manually add extra top/bottom offset by passing `data-simpletipoffset="10"`
     * Example:
     * ```<a href="#" data-simpletip="Hey! +/-20px offset for this tip." data-simpletipoffset="20">Mouse over me</a>```
     *
     * D) Add any custom styling to tooltip by adding style class e.g. .medium-width for max-width: 220px;,
     * .center-align for text-align: center;
     * Example:
     * ```
     *    <a href="#" data-simpletip="Hey! custom style." data-simpletip-class="medium-width center-align">
     *        Mouse over me
     *    </a>
     * ```
     *
     * E) Add any custom class to tooltip by `data-simpletip-class='custom-class'`
     * Example:
     * ```<a href="#" data-simpletip="Hey! custom class" data-simpletip-class='small-tip'>Mouse over me</a>```
     *
     * How to trigger content update:
     * 1) Create new instance of the simpletip that contains conditional `data-simpletip` attribute.
     * ```<a href="#" data-simpletip={condition ? 'Mute' : 'Unmute' }></a>```
     * 2) On state update, invoke `simpletipUpdated` event trigger on the `.simpletip` element.
     * ```$('.simpletip').trigger('simpletipUpdated');```
     *
     * How to trigger manual unmount:
     * On state update, invoke `simpletipClose` event trigger on the `.simpletip` element.
     * ```$('.simpletip').trigger('simpletipClose');```
     */

    var $template = $(
        '<div class="simpletip-tooltip">' +
        '<span></span>' +
        '<i class="tooltip-arrow"></i>' +
        '</div>'
    );

    var $currentNode;
    var $currentTriggerer;
    var SIMPLETIP_UPDATED_EVENT = 'simpletipUpdated.internal';
    var SIMPLETIP_CLOSE_EVENT = 'simpletipClose.internal';

    var sanitize = function(contents) {
        return escapeHTML(contents).replace(/\[BR]/g, '<br>')
            .replace(/\[I class=&quot;([\w- ]*)&quot;]/g, `<i class="$1">`)
            .replace(/\[I]/g, '<i>').replace(/\[\/I]/g, '</i>')
            .replace(/\[B]/g, '<b>').replace(/\[\/B]/g, '</b>')
            .replace(/\[U]/g, '<u>').replace(/\[\/U]/g, '</u>')
            .replace(/\[G]/g, '<span class="gray-text">')
            .replace(/\[\/G]/g, '</span>')
            .replace(/\[A]/g, '<a>')
            .replace(/\[\/A]/g, '</a>');
    };

    var unmount = function() {
        if ($currentNode) {
            $currentNode.remove();
            $currentNode = null;
            $currentTriggerer.unbind(SIMPLETIP_UPDATED_EVENT);
            $currentTriggerer.unbind(SIMPLETIP_CLOSE_EVENT);
            $currentTriggerer = null;
        }
    };

    const calculateOffset = (info, $this) => {
        let topOffset = 0;
        let leftOffset = 0;
        let offset = 10;      // 7px === height of arrow glyph
        if ($this.attr('data-simpletipoffset')) {
            offset = parseInt($this.attr('data-simpletipoffset'), 10) + 10;
        }

        if (info.vertical === 'top') {
            topOffset = offset;
        }
        else if (info.vertical === 'bottom') {
            topOffset = -offset;
        }
        else if (info.horizontal === 'left') {
            leftOffset = offset;
        }
        else if (info.horizontal === 'right') {
            leftOffset = -offset;
        }

        return { leftOffset, topOffset };
    };


    /**
     * Converts relative start/end positioning to absolute left/right positioning
     *
     * @param {string} tipPosition the specified position of the tooltip
     * @returns {string} the absolute direction of the tooltip
     */
    const getTipLRPosition = tipPosition => {
        if ($('body').hasClass('rtl')) {
            if (tipPosition === 'start') {
                tipPosition = 'right';
            }
            else if (tipPosition === 'end') {
                tipPosition = 'left';
            }
        }
        else if (tipPosition === 'start') {
            tipPosition = 'left';
        }
        else if (tipPosition === 'end') {
            tipPosition = 'right';
        }

        return tipPosition;
    };

    $(document.body).rebind('mouseenter.simpletip', '.simpletip', function() {
        var $this = $(this);
        if ($currentNode) {
            unmount();
        }

        if ($this.is('.deactivated') || $this.parent().is('.deactivated')) {
            return false;
        }

        var contents = $this.hasClass('simpletip-tc') ? $this.text() : $this.attr('data-simpletip');

        if (contents) {
            const $node = $template.clone();
            const $textContainer = $('span', $node);
            $textContainer.safeHTML(sanitize(contents));
            // Handle the tooltip's text content updates based on the current control state,
            // e.g. "Mute" -> "Unmute"
            $this.rebind(SIMPLETIP_UPDATED_EVENT, () => {
                $textContainer.safeHTML(
                    sanitize($this.attr('data-simpletip'))
                );
            });
            $this.rebind(SIMPLETIP_CLOSE_EVENT, () => {
                unmount();
            });
            document.body.appendChild($node[0]);

            $currentNode = $node;
            $currentTriggerer = $this;
            let wrapper = $this.attr('data-simpletipwrapper') || '';
            if (wrapper) {
                wrapper += ",";
            }

            const customClass = $this.attr('data-simpletip-class');
            if (customClass) {
                $currentNode.addClass(customClass);
            }

            /*
             * There are four main positions of the tooltip:
             * A) The default position is below the hovered el and horizontally centered.
             *      The tooltip may be flipped vertically or moved along the horizontal axis
             *      if there is not enough space in container
             * B) "top" data-simpletipposition value places the tooltip above the hovered el.
             *      The tooltip may be flipped vertically back or moved along the horizontal axis
             *      if there is not enough space in container
             * C) "left" data-simpletipposition value places the tooltip to the left of the target.
             *      The tooltip is centered  vertically and may be flipped horizontally
             *      if there is not enough space in container
             * D) "right" data-simpletipposition value places the tooltip to the right of the target.
             *      The tooltip is centered  vertically and may be flipped horizontally
             *      if there is not enough space in container
            */

            /* Default top position (case A) */
            let my = 'center bottom';
            let at = 'center top';
            const tipPosition = getTipLRPosition($this.attr('data-simpletipposition'));

            switch (tipPosition) {
                /* Top position (case B) */
                case 'top':
                    my = 'center bottom';
                    at = 'center top';
                    break;
                /* Top position (case C) */
                case 'left':
                    my = 'right center';
                    at = 'left center';
                    break;
                /* Top position (case D) */
                case 'right':
                    my = 'left center';
                    at = 'right center';
                    break;
            }

            $node.position({
                of: $this,
                my,
                at,
                collision: 'flipfit',
                within: $this.parents(wrapper ? `${wrapper} body` : '.ps, body').first(),
                using(obj, info) {

                    /*
                     * Defines the positions on the tooltip Arrow and target.
                     * Delault position on the tooltip Arrow is left top.
                     * Delault position on the target is right bottom.
                     * We don't use centering to avoid special conditions after flipping.
                    */
                    let myH = 'left';
                    let myV = 'top';
                    let atH = 'right';
                    let atV = 'bottom';

                    /*
                     * The condition when tooltip is placed to the left of the target (case C),
                     * For condition C to be met, the tooltip must be vertically centered.
                     * Otherwise, it will mean that we have case A or B, and the tooltip
                     * The position on the arrow is right and the position on target is left.
                    */
                    if (info.horizontal === 'right') {
                        myH = 'right';
                        atH = 'left';
                    }
                    // Case D, or case A or B, and the tooltip  just moves along the horizontal.
                    else if (info.horizontal === 'left') {
                        myH = 'left';
                        atH = 'right';
                    }

                    // Case A, tooltip is placed below the target.
                    if (info.vertical === 'top') {
                        myV = 'top';
                        atV = 'bottom';
                    }
                    // Case B, tooltip is placed above the target.
                    else if (info.vertical === 'bottom') {
                        myV = 'bottom';
                        atV = 'top';
                    }
                    // Case C or D, tooltip is placed to the left/right and vertically centered.
                    else {
                        myV = 'center';
                        atV = 'center';
                    }

                    // Set new positions on the tooltip Arrow and target.
                    my = `${myH} ${myV}`;
                    at = `${atH} ${atV}`;

                    this.classList.add('visible');

                    const { leftOffset, topOffset} = calculateOffset(info, $this);

                    $(this).css({
                        left: `${obj.left + leftOffset}px`,
                        top: `${obj.top + topOffset}px`
                    });
                }
            });

            // Calculate Arrow position
            var $tooltipArrow = $('.tooltip-arrow', $node);

            $tooltipArrow.position({
                of: $this,
                my,
                at,
                collision: 'none',
                using(obj, info) {
                    let { top, left } = obj;

                    /*
                     * If Case A or B (ie tooltip is placed to the top/bottom), then
                     * we need to take into account the horizontal centering of the arrow
                     * in relation to the target, depending on the width of the arrow
                    */
                    const horizontalOffset = info.vertical === 'middle' ? 0 : $this[0].offsetWidth / 2;

                    // Horizontal positioning of the arrow in relation to the target
                    if (info.horizontal === 'left') {
                        left -= $tooltipArrow[0].offsetWidth / 2 + horizontalOffset;
                    }
                    else if (info.horizontal === 'right') {
                        left += $tooltipArrow[0].offsetWidth / 2 + horizontalOffset;
                    }

                    // Vertical positioning of the arrow in relation to the target
                    if (info.vertical === 'bottom') {
                        top += $tooltipArrow[0].offsetHeight / 2;
                    }
                    else if (info.vertical === 'top') {
                        top -= $tooltipArrow[0].offsetHeight / 2;
                    }

                    // Add special offset if set in options
                    const { leftOffset, topOffset} = calculateOffset(info, $this);

                    $(this).css({
                        left: `${left + leftOffset}px`,
                        top: `${top + topOffset}px`
                    });
                }
            });
        }
    });

    $(document.body).rebind('mouseover.simpletip touchmove.simpletip', (e) => {
        if ($currentNode && !e.target.classList.contains('simpletip')
            && !$(e.target).closest('.simpletip, .simpletip-tooltip').length > 0
            && !e.target.classList.contains('tooltip-arrow')
            && !e.target.classList.contains('simpletip-tooltip')
            && !$currentTriggerer.hasClass('manual-tip')) {
            unmount();
        }
    });
})(jQuery);

T.ui.toast = {

    init() {
        'use strict';

        let cn = document.querySelector('body > .global-toast-container');

        if (!cn) {
            cn = mCreateElement('div', { class: 'global-toast-container' }, 'body');
        }

        cn.textContent = '';

        cn = mCreateElement('div', { class: 'toast-rack top' }, cn);
        this.slot = mCreateElement('div', { class: 'toast-slot' }, cn);
        this.toast = mCreateElement('div', {
            class: 'toast',
            role: 'status'
        }, this.slot);

        this.icon = mCreateElement('i', { class: 'toast-icon hidden' }, this.toast);
        this.message = mCreateElement('span', { class: 'message' }, this.toast);
        this.button = mCreateElement('button', {
            'aria-label': 'Close',
            class: 'it-button ghost close'
        }, this.toast);
        mCreateElement('i', { class: 'it-button ghost close' }, this.button);

    },

    hide() {
        'use strict';

        if (!this.toast) {
            return false;
        }

        this.slot.classList.remove('open');
        this.toast.classList.remove('visible');
        this.slot.removeAttribute('style');
        this.toast.dataset.id = '';
    },

    show(classname, content, timeout) {
        'use strict';

        if (!content) {
            return false;
        }

        if (!this.toast) {
            this.init();
        }

        if (this.toast.dataset.id) {
            clearTimeout(parseInt(this.toast.dataset.id));
        }

        this.icon.className = `toast-icon ${classname || 'hidden'}`;
        this.message.textContent = content;
        this.slot.style.setProperty('--toast-height', getComputedStyle(this.toast).height);
        this.slot.classList.add('open');
        this.toast.classList.add('visible');

        this.toast.dataset.id = setTimeout(() => this.hide(), parseInt(timeout) || 2000);

        this.button.addEventListener('click', () => {
            clearTimeout(parseInt(this.toast.dataset.id));
            this.hideToast();
        });
    }
};

// Global theme functions
(() => {
    'use strict';

    // the MediaQueryList relating to the system theme
    let query = null;

    /**
     * Sets the theme class on the html
     *
     * @param {*} theme - the name of the theme class
     * @return {undefined}
     */
    const setThemeClass = function(theme) {
        const themeClass = `theme-${theme}`;

        if (!document.documentElement.classList.contains(themeClass)) {
            document.documentElement.classList.remove('theme-dark', 'theme-light');
            document.documentElement.classList.add(`theme-${theme}`);
        }

        const switchBtn = document.querySelector('header.page-header .js-set-theme');

        if (switchBtn) {
            if (theme === 'dark') {
                switchBtn.querySelector('i').className = 'sprite-it-x24-mono icon-sun';
            }
            else {
                switchBtn.querySelector('i').className = 'sprite-it-x24-mono icon-moon';
            }
        }
    };

    /**
     * The event listener, used for add/remove operations
     *
     * @param {object} e - the event object
     * @return {undefined}
     */
    const listener = function(e) {
        if (e.matches) {
            setThemeClass('dark');
        }
        else {
            setThemeClass('light');
        }
    };

    /**
     * Set based on the matching system theme.
     * @returns {void}
     */
    const setByMediaQuery = () => {
        query = window.matchMedia('(prefers-color-scheme: dark)');

        if (query.addEventListener) {
            query.addEventListener('change', listener);
        }
        else if (query.addListener) { // old Safari
            query.addListener(listener);
        }

        if (query.matches) {
            setThemeClass('dark');
        }
        else {
            setThemeClass('light');
        }
    };


    /**
     * Check if the dark mode theme is currently applied
     *
     * @returns {boolean} If the dark theme is applied
     */
    T.ui.isDarkTheme = () => {
        const {classList} = document.documentElement;
        return classList.contains('theme-dark') || classList.contains('theme-dark-forced');
    };


    /**
     * Sets the current theme, by value
     * Does not store the change to localStorage, purely presentational.
     *
     * @param {*} [value] the value of the theme to set [0/"0":  follow system, 1/"1": light, 2/"2": dark]
     * @return {undefined}
     */
    T.ui.setTheme = (value) => {
        if (query) {
            if (query.removeEventListener) {
                query.removeEventListener('change', listener);
            }
            else if (query.removeListener) { // old Safari
                query.removeListener(listener);
            }
        }

        if (value === undefined) {
            value = (localStorage.webtheme || window.u_attr && u_attr['^!webtheme']) | 0;
            if (!value && u_type === false) {
                value = self.darkloader ? 2 : 1;
            }
        }
        else {
            value = Math.max(0, value | 0);

            if (value < 3) {
                if (window.u_attr && mega.attr) {
                    mega.attr.set('webtheme', value, -2, 1);
                    delete localStorage.webtheme;
                }
                else {
                    localStorage.webtheme = String(value);
                }
            }
        }

        if (value === 2) {
            setThemeClass('dark');
        }
        else if (value !== 1 && window.matchMedia) {
            setByMediaQuery();
        }
        else {
            // if the browser doesn't support matching the system theme, set light mode
            setThemeClass('light');
        }
    };
})();

/** @property T.ui.page */
lazy(T.ui, 'page', () => {
    'use strict';

    document.title = 'Transfer.it';
    document.documentElement.classList.add('transferit-vars');
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-dark-forced');
    document.body.removeAttribute('style');
    document.body.textContent = '';

    if (({'fa': 1,'ar': 1,'he': 1})[lang]) {
        document.body.classList.add('rtl');
    }
    document.body.classList.add(lang);

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };
    const div = (...a) => mCreateElement('div', ...a);
    let cn = div({class: 'page-body'}, div({class: 'global-page-container'}, 'body'));

    const header = mCreateElement('header', {class: 'page-header'}, cn);
    const content = mCreateElement('div', {class: 'page-content'}, cn);
    const footer = mCreateElement('footer', {class: 'page-footer'}, cn);

    T.ui.appendTemplate('js_ui_transfer_header', header);
    T.ui.appendTemplate('js_ui_transfer_footer', footer);
    T.ui.appendTemplate('js_ui_transfer_content', content);
    T.ui.pageHeader.init();

    // @todo: create T.ui.overlay
    cn = document.querySelector('body > .global-overlay-container')
        || mCreateElement('div', { class: 'global-overlay-container' }, 'body');
    T.ui.appendTemplate('js_ui_transfer_overlays', cn);

    mCreateElement('div', {class: 'global-toast-container'}, 'body');

    mCreateElement('textarea', {
        id: 'chromeclipboard',
        readonly: 'readonly',
        title: 'copy',
    }, 'body').inert = true;

    // Lock DnD
    document.addEventListener('dragover', stop);
    document.addEventListener('drop', stop);

    return freeze({
        get content() {
            return content;
        },

        get footer() {
            return footer;
        },

        async safeLeave() {
            if (T.ui.addFilesLayout.hasTransfers) {
                const res = await T.ui.confirm(l[377]);
                if (res !== true) {
                    return false;
                }
                ulmanager.abort(null);
                delete T.ui.addFilesLayout.data.files;
            }
            return true;
        },

        showSection(cn, path, subpage) {
            // Update history
            if (typeof path === 'string' && getSitePath() !== `/${path}`) {
                pushHistoryState(path);
            }

            // Update active states of header buttons
            for (const elm of header.querySelectorAll(`.it-button[data-page]`)) {
                if (elm.dataset.page === path) {
                    elm.classList.add('active');
                }
                else {
                    elm.classList.remove('active');
                }
            }

            // Show section
            if (cn && cn.classList.contains('hidden')) {
                const cns = content.querySelectorAll('.it-box-holder');
                for (let i = 0; i < cns.length; i++) {
                    cns[i].classList.add('hidden');
                }
                cn.classList.remove('hidden');
            }

            // Update UI for main and sub-sections
            // @todo: appendTemplate
            if (subpage) {
                document.body.classList.add('subpage');
                footer.querySelector('.js-main-footer').classList.add('hidden');
                footer.querySelector('.js-subpage-footer').classList.remove('hidden');

                const yn = footer.querySelector('.js-ft-year');
                if (yn) {
                    yn.textContent = new Date().getFullYear();
                }
            }
            else {
                const [p] = getSitePath().replace(/^\/+/, '').split(/[^\w-]/);
                document.body.classList.remove('subpage');
                footer.querySelector('.js-main-footer').classList.remove('hidden');
                footer.querySelector('.js-report-abuse').classList[p === 't' ? 'remove' : 'add']('hidden');
                footer.querySelector('.js-subpage-footer').classList.add('hidden');
            }
        }
    });
});

/** @property T.ui.pageHeader */
lazy(T.ui, 'pageHeader', () => {
    'use strict';

    const cn = document.querySelector('.page-header');
    const avatar = cn.querySelector('.js-avatar');
    const compareBtn = cn.querySelector('.js-compare-btn');
    const dashboardBtn = cn.querySelector('.js-dashboard-btn');
    const featuresBtn = cn.querySelector('.js-features-btn');
    const loginBtn = cn.querySelector('.js-login-btn');
    const menuBtn = cn.querySelector('.js-menu-btn');

    const ce = (n, t, a) => mCreateElement(n, a, t);

    T.ui.setTheme();

    // Logo
    cn.querySelector('.it-logo').addEventListener('click', (e) => {
        e.preventDefault();
        T.ui.loadPage('start');
    });

    // Open page btns
    for (const elm of cn.querySelectorAll('button[data-page]')) {
        elm.addEventListener('click', () => T.ui.loadPage(elm.dataset.page));
    }

    // Login btn
    loginBtn.addEventListener('click', () => T.ui.loginDialog.show());

    // Menu btn
    menuBtn.addEventListener('click', () => T.ui.navDialog.show());
    menuBtn.classList.remove('hidden');

    return freeze({
        get cn() {
            return cn;
        },

        get is_logged() {
            return self.u_sid && self.u_type > 0;
        },

        init() {
            // Show/hide Logged in UI
            if (this.is_logged) {
                compareBtn.classList.add('hidden');
                featuresBtn.classList.add('hidden');
                loginBtn.classList.add('hidden');

                avatar.classList.remove('hidden');
                dashboardBtn.classList.remove('hidden');

                this.updateAccountData(cn);
            }
            else {
                compareBtn.classList.remove('hidden');
                featuresBtn.classList.remove('hidden');
                loginBtn.classList.remove('hidden');

                avatar.classList.add('hidden');
                dashboardBtn.classList.add('hidden');
            }
        },

        emplaceAvatarImage(target, {u}) {
            // @todo _colors[] support / fallback?

            api.req({a: 'uga', ua: '+a', u})
                .then(({result: res}) => {
                    const src = res.length > 5 && mObjectURL([base64_to_ab(res)], 'image/jpeg');
                    if (src) {
                        const img = ce('img', target, {class: 'hidden'});
                        img.onload = () => img.classList.remove('hidden');
                        img.src = src;
                    }
                })
                .catch(dump);
        },

        updateAccountData(target) {
            const u = M.getUser(u_handle);
            const avatarNodes = target.querySelectorAll('.js-avatar');
            const accNode = target.querySelector('.js-acc-info');
            const name = u.fullname || u.name || '';

            if (accNode) {
                accNode.querySelector('.name').textContent = name;
                accNode.querySelector('.email').textContent = u.email;
            }

            const L = name.replace(/^\W+/, '')[0];

            for (let i = avatarNodes.length; i--;) {
                const n = avatarNodes[i];

                this.emplaceAvatarImage(n, u);
                n.querySelector('span').textContent = L;
            }
        }
    });
});

/** @property T.ui.dashboardLayout */
lazy(T.ui, 'dashboardLayout', () => {
    'use strict';

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };

    const fmtym = tryCatch((y, m, locale = navigator.language) => {
        const date = new Date(y | 0, (m | 0) - 1);
        return new Intl.DateTimeFormat(locale, {month: 'long', year: 'numeric'}).format(date);
    });
    const ce = (n, t, a) => mCreateElement(n, a, t);
    const ago = tryCatch((ts, locale = navigator.language) => {
        if (self.Intl && Intl.RelativeTimeFormat) {
            const dd = Math.floor(Date.now() / 1e3 - ts);
            const tf = new Intl.RelativeTimeFormat(locale, {numeric: 'auto'});
            for (let [u, s, i] of Object.entries(ago.iv)) {
                if ((i = Math.floor(dd / s)) > 0) {
                    return tf.format(-i, u);
                }
            }
            return tf.format(0, 'second');
        }
        return new Date(ts * 1e3).toISOString();
    });
    Object.defineProperty(ago, 'iv', {
        value: freeze({
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60,
            second: 1
        })
    });

    return freeze({
        data: {
            type: 'list',
            sort: {
                dir: 1,
                mode: 'date'
            }
        },
        detailsSection: Object.create(null),
        listSection: Object.create(null),

        get haveCachedData() {
            const {tfs = false, refresh} = this.data;

            this.data.refresh = false;
            return !refresh && tfs.length;
        },

        async init(ref) {
            if (!self.u_sid) {
                T.ui.loadPage('start');
                return false;
            }
            for (const elm of document.querySelectorAll(`.js-transfers-tabs button`)) {
                elm.classList.remove('active');
            }
            if (ref !== true) {
                if (ref && typeof ref === 'string') {
                    const s = tryCatch(() => document.querySelector(`.js-transfers-tabs button[data-page="${ref}"]`))();
                    if (s) {

                        s.classList.add('active');
                    }
                }
                this.data.ref = ref;
                ref = false;
            }

            this.data.cn = T.ui.page.content.querySelector('.js-dashboard-section');

            // Show section
            T.ui.page.showSection(this.data.cn, 'dashboard');

            // @todo re-render individual rows instead of 'refresh'..
            if (ref || !this.haveCachedData) {
                loadingDialog.show();
                this.data.tfs = await T.core.list()
                    .finally(() => loadingDialog.hide());
            }
            this.renderListContent();
        },

        showSubSection(cn) {
            const sn = this.data.cn.querySelectorAll('.it-box > .body > .content');
            for (const elm of sn) {
                elm.classList.add('hidden');
            }
            cn.classList.remove('hidden');
        },

        /*
         * Init Transfer list section.
        */
        initListContent() {
            const cn = this.listSection.cn = this.data.cn.querySelector('.js-list-content');
            this.listSection.menu = document.querySelector('.js-dashboard-menu');

            // Init tabs
            for (const tab of cn.querySelectorAll('.js-transfers-tabs button')) {
                tab.addEventListener('click', () => {
                    const activeBtn = tab.parentElement.querySelector('button.active');
                    if (activeBtn) {
                        activeBtn.classList.remove('active');
                    }
                    tab.classList.add('active');

                    return this.renderListContent();
                });
            }

            // Init search input
            T.ui.input.init(cn.querySelector('#tfrs-search-input'), (ev) => {
                const {value} = ev.target || !1;
                this.renderListContent(value && value.trim().replace(/\s+/g, ' '));
            });

            // Init sorting dropodown
            T.ui.dropdown.init(cn.querySelector('.js-sorting-select'), (mode) => {
                this.data.sort.mode = mode;
                this.renderListContent();
            });

            // Change sorting order
            cn.querySelector('.js-srt-dir-btn').addEventListener('click', (e) => {
                e.currentTarget.classList.toggle('reverse');
                this.data.sort.dir = -this.data.sort.dir;
                this.renderListContent();
            });

            // Bind context menu
            this.bindActionBtnEvts(this.listSection.menu);
        },

        getFilteredTransfers(flt) {
            const res = [];
            const {sort: {dir, mode}, tfs} = this.data;

            flt = tfs.filter((n) => {
                if (n.a) {
                    crypto_procattr(n, base64_to_a32(n.k));
                }
                if (typeof n.t === 'string') {
                    n.name = n.t && tryCatch(() => from8(base64urldecode(n.t)))() || n.name;
                }
                n.t = 1;
                return flt(n);
            });

            if (mode === 'date') {
                flt = flt.reduce((o, n) => {
                    const d = new Date((n.ct || n.ts) * 1e3);
                    const m = `0${d.getMonth() + 1}`;
                    const k = `${d.getFullYear()}${m.slice(-2)}`;

                    (o[k] = o[k] || []).push(n);
                    return o;
                }, Object.create(null));

                const smk = Object.keys(flt).sort((a, b) => dir === 1 ? a - b : b - a);
                for (let i = smk.length; i--;) {
                    const k = smk[i];
                    const v = flt[k];
                    T.ui.sort.doSort(v, mode, dir);
                    res.push([k, v]);
                }
            }
            else if (mode === 'name') {
                res.push(['', flt]);
                T.ui.sort.doSort(flt, mode, dir);
            }

            return res;
        },

        renderListContent(aSearchBy) {
            if (!this.listSection.cn) {
                this.initListContent();
            }

            this.showSubSection(this.listSection.cn);

            const {sort: {mode: sortMode}} = this.data;
            let cn = this.listSection.cn.querySelector('.js-list-container');
            cn.textContent = '';
            cn.scrollTo({ top: 0 });
            this.data.selected = null;

            // Create list view container (Grid is coming soon)
            cn = ce('div', cn, { class: 'it-grid list-type transfers alternating-bg js-list-container' });

            const {dataset: {filter, page} = false} = this.listSection.cn.querySelector('.it-tab.active') || !1;
            const tfs = this.getFilteredTransfers((n) => {

                if (filter && !((n[filter] | 0) > 0)) {
                    return false;
                }
                if (aSearchBy) {
                    const data = [n.name];

                    if (n.xrf) {
                        data.push(n.xrf.map((o) => o.e).filter(Boolean).join('\t'));
                    }
                    if (!data.join('\v').toLowerCase().includes(aSearchBy.toLowerCase())) {
                        return false;
                    }
                }
                return true;
            });

            let added = 0;
            for (let i = 0; i < tfs.length; ++i) {
                const [ym, l] = tfs[i];

                // Add Month label for each month when sorting by date
                if (sortMode === 'date') {
                    ce('div', cn, {class: 'date-label'}).textContent = fmtym(ym.slice(0, 4), ym.slice(4));
                }

                for (let i = l.length; i--;) {
                    ++added;
                    this.renderListitem(l[i], cn);
                }
            }

            if (!added) {
                // Render an empty section
                this.renderEmptyState(filter);
            }

            if (page) {
                pushHistoryState(`dashboard/${page}`);
            }
            else {
                const s = document.querySelector(`.js-transfers-tabs button.it-tab.default`);
                if (s) {
                    s.classList.add('active');
                }
            }
        },

        renderEmptyState(fl) {
            const cn = this.listSection.cn.querySelector('.js-list-container');
            let icon = 'icon-arrow-up-circle-narrow';
            let txt = l.transferit_empty_transfers;

            if (fl === 'ac') {
                icon = 'icon-eye-narrow';
                txt = l.transferit_empty_accessed;
            }
            else if (fl === 'sched') {
                icon = 'icon-schedule-narrow';
                txt = l.transferit_empty_scheduled;
            }
            else if (fl === 'pw') {
                icon = 'icon-lock-narrow';
                txt = l.transferit_empty_pw_protected;
            }

            let wrap =  ce('div', cn, { class: 'grid-empty-content' });

            // Set icon for each section
            ce('i', wrap, { class: `sprite-it-x32-mono ${icon}` });
            ce('h5', wrap).textContent = txt;
            ce('span', wrap).textContent = l.transferit_empty_transfers_tip;

            // "New transfer" label for "All transfers" and "Go to transfers" for rest
            wrap = ce('button', wrap, { class: 'it-button' });
            ce('span', wrap).textContent = fl ?
                l.transferit_all_transfers : l.transferit_new_transfer;

            wrap.addEventListener('click', () => {
                // Open "All transfers" for filtered
                if (fl) {
                    this.listSection.cn.querySelector('.js-transfers-tabs button.default').click();
                }
                // Open start for "All transfers"
                else {
                    T.ui.loadPage('start');
                }
            });
        },

        renderListitem(n, cn) {
            const {ac, ct, ts, e, xh, xrf, size: [bytes, files]} = n;

            const item = ce('div', cn, {
                id: xh,
                tabindex: 0,
                class: 'it-grid-item'
            });
            let col = ce('div', item, { class: 'col' });

            // Item data wrap
            let wrap = ce('div', col, { class: 'info-body' });

            // Item name
            ce('div', wrap, {class: 'name js-name'})
                .textContent = n.name;

            // Itme info
            let node = ce('div', wrap, { class: 'info' });
            ce('span', node).textContent = mega.icu.format(l.album_items_count, files);
            ce('span', node).textContent = bytesToSize(bytes);
            ce('span', node, {title: new Date((ct || ts) * 1e3).toISOString()})
                .textContent = l.transferit_sent_x.replace('%1', ago(ct || ts));

            // Downloaded of not
            if (ac > 0) {
                node = ce('div', wrap, {class: 'status success'});
                ce('i', node, {class: 'sprite-it-x16-mono icon-eye'});
                ce('span', node).textContent = l.transferit_accessed;
            }
            else {
                ce('div', wrap, {class: 'status'}).textContent = l.transferit_not_accessed;
            }

            /**
            // Total downloads
            col = ce('div', item, { class: 'col' });
            wrap = ce('div', col, {
                class: 'num-label simpletip',
                'data-simpletip': 'Total downloads: %1'.replace('%1', -1),
                'data-simpletipoffset': ``
            });
            ce('i', wrap, { class: 'sprite-it-x16-mono icon-arrow-down-circle' });
            ce('span', wrap).textContent = `-1`;
            /**/

            // Sent to
            col = ce('div', item, { class: 'col' });
            wrap = ce('div', col, {
                class: 'num-label simpletip',
                'data-simpletipoffset': '10'
            });
            ce('i', wrap, { class: 'sprite-it-x16-mono icon-user-group' });
            (async(xrf, e) => {
                xrf = xrf || await T.core.getTransferRecipients(xh);
                e.textContent = xrf.length;
                e.parentNode.dataset.simpletip = mega.icu.format(l.transferit_sent_to_x, xrf.length);
                n.xrf = xrf;
                n.sched = xrf.length > 0;
            })(xrf, ce('span', wrap));

            // Total views
            col = ce('div', item, { class: 'col' });
            wrap = ce('div', col, {
                class: 'num-label simpletip',
                'data-simpletip': l.transferit_total_accesses.replace('%1', ac),
                'data-simpletipoffset': `10`
            });
            ce('i', wrap, { class: 'sprite-it-x16-mono icon-eye' });
            ce('span', wrap).textContent = ac;

            // Expires
            col = ce('div', item, { class: 'col' });
            const ed = e && ~~((e - Date.now() / 1e3) / 86400);
            ce('div', col, {class: `expires-label${ed < 0 ? ' negative' : ''}`})
                .textContent = ed < 0 ? l[8657] : ed > 0 ?
                    mega.icu.format(l.transferit_expires_in_x_days, ed) : l.transferit_never_expires;

            // Contextmenu button
            col = ce('div', item, { class: 'col' });

            node = ce('button', col, { class: 'it-button ghost js-context' });
            ce('i', node, { class: 'sprite-it-x24-mono icon-more-horizontal' });

            // Show context menu, bind evts
            this.bindItemEvents(n, item);
        },

        bindItemEvents(n, item) {
            const { menu } = this.listSection;
            const btn = item.querySelector('.js-context');

            const hide = (e) => {
                if (e.key === 'Escape' || e.type !== 'keydown' && !e.target.closest('.js-context')) {
                    menu.classList.remove('visible');
                    document.removeEventListener('click', hide);
                    document.removeEventListener('keydown', hide);
                }
            };

            // Show details
            item.addEventListener('click', (e) => {
                if (btn.contains(e.target)) {
                    return false;
                }

                this.data.selected = n;
                this.renderDetailsContent();
            });

            btn.addEventListener('click', () => {
                const {xrf} = this.data.selected = n;

                if (xrf && xrf.length) {
                    menu.querySelector('.js-tr-change-schedule').classList.remove('hidden');
                }
                else {
                    menu.querySelector('.js-tr-change-schedule').classList.add('hidden');
                }

                menu.classList.add('visible');
                $(menu).position({
                    of: $(btn),
                    my: 'right top',
                    at: 'right bottom',
                    collision: 'flipfit',
                    within: $('body'),
                    using(obj) {
                        const { left, top } = obj;

                        $(this).css({
                            left: `${left + 36 }px`,
                            top: `${top}px`
                        });
                    }
                });

                document.addEventListener('click', hide);
                document.addEventListener('keydown', hide);
            });
        },

        bindActionBtnEvts(cn) {
            cn.querySelector('.js-tr-open').addEventListener('click', () => {
                const {xh} = this.data.selected;
                open(`${getBaseUrl()}/t/${xh}`, '_blank', 'noopener,noreferrer');
            });

            cn.querySelector('.js-tr-copy-link').addEventListener('click', () => {
                T.ui.copyLinkToClipboard(this.data.selected.xh);
            });

            cn.querySelector('.js-share-qr').addEventListener('click', () => {
                const {xh, name} = this.data.selected;
                T.ui.qrDialog.show({
                    fileName: name,
                    text: `${getBaseUrl()}/t/${xh}`
                });
            });

            cn.querySelector('.js-tr-edit-link-title').addEventListener('click', () => {
                const {xh, name} = this.data.selected;
                const opt = {
                    title: l.transferit_edit_title,
                    buttons: [l[776], l.msg_dlg_cancel],
                    placeholders: [l.transferit_enter_title, l.file_request_title_heading],
                    inputValue: name
                };
                T.ui.prompt(l.transferit_enter_new_title, opt)
                    .catch(echo)
                    .then((title) => title && T.core.setTransferAttributes(xh, {title}))
                    .then((s) => s === 0 && this.init(true))
                    .catch(tell);
            });

            cn.querySelector('.js-tr-change-password').addEventListener('click', () => {
                // todo: get password set
                const {name, xh, p} = this.data.selected;
                const msg = l.transferit_lock_access_to_x.replace('%1', `<strong>${name}</strong>`);
                const opt = {
                    title: p ? l[23262] : l.transferit_add_pass,
                    type: 'password',
                    buttons: [l[776], l.msg_dlg_cancel],
                    placeholders: [l[17454], l[909]],
                };
                T.ui.prompt(msg, opt)
                    .then((pw) => pw && T.core.setTransferAttributes(xh, {pw}))
                    .then((s) => s === 0 && this.init(true))
                    .catch(tell);
            });

            cn.querySelector('.js-tr-change-exp-date').addEventListener('click', () => {
                const {xh} = this.data.selected;
                const opt = {
                    buttons: [l[776], l.msg_dlg_cancel],
                    title: l.mobile_manage_link_expiry_date,
                    msg: l.transferit_change_availability,
                    submsg: l.transferit_availability_tip,
                    onload(box) {
                        const form = ce('form');
                        box.querySelector('p').after(form);
                        box = T.ui.dropdown.clone('.js-expires-dropdown');
                        form.append(box);
                        const btn = box.querySelector('.js-select-button');
                        const dropdown = box.querySelector('.js-dropdown');

                        btn.classList.add('hidden');
                        btn.querySelector('input').value = '0';
                        dropdown.classList.remove('it-dropdown-body');
                        T.ui.addFilesLayout.resetExpiryDate(dropdown);
                    }
                };
                T.ui.msgDialog.show(opt)
                    .then((e) => e >= 0 && T.core.setTransferAttributes(xh, {e}))
                    .then((s) => s === 0 && this.init(true))
                    .catch(tell);
            });

            cn.querySelector('.js-tr-change-schedule').addEventListener('click', () => {
                const {xh, xrf} = this.data.selected;
                const opt = {
                    title: l.transferit_change_sched_hdr,
                    type: 'calendar',
                    buttons: [l[776], l.msg_dlg_cancel],
                    placeholders: [l.transferit_sending_date],
                    value: xrf.length ? xrf[0].s : null
                };
                T.ui.prompt(l.transferit_change_sched_info, opt)
                    .then((s) => {
                        if (s > 0) {
                            const p = [];
                            for (let i = xrf.length; i--;) {
                                p.push(T.core.setTransferRecipients(xh, {s}, xrf[i].rh));
                            }
                            return Promise.all(p);
                        }
                    })
                    .then((s) => s && this.init(true))
                    .catch(tell);
            });

            cn.querySelector('.js-tr-delete-transfer').addEventListener('click', () => {
                const {name, xh} = this.data.selected;
                const msg = escapeHTML(l.transferit_delete_tr_info).replace('%1', `<strong>${name}</strong>`);

                T.ui.confirm(msg, {title: 'Delete', buttons: [l[1730], l.msg_dlg_cancel]})
                    .then((yes) => yes && T.core.delete(xh))
                    .then(() => this.init(true))
                    .catch(tell);
            });

            for (const elm of cn.querySelectorAll('.js-tr-details')) {
                elm.addEventListener('click', () => this.renderDetailsContent());
            }
        },

        /*
         * Init Transfer details section.
        */
        initDetailsContent() {
            const cn = this.detailsSection.cn = this.data.cn.querySelector('.js-details-content');

            // Back
            cn.querySelector('.js-back').addEventListener('click', () => {
                // @todo FIXME improve FIXUP
                pushHistoryState('dashboard');
                this.showSubSection(this.listSection.cn);
            });

            // Bind action buttons
            this.bindActionBtnEvts(cn);
        },

        renderDetailsContent() {
            if (!this.detailsSection.cn) {
                this.initDetailsContent();
            }

            let { cn } = this.detailsSection;
            const {xh, name, ac, ct, ts, xrf = false, size: [bytes, files]} = this.data.selected;

            this.showSubSection(cn);

            cn.querySelector('.js-name').textContent = name;
            cn.querySelector('.js-total-views').textContent =
                l.transferit_total_accesses.replace('%1', ac);
            cn.querySelector('.js-recipients-num').textContent =
                l.transferit_total_recipients.replace('%1', xrf.length);

            const info = cn.querySelector('.js-transfer-info');
            info.textContent = '';
            ce('span', info).textContent = mega.icu.format(l.album_items_count, files);
            ce('span', info).textContent = bytesToSize(bytes);
            ce('span', info).textContent = l.transferit_sent_x.replace('%1', ago(ct || ts));

            if (xrf.length) {
                cn.querySelector('.js-tr-change-schedule').classList.remove('hidden');
            }
            else {
                cn.querySelector('.js-tr-change-schedule').classList.add('hidden');
            }

            // Render recipient items
            cn = cn.querySelector('.js-recipients-container');
            cn.textContent = '';

            for (let i = xrf.length; i--;) {
                this.renderRecipientItem(xrf[i], cn);
            }

            pushHistoryState(`dashboard/${xh}`);
        },

        renderRecipientItem(xrf, cn) {
            const {e, rh, a} = xrf;
            const item = ce('div', cn, {
                id: rh,
                tabindex: 0,
                class: 'it-grid-item'
            });
            let col = ce('div', item, { class: 'col' });

            // @todo: Email. Please use `success` classname if user downloaded
            let wrap = ce('div', col, { class: 'recipient-email' });

            if (a) {
                wrap.classList.add('success');
            }

            // @todo: Please use `icon-mail` is user didn't view
            // @todo: Please use `icon-eye` is user viewed, but didn't download
            // @todo: Please use `icon-arrow-down-circle` is user downloaded
            const icon = ce('i', wrap, {class: `sprite-it-x16-mono icon-mail`});
            ce('span', wrap).textContent = e;

            if (a) {
                icon.classList.add('icon-eye');
                icon.classList.remove('icon-mail');
                ce('i', wrap, { class: 'sprite-it-x24-mono icon-check' });
            }

            col = ce('div', item, { class: 'col' });

            // @todo: Show button only if user didn't view, didn't download
            /**
            if (!a) {
                wrap = ce('button', col, {class: 'it-button ghost sm-size js-resend'});
                ce('i', wrap, {class: 'sprite-it-x16-mono icon-arrow-up-right-square'});
                ce('span', wrap).textContent = l[8744];

                // @todo: Bind resend button
                wrap.addEventListener('click', () => {
                    tell('@todo: API command?');
                });
            }
            /**/
        },
    });
});

/** @property T.ui.viewFilesLayout */
lazy(T.ui, 'viewFilesLayout', () => {
    'use strict';

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };

    const ce = (n, t, a) => mCreateElement(n, a, t);
    const thumb = tryCatch((n, uri) => {
        let img = document.getElementById(n.h);
        if (img && (img = img.querySelector('img')) && img.onload === null) {
            img.onload = () => img.parentNode.classList.add('thumb');
            img.src = uri;
        }
    });

    const thumbnailer = tryCatch((list, max = 7) => {
        let cnt = 0;
        let req = 0;
        const thumbs = Object.create(null);

        for (let i = 0; i < list.length; i++) {
            const n = list[i];
            if (n.fa) {
                if (thumbnails.has(n.fa)) {
                    thumb(n, thumbnails.get(n.fa));
                }
                else if (thumbnails.queued(n, 1)) {
                    req = 1;
                    thumbs[n.fa] = n;
                }
                if (++cnt > max) {
                    break;
                }
            }
        }

        if (req) {
            if (self.d) {
                console.warn(`Requesting ${$.len(thumbs)} preview images...`);
            }
            return api_getfileattr(thumbs, 1, (_, fa, data) => {
                if (data.byteLength) {
                    const uri = mObjectURL([data.buffer], 'image/jpeg');
                    thumbnails.add(fa, uri, (n) => thumb(n, uri));
                }
            });
        }
    });

    lazy(thumbnailer, 'observer', () => {
        const dsp = (lst) => {
            const rdy = [];
            for (let i = 0; i < lst.length; ++i) {
                if (lst[i].isIntersecting) {
                    const e = lst[i];
                    const n = M.d[e.target.id];

                    if (n && n.fa) {
                        rdy.push(n);
                    }
                    thumbnailer.observer.unobserve(e.target);
                }
            }
            if (rdy.length) {
                thumbnailer(rdy, rdy.length);
            }
        };
        return new IntersectionObserver(dsp, {
            threshold: 0.1,
            root: document.querySelector('.js-fm-section .desktop-scroll-area.bottom')
        });
    });

    return freeze({
        data: {
            tick: 0,
            state: 0,
            type: 'list',
            sort: {
                dir: 1,
                mode: 'name'
            }
        },
        viewContent: Object.create(null),
        readyToDownload: Object.create(null),
        zipDownloadQueue: freeze({
            onclick(ev) {
                stop(ev);
                if (!ev.target.classList.contains('disabled')) {

                    T.core.zipDownload(self.xhid).catch(tell);
                }
            },
            dom: new IWeakSet()
        }),

        async init(xh, folder) {
            await scheduler.yield();

            const first = !this.readyToDownload.cn;
            if (first) {
                await this.renderReadyToDownload(xh);

                // if a pwd is set, no preloading
                if (!this.data.preload) {
                    return;
                }
            }
            else if (this.data.state > 0) {
                console.warn('ongoing initialization, moving on...');
                return;
            }
            if (!M.RootID) {
                if (!first) {
                    loadingDialog.show();
                }
                await this.preload(xh)
                    .finally(() => first || loadingDialog.hide());
            }
            await M.openFolder(folder || M.RootID);

            if (!this.data.customView) {
                const list = [...M.v].filter(n => !n.t);
                list.sort((a, b) => a.s < b.s ? 1 : -1);

                let media = 0;
                const length = list.length >> 3 || list.length;
                for (let i = length; i--;) {
                    const n = list[i];

                    if (this.isMediaFile(n)) {

                        media++;
                    }
                }

                // If there is a majority of media files in the folder
                if (media * 100 / length > 51) {
                    this.data.type = 'grid';
                }
            }

            if (this.viewContent.cn) {
                this.renderViewContent(xh);
            }
            else if (!first) {
                this.renderReadyToDownload(xh);
            }
        },

        isMediaFile(n) {
            if (!crypto_keyok(n)) {
                return null;
            }
            if (is_video(n) || MediaInfoLib.isFileSupported(n)) {
                return 2;
            }
            return String(n.fa).includes(':0*') || is_image2(n) ? 1 : false;
        },

        async preload(xh) {
            if (!this.data.preload && !M.RootID) {
                this.data.preload = T.core.fetch(xh);
            }
            return this.data.preload;
        },

        /*
         * Init Ready to download section.
        */
        async initReadyToDownload(xh) {
            const cn = this.readyToDownload.cn = T.ui.page.content.querySelector(
                '.it-box-holder.js-ready-to-dl-section'
            );

            loadingDialog.show();
            this.data.xi = await T.core.getTransferInfo(xh)
                .finally(() => loadingDialog.hide());

            const viewCnBtn = cn.querySelector('.js-view-content');
            // Enable button if user opened another page and got back to Ready to Dl
            // viewCnBtn.classList.remove('loading');

            // Init view content button
            viewCnBtn.addEventListener('click', () => {
                viewCnBtn.classList.add('loading');

                this.preload(xh)
                    .then(() => this.initViewContent(xh))
                    .then(() => this.init(xh))
                    .catch((ex) => {
                        this.data.preload = null;
                        return Number(ex) !== self.EROLLEDBACK && tell(ex);
                    })
                    .finally(() => viewCnBtn.classList.remove('loading'));
            });

            // Init download all button
            const dlb = cn.querySelector('.js-download');
            if (dlb) {
                this.pollZipDownload(xh, dlb).catch(dump);
            }

            if (!this.data.xi.pw) {
                this.preload(xh).catch(dump);
            }
        },

        async pollZipDownload(xh, elm) {
            const {z, zp, size: [, files]} = this.data.xi;

            if (!z && files > 1) {
                elm.classList.add('disabled');
                this.zipDownloadQueue.dom.add(elm);

                if (zp) {
                    const each = (cb, data) => {
                        for (const elm of this.zipDownloadQueue.dom) {
                            cb(elm, data);
                        }
                    };
                    const star = (elm) => elm.classList.add('progress');
                    const cmpl = (elm) => elm.classList.remove('progress', 'disabled');
                    const prog = (elm, v) => {
                        const pb = elm.querySelector('.progress-bar');
                        if (pb) {
                            pb.style.width = `${v / 65536 * 100}%`;
                        }
                    };
                    each(star);
                    each(prog, zp);

                    if (this.zipDownloadQueue.dom.size === 1) {

                        do {
                            await tSleep(2.1);
                            const res = await T.core.getTransferInfo(xh).catch(dump);
                            if (!res) {
                                break;
                            }
                            if (res.z) {
                                this.data.xi = res;

                                each(cmpl);
                                break;
                            }
                            each(prog, res.zp);
                        }
                        while (this.zipDownloadQueue.dom.size);
                    }
                }
            }
            elm.addEventListener('click', this.zipDownloadQueue.onclick);
        },

        /*
         * Render Ready to download section.
        */
        async renderReadyToDownload(xh) {
            if (!this.readyToDownload.cn) {
                MediaInfoLib.getMediaCodecsList()
                    .catch((ex) => {
                        self.reportError(new Error(`Failed to load media-codecs list, ${ex}`));
                    });
                await this.initReadyToDownload(xh);
            }
            const { cn } = this.readyToDownload;
            const m = from8(base64urldecode(this.data.xi.m || '')).trim();
            const t = from8(base64urldecode(this.data.xi.t || ''));
            const msgCn = cn.querySelector('.msg-area');
            const titleCn = cn.querySelector('.link-info .title');

            msgCn.classList.add('hidden');
            titleCn.classList.add('hidden');

            // Show message
            if (m) {
                msgCn.classList.remove('hidden');
                msgCn.querySelector('span').textContent = m;
            }

            // Show title
            if (t) {
                titleCn.classList.remove('hidden');
                titleCn.textContent = t;
            }

            // Items num and size
            this.updateItemsInfo(cn);

            // Show section
            T.ui.page.showSection(cn);
        },

        /*
         * Init View content (FM) section.
        */
        initViewContent(xh) {
            this.viewContent.cn = T.ui.page.content.querySelector('.it-box-holder.js-fm-section');

            // Init View type buttons
            this.initViewModeBtns();

            // Init sorting dropdown
            this.initSortingDropdown();

            for (const elm of document.querySelectorAll('.js-download-all')) {

                this.pollZipDownload(xh, elm).catch(dump);
            }
        },

        /*
         * Render View content (FM) section.
        */
        renderViewContent(xh) {
            if (!this.viewContent.cn) {
                this.initViewContent(xh);
            }
            const { cn } = this.viewContent;

            cn.querySelector('.it-grid-info').classList.add('hidden');
            cn.querySelector('.breadcrumbs-wrap').classList.add('hidden');

            // Link name
            cn.querySelector('.link-name').textContent = M.d[M.RootID].name;
            // ^ @todo get 't'itle and use it instead!

            // Items num and size or breadcrumbs
            if (M.RootID === M.currentdirid) {
                this.updateItemsInfo(cn);
            }
            else {
                this.initBreadCrumbs();
            }

            // Udate View mode buttons state
            this.updateViewModeBtns();

            // Show section
            T.ui.page.showSection(cn);

            // Render items
            this.renderContent();
        },

        initBreadCrumbs() {
            const wrap = this.viewContent.cn.querySelector('.breadcrumbs-wrap');

            wrap.classList.remove('hidden');
            T.ui.breadcrumbs.init(M.currentdirid, wrap);
        },

        updateItemsInfo(cn) {
            const info = cn.querySelector('.it-grid-info');
            // const { tb, td, tf } = M.d[M.currentdirid];
            const [tb, tf, td] = this.data.xi.size;

            info.classList.remove('hidden');
            info.querySelector('.size').textContent = bytesToSize(tb);

            info.querySelector('.num').textContent =
                `${td - 1 ? mega.icu.format(l.folder_count, td - 1) + ', ' : ''}${mega.icu.format(l.file_count, tf)}`;
        },

        initViewModeBtns() {
            const { cn } = this.viewContent;
            const viewBtns = cn.querySelectorAll('.file-manager-box .view-btns .it-button');

            for (var i = 0; i < viewBtns.length; i++) {
                viewBtns[i].addEventListener('click', (e) => {
                    stop(e);
                    if (!e.currentTarget.classList.contains('active')) {
                        const elm = e.currentTarget;

                        if (M.v.length > 1e4) {
                            loadingDialog.show();
                        }

                        requestAnimationFrame(() => {
                            this.updateViewModeBtns(elm);

                            this.data.type = elm.dataset.type || 'list';
                            this.data.customView = true;
                            this.renderContent();

                            if (M.v.length > 1e4) {
                                loadingDialog.hide();
                            }
                        });
                    }
                });
            }
        },

        updateViewModeBtns(btn) {
            const { cn } = this.viewContent;
            const bntsBox = cn.querySelector('.file-manager-box .view-btns');
            const viewBtns = bntsBox.querySelectorAll('.it-button');
            let icon = null;

            for (var i = 0; i < viewBtns.length; i++) {
                const bn = viewBtns[i];
                icon = bn.querySelector('i');
                bn.classList.remove('active');
                bn.querySelector('i').className = `sprite-it-x24-mono ${icon.dataset.icon}`;
            }

            btn = btn || bntsBox.querySelector(`.it-button[data-type="${this.data.type}"]`);
            icon = btn.querySelector('i');
            icon.className = `sprite-it-x24-mono ${icon.dataset.icon}-filled`;
            btn.classList.add('active');
        },

        initSortingDropdown() {
            const dropdown = this.viewContent.cn.querySelector('.js-sorting-select');
            const options = dropdown.querySelectorAll('.js-option');

            // Init dropdown component
            T.ui.dropdown.init(dropdown);

            // Bind change sorting evt
            for (var i = 0; i < options.length; i++) {
                options[i].addEventListener('click', (e) => {
                    const radio = e.currentTarget.querySelector('input');

                    if (this.data.sort.mode === radio.value) {
                        this.data.sort.dir *= -1;
                    }
                    else {
                        this.data.sort.mode = radio.value;
                        this.data.sort.dir = 1;
                    }

                    this.renderContent();

                    e.preventDefault();
                });
            }
        },

        updateSortingUI() {
            const { cn } = this.viewContent;
            const listHeader = cn.querySelector('.it-grid-header');
            const sel = cn.querySelector(
                `.js-sorting-select input[value="${this.data.sort.mode}"]`
            );

            if (sel) {
                sel.checked = true;
                sel.dispatchEvent(new Event('change'));
            }

            if (!listHeader) {
                return;
            }

            const sortingBtns = listHeader.querySelectorAll('.label.clickable');
            const activeBtn = listHeader
                .querySelector(`.label[data-mode="${this.data.sort.mode}"]`);

            for (var i = 0; i < sortingBtns.length; i++) {
                sortingBtns[i].classList.remove('selected');
            }

            activeBtn.classList.add('selected');
            activeBtn.querySelector('i').className = ' sprite-it-x16-mono ' +
                `${this.data.sort.dir === 1 ? 'icon-chevron-up' : 'icon-chevron-down' }`;
        },

        renderContent() {
            const cn = this.viewContent.cn.querySelector('.items-wrap .content-body > .content');
            const { mode, dir } = this.data.sort;

            cn.textContent = '';
            cn.scrollTo({ top: 0 });

            // Show empty folder
            if (!M.v.length) {
                const wrap =  ce('div', cn, { class: 'grid-empty-content' });
                ce('h5', wrap).textContent = l[782];
                return;
            }

            // Sort M.v
            T.ui.sort.doSort(M.v, mode, dir);

            this.data.state++;
            requestAnimationFrame(() => {
                this.data.tick++;

                // Render list or grid view
                const p = this.data.type === 'list' ? this.renderListView(cn) : this.renderGridView(cn);

                p.catch(dump).finally(() => --this.data.state);
            });

            // Update sorting UI
            this.updateSortingUI();
        },

        async renderListView(cn) {
            cn = ce('div', cn, { class: 'it-grid list-type alternating-bg' });

            this.renderListiHeader(cn);

            await this.renderItems('renderListitem', M.v, cn);

            this.initSortBtns(cn);
        },

        renderListiHeader(cn) {
            const item = ce('div', cn, { class: 'it-grid-header' });
            let col = ce('div', item, { class: 'col' });
            let wrap = ce('div', col, { class: 'label clickable', 'data-mode': 'name' });

            ce('span', wrap).textContent = l.transferit_name_low;
            ce('i', wrap, { class: 'sprite-it-x16-mono icon-chevron-up' });

            col = ce('div', item, { class: 'col' });
            wrap = ce('div', col, { class: 'label clickable', 'data-mode': 'type' });

            ce('span', wrap).textContent = l.transferit_type_low;
            ce('i', wrap, { class: 'sprite-it-x16-mono icon-chevron-up' });

            col = ce('div', item, { class: 'col' });
            wrap = ce('div', col, { class: 'label clickable', 'data-mode': 'size' });

            ce('span', wrap).textContent =  l.transferit_size_low;
            ce('i', wrap, { class: 'sprite-it-x16-mono icon-chevron-up' });

            ce('div', item, { class: 'col' });
        },

        async renderItems(fn, list, cn) {
            if (self.d) {
                console.group(`${fn}(${list.length})`, cn);
                console.time(fn);
            }
            const {tick} = this.data;

            thumbnailer(list);

            for (let i = 0; i < list.length;) {
                this[fn](list[i], cn);

                if (!(++i % 32)) {
                    await api.yield(0);

                    if (tick !== this.data.tick) {
                        console.warn('suppression', this.data.state, this.data.tick, tick);
                        break;
                    }
                }
            }

            if (self.d) {
                console.timeEnd(fn);
                console.groupEnd();
            }
        },

        renderListitem(n, cn) {
            const item = ce('div', cn, {
                class: 'it-grid-item',
                id: n.h,
                tabindex: 0
            });
            let col = ce('div', item, { class: 'col' });

            // Item type icon
            let wrap = ce('div', col, { class: `it-thumb-base ${fileIcon(n)}` });
            ce('i', wrap, { class: `sprite-it-mime ${fileIcon(n)}` });

            // Item name
            ce('span', col, { class: `md-font-size pr-color` }).textContent = n.name;

            // Item type
            col = ce('div', item, { class: 'col' });
            ce('span', col).textContent = n.t ? l[1049] : filetype(n);

            // Item size
            col = ce('div', item, { class: 'col' });
            ce('span', col).textContent = bytesToSize(n.s || n.tb || 0);

            // Download button
            col = ce('div', item, { class: 'col' });
            wrap = ce('button', col, {id: n.h, class: 'it-button sm-size ghost js-download'});

            ce('i', wrap, { class: 'sprite-it-x16-mono icon-arrow-big-down' });
            ce('span', wrap).textContent = l[58];

            // Bind evts
            this.bindItemEvts(n, item);
        },

        bindItemEvts(n, item) {
            const dlBtn = item.querySelector('.js-download');
            const download = () => {
                // eslint-disable-next-line local-rules/open -- opening ourselves
                window.open(T.core.getDownloadLink(n), '_self', 'noopener');
            };

            const openItem = (ev) => {
                stop(ev);

                if (dlBtn.contains(ev.target)) {
                    return false;
                }

                if (n.t) {
                    this.init(n.xh, n.h).catch(tell);
                }
                else {
                    const media = this.isMediaFile(n);

                    if (media) {
                        if (media > 1) {
                            $.autoplay = n.h;
                        }

                        slideshow(n);
                    }
                    else {
                        download();
                    }
                }
            };

            item.addEventListener('focus', (ev) => {
                ev.target.classList.add('active', 'ui-selected');
            });
            item.addEventListener('blur', (ev) => {
                ev.target.classList.remove('active', 'ui-selected');
            });

            if ($.autoSelectNode === n.h) {
                tryCatch(() => item.focus())();
            }

            // Initialize double click/dblclick events
            item.addEventListener(is_touchable ? 'click' : 'dblclick', (ev) => openItem(ev));

            // Initialize download btn
            if (n.t) {
                dlBtn.classList.add('hidden');
            }
            else {
                dlBtn.addEventListener('click', (ev) => {
                    stop(ev);
                    download();
                });
            }
        },

        initSortBtns(cn) {
            const listHeader = cn.querySelector('.it-grid-header');
            const sortingBtns = listHeader.querySelectorAll('.label.clickable');

            for (var i = 0; i < sortingBtns.length; i++) {

                sortingBtns[i].addEventListener('click', (e) => {
                    if (e.currentTarget.classList.contains('selected')) {
                        this.data.sort.dir *= -1;
                    }
                    else {
                        this.data.sort.dir = 1;
                        this.data.sort.mode = e.currentTarget.dataset.mode || 'name';
                    }

                    this.renderContent();
                });
            }
        },

        async renderGridView(cn) {
            const { mode } = this.data.sort;
            const groups = [
                { name: l.transferit_folders_type, type: 'folder' }
            ];
            let wrap = null;

            if (mode === 'type') {
                groups.push(
                    { name: l.transferit_images_type, type: 'image' },
                    { name: l.transferit_video_type, type: 'video' },
                    { name: l.transferit_audio_type, type: 'audio' },
                    { name: l.transferit_docs_type, type: ['openoffice', 'pages', 'pdf', 'word'] },
                    { name: l.transferit_other_type, type: 'file' }
                );
            }
            else {
                groups.push(
                    { name: l.transferit_files_type, type: 'file' }
                );
            }

            cn = ce('div', cn, { class: 'it-grid grid-type' });

            // Create groups of items
            for (let i = 0; i < M.v.length; i++) {
                const n = M.v[i];
                const ft = filetype(n, true);
                const type = mode === 'type' && Array.isArray(ft) ? ft[0] : n.t ? 'folder' : 'file';
                const index = groups.findIndex((obj) => obj.type.includes(type));
                const group = groups[index > -1 ? index : groups.length - 1];

                if (group) {
                    if (group.n) {
                        group.n.push(n);
                        continue;
                    }
                    group.n = [n];
                }
            }

            for (let i = 0; i < groups.length; i++) {
                const g = groups[i];
                if (!g.n) {
                    continue;
                }

                // Show large thumbs only for Images/Video when sorting by type
                // Or for all files when sorting by name or size
                const cl = mode === 'type' && (g.type === 'image' || g.type === 'video')
                    || mode !== 'type' && g.type === 'file' ? ' lg-size' : '';

                // Create a group with special name
                wrap = ce('div', cn, { class: `items-group${cl}` });
                ce('div', wrap, { class: 'items-group-header' }).textContent = g.name;

                wrap = ce('div', wrap, { class: 'items-group-body' });

                // Render items in the group
                await this.renderItems('renderGirditem', g.n, wrap);
            }
        },

        renderGirditem(n, cn) {
            const item = ce('div', cn, {
                class: 'it-grid-item',
                id: n.h,
                tabindex: 0
            });
            const { sort: { mode: sortmode } } = this.data;
            let dn = null;

            // Add "thumb" class to show thumbnail
            let wrap = ce('div', item, { class: `it-thumb-base lg-size ${fileIcon(n)}` });

            // Item type icon
            ce('i', wrap, { class: `sprite-it-mime-lg ${fileIcon(n)}` });

            // Thumbnail
            ce('img', wrap, { src: '' });

            // If Previewable video, show play icon
            if (n.width) {
                dn = ce('div', wrap, { class: 'play-icon' });
                ce('i', dn, { class: 'sprite-fm-mono icon-play-small-regular-solid' });
            }

            // Show paytime tag in thumbnail node,
            // If Video file or Audio file when sorting by type
            if (n.playtime && (sortmode !== 'type' || n.width)) {

                // If Video, audio, animated images, show tag
                dn = ce('div', wrap, { class: 'tag' });

                // Use "icon-video" class for video,
                // "icon-play" for audio,
                // "icon-animation" for animated images
                ce('i', dn, {
                    class: `sprite-it-x16-mono ${n.width ? 'icon-video' : 'icon-play'}`
                });

                // Set audio/video duration or anumated image ext, i.e. GIF
                ce('span', dn, {class: 'num'}).textContent = secondsToTimeShort(n.playtime);
            }

            // Wrappers
            wrap = ce('div', item, { class: 'item-data-body' });
            dn = ce('div', wrap, { class: 'item-data' });

            // Item name
            ce('div', dn, { class: 'item-name' }).textContent = n.name;

            // Item type or children data, item size.
            const info = ce('div', dn, {class: 'it-grid-info'});

            // File type or number of folder child items
            ce('div', info, { class: 'num' }).textContent = n.t ?
                `${mega.icu.format(l.folder_count, n.td)}, ${mega.icu.format(l.file_count, n.tf)}` : filetype(n);

            // Size
            ce('div', info, {class: 'size'}).textContent = bytesToSize(n.s || n.tb || 0);

            // Show audio playtime tag in file info when sorting by type
            if (n.playtime && !n.width && sortmode === 'type') {
                ce('div', dn, {
                    class: 'item-tag'
                }).textContent = secondsToTimeShort(n.playtime);
            }

            // Download button
            wrap = ce('button', wrap, {
                'alria-label': l[58],
                id: n.h,
                class: 'it-button sm-size ghost js-download'
            });
            ce('i', wrap, { class: 'sprite-it-x16-mono icon-arrow-big-down' });

            // Bind evts
            this.bindItemEvts(n, item);
            if (n.fa) {
                thumbnailer.observer.observe(item);
            }
        }
    });
});

/** @property T.ui.langDialog */
lazy(T.ui, 'langDialog', () => {
    'use strict';

    const ce = (n, t, a) => mCreateElement(n, a, t);
    const cn =  T.ui.dialog.content.querySelector('.js-lang-dialog');
    const itemsBody = cn.querySelector('.lang-items');

    const langCodes = [
        'es', 'en', 'br', 'ct', 'fr', 'de', 'ru', 'it', 'ar',
        'nl', 'cn', 'jp', 'kr', 'ro', 'id', 'th', 'vi', 'pl'
    ].sort((codeA, codeB) => {
        return codeA.localeCompare(codeB);
    });

    const setLanguage = (e) => {
        const code = e.currentTarget.dataset.code;
        if (code && code !== lang) {
            T.ui.page.safeLeave().then((res) => {
                if (res === true) {
                    localStorage.lang = code;
                    location.reload();
                }
            });
        }
    };

    itemsBody.textContent = '';

    // Render lang buttons
    for (const code of langCodes) {
        const lng = languages[code];

        if (!lng[2]) {
            console.warn('Language %s not found...', code);
            continue;
        }

        const btn = ce('button', itemsBody, {
            class: 'it-menu-item simpletip',
            'data-code': code,
            'data-simpletip': lng[1],
            'data-simpletipoffset': '8'
        });
        btn.addEventListener('click', setLanguage);

        ce('span', btn).textContent = lng[2];
        ce('i', btn, { class: 'sprite-it-x24-mono icon-check active-only' });
    }

    // Close btns
    for (const elm of cn.querySelectorAll('.js-close')) {
        elm.addEventListener('click', () => T.ui.dialog.hide(cn));
    }

    return freeze({
        show() {
            // Activate selected language button
            for (const btn of itemsBody.querySelectorAll('button')) {
                if (btn.dataset.code === lang) {
                    btn.classList.add('active');
                }
                else {
                    btn.classList.remove('active');
                }
            }

            // Show dialog
            T.ui.dialog.show(cn);
        }
    });
});

/** @property T.ui.loginDialog */
lazy(T.ui, 'loginDialog', () => {
    'use strict';

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };

    return freeze({
        data: Object.create(null),

        init() {
            const cn = this.data.cn = T.ui.dialog.content.querySelector('.js-login-dialog');
            this.data.loginCn = cn.querySelector('.content.login-cn');
            this.data.twoFaCn = cn.querySelector('.content.two-fa-cn');
            this.data.emailInput = cn.querySelector('#login-dlg-email-input');
            this.data.passInput = cn.querySelector('#login-dlg-password-input');
            this.data.pinInputs = this.data.twoFaCn.querySelectorAll('input');
            this.data.backBtn = cn.querySelector('.js-back');

            T.ui.input.init(cn.querySelectorAll('.it-input input'));

            // Continue(login) button
            cn.querySelector('.js-continue-button')
                .addEventListener('click', (e) => this.tryLogin(e).catch(tell));

            // X button
            cn.querySelector('.js-close').addEventListener('click', () => this.hide());

            // Back button
            this.data.backBtn.addEventListener('click', () => this.showStep());

            // Submit 2FA button
            cn.querySelector('.js-submit-2fa').addEventListener('click', (e) => this.verifyTwoFA(e));

            // Init 2FA pin intput events
            for (let i = 0; i < this.data.pinInputs.length; i++) {
                const elm = this.data.pinInputs[i];

                elm.addEventListener('keydown', (e) => {
                    // Change focus on backspace
                    if ((e.key === 'Backspace' || e.key === 'Delete') && e.target.value === '') {
                        this.data.pinInputs[Math.max(0, i - 1)].focus();
                    }

                    // Verify pin
                    if (e.key === 'Enter') {
                        this.verifyTwoFA();
                    }
                });

                elm.addEventListener('focus', (e) => {
                    e.target.select();
                });

                elm.addEventListener('input', (e) => {
                    const [first, ...rest] = e.target.value;

                    // Set default
                    this.twoFAerror();

                    // Set emply val if undefined
                    e.target.value = first || '';

                    // Set other values
                    if (first !== undefined && i !== this.data.pinInputs.length - 1) {
                        const next = this.data.pinInputs[i + 1];
                        next.focus();

                        if (rest.length) {
                            next.value = rest.join('');
                            next.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
            }
        },

        show() {
            if (self.u_type > 0) {
                return false;
            }

            if (!this.data.cn) {
                this.init();
            }

            // Reset and show
            this.reset();
            T.ui.dialog.show(this.data.cn);

            // Focus Email input after dialog animation
            setTimeout(() => this.data.emailInput.focus(), 300);
        },

        hide() {
            this.reset();
            T.ui.dialog.hide(this.data.cn);
        },

        reset() {
            const { emailInput, passInput, pinInputs } = this.data;
            emailInput.value = '';
            passInput.value = '';

            for (const elm of pinInputs) {
                elm.value = '';
            }

            T.ui.input.errorMsg(emailInput);
            T.ui.input.errorMsg(passInput);
            this.showStep();
            this.twoFAerror();
        },

        async tryLogin(e) {
            stop(e);

            if (!await T.ui.page.safeLeave()) {
                return false;
            }
            /*
            disable temporary session warning for now (as we don't properly support it on transfer.it):
            we may improve in the future
            if (self.u_sid) {
                console.assert(self.u_type === 0);

                // warn about an ephemeral session being active
                const res = await T.ui.confirm(l[1058]);

                if (res !== true) {
                    return this.hide();
                }
                await u_logout(true);
            }
            */
            const {emailInput, passInput} = this.data;

            // Validate email
            if (emailInput.value.trim() === '' || !isValidEmail(emailInput.value)) {
                T.ui.input.errorMsg(emailInput, l[198]);
                return false;
            }

            // Validate pass
            if (passInput.value.trim() === '') {
                T.ui.input.errorMsg(passInput, l[1791]);
                return false;
            }

            return this.doLogin(emailInput.value, passInput.value);
        },

        async doLogin(u, p, pin) {
            loadingDialog.show();
            return security.atomicSignIn(u, p, pin)
                .then(() => location.reload())
                .catch((ex) => {
                    loadingDialog.hide();

                    // If there was a 2FA error, show a message that the PIN code was incorrect
                    if (ex === EFAILED) {
                        this.twoFAerror(true);
                        return true;
                    }

                    // If the Two-Factor PIN is required
                    if (ex === EMFAREQUIRED) {
                        this.showStep(1);
                        return true;
                    }

                    // Check and handle the common login errors
                    // Check for suspended account
                    if (ex === EBLOCKED) {
                        msgDialog('warninga', l[6789], api_strerror(ex));
                        return true;
                    }

                    // Check for too many login attempts
                    else if (ex === ETOOMANY) {
                        api_getsid.etoomany = Date.now();
                        api_getsid.warning();
                        return true;
                    }

                    // Check for incomplete registration
                    else if (ex === EINCOMPLETE) {
                        // This account has not completed the registration
                        msgDialog('warningb', l[882], l[9082]);
                        return true;
                    }

                    if (ex !== undefined) {
                        T.ui.input.errorMsg(this.data.emailInput, l[16349]);
                    }
                });
        },

        showStep(step) {
            const { loginCn, twoFaCn, emailInput, pinInputs, backBtn } = this.data;

            if (step) {
                backBtn.classList.remove('hidden');
                loginCn.classList.add('hidden');
                twoFaCn.classList.remove('hidden');
                pinInputs[0].focus();
            }
            else {
                backBtn.classList.add('hidden');
                loginCn.classList.remove('hidden');
                twoFaCn.classList.add('hidden');
                emailInput.focus();
            }
        },

        verifyTwoFA(e) {
            if (e) {
                stop(e);
            }

            const { emailInput, passInput, pinInputs } = this.data;
            const value = $.trim([...pinInputs].map((n) => n.value).join(''));

            if (!value || value.length < pinInputs.length) {
                return this.twoFAerror(true);
            }

            // Send the PIN code to the callback
            this.doLogin(emailInput.value, passInput.value, value);

            return false;
        },

        twoFAerror(error) {
            const { pinInputs, twoFaCn } = this.data;
            const en = twoFaCn.querySelector('.error-text');

            if (error) {
                en.classList.remove('v-hidden');
            }
            else {
                en.classList.add('v-hidden');
            }

            for (const elm of pinInputs) {
                if (error) {
                    elm.closest('.it-input').classList.add('error');
                    pinInputs[0].focus();
                }
                else {
                    elm.closest('.it-input').classList.remove('error');
                }
            }
        }
    });
});

/** @property T.ui.msgDialog */
lazy(T.ui, 'msgDialog', () => {
    'use strict';

    const xid = `xid$${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
    const content = T.ui.dialog.content.querySelector('.js-msg-dialog');
    const cancelBtn = content.querySelector('.js-negative-btn');
    const confirmBtn = content.querySelector('.js-positive-btn');
    const closeBtn = content.querySelector('.js-close');

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };
    let pending = 0;
    const ce = (n, t, a) => mCreateElement(n, a, t);

    lazy(ce, 'type', () => {
        const res = Object.create(null);
        const a = {id: 'msg-dialog-input'};

        lazy(res, 'prompt', () => T.ui.input.create('text', a));
        lazy(res, 'password', () => T.ui.input.create('password', a));
        lazy(res, 'calendar', () => T.ui.input.create('text', {...a, 'data-subtype': 'calendar'}));
        return res;
    });

    const detach = tryCatch(() => {
        if (detach.listener) {
            content.classList.remove(xid);
            closeBtn.removeEventListener('click', detach.listener);
            cancelBtn.removeEventListener('click', detach.listener);
            confirmBtn.removeEventListener('click', detach.listener);
            detach.listener = null;
        }
        if (detach.cancel) {
            queueMicrotask(detach.cancel);
            detach.cancel = null;
        }
        return T.ui.dialog.hide(content);
    });

    const attach = ({validate}) => new Promise((resolve, reject) => {
        detach.listener = tryCatch((ev) => {
            stop(ev);
            if (!content.classList.contains(xid)) {
                content.classList.add(xid);

                const ok = ev.currentTarget === confirmBtn;
                const input = ok && content.querySelector('input:checked, input');
                const value = input ? input.dataset.value || input.value : true;

                Promise.resolve(ok && typeof validate === 'function' && tryCatch(validate)(value, input))
                    .catch(echo)
                    .then((stop) => {
                        if (stop) {
                            if (input) {
                                T.ui.input.errorMsg(input, stop);
                            }
                            dump(stop);
                            content.classList.remove(xid);
                            return;
                        }
                        queueMicrotask(detach);
                        return ok && resolve(value);
                    })
                    .catch(detach);
            }
        }, detach.cancel = reject);

        closeBtn.addEventListener('click', detach.listener);
        cancelBtn.addEventListener('click', detach.listener);
        confirmBtn.addEventListener('click', detach.listener);

        for (const elm of content.querySelectorAll('form')) {
            elm.addEventListener('submit', stop);
        }
        T.ui.dialog.show(content);
    });

    const getDialogBox = (msg, submsg) => {
        const box = content.querySelector('.content');

        box.textContent = '';
        if (typeof msg === 'string' && msg.includes('<')) {

            T.ui.appendTemplate(msg, ce('p', box));
        }
        else {
            ce('p', box).textContent = msg || l[200];
        }

        if (submsg) {
            ce('div', box, {class: 'tip'}).textContent = submsg;
        }
        return box;
    };

    const openDialog = async(options = {}) => {
        const {
            msg,
            title,
            submsg,
            onload,
            inputValue = '',
            placeholders = [],
            value,
            errorText,
            type = 'warning',
            buttons = [l.ok_button],
            joy = true
        } = options;

        --pending;
        const box = getDialogBox(msg, submsg);

        if (type in ce.type) {
            const elm = ce.type[type].cloneNode(true);
            const input = elm.querySelector('input');

            if (input) {
                if (placeholders.length) {
                    elm.classList.add('fl-label');
                    elm.querySelector('label').textContent = placeholders[0];
                    input.placeholder = placeholders[1] || placeholders[0];
                }
                if (value) {
                    input.dataset.value = value;
                }

                input.value = inputValue;

                T.ui.input.init(input);

                if (type !== 'calendar') {
                    onIdle(() => input.focus());
                }

                if (errorText) {
                    T.ui.input.errorMsg(input, errorText);
                }
            }

            if (buttons.length < 2 && (type === 'prompt' || type === 'password')) {
                buttons.splice(0, 1, l[81], l.msg_dlg_cancel);
            }

            box.append(elm);
        }

        if (typeof onload === 'function') {
            const res = tryCatch(onload)(box);
            if (res instanceof Promise) {
                await res;
            }
        }

        // Confirmation
        if (type.includes('confirmation') || buttons.length === 2) {
            content.querySelector('footer').classList.add('fw-buttons');
            cancelBtn.classList.remove('hidden');
        }
        else {
            content.querySelector('footer').classList.remove('fw-buttons');
            cancelBtn.classList.add('hidden');
        }

        // Negative confirmation button
        if (type.includes('negative')) {
            confirmBtn.classList.add('negative');
        }
        else {
            confirmBtn.classList.remove('negative');
        }

        content.classList.remove('prioritize');
        content.querySelector('header > h5').textContent = title || '';
        confirmBtn.querySelector('span').textContent = buttons[0];
        cancelBtn.querySelector('span').textContent = buttons[1] || l.msg_dlg_cancel;

        // Set class for warnings/errors to be on top of other dialogs
        if (/warning|error/.test(type)) {
            content.classList.add('prioritize');
        }

        // Reset and show
        return attach(options)
            .catch((ex) => {
                if (!ex && joy) {
                    return ex;
                }
                throw ex;
            });
    };

    return freeze({
        get pending() {
            return pending;
        },
        hide() {
            return detach();
        },
        show(opts) {
            ++pending;
            return mutex.lock('<it:msg-dialog/>')
                .then((unlock) => openDialog(opts).finally(unlock));
        }
    });
});

/** @property T.ui.navDialog */
lazy(T.ui, 'navDialog', () => {
    'use strict';

    const cn =  T.ui.dialog.content.querySelector('.js-nav-dialog');
    const accountInfo = cn.querySelector('.js-acc-info');
    const langBtn = cn.querySelector('.js-set-language');
    const loginBtn = cn.querySelector('.js-login-btn');
    const logoutBtn = cn.querySelector('.js-logout-btn');
    const themeRadio = cn.querySelector('input[name="nav-switch-theme"]');

    const logout = () => {
        loadingDialog.show();

        Promise.resolve(self.u_type > 0 ? api.req([{a: 'sml'}]) : -1)
            .then(u_logout)
            .then(() =>  location.reload())
            .catch(tell)
            .finally(() => loadingDialog.hide());
    };

    let vn = cn.querySelector('.version');
    if (vn) {
        tryCatch(() => {
            vn.querySelector('span').textContent = buildVersion.website || 'dev';
            if (buildVersion.commit) {
                const a = vn.querySelector('a');
                a.href += buildVersion.commit;
                a.textContent = `(${buildVersion.commit})`;
            }
        })();
    }
    let verClickCnt = 0;

    // Close or show/hide version
    cn.addEventListener('click', (e) => {
        if (e.target === cn || e.target.closest('button')) {
            T.ui.dialog.hide(cn);
            return false;
        }
        if (e.target.closest('label')) {
            return false;
        }
        if (vn) {
            if (++verClickCnt > 7) {
                vn.classList.remove('hidden');
                vn = null;
            }
            delay('nav-dialog-click', () => {
                verClickCnt = 0;
            }, 350);
        }
    });

    // Theme button
    cn.querySelector('.js-set-theme').addEventListener('click', () => {
        T.ui.setTheme(T.ui.isDarkTheme() ? 1 : 2);
    });

    // Open page btns
    for (const elm of cn.querySelectorAll('button[data-page]')) {
        elm.addEventListener('click', () => T.ui.loadPage(elm.dataset.page));
    }

    // Choose language btn
    langBtn.addEventListener('click', () => {
        T.ui.langDialog.show();
    });

    // Login btn
    loginBtn.addEventListener('click', () => {
        T.ui.loginDialog.show();
    });

    // Logout btn
    logoutBtn.addEventListener('click', () => {
        T.ui.page.safeLeave().then((res) => {
            if (res === true) {
                logout();
            }
        });
    });

    // Theme switcher
    themeRadio.addEventListener('change', (e) => {
        T.ui.setTheme(e.currentTarget.checked ? 2 : 1);
    });

    return freeze({
        show() {
            if (T.ui.pageHeader.is_logged) {
                accountInfo.classList.remove('hidden');
                logoutBtn.parentElement.classList.remove('hidden');
                loginBtn.classList.add('hidden');

                T.ui.pageHeader.updateAccountData(cn);
            }
            else {
                accountInfo.classList.add('hidden');
                logoutBtn.parentElement.classList.add('hidden');
                loginBtn.classList.remove('hidden');
            }

            langBtn.querySelector('span').textContent = languages[lang][2];
            themeRadio.checked = T.ui.isDarkTheme();

            // Show dialog
            T.ui.dialog.show(cn);
        }
    });
});

mBroadcaster.once('boot_done', tryCatch(() => {
    'use strict';
    let audio;
    mBroadcaster.addListener('it-key-combo', tryCatch((seq) => {
        if (seq === 'SDA') {
            if (!audio) {
                audio = new Audio();
                audio.src = b64decode('aHR0cHM6Ly93d3cubXlpbnN0YW50cy5jb20vbWVkaWEvc291bmRzL2hhZG91a2VuLm1wMw');
                audio.load();
            }
            Promise.resolve(audio.play()).catch(dump);
            T.ui.navDialog.show();
            document.querySelector('.js-nav-dialog .version').classList.remove('hidden');
        }
    }));
}));

/**
 * @file keyboard.js
 * @desc Keyboard shortcuts handler.
 */
mBroadcaster.once('startMega', () => {
    "use strict";

    // -----------------------------------------------------------------------

    const inputReactiveKeys = freeze({
        Escape: 1
    });

    const is = freeze({
        get dialogShown() {
            return $.dialog || $.msgDialog;
        },
        get otherSubSec() {
            return false; // @todo
        },
        get onCleanView() {
            return !self.slideshowid && !this.dialogShown;
        },
        get viewListing() {
            return this.onCleanView && (M.search || M.currentrootid) && !this.otherSubSec;
        },
        get readOnlyView() {
            return !this.viewListing || !(M.getNodeRights(M.currentdirid) > 1);
        }
    });

    const keyMap = freeze({
        Enter() {
            // @todo
        },
        Escape() {
            if (!$.dialog || $.msgDialog !== 'confirmation') {
                // @todo
            }

            if ($.hideTopMenu) {
                $.hideTopMenu();
            }
            if ($.hideContextMenu) {
                $.hideContextMenu();
            }
        },
        KeyC(ev) {
            if ((ev.ctrlKey || ev.metaKey) && is.viewListing) {
                // @todo support multiple nodes
                const {id} = document.querySelector('.ui-selected') || !1;

                if (id) {
                    T.ui.copyLinkToClipboard(`${self.xhid}/${id}`);
                }
            }
        },
        KeyX(ev) {
            return keyMap.KeyC(ev, !!is.readOnlyView);
        }
    });

    const keyViewNav = (...a) => {

        // @todo

        return !a;
    };

    // -----------------------------------------------------------------------

    const combo = [];

    $(window).rebind('keyup.it-key-events', (ev) => {
        if (String(combo.slice(-1)) === ev.code) {
            combo.pop();
        }
        delay('it-combo-clear', () => {
            combo.length = 0;
        }, 768);
    });

    $(window).rebind('keydown.it-key-events', (ev) => {
        let returnValue = null;
        const {key, code, target} = ev;
        const $target = $(target);
        const $input = $target.filter("input,textarea,select");

        if ($input.length && !inputReactiveKeys[key]) {

            returnValue = true;
        }
        else {

            combo.push(code);
            if (code === 'KeyA') {
                mBroadcaster.sendMessage('it-key-combo', combo.map((k) => k.slice(-1)).join(''));
            }

            switch (key) {
                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    if (is.viewListing) {
                        returnValue = keyViewNav(ev, key.slice(5).toLowerCase());
                    }
                    break;

                default: {
                    const handler = keyMap[key] || keyMap[code];

                    if (handler) {

                        returnValue = tryCatch(handler)(ev);
                    }
                }
            }
        }

        return returnValue;
    });
});

/** @property T.ui.sort */
lazy(T.ui, 'sort', () => {
    'use strict';

    return freeze({
        collator: Intl.Collator('co', {sensitivity: 'variant', caseFirst: 'upper'}),

        compareStrings(a, b, d) {
            const strA = a || '';
            const strB = b || '';
            const res = this.collator.compare(strA, strB) * d;

            return res || String(strA).localeCompare(strB) * d;
        },

        doSort(n, m, d) {
            d |= 0;
            return n.sort((a, b) => this[m](a, b, d));
        },

        filefolder(a, b) {
            return a.t > b.t ? -1 : 1;
        },

        str(a, b, d) {
            return this.compareStrings(a, b, d);
        },

        date(a, b, d) {
            if (a.ct !== b.ct) {
                return (a.ct < b.ct ? -1 : 1) * d;
            }
            return (a.ts < b.ts ? -1 : 1) * d;
        },

        name(a, b, d) {
            if (a.t !== b.t) {
                return this.filefolder(a, b);
            }

            if (a.name !== b.name) {
                return this.str(a.name, b.name, d);
            }

            if (a.ts !== b.ts) {
                return this.date(a, b, d);
            }

            return this.compareStrings(a.h, b.h, d);
        },

        size(a, b, d) {
            if (a.t !== b.t) {
                return this.filefolder(a, b);
            }

            const aSize = a.s || a.tb || 0;
            const bSize = b.s || b.tb || 0;

            if (aSize === bSize) {
                return this.name(a, b, d);
            }
            return (aSize < bSize ? -1 : 1) * d;
        },

        type(a, b, d) {
            if (a.t !== b.t) {
                return this.filefolder(a, b);
            }

            if (typeof a.name === 'string' && typeof b.name === 'string') {
                const typeA = filetype(a.name);
                const typeB = filetype(b.name);

                if (typeA !== typeB) {
                    return this.compareStrings(typeA, typeB, d);
                }
            }

            return this.name(a, b, d);
        }
    });
});

var previews = Object.create(null);
var preqs = Object.create(null);
var pfails = Object.create(null);
var slideshowid;

(function _imageViewerSlideShow(global) {
    "use strict";

    var origImgWidth;
    var slideshowplay;
    var slideshowpause;
    var origImgHeight;
    var slideshowTimer;
    var fullScreenManager;
    var _hideCounter = false;
    var switchedSides = false;
    var fitToWindow = Object.create(null);
    var _pdfSeen = false;
    var _docxSeen = false;
    var optionsMenu;
    var settingsMenu;
    var preselection;
    const broadcasts = [];
    const MOUSE_IDLE_TID = 'auto-hide-previewer-controls';
    let zoomPan = false;

    const onConfigChange = (name) => {
        if (name === 'speed') {
            slideshow_timereset();
        }
    };

    const events = [
        'mega:openfolder',
        'updFileManagerUI',
        'chat_image_preview',
        'mega:gallery:view:after',
        'mega:close_fileversioning'
    ];

    const listener = () => {
        if (slideshowplay) {
            mega.slideshow.manager.setState({});
        }
    };

    for (let i = 0; i < events.length; i++) {
        mBroadcaster.addListener(events[i], listener);
    }

    function slideshow_handle(raw) {
        var result;

        if (slideshowid) {
            result = raw ? slideshowid : slideshowid.slice(-8);
        }
        return result || false;
    }

    function slideshow_legacySteps() {
        const $overlay = $('.media-viewer-container');
        const $controls = $('.gallery-btn', $overlay);
        const $counter = $('header .counter', $overlay);
        const $startButton = $('.v-btn.slideshow', $overlay);
        const forward = [];
        const backward = [];

        let slideShowItemCount = window.dl_node ? 2 : 0;
        const slideShowModeFilter = !slideShowItemCount &&
            (mega.slideshow.utils && mega.slideshow.utils.filterNodes(undefined, true) || (() => true));

        let current;
        let pos = [];
        let filter = (n) => (n.fa || !M.getNodeShare(n).down) && (is_image2(n) || is_video(n));
        let index = (i) => M.v[i].h;

        if (M.chat) {
            index = (i) => M.v[i].ch;
        }
        else if (preselection) {
            index = (i) => preselection[i].h;
            filter = () => true;
        }

        const list = preselection || M.v;
        for (let i = 0, m = list.length; i < m; ++i) {

            if (filter(list[i])) {
                // is currently previewed item
                if (index(i) === slideshowid) {
                    current = i;
                }
                pos.push(i);

                if (slideShowItemCount < 2 && slideShowModeFilter(list[i])) {

                    ++slideShowItemCount;
                }
            }
        }

        const len = pos.length;
        if (len > 1) {
            const n = pos.indexOf(current);
            switch (n) {
                // last
                case len - 1:
                    forward.push(index(pos[0]));
                    backward.push(index(pos[n - 1]));
                    break;
                // first
                case 0:
                    forward.push(index(pos[n + 1]));
                    backward.push(index(pos[len - 1]));
                    break;
                case -1:
                    break;
                default:
                    forward.push(index(pos[n + 1]));
                    backward.push(index(pos[n - 1]));
            }

            $counter.removeClass('hidden');
            $controls.removeClass('hidden');

            $startButton.toggleClass('hidden', slideShowItemCount < 2);
            $counter.text(String(l.preview_counter || '').replace('%1', pos = n + 1).replace('%2', len));
        }
        else {
            $counter.addClass('hidden');
            $controls.addClass('hidden');
            $startButton.addClass('hidden');
        }

        if (_hideCounter || is_video(M.v[current])) {
            $counter.addClass('hidden');
        }

        return {backward, forward, pos, len};
    }

    function slideshowsteps() {

        if (slideshowplay) {
            const {playIndex, playLength, backward, forward} = mega.slideshow.manager.next(slideshowid);

            if (!mega.slideshow.manager.isLast(playIndex) && forward === undefined) {
                mega.slideshow.manager.setState({});
                slideshow_next();
            }

            if (slideshowplay && !slideshowpause && mega.slideshow.manager.isLast(playIndex) && forward === undefined) {
                slideshow_toggle_pause($('.sl-btn.playpause', '.slideshow-controls'));
            }

            return {backward: [backward], forward: [forward], len: playLength, pos: playIndex};
        }

        return slideshow_legacySteps();
    }

    function slideshow_move(dir, steps) {
        var valid = true;
        var h = slideshow_handle();
        var step = dir === 'next' ? 'forward' : 'backward';
        $.videoAutoFullScreen = $(document).fullScreen();

        for (const i in self.dl_queue) {
            if (dl_queue[i].id === h && dl_queue[i].preview) {
                valid = false;
                return false;
            }
        }

        if (!valid) {
            return;
        }

        steps = steps || slideshowsteps();
        if (steps[step].length > 0) {
            const newShownHandle = steps[step][0];
            if (!newShownHandle) {
                return;
            }
            else if ($.videoAutoFullScreen && is_video(M.getNodeByHandle(newShownHandle))) {
                // Autoplay the next/prev video if it's in full screen mode
                $.autoplay = newShownHandle;
            }
            else if (slideshowplay < 0 && !previews[newShownHandle]) {
                if (d) {
                    console.warn('Waiting for %s to have loaded, cur=%s...', newShownHandle, slideshowid, steps);
                }
                slideshowplay = newShownHandle;
                if (!preqs[newShownHandle]) {
                    if (d) {
                        console.error('%s is not being fetched, forcefully doing so... debug & fix..', newShownHandle);
                    }
                    fetchsrc(newShownHandle);
                }
                return;
            }

            mBroadcaster.sendMessage(`slideshow:${dir}`, steps);
            slideshow(newShownHandle);

            if (is_mobile) {
                mobile.appBanner.updateBanner(newShownHandle);
            }
            else if (mega.ui.mInfoPanel) {
                // Rerender info panel when moving to next/previous at slide show.
                mega.ui.mInfoPanel.reRenderIfVisible([newShownHandle]);
            }
        }

        slideshow_timereset();
    }

    function slideshow_next(steps) {
        slideshow_move('next', steps);
    }

    function slideshow_prev(steps) {
        slideshow_move('prev', steps);
    }

    function slideshow_fullscreen($overlay) {
        var $button = $('footer .v-btn.fullscreen', $overlay);

        // Set the video container's fullscreen state
        var setFullscreenData = function(state) {

            if (page === 'download') {
                updateDownloadPageContainer($overlay, state);
                return false;
            }

            if (state) {
                $overlay.addClass('fullscreen').removeClass('browserscreen');
                $('i', $button).removeClass('icon-fullscreen-enter').addClass('icon-fullscreen-leave');
            }
            else {
                $overlay.addClass('browserscreen').removeClass('fullscreen');
                $('i', $button).removeClass('icon-fullscreen-leave').addClass('icon-fullscreen-enter');

                // disable slideshow-mode exiting from full screen
                if (slideshowplay) {
                    slideshow_imgControls(1);
                }
            }

            if (!$overlay.is('.video-theatre-mode')) {
                slideshow_imgPosition($overlay);
            }

            if (typeof psa !== 'undefined') {
                psa.repositionMediaPlayer();
            }
        };

        fullScreenManager = FullScreenManager($button, $overlay).change(setFullscreenData);
    }

    function updateDownloadPageContainer($overlay, state) {

        var $button = $('footer .v-btn.fullscreen', $overlay);

        if (state) {
            $overlay.parents('.download.download-page').addClass('fullscreen').removeClass('browserscreen');
            $('i', $button).removeClass('icon-fullscreen-enter').addClass('icon-fullscreen-leave');
            $overlay.addClass('fullscreen').removeClass('browserscreen');
        }
        else {
            $overlay.parents('.download.download-page').removeClass('browserscreen fullscreen');
            $('i', $button).removeClass('icon-fullscreen-leave').addClass('icon-fullscreen-enter');
            $overlay.removeClass('browserscreen fullscreen');
            slideshow_imgPosition($overlay);
        }

        if (!$overlay.is('.video-theatre-mode')) {
            slideshow_imgPosition($overlay);
        }
    }

    function slideshowNodeAttributes(n, $overlay) {
        var $favButton = $('.context-menu .favourite', $overlay);
        const $senBtn = $('.context-menu .set-sensitive', $overlay);
        var root = M.getNodeRoot(n && n.h || false);

        if (!n
            || !n.p
            || root === M.InboxID
            || root === 'shares'
            || self.pfid
            || root === M.RubbishID
            || (M.getNodeByHandle(n.h) && !M.getNodeByHandle(n.h).u && M.getNodeRights(n.p) < 2)
        ) {
            $favButton.addClass('hidden');
            $senBtn.addClass('hidden');
        }
        else {
            $favButton.removeClass('hidden');

            $favButton.rebind('click.mediaviewer', function() {
                var $button = $(this);
                var newFavState = Number(!M.isFavourite(n.h));

                M.favourite(n.h, newFavState);

                if (newFavState) {
                    $('span', $button).text(l[5872]);
                    if (is_video(n)) {
                        $('i', $button).removeClass('icon-favourite')
                            .addClass('icon-heart-broken-small-regular-outline');
                    }
                    else {
                        $('i', $button).removeClass('icon-favourite').addClass('icon-favourite-removed');
                    }
                    eventlog(501127);
                }
                else {
                    $('span', $button).text(l[5871]);
                    if (is_video(n)) {
                        $('i', $button).removeClass('icon-heart-broken-small-regular-outline')
                            .addClass('icon-favourite');
                    }
                    else {
                        $('i', $button).removeClass('icon-favourite-removed').addClass('icon-favourite');
                    }
                }
            });

            // Change favourite icon
            if (M.isFavourite(n.h)) {
                const icon = is_video(n) ? 'icon-heart-broken-small-regular-outline' : 'icon-favourite-removed';
                $('span', $favButton).text(l[5872]);
                $('i', $favButton).removeClass().addClass(`sprite-fm-mono ${icon}`);
            }
            else {
                $('span', $favButton).text(l[5871]);
                $('i', $favButton).removeClass().addClass('sprite-fm-mono icon-favourite');
            }

            const sen = mega.sensitives.getSensitivityStatus([n.h]);
            if (sen) {
                $senBtn.removeClass('hidden');
                const toHide = sen === 1;
                mega.sensitives.applyMenuItemStyle($senBtn, toHide);

                $senBtn.rebind('click.mediaviewer.sensitive_toggle', () => {
                    const doHide = !$senBtn.hasClass('sensitive-added');
                    mega.sensitives.toggleStatus([n.h], doHide);
                    if (doHide) {
                        eventlog(501128);
                    }
                });
            }
            else {
                $senBtn.addClass('hidden');
            }
        }
    }

    function slideshow_bin(n, $overlay) {
        const $infoButton = $('.v-btn.info', $overlay);
        const $optionButton = $('.v-btn.options', $overlay);
        const $sendToChat = $('.v-btn.send-to-chat', $overlay);
        const root = M.getNodeRoot(n && n.h || false);

        if (root === M.RubbishID) {
            $infoButton.removeClass('hidden');
            $optionButton.addClass('hidden');
            $sendToChat.addClass('hidden');
        }
        else {
            $infoButton.addClass('hidden');

            // Keep the Info panel option hidden on public links (but usable in regular Cloud Drive etc)
            const currentSitePath = getSitePath();
            if (!isPublicLink(currentSitePath)) {
                $optionButton.removeClass('hidden');
            }
        }

    }

    function slideshow_remove(n, $overlay) {

        var $removeButton = $('.context-menu .remove', $overlay);
        const $removeButtonV = $('.v-btn.remove', $overlay);
        var $divider = $removeButton.closest('li').prev('.divider');
        var root = M.getNodeRoot(n && n.h || false);
        const $sendToChatButton = $('.context-menu .send-to-chat', $overlay);

        if (!n || !n.p || root === M.InboxID || (root === 'shares' && M.getNodeRights(n.p) < 2) || self.pfid ||
            (M.getNodeByHandle(n.h) && !M.getNodeByHandle(n.h).u && M.getNodeRights(n.p) < 2) || M.chat) {

            $removeButton.addClass('hidden');
            $removeButtonV.addClass('hidden');
            $divider.addClass('hidden');
        }
        else if (is_mobile) {

            $removeButtonV.rebind('click.mediaviewer', () => {
            // TODO: work on this in view files ticket
            //     // Show the folder/file delete overlay
            //     mobile.deleteOverlay.show(n.h, () => {

                //     // After successful delete, hide the preview slideshow
                //     history.back();
                // });

            //     // Prevent double tap
            //     return false;
            });
        }
        else {
            $removeButton.removeClass('hidden');

            if (root === M.RubbishID) {
                $removeButtonV.removeClass('hidden');
            }
            else {
                $removeButtonV.addClass('hidden');
            }

            $divider.removeClass('hidden');

            const removeFunc = () => {
                if (M.isInvalidUserStatus()) {
                    history.back();
                    return false;
                }

                // Has to exit the full screen mode in order to show remove confirmation diagram
                if ($(document).fullScreen()) {
                    $(document).fullScreen(false);
                }

                fmremove();
                return false;
            };

            $removeButton.rebind('click.mediaviewer', () => {
                const res = removeFunc();
                eventlog(501130);
                return res;
            });
            $removeButtonV.rebind('click.mediaviewer', removeFunc);
        }

        if (is_video(n)) {
            $removeButton.addClass('mask-color-error');
            $('span', $removeButton).addClass('color-error');
            if (self.fminitialized && !self.pfid && u_type === 3 && M.currentrootid !== M.RubbishID) {
                $sendToChatButton.removeClass('hidden');
                $sendToChatButton.closest('li').prev('.divider').removeClass('hidden');
            }
            else {
                $sendToChatButton.addClass('hidden');
                $sendToChatButton.closest('li').prev('.divider').addClass('hidden');
            }
        }
        else {
            $removeButton.removeClass('mask-color-error');
            $('span', $removeButton).removeClass('color-error');
            $sendToChatButton.addClass('hidden');
            $sendToChatButton.closest('li').prev('.divider').addClass('hidden');
        }
    }

    function slideshow_addToAlbum(n, $overlay) {
        const $addToAlbumButton = $('.context-menu .add-to-album', $overlay);
        const $divider = $addToAlbumButton.closest('li').prev('.divider');

        if (M.getNodeRoot(n.h) === M.RootID && mega.gallery
            && mega.gallery.canShowAddToAlbum() && M.isGalleryNode(n)) {
            $addToAlbumButton.removeClass('hidden');
            $divider.removeClass('hidden');

            $addToAlbumButton.rebind('click.mediaviewer', () => {
                mega.gallery.albums.addToAlbum([n.h]);
                eventlog(501129);
            });
        }
        else {
            $addToAlbumButton.addClass('hidden');
            $divider.addClass('hidden');
        }
    }

    function slideshow_shareBtnUpd(n, $overlay) {
        const $getLinkBtn = $('.v-btn.getlink', $overlay || '.media-viewer-container');

        if (!$getLinkBtn.length) {
            return;
        }

        n = typeof n === 'object' ? n : M.getNodeByHandle(n);

        const root = M.getNodeRoot(n.h);

        if (!n || !n.p || root === 'shares' || root === M.RubbishID || self.pfid
            || !M.getNodeByHandle(n.h).u && M.getNodeRights(n.p) < 2) {

            $getLinkBtn.addClass('hidden');
            return;
        }

        const hasLink = M.getNodeShare(n.h);
        const label = hasLink ? l[6909] : mega.icu.format(l.share_link, 1);

        $('i', $getLinkBtn).attr('class', `sprite-fm-mono icon-link${hasLink ? '-gear' : ''}`);
        $getLinkBtn
            .attr('data-simpletip', label).attr('aria-label', label)
            .removeClass('hidden');

        $getLinkBtn.rebind('click.mediaviewer', () => {
            if ($getLinkBtn.hasClass('disabled')) {
                return;
            }

            $getLinkBtn.addClass('disabled');
            tSleep(3).then(() => $getLinkBtn.removeClass('disabled'));

            $(document).fullScreen(false);

            if (u_type === 0) {
                ephemeralDialog(l[1005]);
            }
            else {
                mega.Share.initCopyrightsDialog([slideshow_handle()]);
            }

            eventlog(501125);
            return false;
        });
    }

    function slideshow_node(id, $overlay) {
        let n = M.getNodeByHandle(id);

        if (!n) {
            if (typeof id === 'object') {
                n = new MegaNode(id);
            }
            else if (typeof dl_node !== 'undefined' && dl_node.h === id) {
                n = dl_node;
            }
        }

        if ($overlay) {
            slideshow_shareBtnUpd(n, $overlay);
        }

        return n || false;
    }

    function slideshow_aborttimer() {
        if (slideshowTimer) {
            slideshowTimer.abort();
            slideshowTimer = null;
        }
    }

    function slideshow_timereset() {
        slideshow_aborttimer();

        if (slideshowplay && !slideshowpause) {
            (slideshowTimer = tSleep(mega.slideshow.settings.speed.getValue() / 1e3))
                .then(() => {
                    if (slideshowplay) {
                        slideshowplay = -1;
                        slideshow_next();
                    }
                })
                .catch(dump);

            if (is_mobile) {
                $(window).one('blur.slideshowLoseFocus', () => {
                    slideshow_aborttimer();
                });
            }
        }
    }

    // Inits Image viewer bottom control bar
    function slideshow_imgControls(slideshow_stop, close) {
        var $overlay = $('.media-viewer-container', 'body');
        var $slideshowControls = $('.slideshow-controls', $overlay);
        var $slideshowControlsUpper = $('.slideshow-controls-upper', $overlay);
        var $imageControls = $('.image-controls', $overlay);
        var $viewerTopBar = $('header .viewer-bars', $overlay);
        var $prevNextButtons = $('.gallery-btn', $overlay);
        var $startButton = $('.v-btn.slideshow', $imageControls);
        var $pauseButton = $('.sl-btn.playpause', $slideshowControls);
        var $prevButton = $('.sl-btn.previous', $slideshowControls);
        var $nextButton = $('.sl-btn.next', $slideshowControls);

        if (slideshow_stop) {
            $viewerTopBar.removeClass('hidden');
            $imageControls.removeClass('hidden');
            $prevNextButtons.removeClass('hidden');
            $slideshowControls.addClass('hidden');
            $slideshowControlsUpper.addClass('hidden');
            slideshow_play(false, close);
            slideshowpause = false;
            $pauseButton.attr('data-state', 'pause');
            $('i', $pauseButton).removeClass('icon-play').addClass('icon-pause');

            slideshow_aborttimer();
            $(window).off('blur.slideshowLoseFocus');
            slideshowsteps(); // update x of y counter

            if (M.noSleep) {
                M.noSleep(true).catch(dump);
            }

            return false;
        }

        $imageControls.removeClass('hidden');

        // Bind Slideshow Mode button
        $startButton.rebind('click.mediaviewer', function() {
            if (!slideshowplay || mega.slideshow.settings.manager.hasToUpdateRender(settingsMenu)) {

                // Settings menu initialization
                if (!settingsMenu) {
                    settingsMenu = contextMenu.create({
                        template: $('#media-viewer-settings-menu', $overlay)[0],
                        sibling: $('.sl-btn.settings', $overlay)[0],
                        animationDuration: 150,
                        boundingElement: $overlay[0]
                    });
                }

                // Slideshow initialization
                mega.slideshow.settings.manager.render(settingsMenu, onConfigChange);
                mega.slideshow.manager.setState({nodes: preselection});
            }

            $overlay.addClass('slideshow');
            slideshow_play(true);
            slideshow_timereset();
            $viewerTopBar.addClass('hidden');
            $imageControls.addClass('hidden');
            $slideshowControls.removeClass('hidden');
            $slideshowControlsUpper.removeClass('hidden');
            $prevNextButtons.addClass('hidden');

            if (zoomPan) {
                zoomPan.reset();
            }

            if (M.noSleep) {
                M.noSleep().catch(dump);
            }

            if (is_mobile) {
                eventlog(pfcol ? 500841 : 99835);
                if (is_ios) {
                    // Due to the handling of the onload event with the previous image in iOS,
                    // force the call to img position
                    slideshow_imgPosition();
                }
            }
            else {
                eventlog(501131);
            }

            // hack to start the slideshow in full screen mode
            if (fullScreenManager) {
                fullScreenManager.enterFullscreen();
            }

            return false;
        });

        // Bind Slideshow Pause button
        $pauseButton.rebind('click.mediaviewer', function() {
            slideshow_toggle_pause($(this));
            return false;
        });

        // Bind Slideshow Prev button
        $prevButton.rebind('click.mediaviewer', function() {
            slideshow_prev();
            return false;
        });

        // Bind Slideshow Next button
        $nextButton.rebind('click.mediaviewer', function() {
            slideshow_next();
            return false;
        });

        $('.v-btn.browserscreen', $overlay).rebind('click.media-viewer', () => {
            $overlay.addClass('browserscreen');
            $overlay.parents('.download.download-page').addClass('browserscreen');
            if (typeof psa !== 'undefined') {
                psa.repositionMediaPlayer();
            }
            delay('viewerReze', () => slideshow_imgPosition($overlay), 200);
            return false;
        });

        // Bind Slideshow Close button
        $('.sl-btn.close', is_mobile ? $slideshowControls : $slideshowControlsUpper).rebind('click.mediaviewer', () => {
            slideshowplay_close();
            if (is_mobile && is_ios) {
                // Due to the handling of the onload event with the previous image in iOS,
                // force the call to img position
                slideshow_imgPosition();
            }
            return false;
        });
    }

    function getWH(id, viewerWidth, viewerHeight, imgWidth, imgHeight) {
        const wp = viewerWidth / origImgWidth;
        const hp = viewerHeight / origImgHeight;

        // Set minHeight, minWidth if image is bigger then browser window
        // Check if height fits browser window after reducing width
        if ((origImgWidth > viewerWidth && origImgHeight * wp <= viewerHeight)
            || (fitToWindow[id] && origImgHeight < viewerHeight
                && origImgWidth < viewerWidth && origImgHeight * wp <= viewerHeight)) {

            imgWidth = viewerWidth;
            imgHeight = origImgHeight * wp;
        }
        // Check if width fits browser window after reducing height
        else if ((origImgWidth > viewerWidth && origImgHeight * wp > viewerHeight)
            || (origImgWidth < viewerWidth && origImgHeight > viewerHeight)
            || (fitToWindow[id] && imgHeight < viewerHeight
                && origImgWidth < viewerWidth && origImgWidth * hp <= viewerWidth)) {

            imgWidth = origImgWidth * hp;
            imgHeight = viewerHeight;
        }
        else {
            imgWidth = origImgWidth;
            imgHeight = origImgHeight;
        }
        return [imgWidth, imgHeight];
    }

    // Sets scale value and image position
    function slideshow_imgPosition($overlay) {
        const $imgWrap = $('.img-wrap', $overlay);
        const $img = $('img.active', $overlay);

        if ($img.length === 0) {
            return false;
        }

        if (zoomPan && zoomPan.domNode.classList.value !== $img[0].classList.value) {
            zoomPan.destroy();
            zoomPan = false;
        }

        let imgWidth, imgHeight;
        const id = $imgWrap.attr('data-image');
        const viewerWidth = $imgWrap.width();
        const viewerHeight = $imgWrap.height();

        $img.attr('draggable', false);

        if (zoomPan.zoomMode) {
            imgWidth = switchedSides ? $img.height() : $img.width();
            imgHeight = switchedSides ? $img.width() : $img.height();
        }
        else {
            $img.removeAttr('style');

            imgWidth = (switchedSides ? $img.height() : $img.width()) || origImgWidth;
            imgHeight = (switchedSides ? $img.width() : $img.height()) || origImgHeight;

            [imgWidth, imgHeight] = getWH(id, viewerWidth, viewerHeight, imgWidth, imgHeight);

            $img.css({
                'width': switchedSides ? imgHeight : imgWidth
            });

            $img[0].dataset.initScale = imgWidth / origImgWidth * devicePixelRatio;

            // Init zoom and pan
            if (!zoomPan) {
                zoomPan = new MegaZoomPan({
                    domNode: $img[0],
                    slider: !(is_mobile && self.is_transferit) // only for mega desktop
                });
            }
            else if (!(is_mobile && self.is_transferit)) {
                zoomPan.setSliderValue();
            }
        }

        $img.css({
            'left': (viewerWidth - imgWidth) / 2,
            'top': (viewerHeight - imgHeight) / 2,
        });

        if (is_mobile && mega.ui.viewerOverlay) {
            mega.ui.viewerOverlay.zoom = imgWidth / origImgWidth * devicePixelRatio * 100;
        }
    }

    function detectEdgesViaCenter(img, container, buffer = 0.05) {
        const imgRect = img.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();

        const scaledWidth = imgRect.width;
        const scaledHeight = imgRect.height;

        const imgCenterX = imgRect.left + imgRect.width / 2;
        const imgCenterY = imgRect.top + imgRect.height / 2;

        const contCenterX = contRect.left + contRect.width / 2;
        const contCenterY = contRect.top + contRect.height / 2;

        const deltaX = imgCenterX - contCenterX;
        const deltaY = imgCenterY - contCenterY;

        const maxPanX = Math.max(0, (scaledWidth - contRect.width) / 2);
        const maxPanY = Math.max(0, (scaledHeight - contRect.height) / 2);

        const thresholdX = contRect.width * buffer;
        const thresholdY = contRect.height * buffer;

        const nearLeft = deltaX >= (maxPanX - thresholdX);
        const nearRight = deltaX <= -(maxPanX - thresholdX);
        const nearTop = deltaY >= (maxPanY - thresholdY);
        const nearBottom = deltaY <= -(maxPanY - thresholdY);

        const canPanX = scaledWidth > contRect.width;
        const canPanY = scaledHeight > contRect.height;

        return { // left, right, top, bottom etc indicate if we are at that edge or zoomed out from an edge
            left: canPanX && nearLeft || scaledWidth <= contRect.width,
            right: canPanX && nearRight || scaledWidth <= contRect.width,
            top: canPanY && nearTop || scaledHeight <= contRect.height,
            bottom: canPanY && nearBottom || scaledHeight <= contRect.height
        };
    }

    // Mobile finger gesture
    function slideshow_gesture(h, elm, type) {

        // TODO: change to `!is_touchable` to support desktop touch device
        if (!is_mobile || !is_touchable || !mega.ui.viewerOverlay) {
            return;
        }

        const name = type ? 'iframeGesture' : 'gesture';

        // Lets reset
        if (mega.ui.viewerOverlay[name]) {

            mega.ui.viewerOverlay[name].destroy();
            delete mega.ui.viewerOverlay[name];
        }

        // no node passed means it is closing
        if (!elm) {

            delete mega.ui.viewerOverlay.zoom;

            return;
        }

        let containerSelector;

        if (type) {

            containerSelector = type === 'PDF' ? '#viewerContainer' : 'body';
            elm = elm.contentDocument;
        }
        else {
            containerSelector = is_video(M.getNodeByHandle(h)) ? '.video-block' : '.img-wrap';
            elm = elm.querySelector('.content');
        }

        console.assert(elm, 'Invalid element to initialise slideshow gesture');

        const options = {
            domNode: elm,
            onTouchStart() {

                const container = this.domNode.querySelector(containerSelector);
                const style = {
                    top: container.scrollTop,
                    left: container.scrollLeft,
                    width: container.offsetWidth,
                    height: container.offsetHeight
                };

                if (containerSelector === '.img-wrap') {
                    const img = container.querySelector('img.active');
                    if (img) {
                        this.onEdge = detectEdgesViaCenter(img, container);
                        return;
                    }
                }

                this.onEdge = {
                    top: style.top === 0,
                    right: (style.left + container.offsetWidth) / style.width > 0.999,
                    bottom: (style.top + container.offsetHeight) / style.height > 0.999,
                    left: style.left === 0
                };
            },
            onDragging: function(ev) {
                // Stop tap to be triggered
                ev.stopPropagation();
                return;
            }
        };

        if (name === 'iframeGesture') {
            options.iframeDoc = elm;
        }

        options.onSwipeRight = options.onSwipeLeft = options.onSwipeDown = options.onSwipeUp = ev => {
            ev.preventDefault();
        };

        if (page !== 'download') {

            options.onSwipeRight = function(ev) {

                if (this.onEdge.left && ev.target.closest('.video-progress-bar') === null) {
                    slideshow_prev();
                }
            };

            options.onSwipeLeft = function(ev) {

                if (this.onEdge.right && ev.target.closest('.video-progress-bar') === null) {
                    slideshow_next();
                }
            };
        }

        if (!type) {

            options.onPinchZoom = function(ev, mag) {

                mega.ui.viewerOverlay.zoom *= mag;
            };
        }
        else if (type === 'DOCX') {
            options.onPinchZoom = function(ev, mag) {

                const dElm = this.domNode.documentElement;
                const curr = parseFloat(dElm.style.transform.replace(/[^\d.]/g, '')) || 1;

                if (!this.initZoom) {
                    this.initZoom = curr;
                }

                const newVal = Math.max(curr * mag, this.initZoom);

                dElm.style.transform = `scale(${newVal.toFixed(6)})`;
                dElm.classList.add('scaled');
            };
        }

        mega.ui.viewerOverlay[name] = new MegaGesture(options);
    }

    function sendToChatHandler() {
        $(document).fullScreen(false);
        const $wrapper = $('.media-viewer-container', 'body');
        const video = $('video', $wrapper).get(0);
        if (video && !video.paused && !video.ended) {
            video.pause();
        }
        $.noOpenChatFromPreview = true;
        openSendToChatDialog();
        eventlog(501124);

        mBroadcaster.sendMessage('trk:event', 'preview', 'send-chat');
    }

    // Viewer Init
    // eslint-disable-next-line complexity
    function slideshow(id, close, hideCounter, filteredNodeArr) {
        if (!close && M.isInvalidUserStatus()) {
            return false;
        }

        var $overlay = $('.media-viewer-container', 'body');
        var $content = $('.content', $overlay);
        var $controls = $('footer, header, .gallery-btn', $overlay);
        var $imgWrap = $('.img-wrap', $content);
        const $pendingBlock = $('.viewer-pending', $content);
        var $imageControls = $('.image-controls', $overlay);
        var $zoomSlider = $('.zoom-slider-wrap', $imageControls);
        var $playVideoButton = $('.play-video-button', $content);
        var $video = $('video', $content);
        var $videoControls = $('.video-controls', $overlay);
        var $dlBut = $('.v-btn.download', $overlay);
        var $prevNextButtons = $('.gallery-btn', $content);
        var $document = $(document);
        const $sendToChat = $('.v-btn.send-to-chat', $overlay);
        const $playPauseButton = $('.play-pause-video-button', $content);
        const $watchAgainButton = $('.watch-again-button', $content);

        if (d) {
            console.log('slideshow', id, close, slideshowid);
        }

        if (close) {
            if (window.selectionManager) {

                selectionManager.restoreResetTo();
            }
            sessionStorage.removeItem('previewNode');
            sessionStorage.removeItem('previewTime');
            switchedSides = false;
            slideshowid = false;
            $.videoAutoFullScreen = false;
            _hideCounter = false;
            slideshow_play(false, true);
            preselection = undefined;
            $overlay.removeClass('video video-theatre-mode mouse-idle slideshow fullscreen fullimage')
                .addClass('hidden');
            $playVideoButton.addClass('hidden');
            $watchAgainButton.addClass('hidden');
            $playPauseButton.addClass('hidden');
            $('i', $playPauseButton).removeClass().addClass('sprite-fm-mono icon-play-small-regular-solid');
            $videoControls.addClass('hidden');
            $zoomSlider.attr('data-perc', 100);
            $(window).off('resize.imgResize');
            $document.off('keydown.slideshow mousemove.idle');
            $imgWrap.attr('data-count', '');
            $('img', $imgWrap).attr('src', '').removeAttr('style').removeClass('active');
            $('.v-btn.active', $controls).removeClass('active');
            $('.speed i', $videoControls).removeClass()
                .addClass('sprite-fm-mono icon-playback-1x-small-regular-outline');
            $('.speed', $videoControls).removeClass('margin-2');
            $('.context-menu.playback-speed button i', $videoControls).addClass('hidden');
            $('.context-menu.playback-speed button.1x i', $videoControls).removeClass('hidden');
            $('div.video-subtitles', $content).remove();
            $('.context-menu.subtitles button i', $videoControls).addClass('hidden');
            $('.context-menu.subtitles button.off i', $videoControls).removeClass('hidden');
            $('.subtitles-wrapper', $videoControls).removeClass('hidden');
            $('button.subtitles', $videoControls).removeClass('mask-color-brand');
            $('button.subtitles i', $videoControls).removeClass('icon-subtitles-02-small-regular-solid')
                .addClass('icon-subtitles-02-small-regular-outline');
            if (optionsMenu) {
                contextMenu.close(optionsMenu);
            }
            if (settingsMenu) {
                contextMenu.close(settingsMenu);
            }
            if (fullScreenManager) {
                fullScreenManager.destroy();
                fullScreenManager = null;
            }
            if (zoomPan) {
                zoomPan.destroy();
                zoomPan = false;
            }
            for (const i in self.dl_queue) {
                if (dl_queue[i] && dl_queue[i].id === id) {
                    if (dl_queue[i].preview) {
                        dlmanager.abort(dl_queue[i]);
                    }
                    break;
                }
            }
            for (let i = broadcasts.length; i--;) {
                mBroadcaster.removeListener(broadcasts[i]);
            }
            slideshow_imgControls(1, true);
            mBroadcaster.sendMessage('slideshow:close');
            slideshow_freemem();
            $(window).off('blur.slideshowLoseFocus');
            if (M.noSleep) {
                M.noSleep(true).catch(dump);
            }

            if (is_mobile) {
                if (mega.ui.viewerOverlay) {
                    mega.ui.viewerOverlay.hide();
                }
            }

            if (_pdfSeen) {
                _pdfSeen = false;

                tryCatch(function() {
                    var ev = document.createEvent("HTMLEvents");
                    ev.initEvent("pdfjs-cleanup.meganz", true);
                    document.getElementById('pdfpreviewdiv1').contentDocument.body.dispatchEvent(ev);
                })();
            }
            if (_docxSeen) {
                _docxSeen = false;
                tryCatch(() => {
                    const ev = new Event('docxviewercleanup');
                    document.getElementById('docxpreviewdiv1').contentDocument.dispatchEvent(ev);
                })();
            }

            slideshow_gesture();

            return false;
        }

        var n = slideshow_node(id, $overlay);
        if (!n) {
            return;
        }

        // Checking if this the first preview (not a preview navigation)
        if (!slideshowid) {
            // then pushing fake states of history/hash
            if (page !== 'download' && (!history.state || history.state.view !== id)) {
                pushHistoryState();
            }
            _hideCounter = !d && hideCounter;
        }

        slideshowid = n.ch || n.h;
        if (window.selectionManager) {
            selectionManager.wantResetTo(n.h);
        }
        else {
            $.selected = [n.h];
        }
        mBroadcaster.sendMessage('slideshow:open', n);

        if (page !== 'download') {
            tryCatch(() => sessionStorage.setItem('previewNode', id))();
            pushHistoryState(true, Object.assign({subpage: page}, history.state, {view: slideshowid}));
        }

        // Clear previousy set data
        switchedSides = false;
        $('header .file-name', $overlay).text(n.name);
        $('header .file-size', $overlay).text(bytesToSize(n.s || 0));
        $('.viewer-error, #pdfpreviewdiv1, #docxpreviewdiv1', $overlay).addClass('hidden');
        $('.viewer-progress', $overlay).addClass('vo-hidden');

        if (!is_mobile) {
            $imageControls.addClass('hidden');
        }
        $zoomSlider.addClass('hidden');
        $prevNextButtons.addClass('hidden');
        $playVideoButton.addClass('hidden');
        $watchAgainButton.addClass('hidden');
        $playPauseButton.addClass('hidden');
        $('i', $playPauseButton).removeClass().addClass('sprite-fm-mono icon-play-small-regular-solid');
        $('.viewer-progress p, .video-time-bar', $content).removeAttr('style');

        if (!slideshowplay) {
            $('img', $imgWrap).removeClass('active');
        }

        // Clear video file data
        $video.css('background-image', '').removeAttr('poster src').addClass('hidden');
        $videoControls.addClass('hidden');
        $('.video-time-bar', $videoControls).removeAttr('style');
        $('.video-progress-bar', $videoControls).removeAttr('title');
        $('.video-timing', $videoControls).text('');
        $('.speed i', $videoControls).removeClass()
            .addClass('sprite-fm-mono icon-playback-1x-small-regular-outline');
        $('.speed', $videoControls).removeClass('margin-2');
        $('.context-menu.playback-speed button i', $videoControls).addClass('hidden');
        $('.context-menu.playback-speed button.1x i', $videoControls).removeClass('hidden');
        $('div.video-subtitles', $content).remove();
        $('.context-menu.subtitles button i', $videoControls).addClass('hidden');
        $('.context-menu.subtitles button.off i', $videoControls).removeClass('hidden');
        $('.subtitles-wrapper', $videoControls).removeClass('hidden');
        $('button.subtitles', $videoControls).removeClass('mask-color-brand');
        $('button.subtitles i', $videoControls).removeClass('icon-subtitles-02-small-regular-solid')
            .addClass('icon-subtitles-02-small-regular-outline');

        // Clear zoomPan data
        if (zoomPan) {
            zoomPan.destroy();
            zoomPan = false;
        }

        // Init full screen icon and related data attributes
        if ($document.fullScreen()) {
            $('.v-btn.fullscreen i', $imageControls)
                .addClass('icon-fullscreen-leave')
                .removeClass('icon-fullscreen-enter');

            $content.attr('data-fullscreen', 'true');
            $('.v-btn.fs', $videoControls).addClass('cancel-fullscreen').removeClass('go-fullscreen');
            $('.v-btn.fs i', $videoControls).removeClass()
                .addClass('sprite-fm-mono icon-minimize-02-small-regular-outline');
            $('.fs-wrapper .tooltip', $videoControls).text(l.video_player_exit_fullscreen);
        }
        else {
            $('.v-btn.fullscreen i', $imageControls)
                .removeClass('icon-fullscreen-leave')
                .addClass('icon-fullscreen-enter');

            $content.attr('data-fullscreen', 'false');
            $('.v-btn.fs', $videoControls).removeClass('cancel-fullscreen').addClass('go-fullscreen');
            $('.v-btn.fs i', $videoControls).removeClass()
                .addClass('sprite-fm-mono icon-maximize-02-small-regular-outline');
            $('.fs-wrapper .tooltip', $videoControls).text(l.video_player_fullscreen);
        }

        // Options context menu
        if (!optionsMenu && self.contextMenu) {
            optionsMenu = contextMenu.create({
                template: $('#media-viewer-options-menu', $overlay)[0],
                sibling: $('.v-btn.options', $overlay)[0],
                animationDuration: 150,
                boundingElement: $overlay[0]
            });
        }

        // Bind static events is viewer is not in slideshow mode to avoid unnecessary rebinds
        if (!slideshowplay) {
            $overlay.removeClass('fullscreen browserscreen mouse-idle slideshow video pdf docx');

            // Bind keydown events
            $document.rebind('keydown.slideshow', function(e) {
                const isDownloadPage = page === 'download';

                if (e.keyCode === 37 && slideshowid && !e.altKey && !e.ctrlKey && !isDownloadPage) {
                    mBroadcaster.sendMessage('trk:event', 'preview', 'arrow-key', this, self.slideshowid);
                    slideshow_prev();
                }
                else if (e.keyCode === 39 && slideshowid && !isDownloadPage) {
                    mBroadcaster.sendMessage('trk:event', 'preview', 'arrow-key', this, self.slideshowid);
                    slideshow_next();
                }
                else if (e.keyCode === 46 && fullScreenManager) {
                    fullScreenManager.exitFullscreen();
                }
                else if (e.keyCode === 27 && slideshowid && !$document.fullScreen()) {
                    mBroadcaster.sendMessage('trk:event', 'preview', 'close-btn', this, self.slideshowid);

                    if ($.dialog) {
                        closeDialog($.dialog);
                    }
                    else if ($.msgDialog) {
                        closeMsg(false);
                    }
                    else if (slideshowplay) {
                        slideshow_imgControls(1);
                    }
                    else if (isDownloadPage) {
                        $overlay.removeClass('fullscreen browserscreen');
                        $overlay.parents('.download.download-page').removeClass('fullscreen browserscreen');
                        if (typeof psa !== 'undefined') {
                            psa.repositionMediaPlayer();
                        }
                        delay('viewerReze', () => slideshow_imgPosition($overlay), 200);
                    }
                    else {
                        history.back();
                        return false;
                    }
                }
                else if ((e.keyCode === 8 || e.key === 'Backspace') && !isDownloadPage && !$.copyDialog
                        && !$.dialog && !$.msgDialog && mega.ui.mInfoPanel && !mega.ui.mInfoPanel.isOpen()) {
                    history.back();
                    return false;
                }
            });

            // Close icon
            $('.v-btn.close, .viewer-error-close', $overlay).rebind('click.media-viewer', function() {
                mBroadcaster.sendMessage('trk:event', 'preview', 'close-btn', this, self.slideshowid);

                if (page === 'download') {
                    if ($(document).fullScreen()) {
                        fullScreenManager.exitFullscreen();
                    }
                    $overlay.removeClass('fullscreen browserscreen');
                    $overlay.parents('.download.download-page').removeClass('fullscreen browserscreen');
                    if (is_mobile && zoomPan) {
                        zoomPan.destroy();
                        zoomPan = false;
                    }
                    if (typeof psa !== 'undefined') {
                        psa.repositionMediaPlayer();
                    }
                    delay('viewerReze', () => slideshow_imgPosition($overlay), 200);
                    return false;
                }
                history.back();
                if (mega.ui.mInfoPanel) {
                    mega.ui.mInfoPanel.hide();
                }
                return false;
            });

            $('.js-close-slideshow', $overlay).rebind('click.media-viewer', () => {
                slideshow(self.slideshowid, true);
            });

            // Keep the Info panel option hidden on public links (but usable in regular Cloud Drive etc)
            const currentSitePath = getSitePath();
            if (isPublicLink(currentSitePath)) {
                $('.v-btn.options', $overlay).addClass('hidden');
            }

            // Properties icon
            $('.context-menu .info, .v-btn.info', $overlay).rebind('click.media-viewer', () => {
                $document.fullScreen(false);
                // Use original ID to render info from chats
                mega.ui.mInfoPanel.show([slideshowid]);
                eventlog(501126);
                return false;
            });

            if (is_mobile) {

                $('.img-wrap', $overlay).rebind('tap.media-viewer', () => {

                    if (slideshowplay) {
                        return;
                    }

                    $overlay.toggleClass('fullimage');

                    slideshow_imgPosition($overlay);

                    // if (mega.flags.ab_ads) {
                        mega.commercials.updateOverlays();
                    // }

                    return false;
                });

                $('.go-fullscreen', $overlay).rebind('click.media-viewer', () => {
                    if (ua.details.os === "iPad") {
                        // iPad does not allow fullscreen mode for now
                        // therefore, we do not modify the header and imageControls
                        // since otherwise, we will not be able to revoke this action.
                        return;
                    }
                    if ($document.fullScreen()) {
                        $('header', $overlay).removeClass('hidden');
                        $imageControls.removeClass('hidden');
                    }
                    else {
                        $('header', $overlay).addClass('hidden');
                        $imageControls.addClass('hidden');
                    }
                });
            }
            else if (self.contextMenu) {
                // Options icon
                $('.v-btn.options, .sl-btn.settings', $overlay).rebind('click.media-viewer-settings', function() {
                    var $this = $(this);
                    const menu = $this.hasClass('settings') ? settingsMenu : optionsMenu;

                    if ($(this).hasClass('hidden')) {
                        return false;
                    }
                    if ($this.hasClass('active')) {
                        $this.removeClass('active deactivated');
                        if (menu === settingsMenu) {
                            $('i', $this).removeClass('icon-slider-filled').addClass('icon-slider-outline');
                        }
                        contextMenu.close(menu);
                        $overlay.removeClass('context-menu-open');
                    }
                    else {
                        $this.addClass('active deactivated').trigger('simpletipClose');
                        if (menu === settingsMenu) {
                            $('i', $this).removeClass('icon-slider-outline').addClass('icon-slider-filled');
                        }
                        // xxx: no, this is not a window.open() call..
                        // eslint-disable-next-line local-rules/open
                        contextMenu.open(menu);
                        $overlay.addClass('context-menu-open');
                    }
                    eventlog(501122);
                    return false;
                });

                if (self.fminitialized && !self.pfid
                    && self.u_type === 3 && M.currentrootid !== M.RubbishID && !is_video(n)) {

                    $sendToChat.removeClass('hidden');
                }
                else if (is_video(n)) {
                    $sendToChat.addClass('hidden');
                }

                $sendToChat.rebind('click.media-viewer', () => {
                    if (megaChatIsReady) {
                        sendToChatHandler();
                    }
                    else {
                        showToast('send-chat', l[17794]);
                        mBroadcaster.once('chat_initialized', () => sendToChatHandler());
                    }
                });

                $('.context-menu .send-to-chat', $overlay).rebind('click.media-viewer', () => {
                    $sendToChat.trigger('click.media-viewer');
                });

                // Close context menu
                $overlay.rebind('mouseup.media-viewer', (e) => {
                    const $target = $(e.target);
                    if ($target.parent().is('.v-btn.options, .sl-btn.settings')) {
                        // leave the click-handler dealing with it.
                        return;
                    }

                    $('.v-btn.options', $overlay).removeClass('active deactivated');
                    contextMenu.close(optionsMenu);

                    if (!$(e.target).parents('.slideshow-context-settings').length) {
                        const $settingsButton = $('.sl-btn.settings', $overlay);
                        $settingsButton.removeClass('active deactivated');
                        $('i', $settingsButton).removeClass('icon-slider-filled');
                        $('i', $settingsButton).addClass('icon-slider-outline');
                        contextMenu.close(settingsMenu);
                        $overlay.removeClass('context-menu-open');
                    }
                });
            }

            // Favourite and Sensitive icons
            slideshowNodeAttributes(n, $overlay);

            // Remove Icon
            slideshow_remove(n, $overlay);

            // Add to album icon
            slideshow_addToAlbum(n, $overlay);

            if (filteredNodeArr && Array.isArray(filteredNodeArr)) {
                preselection = filteredNodeArr;
            }

            // Icons for rubbish bin
            slideshow_bin(n, $overlay);

            // Previous/Next viewer buttons
            const steps = slideshowsteps();

            if (M.chat) {
                const {pos, len} = steps;

                if (pos + 6 > len || pos - 4 < 0) {
                    if (len < 2) {
                        $.triggerSlideShow = slideshowid;
                    }

                    queueMicrotask(() => megaChat.retrieveSharedFilesHistory().catch(dump));
                }
            }

            if (steps.backward.length) {
                $prevNextButtons.filter('.previous').removeClass('hidden opacity-50').removeAttr('disabled');
            }
            if (steps.forward.length) {
                $prevNextButtons.filter('.next').removeClass('hidden opacity-50').removeAttr('disabled');
            }

            $prevNextButtons.rebind('click.mediaviewer', function() {

                if (!this.classList.contains('hidden') && M.v.length > 1) {
                    const steps = slideshowsteps();

                    if (this.classList.contains('previous')) {

                        if (steps.backward.length) {

                            slideshow_prev(steps);
                        }
                    }
                    else if (this.classList.contains('next') && steps.forward.length) {

                        slideshow_next(steps);
                    }
                }

                return false;
            });

            const idleAction = is_mobile ? 'touchstart' : 'mousemove';

            delay.cancel(MOUSE_IDLE_TID);
            $document.off(`${idleAction}.idle`);
            $controls.off('mousemove.idle');

            // Slideshow Mode Init
            if (is_image3(n)) {
                slideshow_imgControls();

                // Autohide controls
                (function _() {
                    $overlay.removeClass('mouse-idle');
                    delay(MOUSE_IDLE_TID, () => $overlay.addClass('mouse-idle'), 2e3);
                    $document.rebind(`${idleAction}.idle`, _);
                })();

                if (!is_mobile) {
                    $controls.rebind('mousemove.idle', () => {
                        onIdle(() => {
                            delay.cancel(MOUSE_IDLE_TID);
                        });
                    });
                }

                if (fullScreenManager && fullScreenManager.state) {
                    $('.viewer-bars', $overlay).noTransition(() => {
                        $overlay.addClass('fullscreen');
                    });
                }

                if (!fullScreenManager) {
                    slideshow_fullscreen($overlay);
                }
            }
        }

        $dlBut.rebind('click.media-viewer', function _dlButClick() {

            if (this.classList && this.classList.contains('disabled')) {
                return false;
            }

            var p = previews[n && n.h];

            if (p && p.full && Object(p.buffer).byteLength) {
                M.saveAs(p.buffer, n.name)
                    .catch((ex) => {
                        if (d) {
                            console.debug(ex);
                        }
                        p.full = p.buffer = false;
                        _dlButClick.call(this);
                    });
                return false;
            }

            if (is_mobile) {
                mobile.downloadOverlay.showOverlay(n.h);
                return false;
            }

            for (var i = dl_queue.length; i--;) {
                if (dl_queue[i] && dl_queue[i].id === slideshow_handle() && dl_queue[i].preview) {
                    dl_queue[i].preview = false;
                    M.openTransfersPanel();
                    return;
                }
            }

            if (self.pfcol) {
                tryCatch(() => eventlog(M.isGalleryVideo(n) ? 99972 : 99973))();
            }

            // TODO: adapt the above code to work on the downloads page if we need to download the original
            if (page === 'download') {
                $('button.download-file').click();
            }
            else if (M.d[slideshow_handle()]) {
                M.addDownload([slideshow_handle()]);
            }
            else {
                M.addDownload([n]);
            }
            eventlog(501123);

            return false;
        });

        $('.js-download-t-file').rebind('click.media-viewer', () => {
            if (n.xh) {
                // eslint-disable-next-line local-rules/open -- opening ourselves
                window.open(T.core.getDownloadLink(n), '_self', 'noopener');
            }
            return false;
        });

        if ((n.p || M.chat || page === 'download') && M.getNodeRoot(n.p) !== M.RubbishID) {
            $dlBut.removeClass('hidden');
        }
        else {
            $dlBut.addClass('hidden');
        }

        if (previews[n.h]) {
            if (previews[n.h].fromChat) {
                previews[n.h].fromChat = null;

                if (previews[n.h].full) {
                    previewimg(n.h, previews[n.h].buffer);
                }
                else {
                    fetchsrc(n);
                }
            }
            else {
                previewsrc(n.h);
            }

            fetchnext();
        }
        else {
            if (is_video(n)) {
                $('img', $imgWrap).attr('src', '');
                $('.loader-grad', $content).removeClass('hidden');
            }
            else if (slideshowplay !== true) {
                $('img', $imgWrap).attr('src', '');
                $pendingBlock.removeClass('hidden');
            }

            if (!preqs[n.h]) {
                fetchsrc(n);
            }
        }

        $overlay.removeClass('hidden');

        if (mega.ui.viewerOverlay) {
            mega.ui.viewerOverlay.show(id);
        }
    }

    function slideshow_toggle_pause($button) {
        if ($button.attr('data-state') === 'pause') {
            $button.attr('data-state', 'play');
            $('i', $button).removeClass('icon-pause').addClass('icon-play');
            slideshowpause = true;
        }
        else {
            $button.attr('data-state', 'pause');
            $('i', $button).removeClass('icon-play').addClass('icon-pause');
            slideshowpause = false;
        }

        slideshow_timereset();
    }

    function slideshow_play(isPlayMode, isAbortFetch) {
        if (mega.slideshow.manager) {
            mega.slideshow.manager.setState({
                currentNodeId: slideshowid,
                isPlayMode,
                isAbortFetch,
                isNotBuildPlaylist: !isPlayMode && !slideshowplay
            });
        }
        slideshowplay = isPlayMode;
    }

    function slideshowplay_close() {
        slideshow_imgControls(1, true);

        // hack to also stop fullscreen
        if (fullScreenManager) {
            fullScreenManager.exitFullscreen();
        }
    }

    function fetchnext() {
        var n = M.getNodeByHandle(slideshowsteps().forward[0]);

        if (String(n.fa).indexOf(':1*') > -1 && !preqs[n.h]) {

            if (!previews[n.h] || previews[n.h].fromChat) {

                if (previews[n.h]) {
                    previews[n.h].fromChat = null;
                }

                fetchsrc(n.h);
            }
        }
    }

    function fetchsrc(id) {
        var n = slideshow_node(id);
        if (!n) {
            console.error('Node "%s" not found...', id);
            return false;
        }

        var eot = function eot(h, err) {
            delete preqs[h];
            delete pfails[h];
            if (n.s > 13e7 || !M.addDownload) {
                return previewimg(h, null);
            }
            M.addDownload([h], false, err ? -1 : true);
        };
        eot.timeout = 8500;

        var preview = function preview(ctx, h, u8) {
            previewimg(h, u8, ctx.type);

            if (isThumbnailMissing(n)) {
                createNodeThumbnail(n, u8);
            }
            if (h === slideshow_handle()) {
                fetchnext();
            }
            delete pfails[h];
        };


        if (d) {
            console.debug('slideshow.fetchsrc', id, n, n.h);
        }

        if (['pdf', 'docx'].includes(fileext(n.name))) {
            if (!preqs[n.h]) {
                preqs[n.h] = 1;

                const ext = fileext(n.name);
                M.gfsfetch(n.link || n.h, 0, -1).then((data) => {
                    const type = ext === 'pdf' ? 'application/pdf' : extmime.docx;

                    preview({ type }, n.h, data.buffer);

                }).catch((ex) => {
                    if (d) {
                        console.warn(`Failed to retrieve ${ext}, failing back to broken eye image...`, ex);
                    }

                    previewimg(n.h, null);
                    delete previews[n.h].buffer;
                    preqs[n.h] = 0; // to retry again
                    if (ex === EOVERQUOTA || Object(ex.target).status === 509) {
                        dlmanager.setUserFlags();
                        dlmanager.showOverQuotaDialog();
                    }
                });
            }
            return false;
        }

        if (is_video(n) || is_audio(n)) {
            if (!preqs[n.h]) {
                preqs[n.h] = 1;

                if (String(n.fa).indexOf(':1*') > 0) {
                    getImage(n, 1)
                        .then(uri => {
                            if (previews[n.h]) {
                                previews[n.h].poster = uri;
                            }
                            return uri;
                        })
                        .dump('preload.poster.' + n.h);
                }

                M.require('videostream').then(() => {
                    if (preqs[n.h]) {
                        previewimg(n.h, Array(26).join('x'), filemime(n, 'video/mp4'));
                    }
                }).catch(tell);
            }
            return false;
        }

        if (pfails[n.h]) {
            // for slideshow_next/prev
            if (slideshow_handle() === n.h) {
                return eot(n.h, 1);
            }
            delete pfails[n.h];
        }

        preqs[n.h] = 1;
        const maxSize = parseInt(localStorage.maxPrvOrigSize) || 50;
        var loadOriginal = n.s < maxSize * 1048576 && is_image(n) === 1;
        var loadPreview = !loadOriginal || !slideshowplay && n.s > 1048576;
        var onPreviewError = loadOriginal ? previewimg.bind(window, n.h, null) : eot;
        var getPreview = api_getfileattr.bind(window, {[n.h]: n}, 1, preview, onPreviewError);

        if (d) {
            console.debug('slideshow.fetchsrc(%s), preview=%s original=%s', id, loadPreview, loadOriginal, n, n.h);
        }

        var isCached = previews[n.h] && previews[n.h].buffer && !slideshowplay;
        if (isCached) {
            // e.g. hackpatch for chat who already loaded the preview...
            if (n.s > 1048576) {
                loadPreview = true;
                getPreview = preview.bind(null, false, n.h, previews[n.h].buffer);
            }
            else {
                loadPreview = false;
                preview(false, n.h, previews[n.h].buffer);
            }
        }

        if (loadOriginal) {
            var $overlay = $('.media-viewer-container');
            var $progressBar = $('.viewer-progress', $overlay);

            var progress = function(perc) {
                var loadingDeg = 360 * perc / 100;

                if (slideshow_handle() !== n.h) {
                    if (d && ((perc | 0) % 10) < 1) {
                        console.debug('slideshow original image loading in background progress...', n.h, perc);
                    }
                    return;
                }
                $progressBar.removeClass('vo-hidden');

                if (loadingDeg <= 180) {
                    $('.right-c p', $progressBar).css('transform', 'rotate(' + loadingDeg + 'deg)');
                    $('.left-c p', $progressBar).removeAttr('style');
                }
                else {
                    $('.right-c p', $progressBar).css('transform', 'rotate(180deg)');
                    $('.left-c p', $progressBar).css('transform', 'rotate(' + (loadingDeg - 180) + 'deg)');
                }

                if (loadingDeg === 360) {
                    $progressBar.addClass('vo-hidden');
                    $('p', $progressBar).removeAttr('style');
                }
            };

            M.gfsfetch(n.link || n.h, 0, -1, progress).then((data) => {
                preview({type: filemime(n, 'image/jpeg')}, n.h, data.buffer);
                if (!exifImageRotation.fromImage) {
                    previews[n.h].orientation = parseInt(EXIF.readFromArrayBuffer(data, true).Orientation) || 1;
                }
            }).catch((ex) => {
                if (ex === EOVERQUOTA || Object(ex.target).status === 509) {
                    eventlog(99703, true);
                }

                if (d) {
                    console.debug('slideshow failed to load original %s', n.h, ex.target && ex.target.status || ex);
                }

                if (slideshow_handle() === n.h) {
                    $progressBar.addClass('vo-hidden');
                }

                if (!(loadPreview || isCached)) {
                    getPreview();
                }

                slideshow_timereset();
            });
        }

        if (loadPreview) {
            if (loadOriginal) {
                fitToWindow[n.h] = 1;
            }
            getPreview();
        }
    }

    // start streaming a video file
    function slideshow_videostream(id, $overlay) {
        if (!$overlay || !$overlay.length) {
            $overlay = $('video:visible').closest('.media-viewer');
        }
        var n = slideshow_node(id, $overlay);
        var $content = $('.content', $overlay);
        const autoPlay = $.autoplay === id;
        const $pendingBlock = $('.loader-grad', $content);
        var $video = $('video', $content);
        var $playVideoButton = $('.play-video-button', $content);

        if (previews[id].fma === undefined && !is_audio(n)) {
            previews[id].fma = MediaAttribute(n).data || false;
        }

        $playVideoButton.rebind('click', function() {
            if (dlmanager.isOverQuota) {
                return dlmanager.showOverQuotaDialog();
            }

            var destroy = function() {
                $pendingBlock.addClass('hidden').end().trigger('video-destroy');

                if (preqs[n.h] && preqs[n.h] instanceof Streamer) {
                    mBroadcaster.removeListener(preqs[n.h].ev1);
                    mBroadcaster.removeListener(preqs[n.h].ev2);
                    mBroadcaster.removeListener(preqs[n.h].ev3);
                    mBroadcaster.removeListener(preqs[n.h].ev4);

                    preqs[n.h].kill();
                    preqs[n.h] = false;
                }

                sessionStorage.removeItem('previewNode');
                sessionStorage.removeItem('previewTime');
            };

            // Show loading spinner until video is playing
            $pendingBlock.removeClass('hidden');
            $('.video-controls', $overlay).removeClass('hidden');
            $overlay.addClass('video-theatre-mode');

            // Hide play button.
            $(this).addClass('hidden');
            $('.video-controls .playpause i', $overlay).removeClass('icon-play').addClass('icon-pause');

            if (is_mobile) {
                requestAnimationFrame(() => mega.initMobileVideoControlsToggle($overlay));
            }

            initVideoStream(n, $overlay, destroy).done(streamer => {
                preqs[n.h] = streamer;
                preqs[n.h].options.uclk = !autoPlay;

                preqs[n.h].ev1 = mBroadcaster.addListener('slideshow:next', destroy);
                preqs[n.h].ev2 = mBroadcaster.addListener('slideshow:prev', destroy);
                preqs[n.h].ev3 = mBroadcaster.addListener('slideshow:open', destroy);
                preqs[n.h].ev4 = mBroadcaster.addListener('slideshow:close', destroy);

                // If video is playing
                preqs[n.h].on('playing', function() {
                    var video = this.video;

                    if (video && video.duration) {

                        if (isThumbnailMissing(n) && is_video(n) === 1 && n.u === u_handle && n.f !== u_handle) {
                            var took = Math.round(2 * video.duration / 100);

                            if (d) {
                                console.debug('Video thumbnail missing, will take image at %s...',
                                    secondsToTime(took));
                            }

                            this.on('timeupdate', function() {
                                if (video.currentTime < took) {
                                    return true;
                                }

                                this.getImage().then(createNodeThumbnail.bind(null, n))
                                    .catch(console.warn.bind(console));
                            });
                        }

                        return false;
                    }

                    return true;
                });

                if (typeof psa !== 'undefined') {
                    psa.repositionMediaPlayer();
                }
            }).catch(console.warn.bind(console));
        });

        $overlay.addClass('video');
        $video.attr('controls', false).removeClass('hidden');
        $playVideoButton.removeClass('hidden');
        $pendingBlock.addClass('hidden');
        $('.img-wrap', $content).addClass('hidden');
        $content.removeClass('hidden');
        $('.viewer-pending', $content).addClass('hidden');

        if (n.name) {
            var c = MediaAttribute.getCodecStrings(n);
            if (c) {
                $('header .file-name', $overlay).attr('title', c);
            }
        }

        if (previews[id].poster !== undefined) {
            // $video.attr('poster', previews[id].poster);
            $video.css('background-image', `url(${previews[id].poster})`);
        }
        else if (String(n.fa).indexOf(':1*') > 0) {
            getImage(n, 1).then(function(uri) {

                previews[id].poster = uri;

                if (id === slideshow_handle()) {
                    if ($video.length && !$video[0].parentNode) {
                        // The video element got already destroyed/replaced due an error
                        $video = $('.content video', $overlay);
                    }

                    // $video.attr('poster', uri);
                    $video.css('background-image', `url(${uri})`);
                }
            }).catch(console.debug.bind(console));
        }

        previews[id].poster = previews[id].poster || '';

        if ($.autoplay === id) {
            queueMicrotask(() => {
                $playVideoButton.trigger('click');
            });
            delete $.autoplay;
        }
    }

    function isThumbnailMissing(n) {
        return !M.chat && (!n.fa || !n.fa.includes(':0*')) && M.shouldCreateThumbnail(n.p);
    }

    function createNodeThumbnail(n, ab) {
        if (isThumbnailMissing(n)) {
            if (d) {
                console.log('Thumbnail found missing on preview, creating...', n.h, n);
            }
            var aes = new sjcl.cipher.aes([
                n.k[0] ^ n.k[4],
                n.k[1] ^ n.k[5],
                n.k[2] ^ n.k[6],
                n.k[3] ^ n.k[7]
            ]);
            var img = is_image(n);
            var vid = is_video(n);
            createnodethumbnail(n.h, aes, n.h, ab, {raw: img !== 1 && img, isVideo: vid});
        }
    }

    const require = async(html, js, ...other) => {
        const files = [html, ...other];

        if (!self.is_extension) {
            files.push(...js);
        }
        await M.require(...files);

        const map = require.map[html];
        html = translate(pages[html]);

        for (let [k, v] of map) {
            v = self.is_extension && js.includes(v) ? bootstaticpath + jsl2[v].f : window[v];

            assert(!!v, `${l[16]}, ${k}`);

            html = html.replace(k, v);
        }

        return html;
    };
    lazy(require, 'map', () => {
        return freeze({
            pdfviewer: new Map([
                ['viewer.js', 'pdfviewerjs'],
                ['viewer.css', 'pdfviewercss'],
                ['../build/pdf.js', 'pdfjs2']
            ]),
            docxviewer: new Map([
                ['docx.js', 'docxviewer_js'],
                ['viewer.css', 'docxviewercss'],
                ['docx-preview.js', 'docxpreview_js']
            ])
        });
    });

    // a method to fetch scripts and files needed to run pdfviewer
    // and then excute them on iframe element [#pdfpreviewdiv1]
    function prepareAndViewPdfViewer(data) {
        const signal = tryCatch(() => {
            const elm = document.getElementById('pdfpreviewdiv1');
            elm.classList.remove('hidden');

            const ev = document.createEvent("HTMLEvents");
            ev.initEvent("pdfjs-openfile.meganz", true);
            ev.data = data.buffer || data.src;
            elm.contentDocument.body.dispatchEvent(ev);
            slideshow_gesture(data.h, elm, 'PDF');
            return true;
        });

        if (_pdfSeen) {

            if (signal()) {
                return;
            }
        }

        require('pdfviewer', ['pdfjs2', 'pdfviewerjs'], 'pdfviewercss').then((myPage) => {
            const id = 'pdfpreviewdiv1';
            const pdfIframe = document.getElementById(id);
            const newPdfIframe = document.createElement('iframe');
            newPdfIframe.id = id;
            newPdfIframe.src = 'about:blank';

            if (pdfIframe) {

                // replace existing iframe to avoid History changes [push]
                pdfIframe.parentNode.replaceChild(newPdfIframe, pdfIframe);
            }
            else {
                // making pdf iframe for initial start
                const p = document.querySelector('.pdf .media-viewer .content');

                if (p) {
                    p.appendChild(newPdfIframe);
                }
            }

            if (!newPdfIframe.contentWindow) {
                throw EINCOMPLETE;
            }
            var doc = newPdfIframe.contentWindow.document;
            doc.open();
            doc.write(myPage);
            doc.addEventListener('pdfjs-webViewerInitialized.meganz', function ack() {
                doc.removeEventListener('pdfjs-webViewerInitialized.meganz', ack);
                queueMicrotask(signal);
            });
            doc.close();
            _pdfSeen = true;
        }).catch(tell);
    }

    function prepareAndViewDocxViewer(data) {
        const signal = tryCatch(() => {
            const elem = document.getElementById('docxpreviewdiv1');
            elem.classList.remove('hidden');
            const ev = new Event('docxviewerload');
            ev.data = {
                blob: data.blob
            };
            elem.contentDocument.dispatchEvent(ev);
            slideshow_gesture(data.h, elem, 'DOCX');
        });

        if (_docxSeen) {
            signal();
            return;
        }

        require('docxviewer', ['docxpreview_js', 'docxviewer_js'], 'docxviewercss').then((myPage) => {
            const id = 'docxpreviewdiv1';
            const iframe = document.getElementById(id);
            const newIframe = document.createElement('iframe');
            newIframe.id = id;
            newIframe.src = 'about:blank';

            if (iframe) {

                // replace existing iframe to avoid History changes [push]
                iframe.parentNode.replaceChild(newIframe, iframe);
            }
            else {
                // making docx iframe for initial start
                const p = document.querySelector('.docx .media-viewer .content');

                if (p) {
                    p.appendChild(newIframe);
                }
            }
            if (!newIframe.contentWindow) {
                throw EINCOMPLETE;
            }
            const doc = newIframe.contentWindow.document;
            // eslint-disable-next-line local-rules/open
            doc.open();
            doc.write(myPage);
            doc.addEventListener('docxviewerready', function ready() {
                doc.removeEventListener('docxviewerready', ready);
                queueMicrotask(signal);
            });
            doc.addEventListener('docxviewererror', (ev) => {
                const { data } = ev;
                let errBody = '';
                if (data.error === -1) {
                    errBody = l.preview_failed_support;
                }
                else if (data.error === -2) {
                    errBody = l.preview_failed_temp;
                }
                msgDialog('error', '', l.preview_failed_title, errBody);
            });
            doc.close();
            _docxSeen = true;
        }).catch(tell);
    }

    function previewsrc(id) {
        var $overlay = $('.media-viewer-container', 'body');
        var $content = $('.content', $overlay);
        var $imgWrap = $('.img-wrap', $content);
        var $bottomBar = $('footer', $overlay);
        var $pendingBlock = $('.viewer-pending', $content);
        var $progressBlock = $('.viewer-progress', $content);

        var src = Object(previews[id]).src;
        if (!src) {
            console.error('Cannot preview %s', id);
            return;
        }

        var type = typeof previews[id].type === 'string' && previews[id].type || 'image/jpeg';
        mBroadcaster.sendMessage.apply(mBroadcaster, ['trk:event', 'preview'].concat(type.split('/')));

        $overlay.removeClass('pdf video video-theatre-mode');
        $('embed', $content).addClass('hidden');
        $('video', $content).addClass('hidden');
        $imgWrap.removeClass('hidden');
        $('#pdfpreviewdiv1, #docxpreviewdiv1', $content).addClass('hidden');
        $bottomBar.removeClass('hidden');

        if (previews[id].type === 'application/pdf') {
            $overlay.addClass('pdf');
            $pendingBlock.addClass('hidden');
            $progressBlock.addClass('vo-hidden');
            if (!is_mobile) {
                $bottomBar.addClass('hidden');
            }
            $imgWrap.addClass('hidden');
            // preview pdfs using pdfjs for all browsers #8036
            // to fix pdf compatibility - Bug #7796
            prepareAndViewPdfViewer(previews[id]);
            eventlog(99660);
            return;
        }
        if (previews[id].type === extmime.docx) {
            $overlay.addClass('docx');
            $pendingBlock.addClass('hidden');
            $progressBlock.addClass('vo-hidden');
            if (!is_mobile) {
                $bottomBar.addClass('hidden');
            }
            $imgWrap.addClass('hidden');
            prepareAndViewDocxViewer(previews[id]);
            eventlog(99819);
            return;
        }

        tryCatch(() => slideshow_gesture(previews[id].h, $overlay[0]), self.reportError)();

        const isVideoStream = /^(?:audio|video)\//i.test(previews[id].type);

        if (self.pfcol) {
            eventlog(isVideoStream ? 99970 : 99971);
        }

        if (isVideoStream) {
            return slideshow_videostream(id, $overlay);
        }

        // Choose img to set src for Slideshow transition effect
        var imgClass = $imgWrap.attr('data-count') === 'img1' ? 'img2' : 'img1';
        var replacement = false;

        if ($imgWrap.attr('data-image') === id) {
            replacement = $imgWrap.attr('data-count');
            if (replacement) {
                imgClass = replacement;

                if (d) {
                    console.debug('Replacing preview image with original', id, imgClass);
                }
            }
        }

        var img = new Image();
        img.onload = img.onerror = function(ev) {
            if (id !== slideshow_handle()) {
                if (d) {
                    console.debug('Moved to another image, not displaying %s...', id);
                }
                return;
            }
            var src1 = this.src;
            var $img = $('.' + imgClass, $imgWrap);
            var rot = previews[id].orientation | 0;

            if (slideshowplay) {
                if (previews[id].full
                    || previews[id].ffailed
                    || ev.type === 'error'
                    || is_image(M.getNodeByHandle(slideshowid)) !== 1) {

                    slideshow_timereset();
                }
            }

            if (ev.type === 'error') {
                src1 = noThumbURI;
                if (!replacement) {
                    // noThumbURI is a 240pt svg image over a 320pt container...
                    origImgWidth = origImgHeight = 320;
                }

                if (d) {
                    console.debug('slideshow failed to preview image...', id, src, previews[id].prev, ev);
                }

                // Restore last good preview
                if (previews[id].prev) {
                    URL.revokeObjectURL(previews[id].src);
                    previews[id] = previews[id].prev;
                    delete previews[id].prev;
                    previews[id].ffailed = 1;
                    this.src = previews[id].src;
                    return;
                }
            }
            else {
                switchedSides = rot > 4;

                if (switchedSides) {
                    origImgWidth = this.naturalHeight;
                    origImgHeight = this.naturalWidth;
                }
                else {
                    origImgWidth = this.naturalWidth;
                    origImgHeight = this.naturalHeight;
                }

                if (d) {
                    console.debug('slideshow loaded image %s:%sx%s, ' +
                        'orientation=%s', id, origImgWidth, origImgHeight, rot);
                }

                if (previews[id].fromChat !== undefined) {
                    replacement = false;
                }
            }

            // Apply img data to necessary image. If replacing preview->original,
            // update only the img's src and percent-label, to preserve any zoomed status.
            if (!replacement || switchedSides) {
                if (ua.details.engine === 'Gecko') {
                    // Prevent an issue where some previous images are shown moving to next
                    $('.img-wrap img', $overlay).attr('src', '');
                }
                $('img', $imgWrap).removeClass('active');
                $imgWrap.attr('data-count', imgClass);
                $imgWrap.attr('data-image', id);
                $img.attr('src', src1).one('load', () => {
                    $img.addClass('active');
                    slideshow_imgPosition($overlay);
                });

                if (previews[id].brokenEye) {
                    $img.addClass('broken-eye');
                }

                $(window).rebind('resize.imgResize', function() {
                    slideshow_imgPosition($overlay);
                });
            }
            else if (src1 !== noThumbURI) {
                $img.attr('src', src1).addClass('active');

                if ($img.hasClass('broken-eye')) {
                    $img.addClass('vo-hidden').removeClass('broken-eye');
                }

                // adjust zoom percent label
                onIdle(() => {
                    slideshow_imgPosition($overlay);
                    $img.removeClass('vo-hidden');
                });
            }

            // Apply exit orientation
            $img.removeClassWith('exif-rotation-').addClass('exif-rotation-' + rot).attr('data-exif', rot);

            $pendingBlock.addClass('hidden');
            $progressBlock.addClass('vo-hidden');
        };

        if (slideshowplay) {
            slideshow_aborttimer();
        }

        img.src = src;
    }

    function previewimg(id, uint8arr, type) {
        var blob;
        var n = M.getNodeByHandle(id);
        var brokenEye = false;

        if (uint8arr === null) {
            if (d) {
                console.debug('Using broken-eye image for %s...', id);
            }

            var svg = decodeURIComponent(noThumbURI.substr(noThumbURI.indexOf(',') + 1));
            var u8 = new Uint8Array(svg.length);
            for (var i = svg.length; i--;) {
                u8[i] = svg.charCodeAt(i);
            }
            uint8arr = u8;
            type = 'image/svg+xml';
            brokenEye = true;
        }

        type = typeof type === 'string' && type || 'image/jpeg';

        try {
            blob = new Blob([uint8arr], {type: type});
        }
        catch (ex) {
        }
        if (!blob || blob.size < 25) {
            blob = new Blob([uint8arr.buffer], {type: type});
        }

        const processFullPreview = () => {
            if (
                slideshowplay === id
                || (M.chat && typeof slideshowplay === 'string' && slideshowplay.split('!')[1] === id)
            ) {
                if (d) {
                    console.warn('Dispatching slideshow-play for %s...', id);
                }

                slideshow_next();
            }
            else if (id === slideshow_handle()) {
                previewsrc(id);
            }
        };

        if (previews[id]) {
            if (previews[id].full) {
                if (d && previews[id].fromChat !== null) {
                    console.warn('Not overwriting a full preview...', id);
                }
                processFullPreview();
                return;
            }
            previews[id].prev = previews[id];
        }

        if (d) {
            console.debug('slideshow.previewimg', id, previews[id]);
        }

        previews[id] = Object.assign(Object.create(null), previews[id], {
            h: id,
            blob: blob,
            type: type,
            time: Date.now(),
            src: myURL.createObjectURL(blob),
            buffer: uint8arr.buffer || uint8arr,
            full: n.s === blob.size,
            brokenEye: brokenEye
        });

        if (n.hash) {
            // cache previews by hash to reuse them in the chat
            previews[id].hash = n.hash;
            previews[n.hash] = previews[id];
        }

        processFullPreview();

        // Ensure we are not eating too much memory...
        tSleep.schedule(7, slideshow_freemem);
    }

    function slideshow_freemem() {
        var i;
        var k;
        var size = 0;
        var now = Date.now();
        var slideshowid = slideshow_handle();
        var entries = array.unique(Object.values(previews));

        for (i = entries.length; i--;) {
            k = entries[i];
            size += k.buffer && k.buffer.byteLength || 0;
        }

        if (d) {
            console.debug('Previews cache is using %s of memory...', bytesToSize(size));
        }
        const limit = is_mobile ? 100 : 450;

        if (size > limit * 1048576) {
            size = 0;

            for (i = entries.length; i--;) {
                var p = entries[i];

                if (p.h === slideshowid || !p.buffer || (now - p.time) < 2e4) {
                    continue;
                }
                k = p.h;

                size += p.buffer.byteLength;
                p.buffer = p.full = preqs[k] = false;

                if (p.prev) {
                    previews[k] = p.prev;
                    delete p.prev;
                }

                if (p.type.startsWith('image') || p.type === 'application/pdf') {
                    URL.revokeObjectURL(p.src);
                    if (previews[k] === p) {
                        previews[k] = false;
                    }
                }

                if (!previews[k] && p.hash) {
                    previews[p.hash] = false;
                }
            }

            if (d) {
                console.debug('...freed %s', bytesToSize(size));
            }
        }
    }


    /**
     * @global
     */
    global.slideshow = slideshow;
    global.slideshow.prepareAndViewPdfViewer = prepareAndViewPdfViewer;
    global.slideshow_next = slideshow_next;
    global.slideshow_prev = slideshow_prev;
    global.slideshow_handle = slideshow_handle;
    global.slideshow_steps = slideshowsteps;
    global.slideshow_shareBtnUpd = slideshow_shareBtnUpd;
    global.previewsrc = previewsrc;
    global.previewimg = previewimg;
    global.slideshowNodeAttributes = slideshowNodeAttributes;

})(self);

class MegaZoomPan {

    constructor(options) {

        this.domNode = options && options.domNode;

        if (!this.domNode) {
            return;
        }

        this.state = {
            minScale: options.minScale || 0.01,
            maxScale: options.maxScale || 30,
            sensitivity: options.sensitivity || 20,
            originOffset: false,
            transform: {
                originX: 0,
                originY: 0,
                translateX: 0,
                translateY: 0,
                scale: 1
            },
            touchGesture: {
                isActive: false,
                initialDistance: 0,
                initialScale: 1,
                lastTouchX: null,
                lastTouchY: null
            }
        };
        this.viewerNode = this.domNode.closest('.media-viewer');
        this.containerNode = this.domNode.parentNode;
        this.slider = options.slider && this.viewerNode.querySelector('.zoom-slider-wrap');
        this.panMode = false;
        this.zoomMode = false;
        this.onPick = (e) => {
            if (!this.zoomMode) {
                return;
            }

            if (e.type === 'mousedown') {
                this.containerNode.classList.add('picked');
                this.panMode = true;
            }
            else {
                this.containerNode.classList.remove('picked');
                this.panMode = false;
            }
        };
        this.onMove = (e) => {
            if (!this.zoomMode || !this.panMode) {
                return;
            }
            e.preventDefault();
            this.pan(
                e.movementX,
                e.movementY
            );
        };
        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);

        // Init slider
        if (this.slider) {
            this.initSlider();
        }

        // Init Pan
        this.onPick = this.onPick.bind(this);
        this.containerNode.addEventListener('mousedown', this.onPick);
        this.containerNode.addEventListener('mouseup', this.onPick);
        this.containerNode.addEventListener('mouseleave', this.onPick);
        this.containerNode.addEventListener('mousemove', this.onMove);
        this.containerNode.addEventListener('touchstart', this.onTouchStart, { passive: false });
        this.containerNode.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.containerNode.addEventListener('touchend', this.onTouchEnd, { passive: false });

        // Init Zoom
        $(this.viewerNode).rebind('mousewheel.imgzoom', (e) => {
            // e.preventDefault();
            this.zoom(
                e.pageX,
                e.pageY,
                Math.sign(e.deltaY)
            );
        });
    }

    initSlider() {
        // @todo: Create all nodes if option.slider === true
        const $sl = $('.zoom-slider', this.slider);
        const zoomInBtn = this.slider.querySelector('.v-btn.zoom-in');
        const zoomOutBtn =  this.slider.querySelector('.v-btn.zoom-out');

        // Do zoom with custom value
        const zoom = (s) => {
            const x = window.innerWidth / 2;
            const y = window.innerHeight / 2;
            this.zoom(x, y, s, true);
        };

        // Zoom in / out events
        const zoomEvt = (zoomIn) => {
            const { transform: { scale } } = this.state;
            zoom((scale * (zoomIn ? 1.2 : 0.9)).toFixed(3));
            return false;
        };

        // Set percents value in DOM node
        const setVal = (val) => {
            const tip = this.slider && this.slider.querySelector('.ui-slider-handle .mv-zoom-slider');

            if (tip) {
                tip.textContent = formatPercentage(
                    val * (this.domNode.dataset.initScale || 1)
                );
            }
        };

        // Init zoom slider
        $sl.slider({
            min: this.state.minScale,
            max: this.state.maxScale,
            range: 'min',
            step: 0.01,
            change: (e, ui) => {
                setVal(ui.value);
            },
            slide: (e, ui) => {
                zoom(ui.value.toFixed(2));
                setVal(ui.value);
            },
            create: () => {
                const t = this.slider.querySelector('.ui-slider-handle');
                mCreateElement('div', { class: 'mv-zoom-slider dark-direct-tooltip' }, t);
                mCreateElement('i', {
                    class: 'mv-zoom-slider-arrow sprite-fm-mono icon-tooltip-arrow'
                }, t);
            }
        });

        // Bind zoom in/out btoon events
        zoomInBtn.addEventListener('click', () => zoomEvt(true));
        zoomOutBtn.addEventListener('click', () => zoomEvt());

        // Set default state
        this.slider.classList.remove('hidden');
        this.setSliderValue();
    }

    setSliderValue(scale = 1) {
        $('.zoom-slider', this.slider).slider('value', Math.floor(scale * 100) / 100);
    }

    valueInRange(scale) {
        return scale <= this.state.maxScale && scale >= this.state.minScale;
    }

    getTranslate(axis, pos) {
        const { originX, originY, translateX, translateY, scale } = this.state.transform;
        const axisIsX = axis === 'x';
        const prevPos = axisIsX ? originX : originY;
        const translate = axisIsX ? translateX : translateY;

        return this.valueInRange(scale) && pos !== prevPos
            ? translate + (pos - prevPos * scale) * (1 - 1 / scale)
            : translate;
    }

    getNewScale(deltaScale) {
        const { transform: { scale }, minScale, maxScale, sensitivity } = this.state;
        const newScale = scale + deltaScale / (sensitivity / scale);

        return this.clamp(newScale, minScale, maxScale);
    }

    clamp(value, min, max) {
        return Math.max(Math.min(value, max), min);
    }

    getMatrix(scale, translateX, translateY) {
        return `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`;
    }

    clampedTranslate(axis, translate) {
        const { scale, originX, originY } = this.state.transform;
        const axisIsX = axis === 'x';
        const origin = axisIsX ? originX : originY;
        const axisKey = axisIsX ? 'offsetWidth' : 'offsetHeight';

        const containerSize = this.domNode.parentNode[axisKey];
        const imageSize = this.domNode[axisKey];
        const bounds = this.domNode.getBoundingClientRect();

        const imageScaledSize = axisIsX ? bounds.width : bounds.height;

        const defaultOrigin = imageSize / 2;
        const originOffset = (origin - defaultOrigin) * (scale - 1);

        const range = Math.max(0, Math.round(imageScaledSize) - containerSize);

        const max = Math.round(range / 2);
        const min = 0 - max;

        return this.clamp(translate, min + originOffset, max + originOffset);
    }

    renderClamped(translateX, translateY) {
        const { originX, originY, scale } = this.state.transform;

        this.state.transform.translateX = this.clampedTranslate('x', translateX);
        this.state.transform.translateY = this.clampedTranslate('y', translateY);

        requestAnimationFrame(() => {
            if (this.state.transform.originOffset) {
                this.domNode.style.transformOrigin = `${originX}px ${originY}px`;
            }
            this.domNode.style.transform = this.getMatrix(
                scale,
                this.state.transform.translateX,
                this.state.transform.translateY
            );
        });
    }

    zoom(x, y, deltaScale, cv) {
        const { transform: { scale }, minScale, maxScale } = this.state;
        const { left, top } = this.domNode.getBoundingClientRect();
        const originX = x - left;
        const originY = y - top;
        const newOriginX = originX / scale;
        const newOriginY = originY / scale;
        const translateX = this.getTranslate('x', originX);
        const translateY = this.getTranslate('y', originY);
        const newScale = cv ? this.clamp(deltaScale, minScale, maxScale) :
            this.getNewScale(deltaScale);

        this.state.transform = {
            ...this.state.transform,
            originOffset: true,
            originX: newOriginX,
            originY: newOriginY,
            scale: newScale
        };

        this.renderClamped(translateX, translateY);
        this.zoomMode = true;

        if (this.slider) {
            this.setSliderValue(newScale);
        }
    }

    pan(originX, originY) {
        this.renderClamped(
            this.state.transform.translateX + originX,
            this.state.transform.translateY + originY
        );
    }

    getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getTouchCenter(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }

    onTouchStart(e) {
        const touches = [...e.touches];

        if (touches.length === 2) {
            e.preventDefault();

            const touch1 = touches[0];
            const touch2 = touches[1];
            const distance = this.getTouchDistance(touch1, touch2);

            if (distance > 0) {
                this.state.touchGesture = {
                    isActive: true,
                    initialDistance: distance,
                    initialScale: this.state.transform.scale,
                    lastTouchX: null,
                    lastTouchY: null
                };
            }
        }
    }

    onTouchMove(e) {
        const touches = [...e.touches];

        if (touches.length === 2 && this.state.touchGesture.isActive) {
            e.preventDefault();

            const touch1 = touches[0];
            const touch2 = touches[1];
            const currentDistance = this.getTouchDistance(touch1, touch2);
            const center = this.getTouchCenter(touch1, touch2);

            const scaleChange = currentDistance / this.state.touchGesture.initialDistance;
            const newScale = this.state.touchGesture.initialScale * scaleChange;

            this.zoom(center.x, center.y, newScale, true);
        }
        else if (touches.length === 1 && this.zoomMode) {
            e.preventDefault();
            const touch = touches[0];
            const {lastTouchX, lastTouchY} = this.state.touchGesture;
            const movementX = touch.clientX - (lastTouchX || touch.clientX);
            const movementY = touch.clientY - (lastTouchY || touch.clientY);
            this.state.touchGesture.lastTouchX = touch.clientX;
            this.state.touchGesture.lastTouchY = touch.clientY;
            this.pan(movementX, movementY);
        }
    }

    onTouchEnd(e) {
        const touches = [...e.touches];

        if (touches.length < 2) {
            this.state.touchGesture.isActive = false;
            this.state.touchGesture.initialDistance = 0;
            this.state.touchGesture.initialScale = 1;
            this.state.touchGesture.lastTouchX = null;
            this.state.touchGesture.lastTouchY = null;
        }
    }

    reset() {
        if (this.domNode) {
            this.domNode.style.transformOrigin = '';
            this.domNode.style.transform = '';
        }
        this.state = {
            minScale: 0.01,
            maxScale: 30,
            sensitivity: 20,
            originOffset: false,
            transform: {
                originX: 0,
                originY: 0,
                translateX: 0,
                translateY: 0,
                scale: 1
            },
            touchGesture: {
                isActive: false,
                initialDistance: 0,
                initialScale: 1,
                lastTouchX: null,
                lastTouchY: null
            }
        };
        this.zoomMode = false;
    }

    destroy() {
        this.reset();
        this.containerNode.removeEventListener('mousedown', this.onPick);
        this.containerNode.removeEventListener('mouseup', this.onPick);
        this.containerNode.removeEventListener('mouseleave', this.onPick);
        this.containerNode.removeEventListener('mousemove', this.onMove);
        this.containerNode.removeEventListener('touchstart', this.onTouchStart);
        this.containerNode.removeEventListener('touchmove', this.onTouchMove);
        this.containerNode.removeEventListener('touchend', this.onTouchEnd);
        $(this.viewerNode).unbind('mousewheel.imgzoom');
        $(this.containerNode).unbind('mousemove.imgzoom');

        if (this.slider) {
            this.slider.classList.add('hidden');
            this.slider = null;
        }
    }
}

/** @property T.ui.compareSubpage */
lazy(T.ui, 'compareSubpage', () => {
    'use strict';

    T.ui.appendTemplate('js_ui_subpages_compare', T.ui.page.content);

    const cn = T.ui.page.content.querySelector('.js-compare-subpage');
    const box = cn.querySelector('.subpage-box');
    const compareData = [
        {
            wetransfer : {
                plan: l[1150],
                price: '0',
                quota: 2,
                expiry: 7,
                dls: 100,
                recipients: 3,
                trs: 10
            },
            transferit : {
                price:  '0',
                quota: 0,
                expiry: 90,
                dls: 0,
                recipients: 0
            }
        },
        {
            wetransfer : {
                plan: l[1150],
                price: '0',
                quota: 2,
                expiry: 7,
                dls: 100,
                recipients: 3,
                trs: 10
            },
            transferit : {
                plan: l.transferit_cmpr_free,
                price:  '0',
                quota: 0,
                expiry: 90,
                dls: 100,
                recipients: 0
            }
        },
        {
            wetransfer : {
                plan: l.transferit_cmpr_starter,
                price: '6.00',
                quota: 300,
                expiry: 7,
                dls: 100,
                recipients: 10,
                trs: 10
            },
            transferit : {
                plan: l.transferit_cmpr_pro,
                price:  '2.99',
                quota: 0,
                expiry: 0,
                dls: 0,
                recipients: 0
            }
        },
    ];

    // Import content
    T.ui.appendTemplate('js_ui_subpages_faq_body', box);
    T.ui.appendTemplate('js_ui_subpages_rtu_body', box);

    // Fill in the comparison data
    const fillData = (elm, data) => {
        const { plan, price, quota, expiry, dls, recipients, trs } = data;
        const priceNode = elm.querySelector('.price');
        const planNode = elm.querySelector('.plan');

        priceNode.textContent = '';
        priceNode.append(
            parseHTML(l.transferit_x_per_month.replace('%1', `&euro;${price}`))
        );

        if (plan) {
            planNode.classList.remove('hidden');
            planNode.textContent = plan;
        }
        else {
            planNode.classList.add('hidden');
        }

        if (trs) {
            elm.querySelector('.tr-per-mon').textContent =
                l.transferit_cmpr_tr_per_mo.replace('%1', trs);
        }

        elm.querySelector('.quota').textContent = quota ?
            l.transferit_cmpr_x_gb_per_mo.replace('%1', quota) : l.transferit_cmpr_unlim_tr_size;
        elm.querySelector('.expiry').textContent = expiry ?
            l.transferit_cmpr_expires_in_x.replace('%1', expiry) : l.transferit_cmpr_unlim_expiry;
        elm.querySelector('.dls').textContent = dls ?
            l.transferit_cmpr_x_dls.replace('%1', dls) : l.transferit_cmpr_unlim_dls;
        elm.querySelector('.recipients').textContent = recipients ?
            l.transferit_cmpr_x_recipients.replace('%1', recipients) : l.transferit_cmpr_unlim_recipients;
    };

    // Create PRO grid and fill in data
    const freeGrid = cn.querySelector('.cmpr-main-grid');
    const proGrid = freeGrid.cloneNode(true);

    for (const elm of proGrid.querySelectorAll('.col')) {
        fillData(elm, compareData[compareData.length - 1][elm.dataset.name]);
    }

    proGrid.classList.add('pro', 'hidden');
    cn.querySelector('.cmpr-head-body').append(proGrid);

    // Init segmented control (Now/Then)
    for (const elm of cn.querySelectorAll('.it-sgm-control input')) {
        elm.addEventListener('change', (e) => {
            const val = parseInt(e.target.value) || 0;

            for (const elm of freeGrid.querySelectorAll('.col')) {
                fillData(elm, compareData[val][elm.dataset.name]);
            }

            if (val) {
                proGrid.classList.remove('hidden');
            }
            else {
                proGrid.classList.add('hidden');
            }
        });
    }

    // Init all Try now btns
    for (const elm of cn.querySelectorAll('.js-try-now')) {
        elm.addEventListener('click', () => T.ui.loadPage('start'));
    }

    // Expand/collapse FAQ btns
    const toggleFaqItem = (item, collapse) => {
        const activeItem = cn.querySelector('.faq-content .item.active');

        // Do not activate if active item is clicked
        collapse = collapse || item.classList.contains('active');

        if (activeItem) {
            activeItem.classList.remove('active');
            activeItem.querySelector('button i').className = 'sprite-it-x24-mono icon-plus-circle-solid';
        }

        if (collapse) {
            return;
        }

        item.classList.add('active');
        item.querySelector('button i').className = 'sprite-it-x24-mono icon-close-circle-solid';
    };

    // Init FAQ btns
    for (const elm of cn.querySelectorAll('.faq-content .header')) {
        elm.addEventListener('click', (e) => toggleFaqItem(
            e.currentTarget.closest('.item'))
        );
    }

    return freeze({
        async init() {
            // Reset segmented control active state
            cn.querySelector('#subpage-cmpr-now-radio').click();

            // Close all FAQ
            for (const elm of cn.querySelectorAll('.faq-content .item.active')) {
                toggleFaqItem(elm, true);
            }

            T.ui.page.showSection(cn, 'compare', true);
        }
    });
});

/** @property T.ui.contactSubpage */
lazy(T.ui, 'contactSubpage', () => {
    'use strict';

    T.ui.appendTemplate('js_ui_subpages_contact', T.ui.page.content);

    const cn = T.ui.page.content.querySelector('.js-contact-subpage');

    return freeze({
        async init() {
            T.ui.page.showSection(cn, 'contact', true);
        }
    });
});

/** @property T.ui.errorSubpage */
lazy(T.ui, 'errorSubpage', () => {
    'use strict';

    T.ui.appendTemplate('js_ui_subpages_error', T.ui.page.content);

    const cn = T.ui.page.content.querySelector('.js-error-subpage');
    const errors = freeze({
        '-8': {
            h: l.transferit_error_expired_hdr,
            p: ''
        },
        '-9': {
            h: l.transferit_error_cant_find_hdr,
            p: l.transferit_error_unknown_rsn,
            '4': l.transferit_error_susp4repeat_rsn,
            '7': l.transferit_error_susp4tos_rsn
        },
        '-16': {
            h: l.transferit_error_na_transfer_hdr,
            p: l.transferit_error_copyright_rsn
        },
        '-19': {
            h: l.transferit_error_na_transfer_hdr,
            p: l.transferit_error_acc_limit_rsn
        },
    });

    // Init Get startes btns
    for (const elm of cn.querySelectorAll('.js-try-now')) {
        elm.addEventListener('click', () => T.ui.loadPage('start'));
    }

    return freeze({
        async init(ex, {u}) {
            // Set header/msg
            const info = errors[ex | 0] || errors[-9];

            cn.querySelector('h1').textContent = info.h;
            cn.querySelector('p').textContent = info[u] || info.p;

            // Show page, hide footer
            T.ui.page.showSection(cn, null, true);
            document.querySelector('.page-footer .js-subpage-footer')
                .classList.add('hidden');
        }
    });
});

/** @property T.ui.compareSubpage */
lazy(T.ui, 'faqSubpage', () => {
    'use strict';

    T.ui.appendTemplate('js_ui_subpages_faq', T.ui.page.content);

    const cn = T.ui.page.content.querySelector('.js-faq-subpage');
    const box = cn.querySelector('.subpage-box');

    // Import content
    T.ui.appendTemplate('js_ui_subpages_faq_body', box);
    T.ui.appendTemplate('js_ui_subpages_rtu_body', box);

    // Init all Try now btns
    for (const elm of cn.querySelectorAll('.js-try-now')) {
        elm.addEventListener('click', () => T.ui.loadPage('start'));
    }

    // Expand/collapse FAQ btns
    const toggleFaqItem = (item, collapse) => {
        const activeItem = cn.querySelector('.faq-content .item.active');

        // Do not activate if active item is clicked
        collapse = collapse || item.classList.contains('active');

        if (activeItem) {
            activeItem.classList.remove('active');
            activeItem.querySelector('button i').className = 'sprite-it-x24-mono icon-plus-circle-solid';
        }

        if (collapse) {
            return;
        }

        item.classList.add('active');
        item.querySelector('button i').className = 'sprite-it-x24-mono icon-close-circle-solid';
    };

    // Init FAQ btns
    for (const elm of cn.querySelectorAll('.faq-content .header')) {
        elm.addEventListener('click', (e) => toggleFaqItem(
            e.currentTarget.closest('.item'))
        );
    }

    return freeze({
        async init() {

            // Close all FAQ
            for (const elm of cn.querySelectorAll('.faq-content .item.active')) {
                toggleFaqItem(elm, true);
            }

            T.ui.page.showSection(cn, 'faq', true);
        }
    });
});

/** @property T.ui.featuresSubpage */
lazy(T.ui, 'featuresSubpage', () => {
    'use strict';

    T.ui.appendTemplate('js_ui_subpages_features', T.ui.page.content);

    const cn = T.ui.page.content.querySelector('.js-features-subpage');
    const box = cn.querySelector('.subpage-box');

    // Import content
    T.ui.appendTemplate('js_ui_subpages_rtu_body', box);

    // Init Try now / Get started buttons
    for (const elm of cn.querySelectorAll('.js-try-now')) {
        elm.addEventListener('click', () => T.ui.loadPage('start'));
    }

    // Init scrollTo button
    cn.querySelector('.js-scroll-down').addEventListener('click', () => {
        const elm = cn.querySelector('.js-sroll-to');
        document.body.scrollTo({
            top: elm.getBoundingClientRect().top + document.body.scrollTop,
            behavior: 'smooth'
        });
    });

    // Init segmented controls: Now / After buttons
    for (const elm of cn.querySelectorAll('.it-sgm-control input')) {
        elm.addEventListener('change', (e) => {
            const active = cn.querySelector('.tab-content.active');
            if (active) {
                active.classList.remove('active');
            }
            cn.querySelector(`.tab-content.content${e.target.value}`).classList.add('active');
        });
    }

    return freeze({
        async init() {
            T.ui.page.showSection(cn, 'features', true);
        },
    });
});

/** @property T.ui.privacySubpage */
lazy(T.ui, 'privacySubpage', () => {
    'use strict';

    T.ui.appendTemplate('js_ui_subpages_privacy', T.ui.page.content);

    const cn = T.ui.page.content.querySelector('.js-privacy-subpage');

    return freeze({
        async init() {

            T.ui.page.showSection(cn, 'privacy', true);
        }
    });
});

/** @property T.ui.terms */
lazy(T.ui, 'termsSubpage', () => {
    'use strict';

    T.ui.appendTemplate('js_ui_subpages_terms', T.ui.page.content);

    const cn = T.ui.page.content.querySelector('.js-terms-subpage');
    if (mega.tld !== 'nz') {
        const url = cn.querySelector('.nz-url');
        if (url) {
            url.href = url.href.replace('nz', mega.tld);
        }
    }

    return freeze({
        async init() {

            T.ui.page.showSection(cn, 'terms', true);
        }
    });
});
