/** @property T.core */
lazy(self.T, 'core', () => {
    'use strict';

    let uid = 0x7ff;
    const edx = '\x80';
    const storage = localStorage;
    const xRLock = Object.create(null);
    const xPwStore = Object.create(null);
    const xLinkInfo = Object.create(null);
    const parse = tryCatch((a) => JSON.parse(a));
    const stringify = tryCatch((a) => JSON.stringify(a));
    const getTime = (t, e = 174e10) => t ? parseInt(t, 16) + e : (Date.now() - e).toString(16);

    const encode = tryCatch((obj, raw = false) => {
        let s = `${edx}`;
        const l = Object.getOwnPropertyNames(obj);

        for (let i = l.length; i--;) {
            const k = l[i];
            let v = obj[k];
            let t = 0;

            switch (typeof v) {
                case 'object':
                    if (!Array.isArray(v)) {
                        t = 1;
                        v = encode(v, true);
                        break;
                    }
                /* fallthrough */
                case 'string':
                case 'number':
                    v = stringify(v);
                    break;
                default:
                    v = null;
            }

            if (v && v.length && k.length < 0x1f && v.length < 0x1ff) {
                const u = v.length << 7 | k.length - 1 << 2 | t;
                s += String.fromCharCode(u >> 8, u & 0xff) + k + v;
            }
        }
        return raw ? s.slice(1) : base64urlencode(s);
    });

    const decode = tryCatch((s, raw = false) => {
        const obj = Object.create(null);

        if (!raw && (s = base64urldecode(s || ''))) {
            s = s[0] === edx && s.slice(1) || '';
        }
        for (let i = 0; i < s.length;) {
            const u = s.charCodeAt(i++) << 8 | s.charCodeAt(i++);
            const j = u >> 7;
            const l = (u >> 2 & 0x1f) + 1;
            const k = s.substr(i, l);
            let v = s.substr(i + l, j);

            v = u & 3 ? decode(v, true) : parse(v);
            if (v) {
                obj[k] = v;
            }
            i += l + j;
        }
        return obj;
    });

    const sendAPIRequest = async(payload, options) => {
        const ctx = {
            valueOf: () => 7,
            apipath: T.core.apipath
        };
        if (options) {
            if (typeof options !== 'object') {
                options = false;
            }
            else if (xRLock.bt7) {
                await xRLock.bt7.promise;
            }
            const {result, responses} = await api.req(payload, freeze({...options, ...ctx}));
            return responses || result;
        }

        if (!xRLock.bt7) {
            Object.defineProperties(xRLock.bt7 = [], Object.getOwnPropertyDescriptors(Promise.withResolvers()));

            onIdle(() => {
                const bulk = [...xRLock.bt7];
                const {resolve} = xRLock.bt7;
                delete xRLock.bt7;

                sendAPIRequest(bulk.map(o => o.payload), true)
                    .then((res) => {
                        for (let i = res.length; i--;) {
                            bulk[i].resolve(res[i]);
                        }
                    })
                    .catch((ex) => {
                        for (let i = bulk.length; i--;) {
                            bulk[i].reject(ex);
                        }
                    })
                    .finally(resolve);
            });
        }
        const r = {payload, ...Promise.withResolvers()};
        xRLock.bt7.push(r);

        return r.promise;
    };

    const mkdirp = async(t, name) => {
        const n = {name};
        const a = ab_to_base64(crypto_makeattr(n));
        const k = a32_to_base64(n.k);

        return sendAPIRequest({a: 'xp', t, n: [{h: 'xxxxxxxx', t: 1, a, k}]}).then(({f: [{h}]}) => h);
    };

    const createSession = async() => {
        return self.u_sid || new Promise((resolve, reject) => {
            u_storage = init_storage(localStorage);
            u_checklogin({
                checkloginresult(_, v) {
                    return v === 0 ? resolve(v) : reject(v);
                }
            }, true);
        });
    };

    const createPassword = async(xh, p) => {
        xh = xh.length > 12
            ? base64urldecode(base64urldecode(xh)).slice(-7, -1)
            : base64urldecode(xh).slice(-6);
        const salt = Uint8Array.from(xh.repeat(3), s => s.charCodeAt(0));
        return ab_to_base64(await factory.require('pbkdf2').sha256(p, salt));
    };

    const cast = (v, k) => {
        const [raw, res] = cast.type(k, v);
        if (raw) {
            return res;
        }

        v = res;
        switch (typeof v) {
            case 'string':
                v = base64urlencode(v.trim());
                break;
            case 'boolean':
                v |= 0;
            /* fallthrough */
            case 'number':
                v = (v = parseInt(v)) > 0 && Number.isFinite(v) ? v : null;
                break;
            default:
                dump(`unexpected type, ${k} -> ${typeof v}`);
                v = null;
        }
        return v || undefined;
    };
    cast.type = (k, v) => {
        switch (k) {
            case 't':
            case 'm':
            case 'pw':
            case 'se':
                v = String(v || '');
                if (k === 'se' || k === 'pw') {
                    return [1, v.trim() || undefined];
                }
                else if (k === 't' || k === 'm') {
                    v = to8(v.trim());
                }
                break;
            case 'e':
            case 'mc':
                if ((v = Number(v)) < 1e3 && v > 0) {
                    if (k === 'e') {
                        v = ~~(v * 86400);
                    }
                }
                else if (v === 0) {
                    return [1, v];
                }
        }
        return [0, v];
    };
    freeze(cast);

    const TWorker = class {
        constructor(url) {
            const wk = new Worker(url);

            wk.onerror = (ex) => {
                console.error('Worker(s) sub-system error...', ex);
                this.kill(ex);
            };
            wk.onmessage = (ev) => {
                const {data} = ev;

                if (data && this.ongoing.has(data.ttoken)) {
                    const {resolve} = this.ongoing.get(data.ttoken);

                    resolve(data);
                    this.ongoing.delete(data.ttoken);

                    if (self.d) {
                        console.info(`wrk took ${~~(performance.now() - data.ts)}ms for ${data.length} nodes.`);
                    }
                }
                else {
                    console.log('Unknown message received...', ev);
                }
            };

            Object.defineProperty(this, 'wk', {value: wk});
            Object.defineProperty(this, 'ongoing', {value: new Map()});
        }

        kill(ex) {
            for (const [, {reject}] of this.ongoing) {
                reject(ex);
            }
            this.wk.onerror = null;
            this.wk.onmessage = null;
            tryCatch(() => this.wk.terminate())();
        }

        send(bulk) {
            assert(bulk.length);
            assert(this.wk.onmessage);

            const token = makeUUID();
            const resolver = Promise.withResolvers();

            bulk.ttoken = token;
            bulk.bulkpm = token;
            bulk.ts = performance.now();

            this.wk.postMessage(bulk);
            this.ongoing.set(token, resolver);

            return resolver.promise;
        }
    };

    return freeze({
        get apipath() {
            return 'https://bt7.api.mega.co.nz/';
        },
        wkpool: [],

        /**
         * create transfer.
         * @param {String} name transfer name
         * @returns {Promise<Array>} ["transferrootnodehandle","transferhandle"]
         * @memberOf T.core
         */
        async create(name) {
            if (!self.u_sid) {
                await createSession();
            }
            const n = {name, mtime: ~~(Date.now() / 1e3)};
            const at = ab_to_base64(crypto_makeattr(n));

            // k - plain AES key, at - attributes (structured and encrypted like node attrs)
            const [c, [xh, h]] = await sendAPIRequest({a: 'xn', at, k: a32_to_base64(n.k)});

            if (c !== 0) {
                throw c;
            }

            assert(typeof h === 'string' && h.length === 8);
            assert(typeof xh === 'string' && xh.length === 12);

            dump(`${getBaseUrl()}/t/${xh}`);

            return [h, xh];
        },

        /**
         * close an open transfer.
         * @param {String} xh transfer handle
         * @returns {Promise<Number>} Numeric error.
         * @memberOf T.core
         */
        async close(xh) {
            return sendAPIRequest({a: 'xc', xh});
        },

        /**
         * delete a transfer.
         * @param {String} xh transfer handle
         * @returns {Promise<Number>} Numeric error.
         * @memberOf T.core
         */
        async delete(xh) {
            return sendAPIRequest({a: 'xd', xh});
        },

        /**
         * list transfers.
         * @memberOf {@link T}
         * @returns {Promise<Array>} array of transfers with the elements
         * - xh (transfer handle)
         * - ct (closing timestamp if closed)
         * - h (handle of the associated root node)
         * - a/k (attributes/key for the root node)
         * - size (footprint as an array of [bytes/files/folders/0/0])
         */
        async list(f) {
            const result = await sendAPIRequest({a: 'xl'});

            if (f) {
                f = (s) => this.fetch(s.xh, 1).then((value) => Object.defineProperty(s, 'f', {value}));

                const p = [];
                for (let i = result.length; i--;) {
                    p.push(f(result[i]));
                }

                await Promise.all(p);
            }

            return result;
        },

        async fetch(xh, close) {
            if (close) {
                await this.close(xh).catch(nop);
            }

            const payload = {a: 'f', c: 1, r: 1};
            const xnc = await this.getExpiryValue(xh).catch(dump);
            if (xnc) {
                payload.xnc = 1;
                xPwStore[xh] = xnc[1];
            }
            let {f} = await this.xreq(payload, xh);

            if (!xnc) {
                this.setExpiryValue(xh, [1, xPwStore[xh]]).catch(dump);
            }
            f = await this.populate(f, xh).catch(dump) || f;
            return freeze(f);
        },

        async populate(f, xh) {
            if (f.length > 1e3) {
                const res = await this.decrypt(f).catch(dump);
                if (res && res.length === f.length) {
                    f = res;
                }
                else if (self.d) {
                    console.error('decryptor failed...', res, f);
                }
            }
            for (let i = f.length; i--;) {
                f[f[i].h] = f[i] = new TransferNode(f[i], xh);
            }
            process_f(f);

            return f;
        },

        async decrypt(f) {
            if (!this.wkpool.length) {
                const mw = Math.max(4, Math.min(navigator.hardwareConcurrency | 0, 12));

                for (let i = mw; i--;) {
                    this.wkpool.push(new TWorker(`/nodedec.js?v=${buildVersion.timestamp}`));
                }
            }

            let idx = 0;
            const wkp = [];
            const blk = 256 + f.length / this.wkpool.length;
            while (true) {
                const bulk = f.slice(idx, idx += blk);

                if (!bulk.length) {
                    break;
                }
                wkp.push(this.wkpool[wkp.length].send(bulk));
            }

            return (await Promise.all(wkp)).flat();
        },

        xreq(payload, x) {
            if (x instanceof TransferNode) {
                x = {x: x.xh};
            }
            if (typeof x !== 'object') {
                x = {x};
            }
            if (!('queryString' in x)) {
                x = {queryString: {...x}};
            }
            const k = JSON.stringify(x);

            if (!xRLock[k]) {
                xRLock[k] = [];

                queueMicrotask(() => {
                    const bulk = [...xRLock[k]];
                    delete xRLock[k];

                    if (xPwStore[x.queryString.x]) {
                        x.queryString.pw = xPwStore[x.queryString.x];
                    }

                    const ctx = freeze({
                        ...x,
                        async notifyUpstreamFailure(ex, _, {queryString}) {
                            if (ex === EKEY) {
                                const {x: xh, pw: opw} = queryString;
                                const pw = await T.ui.askPassword({
                                    async validate(value) {
                                        const pw = value && await createPassword(xh, value).catch(dump);
                                        if (!pw || pw === opw) {
                                            return l[17920];
                                        }
                                        xPwStore[xh] = queryString.pw = pw;
                                    },
                                    errorText: opw && l[17920]
                                });
                                return pw && self.EEXPIRED || self.EROLLEDBACK;
                            }
                        }
                    });
                    sendAPIRequest(bulk.map(o => o.payload), ctx)
                        .then((res) => {
                            for (let i = res.length; i--;) {
                                bulk[i].resolve(res[i]);
                            }
                        })
                        .catch((ex) => {
                            for (let i = bulk.length; i--;) {
                                bulk[i].reject(ex);
                            }
                        });
                });
            }
            const r = {payload, ...Promise.withResolvers()};
            xRLock[k].push(r);

            return r.promise;
        },

        async askPassword(xh) {
            let res = xPwStore[xh];
            if (!res) {
                const xnc = await this.getExpiryValue(xh).catch(dump);
                res = xnc && xnc[1];
            }
            if (!res) {
                await T.ui.askPassword({
                    async validate(value) {
                        loadingDialog.show();
                        const pw = await createPassword(xh, value)
                            .then((pw) => sendAPIRequest({a: 'xv', xh, pw}).then((res) => res === 1 && pw))
                            .catch(dump)
                            .finally(() => loadingDialog.hide());
                        if (!pw) {
                            return l[17920];
                        }
                        xPwStore[xh] = res = pw;
                    }
                });
            }
            return res;
        },

        async getImportedNodes(sel) {
            return sendAPIRequest({a: 'if', n: [...sel]});
        },

        getDownloadLink(n, direct = true) {
            if (typeof n === 'string') {
                n = M.getNodeByHandle(n);
            }
            const {h, xh, name} = n;
            const setLink = (base) => {
                M.l[h] = `${base}${encodeURIComponent(name)}`;
                if (xPwStore[xh]) {
                    M.l[h] += `${M.l[h].includes('?') ? '&' : '?'}pw=${xPwStore[xh]}`;
                }
            };

            if (direct === true) {
                setLink(`${this.apipath}cs/g?x=${xh}&n=${h}&fn=`);
            }
            if (!M.l[h] || direct === false) {
                M.l[h] = this.xreq({a: 'g', n: h, pt: 1, g: 1, ssl: 1}, n)
                    .then((res) => {
                        if (res.e || typeof res.g !== 'string' || !res.g.startsWith('http')) {
                            throw res.e || self.EINCOMPLETE;
                        }
                        setLink(`${res.g}/`);
                        return M.l[h];
                    })
                    .catch((ex) => {
                        M.l[h] = "\u200F";
                        throw ex;
                    });
            }
            return M.l[h];
        },

        async getTransferInfo(xh) {
            const result = await sendAPIRequest({a: 'xi', xh});
            xLinkInfo[xh] = result;
            return result;
        },

        async zipDownload(xh) {
            const {z, pw, size: [, files]} = xLinkInfo[xh] || await this.getTransferInfo(xh);
            let n = {h: z, xh, name: `${xh}${z}.zip`};
            if (files === 1) {
                let v = Object.values(M.d).filter(n => !n.t);
                if (!v.length && pw) {
                    await this.fetch(xh);
                    v = Object.values(M.d).filter(n => !n.t);
                }
                console.assert(v.length === 1, 'invalid number of local nodes per xi..?');
                if (v.length === 1) {
                    n = v[0];
                }
            }
            if (!n.h) {
                console.info(`no zip available for ${xh}`);
                return false;
            }
            const url = this.getDownloadLink(n);

            if (pw && !url.includes('pw=')) {
                M.l[z] = null;
                return this.askPassword(xh)
                    .then((pw) => pw && location.assign(`${url}&pw=${pw}`));
            }

            // eslint-disable-next-line local-rules/open -- opening ourselves
            window.open(url, '_self', 'noopener');
        },

        async upload(file, to, xh) {
            const isBlob = file instanceof Blob;
            const isNode = !isBlob && crypto_keyok(file);
            const files = !isNode && !isBlob && await factory.require('file-list').getFileList(file);

            if (!xh) {
                const def = `Transfer.it ${new Date().toISOString().replace('T', ' ').split('.')[0]}`;
                [to, xh] = await this.create(to || def);
            }
            if (files) {
                const p = [];
                const {mkdir} = factory.require('mkdir');
                const paths = await mkdir(to, files, mkdirp);

                for (let i = files.length; i--;) {
                    p.push(this.upload(files[i], paths[files[i].path] || to, xh));
                }
                return [xh, Promise.allSettled(p).then((a) => a.map((e) => e.reason || e.value))];
            }
            if (isNode) {
                if (!xRLock[to]) {
                    xRLock[to] = mega.promise;
                    xRLock[to].nodes = [];

                    onIdle(() => {
                        const {nodes, resolve, reject} = xRLock[to];

                        xRLock[to] = null;
                        sendAPIRequest({a: 'xp', t: to, n: nodes}).then(resolve).catch(reject);
                    });
                }
                xRLock[to].nodes.push({
                    t: 0,
                    h: file.h,
                    k: a32_to_base64(file.k),
                    a: file.a || ab_to_base64(crypto_makeattr(file))
                });
                return xRLock[to];
            }
            assert(isBlob);
            const {promise} = mega;

            file.xput = xh;
            file.id = ++uid;
            file.target = to;
            // file.ulSilent = -1;
            file.promiseToInvoke = promise;

            ul_queue.push(file);
            assert(ul_queue.length > 0);
            ulmanager.isUploading = true;

            return promise;
        },

        async setTransferAttributes(xh, {t, title, m, message, pw, password, e, expiry, se, sender, en, mc}) {

            t = cast(title || t, 't');
            e = cast(expiry || e, 'e');
            m = cast(message || m, 'm');
            se = cast(sender || se, 'se');

            if ((pw = cast(password || pw, 'pw'))) {

                pw = await createPassword(xh, pw);
            }
            if ((en = cast(e > 0 && en))) {

                en = en > 1 ? en : 3 * 864e3;
            }
            mc = cast(mc, 'mc');

            return sendAPIRequest({a: 'xm', xh, t, e, m, pw, se, en, mc});
        },

        async setTransferRecipients(xh, {e, email, s, schedule, ex, execution}, rh) {

            s = Number(schedule || s || 0);
            ex = Number(execution || ex) || undefined;
            e = String(email || e || '').trim() || undefined;

            return sendAPIRequest({a: 'xr', xh, rh, ex, e, s});
        },

        async setMultiTransferRecipients(xh, bulk) {
            return Promise.all(bulk.map((o) => this.setTransferRecipients(xh, o)));
        },

        async getTransferRecipients(xh) {
            const n = M.getNodeByHandle(xh);

            return sendAPIRequest({a: 'xrf', xh})
                .then((result) => {
                    if (n) {
                        n.xrf = result;
                    }
                    for (let i = result.length; i--;) {
                        const {rh, e} = result[i];

                        M.u[rh] =
                            M.u[e] = {...result[i], email: e, m: e, u: rh};
                    }
                    return result;
                });
        },

        async setPersistentValue(k, v) {
            const store = decode(storage.sit);
            storage.sit = encode({...store, [k]: v});
        },

        async getPersistentValue(k) {
            return decode(storage.sit)[k];
        },

        async setExpiryValue(k, v = 1) {
            const store = await this.getPersistentValue('ev');
            return this.setPersistentValue('ev', {...store, [k]: [v, getTime()]});
        },
        async getExpiryValue(k, e = 864e5) {
            let res = false;
            const now = Date.now();
            const store = await this.getPersistentValue('ev') || {};

            for (const j in store) {
                const [v, time] = store[j];

                if (now - getTime(time) > e) {
                    delete store[j];
                }
                else if (j === k) {
                    res = v;
                }
            }
            this.setPersistentValue('ev', store).catch(dump);
            return res;
        },

        transfer() {
            const target = freeze({
                'https://mega.app': 'https://transfer.it',
                'https://mega.nz': 'https://transfer.it',
                'https://transfer.it': `https://mega.${mega.tld}`
            })[self.is_extension || `${location.origin}`.endsWith('mega.co.nz') ? 'https://mega.nz' : location.origin];

            if (target) {
                let q = '';
                if (self.u_sid) {
                    q = tryCatch(() => `#sitetransfer!${btoa(JSON.stringify([self.u_k, self.u_sid]))}`)() || q;
                }
                window.open(target + q, '_blank', 'noopener,noreferrer');
            }
        },

        async test(i = 20) {
            const {rnd, name} = this;
            const [h, xh, p = []] = await this.create(name.slice(-4));

            self.d = 2;
            while (i--) {
                const wdh = 320 + (rnd[i] & 0x3ff);
                p.push(
                    webgl.createImage('pattern', wdh, wdh / 1.777 | 0)
                        .then((b) => this.upload(new File([b], `${this.name}.${b.type.split('/').pop()}`, b), h, xh))
                );
            }
            await Promise.allSettled(p);

            return this.list(1);
        },

        get name() {
            return String.fromCodePoint.apply(null, [...this.rnd].filter(c => c >> 8 === 40).slice(-9));
        },

        get rnd() {
            return crypto.getRandomValues(new Uint16Array(0x7fff));
        }
    });
});

/**
 * Air Datepicker
 */
;(function (window, $, undefined) { ;(function () {
    var VERSION = '2.2.3',
        pluginName = 'datepicker',
        autoInitSelector = '.datepicker-here',
        $body, $datepickersContainer,
        containerBuilt = false,
        baseTemplate = '' +
            '<div class="datepicker">' +
            '<i class="datepicker--pointer"></i>' +
            '<nav class="datepicker--nav"></nav>' +
            '<div class="datepicker--content"></div>' +
            '</div>',
        defaults = {
            classes: '',
            inline: false,
            language: 'en',
            startDate: new Date(),
            firstDay: '',
            weekends: [6, 0],
            dateFormat: '',
            altField: '',
            altFieldDateFormat: '@',
            toggleSelected: true,
            keyboardNav: true,

            position: 'bottom left',
            offset: 12,

            view: 'days',
            minView: 'days',

            showOtherMonths: true,
            selectOtherMonths: true,
            moveToOtherMonthsOnSelect: true,

            showOtherYears: true,
            selectOtherYears: true,
            moveToOtherYearsOnSelect: true,

            minDate: '',
            maxDate: '',
            disableNavWhenOutOfRange: true,

            multipleDates: false, // Boolean or Number
            multipleDatesSeparator: ',',
            range: false,

            todayButton: false,
            clearButton: false,

            showEvent: 'focus',
            autoClose: false,

            // navigation
            monthsField: 'monthsShort',
            prevHtml: '<svg><path d="M 17,12 l -5,5 l 5,5"></path></svg>',
            nextHtml: '<svg><path d="M 14,12 l 5,5 l -5,5"></path></svg>',
            navTitles: {
                days: 'MM, <i>yyyy</i>',
                months: 'yyyy',
                years: 'yyyy1 - yyyy2'
            },

            // timepicker
            timepicker: false,
            onlyTimepicker: false,
            dateTimeSeparator: ' ',
            timeFormat: '',
            minHours: 0,
            maxHours: 24,
            minMinutes: 0,
            maxMinutes: 59,
            hoursStep: 1,
            minutesStep: 1,

            // events
            onSelect: '',
            onShow: '',
            onHide: '',
            onChangeMonth: '',
            onChangeYear: '',
            onChangeDecade: '',
            onChangeView: '',
            onRenderCell: ''
        },
        hotKeys = {
            'ctrlRight': [17, 39],
            'ctrlUp': [17, 38],
            'ctrlLeft': [17, 37],
            'ctrlDown': [17, 40],
            'shiftRight': [16, 39],
            'shiftUp': [16, 38],
            'shiftLeft': [16, 37],
            'shiftDown': [16, 40],
            'altUp': [18, 38],
            'altRight': [18, 39],
            'altLeft': [18, 37],
            'altDown': [18, 40],
            'ctrlShiftUp': [16, 17, 38]
        },
        datepicker;

    var Datepicker  = function (el, options) {
        this.el = el;
        this.$el = $(el);

        this.opts = $.extend(true, {}, defaults, options, this.$el.data());

        if ($body == undefined) {
            $body = $('body');
        }

        if (!this.opts.startDate) {
            this.opts.startDate = new Date();
        }

        if (this.el.nodeName == 'INPUT') {
            this.elIsInput = true;
        }

        if (this.opts.altField) {
            this.$altField = typeof this.opts.altField == 'string' ? $(this.opts.altField) : this.opts.altField;
        }

        this.inited = false;
        this.visible = false;
        this.silent = false; // Need to prevent unnecessary rendering

        this.currentDate = this.opts.startDate;
        this.currentView = this.opts.view;
        this._createShortCuts();
        this.selectedDates = this.opts.selectedDates || [];
        this.views = {};
        this.keys = [];
        this.minRange = '';
        this.maxRange = '';
        this._prevOnSelectValue = '';

        this.init()
    };

    datepicker = Datepicker;

    datepicker.prototype = {
        VERSION: VERSION,
        viewIndexes: ['days', 'months', 'years'],

        init: function () {
            if (!containerBuilt && !this.opts.inline && this.elIsInput) {
                this._buildDatepickersContainer();
            }
            this._buildBaseHtml();
            this._defineLocale(this.opts.language);
            this._syncWithMinMaxDates();

            if (this.elIsInput) {
                if (!this.opts.inline) {
                    // Set extra classes for proper transitions
                    this._setPositionClasses(this.opts.position);
                    this._bindEvents()
                }
                if (this.opts.keyboardNav && !this.opts.onlyTimepicker) {
                    this._bindKeyboardEvents();
                }
                this.$datepicker.on('mousedown', this._onMouseDownDatepicker.bind(this));
                this.$datepicker.on('mouseup', this._onMouseUpDatepicker.bind(this));
            }

            if (this.opts.classes) {
                this.$datepicker.addClass(this.opts.classes)
            }

            if (this.opts.timepicker) {
                this.timepicker = new $.fn.datepicker.Timepicker(this, this.opts);
                this._bindTimepickerEvents();
            }

            if (this.opts.onlyTimepicker) {
                this.$datepicker.addClass('-only-timepicker-');
            }

            this.views[this.currentView] = new $.fn.datepicker.Body(this, this.currentView, this.opts);
            this.views[this.currentView].show();
            this.nav = new $.fn.datepicker.Navigation(this, this.opts);
            this.view = this.currentView;

            this.$el.on('clickCell.adp', this._onClickCell.bind(this));
            this.$datepicker.on('mouseenter', '.datepicker--cell', this._onMouseEnterCell.bind(this));
            this.$datepicker.on('mouseleave', '.datepicker--cell', this._onMouseLeaveCell.bind(this));

            this.inited = true;
        },

        _createShortCuts: function () {
            this.minDate = this.opts.minDate ? this.opts.minDate : new Date(-8639999913600000);
            this.maxDate = this.opts.maxDate ? this.opts.maxDate : new Date(8639999913600000);
        },

        _bindEvents : function () {
            this.$el.on(this.opts.showEvent + '.adp', this._onShowEvent.bind(this));
            this.$el.on('mouseup.adp', this._onMouseUpEl.bind(this));
            this.$el.on('blur.adp', this._onBlur.bind(this));
            this.$el.on('keyup.adp', this._onKeyUpGeneral.bind(this));
            $(window).on('resize.adp', this._onResize.bind(this));
            $('body').on('mouseup.adp', this._onMouseUpBody.bind(this));
        },

        _bindKeyboardEvents: function () {
            this.$el.on('keydown.adp', this._onKeyDown.bind(this));
            this.$el.on('keyup.adp', this._onKeyUp.bind(this));
            this.$el.on('hotKey.adp', this._onHotKey.bind(this));
        },

        _bindTimepickerEvents: function () {
            this.$el.on('timeChange.adp', this._onTimeChange.bind(this));
        },

        isWeekend: function (day) {
            return this.opts.weekends.indexOf(day) !== -1;
        },

        _defineLocale: function (lang) {
            if (typeof lang == 'string') {
                this.loc = $.fn.datepicker.language[lang];
                if (!this.loc) {
                    console.warn('Can\'t find language "' + lang + '" in Datepicker.language, will use "en" instead');
                    this.loc = $.extend(true, {}, $.fn.datepicker.language.en)
                }

                this.loc = $.extend(true, {}, $.fn.datepicker.language.en, $.fn.datepicker.language[lang])
            } else {
                this.loc = $.extend(true, {}, $.fn.datepicker.language.en, lang)
            }

            if (this.opts.dateFormat) {
                this.loc.dateFormat = this.opts.dateFormat
            }

            if (this.opts.timeFormat) {
                this.loc.timeFormat = this.opts.timeFormat
            }

            if (this.opts.firstDay !== '') {
                this.loc.firstDay = this.opts.firstDay
            }

            if (this.opts.timepicker) {
                this.loc.dateFormat = [this.loc.dateFormat, this.loc.timeFormat].join(this.opts.dateTimeSeparator);
            }

            if (this.opts.onlyTimepicker) {
                this.loc.dateFormat = this.loc.timeFormat;
            }

            var boundary = this._getWordBoundaryRegExp;
            if (this.loc.timeFormat.match(boundary('aa')) ||
                this.loc.timeFormat.match(boundary('AA'))
            ) {
               this.ampm = true;
            }
        },

        _buildDatepickersContainer: function () {
            containerBuilt = true;
            $body.safeAppend('<div class="datepickers-container" id="datepickers-container"></div>');
            $datepickersContainer = $('#datepickers-container');
        },

        _buildBaseHtml: function () {
            var $appendTarget,
                $inline = $('<div class="datepicker-inline">');

            if(this.el.nodeName == 'INPUT') {
                if (!this.opts.inline) {
                    $appendTarget = $datepickersContainer;
                } else {
                    $appendTarget = $inline.insertAfter(this.$el)
                }
            } else {
                $appendTarget = $inline.appendTo(this.$el)
            }

            $appendTarget.safeAppend(baseTemplate);
            this.$datepicker = this.opts.inline ? $('.datepicker-inline:last-child', $appendTarget)
                : $('.datepicker:last-child', $appendTarget);
            this.$content = $('.datepicker--content', this.$datepicker);
            this.$nav = $('.datepicker--nav', this.$datepicker);
        },

        _triggerOnChange: function () {
            if (!this.selectedDates.length) {
                // Prevent from triggering multiple onSelect callback with same argument (empty string) in IE10-11
                if (this._prevOnSelectValue === '') return;
                this._prevOnSelectValue = '';
                return this.opts.onSelect('', '', this);
            }

            var selectedDates = this.selectedDates,
                parsedSelected = datepicker.getParsedDate(selectedDates[0]),
                formattedDates,
                _this = this,
                dates = new Date(
                    parsedSelected.year,
                    parsedSelected.month,
                    parsedSelected.date,
                    parsedSelected.hours,
                    parsedSelected.minutes
                );

                formattedDates = selectedDates.map(function (date) {
                    return _this.formatDate(_this.loc.dateFormat, date)
                }).join(this.opts.multipleDatesSeparator);

            // Create new dates array, to separate it from original selectedDates
            if (this.opts.multipleDates || this.opts.range) {
                dates = selectedDates.map(function(date) {
                    var parsedDate = datepicker.getParsedDate(date);
                    return new Date(
                        parsedDate.year,
                        parsedDate.month,
                        parsedDate.date,
                        parsedDate.hours,
                        parsedDate.minutes
                    );
                })
            }

            this._prevOnSelectValue = formattedDates;
            this.opts.onSelect(formattedDates, dates, this);
        },

        next: function () {
            var d = this.parsedDate,
                o = this.opts;
            switch (this.view) {
                case 'days':
                    this.date = new Date(d.year, d.month + 1, 1);
                    if (o.onChangeMonth) o.onChangeMonth(this.parsedDate.month, this.parsedDate.year);
                    this.reflow();
                    break;
                case 'months':
                    this.date = new Date(d.year + 1, d.month, 1);
                    if (o.onChangeYear) o.onChangeYear(this.parsedDate.year);
                    this.reflow();
                    break;
                case 'years':
                    this.date = new Date(d.year + 10, 0, 1);
                    if (o.onChangeDecade) o.onChangeDecade(this.curDecade);
                    this.reflow();
                    break;
            }
        },

        prev: function () {
            var d = this.parsedDate,
                o = this.opts;
            switch (this.view) {
                case 'days':
                    this.date = new Date(d.year, d.month - 1, 1);
                    if (o.onChangeMonth) o.onChangeMonth(this.parsedDate.month, this.parsedDate.year);
                    this.reflow();
                    break;
                case 'months':
                    this.date = new Date(d.year - 1, d.month, 1);
                    if (o.onChangeYear) o.onChangeYear(this.parsedDate.year);
                    this.reflow();
                    break;
                case 'years':
                    this.date = new Date(d.year - 10, 0, 1);
                    if (o.onChangeDecade) o.onChangeDecade(this.curDecade);
                    this.reflow();
                    break;
            }
        },

        formatDate: function (string, date) {
            date = date || this.date;

            if (string === this.opts.navTitles.days) {
                return time2date(date.getTime() / 1000, 3);
            }
            else if (string === this.opts.navTitles.months) {
                return time2date(date.getTime() / 1000, 14);
            }
            else if (string === this.opts.navTitles.years) {

                var decade = datepicker.getDecade(date);
                var date1 = (new Date()).setYear(decade[0] - 1);
                var date2 = (new Date()).setYear(decade[1] + 2);
                return l[22899].replace('%d1', time2date(date1 / 1000, 14)).replace('%d2', time2date(date2 / 1000, 14));
            }

            var result = string,
                boundary = this._getWordBoundaryRegExp,
                locale = this.loc,
                leadingZero = datepicker.getLeadingZeroNum,
                decade = datepicker.getDecade(date),
                d = datepicker.getParsedDate(date),
                fullHours = d.fullHours,
                hours = d.hours,
                ampm = string.match(boundary('aa')) || string.match(boundary('AA')),
                dayPeriod = 'am',
                replacer = this._replacer,
                validHours;

            if (this.opts.timepicker && this.timepicker && ampm) {
                validHours = this.timepicker._getValidHoursFromDate(date, ampm);
                fullHours = leadingZero(validHours.hours);
                hours = validHours.hours;
                dayPeriod = validHours.dayPeriod;
            }

            switch (true) {
                case /@/.test(result):
                    result = result.replace(/@/, date.getTime());
                case /aa/.test(result):
                    result = replacer(result, boundary('aa'), dayPeriod);
                case /AA/.test(result):
                    result = replacer(result, boundary('AA'), dayPeriod.toUpperCase());
                case /dd/.test(result):
                    result = replacer(result, boundary('dd'), d.fullDate);
                case /d/.test(result):
                    result = replacer(result, boundary('d'), d.date);
                case /DD/.test(result):
                    result = replacer(result, boundary('DD'), locale.days[d.day]);
                case /D/.test(result):
                    result = replacer(result, boundary('D'), locale.daysShort[d.day]);
                case /mm/.test(result):
                    result = replacer(result, boundary('mm'), d.fullMonth);
                case /m/.test(result):
                    result = replacer(result, boundary('m'), d.month + 1);
                case /MM/.test(result):
                    result = replacer(result, boundary('MM'), this.loc.months[d.month]);
                case /M/.test(result):
                    result = replacer(result, boundary('M'), locale.monthsShort[d.month]);
                case /ii/.test(result):
                    result = replacer(result, boundary('ii'), d.fullMinutes);
                case /i/.test(result):
                    result = replacer(result, boundary('i'), d.minutes);
                case /hh/.test(result):
                    result = replacer(result, boundary('hh'), fullHours);
                case /h/.test(result):
                    result = replacer(result, boundary('h'), hours);
                case /yyyy/.test(result):
                    result = replacer(result, boundary('yyyy'), d.year);
                case /yyyy1/.test(result):
                    result = replacer(result, boundary('yyyy1'), decade[0]);
                case /yyyy2/.test(result):
                    result = replacer(result, boundary('yyyy2'), decade[1]);
                case /yy/.test(result):
                    result = replacer(result, boundary('yy'), d.year.toString().slice(-2));
            }

            return result;
        },

        _replacer: function (str, reg, data) {
            return str.replace(reg, function (match, p1,p2,p3) {
                return p1 + data + p3;
            })
        },

        _getWordBoundaryRegExp: function (sign) {
            var symbols = '\\s|\\.|-|/|\\\\|,|\\$|\\!|\\?|:|;';

            return new RegExp('(^|>|' + symbols + ')(' + sign + ')($|<|' + symbols + ')', 'g');
        },


        selectDate: function (date) {
            var _this = this,
                opts = _this.opts,
                d = _this.parsedDate,
                selectedDates = _this.selectedDates,
                len = selectedDates.length,
                newDate = '';

            if (Array.isArray(date)) {
                date.forEach(function (d) {
                    _this.selectDate(d)
                });
                return;
            }

            if (!(date instanceof Date)) return;

            this.lastSelectedDate = date;

            // Set new time values from Date
            if (this.timepicker) {
                this.timepicker._setTime(date);
            }

            // On this step timepicker will set valid values in it's instance
            _this._trigger('selectDate', date);

            // Set correct time values after timepicker's validation
            // Prevent from setting hours or minutes which values are lesser then `min` value or
            // greater then `max` value
            if (this.timepicker) {
                date.setHours(this.timepicker.hours);
                date.setMinutes(this.timepicker.minutes)
            }

            if (_this.view == 'days') {
                if (date.getMonth() != d.month && opts.moveToOtherMonthsOnSelect) {
                    newDate = new Date(date.getFullYear(), date.getMonth(), 1);
                }
            }

            if (_this.view == 'years') {
                if (date.getFullYear() != d.year && opts.moveToOtherYearsOnSelect) {
                    newDate = new Date(date.getFullYear(), 0, 1);
                }
            }

            if (newDate) {
                _this.silent = true;
                _this.date = newDate;
                _this.silent = false;
                _this.nav._render()
            }

            if (opts.multipleDates && !opts.range) { // Set priority to range functionality
                if (len === opts.multipleDates) return;
                if (!_this._isSelected(date)) {
                    _this.selectedDates.push(date);
                }
            } else if (opts.range) {
                if (len == 2) {
                    _this.selectedDates = [date];
                    _this.minRange = date;
                    _this.maxRange = '';
                } else if (len == 1) {
                    _this.selectedDates.push(date);
                    if (!_this.maxRange){
                        _this.maxRange = date;
                    } else {
                        _this.minRange = date;
                    }
                    // Swap dates if they were selected via dp.selectDate() and second date was smaller then first
                    if (datepicker.bigger(_this.maxRange, _this.minRange)) {
                        _this.maxRange = _this.minRange;
                        _this.minRange = date;
                    }
                    _this.selectedDates = [_this.minRange, _this.maxRange]

                } else {
                    _this.selectedDates = [date];
                    _this.minRange = date;
                }
            } else {
                _this.selectedDates = [date];
            }

            _this._setInputValue();

            if (opts.onSelect) {
                _this._triggerOnChange();
            }

            if (opts.autoClose && !this.timepickerIsActive) {
                if (!opts.multipleDates && !opts.range) {
                    _this.hide();
                } else if (opts.range && _this.selectedDates.length == 2) {
                    _this.hide();
                }
            }

            _this.views[this.currentView]._render()
        },

        removeDate: function (date) {
            var selected = this.selectedDates,
                _this = this;

            if (!(date instanceof Date)) return;

            return selected.some(function (curDate, i) {
                if (datepicker.isSame(curDate, date)) {
                    selected.splice(i, 1);

                    if (!_this.selectedDates.length) {
                        _this.minRange = '';
                        _this.maxRange = '';
                        _this.lastSelectedDate = '';
                    } else {
                        _this.lastSelectedDate = _this.selectedDates[_this.selectedDates.length - 1];
                    }

                    _this.views[_this.currentView]._render();
                    _this._setInputValue();

                    if (_this.opts.onSelect) {
                        _this._triggerOnChange();
                    }

                    return true
                }
            })
        },

        today: function () {
            this.silent = true;
            this.view = this.opts.minView;
            this.silent = false;
            this.date = new Date();

            if (this.opts.todayButton instanceof Date) {
                this.selectDate(this.opts.todayButton)
            }
        },

        clear: function () {
            this.selectedDates = [];
            this.minRange = '';
            this.maxRange = '';
            this.views[this.currentView]._render();
            this._setInputValue();
            if (this.opts.onSelect) {
                this._triggerOnChange()
            }
        },

        /**
         * Updates datepicker options
         * @param {String|Object} param - parameter's name to update. If object then it will extend current options
         * @param {String|Number|Object} [value] - new param value
         */
        update: function (param, value) {
            var len = arguments.length,
                lastSelectedDate = this.lastSelectedDate;

            if (len == 2) {
                this.opts[param] = value;
            } else if (len == 1 && typeof param == 'object') {
                this.opts = $.extend(true, this.opts, param)
            }

            this._createShortCuts();
            this._syncWithMinMaxDates();
            this._defineLocale(this.opts.language);
            this.nav._addButtonsIfNeed();
            if (!this.opts.onlyTimepicker) this.nav._render();
            this.views[this.currentView]._render();

            this.reflow();

            if (this.opts.onlyTimepicker) {
                this.$datepicker.addClass('-only-timepicker-');
            }

            if (this.opts.timepicker) {
                if (lastSelectedDate) this.timepicker._handleDate(lastSelectedDate);
                this.timepicker._updateRanges();
                this.timepicker._updateCurrentTime();
                // Change hours and minutes if it's values have been changed through min/max hours/minutes
                if (lastSelectedDate) {
                    lastSelectedDate.setHours(this.timepicker.hours);
                    lastSelectedDate.setMinutes(this.timepicker.minutes);
                }
            }

            this._setInputValue();

            return this;
        },

        reflow: function() {
            if (this.elIsInput && !this.opts.inline) {
                this._setPositionClasses(this.opts.position);
                if (this.visible) {
                    this.setPosition(this.opts.position)
                }
            }

            if (this.opts.classes) {
                this.$datepicker.addClass(this.opts.classes)
            }
        },

        _syncWithMinMaxDates: function () {
            var curTime = this.date.getTime();
            this.silent = true;
            if (this.minTime > curTime) {
                this.date = this.minDate;
            }

            if (this.maxTime < curTime) {
                this.date = this.maxDate;
            }
            this.silent = false;
        },

        _isSelected: function (checkDate, cellType) {
            var res = false;
            this.selectedDates.some(function (date) {
                if (datepicker.isSame(date, checkDate, cellType)) {
                    res = date;
                    return true;
                }
            });
            return res;
        },

        _setInputValue: function () {
            var _this = this,
                opts = _this.opts,
                format = _this.loc.dateFormat,
                altFormat = opts.altFieldDateFormat,
                value = _this.selectedDates.map(function (date) {
                    return _this.formatDate(format, date)
                }),
                altValues;

            if (opts.altField && _this.$altField.length) {
                altValues = this.selectedDates.map(function (date) {
                    return _this.formatDate(altFormat, date)
                });
                altValues = altValues.join(this.opts.multipleDatesSeparator);
                this.$altField.val(altValues);
            }

            value = value.join(this.opts.multipleDatesSeparator);

            this.$el.val(value)
        },

        /**
         * Check if date is between minDate and maxDate
         * @param date {object} - date object
         * @param type {string} - cell type
         * @returns {boolean}
         * @private
         */
        _isInRange: function (date, type) {
            var time = date.getTime(),
                d = datepicker.getParsedDate(date),
                min = datepicker.getParsedDate(this.minDate),
                max = datepicker.getParsedDate(this.maxDate),
                dMinTime = new Date(d.year, d.month, min.date).getTime(),
                dMaxTime = new Date(d.year, d.month, max.date).getTime(),
                types = {
                    day: time >= this.minTime && time <= this.maxTime,
                    month: dMinTime >= this.minTime && dMaxTime <= this.maxTime,
                    year: d.year >= min.year && d.year <= max.year
                };
            return type ? types[type] : types.day
        },

        _getDimensions: function ($el) {
            var offset = $el.offset();

            return {
                width: $el.outerWidth(),
                height: $el.outerHeight(),
                left: offset.left,
                top: offset.top
            }
        },

        _getDateFromCell: function (cell) {
            var curDate = this.parsedDate,
                year = cell.data('year') || curDate.year,
                month = cell.data('month') == undefined ? curDate.month : cell.data('month'),
                date = cell.data('date') || 1;

            return new Date(year, month, date);
        },

        _setPositionClasses: function (pos) {
            pos = pos.split(' ');
            var main = pos[0],
                sec = pos[1],
                classes = 'datepicker -' + main + '-' + sec + '- -from-' + main + '-';

            if (this.visible) classes += ' active';

            this.$datepicker
                .removeAttr('class')
                .addClass(classes);
        },

        setPosition: function (position) {
            if (this.opts.setPosition) {
                this.opts.setPosition(this.$datepicker);
                return;
            }

            position = position || this.opts.position;

            var dims = this._getDimensions(this.$el),
                selfDims = this._getDimensions(this.$datepicker),
                pos = position.split(' '),
                top, left,
                offset = this.opts.offset,
                main = pos[0],
                secondary = pos[1];

            switch (main) {
                case 'top':
                    if (this.view == 'days') {
                        // If calendar is in date picking mode, calculate the top normally
                        // Datepicker usually has 5 rows, so no adjustments are necessary
                        top = dims.top - selfDims.height - offset;

                        // If datepicker has 6 rows, increase the gap (example: December 2023)
                        if (selfDims.height >= 330) top = top - offset/7;

                        // If datepicker has 4 rows, decrease the gap (example: February 2026)
                        else if (selfDims.height <= 280) top = top + offset/7;
                    }
                    else {
                        // In month/year picking mode, this reduces the gap between input and calendar
                        top = dims.top - selfDims.height/1.85 - offset;
                    }
                    break;
                case 'right':
                    left = dims.left + dims.width + offset;
                    break;
                case 'bottom':
                    top = dims.top + dims.height + offset;
                    break;
                case 'left':
                    left = dims.left - selfDims.width - offset;
                    break;
            }

            switch(secondary) {
                case 'top':
                    top = dims.top;
                    break;
                case 'right':
                    left = dims.left + dims.width - selfDims.width;
                    break;
                case 'bottom':
                    top = dims.top + dims.height - selfDims.height;
                    break;
                case 'left':
                    left = dims.left;
                    break;
                case 'center':
                    if (/left|right/.test(main)) {
                        top = dims.top + dims.height/2 - selfDims.height/2;
                    } else {
                        left = dims.left + dims.width/2 - selfDims.width/2;
                    }
            }

            this.$datepicker
                .css({
                    left: left,
                    top: top
                })
        },

        show: function () {
            var onShow = this.opts.onShow;

            this.setPosition(this.opts.position);
            this.$datepicker.addClass('active');
            this.visible = true;

            if (onShow) {
                this._bindVisionEvents(onShow)
            }
        },

        hide: function () {
            var onHide = this.opts.onHide;

            this.$datepicker
                .removeClass('active')
                .css({
                    left: '-100000px'
                });

            this.focused = '';
            this.keys = [];

            this.inFocus = false;
            this.visible = false;
            this.$el.blur();

            if (onHide) {
                this._bindVisionEvents(onHide)
            }
        },

        down: function (date) {
            this._changeView(date, 'down');
        },

        up: function (date) {
            this._changeView(date, 'up');
        },

        _bindVisionEvents: function (event) {
            this.$datepicker.off('transitionend.dp');
            event(this, false);
            this.$datepicker.one('transitionend.dp', event.bind(this, this, true))
        },

        _changeView: function (date, dir) {
            date = date || this.focused || this.date;

            var nextView = dir == 'up' ? this.viewIndex + 1 : this.viewIndex - 1;
            if (nextView > 2) nextView = 2;
            if (nextView < 0) nextView = 0;

            this.silent = true;
            this.date = new Date(date.getFullYear(), date.getMonth(), 1);
            this.silent = false;
            this.view = this.viewIndexes[nextView];

        },

        _handleHotKey: function (key) {
            var date = datepicker.getParsedDate(this._getFocusedDate()),
                focusedParsed,
                o = this.opts,
                newDate,
                totalDaysInNextMonth,
                monthChanged = false,
                yearChanged = false,
                decadeChanged = false,
                y = date.year,
                m = date.month,
                d = date.date;

            switch (key) {
                case 'ctrlRight':
                case 'ctrlUp':
                    m += 1;
                    monthChanged = true;
                    break;
                case 'ctrlLeft':
                case 'ctrlDown':
                    m -= 1;
                    monthChanged = true;
                    break;
                case 'shiftRight':
                case 'shiftUp':
                    yearChanged = true;
                    y += 1;
                    break;
                case 'shiftLeft':
                case 'shiftDown':
                    yearChanged = true;
                    y -= 1;
                    break;
                case 'altRight':
                case 'altUp':
                    decadeChanged = true;
                    y += 10;
                    break;
                case 'altLeft':
                case 'altDown':
                    decadeChanged = true;
                    y -= 10;
                    break;
                case 'ctrlShiftUp':
                    this.up();
                    break;
            }

            totalDaysInNextMonth = datepicker.getDaysCount(new Date(y,m));
            newDate = new Date(y,m,d);

            // If next month has less days than current, set date to total days in that month
            if (totalDaysInNextMonth < d) d = totalDaysInNextMonth;

            // Check if newDate is in valid range
            if (newDate.getTime() < this.minTime) {
                newDate = this.minDate;
            } else if (newDate.getTime() > this.maxTime) {
                newDate = this.maxDate;
            }

            this.focused = newDate;

            focusedParsed = datepicker.getParsedDate(newDate);
            if (monthChanged && o.onChangeMonth) {
                o.onChangeMonth(focusedParsed.month, focusedParsed.year)
            }
            if (yearChanged && o.onChangeYear) {
                o.onChangeYear(focusedParsed.year)
            }
            if (decadeChanged && o.onChangeDecade) {
                o.onChangeDecade(this.curDecade)
            }
        },

        _registerKey: function (key) {
            var exists = this.keys.some(function (curKey) {
                return curKey == key;
            });

            if (!exists) {
                this.keys.push(key)
            }
        },

        _unRegisterKey: function (key) {
            var index = this.keys.indexOf(key);

            this.keys.splice(index, 1);
        },

        _isHotKeyPressed: function () {
            var currentHotKey,
                found = false,
                _this = this,
                pressedKeys = this.keys.sort();

            for (var hotKey in hotKeys) {
                currentHotKey = hotKeys[hotKey];
                if (pressedKeys.length != currentHotKey.length) continue;

                if (currentHotKey.every(function (key, i) { return key == pressedKeys[i]})) {
                    _this._trigger('hotKey', hotKey);
                    found = true;
                }
            }

            return found;
        },

        _trigger: function (event, args) {
            this.$el.trigger(event, args)
        },

        _focusNextCell: function (keyCode, type) {
            type = type || this.cellType;

            var date = datepicker.getParsedDate(this._getFocusedDate()),
                y = date.year,
                m = date.month,
                d = date.date;

            if (this._isHotKeyPressed()){
                return;
            }

            switch(keyCode) {
                case 37: // left
                    type == 'day' ? (d -= 1) : '';
                    type == 'month' ? (m -= 1) : '';
                    type == 'year' ? (y -= 1) : '';
                    break;
                case 38: // up
                    type == 'day' ? (d -= 7) : '';
                    type == 'month' ? (m -= 3) : '';
                    type == 'year' ? (y -= 4) : '';
                    break;
                case 39: // right
                    type == 'day' ? (d += 1) : '';
                    type == 'month' ? (m += 1) : '';
                    type == 'year' ? (y += 1) : '';
                    break;
                case 40: // down
                    type == 'day' ? (d += 7) : '';
                    type == 'month' ? (m += 3) : '';
                    type == 'year' ? (y += 4) : '';
                    break;
            }

            var nd = new Date(y,m,d);
            if (nd.getTime() < this.minTime) {
                nd = this.minDate;
            } else if (nd.getTime() > this.maxTime) {
                nd = this.maxDate;
            }

            this.focused = nd;

        },

        _getFocusedDate: function () {
            var focused  = this.focused || this.selectedDates[this.selectedDates.length - 1],
                d = this.parsedDate;

            if (!focused) {
                switch (this.view) {
                    case 'days':
                        focused = new Date(d.year, d.month, new Date().getDate());
                        break;
                    case 'months':
                        focused = new Date(d.year, d.month, 1);
                        break;
                    case 'years':
                        focused = new Date(d.year, 0, 1);
                        break;
                }
            }

            return focused;
        },

        _getCell: function (date, type) {
            type = type || this.cellType;

            var d = datepicker.getParsedDate(date),
                selector = '.datepicker--cell[data-year="' + d.year + '"]',
                $cell;

            switch (type) {
                case 'month':
                    selector = '[data-month="' + d.month + '"]';
                    break;
                case 'day':
                    selector += '[data-month="' + d.month + '"][data-date="' + d.date + '"]';
                    break;
            }
            $cell = this.views[this.currentView].$el.find(selector);

            return $cell.length ? $cell : $('');
        },

        destroy: function () {
            var _this = this;
            _this.$el
                .off('.adp')
                .data('datepicker', '');

            _this.selectedDates = [];
            _this.focused = '';
            _this.views = {};
            _this.keys = [];
            _this.minRange = '';
            _this.maxRange = '';

            if (_this.opts.inline || !_this.elIsInput) {
                _this.$datepicker.closest('.datepicker-inline').remove();
            } else {
                _this.$datepicker.remove();
            }
        },

        _handleAlreadySelectedDates: function (alreadySelected, selectedDate) {
            if (this.opts.range) {
                if (!this.opts.toggleSelected) {
                    // Add possibility to select same date when range is true
                    if (this.selectedDates.length != 2) {
                        this._trigger('clickCell', selectedDate);
                    }
                } else {
                    this.removeDate(selectedDate);
                }
            } else if (this.opts.toggleSelected){
                this.removeDate(selectedDate);
            }

            // Change last selected date to be able to change time when clicking on this cell
            if (!this.opts.toggleSelected) {
                this.lastSelectedDate = alreadySelected;
                if (this.opts.timepicker) {
                    this.timepicker._setTime(alreadySelected);
                    this.timepicker.update();
                }
            }
        },

        _onShowEvent: function (e) {
            if (!this.visible) {
                this.show();
            }
        },

        _onBlur: function () {
            if (!this.inFocus && this.visible) {
                this.hide();
            }
        },

        _onMouseDownDatepicker: function (e) {
            this.inFocus = true;
        },

        _onMouseUpDatepicker: function (e) {
            this.inFocus = false;
            e.originalEvent.inFocus = true;
            if (!e.originalEvent.timepickerFocus) this.$el.focus();
        },

        _onKeyUpGeneral: function (e) {
            var val = this.$el.val();

            if (!val) {
                this.clear();
            }
        },

        _onResize: function () {
            if (this.visible) {
                this.setPosition();
            }
        },

        _onMouseUpBody: function (e) {
            if (e.originalEvent.inFocus) return;

            if (this.visible && !this.inFocus) {
                this.hide();
            }
        },

        _onMouseUpEl: function (e) {
            e.originalEvent.inFocus = true;
            setTimeout(this._onKeyUpGeneral.bind(this),4);
        },

        _onKeyDown: function (e) {
            var code = e.which;
            this._registerKey(code);

            // Arrows
            if (code >= 37 && code <= 40) {
                e.preventDefault();
                this._focusNextCell(code);
            }

            // Enter
            if (code == 13) {
                if (this.focused) {
                    if (this._getCell(this.focused).hasClass('-disabled-')) return;
                    if (this.view != this.opts.minView) {
                        this.down()
                    } else {
                        var alreadySelected = this._isSelected(this.focused, this.cellType);

                        if (!alreadySelected) {
                            if (this.timepicker) {
                                this.focused.setHours(this.timepicker.hours);
                                this.focused.setMinutes(this.timepicker.minutes);
                            }
                            this.selectDate(this.focused);
                            return;
                        }
                        this._handleAlreadySelectedDates(alreadySelected, this.focused)
                    }
                }
            }

            // Esc
            if (code == 27) {
                this.hide();
            }
        },

        _onKeyUp: function (e) {
            var code = e.which;
            this._unRegisterKey(code);
        },

        _onHotKey: function (e, hotKey) {
            this._handleHotKey(hotKey);
            this.reflow();
        },

        _onMouseEnterCell: function (e) {
            var $cell = $(e.target).closest('.datepicker--cell'),
                date = this._getDateFromCell($cell);

            // Prevent from unnecessary rendering and setting new currentDate
            this.silent = true;

            if (this.focused) {
                this.focused = ''
            }

            $cell.addClass('-focus-');

            this.focused = date;
            this.silent = false;

            if (this.opts.range && this.selectedDates.length == 1) {
                this.minRange = this.selectedDates[0];
                this.maxRange = '';
                if (datepicker.less(this.minRange, this.focused)) {
                    this.maxRange = this.minRange;
                    this.minRange = '';
                }
                this.views[this.currentView]._update();
            }
        },

        _onMouseLeaveCell: function (e) {
            var $cell = $(e.target).closest('.datepicker--cell');

            $cell.removeClass('-focus-');

            this.silent = true;
            this.focused = '';
            this.silent = false;
        },

        _onTimeChange: function (e, h, m) {
            var date = new Date(),
                selectedDates = this.selectedDates,
                selected = false;

            if (selectedDates.length) {
                selected = true;
                date = this.lastSelectedDate;
            }

            date.setHours(h);
            date.setMinutes(m);

            if (!selected && !this._getCell(date).hasClass('-disabled-')) {
                this.selectDate(date);
            } else {
                this._setInputValue();
                if (this.opts.onSelect) {
                    this._triggerOnChange();
                }
            }
        },

        _onClickCell: function (e, date) {
            if (this.timepicker) {
                date.setHours(this.timepicker.hours);
                date.setMinutes(this.timepicker.minutes);
            }
            this.selectDate(date);
        },

        set focused(val) {
            if (!val && this.focused) {
                var $cell = this._getCell(this.focused);

                if ($cell.length) {
                    $cell.removeClass('-focus-')
                }
            }
            this._focused = val;
            if (this.opts.range && this.selectedDates.length == 1) {
                this.minRange = this.selectedDates[0];
                this.maxRange = '';
                if (datepicker.less(this.minRange, this._focused)) {
                    this.maxRange = this.minRange;
                    this.minRange = '';
                }
            }
            if (this.silent) return;
            this.date = val;
        },

        get focused() {
            return this._focused;
        },

        get parsedDate() {
            return datepicker.getParsedDate(this.date);
        },

        set date (val) {
            if (!(val instanceof Date)) return;

            this.currentDate = val;

            if (this.inited && !this.silent) {
                this.views[this.view]._render();
                this.nav._render();
                if (this.visible && this.elIsInput) {
                    this.setPosition();
                }
            }
            return val;
        },

        get date () {
            return this.currentDate
        },

        set view (val) {
            this.viewIndex = this.viewIndexes.indexOf(val);

            if (this.viewIndex < 0) {
                return;
            }

            this.prevView = this.currentView;
            this.currentView = val;

            if (this.inited) {
                if (!this.views[val]) {
                    this.views[val] = new  $.fn.datepicker.Body(this, val, this.opts)
                } else {
                    this.views[val]._render();
                }

                this.views[this.prevView].hide();
                this.views[val].show();
                this.nav._render();

                if (this.opts.onChangeView) {
                    this.opts.onChangeView(val)
                }
                if (this.elIsInput && this.visible) {
                    this.reflow();
                }
            }

            return val
        },

        get view() {
            return this.currentView;
        },

        get cellType() {
            return this.view.substring(0, this.view.length - 1)
        },

        get minTime() {
            var min = datepicker.getParsedDate(this.minDate);
            return new Date(min.year, min.month, min.date).getTime()
        },

        get maxTime() {
            var max = datepicker.getParsedDate(this.maxDate);
            return new Date(max.year, max.month, max.date).getTime()
        },

        get curDecade() {
            return datepicker.getDecade(this.date)
        }
    };

    //  Utils
    // -------------------------------------------------

    datepicker.getDaysCount = function (date) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    datepicker.getParsedDate = function (date) {
        return {
            year: date.getFullYear(),
            month: date.getMonth(),
            fullMonth: (date.getMonth() + 1) < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1, // One based
            date: date.getDate(),
            fullDate: date.getDate() < 10 ? '0' + date.getDate() : date.getDate(),
            day: date.getDay(),
            hours: date.getHours(),
            fullHours:  date.getHours() < 10 ? '0' + date.getHours() :  date.getHours() ,
            minutes: date.getMinutes(),
            fullMinutes:  date.getMinutes() < 10 ? '0' + date.getMinutes() :  date.getMinutes()
        }
    };

    datepicker.getDecade = function (date) {
        var firstYear = Math.floor(date.getFullYear() / 10) * 10;

        return [firstYear, firstYear + 9];
    };

    datepicker.template = function (str, data) {
        return str.replace(/#\{([\w]+)\}/g, function (source, match) {
            if (data[match] || data[match] === 0) {
                return data[match]
            }
        });
    };

    datepicker.isSame = function (date1, date2, type) {
        if (!date1 || !date2) return false;
        var d1 = datepicker.getParsedDate(date1),
            d2 = datepicker.getParsedDate(date2),
            _type = type ? type : 'day',

            conditions = {
                day: d1.date == d2.date && d1.month == d2.month && d1.year == d2.year,
                month: d1.month == d2.month && d1.year == d2.year,
                year: d1.year == d2.year
            };

        return conditions[_type];
    };

    datepicker.less = function (dateCompareTo, date, type) {
        if (!dateCompareTo || !date) return false;
        return date.getTime() < dateCompareTo.getTime();
    };

    datepicker.bigger = function (dateCompareTo, date, type) {
        if (!dateCompareTo || !date) return false;
        return date.getTime() > dateCompareTo.getTime();
    };

    datepicker.getLeadingZeroNum = function (num) {
        return parseInt(num) < 10 ? '0' + num : num;
    };

    /**
     * Returns copy of date with hours and minutes equals to 0
     * @param date {Date}
     */
    datepicker.resetTime = function (date) {
        if (typeof date != 'object') return;
        date = datepicker.getParsedDate(date);
        return new Date(date.year, date.month, date.date)
    };

    $.fn.datepicker = function ( options ) {
        return this.each(function () {
            if (!$.data(this, pluginName)) {
                $.data(this,  pluginName,
                    new Datepicker( this, options ));
            } else {
                var _this = $.data(this, pluginName);

                _this.opts = $.extend(true, _this.opts, options);
                _this.update();
            }
        });
    };

    $.fn.datepicker.Constructor = Datepicker;

    $.fn.datepicker.language = {
        en: {
            days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            daysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
            months: ['January','February','March','April','May','June', 'July','August','September','October','November','December'],
            monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            today: 'Today',
            clear: 'Clear',
            dateFormat: 'mm/dd/yyyy',
            timeFormat: 'hh:ii aa',
            firstDay: 0
        }
    };
})();

;(function () {
    var templates = {
        days:'' +
        '<div class="datepicker--days datepicker--body">' +
        '<div class="datepicker--days-names"></div>' +
        '<div class="datepicker--cells datepicker--cells-days"></div>' +
        '</div>',
        months: '' +
        '<div class="datepicker--months datepicker--body">' +
        '<div class="datepicker--cells datepicker--cells-months"></div>' +
        '</div>',
        years: '' +
        '<div class="datepicker--years datepicker--body">' +
        '<div class="datepicker--cells datepicker--cells-years"></div>' +
        '</div>'
        },
        datepicker = $.fn.datepicker,
        dp = datepicker.Constructor;

    datepicker.Body = function (d, type, opts) {
        this.d = d;
        this.type = type;
        this.opts = opts;
        this.$el = $('');

        if (this.opts.onlyTimepicker) return;
        this.init();
    };

    datepicker.Body.prototype = {
        init: function () {
            this._buildBaseHtml();
            this._render();

            this._bindEvents();
        },

        _bindEvents: function () {
            this.$el.on('click', '.datepicker--cell', $.proxy(this._onClickCell, this));
        },

        _buildBaseHtml: function () {
            this.d.$content.safeAppend(templates[this.type]);
            this.$el = $('.datepicker--' + escapeHTML(this.type), this.d.$content).last();
            this.$names = $('.datepicker--days-names', this.$el);
            this.$cells = $('.datepicker--cells', this.$el);
        },

        _getDayNamesHtml: function (firstDay, curDay, html, i) {
            curDay = curDay != undefined ? curDay : firstDay;
            html = html ? html : '';
            i = i != undefined ? i : 0;

            if (i > 7) return html;
            if (curDay == 7) return this._getDayNamesHtml(firstDay, 0, html, ++i);

            html += '<div class="datepicker--day-name' + (this.d.isWeekend(curDay) ? " -weekend-" : "") + '">' + this.d.loc.daysMin[curDay] + '</div>';

            return this._getDayNamesHtml(firstDay, ++curDay, html, ++i);
        },

        _getCellContents: function (date, type) {
            var classes = "datepicker--cell datepicker--cell-" + type,
                currentDate = new Date(),
                parent = this.d,
                minRange = dp.resetTime(parent.minRange),
                maxRange = dp.resetTime(parent.maxRange),
                opts = parent.opts,
                d = dp.getParsedDate(date),
                render = {},
                html = d.date;

            switch (type) {
                case 'day':

                    if (locale === 'ar') {
                        html = time2date(date.getTime() / 1000, 16);
                    }

                    if (parent.isWeekend(d.day)) classes += " -weekend-";
                    if (d.month != this.d.parsedDate.month) {
                        classes += " -other-month-";
                        if (!opts.selectOtherMonths) {
                            classes += " -disabled-";
                        }
                        if (!opts.showOtherMonths) html = '';
                    }
                    break;
                case 'month':
                    html = parent.loc[parent.opts.monthsField][d.month];
                    break;
                case 'year':
                    var decade = parent.curDecade;
                    html = d.year;

                    if (locale === 'ar') {
                        html = time2date(date.getTime() / 1000, 14);
                    }

                    if (d.year < decade[0] || d.year > decade[1]) {
                        classes += ' -other-decade-';
                        if (!opts.selectOtherYears) {
                            classes += " -disabled-";
                        }
                        if (!opts.showOtherYears) html = '';
                    }
                    break;
            }

            if (opts.onRenderCell) {
                render = opts.onRenderCell(date, type, html) || {};
                html = render.html ? render.html : html;
                classes += render.classes ? ' ' + render.classes : '';
            }

            if (opts.range) {
                if (dp.isSame(minRange, date, type)) classes += ' -range-from-';
                if (dp.isSame(maxRange, date, type)) classes += ' -range-to-';

                if (parent.selectedDates.length == 1 && parent.focused) {
                    if (
                        (dp.bigger(minRange, date) && dp.less(parent.focused, date)) ||
                        (dp.less(maxRange, date) && dp.bigger(parent.focused, date)))
                    {
                        classes += ' -in-range-'
                    }

                    if (dp.less(maxRange, date) && dp.isSame(parent.focused, date)) {
                        classes += ' -range-from-'
                    }
                    if (dp.bigger(minRange, date) && dp.isSame(parent.focused, date)) {
                        classes += ' -range-to-'
                    }

                } else if (parent.selectedDates.length == 2) {
                    if (dp.bigger(minRange, date) && dp.less(maxRange, date)) {
                        classes += ' -in-range-'
                    }
                }
            }


            if (dp.isSame(currentDate, date, type)) classes += ' -current-';
            if (parent.focused && dp.isSame(date, parent.focused, type)) classes += ' -focus-';
            if (parent._isSelected(date, type)) classes += ' -selected-';
            if (!parent._isInRange(date, type) || render.disabled) classes += ' -disabled-';

            return {
                html: html,
                classes: classes
            }
        },

        /**
         * Calculates days number to render. Generates days html and returns it.
         * @param {object} date - Date object
         * @returns {string}
         * @private
         */
        _getDaysHtml: function (date) {
            var totalMonthDays = dp.getDaysCount(date),
                firstMonthDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay(),
                lastMonthDay = new Date(date.getFullYear(), date.getMonth(), totalMonthDays).getDay(),
                daysFromPevMonth = firstMonthDay - this.d.loc.firstDay,
                daysFromNextMonth = 6 - lastMonthDay + this.d.loc.firstDay;

            daysFromPevMonth = daysFromPevMonth < 0 ? daysFromPevMonth + 7 : daysFromPevMonth;
            daysFromNextMonth = daysFromNextMonth > 6 ? daysFromNextMonth - 7 : daysFromNextMonth;

            var startDayIndex = -daysFromPevMonth + 1,
                m, y,
                html = '';

            for (var i = startDayIndex, max = totalMonthDays + daysFromNextMonth; i <= max; i++) {
                y = date.getFullYear();
                m = date.getMonth();

                html += this._getDayHtml(new Date(y, m, i))
            }

            return html;
        },

        _getDayHtml: function (date) {
           var content = this._getCellContents(date, 'day');

            return '<div class="' + content.classes + '" ' +
                'data-date="' + date.getDate() + '" ' +
                'data-month="' + date.getMonth() + '" ' +
                'data-year="' + date.getFullYear() + '">' + content.html + '</div>';
        },

        /**
         * Generates months html
         * @param {object} date - date instance
         * @returns {string}
         * @private
         */
        _getMonthsHtml: function (date) {
            var html = '',
                d = dp.getParsedDate(date),
                i = 0;

            while(i < 12) {
                html += this._getMonthHtml(new Date(d.year, i));
                i++
            }

            return html;
        },

        _getMonthHtml: function (date) {
            var content = this._getCellContents(date, 'month');

            return '<div class="' + content.classes + '" data-month="' + date.getMonth() + '">' + content.html + '</div>'
        },

        _getYearsHtml: function (date) {
            var d = dp.getParsedDate(date),
                decade = dp.getDecade(date),
                firstYear = decade[0] - 1,
                html = '',
                i = firstYear;

            for (i; i <= decade[1] + 1; i++) {
                html += this._getYearHtml(new Date(i , 0));
            }

            return html;
        },

        _getYearHtml: function (date) {
            var content = this._getCellContents(date, 'year');

            return '<div class="' + content.classes + '" data-year="' + date.getFullYear() + '">' + content.html + '</div>'
        },

        _renderTypes: {
            days: function () {
                var dayNames = this._getDayNamesHtml(this.d.loc.firstDay),
                    days = this._getDaysHtml(this.d.currentDate);

                this.$cells.safeHTML(days);
                this.$names.safeHTML(dayNames)
            },
            months: function () {
                var html = this._getMonthsHtml(this.d.currentDate);

                this.$cells.safeHTML(html)
            },
            years: function () {
                var html = this._getYearsHtml(this.d.currentDate);

                this.$cells.safeHTML(html)
            }
        },

        _render: function () {
            if (this.opts.onlyTimepicker) return;
            this._renderTypes[this.type].bind(this)();
        },

        _update: function () {
            var $cells = $('.datepicker--cell', this.$cells),
                _this = this,
                classes,
                $cell,
                date;
            $cells.each(function (cell, i) {
                $cell = $(this);
                date = _this.d._getDateFromCell($(this));
                classes = _this._getCellContents(date, _this.d.cellType);
                $cell.attr('class',classes.classes)
            });
        },

        show: function () {
            if (this.opts.onlyTimepicker) return;
            this.$el.addClass('active');
            this.acitve = true;
        },

        hide: function () {
            this.$el.removeClass('active');
            this.active = false;
        },

        //  Events
        // -------------------------------------------------

        _handleClick: function (el) {
            var date = el.data('date') || 1,
                month = el.data('month') || 0,
                year = el.data('year') || this.d.parsedDate.year,
                dp = this.d;
            // Change view if min view does not reach yet
            if (dp.view != this.opts.minView) {
                dp.down(new Date(year, month, date));
                return;
            }
            // Select date if min view is reached
            var selectedDate = new Date(year, month, date),
                alreadySelected = this.d._isSelected(selectedDate, this.d.cellType);

            if (!alreadySelected) {
                dp._trigger('clickCell', selectedDate);
                return;
            }

            dp._handleAlreadySelectedDates.bind(dp, alreadySelected, selectedDate)();

        },

        _onClickCell: function (e) {
            var $el = $(e.target).closest('.datepicker--cell');

            if ($el.hasClass('-disabled-')) return;

            this._handleClick.bind(this)($el);
        }
    };
})();

;(function () {
    var template = '' +
        '<div class="datepicker--nav-action" data-action="prev">#{prevHtml}</div>' +
        '<div class="datepicker--nav-title">#{title}</div>' +
        '<div class="datepicker--nav-action" data-action="next">#{nextHtml}</div>',
        buttonsContainerTemplate = '<div class="datepicker--buttons"></div>',
        button = '<span class="datepicker--button" data-action="#{action}">#{label}</span>',
        datepicker = $.fn.datepicker,
        dp = datepicker.Constructor;

    datepicker.Navigation = function (d, opts) {
        this.d = d;
        this.opts = opts;

        this.$buttonsContainer = '';

        this.init();
    };

    datepicker.Navigation.prototype = {
        init: function () {
            this._buildBaseHtml();
            this._bindEvents();
        },

        _bindEvents: function () {
            this.d.$nav.on('click', '.datepicker--nav-action', $.proxy(this._onClickNavButton, this));
            this.d.$nav.on('click', '.datepicker--nav-title', $.proxy(this._onClickNavTitle, this));
            this.d.$datepicker.on('click', '.datepicker--button', $.proxy(this._onClickNavButton, this));
        },

        _buildBaseHtml: function () {
            if (!this.opts.onlyTimepicker) {
                this._render();
            }
            this._addButtonsIfNeed();
        },

        _addButtonsIfNeed: function () {
            if (this.opts.todayButton) {
                this._addButton('today')
            }
            if (this.opts.clearButton) {
                this._addButton('clear')
            }
        },

        _render: function () {
            var title = this._getTitle(this.d.currentDate),
                html = dp.template(template, $.extend({title: title}, this.opts));
            this.d.$nav.safeHTML(html);
            if (this.d.view == 'years') {
                $('.datepicker--nav-title', this.d.$nav).addClass('-disabled-');
            }
            this.setNavStatus();
        },

        _getTitle: function (date) {
            return this.d.formatDate(this.opts.navTitles[this.d.view], date)
        },

        _addButton: function (type) {
            if (!this.$buttonsContainer.length) {
                this._addButtonsContainer();
            }

            var data = {
                    action: type,
                    label: this.d.loc[type]
                },
                html = dp.template(button, data);

            if ($('[data-action=' + type + ']', this.$buttonsContainer).length) return;
            this.$buttonsContainer.safeAppend(html);
        },

        _addButtonsContainer: function () {
            this.d.$datepicker.safeAppend(buttonsContainerTemplate);
            this.$buttonsContainer = $('.datepicker--buttons', this.d.$datepicker);
        },

        setNavStatus: function () {
            if (!(this.opts.minDate || this.opts.maxDate) || !this.opts.disableNavWhenOutOfRange) return;

            var date = this.d.parsedDate,
                m = date.month,
                y = date.year,
                d = date.date;

            switch (this.d.view) {
                case 'days':
                    if (!this.d._isInRange(new Date(y, m-1, 1), 'month')) {
                        this._disableNav('prev')
                    }
                    if (!this.d._isInRange(new Date(y, m+1, 1), 'month')) {
                        this._disableNav('next')
                    }
                    break;
                case 'months':
                    if (!this.d._isInRange(new Date(y-1, m, d), 'year')) {
                        this._disableNav('prev')
                    }
                    if (!this.d._isInRange(new Date(y+1, m, d), 'year')) {
                        this._disableNav('next')
                    }
                    break;
                case 'years':
                    var decade = dp.getDecade(this.d.date);
                    if (!this.d._isInRange(new Date(decade[0] - 1, 0, 1), 'year')) {
                        this._disableNav('prev')
                    }
                    if (!this.d._isInRange(new Date(decade[1] + 1, 0, 1), 'year')) {
                        this._disableNav('next')
                    }
                    break;
            }
        },

        _disableNav: function (nav) {
            $('[data-action="' + nav + '"]', this.d.$nav).addClass('-disabled-')
        },

        _activateNav: function (nav) {
            $('[data-action="' + nav + '"]', this.d.$nav).removeClass('-disabled-')
        },

        _onClickNavButton: function (e) {
            var $el = $(e.target).closest('[data-action]'),
                action = $el.data('action');

            this.d[action]();
        },

        _onClickNavTitle: function (e) {
            if ($(e.target).hasClass('-disabled-')) return;

            if (this.d.view == 'days') {
                return this.d.view = 'months';
            }

            this.d.view = 'years';
        }
    }

})();

;(function () {
    var template = '<div class="datepicker--time">' +
        '<div class="datepicker--time-current">' +
        '   <span class="datepicker--time-current-hours">#{hourVisible}</span>' +
        '   <span class="datepicker--time-current-colon">:</span>' +
        '   <span class="datepicker--time-current-minutes">#{minValue}</span>' +
        '</div>' +
        '<div class="datepicker--time-sliders">' +
        '   <div class="datepicker--time-row">' +
        '      <input type="range" name="hours" value="#{hourValue}" min="#{hourMin}" max="#{hourMax}" step="#{hourStep}"/>' +
        '   </div>' +
        '   <div class="datepicker--time-row">' +
        '      <input type="range" name="minutes" value="#{minValue}" min="#{minMin}" max="#{minMax}" step="#{minStep}"/>' +
        '   </div>' +
        '</div>' +
        '</div>',
        datepicker = $.fn.datepicker,
        dp = datepicker.Constructor;

    datepicker.Timepicker = function (inst, opts) {
        this.d = inst;
        this.opts = opts;

        this.init();
    };

    datepicker.Timepicker.prototype = {
        init: function () {
            var input = 'input';
            this._setTime(this.d.date);
            this._buildHTML();

            if (navigator.userAgent.match(/trident/gi)) {
                input = 'change';
            }

            this.d.$el.on('selectDate', this._onSelectDate.bind(this));
            this.$ranges.on(input, this._onChangeRange.bind(this));
            this.$ranges.on('mouseup', this._onMouseUpRange.bind(this));
            this.$ranges.on('mousemove focus ', this._onMouseEnterRange.bind(this));
            this.$ranges.on('mouseout blur', this._onMouseOutRange.bind(this));
        },

        _setTime: function (date) {
            var _date = dp.getParsedDate(date);

            this._handleDate(date);
            this.hours = _date.hours < this.minHours ? this.minHours : _date.hours;
            this.minutes = _date.minutes < this.minMinutes ? this.minMinutes : _date.minutes;
        },

        /**
         * Sets minHours and minMinutes from date (usually it's a minDate)
         * Also changes minMinutes if current hours are bigger then @date hours
         * @param date {Date}
         * @private
         */
        _setMinTimeFromDate: function (date) {
            this.minHours = date.getHours();
            this.minMinutes = date.getMinutes();

            // If, for example, min hours are 10, and current hours are 12,
            // update minMinutes to default value, to be able to choose whole range of values
            if (this.d.lastSelectedDate) {
                if (this.d.lastSelectedDate.getHours() > date.getHours()) {
                    this.minMinutes = this.opts.minMinutes;
                }
            }
        },

        _setMaxTimeFromDate: function (date) {
            this.maxHours = date.getHours();
            this.maxMinutes = date.getMinutes();

            if (this.d.lastSelectedDate) {
                if (this.d.lastSelectedDate.getHours() < date.getHours()) {
                    this.maxMinutes = this.opts.maxMinutes;
                }
            }
        },

        _setDefaultMinMaxTime: function () {
            var maxHours = 23,
                maxMinutes = 59,
                opts = this.opts;

            this.minHours = opts.minHours < 0 || opts.minHours > maxHours ? 0 : opts.minHours;
            this.minMinutes = opts.minMinutes < 0 || opts.minMinutes > maxMinutes ? 0 : opts.minMinutes;
            this.maxHours = opts.maxHours < 0 || opts.maxHours > maxHours ? maxHours : opts.maxHours;
            this.maxMinutes = opts.maxMinutes < 0 || opts.maxMinutes > maxMinutes ? maxMinutes : opts.maxMinutes;
        },

        /**
         * Looks for min/max hours/minutes and if current values
         * are out of range sets valid values.
         * @private
         */
        _validateHoursMinutes: function (date) {
            if (this.hours < this.minHours) {
                this.hours = this.minHours;
            } else if (this.hours > this.maxHours) {
                this.hours = this.maxHours;
            }

            if (this.minutes < this.minMinutes) {
                this.minutes = this.minMinutes;
            } else if (this.minutes > this.maxMinutes) {
                this.minutes = this.maxMinutes;
            }
        },

        _buildHTML: function () {
            var lz = dp.getLeadingZeroNum,
                data = {
                    hourMin: this.minHours,
                    hourMax: lz(this.maxHours),
                    hourStep: this.opts.hoursStep,
                    hourValue: this.hours,
                    hourVisible: lz(this.displayHours),
                    minMin: this.minMinutes,
                    minMax: lz(this.maxMinutes),
                    minStep: this.opts.minutesStep,
                    minValue: lz(this.minutes)
                },
                _template = dp.template(template, data);

            this.d.$datepicker.safeAppend(_template);
            this.$timepicker = $('.datepicker--time:last-child', this.d.$datepicker);
            this.$ranges = $('[type="range"]', this.$timepicker);
            this.$hours = $('[name="hours"]', this.$timepicker);
            this.$minutes = $('[name="minutes"]', this.$timepicker);
            this.$hoursText = $('.datepicker--time-current-hours', this.$timepicker);
            this.$minutesText = $('.datepicker--time-current-minutes', this.$timepicker);

            if (this.d.ampm) {
                this.$ampm = $('<span class="datepicker--time-current-ampm">')
                    .appendTo($('.datepicker--time-current', this.$timepicker))
                    .safeHTML(this.dayPeriod);

                this.$timepicker.addClass('-am-pm-');
            }
        },

        _updateCurrentTime: function () {
            var h =  dp.getLeadingZeroNum(this.displayHours),
                m = dp.getLeadingZeroNum(this.minutes);

            this.$hoursText.safeHTML(h);
            this.$minutesText.safeHTML(m);

            if (this.d.ampm) {
                this.$ampm.safeHTML(this.dayPeriod);
            }
        },

        _updateRanges: function () {
            this.$hours.attr({
                min: this.minHours,
                max: this.maxHours
            }).val(this.hours);

            this.$minutes.attr({
                min: this.minMinutes,
                max: this.maxMinutes
            }).val(this.minutes)
        },

        /**
         * Sets minHours, minMinutes etc. from date. If date is not passed, than sets
         * values from options
         * @param [date] {object} - Date object, to get values from
         * @private
         */
        _handleDate: function (date) {
            this._setDefaultMinMaxTime();
            if (date) {
                if (dp.isSame(date, this.d.opts.minDate)) {
                    this._setMinTimeFromDate(this.d.opts.minDate);
                } else if (dp.isSame(date, this.d.opts.maxDate)) {
                    this._setMaxTimeFromDate(this.d.opts.maxDate);
                }
            }

            this._validateHoursMinutes(date);
        },

        update: function () {
            this._updateRanges();
            this._updateCurrentTime();
        },

        /**
         * Calculates valid hour value to display in text input and datepicker's body.
         * @param date {Date|Number} - date or hours
         * @param [ampm] {Boolean} - 12 hours mode
         * @returns {{hours: *, dayPeriod: string}}
         * @private
         */
        _getValidHoursFromDate: function (date, ampm) {
            var d = date,
                hours = date;

            if (date instanceof Date) {
                d = dp.getParsedDate(date);
                hours = d.hours;
            }

            var _ampm = ampm || this.d.ampm,
                dayPeriod = 'am';

            if (_ampm) {
                switch(true) {
                    case hours == 0:
                        hours = 12;
                        break;
                    case hours == 12:
                        dayPeriod = 'pm';
                        break;
                    case hours > 11:
                        hours = hours - 12;
                        dayPeriod = 'pm';
                        break;
                    default:
                        break;
                }
            }

            return {
                hours: hours,
                dayPeriod: dayPeriod
            }
        },

        set hours (val) {
            this._hours = val;

            var displayHours = this._getValidHoursFromDate(val);

            this.displayHours = displayHours.hours;
            this.dayPeriod = displayHours.dayPeriod;
        },

        get hours() {
            return this._hours;
        },

        //  Events
        // -------------------------------------------------

        _onChangeRange: function (e) {
            var $target = $(e.target),
                name = $target.attr('name');

            this.d.timepickerIsActive = true;

            this[name] = $target.val();
            this._updateCurrentTime();
            this.d._trigger('timeChange', [this.hours, this.minutes]);

            this._handleDate(this.d.lastSelectedDate);
            this.update()
        },

        _onSelectDate: function (e, data) {
            this._handleDate(data);
            this.update();
        },

        _onMouseEnterRange: function (e) {
            var name = $(e.target).attr('name');
            $('.datepicker--time-current-' + name, this.$timepicker).addClass('-focus-');
        },

        _onMouseOutRange: function (e) {
            var name = $(e.target).attr('name');
            if (this.d.inFocus) return; // Prevent removing focus when mouse out of range slider
            $('.datepicker--time-current-' + name, this.$timepicker).removeClass('-focus-');
        },

        _onMouseUpRange: function (e) {
            this.d.timepickerIsActive = false;
        }
    };
})();
 })(window, jQuery);

/** @property T.ui.dropdown */
lazy(T.ui, 'dropdown', () => {
    'use strict';

    return freeze({
        init(select, opts = {}) {
            if (!select) {
                return false;
            }
            const dropdown = select.querySelector('.js-dropdown');
            const options = dropdown.querySelectorAll('.js-option');
            const radios = dropdown.querySelectorAll('input[type="radio"]');
            const btn = select.querySelector('.js-select-button');
            const closeBtn = dropdown.querySelector('.js-close');

            if (typeof opts === 'function') {
                opts = {ucb: opts};
            }

            // Hide opened dropdown
            const hideDropdown = (e) => {
                if (!btn.contains(e.target)
                    && !(opts.preventClose && dropdown.contains(e.target)
                    && !(closeBtn && closeBtn.contains(e.target)))) {
                    dropdown.classList.remove('visible');
                    window.removeEventListener('click', hideDropdown);
                }
                return false;
            };

            // Show dropdown
            const showDropdown = (e) => {
                e.preventDefault();
                dropdown.classList.add('visible');
                window.addEventListener('click', hideDropdown);

                if (opts.position) {
                    const at = opts.position;
                    const my = at.includes('top') ? at.replace('top', 'bottom') : at.replace('bottom', 'top');
                    dropdown.classList.add('fixed');
                    requestAnimationFrame(() => {
                        $(dropdown).position({
                            of: btn,
                            my,
                            at,
                            collision: 'flipfit',
                            within: document.body
                        });
                    });
                }

                return false;
            };

            // Init select button click
            btn.addEventListener('click', showDropdown);

            // Init close button click
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    hideDropdown(e);
                });
            }

            // Init it-radio component and change event
            if (radios.length) {
                return T.ui.radio.init(radios, () => {
                    const checked = dropdown.querySelector(`input[type="radio"]:checked`);
                    const option = checked.closest('.js-option');
                    const label = btn.querySelector('.label');

                    if (label && option.dataset.label) {
                        label.textContent = option.dataset.label;
                    }

                    if (opts.ucb) {
                        tryCatch(opts.ucb)(checked.value);
                    }
                });
            }

            // Init options click
            for (let i = 0; i < options.length; i++) {
                options[i].addEventListener('click', (e) => {
                    let label = null;

                    if (e.currentTarget.dataset.label && (label = btn.querySelector('.label'))) {
                        label.textContent = e.currentTarget.dataset.label;
                    }
                });
            }
        },

        clone(elm, opts = {}) {
            let { onChange } = opts;
            let target = elm;
            if (typeof elm === 'string') {
                target = document.querySelector(elm).cloneNode(true);
            }
            const input = target.querySelector('input'); // input where the selection is filled.

            if (input) {
                T.ui.input.init(input, target !== elm);

                onChange = ((ucb) => (ev) => {
                    let tmp = ev.currentTarget.querySelector('input[type="radio"]');
                    if (tmp) {
                        input.dataset.value = tmp.value;
                    }
                    if ((tmp = ev.currentTarget.querySelector('.name') || tmp)) {
                        input.value = tmp.textContent || tmp.value;
                    }
                    if (typeof ucb === 'function') {
                        tryCatch(ucb)(input.value, target);
                    }
                })(onChange);

                for (const label of target.querySelectorAll('.js-option')) {
                    const name = label.querySelector('.name');
                    const ds = name.dataset;
                    if (ds.string && ds.value) {
                        name.textContent = mega.icu.format(l[ds.string], parseInt(ds.value));
                    }
                    label.addEventListener('change', onChange);
                }
            }
            requestAnimationFrame(() => this.init(target, opts));
            return target;
        }
    });
});

/** @property T.ui.input */
lazy(T.ui, 'input', () => {
    'use strict';

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };
    const ce = (n, t, a) => mCreateElement(n, a, t);
    const rndID = () => `input-xid${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;

    return freeze({
        init(inputs, opt = {}) {
            if (!inputs) {
                return false;
            }
            if (opt === true) {
                // a flag indicating it's a cloned element
                opt = {unique: true};
            }
            else if (typeof opt === 'string') {
                opt = {errorMsg: opt};
            }
            else if (typeof opt === 'function') {
                opt = {keypress: opt};
            }
            inputs = inputs.length === undefined ? [inputs] : inputs;

            if (opt.errorMsg) {
                onIdle(() => this.errorMsg(inputs[0], opt.errorMsg));
            }

            for (let i = 0; i < inputs.length; i++) {
                let n = inputs[i];

                // Add Eye icon
                if (n.type === 'password') {
                    this.initEyeBtn(n);
                }

                // If calendar
                if (n.dataset.subtype === 'calendar') {
                    this.initDatePicker(n);
                }

                // If tags
                if (n.dataset.subtype === 'chips') {
                    this.initChips(n);
                }

                n.addEventListener('focus', (e) => {
                    e.target.closest('.it-input').classList.add('focused');
                });

                n.addEventListener('blur', (e) => {
                    e.target.closest('.it-input').classList.remove('focused');
                });

                n.addEventListener('input', (e) => {
                    this.errorMsg(e.target);
                });

                if (opt.unique) {
                    const id = rndID();
                    if (n.name === n.id) {
                        n.setAttribute('name', id);
                    }
                    if (n.nextElementSibling) {
                        // label
                        n.nextElementSibling.setAttribute('for', id);
                    }
                    n.id = id;
                }

                if (opt.keypress) {
                    const id = n.id || rndID();
                    const handler = tryCatch(opt.keypress);
                    n.addEventListener('keypress', (ev) => {
                        delay(`js-input-keypress:${id}`, () => handler(ev));
                    });
                }

                n = n.closest('.it-input');
                if (n) {
                    n.addEventListener('click', () => {
                        n.querySelector('.input-field > input, .input-field > textarea').focus();
                    });
                }
            }
        },

        initEyeBtn(input) {
            const wrap = input.closest('.it-input');

            if (!wrap) {
                return false;
            }

            let btn = wrap.querySelector('.js-toggle-pass');

            if (!btn) {
                btn = mCreateElement('a', {
                    class: 'it-button ghost icon js-toggle-pass',
                    'data-value': 0,
                    href: ''
                }, wrap.querySelector('.input-box'));

                mCreateElement('i', {class: 'sprite-it-x24-mono icon-eye'}, btn);
            }

            btn.addEventListener('click', (e) => {
                e.preventDefault();

                if (parseInt(btn.dataset.value)) {
                    btn.dataset.value = 0;
                    btn.querySelector('i').className = 'sprite-it-x24-mono icon-eye';
                    input.type = 'password';
                }
                else {
                    btn.dataset.value = 1;
                    btn.querySelector('i').className = 'sprite-it-x24-mono icon-eye-off';
                    input.type = 'text';
                }
            });
        },

        create(type, attrs) {
            if (typeof attrs === 'string') {
                attrs = {'data-subtype': attrs};
            }
            if (!(attrs && 'autocomplete' in attrs)) {
                attrs = {...attrs, autocomplete: `new-${type}`};
            }
            if (!attrs.id) {
                attrs.id = Math.random().toString(36).slice(-7);
            }
            const item = ce('form', null, {class: 'it-input xl-size'});

            const box = ce('div', item, {class: 'input-box'});
            const node = ce('div', box, {class: 'input-field'});

            const elm = ce('input', node, {type, name: attrs.id, value: '', ...attrs});
            elm.required = true;

            ce('label', node, {for: attrs.id});
            ce('div', item, {class: 'error-text'});

            return item;
        },

        initDatePicker(input) {
            const wrap = input.closest('.it-input');

            if (!wrap) {
                return false;
            }

            const DAYS_LIST = [
                // Sun - Sat
                l[8763], l[8764], l[8765], l[8766], l[8767], l[8768], l[8769]
            ];
            const MONTHS_LIST = [
                l[408], l[409], l[410], l[411], l[412], l[413], // January - June
                l[414], l[415], l[416], l[417], l[418], l[419]  // July - December
            ];
            const MONTHS_SHORT_LIST = [
                l[24035], l[24037], l[24036], l[24038], l[24047], l[24039], // January - June
                l[24040], l[24041], l[24042], l[24043], l[24044], l[24045]  // July - December
            ];
            let btn = wrap.querySelector('.js-show-calendar');

            input.readOnly = true;
            input.value = 'Select date';

            // Add datepicker btn
            if (!btn) {
                btn = mCreateElement('a', {
                    class: 'it-button ghost icon js-show-calendar',
                    'data-value': 0,
                    href: ''
                }, wrap.querySelector('.input-box'));

                mCreateElement('i', {class: 'sprite-it-x24-mono icon-calendar'}, btn);
            }

            const changePos = ($node) => {
                $node.position({
                    of: wrap,
                    my: 'right center',
                    at: 'right center',
                    collision: 'flipfit',
                    within: document.body
                });
            };

            const dp = $(input).datepicker({
                dateFormat: 'mm/dd/yyyy',
                minDate: new Date(),
                maxDate: new Date(2077, 11, 31),
                disableNavWhenOutOfRange: true,
                startDate: null,
                prevHtml: '<i class="sprite-it-x24-mono icon-chevron-right"></i>',
                nextHtml: '<i class="sprite-it-x24-mono icon-chevron-right"></i>',
                altField: null,
                firstDay: 0,
                autoClose: true,
                toggleSelected: false,
                language: {
                    daysMin: DAYS_LIST,
                    months: MONTHS_LIST,
                    monthsShort: MONTHS_SHORT_LIST
                },
                onSelect: (_, date) => {
                    input.dataset.value = ~~(date.getTime() / 1e3);
                },
                onShow: (context) => {
                    changePos(context.$datepicker);
                },
                setPosition: ($node) => {
                    changePos($node);
                }
            });

            if (input.dataset.value) {
                dp.data('datepicker').selectDate(new Date(parseInt(input.dataset.value) * 1e3));
            }

            btn.addEventListener('click', (e) => {
                stop(e);
                input.click();
            });
        },

        // todo: refactor/improve
        initChips(input, opts = {}) {
            const wrap = input.closest('.it-input');

            const validate = (val) => {
                if (!val.trim()) {
                    return false;
                }
                return opts.validate ? opts.validate(val) : true;
            };

            const addChip = (val) => {
                let body = wrap.querySelector('.chips-body');
                if (!body) {
                    body = ce('div', null, { class: 'chips-body' });
                    input.parentNode.prepend(body);
                }

                const chip = ce('div', body, { class: 'chip sm-size' });
                ce('span', chip).textContent = val;
                ce('input', chip, { type: 'hidden' }).value = val;

                const btn = ce('a', chip, { href: '', class: 'it-button ghost sm-size'});
                ce('i', btn, { class: 'sprite-it-x16-mono icon-close'});

                btn.addEventListener('click', (e) => {
                    stop(e);
                    chip.remove();
                    input.focus();
                });
            };

            const renderChips = () => {
                const tags = input.value.trim().split(/,| /g);
                for (const i in tags) {
                    if (validate(tags[i])) {
                        addChip(tags[i]);
                    }
                }
                input.value = '';
            };

            input.addEventListener('blur', () => {
                renderChips();
            });

            input.addEventListener('keypress', (e) => {
                const val = e.currentTarget.value.trim();
                if (e.code === 'Space' || e.code === 'Comma' || e.code === 'Enter') {
                    stop(e);
                    if (validate(val)) {
                        renderChips();
                    }
                }
            });

            input.addEventListener('keyup', (e) => {
                let last = input.parentNode.querySelector('.chip:last-child');
                if (e.code === 'Backspace' && input.value.length === 0 &&
                    (last = input.parentNode.querySelector('.chip:last-child'))) {
                    stop(e);
                    input.value = last.querySelector('input').value;
                    last.remove();
                }
            });

            wrap.classList.add('chips');
            input.dataset.subtype = 'chips';
        },

        getValue(input) {
            if (input.dataset.subtype === 'chips') {
                const vals = [];

                for (const elm of input.closest('.it-input').querySelectorAll('.chips-body input')) {
                    if (elm.value.trim()) {
                        vals.push(elm.value.trim());
                    }
                }
                return vals;
            }

            return input.value.trim();
        },

        clear(inputs) {
            inputs = inputs.length === undefined ? [inputs] : inputs;

            for (let i = inputs.length; i--;) {
                const n = inputs[i];
                const chips = n.dataset.subtype === 'chips' &&
                      n.closest('.it-input').querySelector('.chips-body');

                if (chips) {
                    chips.remove();
                }

                n.value = '';
                this.errorMsg(n);
            }
        },

        errorMsg(input, msg) {
            const wrap = input.closest('.it-input');
            const err = wrap && wrap.querySelector('.error-text');

            if (!err) {
                return false;
            }

            if (msg) {
                err.textContent = msg;
                wrap.classList.add('error');
            }
            else {
                err.textContent = '';
                wrap.classList.remove('error');
            }
        }
    });
});

/** @property T.ui.radio */
lazy(T.ui, 'radio', () => {
    'use strict';

    return freeze({
        init(radios, form, ucb) {
            if (!radios) {
                return false;
            }
            radios = radios.length === undefined ? [radios] : radios;

            if (typeof form === 'function') {
                ucb = form;
                form = null;
            }

            if ((form = form || radios[0].closest('form'))) {
                const onchange = (ev) => {
                    const checked = form.querySelector(`.it-radio-button[data-name="${ev.target.name}"].checked`);

                    if (checked) {
                        checked.classList.remove('checked');
                    }

                    ev.target.closest('.it-radio-button').classList.add('checked');

                    if (ucb) {
                        tryCatch(ucb)(ev);
                    }
                };
                for (let i = radios.length; i--;) {
                    radios[i].addEventListener('change', onchange);
                }
            }
            else {
                dump(`missing 'form'`, radios);
            }
        }
    });
});

/** @property T.ui.addFilesLayout */
lazy(T.ui, 'addFilesLayout', () => {
    'use strict';

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };

    const ce = (n, a, t) => mCreateElement(n, a, t);

    // Context menu for integrated page
    const createMenu = (cn) => {
        const item = ce('div', { class: 'it-menu context' }, cn);
        let node = ce('div', { class: 'body' }, item);
        node = ce('div', { class: 'section' }, node);

        let btn = ce('button', { class: 'it-menu-item js-add-files', 'data-name': 'file' }, node);
        ce('i', { class: 'sprite-it-x24-mono icon-add-file' }, btn);
        ce('span', null, btn).textContent = l.transferit_add_files;

        btn = ce('button', { class: 'it-menu-item js-add-folders', 'data-name': 'folder' }, node);
        ce('i', { class: 'sprite-it-x24-mono icon-add-folder' }, btn);
        ce('span', null, btn).textContent = l.transferit_add_folders;

        return item;
    };

    const getFileList = async(ev) => {
        stop(ev);
        loadingDialog.show();
        return factory.require('file-list')
            .getFileList(ev)
            .then((files) => files.length ? files : false)
            .finally(() => loadingDialog.hide());
    };

    return freeze({
        data: Object.create(null),
        addFiles: Object.create(null),
        addedFiles: Object.create(null),
        linkReady: Object.create(null),
        transferring: Object.create(null),

        get hasTransfers() {
            if (!self.M) {
                console.warn('prematurely invoked?...');
            }
            return self.M && M.hasPendingTransfers() || this.data.files && this.data.files.length;
        },

        /*
         * Init common events.
        */
        async init(psn) {
            const upload = (ev) => {
                getFileList(ev)
                    .then((files) => {
                        if (files.length) {
                            this.appendAddedFiles(files);

                            if (this.data.step === 1) {
                                this.renderAddedFiles();
                            }
                            this.renderUploadList();
                        }
                    })
                    .catch(tell);
            };
            const drop = (ev) => {
                if (this.data.step === 1 || this.data.step === 2) {
                    return ev.dataTransfer && upload(ev);
                }
            };

            // Render Add files section. Step 1 or Step for mega integrated page
            if (self.is_transferit) {
                this.renderAddFiles();
            }
            else {
                this.data.ko = [];
                this.data.files = [];
                this.renderAddedFiles();

                if (psn) {
                    queueMicrotask(() => {
                        this.tryTransferNodes(psn).catch(tell);
                    });
                }
            }

            // Skip listeners adding
            if (this.data.pcl) {
                return;
            }

            // Init Select folders evt
            for (const elm of T.ui.page.content.querySelectorAll('.upload-picker')) {
                elm.value = '';
                elm.addEventListener('change', upload);
            }

            // Init DND evt
            T.ui.page.content.addEventListener('drop', drop);

            // Unbind dragAndDrop input evts on page change
            this.data.pcl = mBroadcaster.addListener('it:beforepagechange', () => {
                for (const elm of T.ui.page.content.querySelectorAll('.upload-picker')) {
                    elm.value = '';
                    elm.removeEventListener('change', upload);
                }
                T.ui.page.content.removeEventListener('drop', drop);

                mBroadcaster.removeListener(this.data.pcl);
                delete this.data.pcl;
            });
        },

        /*
         * Render Add files section. Step 1.
        */
        renderAddFiles() {
            this.addFiles.cn = T.ui.page.content.querySelector('.it-box-holder.js-add-files-section');
            this.data.files = [];

            // Show section
            this.data.step = 1;
            T.ui.page.showSection(this.addFiles.cn, 'start');
        },

        /*
         * Init Added files section. Step 2.
        */
        initAddedFiles() {
            const cn = this.addedFiles.cn = T.ui.page.content
                .querySelector('.it-box-holder.js-added-files-section');
            const terms = this.addedFiles.terms = cn.querySelector('input[name="glb-terms-and-privacy"]');
            const btn = this.addedFiles.btn = cn.querySelector('.js-get-link-button');
            const email = this.addedFiles.email = cn.querySelector('#glb-email-input');
            const rn = this.addedFiles.rn = cn.querySelector('#glb-recipients-input');
            const sched = this.addedFiles.sched = cn.querySelector('#glb-scheduled-input');
            const schop = cn.querySelector('.glb-schedule-option');
            const tn = this.addedFiles.tn = cn.querySelector('#glb-title-input');
            const sgmCn = cn.querySelector('.it-sgm-control');
            const sgm = sgmCn.querySelectorAll('input[name="glb-manage-sgm"]');
            const inputsWrap = cn.querySelector('.js-inputs-body');

            this.addedFiles.exp = cn.querySelector('#glb-expires-input');
            this.addedFiles.msg = cn.querySelector('#glb-msg-area');
            this.addedFiles.pw = cn.querySelector('#glb-password-input');

            // Init inputs UI
            T.ui.input.init(
                cn.querySelectorAll('input[type="password"], input[type="text"], textarea')
            );

            // Init chips (multiple values)
            let timeout = false;
            T.ui.input.initChips(rn, {
                validate: (val) => {
                    const is_valid = isValidEmail(val);
                    if (!is_valid) {
                        T.ui.input.errorMsg(rn, l[7415]);
                        clearTimeout(timeout);

                        timeout = setTimeout(() => {
                            T.ui.input.errorMsg(rn);
                        }, 2e3);
                    }
                    return is_valid;
                }
            });

            // Enable/disable notification toggles
            const switchNotif = (checkbox) => {
                if (isValidEmail(email.value)
                    && !(checkbox.name === 'gbl-exp-notif'
                    && cn.querySelector('input[name="glb-expire-radio"]:checked').value === '0')) {
                    checkbox.closest('.it-toggle').classList.remove('disabled');
                    checkbox.disabled = false;
                    checkbox.checked = true;
                }
                else {
                    checkbox.closest('.it-toggle').classList.add('disabled');
                    checkbox.disabled = true;
                    checkbox.checked = false;
                }
            };

            email.addEventListener('input', () => {
                for (const elm of cn.querySelectorAll('.notifications input')) {
                    switchNotif(elm);
                }
            });

            // Init Expiry dropdown
            T.ui.dropdown.clone(cn.querySelector('.js-expires-dropdown'), {
                position: 'right center',
                onChange: () => {
                    switchNotif(cn.querySelector('input[name="gbl-exp-notif"]'));
                }
            });

            // Init scheduled calendar
            T.ui.input.initDatePicker(sched);
            $(sched).datepicker({
                onSelect: (_, date) => {
                    this.data.schedule = ~~(date.getTime() / 1e3);
                }
            });

            // Init settings events
            const settingsBtn = cn.querySelector('.js-link-settings');
            const settingsBody = cn.querySelector('.js-settings-body');
            const defaultInputs = cn.querySelector('.js-default-inputs');

            settingsBtn.addEventListener('click', () => {
                if (settingsBtn.classList.contains('active-icon')) {
                    if (inputsWrap.scrollTop === 0) {
                        settingsBody.classList.add('hidden');
                    }
                    settingsBtn.classList.remove('active-icon');
                    inputsWrap.scrollTo({ top: 0, behavior: 'smooth' });
                }
                else {
                    for (const elm of settingsBody.querySelectorAll('.section.hidden')) {
                        elm.classList.remove('hidden');
                    }
                    settingsBtn.classList.add('active-icon');
                    settingsBody.classList.remove('hidden');
                    settingsBody.scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            });
            inputsWrap.addEventListener('scroll', () => {
                if (inputsWrap.scrollTop === 0 && !settingsBtn.classList.contains('active-icon')) {
                    settingsBody.classList.add('hidden');
                }
            });

            // Init "Send to" input evt
            rn.addEventListener('input', () => this.updateGetLinkBtn());
            rn.addEventListener('blur', () => this.updateGetLinkBtn());
            rn.addEventListener('focus', () => this.updateGetLinkBtn());

            // Init Terms and Privacy checkbox
            terms.addEventListener('change', () => this.updateGetLinkBtn());

            // Init title input evt
            tn.addEventListener('input', (e) => {
                e.target.dataset.customVal = 'true';
                this.updateGetLinkBtn();
            });

            // Init Get link button
            btn.addEventListener('click', (e) => {
                stop(e);

                if (tn.value && !e.currentTarget.classList.contains('disabled')) {
                    this.renderTransferring(tn.value);
                }
            });

            // Send files / Get link control
            for (let i = sgm.length; i--;) {
                sgm[i].addEventListener('change', (e) => {

                    // Show/hide Recipients input
                    if (e.target.value === '1') {
                        inputsWrap.classList.add('ext');
                        rn.closest('.it-input').classList.remove('hidden');
                        schop.classList.remove('hidden');
                    }
                    else {
                        schop.classList.add('hidden');
                        inputsWrap.classList.remove('ext');
                        rn.closest('.it-input').classList.add('hidden');
                    }
                    // Update button state
                    this.updateGetLinkBtn();
                });
            }

            // Init remove all files button
            cn.querySelector('.js-remove-all').addEventListener('click', () => {
                this.data.files = [];
                this.renderUploadList();
            });

            // Init MEGA integrated page evts
            if (!self.is_transferit) {
                this.initMegaPageEvts();
            }
        },

        // Init floating menu with scroll to buttons
        initFloatingMenu() {
            const { cn } = this.addedFiles;
            let menu = cn.querySelector('.add-files-floating-menu');

            if (menu) {
                menu.classList.remove('visible');
                return false;
            }

            // Create menu
            menu = ce('div', { class: 'it-box tag lg-shadow add-files-floating-menu' }, cn);
            const body = ce('div', { class: 'body' }, menu);

            // Scroll to Add files button
            let btn = ce('div', { class: 'it-button ghost sm-size' }, body);
            ce('i', { class: 'sprite-it-x24-mono icon-add-file' }, btn);
            ce('span', null, btn).textContent = l.transferit_add_files;

            btn.addEventListener('click', () => {
                document.body.querySelector('.page-header').scrollIntoView({
                    behavior: 'smooth',
                    block: 'end'
                });
            });

            // Scroll to Transfer button
            btn = ce('div', { class: 'it-button ghost sm-size' }, body);
            ce('i', { class: 'sprite-it-x24-mono icon-arrow-up-circle' }, btn);
            ce('span', null, btn).textContent = l.transferit_transfer_btn;

            btn.addEventListener('click', () => {
                cn.querySelector('.get-link-box').scrollIntoView({
                    behavior: 'smooth',
                    block: 'end'
                });
            });

            // Show/hide menu
            const toggleMenu = () => {
                if (page !== 'start' || this.data.step !== 2) {
                    menu.remove();
                    document.body.removeEventListener('scroll', toggleMenu);
                    window.removeEventListener('resize', toggleMenu);
                    return false;
                }

                if (document.body.scrollTop > 80 && window.outerWidth < 960) {
                    menu.classList.add('visible');
                }
                else {
                    menu.classList.remove('visible');
                }
            };

            document.body.addEventListener('scroll', toggleMenu);
            window.addEventListener('resize', toggleMenu);
        },

        // Init MEGA integrated page evts
        initMegaPageEvts() {
            const {cn} = this.addedFiles;
            const menu = createMenu(cn.querySelector('.add-more-files-box'));
            const mBtn = cn.querySelector('.js-add-from-local');
            const hide = (e) => {
                if (e.key === 'Escape' || e.type !== 'keydown' && !mBtn.contains(e.target)) {
                    menu.classList.remove('visible');
                    document.removeEventListener('click', hide);
                    document.removeEventListener('keydown', hide);
                }
            };

            // Show Add files from mega, Add files from local
            cn.querySelector('.add-files.main').classList.add('hidden');
            cn.querySelector('.add-files.mega').classList.remove('hidden');

            // Clear invalid files
            cn.querySelector('.js-clear-invalid').addEventListener('click', () => {
                loadingDialog.show();
                onIdle(() => {
                    this.getTransferFiles();
                    this.renderUploadList();
                    loadingDialog.hide();
                });
            });

            // Show menu when clicking Upload from local
            mBtn.addEventListener('click', (e) => {
                if (e.currentTarget.classList.contains('disabled')) {
                    return false;
                }
                menu.classList.add('visible');
                menu.querySelector('.section').classList.remove('hidden');
                $(menu).position({
                    of: $(e.currentTarget.querySelector('span')),
                    my: 'left top',
                    at: 'center bottom',
                    collision: 'flipfit',
                    within: $('body')
                });
                document.addEventListener('click', hide);
                document.addEventListener('keydown', hide);
            });

            // Init context menu btnts click
            for (const elm of menu.querySelectorAll('button')) {
                elm.addEventListener('click', (e) => {
                    cn.querySelector(`input[name="select-${e.currentTarget.dataset.name}"]`).click();
                });
            }

            // Init Upload from Cloud drive
            cn.querySelector('.js-add-from-mega').addEventListener('click', (e) => {
                if (!cn.classList.contains('ongoing-add')
                    && !e.currentTarget.classList.contains('disabled')) {
                    cn.classList.add('ongoing-add');

                    this.tryTransferNodes(null)
                        .catch(tell)
                        .finally(() => {
                            cn.classList.remove('ongoing-add');
                        });
                }
            });
        },

        async tryTransferNodes(sel) {
            if (sel) {
                if (!Array.isArray(sel)) {
                    sel = [sel];
                }
                sel = sel.map((n) => n && typeof n === 'object' && n.h || n).filter(String);
            }
            return this.addFilesFromCloudDrive(sel && sel.length ? sel : null)
                .finally(() => {
                    if (self.d) {
                        console.groupEnd();
                        console.timeEnd('add-files-from-clouddrive');
                    }
                    loadingDialog.hide();
                });
        },

        async addFilesFromCloudDrive(sel) {
            const prev = new Set(this.data.files.map(n => n.h));

            let customFilterFn = (n) => {
                if (n.fv) {
                    return false;
                }
                if (self.xdNv) {
                    const tv = M.getTreeValue(n) & ~M.IS_FAV;
                    return n.t === tv;
                }
                return true;
            };
            const showSpinner = !sel;

            sel = sel || await M.initFileAndFolderSelectDialog({customFilterFn});
            if (!(sel && sel.length)) {
                return false;
            }

            if (mega.CloudBrowserDialog) {
                customFilterFn = mega.CloudBrowserDialog.getFilterFunction(customFilterFn);
            }
            if (showSpinner) {
                loadingDialog.show();
            }

            // Show file info loader
            this.toggleLoading();

            if (self.d) {
                console.group('Adding files from cloud-drive...');
                console.time('add-files-from-clouddrive');
            }
            const nodes = new Set();
            const parents = Object.create(null);

            const lst = await M.getCopyNodes(sel, {clearna: true});
            const sn = !prev.size && sel.length === 1 && M.getNodeByHandle(sel[0]);

            for (let i = lst.length; i--;) {
                const n = M.getNodeByHandle(lst[i].h);

                if (!n.t && !prev.has(n.h) && customFilterFn(n)) {
                    if (n.s > 9) {
                        nodes.add(n.h);
                    }
                    parents[n.p] = 1;

                    lst[i].size = n.s;
                    lst[i].name = n.name;
                }
                else {
                    lst.splice(i, 1);
                }
            }
            if (!lst.length) {
                console.warn('Nothing (new) to add...', sel);
                this.toggleLoading(true);
                return false;
            }
            const {SAFEPATH_SOP, SAFEPATH_SEP} = factory.require('mkdir');

            // const prom = api.req({a: 'if', n: [...nodes]});
            // await api.yield();
            const prom = T.core.getImportedNodes(nodes);

            for (let i = lst.length; i--;) {
                const n = lst[i];
                const p = [];
                let h = n.p;

                while (parents[h]) {
                    const n = M.getNodeByHandle(h);
                    if (n.name && (parents[n.p] || n.name !== sn.name)) {
                        p.push(n.name);
                    }
                    h = n.p;
                }

                if (p.length) {
                    n.path = `${SAFEPATH_SOP}${p.reverse().join(SAFEPATH_SEP)}`;
                }

                if (!(i % 1e4)) {
                    await scheduler.yield();
                }
            }
            this.appendAddedFiles(lst);
            this.data.ko = array.extend(this.data.ko, await prom, false);
            this.data.sn = sn;

            return this.renderUploadList();
        },

        appendAddedFiles(lst) {
            this.data.files = array.extend(this.data.files, lst, 0);
            this.data.files.sort((a, b) => a.size < b.size ? -1 : 1);
        },

        toggleLoading(hide) {
            const { cn } = this.addedFiles;
            const ac = hide ? 'remove' : 'add';

            cn.querySelector('.js-loader').classList[ac]('active');
            for (const elm of cn.querySelectorAll('.inv-input')) {
                elm.classList[ac]('disabled');
            }
        },

        /*
         * Render Added files section. Step 2.
        */
        renderAddedFiles() {
            if (!this.addedFiles.cn) {
                this.initAddedFiles();
            }

            const { cn, btn, email, exp, msg, pw, rn, sched, tn } = this.addedFiles;

            // Reset inputs
            email.value = ''; // Email input
            email.dispatchEvent(new Event('input'));
            msg.value = ''; // Message textarea
            pw.value = ''; // Password input
            sched.value = 'None'; // scheduled input
            tn.value = ''; // Title input
            T.ui.input.clear(rn); // Recipients input
            delete tn.dataset.customVal;
            delete this.data.schedule;

            // Reset Get link button
            btn.classList.add('disabled');

            // Init floating menu
            this.initFloatingMenu();

            // Render files list
            this.renderUploadList();

            // Show section
            this.data.step = 2;
            T.ui.page.showSection(cn);

            // Set default expiry date, hide options for FREE accounts
            this.resetExpiryDate(cn.querySelector('.js-expires-dropdown'));

            // Scroll to top
            cn.querySelector('.js-inputs-body').scrollTo({ top: 0 });
        },

        resetExpiryDate(dn) {
            for (const elm of dn.querySelectorAll('.js-option')) {
                const val = elm.querySelector('input').value;
                if (u_attr && (u_attr.p || u_attr.b || u_attr.pf)) {
                    elm.classList.remove('hidden');
                }
                else if (val === '0' || val === '180' || val === '365') {
                    elm.classList.add('hidden');
                }
                if (val === '90') {
                    elm.querySelector('input').click();
                }
            }
        },

        async renderUploadList() {
            let size = 0;
            let haveInvalid = false;
            const {files, ko = []} = this.data;
            const cn = this.addedFiles.cn.querySelector('.js-files-container');
            const clearInvalid = this.addedFiles.cn.querySelector('.js-clear-invalid');
            const invalidMsg = this.addedFiles.cn.querySelector('.js-invalid-error');
            const onRmBtn = (ev) => {
                const row = ev.currentTarget.closest('.it-grid-item');

                row.remove();
                files.splice(row.id.slice(4), 1);

                this.renderUploadList();
            };

            cn.textContent = '';

            if (self.d) {
                console.time('render-upload-list');
            }

            // Render file list
            for (let i = files.length; i--;) {
                const ul = files[i];
                const nv = ko.includes(ul.h);

                const row = ce('div', {
                    class: `it-grid-item${nv ? ' invalid' : ''}`,
                    id: `ulx_${i}`,
                    hid: ul.h,
                    tabindex: 0
                }, cn);
                let col = ce('div', {class: 'col'}, row);

                // File icon
                let wrap = ce('div', {class: `it-thumb-base ${fileIcon(ul)}`}, col);

                ce('i', {class: `sprite-it-mime ${fileIcon(ul)}`}, wrap);

                // File name
                ce('span', {class: 'md-font-size pr-color'}, col).textContent = ul.name;

                col = ce('div', {class: 'col'}, row);

                // Render remove button
                wrap = ce('button', {
                    'aria-label': l.transferit_remove_file,
                    class: 'it-button xs-size ghost'
                }, col);
                ce('i', {class: 'sprite-it-x16-mono icon-close'}, wrap);

                // Init remove btn
                wrap.addEventListener('click', onRmBtn);

                // File size
                ce('span', {class: 'align-end'}, col).textContent = bytesToSize(ul.size);

                size += ul.size;
                haveInvalid = haveInvalid || nv;

                if (!(i % 1e4)) {
                    await scheduler.yield();
                }
            }

            // If there are invalid files, show error and Clear invalid button
            if (haveInvalid) {
                clearInvalid.classList.remove('hidden');
                invalidMsg.classList.remove('hidden');
            }
            else {
                clearInvalid.classList.add('hidden');
                invalidMsg.classList.add('hidden');
            }

            // Update files data
            this.updateUploadListInfo(size);

            if (self.d) {
                console.timeEnd('render-upload-list');
            }
        },

        updateUploadListInfo(size) {
            const { files } = this.data;
            const { cn, tn } = this.addedFiles;

            if (!tn.dataset.customVal || !tn.value.trim()) {
                tn.value = files.length === 1 ? files[0].name :
                    files.length ? l.transferit_multiple_files : '';
            }

            this.updateGetLinkBtn();

            cn.querySelector('.files-info .num').textContent =
                mega.icu.format(l.file_count, files.length);
            cn.querySelector('.files-info .size').textContent = bytesToSize(size);

            // Hide file info loader
            this.toggleLoading(true);
        },

        updateGetLinkBtn() {
            const {files, ko = []} = this.data;
            const { cn, btn, rn, tn, terms } = this.addedFiles;
            const sgm = cn.querySelector('input[name="glb-manage-sgm"]:checked');
            const recipients = isValidEmail(rn.value) || T.ui.input.getValue(rn).length;

            // Check files, email, recipients (if sending a link)
            if (terms.checked && tn.value.trim()
                && files.length && files.length !== ko.length
                && (sgm.value === '1' && recipients || sgm.value === '0')) {

                btn.classList.remove('disabled');
            }
            else {
                btn.classList.add('disabled');
            }
        },

        calculateUploadProgress(tick) {
            let done = 0;
            let total = 0;
            let speed = 0;
            const tp = $.transferprogress;
            for (let i = ul_queue.length; i--;) {
                const ul = ul_queue[i];
                const tu = tp && tp[ulmanager.getGID(ul)];

                if (tu) {
                    done += tu[0];
                    total += tu[1];
                    speed += tu[2];
                }
                else {
                    total += ul.size || 0;
                }
            }
            if (total) {
                done += tp.ulc || 0;
                total += tp.ulc || 0;
            }
            if (!speed) {
                const spent = tp && (tick || Date.now()) - tp.ust;
                speed = spent > 0 ? done / (spent / 1e3) : 0;
            }
            return {done, total, speed, percent: ~~(done / total * 100), left: speed && (total - done) / speed};
        },

        /*
         * Init Transferring section. Step 3.
        */
        initTransferring() {
            const cn = this.transferring.cn = T.ui.page.content
                .querySelector('.it-box-holder.js-transfer-section');
            const box = this.transferring.box = cn.querySelector('.transferring-box');
            const header = this.transferring.header = cn.querySelector('h4');
            const copyBtn = this.transferring.copyBtn = cn.querySelector('.js-copy-link');
            const cancelBtn = this.transferring.cancelBtn = cn.querySelector('.js-cancel');
            const resumeBtn = this.transferring.resumeBtn = cn.querySelector('.js-resume');
            const confirmBtn = this.transferring.confirmBtn = cn.querySelector('.js-confirm');

            copyBtn.addEventListener('click', ({currentTarget: elm}) => {
                if (!elm.classList.contains('disabled')) {
                    elm.classList.add('disabled');

                    if (this.data.link) {
                        T.ui.copyLinkToClipboard(this.data.link);
                    }

                    loadingDialog.show();
                    this.finishTransferring()
                        .then(() => this.renderLinkReady())
                        .catch(tell)
                        .finally(() => {
                            loadingDialog.hide();
                            delete this.data.stashing;
                        });
                }
            });

            cancelBtn.addEventListener('click', (e) => {
                if (e.currentTarget.classList.contains('disabled')) {
                    return false;
                }
                box.classList.add('cancel');
                header.textContent = l.transferit_cancel_transfer_q;
                confirmBtn.classList.remove('hidden');
                resumeBtn.classList.remove('hidden');
                copyBtn.classList.add('hidden');
                cancelBtn.classList.add('hidden');
            });

            confirmBtn.addEventListener('click', () => {
                ulmanager.abort(null);

                loadingDialog.show();
                (async() => {
                    while (ulmanager.isUploading) {
                        await tSleep(-1);
                    }
                })().finally(() => {
                    this.data.files = [];
                    T.ui.loadPage();
                });
            });

            resumeBtn.addEventListener('click', () => {
                box.classList.remove('cancel');
                header.textContent = l.transferit_transferring;
                confirmBtn.classList.add('hidden');
                resumeBtn.classList.add('hidden');
                copyBtn.classList.remove('hidden');
                cancelBtn.classList.remove('hidden');
            });
        },

        /*
         * Finish Transferring (close transfer, establish attribites, etc)
        */
        async finishTransferring() {
            if (!this.data.stashing) {
                const {cn, rn} = this.addedFiles;

                const emails = T.ui.input.getValue(rn);

                const {value: title} = document.getElementById('glb-title-input');
                const {value: sender} = document.getElementById('glb-email-input');
                const {value: message} = document.getElementById('glb-msg-area');
                const {value: password} = document.getElementById('glb-password-input');
                const {value: expiry} = cn.querySelector('input[name="glb-expire-radio"]:checked');

                const {xh, schedule} = this.data;

                const p = [];
                if (sender || message || password || parseInt(expiry) > 0) {
                    const en = cn.querySelector('.exp-notif input').checked | 0;
                    p.push(T.core.setTransferAttributes(xh, {title, sender, message, password, expiry, en}));
                }

                if (emails.length) {
                    const bulk = emails.map((email) => ({email, schedule}));

                    p.push(T.core.setMultiTransferRecipients(xh, bulk));
                }

                this.data.stashing = Promise.all(p).then(() => T.core.close(xh));
            }
            return this.data.stashing;
        },

        /*
         * Render Transferring section. Step 3.
        */
        renderTransferring(name) {
            if (!this.transferring.cn) {
                this.initTransferring();
            }

            const { cn, box, header, copyBtn, cancelBtn, resumeBtn, confirmBtn } =
                this.transferring;
            const leftNode = cn.querySelector('#transferfilesleft');
            const rightNode = cn.querySelector('#transferfilesright');
            const domTransfer = cn.querySelector('.status-info.transfer');
            const domTime = cn.querySelector('.status-info.time');
            const domTick = cn.querySelector('.js-link-tick');
            const domSize = domTransfer.querySelector('.size');
            const domLeft = domTime.querySelector('.left');
            const domSpeed = domTransfer.querySelector('.speed');
            const domUploaded = domTransfer.querySelector('.uploaded');

            box.classList.remove('completed', 'cancel');
            header.textContent = l.transferit_transferring;
            copyBtn.classList.add('disabled');
            confirmBtn.classList.add('hidden');
            resumeBtn.classList.add('hidden');
            copyBtn.classList.remove('hidden');
            cancelBtn.classList.remove('hidden', 'disabled');
            domTransfer.classList.add('hidden');
            domTime.classList.add('hidden');
            leftNode.removeAttribute('style');
            rightNode.removeAttribute('style');

            // Show section
            this.data.step = 3;
            T.ui.page.showSection(cn);

            const updateProgress = () => {
                const {done, total, speed, left, percent} = this.calculateUploadProgress();
                const deg = 360 * Math.min(99, percent) / 100;
                const esimate = secondsToTimeShort(left);
                if (deg <= 180) {
                    rightNode.style.transform = `rotate(${deg}deg)`;
                }
                else {
                    rightNode.style.transform = 'rotate(180deg)';
                    leftNode.style.transform = `rotate(${deg - 180}deg)`;
                }
                domTransfer.classList.remove('hidden');
                if (esimate) {
                    domTime.classList.remove('hidden');
                }
                domSize.textContent = bytesToSize(total);
                domSpeed.textContent = bytesToSpeed(speed);
                domUploaded.textContent = bytesToSize(done);
                domLeft.textContent = l.transferit_x_remaining
                    .replace('%1' , secondsToTimeShort(left));
            };

            let tick = 0;
            let tock = 0;
            const files = this.getTransferFiles();

            T.ui.ulprogress = (ul, p, bl, bt, bps) => {
                const tp = $.transferprogress;
                const gid = ulmanager.getGID(ul);
                if (files.local) {
                    domTransfer.classList.remove('hidden');
                    files.local = false;
                }
                tp[gid] = [bl, bt, bps];
                console.info('ul-progress(%s)... %s% (%s/%s)...', gid, p, bl, bt, [ul]);

                tick = ++tock;
                requestAnimationFrame(() => tick === tock && updateProgress());
            };

            domSize.textContent = '';
            domUploaded.textContent = '';
            domTick.classList.add('hidden');

            if (this.data.sn && (!name || name === l.transferit_multiple_files)) {
                name = this.data.sn.name;
            }

            T.core.upload(files, name)
                .then((res) => {
                    if (res) {
                        this.data.xh = res[0];
                        this.data.link = `https://transfer.it/t/${this.data.xh}`;
                    }
                    return Promise.all(res);
                })
                .then(() => {
                    leftNode.style.transform = `rotate(180deg)`;
                    rightNode.style.transform = 'rotate(180deg)';

                    header.textContent = l.transferit_completed;
                    box.classList.add('completed');
                    box.classList.remove('cancel');
                    cancelBtn.classList.add('disabled');
                    cancelBtn.classList.remove('hidden');
                    copyBtn.classList.remove('disabled', 'hidden');
                    confirmBtn.classList.add('hidden');
                    resumeBtn.classList.add('hidden');
                    domTick.classList.remove('hidden');
                    domTransfer.classList.add('hidden');
                    domTime.classList.add('hidden');

                    if (T.ui.dashboardLayout) {
                        T.ui.dashboardLayout.data.refresh = true;
                    }
                    delete T.ui.ulprogress;
                    this.data.name = name;
                    this.data.files = [];

                    this.finishTransferring().catch(dump);
                })
                .catch(tell);
        },

        getTransferFiles() {
            let local = false;
            const {files, ko = []} = this.data;

            for (let i = files.length; i--;) {
                const {h} = files[i];

                if (h) {
                    if (ko.includes(h)) {
                        files.splice(i, 1);
                    }
                }
                else {
                    local = true;
                    if (!ko.length) {
                        break;
                    }
                }
            }
            files.local = local;
            return files;
        },

        /*
         * Init Link ready section. Step 4.
        */
        initLinkReady() {
            const cn = this.linkReady.cn = T.ui.page.content
                .querySelector('.it-box-holder.js-link-ready-section');
            const input = this.linkReady.input = cn.querySelector('.it-input input');
            const linkBody = this.linkReady.linkBody = cn.querySelector('.body.step-1');
            const contentBody = this.linkReady.contentBody = cn.querySelector('.body.step-2');

            T.ui.input.init(input);

            input.addEventListener('focus', (e) => {
                e.currentTarget.setSelectionRange(0, e.currentTarget.value.length);
            });

            cn.querySelector('.js-copy-to-clipboard').addEventListener('click', (e) => {
                stop(e);

                input.focus();
                T.ui.copyLinkToClipboard(input.value);
            });

            cn.querySelector('.js-share-qr').addEventListener('click', (e) => {
                stop(e);
                T.ui.qrDialog.show({fileName: this.data.name, text: input.value});
            });

            cn.querySelector('.js-new-link').addEventListener('click', () => this.init());

            cn.querySelector('.js-show-content').addEventListener('click', () => {
                // linkBody.classList.add('hidden');
                // contentBody.classList.remove('hidden');

                window.open(input.value, '_blank', 'noopener,noreferrer');
            });

            cn.querySelector('.js-back-button').addEventListener('click', () => {
                linkBody.classList.remove('hidden');
                contentBody.classList.add('hidden');
            });
        },

        /*
         * Render Link ready section. Step 4.
        */
        renderLinkReady() {
            if (!this.linkReady.cn) {
                this.initLinkReady();
            }

            const { cn, input, linkBody, contentBody } = this.linkReady;

            input.value = this.data.link;
            linkBody.classList.remove('hidden');
            contentBody.classList.add('hidden');

            // Show section
            this.data.step = 4;
            T.ui.page.showSection(cn);

            input.focus();
            input.dispatchEvent(new Event('focus'));
        }
    });
});

/** @property T.ui.dialog */
lazy(T.ui, 'dialog', () => {
    'use strict';

    const content = mCreateElement(
        'div',
        {class: 'global-dialog-container'},
        document.querySelector('body > .global-transferit-container') || 'body'
    );
    T.ui.appendTemplate('js_ui_transfer_dialogs', content);
    const inert = tryCatch((selector, value = true) => {
        const pcn = document.querySelector(selector);
        if (pcn) {
            pcn.inert = value;
        }
    });

    if (mega.tld !== 'nz') {
        const nzurls = content.querySelectorAll('a.nz-url');
        for (let i = nzurls.length; i--;) {
            nzurls[i].href = nzurls[i].href.replace('nz', mega.tld);
        }
    }

    return freeze({
        dialogs: [],

        get content() {
            return content;
        },

        show(cn) {
            if (cn && cn.classList.contains('hidden')) {
                // this.hide();
                this.dialogs.push(cn);

                cn.classList.remove('hidden');
                cn.focus();
                inert('.global-page-container');

                $(cn).rebind('keyup.closeDialog', (ev) => {
                    if (ev.key === 'Escape')   {
                        const dialog = this.dialogs[this.dialogs.length - 1];
                        if (dialog.classList.contains('js-msg-dialog')) {
                            T.ui.msgDialog.hide();
                        }
                        else {
                            this.hide(dialog);
                        }
                    }
                });
            }
        },

        hide(cn) {
            if (cn) {
                const i = this.dialogs.indexOf(cn);
                if (i > -1) {
                    this.dialogs.splice(i, 1);
                }
                cn.classList.add('hidden');
            }
            else {
                for (const holder of content.querySelectorAll('.it-dialog-holder')) {
                    holder.classList.add('hidden');
                }
                this.dialogs.length = 0;
            }

            if (this.dialogs.length) {
                this.dialogs[this.dialogs.length - 1].focus();
            }
            else {
                $(document).unbind('keyup.closeDialog');
                inert('.global-page-container', false);
            }
        }
    });
});

/** @property T.ui.qrDialog */
lazy(T.ui, 'qrDialog', () => {
    'use strict';

    const ce = (n, t, a) => mCreateElement(n, a, t);

    const cn = ce('dialog', T.ui.dialog.content, {
        'aria-labelledby': 'qr-dialog-title',
        'aria-modal': true,
        class: 'it-dialog-holder qr-dialog-holder js-qr-dialog hidden'
    });
    let node = ce(
        'section', cn, {class: 'it-box it-dialog lg-shadow qr-dialog modal md-size'}
    );
    let subNode = null;
    let btnNode = null;

    node = ce('div', node, {class: 'body scroll-area'});

    // Header
    subNode = ce('header', node);
    ce('h5', subNode, {id: 'qr-dialog-title'}).textContent = l.transferit_share_qr;

    // Close btn
    btnNode = ce('button', subNode, {
        class: 'it-button ghost icon xl-size js-close',
        'aria-label': l[148]
    });
    ce('i', btnNode, {class: 'sprite-it-x32-mono icon-close'});
    btnNode.addEventListener('click', () => T.ui.dialog.hide(cn));

    // Content: canvas
    subNode = ce('div', node, {class: 'content'});
    const canvasCn = ce('div', subNode, {class: 'canvas-cn'});

    // Footer: Download btn
    subNode = ce('footer', node, {class: 'fw-items'});
    btnNode = ce('button', subNode, {class: 'it-button xl-size js-positive-btn disabled'});
    ce('span', btnNode).textContent = l[58];

    btnNode.addEventListener('click', () => {
        const link = canvasCn.querySelector('a');
        if (link) {
            link.click();
        }
    });

    // Draw QR dots
    const drawDot = (ctx, x, y, size) => {
        const r = size / 2;

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
        ctx.fill();
    };

    // Draw QR finders
    const drawFinder = (ctx, x, y, size) => {
        const outerR = size / 2;
        const innerR = size * 0.65 / 2;
        const centerR = size * 0.35 / 2;

        const cx = x + outerR;
        const cy = y + outerR;

        // Outer circle
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.fill();

        // White space
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fill();

        // Inner circle
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
        ctx.fill();
    };

    const showQr = (opts) => {
        const size = 200;
        let {text, fileName = 'qr_code'} = opts;

        canvasCn.textContent = '';
        fileName = `transfer.it_${fileName}.png`;

        const canvas = ce('canvas', canvasCn);
        const lnk = ce('a', canvasCn, {class: 'qr-logo', tabindex: -1, 'aria-disabled': 'true'});
        const ctx = canvas.getContext('2d');

        const qr = new QRCode(0, QRErrorCorrectLevel.H);
        qr.addData(text);
        qr.make();

        const moduleCount = qr.getModuleCount();
        const cellSize = Math.floor(size / moduleCount);
        const qrSize = cellSize * moduleCount;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);

        const offset = Math.floor((size - qrSize) / 2);

        // Set logo size
        const logoPercent = 0.22;
        const logoSize = qrSize * logoPercent;
        const logoX = offset + (qrSize - logoSize) / 2;
        const logoY = offset + (qrSize - logoSize) / 2;

        // Draw dots
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                const inTopLeft = row < 7 && col < 7;
                const inTopRight = row < 7 && col >= moduleCount - 7;
                const inBottomLeft = row >= moduleCount - 7 && col < 7;

                const x = offset + col * cellSize;
                const y = offset + row * cellSize;

                // skip logo dots
                const inLogo = x + cellSize > logoX && x < logoX + logoSize &&
                    y + cellSize > logoY && y < logoY + logoSize;

                if (qr.isDark(row, col) && !inTopLeft && !inTopRight && !inBottomLeft && !inLogo) {
                    drawDot(ctx, x, y, cellSize);
                }
            }
        }

        // Draw finders
        const finderSize = cellSize * 7;
        drawFinder(ctx, offset, offset, finderSize);
        drawFinder(ctx, offset + qrSize - finderSize, offset, finderSize);
        drawFinder(ctx, offset, offset + qrSize - finderSize, finderSize);

        // Add logo
        const src = String(getComputedStyle(lnk).backgroundImage).replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        webgl.loadImage(src)
            .then((img) => {
                if (img.naturalWidth) {
                    ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
                }
            })
            .catch((ex) => self.d && console.error('Failed to load logo...', ex))
            .finally(() => {
                // Allow DL image ieven if logo is not loaged
                canvas.toBlob((blob) => {
                    lnk.download = fileName;
                    lnk.href = URL.createObjectURL(blob);
                    btnNode.classList.remove('disabled');
                });
            });
    };

    return freeze({
        show(opts = {}) {

            if (!('text' in opts)) {
                return false;
            }

            showQr(opts);

            // Show dialog
            T.ui.dialog.show(cn);
        }
    });
});

Object.defineProperty(T.ui, 'loadPage', {
    async value(page, ev) {
        'use strict';

        loadingDialog.hide();
        page = getCleanSitePath(page);

        if (self.slideshowid) {
            slideshow(null, true);
        }
        if (ev && Object(ev.state).view) {
            queueMicrotask(() => {
                slideshow(ev.state.view);
            });
            return false;
        }

        if (!await T.ui.page.safeLeave()) {
            return false;
        }
        if (typeof T.ui.sweeper === 'function') {
            tryCatch(T.ui.sweeper)();
            delete T.ui.sweeper;
        }
        tryCatch(() => {
            for (const elm of document.querySelectorAll('.upload-picker')) {

                elm.value = '';
            }
        })();
        let res;
        const [p, s, h] = String(page).split(/[^\w-]/);

        mBroadcaster.sendMessage('it:beforepagechange', page);

        if (p === 't') {
            self.xhid = s;
            res = this.viewFilesLayout.init(s, h);
        }
        else if (p === 'dashboard') {
            res = this.dashboardLayout.init(s);
        }
        else {

            if (ev && ev.type === 'popstate' || ev === 'override') {
                pushHistoryState(true, page);
            }
            else {
                pushHistoryState(page);
            }

            if (p === 'compare') {
                res = this.compareSubpage.init();
            }
            else if (p === 'contact') {
                res = this.contactSubpage.init();
            }
            else if (p === 'faq') {
                res = this.faqSubpage.init();
            }
            else if (p === 'features') {
                res = this.featuresSubpage.init();
            }
            else if (p === 'privacy') {
                res = this.privacySubpage.init();
            }
            else if (p === 'terms') {
                res = this.termsSubpage.init();
            }
            else {
                res = this.addFilesLayout.init();
            }
        }

        return res.then((v) => {
            self.page = page;
            mBroadcaster.sendMessage('it:pagechange', self.page);
            return v;
        });
    }
});

Object.defineProperty(T.ui, 'copyLinkToClipboard', {
    value(xh) {
        'use strict';
        if (xh) {
            if (!String(xh).includes('://')) {
                xh = `${getBaseUrl()}/t/${xh}`;
            }
            dump(xh);
            return copyToClipboard(xh, l[1642], 'sprite-it-x24-mono icon-check accent-mask');
        }
    }
});

Object.defineProperty(T.ui, 'confirm', {
    async value(msg, options) {
        'use strict';
        return T.ui.msgDialog.show({
            title: l[870],
            type: 'warning negative',
            buttons: [l[78], l[79]],
            msg: msg || l[6994],
            ...options
        });
    }
});

Object.defineProperty(T.ui, 'prompt', {
    async value(msg, options) {
        'use strict';
        return T.ui.msgDialog.show({
            msg,
            type: 'prompt',
            buttons: [l[507], l.msg_dlg_cancel],
            ...options
        });
    }
});

Object.defineProperty(T.ui, 'askPassword', {
    async value(options) {
        'use strict';
        options = typeof options === 'string' ? {currentValue: options} : options;
        return this.prompt(`${l[9071]} ${l[9072]}`, {
            type: 'password',
            title: l[9073],
            buttons: [l[81], l.msg_dlg_cancel],
            placeholders: [l[9073], l[909]],
            validate(value) {
                return (!value || value === options.currentValue) && l[17920];
            },
            ...options
        });
    }
});

Object.defineProperty(T.ui, 'appendTemplate', {
    value(html, target) {
        'use strict';
        if (pages[html]) {
            html = pages[html];
            delete pages[html];
        }
        html = translate(`${html || ''}`).replace(/{staticpath}/g, staticpath);
        target.append(parseHTML(html));
    }
});

mBroadcaster.once('boot_done', function populate_lx() {
    'use strict';

    if (self.d && self.is_transferit) {
        const loaded = self.l;
        self.l = new Proxy(loaded, {
            get(target, prop) {
                if (self.dstringids) {
                    return `[$${prop}]`;
                }

                return target[prop] || `(missing-$${prop})`;
            }
        });
    }

    l.transferit_agree_tos = escapeHTML(l.transferit_agree_tos)
        .replace('[A]', '<a href="/terms" target="_blank" class="link clickurl">')
        .replace('[/A]', '</a>')
        .replace('[B]', '<b>').replace('[/B]', '</b>');
    l.transferit_uploading_x_of_y = escapeHTML(l.transferit_uploading_x_of_y)
        .replace('[S1]', '<span class="uploaded">').replace('[/S1]', '</span>')
        .replace('[S2]', '<span class="size">').replace('[/S2]', '</span>');
    l.transferit_ftr_tr_speed = escapeHTML(l.transferit_ftr_tr_speed)
        .replace('[S1]', '<h2>').replace('[/S1]', '</h2>')
        .replace('[S2]', '<span>').replace('[/S2]', '</span>');
    l.transferit_x_per_month = escapeHTML(l.transferit_x_per_month)
        .replace('[S]', '<span>').replace('[/S]', '</span>');
    l.transferit_ready_to_use_info = escapeHTML(l.transferit_ready_to_use_info)
        .replace('[S]', '<span>').replace('[/S]', '</span>');
    l.transferit_faq_upd_q1_info2 = escapeHTML(l.transferit_faq_upd_q1_info2)
        .replace(/\[UL]/g, '<ul>').replace(/\[\/UL]/g, '</ul>')
        .replace(/\[LI]/g, '<li>').replace(/\[\/LI]/g, '</li>');
    l.transferit_faq_upd_q1_info3 = escapeHTML(l.transferit_faq_upd_q1_info3)
        .replace(/\[UL]/g, '<ul>').replace(/\[\/UL]/g, '</ul>')
        .replace(/\[LI]/g, '<li>').replace(/\[\/LI]/g, '</li>');
    l.transferit_faq_upd_q4_info1 = escapeHTML(l.transferit_faq_upd_q4_info1)
        .replace('[A]', `<a href="https://mega.${mega.tld}/register" class="link clickurl" target="_blank">`)
        .replace('[/A]', '</a>')
        .replace('[BR]', '<br>');
    l.transferit_cnt_copy_info2 = escapeHTML(l.transferit_cnt_copy_info2)
        .replace('[A1]', '<a href="https://mega.io/takedown" target="_blank" class="clickurl link">')
        .replace('[/A1]', '</a>')
        .replace('[A2]', '<a href="mailto:copyright@transfer.it" target="_blank" class="clickurl link">')
        .replace('[/A2]', '</a>');
    l.transferit_powered_by_mega = escapeHTML(l.transferit_powered_by_mega)
        .replace(/\[S]/g, '<span class="label">').replace(/\[\/S]/g, '</span>')
        .replace('%1', '<i class="sprite-it-x16-mono icon-mega"></i>');

    if (self.is_transferit) {
        for (const k in self.l) {
            if (typeof self.l[k] === 'string') {
                if (self.l[k].includes('@mega.')) {

                    self.l[k] = self.l[k].replace(/@mega[\w.]+/, '@transfer.it');
                }
                self.l[k] = self.l[k].replace(/\[\/?\w+]/g, '');
            }
        }
    }
});

/** @property T.ui.transferItOverlay */
lazy(T.ui, 'transferItOverlay', () => {
    'use strict';

    const stop = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };

    const div = (...a) => mCreateElement('div', ...a);
    const gn = mCreateElement('div', {class: 'global-transferit-container transferit-vars hidden'}, 'body');
    const cn = div({class: 'page-body'}, div({class: 'global-page-container'}, gn));

    const header = mCreateElement('header', {class: 'page-header'}, cn);
    const content = mCreateElement('div', {class: 'page-content'}, cn);
    const footer = mCreateElement('footer', {class: 'page-footer'}, cn);

    T.ui.appendTemplate('js_ui_transfer_header', header);
    T.ui.appendTemplate('js_ui_transfer_footer', footer);
    T.ui.appendTemplate('js_ui_transfer_content', content);
    T.ui.appendTemplate('js_ui_transferit_overlay', gn);

    const visitBtn = header.querySelector('.js-visit-it');
    const closeBtn = header.querySelector('.js-close');

    visitBtn.classList.remove('hidden');
    closeBtn.classList.remove('hidden');

    /** @temp property T.ui.page */
    lazy(T.ui, 'page', () => {

        return freeze({
            get content() {
                return content;
            },

            showSection(cn) {
                if (cn && cn.classList.contains('hidden')) {
                    const cns = content.querySelectorAll('.it-box-holder');

                    for (let i = 0; i < cns.length; i++) {
                        cns[i].classList.add('hidden');
                    }

                    cn.classList.remove('hidden');
                }
            }
        });
    });

    return freeze({
        data: Object.create(null),

        init() {
            const cn = this.data.cn = gn.querySelector('.js-transferit-overlay');

            closeBtn.addEventListener('click', () => history.back());

            visitBtn.addEventListener('click', (ev) => {
                stop(ev);
                T.core.transfer();
            });

            header.querySelector('.it-logo').addEventListener('click', (e) => {
                e.preventDefault();
                T.ui.addFilesLayout.init();
            });

            cn.querySelector('.js-continue').addEventListener('click', () => {
                if (cn.querySelector('.js-skip-overlay').checked) {
                    mega.config.set('skiptritwarn', 1);
                }
                else {
                    mega.config.remove('skiptritwarn');
                }
                cn.classList.add('hidden');
            });
            cn.querySelector('.js-close').addEventListener('click', () => history.back());
            cn.querySelector('.js-cancel').addEventListener('click', () => history.back());
        },

        show(psn) {
            loadSubPage('');

            if (!this.data.cn) {
                this.init();
            }
            if (this.data.active) {
                console.warn('transferItOverlay already visible?');
                return;
            }

            this.data.active = true;
            gn.classList.remove('hidden');

            if (!mega.config.get('skiptritwarn')) {
                this.data.cn.querySelector('.js-skip-overlay').checked = false;
                this.data.cn.classList.remove('hidden');
            }
            return T.ui.addFilesLayout.init(psn);
        },

        hide() {
            this.data.active = false;
            this.data.cn.classList.add('hidden');
            gn.classList.add('hidden');
        }
    });
});
